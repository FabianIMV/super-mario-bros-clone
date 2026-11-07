import {
  BIOMES,
  GROUND_ROW,
  MIN_CAMERA_WORLD_X,
  SMW_TOTAL_LEVELS,
  STAGES_PER_WORLD,
  TILE,
  getStageBiome,
  getWorldLabel,
} from '../engine/biomes';
import type {
  BerryEntity,
  Block,
  BlockContent,
  BlockType,
  Checkpoint,
  CoinEntity,
  DragonCoin,
  Enemy,
  EnemyType,
  FortressBoss,
  GoalTape,
  MovingPlatform,
  Pipe,
  PowerState,
  SceneryProp,
  Spring,
  WorldState,
} from '../engine/types';
import { createInitialPlayer, gridKey } from './levelBuilder';
import { makeRng, planLevel, type PieceSpec, type PlanStep, type Rng } from './procgen';

export const SMW_STAGE_TITLES: string[] = [
  // Mundo 1: Isla de Yoshi (Y-1 .. Y-4)
  'Casa de Yoshi',
  'Colinas Baya Dulce',
  'Cumbres Pluma Dorada',
  'Castillo de Iggy',
  // Mundo 2: Llanura Rosquilla (D-1 .. D-4)
  'Pradera del Vuelo',
  'Gruta Rosquilla',
  'Puentes de Mantequilla',
  'Fortaleza de Morton',
  // Mundo 3: Domo Vainilla (V-1 .. V-4)
  'Caverna Espejismo',
  'Lago Subterráneo',
  'Ascenso de Cuarzo',
  'Bastión de Lemmy',
  // Mundo 4: Bosque Ilusión (B-1 .. B-4)
  'Sendero de las Copas',
  'Laberinto Giratorio',
  'Vuelo Estelar',
  'Torreón de Ludwig',
  // Mundo 5: Valle de Koopa (K-1 .. K-4)
  'Cañón Balas Bill',
  'Catacumbas del Valle',
  'Asalto Aéreo Final',
  'Gran Castillo Koopa',
];

export const SMW_WORLD_NAMES: string[] = [
  'Y • ISLA DE YOSHI',
  'D • LLANURA ROSQUILLA',
  'V • DOMO VAINILLA',
  'B • BOSQUE ILUSIÓN',
  'K • VALLE DE KOOPA',
];

interface SmwCtx {
  levelIndex: number;
  worldNum: number;
  stageNum: number;
  difficulty: number;
  nextId: number;
  blocks: Block[];
  blockGrid: Map<number, Block>;
  pipes: Pipe[];
  platforms: MovingPlatform[];
  springs: Spring[];
  enemies: Enemy[];
  coins: CoinEntity[];
  dragonCoins: DragonCoin[];
  berries: BerryEntity[];
  pits: Set<number>;
  lavaCols: Set<number>;
  isFortress: boolean;
  isUnderground: boolean;
  enemySeq: number;
  /** RNG con semilla (modo, nivel) para las variantes de cada pieza. */
  rng: Rng;
}

function putBlock(
  ctx: SmwCtx,
  col: number,
  row: number,
  type: BlockType,
  content: BlockContent = null
): void {
  if (col < 0 || row < 0 || row >= 15) return;
  const key = gridKey(col, row);
  if (ctx.blockGrid.has(key)) {
    const prev = ctx.blockGrid.get(key)!;
    const idx = ctx.blocks.indexOf(prev);
    if (idx !== -1) ctx.blocks.splice(idx, 1);
  }
  const block: Block = {
    id: ctx.nextId++,
    col,
    row,
    x: col * TILE,
    y: row * TILE,
    baseY: row * TILE,
    width: TILE,
    height: TILE,
    type,
    content,
    coinsRemaining: content === 'multi_coin' ? 6 : content === 'coin' ? 1 : 0,
    bounceY: 0,
    bounceVel: 0,
    spinTimer: 0,
  };
  ctx.blocks.push(block);
  ctx.blockGrid.set(key, block);
}

function addCoin(ctx: SmwCtx, col: number, rowFloat: number): void {
  ctx.coins.push({
    x: col * TILE + 7,
    y: rowFloat * TILE + 5,
    baseY: rowFloat * TILE + 5,
    width: 18,
    height: 22,
    collected: false,
    phase: col * 0.45,
  });
}

function addCoinArc(ctx: SmwCtx, startCol: number, count: number, peakRow: number): void {
  for (let i = 0; i < count; i++) {
    const norm = count > 1 ? (i / (count - 1)) * 2 - 1 : 0;
    const yRow = peakRow + norm * norm * 1.35;
    addCoin(ctx, startCol + i, yRow);
  }
}

function addDragonCoin(ctx: SmwCtx, col: number, rowFloat: number): void {
  ctx.dragonCoins.push({
    x: col * TILE + 4,
    y: rowFloat * TILE,
    baseY: rowFloat * TILE,
    width: 24,
    height: 36,
    collected: false,
    phase: col * 0.3,
  });
}

function addBerry(ctx: SmwCtx, col: number, rowFloat: number): void {
  ctx.berries.push({
    x: col * TILE + 6,
    y: rowFloat * TILE + 6,
    width: 20,
    height: 20,
    eaten: false,
  });
}

function addPipe(ctx: SmwCtx, col: number, heightTiles: number, hasPiranha: boolean): void {
  ctx.pits.delete(col);
  ctx.pits.delete(col + 1);
  const topRow = GROUND_ROW - heightTiles;
  ctx.pipes.push({
    x: col * TILE,
    y: topRow * TILE,
    width: 2 * TILE,
    height: heightTiles * TILE,
    hasPiranha,
  });

  if (hasPiranha) {
    const piranhaH = 38;
    const baseY = topRow * TILE - piranhaH + 2;
    ctx.enemies.push({
      id: ctx.nextId++,
      type: 'piranha',
      state: 'walk',
      x: col * TILE + 20,
      y: topRow * TILE + 8,
      baseY,
      vx: 0,
      vy: 0,
      width: 24,
      height: piranhaH,
      facing: -1,
      onGround: false,
      hp: 1,
      stateTimer: (col * 17) % 90,
      kickGraceTimer: 0,
      shellCombo: 0,
      animTimer: 0,
      active: false,
    });
  }
}

