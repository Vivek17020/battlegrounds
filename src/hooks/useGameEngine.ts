import { useEffect, useRef, useCallback } from "react";
import Phaser from "phaser";
import { AIDecision } from "../game/types";

interface UseGameEngineProps {
  containerRef: React.RefObject<HTMLDivElement>;
  onScoreChange: (score: number) => void;
  onComboChange: (combo: number) => void;
  onTargetDestroyed: () => void;
  onRoundEnd: (stats: { totalClicks: number; comboMax: number; avgCps: number }) => void;
}

// All game state lives here (outside Phaser scene class for simplicity)
interface GameState {
  targetHP: number;
  maxHP: number;
  score: number;
  combo: number;
  comboMax: number;
  totalClicks: number;
  clickTimestamps: number[];
  lastClickTime: number;
  difficultyMultiplier: number;
  rewardMultiplier: number;
  roundActive: boolean;
}

export function useGameEngine({
  containerRef,
  onScoreChange,
  onComboChange,
  onTargetDestroyed,
  onRoundEnd,
}: UseGameEngineProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const stateRef = useRef<GameState>({
    targetHP: 50,
    maxHP: 50,
    score: 0,
    combo: 0,
    comboMax: 0,
    totalClicks: 0,
    clickTimestamps: [],
    lastClickTime: 0,
    difficultyMultiplier: 1,
    rewardMultiplier: 1,
    roundActive: true,
  });

  const callbacksRef = useRef({ onScoreChange, onComboChange, onTargetDestroyed, onRoundEnd });
  useEffect(() => {
    callbacksRef.current = { onScoreChange, onComboChange, onTargetDestroyed, onRoundEnd };
  }, [onScoreChange, onComboChange, onTargetDestroyed, onRoundEnd]);

  // Refs for Phaser objects we need to access
  const phaserRefs = useRef<{
    target?: Phaser.GameObjects.Arc;
    hpBar?: Phaser.GameObjects.Graphics;
    comboText?: Phaser.GameObjects.Text;
    aiMessage?: Phaser.GameObjects.Text;
    scene?: Phaser.Scene;
    comboTimer?: Phaser.Time.TimerEvent;
  }>({});

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: containerRef.current.clientWidth,
      height: Math.max(containerRef.current.clientHeight, 400),
      transparent: true,
      scene: {
        create: function (this: Phaser.Scene) {
          const scene = this;
          phaserRefs.current.scene = scene;
          const { width, height } = scene.scale;
          const cx = width / 2;
          const cy = height / 2;

          // Ambient dots
          for (let i = 0; i < 25; i++) {
            const dot = scene.add.circle(
              Math.random() * width,
              Math.random() * height,
              Math.random() * 2 + 0.5,
              0x00ffaa,
              0.12
            );
            scene.tweens.add({
              targets: dot,
              y: dot.y - 30 - Math.random() * 50,
              alpha: 0,
              duration: 3000 + Math.random() * 4000,
              repeat: -1,
              yoyo: true,
            });
          }

          // HP bar
          const hpBar = scene.add.graphics();
          phaserRefs.current.hpBar = hpBar;
          drawHP(scene, hpBar);

          // Target orb
          const target = scene.add.circle(cx, cy, 45, 0x00ffaa, 0.9);
          target.setInteractive({ useHandCursor: true });
          target.setStrokeStyle(2, 0x00ffaa, 0.4);
          phaserRefs.current.target = target;

          // Idle pulse
          scene.tweens.add({
            targets: target,
            scaleX: 1.08,
            scaleY: 1.08,
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
          });

          // Combo text
          const comboText = scene.add
            .text(cx, cy - 80, "", {
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "14px",
              color: "#00ffaa",
              align: "center",
            })
            .setOrigin(0.5);
          phaserRefs.current.comboText = comboText;

          // AI message
          const aiMsg = scene.add
            .text(cx, height - 30, "", {
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "11px",
              color: "#8b5cf6",
              align: "center",
            })
            .setOrigin(0.5)
            .setAlpha(0);
          phaserRefs.current.aiMessage = aiMsg;

          // Click handler
          target.on("pointerdown", () => handleClick(scene));
        },
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    };

    gameRef.current = new Phaser.Game(config);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      phaserRefs.current = {};
    };
  }, [containerRef]);

  function drawHP(scene: Phaser.Scene, hpBar: Phaser.GameObjects.Graphics) {
    const s = stateRef.current;
    const { width } = scene.scale;
    const barW = 200,
      barH = 8;
    const barX = (width - barW) / 2,
      barY = 20;

    hpBar.clear();
    hpBar.fillStyle(0x1a1a2e, 0.8);
    hpBar.fillRoundedRect(barX, barY, barW, barH, 4);
    const pct = Math.max(0, s.targetHP / s.maxHP);
    const color = pct > 0.5 ? 0x00ffaa : pct > 0.25 ? 0xf59e0b : 0xef4444;
    hpBar.fillStyle(color, 0.9);
    hpBar.fillRoundedRect(barX, barY, barW * pct, barH, 4);
  }

  function spawnParticles(scene: Phaser.Scene, x: number, y: number, isCombo: boolean) {
    for (let i = 0; i < 5; i++) {
      const p = scene.add.circle(x, y, Math.random() * 3 + 1, isCombo ? 0x8b5cf6 : 0x00ffaa, 0.8);
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 50;
      scene.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0,
        duration: 400 + Math.random() * 200,
        onComplete: () => p.destroy(),
      });
    }
  }

  function handleClick(scene: Phaser.Scene) {
    const s = stateRef.current;
    if (!s.roundActive) return;
    const { target, hpBar, comboText } = phaserRefs.current;
    if (!target || !hpBar || !comboText) return;

    const now = Date.now();
    s.totalClicks++;
    s.clickTimestamps.push(now);

    // Combo
    s.combo = now - s.lastClickTime < 600 ? s.combo + 1 : 1;
    s.lastClickTime = now;
    s.comboMax = Math.max(s.comboMax, s.combo);

    // Reset combo timer
    if (phaserRefs.current.comboTimer) phaserRefs.current.comboTimer.destroy();
    phaserRefs.current.comboTimer = scene.time.delayedCall(800, () => {
      s.combo = 0;
      comboText.setText("");
      callbacksRef.current.onComboChange(0);
    });

    // Score
    const comboBonus = Math.floor(s.combo / 3);
    s.score += (1 + comboBonus) * Math.ceil(s.difficultyMultiplier);
    callbacksRef.current.onScoreChange(s.score);
    callbacksRef.current.onComboChange(s.combo);

    if (s.combo >= 3) {
      comboText.setText(`${s.combo}x COMBO`);
      comboText.setScale(1.2);
      scene.tweens.add({ targets: comboText, scale: 1, duration: 150 });
    }

    // Damage
    s.targetHP -= 1 + comboBonus * 0.5;
    drawHP(scene, hpBar);

    // Hit feedback
    scene.tweens.add({ targets: target, scaleX: 0.85, scaleY: 0.85, duration: 50, yoyo: true });
    spawnParticles(scene, target.x, target.y, s.combo >= 5);

    // Destroyed?
    if (s.targetHP <= 0) {
      s.roundActive = false;
      target.setAlpha(0);
      callbacksRef.current.onTargetDestroyed();

      // Explosion
      for (let i = 0; i < 20; i++) {
        const p = scene.add.circle(target.x, target.y, Math.random() * 5 + 2, 0x00ffaa, 0.9);
        const a = Math.random() * Math.PI * 2;
        const d = 60 + Math.random() * 100;
        scene.tweens.add({
          targets: p,
          x: target.x + Math.cos(a) * d,
          y: target.y + Math.sin(a) * d,
          alpha: 0,
          duration: 600 + Math.random() * 400,
          onComplete: () => p.destroy(),
        });
      }

      // Send round stats
      const dur = s.clickTimestamps.length > 1
        ? (s.clickTimestamps[s.clickTimestamps.length - 1] - s.clickTimestamps[0]) / 1000
        : 1;
      callbacksRef.current.onRoundEnd({
        totalClicks: s.totalClicks,
        comboMax: s.comboMax,
        avgCps: Math.round((s.totalClicks / Math.max(dur, 1)) * 100) / 100,
      });

      // Respawn
      scene.time.delayedCall(1500, () => {
        s.targetHP = s.maxHP;
        s.score = 0;
        s.combo = 0;
        s.comboMax = 0;
        s.totalClicks = 0;
        s.clickTimestamps = [];
        s.roundActive = true;
        comboText.setText("");
        target.setAlpha(0.9);
        drawHP(scene, hpBar);
        callbacksRef.current.onScoreChange(0);
        callbacksRef.current.onComboChange(0);
      });
    }
  }

  const applyAIDecision = useCallback((decision: AIDecision) => {
    const s = stateRef.current;
    s.difficultyMultiplier = decision.difficultyMultiplier;
    s.rewardMultiplier = decision.rewardMultiplier;
    s.maxHP = decision.nextTargetHP;
    s.targetHP = s.maxHP;

    const { scene, hpBar, target, aiMessage } = phaserRefs.current;
    if (!scene || !hpBar || !target || !aiMessage) return;

    drawHP(scene, hpBar);

    // Show AI message
    aiMessage.setText(decision.message);
    scene.tweens.add({ targets: aiMessage, alpha: 1, duration: 300, hold: 2500, yoyo: true });

    // Color shift
    const hue = decision.difficultyMultiplier > 1.5 ? 0x8b5cf6 : 0x00ffaa;
    target.setFillStyle(hue, 0.9);
    target.setStrokeStyle(2, hue, 0.4);
  }, []);

  return { applyAIDecision };
}
