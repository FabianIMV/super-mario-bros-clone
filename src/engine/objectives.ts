// ============================================================================
// OBJETIVOS POR NIVEL (Fase 2)
// No todos los niveles son "llegar a la meta":
//   · Gemas: junta todas para abrir la meta.
//   · Contrarreloj: poco tiempo, relojes que suman segundos.
//   · Persecución: una sombra avanza desde la izquierda; si te alcanza, pierdes.
// `applyStageObjective` se ejecuta sobre un WorldState recién construido y
// `updateObjectives` corre una vez por frame desde stepWorld.
// ============================================================================
import { GROUND_ROW, TILE } from './biomes';
import type { GameEvent, GamePartition, Pickup, StageObjective, WorldState } from './types';

const key = (col: number, row: number): number => row * 1024 + col;

// Objetivo por índice de nivel. Los castillos (X-4) y los no listados son 'reach'.
const CLASSIC_OBJECTIVES: Record<number, StageObjective> = {
  2: 'collect',
  5: 'time_attack',
  6: 'chase',
  8: 'collect',
  10: 'chase',
  12: 'time_attack',
  13: 'collect',
  16: 'chase',
  18: 'time_attack',
  20: 'collect',
  21: 'chase',
  22: 'time_attack',
};
const SMW_OBJECTIVES: Record<number, StageObjective> = {
  1: 'time_attack',
  2: 'collect',
  4: 'collect',
  6: 'chase',
  8: 'time_attack',
  9: 'chase',
  12: 'chase',
  13: 'collect',
  14: 'time_attack',
  16: 'collect',
  17: 'time_attack',
  18: 'chase',
};

const EXP_OBJECTIVES: Record<number, StageObjective> = {
  1: 'collect',
  2: 'chase',
  4: 'time_attack',
  5: 'collect',
  6: 'chase',
  8: 'collect',
  9: 'time_attack',
  10: 'chase',
  12: 'time_attack',
  14: 'collect',
  16: 'chase',
  17: 'collect',
  18: 'time_attack',
};

export const GEMS_PER_STAGE = 5;
export const CLOCKS_PER_STAGE = 5;
export const TIME_ATTACK_START = 75; // unidades del contador (1 unidad = 38 frames)
export const CLOCK_BONUS = 15;
export const CHASE_DELAY = 150; // frames antes de que la sombra empiece a moverse
export const CHASE_START_GAP = 12 * TILE;
export const CHASE_MAX_LAG = 40;
export const CHASE_MIN_FACTOR = 0.3; // velocidad mínima relativa cuando está pegada al jugador // px máximos fuera de pantalla por la izquierda

export const OBJECTIVE_LABELS: Record<StageObjective, { text: string; color: string }> = {
  reach: { text: '', color: '#ffffff' },
  collect: { text: `OBJETIVO: ${GEMS_PER_STAGE} GEMAS`, color: '#f0abfc' },
  time_attack: { text: '¡CONTRARRELOJ!', color: '#fde047' },
  chase: { text: '¡ESCAPA DE LA SOMBRA!', color: '#c084fc' },
};

export function getStageObjective(levelIndex: number, partition: GamePartition): StageObjective {
  const table =
    partition === 'smw' ? SMW_OBJECTIVES : partition === 'expedition' ? EXP_OBJECTIVES : CLASSIC_OBJECTIVES;
  return table[levelIndex] ?? 'reach';
}

export function chaseSpeed(worldNum: number): number {
  return 1.65 + worldNum * 0.06;
}

function isOpen(world: WorldState, col: number, row: number): boolean {
  return !world.blockGrid.has(key(col, row));
}

function overlapsPipe(world: WorldState, col: number): boolean {
  const x = col * TILE;
  return world.pipes.some((p) => x + TILE > p.x && x < p.x + p.width);
}

/**
 * Busca `count` lugares repartidos por el nivel. Prefiere la parte de arriba de
 * bloques flotantes (premia explorar); si no hay, usa el aire sobre el suelo.
 */
