# In-Game Token Swap Flow — Design Document

## Principle

The player never leaves the game. Swapping feels like a native game action, not a DeFi operation. Complexity is hidden behind a single confirmation step.

---

## User Experience

```
┌─────────────────────────────────────────────────┐
│  GAME HUD                                       │
│  ┌───────────┐  ┌───────────┐                   │
│  │ 💰 1,240  │  │ Ξ 0.082   │                   │
│  │  MONARD   │  │   ETH     │                   │
│  └───────────┘  └───────────┘                   │
│                                                 │
│          [ 🔄 Swap ]  ← always visible          │
│                                                 │
└─────────────────────────────────────────────────┘

         ↓  Player taps Swap

┌─────────────────────────────────────────────────┐
│  SWAP PANEL (slides up from bottom)             │
│                                                 │
│  You send                                       │
│  ┌──────────────────────────────────┐           │
│  │  250          ▼ MONARD           │           │
│  └──────────────────────────────────┘           │
│         ↕  (tap to reverse direction)           │
│  You receive (estimate)                         │
│  ┌──────────────────────────────────┐           │
│  │  ≈ 0.0041     ▼ ETH             │           │
│  └──────────────────────────────────┘           │
│                                                 │
│  Rate: 1 MONARD = 0.0000164 ETH                │
│  Fee: 0.3%  ·  Slippage: 0.5%                  │
│                                                 │
│  ┌─────────────────────────────────────┐        │
│  │         Confirm Swap                │        │
│  └─────────────────────────────────────┘        │
│                                                 │
│  [ Cancel ]                                     │
└─────────────────────────────────────────────────┘
```

**Key UX decisions:**
- Only two tokens exist (MONARD ↔ ETH) — no token picker needed
- Amount input auto-quotes the output in real-time (debounced 300ms)
- Single "Confirm" button triggers wallet signature + execution
- Panel overlays the game without navigating away
- Swap history accessible via a small "Recent" link

---

## Step-by-Step Flow

### Happy Path

```
 Player              Frontend            MCP Server           Contracts
   │                    │                    │                    │
   │  1. Tap "Swap"     │                    │                    │
   │───────────────────▶│                    │                    │
   │                    │                    │                    │
   │  2. Enter amount   │                    │                    │
   │───────────────────▶│                    │                    │
   │                    │  3. GET quote      │                    │
   │                    │───────────────────▶│                    │
   │                    │                    │  4. Read reserves  │
   │                    │                    │───────────────────▶│
   │                    │                    │◀───────────────────│
   │                    │  5. Return quote   │                    │
   │                    │◀───────────────────│                    │
   │                    │                    │                    │
   │  6. See estimate   │                    │                    │
   │◀───────────────────│                    │                    │
   │                    │                    │                    │
   │  7. Tap "Confirm"  │                    │                    │
   │───────────────────▶│                    │                    │
   │                    │  8. Wallet sign    │                    │
   │  9. Sign in wallet │◀───────────────────│                    │
   │───────────────────▶│                    │                    │
   │                    │  10. POST swap     │                    │
   │                    │───────────────────▶│                    │
   │                    │                    │  11. Validate      │
   │                    │                    │  12. Execute swap  │
   │                    │                    │───────────────────▶│
   │                    │                    │◀───────────────────│
   │                    │  13. Return txHash │                    │
   │                    │◀───────────────────│                    │
   │                    │                    │                    │
   │  14. Show success  │                    │                    │
   │◀───────────────────│                    │                    │
   │                    │                    │                    │
   │  15. Update HUD    │                    │                    │
   │◀───────────────────│                    │                    │
```

---

## Detailed Steps

### Step 1–2: Player Opens Swap Panel

- Player taps the `🔄 Swap` button on the game HUD
- Swap panel slides up (bottom sheet on mobile, side panel on desktop)
- Default direction: MONARD → ETH
- Input field auto-focused, numeric keyboard on mobile

