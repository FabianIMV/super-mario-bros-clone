import type { BgmTrackId, BiomeId, GamePartition } from './types';

export interface BiomeDefinition {
  id: BiomeId;
  name: string;
  skyTop: string;
  skyBottom: string;
  distantHill: string;
  nearHill: string;
  hillOutline: string;
  bushFill: string;
  bushHighlight: string;
  cloudFill: string;
  cloudShadow: string;
  groundCap: string;
  groundCapHighlight: string;
  groundMain: string;
  groundShadow: string;
  groundDark: string;
  brickLight: string;
  brickMain: string;
  brickDark: string;
  mortar: string;
  hardLight: string;
  hardMain: string;
  hardDark: string;
  pipeLight: string;
  pipeMain: string;
  pipeDark: string;
  underground: boolean;
  slippery: boolean;
  hasStars: boolean;
  hasLava: boolean;
  bgm: BgmTrackId;
}

export const TILE = 32;
export const WORLD_ROWS = 14;
export const LOGICAL_HEIGHT = WORLD_ROWS * TILE; // 448 units (exact 224p x 2)
export const GROUND_ROW = 12;

// Partition 1: Super Plomero Bros (Classic — 6 Worlds x 4 Stages = 24 Levels)
export const TOTAL_WORLDS = 6;
export const STAGES_PER_WORLD = 4;
export const TOTAL_LEVELS = TOTAL_WORLDS * STAGES_PER_WORLD;

// Partition 2: Super Plomero World (SMW — 5 Dinosaur Island Worlds x 4 Stages = 20 Levels)
export const SMW_WORLDS = 5;
export const SMW_TOTAL_LEVELS = SMW_WORLDS * STAGES_PER_WORLD; // 20 stages!

// Camera & Vertical Framing Constants so Touch Controls NEVER cover Plomero in either game!
export const MIN_CAMERA_WORLD_X = -7 * TILE; // -224: keeps col 0 at screenX >= 195px (clear right of D-Pad!)
export const WORLD_VERTICAL_LIFT = 22; // Shifts rendered ground 22 logical px upward above lower bezel!

