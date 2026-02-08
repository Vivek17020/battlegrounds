// Main Battle Royale Phaser Scene

import Phaser from 'phaser';
import { PlayerEntity } from './entities/Player';
import { BotEntity } from './entities/Bot';
import { ProjectileEntity } from './entities/ProjectileEntity';
import { ZoneSystem } from './systems/ZoneSystem';
import { LootSystem } from './systems/LootSystem';
import { CombatSystem } from './systems/CombatSystem';
import { Minimap } from './ui/Minimap';
import { BattleSceneEvents, MatchPhase, KillFeedEntry } from './types';
import { AntiCheatCollector } from './match-result-types';
import {
  MAP_WIDTH, MAP_HEIGHT, GRID_SIZE, PLAYER_RADIUS,
  ZONE_PHASES, BOTS_PER_FRAME, COUNTDOWN_DURATION,
  BOT_NAMES, BOT_DECISION_INTERVAL, LOOT_PICKUP_RADIUS,
} from './constants';

export class BattleScene extends Phaser.Scene {
  // Entities
  humanPlayer!: PlayerEntity;
  bots: BotEntity[] = [];
  allPlayers: PlayerEntity[] = [];
  projectiles: ProjectileEntity[] = [];

  // Systems
  zoneSystem!: ZoneSystem;
  lootSystem!: LootSystem;
  combatSystem!: CombatSystem;
  minimap!: Minimap;

  // Input
  keys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  pointer!: Phaser.Input.Pointer;

  // Match state
  matchPhase: MatchPhase = 'countdown';
  matchStartTime: number = 0;
  aliveCount: number = 0;
  currentZonePhase: number = 0;
  botUpdateIndex: number = 0;
  countdownValue: number = COUNTDOWN_DURATION;
  countdownText!: Phaser.GameObjects.Text;
  killFeedTexts: Phaser.GameObjects.Text[] = [];
  matchId: string = '';

  // Anti-cheat
  antiCheatCollector: AntiCheatCollector = new AntiCheatCollector();
  movementSampleCounter: number = 0;

  // Config
  playerCount: number;
  callbacks: BattleSceneEvents;

  constructor() {
    super({ key: 'BattleScene' });
    this.playerCount = 20;
    this.callbacks = {
      onHealthChange: () => {},
      onKillsChange: () => {},
      onAliveCountChange: () => {},
      onPhaseChange: () => {},
      onKillFeed: () => {},
      onMatchEnd: () => {},
      onPlayerPosition: () => {},
      onInventoryChange: () => {},
      onCountdown: () => {},
    };
  }

  init(data?: { playerCount?: number; callbacks?: BattleSceneEvents; matchId?: string }) {
    if (typeof data?.playerCount === 'number') {
      this.playerCount = data.playerCount;
    }
    if (data?.callbacks) {
      this.callbacks = data.callbacks;
    }

    // Phaser can call init() without any payload during boot; keep existing callbacks.
    this.matchId = data?.matchId || this.matchId || crypto.randomUUID();
    this.antiCheatCollector.reset();
  }

