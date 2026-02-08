// ============================================
// MCP SERVER — MATCH VALIDATION MODULE
// Anti-farming rules and match integrity checks
// ============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
export interface MatchInput {
  walletAddress: string;
  matchId: string;
  placement: number;
  playerCount: 2 | 3 | 5;
  durationMs: number;
  kills: number;
  antiCheat: {
    inputTimingVariance: number;
    frameCount: number;
    avgTickRate: number;
    suspiciousFlags: string[];
  };
}

export interface ValidationResult {
  allowed: boolean;
  reasonCode: ReasonCode;
  reasonMessage: string;
  riskScore: number;
  flags: ValidationFlag[];
}

export interface ValidationFlag {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export type ReasonCode =
  | 'VALID'
  | 'DURATION_TOO_SHORT'
  | 'DURATION_TOO_LONG'
  | 'DURATION_IMPOSSIBLE'
  | 'ZERO_INPUT_VARIANCE'
  | 'LOW_INPUT_VARIANCE'
  | 'SUSPICIOUS_WIN_STREAK'
  | 'EXCESSIVE_WIN_RATE'
  | 'RAPID_MATCHES'
  | 'FRAME_COUNT_MISMATCH'
  | 'TICK_RATE_ANOMALY'
  | 'KILL_COUNT_IMPOSSIBLE'
  | 'PLACEMENT_INVALID'
  | 'BOT_DETECTED';

// ─────────────────────────────────────────────
// VALIDATION CONSTANTS
// ─────────────────────────────────────────────
const VALIDATION_CONFIG = {
  // Duration limits by player count (in ms)
  DURATION: {
    2: { min: 10000, max: 180000, typical: { min: 20000, max: 120000 } },
    3: { min: 15000, max: 240000, typical: { min: 30000, max: 150000 } },
    5: { min: 20000, max: 300000, typical: { min: 45000, max: 200000 } },
  } as Record<number, { min: number; max: number; typical: { min: number; max: number } }>,

  // Minimum time per kill (ms) - can't kill faster than this
  MIN_TIME_PER_KILL: 3000,

  // Input timing variance thresholds
  INPUT_VARIANCE: {
    ZERO_THRESHOLD: 5,      // Below this = definite bot
    LOW_THRESHOLD: 30,      // Below this = suspicious
    NORMAL_MIN: 50,         // Normal human minimum
    NORMAL_MAX: 500,        // Normal human maximum
  },

  // Win pattern thresholds
  WIN_PATTERNS: {
    MAX_CONSECUTIVE_WINS: 10,     // Flag after 10 wins in a row
    MAX_WIN_RATE_24H: 0.85,       // 85% win rate in 24h is suspicious
    MIN_MATCHES_FOR_RATE: 5,      // Need at least 5 matches to calc rate
    RAPID_MATCH_WINDOW_MS: 60000, // 1 minute between matches is suspicious
    MAX_RAPID_MATCHES: 3,         // 3 rapid matches triggers flag
  },

  // Frame/tick validation
  EXPECTED_TICK_RATE: 60,
  TICK_RATE_TOLERANCE: 0.3, // 30% tolerance

  // Risk score thresholds
  RISK_THRESHOLDS: {
    ALLOW: 50,      // Below 50 = allow
    FLAG: 75,       // 50-75 = allow but flag
    REJECT: 100,    // Above 75 = reject
  },
};

// ─────────────────────────────────────────────
// MAIN VALIDATION FUNCTION
// ─────────────────────────────────────────────
export async function validateMatch(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  input: MatchInput
): Promise<ValidationResult> {
  const flags: ValidationFlag[] = [];
  let riskScore = 0;

  // ── 1. Duration Validation ──
  const durationResult = validateDuration(input);
  flags.push(...durationResult.flags);
  riskScore += durationResult.riskScore;

  if (durationResult.reject) {
    return {
      allowed: false,
      reasonCode: durationResult.reasonCode!,
      reasonMessage: durationResult.message,
      riskScore: 100,
      flags,
    };
  }

  // ── 2. Input Variance Validation (Bot Detection) ──
  const varianceResult = validateInputVariance(input);
  flags.push(...varianceResult.flags);
  riskScore += varianceResult.riskScore;

  if (varianceResult.reject) {
    return {
      allowed: false,
      reasonCode: varianceResult.reasonCode!,
      reasonMessage: varianceResult.message,
      riskScore: 100,
      flags,
    };
  }

  // ── 3. Kill Count Validation ──
  const killResult = validateKillCount(input);
  flags.push(...killResult.flags);
  riskScore += killResult.riskScore;

  if (killResult.reject) {
    return {
      allowed: false,
      reasonCode: killResult.reasonCode!,
      reasonMessage: killResult.message,
      riskScore: 100,
      flags,
    };
  }

  // ── 4. Frame/Tick Rate Validation ──
  const frameResult = validateFrameData(input);
  flags.push(...frameResult.flags);
  riskScore += frameResult.riskScore;

  // ── 5. Win Pattern Analysis (Database) ──
  const winPatternResult = await analyzeWinPatterns(supabase, input);
  flags.push(...winPatternResult.flags);
  riskScore += winPatternResult.riskScore;

  if (winPatternResult.reject) {
    return {
      allowed: false,
      reasonCode: winPatternResult.reasonCode!,
      reasonMessage: winPatternResult.message,
      riskScore: 100,
      flags,
    };
  }

  // ── 6. Rapid Match Detection ──
  const rapidResult = await detectRapidMatches(supabase, input);
  flags.push(...rapidResult.flags);
  riskScore += rapidResult.riskScore;

  // ── Final Decision ──
  riskScore = Math.min(100, riskScore);

  if (riskScore >= VALIDATION_CONFIG.RISK_THRESHOLDS.REJECT) {
    return {
      allowed: false,
      reasonCode: 'BOT_DETECTED',
      reasonMessage: 'Match rejected due to suspicious activity patterns',
      riskScore,
      flags,
    };
  }

  return {
    allowed: true,
    reasonCode: 'VALID',
    reasonMessage: riskScore >= VALIDATION_CONFIG.RISK_THRESHOLDS.FLAG
      ? 'Match allowed but flagged for review'
      : 'Match validated successfully',
    riskScore,
    flags,
  };
}

// ─────────────────────────────────────────────
// DURATION VALIDATION
// ─────────────────────────────────────────────
interface CheckResult {
  flags: ValidationFlag[];
  riskScore: number;
  reject: boolean;
  reasonCode?: ReasonCode;
  message: string;
}

function validateDuration(input: MatchInput): CheckResult {
  const flags: ValidationFlag[] = [];
  let riskScore = 0;
  const config = VALIDATION_CONFIG.DURATION[input.playerCount];

  if (!config) {
    return {
      flags: [{ code: 'INVALID_PLAYER_COUNT', severity: 'critical', message: `Invalid player count: ${input.playerCount}` }],
      riskScore: 100,
      reject: true,
      reasonCode: 'PLACEMENT_INVALID',
      message: 'Invalid player count',
    };
  }

  // Hard limits - reject immediately
  if (input.durationMs < config.min) {
    return {
      flags: [{ 
        code: 'DURATION_TOO_SHORT', 
        severity: 'critical', 
        message: `Duration ${input.durationMs}ms below minimum ${config.min}ms for ${input.playerCount} players` 
      }],
      riskScore: 100,
      reject: true,
      reasonCode: 'DURATION_TOO_SHORT',
      message: `Match duration impossibly short (${Math.round(input.durationMs / 1000)}s)`,
    };
  }

  if (input.durationMs > config.max) {
    return {
      flags: [{ 
        code: 'DURATION_TOO_LONG', 
        severity: 'critical', 
        message: `Duration ${input.durationMs}ms exceeds maximum ${config.max}ms` 
      }],
      riskScore: 100,
      reject: true,
      reasonCode: 'DURATION_TOO_LONG',
      message: `Match duration exceeds maximum (${Math.round(input.durationMs / 1000)}s)`,
    };
  }

  // Check if 1st place with kills finished impossibly fast
  if (input.placement === 1 && input.kills > 0) {
    const minPossibleDuration = input.kills * VALIDATION_CONFIG.MIN_TIME_PER_KILL;
    if (input.durationMs < minPossibleDuration) {
      return {
        flags: [{ 
          code: 'DURATION_IMPOSSIBLE', 
          severity: 'critical', 
          message: `${input.kills} kills in ${input.durationMs}ms is impossible (min ${minPossibleDuration}ms)` 
        }],
        riskScore: 100,
        reject: true,
        reasonCode: 'DURATION_IMPOSSIBLE',
        message: `Kill speed impossibly fast`,
      };
    }
  }

  // Soft limits - flag but allow
  if (input.durationMs < config.typical.min) {
    flags.push({
      code: 'DURATION_UNUSUALLY_SHORT',
      severity: 'warning',
      message: `Duration ${input.durationMs}ms is unusually short`,
    });
    riskScore += 15;
  }

  if (input.durationMs > config.typical.max) {
    flags.push({
      code: 'DURATION_UNUSUALLY_LONG',
      severity: 'info',
      message: `Duration ${input.durationMs}ms is longer than typical`,
    });
    riskScore += 5;
  }

  return { flags, riskScore, reject: false, message: 'Duration valid' };
}

// ─────────────────────────────────────────────
// INPUT VARIANCE VALIDATION (Bot Detection)
// ─────────────────────────────────────────────
function validateInputVariance(input: MatchInput): CheckResult {
  const flags: ValidationFlag[] = [];
  let riskScore = 0;
  const variance = input.antiCheat.inputTimingVariance;
  const config = VALIDATION_CONFIG.INPUT_VARIANCE;

  // Zero or near-zero variance = definite bot
  if (variance <= config.ZERO_THRESHOLD) {
    return {
      flags: [{ 
        code: 'ZERO_INPUT_VARIANCE', 
        severity: 'critical', 
        message: `Input timing variance ${variance}ms indicates automation` 
      }],
      riskScore: 100,
      reject: true,
      reasonCode: 'ZERO_INPUT_VARIANCE',
      message: 'Automated input detected (zero timing variance)',
    };
  }

  // Low variance = suspicious
  if (variance <= config.LOW_THRESHOLD) {
    flags.push({
      code: 'LOW_INPUT_VARIANCE',
      severity: 'warning',
      message: `Input timing variance ${variance}ms is suspiciously consistent`,
    });
    riskScore += 35;

    // If also 1st place, more suspicious
    if (input.placement === 1) {
      riskScore += 15;
      flags.push({
        code: 'LOW_VARIANCE_WINNER',
        severity: 'warning',
        message: 'Low variance combined with 1st place finish',
      });
    }
  }

  // Abnormally high variance could indicate lag switching
  if (variance > config.NORMAL_MAX) {
    flags.push({
      code: 'HIGH_INPUT_VARIANCE',
      severity: 'info',
      message: `Input timing variance ${variance}ms is unusually high`,
    });
    riskScore += 10;
  }

  return { flags, riskScore, reject: false, message: 'Input variance acceptable' };
}

// ─────────────────────────────────────────────
// KILL COUNT VALIDATION
// ─────────────────────────────────────────────
function validateKillCount(input: MatchInput): CheckResult {
  const flags: ValidationFlag[] = [];
  let riskScore = 0;

  // Can't have more kills than other players
  if (input.kills >= input.playerCount) {
    return {
      flags: [{ 
        code: 'KILL_COUNT_IMPOSSIBLE', 
        severity: 'critical', 
        message: `${input.kills} kills impossible with ${input.playerCount} players` 
      }],
      riskScore: 100,
      reject: true,
      reasonCode: 'KILL_COUNT_IMPOSSIBLE',
      message: 'Kill count exceeds possible opponents',
    };
  }

  // Can't have kills if not in top positions (simplified rule)
  if (input.kills > 0 && input.placement === input.playerCount) {
    flags.push({
      code: 'KILLS_AS_LAST_PLACE',
      severity: 'warning',
      message: `${input.kills} kills but finished last place`,
    });
    riskScore += 10;
  }

  // Perfect game (1st with all kills) in short time is suspicious
  if (input.placement === 1 && input.kills === input.playerCount - 1) {
    flags.push({
      code: 'PERFECT_GAME',
      severity: 'info',
      message: 'Perfect game (1st place, all kills)',
    });
    riskScore += 10;

    // Extra suspicious if very fast
    const typicalMin = VALIDATION_CONFIG.DURATION[input.playerCount]?.typical.min || 30000;
    if (input.durationMs < typicalMin) {
      riskScore += 20;
      flags.push({
        code: 'FAST_PERFECT_GAME',
        severity: 'warning',
        message: 'Perfect game completed unusually fast',
      });
    }
  }

  return { flags, riskScore, reject: false, message: 'Kill count valid' };
}

// ─────────────────────────────────────────────
// FRAME/TICK RATE VALIDATION
// ─────────────────────────────────────────────
function validateFrameData(input: MatchInput): CheckResult {
  const flags: ValidationFlag[] = [];
  let riskScore = 0;

  const expectedTicks = VALIDATION_CONFIG.EXPECTED_TICK_RATE;
  const tolerance = VALIDATION_CONFIG.TICK_RATE_TOLERANCE;
  const minTick = expectedTicks * (1 - tolerance);
  const maxTick = expectedTicks * (1 + tolerance);

  // Tick rate outside normal range
  if (input.antiCheat.avgTickRate < minTick || input.antiCheat.avgTickRate > maxTick) {
    flags.push({
      code: 'TICK_RATE_ANOMALY',
      severity: 'warning',
      message: `Tick rate ${input.antiCheat.avgTickRate} outside expected range ${minTick}-${maxTick}`,
    });
    riskScore += 15;
  }

  // Frame count should roughly match duration * tick rate
  const expectedFrames = (input.durationMs / 1000) * expectedTicks;
  const frameRatio = input.antiCheat.frameCount / expectedFrames;

  if (frameRatio < 0.5 || frameRatio > 2.0) {
    flags.push({
      code: 'FRAME_COUNT_MISMATCH',
      severity: 'warning',
      message: `Frame count ${input.antiCheat.frameCount} doesn't match duration (expected ~${Math.round(expectedFrames)})`,
    });
    riskScore += 20;
  }

  // Client-reported suspicious flags
  if (input.antiCheat.suspiciousFlags.length > 0) {
    flags.push({
      code: 'CLIENT_SUSPICIOUS_FLAGS',
      severity: 'warning',
      message: `Client reported: ${input.antiCheat.suspiciousFlags.join(', ')}`,
    });
    riskScore += input.antiCheat.suspiciousFlags.length * 10;
  }

  return { flags, riskScore, reject: false, message: 'Frame data acceptable' };
}

// ─────────────────────────────────────────────
// WIN PATTERN ANALYSIS (Database)
// ─────────────────────────────────────────────
async function analyzeWinPatterns(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  input: MatchInput
): Promise<CheckResult> {
  const flags: ValidationFlag[] = [];
  let riskScore = 0;

  try {
    // Get recent matches for this wallet (last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: recentMatches, error } = await supabase
      .from('mcp_processed_matches')
      .select('placement, processed_at')
      .eq('wallet_address', input.walletAddress)
      .gte('processed_at', twentyFourHoursAgo)
      .order('processed_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[VALIDATION] Failed to fetch recent matches:', error);
      // Fail open but log
      return { flags, riskScore: 0, reject: false, message: 'Could not analyze patterns' };
    }

    if (!recentMatches || recentMatches.length < VALIDATION_CONFIG.WIN_PATTERNS.MIN_MATCHES_FOR_RATE) {
      return { flags, riskScore: 0, reject: false, message: 'Insufficient history' };
    }

    // Calculate win rate
    const wins = recentMatches.filter((m: { placement: number }) => m.placement === 1).length;
    const winRate = wins / recentMatches.length;

    if (winRate > VALIDATION_CONFIG.WIN_PATTERNS.MAX_WIN_RATE_24H) {
      flags.push({
        code: 'EXCESSIVE_WIN_RATE',
        severity: 'warning',
        message: `Win rate ${(winRate * 100).toFixed(0)}% in last 24h (${wins}/${recentMatches.length})`,
      });
      riskScore += 25;
    }

    // Check for consecutive wins (if this match is also a win)
    if (input.placement === 1) {
      let consecutiveWins = 0;
      for (const match of recentMatches) {
        if (match.placement === 1) {
          consecutiveWins++;
        } else {
          break;
        }
      }

      // Add current match
      consecutiveWins++;

      if (consecutiveWins >= VALIDATION_CONFIG.WIN_PATTERNS.MAX_CONSECUTIVE_WINS) {
        flags.push({
          code: 'SUSPICIOUS_WIN_STREAK',
          severity: 'warning',
          message: `${consecutiveWins} consecutive wins`,
        });
        riskScore += 30;

        // Extreme streak = reject
        if (consecutiveWins >= VALIDATION_CONFIG.WIN_PATTERNS.MAX_CONSECUTIVE_WINS * 2) {
          return {
            flags,
            riskScore: 100,
            reject: true,
            reasonCode: 'SUSPICIOUS_WIN_STREAK',
            message: `Impossible win streak (${consecutiveWins} in a row)`,
          };
        }
      }
    }

  } catch (err) {
    console.error('[VALIDATION] Win pattern analysis error:', err);
  }

