# MCP Server for Battle Royale Web3 Game

Production-ready MCP (Match Control Protocol) server with anti-farming validation.

## Anti-Farming Protection

This server protects your token economy by validating every match:

| Rule | What It Catches |
|------|-----------------|
| **Impossible Duration** | Matches ending faster than physically possible |
| **Zero Input Variance** | Bots with perfectly timed inputs |
| **Win Streak Detection** | 10+ consecutive wins flagged |
| **Excessive Win Rate** | >85% win rate in 24h |
| **Rapid Matches** | Multiple matches per minute |
| **Kill Speed Check** | More kills than time allows |
| **Frame/Tick Anomalies** | Modified game clients |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Game)                           │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Edge Functions (MCP Server)                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  match-submit   │  │  reward-grant   │  │    health       │  │
│  │  + Validation   │  │  + Contract     │  │                 │  │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────┘  │
│           │                    │                                 │
│           ▼                    ▼                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                 Match Validation Layer                       ││
│  │  • Duration checks (min/max by player count)                 ││
│  │  • Input variance analysis (bot detection)                   ││
│  │  • Win pattern analysis (streak/rate detection)              ││
│  │  • Kill speed validation                                     ││
│  │  • Frame/tick rate verification                              ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Security Layer                            ││
│  │  • Replay Prevention (Nonce tracking)                        ││
│  │  • Rate Limiting (30 req/min per wallet)                     ││
│  │  • Daily Caps (50 matches, 5000 MONARD)                      ││
│  │  • Match Uniqueness                                          ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Supabase Database                           │
│  • mcp_nonces (replay prevention)                                │
│  • mcp_rate_limits (rate limiting)                               │
│  • mcp_daily_usage (daily caps)                                  │
│  • mcp_processed_matches (match uniqueness + pattern analysis)   │
│  • mcp_audit_log (security audit trail)                          │
└─────────────────────────────────────────────────────────────────┘

## Endpoints

### POST /mcp-match-submit

Validates match results and calculates rewards.

**Request:**
```json
{
  "walletAddress": "0x1234...abcd",
  "matchId": "uuid-v4",
  "placement": 1,
  "playerCount": 5,
  "durationMs": 120000,
  "kills": 3,
  "nonce": "64-char-hex-nonce",
  "timestamp": 1707408000000,
  "clientSignature": "hmac-sha256",
  "antiCheat": {
    "inputHash": "abc123...",
    "frameCount": 7200,
    "avgTickRate": 60,
    "suspiciousFlags": [],
    "inputTimingVariance": 150,
    "movementHash": "def456..."
  }
}
```

**Response (Allowed):**
```json
{
  "success": true,
  "data": {
    "allowed": true,
    "matchId": "uuid-v4",
    "placement": 1,
    "playerCount": 5,
    "calculatedReward": 65,
    "reasonCode": "VALID",
    "reasonMessage": "Match validated successfully",
    "riskScore": 10,
    "validationFlags": [],
    "rewardBreakdown": {
      "base": 25,
      "placement": 25,
      "kills": 15,
      "survival": 4,
      "penalties": 0,
      "final": 65
    },
    "securityChecks": [
      { "name": "REPLAY_PREVENTION", "passed": true, "details": "Nonce is fresh" },
      { "name": "RATE_LIMIT", "passed": true, "details": "Rate limit OK: 5/30" }
    ]
  }
}
```

**Response (Rejected):**
```json
{
  "success": true,
  "data": {
    "allowed": false,
    "matchId": "uuid-v4",
    "placement": 1,
    "playerCount": 5,
    "calculatedReward": 0,
    "reasonCode": "ZERO_INPUT_VARIANCE",
    "reasonMessage": "Automated input detected (zero timing variance)",
    "riskScore": 100,
    "validationFlags": [
      { "code": "ZERO_INPUT_VARIANCE", "severity": "critical", "message": "Input timing variance 3ms indicates automation" }
    ]
  }
}
```

### POST /mcp-reward-grant

Calls RewardController contract to mint tokens.

**Request:**
```json
{
  "walletAddress": "0x1234...abcd",
  "matchId": "uuid-v4",
  "rewardAmount": 65,
  "placement": 1,
  "playerCount": 5,
  "nonce": "64-char-hex-nonce",
  "timestamp": 1707408000000,
  "serverSignature": "hmac-sha256-from-match-submit"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "matchId": "uuid-v4",
    "walletAddress": "0x1234...abcd",
    "rewardAmount": 65,
    "txHash": "0xabc123...",
    "blockNumber": 12345678
  }
}
```

## Security Features

### 1. Replay Attack Prevention
- Every request requires a unique 64-character nonce
- Nonces are stored in database and expire after 5 minutes
- Concurrent replay attempts are detected via unique constraint

### 2. Rate Limiting
- 30 requests per wallet per minute
- Database-backed for consistency across function instances
- Automatic cleanup of old entries

### 3. Daily Caps
- **Match Cap:** 50 matches per wallet per day
- **Reward Cap:** 5000 MONARD per wallet per day
- Resets at midnight UTC

### 4. Match Uniqueness
- Each matchId can only be processed once
- Prevents double-rewarding from client bugs or attacks

