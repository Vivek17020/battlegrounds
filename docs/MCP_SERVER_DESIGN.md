# MCP Server Design - Battle Royale Game

## Overview

The MCP (Middleware Control Point) Server is the **sole trusted authority** for reward distribution. It sits between the game client and the blockchain, verifying match integrity before minting MONARD tokens.

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Game      │      │    MCP      │      │  Blockchain │
│   Client    │ ──▶  │   Server    │ ──▶  │  (Rewards)  │
└─────────────┘      └─────────────┘      └─────────────┘
                            │
                     ┌──────┴──────┐
                     │  Database   │
                     │  (Sessions) │
                     └─────────────┘
```

---

## Security Model

### Trust Hierarchy

| Component | Trust Level | Can Mint Rewards? |
|-----------|-------------|-------------------|
| MCP Server | **Trusted** | ✅ Yes (sole authority) |
| Game Client | Untrusted | ❌ No |
| Smart Contract | Trusted | Only via MCP signature |
| Database | Internal | N/A |

### Core Security Assumptions

1. **MCP is the ONLY reward caller** - Smart contract only accepts calls from MCP server wallet
2. **All client data is untrusted** - Every field must be validated against server state
3. **Wallet ownership verified** - Signature required to prove address ownership
4. **Rate limiting enforced** - Per-wallet and global limits prevent abuse
5. **Audit trail mandatory** - Every reward decision is logged immutably

---

## API Routes

### Route 1: `POST /mcp-match-start`

Registers a new match session before gameplay begins.

**Purpose:** Create trusted match record that client cannot forge.

**Request:**
```typescript
{
  walletAddress: string;      // Player's wallet (0x...)
  walletSignature: string;    // Signed message proving ownership
  playerCount: 2 | 3 | 5;     // Match size
  timestamp: number;          // Client timestamp
}
```

**Response:**
```typescript
{
  success: boolean;
  matchId: string;            // Server-generated UUID
  sessionToken: string;       // Short-lived token for this match
  expiresAt: number;          // Session expiry (match must end before)
  serverTimestamp: number;    // Server time for sync
}
```

**Validation Steps:**
1. ✅ Verify `walletSignature` proves ownership of `walletAddress`
2. ✅ Check wallet is not banned
3. ✅ Verify player hasn't exceeded daily match cap (50)
4. ✅ Check cooldown (30s since last match end)
5. ✅ Validate `playerCount` is 2, 3, or 5
6. ✅ Generate unique `matchId` (UUID v4)
7. ✅ Create session record in database
8. ✅ Return session token (expires in 10 minutes)

---

### Route 2: `POST /mcp-match-submit`

Submits match results for validation and reward calculation.

**Purpose:** Validate match outcome and trigger reward minting.

**Request:**
```typescript
{
  matchId: string;            // From match-start response
  sessionToken: string;       // Proves this client started the match
  walletAddress: string;      // Must match start request
  placement: number;          // Final placement (1 = winner)
  playerCount: number;        // Must match registered count
  durationMs: number;         // Match duration in ms
  kills: number;              // Eliminations
  antiCheat: {
    inputHash: string;        // Hash of input patterns
    frameCount: number;       // Total frames rendered
    avgTickRate: number;      // Should be ~60
    inputTimingVariance: number;
    movementHash: string;
    suspiciousFlags: string[];
  };
  clientSignature: string;    // HMAC of payload
}
```

**Response:**
```typescript
{
  success: boolean;
  reward: {
    eligible: boolean;
    amount: number;           // MONARD tokens
    breakdown: {
      prizePool: number;
      placementPercent: number;
      baseReward: number;
      durationBonus: number;
    };
    txHash?: string;          // Blockchain TX if minted
  };
  validation: {
    matchValid: boolean;
    durationValid: boolean;
    placementValid: boolean;
    antiCheatPassed: boolean;
    dailyCapRemaining: number;
  };
  rejectionReason?: string;
}
```

**Validation Steps:**

| Step | Check | Action on Fail |
|------|-------|----------------|
| 1 | `matchId` exists in database | Reject: INVALID_MATCH |
| 2 | `sessionToken` matches stored token | Reject: INVALID_SESSION |
| 3 | Session not expired | Reject: SESSION_EXPIRED |
| 4 | `walletAddress` matches session | Reject: WALLET_MISMATCH |
| 5 | Match not already submitted | Reject: DUPLICATE_SUBMISSION |
| 6 | `playerCount` matches session | Reject: PLAYER_COUNT_MISMATCH |
| 7 | `placement` ≤ `playerCount` | Reject: INVALID_PLACEMENT |
| 8 | `durationMs` ≥ 60,000 | Reject: MATCH_TOO_SHORT |
| 9 | `durationMs` ≤ 300,000 | Reject: MATCH_TOO_LONG |
| 10 | Server duration within ±5s of client | Reject: DURATION_MISMATCH |
| 11 | `kills` ≤ `playerCount - 1` | Reject: INVALID_KILLS |
| 12 | Anti-cheat signals pass thresholds | Flag or Reject |
| 13 | Daily reward cap not exceeded | Reward: 0 (still valid) |
| 14 | Cooldown respected | Reject: COOLDOWN_ACTIVE |

---

### Route 3: `GET /mcp-player-stats`

Returns player's reward history and limits.

**Request Headers:**
```
Authorization: Bearer <walletSignature>
X-Wallet-Address: 0x...
```

**Response:**
```typescript
{
  wallet: string;
  today: {
    matchesPlayed: number;
    rewardsEarned: number;
    rewardsCap: number;
    matchesCap: number;
    nextMatchAllowedAt: number;
  };
  allTime: {
    totalMatches: number;
    totalRewards: number;
    wins: number;
    avgPlacement: number;
  };
  tier: {
    name: string;
    points: number;
    nextTier: string;
    pointsToNext: number;
  };
}
```

**Validation Steps:**
1. ✅ Verify wallet signature
2. ✅ Query player stats from database
3. ✅ Calculate daily stats (UTC reset)
4. ✅ Return aggregated data

---

### Route 4: `GET /mcp-health`

Health check endpoint for monitoring.

**Response:**
```typescript
{
  status: "healthy" | "degraded" | "down";
  timestamp: number;
  checks: {
    database: boolean;
    blockchain: boolean;
    rateLimit: boolean;
  };
}
```

---

## Reward Calculation Formula

Based on `docs/REWARD_FORMULA.md`:

```typescript
// Prize splits by player count
const PRIZE_SPLITS = {
  2: [0.70, 0.30],
  3: [0.60, 0.30, 0.10],
  5: [0.50, 0.25, 0.15, 0.07, 0.03],
};

