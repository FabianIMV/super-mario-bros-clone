// ============================================================================
// MECÁNICAS POR MUNDO (Fase 1)
// Cada mundo tiene una regla propia que cambia cómo se juegan sus niveles:
//   Hongos trampolín · Viento · Luciérnagas · Carámbanos · Puentes frágiles ·
//   Gravedad baja · Marea de lava (castillos).
// `applyStageMechanic` se ejecuta sobre un WorldState recién construido y
// `updateMechanics` corre una vez por frame desde stepWorld.
// ============================================================================
import { GROUND_ROW, STAGES_PER_WORLD, TILE } from './biomes';
import type {
  Block,
  GameEvent,
  GamePartition,
  MovingPlatform,
  StageMechanic,
  WorldState,
} from './types';

const key = (col: number, row: number): number => row * 1024 + col;

const CLASSIC_MECHANICS: StageMechanic[] = ['bounce', 'wind', 'firefly', 'icicles', 'crumble', 'lowgrav'];
const SMW_MECHANICS: StageMechanic[] = ['bounce', 'wind', 'crumble', 'firefly', 'lowgrav'];
// Expedición: arrecife flotante, selva de luciérnagas, ciudad de puentes frágiles,
// nubes con viento y volcán de carámbanos de cristal
const EXP_MECHANICS: StageMechanic[] = ['lowgrav', 'firefly', 'crumble', 'wind', 'icicles'];
// Dimensión 3D: jardín sin gravedad, juguetes saltarines, polo con viento y fragua de puentes
const DIM_MECHANICS: StageMechanic[] = ['lowgrav', 'bounce', 'wind', 'crumble'];

export const MECHANIC_LABELS: Record<StageMechanic, { text: string; color: string }> = {
  none: { text: '', color: '#ffffff' },
  bounce: { text: '¡HONGOS SALTARINES!', color: '#f87171' },
  wind: { text: '¡CUIDADO CON EL VIENTO!', color: '#fde68a' },
  firefly: { text: '¡LAS LUCES SE APAGAN!', color: '#bef264' },
  icicles: { text: '¡CARÁMBANOS!', color: '#7dd3fc' },
  crumble: { text: '¡PUENTES FRÁGILES!', color: '#fdba74' },
  lowgrav: { text: '¡GRAVEDAD BAJA!', color: '#c4b5fd' },
  lava_tide: { text: '¡LA LAVA SUBE!', color: '#fb923c' },
};

export function getStageMechanic(levelIndex: number, partition: GamePartition): StageMechanic {
  const worldNum = Math.floor(levelIndex / STAGES_PER_WORLD) + 1;
  const stageNum = (levelIndex % STAGES_PER_WORLD) + 1;
  if (stageNum === 4) return 'lava_tide';
  const table =
    partition === 'smw'
      ? SMW_MECHANICS
      : partition === 'expedition'
      ? EXP_MECHANICS
      : partition === 'dimension'
      ? DIM_MECHANICS
      : CLASSIC_MECHANICS;
  return table[Math.min(table.length - 1, worldNum - 1)];
}

// Timings (frames @60Hz)
export const WIND_CALM = 230;
export const WIND_WARN = 60;
export const WIND_GUST = 150;
export const FIREFLY_PERIOD = 210;
export const FIREFLY_ON = 150;
export const FIREFLY_WARN = 36;
export const CRUMBLE_DELAY = 28;
export const CRUMBLE_RESPAWN = 240;
export const LAVA_TIDE_PERIOD = 330;
export const LAVA_TIDE_MAX = 44; // px que sube la lava sobre su nivel normal

