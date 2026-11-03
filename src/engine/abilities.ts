// ============================================================================
// HABILIDADES DEL PLOMERO (Fase 4)
//   · Salto en pared: en el aire, empujar contra una pared hace deslizarse
//     lento; con A se rebota hacia el lado contrario.
//   · Deslizarse: corriendo, abajo = barrida por el suelo. Pasa por huecos
//     bajos y derriba a los enemigos comunes.
//   · Llave inglesa: con el botón de fuego (sin flor ni capa) se lanza como
//     bumerán. Derriba enemigos, golpea bloques, junta monedas y trae de vuelta
//     gemas, relojes o llaves.
//   · Chimeneas: dos paredes flotantes con un tesoro arriba que solo se
//     alcanza con salto en pared. Se pasa por debajo, así que son opcionales.
// La lógica del jugador vive en physics.ts; aquí están las constantes, la
// llave inglesa y la ubicación de las chimeneas.
// ============================================================================
import { GROUND_ROW, STAGES_PER_WORLD, TILE } from './biomes';
import type { Block, BlockType, Enemy, EnemyType, GameEvent, Pickup, Wrench, WorldState } from './types';

const key = (col: number, row: number): number => row * 1024 + col;

// --- Salto en pared ---
export const WALL_SLIDE_SPEED = 2.2;
export const WALL_JUMP_VY = -10.6;
export const WALL_JUMP_VX = 4.6;
export const WALL_JUMP_LOCK = 10;
export const WALL_COYOTE = 6;

// --- Deslizarse ---
export const SLIDE_MIN_SPEED = 3.4;
export const SLIDE_FRAMES = 36;
export const SLIDE_FRICTION = 0.978;
export const SLIDE_HEIGHT = 22;
/** Enemigos que una barrida derriba (los demás siguen dañando). */
export const SLIDE_KO = new Set<EnemyType>(['goomba', 'galoomba', 'koopa_green', 'koopa_red', 'rex']);

// --- Llave inglesa ---
export const WRENCH_SPEED = 8;
export const WRENCH_RANGE = 6 * TILE;
export const WRENCH_RETURN_SPEED = 9;
export const WRENCH_MAX_FRAMES = 150;

export function throwWrench(world: WorldState, events: GameEvent[]): boolean {
  const p = world.player;
  if (world.wrench) return false;
  world.wrench = {
    x: p.facing === 1 ? p.x + p.width : p.x - 18,
    y: p.y + Math.min(10, p.height / 3),
    width: 18,
    height: 18,
    vx: p.facing * WRENCH_SPEED,
    vy: 0,
    dir: p.facing === 1 ? 1 : -1,
    phase: 'out',
    travelled: 0,
    timer: 0,
    spin: 0,
    carryId: null,
    hitBoss: false,
  };
  p.throwPoseTimer = 10;
  events.push({ type: 'sfx', id: 'cape_spin' });
  events.push({ type: 'haptic', kind: 'light' });
  return true;
}

export interface WrenchCallbacks {
  knockEnemy: (en: Enemy) => void;
  collectCoin: (x: number, y: number) => void;
  hitBlock: (b: Block) => void;
  hitBoss: () => void;
  sparks: (x: number, y: number, color: string, count: number) => void;
}

const hit = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

const CARRYABLE: Array<Pickup['kind']> = ['gem', 'clock', 'key'];

