// ============================================
// AI AGENT — DECISION ENGINE
// Rule-based logic for difficulty & rewards
// ============================================

import { AIInputData, AIOutputDecision } from "./types";
import { detectBot } from "./bot-detector";

// ─────────────────────────────────────────────
// DIFFICULTY CONSTANTS
// ─────────────────────────────────────────────
type DifficultyLevel = "EASY" | "NORMAL" | "HARD" | "EXTREME";

interface DifficultySetting {
  multiplier: number;
  hpRange: [number, number];
  label: DifficultyLevel;
}

const DIFFICULTY_SETTINGS: Record<DifficultyLevel, DifficultySetting> = {
  EASY: { multiplier: 0.5, hpRange: [25, 40], label: "EASY" },
  NORMAL: { multiplier: 1.0, hpRange: [40, 60], label: "NORMAL" },
  HARD: { multiplier: 1.5, hpRange: [60, 100], label: "HARD" },
  EXTREME: { multiplier: 2.5, hpRange: [100, 200], label: "EXTREME" },
};

const REWARD_SETTINGS = {
  BASE_RATE: 0.01, // MONARD per score point
  MIN_MULTIPLIER: 0.5,
  MAX_MULTIPLIER: 2.5,
  BOT_PENALTY: 0.0, // bots get nothing
};

const AI_MESSAGES = {
  welcome: [
    "Welcome, challenger. Prove your worth.",
    "The MONARD spirits await your performance.",
  ],
  easyMode: [
    "Take your time. Rewards await the patient.",
    "A gentle start. Build your momentum.",
  ],
  normalMode: [
    "Balanced challenge. Fair rewards.",
    "The algorithm watches. Stay sharp.",
  ],
  hardMode: [
    "Difficulty increased. Greater risks, greater rewards.",
    "Impressive skill detected. Raising the stakes.",
  ],
  extremeMode: [
    "EXTREME MODE ACTIVATED. Maximum rewards unlocked.",
    "Only the elite reach this level. Don't disappoint.",
  ],
  suspicious: [
    "Unusual patterns detected. Under observation.",
    "The algorithm questions your humanity.",
  ],
  banned: [
    "Bot behavior confirmed. Access revoked.",
    "Automation detected. Session terminated.",
  ],
  reward: [
    "Well played. MONARD tokens incoming.",
    "Rewards calculated. Check your wallet.",
  ],
};

// ─────────────────────────────────────────────
// MAIN DECISION FUNCTION
// ─────────────────────────────────────────────
export function makeDecision(input: AIInputData): AIOutputDecision {
  // ── Step 1: Bot detection ──
  const botResult = detectBot(input);

  // ── Step 2: Handle suspicious behavior ──
  if (botResult.isSuspicious && botResult.confidence > 0.8) {
    return createBanDecision(input, botResult);
  }

  if (botResult.isSuspicious && botResult.confidence > 0.5) {
    return createFlaggedDecision(input, botResult);
  }

  // ── Step 3: Calculate performance score ──
  const performanceScore = calculatePerformanceScore(input);

  // ── Step 4: Determine difficulty ──
  const difficulty = determineDifficulty(performanceScore, input);

  // ── Step 5: Calculate reward multiplier ──
  const rewardMultiplier = calculateRewardMultiplier(
    performanceScore,
    botResult.profile.skillLevel,
    input
  );

  // ── Step 6: Calculate actual reward ──
  const rewardAmount = calculateReward(input.score, rewardMultiplier);

  // ── Step 7: Build decision output ──
  return {
    playerAddress: input.playerAddress,
    sessionId: input.sessionId,
    timestamp: Date.now(),

    difficultyMultiplier: difficulty.multiplier,
    rewardMultiplier,
    nextTargetHP: randomInRange(difficulty.hpRange[0], difficulty.hpRange[1]),

    botDetection: {
      isSuspicious: botResult.isSuspicious,
      confidence: botResult.confidence,
      flags: botResult.flags,
    },

    action: "REWARD",
    rewardAmount,
    message: selectMessage(difficulty.label),
    difficulty: difficulty.label,
  };
}

// ─────────────────────────────────────────────
// PERFORMANCE SCORING
// Combines multiple metrics into single score
// ─────────────────────────────────────────────
function calculatePerformanceScore(input: AIInputData): number {
  let score = 0;

  // Score efficiency (points per second)
  const efficiency = input.score / Math.max(input.sessionDuration, 1);
  score += Math.min(1, efficiency / 10) * 30; // max 30 points

  // Combo skill (max combo relative to clicks)
  const comboRatio = input.comboMax / Math.max(input.totalClicks, 1);
  score += Math.min(1, comboRatio * 2) * 25; // max 25 points

  // Win rate
  const winRate = input.wins / Math.max(input.roundsPlayed, 1);
  score += winRate * 25; // max 25 points

  // Engagement (session length bonus)
  const engagementBonus = Math.min(1, input.sessionDuration / 300);
  score += engagementBonus * 20; // max 20 points

  return Math.round(score);
}

