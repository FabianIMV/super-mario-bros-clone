export type BiomeId =
  | 'meadow'
  | 'cavern'
  | 'desert'
  | 'night'
  | 'glacier'
  | 'fortress';

export type BgmTrackId =
  | 'overworld'
  | 'underground'
  | 'athletic'
  | 'fortress'
  | 'starman';

export type SfxId =
  | 'jump'
  | 'jump_big'
  | 'skid'
  | 'coin'
  | 'bump'
  | 'break_block'
  | 'stomp'
  | 'kick'
  | 'powerup_spawn'
  | 'powerup_collect'
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
  | 'gameover';

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
  | { type: 'stage_cleared'; levelIndex: number; score: number; coins: number }
  | { type: 'game_over'; score: number };

export interface InputState {
  left: boolean;
  right: boolean;
  down: boolean;
  jump: boolean;
  run: boolean;
  fire: boolean;
}

export type PowerState = 0 | 1 | 2; // 0 = Small, 1 = Super, 2 = Fire

export type BlockType =
  | 'ground_top'
  | 'ground_deep'
  | 'brick'
  | 'question'
  | 'hidden'
  | 'empty'
  | 'hard'
  | 'bridge';

export type BlockContent =
  | 'coin'
  | 'multi_coin'
  | 'powerup'
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
}

export interface Spring {
  x: number;
  y: number;
  width: number;
  height: number;
  compressTimer: number;
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
  | 'koopa_green'
  | 'koopa_red'
  | 'paratroopa'
  | 'piranha'
  | 'spiny';

export type EnemyState =
  | 'walk'
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

export type PowerupKind = 'mushroom' | 'flower' | 'star' | 'one_up';

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
  kind: 'debris' | 'dust' | 'spark' | 'coin_pop' | 'lava';
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
  kind: 'cloud' | 'hill' | 'bush' | 'pillar' | 'dune' | 'pine' | 'banner' | 'chain';
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
}

export type WorldStatus =
  | 'title'
  | 'stage_intro'
  | 'playing'
  | 'flagpole'
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
}

export interface WorldState {
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
  fireballs: Fireball[];
  coinsList: CoinEntity[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  sceneries: SceneryProp[];
  lavaCols: Set<number>;
  flagpole: FlagpoleGoal | null;
  prevJumpHeld: boolean;
  prevFireHeld: boolean;
  doubleJumpAssist: boolean;
  nextEntityId: number;
}
