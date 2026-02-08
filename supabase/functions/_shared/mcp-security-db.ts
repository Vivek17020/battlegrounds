// ============================================
// MCP SERVER — DATABASE-BACKED SECURITY MODULE
// Production-grade anti-abuse, replay prevention, rate limiting
// ============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
export interface SecurityConfig {
  nonceExpiryMs: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  dailyRewardCap: number;
  dailyMatchCap: number;
  maxRewardPerMatch: number;
  suspiciousThreshold: number;
  banThreshold: number;
}

export interface SecurityCheckResult {
  passed: boolean;
  checks: SecurityCheck[];
  riskScore: number;
  blockReason?: string;
}

export interface SecurityCheck {
  name: string;
  passed: boolean;
  details: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  details: string;
}

export interface DailyCapResult {
  allowed: boolean;
  usedToday: number;
  remaining: number;
  resetAt: number;
}

export interface NonceCheckResult {
  valid: boolean;
  reason: string;
}

// ─────────────────────────────────────────────
// DEFAULT CONFIGURATION
// ─────────────────────────────────────────────
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  nonceExpiryMs: 300000, // 5 minutes
  rateLimitWindowMs: 60000, // 1 minute
  rateLimitMaxRequests: 30, // requests per window
  dailyRewardCap: 5000, // MONARD per day
  dailyMatchCap: 50, // matches per day
  maxRewardPerMatch: 1000, // MONARD per match
  suspiciousThreshold: 0.7,
  banThreshold: 0.9,
};

