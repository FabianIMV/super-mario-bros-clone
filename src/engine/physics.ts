import {
  BIOMES,
  GROUND_ROW,
  LOGICAL_HEIGHT,
  MIN_CAMERA_WORLD_X,
  TILE,
} from './biomes';
import {
  isInLowGrav,
  isPlatformSolid,
  lavaSurfaceY,
  updateMechanics,
  windPush,
} from './mechanics';
import { enforceGoalLock, updateObjectives } from './objectives';
import { updateSecrets } from './secrets';
import {
  SLIDE_FRAMES,
  SLIDE_FRICTION,
  SLIDE_HEIGHT,
  SLIDE_KO,
  SLIDE_MIN_SPEED,
  WALL_COYOTE,
  WALL_JUMP_LOCK,
  WALL_JUMP_VX,
  WALL_JUMP_VY,
  WALL_SLIDE_SPEED,
  throwWrench,
  updateShaftHints,
  updateWrench,
} from './abilities';
import { buildWorldState, gridKey } from '../levels/levelBuilder';
import type {
  Block,
  Enemy,
  GameEvent,
  InputState,
  MovingPlatform,
  PowerupKind,
  WorldState,
} from './types';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const COMBO_POINTS = [200, 400, 800, 1000, 2000, 4000, 8000];
const DRAGON_COIN_POINTS = [1000, 2000, 4000, 8000, 10000];

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function addScore(world: WorldState, points: number): void {
  world.score += points;
  if (world.score > world.highScore) {
    world.highScore = world.score;
  }
}

function awardCoin(world: WorldState, x: number, y: number, events: GameEvent[]): void {
  world.coins += 1;
  addScore(world, 200);
  events.push({ type: 'sfx', id: 'coin' });
  events.push({ type: 'haptic', kind: 'tick' });
  if (world.coins >= 100) {
    world.coins -= 100;
    world.lives += 1;
    events.push({ type: 'sfx', id: 'one_up' });
    events.push({ type: 'haptic', kind: 'success' });
    spawnText(world, x, y - 14, '1-UP!', '#4ade80');
  }
}

function awardCombo(
  world: WorldState,
  comboIndex: number,
  x: number,
  y: number,
  events: GameEvent[]
): void {
  if (comboIndex >= COMBO_POINTS.length) {
    world.lives += 1;
    events.push({ type: 'sfx', id: 'one_up' });
    events.push({ type: 'haptic', kind: 'success' });
    spawnText(world, x, y - 8, '1-UP!', '#4ade80');
  } else {
    const pts = COMBO_POINTS[comboIndex];
    addScore(world, pts);
    spawnText(world, x, y - 8, `+${pts}`, '#fde047');
  }
}

export function spawnText(
  world: WorldState,
  x: number,
  y: number,
  text: string,
  color: string
): void {
  world.floatingTexts.push({
    x,
    y,
    text,
    color,
    life: 44,
    maxLife: 44,
  });
}

function spawnDust(world: WorldState, x: number, y: number, count = 4): void {
  for (let i = 0; i < count; i++) {
    world.particles.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 4,
      vx: (Math.random() - 0.5) * 2.4,
      vy: -Math.random() * 1.6 - 0.3,
      gravity: 0.05,
      size: 6,
      color: '#f1f5f9',
      life: 16,
      maxLife: 16,
      kind: 'dust',
    });
  }
}

function spawnBrickDebris(world: WorldState, x: number, y: number): void {
  const biome = BIOMES[world.biomeId];
  const velocities = [
    { vx: -3.6, vy: -8.6 },
    { vx: 3.6, vy: -8.6 },
    { vx: -2.4, vy: -5.4 },
    { vx: 2.4, vy: -5.4 },
  ];
  for (const v of velocities) {
    world.particles.push({
      x: x + 11,
      y: y + 11,
      vx: v.vx,
      vy: v.vy,
      gravity: 0.48,
      size: 10,
      color: biome.brickMain,
      life: 48,
      maxLife: 48,
      kind: 'debris',
    });
  }
}

function spawnSparks(world: WorldState, x: number, y: number, color: string, count = 6): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const speed = 2.2 + (i % 2) * 1.4;
    world.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.2,
      gravity: 0.18,
      size: 6,
      color,
      life: 20,
      maxLife: 20,
      kind: 'spark',
    });
  }
}

interface SolidHit extends Rect {
  block?: Block;
  platform?: MovingPlatform;
}

function collectNearbySolids(world: WorldState, box: Rect, includeHidden = false): SolidHit[] {
  const results: SolidHit[] = [];
  const minCol = Math.floor(box.x / TILE) - 1;
  const maxCol = Math.floor((box.x + box.width) / TILE) + 1;
  const minRow = Math.max(0, Math.floor(box.y / TILE) - 1);
  const maxRow = Math.min(14, Math.floor((box.y + box.height) / TILE) + 1);

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const b = world.blockGrid.get(gridKey(c, r));
      if (!b) continue;
      if (b.type === 'hidden' && !includeHidden) continue;
      // SMW Rotating Blocks become passable while actively spinning!
      if (b.type === 'rotating' && b.spinTimer > 0) continue;
      results.push({ x: b.x, y: b.y, width: b.width, height: b.height, block: b });
    }
  }

  for (const p of world.pipes) {
    if (p.x + p.width >= box.x - TILE && p.x <= box.x + box.width + TILE) {
      results.push(p);
    }
  }

  for (const pl of world.platforms) {
    if (!isPlatformSolid(pl, world.frameCount)) continue;
    if (pl.x + pl.width >= box.x - TILE && pl.x <= box.x + box.width + TILE) {
      results.push({ x: pl.x, y: pl.y, width: pl.width, height: pl.height, platform: pl });
    }
  }

  return results;
}

function removeBlock(world: WorldState, block: Block): void {
  world.blockGrid.delete(gridKey(block.col, block.row));
  const idx = world.blocks.indexOf(block);
  if (idx !== -1) world.blocks.splice(idx, 1);
}

function triggerBlockHit(
  world: WorldState,
  block: Block,
  byShellOrCape: boolean,
  events: GameEvent[]
): void {
  if (
    block.type === 'ground_top' ||
    block.type === 'ground_deep' ||
    block.type === 'hard' ||
    block.type === 'empty' ||
    block.type === 'bridge'
  ) {
    if (!byShellOrCape) {
      events.push({ type: 'sfx', id: 'bump' });
      events.push({ type: 'haptic', kind: 'light' });
    }
    return;
  }

  block.bounceVel = -5.2;

  // Knock any enemy standing directly on top of this bumped block!
  for (const en of world.enemies) {
    if (
      en.type !== 'piranha' &&
      en.type !== 'bullet_bill' &&
      en.state !== 'knocked' &&
      en.state !== 'squashed' &&
      en.x + en.width > block.x &&
      en.x < block.x + block.width &&
      Math.abs(en.y + en.height - block.baseY) <= 10
    ) {
      knockEnemy(world, en, 0, events);
    }
  }

  // Collect any floating coin directly above this block!
  for (const c of world.coinsList) {
    if (
      !c.collected &&
      c.x + c.width > block.x &&
      c.x < block.x + block.width &&
      Math.abs(c.y + c.height - block.baseY) <= 20
    ) {
      c.collected = true;
      awardCoin(world, c.x, c.y, events);
    }
  }

  if (block.type === 'question' || block.type === 'hidden' || block.content !== null) {
    if (block.content === 'coin' || block.content === 'multi_coin') {
      block.coinsRemaining = Math.max(0, block.coinsRemaining - 1);
      if (block.coinsRemaining <= 0) {
        block.type = 'empty';
        block.content = null;
      }
      awardCoin(world, block.x + 6, block.baseY - 18, events);
      world.particles.push({
        x: block.x + 10,
        y: block.baseY - 14,
        vx: 0,
        vy: -7.4,
        gravity: 0.52,
        size: 12,
        color: '#facc15',
        life: 24,
        maxLife: 24,
        kind: 'coin_pop',
      });
      return;
    }

    if (block.content === 'yoshi_egg') {
      block.type = 'empty';
      block.content = null;
      // Authentic SMW rule: if player already has Yoshi, spotted egg yields 1-UP!
      if (world.player.mountedYoshi || world.yoshis.length > 0) {
        events.push({ type: 'sfx', id: 'powerup_spawn' });
        world.powerups.push({
          id: world.nextEntityId++,
          kind: 'one_up',
          x: block.x + 3,
          y: block.baseY - 4,
          spawnStartY: block.baseY - 26,
          spawning: true,
          vx: 1.75,
          vy: 0,
          width: 26,
          height: 26,
          onGround: false,
          swayPhase: 0,
        });
      } else {
        events.push({ type: 'sfx', id: 'powerup_spawn' });
        events.push({ type: 'haptic', kind: 'success' });
        spawnSparks(world, block.x + 16, block.baseY - 16, '#4ade80', 8);
        world.yoshis.push({
          id: world.nextEntityId++,
          x: block.x - 2,
          y: block.baseY - 44,
          vx: 0,
          vy: 0,
          width: 34,
          height: 44,
          facing: 1,
          onGround: false,
          state: 'hatching',
          stateTimer: 24,
          animTimer: 0,
        });
      }
      return;
    }

    if (
      block.content === 'powerup' ||
      block.content === 'feather' ||
      block.content === 'star' ||
      block.content === 'one_up'
    ) {
      const content = block.content;
      block.type = 'empty';
      block.content = null;
      events.push({ type: 'sfx', id: 'powerup_spawn' });
      events.push({ type: 'haptic', kind: 'medium' });

      let kind: PowerupKind;
      if (content === 'star') {
        kind = 'star';
      } else if (content === 'one_up') {
        kind = 'one_up';
      } else if (content === 'feather') {
        kind = world.player.powerState === 0 && world.partition === 'classic' ? 'mushroom' : 'feather';
      } else if (world.player.powerState >= 1) {
        kind = world.partition === 'smw' ? 'feather' : 'flower';
      } else {
        kind = 'mushroom';
      }

      world.powerups.push({
        id: world.nextEntityId++,
        kind,
        x: block.x + 3,
        y: block.baseY - 4,
        spawnStartY: kind === 'feather' ? block.baseY - 44 : block.baseY - 26,
        spawning: true,
        vx: kind === 'flower' || kind === 'feather' ? 0 : 1.75,
        vy: kind === 'feather' ? -3.8 : 0,
        width: 26,
        height: 26,
        onGround: false,
        swayPhase: 0,
      });
      return;
    }

    block.type = 'empty';
    return;
  }

  // SMW Yellow Rotating [👀] Block: spins open & passable for 4 seconds!
  if (block.type === 'rotating') {
    block.spinTimer = 240;
    events.push({ type: 'sfx', id: 'cape_spin' });
    events.push({ type: 'haptic', kind: 'medium' });
    spawnSparks(world, block.x + 16, block.baseY + 16, '#fde047', 5);
    return;
  }

  if (block.type === 'brick') {
    if (world.player.powerState > 0 || byShellOrCape) {
      events.push({ type: 'sfx', id: 'break_block' });
      events.push({ type: 'haptic', kind: 'rigid' });
      addScore(world, 50);
      spawnBrickDebris(world, block.x, block.baseY);
      removeBlock(world, block);
    } else {
      events.push({ type: 'sfx', id: 'bump' });
      events.push({ type: 'haptic', kind: 'light' });
    }
  }
}