const ENTRY_FEE = 10; // MONARD per player

function calculateReward(placement, playerCount, durationMs) {
  // Validation
  if (durationMs < 60000) return { eligible: false, reason: "MATCH_TOO_SHORT" };
  if (placement > playerCount) return { eligible: false, reason: "INVALID_PLACEMENT" };
  
  // Calculate
  const prizePool = ENTRY_FEE * playerCount;
  const placementPercent = PRIZE_SPLITS[playerCount][placement - 1];
  const baseReward = prizePool * placementPercent;
  const durationBonus = Math.min((durationMs / 60000) * 0.5, 2.0);
  
  return {
    eligible: true,
    amount: Math.round((baseReward + durationBonus) * 100) / 100,
    breakdown: { prizePool, placementPercent, baseReward, durationBonus }
  };
}
```

### Example Outputs

| Match | Placement | Duration | Reward |
|-------|-----------|----------|--------|
| 2-player | 1st | 90s | 14.75 MONARD |
| 2-player | 2nd | 90s | 6.75 MONARD |
| 3-player | 1st | 2m | 19.00 MONARD |
| 3-player | 2nd | 2m | 10.00 MONARD |
| 5-player | 1st | 3m | 26.50 MONARD |
| 5-player | 5th | 3m | 3.00 MONARD |

---

## Match Submit Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    MATCH SUBMIT FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. RECEIVE PAYLOAD                                             │
│     │                                                           │
│     ▼                                                           │
│  2. VALIDATE SESSION                                            │
│     ├── Match exists? ──────────────── NO ──▶ REJECT            │
│     ├── Token valid? ───────────────── NO ──▶ REJECT            │
│     ├── Not expired? ───────────────── NO ──▶ REJECT            │
│     └── Not duplicate? ─────────────── NO ──▶ REJECT            │
│     │                                                           │
│     ▼                                                           │
│  3. VALIDATE MATCH DATA                                         │
│     ├── Duration ≥ 60s? ────────────── NO ──▶ REJECT            │
│     ├── Placement valid? ───────────── NO ──▶ REJECT            │
│     ├── Duration matches server? ───── NO ──▶ REJECT            │
│     └── Kills ≤ playerCount - 1? ───── NO ──▶ REJECT            │
│     │                                                           │
│     ▼                                                           │
│  4. ANTI-CHEAT ANALYSIS                                         │
│     ├── Tick rate 55-65? ───────────── NO ──▶ FLAG              │
│     ├── Input variance > 50ms? ─────── NO ──▶ FLAG              │
│     ├── Frame count reasonable? ────── NO ──▶ FLAG              │
│     └── No suspicious flags? ───────── NO ──▶ FLAG/REJECT       │
│     │                                                           │
│     ▼                                                           │
│  5. CHECK DAILY LIMITS                                          │
│     ├── Matches < 50/day? ──────────── NO ──▶ NO REWARD         │
│     ├── Rewards < 500/day? ─────────── NO ──▶ NO REWARD         │
│     └── Apply diminishing returns after 20 matches              │
│     │                                                           │
│     ▼                                                           │
│  6. CALCULATE REWARD                                            │
│     │  prizePool = ENTRY_FEE × playerCount                      │
│     │  baseReward = prizePool × PRIZE_SPLIT[placement]          │
│     │  durationBonus = min(durationMinutes × 0.5, 2.0)          │
│     │  reward = (baseReward + durationBonus) × diminishingFactor│
│     │                                                           │
│     ▼                                                           │
│  7. MINT REWARD (if eligible & amount > 0)                      │
│     │  Call smart contract with MCP server wallet               │
│     │  Wait for TX confirmation                                 │
│     │                                                           │
│     ▼                                                           │
│  8. LOG & RESPOND                                               │
│     │  Write to audit log                                       │
│     │  Update player stats                                      │
│     │  Return result to client                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Table: `match_sessions`

```sql
CREATE TABLE match_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID UNIQUE NOT NULL,
  wallet_address TEXT NOT NULL,
  player_count INTEGER NOT NULL CHECK (player_count IN (2, 3, 5)),
  session_token TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'submitted', 'expired', 'rejected')),
  
  -- Result fields (null until submitted)
  placement INTEGER,
  duration_ms INTEGER,
  kills INTEGER,
  reward_amount DECIMAL(18, 4),
  tx_hash TEXT,
  
  -- Anti-cheat
  risk_score INTEGER,
  flagged BOOLEAN DEFAULT FALSE,
  
  CONSTRAINT valid_placement CHECK (placement IS NULL OR placement <= player_count)
);

