// Battle Royale results screen

import { motion } from 'framer-motion';
import { Trophy, Crosshair, Clock, Coins, ArrowUp, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import RankingBadge from './RankingBadge';
import { MatchResult } from '@/game/battle-royale/types';
import { getTierData, RANKING_TIERS } from '@/game/battle-royale/constants';
import { SubmissionResult } from '@/hooks/useMatchSubmission';

interface BattleResultsProps {
  result: MatchResult;
  onPlayAgain: () => void;
  onBackToMenu: () => void;
  submissionResult?: SubmissionResult | null;
  isSubmitting?: boolean;
}

const BattleResults = ({ 
  result, 
  onPlayAgain, 
  onBackToMenu,
  submissionResult,
  isSubmitting 
}: BattleResultsProps) => {
  const isSoloMode = result.playerCount === 1;
  const isVictory = result.placement === 1 && !isSoloMode;
  const tierData = getTierData(result.newTier);
  const nextTier = RANKING_TIERS.find(t => t.minPoints > result.newTotalPoints);
  const progressInTier = nextTier
    ? ((result.newTotalPoints - tierData.minPoints) / (nextTier.minPoints - tierData.minPoints)) * 100
    : 100;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Determine submission status display
  const getSubmissionStatus = () => {
    if (isSoloMode) return null;
    if (isSubmitting) return { icon: Loader2, text: 'Validating...', color: 'text-primary', animate: true };
    if (!submissionResult) return { icon: Loader2, text: 'Pending', color: 'text-muted-foreground', animate: true };
    if (submissionResult.allowed) return { icon: CheckCircle2, text: 'Validated', color: 'text-primary', animate: false };
    return { icon: AlertTriangle, text: 'Rejected', color: 'text-destructive', animate: false };
  };

  const submissionStatus = getSubmissionStatus();

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md space-y-6"
      >
        {/* Placement */}
        <div className="text-center space-y-2">
          {isSoloMode ? (
            <>
              <div className="w-20 h-20 mx-auto rounded-full bg-accent/20 border border-accent flex items-center justify-center">
                <Clock className="w-10 h-10 text-accent" />
              </div>
              <h2 className="text-2xl font-bold font-display text-foreground">
                Practice Complete
              </h2>
              <p className="text-sm text-muted-foreground">
                Survived {formatTime(result.survivalTime)}
              </p>
            </>
          ) : isVictory ? (
            <>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="w-20 h-20 mx-auto rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center glow-primary"
              >
                <Trophy className="w-10 h-10 text-primary" />
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-3xl font-bold font-display text-gradient-primary"
              >
                VICTORY ROYALE
              </motion.h2>
            </>
          ) : (
            <>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="w-20 h-20 mx-auto rounded-full bg-destructive/20 border-2 border-destructive flex items-center justify-center"
              >
                <span className="text-3xl font-bold font-mono text-destructive">
                  #{result.placement}
                </span>
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-3xl font-bold font-display text-destructive"
              >
                DEFEATED
              </motion.h2>
              <p className="text-sm text-muted-foreground">
                Better luck next time
              </p>
            </>
          )}
        </div>

        {/* Stats */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="space-y-1">
              <Crosshair className="w-4 h-4 mx-auto text-primary" />
              <div className="text-xl font-bold font-mono text-foreground">{result.kills}</div>
              <div className="text-[10px] text-muted-foreground font-mono">KILLS</div>
            </div>
            <div className="space-y-1">
              <Clock className="w-4 h-4 mx-auto text-accent" />
              <div className="text-xl font-bold font-mono text-foreground">
                {formatTime(result.survivalTime)}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">SURVIVED</div>
            </div>
            <div className="space-y-1">
              <Coins className="w-4 h-4 mx-auto text-glow-warm" />
              <div className="text-xl font-bold font-mono text-primary">
                {isSoloMode ? '—' : (
                  submissionResult?.allowed 
                    ? `+${submissionResult.calculatedReward}` 
                    : result.tokensWon > 0 ? `+${result.tokensWon}` : '0'
                )}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {isSoloMode ? 'PRACTICE' : 'MNRD WON'}
              </div>
            </div>
          </div>
        </div>

        {/* Submission Status (non-solo only) */}
        {submissionStatus && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-card border border-border rounded-lg p-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <submissionStatus.icon 
                  className={`w-4 h-4 ${submissionStatus.color} ${submissionStatus.animate ? 'animate-spin' : ''}`} 
                />
                <span className="text-sm font-mono">{submissionStatus.text}</span>
              </div>
              {submissionResult && (
                <Badge variant={submissionResult.allowed ? 'default' : 'destructive'}>
                  {submissionResult.reasonCode}
                </Badge>
              )}
            </div>
            
            {/* Reward Breakdown (if validated) */}
            {submissionResult?.allowed && submissionResult.rewardBreakdown && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 pt-3 border-t border-border"
              >
                <div className="grid grid-cols-4 gap-2 text-xs font-mono">
                  <div className="text-center">
                    <div className="text-muted-foreground">Base</div>
                    <div className="text-foreground">+{submissionResult.rewardBreakdown.base}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted-foreground">Place</div>
                    <div className="text-foreground">+{submissionResult.rewardBreakdown.placement}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted-foreground">Kills</div>
                    <div className="text-foreground">+{submissionResult.rewardBreakdown.kills}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted-foreground">Time</div>
                    <div className="text-foreground">+{submissionResult.rewardBreakdown.survival.toFixed(0)}</div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Rejection Reason */}
            {submissionResult && !submissionResult.allowed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-2 text-xs text-destructive"
              >
                {submissionResult.reasonMessage}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Tier progress */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-mono">RANK PROGRESS</span>
            <RankingBadge tier={result.newTier} points={result.newTotalPoints} size="sm" />
          </div>
          <div className="flex items-center gap-2">
            <ArrowUp className="w-3 h-3 text-primary" />
            <span className="text-xs font-mono text-primary">+{result.tierPointsGained} pts</span>
          </div>
          <Progress
            value={progressInTier}
            className="h-2 bg-muted"
          />
          {nextTier && (
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>{tierData.label}</span>
              <span>{nextTier.label} ({nextTier.minPoints} pts)</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={onBackToMenu}
            variant="outline"
            className="flex-1 font-mono"
          >
            Back to Menu
          </Button>
          <Button
            onClick={onPlayAgain}
            className="flex-1 font-mono font-bold"
            disabled={isSubmitting}
          >
            Play Again
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default BattleResults;
