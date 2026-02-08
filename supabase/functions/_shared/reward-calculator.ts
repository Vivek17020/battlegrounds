// ============================================
// MCP SERVER — REWARD CALCULATION MODULE
// Implements the reward formula from TOKEN_ECONOMY.md
// ============================================

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
export interface MatchData {
  placement: number;
  playerCount: number;
  kills: number;
  durationMs: number;
  antiCheatPassed: boolean;
  botConfidence: number;
}

export interface RewardCalculation {
  baseReward: number;
  placementMultiplier: number;
  killBonus: number;
  survivalBonus: number;
  antiCheatModifier: number;
  totalReward: number;
  breakdown: RewardBreakdown;
}

export interface RewardBreakdown {
  base: number;
  placement: number;
  kills: number;
  survival: number;
  penalties: number;
  final: number;
}

// ─────────────────────────────────────────────
// REWARD CONSTANTS
// ─────────────────────────────────────────────
const REWARD_CONFIG = {
  // Base rewards by player count
  BASE_REWARD: {
    2: 10,  // 2-player match
    3: 15,  // 3-player match
    5: 25,  // 5-player match
  } as Record<number, number>,

  // Placement multipliers (1st, 2nd, 3rd, etc.)
  PLACEMENT_MULTIPLIERS: {
    1: 2.0,   // Winner gets 2x
    2: 1.0,   // Runner-up gets 1x
    3: 0.5,   // Third place gets 0.5x
    4: 0.25,  // Fourth place gets 0.25x
    5: 0.1,   // Fifth place gets 0.1x
  } as Record<number, number>,

  // Kill bonus per kill
  KILL_BONUS: 5, // MONARD per kill

  // Survival time bonus (per minute survived)
  SURVIVAL_BONUS_PER_MINUTE: 2, // MONARD per minute

  // Maximum survival bonus
  MAX_SURVIVAL_BONUS: 20, // Cap at 10 minutes

  // Anti-cheat penalties
  SUSPICIOUS_PENALTY: 0.5, // 50% reduction if suspicious
  FAILED_ANTICHEAT_PENALTY: 0, // No reward if failed

  // Absolute caps
  MAX_REWARD_PER_MATCH: 1000, // Hard cap per match
  MIN_REWARD: 0, // No negative rewards
};

// ─────────────────────────────────────────────
// MAIN REWARD CALCULATION
// ─────────────────────────────────────────────
export function calculateReward(match: MatchData): RewardCalculation {
  // Get base reward for player count
  const baseReward = REWARD_CONFIG.BASE_REWARD[match.playerCount] || 10;

  // Get placement multiplier
  const placementMultiplier = REWARD_CONFIG.PLACEMENT_MULTIPLIERS[match.placement] || 0.1;

  // Calculate kill bonus
  const killBonus = match.kills * REWARD_CONFIG.KILL_BONUS;

  // Calculate survival bonus (capped)
  const survivalMinutes = match.durationMs / 60000;
  const survivalBonus = Math.min(
    survivalMinutes * REWARD_CONFIG.SURVIVAL_BONUS_PER_MINUTE,
    REWARD_CONFIG.MAX_SURVIVAL_BONUS
  );

  // Determine anti-cheat modifier
  let antiCheatModifier = 1.0;
  if (!match.antiCheatPassed) {
    antiCheatModifier = REWARD_CONFIG.FAILED_ANTICHEAT_PENALTY;
  } else if (match.botConfidence >= 0.7) {
    antiCheatModifier = REWARD_CONFIG.SUSPICIOUS_PENALTY;
  }

  // Calculate total reward
  const baseWithPlacement = baseReward * placementMultiplier;
  const withBonuses = baseWithPlacement + killBonus + survivalBonus;
  const withModifier = withBonuses * antiCheatModifier;

  // Apply caps
  const totalReward = Math.min(
    Math.max(withModifier, REWARD_CONFIG.MIN_REWARD),
    REWARD_CONFIG.MAX_REWARD_PER_MATCH
  );

  // Build breakdown for transparency
  const penalties = withBonuses - (withBonuses * antiCheatModifier);

  const breakdown: RewardBreakdown = {
    base: baseReward,
    placement: baseWithPlacement - baseReward,
    kills: killBonus,
    survival: survivalBonus,
    penalties: -penalties,
    final: totalReward,
  };

  return {
    baseReward,
    placementMultiplier,
    killBonus,
    survivalBonus,
    antiCheatModifier,
    totalReward,
    breakdown,
  };
}

// ─────────────────────────────────────────────
// VALIDATION HELPERS
// ─────────────────────────────────────────────
export function validateMatchData(match: MatchData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate placement
  if (match.placement < 1 || match.placement > match.playerCount) {
    errors.push(`Invalid placement: ${match.placement} (must be 1-${match.playerCount})`);
  }

  // Validate player count
  if (![2, 3, 5].includes(match.playerCount)) {
    errors.push(`Invalid player count: ${match.playerCount} (must be 2, 3, or 5)`);
  }

  // Validate kills
  if (match.kills < 0 || match.kills >= match.playerCount) {
    errors.push(`Invalid kills: ${match.kills} (must be 0-${match.playerCount - 1})`);
  }

  // Validate duration
  if (match.durationMs < 5000 || match.durationMs > 600000) {
    errors.push(`Invalid duration: ${match.durationMs}ms (must be 5s-10min)`);
  }

  // Validate bot confidence
  if (match.botConfidence < 0 || match.botConfidence > 1) {
    errors.push(`Invalid bot confidence: ${match.botConfidence} (must be 0-1)`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─────────────────────────────────────────────
// REWARD FORMULA EXPLANATION (for API docs)
// ─────────────────────────────────────────────
export const REWARD_FORMULA_DOCS = `
## Reward Formula

Total Reward = (Base × Placement + Kills + Survival) × AntiCheat

### Components:

**Base Reward (by player count):**
- 2 players: 10 MONARD
- 3 players: 15 MONARD  
- 5 players: 25 MONARD

**Placement Multiplier:**
- 1st: ×2.0
- 2nd: ×1.0
- 3rd: ×0.5
- 4th: ×0.25
- 5th: ×0.1

**Kill Bonus:** +5 MONARD per kill

**Survival Bonus:** +2 MONARD per minute (max 20)

**Anti-Cheat Modifier:**
- Passed: ×1.0
- Suspicious (>70% bot confidence): ×0.5
- Failed: ×0 (no reward)

**Caps:**
- Max per match: 1000 MONARD
- Daily per wallet: 5000 MONARD
`;