  return { flags, riskScore, reject: false, message: 'Win patterns acceptable' };
}

// ─────────────────────────────────────────────
// RAPID MATCH DETECTION
// ─────────────────────────────────────────────
async function detectRapidMatches(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  input: MatchInput
): Promise<CheckResult> {
  const flags: ValidationFlag[] = [];
  let riskScore = 0;

  try {
    const windowStart = new Date(
      Date.now() - VALIDATION_CONFIG.WIN_PATTERNS.RAPID_MATCH_WINDOW_MS * 5
    ).toISOString();

    const { data: recentMatches, error } = await supabase
      .from('mcp_processed_matches')
      .select('processed_at')
      .eq('wallet_address', input.walletAddress)
      .gte('processed_at', windowStart)
      .order('processed_at', { ascending: false })
      .limit(10);

    if (error || !recentMatches) {
      return { flags, riskScore: 0, reject: false, message: 'Could not check rapid matches' };
    }

    // Count matches within rapid window
    const rapidWindow = VALIDATION_CONFIG.WIN_PATTERNS.RAPID_MATCH_WINDOW_MS;
    let rapidCount = 0;
    const now = Date.now();

    for (const match of recentMatches) {
      const matchTime = new Date(match.processed_at).getTime();
      if (now - matchTime < rapidWindow) {
        rapidCount++;
      }
    }

    if (rapidCount >= VALIDATION_CONFIG.WIN_PATTERNS.MAX_RAPID_MATCHES) {
      flags.push({
        code: 'RAPID_MATCHES',
        severity: 'warning',
        message: `${rapidCount} matches in last ${Math.round(rapidWindow / 1000)}s`,
      });
      riskScore += 20;
    }

  } catch (err) {
    console.error('[VALIDATION] Rapid match detection error:', err);
  }

  return { flags, riskScore, reject: false, message: 'Match frequency acceptable' };
}