function findSpots(world: WorldState, count: number, preferHigh: boolean): Array<{ col: number; row: number }> {
  const first = 14;
  const last = world.totalCols - 16;
  const span = last - first;
  const spots: Array<{ col: number; row: number }> = [];
  for (let i = 0; i < count; i++) {
    const center = Math.round(first + ((i + 0.5) * span) / count);
    let best: { col: number; row: number; score: number } | null = null;
    for (let d = 0; d <= 7; d++) {
      for (const col of d === 0 ? [center] : [center - d, center + d]) {
        if (col < first || col > last || overlapsPipe(world, col)) continue;
        // Encima de un bloque flotante
        if (preferHigh) {
          for (let row = 4; row <= 9; row++) {
            const b = world.blockGrid.get(key(col, row));
            if (!b || b.type === 'hidden') continue;
            if (isOpen(world, col, row - 1) && isOpen(world, col, row - 2)) {
              const score = d;
              if (!best || score < best.score) best = { col, row: row - 1, score };
            }
            break;
          }
        }
        // En el aire sobre suelo firme (hay que saltar para tomarlo)
        if (
          world.blockGrid.has(key(col, GROUND_ROW)) &&
          isOpen(world, col, 9) &&
          isOpen(world, col, 10) &&
          isOpen(world, col, 11)
        ) {
          const score = d + (preferHigh ? 3 : 0);
          if (!best || score < best.score) best = { col, row: 9, score };
        }
      }
      if (best && best.score <= d) break;
    }
    if (best && !spots.some((s) => s.col === best!.col)) spots.push({ col: best.col, row: best.row });
  }
  return spots;
}

function makePickup(world: WorldState, kind: Pickup['kind'], col: number, row: number): Pickup {
  return {
    id: world.nextEntityId++,
    kind,
    x: col * TILE + 6,
    y: row * TILE + 4,
    width: 20,
    height: 24,
    collected: false,
    phase: col * 0.37,
  };
}

export function applyStageObjective(world: WorldState): WorldState {
  const objective = getStageObjective(world.levelIndex, world.partition);
  world.objective = objective;
  world.pickups = world.pickups ?? [];
  world.gemsNeeded = 0;
  world.gemsCollected = 0;
  world.chase = null;
  world.goalBlockedTimer = 0;

  // Si reaparece en el checkpoint, lo que quedó atrás ya cuenta como tomado
  const resumeX = world.player.x > 6 * TILE ? world.player.x : -Infinity;

  switch (objective) {
    case 'collect': {
      for (const s of findSpots(world, GEMS_PER_STAGE, true)) {
        const gem = makePickup(world, 'gem', s.col, s.row);
        if (gem.x < resumeX) {
          gem.collected = true;
          world.gemsCollected += 1;
        }
        world.pickups.push(gem);
      }
      world.gemsNeeded = world.pickups.filter((pk) => pk.kind === 'gem').length;
      break;
    }
    case 'time_attack': {
      world.timeLeft = TIME_ATTACK_START;
      for (const s of findSpots(world, CLOCKS_PER_STAGE, false)) {
        world.pickups.push(makePickup(world, 'clock', s.col, s.row));
      }
      break;
    }
    case 'chase':
      world.chase = {
        x: world.player.x - CHASE_START_GAP,
        speed: chaseSpeed(Math.floor(world.levelIndex / 4) + 1),
        delay: CHASE_DELAY,
      };
      break;
    case 'reach':
      break;
  }

  const label = OBJECTIVE_LABELS[objective];
  if (label.text) {
    world.floatingTexts.push({
      x: world.player.x - 40,
      y: world.player.y - 40,
      text: label.text,
      color: label.color,
      life: 170,
      maxLife: 170,
    });
  }
  return world;
}

/** ¿La meta está cerrada? (faltan gemas) */
export function isGoalLocked(world: WorldState): boolean {
  return world.objective === 'collect' && (world.gemsCollected ?? 0) < (world.gemsNeeded ?? 0);
}

/** Texto corto para el HUD, o null si el nivel es de llegar a la meta. */
export function objectiveHudLabel(world: WorldState): string | null {
  switch (world.objective) {
    case 'collect':
      return `💎 ${world.gemsCollected ?? 0}/${world.gemsNeeded ?? 0}`;
    case 'time_attack':
      return '⏱ CONTRARRELOJ';
    case 'chase':
      return '👁 ¡CORRE!';
    default:
      return null;
  }
}