// ─────────────────────────────────────────────
// DIFFICULTY SELECTION
// Maps performance to difficulty tier
// ─────────────────────────────────────────────
function determineDifficulty(
  performanceScore: number,
  input: AIInputData
): DifficultySetting {
  // Factor in previous difficulty for smooth progression
  const prevDiff = input.previousDifficulty || 1.0;

  // Performance thresholds
  if (performanceScore >= 80 && prevDiff >= 1.5) {
    return DIFFICULTY_SETTINGS.EXTREME;
  }
  if (performanceScore >= 60 && prevDiff >= 1.0) {
    return DIFFICULTY_SETTINGS.HARD;
  }
  if (performanceScore >= 30) {
    return DIFFICULTY_SETTINGS.NORMAL;
  }
  return DIFFICULTY_SETTINGS.EASY;
}

// ─────────────────────────────────────────────
// REWARD MULTIPLIER CALCULATION
// Higher skill = higher rewards (with caps)
// ─────────────────────────────────────────────
function calculateRewardMultiplier(
  performanceScore: number,
  skillLevel: string,
  input: AIInputData
): number {
  let multiplier = 1.0;

  // Base from performance (0.5 - 1.5)
  multiplier = 0.5 + (performanceScore / 100) * 1.0;

  // Skill bonus
  const skillBonus: Record<string, number> = {
    NOVICE: 0,
    INTERMEDIATE: 0.1,
    SKILLED: 0.3,
    EXPERT: 0.5,
  };
  multiplier += skillBonus[skillLevel] || 0;

  // Combo streak bonus
  if (input.comboMax >= 20) {
    multiplier += 0.2;
  }

  // Session loyalty bonus
  if (input.lifetimeSessions > 10) {
    multiplier += 0.1;
  }

  // Clamp to valid range
  return Math.round(
    Math.max(REWARD_SETTINGS.MIN_MULTIPLIER, Math.min(REWARD_SETTINGS.MAX_MULTIPLIER, multiplier)) *
      100
  ) / 100;
}

// ─────────────────────────────────────────────
// REWARD CALCULATION
// Converts score to MONARD tokens
// ─────────────────────────────────────────────
function calculateReward(score: number, multiplier: number): number {
  const base = score * REWARD_SETTINGS.BASE_RATE;
  return Math.round(base * multiplier * 100) / 100;
}

// ─────────────────────────────────────────────
// SPECIAL DECISIONS (Bots & Flagged)
// ─────────────────────────────────────────────
function createBanDecision(
  input: AIInputData,
  botResult: ReturnType<typeof detectBot>
): AIOutputDecision {
  return {
    playerAddress: input.playerAddress,
    sessionId: input.sessionId,
    timestamp: Date.now(),
    difficultyMultiplier: 3.0,
    rewardMultiplier: 0,
    nextTargetHP: 200,
    botDetection: {
      isSuspicious: true,
      confidence: botResult.confidence,
      flags: botResult.flags,
    },
    action: "BAN",
    rewardAmount: 0,
    message: selectMessage("banned"),
    difficulty: "EXTREME",
  };
}

function createFlaggedDecision(
  input: AIInputData,
  botResult: ReturnType<typeof detectBot>
): AIOutputDecision {
  return {
    playerAddress: input.playerAddress,
    sessionId: input.sessionId,
    timestamp: Date.now(),
    difficultyMultiplier: 2.0,
    rewardMultiplier: 0.5, // reduced rewards
    nextTargetHP: 100,
    botDetection: {
      isSuspicious: true,
      confidence: botResult.confidence,
      flags: botResult.flags,
    },
    action: "FLAG_FOR_REVIEW",
    rewardAmount: calculateReward(input.score, 0.5),
    message: selectMessage("suspicious"),
    difficulty: "HARD",
  };
}

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────
function selectMessage(category: keyof typeof AI_MESSAGES | "EASY" | "NORMAL" | "HARD" | "EXTREME"): string {
  const categoryMap: Record<string, keyof typeof AI_MESSAGES> = {
    EASY: "easyMode",
    NORMAL: "normalMode",
    HARD: "hardMode",
    EXTREME: "extremeMode",
  };

  const key = categoryMap[category] || category;
  const messages = AI_MESSAGES[key as keyof typeof AI_MESSAGES] || AI_MESSAGES.welcome;
  return messages[Math.floor(Math.random() * messages.length)];
}

function randomInRange(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}
