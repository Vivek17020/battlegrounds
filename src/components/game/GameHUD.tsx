import { Zap, Target, Coins } from "lucide-react";

interface GameHUDProps {
  score: number;
  combo: number;
  monardEarned: number;
  monardBalance: number;
  difficultyLabel: string;
  rewardMultiplier: number;
}

const GameHUD = ({
  score,
  combo,
  monardEarned,
  monardBalance,
  difficultyLabel,
  rewardMultiplier,
}: GameHUDProps) => {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Score */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary border border-border">
        <Target className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-mono text-foreground">{score.toLocaleString()}</span>
      </div>

      {/* Combo */}
      {combo >= 3 && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/20 border border-accent/30 animate-pulse">
          <Zap className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs font-mono text-accent-foreground">{combo}x</span>
        </div>
      )}

      {/* MONARD Balance */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary border border-border">
        <Coins className="w-3.5 h-3.5 text-glow-warm" />
        <div className="flex flex-col">
          <span className="text-xs font-mono text-foreground">
            {monardBalance.toFixed(2)} <span className="text-muted-foreground">MONARD</span>
          </span>
          {monardEarned > 0 && (
            <span className="text-[10px] font-mono text-primary">
              +{monardEarned.toFixed(2)} this session
            </span>
          )}
        </div>
      </div>

      {/* Difficulty / Reward */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary border border-border">
        <span className="text-[10px] font-mono text-muted-foreground uppercase">
          {difficultyLabel}
        </span>
        <span className="text-[10px] font-mono text-primary">
          ×{rewardMultiplier.toFixed(1)} reward
        </span>
      </div>
    </div>
  );
};

export default GameHUD;