// ============================================================================
// ACTUALIZACIÓN POR FRAME
// ============================================================================
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const hit = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

export interface ObjectiveCallbacks {
  killPlayer: () => void;
  sparks: (x: number, y: number, color: string, count: number) => void;
  text: (x: number, y: number, text: string, color: string) => void;
}

export function updateObjectives(world: WorldState, events: GameEvent[], cb: ObjectiveCallbacks): void {
  const p = world.player;

  // --- Gemas y relojes ---
  if (world.pickups) {
    for (const pk of world.pickups) {
      if (pk.collected || (pk.kind !== 'gem' && pk.kind !== 'clock') || !hit(p, pk)) continue;
      pk.collected = true;
      if (pk.kind === 'gem') {
        world.gemsCollected = (world.gemsCollected ?? 0) + 1;
        world.score += 1000;
        const left = (world.gemsNeeded ?? 0) - world.gemsCollected;
        cb.text(pk.x - 20, pk.y - 10, left > 0 ? `GEMA ${world.gemsCollected}/${world.gemsNeeded}` : '¡META ABIERTA!', '#f0abfc');
        cb.sparks(pk.x + 10, pk.y + 12, '#f0abfc', 10);
        events.push({ type: 'sfx', id: left > 0 ? 'gem' : 'treasure' });
        events.push({ type: 'haptic', kind: left > 0 ? 'medium' : 'success' });
      } else {
        world.timeLeft += CLOCK_BONUS;
        cb.text(pk.x - 10, pk.y - 10, `+${CLOCK_BONUS}`, '#fde047');
        cb.sparks(pk.x + 10, pk.y + 12, '#fde047', 8);
        events.push({ type: 'sfx', id: 'clock' });
        events.push({ type: 'haptic', kind: 'light' });
      }
    }
  }

  // --- Sombra que persigue ---
  const ch = world.chase;
  if (ch) {
    if (ch.delay > 0) {
      ch.delay -= 1;
      if (ch.delay === 0) events.push({ type: 'sfx', id: 'chase_growl' });
    } else {
      // Frena al acercarse: presiona, pero deja esperar un ascensor o una luz
      const dist = p.x - ch.x;
      const factor = Math.max(CHASE_MIN_FACTOR, Math.min(1, (dist - 60) / 240));
      ch.x += ch.speed * factor;
    }
    // Nunca se queda muy atrás: siempre asoma por el borde izquierdo
    ch.x = Math.max(ch.x, world.cameraX - CHASE_MAX_LAG);
    if (p.x < ch.x + 4) {
      cb.killPlayer();
      return;
    }
    if (world.frameCount % 3 === 0) {
      world.particles.push({
        x: ch.x - 4,
        y: 40 + ((world.frameCount * 53) % 360),
        vx: 1.2 + ch.speed,
        vy: -0.4,
        gravity: 0,
        size: 4,
        color: '#a855f7',
        life: 24,
        maxLife: 24,
        kind: 'spark',
      });
    }
  }

  if (world.goalBlockedTimer && world.goalBlockedTimer > 0) world.goalBlockedTimer -= 1;
}

/**
 * Si la meta está cerrada y el jugador la alcanza, lo empuja hacia atrás y le
 * dice cuántas gemas faltan. Devuelve true si bloqueó la meta en este frame.
 */
export function enforceGoalLock(world: WorldState, events: GameEvent[], cb: ObjectiveCallbacks): boolean {
  if (!isGoalLocked(world)) return false;
  const p = world.player;
  const goalX = world.flagpole ? world.flagpole.x : world.goalTape ? world.goalTape.x : null;
  if (goalX === null || p.x + p.width < goalX - 2) return false;
  p.x = goalX - p.width - 6;
  p.vx = -3.5;
  if (!world.goalBlockedTimer) {
    const left = (world.gemsNeeded ?? 0) - (world.gemsCollected ?? 0);
    cb.text(goalX - 70, p.y - 24, `¡FALTAN ${left} GEMAS!`, '#f0abfc');
    events.push({ type: 'sfx', id: 'goal_locked' });
    events.push({ type: 'haptic', kind: 'error' });
    world.goalBlockedTimer = 60;
  }
  return true;
}
