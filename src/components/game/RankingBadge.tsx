// Ranking badge component showing current tier with icon and color

import { RankingTierName } from '@/game/battle-royale/types';
import { getTierData } from '@/game/battle-royale/constants';

interface RankingBadgeProps {
  tier: RankingTierName;
  points?: number;
  size?: 'sm' | 'md' | 'lg';
}

const TIER_ICONS: Record<RankingTierName, string> = {
  BRONZE: '🥉',
  SILVER: '🥈',
  GOLD: '🥇',
  PLATINUM: '💎',
  DIAMOND: '👑',
};

const TIER_CLASSES: Record<RankingTierName, string> = {
  BRONZE: 'from-amber-700 to-amber-900 text-amber-200',
  SILVER: 'from-gray-300 to-gray-500 text-gray-100',
  GOLD: 'from-yellow-400 to-amber-500 text-yellow-100',
  PLATINUM: 'from-cyan-400 to-teal-500 text-cyan-100',
  DIAMOND: 'from-purple-400 to-violet-600 text-purple-100',
};

const RankingBadge = ({ tier, points, size = 'md' }: RankingBadgeProps) => {
  const tierData = getTierData(tier);
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px] gap-1',
    md: 'px-3 py-1 text-xs gap-1.5',
    lg: 'px-4 py-1.5 text-sm gap-2',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full bg-gradient-to-r font-mono font-bold ${TIER_CLASSES[tier]} ${sizeClasses[size]}`}
    >
      <span>{TIER_ICONS[tier]}</span>
      <span>{tierData.label}</span>
      {points !== undefined && (
        <span className="opacity-70 font-normal">({points})</span>
      )}
    </span>
  );
};

export default RankingBadge;
