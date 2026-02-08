// ============================================
// MCP SERVER — SECURITY MODULE
// Anti-abuse, replay prevention, rate limiting
// ============================================

import { SecurityCheckResult } from "./mcp-types.ts";

// ─────────────────────────────────────────────
// IN-MEMORY STORES (for edge function lifecycle)
// In production, use Redis or database
// ─────────────────────────────────────────────
const usedNonces = new Map<string, number>(); // nonce -> timestamp
const rateLimitBuckets = new Map<string, { count: number; windowStart: number }>();

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const SECURITY_CONFIG = {
  NONCE_EXPIRY_MS: 300000, // 5 minutes
  RATE_LIMIT_WINDOW_MS: 60000, // 1 minute
  RATE_LIMIT_MAX_REQUESTS: 30, // per window
  MAX_REWARD_PER_HOUR: 500, // MONARD tokens
  SUSPICIOUS_THRESHOLD: 0.7,
  BAN_THRESHOLD: 0.9,
};

// ─────────────────────────────────────────────
// MAIN SECURITY CHECK
// ─────────────────────────────────────────────
export function performSecurityChecks(
  playerAddress: string,
  sessionId: string,
  nonce: string,
  botConfidence: number,
  rewardAmount: number
): SecurityCheckResult {
  const checks: SecurityCheckResult["checks"] = [];
  let riskScore = 0;

  // ── Check 1: Replay attack prevention ──
  const replayCheck = checkReplayAttack(nonce);
  checks.push({
    name: "REPLAY_PREVENTION",
    passed: replayCheck.passed,
    details: replayCheck.details,
  });
  if (!replayCheck.passed) riskScore += 40;

  // ── Check 2: Rate limiting ──
  const rateCheck = checkRateLimit(playerAddress);
  checks.push({
    name: "RATE_LIMIT",
    passed: rateCheck.passed,
    details: rateCheck.details,
  });
  if (!rateCheck.passed) riskScore += 30;

  // ── Check 3: Bot confidence threshold ──
  const botCheck = checkBotConfidence(botConfidence);
  checks.push({
    name: "BOT_DETECTION",
    passed: botCheck.passed,
    details: botCheck.details,
  });
  if (!botCheck.passed) riskScore += 50;

  // ── Check 4: Reward amount sanity ──
  const rewardCheck = checkRewardAmount(rewardAmount);
  checks.push({
    name: "REWARD_SANITY",
    passed: rewardCheck.passed,
    details: rewardCheck.details,
  });
  if (!rewardCheck.passed) riskScore += 20;

  // ── Check 5: Address format validation ──
  const addressCheck = checkAddressFormat(playerAddress);
  checks.push({
    name: "ADDRESS_VALIDATION",
    passed: addressCheck.passed,
    details: addressCheck.details,
  });
  if (!addressCheck.passed) riskScore += 100;

  // ── Check 6: Session format validation ──
  const sessionCheck = checkSessionFormat(sessionId);
  checks.push({
    name: "SESSION_VALIDATION",
    passed: sessionCheck.passed,
    details: sessionCheck.details,
  });
  if (!sessionCheck.passed) riskScore += 30;

  const allPassed = checks.every((c) => c.passed);

  return {
    passed: allPassed,
    checks,
    riskScore: Math.min(100, riskScore),
  };
}

// ─────────────────────────────────────────────
// INDIVIDUAL CHECKS
// ─────────────────────────────────────────────

function checkReplayAttack(nonce: string): { passed: boolean; details: string } {
  // Clean expired nonces
  const now = Date.now();
  for (const [n, timestamp] of usedNonces) {
    if (now - timestamp > SECURITY_CONFIG.NONCE_EXPIRY_MS) {
      usedNonces.delete(n);
    }
  }

  // Check if nonce was already used
  if (usedNonces.has(nonce)) {
    return { passed: false, details: "Nonce already used (replay attack)" };
  }

  // Mark nonce as used
  usedNonces.set(nonce, now);
  return { passed: true, details: "Nonce is fresh" };
}

function checkRateLimit(playerAddress: string): { passed: boolean; details: string } {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(playerAddress);

  if (!bucket || now - bucket.windowStart > SECURITY_CONFIG.RATE_LIMIT_WINDOW_MS) {
    // New window
    rateLimitBuckets.set(playerAddress, { count: 1, windowStart: now });
    return { passed: true, details: "Rate limit OK (1/30)" };
  }

  bucket.count++;

  if (bucket.count > SECURITY_CONFIG.RATE_LIMIT_MAX_REQUESTS) {
    return {
      passed: false,
      details: `Rate limit exceeded (${bucket.count}/${SECURITY_CONFIG.RATE_LIMIT_MAX_REQUESTS})`,
    };
  }

  return {
    passed: true,
    details: `Rate limit OK (${bucket.count}/${SECURITY_CONFIG.RATE_LIMIT_MAX_REQUESTS})`,
  };
}

function checkBotConfidence(confidence: number): { passed: boolean; details: string } {
  if (confidence >= SECURITY_CONFIG.BAN_THRESHOLD) {
    return {
      passed: false,
      details: `Bot confidence ${(confidence * 100).toFixed(0)}% exceeds ban threshold`,
    };
  }

  if (confidence >= SECURITY_CONFIG.SUSPICIOUS_THRESHOLD) {
    return {
      passed: true,
      details: `Bot confidence ${(confidence * 100).toFixed(0)}% flagged for review`,
    };
  }

  return {
    passed: true,
    details: `Bot confidence ${(confidence * 100).toFixed(0)}% OK`,
  };
}

function checkRewardAmount(amount: number): { passed: boolean; details: string } {
  if (amount < 0) {
    return { passed: false, details: "Negative reward amount" };
  }

  if (amount > 100) {
    return { passed: false, details: `Reward ${amount} exceeds max per session (100)` };
  }

  return { passed: true, details: `Reward amount ${amount} within limits` };
}

function checkAddressFormat(address: string): { passed: boolean; details: string } {
  const valid = /^0x[a-fA-F0-9]{40}$/.test(address);
  return {
    passed: valid,
    details: valid ? "Valid Ethereum address" : "Invalid address format",
  };
}

function checkSessionFormat(sessionId: string): { passed: boolean; details: string } {
  const valid = /^session_\d+_[a-z0-9]+$/.test(sessionId);
  return {
    passed: valid,
    details: valid ? "Valid session ID format" : "Invalid session ID format",
  };
}

// ─────────────────────────────────────────────
// SIGNATURE VERIFICATION
// ─────────────────────────────────────────────
export async function verifySignature(
  payload: string,
  signature: string,
  secretKey: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secretKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload)
    );

    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return signature === expectedSignature;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// NONCE GENERATION
// ─────────────────────────────────────────────
export function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