### Step 3–5: Real-Time Quote

**Frontend → MCP:**
```
POST /mcp-swap-quote
{
  "playerAddress": "0x1234...abcd",
  "sessionId": "session_170999...",
  "inputToken": "MONARD",
  "outputToken": "WETH",
  "inputAmount": 250,
  "timestamp": 1699999999999
}
```

**MCP actions:**
1. Validate player address and session
2. Read pool reserves from `MonardPool.getReserves()`
3. Calculate output using constant-product formula:
   ```
   outputAmount = (inputAmount × 997 × reserveOut) / (reserveIn × 1000 + inputAmount × 997)
   ```
4. Calculate price impact: `inputAmount / reserveIn × 100`
5. Return quote with 15-second expiry

**MCP → Frontend:**
```json
{
  "success": true,
  "data": {
    "inputAmount": 250,
    "outputAmount": 0.00410,
    "inputToken": "MONARD",
    "outputToken": "WETH",
    "rate": 0.0000164,
    "priceImpact": 0.02,
    "fee": 0.75,
    "minOutput": 0.004079,
    "quoteId": "quote_abc123",
    "expiresAt": 1700000014999
  }
}
```

**Debouncing:** Frontend debounces input by 300ms to avoid spamming quotes.

### Step 6: Display Quote

UI shows:
| Field | Value | Notes |
|-------|-------|-------|
| Output estimate | ≈ 0.0041 ETH | Large, prominent |
| Exchange rate | 1 MONARD = 0.0000164 ETH | Below output |
| Fee | 0.75 MONARD (0.3%) | Subtle text |
| Price impact | 0.02% | Green if < 1%, yellow if 1-5%, red if > 5% |
| Min. received | 0.004079 ETH | Accounts for 0.5% slippage |

**Price impact warnings:**
- `< 1%` → No warning (green)
- `1% – 5%` → Yellow badge: "Moderate price impact"
- `5% – 15%` → Orange badge: "High price impact — you may receive significantly less"
- `> 15%` → Red badge + confirmation dialog: "Extreme price impact. Are you sure?"

### Step 7–9: Confirm & Sign

1. Player taps **"Confirm Swap"**
2. Frontend constructs the swap transaction:
   - If MONARD → ETH: calls `SwapRouter.swapExactTokensForETH()`
   - If ETH → MONARD: calls `SwapRouter.swapExactETHForTokens()`
3. If selling MONARD, check allowance first:
   - If `allowance < inputAmount` → prompt `approve(router, amount)` before swap
   - Use `type(uint256).max` approval to avoid repeat approvals
4. Wallet popup appears (MetaMask / WalletConnect)
5. Player signs the transaction

**Approval UX:**
```
First-time only:
┌─────────────────────────────────────────┐
│  Allow MONARD trading?                  │
│                                         │
│  This is a one-time approval to let     │
│  the swap contract use your MONARD.     │
│                                         │
│  [ Approve in Wallet ]                  │
└─────────────────────────────────────────┘
     ↓ after approval succeeds
┌─────────────────────────────────────────┐
│  ✓ Approved! Now confirm your swap.     │
│                                         │
│  [ Confirm Swap ]                       │
└─────────────────────────────────────────┘
```

### Step 10–12: MCP Validation & Execution

**Frontend → MCP:**
```
POST /mcp-swap-execute
Headers:
  x-mcp-nonce: <unique>
  x-mcp-quote-id: quote_abc123

{
  "playerAddress": "0x1234...abcd",
  "sessionId": "session_170999...",
  "inputToken": "MONARD",
  "outputToken": "WETH",
  "inputAmount": 250,
  "minOutputAmount": 0.004079,
  "quoteId": "quote_abc123",
  "signedTxData": "0x...",
  "deadline": 1700000114999,
  "timestamp": 1699999999999
}
```

**MCP validation checklist:**

