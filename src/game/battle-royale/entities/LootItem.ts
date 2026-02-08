// Loot item entity for Battle Royale

import Phaser from 'phaser';
import { LootDrop, LootType } from '../types';
import { LOOT_RADIUS } from '../constants';

const LOOT_COLORS: Record<LootType, number> = {
  health: 0x22c55e,  // green
  shield: 0x3b82f6,  // blue
  damage: 0xef4444,  // red
  speed: 0xeab308,   // yellow
};

export class LootItemEntity {
  scene: Phaser.Scene;
  data: LootDrop;
  body: Phaser.GameObjects.Arc;
  glow: Phaser.GameObjects.Arc;
  icon: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, drop: LootDrop) {
    this.scene = scene;
    this.data = drop;

    const color = LOOT_COLORS[drop.type];

    // Outer glow
    this.glow = scene.add.circle(drop.x, drop.y, LOOT_RADIUS + 4, color, 0.15);
    this.glow.setDepth(5);

    // Main body
    this.body = scene.add.circle(drop.x, drop.y, LOOT_RADIUS, color, 0.8);
    this.body.setDepth(6);

    // Icon text
    const icons: Record<LootType, string> = {
      health: '+',
      shield: '◆',
      damage: '↑',
      speed: '⚡',
    };
    this.icon = scene.add.text(drop.x, drop.y, icons[drop.type], {
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '10px',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(7);

    // Pulse animation
    scene.tweens.add({
      targets: [this.glow],
      scale: 1.3,
      alpha: 0.08,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    scene.tweens.add({
      targets: [this.body],
      scale: 1.1,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  destroy(): void {
    // Pickup flash effect
    const flash = this.scene.add.circle(this.data.x, this.data.y, LOOT_RADIUS * 2, LOOT_COLORS[this.data.type], 0.5).setDepth(20);
    this.scene.tweens.add({
      targets: flash,
      scale: 2,
      alpha: 0,
      duration: 300,
      onComplete: () => flash.destroy(),
    });

    this.body.destroy();
    this.glow.destroy();
    this.icon.destroy();
  }
}
