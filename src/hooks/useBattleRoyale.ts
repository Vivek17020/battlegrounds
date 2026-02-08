// React hook connecting Phaser BattleScene to React state

import { useEffect, useRef, useCallback, useState } from 'react';
import Phaser from 'phaser';
import { BattleScene } from '@/game/battle-royale/BattleScene';
import {
  MatchResult, KillFeedEntry, LootType, BattleSceneEvents,
} from '@/game/battle-royale/types';
import { ENTRY_FEE, PLAYER_MAX_HP } from '@/game/battle-royale/constants';

type MatchPhaseUI = 'lobby' | 'playing' | 'results';

interface UseBattleRoyaleProps {
  containerRef: React.RefObject<HTMLDivElement>;
}

export function useBattleRoyale({ containerRef }: UseBattleRoyaleProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<BattleScene | null>(null);

  // UI state
  const [phase, setPhase] = useState<MatchPhaseUI>('lobby');
  const [health, setHealth] = useState(PLAYER_MAX_HP);
  const [shield, setShield] = useState(0);
  const [kills, setKills] = useState(0);
  const [aliveCount, setAliveCount] = useState(0);
  const [zonePhase, setZonePhase] = useState(0);
  const [phaseTimeRemaining, setPhaseTimeRemaining] = useState(30000);
  const [inventory, setInventory] = useState<LootType[]>([]);
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([]);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [monardBalance, setMonardBalance] = useState(100); // Start with 100 for testing
  const [countdown, setCountdown] = useState(0);
  const [lastPlayerCount, setLastPlayerCount] = useState(2);

  const callbacksRef = useRef<BattleSceneEvents>({
    onHealthChange: () => {},
    onKillsChange: () => {},
    onAliveCountChange: () => {},
    onPhaseChange: () => {},
    onKillFeed: () => {},
    onMatchEnd: () => {},
    onPlayerPosition: () => {},
    onInventoryChange: () => {},
    onCountdown: () => {},
  });

  // Keep callbacks up to date
  useEffect(() => {
    callbacksRef.current = {
      onHealthChange: (h, s) => { setHealth(h); setShield(s); },
      onKillsChange: (k) => setKills(k),
      onAliveCountChange: (c) => setAliveCount(c),
      onPhaseChange: (p, t) => { setZonePhase(p); setPhaseTimeRemaining(t); },
      onKillFeed: (entry) => setKillFeed(prev => [...prev.slice(-4), entry]),
      onMatchEnd: (result) => {
        setMatchResult(result);
        setPhase('results');
        // Award tokens locally (server will validate via submission)
        if (result.tokensWon > 0 && result.playerCount > 1) {
          setMonardBalance(prev => prev + result.tokensWon);
        }
        // Note: Match submission is now handled by MatchSubmissionProvider
        // in BattleRoyalePage.tsx to enable wallet signing
      },
      onPlayerPosition: () => {},
      onInventoryChange: (inv) => setInventory([...inv]),
      onCountdown: (c) => setCountdown(c),
    };
  });

  const startMatch = useCallback((playerCount: number) => {
    const doStart = (attempt: number) => {
      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height);

      // If the container is not laid out yet (0x0), wait a frame and retry.
      // This prevents Phaser from initializing into a hidden/zero-sized element.
      if ((width < 50 || height < 200) && attempt < 5) {
        requestAnimationFrame(() => doStart(attempt + 1));
        return;
      }

      // Remember player count for "Play Again"
      setLastPlayerCount(playerCount);

      // Solo mode is free, otherwise deduct entry fee
      const isSoloMode = playerCount === 1;
      if (!isSoloMode) {
        setMonardBalance(prev => prev - ENTRY_FEE);
      }

      // Reset state
      setHealth(PLAYER_MAX_HP);
      setShield(0);
      setKills(0);
      setAliveCount(playerCount);
      setZonePhase(0);
      setPhaseTimeRemaining(30000);
      setInventory([]);
      setKillFeed([]);
      setMatchResult(null);
      setPhase('playing');

      // Destroy previous game if exists
      if (gameRef.current) {
        sceneRef.current?.cleanup();
        gameRef.current.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
      }

      // Create proxy callbacks that delegate to ref
      const proxyCallbacks: BattleSceneEvents = {
        onHealthChange: (h, s) => callbacksRef.current.onHealthChange(h, s),
        onKillsChange: (k) => callbacksRef.current.onKillsChange(k),
        onAliveCountChange: (c) => callbacksRef.current.onAliveCountChange(c),
        onPhaseChange: (p, t) => callbacksRef.current.onPhaseChange(p, t),
        onKillFeed: (entry) => callbacksRef.current.onKillFeed(entry),
        onMatchEnd: (result) => callbacksRef.current.onMatchEnd(result),
        onPlayerPosition: (x, y) => callbacksRef.current.onPlayerPosition(x, y),
        onInventoryChange: (inv) => callbacksRef.current.onInventoryChange(inv),
        onCountdown: (c) => callbacksRef.current.onCountdown(c),
      };

      const scene = new BattleScene();

      // IMPORTANT: Phaser may call scene.init() during boot with empty/undefined data.
      // If that happens, BattleScene could end up with undefined callbacks and crash.
      // We override init BEFORE creating the game so the scene always gets our payload.
      const originalInit = scene.init.bind(scene);
      scene.init = (data: any) => {
        const matchId = data?.matchId;
        originalInit({
          playerCount,
          callbacks: proxyCallbacks,
          ...(matchId ? { matchId } : {}),
        });
      };

      sceneRef.current = scene;

      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: el,
        width: Math.max(1, width),
        height: Math.max(height, 400),
        backgroundColor: '#0a0a1a',
        scene: scene,
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
      };

      gameRef.current = new Phaser.Game(config);
    };

    doStart(0);
  }, [containerRef]);

  const returnToLobby = useCallback(() => {
    if (gameRef.current) {
      sceneRef.current?.cleanup();
      gameRef.current.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    }
    setPhase('lobby');
    setMatchResult(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (gameRef.current) {
        sceneRef.current?.cleanup();
        gameRef.current.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
      }
    };
  }, []);

  return {
    phase,
    health,
    shield,
    kills,
    aliveCount,
    zonePhase,
    phaseTimeRemaining,
    inventory,
    killFeed,
    matchResult,
    monardBalance,
    countdown,
    lastPlayerCount,
    startMatch,
    returnToLobby,
    setMonardBalance,
  };
}
