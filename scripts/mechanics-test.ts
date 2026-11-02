// Pruebas de las mecánicas por mundo (Fase 1), usando la física real a 60 Hz.
import { GROUND_ROW, TILE, TOTAL_LEVELS, SMW_TOTAL_LEVELS, getWorldLabel } from '../src/engine/biomes';
import {
  CRUMBLE_DELAY,
  CRUMBLE_RESPAWN,
  FIREFLY_ON,
  FIREFLY_PERIOD,
  LAVA_TIDE_MAX,
  WIND_CALM,
  WIND_WARN,
  getStageMechanic,
  lavaSurfaceY,
} from '../src/engine/mechanics';
import { stepWorld } from '../src/engine/physics';
import type { Block, GamePartition, InputState, WorldState } from '../src/engine/types';
import { buildWorldState, gridKey } from '../src/levels/levelBuilder';

const VIEW_W = 970;
const NO_INPUT: InputState = {
  left: false, right: false, up: false, down: false, jump: false, run: false, fire: false, spin: false,
};

let passed = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`   ✖ ${msg}`);
    process.exit(1);
  }
  passed++;
}

function putBlock(w: WorldState, col: number, row: number, type: Block['type']): Block {
  const b: Block = {
    id: 90000 + row * 1024 + col, col, row, x: col * TILE, y: row * TILE, baseY: row * TILE,
    width: TILE, height: TILE, type, content: null, coinsRemaining: 0, bounceY: 0, bounceVel: 0, spinTimer: 0,
  };
  const old = w.blockGrid.get(gridKey(col, row));
  if (old) w.blocks.splice(w.blocks.indexOf(old), 1);
  w.blocks.push(b);
  w.blockGrid.set(gridKey(col, row), b);
  return b;
}

/** Deja columnas [c0, c1] como suelo plano y sin obstáculos. */
function flatten(w: WorldState, c0: number, c1: number): void {
  for (let c = c0; c <= c1; c++) {
    for (let r = 0; r < GROUND_ROW; r++) {
      const b = w.blockGrid.get(gridKey(c, r));
      if (b) {
        w.blockGrid.delete(gridKey(c, r));
        w.blocks.splice(w.blocks.indexOf(b), 1);
      }
    }
    putBlock(w, c, GROUND_ROW, 'ground_top');
    w.lavaCols.delete(c);
  }
  const inRange = (x: number) => x >= c0 * TILE - TILE * 2 && x <= (c1 + 1) * TILE;
  w.enemies = [];
  w.pipes = w.pipes.filter((p) => !inRange(p.x));
  w.springs = w.springs.filter((s) => !inRange(s.x));
  w.platforms = w.platforms.filter((p) => !inRange(p.startX));
  w.icicles = (w.icicles ?? []).filter((i) => !inRange(i.x));
  w.boss = null;
}

function placePlayer(w: WorldState, col: number, row = GROUND_ROW): void {
  w.player.x = col * TILE + 4;
  w.player.y = row * TILE - w.player.height;
  w.player.vx = 0;
  w.player.vy = 0;
  w.player.onGround = true;
  w.player.invulnTimer = 0;
}

function run(w: WorldState, frames: number, input: Partial<InputState> = NO_INPUT): void {
  for (let f = 0; f < frames; f++) stepWorld(w, { ...NO_INPUT, ...input }, VIEW_W);
}

console.log('6. Validando mecánicas por mundo...');

// 6a. Cada nivel tiene una mecánica y cada mundo la suya
for (const [part, total] of [['classic', TOTAL_LEVELS], ['smw', SMW_TOTAL_LEVELS]] as [GamePartition, number][]) {
  const seen = new Map<number, string>();
  for (let i = 0; i < total; i++) {
    const w = buildWorldState(i, undefined, part);
    assert(w.mechanic && w.mechanic !== 'none', `${part} ${w.worldLabel} sin mecánica`);
    assert(w.mechanic === getStageMechanic(i, part), `${part} ${w.worldLabel} mecánica inconsistente`);
    if (i % 4 === 3) {
      assert(w.mechanic === 'lava_tide', `${part} ${w.worldLabel}: los castillos usan marea de lava`);
    } else {
      const world = Math.floor(i / 4);
      const prev = seen.get(world);
      assert(!prev || prev === w.mechanic, `${part} mundo ${world + 1} mezcla mecánicas`);
      seen.set(world, w.mechanic!);
    }
  }
  const unique = new Set(seen.values());
  assert(unique.size === seen.size, `${part}: dos mundos comparten mecánica`);
}

