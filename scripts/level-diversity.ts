// Verifica que ningún nivel sea una copia (ni casi copia) de otro.
// Compara bloques (posición + tipo), enemigos (columna + tipo), fosos y tuberías.
// Falla si dos niveles comparten más del MAX_SIMILARITY de sus elementos (Jaccard).
import { buildWorldState } from '../src/levels/levelBuilder';
import { TOTAL_LEVELS, SMW_TOTAL_LEVELS, getWorldLabel, TILE, EXP_TOTAL_LEVELS, FRONTIER_TOTAL_LEVELS, DIM_TOTAL_LEVELS } from '../src/engine/biomes';
import type { GamePartition, WorldState } from '../src/engine/types';

const MAX_SIMILARITY = 0.5;

function features(w: WorldState): Set<string> {
  const f = new Set<string>();
  for (const b of w.blocks) {
    if (b.type === 'ground_top' || b.type === 'ground_deep') continue;
    if (b.row === 0 || b.row === 1) continue; // techos decorativos
    f.add(`b${b.col},${b.row},${b.type}`);
  }
  for (const e of w.enemies) f.add(`e${Math.round(e.x / TILE)},${e.type}`);
  for (const p of w.pipes) f.add(`p${Math.round(p.x / TILE)},${p.height}`);
  const ground = new Set(w.blocks.filter((b) => b.type === 'ground_top').map((b) => b.col));
  for (let c = 0; c < w.totalCols; c++) if (!ground.has(c)) f.add(`h${c}`);
  return f;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

let failures = 0;
for (const [partition, total] of [['classic', TOTAL_LEVELS], ['smw', SMW_TOTAL_LEVELS], ['expedition', EXP_TOTAL_LEVELS], ['frontier', FRONTIER_TOTAL_LEVELS], ['dimension', DIM_TOTAL_LEVELS]] as [GamePartition, number][]) {
  const levels = Array.from({ length: total }, (_, i) => ({
    label: getWorldLabel(i, partition),
    f: features(buildWorldState(i, undefined, partition)),
  }));
  let worst = { s: 0, pair: '' };
  for (let i = 0; i < total; i++) {
    for (let j = i + 1; j < total; j++) {
      const s = jaccard(levels[i].f, levels[j].f);
      if (s > worst.s) worst = { s, pair: `${levels[i].label} ~ ${levels[j].label}` };
      if (s > MAX_SIMILARITY) {
        console.log(`   ✖ [${partition}] ${levels[i].label} y ${levels[j].label} son ${(s * 100).toFixed(0)}% iguales`);
        failures++;
      }
    }
  }
  console.log(`${partition}: par más parecido ${worst.pair} (${(worst.s * 100).toFixed(0)}%)`);
}
if (failures) {
  console.log(`✖ ${failures} pares de niveles demasiado parecidos (límite ${MAX_SIMILARITY * 100}%)`);
  process.exit(1);
}
console.log('✔ Todos los niveles tienen layouts distintos.');
