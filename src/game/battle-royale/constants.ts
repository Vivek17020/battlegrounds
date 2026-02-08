// Battle Royale constants and tuning values

import { RankingTier, RankingTierName } from './types';

// Map
export const MAP_WIDTH = 800;
export const MAP_HEIGHT = 800;
export const VIEWPORT_WIDTH = 800;
export const VIEWPORT_HEIGHT = 600;
export const GRID_SIZE = 40;

// Player
export const PLAYER_RADIUS = 12;
export const PLAYER_MAX_HP = 100;
export const PLAYER_MAX_SHIELD = 50;
export const PLAYER_BASE_SPEED = 160; // px/s
export const PLAYER_BASE_DAMAGE = 10;
export const MAX_INVENTORY = 3;
export const SHOOT_COOLDOWN = 300; // ms

// Projectile
export const PROJECTILE_SPEED = 600; // px/s
export const PROJECTILE_RADIUS = 3;
export const PROJECTILE_MAX_RANGE = 400; // px

// Zone phases: [radiusPct, damagePerTick, durationSec]
export const ZONE_PHASES: [number, number, number][] = [
  [1.0, 0, 15],      // Phase 0: full map safe
  [0.70, 2, 15],     // Phase 1: 70% radius, 2 dmg
  [0.40, 5, 15],     // Phase 2: 40% radius, 5 dmg
  [0.15, 10, 15],    // Phase 3: 15% radius, 10 dmg
  [0.02, 20, 999],   // Phase 4: near-zero, 20 dmg
];
export const ZONE_DAMAGE_INTERVAL = 500; // ms between zone ticks
export const ZONE_SHRINK_SPEED = 0.5; // how fast radius lerps per second (0-1 scale)
export const INITIAL_ZONE_RADIUS = Math.min(MAP_WIDTH, MAP_HEIGHT) / 2;

// Loot
export const INITIAL_LOOT_COUNT = 8;
export const LOOT_PER_PHASE = 5;
export const LOOT_PICKUP_RADIUS = 20;
export const LOOT_RADIUS = 8;

// Loot rarity weights: health 40%, shield 30%, damage 20%, speed 10%
export const LOOT_WEIGHTS = {
  health: 0.4,
  shield: 0.3,
  damage: 0.2,
  speed: 0.1,
} as const;

export const LOOT_VALUES = {
  health: 25,   // restore 25 HP
  shield: 25,   // add 25 shield
  damage: 5,    // +5 permanent damage
  speed: 0.2,   // +20% speed for 15s
} as const;

export const SPEED_BOOST_DURATION = 15000; // ms

// Economy
export const ENTRY_FEE = 10;
export const PRIZE_SPLIT = [0.70, 0.30]; // 1st, 2nd for small matches

// Ranking
export const RANKING_TIERS: RankingTier[] = [
  { name: 'BRONZE', minPoints: 0, maxPoints: 99, color: 0xcd7f32, label: 'Bronze' },
  { name: 'SILVER', minPoints: 100, maxPoints: 299, color: 0xc0c0c0, label: 'Silver' },
  { name: 'GOLD', minPoints: 300, maxPoints: 599, color: 0xffd700, label: 'Gold' },
  { name: 'PLATINUM', minPoints: 600, maxPoints: 999, color: 0x00cec9, label: 'Platinum' },
  { name: 'DIAMOND', minPoints: 1000, maxPoints: Infinity, color: 0xa855f7, label: 'Diamond' },
];

export const PLACEMENT_POINTS: Record<string, number> = {
  '1': 25,
  '2': 15,
  '3': 10,
};
export const TOP_10_POINTS = 5;
export const PARTICIPATION_POINTS = 1;

// Bot
export const BOT_DECISION_INTERVAL = 500; // ms
export const BOT_ENGAGE_RANGE = 200;
export const BOT_LOOT_RANGE = 150;
export const BOT_MIN_ACCURACY = 0.6;
export const BOT_MAX_ACCURACY = 0.85;

export const BOT_NAMES = [
  'CryptoWolf', 'DegenApe', 'MoonHunter', 'DiamondHands', 'GasGuzzler',
  'FloorSweeper', 'WhaleAlert', 'RugPuller', 'YieldFarmer', 'TokenMaster',
  'NonceBandit', 'HashKing', 'BlockBuster', 'MintMachine', 'StakeSlayer',
  'ChainBreaker', 'LiquidLord', 'VaultViper', 'OracleOwl', 'BridgeBaron',
  'PoolShark', 'SwapSniper', 'ForkFiend', 'NodeNinja', 'KeyKeeper',
  'SigmaSurfer', 'AlphaApe', 'BetaBear', 'GammGhost', 'DeltaDemon',
  'ZetaZombie', 'ThetaTitan', 'EtaEagle', 'IotaImp', 'KappaKnight',
  'LambdaLion', 'MuMaverick', 'NuNomad', 'XiXenon', 'PiPirate',
  'RhoRanger', 'TauTiger', 'PhiPhoenix', 'ChiCheetah', 'PsiPanther',
  'OmegaOrca', 'SolSnake', 'ArbAnt', 'OptOx', 'ZkZebra',
];

// Countdown
export const COUNTDOWN_DURATION = 3; // seconds

// Stagger bot AI: process N bots per frame
export const BOTS_PER_FRAME = 8;

// Tier lookup helper
export function getTierForPoints(points: number): RankingTierName {
  for (let i = RANKING_TIERS.length - 1; i >= 0; i--) {
    if (points >= RANKING_TIERS[i].minPoints) return RANKING_TIERS[i].name;
  }
  return 'BRONZE';
}

export function getTierData(tier: RankingTierName): RankingTier {
  return RANKING_TIERS.find(t => t.name === tier) ?? RANKING_TIERS[0];
}

export function getPlacementPoints(placement: number, totalPlayers: number): number {
  const key = String(placement);
  if (PLACEMENT_POINTS[key]) return PLACEMENT_POINTS[key];
  if (placement <= 10) return TOP_10_POINTS;
  return PARTICIPATION_POINTS;
}