CREATE INDEX idx_match_sessions_wallet ON match_sessions(wallet_address);
CREATE INDEX idx_match_sessions_status ON match_sessions(status);
```

### Table: `daily_player_stats`

```sql
CREATE TABLE daily_player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  matches_played INTEGER DEFAULT 0,
  rewards_earned DECIMAL(18, 4) DEFAULT 0,
  last_match_at TIMESTAMPTZ,
  
  UNIQUE(wallet_address, date)
);
```

### Table: `reward_audit_log`

```sql
CREATE TABLE reward_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL,
  wallet_address TEXT NOT NULL,
  action TEXT NOT NULL, -- 'REWARD', 'REJECT', 'FLAG'
  amount DECIMAL(18, 4),
  reason TEXT,
  tx_hash TEXT,
  request_payload JSONB,
  validation_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Rate Limiting

| Limit Type | Value | Window |
|------------|-------|--------|
| Match starts per wallet | 60 | 1 hour |
| Match submits per wallet | 60 | 1 hour |
| Global match starts | 1000 | 1 minute |
| Failed attempts per wallet | 10 | 15 minutes |

After exceeding failed attempts: 15-minute cooldown.

---

## Anti-Cheat Thresholds

| Signal | Valid Range | Action if Invalid |
|--------|-------------|-------------------|
| `avgTickRate` | 55-65 | Flag for review |
| `inputTimingVariance` | > 50ms | Flag if < 50ms (bot-like) |
| `frameCount` | 100-100,000 | Reject if outside |
| `suspiciousFlags.length` | 0-5 | Reject if > 5 |

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `INVALID_MATCH` | 404 | Match ID not found |
| `INVALID_SESSION` | 401 | Session token mismatch |
| `SESSION_EXPIRED` | 410 | Session past expiry time |
| `WALLET_MISMATCH` | 403 | Wallet doesn't match session |
| `DUPLICATE_SUBMISSION` | 409 | Match already submitted |
| `MATCH_TOO_SHORT` | 400 | Duration < 60 seconds |
| `MATCH_TOO_LONG` | 400 | Duration > 5 minutes |
| `INVALID_PLACEMENT` | 400 | Placement > player count |
| `INVALID_KILLS` | 400 | Kills > player count - 1 |
| `DAILY_CAP_EXCEEDED` | 429 | Daily reward limit hit |
| `COOLDOWN_ACTIVE` | 429 | Must wait before next match |
| `RATE_LIMITED` | 429 | Too many requests |
| `BANNED` | 403 | Wallet is banned |
| `ANTI_CHEAT_FAILED` | 403 | Suspicious activity detected |

---

## Security Checklist

### Request Validation
- [ ] All inputs validated with Zod schemas
- [ ] Wallet addresses validated (0x + 40 hex chars)
- [ ] UUIDs validated format
- [ ] Numeric bounds checked
- [ ] String lengths limited

### Authentication
- [ ] Wallet signature verified for protected routes
- [ ] Session tokens are short-lived (10 min)
- [ ] Tokens are single-use (invalidated after submit)

### Anti-Abuse
- [ ] Rate limiting per wallet and global
- [ ] Daily caps enforced server-side
- [ ] Cooldown between matches
- [ ] Duplicate submission prevention

### Blockchain Security
- [ ] Only MCP server wallet can call mint function
- [ ] Server wallet private key in secure env variable
- [ ] Transaction signing happens server-side only

---

## File Structure

```
supabase/functions/
├── _shared/
│   ├── cors.ts              # CORS headers
│   ├── mcp-types.ts         # Type definitions
│   ├── mcp-validation.ts    # Input validation
│   └── mcp-security.ts      # Security checks
├── mcp-match-start/
│   └── index.ts             # Register new match
├── mcp-match-submit/
│   └── index.ts             # Submit match results
├── mcp-player-stats/
│   └── index.ts             # Get player stats
└── mcp-health/
    └── index.ts             # Health check
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-08 | Initial generic MCP design |
| 2.0.0 | 2026-02-08 | Battle Royale specific: match sessions, reward formula, daily caps |
