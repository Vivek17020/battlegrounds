# Smart Contract System — MVP Design

## Overview

Four contracts form the on-chain layer of the MONARD ecosystem. The MCP server is the **sole trusted caller** for minting and reward operations; all other interactions (swaps, liquidity) are permissionless.

```
┌──────────────┐
│  MCP Server  │─── only caller with MINTER_ROLE
└──────┬───────┘
       │
       ▼
┌──────────────┐    mint()     ┌──────────────┐
│ RewardVault  │──────────────▶│ MonardToken   │
│ (Gateway)    │               │ (ERC-20)      │
└──────────────┘               └──────┬────────┘
                                      │
                              approve / transfer
                                      │
                               ┌──────▼────────┐
                               │ MonardPool     │
                               │ (AMM x*y=k)   │
                               └──────┬────────┘
                                      │
                               ┌──────▼────────┐
                               │ SwapRouter     │
                               │ (User-facing)  │
                               └───────────────┘
```

---

## 1. MonardToken (ERC-20)

**Purpose:** The MONARD token — fungible, mintable only by authorized contracts.

| Function | Visibility | Purpose |
|----------|-----------|---------|
| `constructor(name, symbol, admin)` | — | Sets name="MONARD", symbol="MNRD", grants DEFAULT_ADMIN_ROLE |
| `mint(to, amount)` | external | Mint tokens; restricted to `MINTER_ROLE` |
| `burn(amount)` | external | Holder burns own tokens |
| `transfer / approve / transferFrom` | public | Standard ERC-20 (inherited) |
| `cap()` | view | Returns max supply (1 billion) |

**Access Control:**

| Role | Holder | Can Do |
|------|--------|--------|
| `DEFAULT_ADMIN_ROLE` | Deployer (multisig) | Grant/revoke roles |
| `MINTER_ROLE` | RewardVault contract only | Call `mint()` |

**Constraints:**
- Hard cap: `1_000_000_000 * 10^18`
- `mint()` reverts if cap exceeded
- No owner-minting backdoor — admin cannot mint directly
- Inherits OpenZeppelin `ERC20`, `ERC20Capped`, `AccessControl`

---

## 2. RewardVault (Reward Gateway)

**Purpose:** Single entry point for all game rewards. Only the MCP server can call it. It calls `MonardToken.mint()` on behalf of players.

| Function | Visibility | Purpose |
|----------|-----------|---------|
| `constructor(tokenAddr, mcpAddr)` | — | Store references, set roles |
| `distributeReward(player, amount, sessionId, nonce)` | external | Mint reward to player; emits `RewardDistributed` |
| `applyPenalty(player, sessionId)` | external | Emit `PenaltyApplied` event (no token burn in MVP) |
| `banPlayer(player)` | external | Add to `bannedPlayers` mapping; emits `PlayerBanned` |
| `unbanPlayer(player)` | external | Remove from ban list; admin only |
| `isBanned(player)` | view | Check ban status |
| `setMCP(newMCP)` | external | Update MCP address; admin only |
| `pause() / unpause()` | external | Emergency circuit breaker; admin only |

**Access Control:**

| Role | Holder | Can Do |
|------|--------|--------|
| `DEFAULT_ADMIN_ROLE` | Deployer (multisig) | `setMCP`, `unbanPlayer`, `pause/unpause` |
| `MCP_ROLE` | MCP server wallet | `distributeReward`, `applyPenalty`, `banPlayer` |

**Constraints:**
- Max reward per call: `100 MNRD` (sanity cap)
- Max daily reward per player: `500 MNRD` (tracked via `dailyRewards[player][day]`)
- Nonce replay prevention: `usedNonces[nonce] => bool`
- Banned players cannot receive rewards
- Pausable — all external functions gated by `whenNotPaused`

**Events:**
```solidity
event RewardDistributed(address indexed player, uint256 amount, string sessionId, bytes32 nonce);
event PenaltyApplied(address indexed player, string sessionId);
event PlayerBanned(address indexed player);
event PlayerUnbanned(address indexed player);
```

---

## 3. MonardPool (AMM Liquidity Pool)

**Purpose:** Constant-product (x·y = k) pool for the single pair MONARD ↔ WETH. Permissionless — anyone can add/remove liquidity or swap (via the router).

| Function | Visibility | Purpose |
|----------|-----------|---------|
| `constructor(tokenA, tokenB)` | — | Set pair tokens (MNRD + WETH) |
| `addLiquidity(amountA, amountB, to)` | external | Deposit both tokens, mint LP tokens |
| `removeLiquidity(lpAmount, to)` | external | Burn LP tokens, return proportional reserves |
| `swap(amountIn, tokenIn, minOut, to)` | external | Execute swap with slippage protection |
| `getReserves()` | view | Return `(reserveA, reserveB)` |
| `getAmountOut(amountIn, tokenIn)` | view | Quote output for given input |
| `skim(to)` | external | Sync balances if tokens sent directly |
| `sync()` | external | Force reserve update |

**Access Control:**
- **No roles** — fully permissionless
- `swap()` callable by anyone (but typically via SwapRouter)
- No admin functions, no upgrade path (immutable in MVP)

**Pricing:**
```
amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
```
- 0.3% fee on every swap (retained in pool for LPs)

