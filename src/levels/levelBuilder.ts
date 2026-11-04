import {
  BIOMES,
  DIM_TOTAL_LEVELS,
  EXP_TOTAL_LEVELS,
  FRONTIER_TOTAL_LEVELS,
  GROUND_ROW,
  MIN_CAMERA_WORLD_X,
  STAGES_PER_WORLD,
  TILE,
  TOTAL_LEVELS,
  getStageBiome,
  getWorldLabel,
} from '../engine/biomes';
import type {
  Block,
  BlockContent,
  BlockType,
  Checkpoint,
  CoinEntity,
  Enemy,
  EnemyType,
  FlagpoleGoal,
  FortressBoss,
  GamePartition,
  MovingPlatform,
  Pipe,
  Player,
  PowerState,
  SceneryProp,
  Spring,
  WorldState,
} from '../engine/types';
import { buildSmwWorldState } from './smwLevelBuilder';
import { applyStageMechanic } from '../engine/mechanics';
import { applyStageObjective } from '../engine/objectives';
import { applyStageSecrets } from '../engine/secrets';
import { applyAbilityChallenges } from '../engine/abilities';

const STAGE_TITLES: string[] = [
  // World 1
  'Colinas Esmeralda',
  'Gruta de Cristal',
  'Puentes del Viento',
  'Bastión de Magma I',
  // World 2
  'Dunas del Sol',
  'Cámara Subterránea',
  'Oasis Acrobático',
  'Pirámide de Fuego',
  // World 3
  'Sendero Estelar',
  'Abismo Nocturno',
  'Cumbres de Luna',
  'Torreón Sombrío',
  // World 4
  'Valle Escarchado',
  'Caverna Glacial',
  'Cimas Resbaladizas',
  'Ciudadela Polar',
  // World 5
  'Cañón Dorado',
  'Mina Profunda',
  'Arcos Suspendidos',
  'Forja Volcánica',
  // World 6
  'Cielo Imperial',
  'Laberinto Abisal',
  'Asalto Celestial',
  'Trono del Rey Koopa',
];

// Modo Expedición (original): títulos de sus 20 etapas
const EXP_STAGE_TITLES: string[] = [
  'Bahía de las Burbujas',
  'Bosque de Coral',
  'Lianas Brillantes',
  'Faro Sumergido',
  'Raíces Fosforescentes',
  'Gruta de Amatista',
  'Copa de los Árboles',
  'Templo de las Luciérnagas',
  'Avenida de Pistones',
  'Torre del Reloj',
  'Puertos Flotantes',
  'Fábrica de Vapor',
  'Colinas de Merengue',
  'Puentes de Arcoíris',
  'Muelle de Engranajes',
  'Palacio de Nubes',
  'Laderas de Cuarzo',
  'Mina de Geodas',
  'Cráter Prismático',
  'Corazón del Volcán',
  'Espejo de la Marea',
  'Grutas del Reflujo',
  'Acantilados de Espuma',
  'Faro del Horizonte',
  'Valle de Vidrio',
  'Galería de Reflejos',
  'Cañón de Campanas',
  'Núcleo Vítreo',
];

// Modo Dimensión 3D (original): títulos de sus 16 etapas
const DIM_STAGE_TITLES: string[] = [
  'Pradera de Constelaciones',
  'Invernadero Orbital',
  'Puente de Cometas',
  'Observatorio del Eclipse',
  'Mesa de Bloques',
  'Tren de Cuerda',
  'Repisa de Peluches',
  'Caja de Música Gigante',
  'Bahía de Témpanos',
  'Cielo de Auroras',
  'Faro del Polo',
  'Ciudadela de Hielo',
  'Yunque Plateado',
  'Ríos de Metal',
  'Cráteres Humeantes',
  'Corazón de la Fragua',
  'Vitral de Arcoíris',
  'Pasillo de Espejos',
  'Cúpula de Prismas',
  'Salón del Caleidoscopio',
  'Bosque de Sombreros',
  'Ladera de Esporas',
  'Cumbre del Hongo Blanco',
  'Cueva de Hielo y Setas',
  'Péndulos del Alba',
  'Engranajes Colgantes',
  'Campanario Suspendido',
  'Maquinaria Central',
  'Anillos de Saturno',
  'Lluvia de Meteoros',
  'Horizonte de Sucesos',
  'Corazón del Cosmos',
];

export function gridKey(col: number, row: number): number {
  return row * 1024 + col;
}

export function createInitialPlayer(
  powerState: PowerState = 0,
  mountedYoshi = false
): Player {
  const height = mountedYoshi ? 52 : powerState > 0 ? 46 : 30;
  return {
    x: 2.5 * TILE,
    y: GROUND_ROW * TILE - height,
    vx: 0,
    vy: 0,
    width: 22,
    height,
    powerState,
    onGround: true,
    crouching: false,
    skidding: false,
    facing: 1,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    airJumpsLeft: 0,
    invulnTimer: 0,
    starTimer: 0,
    fireCooldown: 0,
    throwPoseTimer: 0,
    stompCombo: 0,
    animTimer: 0,
    dead: false,
    enteringCastle: false,
    pMeter: 0,
    capeFlying: false,
    capeFlightTimer: 0,
    capeDiveSpeed: 0,
    capeSpinTimer: 0,
    spinJumping: false,
    mountedYoshi,
    yoshiTongueTimer: 0,
    yoshiTonguePhase: 0,
    yoshiMouthItem: 'none',
    berriesEaten: 0,
  };
}

interface BuilderCtx {
  levelIndex: number;
  designIndex: number;
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
  pits: Set<number>;
  lavaCols: Set<number>;
  isFortress: boolean;
  isUnderground: boolean;
  enemySeq: number;
  partition: GamePartition;
}