function addEnemy(ctx: SmwCtx, col: number, rowAboveBottom: number, type: EnemyType): void {
  const isTall =
    type === 'koopa_green' ||
    type === 'koopa_red' ||
    type === 'paratroopa' ||
    type === 'rex' ||
    type === 'chuck';
  const height = type === 'chuck' ? 42 : isTall ? 38 : type === 'bullet_bill' ? 24 : 28;
  const width = type === 'chuck' ? 32 : 26;
  const baseSpeed =
    type === 'bullet_bill'
      ? 3.35
      : type === 'chuck'
      ? 1.85
      : type === 'rex'
      ? 1.15
      : type === 'spiny'
      ? 1.25
      : 1.12;
  const vx = -baseSpeed * (type === 'bullet_bill' ? 1 : 1 + (ctx.difficulty - 1) * 0.28);
  const bottomY = (rowAboveBottom + 1) * TILE;
  ctx.enemies.push({
    id: ctx.nextId++,
    type,
    state: 'walk',
    x: col * TILE + 3,
    y: bottomY - height,
    baseY: bottomY - height,
    vx,
    vy: 0,
    width,
    height,
    facing: -1,
    onGround: false,
    hp: type === 'rex' || type === 'chuck' ? 2 : 1,
    stateTimer: 0,
    kickGraceTimer: 0,
    shellCombo: 0,
    animTimer: 0,
    active: false,
  });
}

function addSpring(ctx: SmwCtx, col: number, rowOnTopOf: number): void {
  ctx.springs.push({
    x: col * TILE + 3,
    y: (rowOnTopOf - 1) * TILE + 4,
    width: 26,
    height: 28,
    compressTimer: 0,
  });
}

function addPlatform(
  ctx: SmwCtx,
  col: number,
  row: number,
  tilesWide: number,
  rangeX: number,
  rangeY: number,
  speed = 0.032,
  phase = 0
): void {
  ctx.platforms.push({
    x: col * TILE,
    y: row * TILE,
    startX: col * TILE,
    startY: row * TILE,
    width: tilesWide * TILE,
    height: 16,
    rangeX: rangeX * TILE,
    rangeY: rangeY * TILE,
    speed,
    phase,
    vx: 0,
    vy: 0,
  });
}

function carvePit(ctx: SmwCtx, startCol: number, widthCols: number, asLava = false): void {
  const safeWidth = Math.min(widthCols, 4);
  for (let c = startCol; c < startCol + safeWidth; c++) {
    ctx.pits.add(c);
    if (asLava || ctx.isFortress) {
      ctx.lavaCols.add(c);
    }
  }
}

// ============================================================================
// WORLD ENEMY ROSTERS — each Dinosaur Island world fields its own foes.
// ============================================================================
const SMW_ROSTERS: EnemyType[][] = [
  ['galoomba', 'rex', 'galoomba', 'koopa_green'], // Y: Isla de Yoshi
  ['koopa_green', 'rex', 'paratroopa', 'galoomba'], // D: Llanura Rosquilla
  ['spiny', 'koopa_red', 'galoomba', 'bullet_bill'], // V: Domo Vainilla
  ['rex', 'paratroopa', 'chuck', 'koopa_red'], // B: Bosque Ilusión
  ['chuck', 'spiny', 'rex', 'bullet_bill', 'koopa_red'], // K: Valle de Koopa
];

/** Next foe from the current world's roster (deterministic rotation). */
function smwFoe(ctx: SmwCtx): EnemyType {
  const roster = SMW_ROSTERS[Math.min(SMW_ROSTERS.length - 1, ctx.worldNum - 1)];
  const type = roster[ctx.enemySeq % roster.length];
  ctx.enemySeq++;
  return type;
}

/** Spawn a roster foe; Bullet Bills fly at mid height instead of walking. */
function addFoe(ctx: SmwCtx, col: number): void {
  const type = smwFoe(ctx);
  addEnemy(ctx, col, type === 'bullet_bill' ? 8 : GROUND_ROW - 1, type);
}

/** Variante 0..2 de una pieza: sale del RNG del nivel, así cada uso se ve distinto. */
function smwVariant(ctx: SmwCtx, _salt: number): number {
  return ctx.rng.int(0, 2);
}

// ============================================================================
// CURATED SUPER MARIO WORLD SETPIECES
// ============================================================================
type SmwSetpiece =
  | 'yoshi_berry_orchard'
  | 'cape_runway_skyway'
  | 'rotating_block_vault'
  | 'rex_terrace_paratroopa'
  | 'chuck_stadium'
  | 'bullet_bill_canyon'
  | 'vanilla_crystal_lifts'
  | 'spiny_spinjump_bridge'
  | 'galoomba_meadow'
  | 'rotating_staircase'
  | 'pipe_valley'
  | 'rex_hill'
  | 'donut_lifts'
  | 'feather_cloud_trail';

