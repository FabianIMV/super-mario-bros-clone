// Pruebas de Expedición, Mundo 5 y del progreso de las particiones 2D.
import {
  BIOMES,
  EXP_TOTAL_LEVELS,
  FRONTIER_TOTAL_LEVELS,
  GROUND_ROW,
  TILE,
  getWorldLabel,
} from '../src/engine/biomes';
import { getStageObjective } from '../src/engine/objectives';
import {
  PARTITION_ORDER,
  getPartitionProgress,
  nextPartition,
  recordStageClear,
} from '../src/engine/partitions';
import { stepWorld } from '../src/engine/physics';
import type { InputState, SaveProgress } from '../src/engine/types';
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

console.log('10. Validando Expedición y Mundo 5...');

// 10a. Estructura de las 20 etapas de Expedición y sus 5 mundos visibles
const labels = new Set<string>();
const biomesUsed = new Set<string>();
const legacyLabels = ['A-1', 'A-2', 'A-3', 'A-4', 'S-1', 'S-2', 'S-3', 'S-4', 'E-1', 'E-2', 'E-3', 'E-4', 'N-1', 'N-2', 'N-3', 'N-4', 'C-1', 'C-2', 'C-3', 'C-4'];
assert(EXP_TOTAL_LEVELS === legacyLabels.length, 'Expedición conserva sus 20 etapas');
for (let i = 0; i < EXP_TOTAL_LEVELS; i++) {
  const w = buildWorldState(i, undefined, 'expedition');
  assert(w.partition === 'expedition', `Etapa ${i}: partición incorrecta`);
  assert(w.totalStagesInPartition === EXP_TOTAL_LEVELS, `Etapa ${i}: total incorrecto`);
  assert(w.worldLabel === getWorldLabel(i, 'expedition'), `Etapa ${i}: etiqueta incorrecta`);
  assert(!labels.has(w.worldLabel), `Etiqueta repetida ${w.worldLabel}`);
  labels.add(w.worldLabel);
  assert(w.worldLabel === legacyLabels[i], `Cambia una etiqueta existente en ${i}`);
  biomesUsed.add(w.biomeId);
  assert(w.stageTitle && !w.stageTitle.startsWith('Etapa'), `${w.worldLabel}: falta título propio`);
  assert(w.blocks.length > 80, `${w.worldLabel}: muy pocos bloques`);
  const spawnCol = Math.floor(w.player.x / TILE);
  assert(w.blockGrid.has(gridKey(spawnCol, GROUND_ROW)), `${w.worldLabel}: sin suelo en el inicio`);
  let gap = 0;
  for (let col = 0; col < w.totalCols - 8; col++) {
    const solid =
      w.blockGrid.has(gridKey(col, GROUND_ROW)) ||
      [7, 8, 9, 10].some((r) => w.blockGrid.has(gridKey(col, r))) ||
      w.platforms.some((pl) => Math.abs(pl.startX - col * TILE) <= 6 * TILE);
    gap = solid ? 0 : gap + 1;
    assert(gap <= 4, `${w.worldLabel}: foso de más de 4 bloques sin puente en la columna ${col}`);
  }
  if (i % 4 === 3) {
    assert(w.boss !== null && w.flagpole === null, `${w.worldLabel}: el castillo termina con el jefe`);
  } else {
    assert(w.flagpole !== null, `${w.worldLabel}: falta la meta`);
  }
}
for (const b of ['reef', 'jungle', 'clockwork', 'cloudland', 'crystal']) {
  assert(biomesUsed.has(b), `El bioma ${b} se usa en Expedición`);
  assert(BIOMES[b as keyof typeof BIOMES].name.length > 0, `El bioma ${b} tiene nombre`);
}
assert([...labels].join(' ').startsWith('A-1 A-2 A-3 A-4 S-1'), 'Etiquetas en orden de campaña conservadas');

// 10b. Mundo 5 mantiene su propia partición de 8 etapas 2D
const frontierLabels = new Set<string>();
for (let i = 0; i < FRONTIER_TOTAL_LEVELS; i++) {
  const w = buildWorldState(i, undefined, 'frontier');
  assert(w.partition === 'frontier', `Mundo 5 ${i}: partición incorrecta`);
  assert(w.totalStagesInPartition === FRONTIER_TOTAL_LEVELS, `Mundo 5 ${i}: total incorrecto`);
  assert(w.worldLabel === getWorldLabel(i, 'frontier'), `Mundo 5 ${i}: etiqueta incorrecta`);
  assert(!frontierLabels.has(w.worldLabel), `Etiqueta repetida en Mundo 5 ${w.worldLabel}`);
  frontierLabels.add(w.worldLabel);
  assert(w.stageTitle && !w.stageTitle.startsWith('Etapa'), `${w.worldLabel}: falta título propio`);
  assert(w.blocks.length > 80, `${w.worldLabel}: muy pocos bloques`);
  const spawnCol = Math.floor(w.player.x / TILE);
  assert(w.blockGrid.has(gridKey(spawnCol, GROUND_ROW)), `${w.worldLabel}: sin suelo en el inicio`);
  if (i % 4 === 3) {
    assert(w.boss !== null && w.flagpole === null, `${w.worldLabel}: el castillo termina con el jefe`);
  } else {
    assert(w.flagpole !== null, `${w.worldLabel}: falta la meta`);
  }
}
assert([...frontierLabels].join(' ') === 'M-1 M-2 M-3 M-4 V-1 V-2 V-3 V-4', 'Mundo 5 conserva sus 8 etiquetas');
assert(frontierLabels.size === FRONTIER_TOTAL_LEVELS, 'Mundo 5 no duplica etiquetas');

