// Pruebas de las habilidades del plomero (Fase 4), usando la física real a 60 Hz.
import { GROUND_ROW, SMW_TOTAL_LEVELS, TILE, TOTAL_LEVELS, EXP_TOTAL_LEVELS, DIM_TOTAL_LEVELS } from '../src/engine/biomes';
import {
  SHAFT_BOTTOM_ROW,
  SHAFT_INNER,
  SHAFT_TOP_ROW,
  SLIDE_HEIGHT,
  WALL_SLIDE_SPEED,
  stageHasShaft,
} from '../src/engine/abilities';
import { stepWorld } from '../src/engine/physics';
import type { Block, Enemy, GamePartition, InputState, WorldState } from '../src/engine/types';
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

function step(w: WorldState, input: Partial<InputState> = {}): void {
  stepWorld(w, { ...NO_INPUT, ...input }, VIEW_W);
}

function putBlock(w: WorldState, col: number, row: number, type: Block['type'] = 'hard'): void {
  const b: Block = {
    id: 80000 + row * 1024 + col, col, row, x: col * TILE, y: row * TILE, baseY: row * TILE,
    width: TILE, height: TILE, type, content: null, coinsRemaining: 0, bounceY: 0, bounceVel: 0, spinTimer: 0,
  };
  const old = w.blockGrid.get(gridKey(col, row));
  if (old) w.blocks.splice(w.blocks.indexOf(old), 1);
  w.blocks.push(b);
  w.blockGrid.set(gridKey(col, row), b);
}

/** Nivel plano y vacío para aislar cada habilidad. */
function flatWorld(levelIndex = 2): WorldState {
  const w = buildWorldState(levelIndex);
  for (const b of [...w.blocks]) {
    w.blockGrid.delete(gridKey(b.col, b.row));
  }
  w.blocks = [];
  for (let c = 0; c < w.totalCols; c++) putBlock(w, c, GROUND_ROW, 'ground_top');
  w.enemies = [];
  w.pipes = [];
  w.springs = [];
  w.platforms = [];
  w.coinsList = [];
  w.pickups = [];
  w.icicles = [];
  w.wind = null;
  w.chase = null;
  w.lavaTide = false;
  w.lavaCols.clear();
  w.lowGravZones = [];
  w.shafts = [];
  w.flagpole = null;
  w.checkpoint = null;
  return w;
}

function makeGoomba(col: number): Enemy {
  return {
    id: 9999, type: 'goomba', state: 'walk', x: col * TILE, y: GROUND_ROW * TILE - 28, baseY: GROUND_ROW * TILE - 28,
    vx: -1, vy: 0, width: 26, height: 28, facing: -1, onGround: true, hp: 1, stateTimer: 0, kickGraceTimer: 0,
    shellCombo: 0, animTimer: 0, active: true,
  };
}

console.log('9. Validando habilidades del plomero...');

// 9a. Salto en pared: deslizarse lento y rebotar hacia el otro lado
{
  const w = flatWorld();
  for (let r = 2; r < GROUND_ROW; r++) putBlock(w, 30, r);
  w.player.x = 30 * TILE - w.player.width - 1;
  w.player.y = 5 * TILE;
  w.player.onGround = false;
  w.player.vy = 6;
  for (let f = 0; f < 12; f++) step(w, { right: true });
  assert(w.player.wallDir === 1, 'Empujando contra la pared en el aire queda pegado');
  assert(w.player.vy <= WALL_SLIDE_SPEED + 0.01, `Pegado a la pared cae lento (vy=${w.player.vy.toFixed(2)})`);
  step(w, { right: true, jump: true });
  assert(w.player.vy < -8 && w.player.vx < -3, 'El salto en pared rebota hacia el lado contrario');
  assert(w.player.facing === -1, 'Tras el salto en pared mira hacia el otro lado');
  // En el suelo no hay salto en pared
  const g = flatWorld();
  for (let r = 8; r < GROUND_ROW; r++) putBlock(g, 30, r);
  g.player.x = 30 * TILE - g.player.width - 1;
  g.player.y = GROUND_ROW * TILE - g.player.height;
  for (let f = 0; f < 5; f++) step(g, { right: true });
  assert(g.player.wallDir === 0, 'En el suelo no se activa el salto en pared');
}