function buildSmwSetpiece(ctx: SmwCtx, kind: SmwSetpiece, c: number): number {
  const v = smwVariant(ctx, c);
  switch (kind) {
    case 'yoshi_berry_orchard': {
      // Yoshi Egg block + juicy red berries + Red Koopa (for Yoshi 3-fireball breath!)
      putBlock(ctx, c + 1, 8, 'rotating');
      putBlock(ctx, c + 2, 8, 'question', v === 2 ? 'feather' : 'yoshi_egg');
      putBlock(ctx, c + 3, 8, 'rotating');
      addBerry(ctx, c + 5, 10.6);
      addBerry(ctx, c + 8, 9.5 - v * 0.5);
      addBerry(ctx, c + 11, 10.6);
      addEnemy(ctx, c + 7, GROUND_ROW - 1, 'koopa_red');
      addFoe(ctx, c + 11);
      addFoe(ctx, c + 13);
      addCoinArc(ctx, c + 6, 5, 6.2);
      return 16;
    }

    case 'cape_runway_skyway': {
      // Cape Feather block + flat P-Meter sprint runway + high cloud coin trail!
      putBlock(ctx, c + 1, 8, 'question', 'feather');
      putBlock(ctx, c + 2, 8, 'rotating');
      for (let k = 0; k < 9; k++) {
        addCoin(ctx, c + 5 + k, 2.2 + (k % 2) * 0.4);
      }
      const row = 4 + (v === 1 ? 1 : 0);
      for (let k = c + 7; k <= c + 12; k++) {
        putBlock(ctx, k, row, 'bridge');
      }
      addFoe(ctx, c + 9);
      addFoe(ctx, c + 13);
      return 17;
    }

    case 'rotating_block_vault': {
      // SMW Yellow Rotating [👀] Blocks chamber — spin-whack with Cape or bump from below!
      for (let row = 9; row <= 11; row++) {
        putBlock(ctx, c + 2, row, 'rotating');
        putBlock(ctx, c + 8, row, 'rotating');
      }
      for (let k = c + 2; k <= c + 8; k++) {
        putBlock(ctx, k, 8, k === c + 5 ? 'question' : 'rotating', k === c + 5 ? (v === 1 ? 'star' : 'feather') : null);
      }
      addCoin(ctx, c + 4, 10);
      addCoin(ctx, c + 5, 10);
      addCoin(ctx, c + 6, 10);
      addEnemy(ctx, c + 5, 7, v === 2 ? 'spiny' : 'rex');
      addFoe(ctx, c + 11);
      return 14;
    }

    case 'rex_terrace_paratroopa': {
      addPipe(ctx, c + 1, 2 + (v === 2 ? 1 : 0), false);
      addBerry(ctx, c + 4, 10.5);
      addEnemy(ctx, c + 5, GROUND_ROW - 1, 'rex');
      addPipe(ctx, c + 7, 3 - (v === 1 ? 1 : 0), true);
      carvePit(ctx, c + 10, 3);
      for (let k = c + 10; k <= c + 13; k++) {
        putBlock(ctx, k, 8, 'bridge');
      }
      addEnemy(ctx, c + 11, 7, 'paratroopa');
      addCoinArc(ctx, c + 10, 4, 5.2);
      return 16;
    }

    case 'chuck_stadium': {
      // Chargin' Chuck defending an elevated rotating-block platform!
      putBlock(ctx, c + 2, 8, 'rotating');
      putBlock(ctx, c + 3, 8, 'question', v === 0 ? 'coin' : 'feather');
      putBlock(ctx, c + 4, 8, 'rotating', 'multi_coin');
      putBlock(ctx, c + 5, 8, 'rotating');
      addEnemy(ctx, c + 7, GROUND_ROW - 1, 'chuck');
      if (v === 2) addFoe(ctx, c + 9);
      addSpring(ctx, c + 10, GROUND_ROW);
      for (let k = c + 12; k <= c + 15; k++) {
        putBlock(ctx, k, 6, 'bridge');
        addCoin(ctx, k, 4.3);
      }
      return 17;
    }

    case 'bullet_bill_canyon': {
      putBlock(ctx, c, 11, 'hard');
      putBlock(ctx, c + 1, 10, 'hard');
      putBlock(ctx, c + 1, 11, 'hard');
      carvePit(ctx, c + 2, 3);
      putBlock(ctx, c + 5, 9, 'hard');
      putBlock(ctx, c + 6, 9, 'hard');
      carvePit(ctx, c + 7, 3);
      addEnemy(ctx, c + 6, 6 + v, 'bullet_bill');
      addEnemy(ctx, c + 11, 8, 'bullet_bill');
      addEnemy(ctx, c + 14, 5 + v, 'bullet_bill');
      addCoinArc(ctx, c + 3, 6, 5.5);
      return 16;
    }

    case 'vanilla_crystal_lifts': {
      carvePit(ctx, c + 2, 4);
      carvePit(ctx, c + 6, 3);
      addPlatform(ctx, c + 4, 8.8 - v * 0.4, 3, 2.7, 0, 0.036 + v * 0.004, v);
      putBlock(ctx, c + 5, 4, 'question', v === 1 ? 'feather' : 'one_up');
      addCoinArc(ctx, c + 3, 5, 5.2);
      addEnemy(ctx, c + 11, GROUND_ROW - 1, 'koopa_red');
      addFoe(ctx, c + 13);
      return 15;
    }

    case 'spiny_spinjump_bridge': {
      // Perfect showcase for SMW Spin Jump (Y) or Yoshi tongue!
      putBlock(ctx, c + 1, 8, 'question', 'yoshi_egg');
      for (let k = c + 4; k <= c + 11; k++) {
        putBlock(ctx, k, 8, 'rotating');
      }
      addEnemy(ctx, c + 6, 7, 'spiny');
      addEnemy(ctx, c + 9, 7, 'spiny');
      addFoe(ctx, c + 7);
      addFoe(ctx, c + 10);
      addCoinArc(ctx, c + 5, 5, 4.8);
      return 14;
    }

    case 'galoomba_meadow': {
      // Rolling meadow: two rotating-block shelves, berries and a foe squad.
      for (let k = c + 2; k <= c + 5; k++) putBlock(ctx, k, 8, k === c + 3 ? 'question' : 'rotating', k === c + 3 ? 'coin' : null);
      for (let k = c + 8; k <= c + 11; k++) putBlock(ctx, k, 6 + v, k === c + 10 ? 'question' : 'rotating', k === c + 10 ? 'feather' : null);
      addBerry(ctx, c + 6, 10.6);
      addBerry(ctx, c + 13, 10.6);
      addEnemy(ctx, c + 4, GROUND_ROW - 1, 'galoomba');
      addFoe(ctx, c + 7);
      addFoe(ctx, c + 10);
      addEnemy(ctx, c + 12, GROUND_ROW - 1, 'galoomba');
      addCoinArc(ctx, c + 7, 6, 5.0);
      return 16;
    }

    case 'rotating_staircase': {
      // Ascending rotating-block steps to a high prize, descending ramp after.
      for (let i = 0; i < 4; i++) {
        putBlock(ctx, c + 1 + i * 2, 10 - i * 2 + (v === 2 ? 1 : 0), 'rotating');
        putBlock(ctx, c + 2 + i * 2, 10 - i * 2 + (v === 2 ? 1 : 0), 'rotating');
        addCoin(ctx, c + 1 + i * 2, 8.6 - i * 2 + (v === 2 ? 1 : 0));
      }
      putBlock(ctx, c + 8, 1 + (v === 2 ? 1 : 0), 'question', v === 1 ? 'star' : 'one_up');
      addFoe(ctx, c + 4);
      addFoe(ctx, c + 11);
      return 14;
    }

    case 'pipe_valley': {
      const hs = [
        [2, 3, 2],
        [3, 2, 3],
        [2, 4, 2],
      ][v];
      addPipe(ctx, c + 1, hs[0], false);
      addFoe(ctx, c + 5);
      addPipe(ctx, c + 7, hs[1], true);
      putBlock(ctx, c + 10, 7, 'rotating');
      putBlock(ctx, c + 11, 7, 'question', 'feather');
      addBerry(ctx, c + 11, 10.5);
      addFoe(ctx, c + 12);
      addPipe(ctx, c + 14, hs[2], true);
      return 18;
    }

    case 'rex_hill': {
      // Stepped hill climbed by Rexes, coins along the crest.
      const peak = 3 + (v === 1 ? 1 : 0);
      for (let s = 0; s < peak; s++) {
        for (let h = 0; h <= s; h++) putBlock(ctx, c + s * 2, GROUND_ROW - 1 - h, 'hard');
        for (let h = 0; h <= s; h++) putBlock(ctx, c + s * 2 + 1, GROUND_ROW - 1 - h, 'hard');
      }
      for (let k = 0; k < 3; k++) {
        for (let h = 0; h < peak; h++) putBlock(ctx, c + peak * 2 + k, GROUND_ROW - 1 - h, 'hard');
        addCoin(ctx, c + peak * 2 + k, GROUND_ROW - 2.6 - peak);
      }
      addEnemy(ctx, c + peak * 2 + 1, GROUND_ROW - 1 - peak, 'rex');
      addFoe(ctx, c + peak * 2 + 5);
      return peak * 2 + 8;
    }

    case 'donut_lifts': {
      putBlock(ctx, c, 11, 'hard');
      carvePit(ctx, c + 1, 4);
      carvePit(ctx, c + 5, 4);
      addPlatform(ctx, c + 2, 9, 2, 1.5, 0, 0.034, 0);
      addPlatform(ctx, c + 6, 8 - v * 0.5, 2, 0, 1.8, 0.038, 1.4);
      putBlock(ctx, c + 4, 4, 'question', v === 0 ? 'one_up' : 'coin');
      addCoinArc(ctx, c + 2, 6, 5.4);
      addEnemy(ctx, c + 7, 7, 'paratroopa');
      putBlock(ctx, c + 9, 11, 'hard');
      addFoe(ctx, c + 12);
      return 14;
    }

    case 'feather_cloud_trail': {
      // Feather + spring up to a long cloud bridge high above foes.
      putBlock(ctx, c + 1, 8, 'question', 'feather');
      addSpring(ctx, c + 3, GROUND_ROW);
      for (let k = c + 5; k <= c + 14; k++) {
        putBlock(ctx, k, 5 - (v === 2 ? 1 : 0), 'bridge');
        addCoin(ctx, k, 3.6 - (v === 2 ? 1 : 0));
      }
      addFoe(ctx, c + 8);
      addFoe(ctx, c + 12);
      if (v === 1) addEnemy(ctx, c + 10, 4, 'paratroopa');
      return 17;
    }
  }
}