### 5. Bot Detection
- Input timing variance analysis
- Frame count vs duration validation
- Tick rate anomaly detection
- Client-side suspicious flag reporting

### 6. Signature Verification
- Client signatures verified via HMAC-SHA256
- Server signatures for reward-grant endpoint
- Constant-time comparison to prevent timing attacks

## Environment Variables

Required secrets for production:

```bash
# Supabase (auto-provided)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Blockchain
BLOCKCHAIN_RPC_URL=https://polygon-rpc.com
BLOCKCHAIN_CHAIN_ID=137
REWARD_CONTROLLER_ADDRESS=0x...
MCP_PRIVATE_KEY=0x...

# Security
MCP_SIGNING_SECRET=your-256-bit-secret
```

## Database Setup

Run the SQL in `docs/MCP_SECURITY_TABLES.sql` to create:
- `mcp_nonces` - Replay prevention
- `mcp_rate_limits` - Rate limiting
- `mcp_daily_usage` - Daily caps
- `mcp_processed_matches` - Match uniqueness
- `mcp_audit_log` - Security audit trail

## Reward Formula

```
Total = (Base × Placement + Kills + Survival) × AntiCheat

Base Reward:
  - 2 players: 10 MONARD
  - 3 players: 15 MONARD
  - 5 players: 25 MONARD

Placement Multiplier:
  - 1st: ×2.0
  - 2nd: ×1.0
  - 3rd: ×0.5
  - 4th: ×0.25
  - 5th: ×0.1

Kill Bonus: +5 MONARD per kill
Survival: +2 MONARD per minute (max 20)

AntiCheat Modifier:
  - Passed: ×1.0
  - Suspicious: ×0.5
  - Failed: ×0.0
```

## Reason Codes (Validation)

| Code | Description |
|------|-------------|
| `VALID` | Match passed all validation checks |
| `DURATION_TOO_SHORT` | Match ended faster than physically possible |
| `DURATION_TOO_LONG` | Match exceeded maximum allowed duration |
| `DURATION_IMPOSSIBLE` | Actions performed faster than possible |
| `ZERO_INPUT_VARIANCE` | Input timing indicates automated play (bot) |
| `LOW_INPUT_VARIANCE` | Input timing suspiciously consistent |
| `SUSPICIOUS_WIN_STREAK` | Improbable consecutive win count (10+) |
| `EXCESSIVE_WIN_RATE` | Win rate exceeds 85% in 24h |
| `RAPID_MATCHES` | Matches submitted faster than possible to play |
| `FRAME_COUNT_MISMATCH` | Frame count inconsistent with duration |
| `TICK_RATE_ANOMALY` | Game tick rate outside normal range |
| `KILL_COUNT_IMPOSSIBLE` | Kill count exceeds available opponents |
| `PLACEMENT_INVALID` | Placement outside valid range |
| `BOT_DETECTED` | Multiple indicators suggest automated play |

## Error Codes (Security)

| Code | Description |
|------|-------------|
| `INVALID_SIGNATURE` | Server signature verification failed |
| `SECURITY_CHECK_FAILED` | One or more security checks failed |
| `MATCH_ALREADY_REWARDED` | Match has already been processed |
| `EXCEEDS_DAILY_CAP` | Daily reward/match limit reached |
| `EXCEEDS_MATCH_CAP` | Per-match reward cap exceeded |
| `CONTRACT_PAUSED` | Smart contract is paused |
| `RATE_LIMITED` | Too many requests |
| `REPLAY_DETECTED` | Nonce already used |

## Validation Thresholds

```typescript
// Duration limits (milliseconds) by player count
DURATION = {
  2: { min: 10000, max: 180000 },  // 10s - 3min
  3: { min: 15000, max: 240000 },  // 15s - 4min
  5: { min: 20000, max: 300000 },  // 20s - 5min
}

// Input variance (milliseconds)
INPUT_VARIANCE = {
  ZERO_THRESHOLD: 5,    // Below = definite bot (REJECT)
  LOW_THRESHOLD: 30,    // Below = suspicious (+35 risk)
  NORMAL_MIN: 50,       // Human minimum
  NORMAL_MAX: 500,      // Human maximum
}

// Win patterns
WIN_PATTERNS = {
  MAX_CONSECUTIVE_WINS: 10,  // Flag after 10 wins
  MAX_WIN_RATE_24H: 0.85,    // 85% win rate suspicious
  RAPID_MATCH_WINDOW: 60s,   // Too fast between matches
}

// Risk score thresholds
RISK = {
  ALLOW: < 50,     // Match allowed
  FLAG: 50-75,     // Allowed but flagged
  REJECT: > 75,    // Match rejected
}
```

## Local Development

Edge functions are automatically deployed with the Lovable preview. Test using:

```typescript
import { supabase } from '@/integrations/supabase/client';

const { data, error } = await supabase.functions.invoke('mcp-match-submit', {
  body: { /* payload */ }
});
```

## Production Checklist

- [ ] Set all environment variables in Supabase Dashboard
- [ ] Run database migration for security tables
- [ ] Deploy RewardController.sol to Polygon
- [ ] Configure MCP address in contract
- [ ] Set up monitoring/alerting for audit logs
- [ ] Schedule cleanup functions (cron job)