function knockEnemy(
  world: WorldState,
  en: Enemy,
  comboIdx: number,
  events: GameEvent[]
): void {
  en.state = 'knocked';
  en.vy = -7.8;
  en.vx = en.vx >= 0 ? 2.2 : -2.2;
  en.stateTimer = 60;
  events.push({ type: 'sfx', id: 'kick' });
  events.push({ type: 'haptic', kind: 'medium' });
  awardCombo(world, comboIdx, en.x, en.y, events);
  spawnSparks(world, en.x + en.width / 2, en.y + en.height / 2, '#fde047', 6);
}

function syncStandingHeight(world: WorldState): void {
  const p = world.player;
  const targetH =
    (p.slideTimer ?? 0) > 0
      ? SLIDE_HEIGHT
      : p.crouching
      ? 32
      : p.mountedYoshi
      ? 52
      : p.powerState > 0
      ? 46
      : 30;
  p.y += p.height - targetH;
  p.height = targetH;
}

function damagePlayer(world: WorldState, events: GameEvent[]): void {
  const p = world.player;
  if (p.invulnTimer > 0 || p.starTimer > 0 || p.dead) return;

  // Authentic SMW Yoshi Shield: getting hit dismounts Yoshi into runaway panic instead of hurting Plomero!
  if (p.mountedYoshi) {
    p.mountedYoshi = false;
    p.yoshiTongueTimer = 0;
    p.yoshiMouthItem = 'none';
    syncStandingHeight(world);
    p.vy = -7.2;
    p.invulnTimer = 95;
    world.screenShake = 8;
    events.push({ type: 'sfx', id: 'power_down' });
    events.push({ type: 'haptic', kind: 'warning' });
    spawnText(world, p.x - 8, p.y - 14, '¡YOSHI HUYE!', '#fb923c');
    world.yoshis.push({
      id: world.nextEntityId++,
      x: p.x + p.facing * 18,
      y: p.y + p.height - 44,
      vx: p.facing * 2.8,
      vy: -3.5,
      width: 34,
      height: 44,
      facing: p.facing,
      onGround: false,
      state: 'panic',
      stateTimer: 360,
      animTimer: 0,
    });
    return;
  }

  if (p.powerState > 0) {
    p.powerState = p.powerState >= 2 ? 1 : 0;
    p.capeFlying = false;
    p.capeSpinTimer = 0;
    syncStandingHeight(world);
    p.invulnTimer = 100;
    world.screenShake = 8;
    events.push({ type: 'sfx', id: 'power_down' });
    events.push({ type: 'haptic', kind: 'warning' });
    spawnSparks(world, p.x + p.width / 2, p.y + p.height / 2, '#f87171', 8);
  } else {
    killPlayer(world, events);
  }
}

export function killPlayer(world: WorldState, events: GameEvent[]): void {
  const p = world.player;
  if (p.dead || world.status === 'dying' || world.status === 'gameover') return;
  p.dead = true;
  p.mountedYoshi = false;
  p.capeFlying = false;
  p.vx = 0;
  p.vy = -10.8;
  p.starTimer = 0;
  world.lives -= 1;
  world.status = 'dying';
  world.statusTimer = 110;
  world.screenShake = 12;
  events.push({ type: 'bgm', track: null });
  events.push({ type: 'sfx', id: 'die' });
  events.push({ type: 'haptic', kind: 'error' });
}

function startFlagpoleSequence(world: WorldState, events: GameEvent[]): void {
  if (!world.flagpole || world.status !== 'playing') return;
  const p = world.player;
  const fp = world.flagpole;
  world.status = 'flagpole';
  world.statusTimer = 145;
  p.vx = 0;
  p.vy = 0;
  p.x = fp.x - p.width + 6;
  p.facing = 1;
  p.crouching = false;
  p.skidding = false;
  p.capeFlying = false;

  const relHeight = 1 - Math.max(0, Math.min(1, (p.y - fp.y) / fp.height));
  const poleBonus = relHeight > 0.85 ? 5000 : relHeight > 0.6 ? 2000 : relHeight > 0.3 ? 800 : 400;
  const timeBonus = world.timeLeft * 10;
  addScore(world, poleBonus + timeBonus);
  spawnText(world, p.x - 8, p.y - 12, `+${poleBonus + timeBonus}`, '#4ade80');
  events.push({ type: 'bgm', track: null });
  events.push({ type: 'sfx', id: 'stage_clear' });
  events.push({ type: 'haptic', kind: 'success' });
}

function startGoalTapeSequence(
  world: WorldState,
  cutTape: boolean,
  events: GameEvent[]
): void {
  if (!world.goalTape || world.status !== 'playing') return;
  const p = world.player;
  const gt = world.goalTape;
  gt.triggered = true;
  world.status = 'goal_tape';
  world.statusTimer = 135;
  p.capeFlying = false;
  p.facing = 1;
  p.crouching = false;
  p.skidding = false;

  let tapeBonus = 1000;
  if (cutTape) {
    const rel = 1 - Math.max(0, Math.min(1, (gt.barY - gt.y) / gt.height));
    const goalStars = Math.max(1, Math.round(rel * 50));
    tapeBonus = goalStars * 200;
    if (goalStars >= 40) {
      world.lives += 1;
      events.push({ type: 'sfx', id: 'one_up' });
      spawnText(world, p.x - 10, p.y - 28, `★${goalStars} META ALTA 1-UP!`, '#fde047');
    } else {
      spawnText(world, p.x - 10, p.y - 26, `★${goalStars} ESTRELLAS +${tapeBonus}`, '#fde047');
    }
    spawnSparks(world, gt.x + 14, gt.barY, '#fde047', 12);
  } else {
    spawnText(world, p.x - 8, p.y - 18, '¡META CRUZADA! +1000', '#4ade80');
  }

  const timeBonus = world.timeLeft * 10;
  addScore(world, tapeBonus + timeBonus);
  events.push({ type: 'bgm', track: null });
  events.push({ type: 'sfx', id: 'stage_clear' });
  events.push({ type: 'haptic', kind: 'success' });
}

function advanceOrWinStage(world: WorldState, events: GameEvent[]): void {
  events.push({
    type: 'stage_cleared',
    partition: world.partition,
    levelIndex: world.levelIndex,
    score: world.score,
    coins: world.coins,
  });

  if (world.levelIndex < world.totalStagesInPartition - 1) {
    // El portal secreto salta directo al castillo del mundo
    const nextIdx = world.warpTo ?? world.levelIndex + 1;
    const carryPower = world.player.powerState;
    const carryYoshi = world.player.mountedYoshi;
    const nextWorld = buildWorldState(
      nextIdx,
      {
        score: world.score,
        highScore: world.highScore,
        coins: world.coins,
        lives: world.lives,
        powerState: carryPower,
        mountedYoshi: carryYoshi,
        checkpointX: null,
        checkpointY: null,
        doubleJumpAssist: world.doubleJumpAssist,
      },
      world.partition
    );
    nextWorld.status = 'stage_intro';
    nextWorld.statusTimer = 85;
    Object.assign(world, nextWorld);
    events.push({ type: 'bgm', track: BIOMES[world.biomeId].bgm });
  } else {
    world.status = 'victory';
    events.push({ type: 'bgm', track: null });
  }
}

