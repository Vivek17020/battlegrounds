// Projectile entity for Battle Royale

import Phaser from 'phaser';
import { Projectile } from '../types';
import { PROJECTILE_SPEED, PROJECTILE_RADIUS, PROJECTILE_MAX_RANGE } from '../constants';

export class ProjectileEntity {
  scene: Phaser.Scene;
  data: Projectile;
  body: Phaser.GameObjects.Arc;
  trail: Phaser.GameObjects.Arc;

  constructor(
    scene: Phaser.Scene,
    id: string,
    x: number,
    y: number,
    targetX: number,
    targetY: number,
    ownerId: string,
    damage: number,
  ) {
    this.scene = scene;

    const angle = Math.atan2(targetY - y, targetX - x);
    this.data = {
      id,
      x,
      y,
      vx: Math.cos(angle) * PROJECTILE_SPEED,
      vy: Math.sin(angle) * PROJECTILE_SPEED,
      ownerId,
      damage,
      distanceTravelled: 0,
    };

    this.body = scene.add.circle(x, y, PROJECTILE_RADIUS, 0xffdd57, 1);
    this.body.setDepth(15);

    // Trail effect
    this.trail = scene.add.circle(x, y, PROJECTILE_RADIUS * 0.6, 0xffdd57, 0.4);
    this.trail.setDepth(14);
  }

  update(delta: number): boolean {
    const dt = delta / 1000;
    const moveX = this.data.vx * dt;
    const moveY = this.data.vy * dt;

    this.data.x += moveX;
    this.data.y += moveY;
    this.data.distanceTravelled += Math.sqrt(moveX * moveX + moveY * moveY);

    // Update trail position (slightly behind)
    this.trail.setPosition(
      this.data.x - moveX * 0.5,
      this.data.y - moveY * 0.5,
    );

    this.body.setPosition(this.data.x, this.data.y);

    // Check if expired
    return this.data.distanceTravelled < PROJECTILE_MAX_RANGE;
  }

  destroy(): void {
    // Small impact particles
    for (let i = 0; i < 3; i++) {
      const p = this.scene.add.circle(this.data.x, this.data.y, 2, 0xffdd57, 0.7).setDepth(16);
      const a = Math.random() * Math.PI * 2;
      this.scene.tweens.add({
        targets: p,
        x: this.data.x + Math.cos(a) * 15,
        y: this.data.y + Math.sin(a) * 15,
        alpha: 0,
        duration: 200,
        onComplete: () => p.destroy(),
      });
    }
    this.body.destroy();
    this.trail.destroy();
  }
}
