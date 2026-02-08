// Shrinking zone system - draws danger zone and applies damage

import Phaser from 'phaser';
import { ZoneState } from '../types';
import {
  MAP_WIDTH, MAP_HEIGHT, INITIAL_ZONE_RADIUS, ZONE_PHASES,
  ZONE_SHRINK_SPEED, ZONE_DAMAGE_INTERVAL,
} from '../constants';

export class ZoneSystem {
  scene: Phaser.Scene;
  state: ZoneState;
  graphics: Phaser.GameObjects.Graphics;
  borderGraphics: Phaser.GameObjects.Graphics;
  private lastDamageTick: number = 0;
  private pulseAlpha: number = 0;
  private pulseDir: number = 1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.state = {
      currentRadius: INITIAL_ZONE_RADIUS,
      targetRadius: INITIAL_ZONE_RADIUS,
      centerX: MAP_WIDTH / 2,
      centerY: MAP_HEIGHT / 2,
      damagePerTick: 0,
      phase: 0,
      phaseStartTime: 0,
      shrinking: false,
    };

    this.graphics = scene.add.graphics().setDepth(3);
    this.borderGraphics = scene.add.graphics().setDepth(4);
  }

  advancePhase(phase: number, matchTime: number): void {
    if (phase >= ZONE_PHASES.length) return;

    const [radiusPct, damage] = ZONE_PHASES[phase];
    this.state.phase = phase;
    this.state.targetRadius = INITIAL_ZONE_RADIUS * radiusPct;
    this.state.damagePerTick = damage;
    this.state.phaseStartTime = matchTime;
    this.state.shrinking = true;

    // Shift center slightly (random but clamped to stay valid)
    if (phase > 0) {
      const shift = 50 + Math.random() * 100;
      const angle = Math.random() * Math.PI * 2;
      const newCX = this.state.centerX + Math.cos(angle) * shift;
      const newCY = this.state.centerY + Math.sin(angle) * shift;
      const maxOffset = this.state.targetRadius * 0.3;
      this.state.centerX = Phaser.Math.Clamp(newCX, maxOffset + 50, MAP_WIDTH - maxOffset - 50);
      this.state.centerY = Phaser.Math.Clamp(newCY, maxOffset + 50, MAP_HEIGHT - maxOffset - 50);
    }
  }

  update(delta: number): void {
    // Lerp current radius toward target
    if (this.state.shrinking) {
      const lerpSpeed = ZONE_SHRINK_SPEED * (delta / 1000);
      this.state.currentRadius = Phaser.Math.Linear(
        this.state.currentRadius,
        this.state.targetRadius,
        Math.min(lerpSpeed, 1),
      );

      if (Math.abs(this.state.currentRadius - this.state.targetRadius) < 1) {
        this.state.currentRadius = this.state.targetRadius;
        this.state.shrinking = false;
      }
    }

    // Pulse border effect
    this.pulseAlpha += this.pulseDir * delta * 0.002;
    if (this.pulseAlpha > 0.6) { this.pulseAlpha = 0.6; this.pulseDir = -1; }
    if (this.pulseAlpha < 0.2) { this.pulseAlpha = 0.2; this.pulseDir = 1; }

    this.draw();
  }

  private draw(): void {
    const { currentRadius, centerX, centerY } = this.state;
    const g = this.graphics;
    const bg = this.borderGraphics;

    g.clear();
    bg.clear();

    // Draw danger zone as a filled rectangle with a circular hole (safe area)
    // Use masking approach: fill entire map red, then clear circle
    g.fillStyle(0xff0000, 0.15);
    g.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Clear safe zone circle
    g.fillStyle(0x000000, 0); // won't draw but we use begin/fill path
    // Phaser graphics: we draw the safe circle by re-filling with clear
    // Alternative: draw the zone border ring

    // Actually, for Phaser we use a different approach: draw a large rect mask
    // Simplest: just draw the danger overlay as a donut shape
    g.clear();

    // Outer danger zone (semi-transparent red overlay outside the circle)
    // Draw using a path approach
    g.fillStyle(0xff0000, 0.12);
    g.beginPath();
    // Outer rectangle (clockwise)
    g.moveTo(0, 0);
    g.lineTo(MAP_WIDTH, 0);
    g.lineTo(MAP_WIDTH, MAP_HEIGHT);
    g.lineTo(0, MAP_HEIGHT);
    g.closePath();

    // Inner circle hole (counter-clockwise)
    const steps = 64;
    g.moveTo(centerX + currentRadius, centerY);
    for (let i = steps; i >= 0; i--) {
      const a = (i / steps) * Math.PI * 2;
      g.lineTo(centerX + Math.cos(a) * currentRadius, centerY + Math.sin(a) * currentRadius);
    }
    g.fillPath();

    // Pulsing red border at zone edge
    bg.lineStyle(3, 0xff4444, this.pulseAlpha);
    bg.strokeCircle(centerX, centerY, currentRadius);

    // Inner warning line
    if (this.state.shrinking && this.state.targetRadius < currentRadius) {
      bg.lineStyle(1, 0xffaa00, 0.3);
      bg.strokeCircle(centerX, centerY, this.state.targetRadius);
    }
  }

  isInsideZone(x: number, y: number): boolean {
    const dx = x - this.state.centerX;
    const dy = y - this.state.centerY;
    return Math.sqrt(dx * dx + dy * dy) <= this.state.currentRadius;
  }

  shouldApplyDamage(now: number): boolean {
    if (this.state.damagePerTick <= 0) return false;
    if (now - this.lastDamageTick >= ZONE_DAMAGE_INTERVAL) {
      this.lastDamageTick = now;
      return true;
    }
    return false;
  }

  getCurrentPhaseTimeRemaining(matchElapsed: number): number {
    if (this.state.phase >= ZONE_PHASES.length - 1) return 0;
    const phaseDuration = ZONE_PHASES[this.state.phase][2] * 1000;
    const elapsed = matchElapsed - this.state.phaseStartTime;
    return Math.max(0, phaseDuration - elapsed);
  }

  destroy(): void {
    this.graphics.destroy();
    this.borderGraphics.destroy();
  }
}
