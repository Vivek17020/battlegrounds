// ============================================
// MCP ENDPOINT: Reward Grant
// Calls RewardController contract to mint tokens
// ============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  performFullSecurityCheck,
  recordDailyUsage,
  recordProcessedMatch,
  getSupabaseAdmin,
  verifyHmacSignature,
  DEFAULT_SECURITY_CONFIG,
} from '../_shared/mcp-security-db.ts';
import { getContractService } from '../_shared/contract-service.ts';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
interface RewardGrantPayload {
  walletAddress: string;
  matchId: string;
  rewardAmount: number;
  placement: number;
  playerCount: number;
  nonce: string;
  timestamp: number;
  serverSignature: string; // HMAC signed by match-submit endpoint
}

interface RewardGrantResult {
  success: boolean;
  matchId: string;
  walletAddress: string;
  rewardAmount: number;
  txHash?: string;
  blockNumber?: number;
  error?: string;
  errorCode?: string;
}

// ─────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────

function validatePayload(payload: unknown): { valid: boolean; error?: string } {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Invalid payload structure' };
  }

  const p = payload as Record<string, unknown>;

  // Required fields
  const requiredFields = [
    'walletAddress', 'matchId', 'rewardAmount', 'placement',
    'playerCount', 'nonce', 'timestamp', 'serverSignature'
  ];

  for (const field of requiredFields) {
    if (!(field in p)) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  // Validate wallet address
  if (typeof p.walletAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(p.walletAddress)) {
    return { valid: false, error: 'Invalid wallet address format' };
  }

  // Validate matchId
  if (typeof p.matchId !== 'string' || p.matchId.length < 32) {
    return { valid: false, error: 'Invalid matchId format' };
  }

  // Validate nonce
  if (typeof p.nonce !== 'string' || p.nonce.length < 32) {
    return { valid: false, error: 'Invalid nonce format' };
  }

  // Validate reward amount
  if (typeof p.rewardAmount !== 'number' || p.rewardAmount <= 0 || p.rewardAmount > 1000) {
    return { valid: false, error: 'Invalid reward amount (must be 0-1000)' };
  }

  // Validate timestamp (within 5 minutes)
  if (typeof p.timestamp !== 'number') {
    return { valid: false, error: 'Invalid timestamp' };
  }
  const now = Date.now();
  const timeDiff = Math.abs(now - p.timestamp);
  if (timeDiff > 300000) {
    return { valid: false, error: 'Timestamp too old' };
  }

  // Validate server signature exists
  if (typeof p.serverSignature !== 'string' || p.serverSignature.length < 32) {
    return { valid: false, error: 'Invalid server signature' };
  }

  return { valid: true };
}

// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  console.log(`[${requestId}] Reward grant request received`);

  try {
    // Only accept POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate payload structure
    const validationResult = validatePayload(body);
    if (!validationResult.valid) {
      console.log(`[${requestId}] Validation failed: ${validationResult.error}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: validationResult.error,
          requestId,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = body as RewardGrantPayload;

    console.log(`[${requestId}] Processing reward grant for match: ${payload.matchId}`);

    // ─── VERIFY SERVER SIGNATURE ───
    const signingSecret = Deno.env.get('MCP_SIGNING_SECRET');
    if (!signingSecret) {
      console.error(`[${requestId}] Missing MCP_SIGNING_SECRET`);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Server configuration error',
          requestId,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create payload string for signature verification (excludes signature field)
    const payloadForSignature = JSON.stringify({
      walletAddress: payload.walletAddress,
      matchId: payload.matchId,
      rewardAmount: payload.rewardAmount,
      placement: payload.placement,
      playerCount: payload.playerCount,
      nonce: payload.nonce,
      timestamp: payload.timestamp,
    });

    const signatureValid = await verifyHmacSignature(
      payloadForSignature,
      payload.serverSignature,
      signingSecret
    );

    if (!signatureValid) {
      console.log(`[${requestId}] Invalid server signature`);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid server signature',
          errorCode: 'INVALID_SIGNATURE',
          requestId,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── SECURITY CHECKS ───
    // deno-lint-ignore no-explicit-any
    let supabase: any;
    try {
      supabase = getSupabaseAdmin();
    } catch (error) {
      console.error(`[${requestId}] Failed to initialize Supabase:`, error);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Internal server error',
          requestId,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Full security check including daily caps
    const securityResult = await performFullSecurityCheck(
      supabase,
      {
        walletAddress: payload.walletAddress,
        matchId: payload.matchId,
        nonce: payload.nonce,
        endpoint: 'reward-grant',
        rewardAmount: payload.rewardAmount,
      },
      DEFAULT_SECURITY_CONFIG
    );

    if (!securityResult.passed) {
      console.log(`[${requestId}] Security check failed:`, securityResult.blockReason);
      return new Response(
        JSON.stringify({
          success: false,
          error: securityResult.blockReason || 'Security check failed',
          errorCode: 'SECURITY_CHECK_FAILED',
          requestId,
          securityChecks: securityResult.checks,
          riskScore: securityResult.riskScore,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── CALL SMART CONTRACT ───
    const contractService = getContractService();
    
    const txResult = await contractService.grantReward({
      matchId: payload.matchId,
      playerAddress: payload.walletAddress,
      amount: payload.rewardAmount,
    });

    if (!txResult.success) {
      console.error(`[${requestId}] Contract call failed:`, txResult.error);
      
      // Map contract errors to user-friendly messages
      let userError = 'Failed to process reward';
      if (txResult.errorCode === 'MATCH_ALREADY_REWARDED') {
        userError = 'This match has already been rewarded';
      } else if (txResult.errorCode === 'EXCEEDS_DAILY_CAP') {
        userError = 'Daily reward limit reached';
      } else if (txResult.errorCode === 'CONTRACT_PAUSED') {
        userError = 'Reward system temporarily paused';
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: userError,
          errorCode: txResult.errorCode,
          requestId,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── RECORD SUCCESS ───
    await recordDailyUsage(
      supabase,
      payload.walletAddress,
      'reward',
      payload.rewardAmount,
      payload.matchId
    );

    await recordProcessedMatch(
      supabase,
      payload.matchId,
      payload.walletAddress,
      payload.placement,
      payload.rewardAmount,
      txResult.txHash
    );

    const processingTimeMs = Date.now() - startTime;

    const result: RewardGrantResult = {
      success: true,
      matchId: payload.matchId,
      walletAddress: payload.walletAddress,
      rewardAmount: payload.rewardAmount,
      txHash: txResult.txHash,
      blockNumber: txResult.blockNumber,
    };

    console.log(`[${requestId}] Reward granted successfully:`, {
      matchId: payload.matchId,
      wallet: payload.walletAddress,
      amount: payload.rewardAmount,
      txHash: txResult.txHash,
      processingTimeMs,
    });

    // Audit log
    console.log(`[AUDIT] REWARD_GRANTED: match=${payload.matchId}, wallet=${payload.walletAddress}, amount=${payload.rewardAmount}, tx=${txResult.txHash}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: result,
        meta: {
          requestId,
          timestamp: Date.now(),
          processingTimeMs,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error(`[${requestId}] Error processing request:`, error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        requestId,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