// ─────────────────────────────────────────────
// SUPABASE CLIENT FACTORY
// ─────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
export function getSupabaseAdmin(): any {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

// ─────────────────────────────────────────────
// NONCE MANAGEMENT (Replay Attack Prevention)
// ─────────────────────────────────────────────
export async function checkAndConsumeNonce(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  nonce: string,
  walletAddress: string,
  config: SecurityConfig = DEFAULT_SECURITY_CONFIG
): Promise<NonceCheckResult> {
  const now = Date.now();
  const expiryThreshold = now - config.nonceExpiryMs;

  // Check if nonce already exists
  const { data: existing, error: checkError } = await supabase
    .from('mcp_nonces')
    .select('id, used_at')
    .eq('nonce', nonce)
    .single();

  if (checkError && checkError.code !== 'PGRST116') {
    console.error('[SECURITY] Nonce check error:', checkError);
    return { valid: false, reason: 'Database error during nonce check' };
  }

  if (existing) {
    return { valid: false, reason: 'Nonce already used (replay attack detected)' };
  }

  // Insert new nonce
  const { error: insertError } = await supabase
    .from('mcp_nonces')
    .insert({
      nonce,
      wallet_address: walletAddress,
      used_at: now,
    });

  if (insertError) {
    // Unique constraint violation means concurrent replay attempt
    if (insertError.code === '23505') {
      return { valid: false, reason: 'Concurrent replay attack detected' };
    }
    console.error('[SECURITY] Nonce insert error:', insertError);
    return { valid: false, reason: 'Failed to record nonce' };
  }

  // Cleanup old nonces (async, don't await)
  supabase
    .from('mcp_nonces')
    .delete()
    .lt('used_at', expiryThreshold)
    .then(() => console.log('[SECURITY] Cleaned up expired nonces'));

  return { valid: true, reason: 'Nonce is fresh' };
}

// ─────────────────────────────────────────────
// RATE LIMITING (Wallet-based)
// ─────────────────────────────────────────────
export async function checkRateLimit(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  walletAddress: string,
  endpoint: string,
  config: SecurityConfig = DEFAULT_SECURITY_CONFIG
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - config.rateLimitWindowMs;

  // Count requests in current window
  const { count, error } = await supabase
    .from('mcp_rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('wallet_address', walletAddress)
    .eq('endpoint', endpoint)
    .gte('created_at', new Date(windowStart).toISOString());

  if (error) {
    console.error('[SECURITY] Rate limit check error:', error);
    // Fail open but log for monitoring
    return {
      allowed: true,
      remaining: config.rateLimitMaxRequests,
      resetAt: now + config.rateLimitWindowMs,
      details: 'Rate limit check failed, allowing request',
    };
  }

  const requestCount = count || 0;
  const remaining = Math.max(0, config.rateLimitMaxRequests - requestCount - 1);
  const resetAt = now + config.rateLimitWindowMs;

  if (requestCount >= config.rateLimitMaxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      details: `Rate limit exceeded: ${requestCount}/${config.rateLimitMaxRequests}`,
    };
  }

  // Record this request
  await supabase
    .from('mcp_rate_limits')
    .insert({
      wallet_address: walletAddress,
      endpoint,
      created_at: new Date(now).toISOString(),
    });

  return {
    allowed: true,
    remaining,
    resetAt,
    details: `Rate limit OK: ${requestCount + 1}/${config.rateLimitMaxRequests}`,
  };
}

// ─────────────────────────────────────────────
// DAILY CAPS (Reward & Match Limits)
// ─────────────────────────────────────────────
export async function checkDailyCap(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  walletAddress: string,
  capType: 'reward' | 'match',
  amount: number = 1,
  config: SecurityConfig = DEFAULT_SECURITY_CONFIG
): Promise<DailyCapResult> {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

  const maxCap = capType === 'reward' ? config.dailyRewardCap : config.dailyMatchCap;

  // Get today's usage
  const { data, error } = await supabase
    .from('mcp_daily_usage')
    .select('amount')
    .eq('wallet_address', walletAddress)
    .eq('usage_type', capType)
    .gte('created_at', dayStart)
    .lt('created_at', dayEnd);

  if (error) {
    console.error('[SECURITY] Daily cap check error:', error);
    return {
      allowed: false,
      usedToday: 0,
      remaining: 0,
      resetAt: new Date(dayEnd).getTime(),
    };
  }

  const usedToday = data.reduce((sum: number, row: { amount?: number }) => sum + (row.amount || 0), 0);
  const remaining = Math.max(0, maxCap - usedToday);

  if (usedToday + amount > maxCap) {
    return {
      allowed: false,
      usedToday,
      remaining,
      resetAt: new Date(dayEnd).getTime(),
    };
  }

  return {
    allowed: true,
    usedToday,
    remaining: remaining - amount,
    resetAt: new Date(dayEnd).getTime(),
  };
}

export async function recordDailyUsage(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  walletAddress: string,
  usageType: 'reward' | 'match',
  amount: number,
  matchId: string
): Promise<void> {
  await supabase
    .from('mcp_daily_usage')
    .insert({
      wallet_address: walletAddress,
      usage_type: usageType,
      amount,
      match_id: matchId,
      created_at: new Date().toISOString(),
    });
}

// ─────────────────────────────────────────────
// MATCH ID UNIQUENESS CHECK
// ─────────────────────────────────────────────
export async function checkMatchUniqueness(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  matchId: string
): Promise<{ unique: boolean; reason: string }> {
  const { data, error } = await supabase
    .from('mcp_processed_matches')
    .select('id')
    .eq('match_id', matchId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[SECURITY] Match uniqueness check error:', error);
    return { unique: false, reason: 'Database error during match check' };
  }

  if (data) {
    return { unique: false, reason: 'Match already processed (replay attack)' };
  }

  return { unique: true, reason: 'Match ID is unique' };
}

export async function recordProcessedMatch(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  matchId: string,
  walletAddress: string,
  placement: number,
  rewardAmount: number,
  txHash?: string
): Promise<void> {
  await supabase
    .from('mcp_processed_matches')
    .insert({
      match_id: matchId,
      wallet_address: walletAddress,
      placement,
      reward_amount: rewardAmount,
      tx_hash: txHash,
      processed_at: new Date().toISOString(),
    });
}

// ─────────────────────────────────────────────
// WALLET VALIDATION
// ─────────────────────────────────────────────
export function validateWalletAddress(address: string): { valid: boolean; reason: string } {
  if (!address || typeof address !== 'string') {
    return { valid: false, reason: 'Missing wallet address' };
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return { valid: false, reason: 'Invalid Ethereum address format' };
  }

  return { valid: true, reason: 'Valid Ethereum address' };
}

// ─────────────────────────────────────────────
// COMPREHENSIVE SECURITY CHECK
// ─────────────────────────────────────────────
export async function performFullSecurityCheck(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  params: {
    walletAddress: string;
    matchId: string;
    nonce: string;
    endpoint: string;
    rewardAmount?: number;
    botConfidence?: number;
  },
  config: SecurityConfig = DEFAULT_SECURITY_CONFIG
): Promise<SecurityCheckResult> {
  const checks: SecurityCheck[] = [];
  let riskScore = 0;
  let blockReason: string | undefined;

  // 1. Wallet validation
  const walletCheck = validateWalletAddress(params.walletAddress);
  checks.push({
    name: 'WALLET_VALIDATION',
    passed: walletCheck.valid,
    details: walletCheck.reason,
  });
  if (!walletCheck.valid) {
    riskScore += 100;
    blockReason = walletCheck.reason;
  }

  // 2. Nonce check (replay prevention)
  const nonceCheck = await checkAndConsumeNonce(
    supabase,
    params.nonce,
    params.walletAddress,
    config
  );
  checks.push({
    name: 'REPLAY_PREVENTION',
    passed: nonceCheck.valid,
    details: nonceCheck.reason,
  });
  if (!nonceCheck.valid) {
    riskScore += 50;
    blockReason = blockReason || nonceCheck.reason;
  }

  // 3. Rate limiting
  const rateCheck = await checkRateLimit(
    supabase,
    params.walletAddress,
    params.endpoint,
    config
  );
  checks.push({
    name: 'RATE_LIMIT',
    passed: rateCheck.allowed,
    details: rateCheck.details,
  });
  if (!rateCheck.allowed) {
    riskScore += 40;
    blockReason = blockReason || rateCheck.details;
  }

  // 4. Match uniqueness
  const matchCheck = await checkMatchUniqueness(supabase, params.matchId);
  checks.push({
    name: 'MATCH_UNIQUENESS',
    passed: matchCheck.unique,
    details: matchCheck.reason,
  });
  if (!matchCheck.unique) {
    riskScore += 60;
    blockReason = blockReason || matchCheck.reason;
  }

  // 5. Daily match cap
  const matchCapCheck = await checkDailyCap(
    supabase,
    params.walletAddress,
    'match',
    1,
    config
  );
  checks.push({
    name: 'DAILY_MATCH_CAP',
    passed: matchCapCheck.allowed,
    details: matchCapCheck.allowed
      ? `Matches today: ${matchCapCheck.usedToday}/${config.dailyMatchCap}`
      : `Daily match limit reached: ${matchCapCheck.usedToday}/${config.dailyMatchCap}`,
  });
  if (!matchCapCheck.allowed) {
    riskScore += 30;
    blockReason = blockReason || 'Daily match limit exceeded';
  }

  // 6. Daily reward cap (if reward amount provided)
  if (params.rewardAmount !== undefined) {
    const rewardCapCheck = await checkDailyCap(
      supabase,
      params.walletAddress,
      'reward',
      params.rewardAmount,
      config
    );
    checks.push({
      name: 'DAILY_REWARD_CAP',
      passed: rewardCapCheck.allowed,
      details: rewardCapCheck.allowed
        ? `Rewards today: ${rewardCapCheck.usedToday}/${config.dailyRewardCap}`
        : `Daily reward limit reached: ${rewardCapCheck.usedToday}/${config.dailyRewardCap}`,
    });
    if (!rewardCapCheck.allowed) {
      riskScore += 30;
      blockReason = blockReason || 'Daily reward limit exceeded';
    }

    // Per-match reward cap
    if (params.rewardAmount > config.maxRewardPerMatch) {
      checks.push({
        name: 'PER_MATCH_CAP',
        passed: false,
        details: `Reward ${params.rewardAmount} exceeds max ${config.maxRewardPerMatch}`,
      });
      riskScore += 40;
      blockReason = blockReason || 'Per-match reward cap exceeded';
    } else {
      checks.push({
        name: 'PER_MATCH_CAP',
        passed: true,
        details: `Reward ${params.rewardAmount} within limit`,
      });
    }
  }

  // 7. Bot detection (if confidence provided)
  if (params.botConfidence !== undefined) {
    const isBanned = params.botConfidence >= config.banThreshold;
    const isSuspicious = params.botConfidence >= config.suspiciousThreshold;
    
    checks.push({
      name: 'BOT_DETECTION',
      passed: !isBanned,
      details: isBanned
        ? `Bot confidence ${(params.botConfidence * 100).toFixed(0)}% exceeds ban threshold`
        : isSuspicious
        ? `Bot confidence ${(params.botConfidence * 100).toFixed(0)}% flagged for review`
        : `Bot confidence ${(params.botConfidence * 100).toFixed(0)}% OK`,
    });
    
    if (isBanned) {
      riskScore += 50;
      blockReason = blockReason || 'Bot detection threshold exceeded';
    } else if (isSuspicious) {
      riskScore += 20;
    }
  }

  const allPassed = checks.every((c) => c.passed);

  return {
    passed: allPassed,
    checks,
    riskScore: Math.min(100, riskScore),
    blockReason: allPassed ? undefined : blockReason,
  };
}

// ─────────────────────────────────────────────
// HMAC SIGNATURE VERIFICATION
// ─────────────────────────────────────────────
export async function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBytes = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payload)
    );

    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Constant-time comparison
    if (signature.length !== expectedSignature.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }
    
    return result === 0;
  } catch (error) {
    console.error('[SECURITY] Signature verification error:', error);
    return false;
  }
}

// ─────────────────────────────────────────────
// NONCE GENERATION
// ─────────────────────────────────────────────
export function generateSecureNonce(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
