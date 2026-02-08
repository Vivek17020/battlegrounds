// Ranking system - tracks tier progress in localStorage

import {
  PlayerRankingData, MatchResult, RankingTierName,
} from '../types';
import {
  getTierForPoints, getPlacementPoints, ENTRY_FEE, PRIZE_SPLIT,
} from '../constants';

const STORAGE_KEY = 'monard_br_ranking';

export class RankingSystem {
  data: PlayerRankingData;

  constructor() {
    this.data = this.load();
  }

  private load(): PlayerRankingData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      totalPoints: 0,
      tier: 'BRONZE',
      matchesPlayed: 0,
      wins: 0,
      totalKills: 0,
      bestPlacement: 999,
    };
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {}
  }

  processMatchResult(
    placement: number,
    kills: number,
    survivalTime: number,
    totalPlayers: number,
  ): MatchResult {
    const pointsGained = getPlacementPoints(placement, totalPlayers);
    this.data.totalPoints += pointsGained;
    this.data.matchesPlayed++;
    this.data.totalKills += kills;
    if (placement === 1) this.data.wins++;
    if (placement < this.data.bestPlacement) this.data.bestPlacement = placement;

    const newTier = getTierForPoints(this.data.totalPoints);
    this.data.tier = newTier;

    // Calculate token winnings
    const prizePool = ENTRY_FEE * totalPlayers;
    let tokensWon = 0;
    if (placement <= PRIZE_SPLIT.length) {
      tokensWon = Math.round(prizePool * PRIZE_SPLIT[placement - 1] * 100) / 100;
    }

    this.save();

    return {
      placement,
      kills,
      survivalTime,
      tokensWon,
      tierPointsGained: pointsGained,
      newTotalPoints: this.data.totalPoints,
      newTier: newTier,
    };
  }

  getCurrentTier(): RankingTierName {
    return this.data.tier;
  }

  getTotalPoints(): number {
    return this.data.totalPoints;
  }

  getStats(): PlayerRankingData {
    return { ...this.data };
  }
}
