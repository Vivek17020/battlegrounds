# MONARD Token Economy - Battle Royale MVP

## Overview

This document defines the deterministic reward rules for the MONARD Battle Royale game. All values are designed for MCP verification and anti-farming protection.

---

## Core Constants

```typescript
// Base rewards (in MONARD tokens)
const BASE_REWARD = 5;                    // Base reward per valid match
const KILL_REWARD = 2;                    // Bonus per elimination

// Match requirements
const MIN_MATCH_DURATION_MS = 60_000;     // 60 seconds minimum
const MIN_SURVIVAL_PERCENT = 0.25;        // Must survive 25% of match duration
const MATCH_COOLDOWN_MS = 30_000;         // 30 seconds between matches

// Daily limits (per wallet)
const DAILY_REWARD_CAP = 500;             // Max MONARD per day
const DAILY_MATCH_CAP = 50;               // Max rewarded matches per day

// Per-match limits
const MAX_REWARD_PER_MATCH = 50;          // Hard cap per single match
```

---

## Placement Multipliers

Multipliers scale with player count to ensure fair rewards across match sizes.

### 2-Player Matches (1v1)
| Placement | Multiplier | Max Base Reward |
|-----------|------------|-----------------|
| 1st       | 1.5x       | 7.5 MONARD      |
| 2nd       | 0.5x       | 2.5 MONARD      |

### 3-Player Matches
| Placement | Multiplier | Max Base Reward |
|-----------|------------|-----------------|
| 1st       | 2.0x       | 10 MONARD       |
| 2nd       | 1.0x       | 5 MONARD        |
| 3rd       | 0.3x       | 1.5 MONARD      |

### 5-Player Matches
| Placement | Multiplier | Max Base Reward |
|-----------|------------|-----------------|
| 1st       | 3.0x       | 15 MONARD       |
| 2nd       | 1.5x       | 7.5 MONARD      |
| 3rd       | 1.0x       | 5 MONARD        |
| 4th       | 0.5x       | 2.5 MONARD      |
| 5th       | 0.2x       | 1 MONARD        |

---

## Reward Formula

```
TOTAL_REWARD = min(
  (BASE_REWARD × PLACEMENT_MULTIPLIER) + (KILLS × KILL_REWARD),
  MAX_REWARD_PER_MATCH
)
```

### Example Calculations

**Scenario 1:** 5-player match, 1st place, 3 kills
```
= (5 × 3.0) + (3 × 2) = 15 + 6 = 21 MONARD
```

**Scenario 2:** 3-player match, 2nd place, 1 kill
```
= (5 × 1.0) + (1 × 2) = 5 + 2 = 7 MONARD
```

**Scenario 3:** 5-player match, 1st place, 4 kills (hits cap)
```
= (5 × 3.0) + (4 × 2) = 15 + 8 = 23 MONARD (capped at 50)
```

---

## Anti-Farming Rules

### 1. Minimum Match Duration
- Match must last ≥ 60 seconds
- Reward = 0 if match ends early (all players quit)

### 2. Minimum Survival Time
- Player must survive ≥ 25% of total match duration
- Prevents "die immediately, restart" farming

### 3. Match Cooldown
- 30-second cooldown between match rewards per wallet
- Matches during cooldown: participation tracked, reward = 0

### 4. Daily Diminishing Returns
After threshold matches, rewards decrease:

| Matches Today | Reward Modifier |
|---------------|-----------------|
| 1-20          | 100%            |
| 21-35         | 50%             |
| 36-50         | 25%             |
| 51+           | 0% (cap reached)|

### 5. Suspicious Pattern Detection
MCP flags wallets for review if:
- Win rate > 80% over 10+ matches
- Average match duration < 90 seconds
- Input timing variance < 50ms (bot-like)

---

## MCP Verification Checkpoints

The MCP endpoint verifies each reward claim:

```typescript
interface RewardValidation {
  // MUST PASS (server-verified)
  matchIdValid: boolean;           // Match exists in session registry
  walletVerified: boolean;         // Signature proves ownership
  durationValid: boolean;          // >= MIN_MATCH_DURATION_MS
  survivalValid: boolean;          // >= MIN_SURVIVAL_PERCENT
  cooldownRespected: boolean;      // >= MATCH_COOLDOWN_MS since last
  dailyCapNotExceeded: boolean;    // < DAILY_REWARD_CAP
  
  // SOFT CHECKS (flags for review)
  antiCheatPassed: boolean;        // No suspicious patterns
  placementValid: boolean;         // placement <= playerCount
  killsValid: boolean;             // kills <= playerCount - 1
}
```

