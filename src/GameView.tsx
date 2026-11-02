import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Canvas, Picture, createPicture, useFont } from '@shopify/react-native-skia';
import { PressStart2P_400Regular, useFonts } from '@expo-google-fonts/press-start-2p';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useKeepAwake } from 'expo-keep-awake';
import { useSharedValue } from 'react-native-reanimated';

import { soundManager } from './audio/soundManager';
import { ArcadeTouchControls } from './controls/ArcadeTouchControls';
import { BIOMES, LOGICAL_HEIGHT, TILE, TOTAL_LEVELS } from './engine/biomes';
import { stepWorld } from './engine/physics';
import type { GameEvent, GameSettings, InputState, SaveProgress, WorldState } from './engine/types';
import { haptics } from './haptics/haptics';
import { buildWorldState, gridKey } from './levels/levelBuilder';
import { SkiaWorldRenderer } from './renderer/skiaRenderer';
import {
  DEFAULT_PROGRESS,
  DEFAULT_SETTINGS,
  loadProgress,
  loadSettings,
  saveProgress,
  saveSettings,
} from './storage/saveStorage';
import { HudOverlay, type HudSnapshot } from './ui/HudOverlay';
import { PauseModal, StageStatusOverlay } from './ui/PauseModal';
import { TitleScreen } from './ui/TitleScreen';
import { WorldSelectModal } from './ui/WorldSelectModal';

const FIXED_DT = 1 / 60;

// Intelligent Attract-Mode Bot that plays 1-1 live behind the Title Screen!
function computeAttractInput(world: WorldState): InputState {
  const p = world.player;
  const aheadCol = Math.floor((p.x + p.width + 26) / TILE);
  const footRow = Math.floor((p.y + p.height + 4) / TILE);

  const pitAhead =
    !world.blockGrid.has(gridKey(aheadCol, 12)) ||
    !world.blockGrid.has(gridKey(aheadCol + 1, 12));
  const wallAhead =
    world.blockGrid.has(gridKey(aheadCol, footRow - 1)) ||
    world.pipes.some((pipe) => pipe.x > p.x && pipe.x - (p.x + p.width) < 38);
  const enemyNear = world.enemies.some(
    (en) =>
      en.state !== 'squashed' &&
      en.state !== 'knocked' &&
      en.x > p.x - 10 &&
      en.x - p.x < 72
  );

  const wantJump =
    (pitAhead || wallAhead || enemyNear || world.frameCount % 95 < 16) &&
    world.frameCount % 8 !== 0;

  return {
    left: false,
    right: true,
    down: false,
    run: true,
    jump: wantJump,
    fire: world.frameCount % 32 === 0,
  };
}