export function stepWorld(
  world: WorldState,
  rawInput: Partial<InputState>,
  viewportWorldWidth: number
): GameEvent[] {
  const input: InputState = {
    left: Boolean(rawInput.left),
    right: Boolean(rawInput.right),
    up: Boolean(rawInput.up),
    down: Boolean(rawInput.down),
    jump: Boolean(rawInput.jump),
    run: Boolean(rawInput.run),
    fire: Boolean(rawInput.fire),
    spin: Boolean(rawInput.spin),
  };

  const events: GameEvent[] = [];
  world.frameCount += 1;
  if (world.screenShake > 0) {
    world.screenShake = Math.max(0, world.screenShake - 0.75);
  }

  updateParticlesAndTexts(world);

  // Stage Intro Banner countdown
  if (world.status === 'stage_intro') {
    world.statusTimer -= 1;
    if (world.statusTimer <= 0) {
      world.status = 'playing';
      events.push({ type: 'bgm', track: BIOMES[world.biomeId].bgm });
    }
    return events;
  }

  // Dying animation & Respawn / Game Over transition
  if (world.status === 'dying') {
    if (world.statusTimer < 92) {
      world.player.vy = Math.min(world.player.vy + 0.46, 11);
      world.player.y += world.player.vy;
    }
    world.statusTimer -= 1;
    if (world.statusTimer <= 0) {
      if (world.lives > 0) {
        const respawnWorld = buildWorldState(
          world.levelIndex,
          {
            score: world.score,
            highScore: world.highScore,
            coins: world.coins,
            lives: world.lives,
            powerState: 0,
            mountedYoshi: false,
            checkpointX: world.checkpointX,
            checkpointY: world.checkpointY,
            doubleJumpAssist: world.doubleJumpAssist,
          },
          world.partition
        );
        respawnWorld.status = 'stage_intro';
        respawnWorld.statusTimer = 70;
        Object.assign(world, respawnWorld);
      } else {
        world.status = 'gameover';
        events.push({ type: 'sfx', id: 'gameover' });
        events.push({ type: 'game_over', partition: world.partition, score: world.score });
      }
    }
    return events;
  }

  // Classic Flagpole slide & walk into brick castle!
  if (world.status === 'flagpole') {
    const p = world.player;
    const fp = world.flagpole;
    if (fp && world.warpTo == null) {
      const groundY = GROUND_ROW * TILE - p.height;
      if (fp.flagY < 10.6 * TILE) {
        fp.flagY += 3.8;
      }
      if (p.y < groundY && world.statusTimer > 85) {
        p.y = Math.min(groundY, p.y + 3.8);
      } else {
        const doorX = fp.castleX + 52;
        if (p.x < doorX) {
          p.y = groundY;
          p.vx = 2.4;
          p.x += p.vx;
          p.animTimer += 0.25;
        } else {
          p.enteringCastle = true;
          p.vx = 0;
        }
      }
    }
    world.statusTimer -= 1;
    if (world.statusTimer <= 0) {
      advanceOrWinStage(world, events);
    }
    return events;
  }

  // SMW Giant Gate Tape Victory Walk!
  if (world.status === 'goal_tape') {
    const p = world.player;
    const gt = world.goalTape;
    const groundY = GROUND_ROW * TILE - p.height;
    if (p.y < groundY) {
      p.vy = Math.min(p.vy + 0.45, 9);
      p.y = Math.min(groundY, p.y + p.vy);
    } else {
      p.y = groundY;
      p.vy = 0;
      const stopX = gt ? gt.castleX + 42 : p.x + 80;
      if (p.x < stopX) {
        p.vx = 2.5;
        p.x += p.vx;
        p.animTimer += 0.26;
      } else {
        p.vx = 0;
      }
    }
    world.statusTimer -= 1;
    if (world.statusTimer <= 0) {
      advanceOrWinStage(world, events);
    }
    return events;
  }

  // Fortress Golden Axe Bridge Collapse Cinematic!
  if (world.status === 'boss_collapse') {
    const boss = world.boss;
    if (boss) {
      boss.bridgeCollapseTimer += 1;
      if (boss.bridgeCols.length > 0 && boss.bridgeCollapseTimer % 4 === 0) {
        const col = boss.bridgeCols.pop()!;
        const blk = world.blockGrid.get(gridKey(col, 10));
        if (blk) {
          spawnSparks(world, blk.x + 16, blk.y + 8, '#fb923c', 6);
          removeBlock(world, blk);
        }
        world.screenShake = 6;
        events.push({ type: 'sfx', id: 'break_block' });
        events.push({ type: 'haptic', kind: 'rigid' });
      } else if (boss.bridgeCols.length === 0 && !boss.defeated) {
        boss.fallingInLava = true;
        boss.vy += 0.55;
        boss.y += boss.vy;
        if (boss.y > LOGICAL_HEIGHT + 24) {
          boss.defeated = true;
          addScore(world, 10000);
          spawnText(world, world.player.x - 16, world.player.y - 24, '+10000 ¡REY CAÍDO!', '#4ade80');
          events.push({ type: 'sfx', id: 'stage_clear' });
          events.push({ type: 'haptic', kind: 'success' });
        }
      }
    }
    world.statusTimer -= 1;
    if (world.statusTimer <= 0) {
      advanceOrWinStage(world, events);
    }
    return events;
  }

  if (world.status !== 'playing') {
    return events;
  }

  const p = world.player;
  const biome = BIOMES[world.biomeId];

  // Level Countdown Timer
  world.timeTick += 1;
  if (world.timeTick >= 38) {
    world.timeTick = 0;
    world.timeLeft = Math.max(0, world.timeLeft - 1);
    if (world.timeLeft === 0) {
      killPlayer(world, events);
      return events;
    }
  }

  // Player Status Timers
  if (p.invulnTimer > 0) p.invulnTimer -= 1;
  if (p.fireCooldown > 0) p.fireCooldown -= 1;
  if (p.throwPoseTimer > 0) p.throwPoseTimer -= 1;
  if (p.capeSpinTimer > 0) p.capeSpinTimer -= 1;
  if (p.yoshiTongueTimer > 0) {
    p.yoshiTongueTimer -= 1;
    p.yoshiTonguePhase += 1;
  }
  if (p.starTimer > 0) {
    p.starTimer -= 1;
    if (world.frameCount % 4 === 0) {
      spawnSparks(world, p.x + p.width / 2, p.y + p.height / 2, '#fef08a', 2);
    }
    if (p.starTimer === 0) {
      events.push({ type: 'bgm', track: biome.bgm });
    }
  }

  // Mecánica del mundo (viento, carámbanos, puentes frágiles, marea de lava)
  updateMechanics(world, events, {
    removeBlock: (b) => removeBlock(world, b),
    damagePlayer: () => damagePlayer(world, events),
    sparks: (x, y, color, count) => spawnSparks(world, x, y, color, count),
  });
  if (p.dead || world.status !== 'playing') return events;

  // Objetivo del nivel (gemas, relojes, sombra que persigue)
  const objectiveCb = {
    killPlayer: () => killPlayer(world, events),
    sparks: (x: number, y: number, color: string, count: number) =>
      spawnSparks(world, x, y, color, count),
    text: (x: number, y: number, text: string, color: string) =>
      spawnText(world, x, y, text, color),
  };
  updateObjectives(world, events, objectiveCb);
  if (p.dead || world.status !== 'playing') return events;

  // Llave, bóveda, tesoro y portal secreto
  updateSecrets(world, events, {
    removeBlock: (b) => removeBlock(world, b),
    sparks: objectiveCb.sparks,
    text: objectiveCb.text,
  }, input.up || input.down);
  if (world.status !== 'playing') return events;

  // Update Moving Platforms first so standing entities inherit delta
  let ridingPlatform: MovingPlatform | null = null;
  for (const pl of world.platforms) {
    const prevX = pl.x;
    const prevY = pl.y;
    pl.phase += pl.speed;
    pl.x = pl.startX + Math.sin(pl.phase) * pl.rangeX;
    pl.y = pl.startY + Math.cos(pl.phase) * pl.rangeY;
    pl.vx = pl.x - prevX;
    pl.vy = pl.y - prevY;

    if (
      p.onGround &&
      isPlatformSolid(pl, world.frameCount) &&
      p.x + p.width > pl.x + 2 &&
      p.x < pl.x + pl.width - 2 &&
      Math.abs(p.y + p.height - prevY) <= 6
    ) {
      ridingPlatform = pl;
    }
  }

  if (ridingPlatform) {
    p.x += ridingPlatform.vx;
    p.y += ridingPlatform.vy;
  }

  // Deslizarse (Fase 4): corriendo + abajo = barrida por el suelo
  const sliding = (p.slideTimer ?? 0) > 0;
  if (
    !sliding &&
    p.onGround &&
    input.down &&
    !p.mountedYoshi &&
    !p.capeFlying &&
    Math.abs(p.vx) >= SLIDE_MIN_SPEED
  ) {
    p.slideTimer = SLIDE_FRAMES;
    p.crouching = true;
    syncStandingHeight(world);
    spawnDust(world, p.x + p.width / 2, p.y + p.height, 5);
    events.push({ type: 'sfx', id: 'skid' });
    events.push({ type: 'haptic', kind: 'light' });
  } else if (sliding) {
    p.slideTimer = (p.slideTimer ?? 0) - 1;
    const wantsJump = input.jump && !world.prevJumpHeld;
    if (p.slideTimer <= 0 || Math.abs(p.vx) < 1.0 || wantsJump) {
      // Intentar ponerse de pie: si hay techo encima, sigue deslizándose
      const keepCrouch = input.down && (p.powerState > 0 || p.mountedYoshi);
      const fullH = keepCrouch ? 32 : p.mountedYoshi ? 52 : p.powerState > 0 ? 46 : 30;
      const deltaH = fullH - p.height;
      const testBox: Rect = { x: p.x + 2, y: p.y - deltaH, width: p.width - 4, height: deltaH };
      const blocked =
        deltaH > 0 &&
        collectNearbySolids(world, testBox, false).some((s) => !s.platform && overlaps(testBox, s));
      if (blocked) {
        p.slideTimer = 2;
        if (Math.abs(p.vx) < 1.6) p.vx = p.facing * 1.6;
      } else {
        p.slideTimer = 0;
        p.crouching = keepCrouch;
        syncStandingHeight(world);
      }
    }
    if ((p.slideTimer ?? 0) > 0 && world.frameCount % 4 === 0) {
      spawnDust(world, p.x + (p.facing === 1 ? 0 : p.width), p.y + p.height, 1);
    }
  }

  // Crouch handling
  const wantsCrouch = input.down && p.onGround && (p.powerState > 0 || p.mountedYoshi);
  if ((p.slideTimer ?? 0) > 0) {
    // El deslizamiento controla la altura
  } else if (wantsCrouch && !p.crouching) {
    p.crouching = true;
    syncStandingHeight(world);
  } else if (!input.down && p.crouching) {
    const fullH = p.mountedYoshi ? 52 : p.powerState > 0 ? 46 : 30;
    const deltaH = fullH - p.height;
    const testBox: Rect = { x: p.x + 2, y: p.y - deltaH, width: p.width - 4, height: deltaH };
    const ceilingHits = collectNearbySolids(world, testBox, false).filter((s) =>
      overlaps(testBox, s)
    );
    if (ceilingHits.length === 0) {
      p.crouching = false;
      syncStandingHeight(world);
    }
  }

  // Edge triggers for Fire (X) and Spin/Tongue (Y)
  const fireTriggered = input.fire && !world.prevFireHeld;
  world.prevFireHeld = input.fire;
  const spinTriggered = input.spin && !world.prevSpinHeld;
  world.prevSpinHeld = input.spin;

  // =========================================================================
  // YOSHI TONGUE / TRIPLE FIRE BREATH & CAPE SPIN TAIL-WHIP!
  // =========================================================================
  if (p.mountedYoshi && (spinTriggered || fireTriggered)) {
    if (p.yoshiMouthItem === 'fire') {
      p.yoshiMouthItem = 'none';
      p.fireCooldown = 14;
      events.push({ type: 'sfx', id: 'yoshi_spit' });
      events.push({ type: 'haptic', kind: 'heavy' });
      const spreadVys = [-2.4, 0.3, 2.8];
      for (const vy of spreadVys) {
        world.fireballs.push({
          x: p.facing === 1 ? p.x + p.width + 10 : p.x - 18,
          y: p.y + 14,
          vx: p.facing * 8.4,
          vy,
          width: 14,
          height: 14,
          bounces: 0,
          animFrame: 0,
          fromYoshi: true,
        });
      }
    } else if (p.yoshiTongueTimer <= 0) {
      p.yoshiTongueTimer = 18;
      p.yoshiTonguePhase = 0;
      events.push({ type: 'sfx', id: 'yoshi_tongue' });
      events.push({ type: 'haptic', kind: 'medium' });
    }
  } else if (
    !p.mountedYoshi &&
    p.powerState === 3 &&
    (fireTriggered || (spinTriggered && !p.onGround)) &&
    p.capeSpinTimer <= 0
  ) {
    // SMW 360-degree Cape Spin Attack!
    p.capeSpinTimer = 16;
    events.push({ type: 'sfx', id: 'cape_spin' });
    events.push({ type: 'haptic', kind: 'medium' });
  } else if (
    fireTriggered &&
    p.powerState === 2 &&
    p.fireCooldown <= 0 &&
    world.fireballs.length < 2
  ) {
    p.fireCooldown = 15;
    p.throwPoseTimer = 10;
    events.push({ type: 'sfx', id: 'fireball' });
    events.push({ type: 'haptic', kind: 'light' });
    world.fireballs.push({
      x: p.facing === 1 ? p.x + p.width + 2 : p.x - 12,
      y: p.y + (p.crouching ? 10 : 14),
      vx: p.facing * 7.8,
      vy: 2.2,
      width: 12,
      height: 12,
      bounces: 0,
      animFrame: 0,
    });
  } else if (fireTriggered && !p.mountedYoshi && p.powerState <= 1) {
    // Llave inglesa (Fase 4): el plomero sin flor ni capa también ataca
    throwWrench(world, events);
  }

  // Active Cape Spin Hitbox: whacks enemies & flips adjacent Rotating/Brick blocks!
  if (p.capeSpinTimer > 0) {
    const capeRect: Rect = {
      x: p.x - 16,
      y: p.y + 6,
      width: p.width + 32,
      height: p.height - 8,
    };
    for (const en of world.enemies) {
      if (en.state !== 'squashed' && en.state !== 'knocked' && overlaps(capeRect, en)) {
        if (en.type === 'piranha' && en.y > en.baseY + en.height - 6) continue;
        knockEnemy(world, en, 0, events);
      }
    }
    if (p.capeSpinTimer === 14) {
      const sideCols = [
        Math.floor((p.x - 14) / TILE),
        Math.floor((p.x + p.width + 14) / TILE),
      ];
      const midRow = Math.floor((p.y + p.height * 0.55) / TILE);
      for (const sc of sideCols) {
        const blk = world.blockGrid.get(gridKey(sc, midRow));
        if (blk && (blk.type === 'rotating' || blk.type === 'brick' || blk.type === 'question')) {
          triggerBlockHit(world, blk, true, events);
        }
      }
    }
  }

  // Active Yoshi Tongue Hitbox: eats Berries, Coins, Powerups & Enemies!
  if (p.mountedYoshi && p.yoshiTongueTimer > 0) {
    const progress = 1 - p.yoshiTongueTimer / 18;
    const reach = Math.sin(progress * Math.PI) * 58;
    const tongueX = p.facing === 1 ? p.x + p.width : p.x - reach;
    const tongueRect: Rect = {
      x: tongueX,
      y: p.y + 8,
      width: Math.max(12, reach),
      height: 22,
    };

    for (const br of world.berries) {
      if (!br.eaten && overlaps(tongueRect, br)) {
        br.eaten = true;
        p.berriesEaten += 1;
        awardCoin(world, br.x, br.y, events);
        events.push({ type: 'sfx', id: 'yoshi_swallow' });
        if (p.berriesEaten % 5 === 0) {
          world.lives += 1;
          events.push({ type: 'sfx', id: 'one_up' });
          spawnText(world, p.x, p.y - 18, '¡5 BAYAS 1-UP!', '#4ade80');
        } else {
          spawnText(world, br.x, br.y - 8, '¡ÑAM!', '#f472b6');
        }
      }
    }

    for (const c of world.coinsList) {
      if (!c.collected && overlaps(tongueRect, c)) {
        c.collected = true;
        awardCoin(world, c.x, c.y, events);
      }
    }

    for (let ei = world.enemies.length - 1; ei >= 0; ei--) {
      const en = world.enemies[ei];
      if (en.state === 'squashed' || en.state === 'knocked') continue;
      if (en.type === 'piranha' && en.y > en.baseY + en.height - 8) continue;
      if (overlaps(tongueRect, en)) {
        const grantsFire =
          en.type === 'koopa_red' ||
          en.type === 'paratroopa' ||
          en.state === 'shell_idle' ||
          en.state === 'shell_slide';
        world.enemies.splice(ei, 1);
        addScore(world, 400);
        p.yoshiTongueTimer = Math.min(p.yoshiTongueTimer, 4);
        events.push({ type: 'sfx', id: 'yoshi_swallow' });
        events.push({ type: 'haptic', kind: 'medium' });
        if (grantsFire) {
          p.yoshiMouthItem = 'fire';
          spawnText(world, p.x - 10, p.y - 16, '¡FUEGO YOSHI! (PULSA Y)', '#fb923c');
        } else {
          awardCoin(world, p.x + 8, p.y, events);
        }
        break;
      }
    }
  }

  // =========================================================================
  // 1. HORIZONTAL MOVEMENT, SPRINT, P-METER & CAPE SWOOP AERODYNAMICS
  // =========================================================================
  const sprinting = input.run || input.fire;
  const starBoost = p.starTimer > 0 ? 1.15 : 1.0;
  const yoshiBoost = p.mountedYoshi ? 1.05 : 1.0;
  const maxSpeed = (sprinting ? 5.8 : 3.7) * starBoost * yoshiBoost;
  const groundAccel = biome.slippery
    ? sprinting
      ? 0.24
      : 0.19
    : sprinting
    ? 0.46
    : 0.36;
  const airAccel = p.capeFlying ? 0.22 : 0.28;
  const accel = p.onGround ? groundAccel : airAccel;
  const groundFriction = biome.slippery ? 0.945 : 0.82;

  // SMW P-Meter Charge (`0..112`)
  if (p.onGround && sprinting && Math.abs(p.vx) >= 4.5 && !p.crouching) {
    p.pMeter = Math.min(112, p.pMeter + 2.2);
  } else if (!p.capeFlying) {
    p.pMeter = Math.max(0, p.pMeter - 1.3);
  }

  // Tras un salto en pared, unos frames sin poder volver hacia esa pared
  if ((p.wallJumpLock ?? 0) > 0) {
    p.wallJumpLock = (p.wallJumpLock ?? 0) - 1;
    if (p.wallJumpLockDir === 1) input.right = false;
    if (p.wallJumpLockDir === -1) input.left = false;
  }
  const slideVx = (p.slideTimer ?? 0) > 0 ? p.vx : null;

  p.skidding = false;
  if (!p.crouching) {
    // True SMW Cape Dive & Pull-Back Swoop when flying!
    if (p.capeFlying && !p.onGround) {
      const pullingBack =
        (p.facing === 1 && input.left && !input.right) ||
        (p.facing === -1 && input.right && !input.left) ||
        input.up;
      const divingForward =
        (p.facing === 1 && input.right) || (p.facing === -1 && input.left);

      if (divingForward && p.vy > 0) {
        p.capeDiveSpeed = Math.min(9.6, p.capeDiveSpeed + 0.38);
        p.vx = p.facing * Math.min(6.4, Math.abs(p.vx) + 0.25);
      } else if (pullingBack && (p.capeDiveSpeed > 1.8 || p.vy > 1.5)) {
        const lift = Math.max(7.8, p.capeDiveSpeed * 1.08);
        p.vy = -lift;
        p.vx = p.facing * 5.2;
        p.capeDiveSpeed = 0;
        events.push({ type: 'sfx', id: 'cape_spin' });
        events.push({ type: 'haptic', kind: 'medium' });
        spawnDust(world, p.x + p.width / 2, p.y + p.height, 4);
      } else {
        p.vx = p.facing * Math.max(4.4, Math.abs(p.vx) * 0.992);
      }
    } else if (input.left && !input.right) {
      if (p.onGround && p.vx > 1.6) {
        p.skidding = true;
        p.vx -= biome.slippery ? 0.28 : 0.58;
        if (world.frameCount % 4 === 0) {
          spawnDust(world, p.x + p.width, p.y + p.height, 2);
          events.push({ type: 'sfx', id: 'skid' });
        }
      } else {
        p.vx = Math.max(p.vx - accel, -maxSpeed);
      }
      p.facing = -1;
    } else if (input.right && !input.left) {
      if (p.onGround && p.vx < -1.6) {
        p.skidding = true;
        p.vx += biome.slippery ? 0.28 : 0.58;
        if (world.frameCount % 4 === 0) {
          spawnDust(world, p.x, p.y + p.height, 2);
          events.push({ type: 'sfx', id: 'skid' });
        }
      } else {
        p.vx = Math.min(p.vx + accel, maxSpeed);
      }
      p.facing = 1;
    } else {
      p.vx *= p.onGround ? groundFriction : 0.95;
      if (Math.abs(p.vx) < 0.08) p.vx = 0;
    }
  } else {
    p.vx *= biome.slippery ? 0.96 : 0.88;
    if (Math.abs(p.vx) < 0.08) p.vx = 0;
  }

  // Deslizándose se conserva el impulso con poco roce
  if (slideVx !== null) p.vx = slideVx * SLIDE_FRICTION;

  // Ráfagas de viento (Mundo 2): empujan más en el aire que en el suelo
  const windAccel = windPush(world, p.onGround);
  if (windAccel !== 0) {
    const cap = maxSpeed + 1.6;
    p.vx = Math.max(-cap, Math.min(cap, p.vx + windAccel));
  }

  p.x += p.vx;
  const maxWorldX = world.totalCols * TILE - p.width;
  if (p.x < 0) {
    p.x = 0;
    if (p.vx < 0) p.vx = 0;
  } else if (p.x > maxWorldX) {
    p.x = maxWorldX;
    if (p.vx > 0) p.vx = 0;
  }

  const horizSolids = collectNearbySolids(world, p, false);
  let wallTouch: -1 | 0 | 1 = 0;
  for (const s of horizSolids) {
    if (overlaps(p, s)) {
      if (!s.platform && p.vx !== 0) wallTouch = p.vx > 0 ? 1 : -1;
      if (p.vx > 0) {
        p.x = s.x - p.width;
        p.vx = 0;
        p.capeFlying = false;
      } else if (p.vx < 0) {
        p.x = s.x + s.width;
        p.vx = 0;
        p.capeFlying = false;
      }
    }
  }

  // Pegado a una pared en el aire (empujando hacia ella) -> puede saltar en pared
  const pushingWall = (wallTouch === 1 && input.right) || (wallTouch === -1 && input.left);
  p.wallDir =
    !p.onGround && pushingWall && !p.mountedYoshi && !p.capeFlying && !((p.slideTimer ?? 0) > 0)
      ? wallTouch
      : 0;
  if (p.wallDir) {
    p.wallCoyote = WALL_COYOTE;
    p.lastWallDir = p.wallDir;
  } else if (!p.onGround && (p.wallCoyote ?? 0) > 0) {
    p.wallCoyote = (p.wallCoyote ?? 0) - 1;
  } else {
    p.wallCoyote = 0;
  }

  // =========================================================================
  // 2. COYOTE TIME, JUMP, SPIN JUMP, CAPE FLIGHT & PARACHUTE GLIDE
  // =========================================================================
  const jumpJustPressed = input.jump && !world.prevJumpHeld;
  world.prevJumpHeld = input.jump;

  if (p.onGround) {
    p.coyoteTimer = 6;
    p.airJumpsLeft = world.doubleJumpAssist ? 1 : 0;
    p.stompCombo = 0;
    p.capeFlying = false;
    p.capeDiveSpeed = 0;
    p.spinJumping = false;
  } else if (p.coyoteTimer > 0) {
    p.coyoteTimer -= 1;
  }

  if (jumpJustPressed) {
    p.jumpBufferTimer = 7;
  } else if (p.jumpBufferTimer > 0) {
    p.jumpBufferTimer -= 1;
  }

  // Salto en pared (Fase 4): rebota hacia el lado contrario
  const wallJumpDir = p.wallDir || ((p.wallCoyote ?? 0) > 0 ? p.lastWallDir ?? 0 : 0);
  if (jumpJustPressed && !p.onGround && p.coyoteTimer <= 0 && wallJumpDir) {
    const away: -1 | 1 = wallJumpDir === 1 ? -1 : 1;
    p.vy = WALL_JUMP_VY;
    p.vx = away * WALL_JUMP_VX;
    p.facing = away;
    p.wallJumpLock = WALL_JUMP_LOCK;
    p.wallJumpLockDir = wallJumpDir;
    p.wallDir = 0;
    p.wallCoyote = 0;
    p.jumpBufferTimer = 0;
    p.spinJumping = false;
    spawnDust(world, p.x + (away === 1 ? 0 : p.width), p.y + p.height / 2, 4);
    events.push({ type: 'sfx', id: 'jump' });
    events.push({ type: 'haptic', kind: 'medium' });
  } else if (p.mountedYoshi && input.up && jumpJustPressed) {
    p.mountedYoshi = false;
    syncStandingHeight(world);
    p.vy = -12.8;
    p.onGround = false;
    p.jumpBufferTimer = 0;
    events.push({ type: 'sfx', id: 'spin_jump' });
    events.push({ type: 'haptic', kind: 'medium' });
    world.yoshis.push({
      id: world.nextEntityId++,
      x: p.x - 4,
      y: p.y + 8,
      vx: 0,
      vy: 1,
      width: 34,
      height: 44,
      facing: p.facing,
      onGround: false,
      state: 'idle',
      stateTimer: 0,
      animTimer: 0,
    });
  } else if (!p.mountedYoshi && spinTriggered && p.coyoteTimer > 0) {
    // SMW Spin Jump from ground via Y button!
    p.vy = -10.4;
    p.onGround = false;
    p.coyoteTimer = 0;
    p.spinJumping = true;
    if (p.powerState === 3) p.capeSpinTimer = 18;
    spawnDust(world, p.x + p.width / 2, p.y + p.height, 4);
    events.push({ type: 'sfx', id: 'spin_jump' });
    events.push({ type: 'haptic', kind: 'medium' });
  } else if (p.jumpBufferTimer > 0 && p.coyoteTimer > 0) {
    const speedRatio = Math.min(1, Math.abs(p.vx) / 5.5);
    // Full P-Meter + Cape Feather -> SMW Superhero Cape Takeoff!
    if (p.powerState === 3 && p.pMeter >= 108) {
      p.vy = -12.4;
      p.capeFlying = true;
      p.capeFlightTimer = 220;
      p.capeDiveSpeed = 4.2;
      events.push({ type: 'sfx', id: 'cape_spin' });
      events.push({ type: 'haptic', kind: 'heavy' });
      spawnSparks(world, p.x + p.width / 2, p.y + p.height, '#fde047', 6);
    } else {
      p.vy = -10.65 - speedRatio * 1.35;
      events.push({ type: 'sfx', id: p.powerState > 0 ? 'jump_big' : 'jump' });
      events.push({ type: 'haptic', kind: 'light' });
    }
    p.onGround = false;
    p.coyoteTimer = 0;
    p.jumpBufferTimer = 0;
    spawnDust(world, p.x + p.width / 2, p.y + p.height, 3);
  } else if (jumpJustPressed && !p.onGround && p.coyoteTimer <= 0 && p.airJumpsLeft > 0) {
    p.vy = -10.1;
    p.airJumpsLeft -= 1;
    p.jumpBufferTimer = 0;
    spawnDust(world, p.x + p.width / 2, p.y + p.height, 5);
    events.push({ type: 'sfx', id: 'jump' });
    events.push({ type: 'haptic', kind: 'medium' });
  }

  if (p.capeFlightTimer > 0) {
    p.capeFlightTimer -= 1;
    if (p.capeFlightTimer === 0) {
      p.pMeter = Math.min(p.pMeter, 72);
    }
  }

  if (!input.jump && p.vy < -4.2 && !p.capeFlying) {
    p.vy *= 0.62;
  }

  // Gravity + Cape Flight / Parachute Slow-Fall
  let gravity =
    input.jump && Math.abs(p.vy) < 2.3
      ? 0.27
      : p.vy < 0
      ? 0.45
      : 0.58;

  if (p.capeFlying && p.capeFlightTimer > 165 && input.jump) {
    gravity = 0.19; // High rocket climb right after P-Meter takeoff!
  } else if (p.capeFlying) {
    gravity = 0.26;
  }

  // Zonas de gravedad baja (Mundo 6): saltos lentos y flotantes
  const lowGrav = isInLowGrav(world, p.x + p.width / 2);
  if (lowGrav) gravity *= 0.5;
  p.vy = Math.min(p.vy + gravity, lowGrav ? 5.5 : 12.2);
  // Deslizarse por la pared: cae lento
  if (p.wallDir && p.vy > WALL_SLIDE_SPEED) {
    p.vy = WALL_SLIDE_SPEED;
    if (world.frameCount % 6 === 0) {
      spawnDust(world, p.x + (p.wallDir === 1 ? p.width : 0), p.y + p.height * 0.6, 1);
    }
  }

  // SMW Cape Parachute Glide: holding A while falling billows the yellow cape!
  if (p.powerState === 3 && !p.onGround && input.jump && !p.capeFlying && p.vy > 1.85) {
    p.vy = 1.85;
  }

  const prevY = p.y;
  p.y += p.vy;
  p.onGround = false;

  const vertSolids = collectNearbySolids(world, p, p.vy < 0);
  for (const s of vertSolids) {
    if (!overlaps(p, s)) continue;

    if (p.vy > 0) {
      if (s.block?.type === 'hidden') continue;
      if (s.platform && prevY + p.height > s.y + 10) continue;

      // Spin-jumping onto Rotating or Brick blocks as Super/Cape shatters them from above!
      if (
        p.spinJumping &&
        p.powerState > 0 &&
        s.block &&
        (s.block.type === 'rotating' || s.block.type === 'brick') &&
        s.block.content === null
      ) {
        triggerBlockHit(world, s.block, true, events);
        p.vy = -7.8;
        continue;
      }

      p.y = s.y - p.height;
      p.vy = 0;
      p.onGround = true;
    } else if (p.vy < 0) {
      if (s.platform) continue;
      if (s.block?.type === 'hidden' && prevY < s.y + s.height - 8) continue;

      if (s.block && s.block.type !== 'hidden') {
        const rightOverlap = p.x + p.width - s.x;
        const leftOverlap = s.x + s.width - p.x;
        const cornerMargin = 7;
        if (rightOverlap > 0 && rightOverlap <= cornerMargin) {
          const nudgeBox = { ...p, x: s.x - p.width };
          const blocked = vertSolids.some((other) => other !== s && overlaps(nudgeBox, other));
          if (!blocked) {
            p.x = s.x - p.width;
            continue;
          }
        } else if (leftOverlap > 0 && leftOverlap <= cornerMargin) {
          const nudgeBox = { ...p, x: s.x + s.width };
          const blocked = vertSolids.some((other) => other !== s && overlaps(nudgeBox, other));
          if (!blocked) {
            p.x = s.x + s.width;
            continue;
          }
        }
      }

      p.y = s.y + s.height;
      p.vy = 0;
      if (s.block) {
        triggerBlockHit(world, s.block, false, events);
      } else {
        events.push({ type: 'sfx', id: 'bump' });
      }
    }
  }

  // Walk animation clock
  if (p.onGround && Math.abs(p.vx) > 0.2) {
    p.animTimer += Math.abs(p.vx) * 0.085;
  } else if (!p.onGround && p.mountedYoshi) {
    p.animTimer += 0.12;
  } else {
    p.animTimer = 0;
  }

  // Pit / Lava death check
  const playerFootCol = Math.floor((p.x + p.width / 2) / TILE);
  if (
    p.y > LOGICAL_HEIGHT + 24 ||
    (world.lavaCols.has(playerFootCol) && p.y + p.height >= lavaSurfaceY(world, playerFootCol))
  ) {
    killPlayer(world, events);
    return events;
  }

  // =========================================================================
  // BIDIRECTIONAL SAFE-ZONE CAMERA (Guarantees ZERO D-Pad or Button Occlusion!)
  // =========================================================================
  const minCam = MIN_CAMERA_WORLD_X; // -224 keeps col 0 well to the right of the left D-Pad!
  const maxCam = Math.max(minCam, (world.totalCols + 6) * TILE - viewportWorldWidth);
  const lookAhead = p.facing === 1 ? 36 : -28;
  const desiredCam = p.x + lookAhead - viewportWorldWidth * 0.4;
  let nextCam = world.cameraX + (desiredCam - world.cameraX) * 0.22;

  // Enforce strict left/right safe margins so Plomero NEVER enters control zones!
  const leftSafeMargin = Math.min(220, viewportWorldWidth * 0.28);
  const rightSafeMargin = Math.min(244, viewportWorldWidth * 0.31);
  if (p.x - nextCam < leftSafeMargin) {
    nextCam = p.x - leftSafeMargin;
  } else if (p.x + p.width - nextCam > viewportWorldWidth - rightSafeMargin) {
    nextCam = p.x + p.width + rightSafeMargin - viewportWorldWidth;
  }
  world.cameraX = Math.max(minCam, Math.min(maxCam, nextCam));

  // =========================================================================
  // 3. SPRINGS, CHECKPOINT, BLOCK BOUNCES/SPINS, COINS & DRAGON COINS
  // =========================================================================
  for (const sp of world.springs) {
    if (sp.compressTimer > 0) sp.compressTimer -= 1;
    if (p.vy >= 0 && overlaps(p, sp) && prevY + p.height <= sp.y + 18) {
      sp.compressTimer = 14;
      p.y = sp.y - p.height;
      p.vy =
        sp.kind === 'mushroom' ? (input.jump ? -16.6 : -13.6) : input.jump ? -15.4 : -12.2;
      p.onGround = false;
      p.stompCombo = 0;
      events.push({ type: 'sfx', id: 'spring' });
      events.push({ type: 'haptic', kind: 'rigid' });
      spawnDust(world, sp.x + sp.width / 2, sp.y + sp.height, 5);
    }
  }

  if (world.checkpoint && !world.checkpoint.activated && overlaps(p, world.checkpoint)) {
    world.checkpoint.activated = true;
    world.checkpointX = world.checkpoint.x;
    world.checkpointY = world.checkpoint.y;
    addScore(world, 1000);
    if (p.powerState === 0) {
      p.powerState = 1;
      syncStandingHeight(world);
    }
    spawnText(world, world.checkpoint.x - 12, world.checkpoint.y - 10, '¡CHECKPOINT!', '#38bdf8');
    spawnSparks(world, world.checkpoint.x + 10, world.checkpoint.y + 12, '#38bdf8', 8);
    events.push({ type: 'sfx', id: 'checkpoint' });
    events.push({ type: 'haptic', kind: 'success' });
  }

  for (const b of world.blocks) {
    if (b.spinTimer > 0) {
      b.spinTimer -= 1;
    }
    if (b.bounceVel !== 0 || b.bounceY !== 0) {
      b.bounceY += b.bounceVel;
      b.bounceVel += 0.85;
      if (b.bounceY >= 0) {
        b.bounceY = 0;
        b.bounceVel = 0;
      }
      b.y = b.baseY + b.bounceY;
    }
  }

  for (const c of world.coinsList) {
    if (!c.collected && overlaps(p, c)) {
      c.collected = true;
      awardCoin(world, c.x, c.y, events);
    }
  }

  // SMW Dragon / Yoshi Coins (5 per stage -> 5th awards 1-UP!)
  for (const dc of world.dragonCoins) {
    if (!dc.collected && overlaps(p, dc)) {
      dc.collected = true;
      const idx = Math.min(DRAGON_COIN_POINTS.length - 1, world.dragonCoinsCollected);
      world.dragonCoinsCollected += 1;
      const pts = DRAGON_COIN_POINTS[idx];
      addScore(world, pts);
      spawnSparks(world, dc.x + 12, dc.y + 18, '#fde047', 10);
      if (world.dragonCoinsCollected >= 5) {
        world.lives += 1;
        events.push({ type: 'sfx', id: 'one_up' });
        events.push({ type: 'haptic', kind: 'success' });
        spawnText(world, dc.x - 10, dc.y - 10, '◆ 5/5 ¡1-UP YOSHI!', '#4ade80');
      } else {
        events.push({ type: 'sfx', id: 'dragon_coin' });
        events.push({ type: 'haptic', kind: 'medium' });
        spawnText(
          world,
          dc.x - 6,
          dc.y - 8,
          `◆ ${world.dragonCoinsCollected}/5 +${pts}`,
          '#fde047'
        );
      }
    }
  }

  // Riding Yoshi also snacks on Red Berries directly on body contact!
  if (p.mountedYoshi) {
    for (const br of world.berries) {
      if (!br.eaten && overlaps(p, br)) {
        br.eaten = true;
        p.berriesEaten += 1;
        awardCoin(world, br.x, br.y, events);
        events.push({ type: 'sfx', id: 'yoshi_swallow' });
        if (p.berriesEaten % 5 === 0) {
          world.lives += 1;
          events.push({ type: 'sfx', id: 'one_up' });
          spawnText(world, p.x, p.y - 16, '¡5 BAYAS 1-UP!', '#4ade80');
        }
      }
    }
  }

  // =========================================================================
  // 4. UNMOUNTED YOSHIS (Egg Hatching, Idle Waiting, Runaway Panic & Mounting!)
  // =========================================================================
  for (let yi = world.yoshis.length - 1; yi >= 0; yi--) {
    const yo = world.yoshis[yi];
    yo.animTimer += 1;

    if (yo.state === 'hatching') {
      yo.stateTimer -= 1;
      if (yo.stateTimer <= 0) {
        yo.state = 'idle';
        // Hatched Yoshi hops off the [?] block toward the player and lands on the ground!
        yo.facing = p.x + p.width / 2 < yo.x + yo.width / 2 ? -1 : 1;
        yo.vx = yo.facing * 2.6;
        yo.vy = -4.2;
        events.push({ type: 'sfx', id: 'yoshi_mount' });
        spawnText(world, yo.x - 4, yo.y - 10, '¡YOSHI!', '#4ade80');
      }
      continue;
    }

    if (yo.state === 'panic') {
      yo.stateTimer -= 1;
      if (Math.abs(yo.vx) < 2.2) yo.vx = yo.facing * 2.5;
    } else if (yo.onGround) {
      // Idle Yoshi settles and waits patiently for Plomero
      yo.vx *= 0.82;
      if (Math.abs(yo.vx) < 0.05) yo.vx = 0;
    }

    yo.vy = Math.min(yo.vy + 0.45, 10);
    yo.x += yo.vx;
    if (yo.x < 0) {
      yo.x = 0;
      yo.vx *= -1;
    }
    const yoSolidsX = collectNearbySolids(world, yo, false);
    for (const s of yoSolidsX) {
      if (overlaps(yo, s)) {
        yo.x = yo.vx >= 0 ? s.x - yo.width : s.x + s.width;
        yo.vx *= -1;
        yo.facing = yo.vx >= 0 ? 1 : -1;
      }
    }

    yo.y += yo.vy;
    yo.onGround = false;
    const yoSolidsY = collectNearbySolids(world, yo, false);
    for (const s of yoSolidsY) {
      if (overlaps(yo, s) && yo.vy > 0) {
        yo.y = s.y - yo.height;
        yo.vy = 0;
        yo.onGround = true;
      }
    }

    // Player mounts Yoshi on contact (once invuln frames after a dismount clear < 75)!
    if (!p.mountedYoshi && p.invulnTimer < 75 && overlaps(p, yo)) {
      p.mountedYoshi = true;
      p.spinJumping = false;
      syncStandingHeight(world);
      addScore(world, 1000);
      events.push({ type: 'sfx', id: 'yoshi_mount' });
      events.push({ type: 'haptic', kind: 'success' });
      spawnSparks(world, yo.x + 17, yo.y + 20, '#4ade80', 8);
      spawnText(world, p.x - 6, p.y - 14, '¡VAMOS YOSHI!', '#4ade80');
      world.yoshis.splice(yi, 1);
      continue;
    }

    if (yo.y > LOGICAL_HEIGHT + 64 || (yo.state === 'panic' && yo.stateTimer <= 0)) {
      world.yoshis.splice(yi, 1);
    }
  }

  // =========================================================================
  // 5. POWERUPS (Mushroom, Fire Flower, SMW Cape Feather, Starman, 1-UP)
  // =========================================================================
  for (let i = world.powerups.length - 1; i >= 0; i--) {
    const pw = world.powerups[i];
    if (pw.spawning) {
      pw.y -= pw.kind === 'feather' ? 2.4 : 1.2;
      if (pw.y <= pw.spawnStartY) {
        pw.y = pw.spawnStartY;
        pw.spawning = false;
      }
    } else if (pw.kind === 'feather') {
      // Gentle swaying SMW Cape Feather descent!
      pw.swayPhase += 0.08;
      pw.vx = Math.cos(pw.swayPhase) * 1.65;
      pw.vy = pw.onGround ? 0 : 0.9;
      pw.x += pw.vx;
      pw.y += pw.vy;
      const pwSolidsY = collectNearbySolids(world, pw, false);
      for (const s of pwSolidsY) {
        if (overlaps(pw, s) && pw.vy > 0) {
          pw.y = s.y - pw.height;
          pw.vy = 0;
          pw.onGround = true;
        }
      }
    } else {
      pw.vy = Math.min(pw.vy + 0.42, 9.5);
      pw.x += pw.vx;
      const pwSolidsX = collectNearbySolids(world, pw, false);
      for (const s of pwSolidsX) {
        if (overlaps(pw, s)) {
          pw.x = pw.vx > 0 ? s.x - pw.width : s.x + s.width;
          pw.vx *= -1;
        }
      }
      pw.y += pw.vy;
      pw.onGround = false;
      const pwSolidsY = collectNearbySolids(world, pw, false);
      for (const s of pwSolidsY) {
        if (overlaps(pw, s) && pw.vy > 0) {
          pw.y = s.y - pw.height;
          pw.vy = pw.kind === 'star' ? -7.6 : 0;
          pw.onGround = true;
        }
      }
    }

    if (overlaps(p, pw)) {
      if (pw.kind === 'one_up') {
        world.lives += 1;
        addScore(world, 1000);
        events.push({ type: 'sfx', id: 'one_up' });
        events.push({ type: 'haptic', kind: 'success' });
        spawnText(world, p.x, p.y - 12, '1-UP!', '#4ade80');
      } else if (pw.kind === 'star') {
        addScore(world, 1000);
        p.starTimer = 600;
        events.push({ type: 'sfx', id: 'powerup_collect' });
        events.push({ type: 'bgm', track: 'starman' });
        events.push({ type: 'haptic', kind: 'success' });
        spawnText(world, p.x, p.y - 12, '¡ESTRELLA!', '#fef08a');
      } else if (pw.kind === 'feather') {
        addScore(world, 1000);
        p.powerState = 3;
        syncStandingHeight(world);
        events.push({ type: 'sfx', id: 'feather_get' });
        events.push({ type: 'haptic', kind: 'success' });
        spawnText(world, p.x - 8, p.y - 14, '¡CAPA DE VUELO!', '#fde047');
      } else if (pw.kind === 'mushroom') {
        addScore(world, 1000);
        if (p.powerState === 0) {
          p.powerState = 1;
          syncStandingHeight(world);
        }
        events.push({ type: 'sfx', id: 'powerup_collect' });
        events.push({ type: 'haptic', kind: 'success' });
        spawnText(world, p.x, p.y - 12, '¡SUPER! +1000', '#4ade80');
      } else {
        addScore(world, 1000);
        p.powerState = 2;
        syncStandingHeight(world);
        events.push({ type: 'sfx', id: 'powerup_collect' });
        events.push({ type: 'haptic', kind: 'success' });
        spawnText(world, p.x, p.y - 12, '¡FLOR FUEGO!', '#fb923c');
      }
      spawnSparks(world, pw.x + 13, pw.y + 13, '#fef08a', 8);
      world.powerups.splice(i, 1);
      continue;
    }

    if (pw.y > LOGICAL_HEIGHT + 48) {
      world.powerups.splice(i, 1);
    }
  }

  // =========================================================================
  // 6. FIREBALLS (Player Fire Flower + Yoshi Triple Fire Breath!)
  // =========================================================================
  for (let i = world.fireballs.length - 1; i >= 0; i--) {
    const fb = world.fireballs[i];
    fb.animFrame += 1;
    if (!fb.fromYoshi) {
      fb.vy = Math.min(fb.vy + 0.48, 9);
    }
    fb.x += fb.vx;
    fb.y += fb.vy;

    let explode = false;
    if (!fb.fromYoshi) {
      const fbSolids = collectNearbySolids(world, fb, false);
      for (const s of fbSolids) {
        if (overlaps(fb, s)) {
          if (fb.y + fb.height - fb.vy <= s.y + 6 && fb.vy > 0) {
            fb.y = s.y - fb.height;
            fb.vy = -5.8;
            fb.bounces += 1;
          } else {
            explode = true;
          }
        }
      }
    }

    for (const en of world.enemies) {
      if (en.state !== 'squashed' && en.state !== 'knocked' && overlaps(fb, en)) {
        if (en.type === 'piranha' && en.y > en.baseY + en.height - 6) continue;
        if (!fb.fromYoshi) explode = true;
        knockEnemy(world, en, 0, events);
        if (!fb.fromYoshi) break;
      }
    }

    if (!explode && world.boss && !world.boss.defeated && overlaps(fb, world.boss)) {
      explode = true;
      world.boss.hp -= fb.fromYoshi ? 2 : 1;
      world.boss.hurtFlashTimer = 10;
      events.push({ type: 'sfx', id: 'boss_hit' });
      events.push({ type: 'haptic', kind: 'medium' });
      spawnSparks(world, fb.x, fb.y, '#fb923c', 6);
      if (world.boss.hp <= 0) {
        world.boss.defeated = true;
        addScore(world, 10000);
        spawnText(world, world.boss.x, world.boss.y - 12, '+10000 ¡REY DERROTADO!', '#4ade80');
        spawnSparks(world, world.boss.x + 28, world.boss.y + 28, '#fde047', 12);
        events.push({ type: 'sfx', id: 'boss_roar' });
        events.push({ type: 'haptic', kind: 'heavy' });
      }
    }

    if (
      explode ||
      fb.bounces > 4 ||
      fb.x < world.cameraX - 64 ||
      fb.x > world.cameraX + viewportWorldWidth + 96 ||
      fb.y > LOGICAL_HEIGHT + 24 ||
      fb.y < -32
    ) {
      if (explode) spawnSparks(world, fb.x + 6, fb.y + 6, '#fb923c', 4);
      world.fireballs.splice(i, 1);
    }
  }

  // Llave inglesa en vuelo (Fase 4)
  updateWrench(world, events, {
    knockEnemy: (en) => knockEnemy(world, en, 0, events),
    collectCoin: (x, y) => awardCoin(world, x, y, events),
    hitBlock: (b) => triggerBlockHit(world, b, true, events),
    hitBoss: () => {
      const boss = world.boss;
      if (!boss) return;
      boss.hp -= 1;
      boss.hurtFlashTimer = 10;
      events.push({ type: 'sfx', id: 'boss_hit' });
      events.push({ type: 'haptic', kind: 'medium' });
      if (boss.hp <= 0) {
        boss.defeated = true;
        addScore(world, 10000);
        spawnText(world, boss.x, boss.y - 12, '+10000 ¡REY DERROTADO!', '#4ade80');
        events.push({ type: 'sfx', id: 'boss_roar' });
      }
    },
    sparks: (x, y, color, count) => spawnSparks(world, x, y, color, count),
  });
  updateShaftHints(world, (x, y, text, color) => spawnText(world, x, y, text, color));

  // =========================================================================
  // 7. ENEMIES (Classic + SMW Rex, Galoomba, Chargin' Chuck, Bullet Bill)
  // =========================================================================
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const en = world.enemies[i];

    if (!en.active) {
      if (en.x <= world.cameraX + viewportWorldWidth + 112) {
        en.active = true;
      } else {
        continue;
      }
    }

    if (en.kickGraceTimer > 0) en.kickGraceTimer -= 1;
    en.animTimer += 1;

    if (en.state === 'squashed') {
      en.stateTimer -= 1;
      if (en.stateTimer <= 0) world.enemies.splice(i, 1);
      continue;
    }

    if (en.state === 'knocked') {
      en.x += en.vx;
      en.vy += 0.48;
      en.y += en.vy;
      if (en.y > LOGICAL_HEIGHT + 64) world.enemies.splice(i, 1);
      continue;
    }

    // Bullet Bill: flies straight through air ignoring gravity & blocks!
    if (en.type === 'bullet_bill') {
      en.x += en.vx;
      en.facing = en.vx >= 0 ? 1 : -1;
      if (overlaps(p, en)) {
        const stomping = p.vy > 0 && prevY + p.height <= en.y + 18;
        if (p.starTimer > 0 || stomping || p.spinJumping || p.mountedYoshi) {
          if (stomping || p.spinJumping || p.mountedYoshi) {
            p.vy = input.jump ? -10.6 : -8.2;
          }
          knockEnemy(world, en, p.stompCombo, events);
          p.stompCombo += 1;
        } else {
          damagePlayer(world, events);
        }
      }
      if (en.x < world.cameraX - 280) {
        world.enemies.splice(i, 1);
      }
      continue;
    }

    // Piranha Plant vertical pipe cycle
    if (en.type === 'piranha') {
      en.stateTimer = (en.stateTimer + 1) % 200;
      const hiddenY = en.baseY + en.height + 6;
      const playerNearPipe = Math.abs(p.x + p.width / 2 - (en.x + en.width / 2)) < 48;

      if (en.stateTimer < 45) {
        if (playerNearPipe && en.y >= hiddenY - 4) {
          en.stateTimer = 0;
          en.y = hiddenY;
        } else {
          en.y = Math.max(en.baseY, en.y - 1.25);
        }
      } else if (en.stateTimer < 105) {
        en.y = en.baseY;
      } else if (en.stateTimer < 150) {
        en.y = Math.min(hiddenY, en.y + 1.25);
      } else {
        en.y = hiddenY;
      }

      const exposedH = hiddenY - en.y;
      if (exposedH > 8) {
        const piranhaHitbox: Rect = {
          x: en.x + 3,
          y: en.y + 4,
          width: en.width - 6,
          height: exposedH - 4,
        };
        if (overlaps(p, piranhaHitbox)) {
          if (p.starTimer > 0) {
            knockEnemy(world, en, 0, events);
          } else {
            damagePlayer(world, events);
          }
        }
      }
      continue;
    }

    // Chargin' Chuck AI: faces Plomero, sprints to tackle & periodically leaps!
    if (en.type === 'chuck') {
      en.stateTimer += 1;
      const targetDir = p.x < en.x ? -1 : 1;
      en.vx += targetDir * 0.09;
      en.vx = Math.max(-2.6, Math.min(2.6, en.vx));
      if (en.onGround && en.stateTimer % 85 === 0) {
        en.vy = -7.8;
        en.onGround = false;
      }
    }

    // Idle Koopa Shell wake-up countdown
    if (en.state === 'shell_idle' || en.state === 'shell_wake') {
      en.stateTimer += 1;
      if (en.stateTimer > 240) {
        en.state = 'shell_wake';
      }
      if (en.stateTimer > 320) {
        en.state = 'walk';
        en.y -= 12;
        en.height = 38;
        en.vx = p.x < en.x ? -1.2 : 1.2;
        en.facing = en.vx >= 0 ? 1 : -1;
        en.stateTimer = 0;
      }
    }

    const isShellSlide = en.state === 'shell_slide';
    en.vy = Math.min(en.vy + (en.type === 'paratroopa' ? 0.3 : 0.46), 10.5);

    if (en.type === 'koopa_red' && en.state === 'walk' && en.onGround) {
      const probeX = en.vx > 0 ? en.x + en.width + 2 : en.x - 4;
      const probeCol = Math.floor(probeX / TILE);
      const footRow = Math.floor((en.y + en.height + 4) / TILE);
      if (!world.blockGrid.has(gridKey(probeCol, footRow))) {
        en.vx *= -1;
      }
    }

    en.x += en.vx;
    if (en.vx !== 0) en.facing = en.vx > 0 ? 1 : -1;

    const enSolidsX = collectNearbySolids(world, en, false);
    for (const s of enSolidsX) {
      if (overlaps(en, s)) {
        en.x = en.vx > 0 ? s.x - en.width : s.x + s.width;
        en.vx *= -1;
        en.facing = en.vx > 0 ? 1 : -1;
        if (isShellSlide) {
          if (s.block) {
            triggerBlockHit(world, s.block, true, events);
          } else {
            events.push({ type: 'sfx', id: 'bump' });
          }
        }
      }
    }

    en.y += en.vy;
    en.onGround = false;
    const enSolidsY = collectNearbySolids(world, en, false);
    for (const s of enSolidsY) {
      if (overlaps(en, s) && en.vy > 0) {
        en.y = s.y - en.height;
        en.onGround = true;
        if (en.type === 'paratroopa') {
          en.vy = -7.2;
          en.onGround = false;
        } else {
          en.vy = 0;
        }
      }
    }

    // Sliding Koopa Shell mows down other enemies
    if (isShellSlide) {
      for (const other of world.enemies) {
        if (
          other !== en &&
          other.type !== 'piranha' &&
          other.state !== 'squashed' &&
          other.state !== 'knocked' &&
          overlaps(en, other)
        ) {
          knockEnemy(world, other, en.shellCombo, events);
          en.shellCombo += 1;
        }
      }
    }

    // Player vs Enemy interaction
    if (overlaps(p, en)) {
      if (p.starTimer > 0) {
        knockEnemy(world, en, p.stompCombo, events);
        p.stompCombo += 1;
        continue;
      }

      if (en.state === 'shell_idle' || en.state === 'shell_wake') {
        const dir = p.x + p.width / 2 <= en.x + en.width / 2 ? 1 : -1;
        en.state = 'shell_slide';
        en.vx = dir * 8.2;
        en.shellCombo = 0;
        en.kickGraceTimer = 10;
        if (p.vy > 0) p.vy = -7.5;
        addScore(world, 400);
        spawnText(world, en.x, en.y - 8, '+400', '#38bdf8');
        events.push({ type: 'sfx', id: 'kick' });
        events.push({ type: 'haptic', kind: 'rigid' });
        continue;
      }

      // Barrida (Fase 4): derriba a los enemigos comunes
      if ((p.slideTimer ?? 0) > 0 && SLIDE_KO.has(en.type)) {
        knockEnemy(world, en, p.stompCombo, events);
        p.stompCombo += 1;
        continue;
      }

      const prevBottom = prevY + p.height;
      const stomping = p.vy > 0 && prevBottom <= en.y + 20;
      const safeSpinyBounce = p.spinJumping || p.mountedYoshi;

      if (stomping && (en.type !== 'spiny' || safeSpinyBounce)) {
        p.vy = input.jump ? -10.4 : -8.0;
        p.airJumpsLeft = world.doubleJumpAssist ? 1 : 0;
        events.push({ type: 'sfx', id: safeSpinyBounce ? 'spin_jump' : 'stomp' });
        events.push({ type: 'haptic', kind: 'medium' });
        awardCombo(world, p.stompCombo, en.x, en.y, events);
        p.stompCombo += 1;
        spawnSparks(world, en.x + en.width / 2, en.y + 4, '#ffffff', 4);

        if (en.type === 'spiny') {
          // Yoshi or Spin Jump bounces safely or crushes Spiny!
          if (p.mountedYoshi) {
            knockEnemy(world, en, p.stompCombo, events);
          }
        } else if (en.type === 'rex' && en.state === 'walk') {
          // 1st stomp on Rex -> squished half-height 2x speed Rex!
          en.state = 'rex_squished';
          en.hp = 1;
          en.y += en.height - 26;
          en.height = 26;
          en.vx = (en.vx >= 0 ? 1 : -1) * 2.35;
        } else if (en.type === 'chuck' && en.hp > 1) {
          en.hp -= 1;
          en.vy = -4.2;
          spawnText(world, en.x, en.y - 10, '¡GOLPE!', '#60a5fa');
        } else if (en.type === 'paratroopa') {
          en.type = 'koopa_red';
          en.vy = 0;
        } else if (en.type === 'koopa_green' || en.type === 'koopa_red') {
          if (en.state === 'walk') {
            en.state = 'shell_idle';
            en.vx = 0;
            en.y += en.height - 26;
            en.height = 26;
            en.stateTimer = 0;
          } else if (en.state === 'shell_slide') {
            en.state = 'shell_idle';
            en.vx = 0;
            en.stateTimer = 0;
          }
        } else {
          en.state = 'squashed';
          en.vx = 0;
          en.stateTimer = 24;
        }
      } else if (en.kickGraceTimer <= 0) {
        damagePlayer(world, events);
      }
    }

    if (en.y > LOGICAL_HEIGHT + 64 || en.x < world.cameraX - 320) {
      world.enemies.splice(i, 1);
    }
  }

  // =========================================================================
  // 8. FORTRESS BOSS (REY KOOPA) & GOLDEN AXE!
  // =========================================================================
  if (world.boss) {
    const boss = world.boss;
    const axeRect: Rect = { x: boss.axeX, y: boss.axeY, width: TILE, height: TILE };

    if (!boss.axeGrabbed && overlaps(p, axeRect)) {
      boss.axeGrabbed = true;
      p.vx = 0;
      p.vy = 0;
      world.bossFires = [];
      world.status = 'boss_collapse';
      world.statusTimer = boss.defeated ? 90 : 165;
      events.push({ type: 'bgm', track: null });
      events.push({ type: 'sfx', id: 'bridge_collapse' });
      events.push({ type: 'haptic', kind: 'heavy' });
      if (boss.defeated) {
        events.push({ type: 'sfx', id: 'stage_clear' });
      }
      return events;
    }

    if (!boss.defeated && boss.x <= world.cameraX + viewportWorldWidth + 120) {
      if (boss.hurtFlashTimer > 0) boss.hurtFlashTimer -= 1;
      if (boss.roarTimer > 0) boss.roarTimer -= 1;

      boss.facing = p.x < boss.x ? -1 : 1;

      if (boss.x < boss.homeX - 3.5 * TILE) boss.vx = 1.15;
      if (boss.x > boss.homeX + 2.5 * TILE) boss.vx = -1.15;
      boss.x += boss.vx;

      boss.jumpTimer -= 1;
      if (boss.jumpTimer <= 0 && boss.onGround) {
        boss.vy = -9.6;
        boss.onGround = false;
        boss.jumpTimer = 85;
      }

      boss.vy = Math.min(boss.vy + 0.34, 8.5);
      boss.y += boss.vy;
      boss.onGround = false;
      const bossSolids = collectNearbySolids(world, boss, false);
      for (const s of bossSolids) {
        if (overlaps(boss, s) && boss.vy > 0) {
          boss.y = s.y - boss.height;
          boss.vy = 0;
          boss.onGround = true;
        }
      }

      boss.fireTimer -= 1;
      if (boss.fireTimer <= 0) {
        boss.roarTimer = 28;
        const worldNum = Math.floor(world.levelIndex / 4) + 1;
        boss.fireTimer = Math.max(58, 118 - worldNum * 9);
        const lanes = [9 * TILE + 6, 8 * TILE + 4, 6.5 * TILE];
        const targetY = lanes[world.frameCount % lanes.length];
        world.bossFires.push({
          x: boss.facing === -1 ? boss.x - 24 : boss.x + boss.width,
          y: boss.y + 18,
          targetY,
          vx: boss.facing * (3.6 + worldNum * 0.25),
          width: 36,
          height: 16,
          animTimer: 0,
        });
        events.push({ type: 'sfx', id: 'boss_roar' });
      }

      if (overlaps(p, boss)) {
        if (p.starTimer > 0) {
          boss.hp -= 1;
          boss.hurtFlashTimer = 10;
          if (boss.hp <= 0) {
            boss.defeated = true;
            addScore(world, 10000);
            spawnText(world, boss.x, boss.y - 12, '+10000', '#4ade80');
          }
        } else {
          damagePlayer(world, events);
        }
      }
    }
  }

  for (let i = world.bossFires.length - 1; i >= 0; i--) {
    const bf = world.bossFires[i];
    bf.animTimer += 1;
    bf.x += bf.vx;
    if (Math.abs(bf.y - bf.targetY) > 1.5) {
      bf.y += bf.y < bf.targetY ? 1.4 : -1.4;
    }
    if (overlaps(p, bf)) {
      if (p.spinJumping && p.vy > 0) {
        p.vy = -8.2;
        events.push({ type: 'sfx', id: 'spin_jump' });
      } else {
        damagePlayer(world, events);
      }
    }
    if (bf.x < world.cameraX - 80 || bf.x > world.cameraX + viewportWorldWidth + 80) {
      world.bossFires.splice(i, 1);
    }
  }

  // Ambient lava sparks on Fortress stages
  if (world.lavaCols.size > 0 && world.frameCount % 9 === 0) {
    const firstVisCol = Math.floor(world.cameraX / TILE);
    for (let c = firstVisCol; c < firstVisCol + 32; c++) {
      if (world.lavaCols.has(c) && (c + world.frameCount) % 13 === 0) {
        world.particles.push({
          x: c * TILE + 16,
          y: GROUND_ROW * TILE + 6,
          vx: (Math.random() - 0.5) * 1.4,
          vy: -3.2 - Math.random() * 2.2,
          gravity: 0.14,
          size: 5,
          color: '#fde047',
          life: 28,
          maxLife: 28,
          kind: 'lava',
        });
      }
    }
  }

  // Meta cerrada si faltan gemas
  enforceGoalLock(world, events, objectiveCb);

  // Classic Flagpole Goal check
  if (world.flagpole && overlaps(p, world.flagpole)) {
    startFlagpoleSequence(world, events);
  }

  // SMW Oscillating Giant Gate Tape check!
  if (world.goalTape && !world.goalTape.triggered) {
    const gt = world.goalTape;
    gt.barY += gt.barVy;
    if (gt.barY <= gt.y + 8) {
      gt.barY = gt.y + 8;
      gt.barVy = Math.abs(gt.barVy);
    } else if (gt.barY >= gt.y + gt.height - 24) {
      gt.barY = gt.y + gt.height - 24;
      gt.barVy = -Math.abs(gt.barVy);
    }

    const barRect: Rect = {
      x: gt.x - 4,
      y: gt.barY - 6,
      width: gt.width + 8,
      height: 16,
    };
    if (overlaps(p, barRect)) {
      startGoalTapeSequence(world, true, events);
    } else if (p.x >= gt.x + 12) {
      startGoalTapeSequence(world, false, events);
    }
  }

  return events;
}

function updateParticlesAndTexts(world: WorldState): void {
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const pt = world.particles[i];
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.vy += pt.gravity;
    pt.life -= 1;
    if (pt.life <= 0) world.particles.splice(i, 1);
  }

  for (let i = world.floatingTexts.length - 1; i >= 0; i--) {
    const ft = world.floatingTexts[i];
    ft.y -= 1.05;
    ft.life -= 1;
    if (ft.life <= 0) world.floatingTexts.splice(i, 1);
  }
}
