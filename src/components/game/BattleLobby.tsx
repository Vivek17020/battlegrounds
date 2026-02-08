// Battle Royale lobby - pre-match screen

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Swords, Users, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RankingBadge from './RankingBadge';
import { ENTRY_FEE } from '@/game/battle-royale/constants';
import { RankingSystem } from '@/game/battle-royale/systems/RankingSystem';

interface BattleLobbyProps {
  monardBalance: number;
  onStartMatch: (playerCount: number) => void;
}

const PLAYER_COUNT_OPTIONS = [
  { count: 1, label: 'Solo', description: 'Practice mode' },
  { count: 2, label: '2', description: '1v1 Duel' },
  { count: 3, label: '3', description: 'Triple threat' },
  { count: 5, label: '5', description: 'Battle royale' },
];

const BattleLobby = ({ monardBalance, onStartMatch }: BattleLobbyProps) => {
  const [selectedOption, setSelectedOption] = useState(PLAYER_COUNT_OPTIONS[1]); // Default to 2
  const [finding, setFinding] = useState(false);
  const ranking = new RankingSystem();
  const stats = ranking.getStats();
  const isSoloMode = selectedOption.count === 1;
  const canAfford = isSoloMode || monardBalance >= ENTRY_FEE;

  const handleEnter = () => {
    if (!canAfford) return;
    setFinding(true);
    // Solo mode starts instantly, multiplayer has matchmaking delay
    const delay = isSoloMode ? 500 : 1500;
    setTimeout(() => {
      onStartMatch(selectedOption.count);
    }, delay);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-6"
      >
        {/* Title */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
            <Swords className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold font-display text-gradient-primary">
            Battle Royale
          </h2>
          <p className="text-sm text-muted-foreground">
            Last player standing wins the prize pool
          </p>
        </div>

        {/* Your rank */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-mono">YOUR RANK</span>
            <RankingBadge tier={stats.tier} points={stats.totalPoints} />
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-lg font-bold font-mono text-foreground">{stats.matchesPlayed}</div>
              <div className="text-[10px] text-muted-foreground">Matches</div>
            </div>
            <div>
              <div className="text-lg font-bold font-mono text-foreground">{stats.wins}</div>
              <div className="text-[10px] text-muted-foreground">Wins</div>
            </div>
            <div>
              <div className="text-lg font-bold font-mono text-foreground">{stats.totalKills}</div>
              <div className="text-[10px] text-muted-foreground">Kills</div>
            </div>
          </div>
        </div>

        {/* Player count selector */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-mono flex items-center gap-1.5">
            <Users className="w-3 h-3" />
            PLAYERS
          </label>
          <div className="flex gap-2">
            {PLAYER_COUNT_OPTIONS.map((option) => (
              <button
                key={option.count}
                onClick={() => setSelectedOption(option)}
                className={`flex-1 py-2 px-1 rounded-lg font-mono text-sm font-bold border transition-all ${
                  selectedOption.count === option.count
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-card border-border text-muted-foreground hover:border-primary/30'
                }`}
              >
                <div>{option.label}</div>
                <div className="text-[9px] font-normal opacity-70">{option.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Entry fee & prize pool */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-2">
          {isSoloMode ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                  <Coins className="w-3 h-3" />
                  MODE
                </span>
                <span className="font-mono font-bold text-accent">Practice (Free)</span>
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                No entry fee. Survive as long as you can. No rewards.
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                  <Coins className="w-3 h-3" />
                  ENTRY FEE
                </span>
                <span className="font-mono font-bold text-foreground">{ENTRY_FEE} MNRD</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-mono">PRIZE POOL</span>
                <span className="font-mono font-bold text-primary">
                  {ENTRY_FEE * selectedOption.count} MNRD
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                <span>1st: 70% • 2nd: 30%</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border">
                <span className="text-xs text-muted-foreground font-mono">YOUR BALANCE</span>
                <span className={`font-mono font-bold ${canAfford ? 'text-foreground' : 'text-destructive'}`}>
                  {monardBalance.toFixed(2)} MNRD
                </span>
              </div>
            </>
          )}
        </div>

        {/* Enter button */}
        {finding ? (
          <div className="text-center py-4 space-y-2">
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
            <p className="text-sm font-mono text-muted-foreground animate-pulse">
              {isSoloMode ? 'Initializing practice...' : 'Finding opponents...'}
            </p>
          </div>
        ) : (
          <Button
            onClick={handleEnter}
            disabled={!canAfford}
            className="w-full h-12 text-base font-bold font-mono"
            size="lg"
          >
            {isSoloMode 
              ? 'Start Practice' 
              : canAfford 
                ? `Enter Match (${ENTRY_FEE} MNRD)` 
                : 'Insufficient MONARD'}
          </Button>
        )}

        {/* Controls hint */}
        <div className="text-center text-[10px] text-muted-foreground font-mono space-y-0.5">
          <p>WASD to move • Mouse to aim • Click to shoot</p>
          <p>Auto-pickup loot • Last alive wins</p>
        </div>
      </motion.div>
    </div>
  );
};

export default BattleLobby;
