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
  | 'spiny_spinjump_bridge';

function buildSmwSetpiece(ctx: SmwCtx, kind: SmwSetpiece, c: number): number {
  switch (kind) {
    case 'yoshi_berry_orchard': {
      // Yoshi Egg block + juicy red berries + Red Koopa (for Yoshi 3-fireball breath!)
      putBlock(ctx, c + 1, 8, 'rotating');
      putBlock(ctx, c + 2, 8, 'question', 'yoshi_egg');
      putBlock(ctx, c + 3, 8, 'rotating');
      addBerry(ctx, c + 5, 10.6);
      addBerry(ctx, c + 8, 9.5);
      addBerry(ctx, c + 11, 10.6);
      addEnemy(ctx, c + 7, GROUND_ROW - 1, 'koopa_red');
      addEnemy(ctx, c + 11, GROUND_ROW - 1, 'galoomba');
      addEnemy(ctx, c + 13, GROUND_ROW - 1, 'rex');
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
      for (let k = c + 7; k <= c + 12; k++) {
        putBlock(ctx, k, 4, 'bridge');
      }
      addEnemy(ctx, c + 9, GROUND_ROW - 1, 'rex');
      addEnemy(ctx, c + 13, GROUND_ROW - 1, 'galoomba');
      return 17;
    }

    case 'rotating_block_vault': {
      // SMW Yellow Rotating [👀] Blocks chamber — spin-whack with Cape or bump from below!
      for (let row = 9; row <= 11; row++) {
        putBlock(ctx, c + 2, row, 'rotating');
        putBlock(ctx, c + 8, row, 'rotating');
      }
      for (let k = c + 2; k <= c + 8; k++) {
        putBlock(ctx, k, 8, k === c + 5 ? 'question' : 'rotating', k === c + 5 ? 'feather' : null);
      }
      addCoin(ctx, c + 4, 10);
      addCoin(ctx, c + 5, 10);
      addCoin(ctx, c + 6, 10);
      addEnemy(ctx, c + 5, 7, 'rex');
      addEnemy(ctx, c + 11, GROUND_ROW - 1, 'koopa_green');
      return 14;
    }

    case 'rex_terrace_paratroopa': {
      addPipe(ctx, c + 1, 2, false);
      addBerry(ctx, c + 4, 10.5);
      addEnemy(ctx, c + 5, GROUND_ROW - 1, 'rex');
      addPipe(ctx, c + 7, 3, true);
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
      putBlock(ctx, c + 3, 8, 'question', 'coin');
      putBlock(ctx, c + 4, 8, 'rotating', 'multi_coin');
      putBlock(ctx, c + 5, 8, 'rotating');
      addEnemy(ctx, c + 7, GROUND_ROW - 1, 'chuck');
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
      addEnemy(ctx, c + 6, 6, 'bullet_bill');
      addEnemy(ctx, c + 11, 8, 'bullet_bill');
      addEnemy(ctx, c + 14, 5, 'bullet_bill');
      addCoinArc(ctx, c + 3, 6, 5.5);
      return 16;
    }

    case 'vanilla_crystal_lifts': {
      carvePit(ctx, c + 2, 4);
      carvePit(ctx, c + 6, 3);
      addPlatform(ctx, c + 4, 8.8, 3, 2.7, 0, 0.036, 0);
      putBlock(ctx, c + 5, 4, 'question', 'one_up');
      addCoinArc(ctx, c + 3, 5, 5.2);
      addEnemy(ctx, c + 11, GROUND_ROW - 1, 'koopa_red');
      addEnemy(ctx, c + 13, GROUND_ROW - 1, 'galoomba');
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
      addEnemy(ctx, c + 7, GROUND_ROW - 1, 'galoomba');
      addEnemy(ctx, c + 10, GROUND_ROW - 1, 'rex');
      addCoinArc(ctx, c + 5, 5, 4.8);
      return 14;
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
// SMW FORTRESS STAGE BUILDER (Y-4, D-4, V-4, B-4, K-4)
// ============================================================================
function buildSmwFortressStage(ctx: SmwCtx): { totalCols: number; boss: FortressBoss } {
  const totalCols = 136 + ctx.worldNum * 4;

  for (let col = 0; col < totalCols; col++) {
    putBlock(ctx, col, 0, 'hard');
  }

  // SMW Castle Opening: Cape Feather + Rotating Blocks!
  putBlock(ctx, 8, 8, 'rotating');
  putBlock(ctx, 9, 8, 'question', 'feather');
  putBlock(ctx, 10, 8, 'rotating');
  addEnemy(ctx, 14, GROUND_ROW - 1, 'rex');

  // Lava Trench 1 + Dragon Coin #1
  carvePit(ctx, 19, 3, true);
  putBlock(ctx, 20, 9, 'hard');
  addDragonCoin(ctx, 20, 6.2);

  // Chargin' Chuck & Spiny Hallway
  addEnemy(ctx, 26, GROUND_ROW - 1, 'chuck');
  addEnemy(ctx, 31, GROUND_ROW - 1, 'spiny');
  putBlock(ctx, 28, 7, 'rotating');
  putBlock(ctx, 29, 7, 'question', 'coin');
  putBlock(ctx, 30, 7, 'rotating');

  // Lava Chasm 2 with Synced Moving Lift + Dragon Coin #2
  carvePit(ctx, 36, 4, true);
  carvePit(ctx, 40, 3, true);
  addPlatform(ctx, 38, 9, 3, 2.8, 0, 0.038 + ctx.worldNum * 0.003, 0.4);
  addDragonCoin(ctx, 39, 5.2);

  // Midpoint Supply + Checkpoint Zone
  putBlock(ctx, 48, 8, 'question', 'feather');
  addEnemy(ctx, 56, GROUND_ROW - 1, 'koopa_red');
  addEnemy(ctx, 60, GROUND_ROW - 1, 'rex');

  // Rotating Block Bridge over Magma + Dragon Coin #3 & #4
  carvePit(ctx, 65, 4, true);
  for (let c = 64; c <= 70; c++) {
    putBlock(ctx, c, 8, 'bridge');
    if (c >= 66 && c <= 68) putBlock(ctx, c, 4, 'rotating');
  }
  addDragonCoin(ctx, 67, 5.6);
  addEnemy(ctx, 68, 7, 'paratroopa');

  carvePit(ctx, 77, 4, true);
  addPlatform(ctx, 78, 8.5, 2, 0, 2.2, 0.042, 1.1);
  addDragonCoin(ctx, 78, 4.2);

  putBlock(ctx, 86, 8, 'question', 'feather');
  putBlock(ctx, 87, 8, 'question', 'one_up');
  addEnemy(ctx, 91, GROUND_ROW - 1, 'chuck');
  addDragonCoin(ctx, 94, 7.5); // Dragon Coin #5 before Boss!

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

function buildCuratedSmwStage(ctx: SmwCtx): number {
  const blueprints: SmwSetpiece[][] = [
    ['yoshi_berry_orchard', 'cape_runway_skyway', 'rex_terrace_paratroopa', 'rotating_block_vault', 'chuck_stadium'],
    ['cape_runway_skyway', 'vanilla_crystal_lifts', 'yoshi_berry_orchard', 'spiny_spinjump_bridge', 'bullet_bill_canyon'],
    ['rotating_block_vault', 'yoshi_berry_orchard', 'bullet_bill_canyon', 'cape_runway_skyway', 'chuck_stadium'],
    ['yoshi_berry_orchard', 'spiny_spinjump_bridge', 'vanilla_crystal_lifts', 'rex_terrace_paratroopa', 'bullet_bill_canyon'],
    ['chuck_stadium', 'cape_runway_skyway', 'yoshi_berry_orchard', 'bullet_bill_canyon', 'spiny_spinjump_bridge'],
  ];

  if (ctx.isUnderground) {
    for (let col = 4; col < 108; col++) {
      if (col % 19 !== 0 && col % 19 !== 1) {
        putBlock(ctx, col, 0, 'brick');
      }
    }
  }

  const seq = blueprints[(ctx.levelIndex + ctx.worldNum) % blueprints.length];
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
    const advance = buildSmwSetpiece(ctx, seq[i], cursor);
    // Place 1 of the 5 stage Dragon Coins in each of the 5 major zones!
    addDragonCoin(ctx, startC + Math.floor(advance * 0.5), ctx.isUnderground ? 5.2 : 3.6);
    cursor += advance + 3;
    if (i === 1) {
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
