// Pruebas de rutas y secretos (Fase 3), usando la física real a 60 Hz.
import { GROUND_ROW, SMW_TOTAL_LEVELS, TILE, TOTAL_LEVELS, EXP_TOTAL_LEVELS, DIM_TOTAL_LEVELS } from '../src/engine/biomes';
import { stepWorld } from '../src/engine/physics';
import { castleIndexOf, stageHasPortal, stageHasVault, VAULT_WIDTH } from '../src/engine/secrets';
import type { GamePartition, InputState, WorldState } from '../src/engine/types';
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

function calm(w: WorldState): void {
  w.enemies = [];
  w.icicles = [];
  w.wind = null;
  w.lavaTide = false;
  w.chase = null;
  w.player.invulnTimer = 0;
}

function vaultDoorCol(w: WorldState): number | null {
  const lock = w.blocks.find((b) => b.type === 'lock' && b.row === 11);
  return lock ? lock.col : null;
}

console.log('8. Validando rutas y secretos...');

// 8a. Cada nivel elegible tiene bóveda + llave alcanzable
let vaults = 0;
for (const [part, total] of [['classic', TOTAL_LEVELS], ['smw', SMW_TOTAL_LEVELS], ['expedition', EXP_TOTAL_LEVELS], ['dimension', DIM_TOTAL_LEVELS]] as [GamePartition, number][]) {
  for (let i = 0; i < total; i++) {
    const w = buildWorldState(i, undefined, part);
    const door = vaultDoorCol(w);
    if (!stageHasVault(i, part)) {
      assert(door === null, `${part} ${w.worldLabel}: no debería tener bóveda`);
      continue;
    }
    assert(door !== null, `${part} ${w.worldLabel}: falta la bóveda`);
    vaults++;
    // La bóveda mide 3 bloques: se puede saltar por encima, nada encima la tapa
    for (let col = door!; col < door! + VAULT_WIDTH; col++) {
      assert(w.blockGrid.get(gridKey(col, 9))?.type === 'hard', `${part} ${w.worldLabel}: techo de bóveda incompleto`);
      for (let r = 5; r < 9; r++) {
        assert(!w.blockGrid.has(gridKey(col, r)), `${part} ${w.worldLabel}: algo tapa el paso sobre la bóveda (${col},${r})`);
      }
    }
    const key = w.pickups!.find((p) => p.kind === 'key')!;
    assert(key, `${part} ${w.worldLabel}: falta la llave`);
    const kc = Math.floor((key.x + key.width / 2) / TILE);
    const kr = Math.floor((key.y + key.height / 2) / TILE);
    assert(!w.blockGrid.has(gridKey(kc, kr)), `${part} ${w.worldLabel}: llave dentro de un bloque`);
    assert(kc < door!, `${part} ${w.worldLabel}: la llave debe estar antes de la bóveda`);
    let support = false;
    for (let r = kr + 1; r <= Math.min(GROUND_ROW, kr + 4); r++) if (w.blockGrid.has(gridKey(kc, r))) support = true;
    support ||= w.pipes.some((p) => kc * TILE >= p.x && kc * TILE < p.x + p.width && p.y / TILE - kr <= 2);
    assert(support, `${part} ${w.worldLabel}: llave sin superficie debajo`);
    assert(w.pickups!.some((p) => p.kind === 'treasure'), `${part} ${w.worldLabel}: falta el tesoro`);
    assert(
      w.pickups!.some((p) => p.kind === 'portal') === stageHasPortal(i),
      `${part} ${w.worldLabel}: el portal solo va en los X-2`
    );
  }
}

// 8b. Sin llave la puerta no se abre; con llave se abre y el tesoro da una vida
{
  const w = buildWorldState(2); // 1-3
  calm(w);
  const door = vaultDoorCol(w)!;
  w.player.x = (door - 3) * TILE;
  w.player.y = GROUND_ROW * TILE - w.player.height;
  run(w, 50, { right: true });
  assert(w.player.x + w.player.width <= door * TILE + 1, 'Sin llave la puerta bloquea la entrada');
  assert(w.blocks.some((b) => b.type === 'lock'), 'Sin llave la puerta sigue cerrada');

  const key = w.pickups!.find((p) => p.kind === 'key')!;
  const savedX = w.player.x;
  w.player.x = key.x;
  w.player.y = key.y;
  w.player.vy = 0;
  run(w, 1);
  assert(w.hasKey, 'Tocar la llave la recoge');
  w.player.x = savedX;
  w.player.y = GROUND_ROW * TILE - w.player.height;
  w.player.vy = 0;
  const lives = w.lives;
  run(w, 120, { right: true });
  assert(w.vaultOpened && !w.blocks.some((b) => b.type === 'lock'), 'Con la llave la puerta se abre');
  assert(w.lives === lives + 1, 'El tesoro de la bóveda da una vida');
}

// 8c. Portal secreto en X-2: lleva directo al castillo
for (const [part, idx] of [['classic', 5], ['smw', 9]] as [GamePartition, number][]) {
  const w = buildWorldState(idx, undefined, part);
  calm(w);
  const portal = w.pickups!.find((p) => p.kind === 'portal')!;
  assert(portal, `${part} ${w.worldLabel}: el X-2 tiene portal`);
  w.player.x = portal.x;
  w.player.y = portal.y + portal.height - w.player.height;
  stepWorld(w, NO_INPUT, VIEW_W);
  assert(w.status === 'playing', `${part}: pasar por el portal sin pulsar ▼ no lo activa`);
  stepWorld(w, { ...NO_INPUT, down: true }, VIEW_W);
  assert(w.status === 'flagpole' && w.warpTo === castleIndexOf(idx), `${part}: el portal inicia el atajo`);
  for (let f = 0; f < 200 && w.levelIndex === idx; f++) stepWorld(w, NO_INPUT, VIEW_W);
  assert(w.levelIndex === castleIndexOf(idx), `${part}: el portal lleva a ${castleIndexOf(idx)} (llegó a ${w.levelIndex})`);
  assert(w.boss !== null, `${part}: tras el portal aparece el jefe del castillo`);
}

// 8d. Al reaparecer en el checkpoint después de la llave, ya la tienes
{
  const ref = buildWorldState(2);
  const key = ref.pickups!.find((p) => p.kind === 'key')!;
  const cp = ref.checkpoint!;
  if (key.x < cp.x) {
    const w = buildWorldState(2, { score: 0, highScore: 0, coins: 0, lives: 3, powerState: 0, checkpointX: cp.x, checkpointY: 0 });
    assert(w.hasKey, 'En el checkpoint conservas la llave que quedó atrás');
  }
}

console.log(`   ✔ ${passed} comprobaciones de secretos en verde (${vaults} bóvedas).`);