/** Columnas de foso (sin suelo) agrupadas en tramos [start, end]. */
function pitRuns(world: WorldState): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;
  for (let c = 0; c < world.totalCols; c++) {
    const pit = !world.blockGrid.has(key(c, GROUND_ROW));
    if (pit && start < 0) start = c;
    if (!pit && start >= 0) {
      runs.push([start, c - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, world.totalCols - 1]);
  return runs;
}

function isFreeGround(world: WorldState, col: number): boolean {
  if (!world.blockGrid.has(key(col, GROUND_ROW))) return false;
  for (let r = GROUND_ROW - 3; r < GROUND_ROW; r++) {
    if (world.blockGrid.has(key(col, r))) return false;
  }
  const x = col * TILE;
  if (world.pipes.some((p) => x + TILE > p.x && x < p.x + p.width)) return false;
  if (world.springs.some((s) => Math.abs(s.x - x) < TILE * 2)) return false;
  return true;
}

export function applyStageMechanic(world: WorldState): WorldState {
  const mechanic = getStageMechanic(world.levelIndex, world.partition);
  world.mechanic = mechanic;
  world.wind = null;
  world.icicles = [];
  world.lowGravZones = [];
  world.crumbled = [];
  world.lavaTide = false;

  const safeEnd = world.totalCols - 12;

  switch (mechanic) {
    case 'bounce': {
      for (const sp of world.springs) sp.kind = 'mushroom';
      // Un hongo antes de cada foso ancho para cruzarlo de un rebote
      for (const [s, e] of pitRuns(world)) {
        if (s < 12 || e > safeEnd || e - s + 1 < 3) continue;
        for (const col of [s - 2, s - 3]) {
          if (isFreeGround(world, col)) {
            world.springs.push({
              x: col * TILE + 3,
              y: (GROUND_ROW - 1) * TILE + 4,
              width: 26,
              height: 28,
              compressTimer: 0,
              kind: 'mushroom',
            });
            break;
          }
        }
      }
      break;
    }

    case 'wind':
      world.wind = { phase: 'calm', timer: WIND_CALM, dir: 1, cycle: 0 };
      break;

    case 'firefly':
      world.platforms.forEach((pl, i) => {
        pl.blink = { period: FIREFLY_PERIOD, on: FIREFLY_ON, offset: (i * 71) % FIREFLY_PERIOD };
      });
      break;

    case 'icicles': {
      let placed = 0;
      const candidates = world.blocks
        .filter(
          (b) =>
            (b.type === 'brick' || b.type === 'hard' || b.type === 'question') &&
            b.row >= 2 &&
            b.row <= 8 &&
            b.col > 14 &&
            b.col < safeEnd &&
            !world.blockGrid.has(key(b.col, b.row + 1)) &&
            world.blockGrid.has(key(b.col, GROUND_ROW))
        )
        .sort((a, b) => a.col - b.col);
      let lastCol = -99;
      for (const b of candidates) {
        if (b.col - lastCol < 5 || placed >= 12) continue;
        world.icicles.push({
          id: world.nextEntityId++,
          x: b.col * TILE + 8,
          y: (b.row + 1) * TILE,
          homeY: (b.row + 1) * TILE,
          width: 16,
          height: 24,
          state: 'hang',
          timer: 0,
          vy: 0,
        });
        lastCol = b.col;
        placed++;
      }
      break;
    }

    case 'crumble': {
      // Puente frágil sobre cada foso sin plataforma móvil
      for (const [s, e] of pitRuns(world)) {
        if (s < 10 || e > safeEnd) continue;
        const hasLift = world.platforms.some(
          (pl) => pl.startX + pl.width >= (s - 1) * TILE && pl.startX <= (e + 1) * TILE
        );
        const hasBridge = [8, 9, 10].some((r) => world.blockGrid.has(key(s, r)));
        if (hasLift || hasBridge) continue;
        for (let c = s; c <= e; c++) {
          // A ras de suelo: se cruza caminando, pero se desmorona detrás de ti
          if (world.blockGrid.has(key(c, GROUND_ROW))) continue;
          const b: Block = {
            id: world.nextEntityId++,
            col: c,
            row: GROUND_ROW,
            x: c * TILE,
            y: GROUND_ROW * TILE,
            baseY: GROUND_ROW * TILE,
            width: TILE,
            height: TILE,
            type: 'bridge',
            content: null,
            coinsRemaining: 0,
            bounceY: 0,
            bounceVel: 0,
            spinTimer: 0,
          };
          world.blocks.push(b);
          world.blockGrid.set(key(c, GROUND_ROW), b);
        }
      }
      for (const b of world.blocks) {
        if (b.type === 'bridge') b.crumble = true;
      }
      break;
    }

    case 'lowgrav': {
      for (const [s, e] of pitRuns(world)) {
        if (s < 8 || e > safeEnd) continue;
        const x0 = (s - 3) * TILE;
        const x1 = (e + 4) * TILE;
        const last = world.lowGravZones[world.lowGravZones.length - 1];
        if (last && x0 <= last.x1) last.x1 = Math.max(last.x1, x1);
        else world.lowGravZones.push({ x0, x1 });
      }
      break;
    }

    case 'lava_tide':
      world.lavaTide = true;
      break;

    case 'none':
      break;
  }

  const label = MECHANIC_LABELS[mechanic];
  if (label.text) {
    world.floatingTexts.push({
      x: world.player.x - 40,
      y: world.player.y - 70,
      text: label.text,
      color: label.color,
      life: 170,
      maxLife: 170,
    });
  }
  return world;
}

// ============================================================================
// CONSULTAS USADAS POR LA FÍSICA Y EL RENDERER
// ============================================================================

/** ¿La plataforma está encendida (sólida) en este frame? */
export function isPlatformSolid(pl: MovingPlatform, frame: number): boolean {
  if (!pl.blink) return true;
  return (frame + pl.blink.offset) % pl.blink.period < pl.blink.on;
}

/** 0 = apagada, 1 = encendida; entre medio parpadea antes de apagarse. */
export function platformGlow(pl: MovingPlatform, frame: number): number {
  if (!pl.blink) return 1;
  const t = (frame + pl.blink.offset) % pl.blink.period;
  if (t >= pl.blink.on) return 0;
  if (t >= pl.blink.on - FIREFLY_WARN) return Math.floor(t / 4) % 2 === 0 ? 0.35 : 1;
  return 1;
}

/** Empuje horizontal del viento en este frame (px/frame²). */
export function windPush(world: WorldState, onGround: boolean): number {
  const w = world.wind;
  if (!w || w.phase !== 'gust') return 0;
  return w.dir * (onGround ? 0.16 : 0.19);
}

export function isInLowGrav(world: WorldState, centerX: number): boolean {
  const zones = world.lowGravZones;
  if (!zones || zones.length === 0) return false;
  return zones.some((z) => centerX >= z.x0 && centerX <= z.x1);
}

/** Cuántos px sube la marea de lava ahora mismo (0..LAVA_TIDE_MAX). */
export function lavaTideRise(world: WorldState): number {
  if (!world.lavaTide) return 0;
  const t = world.frameCount % LAVA_TIDE_PERIOD;
  // 0..150 calma · 150..190 sube · 190..250 arriba · 250..300 baja · 300..330 calma
  if (t < 150) return 0;
  if (t < 190) return ((t - 150) / 40) * LAVA_TIDE_MAX;
  if (t < 250) return LAVA_TIDE_MAX;
  if (t < 300) return (1 - (t - 250) / 50) * LAVA_TIDE_MAX;
  return 0;
}

/** ¿Está por subir la lava? (para burbujas de aviso) */
export function lavaTideWarning(world: WorldState): boolean {
  if (!world.lavaTide) return false;
  const t = world.frameCount % LAVA_TIDE_PERIOD;
  return t >= 105 && t < 150;
}

/** Superficie de la lava en una columna (y en px), teniendo en cuenta la marea. */
export function lavaSurfaceY(world: WorldState, col: number): number {
  const base = GROUND_ROW * TILE + 12;
  if (!world.lavaTide || world.boss?.bridgeCols.includes(col)) return base;
  return base - lavaTideRise(world);
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

export interface MechanicCallbacks {
  removeBlock: (block: Block) => void;
  damagePlayer: () => void;
  sparks: (x: number, y: number, color: string, count: number) => void;
}

export function updateMechanics(
  world: WorldState,
  events: GameEvent[],
  cb: MechanicCallbacks
): void {
  const p = world.player;

  // --- Viento: calma → aviso → ráfaga, alternando dirección cada 3 ciclos ---
  const w = world.wind;
  if (w) {
    w.timer -= 1;
    if (w.timer <= 0) {
      if (w.phase === 'calm') {
        w.phase = 'warn';
        w.timer = WIND_WARN;
        w.dir = w.cycle % 3 === 2 ? -1 : 1;
        events.push({ type: 'haptic', kind: 'light' });
      } else if (w.phase === 'warn') {
        w.phase = 'gust';
        w.timer = WIND_GUST;
        events.push({ type: 'sfx', id: 'wind_gust' });
        events.push({ type: 'haptic', kind: 'medium' });
      } else {
        w.phase = 'calm';
        w.timer = WIND_CALM;
        w.cycle += 1;
      }
    }
    if (w.phase !== 'calm' && world.frameCount % (w.phase === 'gust' ? 2 : 6) === 0) {
      const fromX = w.dir === 1 ? world.cameraX - 10 : world.cameraX + 900;
      world.particles.push({
        x: fromX,
        y: 30 + ((world.frameCount * 37) % 300),
        vx: w.dir * (w.phase === 'gust' ? 11 : 6),
        vy: 0,
        gravity: 0,
        size: 3,
        color: 'rgba(255,255,255,0.75)',
        life: 90,
        maxLife: 90,
        kind: 'wind',
      });
    }
  }

  // --- Carámbanos: cuelgan, tiemblan al pasar debajo y caen ---
  if (world.icicles) {
    const pc = p.x + p.width / 2;
    for (const ic of world.icicles) {
      if (ic.state === 'gone') continue;
      if (ic.state === 'hang') {
        if (Math.abs(pc - (ic.x + ic.width / 2)) < 56 && p.y > ic.y) {
          ic.state = 'shake';
          ic.timer = 26;
          events.push({ type: 'sfx', id: 'icicle_crack' });
        }
      } else if (ic.state === 'shake') {
        ic.timer -= 1;
        if (ic.timer <= 0) ic.state = 'fall';
      } else {
        ic.vy = Math.min(ic.vy + 0.55, 11);
        ic.y += ic.vy;
        const tipCol = Math.floor((ic.x + ic.width / 2) / TILE);
        const tipRow = Math.floor((ic.y + ic.height) / TILE);
        if (world.blockGrid.has(key(tipCol, tipRow)) || ic.y > GROUND_ROW * TILE + 40) {
          ic.state = 'gone';
          cb.sparks(ic.x + ic.width / 2, ic.y + ic.height, '#bae6fd', 8);
          events.push({ type: 'sfx', id: 'break_block' });
          continue;
        }
      }
      if (ic.state !== 'hang' && hit(p, ic)) {
        if (p.starTimer > 0) {
          ic.state = 'gone';
          cb.sparks(ic.x + ic.width / 2, ic.y + ic.height / 2, '#bae6fd', 8);
        } else {
          ic.state = 'gone';
          cb.damagePlayer();
        }
      }
    }
  }

  // --- Puentes frágiles: tiemblan al pisarlos, caen y reaparecen ---
  if (world.mechanic === 'crumble') {
    if (p.onGround) {
      const row = Math.floor((p.y + p.height + 2) / TILE);
      for (const col of [Math.floor((p.x + 2) / TILE), Math.floor((p.x + p.width - 2) / TILE)]) {
        const b = world.blockGrid.get(key(col, row));
        if (b?.crumble && !b.crumbleTimer) b.crumbleTimer = CRUMBLE_DELAY;
      }
    }
    for (const b of world.blocks) {
      if (!b.crumbleTimer) continue;
      b.crumbleTimer -= 1;
      if (b.crumbleTimer <= 0) {
        b.crumbleTimer = 0;
        cb.removeBlock(b);
        world.crumbled!.push({ block: b, respawnTimer: CRUMBLE_RESPAWN });
        cb.sparks(b.x + TILE / 2, b.y + TILE / 2, '#d6a26a', 6);
        events.push({ type: 'sfx', id: 'crumble' });
      }
    }
    const crumbled = world.crumbled!;
    for (let i = crumbled.length - 1; i >= 0; i--) {
      const c = crumbled[i];
      c.respawnTimer -= 1;
      if (c.respawnTimer <= 0 && !hit(p, c.block) && !world.blockGrid.has(key(c.block.col, c.block.row))) {
        world.blocks.push(c.block);
        world.blockGrid.set(key(c.block.col, c.block.row), c.block);
        crumbled.splice(i, 1);
      }
    }
  }

  // --- Marea de lava: aviso sonoro al empezar a burbujear ---
  if (world.lavaTide && world.frameCount % LAVA_TIDE_PERIOD === 105) {
    events.push({ type: 'sfx', id: 'lava_rise' });
  }

  // --- Marea de lava: burbujas de aviso antes de subir ---
  if (lavaTideWarning(world) && world.frameCount % 5 === 0) {
    const firstCol = Math.floor(world.cameraX / TILE);
    for (let c = firstCol; c < firstCol + 30; c++) {
      if (!world.lavaCols.has(c) || world.boss?.bridgeCols.includes(c)) continue;
      if ((c * 7 + world.frameCount) % 3 !== 0) continue;
      world.particles.push({
        x: c * TILE + 8 + ((world.frameCount * 13) % 16),
        y: GROUND_ROW * TILE + 10,
        vx: 0,
        vy: -1.6,
        gravity: 0,
        size: 4,
        color: '#fdba74',
        life: 20,
        maxLife: 20,
        kind: 'lava',
      });
    }
  }
}
