// ============================================
// MCP ENDPOINT: Match Result Submission
// Production-grade with full security + validation
// ============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  performFullSecurityCheck,
  recordDailyUsage,
  recordProcessedMatch,
  getSupabaseAdmin,
  DEFAULT_SECURITY_CONFIG,
} from '../_shared/mcp-security-db.ts';
import {
  calculateReward,
  type MatchData,
} from '../_shared/reward-calculator.ts';
import {
  validateMatch,
  REASON_CODE_DESCRIPTIONS,
  type MatchInput,
  type ValidationResult as MatchValidationResult,
} from '../_shared/match-validator.ts';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
interface AntiCheatSignals {
  inputHash: string;
  frameCount: number;
  avgTickRate: number;
  suspiciousFlags: string[];
  inputTimingVariance: number;
  movementHash: string;
}

interface MatchResultPayload {
  walletAddress: string;
  matchId: string;
  placement: number;
  playerCount: number;
  durationMs: number;
  kills: number;
  antiCheat: AntiCheatSignals;
  timestamp: number;
  clientSignature: string;
  nonce: string;
}

interface ResponseData {
  allowed: boolean;
  matchId: string;
  placement: number;
  playerCount: number;
  calculatedReward: number;
  reasonCode: string;
  reasonMessage: string;
  riskScore: number;
  validationFlags: Array<{
    code: string;
    severity: string;
    message: string;
  }>;
  rewardBreakdown?: {
    base: number;
    placement: number;
    kills: number;
    survival: number;
    penalties: number;
    final: number;
  };
  securityChecks?: Array<{
    name: string;
    passed: boolean;
    details: string;
  }>;
}

// ─────────────────────────────────────────────
// PAYLOAD VALIDATION
// ─────────────────────────────────────────────