// 9b. Un bot sube una chimenea completa solo con saltos en pared y toma el tesoro
{
  const w = flatWorld();
  const c = 30;
  const right = c + SHAFT_INNER + 1;
  for (let r = SHAFT_TOP_ROW; r <= SHAFT_BOTTOM_ROW; r++) {
    putBlock(w, c, r);
    putBlock(w, right, r);
  }
  w.pickups = [{ id: 1, kind: 'treasure', x: right * TILE + 4, y: (SHAFT_TOP_ROW - 1) * TILE + 2, width: 24, height: 28, collected: false, phase: 0 }];
  w.player.x = (c + 1) * TILE + 4;
  w.player.y = GROUND_ROW * TILE - w.player.height;
  const lives = w.lives;
  let target: 1 | -1 = 1;
  let prevJump = false;
  let topY = Infinity;
  for (let f = 0; f < 600 && w.lives === lives; f++) {
    const p = w.player;
    topY = Math.min(topY, p.y);
    const input: Partial<InputState> = {};
    if (p.y + p.height <= SHAFT_TOP_ROW * TILE + 2) {
      // Ya arriba de las paredes: ir hacia el tesoro
      input.right = true;
      input.jump = !prevJump && p.onGround;
    } else if (p.onGround) {
      input.jump = !prevJump; // entrar a la chimenea
      if (target === 1) input.right = true;
      else input.left = true;
    } else if (p.wallDir !== 0 && p.wallDir !== undefined) {
      if (prevJump) {
        // Suelta A (sin soltar la pared) para poder volver a pulsarlo
        input.jump = false;
        if (p.wallDir === 1) input.right = true;
        else input.left = true;
      } else {
        input.jump = true;
        target = p.wallDir === 1 ? -1 : 1;
        if (target === 1) input.right = true;
        else input.left = true;
      }
    } else {
      if (target === 1) input.right = true;
      else input.left = true;
      input.jump = prevJump && p.vy < 0; // mantener A para subir más
    }
    prevJump = Boolean(input.jump);
    step(w, input);
  }
  assert(topY < SHAFT_TOP_ROW * TILE, `El bot llega arriba de la chimenea (mejor altura y=${topY.toFixed(0)})`);
  assert(w.lives === lives + 1, 'Arriba de la chimenea está el tesoro');
}

// 9c. Chimeneas en los niveles: nunca bloquean el camino
let shafts = 0;
for (const [part, total] of [['classic', TOTAL_LEVELS], ['smw', SMW_TOTAL_LEVELS], ['expedition', EXP_TOTAL_LEVELS], ['dimension', DIM_TOTAL_LEVELS]] as [GamePartition, number][]) {
  for (let i = 0; i < total; i++) {
    const w = buildWorldState(i, undefined, part);
    if (!stageHasShaft(i, part)) {
      assert((w.shafts ?? []).length === 0, `${part} ${w.worldLabel}: no debería tener chimenea`);
      continue;
    }
    for (const s of w.shafts ?? []) {
      shafts++;
      const c = Math.floor(s.x / TILE) - 1;
      for (let col = c; col <= c + SHAFT_INNER + 1; col++) {
        for (let r = SHAFT_BOTTOM_ROW + 1; r < GROUND_ROW; r++) {
          assert(!w.blockGrid.has(gridKey(col, r)), `${part} ${w.worldLabel}: algo bloquea el paso bajo la chimenea`);
        }
        assert(w.blockGrid.has(gridKey(col, GROUND_ROW)), `${part} ${w.worldLabel}: chimenea sobre un foso`);
      }
    }
  }
}
assert(shafts >= 20, `Debe haber chimeneas en la mayoría de los niveles (hay ${shafts})`);

