// Loot system - spawning, despawning, and pickup handling

import Phaser from 'phaser';
import { LootDrop, LootType } from '../types';
import { LootItemEntity } from '../entities/LootItem';
import { PlayerEntity } from '../entities/Player';
import {
  INITIAL_LOOT_COUNT, LOOT_PER_PHASE, LOOT_PICKUP_RADIUS,
  LOOT_WEIGHTS, MAP_WIDTH, MAP_HEIGHT, MAX_INVENTORY,
} from '../constants';

export class LootSystem {
  scene: Phaser.Scene;
  items: LootItemEntity[] = [];
  private nextId: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  spawnInitial(): void {
    for (let i = 0; i < INITIAL_LOOT_COUNT; i++) {
      // Avoid center cluster (spawn in outer 70% of map)
      let x: number, y: number;
      do {
        x = 50 + Math.random() * (MAP_WIDTH - 100);
        y = 50 + Math.random() * (MAP_HEIGHT - 100);
      } while (
        Math.abs(x - MAP_WIDTH / 2) < 150 &&
        Math.abs(y - MAP_HEIGHT / 2) < 150
      );

      this.spawnLoot(x, y);
    }
  }

  spawnPhaseItems(zoneCenter: { x: number; y: number }, zoneRadius: number): void {
    for (let i = 0; i < LOOT_PER_PHASE; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * zoneRadius * 0.8;
      const x = Phaser.Math.Clamp(zoneCenter.x + Math.cos(angle) * dist, 50, MAP_WIDTH - 50);
      const y = Phaser.Math.Clamp(zoneCenter.y + Math.sin(angle) * dist, 50, MAP_HEIGHT - 50);
      this.spawnLoot(x, y);
    }
  }

  private spawnLoot(x: number, y: number): void {
    const type = this.rollLootType();
    const drop: LootDrop = {
      id: `loot_${this.nextId++}`,
      type,
      x,
      y,
      value: 1,
      spawnTime: Date.now(),
    };
    const entity = new LootItemEntity(this.scene, drop);
    this.items.push(entity);
  }

  private rollLootType(): LootType {
    const roll = Math.random();
    let cumulative = 0;
    for (const [type, weight] of Object.entries(LOOT_WEIGHTS)) {
      cumulative += weight;
      if (roll <= cumulative) return type as LootType;
    }
    return 'health';
  }

  checkPickups(players: PlayerEntity[]): { player: PlayerEntity; loot: LootItemEntity }[] {
    const pickups: { player: PlayerEntity; loot: LootItemEntity }[] = [];

    for (const player of players) {
      if (!player.data.isAlive) continue;

      for (const item of this.items) {
        const dx = player.data.x - item.data.x;
        const dy = player.data.y - item.data.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= LOOT_PICKUP_RADIUS) {
          pickups.push({ player, loot: item });
        }
      }
    }

    return pickups;
  }

  removeLoot(item: LootItemEntity): void {
    const idx = this.items.indexOf(item);
    if (idx !== -1) {
      this.items.splice(idx, 1);
      item.destroy();
    }
  }

  despawnOutsideZone(zoneCenter: { x: number; y: number }, zoneRadius: number): void {
    const toRemove: LootItemEntity[] = [];
    for (const item of this.items) {
      const dx = item.data.x - zoneCenter.x;
      const dy = item.data.y - zoneCenter.y;
      if (Math.sqrt(dx * dx + dy * dy) > zoneRadius + 50) {
        toRemove.push(item);
      }
    }
    for (const item of toRemove) {
      this.removeLoot(item);
    }
  }

  getDropData(): { data: LootDrop; gameObject: Phaser.GameObjects.Arc }[] {
    return this.items.map(item => ({
      data: item.data,
      gameObject: item.body,
    }));
  }

  destroy(): void {
    for (const item of this.items) {
      item.destroy();
    }
    this.items = [];
  }
}