// ─────────────────────────────────────────────
// REASON CODE DESCRIPTIONS
// ─────────────────────────────────────────────
export const REASON_CODE_DESCRIPTIONS: Record<ReasonCode, string> = {
  VALID: 'Match passed all validation checks',
  DURATION_TOO_SHORT: 'Match ended faster than physically possible',
  DURATION_TOO_LONG: 'Match exceeded maximum allowed duration',
  DURATION_IMPOSSIBLE: 'Actions performed faster than possible',
  ZERO_INPUT_VARIANCE: 'Input timing indicates automated play',
  LOW_INPUT_VARIANCE: 'Input timing suspiciously consistent',
  SUSPICIOUS_WIN_STREAK: 'Improbable consecutive win count',
  EXCESSIVE_WIN_RATE: 'Win rate exceeds statistical probability',
  RAPID_MATCHES: 'Matches submitted faster than possible to play',
  FRAME_COUNT_MISMATCH: 'Frame count inconsistent with duration',
  TICK_RATE_ANOMALY: 'Game tick rate outside normal range',
  KILL_COUNT_IMPOSSIBLE: 'Kill count exceeds available opponents',
  PLACEMENT_INVALID: 'Placement outside valid range',
  BOT_DETECTED: 'Multiple indicators suggest automated play',
};