  create() {
    // World bounds
    this.physics?.world?.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Draw grid background
    this.drawGrid();

    // Initialize systems
    this.zoneSystem = new ZoneSystem(this);
    this.lootSystem = new LootSystem(this);
    this.combatSystem = new CombatSystem();
    this.minimap = new Minimap(this);

    // Spawn human player at random position
    const px = 200 + Math.random() * (MAP_WIDTH - 400);
    const py = 200 + Math.random() * (MAP_HEIGHT - 400);
    this.humanPlayer = new PlayerEntity(this, 'player_0', 'YOU', px, py, false, 0x00ffaa);
    this.allPlayers.push(this.humanPlayer);

    // Spawn bots (only for multiplayer modes)
    const botCount = this.playerCount - 1;
    if (botCount > 0) {
      const shuffledNames = [...BOT_NAMES].sort(() => Math.random() - 0.5);
      const botColors = [0xff6b6b, 0xffa94d, 0xffd43b, 0x69db7c, 0x4dabf7, 0xda77f2, 0xf783ac];

      for (let i = 0; i < botCount; i++) {
        const bx = 100 + Math.random() * (MAP_WIDTH - 200);
        const by = 100 + Math.random() * (MAP_HEIGHT - 200);
        const name = shuffledNames[i % shuffledNames.length];
        const color = botColors[i % botColors.length];
        const bot = new BotEntity(this, `bot_${i}`, name, bx, by, color);
        this.bots.push(bot);
        this.allPlayers.push(bot);
      }
    }

    this.aliveCount = this.allPlayers.length;

    // Spawn initial loot
    this.lootSystem.spawnInitial();

    // Camera follow player
    this.cameras.main.startFollow(this.humanPlayer.body, true, 0.1, 0.1);

    // Input
    this.keys = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.pointer = this.input.activePointer;

    // Click to shoot
    this.input.on('pointerdown', () => {
      if (this.matchPhase !== 'active' || !this.humanPlayer.data.isAlive) return;
      const now = Date.now();
      if (!this.humanPlayer.canShoot(now)) return;

      const worldPoint = this.cameras.main.getWorldPoint(this.pointer.x, this.pointer.y);
      this.humanPlayer.markShot(now);
      const proj = this.combatSystem.createProjectile(
        this, this.humanPlayer, worldPoint.x, worldPoint.y
      );
      this.projectiles.push(proj);
    });

    // Countdown
    this.countdownText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      String(COUNTDOWN_DURATION),
      {
        fontFamily: 'Space Grotesk, sans-serif',
        fontSize: '72px',
        color: '#00ffaa',
        fontStyle: 'bold',
      }
    ).setOrigin(0.5).setDepth(200).setScrollFactor(0);

    // Kill feed texts (top-right, fixed to camera)
    for (let i = 0; i < 3; i++) {
      const kft = this.add.text(
        this.cameras.main.width - 10,
        10 + i * 18,
        '',
        {
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '10px',
          color: '#ffffff',
          align: 'right',
        }
      ).setOrigin(1, 0).setDepth(200).setScrollFactor(0).setAlpha(0.8);
      this.killFeedTexts.push(kft);
    }