export function updateWrench(world: WorldState, events: GameEvent[], cb: WrenchCallbacks): void {
  const w = world.wrench;
  if (!w) return;
  const p = world.player;
  w.timer += 1;
  w.spin += 0.45;

  if (w.phase === 'out') {
    w.x += w.vx;
    w.travelled += Math.abs(w.vx);
    // Choca con bloques: golpea ? y ladrillos, y vuelve
    const col = Math.floor((w.x + (w.dir === 1 ? w.width : 0)) / TILE);
    const row = Math.floor((w.y + w.height / 2) / TILE);
    const b = world.blockGrid.get(key(col, row));
    if (b && b.type !== 'hidden') {
      if (b.type === 'question' || b.type === 'brick' || b.type === 'rotating') cb.hitBlock(b);
      cb.sparks(w.x + w.width / 2, w.y + w.height / 2, '#e2e8f0', 4);
      events.push({ type: 'sfx', id: 'bump' });
      w.phase = 'back';
    } else if (world.pipes.some((pp) => hit(w, pp))) {
      w.phase = 'back';
    } else if (w.travelled >= WRENCH_RANGE) {
      w.phase = 'back';
    }
  } else {
    // Vuelve a la mano del plomero
    const tx = p.x + p.width / 2 - w.width / 2;
    const ty = p.y + Math.min(10, p.height / 3);
    const dx = tx - w.x;
    const dy = ty - w.y;
    const dist = Math.hypot(dx, dy) || 1;
    w.x += (dx / dist) * WRENCH_RETURN_SPEED;
    w.y += (dy / dist) * WRENCH_RETURN_SPEED;
    if (dist < WRENCH_RETURN_SPEED + 4) {
      // Atrapada: entrega lo que traía
      if (w.carryId !== null) {
        const pk = world.pickups?.find((x) => x.id === w.carryId);
        if (pk) {
          pk.x = p.x + p.width / 2 - pk.width / 2;
          pk.y = p.y + p.height / 2 - pk.height / 2;
        }
      }
      world.wrench = null;
      return;
    }
  }

  // Enemigos
  for (const en of world.enemies) {
    if (en.state === 'squashed' || en.state === 'knocked' || !en.active) continue;
    if (en.type === 'piranha' && en.y > en.baseY + en.height - 6) continue;
    if (hit(w, en)) {
      cb.knockEnemy(en);
      if (w.phase === 'out') w.phase = 'back';
    }
  }

  // Jefe: un golpe por lanzamiento
  if (world.boss && !world.boss.defeated && !w.hitBoss && hit(w, world.boss)) {
    w.hitBoss = true;
    w.phase = 'back';
    cb.hitBoss();
  }

  // Monedas
  for (const c of world.coinsList) {
    if (!c.collected && hit(w, c)) {
      c.collected = true;
      cb.collectCoin(c.x, c.y);
    }
  }

  // Trae de vuelta gemas, relojes o llaves
  if (world.pickups) {
    if (w.carryId === null) {
      const pk = world.pickups.find((x) => !x.collected && CARRYABLE.includes(x.kind) && hit(w, x));
      if (pk) {
        w.carryId = pk.id;
        w.phase = 'back';
      }
    }
    if (w.carryId !== null) {
      const pk = world.pickups.find((x) => x.id === w.carryId);
      if (pk && !pk.collected) {
        pk.x = w.x + w.width / 2 - pk.width / 2;
        pk.y = w.y + w.height / 2 - pk.height / 2;
      } else {
        w.carryId = null;
      }
    }
  }

  if (w.timer > WRENCH_MAX_FRAMES) world.wrench = null;
}

// ============================================================================
// CHIMENEAS (retos de salto en pared)
// ============================================================================
export const SHAFT_TOP_ROW = 3;
export const SHAFT_BOTTOM_ROW = 8;
export const SHAFT_INNER = 2; // columnas libres entre las paredes

export function stageHasShaft(levelIndex: number, partition: WorldState['partition']): boolean {
  const stageNum = (levelIndex % STAGES_PER_WORLD) + 1;
  if (stageNum === 4 || levelIndex === 0) return false;
  if (partition === 'classic' && levelIndex === 1) return false;
  return true;
}

function placeBlock(world: WorldState, col: number, row: number, type: BlockType): void {
  const b: Block = {
    id: world.nextEntityId++,
    col,
    row,
    x: col * TILE,
    y: row * TILE,
    baseY: row * TILE,
    width: TILE,
    height: TILE,
    type,
    content: null,
    coinsRemaining: 0,
    bounceY: 0,
    bounceVel: 0,
    spinTimer: 0,
  };
  world.blocks.push(b);
  world.blockGrid.set(key(col, row), b);
}

