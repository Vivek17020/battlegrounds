// Player entity for Battle Royale - renders as a colored circle with health bar

import Phaser from 'phaser';
import { BattlePlayer, LootType } from '../types';
import {
  PLAYER_RADIUS, PLAYER_MAX_HP, PLAYER_MAX_SHIELD, PLAYER_BASE_SPEED,
  PLAYER_BASE_DAMAGE, MAX_INVENTORY, SHOOT_COOLDOWN, MAP_WIDTH, MAP_HEIGHT,
  LOOT_VALUES, SPEED_BOOST_DURATION,
} from '../constants';

export class PlayerEntity {
  scene: Phaser.Scene;
  data: BattlePlayer;
  body: Phaser.GameObjects.Arc;
  dirIndicator: Phaser.GameObjects.Arc;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
  shieldBarFill: Phaser.GameObjects.Rectangle;
  nameText: Phaser.GameObjects.Text;
  aimAngle: number = 0;

  constructor(
    scene: Phaser.Scene,
    id: string,
    name: string,
    x: number,
    y: number,
    isBot: boolean,
    color: number = 0x00ffaa,
  ) {
    this.scene = scene;

    this.data = {
      id,
      name,
      x,
      y,
      health: PLAYER_MAX_HP,
      maxHealth: PLAYER_MAX_HP,
      shield: 0,
      maxShield: PLAYER_MAX_SHIELD,
      speed: PLAYER_BASE_SPEED,
      baseDamage: PLAYER_BASE_DAMAGE,
      damageBonus: 0,
      isAlive: true,
      isBot,
      kills: 0,
      inventory: [],
      lastShootTime: 0,
      placement: 0,
      eliminatedAt: 0,
      speedBoostEnd: 0,
    };

    // Main body circle
    this.body = scene.add.circle(x, y, PLAYER_RADIUS, color, 0.9);
    this.body.setDepth(10);

    // Direction indicator (small dot on edge)
    this.dirIndicator = scene.add.circle(x + PLAYER_RADIUS, y, 3, 0xffffff, 0.9);
    this.dirIndicator.setDepth(11);

    // Health bar background
    this.hpBarBg = scene.add.rectangle(x, y - PLAYER_RADIUS - 8, 28, 4, 0x1a1a2e, 0.8);
    this.hpBarBg.setDepth(12);

    // Health bar fill
    this.hpBarFill = scene.add.rectangle(x, y - PLAYER_RADIUS - 8, 28, 4, 0x00ff88, 0.9);
    this.hpBarFill.setDepth(13);

    // Shield bar fill (offset below hp)
    this.shieldBarFill = scene.add.rectangle(x, y - PLAYER_RADIUS - 3, 28, 2, 0x3b82f6, 0.9);
    this.shieldBarFill.setDepth(13);
    this.shieldBarFill.setVisible(false);

    // Name text
    this.nameText = scene.add.text(x, y - PLAYER_RADIUS - 16, name, {
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '8px',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5).setDepth(14).setAlpha(0.7);
  }

  getEffectiveSpeed(): number {
    const now = Date.now();
    const boosted = this.data.speedBoostEnd > now;
    return this.data.speed * (boosted ? 1.2 : 1);
  }

  move(dx: number, dy: number, delta: number): void {
    if (!this.data.isAlive) return;
    const speed = this.getEffectiveSpeed();
    const dt = delta / 1000;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const nx = dx / len;
    const ny = dy / len;

    this.data.x = Phaser.Math.Clamp(this.data.x + nx * speed * dt, PLAYER_RADIUS, MAP_WIDTH - PLAYER_RADIUS);
    this.data.y = Phaser.Math.Clamp(this.data.y + ny * speed * dt, PLAYER_RADIUS, MAP_HEIGHT - PLAYER_RADIUS);
    this.updateVisuals();
  }

  setAimAngle(angle: number): void {
    this.aimAngle = angle;
    this.updateDirIndicator();
  }

  canShoot(now: number): boolean {
    return now - this.data.lastShootTime >= SHOOT_COOLDOWN;
  }

  markShot(now: number): void {
    this.data.lastShootTime = now;
  }

  takeDamage(amount: number, bypassShield: boolean = false): number {
    if (!this.data.isAlive) return 0;

    let remaining = amount;
    if (!bypassShield && this.data.shield > 0) {
      const shieldDmg = Math.min(this.data.shield, remaining);
      this.data.shield -= shieldDmg;
      remaining -= shieldDmg;
    }

    this.data.health = Math.max(0, this.data.health - remaining);
    this.updateHealthBar();
    return amount;
  }

  heal(amount: number): void {
    this.data.health = Math.min(this.data.maxHealth, this.data.health + amount);
    this.updateHealthBar();
  }

  addShield(amount: number): void {
    this.data.shield = Math.min(this.data.maxShield, this.data.shield + amount);
    this.updateHealthBar();
  }

  applyLoot(type: LootType): void {
    switch (type) {
      case 'health':
        this.heal(LOOT_VALUES.health);
        break;
      case 'shield':
        this.addShield(LOOT_VALUES.shield);
        break;
      case 'damage':
        this.data.damageBonus += LOOT_VALUES.damage;
        break;
      case 'speed':
        this.data.speedBoostEnd = Date.now() + SPEED_BOOST_DURATION;
        break;
    }
  }

  getTotalDamage(): number {
    return this.data.baseDamage + this.data.damageBonus;
  }

  die(): void {
    this.data.isAlive = false;
    this.data.eliminatedAt = Date.now();

    // Death explosion particles
    for (let i = 0; i < 15; i++) {
      const p = this.scene.add.circle(
        this.data.x, this.data.y,
        Math.random() * 4 + 1,
        0xff4444, 0.9
      ).setDepth(20);
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 80;
      this.scene.tweens.add({
        targets: p,
        x: this.data.x + Math.cos(angle) * dist,
        y: this.data.y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0,
        duration: 500 + Math.random() * 300,
        onComplete: () => p.destroy(),
      });
    }

    this.setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.body.setVisible(visible);
    this.dirIndicator.setVisible(visible);
    this.hpBarBg.setVisible(visible);
    this.hpBarFill.setVisible(visible);
    this.shieldBarFill.setVisible(visible && this.data.shield > 0);
    this.nameText.setVisible(visible);
  }

  updateVisuals(): void {
    this.body.setPosition(this.data.x, this.data.y);
    this.hpBarBg.setPosition(this.data.x, this.data.y - PLAYER_RADIUS - 8);
    this.hpBarFill.setPosition(this.data.x, this.data.y - PLAYER_RADIUS - 8);
    this.shieldBarFill.setPosition(this.data.x, this.data.y - PLAYER_RADIUS - 3);
    this.nameText.setPosition(this.data.x, this.data.y - PLAYER_RADIUS - 16);
    this.updateDirIndicator();
    this.updateHealthBar();
  }

  private updateDirIndicator(): void {
    this.dirIndicator.setPosition(
      this.data.x + Math.cos(this.aimAngle) * PLAYER_RADIUS,
      this.data.y + Math.sin(this.aimAngle) * PLAYER_RADIUS,
    );
  }

  private updateHealthBar(): void {
    const hpPct = this.data.health / this.data.maxHealth;
    this.hpBarFill.setScale(hpPct, 1);
    const offsetX = (28 * (1 - hpPct)) / 2;
    this.hpBarFill.setPosition(this.data.x - offsetX, this.data.y - PLAYER_RADIUS - 8);

    // Color based on HP
    const color = hpPct > 0.5 ? 0x00ff88 : hpPct > 0.25 ? 0xf59e0b : 0xef4444;
    this.hpBarFill.setFillStyle(color, 0.9);

    // Shield bar
    if (this.data.shield > 0) {
      this.shieldBarFill.setVisible(true);
      const shieldPct = this.data.shield / this.data.maxShield;
      this.shieldBarFill.setScale(shieldPct, 1);
      const sOffX = (28 * (1 - shieldPct)) / 2;
      this.shieldBarFill.setPosition(this.data.x - sOffX, this.data.y - PLAYER_RADIUS - 3);
    } else {
      this.shieldBarFill.setVisible(false);
    }
  }

  destroy(): void {
    this.body.destroy();
    this.dirIndicator.destroy();
    this.hpBarBg.destroy();
    this.hpBarFill.destroy();
    this.shieldBarFill.destroy();
    this.nameText.destroy();
  }
}
