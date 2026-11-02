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
import {
  BIOMES,
  LOGICAL_HEIGHT,
  SMW_TOTAL_LEVELS,
  TILE,
  TOTAL_LEVELS,
} from './engine/biomes';
import { stepWorld } from './engine/physics';
import type {
  GameEvent,
  GamePartition,
  GameSettings,
  InputState,
  SaveProgress,
  WorldState,
} from './engine/types';
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
import { objectiveHudLabel } from './engine/objectives';
import { PauseModal, StageStatusOverlay } from './ui/PauseModal';
import { TitleScreen } from './ui/TitleScreen';
import { WorldSelectModal } from './ui/WorldSelectModal';

const FIXED_DT = 1 / 60;

function createAttractWorld(partition: GamePartition, prog: SaveProgress): WorldState {
  const isSmw = partition === 'smw';
  return buildWorldState(
    0,
    {
      score: 0,
      highScore: isSmw ? prog.smwHighScore : prog.highScore,
      coins: 0,
      lives: 3,
      powerState: isSmw ? 3 : 1,
      mountedYoshi: isSmw,
    },
    partition
  );
}

// Intelligent Attract-Mode Bot that plays 1-1 or Y-1 (with Yoshi + Cape!) live behind Title Screen!
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
      en.x - p.x < 78
  );

  const isSmw = world.partition === 'smw';
  const wantCapeTakeoff = isSmw && p.powerState === 3 && p.pMeter >= 108 && world.frameCount % 64 < 36;
  const wantJump =
    wantCapeTakeoff ||
    ((pitAhead || wallAhead || enemyNear || world.frameCount % 95 < 16) &&
      world.frameCount % 8 !== 0);

  return {
    left: false,
    right: !p.capeFlying || world.frameCount % 28 < 18,
    up: false,
    down: false,
    run: true,
    jump: wantJump,
    fire: !isSmw && world.frameCount % 32 === 0,
    spin: isSmw && world.frameCount % 44 === 10,
  };
}

