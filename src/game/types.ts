// Shared game state types used across the game layer

export interface PlayerState {
  address: string | null;
  connected: boolean;
  score: number;
  monardEarned: number;
  monardBalance: number;
  sessionId: string | null;
}

export interface GameSessionData {
  sessionId: string;
  totalClicks: number;
  score: number;
  comboMax: number;
  avgClickSpeed: number; // clicks per second
  sessionDuration: number; // seconds
  timestamp: number;
}

export interface AIDecision {
  difficultyMultiplier: number; // 0.5 – 3.0
  rewardMultiplier: number; // 0.5 – 2.0
  nextTargetHP: number;
  message: string;
}

export interface SwapQuote {
  inputAmount: number;
  outputAmount: number;
  rate: number;
  pair: "MONARD/ETH" | "ETH/MONARD";
}
