# MONARD Token — Deployment Guide

## Contract: `MonardToken.sol`

**ERC-20** | Solidity ^0.8.20 | OpenZeppelin v5

---

## Architecture

```
┌──────────────┐     grantMinter()     ┌────────────────────┐
│    Owner      │ ───────────────────▶  │  RewardController   │
│  (deployer)   │                       │  (authorized minter)│
└──────────────┘                       └────────┬───────────┘
                                                │
                                          mint(to, amount)
                                                │
                                                ▼
                                       ┌────────────────┐
                                       │  MonardToken    │
                                       │  ERC-20         │
                                       │  MAX: 100M      │
                                       └────────────────┘
```

## Setup Steps

### 1. Install Dependencies

```bash
# Using Foundry (recommended)
forge install OpenZeppelin/openzeppelin-contracts

# Or Hardhat
npm install @openzeppelin/contracts
```

### 2. Compile

```bash
# Foundry
forge build

# Hardhat
npx hardhat compile
```

### 3. Deploy to Testnet

```bash
# Foundry — deploy to Sepolia
forge create contracts/MonardToken.sol:MonardToken \
  --rpc-url $SEPOLIA_RPC \
  --private-key $DEPLOYER_KEY \
  --verify
```

### 4. Post-Deploy Setup

```bash
# Grant minting rights to RewardController
cast send $MONARD_TOKEN "grantMinter(address)" $REWARD_CONTROLLER \
  --rpc-url $SEPOLIA_RPC \
  --private-key $DEPLOYER_KEY
```

### 5. Verify Minter

```bash
cast call $MONARD_TOKEN "isMinter(address)(bool)" $REWARD_CONTROLLER \
  --rpc-url $SEPOLIA_RPC
# Should return: true
```

## Security Checklist

- [ ] Owner is a multisig or hardware wallet (not a hot key)
- [ ] RewardController is audited before `grantMinter()`
- [ ] `MAX_SUPPLY` constant verified (100,000,000 × 10¹⁸)
- [ ] No pre-mint — `totalSupply()` is 0 at deploy
- [ ] Test `revokeMinter()` emergency flow
- [ ] Verify contract source on Etherscan/Basescan

## Key Functions

| Function | Access | Description |
|---|---|---|
| `mint(to, amount)` | Minter only | Mint reward tokens to a player |
| `grantMinter(addr)` | Owner only | Authorize a RewardController |
| `revokeMinter(addr)` | Owner only | Emergency: revoke minter |
| `isMinter(addr)` | Public view | Check minter authorization |
| `mintableSupply()` | Public view | Remaining mintable tokens |

## Testnet Recommendations

| Network | RPC | Faucet |
|---|---|---|
| Sepolia | `https://rpc.sepolia.org` | [sepoliafaucet.com](https://sepoliafaucet.com) |
| Base Sepolia | `https://sepolia.base.org` | [base faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet) |
