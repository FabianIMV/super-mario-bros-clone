// Pruebas de propiedades del generador procedural de niveles (procgen.ts).
// Comprueban, para los 8 modos, que los niveles sean deterministas, variados,
// sin repeticiones, más largos hacia el final, que sigan la curva de tensión
// y que sigan siendo jugables (fosos cruzables).
import { GROUND_ROW, TILE, partitionTotalLevels } from '../src/engine/biomes';
import { PARTITION_ORDER } from '../src/engine/partitions';
import type { GamePartition, WorldState } from '../src/engine/types';
import { buildWorldState, curatedStagePlan, gridKey, pieceDifficulty } from '../src/levels/levelBuilder';
import { smwStagePlan } from '../src/levels/smwLevelBuilder';
import { hashString, intensityAt, makeRng, mulberry32, planEntropy } from '../src/levels/procgen';

let passed = 0;
function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`   ✖ ${msg}`);
    process.exit(1);
  }
  passed++;
}

/** Etapas armadas por el generador: no castillos ni niveles hechos a mano. */
function isGenerated(part: GamePartition, i: number): boolean {
  if (i % 4 === 3) return false;
  if (part === 'classic' && i <= 1) return false; // 1-1 y 1-2 hechos a mano
  if (part === 'smw' && i === 0) return false; // Y-1 hecho a mano
  return true;
}

function planOf(part: GamePartition, i: number): string[] {
  return (part === 'smw' ? smwStagePlan(i) : curatedStagePlan(part, i)).map((s) => s.kind);
}

function layoutKey(w: WorldState): string {
  return w.blocks
    .map((b) => `${b.col},${b.row},${b.type}`)
    .sort()
    .join('|');
}

function bigrams(seq: string[]): Set<string> {
  const s = new Set<string>();
  for (let i = 1; i < seq.length; i++) s.add(`${seq[i - 1]}>${seq[i]}`);
  return s;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

console.log('12. Validando el generador procedural de niveles...');

// 12a. Matemática base: RNG reproducible y bien repartido, curva acotada
{
  const a = mulberry32(hashString('prueba'));
  const b = mulberry32(hashString('prueba'));
  for (let i = 0; i < 50; i++) assert(a() === b(), 'El RNG con la misma semilla repite la secuencia');
  const r = makeRng('distribución');
  const buckets = new Array(10).fill(0);
  for (let i = 0; i < 20000; i++) buckets[Math.floor(r.next() * 10)]++;
  for (const c of buckets) assert(c > 1700 && c < 2300, `RNG uniforme por decil (${c} de 2000 esperados)`);
  for (let t = 0; t <= 1; t += 0.05) {
    for (const p of [0, 0.5, 1]) {
      const v = intensityAt(t, p, 3);
      assert(v >= 0 && v <= 1, `La curva de intensidad queda en [0,1] (${v.toFixed(2)})`);
    }
  }
  assert(intensityAt(0.5, 1, 2) > intensityAt(0.5, 0, 2), 'La intensidad sube con el progreso del modo');
}

const report: string[] = [];
for (const part of PARTITION_ORDER) {
  const total = partitionTotalLevels(part);
  const plans: string[][] = [];
  const correlations: number[] = [];
  const lengths: number[] = [];

  for (let i = 0; i < total; i++) {
    const w = buildWorldState(i, undefined, part);
    lengths.push(w.totalCols);

    // 12b. Determinismo: el mismo nivel siempre sale igual
    const again = buildWorldState(i, undefined, part);
    assert(layoutKey(w) === layoutKey(again), `${part} ${w.worldLabel}: el nivel es determinista`);

    // 12c. Jugable: ningún foso sin apoyo de más de 4 columnas
    let gap = 0;
    for (let col = 0; col < w.totalCols - 8; col++) {
      const solid =
        w.blockGrid.has(gridKey(col, GROUND_ROW)) ||
        [6, 7, 8, 9, 10].some((r) => w.blockGrid.has(gridKey(col, r))) ||
        w.platforms.some((pl) => Math.abs(pl.startX - col * TILE) <= 6 * TILE);
      gap = solid ? 0 : gap + 1;
      assert(gap <= 4, `${part} ${w.worldLabel}: foso de más de 4 columnas sin apoyo en ${col}`);
    }

    if (!isGenerated(part, i)) continue;
    const plan = planOf(part, i);
    const pieces = plan.filter((k) => k !== 'rest');
    plans.push(plan);

    // 12d. Sin repeticiones: nunca la misma pieza seguida, máximo 2 usos por nivel
    for (let k = 1; k < plan.length; k++) {
      assert(plan[k] !== plan[k - 1], `${part} ${w.worldLabel}: pieza repetida seguida (${plan[k]})`);
    }
    const counts = new Map<string, number>();
    for (const k of pieces) counts.set(k, (counts.get(k) ?? 0) + 1);
    for (const [k, c] of counts) assert(c <= 2, `${part} ${w.worldLabel}: ${k} aparece ${c} veces`);

    // 12e. Variedad dentro del nivel (entropía de Shannon de sus piezas)
    const h = planEntropy(pieces);
    assert(h >= 2.4, `${part} ${w.worldLabel}: poca variedad (entropía ${h.toFixed(2)} bits)`);

    // Seguimiento de la curva: dificultad elegida vs intensidad objetivo
    const steps = part === 'smw' ? [] : curatedStagePlan(part, i).filter((s) => s.kind !== 'rest');
    if (steps.length >= 5) {
      correlations.push(pearson(steps.map((s) => s.target), steps.map((s) => pieceDifficulty(s.kind))));
    }
  }

  // 12f. Variedad entre niveles: pocos pares de piezas consecutivas compartidos
  let worst = 0;
  for (let a = 0; a < plans.length; a++) {
    for (let b = a + 1; b < plans.length; b++) {
      const j = jaccard(bigrams(plans[a]), bigrams(plans[b]));
      worst = Math.max(worst, j);
      assert(j < 0.5, `${part}: dos niveles comparten ${(j * 100).toFixed(0)}% de su secuencia`);
    }
  }

  // 12g. La dificultad elegida sigue la curva de tensión
  if (correlations.length > 0) {
    const mean = correlations.reduce((x, y) => x + y, 0) / correlations.length;
    assert(mean > 0.35, `${part}: la dificultad no sigue la curva (correlación media ${mean.toFixed(2)})`);
  }

  // 12h. Más extensos hacia el final del modo
  const third = Math.max(1, Math.floor(total / 3));
  const avg = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
  const early = avg(lengths.slice(0, third));
  const late = avg(lengths.slice(-third));
  assert(late > early, `${part}: los niveles finales (${late.toFixed(0)}) deben ser más largos que los iniciales (${early.toFixed(0)})`);

  report.push(`${part} ${avg(lengths).toFixed(0)} col (máx. Jaccard ${(worst * 100).toFixed(0)}%)`);
}

console.log(`   ✔ ${passed} comprobaciones del generador en verde.`);
console.log(`     Largo medio por modo: ${report.join(' · ')}`);