// ============================================================================
// HANDCRAFTED STAGE Y-1: CASA DE YOSHI (Immediate Yoshi + Cape Flight Showcase!)
// ============================================================================
function buildSmwStageY1(ctx: SmwCtx): number {
  const totalCols = 140;
  carvePit(ctx, 56, 3);
  carvePit(ctx, 94, 3);

  // Welcome right outside Yoshi's House:
  // Col 8: Spotted Yoshi Egg Block! Col 12: Pluma Capa (Cape Feather)!
  putBlock(ctx, 8, 8, 'question', 'yoshi_egg');
  putBlock(ctx, 11, 8, 'rotating');
  putBlock(ctx, 12, 8, 'question', 'feather');
  putBlock(ctx, 13, 8, 'rotating');

  addBerry(ctx, 15, 10.6);
  addBerry(ctx, 19, 10.6);
  addEnemy(ctx, 17, GROUND_ROW - 1, 'galoomba');
  addEnemy(ctx, 22, GROUND_ROW - 1, 'rex');

  // Long P-Meter Takeoff Runway (cols 16..36) + Sky Cloud Bridge with Dragon Coin #1!
  for (let c = 24; c <= 35; c++) {
    if (c >= 27 && c <= 33) {
      putBlock(ctx, c, 4, 'bridge');
    }
    addCoin(ctx, c, 2.3);
  }
  addDragonCoin(ctx, 30, 1.5); // Dragon Coin #1 high in sky!

  // Rotating Block Cape-Spin Gate + Red Koopa (eat with Yoshi to breathe 3 fireballs!)
  for (let r = 9; r <= 11; r++) {
    putBlock(ctx, 39, r, 'rotating');
  }
  putBlock(ctx, 39, 8, 'rotating');
  putBlock(ctx, 40, 8, 'question', 'multi_coin');
  putBlock(ctx, 41, 8, 'rotating');
  addDragonCoin(ctx, 43, 9.5); // Dragon Coin #2 behind rotating wall!

  addEnemy(ctx, 46, GROUND_ROW - 1, 'koopa_red');
  addEnemy(ctx, 50, GROUND_ROW - 1, 'galoomba');
  addEnemy(ctx, 52, GROUND_ROW - 1, 'galoomba');
  addBerry(ctx, 48, 10.5);

  // Bridge over Pit 1 + Dragon Coin #3
  for (let c = 56; c <= 58; c++) {
    putBlock(ctx, c, 8, 'bridge');
  }
  addDragonCoin(ctx, 57, 5.2);
  addEnemy(ctx, 58, 7, 'paratroopa');

  // Midpoint Checkpoint around col 68!
  putBlock(ctx, 64, 8, 'question', 'feather');
  addBerry(ctx, 66, 10.6);

  // Chargin' Chuck & Bullet Bill Valley!
  addPipe(ctx, 73, 2, false);
  addEnemy(ctx, 78, GROUND_ROW - 1, 'chuck');
  addSpring(ctx, 82, GROUND_ROW);
  for (let c = 84; c <= 90; c++) {
    putBlock(ctx, c, 6, c === 87 ? 'question' : 'rotating', c === 87 ? 'star' : null);
    addCoin(ctx, c, 4.2);
  }
  addDragonCoin(ctx, 87, 2.2); // Dragon Coin #4!

  // Chasm 2 with Moving Lift & Bullet Bills
  addPlatform(ctx, 94, 9, 3, 2.2, 0, 0.036, 0);
  addEnemy(ctx, 100, 7, 'bullet_bill');
  addEnemy(ctx, 105, GROUND_ROW - 1, 'rex');
  addEnemy(ctx, 109, GROUND_ROW - 1, 'koopa_green');
  addBerry(ctx, 112, 10.6);

  // Final Runway to Giant Striped Goalpost + Dragon Coin #5 at high tape level!
  for (let s = 0; s < 5; s++) {
    for (let h = 0; h <= s; h++) {
      putBlock(ctx, 116 + s, GROUND_ROW - 1 - h, 'hard');
    }
  }
  addDragonCoin(ctx, 123, 4.0); // Dragon Coin #5 right on high jump to Goal Tape!

  return totalCols;
}

