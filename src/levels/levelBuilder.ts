import {
  BIOMES,
  GROUND_ROW,
  STAGES_PER_WORLD,
  TILE,
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
  MovingPlatform,
  Pipe,
  Player,
  PowerState,
  SceneryProp,
  Spring,
  WorldState,
} from '../engine/types';

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

export function gridKey(col: number, row: number): number {
  return row * 1024 + col;
}

export function createInitialPlayer(powerState: PowerState = 0): Player {
  const height = powerState > 0 ? 46 : 30;
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
  };
}

interface BuilderCtx {
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
  pits: Set<number>;
  lavaCols: Set<number>;
  isFortress: boolean;
  isUnderground: boolean;
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
      stateTimer: (col * 17) % 90,
      kickGraceTimer: 0,
      shellCombo: 0,
      animTimer: 0,
      active: false,
    });
  }
}

function addEnemy(ctx: BuilderCtx, col: number, rowAboveBottom: number, type: EnemyType): void {
  const isTall = type === 'koopa_green' || type === 'koopa_red' || type === 'paratroopa';
  const height = isTall ? 38 : 28;
  const width = 26;
  const baseSpeed =
    type === 'spiny' ? 1.25 : type === 'paratroopa' ? 1.15 : type === 'koopa_red' ? 1.2 : 1.1;
  const vx = -baseSpeed * (1 + (ctx.difficulty - 1) * 0.35);
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
  | 'spiny_fire_alley';

function buildSetpiece(ctx: BuilderCtx, kind: SetpieceKind, c: number): number {
  switch (kind) {
    case 'shell_bowling': {
      // Elevated [?] powerup + Green Koopa in front of 3 Goombas for satisfying shell combo!
      putBlock(ctx, c + 1, 8, 'brick');
      putBlock(ctx, c + 2, 8, 'question', 'powerup');
      putBlock(ctx, c + 3, 8, 'brick');
      addEnemy(ctx, c + 4, GROUND_ROW - 1, 'koopa_green');
      addEnemy(ctx, c + 8, GROUND_ROW - 1, 'goomba');
      addEnemy(ctx, c + 10, GROUND_ROW - 1, 'goomba');
      addEnemy(ctx, c + 12, GROUND_ROW - 1, 'goomba');
      putBlock(ctx, c + 14, 9, 'hard');
      putBlock(ctx, c + 14, 10, 'hard');
      putBlock(ctx, c + 14, 11, 'hard');
      addCoinArc(ctx, c + 7, 5, 6.2);
      return 17;
    }

    case 'piranha_terrace': {
      addPipe(ctx, c + 1, 2, false);
      addCoinArc(ctx, c + 3, 3, 7.2);
      addPipe(ctx, c + 6, 3, true);
      putBlock(ctx, c + 9, 7, 'question', 'coin');
      putBlock(ctx, c + 10, 7, 'brick', 'multi_coin');
      putBlock(ctx, c + 11, 7, 'question', 'coin');
      addEnemy(ctx, c + 10, GROUND_ROW - 1, 'koopa_red');
      addPipe(ctx, c + 13, 4, true);
      return 17;
    }

    case 'sky_bridge_paratroopa': {
      carvePit(ctx, c + 2, 3);
      carvePit(ctx, c + 8, 3);
      for (let k = c + 1; k <= c + 11; k++) {
        if (k !== c + 6) {
          putBlock(ctx, k, 8, 'bridge');
        }
      }
      putBlock(ctx, c + 6, 4, 'question', 'powerup');
      addCoinArc(ctx, c + 3, 5, 5.2);
      addEnemy(ctx, c + 5, 7, 'paratroopa');
      addEnemy(ctx, c + 10, 7, 'koopa_red');
      return 15;
    }

    case 'moving_lift_chasm': {
      putBlock(ctx, c, 11, 'hard');
      putBlock(ctx, c + 1, 10, 'hard');
      putBlock(ctx, c + 1, 11, 'hard');
      carvePit(ctx, c + 2, 4);
      carvePit(ctx, c + 6, 3);
      addPlatform(ctx, c + 4, 8.5, 3, 2.6, 0, 0.036, 0);
      addCoinArc(ctx, c + 3, 5, 5.0);
      putBlock(ctx, c + 9, 10, 'hard');
      putBlock(ctx, c + 9, 11, 'hard');
      addEnemy(ctx, c + 11, GROUND_ROW - 1, 'paratroopa');
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
      for (let k = c + 6; k <= c + 10; k++) {
        putBlock(ctx, k, 6, k === c + 8 ? 'question' : 'brick', k === c + 8 ? 'star' : null);
        addCoin(ctx, k, 4.2);
      }
      addEnemy(ctx, c + 8, GROUND_ROW - 1, 'koopa_green');
      addEnemy(ctx, c + 11, GROUND_ROW - 1, 'goomba');
      return 14;
    }

    case 'double_deck_secret': {
      for (let k = c + 1; k <= c + 7; k++) {
        putBlock(
          ctx,
          k,
          8,
          k === c + 4 ? 'question' : 'brick',
          k === c + 4 ? 'powerup' : null
        );
      }
      for (let k = c + 2; k <= c + 6; k++) {
        putBlock(
          ctx,
          k,
          4,
          k === c + 4 ? 'question' : 'brick',
          k === c + 4 ? 'one_up' : null
        );
      }
      addEnemy(ctx, c + 5, 7, 'koopa_red');
      addEnemy(ctx, c + 3, GROUND_ROW - 1, 'goomba');
      addEnemy(ctx, c + 7, GROUND_ROW - 1, 'goomba');
      return 11;
    }

    case 'pyramid_gauntlet': {
      for (let s = 0; s < 4; s++) {
        for (let h = 0; h <= s; h++) {
          putBlock(ctx, c + s, GROUND_ROW - 1 - h, 'hard');
        }
      }
      carvePit(ctx, c + 4, 2);
      addCoinArc(ctx, c + 3, 4, 5.2);
      for (let s = 0; s < 4; s++) {
        for (let h = 0; h <= 3 - s; h++) {
          putBlock(ctx, c + 6 + s, GROUND_ROW - 1 - h, 'hard');
        }
      }
      addEnemy(ctx, c + 11, GROUND_ROW - 1, 'koopa_green');
      return 13;
    }

    case 'spiny_fire_alley': {
      putBlock(ctx, c + 1, 8, 'question', 'powerup');
      putBlock(ctx, c + 2, 8, 'brick');
      putBlock(ctx, c + 3, 8, 'question', 'coin');
      for (let k = c + 5; k <= c + 9; k++) {
        putBlock(ctx, k, 8, 'brick');
      }
      addEnemy(ctx, c + 6, GROUND_ROW - 1, ctx.worldNum >= 2 ? 'spiny' : 'goomba');
      addEnemy(ctx, c + 9, GROUND_ROW - 1, 'koopa_green');
      addEnemy(ctx, c + 7, 7, 'goomba');
      addCoinArc(ctx, c + 5, 5, 5.3);
      return 13;
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

function buildFortressStage(ctx: BuilderCtx): { totalCols: number; boss: FortressBoss } {
  const totalCols = 132 + ctx.worldNum * 4;

  // Ceiling masonry
  for (let col = 0; col < totalCols; col++) {
    putBlock(ctx, col, 0, 'hard');
  }

  // Opening Fortress Hall + Powerup
  putBlock(ctx, 9, 8, 'brick');
  putBlock(ctx, 10, 8, 'question', 'powerup');
  putBlock(ctx, 11, 8, 'brick');
  addEnemy(ctx, 15, GROUND_ROW - 1, 'goomba');

  // Lava Pit 1 with Stone Pillars
  carvePit(ctx, 19, 3, true);
  putBlock(ctx, 20, 9, 'hard');
  addCoinArc(ctx, 19, 3, 6.5);

  // Guarded Corridor
  addEnemy(ctx, 26, GROUND_ROW - 1, 'koopa_red');
  if (ctx.worldNum >= 2) {
    addEnemy(ctx, 30, GROUND_ROW - 1, 'spiny');
  } else {
    addEnemy(ctx, 30, GROUND_ROW - 1, 'goomba');
  }
  putBlock(ctx, 28, 7, 'question', 'coin');
  putBlock(ctx, 29, 7, 'question', 'coin');

  // Lava Chasm 2 with Moving Iron Lift
  carvePit(ctx, 35, 4, true);
  carvePit(ctx, 39, 3, true);
  addPlatform(ctx, 37, 9, 3, 2.8, 0, 0.036 + ctx.worldNum * 0.003, 0.5);
  addCoinArc(ctx, 36, 5, 5.8);

  // Mid Fortress Gauntlet (Checkpoint placed around col 50)
  putBlock(ctx, 46, 8, 'question', 'powerup');
  addEnemy(ctx, 55, GROUND_ROW - 1, 'koopa_green');
  addEnemy(ctx, 59, GROUND_ROW - 1, ctx.worldNum >= 2 ? 'spiny' : 'goomba');

  // Dual Route over Lava Pit 3
  carvePit(ctx, 64, 4, true);
  for (let c = 63; c <= 69; c++) {
    putBlock(ctx, c, 8, 'bridge');
    if (c >= 65 && c <= 67) putBlock(ctx, c, 4, 'brick');
  }
  putBlock(ctx, 66, 4, 'question', 'one_up');
  addEnemy(ctx, 67, 7, 'paratroopa');

  // Pre-Boss Supply Room + Vertical Synced Lift
  carvePit(ctx, 76, 4, true);
  addPlatform(ctx, 77, 8.5, 2, 0, 2.2, 0.04, 1.2);
  putBlock(ctx, 85, 8, 'question', 'powerup');
  putBlock(ctx, 86, 8, 'question', 'coin');
  addEnemy(ctx, 89, GROUND_ROW - 1, 'koopa_red');

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

function buildCuratedWorldStage(ctx: BuilderCtx): number {
  // Deterministic sequence of varied architectural setpieces per stage!
  const blueprints: SetpieceKind[][] = [
    ['piranha_terrace', 'shell_bowling', 'moving_lift_chasm', 'spring_cliff_vault', 'pyramid_gauntlet'],
    ['double_deck_secret', 'sky_bridge_paratroopa', 'spiny_fire_alley', 'moving_lift_chasm', 'piranha_terrace'],
    ['sky_bridge_paratroopa', 'spring_cliff_vault', 'shell_bowling', 'moving_lift_chasm', 'spiny_fire_alley'],
    ['piranha_terrace', 'double_deck_secret', 'moving_lift_chasm', 'sky_bridge_paratroopa', 'pyramid_gauntlet'],
    ['shell_bowling', 'spiny_fire_alley', 'spring_cliff_vault', 'sky_bridge_paratroopa', 'moving_lift_chasm'],
  ];

  const seq = blueprints[(ctx.levelIndex + ctx.worldNum) % blueprints.length];
  let cursor = 11;

  // Welcoming starter block
  putBlock(ctx, 9, 8, 'question', 'coin');

  for (let i = 0; i < seq.length; i++) {
    const advance = buildSetpiece(ctx, seq[i], cursor);
    cursor += advance + 3;
    // Leave clean flat plaza around midpoint for the Checkpoint Pennant!
    if (i === 1) {
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

  return stairStart + 20;
}

export function buildWorldState(
  levelIndex: number,
  carryState?: {
    score: number;
    highScore: number;
    coins: number;
    lives: number;
    powerState: PowerState;
    checkpointX?: number | null;
    checkpointY?: number | null;
    doubleJumpAssist?: boolean;
  }
): WorldState {
  const clampedIdx = Math.max(0, Math.min(levelIndex, 23));
  const worldNum = Math.floor(clampedIdx / STAGES_PER_WORLD) + 1;
  const stageNum = (clampedIdx % STAGES_PER_WORLD) + 1;
  const biomeId = getStageBiome(clampedIdx);
  const biome = BIOMES[biomeId];

  const ctx: BuilderCtx = {
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
    pits: new Set<number>(),
    lavaCols: new Set<number>(),
    isFortress: biomeId === 'fortress',
    isUnderground: biome.underground,
  };

  let totalCols = 132;
  let boss: FortressBoss | null = null;

  if (stageNum === 4) {
    const built = buildFortressStage(ctx);
    totalCols = built.totalCols;
    boss = built.boss;
  } else if (clampedIdx === 0) {
    totalCols = buildStage1_1(ctx);
  } else if (clampedIdx === 1) {
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

  // Parallax Scenery Props
  const sceneries: SceneryProp[] = [];
  for (let i = 0; i < Math.ceil(totalCols / 6); i++) {
    if (biome.underground) {
      sceneries.push({
        kind: ctx.isFortress ? 'banner' : 'pillar',
        x: i * 240 + 60,
        y: TILE,
        scale: (i % 2) + 1,
        parallax: 0.55,
      });
    } else {
      sceneries.push({
        kind: 'cloud',
        x: i * 220 + 40,
        y: 36 + (i % 3) * 26,
        scale: (i % 2) + 1,
        parallax: 0.35,
      });
      sceneries.push({
        kind: biomeId === 'desert' ? 'dune' : biomeId === 'glacier' ? 'pine' : 'hill',
        x: i * 260 + 20,
        y: GROUND_ROW * TILE,
        scale: (i % 2) + 1,
        parallax: 0.65,
      });
      sceneries.push({
        kind: 'bush',
        x: i * 260 + 165,
        y: GROUND_ROW * TILE,
        scale: (i % 3) + 1,
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

  const player = createInitialPlayer(carryState?.powerState ?? 0);
  if (alreadyAtCheckpoint && carryState?.checkpointX != null) {
    player.x = carryState.checkpointX;
    player.y = GROUND_ROW * TILE - player.height;
  }

  const startCameraX = Math.max(0, player.x - 240);

  return {
    status: 'playing',
    levelIndex: clampedIdx,
    worldLabel: getWorldLabel(clampedIdx),
    stageTitle: STAGE_TITLES[clampedIdx] ?? `Etapa ${getWorldLabel(clampedIdx)}`,
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
    fireballs: [],
    coinsList: ctx.coins,
    particles: [],
    floatingTexts: [],
    sceneries,
    lavaCols: ctx.lavaCols,
    flagpole,
    prevJumpHeld: false,
    prevFireHeld: false,
    doubleJumpAssist: carryState?.doubleJumpAssist ?? false,
    nextEntityId: ctx.nextId,
  };
}
