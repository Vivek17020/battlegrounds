// Battle Royale HUD - in-game overlay

import { motion } from 'framer-motion';
import { Heart, Shield, Crosshair, Users, Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { KillFeedEntry, LootType } from '@/game/battle-royale/types';
import { PLAYER_MAX_HP, PLAYER_MAX_SHIELD } from '@/game/battle-royale/constants';

interface BattleHUDProps {
  health: number;
  shield: number;
  kills: number;
  aliveCount: number;
  phase: number;
  phaseTimeRemaining: number;
  inventory: LootType[];
  killFeed: KillFeedEntry[];
}

const LOOT_ICONS: Record<LootType, { icon: string; color: string }> = {
  health: { icon: '+', color: 'text-green-400' },
  shield: { icon: '◆', color: 'text-blue-400' },
  damage: { icon: '↑', color: 'text-red-400' },
  speed: { icon: '⚡', color: 'text-yellow-400' },
};

const BattleHUD = ({
  health,
  shield,
  kills,
  aliveCount,
  phase,
  phaseTimeRemaining,
  inventory,
  killFeed,
}: BattleHUDProps) => {
  const healthPct = (health / PLAYER_MAX_HP) * 100;
  const shieldPct = (shield / PLAYER_MAX_SHIELD) * 100;
  const timeStr = Math.ceil(phaseTimeRemaining / 1000);

  return (
    <>
      {/* Top-left: Health, Shield, Stats */}
      <div className="absolute top-3 left-3 z-20 space-y-2">
        {/* Health bar */}
        <div className="bg-card/80 backdrop-blur-sm border border-border rounded-lg px-3 py-2 space-y-1.5 min-w-[180px]">
          <div className="flex items-center gap-2">
            <Heart className="w-3 h-3 text-red-400" />
            <div className="flex-1">
              <Progress
                value={healthPct}
                className="h-2.5 bg-muted"
              />
            </div>
            <span className="text-[10px] font-mono text-foreground w-8 text-right">
              {Math.ceil(health)}
            </span>
          </div>
          {shield > 0 && (
            <div className="flex items-center gap-2">
              <Shield className="w-3 h-3 text-blue-400" />
              <div className="flex-1">
                <Progress
                  value={shieldPct}
                  className="h-2 bg-muted [&>div]:bg-blue-500"
                />
              </div>
              <span className="text-[10px] font-mono text-foreground w-8 text-right">
                {Math.ceil(shield)}
              </span>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="flex gap-2">
          <div className="bg-card/80 backdrop-blur-sm border border-border rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
            <Crosshair className="w-3 h-3 text-primary" />
            <span className="text-xs font-mono font-bold text-foreground">{kills}</span>
          </div>
          <div className="bg-card/80 backdrop-blur-sm border border-border rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
            <Users className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs font-mono font-bold text-foreground">{aliveCount}</span>
          </div>
        </div>

        {/* Inventory */}
        {inventory.length > 0 && (
          <div className="flex gap-1">
            {inventory.map((item, i) => (
              <div
                key={i}
                className="w-7 h-7 bg-card/80 backdrop-blur-sm border border-border rounded flex items-center justify-center"
              >
                <span className={`text-xs font-bold ${LOOT_ICONS[item].color}`}>
                  {LOOT_ICONS[item].icon}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top-center: Zone timer */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
        <div className="bg-card/80 backdrop-blur-sm border border-border rounded-lg px-4 py-1.5 flex items-center gap-2">
          <Clock className="w-3 h-3 text-destructive" />
          <span className="text-xs font-mono text-muted-foreground">Phase {phase + 1}</span>
          <span className="text-sm font-mono font-bold text-foreground">{timeStr}s</span>
        </div>
      </div>

      {/* Top-right: Kill feed */}
      <div className="absolute top-3 right-3 z-20 space-y-1">
        {killFeed.slice(-3).reverse().map((entry, i) => (
          <motion.div
            key={`${entry.timestamp}-${i}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1 - i * 0.2, x: 0 }}
            className="bg-card/60 backdrop-blur-sm border border-border rounded px-2 py-0.5 text-right"
          >
            <span className="text-[10px] font-mono text-muted-foreground">
              <span className="text-foreground">{entry.killer}</span>
              {' ▸ '}
              <span className="text-destructive">{entry.victim}</span>
            </span>
          </motion.div>
        ))}
      </div>
    </>
  );
};

export default BattleHUD;