// ============================================================================
// SMW FORTRESS STAGE BUILDER (Y-4, D-4, V-4, B-4, K-4) — a distinct route per castle
// ============================================================================
type SmwCastleSection =
  | 'lava_trench'
  | 'chuck_hallway'
  | 'synced_lift'
  | 'rotating_bridge'
  | 'vertical_lift'
  | 'thwomp_hall'
  | 'magma_steps'
  | 'bill_gallery'
  | 'castle_supply';

/** Builds one castle section; returns width and the column of its Dragon Coin. */
function buildSmwCastleSection(
  ctx: SmwCtx,
  kind: SmwCastleSection,
  c: number
): { width: number; coinCol: number; coinRow: number } {
  const w = ctx.worldNum;
  switch (kind) {
    case 'lava_trench': {
      carvePit(ctx, c + 1, 3, true);
      putBlock(ctx, c + 2, 9, 'hard');
      addFoe(ctx, c + 6);
      return { width: 8, coinCol: c + 2, coinRow: 6.2 };
    }
    case 'chuck_hallway': {
      addEnemy(ctx, c + 1, GROUND_ROW - 1, 'chuck');
      addEnemy(ctx, c + 6, GROUND_ROW - 1, 'spiny');
      putBlock(ctx, c + 3, 7, 'rotating');
      putBlock(ctx, c + 4, 7, 'question', 'coin');
      putBlock(ctx, c + 5, 7, 'rotating');
      return { width: 9, coinCol: c + 4, coinRow: 5.4 };
    }
    case 'synced_lift': {
      carvePit(ctx, c + 1, 4, true);
      carvePit(ctx, c + 5, 3, true);
      addPlatform(ctx, c + 3, 9, 3, 2.8, 0, 0.038 + w * 0.003, 0.4);
      return { width: 10, coinCol: c + 4, coinRow: 5.2 };
    }
    case 'rotating_bridge': {
      carvePit(ctx, c + 2, 4, true);
      for (let k = c + 1; k <= c + 7; k++) {
        putBlock(ctx, k, 8, 'bridge');
        if (k >= c + 3 && k <= c + 5) putBlock(ctx, k, 4, 'rotating');
      }
      addEnemy(ctx, c + 5, 7, 'paratroopa');
      return { width: 10, coinCol: c + 4, coinRow: 5.6 };
    }
    case 'vertical_lift': {
      carvePit(ctx, c + 1, 4, true);
      addPlatform(ctx, c + 2, 8.5, 2, 0, 2.2, 0.042, 1.1);
      putBlock(ctx, c + 7, 8, 'question', 'feather');
      addFoe(ctx, c + 9);
      return { width: 11, coinCol: c + 2, coinRow: 4.2 };
    }
    case 'thwomp_hall': {
      // Low stone ceiling corridor packed with foes.
      for (let k = c; k <= c + 10; k++) {
        const isQ = k === c + 4;
        putBlock(ctx, k, 7, isQ ? 'question' : 'hard', isQ ? 'feather' : null);
      }
      addFoe(ctx, c + 3);
      addEnemy(ctx, c + 7, GROUND_ROW - 1, w >= 3 ? 'spiny' : 'galoomba');
      addFoe(ctx, c + 10);
      return { width: 13, coinCol: c + 8, coinRow: 10.2 };
    }
    case 'magma_steps': {
      for (let s = 0; s < 3; s++) {
        for (let h = 0; h <= s; h++) putBlock(ctx, c + s, GROUND_ROW - 1 - h, 'hard');
      }
      carvePit(ctx, c + 3, 3, true);
      for (let s = 0; s < 3; s++) {
        for (let h = 0; h <= 2 - s; h++) putBlock(ctx, c + 6 + s, GROUND_ROW - 1 - h, 'hard');
      }
      addFoe(ctx, c + 10);
      return { width: 12, coinCol: c + 4, coinRow: 6.0 };
    }
    case 'bill_gallery': {
      for (let i = 0; i < 3; i++) {
        const col = c + 1 + i * 3;
        putBlock(ctx, col, 11, 'hard');
        putBlock(ctx, col, 10, 'hard');
        carvePit(ctx, col + 1, 2, true);
      }
      putBlock(ctx, c + 10, 11, 'hard');
      addEnemy(ctx, c + 8, 6, 'bullet_bill');
      addEnemy(ctx, c + 12, 8, 'bullet_bill');
      return { width: 13, coinCol: c + 4, coinRow: 7.2 };
    }
    case 'castle_supply': {
      putBlock(ctx, c + 1, 8, 'question', 'feather');
      putBlock(ctx, c + 2, 8, 'question', w >= 3 ? 'one_up' : 'coin');
      addEnemy(ctx, c + 6, GROUND_ROW - 1, 'chuck');
      return { width: 9, coinCol: c + 9, coinRow: 7.5 };
    }
  }
}

