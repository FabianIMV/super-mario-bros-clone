export type GamePartition = 'classic' | 'smw' | 'expedition' | 'dimension';

export type BiomeId =
  | 'meadow'
  | 'cavern'
  | 'desert'
  | 'night'
  | 'glacier'
  | 'fortress'
  | 'yoshi_island'
  | 'donut_plains'
  | 'vanilla_dome'
  | 'forest_illusion'
  | 'valley_koopa'
  // Modo Expedición (original)
  | 'reef'
  | 'jungle'
  | 'clockwork'
  | 'cloudland'
  | 'crystal'
  // Modo Dimensión (3D, original)
  | 'starfield'
  | 'toybox'
  | 'aurora'
  | 'ember'
  | 'prism'
  | 'snowcap'
  | 'clockcore'
  | 'cosmos';

export type BgmTrackId =
  | 'overworld'
  | 'underground'
  | 'athletic'
  | 'fortress'
  | 'starman'
  | 'smw_overworld'
  | 'smw_athletic'
  | 'exp_overworld'
  | 'exp_cave'
  | 'dim_theme'
  | 'dim_core';

export type SfxId =
  | 'jump'
  | 'jump_big'
  | 'spin_jump'
  | 'skid'
  | 'coin'
  | 'dragon_coin'
  | 'bump'
  | 'break_block'
  | 'stomp'
  | 'kick'
  | 'powerup_spawn'
  | 'powerup_collect'
  | 'feather_get'
  | 'cape_spin'
  | 'yoshi_mount'
  | 'yoshi_tongue'
  | 'yoshi_swallow'
  | 'yoshi_spit'
  | 'one_up'
  | 'fireball'
  | 'power_down'
  | 'checkpoint'
  | 'spring'
  | 'boss_hit'
  | 'boss_roar'
  | 'bridge_collapse'
  | 'stage_clear'
  | 'die'
  | 'gameover'
  // Mecánicas, objetivos, secretos y habilidades
  | 'wind_gust'
  | 'icicle_crack'
  | 'crumble'
  | 'key_get'
  | 'vault_open'
  | 'treasure'
  | 'portal'
  | 'wrench_throw'
  | 'wrench_catch'
  | 'wall_jump'
  | 'slide'
  | 'gem'
  | 'clock'
  | 'chase_growl'
  | 'lava_rise'
  | 'goal_locked';

export type HapticKind =
  | 'tick'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'rigid'
  | 'success'
  | 'warning'
  | 'error';

export type GameEvent =
  | { type: 'sfx'; id: SfxId }
  | { type: 'bgm'; track: BgmTrackId | null }
  | { type: 'haptic'; kind: HapticKind }
  | {
      type: 'stage_cleared';
      partition: GamePartition;
      levelIndex: number;
      score: number;
      coins: number;
    }
  | { type: 'game_over'; partition: GamePartition; score: number };

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  run: boolean;
  fire: boolean;
  spin: boolean;
}

export type PowerState = 0 | 1 | 2 | 3; // 0 = Small, 1 = Super, 2 = Fire, 3 = Cape Feather (SMW)

export type BlockType =
  | 'ground_top'
  | 'ground_deep'
  | 'brick'
  | 'question'
  | 'rotating'
  | 'hidden'
  | 'empty'
  | 'hard'
  | 'bridge'
  | 'lock'; // Puerta de bóveda: se abre con la llave (Fase 3)

export type BlockContent =
  | 'coin'
  | 'multi_coin'
  | 'powerup'
  | 'feather'
  | 'yoshi_egg'
  | 'star'
  | 'one_up'
  | null;

export interface Block {
  id: number;
  col: number;
  row: number;
  x: number;
  y: number;
  baseY: number;
  width: number;
  height: number;
  type: BlockType;
  content: BlockContent;
  coinsRemaining: number;
  bounceY: number;
  bounceVel: number;
  spinTimer: number;
  /** Puente que se derrumba (Mundo 5): se activa al pisarlo. */
  crumble?: boolean;
  crumbleTimer?: number;
}

export interface Pipe {
  x: number;
  y: number;
  width: number;
  height: number;
  hasPiranha: boolean;
}

export interface MovingPlatform {
  x: number;
  y: number;
  startX: number;
  startY: number;
  width: number;
  height: number;
  rangeX: number;
  rangeY: number;
  speed: number;
  phase: number;
  vx: number;
  vy: number;
  /** Plataforma de luciérnagas: visible/sólida `on` frames de cada `period`. */
  blink?: { period: number; on: number; offset: number };
}

export interface Spring {
  x: number;
  y: number;
  width: number;
  height: number;
  compressTimer: number;
  /** 'mushroom' = hongo trampolín del Mundo 1 (rebota más alto). */
  kind?: 'spring' | 'mushroom';
}

// ============================================================================
// MECÁNICAS POR MUNDO (Fase 1)
// ============================================================================
export type StageMechanic =
  | 'none'
  | 'bounce' // Hongos trampolín
  | 'wind' // Ráfagas de viento
  | 'firefly' // Plataformas de luciérnagas que se apagan
  | 'icicles' // Carámbanos que caen
  | 'crumble' // Puentes que se derrumban al pisarlos
  | 'lowgrav' // Zonas de gravedad baja
  | 'lava_tide'; // Marea de lava en los castillos

