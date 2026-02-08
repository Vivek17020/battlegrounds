// ============================================
// AI AGENT — BOT DETECTION MODULE
// Rule-based detection for obvious automation
// ============================================

import { AIInputData, BotFlag, BehaviorProfile } from "./types";

interface BotDetectionResult {
  isSuspicious: boolean;
  confidence: number;
  flags: BotFlag[];
  profile: BehaviorProfile;
}

// ─────────────────────────────────────────────
// THRESHOLDS (tunable constants)
// ─────────────────────────────────────────────
const THRESHOLDS = {
  // Click speed (milliseconds between clicks)
  INHUMAN_CLICK_INTERVAL: 50, // < 50ms = 20+ clicks/sec
  FAST_CLICK_INTERVAL: 100, // < 100ms = 10+ clicks/sec
  AVERAGE_CLICK_INTERVAL: 250, // typical human

  // Variance (std deviation in ms)
  ROBOTIC_VARIANCE: 5, // < 5ms variance = very suspicious
  LOW_VARIANCE: 15, // < 15ms = somewhat suspicious

  // Combo limits
  MAX_HUMAN_COMBO: 50, // sustained combos above this are suspicious
  IMPOSSIBLE_COMBO: 100, // definitely not human

  // Session limits
  MAX_SESSIONS_PER_HOUR: 20,
  MIN_SESSION_DURATION: 3, // seconds - too short = suspicious
};

// ─────────────────────────────────────────────
// MAIN DETECTION FUNCTION
// ─────────────────────────────────────────────
export function detectBot(input: AIInputData): BotDetectionResult {
  const flags: BotFlag[] = [];
  let suspicionScore = 0;

  // ── Check 1: Click speed analysis ──
  if (input.avgClickInterval < THRESHOLDS.INHUMAN_CLICK_INTERVAL) {
    flags.push("INHUMAN_SPEED");
    suspicionScore += 0.4;
  } else if (input.avgClickInterval < THRESHOLDS.FAST_CLICK_INTERVAL) {
    suspicionScore += 0.1; // fast but possible
  }

  // ── Check 2: Click timing variance ──
  if (input.clickIntervalVariance < THRESHOLDS.ROBOTIC_VARIANCE) {
    flags.push("ZERO_VARIANCE");
    suspicionScore += 0.35;
  } else if (input.clickIntervalVariance < THRESHOLDS.LOW_VARIANCE) {
    suspicionScore += 0.1;
  }

  // ── Check 3: Combo analysis ──
  if (input.comboMax > THRESHOLDS.IMPOSSIBLE_COMBO) {
    flags.push("IMPOSSIBLE_COMBO");
    suspicionScore += 0.3;
  } else if (input.comboMax > THRESHOLDS.MAX_HUMAN_COMBO) {
    suspicionScore += 0.15;
  }

  // ── Check 4: Session spam ──
  if (input.lifetimeSessions > 0) {
    const sessionsPerHour = input.lifetimeSessions / Math.max(1, input.sessionDuration / 3600);
    if (sessionsPerHour > THRESHOLDS.MAX_SESSIONS_PER_HOUR) {
      flags.push("SESSION_SPAM");
      suspicionScore += 0.2;
    }
  }

  // ── Check 5: Pattern detection ──
  const patternScore = detectClickPatterns(input.clickTimestamps);
  if (patternScore > 0.7) {
    flags.push("PATTERN_DETECTED");
    suspicionScore += 0.25;
  }

  // ── Build behavior profile ──
  const profile = buildBehaviorProfile(input);

  // ── Final confidence (capped at 1.0) ──
  const confidence = Math.min(1.0, suspicionScore);

  return {
    isSuspicious: confidence > 0.5,
    confidence: Math.round(confidence * 100) / 100,
    flags,
    profile,
  };
}

// ─────────────────────────────────────────────
// PATTERN DETECTION
// Looks for repetitive timing sequences
// ─────────────────────────────────────────────
function detectClickPatterns(timestamps: number[]): number {
  if (timestamps.length < 10) return 0;

  // Calculate intervals
  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }

  // Look for repeating sequences
  let repeatCount = 0;
  const windowSize = 5;

  for (let i = windowSize; i < intervals.length; i++) {
    const current = intervals.slice(i - windowSize, i);
    const previous = intervals.slice(i - windowSize * 2, i - windowSize);

    if (previous.length === windowSize) {
      const similarity = calculateSimilarity(current, previous);
      if (similarity > 0.9) repeatCount++;
    }
  }

  return Math.min(1, repeatCount / (intervals.length / windowSize));
}

function calculateSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let totalDiff = 0;
  for (let i = 0; i < a.length; i++) {
    const maxVal = Math.max(a[i], b[i], 1);
    totalDiff += Math.abs(a[i] - b[i]) / maxVal;
  }

  return 1 - totalDiff / a.length;
}

// ─────────────────────────────────────────────
// BEHAVIOR PROFILING
// Categorizes player for difficulty adjustment
// ─────────────────────────────────────────────
function buildBehaviorProfile(input: AIInputData): BehaviorProfile {
  // Speed tier
  let speedTier: BehaviorProfile["speedTier"];
  if (input.avgClickInterval < THRESHOLDS.INHUMAN_CLICK_INTERVAL) {
    speedTier = "INHUMAN";
  } else if (input.avgClickInterval < THRESHOLDS.FAST_CLICK_INTERVAL) {
    speedTier = "FAST";
  } else if (input.avgClickInterval < THRESHOLDS.AVERAGE_CLICK_INTERVAL) {
    speedTier = "AVERAGE";
  } else {
    speedTier = "SLOW";
  }

  // Consistency (lower variance = higher consistency)
  const consistencyScore = Math.max(
    0,
    1 - input.clickIntervalVariance / 100
  );

  // Skill level based on combo performance
  let skillLevel: BehaviorProfile["skillLevel"];
  if (input.avgComboLength > 15) {
    skillLevel = "EXPERT";
  } else if (input.avgComboLength > 8) {
    skillLevel = "SKILLED";
  } else if (input.avgComboLength > 3) {
    skillLevel = "INTERMEDIATE";
  } else {
    skillLevel = "NOVICE";
  }

  // Engagement based on session length
  let engagementLevel: BehaviorProfile["engagementLevel"];
  if (input.sessionDuration > 300) {
    engagementLevel = "HIGH";
  } else if (input.sessionDuration > 60) {
    engagementLevel = "MEDIUM";
  } else {
    engagementLevel = "LOW";
  }

  return {
    speedTier,
    consistencyScore: Math.round(consistencyScore * 100) / 100,
    skillLevel,
    engagementLevel,
  };
}
