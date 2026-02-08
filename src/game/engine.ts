import { AIDecision, GameSessionData, PlayerState } from "./types";
import { supabase } from "@/integrations/supabase/client";

// Generate unique session ID
export function createSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// Real AI agent — calls mcp-validate-session edge function
export async function fetchAIDecision(
  session: GameSessionData
): Promise<AIDecision> {
  try {
    const { data, error } = await supabase.functions.invoke("mcp-validate-session", {
      body: {
        sessionId: session.sessionId,
        totalClicks: session.totalClicks,
        score: session.score,
        comboMax: session.comboMax,
        avgClickSpeed: session.avgClickSpeed,
        sessionDuration: session.sessionDuration,
        timestamp: session.timestamp,
      },
    });

    if (error) throw error;

    // Edge function returns difficulty/reward adjustments
    if (data?.data) {
      return {
        difficultyMultiplier: data.data.difficultyMultiplier ?? 1,
        rewardMultiplier: data.data.rewardMultiplier ?? 1,
        nextTargetHP: data.data.nextTargetHP ?? 50,
        message: data.data.message ?? "Session validated.",
      };
    }

    // Fallback if response shape is unexpected
    return fallbackDecision(session);
  } catch (err) {
    console.warn("AI agent call failed, using fallback:", err);
    return fallbackDecision(session);
  }
}

// Fallback heuristic when edge function is unavailable
function fallbackDecision(session: GameSessionData): AIDecision {
  const performanceScore = (session.score / Math.max(session.sessionDuration, 1)) * 10;
  const comboBonus = Math.min(session.comboMax / 10, 1);

  const difficultyMultiplier = Math.min(3, Math.max(0.5, 0.8 + performanceScore * 0.15));
  const rewardMultiplier = Math.min(2, Math.max(0.5, 0.6 + comboBonus + performanceScore * 0.1));

  return {
    difficultyMultiplier: Math.round(difficultyMultiplier * 100) / 100,
    rewardMultiplier: Math.round(rewardMultiplier * 100) / 100,
    nextTargetHP: Math.round(50 * difficultyMultiplier),
    message: "Offline mode — local AI active.",
  };
}

// Calculate MONARD earned from a session
export function calculateReward(
  score: number,
  rewardMultiplier: number
): number {
  const base = score * 0.01; // 1 MONARD per 100 score
  return Math.round(base * rewardMultiplier * 100) / 100;
}

// Real wallet connection via MetaMask
export async function connectWallet(): Promise<Pick<PlayerState, "address" | "connected">> {
  // Check if MetaMask is available
  const ethereum = (window as unknown as { ethereum?: {
    request: (args: { method: string; params?: unknown[] }) => Promise<string[]>;
    isMetaMask?: boolean;
  } }).ethereum;

  if (!ethereum?.isMetaMask) {
    throw new Error("MetaMask not detected. Please install MetaMask to connect.");
  }

  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts returned from MetaMask");
    }

    return {
      address: accounts[0],
      connected: true,
    };
  } catch (err: unknown) {
    const error = err as { code?: number; message?: string };
    if (error.code === 4001) {
      throw new Error("Wallet connection rejected by user");
    }
    throw new Error(error.message || "Failed to connect wallet");
  }
}

// Mock swap quote (kept for compatibility — real swaps go through useSwap hook)
export function getSwapQuote(
  amount: number,
  direction: "sell" | "buy"
): { outputAmount: number; rate: number } {
  const rate = direction === "sell" ? 0.0001 : 10000;
  return {
    outputAmount: Math.round(amount * rate * 10000) / 10000,
    rate,
  };
}