export type WindPhase = 'calm' | 'warn' | 'gust';

export interface WindState {
  phase: WindPhase;
  timer: number;
  dir: 1 | -1;
  cycle: number;
}

export interface Icicle {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  homeY: number;
  state: 'hang' | 'shake' | 'fall' | 'gone';
  timer: number;
  vy: number;
}

export interface LowGravZone {
  x0: number;
  x1: number;
}

// ============================================================================
// OBJETIVOS POR NIVEL (Fase 2)
// ============================================================================
export type StageObjective =
  | 'reach' // Llegar a la meta
  | 'collect' // Juntar todas las gemas para abrir la meta
  | 'time_attack' // Contrarreloj con relojes que suman tiempo
  | 'chase'; // Escapar de la sombra que avanza

export interface Pickup {
  id: number;
  kind: 'gem' | 'clock' | 'key' | 'treasure' | 'portal';
  x: number;
  y: number;
  width: number;
  height: number;
  collected: boolean;
  phase: number;
}

export interface ChaseWall {
  x: number;
  speed: number;
  delay: number;
}

/** Llave inglesa lanzada como bumerán (Fase 4). */
export interface Wrench {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  dir: 1 | -1;
  phase: 'out' | 'back';
  travelled: number;
  timer: number;
  spin: number;
  carryId: number | null;
  hitBoss: boolean;
}

export interface CrumbledBlock {
  block: Block;
  respawnTimer: number;
}

export interface Checkpoint {
  x: number;
  y: number;
  width: number;
  height: number;
  activated: boolean;
}

export type EnemyType =
  | 'goomba'
  | 'galoomba'
  | 'koopa_green'
  | 'koopa_red'
  | 'paratroopa'
  | 'piranha'
  | 'spiny'
  | 'rex'
  | 'chuck'
  | 'bullet_bill';

export type EnemyState =
  | 'walk'
  | 'rex_squished'
  | 'shell_idle'
  | 'shell_wake'
  | 'shell_slide'
  | 'squashed'
  | 'knocked';

export interface Enemy {
  id: number;
  type: EnemyType;
  state: EnemyState;
  x: number;
  y: number;
  baseY: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  facing: 1 | -1;
  onGround: boolean;
  hp: number;
  stateTimer: number;
  kickGraceTimer: number;
  shellCombo: number;
  animTimer: number;
  active: boolean;
}

export interface BossFireWave {
  x: number;
  y: number;
  targetY: number;
  vx: number;
  width: number;
  height: number;
  animTimer: number;
}

export interface FortressBoss {
  x: number;
  y: number;
  homeX: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  facing: 1 | -1;
  onGround: boolean;
  jumpTimer: number;
  fireTimer: number;
  roarTimer: number;
  hurtFlashTimer: number;
  defeated: boolean;
  fallingInLava: boolean;
  axeX: number;
  axeY: number;
  axeGrabbed: boolean;
  bridgeCols: number[];
  bridgeCollapseTimer: number;
}

export type PowerupKind = 'mushroom' | 'flower' | 'feather' | 'yoshi_egg' | 'star' | 'one_up';

export interface PowerupItem {
  id: number;
  kind: PowerupKind;
  x: number;
  y: number;
  spawnStartY: number;
  spawning: boolean;
  vx: number;
  vy: number;
  width: number;
  height: number;
  onGround: boolean;
  swayPhase: number;
}

export interface YoshiEntity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  facing: 1 | -1;
  onGround: boolean;
  state: 'hatching' | 'idle' | 'panic';
  stateTimer: number;
  animTimer: number;
}

export interface DragonCoin {
  x: number;
  y: number;
  baseY: number;
  width: number;
  height: number;
  collected: boolean;
  phase: number;
}

export interface BerryEntity {
  x: number;
  y: number;
  width: number;
  height: number;
  eaten: boolean;
}

export interface Fireball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  bounces: number;
  animFrame: number;
  fromYoshi?: boolean;
}