export const BIOMES: Record<BiomeId, BiomeDefinition> = {
  meadow: {
    id: 'meadow',
    name: 'Pradera Dorada',
    skyTop: '#3b7cff',
    skyBottom: '#82b7ff',
    distantHill: '#2d8a57',
    nearHill: '#1f9d4c',
    hillOutline: '#0d4a26',
    bushFill: '#34d363',
    bushHighlight: '#86efac',
    cloudFill: '#ffffff',
    cloudShadow: '#cfe3ff',
    groundCap: '#22c55e',
    groundCapHighlight: '#86efac',
    groundMain: '#c85a19',
    groundShadow: '#8c3509',
    groundDark: '#431407',
    brickLight: '#f59e6c',
    brickMain: '#b84a18',
    brickDark: '#6e2308',
    mortar: '#261008',
    hardLight: '#fed7aa',
    hardMain: '#d96b27',
    hardDark: '#7c2d12',
    pipeLight: '#6ee778',
    pipeMain: '#1ea33c',
    pipeDark: '#0b4f1d',
    underground: false,
    slippery: false,
    hasStars: false,
    hasLava: false,
    bgm: 'overworld',
  },
  cavern: {
    id: 'cavern',
    name: 'Caverna Cristal',
    skyTop: '#060913',
    skyBottom: '#111c35',
    distantHill: '#172554',
    nearHill: '#1e3a8a',
    hillOutline: '#0b132b',
    bushFill: '#38bdf8',
    bushHighlight: '#bae6fd',
    cloudFill: '#334155',
    cloudShadow: '#1e293b',
    groundCap: '#60a5fa',
    groundCapHighlight: '#bae6fd',
    groundMain: '#1d4ed8',
    groundShadow: '#1e3a8a',
    groundDark: '#0b1636',
    brickLight: '#60a5fa',
    brickMain: '#2563eb',
    brickDark: '#172554',
    mortar: '#090d1a',
    hardLight: '#93c5fd',
    hardMain: '#3b82f6',
    hardDark: '#1e3a8a',
    pipeLight: '#5eead4',
    pipeMain: '#0d9488',
    pipeDark: '#134e4a',
    underground: true,
    slippery: false,
    hasStars: false,
    hasLava: false,
    bgm: 'underground',
  },
  desert: {
    id: 'desert',
    name: 'Desierto Solar',
    skyTop: '#ea580c',
    skyBottom: '#fcd34d',
    distantHill: '#d97706',
    nearHill: '#b45309',
    hillOutline: '#78350f',
    bushFill: '#65a30d',
    bushHighlight: '#bef264',
    cloudFill: '#fffbeb',
    cloudShadow: '#fde68a',
    groundCap: '#fde047',
    groundCapHighlight: '#fef9c3',
    groundMain: '#d97706',
    groundShadow: '#92400e',
    groundDark: '#451a03',
    brickLight: '#fcd34d',
    brickMain: '#ca8a04',
    brickDark: '#713f12',
    mortar: '#3b1c06',
    hardLight: '#fef08a',
    hardMain: '#b45309',
    hardDark: '#6b2c08',
    pipeLight: '#bef264',
    pipeMain: '#65a30d',
    pipeDark: '#365314',
    underground: false,
    slippery: false,
    hasStars: false,
    hasLava: false,
    bgm: 'athletic',
  },
  night: {
    id: 'night',
    name: 'Cumbre Estelar',
    skyTop: '#070b1e',
    skyBottom: '#1e1b4b',
    distantHill: '#1e293b',
    nearHill: '#312e81',
    hillOutline: '#0f172a',
    bushFill: '#2dd4bf',
    bushHighlight: '#99f6e4',
    cloudFill: '#cbd5e1',
    cloudShadow: '#64748b',
    groundCap: '#34d399',
    groundCapHighlight: '#a7f3d0',
    groundMain: '#475569',
    groundShadow: '#1e293b',
    groundDark: '#090d16',
    brickLight: '#94a3b8',
    brickMain: '#475569',
    brickDark: '#1e293b',
    mortar: '#090d16',
    hardLight: '#c7d2fe',
    hardMain: '#6366f1',
    hardDark: '#312e81',
    pipeLight: '#a5b4fc',
    pipeMain: '#4f46e5',
    pipeDark: '#1e1b4b',
    underground: false,
    slippery: false,
    hasStars: true,
    hasLava: false,
    bgm: 'athletic',
  },
  glacier: {
    id: 'glacier',
    name: 'Glaciar Boreal',
    skyTop: '#0284c7',
    skyBottom: '#bae6fd',
    distantHill: '#7dd3fc',
    nearHill: '#38bdf8',
    hillOutline: '#0369a1',
    bushFill: '#e0f2fe',
    bushHighlight: '#ffffff',
    cloudFill: '#ffffff',
    cloudShadow: '#bae6fd',
    groundCap: '#ffffff',
    groundCapHighlight: '#f0f9ff',
    groundMain: '#0284c7',
    groundShadow: '#075985',
    groundDark: '#082f49',
    brickLight: '#e0f2fe',
    brickMain: '#38bdf8',
    brickDark: '#0369a1',
    mortar: '#082f49',
    hardLight: '#ffffff',
    hardMain: '#7dd3fc',
    hardDark: '#0284c7',
    pipeLight: '#a5f3fc',
    pipeMain: '#0891b2',
    pipeDark: '#164e63',
    underground: false,
    slippery: true,
    hasStars: false,
    hasLava: false,
    bgm: 'athletic',
  },
  fortress: {
    id: 'fortress',
    name: 'Fortaleza Magma',
    skyTop: '#110406',
    skyBottom: '#2d090d',
    distantHill: '#450a0a',
    nearHill: '#7f1d1d',
    hillOutline: '#1c0406',
    bushFill: '#f97316',
    bushHighlight: '#fde047',
    cloudFill: '#57534e',
    cloudShadow: '#292524',
    groundCap: '#a8a29e',
    groundCapHighlight: '#e7e5e4',
    groundMain: '#57534e',
    groundShadow: '#292524',
    groundDark: '#141110',
    brickLight: '#a8a29e',
    brickMain: '#78716c',
    brickDark: '#44403c',
    mortar: '#171412',
    hardLight: '#fca5a5',
    hardMain: '#b91c1c',
    hardDark: '#450a0a',
    pipeLight: '#d6d3d1',
    pipeMain: '#78716c',
    pipeDark: '#292524',
    underground: true,
    slippery: false,
    hasStars: false,
    hasLava: true,
    bgm: 'fortress',
  },

  // ==========================================================================
  // SUPER PLOMERO WORLD (SMW 16-BIT DINOSAUR ISLAND BIOMES)
  // ==========================================================================
  yoshi_island: {
    id: 'yoshi_island',
    name: 'Isla de Yoshi',
    skyTop: '#22a6f5',
    skyBottom: '#b4f0ff',
    distantHill: '#34d399',
    nearHill: '#10b981',
    hillOutline: '#064e3b',
    bushFill: '#22c55e',
    bushHighlight: '#bbf7d0',
    cloudFill: '#ffffff',
    cloudShadow: '#bae6fd',
    groundCap: '#4ade80',
    groundCapHighlight: '#dcfce7',
    groundMain: '#d97706',
    groundShadow: '#92400e',
    groundDark: '#451a03',
    brickLight: '#fde047',
    brickMain: '#eab308',
    brickDark: '#a16207',
    mortar: '#422006',
    hardLight: '#fed7aa',
    hardMain: '#fb923c',
    hardDark: '#9a3412',
    pipeLight: '#86efac',
    pipeMain: '#16a34a',
    pipeDark: '#14532d',
    underground: false,
    slippery: false,
    hasStars: false,
    hasLava: false,
    bgm: 'smw_overworld',
  },
  donut_plains: {
    id: 'donut_plains',
    name: 'Llanura Rosquilla',
    skyTop: '#0ea5e9',
    skyBottom: '#fef08a',
    distantHill: '#65a30d',
    nearHill: '#84cc16',
    hillOutline: '#365314',
    bushFill: '#4ade80',
    bushHighlight: '#dcfce7',
    cloudFill: '#fffbeb',
    cloudShadow: '#fde68a',
    groundCap: '#84cc16',
    groundCapHighlight: '#ecfccb',
    groundMain: '#b45309',
    groundShadow: '#78350f',
    groundDark: '#3b1806',
    brickLight: '#fde68a',
    brickMain: '#f59e0b',
    brickDark: '#b45309',
    mortar: '#3b1806',
    hardLight: '#fbcfe8',
    hardMain: '#ec4899',
    hardDark: '#831843',
    pipeLight: '#fda4af',
    pipeMain: '#e11d48',
    pipeDark: '#881337',
    underground: false,
    slippery: false,
    hasStars: false,
    hasLava: false,
    bgm: 'smw_athletic',
  },
  vanilla_dome: {
    id: 'vanilla_dome',
    name: 'Domo Vainilla',
    skyTop: '#130b29',
    skyBottom: '#2b1954',
    distantHill: '#4c1d95',
    nearHill: '#6d28d9',
    hillOutline: '#1e1b4b',
    bushFill: '#67e8f9',
    bushHighlight: '#cffafe',
    cloudFill: '#4c1d95',
    cloudShadow: '#2e1065',
    groundCap: '#f5d0fe',
    groundCapHighlight: '#fdf4ff',
    groundMain: '#7e22ce',
    groundShadow: '#581c87',
    groundDark: '#2e1065',
    brickLight: '#e9d5ff',
    brickMain: '#9333ea',
    brickDark: '#581c87',
    mortar: '#1e0b36',
    hardLight: '#a5f3fc',
    hardMain: '#06b6d4',
    hardDark: '#155e75',
    pipeLight: '#fde047',
    pipeMain: '#ca8a04',
    pipeDark: '#713f12',
    underground: true,
    slippery: false,
    hasStars: false,
    hasLava: false,
    bgm: 'underground',
  },
  forest_illusion: {
    id: 'forest_illusion',
    name: 'Bosque Ilusión',
    skyTop: '#064e3b',
    skyBottom: '#115e59',
    distantHill: '#0f766e',
    nearHill: '#14b8a6',
    hillOutline: '#042f2e',
    bushFill: '#facc15',
    bushHighlight: '#fef08a',
    cloudFill: '#ccfbf1',
    cloudShadow: '#5eead4',
    groundCap: '#2dd4bf',
    groundCapHighlight: '#99f6e4',
    groundMain: '#713f12',
    groundShadow: '#422006',
    groundDark: '#1c0f04',
    brickLight: '#fef08a',
    brickMain: '#ca8a04',
    brickDark: '#713f12',
    mortar: '#1c0f04',
    hardLight: '#99f6e4',
    hardMain: '#0d9488',
    hardDark: '#134e4a',
    pipeLight: '#bef264',
    pipeMain: '#65a30d',
    pipeDark: '#365314',
    underground: false,
    slippery: false,
    hasStars: true,
    hasLava: false,
    bgm: 'smw_overworld',
  },
  valley_koopa: {
    id: 'valley_koopa',
    name: 'Valle de Koopa',
    skyTop: '#1f0812',
    skyBottom: '#4c0519',
    distantHill: '#881337',
    nearHill: '#9f1239',
    hillOutline: '#2a040f',
    bushFill: '#fb923c',
    bushHighlight: '#fde047',
    cloudFill: '#78716c',
    cloudShadow: '#44403c',
    groundCap: '#fb7185',
    groundCapHighlight: '#fecdd3',
    groundMain: '#44403c',
    groundShadow: '#292524',
    groundDark: '#0c0a09',
    brickLight: '#d6d3d1',
    brickMain: '#78716c',
    brickDark: '#44403c',
    mortar: '#0c0a09',
    hardLight: '#fda4af',
    hardMain: '#e11d48',
    hardDark: '#881337',
    pipeLight: '#cbd5e1',
    pipeMain: '#64748b',
    pipeDark: '#1e293b',
    underground: false,
    slippery: false,
    hasStars: true,
    hasLava: false,
    bgm: 'smw_athletic',
  },
};

