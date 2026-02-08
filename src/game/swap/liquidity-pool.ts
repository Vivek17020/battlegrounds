// ── Constant-Product AMM (x * y = k) ──
// MVP mock liquidity pools for MONARD ↔ ETH and MONARD ↔ USDC

import { LiquidityPool, SwapDirection, SwapPair, SwapQuote } from "./types";

// Initial pool state — in production these read from on-chain
const pools: Record<SwapPair, LiquidityPool> = {
  "MONARD/ETH": {
    pair: "MONARD/ETH",
    reserveBase: 1_000_000,   // 1M MONARD
    reserveQuote: 100,        // 100 ETH
    feeRate: 0.003,           // 0.3%
    k: 1_000_000 * 100,      // invariant
  },
  "MONARD/USDC": {
    pair: "MONARD/USDC",
    reserveBase: 1_000_000,   // 1M MONARD
    reserveQuote: 250_000,    // 250K USDC → 1 MONARD ≈ $0.25
    feeRate: 0.003,
    k: 1_000_000 * 250_000,
  },
};

/** Get current pool reserves (read-only snapshot) */
export function getPool(pair: SwapPair): LiquidityPool {
  return { ...pools[pair] };
}

/** Calculate swap output using constant-product formula */
export function getSwapQuote(
  pair: SwapPair,
  direction: SwapDirection,
  inputAmount: number,
  slippageTolerance = 0.005
): SwapQuote {
  const pool = pools[pair];

  // Determine which reserve is "in" and which is "out"
  const isSelling = direction === "sell"; // selling MONARD → get quote token
  const reserveIn = isSelling ? pool.reserveBase : pool.reserveQuote;
  const reserveOut = isSelling ? pool.reserveQuote : pool.reserveBase;

  const inputToken = isSelling ? "MONARD" : pair.split("/")[1];
  const outputToken = isSelling ? pair.split("/")[1] : "MONARD";

  // Apply fee to input
  const fee = inputAmount * pool.feeRate;
  const amountInAfterFee = inputAmount - fee;

  // Constant product: (reserveIn + amountIn) * (reserveOut - amountOut) = k
  // amountOut = reserveOut - k / (reserveIn + amountIn)
  const newReserveIn = reserveIn + amountInAfterFee;
  const newReserveOut = pool.k / newReserveIn;
  const outputAmount = reserveOut - newReserveOut;

  // Execution price (how much output per 1 input)
  const executionPrice = outputAmount / inputAmount;

  // Spot price (price at zero volume)
  const spotPrice = reserveOut / reserveIn;

  // Price impact
  const priceImpact = Math.abs((executionPrice - spotPrice) / spotPrice) * 100;

  // Minimum received after slippage
  const minimumReceived = outputAmount * (1 - slippageTolerance);

  return {
    pair,
    direction,
    inputAmount,
    inputToken,
    outputAmount: round(outputAmount, 6),
    outputToken,
    executionPrice: round(executionPrice, 8),
    priceImpact: round(priceImpact, 2),
    fee: round(fee, 6),
    minimumReceived: round(minimumReceived, 6),
    slippage: slippageTolerance,
  };
}

/** Execute swap — mutates pool reserves (mock on-chain TX) */
export async function executeSwap(
  pair: SwapPair,
  direction: SwapDirection,
  inputAmount: number,
  slippageTolerance = 0.005
): Promise<{ txHash: string; outputAmount: number; executionPrice: number; fee: number }> {
  // Simulate TX delay
  await new Promise((r) => setTimeout(r, 600 + Math.random() * 800));

  const pool = pools[pair];
  const isSelling = direction === "sell";
  const reserveIn = isSelling ? pool.reserveBase : pool.reserveQuote;
  const reserveOut = isSelling ? pool.reserveQuote : pool.reserveBase;

  const fee = inputAmount * pool.feeRate;
  const amountInAfterFee = inputAmount - fee;

  const newReserveIn = reserveIn + amountInAfterFee;
  const newReserveOut = pool.k / newReserveIn;
  const outputAmount = reserveOut - newReserveOut;

  // Check slippage
  const spotPrice = reserveOut / reserveIn;
  const executionPrice = outputAmount / inputAmount;
  const actualSlippage = Math.abs((executionPrice - spotPrice) / spotPrice);

  if (actualSlippage > slippageTolerance) {
    throw new Error(`Slippage exceeded: ${(actualSlippage * 100).toFixed(2)}% > ${(slippageTolerance * 100).toFixed(2)}%`);
  }

  // Mutate pool (mock on-chain state change)
  if (isSelling) {
    pool.reserveBase = newReserveIn;
    pool.reserveQuote = newReserveOut;
  } else {
    pool.reserveQuote = newReserveIn;
    pool.reserveBase = newReserveOut;
  }

  // Mock TX hash
  const txHash = `0x${Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("")}`;

  return {
    txHash,
    outputAmount: round(outputAmount, 6),
    executionPrice: round(executionPrice, 8),
    fee: round(fee, 6),
  };
}

/** Get current spot prices for display */
export function getSpotPrices(): Record<SwapPair, { monardPrice: number; quoteSymbol: string }> {
  return {
    "MONARD/ETH": {
      monardPrice: round(pools["MONARD/ETH"].reserveQuote / pools["MONARD/ETH"].reserveBase, 8),
      quoteSymbol: "ETH",
    },
    "MONARD/USDC": {
      monardPrice: round(pools["MONARD/USDC"].reserveQuote / pools["MONARD/USDC"].reserveBase, 4),
      quoteSymbol: "USDC",
    },
  };
}

function round(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}