// 9d. Deslizarse: más bajo, conserva impulso, pasa bajo huecos y derriba enemigos
{
  const w = flatWorld();
  w.player.powerState = 1;
  w.player.height = 46;
  w.player.x = 10 * TILE;
  w.player.y = GROUND_ROW * TILE - 46;
  for (let f = 0; f < 40; f++) step(w, { right: true, run: true });
  step(w, { right: true, run: true, down: true });
  assert((w.player.slideTimer ?? 0) > 0 && w.player.height === SLIDE_HEIGHT, 'Corriendo + abajo inicia la barrida');
  // Hueco de un bloque de alto más adelante (techo en la fila 10)
  const px = Math.floor(w.player.x / TILE);
  for (let col = px + 3; col <= px + 6; col++) {
    for (let r = 0; r <= 10; r++) putBlock(w, col, r);
  }
  const x0 = w.player.x;
  // Soltando abajo: el techo no lo deja pararse, así que sigue deslizándose hasta salir
  for (let f = 0; f < 120; f++) step(w);
  assert(w.player.x > (px + 7) * TILE, `La barrida pasa bajo un hueco de un bloque (avanzó ${(w.player.x - x0).toFixed(0)} px)`);
  for (let f = 0; f < 30; f++) step(w);
  assert(w.player.height === 46 && !w.player.crouching, 'Al salir del hueco se pone de pie');

  const k = flatWorld();
  k.player.x = 10 * TILE;
  k.player.y = GROUND_ROW * TILE - k.player.height;
  for (let f = 0; f < 40; f++) step(k, { right: true, run: true });
  k.enemies = [makeGoomba(Math.floor(k.player.x / TILE) + 4)];
  step(k, { right: true, run: true, down: true });
  for (let f = 0; f < 20; f++) step(k, { down: true });
  assert(k.enemies.length === 0 || k.enemies[0].state === 'knocked', 'La barrida derriba a un goomba');
  assert(k.status === 'playing' && k.player.powerState === 0 && !k.player.dead, 'La barrida no daña al plomero');
}

// 9e. Llave inglesa: va, derriba, junta monedas, trae gemas y vuelve
{
  const w = flatWorld();
  w.player.x = 10 * TILE;
  w.player.y = GROUND_ROW * TILE - w.player.height;
  w.player.facing = 1;
  const handY = w.player.y + 10;
  w.enemies = [makeGoomba(15)];
  w.enemies[0].vx = 0;
  w.coinsList = [{ x: 13 * TILE + 7, y: handY, baseY: handY, width: 18, height: 22, collected: false, phase: 0 }];
  step(w, { fire: true });
  assert(w.wrench, 'Sin flor ni capa, el botón de fuego lanza la llave inglesa');
  step(w, { fire: true });
  assert(w.wrench && w.wrench.timer > 0, 'Mantener fuego no lanza otra llave');
  for (let f = 0; f < 15; f++) step(w);
  assert(w.coins >= 1, 'La llave junta monedas en su camino');
  assert(w.enemies.length === 0 || w.enemies[0].state === 'knocked', 'La llave derriba al goomba');
  for (let f = 0; f < 60 && w.wrench; f++) step(w);
  assert(!w.wrench, 'La llave vuelve a la mano del plomero');

  const g = flatWorld();
  g.player.x = 10 * TILE;
  g.player.y = GROUND_ROW * TILE - g.player.height;
  g.player.facing = 1;
  g.objective = 'collect';
  g.gemsNeeded = 1;
  g.gemsCollected = 0;
  g.pickups = [{ id: 7, kind: 'gem', x: 14 * TILE, y: g.player.y + 4, width: 20, height: 24, collected: false, phase: 0 }];
  step(g, { fire: true });
  for (let f = 0; f < 90; f++) step(g);
  assert(g.gemsCollected === 1, 'La llave trae la gema hasta el plomero');

  const f2 = flatWorld();
  f2.player.powerState = 2;
  f2.player.height = 46;
  f2.player.y = GROUND_ROW * TILE - 46;
  step(f2, { fire: true });
  assert(!f2.wrench && f2.fireballs.length === 1, 'Con flor de fuego se lanzan bolas de fuego, no la llave');
}

console.log(`   ✔ ${passed} comprobaciones de habilidades en verde (${shafts} chimeneas).`);