export const GameView: React.FC = () => {
  useKeepAwake();

  const { width, height } = useWindowDimensions();
  const [fontsLoaded] = useFonts({ PressStart2P_400Regular });
  const skiaPixelFont = useFont(PressStart2P_400Regular, 11);

  const [partition, setPartition] = useState<GamePartition>('smw');
  const [progress, setProgress] = useState<SaveProgress>(DEFAULT_PROGRESS);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [inTitle, setInTitle] = useState(true);
  const [worldSelectOpen, setWorldSelectOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'none' | 'pause' | 'settings'>('none');
  const [ignorePortraitHint, setIgnorePortraitHint] = useState(false);

  const partitionRef = useRef<GamePartition>('smw');
  const progressRef = useRef<SaveProgress>(DEFAULT_PROGRESS);
  const settingsRef = useRef<GameSettings>(DEFAULT_SETTINGS);
  const inTitleRef = useRef(true);
  const pausedRef = useRef(false);

  const inputRef = useRef<InputState>({
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    run: false,
    fire: false,
    spin: false,
  });

  const worldRef = useRef<WorldState>(createAttractWorld('smw', DEFAULT_PROGRESS));
  const renderer = useMemo(() => new SkiaWorldRenderer(), []);
  const framePicture = useSharedValue(createPicture(() => {}));

  const [uiStatus, setUiStatus] = useState(worldRef.current.status);
  const [hud, setHud] = useState<HudSnapshot>({
    partition: 'smw',
    score: 0,
    coins: 0,
    worldLabel: 'Y-1',
    stageTitle: worldRef.current.stageTitle,
    timeLeft: 400,
    lives: 3,
    powerState: 0,
    starActive: false,
    pMeter: 0,
    mountedYoshi: false,
    yoshiFireReady: false,
    dragonCoins: 0,
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
      const activePart = loadedProg.lastPartition ?? 'smw';
      partitionRef.current = activePart;
      progressRef.current = loadedProg;
      settingsRef.current = loadedSet;
      if (inTitleRef.current) {
        worldRef.current = createAttractWorld(activePart, loadedProg);
      } else {
        worldRef.current.highScore =
          activePart === 'smw' ? loadedProg.smwHighScore : loadedProg.highScore;
      }
      worldRef.current.doubleJumpAssist = loadedSet.doubleJumpAssist;
      soundManager.setPreferences(loadedSet.soundEnabled, loadedSet.musicEnabled);
      haptics.setEnabled(loadedSet.hapticsEnabled);
      setPartition(activePart);
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
        if (ev.partition === 'smw') {
          const clearedSet = new Set(cur.smwClearedLevels);
          clearedSet.add(ev.levelIndex);
          const nextUnlocked = Math.min(
            SMW_TOTAL_LEVELS - 1,
            Math.max(cur.smwUnlockedLevel, ev.levelIndex + 1)
          );
          const prevBest = cur.smwBestStageScores[ev.levelIndex] ?? 0;
          const updated: SaveProgress = {
            ...cur,
            smwHighScore: Math.max(cur.smwHighScore, ev.score),
            smwUnlockedLevel: nextUnlocked,
            smwClearedLevels: Array.from(clearedSet).sort((a, b) => a - b),
            smwBestStageScores: {
              ...cur.smwBestStageScores,
              [ev.levelIndex]: Math.max(prevBest, ev.score),
            },
            totalCoins: cur.totalCoins + ev.coins,
            lastPartition: 'smw',
          };
          progressRef.current = updated;
          setProgress(updated);
          void saveProgress(updated);
        } else {
          const clearedSet = new Set(cur.clearedLevels);
          clearedSet.add(ev.levelIndex);
          const nextUnlocked = Math.min(
            TOTAL_LEVELS - 1,
            Math.max(cur.unlockedLevel, ev.levelIndex + 1)
          );
          const prevBest = cur.bestStageScores[ev.levelIndex] ?? 0;
          const updated: SaveProgress = {
            ...cur,
            highScore: Math.max(cur.highScore, ev.score),
            unlockedLevel: nextUnlocked,
            clearedLevels: Array.from(clearedSet).sort((a, b) => a - b),
            bestStageScores: {
              ...cur.bestStageScores,
              [ev.levelIndex]: Math.max(prevBest, ev.score),
            },
            totalCoins: cur.totalCoins + ev.coins,
            lastPartition: 'classic',
          };
          progressRef.current = updated;
          setProgress(updated);
          void saveProgress(updated);
        }
      } else if (ev.type === 'game_over' && !silentDemo) {
        const cur = progressRef.current;
        if (ev.partition === 'smw' && ev.score > cur.smwHighScore) {
          const updated: SaveProgress = { ...cur, smwHighScore: ev.score };
          progressRef.current = updated;
          setProgress(updated);
          void saveProgress(updated);
        } else if (ev.partition === 'classic' && ev.score > cur.highScore) {
          const updated: SaveProgress = { ...cur, highScore: ev.score };
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
              worldRef.current = createAttractWorld(partitionRef.current, progressRef.current);
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

      // Only update lightweight HUD React state when displayed values change
      if (!inTitleRef.current) {
        const bossHp =
          activeWorld.boss && !activeWorld.boss.defeated ? activeWorld.boss.hp : null;
        const bossMaxHp = activeWorld.boss ? activeWorld.boss.maxHp : null;
        const starActive = activeWorld.player.starTimer > 0;
        const pBucket = Math.floor(activeWorld.player.pMeter / 10);
        const yoshiFireReady = activeWorld.player.yoshiMouthItem === 'fire';
        const hudKey = `${activeWorld.partition}|${activeWorld.status}|${activeWorld.score}|${activeWorld.coins}|${activeWorld.dragonCoinsCollected}|${activeWorld.worldLabel}|${activeWorld.timeLeft}|${activeWorld.lives}|${activeWorld.player.powerState}|${starActive}|${pBucket}|${activeWorld.player.mountedYoshi}|${yoshiFireReady}|${bossHp}|${activeWorld.gemsCollected ?? 0}|${activeWorld.objective ?? ''}`;
        if (hudKey !== lastHudKey) {
          lastHudKey = hudKey;
          setUiStatus(activeWorld.status);
          setHud({
            partition: activeWorld.partition,
            score: activeWorld.score,
            coins: activeWorld.coins,
            worldLabel: activeWorld.worldLabel,
            stageTitle: activeWorld.stageTitle,
            timeLeft: activeWorld.timeLeft,
            lives: activeWorld.lives,
            powerState: activeWorld.player.powerState,
            starActive,
            pMeter: activeWorld.player.pMeter,
            mountedYoshi: activeWorld.player.mountedYoshi,
            yoshiFireReady,
            dragonCoins: activeWorld.dragonCoinsCollected,
            bossHp,
            bossMaxHp,
            objective: objectiveHudLabel(activeWorld),
            timeAttack: activeWorld.objective === 'time_attack',
          });
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [framePicture, handleEvents, height, renderer, skiaPixelFont, width]);

  const handleSelectPartition = useCallback((nextPartition: GamePartition) => {
    if (partitionRef.current === nextPartition && inTitleRef.current) return;
    haptics.trigger('medium');
    partitionRef.current = nextPartition;
    setPartition(nextPartition);
    const updatedProg: SaveProgress = {
      ...progressRef.current,
      lastPartition: nextPartition,
    };
    progressRef.current = updatedProg;
    setProgress(updatedProg);
    void saveProgress(updatedProg);

    if (inTitleRef.current) {
      worldRef.current = createAttractWorld(nextPartition, updatedProg);
    }
  }, []);

  const launchStage = useCallback((levelIndex: number, targetPartition?: GamePartition) => {
    void soundManager.init();
    haptics.trigger('medium');
    const activePart = targetPartition ?? partitionRef.current;
    partitionRef.current = activePart;
    setPartition(activePart);

    const updatedProg: SaveProgress = {
      ...progressRef.current,
      lastPartition: activePart,
    };
    progressRef.current = updatedProg;
    setProgress(updatedProg);
    void saveProgress(updatedProg);

    const fresh = buildWorldState(
      levelIndex,
      {
        score: 0,
        highScore: activePart === 'smw' ? updatedProg.smwHighScore : updatedProg.highScore,
        coins: 0,
        lives: 3,
        powerState: 0,
        mountedYoshi: false,
        checkpointX: null,
        checkpointY: null,
        doubleJumpAssist: settingsRef.current.doubleJumpAssist,
      },
      activePart
    );
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
    const activePart = worldRef.current.partition;
    const fresh = buildWorldState(
      idx,
      {
        score: 0,
        highScore:
          activePart === 'smw' ? progressRef.current.smwHighScore : progressRef.current.highScore,
        coins: 0,
        lives: 3,
        powerState: 0,
        mountedYoshi: false,
        checkpointX: null,
        checkpointY: null,
        doubleJumpAssist: settingsRef.current.doubleJumpAssist,
      },
      activePart
    );
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
    worldRef.current = createAttractWorld(partitionRef.current, progressRef.current);
    setModalMode('none');
    setWorldSelectOpen(false);
    setInTitle(true);
  }, []);

  const handleSwitchPartitionFromPause = useCallback(() => {
    const nextPart: GamePartition = partitionRef.current === 'smw' ? 'classic' : 'smw';
    soundManager.playBgm(null);
    pausedRef.current = false;
    inTitleRef.current = true;
    partitionRef.current = nextPart;
    setPartition(nextPart);
    const updatedProg: SaveProgress = {
      ...progressRef.current,
      lastPartition: nextPart,
    };
    progressRef.current = updatedProg;
    setProgress(updatedProg);
    void saveProgress(updatedProg);
    worldRef.current = createAttractWorld(nextPart, updatedProg);
    setModalMode('none');
    setWorldSelectOpen(false);
    setInTitle(true);
    haptics.trigger('medium');
  }, []);

  const showControls =
    !inTitle &&
    modalMode === 'none' &&
    !worldSelectOpen &&
    (uiStatus === 'playing' ||
      uiStatus === 'flagpole' ||
      uiStatus === 'goal_tape' ||
      uiStatus === 'boss_collapse');

  const isPortrait = height > width * 1.05 && !ignorePortraitHint;
  const activeHighScore =
    hud.partition === 'smw' ? progress.smwHighScore : progress.highScore;
  const continueLevelIdx =
    partition === 'smw' ? progress.smwUnlockedLevel : progress.unlockedLevel;

  return (
    <View style={styles.root}>
      {/* Full-Screen Hardware-Accelerated Skia 16-Bit Pixel Canvas */}
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Picture picture={framePicture} />
      </Canvas>

      {/* Active Gameplay HUD & Corner-Tucked Multi-Touch Controller */}
      {!inTitle && (
        <HudOverlay
          hud={hud}
          pixelFontLoaded={fontsLoaded}
          onPausePress={handleOpenPause}
        />
      )}

      <ArcadeTouchControls
        inputRef={inputRef}
        partition={hud.partition}
        powerState={hud.powerState}
        mountedYoshi={hud.mountedYoshi}
        controlScale={settings.controlScale}
        visible={showControls}
      />

      {/* Dual-Cartridge Title Screen over Live Attract-Mode Demo */}
      {inTitle && !worldSelectOpen && modalMode === 'none' && (
        <TitleScreen
          partition={partition}
          progress={progress}
          pixelFontLoaded={fontsLoaded}
          onSelectPartition={handleSelectPartition}
          onStartAdventure={() => launchStage(0, partition)}
          onContinue={() => launchStage(continueLevelIdx, partition)}
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
          partition={hud.partition}
          status={uiStatus}
          worldLabel={hud.worldLabel}
          stageTitle={hud.stageTitle}
          lives={hud.lives}
          score={hud.score}
          highScore={activeHighScore}
          pixelFontLoaded={fontsLoaded}
          onRetry={() => launchStage(worldRef.current.levelIndex, worldRef.current.partition)}
          onExitToTitle={handleExitToTitle}
        />
      )}

      {/* Dual-Partition Stage Selector (24 Classic + 20 SMW) */}
      <WorldSelectModal
        visible={worldSelectOpen}
        partition={partition}
        progress={progress}
        pixelFontLoaded={fontsLoaded}
        onSelectPartition={handleSelectPartition}
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
        partition={partition}
        settings={settings}
        pixelFontLoaded={fontsLoaded}
        onUpdateSettings={handleUpdateSettings}
        onSwitchPartition={handleSwitchPartitionFromPause}
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
            Super Plomero Bros & World está diseñado en formato consola panorámica 16-bit para iPhone 12.
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