### Rejection Reasons
| Code | Reason | Action |
|------|--------|--------|
| `E001` | Match duration too short | No reward |
| `E002` | Survival time insufficient | No reward |
| `E003` | Cooldown not respected | No reward |
| `E004` | Daily cap exceeded | No reward |
| `E005` | Invalid match ID | No reward, flag wallet |
| `E006` | Signature verification failed | No reward, flag wallet |
| `E007` | Impossible kill count | No reward, flag wallet |

---

## Deterministic Reward Calculation (TypeScript)

```typescript
export interface RewardInput {
  playerCount: 2 | 3 | 5;
  placement: number;
  kills: number;
  matchDurationMs: number;
  survivalTimeMs: number;
  matchesToday: number;
  rewardsToday: number;
  lastMatchTimestamp: number;
  currentTimestamp: number;
}

export interface RewardOutput {
  eligible: boolean;
  baseReward: number;
  killBonus: number;
  multiplier: number;
  diminishingFactor: number;
  finalReward: number;
  rejectionCode?: string;
}

const PLACEMENT_MULTIPLIERS: Record<number, number[]> = {
  2: [1.5, 0.5],
  3: [2.0, 1.0, 0.3],
  5: [3.0, 1.5, 1.0, 0.5, 0.2],
};

export function calculateReward(input: RewardInput): RewardOutput {
  const {
    playerCount,
    placement,
    kills,
    matchDurationMs,
    survivalTimeMs,
    matchesToday,
    rewardsToday,
    lastMatchTimestamp,
    currentTimestamp,
  } = input;

  // Validation checks
  if (matchDurationMs < 60_000) {
    return { eligible: false, baseReward: 0, killBonus: 0, multiplier: 0, diminishingFactor: 0, finalReward: 0, rejectionCode: 'E001' };
  }

  const survivalPercent = survivalTimeMs / matchDurationMs;
  if (survivalPercent < 0.25) {
    return { eligible: false, baseReward: 0, killBonus: 0, multiplier: 0, diminishingFactor: 0, finalReward: 0, rejectionCode: 'E002' };
  }

  if (currentTimestamp - lastMatchTimestamp < 30_000) {
    return { eligible: false, baseReward: 0, killBonus: 0, multiplier: 0, diminishingFactor: 0, finalReward: 0, rejectionCode: 'E003' };
  }

  if (rewardsToday >= 500) {
    return { eligible: false, baseReward: 0, killBonus: 0, multiplier: 0, diminishingFactor: 0, finalReward: 0, rejectionCode: 'E004' };
  }

  // Calculate base components
  const multipliers = PLACEMENT_MULTIPLIERS[playerCount];
  const multiplier = multipliers[placement - 1] ?? 0;
  const baseReward = 5 * multiplier;
  const killBonus = Math.min(kills, playerCount - 1) * 2;

  // Apply diminishing returns
  let diminishingFactor = 1.0;
  if (matchesToday >= 36) diminishingFactor = 0.25;
  else if (matchesToday >= 21) diminishingFactor = 0.5;

  // Calculate final reward
  const rawReward = (baseReward + killBonus) * diminishingFactor;
  const finalReward = Math.min(Math.round(rawReward * 100) / 100, 50);

  return {
    eligible: true,
    baseReward,
    killBonus,
    multiplier,
    diminishingFactor,
    finalReward,
  };
}
```

---

## Summary Table

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Base Reward | 5 MONARD | Low enough to require effort |
| Kill Bonus | 2 MONARD/kill | Rewards aggression |
| Min Duration | 60s | Prevents instant farming |
| Min Survival | 25% | Must participate meaningfully |
| Cooldown | 30s | Rate limits restarts |
| Daily Cap | 500 MONARD | ~10 hours max grinding |
| Match Cap | 50/day | Reasonable session length |
| Max/Match | 50 MONARD | Prevents outlier exploits |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-08 | Initial token economy design |
