// Combat system - damage calculation, eliminations, kill tracking

import { PlayerEntity } from '../entities/Player';
import { ProjectileEntity } from '../entities/ProjectileEntity';
import { KillFeedEntry } from '../types';
import { PLAYER_RADIUS, PROJECTILE_RADIUS } from '../constants';

export class CombatSystem {
  killFeed: KillFeedEntry[] = [];
  eliminationOrder: string[] = []; // player IDs in order of elimination
  private nextProjectileId = 0;

  createProjectile(
    scene: Phaser.Scene,
    shooter: PlayerEntity,
    targetX: number,
    targetY: number,
  ): ProjectileEntity {
    const id = `proj_${this.nextProjectileId++}`;
    return new ProjectileEntity(
      scene,
      id,
      shooter.data.x,
      shooter.data.y,
      targetX,
      targetY,
      shooter.data.id,
      shooter.getTotalDamage(),
    );
  }

  checkProjectileHits(
    projectiles: ProjectileEntity[],
    players: PlayerEntity[],
  ): { hit: ProjectileEntity; victim: PlayerEntity; shooter: PlayerEntity | undefined }[] {
    const hits: { hit: ProjectileEntity; victim: PlayerEntity; shooter: PlayerEntity | undefined }[] = [];

    for (const proj of projectiles) {
      for (const player of players) {
        if (!player.data.isAlive) continue;
        if (player.data.id === proj.data.ownerId) continue;

        const dx = proj.data.x - player.data.x;
        const dy = proj.data.y - player.data.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= PLAYER_RADIUS + PROJECTILE_RADIUS) {
          const shooter = players.find(p => p.data.id === proj.data.ownerId);
          hits.push({ hit: proj, victim: player, shooter });
          break; // one projectile can only hit one player
        }
      }
    }

    return hits;
  }

  processHit(
    victim: PlayerEntity,
    damage: number,
    shooter: PlayerEntity | undefined,
    aliveCount: number,
  ): { eliminated: boolean; placement: number } {
    victim.takeDamage(damage);

    if (victim.data.health <= 0 && victim.data.isAlive) {
      victim.die();

      if (shooter && shooter.data.id !== victim.data.id) {
        shooter.data.kills++;
      }

      this.eliminationOrder.push(victim.data.id);
      const placement = aliveCount; // they're the Nth alive, so placement = current alive count
      victim.data.placement = placement;

      this.killFeed.push({
        killer: shooter?.data.name ?? 'Zone',
        victim: victim.data.name,
        timestamp: Date.now(),
      });

      // Keep only last 5 kill feed entries
      if (this.killFeed.length > 5) {
        this.killFeed = this.killFeed.slice(-5);
      }

      return { eliminated: true, placement };
    }

    return { eliminated: false, placement: 0 };
  }

  processZoneDamage(
    player: PlayerEntity,
    damage: number,
    aliveCount: number,
  ): { eliminated: boolean; placement: number } {
    player.takeDamage(damage, true); // bypass shield

    if (player.data.health <= 0 && player.data.isAlive) {
      player.die();
      this.eliminationOrder.push(player.data.id);
      const placement = aliveCount;
      player.data.placement = placement;

      this.killFeed.push({
        killer: 'Zone',
        victim: player.data.name,
        timestamp: Date.now(),
      });

      if (this.killFeed.length > 5) {
        this.killFeed = this.killFeed.slice(-5);
      }

      return { eliminated: true, placement };
    }

    return { eliminated: false, placement: 0 };
  }

  getRecentKills(count: number = 3): KillFeedEntry[] {
    return this.killFeed.slice(-count);
  }
}
