// ── Swap Domain Types ──

export type SwapPair = "MONARD/ETH" | "MONARD/USDC";
export type SwapDirection = "sell" | "buy";

export interface SwapToken {
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
}

export const TOKENS: Record<string, SwapToken> = {
  MONARD: { symbol: "MONARD", name: "Monard Token", decimals: 18, icon: "🟣" },
  ETH: { symbol: "ETH", name: "Ethereum", decimals: 18, icon: "⟠" },
  USDC: { symbol: "USDC", name: "USD Coin", decimals: 6, icon: "💲" },
} as const;

export interface LiquidityPool {
  pair: SwapPair;
  reserveBase: number;   // MONARD reserve
  reserveQuote: number;  // ETH or USDC reserve
  feeRate: number;       // e.g. 0.003 = 0.3%
  k: number;             // constant product invariant
}

export interface SwapQuote {
  pair: SwapPair;
  direction: SwapDirection;
  inputAmount: number;
  inputToken: string;
  outputAmount: number;
  outputToken: string;
  executionPrice: number;
  priceImpact: number;     // percentage
  fee: number;
  minimumReceived: number; // after slippage
  slippage: number;
}

export interface SwapRequest {
  sessionId: string;
  playerAddress: string;
  pair: SwapPair;
  direction: SwapDirection;
  inputAmount: number;
  slippageTolerance: number;
  nonce: string;
  timestamp: number;
}

export interface SwapResult {
  success: boolean;
  txHash?: string;
  inputAmount: number;
  outputAmount: number;
  executionPrice: number;
  fee: number;
  error?: string;
}

export type SwapStatus = "idle" | "quoting" | "confirming" | "executing" | "success" | "error";