/** Picks exactly 5 evenly spread indices out of n (n >= 5) for Dragon Coins. */
function dragonCoinSlots(n: number): Set<number> {
  const slots = new Set<number>();
  for (let i = 0; i < 5; i++) slots.add(Math.round((i * (n - 1)) / 4));
  return slots;
}

function buildSmwFortressStage(ctx: SmwCtx): { totalCols: number; boss: FortressBoss } {
  // SMW Castle Opening: Cape Feather + Rotating Blocks!
  putBlock(ctx, 8, 8, 'rotating');
  putBlock(ctx, 9, 8, 'question', 'feather');
  putBlock(ctx, 10, 8, 'rotating');
  addFoe(ctx, 14);

  // Secciones generadas con la misma curva; siempre cierra con abastecimiento
  const plan: SmwCastleSection[] = [
    ...planLevel({
      pieces: SMW_CASTLE_PIECES,
      rng: makeRng(`smw:${ctx.levelIndex}:castillo`),
      progress: smwProgress(ctx),
    })
      .filter((s) => s.kind !== 'rest')
      .slice(0, 5 + Math.round(smwProgress(ctx) * 3))
      .map((s) => s.kind as SmwCastleSection),
    'castle_supply',
  ];
  const slots = dragonCoinSlots(plan.length);
  let cursor = 18;
  plan.forEach((section, i) => {
    const res = buildSmwCastleSection(ctx, section, cursor);
    if (slots.has(i)) addDragonCoin(ctx, res.coinCol, res.coinRow);
    cursor += res.width + 2;
  });

  const totalCols = cursor + 36;
  for (let col = 0; col < totalCols; col++) {
    if (!ctx.blockGrid.has(gridKey(col, 0))) putBlock(ctx, col, 0, 'hard');
  }

  // Rey Koopa Castle Arena!
  const arenaStart = totalCols - 32;
  const bridgeStart = arenaStart + 4;
  const bridgeLen = 13;
  const bridgeCols: number[] = [];

  putBlock(ctx, arenaStart + 2, 11, 'hard');
  putBlock(ctx, arenaStart + 3, 10, 'hard');
  putBlock(ctx, arenaStart + 3, 11, 'hard');

  for (let k = 0; k < 5; k++) {
    putBlock(ctx, bridgeStart + 3 + k, 5, 'rotating');
  }

  for (let b = 0; b < bridgeLen; b++) {
    const col = bridgeStart + b;
    ctx.pits.add(col);
    ctx.lavaCols.add(col);
    putBlock(ctx, col, 10, 'bridge');
    bridgeCols.push(col);
  }

  const axeCol = bridgeStart + bridgeLen;
  putBlock(ctx, axeCol, 10, 'hard');
  putBlock(ctx, axeCol, 11, 'hard');

  const maxHp = 6 + ctx.worldNum * 2;
  const boss: FortressBoss = {
    x: (bridgeStart + 8) * TILE,
    y: 10 * TILE - 60,
    homeX: (bridgeStart + 8) * TILE,
    vx: -1.2,
    vy: 0,
    width: 56,
    height: 60,
    hp: maxHp,
    maxHp,
    facing: -1,
    onGround: false,
    jumpTimer: 72,
    fireTimer: 90,
    roarTimer: 0,
    hurtFlashTimer: 0,
    defeated: false,
    fallingInLava: false,
    axeX: axeCol * TILE,
    axeY: 9 * TILE,
    axeGrabbed: false,
    bridgeCols,
    bridgeCollapseTimer: 0,
  };

  return { totalCols, boss };
}

// Catálogo para la generación procedural (ver procgen.ts)
const SMW_PIECES: PieceSpec<SmwSetpiece>[] = [
  { kind: 'yoshi_berry_orchard', difficulty: 0.2, tag: 'reward' },
  { kind: 'galoomba_meadow', difficulty: 0.3, tag: 'foes' },
  { kind: 'cape_runway_skyway', difficulty: 0.35, tag: 'reward' },
  { kind: 'rotating_block_vault', difficulty: 0.4, tag: 'blocks' },
  { kind: 'pipe_valley', difficulty: 0.5, tag: 'pipes' },
  { kind: 'rex_hill', difficulty: 0.5, tag: 'vertical' },
  { kind: 'feather_cloud_trail', difficulty: 0.52, tag: 'vertical' },
  { kind: 'rotating_staircase', difficulty: 0.56, tag: 'blocks' },
  { kind: 'rex_terrace_paratroopa', difficulty: 0.6, tag: 'pit' },
  { kind: 'chuck_stadium', difficulty: 0.66, tag: 'foes' },
  { kind: 'vanilla_crystal_lifts', difficulty: 0.72, tag: 'lift' },
  { kind: 'donut_lifts', difficulty: 0.76, tag: 'lift' },
  { kind: 'spiny_spinjump_bridge', difficulty: 0.78, tag: 'foes' },
  { kind: 'bullet_bill_canyon', difficulty: 0.84, tag: 'pit' },
];