// 10c. Avance: meta → siguiente etapa, castillo → siguiente mundo, última → victoria
{
  const w = buildWorldState(0, undefined, 'expedition');
  w.enemies = [];
  w.chase = null;
  w.player.x = w.flagpole!.x - 4;
  w.player.y = w.flagpole!.y + 40;
  for (let f = 0; f < 200 && w.levelIndex === 0; f++) stepWorld(w, NO_INPUT, VIEW_W);
  assert(w.levelIndex === 1 && w.partition === 'expedition', `Tras A-1 sigue A-2 (llegó a ${w.levelIndex})`);

  const c = buildWorldState(3, undefined, 'expedition');
  c.player.x = c.boss!.axeX;
  c.player.y = c.boss!.axeY;
  for (let f = 0; f < 260 && c.levelIndex === 3; f++) stepWorld(c, NO_INPUT, VIEW_W);
  assert(c.levelIndex === 4 && c.worldLabel === 'S-1', `Tras el castillo A-4 sigue S-1 (llegó a ${c.worldLabel})`);

  const mCastle = buildWorldState(3, undefined, 'frontier');
  mCastle.player.x = mCastle.boss!.axeX;
  mCastle.player.y = mCastle.boss!.axeY;
  for (let f = 0; f < 260 && mCastle.levelIndex === 3; f++) stepWorld(mCastle, NO_INPUT, VIEW_W);
  assert(mCastle.levelIndex === 4 && mCastle.worldLabel === 'V-1', `Tras M-4 sigue V-1 dentro del Mundo 5 (llegó a ${mCastle.worldLabel})`);

  const last = buildWorldState(FRONTIER_TOTAL_LEVELS - 1, undefined, 'frontier');
  last.player.x = last.boss!.axeX;
  last.player.y = last.boss!.axeY;
  for (let f = 0; f < 260 && last.status !== 'victory'; f++) stepWorld(last, NO_INPUT, VIEW_W);
  assert(last.status === 'victory', 'Al terminar V-4 se completa Mundo 5');
}

// 10d. Expedición usa champiñón y flor (no capa): el plomero chico recibe champiñón
{
  const w = buildWorldState(1, undefined, 'expedition');
  const q = w.blocks.find((b) => b.type === 'question' && (b.content === 'powerup' || b.content === 'feather'));
  assert(q, 'Hay un bloque de poder en A-2');
}

// 10e. Progreso guardado por modo
{
  const base: SaveProgress = {
    highScore: 0, unlockedLevel: 0, clearedLevels: [], bestStageScores: {}, totalCoins: 0,
    smwHighScore: 0, smwUnlockedLevel: 0, smwClearedLevels: [], smwBestStageScores: {},
    lastPartition: 'classic',
  };
  const p1 = recordStageClear(base, 'expedition', 0, 1234);
  const exp = getPartitionProgress(p1, 'expedition');
  assert(exp.unlocked === 1 && exp.cleared.includes(0) && exp.highScore === 1234, 'Completar A-1 desbloquea A-2');
  assert(getPartitionProgress(p1, 'classic').unlocked === 0, 'El progreso de Expedición no toca el clásico');
  assert(getPartitionProgress(p1, 'smw').unlocked === 0, 'El progreso de Expedición no toca World');
  assert(p1.lastPartition === 'expedition', 'Se recuerda el último modo jugado');
  const p2 = recordStageClear(p1, 'expedition', EXP_TOTAL_LEVELS - 1, 10);
  assert(getPartitionProgress(p2, 'expedition').unlocked === EXP_TOTAL_LEVELS - 1, 'El desbloqueo no pasa del último nivel');
  assert(getPartitionProgress(p2, 'expedition').highScore === 1234, 'El récord no baja');
  const p3 = recordStageClear(p2, 'frontier', 0, 5678);
  assert(getPartitionProgress(p3, 'frontier').unlocked === 1, 'Completar M-1 desbloquea M-2');
  assert(getPartitionProgress(p3, 'expedition').highScore === 1234, 'El progreso de Mundo 5 no toca Expedición');
  // Partidas guardadas antiguas (sin campos de Expedición) siguen funcionando
  assert(getPartitionProgress(base, 'expedition').unlocked === 0, 'Partidas antiguas: Expedición empieza en A-1');
  assert(getPartitionProgress(base, 'frontier').unlocked === 0, 'Partidas antiguas: Mundo 5 empieza en M-1');
  assert(getPartitionProgress(base, 'fortune').unlocked === 0, 'Partidas antiguas: Fortuna empieza en F-1');
  assert(getPartitionProgress(base, 'mirage').unlocked === 0, 'Partidas antiguas: Espectro empieza en W-1');
  assert(PARTITION_ORDER.length === 8, 'Hay 8 modos');
  assert(
    nextPartition('classic') === 'smw' &&
      nextPartition('smw') === 'expedition' &&
      nextPartition('expedition') === 'frontier' &&
      nextPartition('frontier') === 'fortune' &&
      nextPartition('fortune') === 'mirage' &&
      nextPartition('mirage') === 'echo' &&
      nextPartition('echo') === 'dimension' &&
      nextPartition('dimension') === 'classic',
    'El cambio de modo recorre los 8'
  );
}

console.log(`   ✔ ${passed} comprobaciones del modo Expedición en verde (${[...labels][0]}..${[...labels].pop()}).`);
