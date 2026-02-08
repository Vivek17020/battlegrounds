// Battle Royale type definitions

export type LootType = 'health' | 'shield' | 'damage' | 'speed';

export type BotState = 'ROAM' | 'LOOT' | 'FIGHT' | 'FLEE' | 'ZONE_MOVE';

export type MatchPhase = 'lobby' | 'countdown' | 'active' | 'ended';

export type RankingTierName = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';

export interface BattlePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  speed: number;
  baseDamage: number;
  damageBonus: number;
  isAlive: boolean;
  isBot: boolean;
  kills: number;
  inventory: LootType[];
  lastShootTime: number;
  placement: number;
  eliminatedAt: number;
  // Speed boost tracking
  speedBoostEnd: number;
}

export interface LootDrop {
  id: string;
  type: LootType;
  x: number;
  y: number;
  value: number;
  spawnTime: number;
}

export interface ZoneState {
  currentRadius: number;
  targetRadius: number;
  centerX: number;
  centerY: number;
  damagePerTick: number;
  phase: number;
  phaseStartTime: number;
  shrinking: boolean;
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
  damage: number;
  distanceTravelled: number;
}

export interface KillFeedEntry {
  killer: string;
  victim: string;
  timestamp: number;
}

export interface BattleMatchState {
  players: BattlePlayer[];
  zone: ZoneState;
  lootDrops: LootDrop[];
  projectiles: Projectile[];
  matchPhase: MatchPhase;
  aliveCount: number;
  matchId: string;
  matchStartTime: number;
  killFeed: KillFeedEntry[];
}

export interface MatchResult {
  placement: number;
  kills: number;
  survivalTime: number;
  tokensWon: number;
  tierPointsGained: number;
  newTotalPoints: number;
  newTier: RankingTierName;
  // Added for MCP submission
  matchId?: string;
  playerCount?: number;
  durationMs?: number;
  antiCheatSignals?: {
    inputHash: string;
    frameCount: number;
    avgTickRate: number;
    suspiciousFlags: string[];
    inputTimingVariance: number;
    movementHash: string;
  };
}

export interface RankingTier {
  name: RankingTierName;
  minPoints: number;
  maxPoints: number;
  color: number; // Phaser hex color
  label: string;
}

export interface PlayerRankingData {
  totalPoints: number;
  tier: RankingTierName;
  matchesPlayed: number;
  wins: number;
  totalKills: number;
  bestPlacement: number;
}

// Events emitted from Phaser scene to React
export interface BattleSceneEvents {
  onHealthChange: (health: number, shield: number) => void;
  onKillsChange: (kills: number) => void;
  onAliveCountChange: (count: number) => void;
  onPhaseChange: (phase: number, timeRemaining: number) => void;
  onKillFeed: (entry: KillFeedEntry) => void;
  onMatchEnd: (result: MatchResult) => void;
  onPlayerPosition: (x: number, y: number) => void;
  onInventoryChange: (inventory: LootType[]) => void;
  onCountdown: (count: number) => void;
}
