import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import WalletBar from "@/components/game/WalletBar";
import GameHUD from "@/components/game/GameHUD";
import SwapPanel from "@/components/game/SwapPanel";
import { useGameEngine } from "@/hooks/useGameEngine";
import {
  connectWallet,
  createSessionId,
  fetchAIDecision,
  calculateReward,
} from "@/game/engine";
import { GameSessionData, AIDecision } from "@/game/types";

const GamePage = () => {
  const gameContainerRef = useRef<HTMLDivElement>(null);

  // Wallet state
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  // Game state
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [monardEarned, setMonardEarned] = useState(0);
  const [monardBalance, setMonardBalance] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [roundCount, setRoundCount] = useState(0);

  // AI state
  const [aiDecision, setAiDecision] = useState<AIDecision | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const sessionStartRef = useRef(Date.now());

  const difficultyLabel = aiDecision
    ? aiDecision.difficultyMultiplier > 2
      ? "HARD"
      : aiDecision.difficultyMultiplier > 1.2
      ? "MEDIUM"
      : "EASY"
    : "NORMAL";

  const handleConnect = async () => {
    setWalletLoading(true);
    try {
      const result = await connectWallet();
      setWalletAddress(result.address);
      setWalletConnected(result.connected);
      setSessionId(createSessionId());
      sessionStartRef.current = Date.now();
    } catch (err) {
      console.error("Wallet connection failed:", err);
      alert(err instanceof Error ? err.message : "Failed to connect wallet");
    } finally {
      setWalletLoading(false);
    }
  };

  const handleDisconnect = () => {
    setWalletConnected(false);
    setWalletAddress(null);
    setSessionId(null);
    setScore(0);
    setCombo(0);
    setMonardEarned(0);
  };

  const handleRoundEnd = useCallback(
    async (stats: { totalClicks: number; comboMax: number; avgCps: number }) => {
      if (!sessionId) return;

      const sessionData: GameSessionData = {
        sessionId,
        totalClicks: stats.totalClicks,
        score,
        comboMax: stats.comboMax,
        avgClickSpeed: stats.avgCps,
        sessionDuration: (Date.now() - sessionStartRef.current) / 1000,
        timestamp: Date.now(),
      };

      // Calculate reward
      const rewardMult = aiDecision?.rewardMultiplier ?? 1;
      const earned = calculateReward(score, rewardMult);
      setMonardEarned((prev) => prev + earned);
      setMonardBalance((prev) => prev + earned);
      setRoundCount((prev) => prev + 1);

      // Fetch AI decision for next round
      setAiLoading(true);
      try {
        const decision = await fetchAIDecision(sessionData);
        setAiDecision(decision);
        applyAIDecision(decision);
      } finally {
        setAiLoading(false);
      }
    },
    [sessionId, score, aiDecision]
  );

  const { applyAIDecision } = useGameEngine({
    containerRef: gameContainerRef,
    onScoreChange: setScore,
    onComboChange: setCombo,
    onTargetDestroyed: () => {},
    onRoundEnd: handleRoundEnd,
  });

  const handleBalanceChange = (delta: number, direction: "sell" | "buy") => {
    setMonardBalance((prev) => Math.max(0, prev + delta));
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link to="/" className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="font-mono text-sm font-bold text-gradient-primary">MONARD</span>
          {roundCount > 0 && (
            <span className="text-[10px] font-mono text-muted-foreground">
              Round {roundCount}
            </span>
          )}
        </div>
        <WalletBar
          address={walletAddress}
          connected={walletConnected}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          loading={walletLoading}
        />
      </header>

      {/* Game area */}
      <div className="flex-1 flex flex-col relative">
        {!walletConnected ? (
          /* Gate: must connect wallet */
          <div className="flex-1 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-4"
            >
              <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                <span className="text-3xl">🎮</span>
              </div>
              <h2 className="text-xl font-semibold font-display">Connect to Play</h2>
              <p className="text-sm text-muted-foreground max-w-xs">
                Connect your wallet to start earning MONARD tokens. Click the orb, build combos, destroy targets.
              </p>
            </motion.div>
          </div>
        ) : (
          <>
            {/* HUD overlay */}
            <div className="absolute top-3 left-3 z-10">
              <GameHUD
                score={score}
                combo={combo}
                monardEarned={monardEarned}
                monardBalance={monardBalance}
                difficultyLabel={difficultyLabel}
                rewardMultiplier={aiDecision?.rewardMultiplier ?? 1}
              />
            </div>

            {/* Swap panel */}
            <div className="absolute top-3 right-3 z-10">
              <SwapPanel monardBalance={monardBalance} onBalanceChange={handleBalanceChange} />
            </div>

            {/* AI status */}
            {aiLoading && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-lg bg-accent/20 border border-accent/30">
                <span className="text-xs font-mono text-accent animate-pulse">
                  AI recalibrating…
                </span>
              </div>
            )}
            {aiDecision?.message && !aiLoading && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-lg bg-card border border-border">
                <span className="text-xs font-mono text-muted-foreground">
                  {aiDecision.message}
                </span>
              </div>
            )}

            {/* Phaser canvas */}
            <div ref={gameContainerRef} className="flex-1" />
          </>
        )}
      </div>
    </div>
  );
};

export default GamePage;