**Constraints:**
- Minimum liquidity lock: first `1000` LP tokens burned to address(0)
- `swap()` enforces `minOut` — reverts on excessive slippage
- Reentrancy guard on all state-changing functions
- Uses `WETH` (not raw ETH) for uniform ERC-20 logic

**Events:**
```solidity
event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB, uint256 lpMinted);
event LiquidityRemoved(address indexed provider, uint256 amountA, uint256 amountB, uint256 lpBurned);
event Swap(address indexed sender, address tokenIn, uint256 amountIn, uint256 amountOut, address indexed to);
event Sync(uint256 reserveA, uint256 reserveB);
```

---

## 4. SwapRouter (User-Facing Entry Point)

**Purpose:** Convenience contract that wraps pool interactions, handles ETH ↔ WETH conversion, and provides deadline protection.

| Function | Visibility | Purpose |
|----------|-----------|---------|
| `constructor(pool, weth)` | — | Store references |
| `swapExactTokensForTokens(amountIn, minOut, tokenIn, to, deadline)` | external | ERC-20 → ERC-20 swap |
| `swapExactETHForTokens(minOut, to, deadline)` | external payable | ETH → MNRD (auto-wraps) |
| `swapExactTokensForETH(amountIn, minOut, to, deadline)` | external | MNRD → ETH (auto-unwraps) |
| `getAmountOut(amountIn, tokenIn)` | view | Quote from pool |
| `addLiquidityETH(amountToken, amountETHMin, amountTokenMin, to, deadline)` | external payable | Add liquidity with raw ETH |
| `removeLiquidityETH(lpAmount, amountTokenMin, amountETHMin, to, deadline)` | external | Remove liquidity, receive ETH |

**Access Control:**
- **No roles** — fully permissionless
- Stateless relay; holds no funds between calls

**Constraints:**
- `deadline` parameter: reverts if `block.timestamp > deadline`
- All functions use `nonReentrant` modifier
- Router never holds token balances — transfers go directly pool ↔ user
- WETH wrapping/unwrapping is atomic within the same transaction

---

## Access Control Summary

```
┌─────────────────────────────────────────────────────┐
│                 ROLE HIERARCHY                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Deployer Multisig                                  │
│  └─ DEFAULT_ADMIN_ROLE                              │
│     ├─ Can grant/revoke MINTER_ROLE on MonardToken  │
│     ├─ Can grant/revoke MCP_ROLE on RewardVault     │
│     ├─ Can pause/unpause RewardVault                │
│     └─ Can update MCP address                       │
│                                                     │
│  RewardVault Contract                               │
│  └─ MINTER_ROLE (on MonardToken)                    │
│     └─ Can call MonardToken.mint()                  │
│                                                     │
│  MCP Server Wallet                                  │
│  └─ MCP_ROLE (on RewardVault)                       │
│     ├─ Can call distributeReward()                  │
│     ├─ Can call applyPenalty()                      │
│     └─ Can call banPlayer()                         │
│                                                     │
│  Everyone Else                                      │
│  └─ Can swap, add/remove liquidity (permissionless) │
│  └─ Can transfer/approve MONARD tokens              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Gas Optimization Notes

| Technique | Applied To | Savings |
|-----------|-----------|---------|
| Pack storage slots | RewardVault `dailyRewards` uses `uint128` amounts + `uint128` day | ~50% on reward tracking |
| Minimal proxy (EIP-1167) | Not used in MVP (only 4 contracts) | Future consideration |
| No enumerable sets | Ban list is `mapping(address => bool)` not array | O(1) vs O(n) |
| Single pair only | MonardPool hardcodes token addresses | No factory overhead |
| `unchecked` math | Fee calculation in pool (values bounded) | ~200 gas per swap |
| Events over storage | Penalties are event-only (no on-chain state) | ~20,000 gas saved |
| WETH not raw ETH | Pool uses ERC-20 uniformly | Simpler, fewer edge cases |

---

## Deployment Order

```
1. Deploy WETH (or use existing: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2)
2. Deploy MonardToken(name, symbol, deployer)
3. Deploy MonardPool(MNRD address, WETH address)
4. Deploy SwapRouter(Pool address, WETH address)
5. Deploy RewardVault(MNRD address, MCP wallet address)
6. Grant MINTER_ROLE on MonardToken → RewardVault
7. Grant MCP_ROLE on RewardVault → MCP server wallet
8. Seed initial liquidity via SwapRouter.addLiquidityETH()
```

---

## MCP ↔ Contract Integration

The MCP edge function (`mcp-execute`) maps actions to contract calls:

| MCP Action | Contract Call | Gas Est. |
|------------|--------------|----------|
| `REWARD` | `RewardVault.distributeReward(player, amount, sessionId, nonce)` | ~80,000 |
| `PENALIZE` | `RewardVault.applyPenalty(player, sessionId)` | ~30,000 |
| `BAN` | `RewardVault.banPlayer(player)` | ~45,000 |
| `CONTINUE` | No on-chain call | 0 |
| `FLAG_FOR_REVIEW` | No on-chain call (logged off-chain) | 0 |

---

## Future Considerations (Post-MVP)

- **Token vesting** for team/investor allocations
- **Fee distribution** to a treasury or staking contract
- **Governance** token voting on parameters (reward caps, fee %)
- **Multi-pair factory** if additional trading pairs needed
- **L2 deployment** (Arbitrum/Base) for lower gas costs
- **Upgradeable proxies** (UUPS) if contract logic needs iteration