export const GameView: React.FC = () => {
  useKeepAwake();

  const { width, height } = useWindowDimensions();
  const [fontsLoaded] = useFonts({ PressStart2P_400Regular });
  const skiaPixelFont = useFont(PressStart2P_400Regular, 11);

  const [progress, setProgress] = useState<SaveProgress>(DEFAULT_PROGRESS);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [inTitle, setInTitle] = useState(true);
  const [worldSelectOpen, setWorldSelectOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'none' | 'pause' | 'settings'>('none');
  const [ignorePortraitHint, setIgnorePortraitHint] = useState(false);

  const progressRef = useRef<SaveProgress>(DEFAULT_PROGRESS);
  const settingsRef = useRef<GameSettings>(DEFAULT_SETTINGS);
  const inTitleRef = useRef(true);
  const pausedRef = useRef(false);

  const inputRef = useRef<InputState>({
    left: false,
    right: false,
    down: false,
    jump: false,
    run: false,
    fire: false,
  });

  const worldRef = useRef<WorldState>(buildWorldState(0));
  const renderer = useMemo(() => new SkiaWorldRenderer(), []);
  const framePicture = useSharedValue(createPicture(() => {}));

  const [uiStatus, setUiStatus] = useState(worldRef.current.status);
  const [hud, setHud] = useState<HudSnapshot>({
    score: 0,
    coins: 0,
    worldLabel: '1-1',
    stageTitle: worldRef.current.stageTitle,
    timeLeft: 400,
    lives: 3,
    powerState: 0,
    starActive: false,
    bossHp: null,
    bossMaxHp: null,
  });

  // Lock iPhone 12 into full-screen Landscape immediately on launch
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {
      // Ignore on web/unsupported environments
    });
    void soundManager.init();

    void (async () => {
      const [loadedProg, loadedSet] = await Promise.all([loadProgress(), loadSettings()]);
      progressRef.current = loadedProg;
      settingsRef.current = loadedSet;
      worldRef.current.highScore = loadedProg.highScore;
      worldRef.current.doubleJumpAssist = loadedSet.doubleJumpAssist;
      soundManager.setPreferences(loadedSet.soundEnabled, loadedSet.musicEnabled);
      haptics.setEnabled(loadedSet.hapticsEnabled);
      setProgress(loadedProg);
      setSettings(loadedSet);
    })();
  }, []);

  // Auto-pause when iPhone switches apps or locks screen
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        soundManager.setPaused(true);
        if (!inTitleRef.current && worldRef.current.status === 'playing') {
          pausedRef.current = true;
          setModalMode('pause');
        }
      } else if (modalMode === 'none') {
        soundManager.setPaused(false);
      }
    });
    return () => sub.remove();
  }, [modalMode]);

  const handleEvents = useCallback((events: GameEvent[], silentDemo: boolean) => {
    for (const ev of events) {
      if (ev.type === 'sfx' && !silentDemo) {
        soundManager.playSfx(ev.id);
      } else if (ev.type === 'bgm' && !silentDemo) {
        soundManager.playBgm(ev.track);
      } else if (ev.type === 'haptic' && !silentDemo) {
        haptics.trigger(ev.kind);
      } else if (ev.type === 'stage_cleared' && !silentDemo) {
        const cur = progressRef.current;
        const clearedSet = new Set(cur.clearedLevels);
        clearedSet.add(ev.levelIndex);
        const nextUnlocked = Math.min(
          TOTAL_LEVELS - 1,
          Math.max(cur.unlockedLevel, ev.levelIndex + 1)
        );
        const prevBest = cur.bestStageScores[ev.levelIndex] ?? 0;
        const updated: SaveProgress = {
          highScore: Math.max(cur.highScore, ev.score),
          unlockedLevel: nextUnlocked,
          clearedLevels: Array.from(clearedSet).sort((a, b) => a - b),
          bestStageScores: {
            ...cur.bestStageScores,
            [ev.levelIndex]: Math.max(prevBest, ev.score),
          },
          totalCoins: cur.totalCoins + ev.coins,
        };
        progressRef.current = updated;
        setProgress(updated);
        void saveProgress(updated);
      } else if (ev.type === 'game_over' && !silentDemo) {
        const cur = progressRef.current;
        if (ev.score > cur.highScore) {
          const updated = { ...cur, highScore: ev.score };
          progressRef.current = updated;
          setProgress(updated);
          void saveProgress(updated);
        }
      }
    }
  }, []);

  // Main Deterministic 60Hz Simulation + Skia Picture Recording Loop
  useEffect(() => {
    let rafId = 0;
    let lastMs = performance.now();
    let accumulator = 0;
    let lastHudKey = '';

    const tick = (nowMs: number) => {
      const elapsed = Math.min(0.05, Math.max(0, (nowMs - lastMs) / 1000));
      lastMs = nowMs;

      const scale = Math.max(0.1, height / LOGICAL_HEIGHT);
      const viewportWorldW = width / scale;
      const world = worldRef.current;

      if (!pausedRef.current) {
        accumulator += elapsed;
        let steps = 0;
        while (accumulator >= FIXED_DT && steps < 3) {
          accumulator -= FIXED_DT;
          steps += 1;

          if (inTitleRef.current) {
            const demoInput = computeAttractInput(world);
            stepWorld(world, demoInput, viewportWorldW);
            if (world.status !== 'playing' || world.player.x > (world.totalCols - 22) * TILE) {
              worldRef.current = buildWorldState(0, {
                score: 0,
                highScore: progressRef.current.highScore,
                coins: 0,
                lives: 3,
                powerState: 1,
              });
            }
          } else {
            const evs = stepWorld(world, inputRef.current, viewportWorldW);
            if (evs.length > 0) {
              handleEvents(evs, false);
            }
          }
        }
      }

      // Record GPU SkPicture with zero React component re-renders!
      const activeWorld = worldRef.current;
      framePicture.value = renderer.renderWorldPicture(
        activeWorld,
        width,
        height,
        skiaPixelFont,
        settingsRef.current.crtScanlines
      );

      // Only update lightweight HUD React state when displayed integers change
      if (!inTitleRef.current) {
        const bossHp =
          activeWorld.boss && !activeWorld.boss.defeated ? activeWorld.boss.hp : null;
        const bossMaxHp = activeWorld.boss ? activeWorld.boss.maxHp : null;
        const starActive = activeWorld.player.starTimer > 0;
        const hudKey = `${activeWorld.status}|${activeWorld.score}|${activeWorld.coins}|${activeWorld.worldLabel}|${activeWorld.timeLeft}|${activeWorld.lives}|${activeWorld.player.powerState}|${starActive}|${bossHp}`;
        if (hudKey !== lastHudKey) {
          lastHudKey = hudKey;
          setUiStatus(activeWorld.status);
          setHud({
            score: activeWorld.score,
            coins: activeWorld.coins,
            worldLabel: activeWorld.worldLabel,
            stageTitle: activeWorld.stageTitle,
            timeLeft: activeWorld.timeLeft,
            lives: activeWorld.lives,
            powerState: activeWorld.player.powerState,
            starActive,
            bossHp,
            bossMaxHp,
          });
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [framePicture, handleEvents, height, renderer, skiaPixelFont, width]);

  const launchStage = useCallback((levelIndex: number) => {
    void soundManager.init();
    haptics.trigger('medium');
    const fresh = buildWorldState(levelIndex, {
      score: 0,
      highScore: progressRef.current.highScore,
      coins: 0,
      lives: 3,
      powerState: 0,
      checkpointX: null,
      checkpointY: null,
      doubleJumpAssist: settingsRef.current.doubleJumpAssist,
    });
    fresh.status = 'stage_intro';
    fresh.statusTimer = 78;
    worldRef.current = fresh;
    inTitleRef.current = false;
    pausedRef.current = false;
    setInTitle(false);
    setWorldSelectOpen(false);
    setModalMode('none');
    setUiStatus('stage_intro');
    soundManager.setPaused(false);
    soundManager.playBgm(null);
  }, []);

  const handleUpdateSettings = useCallback((patch: Partial<GameSettings>) => {
    haptics.trigger('tick');
    const next: GameSettings = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    worldRef.current.doubleJumpAssist = next.doubleJumpAssist;
    soundManager.setPreferences(next.soundEnabled, next.musicEnabled);
    haptics.setEnabled(next.hapticsEnabled);
    setSettings(next);
    void saveSettings(next);
  }, []);

  const handleOpenPause = useCallback(() => {
    haptics.trigger('light');
    pausedRef.current = true;
    soundManager.setPaused(true);
    setModalMode('pause');
  }, []);

  const handleResume = useCallback(() => {
    haptics.trigger('light');
    pausedRef.current = false;
    soundManager.setPaused(false);
    setModalMode('none');
  }, []);

  const handleRestartCurrentStage = useCallback(() => {
    const idx = worldRef.current.levelIndex;
    const fresh = buildWorldState(idx, {
      score: 0,
      highScore: progressRef.current.highScore,
      coins: 0,
      lives: 3,
      powerState: 0,
      checkpointX: null,
      checkpointY: null,
      doubleJumpAssist: settingsRef.current.doubleJumpAssist,
    });
    fresh.status = 'playing';
    worldRef.current = fresh;
    pausedRef.current = false;
    setModalMode('none');
    setUiStatus('playing');
    soundManager.setPaused(false);
    soundManager.playBgm(BIOMES[fresh.biomeId].bgm);
  }, []);

  const handleExitToTitle = useCallback(() => {
    haptics.trigger('light');
    soundManager.playBgm(null);
    pausedRef.current = false;
    inTitleRef.current = true;
    worldRef.current = buildWorldState(0, {
      score: 0,
      highScore: progressRef.current.highScore,
      coins: 0,
      lives: 3,
      powerState: 1,
    });
    setModalMode('none');
    setWorldSelectOpen(false);
    setInTitle(true);
  }, []);

  const showControls =
    !inTitle &&
    modalMode === 'none' &&
    !worldSelectOpen &&
    (uiStatus === 'playing' || uiStatus === 'flagpole' || uiStatus === 'boss_collapse');

  const isPortrait = height > width * 1.05 && !ignorePortraitHint;

  return (
    <View style={styles.root}>
      {/* Full-Screen Hardware-Accelerated Skia 224p Pixel Canvas */}
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Picture picture={framePicture} />
      </Canvas>

      {/* Active Gameplay HUD & Ergonomic Multi-Touch Arcade Controller */}
      {!inTitle && (
        <HudOverlay
          hud={hud}
          pixelFontLoaded={fontsLoaded}
          onPausePress={handleOpenPause}
        />
      )}

      <ArcadeTouchControls
        inputRef={inputRef}
        powerState={hud.powerState}
        controlScale={settings.controlScale}
        visible={showControls}
      />

      {/* Title Screen over Live Attract-Mode Demo */}
      {inTitle && !worldSelectOpen && modalMode === 'none' && (
        <TitleScreen
          progress={progress}
          pixelFontLoaded={fontsLoaded}
          onStartAdventure={() => launchStage(0)}
          onContinue={() => launchStage(progress.unlockedLevel)}
          onOpenWorldSelect={() => {
            haptics.trigger('light');
            setWorldSelectOpen(true);
          }}
          onOpenSettings={() => {
            haptics.trigger('light');
            pausedRef.current = true;
            setModalMode('settings');
          }}
        />
      )}

      {/* Stage Intro, Game Over & Victory Overlays */}
      {!inTitle && (
        <StageStatusOverlay
          status={uiStatus}
          worldLabel={hud.worldLabel}
          stageTitle={hud.stageTitle}
          lives={hud.lives}
          score={hud.score}
          highScore={progress.highScore}
          pixelFontLoaded={fontsLoaded}
          onRetry={() => launchStage(worldRef.current.levelIndex)}
          onExitToTitle={handleExitToTitle}
        />
      )}

      {/* 6-World x 4-Stage Interactive Selector */}
      <WorldSelectModal
        visible={worldSelectOpen}
        progress={progress}
        pixelFontLoaded={fontsLoaded}
        onSelectStage={launchStage}
        onClose={() => {
          haptics.trigger('light');
          setWorldSelectOpen(false);
          if (!inTitle) {
            pausedRef.current = false;
            soundManager.setPaused(false);
          }
        }}
      />

      {/* Pause & Arcade Settings Modal */}
      <PauseModal
        visible={modalMode !== 'none'}
        mode={modalMode === 'settings' ? 'settings' : 'pause'}
        settings={settings}
        pixelFontLoaded={fontsLoaded}
        onUpdateSettings={handleUpdateSettings}
        onResume={handleResume}
        onRestartStage={handleRestartCurrentStage}
        onOpenWorldSelect={() => {
          setModalMode('none');
          setWorldSelectOpen(true);
        }}
        onExitToTitle={handleExitToTitle}
      />

      {/* Gentle Rotation Prompt if Portrait Lock initially delays Landscape switch */}
      {isPortrait && (
        <View style={styles.portraitPrompt}>
          <Text style={styles.portraitEmoji}>📱↻</Text>
          <Text style={styles.portraitTitle}>Gira tu iPhone en horizontal</Text>
          <Text style={styles.portraitSub}>
            Super Plomero Bros está diseñado en formato consola panorámica 16-bit para iPhone 12.
          </Text>
          <Pressable
            onPress={() => setIgnorePortraitHint(true)}
            style={styles.portraitDismiss}
          >
            <Text style={styles.portraitDismissText}>Continuar así</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#060913',
  },
  portraitPrompt: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 9, 19, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    zIndex: 99,
  },
  portraitEmoji: {
    fontSize: 40,
    marginBottom: 14,
  },
  portraitTitle: {
    color: '#fde047',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  portraitSub: {
    color: '#cbd5e1',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
  },
  portraitDismiss: {
    backgroundColor: '#1e293b',
    borderWidth: 2,
    borderColor: '#64748b',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  portraitDismissText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
});