    // Start countdown
    this.matchPhase = 'countdown';
    this.startCountdown();
  }

  private drawGrid() {
    const grid = this.add.graphics().setDepth(0);
    grid.fillStyle(0x0a0a1a, 1);
    grid.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    grid.lineStyle(1, 0x1a1a3a, 0.3);
    for (let x = 0; x <= MAP_WIDTH; x += GRID_SIZE) {
      grid.moveTo(x, 0);
      grid.lineTo(x, MAP_HEIGHT);
    }
    for (let y = 0; y <= MAP_HEIGHT; y += GRID_SIZE) {
      grid.moveTo(0, y);
      grid.lineTo(MAP_WIDTH, y);
    }
    grid.strokePath();

    // Map border
    grid.lineStyle(3, 0x2a2a4a, 0.8);
    grid.strokeRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
  }

  private startCountdown() {
    this.countdownValue = COUNTDOWN_DURATION;
    this.callbacks.onCountdown(this.countdownValue);

    const timer = this.time.addEvent({
      delay: 1000,
      callback: () => {
        this.countdownValue--;
        if (this.countdownValue > 0) {
          this.countdownText.setText(String(this.countdownValue));
          this.callbacks.onCountdown(this.countdownValue);
          // Scale pop effect
          this.countdownText.setScale(1.3);
          this.tweens.add({ targets: this.countdownText, scale: 1, duration: 200 });
        } else {
          this.countdownText.setText('GO!');
          this.countdownText.setColor('#ffd700');
          this.tweens.add({
            targets: this.countdownText,
            scale: 1.5,
            alpha: 0,
            duration: 500,
            onComplete: () => this.countdownText.setVisible(false),
          });
          this.matchPhase = 'active';
          this.matchStartTime = Date.now();
          this.zoneSystem.advancePhase(0, 0);
          this.callbacks.onCountdown(0);
          timer.destroy();
        }
      },
      repeat: COUNTDOWN_DURATION,
    });
  }

  update(time: number, delta: number) {
    if (this.matchPhase !== 'active') return;

    const now = Date.now();
    const matchElapsed = now - this.matchStartTime;

    // Record frame for anti-cheat
    this.antiCheatCollector.recordFrame(now);

    // --- Player input ---
    if (this.humanPlayer.data.isAlive) {
      let dx = 0, dy = 0;
      if (this.keys.W.isDown) dy = -1;
      if (this.keys.S.isDown) dy = 1;
      if (this.keys.A.isDown) dx = -1;
      if (this.keys.D.isDown) dx = 1;

      // Record input for anti-cheat if any movement
      if (dx !== 0 || dy !== 0) {
        this.antiCheatCollector.recordInput(now);
      }

      this.humanPlayer.move(dx, dy, delta);

      // Record movement samples for anti-cheat (every 10th frame)
      this.movementSampleCounter++;
      if (this.movementSampleCounter >= 10) {
        this.antiCheatCollector.recordMovement(this.humanPlayer.data.x, this.humanPlayer.data.y);
        this.movementSampleCounter = 0;
      }

      // Aim at mouse
      const worldPoint = this.cameras.main.getWorldPoint(this.pointer.x, this.pointer.y);
      const aimAngle = Math.atan2(
        worldPoint.y - this.humanPlayer.data.y,
        worldPoint.x - this.humanPlayer.data.x,
      );
      this.humanPlayer.setAimAngle(aimAngle);
      this.callbacks.onPlayerPosition(this.humanPlayer.data.x, this.humanPlayer.data.y);
    }

    // --- Bot AI (staggered) ---
    const botsAlive = this.bots.filter(b => b.data.isAlive);
    const botsToUpdate = Math.min(BOTS_PER_FRAME, botsAlive.length);
    for (let i = 0; i < botsToUpdate; i++) {
      const idx = (this.botUpdateIndex + i) % botsAlive.length;
      const bot = botsAlive[idx];

      const decision = bot.makeDecision(
        this.allPlayers,
        this.lootSystem.getDropData(),
        { x: this.zoneSystem.state.centerX, y: this.zoneSystem.state.centerY },
        this.zoneSystem.state.currentRadius,
        now,
      );

      bot.move(decision.moveX, decision.moveY, delta);

      if (decision.shouldShoot && decision.shootTarget) {
        bot.markShot(now);
        const proj = this.combatSystem.createProjectile(
          this, bot, decision.shootTarget.x, decision.shootTarget.y
        );
        this.projectiles.push(proj);
      }

      // Update aim angle for visual
      if (decision.shootTarget) {
        bot.setAimAngle(Math.atan2(
          decision.shootTarget.y - bot.data.y,
          decision.shootTarget.x - bot.data.x,
        ));
      }
    }
    this.botUpdateIndex = (this.botUpdateIndex + botsToUpdate) % Math.max(1, botsAlive.length);

    // --- Projectiles ---
    const toRemove: ProjectileEntity[] = [];
    for (const proj of this.projectiles) {
      const alive = proj.update(delta);
      if (!alive) toRemove.push(proj);
    }

    // Check hits
    const hits = this.combatSystem.checkProjectileHits(this.projectiles, this.allPlayers);
    for (const { hit, victim, shooter } of hits) {
      const result = this.combatSystem.processHit(victim, hit.data.damage, shooter, this.aliveCount);
      if (result.eliminated) {
        this.aliveCount--;
        this.callbacks.onAliveCountChange(this.aliveCount);
        this.callbacks.onKillFeed(this.combatSystem.killFeed[this.combatSystem.killFeed.length - 1]);

        if (shooter && shooter.data.id === 'player_0') {
          this.callbacks.onKillsChange(this.humanPlayer.data.kills);
        }

        if (victim.data.id === 'player_0') {
          this.endMatch();
          return;
        }
      }

      if (!toRemove.includes(hit)) toRemove.push(hit);

      // Update HUD if human was hit
      if (victim.data.id === 'player_0') {
        this.callbacks.onHealthChange(this.humanPlayer.data.health, this.humanPlayer.data.shield);
      }
    }

    // Remove dead projectiles
    for (const proj of toRemove) {
      const idx = this.projectiles.indexOf(proj);
      if (idx !== -1) {
        this.projectiles.splice(idx, 1);
        proj.destroy();
      }
    }

    // --- Zone ---
    this.zoneSystem.update(delta);

    // Check zone phase advancement
    const currentPhaseDuration = ZONE_PHASES[this.currentZonePhase]?.[2] ?? 30;
    if (matchElapsed > (this.currentZonePhase + 1) * currentPhaseDuration * 1000) {
      if (this.currentZonePhase < ZONE_PHASES.length - 1) {
        this.currentZonePhase++;
        this.zoneSystem.advancePhase(this.currentZonePhase, matchElapsed);
        this.lootSystem.spawnPhaseItems(
          { x: this.zoneSystem.state.centerX, y: this.zoneSystem.state.centerY },
          this.zoneSystem.state.currentRadius,
        );
        this.callbacks.onPhaseChange(
          this.currentZonePhase,
          this.zoneSystem.getCurrentPhaseTimeRemaining(matchElapsed),
        );
      }
    }

    // Zone damage
    if (this.zoneSystem.shouldApplyDamage(now)) {
      for (const player of this.allPlayers) {
        if (!player.data.isAlive) continue;
        if (!this.zoneSystem.isInsideZone(player.data.x, player.data.y)) {
          const result = this.combatSystem.processZoneDamage(
            player, this.zoneSystem.state.damagePerTick, this.aliveCount
          );
          if (result.eliminated) {
            this.aliveCount--;
            this.callbacks.onAliveCountChange(this.aliveCount);

            if (player.data.id === 'player_0') {
              this.endMatch();
              return;
            }
          }

          if (player.data.id === 'player_0') {
            this.callbacks.onHealthChange(this.humanPlayer.data.health, this.humanPlayer.data.shield);
          }
        }
      }
    }

    // Despawn loot outside zone
    this.lootSystem.despawnOutsideZone(
      { x: this.zoneSystem.state.centerX, y: this.zoneSystem.state.centerY },
      this.zoneSystem.state.currentRadius,
    );

    // --- Loot pickups ---
    const pickups = this.lootSystem.checkPickups(this.allPlayers);
    for (const { player, loot } of pickups) {
      player.applyLoot(loot.data.type);
      this.lootSystem.removeLoot(loot);

      if (player.data.id === 'player_0') {
        this.callbacks.onHealthChange(this.humanPlayer.data.health, this.humanPlayer.data.shield);
        this.callbacks.onInventoryChange(this.humanPlayer.data.inventory);
      }
    }

    // --- Win condition ---
    // Solo mode: survive as long as possible (no win, just death ends)
    // Multiplayer: last player standing wins
    if (this.playerCount > 1 && this.aliveCount <= 1) {
      if (this.humanPlayer.data.isAlive) {
        this.humanPlayer.data.placement = 1;
      }
      this.endMatch();
      return;
    }

    // --- Update phase timer to React ---
    this.callbacks.onPhaseChange(
      this.currentZonePhase,
      this.zoneSystem.getCurrentPhaseTimeRemaining(matchElapsed),
    );

    // --- Minimap ---
    this.minimap.update(this.allPlayers, 'player_0', this.zoneSystem, this.cameras.main);

    // --- Kill feed display ---
    const recentKills = this.combatSystem.getRecentKills(3);
    for (let i = 0; i < this.killFeedTexts.length; i++) {
      if (i < recentKills.length) {
        const k = recentKills[recentKills.length - 1 - i];
        this.killFeedTexts[i].setText(`${k.killer} ▸ ${k.victim}`);
        // Fade based on age
        const age = now - k.timestamp;
        this.killFeedTexts[i].setAlpha(Math.max(0.2, 1 - age / 5000));
      } else {
        this.killFeedTexts[i].setText('');
      }
    }
  }

  private endMatch() {
    this.matchPhase = 'ended';

    const placement = this.humanPlayer.data.placement || this.aliveCount;
    const durationMs = Date.now() - this.matchStartTime;
    const survivalTime = durationMs / 1000;

    // Collect anti-cheat signals
    const antiCheatSignals = this.antiCheatCollector.getSignals();

    // Import inline to avoid circular dependency
    const { RankingSystem } = require('./systems/RankingSystem');
    const ranking = new RankingSystem();
    const result = ranking.processMatchResult(
      placement,
      this.humanPlayer.data.kills,
      survivalTime,
      this.playerCount,
    );

    // Augment result with match data for MCP submission
    const augmentedResult = {
      ...result,
      matchId: this.matchId,
      playerCount: this.playerCount,
      durationMs,
      antiCheatSignals,
    };

    this.callbacks.onMatchEnd(augmentedResult);
  }

  cleanup() {
    // Clean up all entities
    for (const p of this.allPlayers) p.destroy();
    for (const proj of this.projectiles) proj.destroy();
    this.zoneSystem.destroy();
    this.lootSystem.destroy();
    this.minimap.destroy();
    this.allPlayers = [];
    this.bots = [];
    this.projectiles = [];
  }
}