const SMW_CASTLE_PIECES: PieceSpec<SmwCastleSection>[] = [
  { kind: 'lava_trench', difficulty: 0.3, tag: 'pit' },
  { kind: 'chuck_hallway', difficulty: 0.45, tag: 'foes' },
  { kind: 'magma_steps', difficulty: 0.5, tag: 'vertical' },
  { kind: 'thwomp_hall', difficulty: 0.55, tag: 'blocks' },
  { kind: 'rotating_bridge', difficulty: 0.58, tag: 'reward' },
  { kind: 'synced_lift', difficulty: 0.64, tag: 'lift' },
  { kind: 'vertical_lift', difficulty: 0.66, tag: 'lift' },
  { kind: 'bill_gallery', difficulty: 0.72, tag: 'pit' },
];

function smwProgress(ctx: SmwCtx): number {
  return SMW_TOTAL_LEVELS <= 1 ? 0 : ctx.levelIndex / (SMW_TOTAL_LEVELS - 1);
}

/** Descanso tras un pico de tensión: tramo plano con monedas y bayas. */
function buildSmwRestPlaza(ctx: SmwCtx, c: number): number {
  addCoinArc(ctx, c + 1, 5, 7.6);
  addBerry(ctx, c + 5, 10.6);
  putBlock(ctx, c + 3, 8, 'rotating');
  return 7;
}

/** Plan de piezas de una etapa normal de World (determinista). */
export function smwStagePlan(levelIndex: number): PlanStep<SmwSetpiece>[] {
  return planLevel({
    pieces: SMW_PIECES,
    rng: makeRng(`smw:${levelIndex}:plan`),
    progress: SMW_TOTAL_LEVELS <= 1 ? 0 : levelIndex / (SMW_TOTAL_LEVELS - 1),
  });
}

function buildCuratedSmwStage(ctx: SmwCtx): number {
  // Secuencia generada: sigue una curva de tensión y no repite piezas seguidas
  const plan = smwStagePlan(ctx.levelIndex);
  const seq = plan.map((s) => s.kind);
  const slots = dragonCoinSlots(seq.length);
  let cursor = 12;

  // Every SMW stage opens with a welcoming Yoshi Egg or Cape Feather block!
  putBlock(
    ctx,
    8,
    8,
    'question',
    ctx.stageNum % 2 === 1 ? 'yoshi_egg' : 'feather'
  );
  putBlock(ctx, 9, 8, 'rotating');

  for (let i = 0; i < seq.length; i++) {
    const startC = cursor;
    const step = seq[i];
    const advance = step === 'rest' ? buildSmwRestPlaza(ctx, cursor) : buildSmwSetpiece(ctx, step, cursor);
    // Exactly 5 Dragon Coins per stage, spread across its zones.
    if (slots.has(i)) {
      addDragonCoin(ctx, startC + Math.floor(advance * 0.5), ctx.isUnderground ? 5.2 : 3.6);
    }
    cursor += advance + 3;
    if (i === Math.floor(seq.length / 2) - 1) {
      cursor += 5; // Midpoint Checkpoint plaza
    }
  }

  // Launch ramp before Giant Striped Goalpost!
  const rampStart = cursor + 2;
  for (let s = 0; s < 5; s++) {
    for (let h = 0; h <= s; h++) {
      putBlock(ctx, rampStart + s, GROUND_ROW - 1 - h, 'hard');
    }
  }

  if (ctx.isUnderground) {
    for (let col = 4; col < rampStart; col++) {
      if (col % 19 !== 0 && col % 19 !== 1 && !ctx.blockGrid.has(gridKey(col, 0))) {
        putBlock(ctx, col, 0, 'brick');
      }
    }
  }

  return rampStart + 18;
}

