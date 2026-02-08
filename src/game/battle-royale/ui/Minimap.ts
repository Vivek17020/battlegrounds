// Minimap overlay for Battle Royale

import Phaser from 'phaser';
import { PlayerEntity } from '../entities/Player';
import { ZoneSystem } from '../systems/ZoneSystem';
import { MAP_WIDTH, MAP_HEIGHT } from '../constants';

const MINIMAP_SIZE = 140;
const MINIMAP_PADDING = 10;

export class Minimap {
  scene: Phaser.Scene;
  graphics: Phaser.GameObjects.Graphics;
  private offsetX: number;
  private offsetY: number;
  private scale: number;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.scale = MINIMAP_SIZE / MAP_WIDTH;

    // Position in bottom-right of camera viewport
    this.offsetX = 0;
    this.offsetY = 0;

    this.graphics = scene.add.graphics();
    this.graphics.setDepth(100);
    this.graphics.setScrollFactor(0); // Fixed to camera
  }

  update(
    players: PlayerEntity[],
    humanPlayerId: string,
    zone: ZoneSystem,
    camera: Phaser.Cameras.Scene2D.Camera,
  ): void {
    const g = this.graphics;
    g.clear();

    // Calculate position relative to camera viewport
    const vw = camera.width;
    const vh = camera.height;
    this.offsetX = vw - MINIMAP_SIZE - MINIMAP_PADDING;
    this.offsetY = vh - MINIMAP_SIZE - MINIMAP_PADDING;

    // Background
    g.fillStyle(0x0a0a1a, 0.85);
    g.fillRoundedRect(this.offsetX, this.offsetY, MINIMAP_SIZE, MINIMAP_SIZE, 4);

    // Border
    g.lineStyle(1, 0x2a2a4a, 0.8);
    g.strokeRoundedRect(this.offsetX, this.offsetY, MINIMAP_SIZE, MINIMAP_SIZE, 4);

    // Zone circle
    const zx = this.offsetX + zone.state.centerX * this.scale;
    const zy = this.offsetY + zone.state.centerY * this.scale;
    const zr = zone.state.currentRadius * this.scale;
    g.lineStyle(1, 0xff4444, 0.6);
    g.strokeCircle(zx, zy, zr);

    // Target zone
    if (zone.state.shrinking) {
      g.lineStyle(1, 0xffaa00, 0.3);
      g.strokeCircle(zx, zy, zone.state.targetRadius * this.scale);
    }

    // Player dots
    for (const player of players) {
      if (!player.data.isAlive) continue;
      const px = this.offsetX + player.data.x * this.scale;
      const py = this.offsetY + player.data.y * this.scale;

      if (player.data.id === humanPlayerId) {
        // Human player - bright green, slightly larger
        g.fillStyle(0x00ffaa, 1);
        g.fillCircle(px, py, 3);
      } else {
        // Bots - red dots
        g.fillStyle(0xff4444, 0.7);
        g.fillCircle(px, py, 1.5);
      }
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