| # | Check | Reject If |
|---|-------|-----------|
| 1 | Quote still valid | `now > quote.expiresAt` |
| 2 | Quote ID not reused | `usedQuotes[quoteId] === true` |
| 3 | Player not banned | `RewardVault.isBanned(player)` |
| 4 | Nonce not replayed | `usedNonces[nonce] === true` |
| 5 | Rate limit | `> 10 swaps/minute` from same address |
| 6 | Amount sanity | `inputAmount <= 0` or `> player balance` |
| 7 | Slippage bounds | `minOutput < 0` or unreasonable |
| 8 | Session valid | Session ID doesn't match active session |
| 9 | Deadline valid | `deadline < now` or `deadline > now + 5min` |

**On pass:** MCP relays the signed transaction to the blockchain via `SwapRouter`.

### Step 13–15: Success & HUD Update

**MCP → Frontend:**
```json
{
  "success": true,
  "data": {
    "txHash": "0xabc...def",
    "status": "pending",
    "inputAmount": 250,
    "outputAmount": 0.00412,
    "inputToken": "MONARD",
    "outputToken": "WETH"
  },
  "meta": {
    "requestId": "req_xyz",
    "timestamp": 1699999999999,
    "processingTimeMs": 340
  }
}
```

**Frontend actions:**
1. Show success toast with confetti micro-animation:
   ```
   ✅ Swapped 250 MONARD → 0.0041 ETH
   ```
2. Close swap panel with slide-down animation
3. Update HUD balances (optimistic, then confirm on-chain)
4. Add entry to swap history
5. Poll for tx confirmation (show ⏳ spinner on balance until confirmed)

---

## Error Handling

### User-Facing Errors

| Error | User Sees | Recovery |
|-------|-----------|----------|
| Quote expired | "Price updated. Please review the new quote." | Auto-refresh quote |
| Insufficient balance | "Not enough MONARD. You have 120." | Disable confirm, show balance |
| High slippage | "Price moved too much. Try a smaller amount." | Suggest smaller amount |
| Wallet rejected | "Transaction cancelled." | Re-enable confirm button |
| Network error | "Connection lost. Retrying..." | Auto-retry 3× with backoff |
| MCP validation fail | "Swap could not be verified. Please try again." | Reset form |
| TX reverted | "Swap failed on-chain. No tokens were lost." | Show retry button |
| Rate limited | "Too many swaps. Please wait 30 seconds." | Show countdown timer |
| Player banned | "Your account is restricted. Contact support." | Hide swap button |
| Pool depleted | "Not enough liquidity for this swap." | Suggest smaller amount |

### Retry Strategy

```
Attempt 1 → immediate
Attempt 2 → wait 1s
Attempt 3 → wait 3s
Give up   → show "Something went wrong. Try again later."
```

Only retry on network/timeout errors. Never retry on validation or on-chain failures.

### Stale Quote Recovery

```
Player enters amount
    ↓
Quote returned (valid 15s)
    ↓
Player hesitates... 20s pass
    ↓
Player taps "Confirm"
    ↓
Frontend detects quote expired
    ↓
Auto-fetch new quote
    ↓
If new output differs > 1% from old:
  → Show: "Price changed. New estimate: X ETH. Continue?"
  → [Accept New Price] / [Cancel]
    ↓
If difference ≤ 1%:
  → Silently use new quote, proceed to wallet sign
```

---

## MCP Endpoint: `/mcp-swap-quote`

| Field | Type | Description |
|-------|------|-------------|
| `playerAddress` | string | 0x-prefixed Ethereum address |
| `sessionId` | string | Active game session ID |
| `inputToken` | `"MONARD"` \| `"WETH"` | Token being sold |
| `outputToken` | `"MONARD"` \| `"WETH"` | Token being bought |
| `inputAmount` | number | Amount of input token |
| `timestamp` | number | Client timestamp (drift check) |