function putBlock(
  ctx: BuilderCtx,
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

function addCoin(ctx: BuilderCtx, col: number, rowFloat: number): void {
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

function addCoinArc(ctx: BuilderCtx, startCol: number, count: number, peakRow: number): void {
  for (let i = 0; i < count; i++) {
    const norm = count > 1 ? (i / (count - 1)) * 2 - 1 : 0;
    const yRow = peakRow + norm * norm * 1.4;
    addCoin(ctx, startCol + i, yRow);
  }
}

function addPipe(ctx: BuilderCtx, col: number, heightTiles: number, hasPiranha: boolean): void {
  // Ensure ground beneath pipe is never a pit
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
      y: topRow * TILE + 8, // starts hidden inside pipe
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

function addEnemy(ctx: BuilderCtx, col: number, rowAboveBottom: number, type: EnemyType): void {
  // Las balas vuelan a media altura, no por el suelo
  if (type === 'bullet_bill' && rowAboveBottom >= GROUND_ROW - 1) rowAboveBottom = 8;
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
      : type === 'spiny'
      ? 1.25
      : type === 'paratroopa'
      ? 1.15
      : type === 'koopa_red'
      ? 1.2
      : 1.1;
  const vx = -baseSpeed * (type === 'bullet_bill' ? 1 : 1 + (ctx.difficulty - 1) * 0.35);
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

function addSpring(ctx: BuilderCtx, col: number, rowOnTopOf: number): void {
  ctx.springs.push({
    x: col * TILE + 3,
    y: (rowOnTopOf - 1) * TILE + 4,
    width: 26,
    height: 28,
    compressTimer: 0,
  });
}

function addPlatform(
  ctx: BuilderCtx,
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

function carvePit(ctx: BuilderCtx, startCol: number, widthCols: number, asLava = false): void {
  const safeWidth = Math.min(widthCols, 4);
  for (let c = startCol; c < startCol + safeWidth; c++) {
    ctx.pits.add(c);
    if (asLava || ctx.isFortress) {
      ctx.lavaCols.add(c);
    }
  }
}

// ============================================================================
// WORLD ENEMY ROSTERS — each world fields its own mix of foes, so the same
// architectural setpiece plays differently in 1-x than in 5-x.
// ============================================================================
const CLASSIC_ROSTERS: EnemyType[][] = [
  ['goomba', 'goomba', 'koopa_green'], // World 1: Pradera
  ['goomba', 'koopa_red', 'goomba', 'koopa_green'], // World 2: Dunas
  ['koopa_green', 'paratroopa', 'goomba', 'koopa_red'], // World 3: Noche
  ['spiny', 'goomba', 'koopa_red', 'paratroopa'], // World 4: Glaciar
  ['koopa_red', 'spiny', 'paratroopa', 'goomba', 'spiny'], // World 5: Cañón/Mina
  ['spiny', 'koopa_red', 'paratroopa', 'spiny', 'koopa_green'], // World 6: Cielo/Abismo
];

const DIM_ROSTERS: EnemyType[][] = [
  ['galoomba', 'paratroopa', 'koopa_green', 'rex'], // J: Jardín Estelar
  ['goomba', 'rex', 'koopa_red', 'chuck'], // T: Taller de Juguetes
  ['spiny', 'koopa_green', 'paratroopa', 'galoomba'], // P: Polo Aurora
  ['chuck', 'bullet_bill', 'spiny', 'rex', 'koopa_red'], // F: Fragua Lunar
  ['paratroopa', 'galoomba', 'koopa_red', 'bullet_bill'], // G: Galería Prisma
  ['goomba', 'spiny', 'rex', 'koopa_green'], // H: Hongar Nevado
  ['bullet_bill', 'chuck', 'koopa_red', 'paratroopa', 'galoomba'], // R: Relojería Flotante
  ['chuck', 'spiny', 'bullet_bill', 'rex', 'paratroopa', 'koopa_red'], // N: Núcleo Cósmico
];

const EXP_ROSTERS: EnemyType[][] = [
  ['galoomba', 'koopa_green', 'goomba', 'paratroopa'], // A: Arrecife Coral
  ['rex', 'koopa_red', 'galoomba', 'spiny'], // S: Selva Neón
  ['koopa_red', 'bullet_bill', 'chuck', 'galoomba'], // E: Ciudad Engranaje
  ['paratroopa', 'rex', 'koopa_green', 'spiny'], // N: Reino de Algodón
  ['chuck', 'spiny', 'rex', 'bullet_bill', 'koopa_red'], // C: Volcán Cristal
  ['paratroopa', 'galoomba', 'bullet_bill', 'koopa_green'], // M: Marea Espejo
  ['spiny', 'chuck', 'koopa_red', 'rex', 'bullet_bill'], // V: Valle Vítreo
];

/** Next ground foe from the current world's roster (deterministic rotation). */
function foe(ctx: BuilderCtx): EnemyType {
  const rosters =
    ctx.partition === 'expedition' || ctx.partition === 'frontier'
      ? EXP_ROSTERS
      : ctx.partition === 'dimension'
      ? DIM_ROSTERS
      : CLASSIC_ROSTERS;
  const rosterWorld = ctx.partition === 'frontier' ? Math.floor(ctx.designIndex / STAGES_PER_WORLD) : ctx.worldNum - 1;
  const roster = rosters[Math.min(rosters.length - 1, rosterWorld)];
  const type = roster[ctx.enemySeq % roster.length];
  ctx.enemySeq++;
  return type;
}

/** Stage-local variant 0..2 so a repeated setpiece is re-dressed per stage. */
function variantOf(ctx: BuilderCtx, salt: number): number {
  return (ctx.levelIndex * 7 + salt * 3 + ctx.worldNum) % 3;
}

// ============================================================================
// CURATED ARCHITECTURAL SETPIECES (0% random procedural slop!)
// ============================================================================
type SetpieceKind =
  | 'shell_bowling'
  | 'piranha_terrace'
  | 'sky_bridge_paratroopa'
  | 'moving_lift_chasm'
  | 'spring_cliff_vault'
  | 'double_deck_secret'
  | 'pyramid_gauntlet'
  | 'spiny_fire_alley'
  | 'brick_ceiling_run'
  | 'stepping_pillars'
  | 'pipe_maze'
  | 'coin_heaven_spring'
  | 'twin_lifts'
  | 'foe_parade'
  | 'lift_wall'
  | 'hidden_stairway';

function buildSetpiece(ctx: BuilderCtx, kind: SetpieceKind, c: number): number {
  const v = variantOf(ctx, c);
  switch (kind) {
    case 'shell_bowling': {
      // Elevated [?] powerup + Koopa in front of a line of foes for a shell combo!
      const row = v === 2 ? 7 : 8;
      putBlock(ctx, c + 1, row, 'brick');
      putBlock(ctx, c + 2, row, 'question', v === 1 ? 'coin' : 'powerup');
      putBlock(ctx, c + 3, row, v === 1 ? 'question' : 'brick', v === 1 ? 'powerup' : null);
      addEnemy(ctx, c + 4, GROUND_ROW - 1, ctx.worldNum >= 3 ? 'koopa_red' : 'koopa_green');
      addEnemy(ctx, c + 8, GROUND_ROW - 1, foe(ctx));
      addEnemy(ctx, c + 10, GROUND_ROW - 1, 'goomba');
      addEnemy(ctx, c + 12, GROUND_ROW - 1, foe(ctx));
      for (let h = 0; h <= v; h++) putBlock(ctx, c + 14, GROUND_ROW - 1 - h, 'hard');
      addCoinArc(ctx, c + 7, 5, 6.2);
      return 17;
    }

    case 'piranha_terrace': {
      const h = [2, 3, 2][v];
      addPipe(ctx, c + 1, h, v === 2);
      addCoinArc(ctx, c + 3, 3, 7.2);
      addPipe(ctx, c + 6, h + 1, true);
      putBlock(ctx, c + 9, 7, 'question', v === 0 ? 'coin' : 'powerup');
      putBlock(ctx, c + 10, 7, 'brick', 'multi_coin');
      putBlock(ctx, c + 11, 7, 'question', 'coin');
      addEnemy(ctx, c + 10, GROUND_ROW - 1, foe(ctx));
      addPipe(ctx, c + 13, v === 1 ? 2 : 4, true);
      return 17;
    }

    case 'sky_bridge_paratroopa': {
      carvePit(ctx, c + 2, 3);
      carvePit(ctx, c + 8, 3);
      const row = v === 1 ? 7 : 8;
      for (let k = c + 1; k <= c + 11; k++) {
        if (k !== c + 6) putBlock(ctx, k, row, 'bridge');
      }
      putBlock(ctx, c + 6, 4, 'question', v === 2 ? 'star' : 'powerup');
      addCoinArc(ctx, c + 3, 5, 5.2);
      addEnemy(ctx, c + 5, row - 1, 'paratroopa');
      addEnemy(ctx, c + 10, row - 1, foe(ctx));
      return 15;
    }

    case 'moving_lift_chasm': {
      putBlock(ctx, c, 11, 'hard');
      putBlock(ctx, c + 1, 10, 'hard');
      putBlock(ctx, c + 1, 11, 'hard');
      carvePit(ctx, c + 2, 4);
      carvePit(ctx, c + 6, 3);
      addPlatform(ctx, c + 4, 8.5 - v * 0.5, 3 - (v === 2 ? 1 : 0), 2.6, 0, 0.036 + v * 0.004, v);
      addCoinArc(ctx, c + 3, 5, 5.0);
      putBlock(ctx, c + 9, 10, 'hard');
      putBlock(ctx, c + 9, 11, 'hard');
      addEnemy(ctx, c + 11, GROUND_ROW - 1, v === 0 ? 'paratroopa' : foe(ctx));
      return 14;
    }

    case 'spring_cliff_vault': {
      addSpring(ctx, c + 1, GROUND_ROW);
      for (let row = 6; row < GROUND_ROW; row++) {
        putBlock(ctx, c + 4, row, 'hard');
        putBlock(ctx, c + 5, row, 'hard');
      }
      addCoin(ctx, c + 2, 4.5);
      addCoin(ctx, c + 3, 3.5);
      const prize: BlockContent = (['star', 'one_up', 'powerup'] as BlockContent[])[v];
      for (let k = c + 6; k <= c + 10; k++) {
        putBlock(ctx, k, 6, k === c + 8 ? 'question' : 'brick', k === c + 8 ? prize : null);
        addCoin(ctx, k, 4.2);
      }
      addEnemy(ctx, c + 8, GROUND_ROW - 1, foe(ctx));
      addEnemy(ctx, c + 11, GROUND_ROW - 1, foe(ctx));
      return 14;
    }

    case 'double_deck_secret': {
      for (let k = c + 1; k <= c + 7; k++) {
        putBlock(ctx, k, 8, k === c + 4 ? 'question' : 'brick', k === c + 4 ? 'powerup' : null);
      }
      for (let k = c + 2; k <= c + 6; k++) {
        putBlock(ctx, k, 4, k === c + 4 ? 'question' : 'brick', k === c + 4 ? 'one_up' : null);
      }
      if (v > 0) putBlock(ctx, c + 9, 6, 'question', 'multi_coin');
      addEnemy(ctx, c + 5, 7, ctx.worldNum >= 2 ? 'koopa_red' : 'goomba');
      addEnemy(ctx, c + 3, GROUND_ROW - 1, foe(ctx));
      addEnemy(ctx, c + 7, GROUND_ROW - 1, foe(ctx));
      return 11;
    }

    case 'pyramid_gauntlet': {
      const peak = 3 + (v === 2 ? 1 : 0);
      for (let s = 0; s < peak; s++) {
        for (let h = 0; h <= s; h++) putBlock(ctx, c + s, GROUND_ROW - 1 - h, 'hard');
      }
      carvePit(ctx, c + peak, 2 + (v === 1 ? 1 : 0));
      addCoinArc(ctx, c + peak - 1, 4, 5.2);
      const down = c + peak + 2 + (v === 1 ? 1 : 0);
      for (let s = 0; s < peak; s++) {
        for (let h = 0; h <= peak - 1 - s; h++) putBlock(ctx, down + s, GROUND_ROW - 1 - h, 'hard');
      }
      addEnemy(ctx, down + peak + 1, GROUND_ROW - 1, foe(ctx));
      return down + peak + 3 - c;
    }

    case 'spiny_fire_alley': {
      putBlock(ctx, c + 1, 8, 'question', 'powerup');
      putBlock(ctx, c + 2, 8, 'brick');
      putBlock(ctx, c + 3, 8, 'question', 'coin');
      for (let k = c + 5; k <= c + 9; k++) putBlock(ctx, k, 8, 'brick');
      addEnemy(ctx, c + 6, GROUND_ROW - 1, ctx.worldNum >= 2 ? 'spiny' : 'goomba');
      addEnemy(ctx, c + 9, GROUND_ROW - 1, foe(ctx));
      addEnemy(ctx, c + 7, 7, 'goomba');
      if (v === 2) addEnemy(ctx, c + 11, GROUND_ROW - 1, foe(ctx));
      addCoinArc(ctx, c + 5, 5, 5.3);
      return 13;
    }

    case 'brick_ceiling_run': {
      // Long low brick ceiling with a coin lane underneath and foes patrolling it.
      const row = v === 0 ? 8 : 7;
      for (let k = c + 1; k <= c + 11; k++) {
        const isQ = k === c + 3 || k === c + 9;
        putBlock(ctx, k, row, isQ ? 'question' : 'brick', isQ ? (k === c + 3 ? 'powerup' : 'coin') : null);
        if (k % 2 === 0) addCoin(ctx, k, 10.2);
      }
      putBlock(ctx, c + 6, row - 4, 'brick', 'multi_coin');
      addEnemy(ctx, c + 5, GROUND_ROW - 1, foe(ctx));
      addEnemy(ctx, c + 8, GROUND_ROW - 1, foe(ctx));
      if (v !== 1) addEnemy(ctx, c + 7, row - 1, 'goomba');
      return 14;
    }

    case 'stepping_pillars': {
      // Rising/falling stone pillars separated by short pits.
      const heights = [
        [1, 2, 3, 2],
        [2, 3, 2, 1],
        [1, 3, 1, 2],
      ][v];
      let k = c + 1;
      for (let i = 0; i < heights.length; i++) {
        for (let h = 0; h < heights[i]; h++) putBlock(ctx, k, GROUND_ROW - 1 - h, 'hard');
        addCoin(ctx, k, GROUND_ROW - 2.6 - heights[i]);
        if (i < heights.length - 1) carvePit(ctx, k + 1, 2);
        k += 3;
      }
      addEnemy(ctx, k + 1, GROUND_ROW - 1, foe(ctx));
      return k + 3 - c;
    }

    case 'pipe_maze': {
      const hs = [
        [2, 3, 2],
        [3, 2, 3],
        [2, 2, 4],
      ][v];
      addPipe(ctx, c + 1, hs[0], v !== 0);
      addEnemy(ctx, c + 5, GROUND_ROW - 1, foe(ctx));
      putBlock(ctx, c + 5, 7, 'question', 'coin');
      addPipe(ctx, c + 7, hs[1], true);
      addEnemy(ctx, c + 11, GROUND_ROW - 1, foe(ctx));
      putBlock(ctx, c + 10, 8, 'brick');
      putBlock(ctx, c + 11, 8, 'question', v === 1 ? 'one_up' : 'powerup');
      putBlock(ctx, c + 12, 8, 'brick');
      addPipe(ctx, c + 14, hs[2], v === 2);
      return 18;
    }

    case 'coin_heaven_spring': {
      // Spring launch to a high brick walkway packed with coins.
      addSpring(ctx, c + 1, GROUND_ROW);
      const row = 4 - (v === 2 ? 1 : 0);
      for (let k = c + 3; k <= c + 12; k++) {
        putBlock(ctx, k, row, k === c + 8 ? 'question' : 'brick', k === c + 8 ? 'star' : null);
        addCoin(ctx, k, row - 1.5);
      }
      putBlock(ctx, c + 6, 8, 'hidden', v === 0 ? 'one_up' : 'multi_coin');
      addEnemy(ctx, c + 7, GROUND_ROW - 1, foe(ctx));
      addEnemy(ctx, c + 10, GROUND_ROW - 1, foe(ctx));
      return 15;
    }

    case 'twin_lifts': {
      putBlock(ctx, c, 11, 'hard');
      carvePit(ctx, c + 1, 4);
      carvePit(ctx, c + 5, 4);
      addPlatform(ctx, c + 2, 9, 2, 1.6, 0, 0.034, 0);
      addPlatform(ctx, c + 6, 8 - v * 0.5, 2, 0, 1.8, 0.038, 1.4);
      addCoinArc(ctx, c + 2, 6, 5.4);
      putBlock(ctx, c + 4, 4, 'question', v === 1 ? 'one_up' : 'coin');
      addEnemy(ctx, c + 7, 7, 'paratroopa');
      putBlock(ctx, c + 9, 11, 'hard');
      addEnemy(ctx, c + 12, GROUND_ROW - 1, foe(ctx));
      return 14;
    }

    case 'foe_parade': {
      // A marching squad under a brick escape ledge.
      const n = 4 + v;
      for (let i = 0; i < n; i++) addEnemy(ctx, c + 4 + i * 2, GROUND_ROW - 1, foe(ctx));
      for (let k = c + 2; k <= c + 6; k++) {
        putBlock(ctx, k, 8, k === c + 4 ? 'question' : 'brick', k === c + 4 ? 'powerup' : null);
      }
      for (let k = c + 9; k <= c + 12; k++) putBlock(ctx, k, 6, 'brick');
      putBlock(ctx, c + 10, 6, 'brick', 'multi_coin');
      addCoinArc(ctx, c + 9, 4, 4.6);
      return 6 + n * 2;
    }

    case 'lift_wall': {
      // Tall stone wall only scalable with a vertical lift.
      addPlatform(ctx, c + 2, 9, 2, 0, 2.2, 0.035 + v * 0.004, v * 0.8);
      for (let row = 7; row < GROUND_ROW; row++) {
        putBlock(ctx, c + 5, row, 'hard');
        putBlock(ctx, c + 6, row, 'hard');
      }
      addCoin(ctx, c + 5, 5.6);
      addCoin(ctx, c + 6, 5.6);
      putBlock(ctx, c + 9, 8, 'question', v === 2 ? 'star' : 'coin');
      addEnemy(ctx, c + 10, GROUND_ROW - 1, foe(ctx));
      return 13;
    }

    case 'hidden_stairway': {
      // Invisible blocks form a secret stairway up to a 1-UP.
      for (let i = 0; i < 4; i++) putBlock(ctx, c + 2 + i * 2, 9 - i, 'hidden', 'coin');
      putBlock(ctx, c + 8, 2, 'question', 'one_up');
      putBlock(ctx, c + 4, 8, 'brick');
      putBlock(ctx, c + 5, 8, 'question', 'powerup');
      addEnemy(ctx, c + 6, GROUND_ROW - 1, foe(ctx));
      addEnemy(ctx, c + 11, GROUND_ROW - 1, foe(ctx));
      addCoinArc(ctx, c + 7, 4, 7.0);
      return 14;
    }
  }
}

// ============================================================================
// HANDCRAFTED STAGE BUILDERS
// ============================================================================
function buildStage1_1(ctx: BuilderCtx): number {
  const totalCols = 132;
  carvePit(ctx, 42, 2);
  carvePit(ctx, 74, 3);

  // Classic opening: [?] coin, brick/powerup cluster, hidden 1-UP!
  putBlock(ctx, 11, 8, 'question', 'coin');
  putBlock(ctx, 15, 8, 'brick');
  putBlock(ctx, 16, 8, 'question', 'powerup');
  putBlock(ctx, 17, 8, 'brick');
  putBlock(ctx, 18, 8, 'question', 'coin');
  putBlock(ctx, 19, 8, 'brick');
  putBlock(ctx, 17, 4, 'question', 'coin');
  addEnemy(ctx, 17, GROUND_ROW - 1, 'goomba');

  // Escalating Pipes + Piranha introduction
  addPipe(ctx, 23, 2, false);
  addEnemy(ctx, 27, GROUND_ROW - 1, 'goomba');
  addPipe(ctx, 30, 3, false);
  addEnemy(ctx, 34, GROUND_ROW - 1, 'goomba');
  addEnemy(ctx, 36, GROUND_ROW - 1, 'goomba');
  addPipe(ctx, 38, 4, true);

  // Secret 1-UP block right before first gap!
  putBlock(ctx, 40, 7, 'hidden', 'one_up');
  addCoinArc(ctx, 41, 4, 6.2);

  // Shell Bowling Alley
  putBlock(ctx, 48, 8, 'brick');
  putBlock(ctx, 49, 8, 'question', 'powerup');
  putBlock(ctx, 50, 8, 'brick', 'multi_coin');
  addEnemy(ctx, 52, GROUND_ROW - 1, 'koopa_green');
  addEnemy(ctx, 56, GROUND_ROW - 1, 'goomba');
  addEnemy(ctx, 58, GROUND_ROW - 1, 'goomba');
  addEnemy(ctx, 60, GROUND_ROW - 1, 'goomba');

  // Skyway over second pit + Starman block!
  for (let c = 63; c <= 69; c++) {
    putBlock(ctx, c, 4, 'brick');
    addCoin(ctx, c, 2.5);
  }
  putBlock(ctx, 65, 8, 'brick');
  putBlock(ctx, 66, 8, 'question', 'star');
  putBlock(ctx, 67, 8, 'brick');

  // Checkpoint sits around col 70; after pit 74..76:
  addSpring(ctx, 79, GROUND_ROW);
  for (let c = 82; c <= 86; c++) {
    putBlock(ctx, c, 6, c === 84 ? 'question' : 'brick', c === 84 ? 'powerup' : null);
    addCoin(ctx, c, 4.4);
  }
  addEnemy(ctx, 84, GROUND_ROW - 1, 'koopa_red');
  addEnemy(ctx, 89, GROUND_ROW - 1, 'goomba');
  addEnemy(ctx, 91, GROUND_ROW - 1, 'goomba');

  // Twin Staircases
  for (let s = 0; s < 4; s++) {
    for (let h = 0; h <= s; h++) putBlock(ctx, 95 + s, GROUND_ROW - 1 - h, 'hard');
    for (let h = 0; h <= 3 - s; h++) putBlock(ctx, 101 + s, GROUND_ROW - 1 - h, 'hard');
  }
  addPipe(ctx, 107, 2, true);
  addEnemy(ctx, 111, GROUND_ROW - 1, 'koopa_green');

  // Final Flagpole Staircase
  for (let s = 0; s < 8; s++) {
    for (let h = 0; h <= s; h++) {
      putBlock(ctx, 114 + s, GROUND_ROW - 1 - h, 'hard');
    }
  }
  return totalCols;
}

function buildStage1_2(ctx: BuilderCtx): number {
  const totalCols = 136;
  // Underground Cavern Roof with skylight gaps for upper secret run!
  for (let col = 5; col < totalCols - 20; col++) {
    if (col < 32 || col > 36) {
      putBlock(ctx, col, 1, 'brick');
    }
  }

  carvePit(ctx, 22, 3);
  carvePit(ctx, 52, 4);
  carvePit(ctx, 86, 3);

  putBlock(ctx, 10, 8, 'question', 'powerup');
  putBlock(ctx, 11, 8, 'brick');
  putBlock(ctx, 12, 8, 'question', 'coin');
  putBlock(ctx, 13, 8, 'brick', 'multi_coin');
  addEnemy(ctx, 16, GROUND_ROW - 1, 'goomba');
  addEnemy(ctx, 18, GROUND_ROW - 1, 'koopa_green');

  // Stepping islands over chasm 1
  putBlock(ctx, 22, 9, 'hard');
  putBlock(ctx, 24, 7, 'hard');
  addCoinArc(ctx, 21, 5, 5.0);

  // Underground Pipe Gallery + Secret Roof Elevator!
  addPipe(ctx, 28, 3, true);
  addSpring(ctx, 33, GROUND_ROW); // Launches player through roof opening 32..36!
  for (let c = 38; c <= 45; c++) {
    addCoin(ctx, c, 0); // Secret roof coin stash!
  }
  addPipe(ctx, 38, 4, true);
  addEnemy(ctx, 42, GROUND_ROW - 1, 'koopa_red');
  addPipe(ctx, 45, 2, false);

  // Moving Lift over Chasm 2
  addPlatform(ctx, 52, 9, 3, 2.5, 0, 0.038, 0);
  addCoinArc(ctx, 52, 4, 6.2);

  // Three-tier Underground Brick Labyrinth
  for (let c = 60; c <= 68; c++) {
    putBlock(ctx, c, 9, c === 64 ? 'question' : 'brick', c === 64 ? 'powerup' : null);
    if (c >= 61 && c <= 67) {
      putBlock(ctx, c, 5, c === 66 ? 'question' : 'brick', c === 66 ? 'star' : null);
    }
  }
  addEnemy(ctx, 63, 8, 'goomba');
  addEnemy(ctx, 66, GROUND_ROW - 1, 'koopa_green');
  addEnemy(ctx, 73, GROUND_ROW - 1, 'goomba');
  addEnemy(ctx, 75, GROUND_ROW - 1, 'goomba');

  // Paratroopa & Chasm 3
  putBlock(ctx, 86, 8, 'bridge');
  putBlock(ctx, 87, 8, 'bridge');
  putBlock(ctx, 88, 8, 'bridge');
  addEnemy(ctx, 88, 7, 'paratroopa');
  addPipe(ctx, 94, 3, true);
  addEnemy(ctx, 99, GROUND_ROW - 1, 'koopa_red');
  addEnemy(ctx, 103, GROUND_ROW - 1, 'goomba');

  // Exit Ramp
  for (let s = 0; s < 8; s++) {
    for (let h = 0; h <= s; h++) {
      putBlock(ctx, 116 + s, GROUND_ROW - 1 - h, 'hard');
    }
  }
  return totalCols;
}

// ============================================================================
// FORTRESS SECTIONS — every world's castle is assembled from its own route.
// ============================================================================
type FortressSection =
  | 'lava_pillar'
  | 'guard_corridor'
  | 'lift_chasm'
  | 'dual_route'
  | 'vertical_lift'
  | 'lava_staircase'
  | 'cramped_hall'
  | 'pillar_hops'
  | 'supply_room';

function buildFortressSection(ctx: BuilderCtx, kind: FortressSection, c: number): number {
  const w = ctx.worldNum;
  switch (kind) {
    case 'lava_pillar': {
      carvePit(ctx, c + 1, 3, true);
      putBlock(ctx, c + 2, 9, 'hard');
      addCoinArc(ctx, c + 1, 3, 6.5);
      addEnemy(ctx, c + 6, GROUND_ROW - 1, foe(ctx));
      return 8;
    }
    case 'guard_corridor': {
      addEnemy(ctx, c + 1, GROUND_ROW - 1, 'koopa_red');
      addEnemy(ctx, c + 5, GROUND_ROW - 1, w >= 2 ? 'spiny' : 'goomba');
      putBlock(ctx, c + 3, 7, 'question', 'coin');
      putBlock(ctx, c + 4, 7, 'question', w % 2 === 0 ? 'powerup' : 'coin');
      if (w >= 4) addEnemy(ctx, c + 7, GROUND_ROW - 1, foe(ctx));
      return 9;
    }
    case 'lift_chasm': {
      carvePit(ctx, c + 1, 4, true);
      carvePit(ctx, c + 5, 3, true);
      addPlatform(ctx, c + 3, 9, 3, 2.8, 0, 0.036 + w * 0.003, 0.5);
      addCoinArc(ctx, c + 2, 5, 5.8);
      return 10;
    }
    case 'dual_route': {
      carvePit(ctx, c + 2, 4, true);
      for (let k = c + 1; k <= c + 7; k++) {
        putBlock(ctx, k, 8, 'bridge');
        if (k >= c + 3 && k <= c + 5) putBlock(ctx, k, 4, 'brick');
      }
      putBlock(ctx, c + 4, 4, 'question', 'one_up');
      addEnemy(ctx, c + 5, 7, 'paratroopa');
      return 10;
    }
    case 'vertical_lift': {
      carvePit(ctx, c + 1, 4, true);
      addPlatform(ctx, c + 2, 8.5, 2, 0, 2.2, 0.04, 1.2);
      putBlock(ctx, c + 7, 8, 'question', 'powerup');
      addEnemy(ctx, c + 9, GROUND_ROW - 1, foe(ctx));
      return 11;
    }
    case 'lava_staircase': {
      for (let s = 0; s < 3; s++) {
        for (let h = 0; h <= s; h++) putBlock(ctx, c + s, GROUND_ROW - 1 - h, 'hard');
      }
      carvePit(ctx, c + 3, 3, true);
      for (let s = 0; s < 3; s++) {
        for (let h = 0; h <= 2 - s; h++) putBlock(ctx, c + 6 + s, GROUND_ROW - 1 - h, 'hard');
      }
      addCoinArc(ctx, c + 2, 5, 6.0);
      addEnemy(ctx, c + 10, GROUND_ROW - 1, foe(ctx));
      return 12;
    }
    case 'cramped_hall': {
      // Low stone ceiling: foes in tight quarters, prizes embedded overhead.
      for (let k = c; k <= c + 10; k++) {
        const isQ = k === c + 3 || k === c + 8;
        putBlock(ctx, k, 7, isQ ? 'question' : 'hard', isQ ? (k === c + 3 ? 'powerup' : 'coin') : null);
      }
      addEnemy(ctx, c + 5, GROUND_ROW - 1, w >= 3 ? 'spiny' : 'goomba');
      addEnemy(ctx, c + 9, GROUND_ROW - 1, foe(ctx));
      return 13;
    }
    case 'pillar_hops': {
      for (let i = 0; i < 3; i++) {
        const col = c + 1 + i * 3;
        putBlock(ctx, col, 11, 'hard');
        putBlock(ctx, col, 10, 'hard');
        carvePit(ctx, col + 1, 2, true);
        addCoin(ctx, col, 8.4);
      }
      putBlock(ctx, c + 10, 11, 'hard');
      return 13;
    }
    case 'supply_room': {
      putBlock(ctx, c + 1, 8, 'question', 'powerup');
      putBlock(ctx, c + 2, 8, 'question', w >= 4 ? 'one_up' : 'coin');
      addEnemy(ctx, c + 5, GROUND_ROW - 1, 'koopa_red');
      return 8;
    }
  }
}

const FORTRESS_PLANS: FortressSection[][] = [
  ['lava_pillar', 'guard_corridor', 'lift_chasm', 'dual_route', 'vertical_lift', 'supply_room'],
  ['lava_staircase', 'cramped_hall', 'lift_chasm', 'guard_corridor', 'pillar_hops', 'supply_room'],
  ['guard_corridor', 'pillar_hops', 'dual_route', 'lava_staircase', 'vertical_lift', 'supply_room'],
  ['cramped_hall', 'lift_chasm', 'lava_pillar', 'pillar_hops', 'dual_route', 'guard_corridor', 'supply_room'],
  ['pillar_hops', 'vertical_lift', 'cramped_hall', 'lava_staircase', 'lift_chasm', 'guard_corridor', 'supply_room'],
  ['lava_staircase', 'dual_route', 'pillar_hops', 'cramped_hall', 'lift_chasm', 'vertical_lift', 'lava_pillar', 'supply_room'],
];

const EXP_FORTRESS_PLANS: FortressSection[][] = [
  ['pillar_hops', 'lift_chasm', 'guard_corridor', 'dual_route', 'supply_room'],
  ['cramped_hall', 'lava_staircase', 'vertical_lift', 'pillar_hops', 'lava_pillar', 'supply_room'],
  ['lift_chasm', 'dual_route', 'cramped_hall', 'guard_corridor', 'lava_staircase', 'supply_room'],
  ['vertical_lift', 'pillar_hops', 'lift_chasm', 'cramped_hall', 'dual_route', 'lava_pillar', 'supply_room'],
  ['dual_route', 'cramped_hall', 'lava_staircase', 'pillar_hops', 'vertical_lift', 'guard_corridor', 'lift_chasm', 'supply_room'],
  ['vertical_lift', 'dual_route', 'pillar_hops', 'guard_corridor', 'lava_staircase', 'supply_room'],
  ['lava_pillar', 'lift_chasm', 'cramped_hall', 'vertical_lift', 'dual_route', 'guard_corridor', 'supply_room'],
];

const DIM_FORTRESS_PLANS: FortressSection[][] = [
  ['lift_chasm', 'cramped_hall', 'pillar_hops', 'dual_route', 'supply_room'],
  ['guard_corridor', 'vertical_lift', 'lava_staircase', 'lift_chasm', 'supply_room'],
  ['pillar_hops', 'dual_route', 'lava_pillar', 'cramped_hall', 'vertical_lift', 'supply_room'],
  ['lava_staircase', 'lift_chasm', 'guard_corridor', 'pillar_hops', 'dual_route', 'cramped_hall', 'supply_room'],
  ['vertical_lift', 'lava_pillar', 'dual_route', 'pillar_hops', 'cramped_hall', 'supply_room'],
  ['cramped_hall', 'lift_chasm', 'lava_staircase', 'guard_corridor', 'vertical_lift', 'pillar_hops', 'supply_room'],
  ['dual_route', 'pillar_hops', 'vertical_lift', 'lift_chasm', 'lava_staircase', 'cramped_hall', 'supply_room'],
  ['pillar_hops', 'lava_staircase', 'cramped_hall', 'lift_chasm', 'dual_route', 'vertical_lift', 'guard_corridor', 'lava_pillar', 'supply_room'],
];

function buildFortressStage(ctx: BuilderCtx): { totalCols: number; boss: FortressBoss } {
  // Opening hall + powerup
  putBlock(ctx, 9, 8, 'brick');
  putBlock(ctx, 10, 8, 'question', 'powerup');
  putBlock(ctx, 11, 8, 'brick');
  addEnemy(ctx, 15, GROUND_ROW - 1, foe(ctx));

  const plans =
    ctx.partition === 'expedition' || ctx.partition === 'frontier'
      ? EXP_FORTRESS_PLANS
      : ctx.partition === 'dimension'
      ? DIM_FORTRESS_PLANS
      : FORTRESS_PLANS;
  const planWorld = ctx.partition === 'frontier' ? Math.floor(ctx.designIndex / STAGES_PER_WORLD) : ctx.worldNum - 1;
  const plan = plans[Math.min(plans.length - 1, planWorld)];
  let cursor = 18;
  for (const section of plan) {
    cursor += buildFortressSection(ctx, section, cursor) + 2;
  }

  const totalCols = cursor + 36;

  // Ceiling masonry
  for (let col = 0; col < totalCols; col++) {
    if (!ctx.blockGrid.has(gridKey(col, 0))) putBlock(ctx, col, 0, 'hard');
  }

  // =========================================================================
  // REY KOOPA BOSS ARENA! Suspended Bridge over Wide Magma Pool + Golden Axe!
  // =========================================================================
  const arenaStart = totalCols - 32;
  const bridgeStart = arenaStart + 4;
  const bridgeLen = 13;
  const bridgeCols: number[] = [];

  // Approach steps
  putBlock(ctx, arenaStart + 2, 11, 'hard');
  putBlock(ctx, arenaStart + 3, 10, 'hard');
  putBlock(ctx, arenaStart + 3, 11, 'hard');

  // Upper floating blocks above bridge (strategic high-jump escape route!)
  for (let k = 0; k < 5; k++) {
    putBlock(ctx, bridgeStart + 3 + k, 5, 'hard');
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

  const maxHp = 5 + ctx.worldNum * 2; // 7 HP in 1-4 up to 17 HP in 6-4
  const boss: FortressBoss = {
    x: (bridgeStart + 8) * TILE,
    y: 10 * TILE - 60,
    homeX: (bridgeStart + 8) * TILE,
    vx: -1.1,
    vy: 0,
    width: 56,
    height: 60,
    hp: maxHp,
    maxHp,
    facing: -1,
    onGround: false,
    jumpTimer: 75,
    fireTimer: 95,
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

// One hand-picked route per stage (keyed by level index). No two stages share
// a plan, and each world's foe roster re-dresses every setpiece it uses.
const STAGE_PLANS: Record<number, SetpieceKind[]> = {
  // World 1
  2: ['sky_bridge_paratroopa', 'stepping_pillars', 'shell_bowling', 'moving_lift_chasm', 'coin_heaven_spring'],
  // World 2
  4: ['pipe_maze', 'foe_parade', 'pyramid_gauntlet', 'spring_cliff_vault', 'piranha_terrace'],
  5: ['brick_ceiling_run', 'double_deck_secret', 'pipe_maze', 'hidden_stairway', 'stepping_pillars'],
  6: ['twin_lifts', 'shell_bowling', 'lift_wall', 'sky_bridge_paratroopa', 'pyramid_gauntlet', 'foe_parade'],
  // World 3
  8: ['coin_heaven_spring', 'spiny_fire_alley', 'twin_lifts', 'piranha_terrace', 'stepping_pillars'],
  9: ['hidden_stairway', 'brick_ceiling_run', 'moving_lift_chasm', 'foe_parade', 'double_deck_secret'],
  10: ['stepping_pillars', 'sky_bridge_paratroopa', 'lift_wall', 'twin_lifts', 'spring_cliff_vault', 'shell_bowling'],
  // World 4
  12: ['foe_parade', 'lift_wall', 'piranha_terrace', 'pyramid_gauntlet', 'hidden_stairway', 'spiny_fire_alley'],
  13: ['double_deck_secret', 'twin_lifts', 'brick_ceiling_run', 'spring_cliff_vault', 'pipe_maze'],
  14: ['moving_lift_chasm', 'stepping_pillars', 'coin_heaven_spring', 'sky_bridge_paratroopa', 'foe_parade', 'lift_wall'],
  // World 5
  16: ['spring_cliff_vault', 'pyramid_gauntlet', 'twin_lifts', 'shell_bowling', 'piranha_terrace', 'stepping_pillars'],
  17: ['pipe_maze', 'hidden_stairway', 'spiny_fire_alley', 'lift_wall', 'brick_ceiling_run', 'moving_lift_chasm'],
  18: ['brick_ceiling_run', 'foe_parade', 'double_deck_secret', 'twin_lifts', 'coin_heaven_spring', 'pyramid_gauntlet'],
  // World 6
  20: ['lift_wall', 'sky_bridge_paratroopa', 'foe_parade', 'stepping_pillars', 'twin_lifts', 'spiny_fire_alley', 'piranha_terrace'],
  21: ['spiny_fire_alley', 'pipe_maze', 'moving_lift_chasm', 'hidden_stairway', 'pyramid_gauntlet', 'brick_ceiling_run', 'shell_bowling'],
  22: ['twin_lifts', 'coin_heaven_spring', 'lift_wall', 'foe_parade', 'sky_bridge_paratroopa', 'stepping_pillars', 'double_deck_secret'],
};

// Modo Expedición: un plan propio por etapa (no se repite con ningún otro)
const EXP_STAGE_PLANS: Record<number, SetpieceKind[]> = {
  // A: Arrecife Coral
  0: ['foe_parade', 'stepping_pillars', 'coin_heaven_spring', 'shell_bowling'],
  1: ['twin_lifts', 'hidden_stairway', 'pipe_maze', 'sky_bridge_paratroopa', 'double_deck_secret'],
  2: ['lift_wall', 'foe_parade', 'moving_lift_chasm', 'brick_ceiling_run', 'stepping_pillars'],
  // S: Selva Neón
  4: ['brick_ceiling_run', 'twin_lifts', 'spiny_fire_alley', 'lift_wall', 'coin_heaven_spring'],
  5: ['hidden_stairway', 'pyramid_gauntlet', 'double_deck_secret', 'pipe_maze', 'moving_lift_chasm', 'foe_parade'],
  6: ['sky_bridge_paratroopa', 'coin_heaven_spring', 'stepping_pillars', 'twin_lifts', 'spring_cliff_vault'],
  // E: Ciudad Engranaje
  8: ['pipe_maze', 'lift_wall', 'shell_bowling', 'moving_lift_chasm', 'hidden_stairway', 'pyramid_gauntlet'],
  9: ['spring_cliff_vault', 'brick_ceiling_run', 'twin_lifts', 'foe_parade', 'piranha_terrace'],
  10: ['double_deck_secret', 'sky_bridge_paratroopa', 'lift_wall', 'stepping_pillars', 'spiny_fire_alley', 'twin_lifts'],
  // N: Reino de Algodón
  12: ['coin_heaven_spring', 'moving_lift_chasm', 'foe_parade', 'pyramid_gauntlet', 'sky_bridge_paratroopa', 'hidden_stairway'],
  13: ['stepping_pillars', 'piranha_terrace', 'twin_lifts', 'brick_ceiling_run', 'lift_wall', 'shell_bowling'],
  14: ['spiny_fire_alley', 'double_deck_secret', 'coin_heaven_spring', 'pipe_maze', 'twin_lifts', 'stepping_pillars'],
  // C: Volcán Cristal
  16: ['lift_wall', 'pyramid_gauntlet', 'foe_parade', 'twin_lifts', 'piranha_terrace', 'brick_ceiling_run', 'hidden_stairway'],
  17: ['moving_lift_chasm', 'spring_cliff_vault', 'spiny_fire_alley', 'stepping_pillars', 'double_deck_secret', 'lift_wall'],
  18: ['twin_lifts', 'shell_bowling', 'hidden_stairway', 'sky_bridge_paratroopa', 'pyramid_gauntlet', 'coin_heaven_spring', 'foe_parade'],
  // M: Marea Espejo — long sightlines, mirrored routes, and airborne timing
  20: ['sky_bridge_paratroopa', 'double_deck_secret', 'moving_lift_chasm', 'coin_heaven_spring', 'foe_parade'],
  21: ['pipe_maze', 'twin_lifts', 'hidden_stairway', 'spring_cliff_vault', 'shell_bowling', 'lift_wall'],
  22: ['stepping_pillars', 'piranha_terrace', 'brick_ceiling_run', 'sky_bridge_paratroopa', 'spiny_fire_alley', 'coin_heaven_spring'],
  // V: Valle Vítreo — tighter hazards, vertical climbs, and a final gauntlet
  24: ['lift_wall', 'pyramid_gauntlet', 'moving_lift_chasm', 'double_deck_secret', 'foe_parade', 'twin_lifts'],
  25: ['brick_ceiling_run', 'spiny_fire_alley', 'pipe_maze', 'hidden_stairway', 'sky_bridge_paratroopa', 'spring_cliff_vault'],
  26: ['piranha_terrace', 'shell_bowling', 'stepping_pillars', 'lift_wall', 'coin_heaven_spring', 'pyramid_gauntlet', 'moving_lift_chasm'],
};

// Modo Dimensión 3D: un plan propio por etapa
const DIM_STAGE_PLANS: Record<number, SetpieceKind[]> = {
  // J: Jardín Estelar
  0: ['stepping_pillars', 'coin_heaven_spring', 'foe_parade', 'twin_lifts'],
  1: ['sky_bridge_paratroopa', 'lift_wall', 'hidden_stairway', 'pyramid_gauntlet', 'brick_ceiling_run'],
  2: ['twin_lifts', 'double_deck_secret', 'moving_lift_chasm', 'stepping_pillars', 'spring_cliff_vault'],
  // T: Taller de Juguetes
  4: ['pipe_maze', 'foe_parade', 'coin_heaven_spring', 'shell_bowling', 'lift_wall'],
  5: ['brick_ceiling_run', 'spring_cliff_vault', 'twin_lifts', 'hidden_stairway', 'piranha_terrace', 'stepping_pillars'],
  6: ['double_deck_secret', 'pyramid_gauntlet', 'pipe_maze', 'sky_bridge_paratroopa', 'foe_parade'],
  // P: Polo Aurora
  8: ['moving_lift_chasm', 'spiny_fire_alley', 'stepping_pillars', 'coin_heaven_spring', 'twin_lifts', 'hidden_stairway'],
  9: ['lift_wall', 'shell_bowling', 'sky_bridge_paratroopa', 'brick_ceiling_run', 'pyramid_gauntlet'],
  10: ['twin_lifts', 'foe_parade', 'double_deck_secret', 'lift_wall', 'spiny_fire_alley', 'moving_lift_chasm'],
  // F: Fragua Lunar
  12: ['pyramid_gauntlet', 'pipe_maze', 'twin_lifts', 'stepping_pillars', 'piranha_terrace', 'foe_parade'],
  13: ['spiny_fire_alley', 'lift_wall', 'hidden_stairway', 'moving_lift_chasm', 'shell_bowling', 'coin_heaven_spring', 'brick_ceiling_run'],
  14: ['sky_bridge_paratroopa', 'twin_lifts', 'spring_cliff_vault', 'double_deck_secret', 'pyramid_gauntlet', 'lift_wall', 'stepping_pillars'],
  // G: Galería Prisma
  16: ['hidden_stairway', 'twin_lifts', 'brick_ceiling_run', 'moving_lift_chasm', 'coin_heaven_spring'],
  17: ['double_deck_secret', 'lift_wall', 'foe_parade', 'twin_lifts', 'spiny_fire_alley', 'stepping_pillars'],
  18: ['moving_lift_chasm', 'pipe_maze', 'sky_bridge_paratroopa', 'hidden_stairway', 'twin_lifts', 'pyramid_gauntlet'],
  // H: Hongar Nevado
  20: ['brick_ceiling_run', 'shell_bowling', 'stepping_pillars', 'spring_cliff_vault', 'foe_parade', 'double_deck_secret'],
  21: ['coin_heaven_spring', 'pyramid_gauntlet', 'lift_wall', 'brick_ceiling_run', 'piranha_terrace', 'twin_lifts'],
  22: ['foe_parade', 'hidden_stairway', 'double_deck_secret', 'pipe_maze', 'stepping_pillars', 'spiny_fire_alley', 'moving_lift_chasm'],
  // R: Relojería Flotante
  24: ['twin_lifts', 'stepping_pillars', 'lift_wall', 'moving_lift_chasm', 'sky_bridge_paratroopa', 'coin_heaven_spring'],
  25: ['pipe_maze', 'twin_lifts', 'spiny_fire_alley', 'stepping_pillars', 'hidden_stairway', 'lift_wall', 'shell_bowling'],
  26: ['spring_cliff_vault', 'moving_lift_chasm', 'brick_ceiling_run', 'twin_lifts', 'pyramid_gauntlet', 'foe_parade', 'double_deck_secret'],
  // N: Núcleo Cósmico
  28: ['lift_wall', 'twin_lifts', 'piranha_terrace', 'stepping_pillars', 'spiny_fire_alley', 'coin_heaven_spring', 'moving_lift_chasm'],
  29: ['shell_bowling', 'sky_bridge_paratroopa', 'hidden_stairway', 'twin_lifts', 'foe_parade', 'pyramid_gauntlet', 'lift_wall'],
  30: ['moving_lift_chasm', 'double_deck_secret', 'stepping_pillars', 'pipe_maze', 'twin_lifts', 'brick_ceiling_run', 'spring_cliff_vault', 'spiny_fire_alley'],
};

function buildCuratedWorldStage(ctx: BuilderCtx): number {
  const seq =
    ctx.partition === 'expedition'
      ? EXP_STAGE_PLANS[ctx.designIndex] ?? EXP_STAGE_PLANS[0]
      : ctx.partition === 'frontier'
      ? EXP_STAGE_PLANS[ctx.designIndex] ?? EXP_STAGE_PLANS[20]
      : ctx.partition === 'dimension'
      ? DIM_STAGE_PLANS[ctx.levelIndex] ?? DIM_STAGE_PLANS[0]
      : STAGE_PLANS[ctx.levelIndex] ?? STAGE_PLANS[2];
  let cursor = 11;

  // Welcoming starter block
  putBlock(ctx, 9, 8, 'question', ctx.levelIndex % 3 === 0 ? 'powerup' : 'coin');

  for (let i = 0; i < seq.length; i++) {
    const advance = buildSetpiece(ctx, seq[i], cursor);
    cursor += advance + 3;
    // Leave clean flat plaza around midpoint for the Checkpoint Pennant!
    if (i === Math.floor(seq.length / 2) - 1) {
      cursor += 5;
    }
  }

  // Final Flagpole Staircase
  const stairStart = cursor + 2;
  for (let s = 0; s < 8; s++) {
    for (let h = 0; h <= s; h++) {
      putBlock(ctx, stairStart + s, GROUND_ROW - 1 - h, 'hard');
    }
  }
  const totalCols = stairStart + 20;

  // Underground stages get a brick roof (with skylights) like 1-2.
  if (ctx.isUnderground) {
    for (let col = 5; col < stairStart - 2; col++) {
      if (col % 23 > 3 && !ctx.blockGrid.has(gridKey(col, 1))) putBlock(ctx, col, 1, 'brick');
    }
  }

  return totalCols;
}

export function buildWorldState(
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
  },
  partition: GamePartition = 'classic'
): WorldState {
  if (partition === 'smw') {
    return applyStageObjective(
      applyAbilityChallenges(
        applyStageSecrets(applyStageMechanic(buildSmwWorldState(levelIndex, carryState)))
      )
    );
  }
  // Clásico, Expedición, Mundo 5 y Dimensión comparten este constructor
  const isGenerated = partition === 'expedition' || partition === 'frontier' || partition === 'dimension';
  const ownPartition: GamePartition = isGenerated ? partition : 'classic';
  const totalStages =
    partition === 'expedition'
      ? EXP_TOTAL_LEVELS
      : partition === 'frontier'
      ? FRONTIER_TOTAL_LEVELS
      : partition === 'dimension'
      ? DIM_TOTAL_LEVELS
      : TOTAL_LEVELS;
  const clampedIdx = Math.max(0, Math.min(levelIndex, totalStages - 1));
  const worldNum = Math.floor(clampedIdx / STAGES_PER_WORLD) + 1;
  const stageNum = (clampedIdx % STAGES_PER_WORLD) + 1;
  const biomeId = getStageBiome(clampedIdx, ownPartition);
  const biome = BIOMES[biomeId];

  const ctx: BuilderCtx = {
    levelIndex: clampedIdx,
    designIndex: partition === 'frontier' ? clampedIdx + 20 : clampedIdx,
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
    pits: new Set<number>(),
    lavaCols: new Set<number>(),
    isFortress: biomeId === 'fortress',
    isUnderground: biome.underground,
    enemySeq: 0,
    partition: ownPartition,
  };

  let totalCols = 132;
  let boss: FortressBoss | null = null;

  if (stageNum === 4) {
    const built = buildFortressStage(ctx);
    totalCols = built.totalCols;
    boss = built.boss;
  } else if (!isGenerated && clampedIdx === 0) {
    totalCols = buildStage1_1(ctx);
  } else if (!isGenerated && clampedIdx === 1) {
    totalCols = buildStage1_2(ctx);
  } else {
    totalCols = buildCuratedWorldStage(ctx);
  }

  // Never allow pits in spawn zone (cols 0..8) or goal castle zone (last 10 cols)
  for (let c = 0; c <= 8; c++) {
    ctx.pits.delete(c);
    ctx.lavaCols.delete(c);
  }
  for (let c = totalCols - 10; c < totalCols; c++) {
    ctx.pits.delete(c);
    ctx.lavaCols.delete(c);
  }

  // Build ground rows (row 12 = ground_top, row 13 = ground_deep)
  for (let col = 0; col < totalCols; col++) {
    if (!ctx.pits.has(col)) {
      putBlock(ctx, col, GROUND_ROW, 'ground_top');
      putBlock(ctx, col, GROUND_ROW + 1, 'ground_deep');
    }
  }

  // Sanitize enemy spawns: ensure ground-walking enemies never start directly over a pit or inside a block
  ctx.enemies = ctx.enemies.filter((en) => {
    if (en.type === 'piranha') return true;
    const col = Math.floor(en.x / TILE);
    const row = Math.floor((en.y + en.height - 2) / TILE);
    if (ctx.blockGrid.has(gridKey(col, row))) return false;
    if (row === GROUND_ROW - 1 && ctx.pits.has(col)) return false;
    return true;
  });

  // Place Mid-Stage Checkpoint Pennant on solid ground around 50% of stage!
  let checkpointCol = Math.floor(totalCols * 0.5);
  for (let offset = 0; offset < 18; offset++) {
    const tryCol = checkpointCol + (offset % 2 === 0 ? offset >> 1 : -(offset >> 1));
    const pipeBlocked = ctx.pipes.some(
      (p) => Math.abs(p.x - tryCol * TILE) < TILE * 2
    );
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

  // Parallax Scenery Props (start at i=-1 so negative left camera has seamless hills & clouds!)
  const sceneries: SceneryProp[] = [];
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
        x: i * 220 + 40,
        y: 36 + (Math.abs(i) % 3) * 26,
        scale: (Math.abs(i) % 2) + 1,
        parallax: 0.35,
      });
      sceneries.push({
        kind: biomeId === 'desert' ? 'dune' : biomeId === 'glacier' ? 'pine' : 'hill',
        x: i * 260 + 20,
        y: GROUND_ROW * TILE,
        scale: (Math.abs(i) % 2) + 1,
        parallax: 0.65,
      });
      sceneries.push({
        kind: 'bush',
        x: i * 260 + 165,
        y: GROUND_ROW * TILE,
        scale: (Math.abs(i) % 3) + 1,
        parallax: 1.0,
      });
    }
  }

  // Flagpole Goal (Stages 1-3 of each world; Stage 4 ends with Rey Koopa's Golden Axe & Castle!)
  let flagpole: FlagpoleGoal | null = null;
  if (stageNum !== 4) {
    const flagCol = totalCols - 9;
    flagpole = {
      x: flagCol * TILE + 10,
      y: 3 * TILE,
      width: 12,
      height: 9 * TILE,
      flagY: 3 * TILE + 10,
      castleX: (flagCol + 3.5) * TILE,
      castleY: GROUND_ROW * TILE - 128,
    };
  }

  const player = createInitialPlayer(carryState?.powerState ?? 0, false);
  if (alreadyAtCheckpoint && carryState?.checkpointX != null) {
    player.x = carryState.checkpointX;
    player.y = GROUND_ROW * TILE - player.height;
  }

  // Start camera with generous left safe zone so Plomero NEVER sits behind the left D-Pad!
  const startCameraX = Math.max(MIN_CAMERA_WORLD_X, player.x - 304);

  return applyStageObjective(applyAbilityChallenges(applyStageSecrets(applyStageMechanic({
    partition: ownPartition,
    totalStagesInPartition: totalStages,
    status: 'playing',
    levelIndex: clampedIdx,
    worldLabel: getWorldLabel(clampedIdx, ctx.partition),
    stageTitle:
      (partition === 'dimension'
        ? DIM_STAGE_TITLES
        : partition === 'frontier'
        ? EXP_STAGE_TITLES.slice(20)
        : isGenerated
        ? EXP_STAGE_TITLES
        : STAGE_TITLES)[clampedIdx] ??
      `Etapa ${getWorldLabel(clampedIdx, ctx.partition)}`,
    biomeId,
    totalCols,
    score: carryState?.score ?? 0,
    highScore: carryState?.highScore ?? 0,
    coins: carryState?.coins ?? 0,
    lives: carryState?.lives ?? 3,
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
    dragonCoins: [],
    dragonCoinsCollected: 0,
    berries: [],
    fireballs: [],
    coinsList: ctx.coins,
    particles: [],
    floatingTexts: [],
    sceneries,
    lavaCols: ctx.lavaCols,
    flagpole,
    goalTape: null,
    prevJumpHeld: false,
    prevFireHeld: false,
    prevSpinHeld: false,
    doubleJumpAssist: carryState?.doubleJumpAssist ?? false,
    nextEntityId: ctx.nextId,
  }))));
}