const SMW_WORLD_PREFIXES = ['Y', 'D', 'V', 'B', 'K'];

export function getWorldLabel(levelIndex: number, partition: GamePartition = 'classic'): string {
  const worldNum = Math.floor(levelIndex / STAGES_PER_WORLD) + 1;
  const stageNum = (levelIndex % STAGES_PER_WORLD) + 1;
  if (partition === 'smw') {
    const prefix = SMW_WORLD_PREFIXES[Math.min(SMW_WORLD_PREFIXES.length - 1, worldNum - 1)] ?? 'W';
    return `${prefix}-${stageNum}`;
  }
  return `${worldNum}-${stageNum}`;
}

export function getStageBiome(levelIndex: number, partition: GamePartition = 'classic'): BiomeId {
  const worldNum = Math.floor(levelIndex / STAGES_PER_WORLD) + 1;
  const stageNum = (levelIndex % STAGES_PER_WORLD) + 1;

  if (partition === 'smw') {
    if (stageNum === 4) return 'fortress';
    switch (worldNum) {
      case 1:
        return 'yoshi_island';
      case 2:
        return stageNum === 2 ? 'vanilla_dome' : 'donut_plains';
      case 3:
        return stageNum === 3 ? 'glacier' : 'vanilla_dome';
      case 4:
        return 'forest_illusion';
      default:
        return stageNum === 2 ? 'vanilla_dome' : 'valley_koopa';
    }
  }

  // Classic 24-stage biome progression
  if (stageNum === 4) return 'fortress';
  if (stageNum === 2) return worldNum % 2 === 1 ? 'cavern' : 'night';

  switch (worldNum) {
    case 1:
      return 'meadow';
    case 2:
      return 'desert';
    case 3:
      return stageNum === 1 ? 'night' : 'meadow';
    case 4:
      return 'glacier';
    case 5:
      return stageNum === 1 ? 'desert' : 'cavern';
    default:
      return stageNum === 1 ? 'night' : 'glacier';
  }
}
