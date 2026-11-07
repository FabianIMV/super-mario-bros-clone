// ============================================================================
// GENERACIÓN PROCEDURAL DE NIVELES (determinista)
// Arma la secuencia de piezas ("setpieces") de cada nivel con matemática en
// vez de listas fijas, para que ningún nivel se repita y todos tengan ritmo:
//
//   1. RNG con semilla por (modo, nivel): mulberry32 sobre un hash FNV-1a.
//      El mismo nivel siempre sale igual; dos niveles nunca comparten semilla.
//   2. Curva de intensidad I(t) por nivel: sube con el progreso del modo y
//      ondula en ciclos de tensión → alivio (2-3 "olas" por nivel).
//   3. Selección por pesos (proceso tipo Markov): cada pieza tiene una
//      dificultad; se favorecen las que se acercan a I(t) (campana gaussiana)
//      y se castigan las repetidas en el nivel, las recientes y las que
//      repiten la "categoría" de la anterior (dos fosos seguidos, etc.).
//   4. Zonas de descanso: tras acumular tensión se inserta un tramo plano.
//   5. Largo: entre 6 y 13 piezas según el progreso del modo.
// ============================================================================

/** Hash FNV-1a de 32 bits (entero sin signo). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** RNG mulberry32: rápido, de 32 bits y reproducible. Devuelve [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  next(): number;
  /** Entero en [min, max] (ambos incluidos). */
  int(min: number, max: number): number;
  /** Real en [min, max). */
  range(min: number, max: number): number;
  chance(p: number): boolean;
}

export function makeRng(seedText: string): Rng {
  const next = mulberry32(hashString(seedText));
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
  };
}

/** Categoría de una pieza, para no encadenar dos del mismo tipo. */
export type PieceTag = 'pit' | 'lift' | 'foes' | 'vertical' | 'blocks' | 'pipes' | 'reward' | 'theme';

export interface PieceSpec<K extends string> {
  kind: K;
  /** Dificultad aproximada en [0, 1]. */
  difficulty: number;
  tag: PieceTag;
}

/**
 * Curva de intensidad deseada en la posición t ∈ [0, 1] del nivel.
 * progress ∈ [0, 1] es qué tan avanzado está el nivel dentro del modo.
 *   base(progress) = 0.22 + 0.5·progress         (rampa global del modo)
 *   ola(t)         = 0.18·sin(2π·k·t − π/2)       (k olas de tensión)
 *   final(t)       = 0.12·smoothstep(0.75, 1, t)  (clímax antes de la meta)
 */
export function intensityAt(t: number, progress: number, waves: number): number {
  const base = 0.22 + 0.5 * progress;
  const wave = 0.18 * Math.sin(2 * Math.PI * waves * t - Math.PI / 2);
  const x = Math.min(1, Math.max(0, (t - 0.75) / 0.25));
  const climax = 0.12 * x * x * (3 - 2 * x);
  return Math.min(1, Math.max(0, base + wave + climax));
}

export interface PlanStep<K extends string> {
  kind: K | 'rest';
  /** Intensidad objetivo usada al elegir (útil para pruebas y depuración). */
  target: number;
}

export interface PlanOptions<K extends string> {
  pieces: PieceSpec<K>[];
  rng: Rng;
  /** Progreso del nivel dentro de su modo, en [0, 1]. */
  progress: number;
  /** Piezas exclusivas del modo, que deben aparecer al menos una vez. */
  signature?: K[];
}

/**
 * Elige la secuencia de piezas de un nivel siguiendo la curva de intensidad,
 * sin repetir piezas consecutivas ni categorías seguidas, con descansos.
 */
export function planLevel<K extends string>(opts: PlanOptions<K>): PlanStep<K>[] {
  const { pieces, rng, progress } = opts;
  const count = Math.round(6 + progress * 5 + rng.int(0, 2)); // 6..13 piezas
  const waves = rng.int(2, 3);
  const sigma = 0.16;
  const used = new Map<K, number>();
  const plan: PlanStep<K>[] = [];
  let tension = 0;
  let lastTag: PieceTag | null = null;
  const recent: K[] = [];

  // Piezas exclusivas del modo: se reparten en posiciones al azar
  const signatureSlots = new Map<number, K>();
  for (const sig of opts.signature ?? []) {
    let slot = rng.int(1, Math.max(1, count - 2));
    while (signatureSlots.has(slot)) slot = (slot % (count - 1)) + 1;
    signatureSlots.set(slot, sig);
  }

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const target = intensityAt(t, progress, waves);

    // Descanso tras acumular tensión (y nunca dos seguidos)
    if (tension > 1.25 && plan.length > 0 && plan[plan.length - 1].kind !== 'rest') {
      plan.push({ kind: 'rest', target });
      tension = 0;
      lastTag = null;
    }

    let choice: PieceSpec<K> | undefined;
    const forced = signatureSlots.get(i);
    if (forced && !used.has(forced)) choice = pieces.find((p) => p.kind === forced);

    if (!choice) {
      const weights = pieces.map((p) => {
        const fit = Math.exp(-((p.difficulty - target) ** 2) / (2 * sigma * sigma));
        const repeats = used.get(p.kind) ?? 0;
        // Repetir una pieza en el mismo nivel queda casi descartado: hay más piezas que lugares
        const novelty = repeats === 0 ? 1 : 0.0005 / repeats;
        const fresh = recent.includes(p.kind) ? 0 : 1; // jamás en las 3 últimas
        const varied = p.tag === lastTag ? 0.25 : 1; // no dos fosos seguidos, etc.
        return fit * novelty * fresh * varied + 1e-6;
      });
      const total = weights.reduce((a, b) => a + b, 0);
      let r = rng.next() * total;
      let idx = 0;
      while (idx < weights.length - 1 && r >= weights[idx]) {
        r -= weights[idx];
        idx++;
      }
      choice = pieces[idx];
    }

    plan.push({ kind: choice.kind, target });
    used.set(choice.kind, (used.get(choice.kind) ?? 0) + 1);
    recent.push(choice.kind);
    if (recent.length > 3) recent.shift();
    lastTag = choice.tag;
    tension += choice.difficulty;
  }
  return plan;
}

/** Entropía de Shannon (bits) de la distribución de piezas de un plan. */
export function planEntropy(kinds: string[]): number {
  const counts = new Map<string, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / kinds.length;
    h -= p * Math.log2(p);
  }
  return h;
}