**Response:**
```typescript
{
  inputAmount: number;
  outputAmount: number;
  inputToken: string;
  outputToken: string;
  rate: number;           // price per unit
  priceImpact: number;    // percentage
  fee: number;            // in input token
  minOutput: number;      // after slippage tolerance
  quoteId: string;        // unique, single-use
  expiresAt: number;      // unix ms
}
```

## MCP Endpoint: `/mcp-swap-execute`

| Field | Type | Description |
|-------|------|-------------|
| `playerAddress` | string | Must match quote |
| `sessionId` | string | Must match active session |
| `inputToken` | string | Must match quote |
| `outputToken` | string | Must match quote |
| `inputAmount` | number | Must match quote |
| `minOutputAmount` | number | Slippage-protected minimum |
| `quoteId` | string | From quote response |
| `signedTxData` | string | Signed transaction bytes |
| `deadline` | number | Max block.timestamp for execution |
| `timestamp` | number | Client timestamp |

---

## State Machine

The swap panel operates as a finite state machine:

```
                  ┌──────────┐
                  │  CLOSED  │
                  └────┬─────┘
                       │ open
                  ┌────▼─────┐
            ┌─────│  INPUT   │◀──────────────┐
            │     └────┬─────┘               │
            │          │ amount entered       │ edit
            │     ┌────▼─────┐               │
            │     │ QUOTING  │───────────────▶│
            │     └────┬─────┘  error         │
            │          │ quote received       │
            │     ┌────▼─────┐               │
            │     │ QUOTED   │───────────────▶│
            │     └────┬─────┘  expired       │
            │          │ confirm              │
            │     ┌────▼─────┐               │
            │     │ APPROVING│ (if needed)    │
            │     └────┬─────┘               │
            │          │ approved             │
            │     ┌────▼─────┐               │
            │     │ SIGNING  │───────────────▶│
            │     └────┬─────┘  rejected      │
            │          │ signed               │
            │     ┌────▼──────┐              │
            │     │ EXECUTING │              │
            │     └────┬──────┘              │
            │          │                     │
            │    ┌─────┴─────┐               │
            │    ▼           ▼               │
            │ ┌──────┐  ┌────────┐           │
            │ │ DONE │  │ FAILED │───────────┘
            │ └──┬───┘  └────────┘  retry
            │    │
     close  │    │ auto-close 3s
            │    │
            ▼    ▼
         ┌──────────┐
         │  CLOSED  │
         └──────────┘
```

---

## Frontend Component Structure

```
SwapPanel/
├── SwapPanel.tsx           ← container, state machine
├── SwapInput.tsx           ← amount input + token label
├── SwapQuoteDisplay.tsx    ← rate, fee, impact, min output
├── SwapConfirmButton.tsx   ← dynamic label based on state
├── SwapStatusToast.tsx     ← success/error notifications
├── SwapHistory.tsx         ← recent swaps list
└── useSwapFlow.ts          ← hook: quote fetching, state, execution
```

---

## Accessibility & Mobile

- Swap panel is a bottom sheet on viewports < 768px
- All interactive elements meet 44×44px minimum tap target
- Quote refresh has `aria-live="polite"` for screen readers
- Loading states use skeleton placeholders, not spinners
- Error messages associated with inputs via `aria-describedby`
- Escape key / swipe-down closes the panel
- Amount input uses `inputmode="decimal"` for numeric keyboard

---

## Analytics Events

| Event | When | Data |
|-------|------|------|
| `swap_panel_opened` | Panel opens | `sessionId` |
| `swap_quote_requested` | Quote fetched | `inputToken, inputAmount` |
| `swap_confirmed` | Player taps confirm | `quoteId, inputAmount, outputAmount` |
| `swap_signed` | Wallet signature complete | `quoteId` |
| `swap_success` | TX confirmed | `txHash, inputAmount, outputAmount` |
| `swap_failed` | Any failure | `error, stage` |
| `swap_cancelled` | Player closes panel | `stage` (where they dropped off) |
