// ============================================
// AI AGENT — PUBLIC API
// Entry point for game → AI communication
// ============================================

export { makeDecision } from "./decision-engine";
export { detectBot } from "./bot-detector";
export type {
  AIInputData,
  AIOutputDecision,
  BotFlag,
  BehaviorProfile,
} from "./types";

// ─────────────────────────────────────────────
// EXAMPLE USAGE & DECISION FLOW
// ─────────────────────────────────────────────

/**
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    AI AGENT DECISION FLOW                       │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * STEP 1: Frontend collects player data
 * ──────────────────────────────────────
 * const inputData: AIInputData = {
 *   playerAddress: "0x1234...",
 *   sessionId: "session_abc123",
 *   score: 1500,
 *   totalClicks: 200,
 *   sessionDuration: 120,
 *   roundsPlayed: 5,
 *   wins: 4,
 *   losses: 1,
 *   clickTimestamps: [...last50Clicks],
 *   avgClickInterval: 180,
 *   clickIntervalVariance: 45,
 *   comboMax: 12,
 *   comboCurrent: 0,
 *   avgComboLength: 6,
 *   lifetimeSessions: 15,
 *   lifetimeScore: 25000,
 *   previousDifficulty: 1.0,
 *   previousRewardMultiplier: 1.2,
 * };
 *
 * STEP 2: Send to AI Agent
 * ────────────────────────
 * const decision = makeDecision(inputData);
 *
 * STEP 3: AI returns decision
 * ───────────────────────────
 * // decision = {
 * //   playerAddress: "0x1234...",
 * //   sessionId: "session_abc123",
 * //   timestamp: 1699999999999,
 * //   difficultyMultiplier: 1.5,
 * //   rewardMultiplier: 1.8,
 * //   nextTargetHP: 75,
 * //   botDetection: {
 * //     isSuspicious: false,
 * //     confidence: 0.12,
 * //     flags: []
 * //   },
 * //   action: "REWARD",
 * //   rewardAmount: 2.70,
 * //   message: "Impressive skill detected. Raising the stakes.",
 * //   difficulty: "HARD"
 * // }
 *
 * STEP 4: Forward to MCP Server
 * ─────────────────────────────
 * // POST /mcp/execute
 * // Body: decision
 * //
 * // MCP validates:
 * //   - rewardAmount within allowed range
 * //   - playerAddress is valid
 * //   - action is authorized
 * //
 * // MCP executes:
 * //   - Signs mint transaction
 * //   - Submits to blockchain
 * //   - Returns TX hash
 *
 * STEP 5: Frontend updates
 * ────────────────────────
 * // - Apply new difficulty
 * // - Update reward multiplier display
 * // - Show AI message
 * // - Update MONARD balance when TX confirms
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                     BOT DETECTION EXAMPLE                       │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * // Bot-like input:
 * const suspiciousInput: AIInputData = {
 *   ...normalInput,
 *   avgClickInterval: 40,        // 25 clicks/sec (inhuman)
 *   clickIntervalVariance: 3,    // perfectly consistent (robotic)
 *   comboMax: 150,               // impossible combo length
 * };
 *
 * const decision = makeDecision(suspiciousInput);
 * // decision.action === "BAN"
 * // decision.rewardAmount === 0
 * // decision.botDetection.flags === ["INHUMAN_SPEED", "ZERO_VARIANCE", "IMPOSSIBLE_COMBO"]
 * // decision.botDetection.confidence === 0.95
 *
 */