// 6b. Hongos trampolín (1-x): rebotan más alto que un resorte normal
{
  const heightFor = (kind: 'spring' | 'mushroom'): number => {
    const w = buildWorldState(2);
    flatten(w, 4, 40);
    w.springs = [{ x: 20 * TILE + 3, y: (GROUND_ROW - 1) * TILE + 4, width: 26, height: 28, compressTimer: 0, kind }];
    placePlayer(w, 20, GROUND_ROW - 3);
    w.player.onGround = false;
    w.player.vy = 2;
    let minY = w.player.y;
    for (let f = 0; f < 90; f++) {
      stepWorld(w, { ...NO_INPUT, jump: true }, VIEW_W); // A mantenido = rebote completo
      minY = Math.min(minY, w.player.y);
    }
    return GROUND_ROW * TILE - minY;
  };
  const spring = heightFor('spring');
  const mushroom = heightFor('mushroom');
  assert(mushroom > spring + 20, `El hongo debe rebotar más que el resorte (${mushroom.toFixed(0)} vs ${spring.toFixed(0)})`);
  const w = buildWorldState(2);
  assert(w.springs.some((s) => s.kind === 'mushroom'), '1-3 debe tener hongos trampolín');
}

// 6c. Viento (2-x): calma, aviso y ráfaga que empuja al jugador
{
  const w = buildWorldState(4);
  assert(w.wind?.phase === 'calm', '2-1 debe empezar con el viento en calma');
  flatten(w, 4, 80);
  placePlayer(w, 30);
  run(w, WIND_CALM - 5);
  assert(Math.abs(w.player.x - (30 * TILE + 4)) < 1, 'Sin ráfaga el jugador no debe moverse');
  run(w, 10 + WIND_WARN);
  assert(w.wind?.phase === 'gust', 'Tras calma + aviso debe venir la ráfaga');
  const x0 = w.player.x;
  run(w, 60);
  assert(w.player.x > x0 + 40, `La ráfaga debe empujar al jugador (${(w.player.x - x0).toFixed(0)} px)`);
}

// 6d. Luciérnagas (3-x): la plataforma deja de sostener al jugador al apagarse
{
  const w = buildWorldState(8);
  assert(w.platforms.length > 0 && w.platforms.every((p) => p.blink), '3-1 debe tener plataformas de luciérnagas');
  flatten(w, 4, 60);
  for (let c = 28; c <= 34; c++) {
    const g = w.blockGrid.get(gridKey(c, GROUND_ROW));
    if (g) { w.blockGrid.delete(gridKey(c, GROUND_ROW)); w.blocks.splice(w.blocks.indexOf(g), 1); }
  }
  w.platforms = [{
    x: 30 * TILE, y: 8 * TILE, startX: 30 * TILE, startY: 8 * TILE, width: 3 * TILE, height: 16,
    rangeX: 0, rangeY: 0, speed: 0, phase: 0, vx: 0, vy: 0,
    blink: { period: FIREFLY_PERIOD, on: FIREFLY_ON, offset: 0 },
  }];
  w.frameCount = 0;
  placePlayer(w, 31, 8);
  run(w, 30);
  assert(w.player.onGround && Math.abs(w.player.y + w.player.height - 8 * TILE) < 2, 'Encendida, la plataforma sostiene al jugador');
  run(w, FIREFLY_ON - 20);
  assert(w.player.y + w.player.height > 8 * TILE + 8, 'Apagada, el jugador debe caer');
}

