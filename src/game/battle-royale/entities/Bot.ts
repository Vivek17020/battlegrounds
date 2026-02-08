// Bot AI entity - extends PlayerEntity with autonomous behavior

import Phaser from 'phaser';
import { PlayerEntity } from './Player';
import { BotState, LootDrop } from '../types';
import {
  BOT_ENGAGE_RANGE, BOT_LOOT_RANGE, BOT_MIN_ACCURACY, BOT_MAX_ACCURACY,
  MAP_WIDTH, MAP_HEIGHT,
} from '../constants';

export class BotEntity extends PlayerEntity {
  state: BotState = 'ROAM';
  lastDecisionTime: number = 0;
  accuracy: number;
  aggression: number; // 0-1, affects fight vs flee tendency
  roamTarget: { x: number; y: number } | null = null;
  personality: 'passive' | 'balanced' | 'aggressive';

  constructor(
    scene: Phaser.Scene,
    id: string,
    name: string,
    x: number,
    y: number,
    color: number,
  ) {
    super(scene, id, name, x, y, true, color);

    // Randomize personality
    const roll = Math.random();
    if (roll < 0.3) {
      this.personality = 'passive';
      this.aggression = 0.2 + Math.random() * 0.2;
      this.accuracy = BOT_MIN_ACCURACY + Math.random() * 0.1;
    } else if (roll < 0.7) {
      this.personality = 'balanced';
      this.aggression = 0.4 + Math.random() * 0.2;
      this.accuracy = BOT_MIN_ACCURACY + Math.random() * 0.15;
    } else {
      this.personality = 'aggressive';
      this.aggression = 0.7 + Math.random() * 0.3;
      this.accuracy = BOT_MIN_ACCURACY + Math.random() * (BOT_MAX_ACCURACY - BOT_MIN_ACCURACY);
    }
  }

  makeDecision(
    allPlayers: PlayerEntity[],
    lootDrops: { data: LootDrop; gameObject: Phaser.GameObjects.Arc }[],
    zoneCenter: { x: number; y: number },
    zoneRadius: number,
    now: number,
  ): {
    moveX: number; moveY: number;
    shouldShoot: boolean;
    shootTarget: { x: number; y: number } | null;
  } {
    if (!this.data.isAlive) {
      return { moveX: 0, moveY: 0, shouldShoot: false, shootTarget: null };
    }

    const dx = this.data.x - zoneCenter.x;
    const dy = this.data.y - zoneCenter.y;
    const distFromCenter = Math.sqrt(dx * dx + dy * dy);
    const outsideZone = distFromCenter > zoneRadius - 30;

    // Find nearest enemy
    let nearestEnemy: PlayerEntity | null = null;
    let nearestEnemyDist = Infinity;
    for (const p of allPlayers) {
      if (p.data.id === this.data.id || !p.data.isAlive) continue;
      const ex = p.data.x - this.data.x;
      const ey = p.data.y - this.data.y;
      const dist = Math.sqrt(ex * ex + ey * ey);
      if (dist < nearestEnemyDist) {
        nearestEnemyDist = dist;
        nearestEnemy = p;
      }
    }

    // Find nearest loot
    let nearestLoot: { data: LootDrop } | null = null;
    let nearestLootDist = Infinity;
    for (const l of lootDrops) {
      const lx = l.data.x - this.data.x;
      const ly = l.data.y - this.data.y;
      const dist = Math.sqrt(lx * lx + ly * ly);
      if (dist < nearestLootDist) {
        nearestLootDist = dist;
        nearestLoot = l;
      }
    }

    // Priority 1: Get back in zone
    if (outsideZone) {
      this.state = 'ZONE_MOVE';
      const angle = Math.atan2(zoneCenter.y - this.data.y, zoneCenter.x - this.data.x);
      return {
        moveX: Math.cos(angle),
        moveY: Math.sin(angle),
        shouldShoot: false,
        shootTarget: null,
      };
    }

    // Priority 2: Low health — flee
    if (this.data.health < 30 && nearestEnemy && nearestEnemyDist < BOT_ENGAGE_RANGE) {
      this.state = 'FLEE';
      // Flee away from enemy, toward health loot if possible
      if (nearestLoot && nearestLoot.data.type === 'health' && nearestLootDist < BOT_LOOT_RANGE * 2) {
        const angle = Math.atan2(nearestLoot.data.y - this.data.y, nearestLoot.data.x - this.data.x);
        return { moveX: Math.cos(angle), moveY: Math.sin(angle), shouldShoot: false, shootTarget: null };
      }
      const fleeAngle = Math.atan2(this.data.y - nearestEnemy.data.y, this.data.x - nearestEnemy.data.x);
      return { moveX: Math.cos(fleeAngle), moveY: Math.sin(fleeAngle), shouldShoot: false, shootTarget: null };
    }

    // Priority 3: Enemy in range — fight
    if (nearestEnemy && nearestEnemyDist < BOT_ENGAGE_RANGE) {
      this.state = 'FIGHT';
      // Add inaccuracy
      const shouldHit = Math.random() < this.accuracy;
      const aimX = nearestEnemy.data.x + (shouldHit ? 0 : (Math.random() - 0.5) * 60);
      const aimY = nearestEnemy.data.y + (shouldHit ? 0 : (Math.random() - 0.5) * 60);

      // Strafe around target
      const strafeAngle = Math.atan2(nearestEnemy.data.y - this.data.y, nearestEnemy.data.x - this.data.x) + Math.PI / 2;
      const strafeDir = Math.random() > 0.5 ? 1 : -1;

      return {
        moveX: Math.cos(strafeAngle) * strafeDir * 0.5,
        moveY: Math.sin(strafeAngle) * strafeDir * 0.5,
        shouldShoot: this.canShoot(now),
        shootTarget: { x: aimX, y: aimY },
      };
    }

    // Priority 4: Loot nearby
    if (nearestLoot && nearestLootDist < BOT_LOOT_RANGE) {
      this.state = 'LOOT';
      const angle = Math.atan2(nearestLoot.data.y - this.data.y, nearestLoot.data.x - this.data.x);
      return { moveX: Math.cos(angle), moveY: Math.sin(angle), shouldShoot: false, shootTarget: null };
    }

    // Default: Roam
    this.state = 'ROAM';
    if (!this.roamTarget || Math.random() < 0.02) {
      // Pick a random point within the safe zone
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * zoneRadius * 0.7;
      this.roamTarget = {
        x: Phaser.Math.Clamp(zoneCenter.x + Math.cos(angle) * dist, 50, MAP_WIDTH - 50),
        y: Phaser.Math.Clamp(zoneCenter.y + Math.sin(angle) * dist, 50, MAP_HEIGHT - 50),
      };
    }

    const roamAngle = Math.atan2(this.roamTarget.y - this.data.y, this.roamTarget.x - this.data.x);
    const roamDist = Math.sqrt(
      (this.roamTarget.x - this.data.x) ** 2 + (this.roamTarget.y - this.data.y) ** 2
    );
    if (roamDist < 20) this.roamTarget = null;

    return {
      moveX: Math.cos(roamAngle) * 0.6,
      moveY: Math.sin(roamAngle) * 0.6,
      shouldShoot: false,
      shootTarget: null,
    };
  }
}
