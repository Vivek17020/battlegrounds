// ============================================
// AI AGENT — TYPE DEFINITIONS
// ============================================

/**
 * INPUT: Player session data sent to AI Agent
 * Collected by frontend, forwarded for analysis
 */
export interface AIInputData {
  // Player identity
  playerAddress: string;
  sessionId: string;

  // Performance metrics
  score: number;
  totalClicks: number;
  sessionDuration: number; // seconds
  roundsPlayed: number;
  wins: number;
  losses: number;

  // Timing analysis (for bot detection)
  clickTimestamps: number[]; // last 50 clicks
  avgClickInterval: number; // ms between clicks
  clickIntervalVariance: number; // std deviation

  // Combo & skill
  comboMax: number;
  comboCurrent: number;
  avgComboLength: number;

  // Historical (if available)
  lifetimeSessions: number;
  lifetimeScore: number;
  previousDifficulty: number;
  previousRewardMultiplier: number;
}

/**
 * OUTPUT: AI decision sent to MCP Server
 * MCP validates and executes on-chain actions
 */
export interface AIOutputDecision {
  // Routing
  playerAddress: string;
  sessionId: string;
  timestamp: number;

  // Core adjustments
  difficultyMultiplier: number; // 0.5 – 3.0
  rewardMultiplier: number; // 0.5 – 2.5
  nextTargetHP: number; // 25 – 200

  // Bot detection result
  botDetection: {
    isSuspicious: boolean;
    confidence: number; // 0.0 – 1.0
    flags: BotFlag[];
  };

  // Action recommendation for MCP
  action: "CONTINUE" | "REWARD" | "PENALIZE" | "FLAG_FOR_REVIEW" | "BAN";
  rewardAmount: number; // MONARD tokens to mint (0 if penalized)

  // Player feedback
  message: string;
  difficulty: "EASY" | "NORMAL" | "HARD" | "EXTREME";
}

/**
 * Bot detection flags
 */
export type BotFlag =
  | "INHUMAN_SPEED" // clicks faster than 20/sec sustained
  | "ZERO_VARIANCE" // perfectly timed clicks (robotic)
  | "IMPOSSIBLE_COMBO" // combo chains that exceed human limits
  | "SESSION_SPAM" // too many sessions in short period
  | "PATTERN_DETECTED"; // repetitive click patterns

/**
 * Internal: Player behavior profile
 */
export interface BehaviorProfile {
  speedTier: "SLOW" | "AVERAGE" | "FAST" | "INHUMAN";
  consistencyScore: number; // 0-1, higher = more robotic
  skillLevel: "NOVICE" | "INTERMEDIATE" | "SKILLED" | "EXPERT";
  engagementLevel: "LOW" | "MEDIUM" | "HIGH";
}
