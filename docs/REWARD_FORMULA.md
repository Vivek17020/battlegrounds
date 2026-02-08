# MONARD Reward Calculation Formula

## Existing Constants (from constants.ts)

```typescript
ENTRY_FEE = 10           // MONARD tokens per match entry
PRIZE_SPLIT = [0.70, 0.30]  // 1st gets 70%, 2nd gets 30%
```

---

## Extended Prize Split by Player Count

| Players | 1st   | 2nd   | 3rd   | 4th   | 5th   |
|---------|-------|-------|-------|-------|-------|
| 2       | 70%   | 30%   | -     | -     | -     |
| 3       | 60%   | 30%   | 10%   | -     | -     |
| 5       | 50%   | 25%   | 15%   | 7%    | 3%    |

```typescript
const PRIZE_SPLITS: Record<number, number[]> = {
  2: [0.70, 0.30],
  3: [0.60, 0.30, 0.10],
  5: [0.50, 0.25, 0.15, 0.07, 0.03],
};
```

---

## Inputs

| Field | Type | Description |
|-------|------|-------------|
| `placement` | integer | Final placement (1 = winner) |
| `playerCount` | 2 \| 3 \| 5 | Total players in match |
| `durationMs` | integer | Match duration in milliseconds |

---

## Validation Rules

```
MIN_DURATION_MS = 60000    // 60 seconds
MAX_DURATION_MS = 300000   // 5 minutes
```

Match is **INVALID** if:
- `durationMs < MIN_DURATION_MS`
- `placement > playerCount`
- `placement < 1`

---

## Pseudocode Formula

```
FUNCTION calculateReward(placement, playerCount, durationMs):
    
    // Step 1: Validate match
    IF durationMs < 60000:
        RETURN { valid: false, reward: 0, reason: "MATCH_TOO_SHORT" }
    
    IF placement < 1 OR placement > playerCount:
        RETURN { valid: false, reward: 0, reason: "INVALID_PLACEMENT" }
    
    // Step 2: Calculate prize pool
    prizePool = ENTRY_FEE × playerCount
    
    // Step 3: Get placement percentage
    prizeSplits = PRIZE_SPLITS[playerCount]
    placementPercent = prizeSplits[placement - 1]
    
    // Step 4: Calculate base reward
    baseReward = prizePool × placementPercent
    
    // Step 5: Apply duration bonus (longer matches = slight bonus)
    durationMinutes = durationMs / 60000
    durationBonus = MIN(durationMinutes × 0.5, 2.0)  // Max +2 MONARD
    
    // Step 6: Final reward (rounded to 2 decimals)
    finalReward = ROUND(baseReward + durationBonus, 2)
    
    RETURN { valid: true, reward: finalReward, breakdown: {...} }
```

---

## Example Calculations

### Example 1: 2-Player Match (1v1)

**Inputs:**
- `placement = 1` (winner)
- `playerCount = 2`
- `durationMs = 90000` (90 seconds)

**Calculation:**
```
prizePool = 10 × 2 = 20 MONARD
placementPercent = PRIZE_SPLITS[2][0] = 0.70
baseReward = 20 × 0.70 = 14 MONARD
durationBonus = MIN(1.5 × 0.5, 2.0) = 0.75 MONARD
finalReward = 14 + 0.75 = 14.75 MONARD
```

| Placement | Base | Duration Bonus | Total |
|-----------|------|----------------|-------|
| 1st       | 14.00 | +0.75 | **14.75 MONARD** |
| 2nd       | 6.00 | +0.75 | **6.75 MONARD** |

---

### Example 2: 3-Player Match

**Inputs:**
- `placement = 2` (second place)
- `playerCount = 3`
- `durationMs = 120000` (2 minutes)

**Calculation:**
```
prizePool = 10 × 3 = 30 MONARD
placementPercent = PRIZE_SPLITS[3][1] = 0.30
baseReward = 30 × 0.30 = 9 MONARD
durationBonus = MIN(2.0 × 0.5, 2.0) = 1.0 MONARD
finalReward = 9 + 1.0 = 10.00 MONARD
```

| Placement | Base | Duration Bonus | Total |
|-----------|------|----------------|-------|
| 1st       | 18.00 | +1.00 | **19.00 MONARD** |
| 2nd       | 9.00 | +1.00 | **10.00 MONARD** |
| 3rd       | 3.00 | +1.00 | **4.00 MONARD** |

---

### Example 3: 5-Player Match

**Inputs:**
- `placement = 1` (winner)
- `playerCount = 5`
- `durationMs = 180000` (3 minutes)

**Calculation:**
```
prizePool = 10 × 5 = 50 MONARD
placementPercent = PRIZE_SPLITS[5][0] = 0.50
baseReward = 50 × 0.50 = 25 MONARD
durationBonus = MIN(3.0 × 0.5, 2.0) = 1.5 MONARD
finalReward = 25 + 1.5 = 26.50 MONARD
```

| Placement | Base | Duration Bonus | Total |
|-----------|------|----------------|-------|
| 1st       | 25.00 | +1.50 | **26.50 MONARD** |
| 2nd       | 12.50 | +1.50 | **14.00 MONARD** |
| 3rd       | 7.50 | +1.50 | **9.00 MONARD** |
| 4th       | 3.50 | +1.50 | **5.00 MONARD** |
| 5th       | 1.50 | +1.50 | **3.00 MONARD** |

---

## Edge Cases

### Match Too Short (< 60 seconds)
```
Input:  placement=1, playerCount=2, durationMs=45000
Output: { valid: false, reward: 0, reason: "MATCH_TOO_SHORT" }
```

### Invalid Placement
```
Input:  placement=3, playerCount=2, durationMs=90000
Output: { valid: false, reward: 0, reason: "INVALID_PLACEMENT" }
```

### Maximum Duration Bonus
```
Input:  placement=1, playerCount=5, durationMs=300000 (5 min)
durationBonus = MIN(5.0 × 0.5, 2.0) = 2.0 MONARD (capped)
```

---

## Summary Table: All Rewards

| Match Size | Prize Pool | 1st | 2nd | 3rd | 4th | 5th |
|------------|------------|-----|-----|-----|-----|-----|
| 2 players  | 20 MONARD  | 14.0 | 6.0 | - | - | - |
| 3 players  | 30 MONARD  | 18.0 | 9.0 | 3.0 | - | - |
| 5 players  | 50 MONARD  | 25.0 | 12.5 | 7.5 | 3.5 | 1.5 |

*Note: Duration bonus of 0-2 MONARD added to base rewards*

---

## MCP Verification

The MCP endpoint must verify:
1. `placement ≤ playerCount`
2. `durationMs ≥ 60000`
3. Match ID exists in session registry
4. Wallet signature is valid

Formula is **deterministic** - same inputs always produce same output.