function validatePayloadStructure(payload: unknown): { valid: boolean; error?: string } {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Invalid payload structure' };
  }

  const p = payload as Record<string, unknown>;

  // Required fields
  const requiredFields = [
    'walletAddress', 'matchId', 'placement', 'playerCount',
    'durationMs', 'kills', 'antiCheat', 'timestamp', 'clientSignature', 'nonce'
  ];
  
  for (const field of requiredFields) {
    if (!(field in p)) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  // Validate wallet address format
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

  // Validate placement
  if (typeof p.placement !== 'number' || p.placement < 1 || p.placement > 5) {
    return { valid: false, error: 'Placement must be between 1 and 5' };
  }

  // Validate playerCount
  if (typeof p.playerCount !== 'number' || ![2, 3, 5].includes(p.playerCount)) {
    return { valid: false, error: 'Player count must be 2, 3, or 5' };
  }

  // Validate placement vs playerCount
  if (p.placement > p.playerCount) {
    return { valid: false, error: 'Placement cannot exceed player count' };
  }

  // Validate durationMs (basic check, detailed in validator)
  if (typeof p.durationMs !== 'number' || p.durationMs < 0) {
    return { valid: false, error: 'Invalid duration' };
  }

  // Validate kills
  if (typeof p.kills !== 'number' || p.kills < 0) {
    return { valid: false, error: 'Invalid kill count' };
  }

  // Validate antiCheat object
  if (!p.antiCheat || typeof p.antiCheat !== 'object') {
    return { valid: false, error: 'Missing antiCheat signals' };
  }

  const ac = p.antiCheat as Record<string, unknown>;
  
  if (typeof ac.frameCount !== 'number') {
    return { valid: false, error: 'Invalid frame count' };
  }

  if (typeof ac.avgTickRate !== 'number') {
    return { valid: false, error: 'Invalid tick rate' };
  }

  if (typeof ac.inputTimingVariance !== 'number') {
    return { valid: false, error: 'Missing input timing variance' };
  }

  if (!Array.isArray(ac.suspiciousFlags)) {
    return { valid: false, error: 'Invalid suspicious flags' };
  }

  // Validate timestamp
  if (typeof p.timestamp !== 'number') {
    return { valid: false, error: 'Invalid timestamp' };
  }
  
  const now = Date.now();
  const timeDiff = Math.abs(now - p.timestamp);
  if (timeDiff > 300000) {
    return { valid: false, error: 'Timestamp too old' };
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

  console.log(`[${requestId}] Match submission request received`);

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

    // Validate structure
    const structureCheck = validatePayloadStructure(body);
    if (!structureCheck.valid) {
      console.log(`[${requestId}] Structure validation failed: ${structureCheck.error}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: structureCheck.error,
          requestId,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = body as MatchResultPayload;
    console.log(`[${requestId}] Processing match: ${payload.matchId}`);

    // ─── INITIALIZE SUPABASE ───
    // deno-lint-ignore no-explicit-any
    let supabase: any;
    try {
      supabase = getSupabaseAdmin();
    } catch (error) {
      console.error(`[${requestId}] Failed to initialize Supabase:`, error);
      return new Response(
        JSON.stringify({ success: false, error: 'Internal server error', requestId }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── SECURITY CHECKS (Replay, Rate Limit, etc.) ───
    const securityResult = await performFullSecurityCheck(
      supabase,
      {
        walletAddress: payload.walletAddress,
        matchId: payload.matchId,
        nonce: payload.nonce,
        endpoint: 'match-submit',
      },
      DEFAULT_SECURITY_CONFIG
    );

    if (!securityResult.passed) {
      console.log(`[${requestId}] Security check failed:`, securityResult.blockReason);
      return new Response(
        JSON.stringify({
          success: false,
          allowed: false,
          error: securityResult.blockReason,
          reasonCode: 'SECURITY_FAILED',
          requestId,
          securityChecks: securityResult.checks,
          riskScore: securityResult.riskScore,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── MATCH VALIDATION (Anti-Farming Rules) ───
    const matchInput: MatchInput = {
      walletAddress: payload.walletAddress,
      matchId: payload.matchId,
      placement: payload.placement,
      playerCount: payload.playerCount as 2 | 3 | 5,
      durationMs: payload.durationMs,
      kills: payload.kills,
      antiCheat: {
        inputTimingVariance: payload.antiCheat.inputTimingVariance,
        frameCount: payload.antiCheat.frameCount,
        avgTickRate: payload.antiCheat.avgTickRate,
        suspiciousFlags: payload.antiCheat.suspiciousFlags,
      },
    };

    const validationResult = await validateMatch(supabase, matchInput);

    console.log(`[${requestId}] Validation result:`, {
      allowed: validationResult.allowed,
      reasonCode: validationResult.reasonCode,
      riskScore: validationResult.riskScore,
      flagCount: validationResult.flags.length,
    });

    // ─── CALCULATE REWARD (only if allowed) ───
    let rewardCalculation = null;
    if (validationResult.allowed) {
      const matchData: MatchData = {
        placement: payload.placement,
        playerCount: payload.playerCount,
        kills: payload.kills,
        durationMs: payload.durationMs,
        antiCheatPassed: validationResult.riskScore < 50,
        botConfidence: validationResult.riskScore / 100,
      };
      rewardCalculation = calculateReward(matchData);
    }

    // ─── BUILD RESPONSE ───
    const responseData: ResponseData = {
      allowed: validationResult.allowed,
      matchId: payload.matchId,
      placement: payload.placement,
      playerCount: payload.playerCount,
      calculatedReward: rewardCalculation?.totalReward ?? 0,
      reasonCode: validationResult.reasonCode,
      reasonMessage: validationResult.reasonMessage,
      riskScore: validationResult.riskScore,
      validationFlags: validationResult.flags,
      securityChecks: securityResult.checks,
    };

    if (rewardCalculation) {
      responseData.rewardBreakdown = rewardCalculation.breakdown;
    }

    // ─── RECORD MATCH (if allowed) ───
    if (validationResult.allowed) {
      await recordDailyUsage(supabase, payload.walletAddress, 'match', 1, payload.matchId);
      await recordProcessedMatch(
        supabase,
        payload.matchId,
        payload.walletAddress,
        payload.placement,
        rewardCalculation?.totalReward ?? 0
      );
    }

    const processingTimeMs = Date.now() - startTime;

    // Audit log
    console.log(`[AUDIT] Match ${payload.matchId}: wallet=${payload.walletAddress}, ` +
      `placement=${payload.placement}/${payload.playerCount}, ` +
      `allowed=${validationResult.allowed}, reason=${validationResult.reasonCode}, ` +
      `reward=${rewardCalculation?.totalReward ?? 0}, risk=${validationResult.riskScore}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: responseData,
        meta: {
          requestId,
          timestamp: Date.now(),
          processingTimeMs,
        },
      }),
      {
        status: validationResult.allowed ? 200 : 200, // Always 200, allowed field indicates result
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