export function buildSmwWorldState(
  levelIndex: number,
  carryState?: {
    score: number;
    highScore: number;
    coins: number;
    lives: number;
    powerState: PowerState;
    mountedYoshi?: boolean;
    checkpointX?: number | null;
    checkpointY?: number | null;
    doubleJumpAssist?: boolean;
  }
): WorldState {
  const clampedIdx = Math.max(0, Math.min(levelIndex, SMW_TOTAL_LEVELS - 1));
  const worldNum = Math.floor(clampedIdx / STAGES_PER_WORLD) + 1;
  const stageNum = (clampedIdx % STAGES_PER_WORLD) + 1;
  const biomeId = getStageBiome(clampedIdx, 'smw');
  const biome = BIOMES[biomeId];

  const ctx: SmwCtx = {
    levelIndex: clampedIdx,
    worldNum,
    stageNum,
    difficulty: 1 + clampedIdx * 0.055,
    nextId: 1,
    blocks: [],
    blockGrid: new Map<number, Block>(),
    pipes: [],
    platforms: [],
    springs: [],
    enemies: [],
    coins: [],
    dragonCoins: [],
    berries: [],
    pits: new Set<number>(),
    lavaCols: new Set<number>(),
    isFortress: stageNum === 4,
    isUnderground: biome.underground,
    enemySeq: 0,
    rng: makeRng(`smw:${clampedIdx}:piezas`),
  };

  let totalCols = 140;
  let boss: FortressBoss | null = null;

  if (stageNum === 4) {
    const built = buildSmwFortressStage(ctx);
    totalCols = built.totalCols;
    boss = built.boss;
  } else if (clampedIdx === 0) {
    totalCols = buildSmwStageY1(ctx);
  } else {
    totalCols = buildCuratedSmwStage(ctx);
  }

  for (let c = 0; c <= 9; c++) {
    ctx.pits.delete(c);
    ctx.lavaCols.delete(c);
  }
  for (let c = totalCols - 12; c < totalCols; c++) {
    ctx.pits.delete(c);
    ctx.lavaCols.delete(c);
  }

  for (let col = 0; col < totalCols; col++) {
    if (!ctx.pits.has(col)) {
      putBlock(ctx, col, GROUND_ROW, 'ground_top');
      putBlock(ctx, col, GROUND_ROW + 1, 'ground_deep');
    }
  }

  ctx.enemies = ctx.enemies.filter((en) => {
    if (en.type === 'piranha' || en.type === 'bullet_bill') return true;
    const col = Math.floor(en.x / TILE);
    const row = Math.floor((en.y + en.height - 2) / TILE);
    if (ctx.blockGrid.has(gridKey(col, row))) return false;
    if (row === GROUND_ROW - 1 && ctx.pits.has(col)) return false;
    return true;
  });

  // Mid-stage Checkpoint Gate
  let checkpointCol = Math.floor(totalCols * 0.5);
  for (let offset = 0; offset < 18; offset++) {
    const tryCol = checkpointCol + (offset % 2 === 0 ? offset >> 1 : -(offset >> 1));
    const pipeBlocked = ctx.pipes.some((p) => Math.abs(p.x - tryCol * TILE) < TILE * 2);
    if (
      !ctx.pits.has(tryCol) &&
      !ctx.blockGrid.has(gridKey(tryCol, GROUND_ROW - 1)) &&
      !ctx.blockGrid.has(gridKey(tryCol, GROUND_ROW - 2)) &&
      !pipeBlocked
    ) {
      checkpointCol = tryCol;
      break;
    }
  }

  const alreadyAtCheckpoint =
    carryState?.checkpointX != null && carryState.checkpointX > 0;
  const checkpoint: Checkpoint = {
    x: checkpointCol * TILE + 6,
    y: (GROUND_ROW - 2) * TILE,
    width: 20,
    height: 2 * TILE,
    activated: alreadyAtCheckpoint,
  };

  // SMW Parallax Scenery (Rounded Diagonal SMW Hills, Yoshi's House on Y-1, Berry Bushes!)
  const sceneries: SceneryProp[] = [];
  if (clampedIdx === 0) {
    sceneries.push({
      kind: 'yoshi_house',
      x: -116,
      y: GROUND_ROW * TILE,
      scale: 1,
      parallax: 1.0,
    });
  }

  for (let i = -1; i < Math.ceil(totalCols / 6); i++) {
    if (biome.underground) {
      sceneries.push({
        kind: ctx.isFortress ? 'banner' : 'pillar',
        x: i * 240 + 60,
        y: TILE,
        scale: (Math.abs(i) % 2) + 1,
        parallax: 0.55,
      });
    } else {
      sceneries.push({
        kind: 'cloud',
        x: i * 210 + 30,
        y: 34 + (Math.abs(i) % 3) * 24,
        scale: (Math.abs(i) % 2) + 1,
        parallax: 0.35,
      });
      sceneries.push({
        kind: 'smw_hill',
        x: i * 250 + 20,
        y: GROUND_ROW * TILE,
        scale: (Math.abs(i) % 2) + 1,
        parallax: 0.62,
      });
      sceneries.push({
        kind: 'bush',
        x: i * 250 + 160,
        y: GROUND_ROW * TILE,
        scale: (Math.abs(i) % 3) + 1,
        parallax: 1.0,
      });
    }
  }

  // SMW Striped Giant Gate & Oscillating Tape Goal (Stages 1..3; Stage 4 is Koopa Castle!)
  let goalTape: GoalTape | null = null;
  if (stageNum !== 4) {
    const gateCol = totalCols - 10;
    const topY = 3 * TILE;
    const gateH = 9 * TILE;
    goalTape = {
      x: gateCol * TILE + 8,
      y: topY,
      width: 28,
      height: gateH,
      barY: topY + gateH - 28,
      barVy: -2.4,
      triggered: false,
      castleX: (gateCol + 3.5) * TILE,
      castleY: GROUND_ROW * TILE - 128,
    };
  }

  // Note: Yoshi can't enter Castles (stageNum === 4), just like SNES SMW!
  const carryYoshi = stageNum !== 4 && Boolean(carryState?.mountedYoshi);
  const player = createInitialPlayer(carryState?.powerState ?? 0, carryYoshi);
  if (alreadyAtCheckpoint && carryState?.checkpointX != null) {
    player.x = carryState.checkpointX;
    player.y = GROUND_ROW * TILE - player.height;
  }

  // Start camera with generous left lead so Plomero is NEVER under the left D-Pad!
  const startCameraX = Math.max(MIN_CAMERA_WORLD_X, player.x - 304);

  return {
    partition: 'smw',
    totalStagesInPartition: SMW_TOTAL_LEVELS,
    status: 'playing',
    levelIndex: clampedIdx,
    worldLabel: getWorldLabel(clampedIdx, 'smw'),
    stageTitle: SMW_STAGE_TITLES[clampedIdx] ?? `Isla ${getWorldLabel(clampedIdx, 'smw')}`,
    biomeId,
    totalCols,
    score: carryState?.score ?? 0,
    highScore: carryState?.highScore ?? 0,
    coins: carryState?.coins ?? 0,
    lives: carryState?.lives ?? 5,
    timeLeft: 400,
    timeTick: 0,
    frameCount: 0,
    statusTimer: 0,
    cameraX: startCameraX,
    screenShake: 0,
    checkpointX: carryState?.checkpointX ?? null,
    checkpointY: carryState?.checkpointY ?? null,
    player,
    blocks: ctx.blocks,
    blockGrid: ctx.blockGrid,
    pipes: ctx.pipes,
    platforms: ctx.platforms,
    springs: ctx.springs,
    checkpoint,
    enemies: ctx.enemies,
    boss,
    bossFires: [],
    powerups: [],
    yoshis: [],
    dragonCoins: ctx.dragonCoins,
    dragonCoinsCollected: 0,
    berries: ctx.berries,
    fireballs: [],
    coinsList: ctx.coins,
    particles: [],
    floatingTexts: [],
    sceneries,
    lavaCols: ctx.lavaCols,
    flagpole: null,
    goalTape,
    prevJumpHeld: false,
    prevFireHeld: false,
    prevSpinHeld: false,
    doubleJumpAssist: carryState?.doubleJumpAssist ?? false,
    nextEntityId: ctx.nextId,
  };
}
