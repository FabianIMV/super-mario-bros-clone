// Pruebas de los objetivos por nivel (Fase 2), usando la física real a 60 Hz.
import { GROUND_ROW, SMW_TOTAL_LEVELS, TILE, TOTAL_LEVELS } from '../src/engine/biomes';
import {
  CHASE_DELAY,
  CLOCKS_PER_STAGE,
  CLOCK_BONUS,
  GEMS_PER_STAGE,
  TIME_ATTACK_START,
  getStageObjective,
  isGoalLocked,
} from '../src/engine/objectives';
import { stepWorld } from '../src/engine/physics';
import type { GamePartition, InputState, StageObjective, WorldState } from '../src/engine/types';
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

function run(w: WorldState, frames: number, input: Partial<InputState> = NO_INPUT): void {
  for (let f = 0; f < frames; f++) {
    if (w.status !== 'playing') return;
    stepWorld(w, { ...NO_INPUT, ...input }, VIEW_W);
  }
}

/** Quita enemigos y peligros para aislar lo que se prueba. */
function calm(w: WorldState): void {
  w.enemies = [];
  w.icicles = [];
  w.wind = null;
  w.lavaTide = false;
  w.player.invulnTimer = 0;
}

console.log('7. Validando objetivos por nivel...');

// 7a. Reparto de objetivos
for (const [part, total] of [['classic', TOTAL_LEVELS], ['smw', SMW_TOTAL_LEVELS]] as [GamePartition, number][]) {
  const count: Record<StageObjective, number> = { reach: 0, collect: 0, time_attack: 0, chase: 0 };
  for (let i = 0; i < total; i++) {
    const w = buildWorldState(i, undefined, part);
    assert(w.objective === getStageObjective(i, part), `${part} ${w.worldLabel}: objetivo inconsistente`);
    if (i % 4 === 3) assert(w.objective === 'reach', `${part} ${w.worldLabel}: los castillos terminan con el jefe`);
    count[w.objective!]++;
  }
  for (const k of ['collect', 'time_attack', 'chase'] as StageObjective[]) {
    assert(count[k] >= 3, `${part}: debe haber al menos 3 niveles de ${k} (hay ${count[k]})`);
  }
  assert(buildWorldState(0, undefined, part).objective === 'reach', `${part}: el primer nivel es normal`);
}

// 7b. Gemas: 5 por nivel, accesibles, y la meta se abre solo con todas
for (const [part, total] of [['classic', TOTAL_LEVELS], ['smw', SMW_TOTAL_LEVELS]] as [GamePartition, number][]) {
  for (let i = 0; i < total; i++) {
    if (getStageObjective(i, part) !== 'collect') continue;
    const w = buildWorldState(i, undefined, part);
    const gems = w.pickups!.filter((p) => p.kind === 'gem');
    assert(gems.length === GEMS_PER_STAGE, `${part} ${w.worldLabel}: debe tener ${GEMS_PER_STAGE} gemas (tiene ${gems.length})`);
    for (const g of gems) {
      const col = Math.floor((g.x + g.width / 2) / TILE);
      const row = Math.floor((g.y + g.height / 2) / TILE);
      assert(!w.blockGrid.has(gridKey(col, row)), `${part} ${w.worldLabel}: gema dentro de un bloque (${col},${row})`);
      let support = false;
      for (let r = row + 1; r <= Math.min(GROUND_ROW, row + 4); r++) {
        if (w.blockGrid.has(gridKey(col, r))) support = true;
      }
      assert(support, `${part} ${w.worldLabel}: gema en (${col},${row}) sin superficie debajo a menos de 4 bloques`);
    }
    assert(isGoalLocked(w), `${part} ${w.worldLabel}: la meta empieza cerrada`);
  }
}
{
  // Meta cerrada → empuja hacia atrás; con todas las gemas → se completa
  const w = buildWorldState(2); // 1-3 (gemas)
  calm(w);
  const goalX = w.flagpole!.x;
  w.player.x = goalX - 60;
  w.player.y = GROUND_ROW * TILE - w.player.height;
  run(w, 40, { right: true });
  assert(w.status === 'playing' && w.player.x < goalX, 'Sin las gemas la meta no deja pasar');
  for (const g of w.pickups!) {
    w.player.x = g.x;
    w.player.y = g.y;
    w.player.vy = 0;
    run(w, 1);
  }
  assert(w.gemsCollected === GEMS_PER_STAGE && !isGoalLocked(w), 'Tocar las 5 gemas abre la meta');
  w.player.x = goalX - 60;
  w.player.y = GROUND_ROW * TILE - w.player.height;
  w.player.vy = 0;
  run(w, 60, { right: true });
  assert(w.status !== 'playing', 'Con todas las gemas se completa el nivel');
}
{
  // SMW: la cinta de meta también se cierra
  const w = buildWorldState(2, undefined, 'smw'); // Y-3 (gemas)
  calm(w);
  const gx = w.goalTape!.x;
  w.player.x = gx - 60;
  w.player.y = GROUND_ROW * TILE - w.player.height;
  run(w, 40, { right: true });
  assert(w.status === 'playing' && w.player.x < gx, 'SMW: sin gemas la cinta de meta no deja pasar');
}
{
  // Reaparecer en el checkpoint conserva las gemas que quedaron atrás
  const ref = buildWorldState(2);
  const cpX = ref.checkpoint!.x;
  const w = buildWorldState(2, { score: 0, highScore: 0, coins: 0, lives: 3, powerState: 0, checkpointX: cpX, checkpointY: 0 });
  const behind = ref.pickups!.filter((g) => g.x < w.player.x).length;
  assert(w.gemsCollected === behind && behind > 0, `En el checkpoint las ${behind} gemas de atrás cuentan como tomadas`);
}

