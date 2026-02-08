// ============================================
// MCP SERVER — VALIDATION MODULE
// Input validation and sanitization
// ============================================

import {
  AIDecisionPayload,
  GameSessionPayload,
  ValidationResult,
} from "./mcp-types.ts";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const LIMITS = {
  // Difficulty bounds
  MIN_DIFFICULTY: 0.5,
  MAX_DIFFICULTY: 3.0,

  // Reward bounds
  MIN_REWARD_MULTIPLIER: 0.5,
  MAX_REWARD_MULTIPLIER: 2.5,
  MAX_REWARD_AMOUNT: 100, // per session

  // HP bounds
  MIN_HP: 25,
  MAX_HP: 200,

  // Session bounds
  MAX_SESSION_DURATION: 3600, // 1 hour
  MAX_CLICKS: 10000,
  MAX_TIMESTAMP_DRIFT: 60000, // 1 minute

  // Address validation
  ADDRESS_REGEX: /^0x[a-fA-F0-9]{40}$/,
  SESSION_ID_REGEX: /^session_\d+_[a-z0-9]+$/,
};

// ─────────────────────────────────────────────
// VALIDATE AI DECISION
// ─────────────────────────────────────────────
export function validateAIDecision(
  payload: unknown
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!payload || typeof payload !== "object") {
    return { valid: false, errors: ["Invalid payload structure"], warnings };
  }

  const data = payload as AIDecisionPayload;

  // Required fields
  if (!data.playerAddress) {
    errors.push("Missing playerAddress");
  } else if (!LIMITS.ADDRESS_REGEX.test(data.playerAddress)) {
    errors.push("Invalid playerAddress format");
  }

  if (!data.sessionId) {
    errors.push("Missing sessionId");
  } else if (!LIMITS.SESSION_ID_REGEX.test(data.sessionId)) {
    errors.push("Invalid sessionId format");
  }

  if (!data.timestamp || typeof data.timestamp !== "number") {
    errors.push("Missing or invalid timestamp");
  } else {
    const drift = Math.abs(Date.now() - data.timestamp);
    if (drift > LIMITS.MAX_TIMESTAMP_DRIFT) {
      errors.push(`Timestamp drift too large: ${drift}ms`);
    }
  }

  // Bounds checks
  if (
    typeof data.difficultyMultiplier !== "number" ||
    data.difficultyMultiplier < LIMITS.MIN_DIFFICULTY ||
    data.difficultyMultiplier > LIMITS.MAX_DIFFICULTY
  ) {
    errors.push(
      `difficultyMultiplier out of bounds [${LIMITS.MIN_DIFFICULTY}, ${LIMITS.MAX_DIFFICULTY}]`
    );
  }

  if (
    typeof data.rewardMultiplier !== "number" ||
    data.rewardMultiplier < LIMITS.MIN_REWARD_MULTIPLIER ||
    data.rewardMultiplier > LIMITS.MAX_REWARD_MULTIPLIER
  ) {
    errors.push(
      `rewardMultiplier out of bounds [${LIMITS.MIN_REWARD_MULTIPLIER}, ${LIMITS.MAX_REWARD_MULTIPLIER}]`
    );
  }

  if (
    typeof data.nextTargetHP !== "number" ||
    data.nextTargetHP < LIMITS.MIN_HP ||
    data.nextTargetHP > LIMITS.MAX_HP
  ) {
    errors.push(`nextTargetHP out of bounds [${LIMITS.MIN_HP}, ${LIMITS.MAX_HP}]`);
  }

  if (
    typeof data.rewardAmount !== "number" ||
    data.rewardAmount < 0 ||
    data.rewardAmount > LIMITS.MAX_REWARD_AMOUNT
  ) {
    errors.push(`rewardAmount out of bounds [0, ${LIMITS.MAX_REWARD_AMOUNT}]`);
  }

  // Action validation
  const validActions = ["CONTINUE", "REWARD", "PENALIZE", "FLAG_FOR_REVIEW", "BAN"];
  if (!validActions.includes(data.action)) {
    errors.push(`Invalid action: ${data.action}`);
  }

  // Bot detection validation
  if (!data.botDetection || typeof data.botDetection !== "object") {
    errors.push("Missing botDetection object");
  } else {
    if (typeof data.botDetection.isSuspicious !== "boolean") {
      errors.push("Invalid botDetection.isSuspicious");
    }
    if (
      typeof data.botDetection.confidence !== "number" ||
      data.botDetection.confidence < 0 ||
      data.botDetection.confidence > 1
    ) {
      errors.push("botDetection.confidence must be 0-1");
    }
  }

  // Warnings (non-blocking)
  if (data.rewardAmount > 50) {
    warnings.push("High reward amount - will be flagged for review");
  }

  if (data.botDetection?.isSuspicious && data.action === "REWARD") {
    warnings.push("Suspicious player receiving rewards - unusual");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─────────────────────────────────────────────
// VALIDATE GAME SESSION
// ─────────────────────────────────────────────
export function validateGameSession(
  payload: unknown
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!payload || typeof payload !== "object") {
    return { valid: false, errors: ["Invalid payload structure"], warnings };
  }

  const data = payload as GameSessionPayload;

  // Required fields
  if (!data.sessionId || !LIMITS.SESSION_ID_REGEX.test(data.sessionId)) {
    errors.push("Invalid sessionId");
  }

  if (!data.playerAddress || !LIMITS.ADDRESS_REGEX.test(data.playerAddress)) {
    errors.push("Invalid playerAddress");
  }

  if (!data.clientSignature) {
    errors.push("Missing clientSignature");
  }

  // Bounds checks
  if (typeof data.score !== "number" || data.score < 0) {
    errors.push("Invalid score");
  }

  if (
    typeof data.totalClicks !== "number" ||
    data.totalClicks < 0 ||
    data.totalClicks > LIMITS.MAX_CLICKS
  ) {
    errors.push(`totalClicks out of bounds [0, ${LIMITS.MAX_CLICKS}]`);
  }

  if (
    typeof data.sessionDuration !== "number" ||
    data.sessionDuration < 0 ||
    data.sessionDuration > LIMITS.MAX_SESSION_DURATION
  ) {
    errors.push(`sessionDuration out of bounds [0, ${LIMITS.MAX_SESSION_DURATION}]`);
  }

  // Consistency checks
  if (data.score > 0 && data.totalClicks === 0) {
    errors.push("Score without clicks is invalid");
  }

  if (data.totalClicks > 0 && data.sessionDuration === 0) {
    errors.push("Clicks without duration is invalid");
  }

  // Click rate sanity (max ~20 clicks/sec)
  const clickRate = data.totalClicks / Math.max(data.sessionDuration, 1);
  if (clickRate > 25) {
    warnings.push(`Suspiciously high click rate: ${clickRate.toFixed(1)}/sec`);
  }

  // Timestamp drift
  if (data.clientTimestamp) {
    const drift = Math.abs(Date.now() - data.clientTimestamp);
    if (drift > LIMITS.MAX_TIMESTAMP_DRIFT) {
      errors.push(`Client timestamp drift too large: ${drift}ms`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─────────────────────────────────────────────
// SANITIZE INPUT
// ─────────────────────────────────────────────
export function sanitizeString(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .trim()
    .slice(0, 1000) // max length
    .replace(/[<>]/g, ""); // basic XSS prevention
}

export function sanitizeNumber(
  input: unknown,
  min: number,
  max: number,
  defaultVal: number
): number {
  if (typeof input !== "number" || isNaN(input)) return defaultVal;
  return Math.max(min, Math.min(max, input));
}
