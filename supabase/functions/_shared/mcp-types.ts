// ============================================
// MCP SERVER — TYPE DEFINITIONS
// Shared types for all MCP endpoints
// ============================================

// ─────────────────────────────────────────────
// INCOMING: AI Agent Decision
// ─────────────────────────────────────────────
export interface AIDecisionPayload {
  playerAddress: string;
  sessionId: string;
  timestamp: number;

  difficultyMultiplier: number;
  rewardMultiplier: number;
  nextTargetHP: number;

  botDetection: {
    isSuspicious: boolean;
    confidence: number;
    flags: string[];
  };

  action: "CONTINUE" | "REWARD" | "PENALIZE" | "FLAG_FOR_REVIEW" | "BAN";
  rewardAmount: number;
  message: string;
  difficulty: "EASY" | "NORMAL" | "HARD" | "EXTREME";
}

// ─────────────────────────────────────────────
// INCOMING: Game Session Data
// ─────────────────────────────────────────────
export interface GameSessionPayload {
  sessionId: string;
  playerAddress: string;
  score: number;
  totalClicks: number;
  sessionDuration: number;
  roundsPlayed: number;
  wins: number;
  losses: number;
  comboMax: number;
  clickTimestamps: number[];
  clientSignature: string; // HMAC of session data
  clientTimestamp: number;
}

// ─────────────────────────────────────────────
// OUTGOING: MCP Response
// ─────────────────────────────────────────────
export interface MCPResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta: {
    requestId: string;
    timestamp: number;
    processingTimeMs: number;
  };
}

// ─────────────────────────────────────────────
// TRANSACTION RESULT
// ─────────────────────────────────────────────
export interface TransactionResult {
  txHash: string;
  status: "pending" | "confirmed" | "failed";
  action: string;
  amount: number;
  recipient: string;
  blockNumber?: number;
}

// ─────────────────────────────────────────────
// VALIDATION RESULT
// ─────────────────────────────────────────────
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─────────────────────────────────────────────
// SECURITY CHECK RESULT
// ─────────────────────────────────────────────
export interface SecurityCheckResult {
  passed: boolean;
  checks: {
    name: string;
    passed: boolean;
    details?: string;
  }[];
  riskScore: number; // 0-100
}

// ─────────────────────────────────────────────
// NONCE TRACKING (Replay Prevention)
// ─────────────────────────────────────────────
export interface NonceRecord {
  sessionId: string;
  nonce: string;
  usedAt: number;
  playerAddress: string;
}

// ─────────────────────────────────────────────
// RATE LIMIT CONFIG
// ─────────────────────────────────────────────
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  bypassKey?: string;
}

// ─────────────────────────────────────────────
// AUDIT LOG ENTRY
// ─────────────────────────────────────────────
export interface AuditLogEntry {
  id: string;
  timestamp: number;
  action: string;
  playerAddress: string;
  sessionId: string;
  requestPayload: unknown;
  responseStatus: "success" | "rejected" | "error";
  securityChecks: SecurityCheckResult;
  txHash?: string;
}
