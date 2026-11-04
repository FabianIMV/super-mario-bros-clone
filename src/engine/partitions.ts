// ============================================================================
// MODOS DE JUEGO: información visible y progreso guardado de cada uno.
// Centraliza lo que antes eran comparaciones "classic / smw" repartidas por
// la interfaz, para que agregar un modo no obligue a tocar cada pantalla.
// ============================================================================
import { partitionTotalLevels } from './biomes';
import type { GamePartition, SaveProgress } from './types';

export const PARTITION_ORDER: GamePartition[] = ['classic', 'smw', 'expedition', 'frontier', 'fortune', 'mirage', 'echo', 'dimension'];

export interface PartitionInfo {
  tab: string;
  edition: string;
  subtitle: string;
  worldsLabel: string;
  worldNoun: string;
  firstStage: string;
  hint: string;
  accent: string;
  subtitleColor: string;
}

export const PARTITION_INFO: Record<GamePartition, PartitionInfo> = {
  classic: {
    tab: '🍄 BROS (24)',
    edition: '16-BIT CONSOLE EDITION • CLÁSICO',
    subtitle: 'BROS. DELUXE',
    worldsLabel: '6 MUNDOS',
    worldNoun: 'MUNDO',
    firstStage: '1-1',
    hint: 'Desliza el pulgar en la cruceta  •  Mantén B para correr y rueda el pulgar hacia A para gran salto',
    accent: '#dc2626',
    subtitleColor: '#fde68a',
  },
  smw: {
    tab: '🦕 WORLD (20)',
    edition: '16-BIT ISLA DINOSAURIO • YOSHI & CAPA',
    subtitle: 'WORLD • 20 NIVELES',
    worldsLabel: '5 MUNDOS',
    worldNoun: 'ISLA',
    firstStage: 'Y-1',
    hint: 'Yoshi: pulsa Y para Lengua/Fuego  •  Capa: corre con B hasta llenar [P] y salta con A para volar',
    accent: '#16a34a',
    subtitleColor: '#bbf7d0',
  },
  expedition: {
    tab: '🧭 EXPEDICIÓN (28)',
    edition: 'NUEVA AVENTURA • 5 MUNDOS ORIGINALES',
    subtitle: 'EXPEDICIÓN',
    worldsLabel: '5 MUNDOS',
    worldNoun: 'ZONA',
    firstStage: 'A-1',
    hint: 'X lanza la llave inglesa  •  Empuja contra una pared y pulsa A para saltar en pared  •  Corre y pulsa ▼ para barrerte',
    accent: '#7c3aed',
    subtitleColor: '#ddd6fe',
  },
  frontier: {
    tab: '🌊 MUNDO 5',
    edition: 'CAMPAÑA 2D • MAREA ESPEJO / VALLE VÍTREO',
    subtitle: 'MUNDO 5 • FRONTERA',
    worldsLabel: '2 REGIONES',
    worldNoun: 'MUNDO',
    firstStage: 'M-1',
    hint: 'Marea Espejo y Valle Vítreo • rutas, secretos y objetivos variables',
    accent: '#0284c7',
    subtitleColor: '#e0f2fe',
  },
  fortune: {
    tab: '🎰 MUNDO 6',
    edition: 'NUEVA AVENTURA • RIESGO / RECOMPENSA',
    subtitle: 'MUNDO 6 • FORTUNA',
    worldsLabel: '4 MUNDOS',
    worldNoun: 'MUNDO',
    firstStage: 'F-1',
    hint: 'Apuesta monedas en altares: arriesga por el botín o asegura la ruta • la meta abre con capital',
    accent: '#b45309',
    subtitleColor: '#fde68a',
  },
  mirage: {
    tab: '👻 MUNDO 7',
    edition: 'NUEVA AVENTURA • SUMA CERO',
    subtitle: 'MUNDO 7 • ESPECTRO',
    worldsLabel: '4 MUNDOS',
    worldNoun: 'MUNDO',
    firstStage: 'W-1',
    hint: 'Una urraca te roba gemas • persíguela para recuperarlas o pierdes el objetivo',
    accent: '#7c3aed',
    subtitleColor: '#e9d5ff',
  },
  echo: {
    tab: '🪞 MUNDO 8',
    edition: 'NUEVA AVENTURA • COORDINACIÓN / ESPEJO',
    subtitle: 'MUNDO 8 • ECO',
    worldsLabel: '4 MUNDOS',
    worldNoun: 'MUNDO',
    firstStage: 'E-1',
    hint: 'Un reflejo repite tu camino con retraso: guíalo sobre las monedas que dejaste atrás',
    accent: '#0d9488',
    subtitleColor: '#99f6e4',
  },
  dimension: {
    tab: '🧊 DIMENSIÓN 3D (32)',
    edition: 'NUEVO • MUNDOS EN 3D • 8 MUNDOS ORIGINALES',
    subtitle: 'DIMENSIÓN 3D',
    worldsLabel: '8 MUNDOS',
    worldNoun: 'ZONA',
    firstStage: 'J-1',
    hint: 'Mundos con volumen y cámara en perspectiva  •  Mismos controles: A salta, X llave inglesa, ▼ barrida',
    accent: '#0891b2',
    subtitleColor: '#a5f3fc',
  },
};

export interface PartitionProgress {
  highScore: number;
  unlocked: number;
  cleared: number[];
  best: Record<number, number>;
  total: number;
}