// 6e. Carámbanos (4-x): caen al pasar debajo y dañan al jugador
{
  const w = buildWorldState(12);
  assert((w.icicles?.length ?? 0) >= 3, `4-1 debe tener carámbanos (tiene ${w.icicles?.length ?? 0})`);
  flatten(w, 4, 60);
  putBlock(w, 30, 7, 'hard');
  w.icicles = [{ id: 1, x: 30 * TILE + 8, y: 8 * TILE, homeY: 8 * TILE, width: 16, height: 24, state: 'hang', timer: 0, vy: 0 }];
  w.player.powerState = 1;
  w.player.height = 46;
  placePlayer(w, 30);
  run(w, 2);
  assert(w.icicles[0].state === 'shake', 'El carámbano debe temblar al pasar debajo');
  run(w, 60);
  assert(w.icicles[0].state === 'gone', 'El carámbano debe caer y romperse');
  assert((w.player.powerState as number) === 0, 'El carámbano debe dañar al jugador');
}

// 6f. Puentes frágiles (5-x): caen tras pisarlos y reaparecen
{
  const w = buildWorldState(16);
  assert(w.blocks.some((b) => b.crumble), '5-1 debe tener puentes frágiles');
  flatten(w, 4, 60);
  const bridge = putBlock(w, 30, 9, 'bridge');
  bridge.crumble = true;
  placePlayer(w, 30, 9);
  w.player.x = 30 * TILE + 5;
  run(w, 3);
  assert((bridge.crumbleTimer ?? 0) > 0, 'Pisar el puente debe activar su derrumbe');
  run(w, CRUMBLE_DELAY + 2);
  assert(!w.blockGrid.has(gridKey(30, 9)), 'El puente debe derrumbarse');
  placePlayer(w, 40);
  run(w, CRUMBLE_RESPAWN + 5);
  assert(w.blockGrid.get(gridKey(30, 9)) === bridge, 'El puente debe reaparecer');
}

// 6g. Gravedad baja (6-x): el mismo salto llega más alto dentro de la zona
{
  const jumpHeight = (inZone: boolean): number => {
    const w = buildWorldState(20);
    flatten(w, 4, 80);
    w.lowGravZones = inZone ? [{ x0: 20 * TILE, x1: 50 * TILE }] : [];
    placePlayer(w, 30);
    let minY = w.player.y;
    for (let f = 0; f < 120; f++) {
      stepWorld(w, { ...NO_INPUT, jump: f < 40 }, VIEW_W);
      minY = Math.min(minY, w.player.y);
    }
    return GROUND_ROW * TILE - w.player.height - minY;
  };
  const normal = jumpHeight(false);
  const low = jumpHeight(true);
  assert(low > normal * 1.4, `En gravedad baja el salto debe ser más alto (${low.toFixed(0)} vs ${normal.toFixed(0)})`);
  const w = buildWorldState(20);
  assert((w.lowGravZones?.length ?? 0) > 0, '6-1 debe tener zonas de gravedad baja');
}

// 6h. Marea de lava (castillos): sube periódicamente fuera del puente del jefe
{
  const w = buildWorldState(3);
  const col = [...w.lavaCols].find((c) => !w.boss!.bridgeCols.includes(c))!;
  const bossCol = w.boss!.bridgeCols[0];
  const base = GROUND_ROW * TILE + 12;
  w.frameCount = 10;
  assert(lavaSurfaceY(w, col) === base, 'En calma la lava está a su nivel normal');
  w.frameCount = 200;
  assert(lavaSurfaceY(w, col) === base - LAVA_TIDE_MAX, 'Durante la marea la lava sube');
  assert(lavaSurfaceY(w, bossCol) === base, 'La marea no afecta el puente del jefe');
}

const labels = Array.from({ length: TOTAL_LEVELS }, (_, i) => `${getWorldLabel(i)}:${getStageMechanic(i, 'classic')}`);
console.log(`   ✔ ${passed} comprobaciones de mecánicas en verde (${labels.filter((_, i) => i % 4 === 0).join(' ')}).`);
