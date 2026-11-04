import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameSettings, SaveProgress } from '../engine/types';

const PROGRESS_KEY = '@super_plomero_progress_v1';
const SETTINGS_KEY = '@super_plomero_settings_v1';

export const DEFAULT_PROGRESS: SaveProgress = {
  highScore: 0,
  unlockedLevel: 0,
  clearedLevels: [],
  bestStageScores: {},
  totalCoins: 0,
  smwHighScore: 0,
  smwUnlockedLevel: 0,
  smwClearedLevels: [],
  smwBestStageScores: {},
  expHighScore: 0,
  expUnlockedLevel: 0,
  expClearedLevels: [],
  expBestStageScores: {},
  frontierHighScore: 0,
  frontierUnlockedLevel: 0,
  frontierClearedLevels: [],
  frontierBestStageScores: {},
  lastPartition: 'smw',
};

export const DEFAULT_SETTINGS: GameSettings = {
  soundEnabled: true,
  musicEnabled: true,
  hapticsEnabled: true,
  crtScanlines: false,
  doubleJumpAssist: false,
  controlScale: 1.0,
};

export async function loadProgress(): Promise<SaveProgress> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS };
    const parsed = JSON.parse(raw) as Partial<SaveProgress>;
    return {
      highScore: typeof parsed.highScore === 'number' ? parsed.highScore : 0,
      unlockedLevel: typeof parsed.unlockedLevel === 'number' ? parsed.unlockedLevel : 0,
      clearedLevels: Array.isArray(parsed.clearedLevels) ? parsed.clearedLevels : [],
      bestStageScores: parsed.bestStageScores ?? {},
      totalCoins: typeof parsed.totalCoins === 'number' ? parsed.totalCoins : 0,
      smwHighScore: typeof parsed.smwHighScore === 'number' ? parsed.smwHighScore : 0,
      smwUnlockedLevel: typeof parsed.smwUnlockedLevel === 'number' ? parsed.smwUnlockedLevel : 0,
      smwClearedLevels: Array.isArray(parsed.smwClearedLevels) ? parsed.smwClearedLevels : [],
      smwBestStageScores: parsed.smwBestStageScores ?? {},
      expHighScore: typeof parsed.expHighScore === 'number' ? parsed.expHighScore : 0,
      expUnlockedLevel: typeof parsed.expUnlockedLevel === 'number' ? parsed.expUnlockedLevel : 0,
      expClearedLevels: Array.isArray(parsed.expClearedLevels) ? parsed.expClearedLevels : [],
      expBestStageScores: parsed.expBestStageScores ?? {},
      frontierHighScore: typeof parsed.frontierHighScore === 'number' ? parsed.frontierHighScore : 0,
      frontierUnlockedLevel: typeof parsed.frontierUnlockedLevel === 'number' ? parsed.frontierUnlockedLevel : 0,
      frontierClearedLevels: Array.isArray(parsed.frontierClearedLevels) ? parsed.frontierClearedLevels : [],
      frontierBestStageScores: parsed.frontierBestStageScores ?? {},
      dimHighScore: typeof parsed.dimHighScore === 'number' ? parsed.dimHighScore : 0,
      dimUnlockedLevel: typeof parsed.dimUnlockedLevel === 'number' ? parsed.dimUnlockedLevel : 0,
      dimClearedLevels: Array.isArray(parsed.dimClearedLevels) ? parsed.dimClearedLevels : [],
      dimBestStageScores: parsed.dimBestStageScores ?? {},
      lastPartition:
        parsed.lastPartition === 'classic' ||
        parsed.lastPartition === 'smw' ||
        parsed.lastPartition === 'expedition' ||
        parsed.lastPartition === 'frontier' ||
        parsed.lastPartition === 'dimension'
          ? parsed.lastPartition
          : 'smw',
    };
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

export async function saveProgress(progress: SaveProgress): Promise<void> {
  try {
    await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota errors
  }
}

export async function loadSettings(): Promise<GameSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: GameSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore
  }
}