function findShaftCol(world: WorldState): number | null {
  const from = Math.max(14, Math.floor(world.totalCols * 0.2));
  const to = world.totalCols - 30;
  const cpCol = world.checkpoint ? Math.floor(world.checkpoint.x / TILE) : -99;
  const lockCol = world.blocks.find((b) => b.type === 'lock')?.col ?? -99;
  const width = SHAFT_INNER + 2;
  for (let c = from; c <= to; c++) {
    if (Math.abs(c - lockCol) < 12) continue;
    let ok = true;
    for (let col = c - 1; col <= c + width && ok; col++) {
      if (!world.blockGrid.has(key(col, GROUND_ROW)) || world.lavaCols.has(col)) ok = false;
      const inside = col >= c && col < c + width;
      for (let r = inside ? 2 : 9; r < GROUND_ROW && ok; r++) if (world.blockGrid.has(key(col, r))) ok = false;
      if (Math.abs(col - cpCol) <= 1) ok = false;
    }
    if (!ok) continue;
    const x0 = (c - 1) * TILE;
    const x1 = (c + width + 1) * TILE;
    const clash = (x: number, w: number) => x + w > x0 && x < x1;
    if (world.pipes.some((p) => clash(p.x, p.width))) continue;
    if (world.springs.some((s) => clash(s.x, s.width))) continue;
    if (world.platforms.some((p) => clash(p.startX - Math.abs(p.rangeX), p.width + 2 * Math.abs(p.rangeX)))) continue;
    if (world.pickups?.some((p) => clash(p.x, p.width))) continue;
    return c;
  }
  return null;
}

export function applyAbilityChallenges(world: WorldState): WorldState {
  world.wrench = null;
  world.shafts = [];
  if (!stageHasShaft(world.levelIndex, world.partition)) return world;
  const c = findShaftCol(world);
  if (c === null) return world;

  const right = c + SHAFT_INNER + 1;
  for (let r = SHAFT_TOP_ROW; r <= SHAFT_BOTTOM_ROW; r++) {
    placeBlock(world, c, r, 'hard');
    placeBlock(world, right, r, 'hard');
  }
  // Monedas que marcan el camino hacia arriba
  for (let r = SHAFT_BOTTOM_ROW - 1; r >= SHAFT_TOP_ROW; r -= 2) {
    for (let col = c + 1; col <= c + SHAFT_INNER; col++) {
      world.coinsList.push({
        x: col * TILE + 7,
        y: r * TILE + 5,
        baseY: r * TILE + 5,
        width: 18,
        height: 22,
        collected: false,
        phase: col * 0.45 + r,
      });
    }
  }
  // Tesoro sobre la pared derecha
  if (!world.pickups) world.pickups = [];
  world.pickups.push({
    id: world.nextEntityId++,
    kind: 'treasure',
    x: right * TILE + 4,
    y: (SHAFT_TOP_ROW - 1) * TILE + 2,
    width: 24,
    height: 28,
    collected: false,
    phase: 0,
  });
  world.shafts.push({ x: (c + 1) * TILE, y: SHAFT_BOTTOM_ROW * TILE, hinted: false });
  return world;
}

/** Muestra una pista la primera vez que el jugador se acerca a una chimenea. */
export function updateShaftHints(world: WorldState, text: (x: number, y: number, t: string, c: string) => void): void {
  if (!world.shafts) return;
  for (const s of world.shafts) {
    if (s.hinted) continue;
    if (Math.abs(world.player.x - s.x) < 7 * TILE) {
      s.hinted = true;
      text(s.x - 70, s.y - 20, 'SALTA ENTRE LAS PAREDES', '#a5f3fc');
    }
  }
}