export function getPartitionProgress(prog: SaveProgress, part: GamePartition): PartitionProgress {
  const total = partitionTotalLevels(part);
  if (part === 'smw') {
    return {
      highScore: prog.smwHighScore,
      unlocked: prog.smwUnlockedLevel,
      cleared: prog.smwClearedLevels,
      best: prog.smwBestStageScores,
      total,
    };
  }
  if (part === 'dimension') {
    return {
      highScore: prog.dimHighScore ?? 0,
      unlocked: prog.dimUnlockedLevel ?? 0,
      cleared: prog.dimClearedLevels ?? [],
      best: prog.dimBestStageScores ?? {},
      total,
    };
  }
  if (part === 'expedition') {
    return {
      highScore: prog.expHighScore ?? 0,
      unlocked: prog.expUnlockedLevel ?? 0,
      cleared: prog.expClearedLevels ?? [],
      best: prog.expBestStageScores ?? {},
      total,
    };
  }
  if (part === 'frontier') {
    return {
      highScore: prog.frontierHighScore ?? 0,
      unlocked: prog.frontierUnlockedLevel ?? 0,
      cleared: prog.frontierClearedLevels ?? [],
      best: prog.frontierBestStageScores ?? {},
      total,
    };
  }
  if (part === 'fortune') {
    return {
      highScore: prog.fortuneHighScore ?? 0,
      unlocked: prog.fortuneUnlockedLevel ?? 0,
      cleared: prog.fortuneClearedLevels ?? [],
      best: prog.fortuneBestStageScores ?? {},
      total,
    };
  }
  if (part === 'mirage') {
    return {
      highScore: prog.mirageHighScore ?? 0,
      unlocked: prog.mirageUnlockedLevel ?? 0,
      cleared: prog.mirageClearedLevels ?? [],
      best: prog.mirageBestStageScores ?? {},
      total,
    };
  }
  if (part === 'echo') {
    return {
      highScore: prog.echoHighScore ?? 0,
      unlocked: prog.echoUnlockedLevel ?? 0,
      cleared: prog.echoClearedLevels ?? [],
      best: prog.echoBestStageScores ?? {},
      total,
    };
  }
  return {
    highScore: prog.highScore,
    unlocked: prog.unlockedLevel,
    cleared: prog.clearedLevels,
    best: prog.bestStageScores,
    total,
  };
}

export function withPartitionProgress(
  prog: SaveProgress,
  part: GamePartition,
  next: Omit<PartitionProgress, 'total'>
): SaveProgress {
  if (part === 'smw') {
    return {
      ...prog,
      smwHighScore: next.highScore,
      smwUnlockedLevel: next.unlocked,
      smwClearedLevels: next.cleared,
      smwBestStageScores: next.best,
    };
  }
  if (part === 'dimension') {
    return {
      ...prog,
      dimHighScore: next.highScore,
      dimUnlockedLevel: next.unlocked,
      dimClearedLevels: next.cleared,
      dimBestStageScores: next.best,
    };
  }
  if (part === 'expedition') {
    return {
      ...prog,
      expHighScore: next.highScore,
      expUnlockedLevel: next.unlocked,
      expClearedLevels: next.cleared,
      expBestStageScores: next.best,
    };
  }
  if (part === 'frontier') {
    return {
      ...prog,
      frontierHighScore: next.highScore,
      frontierUnlockedLevel: next.unlocked,
      frontierClearedLevels: next.cleared,
      frontierBestStageScores: next.best,
    };
  }
  if (part === 'fortune') {
    return {
      ...prog,
      fortuneHighScore: next.highScore,
      fortuneUnlockedLevel: next.unlocked,
      fortuneClearedLevels: next.cleared,
      fortuneBestStageScores: next.best,
    };
  }
  if (part === 'mirage') {
    return {
      ...prog,
      mirageHighScore: next.highScore,
      mirageUnlockedLevel: next.unlocked,
      mirageClearedLevels: next.cleared,
      mirageBestStageScores: next.best,
    };
  }
  if (part === 'echo') {
    return {
      ...prog,
      echoHighScore: next.highScore,
      echoUnlockedLevel: next.unlocked,
      echoClearedLevels: next.cleared,
      echoBestStageScores: next.best,
    };
  }
  return {
    ...prog,
    highScore: next.highScore,
    unlockedLevel: next.unlocked,
    clearedLevels: next.cleared,
    bestStageScores: next.best,
  };
}

/** Registra un nivel completado en el progreso del modo. */
export function recordStageClear(
  prog: SaveProgress,
  part: GamePartition,
  levelIndex: number,
  score: number
): SaveProgress {
  const cur = getPartitionProgress(prog, part);
  const cleared = new Set(cur.cleared);
  cleared.add(levelIndex);
  const prevBest = cur.best[levelIndex] ?? 0;
  return {
    ...withPartitionProgress(prog, part, {
      highScore: Math.max(cur.highScore, score),
      unlocked: Math.min(cur.total - 1, Math.max(cur.unlocked, levelIndex + 1)),
      cleared: Array.from(cleared).sort((a, b) => a - b),
      best: { ...cur.best, [levelIndex]: Math.max(prevBest, score) },
    }),
    lastPartition: part,
  };
}

export function nextPartition(part: GamePartition): GamePartition {
  const i = PARTITION_ORDER.indexOf(part);
  return PARTITION_ORDER[(i + 1) % PARTITION_ORDER.length];
}