// 7c. Contrarreloj: tiempo corto y relojes que suman
{
  const idx = [...Array(TOTAL_LEVELS).keys()].find((i) => getStageObjective(i, 'classic') === 'time_attack')!;
  const w = buildWorldState(idx);
  calm(w);
  assert(w.timeLeft === TIME_ATTACK_START, `Contrarreloj empieza con ${TIME_ATTACK_START}`);
  const clocks = w.pickups!.filter((p) => p.kind === 'clock');
  assert(clocks.length === CLOCKS_PER_STAGE, `Contrarreloj tiene ${CLOCKS_PER_STAGE} relojes (tiene ${clocks.length})`);
  const before = w.timeLeft;
  w.player.x = clocks[0].x;
  w.player.y = clocks[0].y;
  run(w, 1);
  assert(w.timeLeft >= before + CLOCK_BONUS - 1, 'Tomar un reloj suma tiempo');
}

// 7d. Persecución: quedarse quieto es perder; correr es sobrevivir
{
  const idx = [...Array(TOTAL_LEVELS).keys()].find((i) => getStageObjective(i, 'classic') === 'chase')!;
  const still = buildWorldState(idx);
  calm(still);
  run(still, CHASE_DELAY - 5);
  assert(still.status === 'playing', 'La sombra espera antes de avanzar');
  run(still, 600);
  assert(still.status !== 'playing', 'Si te quedas quieto la sombra te alcanza');

  // Correr por suelo plano deja atrás a la sombra
  const w = buildWorldState(idx);
  calm(w);
  for (let c = 0; c < w.totalCols; c++) {
    for (let r = 0; r < GROUND_ROW; r++) {
      const b = w.blockGrid.get(gridKey(c, r));
      if (b) { w.blockGrid.delete(gridKey(c, r)); w.blocks.splice(w.blocks.indexOf(b), 1); }
    }
    if (!w.blockGrid.has(gridKey(c, GROUND_ROW))) {
      const nb = { id: 70000 + c, col: c, row: GROUND_ROW, x: c * TILE, y: GROUND_ROW * TILE, baseY: GROUND_ROW * TILE,
        width: TILE, height: TILE, type: 'ground_top' as const, content: null, coinsRemaining: 0, bounceY: 0, bounceVel: 0, spinTimer: 0 };
      w.blocks.push(nb);
      w.blockGrid.set(gridKey(c, GROUND_ROW), nb);
    }
  }
  w.pipes = [];
  w.springs = [];
  w.platforms = [];
  w.lavaCols.clear();
  run(w, 400, { right: true, run: true });
  assert(w.status === 'playing', 'Corriendo se escapa de la sombra');
  assert(w.chase!.x >= w.cameraX - 50, 'La sombra siempre asoma por el borde izquierdo');
}

console.log(`   ✔ ${passed} comprobaciones de objetivos en verde.`);