export interface CoinEntity {
  x: number;
  y: number;
  baseY: number;
  width: number;
  height: number;
  collected: boolean;
  phase: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  kind: 'debris' | 'dust' | 'spark' | 'coin_pop' | 'lava' | 'wind';
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface SceneryProp {
  kind:
    | 'cloud'
    | 'hill'
    | 'smw_hill'
    | 'bush'
    | 'yoshi_house'
    | 'pillar'
    | 'dune'
    | 'pine'
    | 'banner'
    | 'chain';
  x: number;
  y: number;
  scale: number;
  parallax: number;
}

export interface FlagpoleGoal {
  x: number;
  y: number;
  width: number;
  height: number;
  flagY: number;
  castleX: number;
  castleY: number;
}

export interface GoalTape {
  x: number;
  y: number;
  width: number;
  height: number;
  barY: number;
  barVy: number;
  triggered: boolean;
  castleX: number;
  castleY: number;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  powerState: PowerState;
  onGround: boolean;
  crouching: boolean;
  skidding: boolean;
  facing: 1 | -1;
  coyoteTimer: number;
  jumpBufferTimer: number;
  airJumpsLeft: number;
  invulnTimer: number;
  starTimer: number;
  fireCooldown: number;
  throwPoseTimer: number;
  stompCombo: number;
  animTimer: number;
  dead: boolean;
  enteringCastle: boolean;
  // Super Plomero World (SMW) Cape & Yoshi mechanics:
  pMeter: number; // 0..112 -> at 112 enables SMW Cape takeoff!
  capeFlying: boolean;
  capeFlightTimer: number;
  capeDiveSpeed: number;
  capeSpinTimer: number;
  spinJumping: boolean;
  mountedYoshi: boolean;
  yoshiTongueTimer: number;
  yoshiTonguePhase: number; // 0..18
  yoshiMouthItem: 'none' | 'fire';
  berriesEaten: number;
  // Habilidades (Fase 4)
  /** -1/1 = pegado a una pared a la izquierda/derecha en el aire; 0 = no. */
  wallDir?: -1 | 0 | 1;
  /** Frames en que se ignora volver hacia la pared tras un salto en pared. */
  wallJumpLock?: number;
  wallJumpLockDir?: -1 | 0 | 1;
  /** Margen de frames para saltar en pared justo después de soltarla. */
  wallCoyote?: number;
  lastWallDir?: -1 | 0 | 1;
  /** Frames restantes de deslizamiento por el suelo. */
  slideTimer?: number;
}

export type WorldStatus =
  | 'title'
  | 'stage_intro'
  | 'playing'
  | 'flagpole'
  | 'goal_tape'
  | 'boss_collapse'
  | 'dying'
  | 'gameover'
  | 'victory';

export interface GameSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  hapticsEnabled: boolean;
  crtScanlines: boolean;
  doubleJumpAssist: boolean;
  controlScale: number;
}

export interface SaveProgress {
  highScore: number;
  unlockedLevel: number;
  clearedLevels: number[];
  bestStageScores: Record<number, number>;
  totalCoins: number;
  // Partition 2: Super Plomero World (20 levels)
  smwHighScore: number;
  smwUnlockedLevel: number;
  smwClearedLevels: number[];
  smwBestStageScores: Record<number, number>;
  // Modo 3: Plomero Expedición (28 niveles)
  expHighScore?: number;
  expUnlockedLevel?: number;
  expClearedLevels?: number[];
  expBestStageScores?: Record<number, number>;
  // Modo 4: Plomero Dimensión 3D (16 niveles)
  dimHighScore?: number;
  dimUnlockedLevel?: number;
  dimClearedLevels?: number[];
  dimBestStageScores?: Record<number, number>;
  lastPartition: GamePartition;
}

export interface WorldState {
  partition: GamePartition;
  totalStagesInPartition: number;
  status: WorldStatus;
  levelIndex: number;
  worldLabel: string;
  stageTitle: string;
  biomeId: BiomeId;
  totalCols: number;
  score: number;
  highScore: number;
  coins: number;
  lives: number;
  timeLeft: number;
  timeTick: number;
  frameCount: number;
  statusTimer: number;
  cameraX: number;
  screenShake: number;
  checkpointX: number | null;
  checkpointY: number | null;
  player: Player;
  blocks: Block[];
  blockGrid: Map<number, Block>;
  pipes: Pipe[];
  platforms: MovingPlatform[];
  springs: Spring[];
  checkpoint: Checkpoint | null;
  enemies: Enemy[];
  boss: FortressBoss | null;
  bossFires: BossFireWave[];
  powerups: PowerupItem[];
  yoshis: YoshiEntity[];
  dragonCoins: DragonCoin[];
  dragonCoinsCollected: number;
  berries: BerryEntity[];
  fireballs: Fireball[];
  coinsList: CoinEntity[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  sceneries: SceneryProp[];
  lavaCols: Set<number>;
  flagpole: FlagpoleGoal | null;
  goalTape: GoalTape | null;
  prevJumpHeld: boolean;
  prevFireHeld: boolean;
  prevSpinHeld: boolean;
  doubleJumpAssist: boolean;
  nextEntityId: number;
  // Mecánica del mundo (opcionales: los mundos sin mecánica no las usan)
  mechanic?: StageMechanic;
  wind?: WindState | null;
  icicles?: Icicle[];
  lowGravZones?: LowGravZone[];
  crumbled?: CrumbledBlock[];
  lavaTide?: boolean;
  // Objetivo del nivel (opcionales: 'reach' no los usa)
  objective?: StageObjective;
  pickups?: Pickup[];
  gemsNeeded?: number;
  gemsCollected?: number;
  chase?: ChaseWall | null;
  goalBlockedTimer?: number;
  // Secretos (Fase 3)
  hasKey?: boolean;
  vaultOpened?: boolean;
  /** Si existe, la salida lleva a este nivel en vez del siguiente (portal secreto). */
  warpTo?: number | null;
  // Habilidades (Fase 4)
  wrench?: Wrench | null;
  shafts?: Array<{ x: number; y: number; hinted: boolean }>;
}
