import { BIOMES, GROUND_ROW, LOGICAL_HEIGHT, TILE, TOTAL_LEVELS } from './biomes';
import { buildWorldState, gridKey } from '../levels/levelBuilder';
import type {
  Block,
  Enemy,
  GameEvent,
  InputState,
  MovingPlatform,
  WorldState,
} from './types';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const COMBO_POINTS = [200, 400, 800, 1000, 2000, 4000, 8000];

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

export function spawnText(world: WorldState, x: number, y: number, text: string, color: string): void {
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
      results.push({ x: b.x, y: b.y, width: b.width, height: b.height, block: b });
    }
  }

  for (const p of world.pipes) {
    if (p.x + p.width >= box.x - TILE && p.x <= box.x + box.width + TILE) {
      results.push(p);
    }
  }

  for (const pl of world.platforms) {
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
  byShell: boolean,
  events: GameEvent[]
): void {
  if (
    block.type === 'ground_top' ||
    block.type === 'ground_deep' ||
    block.type === 'hard' ||
    block.type === 'empty' ||
    block.type === 'bridge'
  ) {
    if (!byShell) {
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
    } else if (block.content === 'powerup' || block.content === 'star' || block.content === 'one_up') {
      const content = block.content;
      block.type = 'empty';
      block.content = null;
      events.push({ type: 'sfx', id: 'powerup_spawn' });
      events.push({ type: 'haptic', kind: 'medium' });

      const kind =
        content === 'star'
          ? 'star'
          : content === 'one_up'
          ? 'one_up'
          : world.player.powerState >= 1
          ? 'flower'
          : 'mushroom';

      world.powerups.push({
        id: world.nextEntityId++,
        kind,
        x: block.x + 3,
        y: block.baseY - 4,
        spawnStartY: block.baseY - 26,
        spawning: true,
        vx: kind === 'flower' ? 0 : 1.75,
        vy: 0,
        width: 26,
        height: 26,
        onGround: false,
      });
    } else {
      block.type = 'empty';
    }
    return;
  }

  if (block.type === 'brick') {
    if (world.player.powerState > 0 || byShell) {
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

function damagePlayer(world: WorldState, events: GameEvent[]): void {
  const p = world.player;
  if (p.invulnTimer > 0 || p.starTimer > 0 || p.dead) return;

  if (p.powerState > 0) {
    p.powerState = p.powerState === 2 ? 1 : 0;
    const targetH = p.powerState > 0 ? 46 : 30;
    p.y += p.height - targetH;
    p.height = targetH;
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

  // Height-based flagpole bonus (classic NES reward: top = 5000, bottom = 400!)
  const relHeight = 1 - Math.max(0, Math.min(1, (p.y - fp.y) / fp.height));
  const poleBonus = relHeight > 0.85 ? 5000 : relHeight > 0.6 ? 2000 : relHeight > 0.3 ? 800 : 400;
  const timeBonus = world.timeLeft * 10;
  addScore(world, poleBonus + timeBonus);
  spawnText(world, p.x - 8, p.y - 12, `+${poleBonus + timeBonus}`, '#4ade80');
  events.push({ type: 'bgm', track: null });
  events.push({ type: 'sfx', id: 'stage_clear' });
  events.push({ type: 'haptic', kind: 'success' });
}

function advanceOrWinStage(world: WorldState, events: GameEvent[]): void {
  events.push({
    type: 'stage_cleared',
    levelIndex: world.levelIndex,
    score: world.score,
    coins: world.coins,
  });

  if (world.levelIndex < TOTAL_LEVELS - 1) {
    const nextIdx = world.levelIndex + 1;
    const carryPower = world.player.powerState;
    const nextWorld = buildWorldState(nextIdx, {
      score: world.score,
      highScore: world.highScore,
      coins: world.coins,
      lives: world.lives,
      powerState: carryPower,
      checkpointX: null,
      checkpointY: null,
      doubleJumpAssist: world.doubleJumpAssist,
    });
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
  input: InputState,
  viewportWorldWidth: number
): GameEvent[] {
  const events: GameEvent[] = [];
  world.frameCount += 1;
  if (world.screenShake > 0) {
    world.screenShake = Math.max(0, world.screenShake - 0.75);
  }

  // Update particles & floating texts in all non-paused states
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
        const respawnWorld = buildWorldState(world.levelIndex, {
          score: world.score,
          highScore: world.highScore,
          coins: world.coins,
          lives: world.lives,
          powerState: 0,
          checkpointX: world.checkpointX,
          checkpointY: world.checkpointY,
          doubleJumpAssist: world.doubleJumpAssist,
        });
        respawnWorld.status = 'stage_intro';
        respawnWorld.statusTimer = 70;
        Object.assign(world, respawnWorld);
      } else {
        world.status = 'gameover';
        events.push({ type: 'sfx', id: 'gameover' });
        events.push({ type: 'game_over', score: world.score });
      }
    }
    return events;
  }

  // Flagpole slide & walk into brick castle!
  if (world.status === 'flagpole') {
    const p = world.player;
    const fp = world.flagpole;
    if (fp) {
      const groundY = GROUND_ROW * TILE - p.height;
      if (fp.flagY < 10.6 * TILE) {
        fp.flagY += 3.8;
      }
      if (p.y < groundY && world.statusTimer > 85) {
        p.y = Math.min(groundY, p.y + 3.8);
      } else {
        // Walk from flagpole into Castle Door!
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

  // Level Countdown Timer (1 tick every 38 frames ~ classic Mario speed)
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
  if (p.starTimer > 0) {
    p.starTimer -= 1;
    if (world.frameCount % 4 === 0) {
      spawnSparks(world, p.x + p.width / 2, p.y + p.height / 2, '#fef08a', 2);
    }
    if (p.starTimer === 0) {
      events.push({ type: 'bgm', track: biome.bgm });
    }
  }

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

  // Crouch handling for Super / Fire Plomero
  const wantsCrouch = input.down && p.onGround && p.powerState > 0;
  if (wantsCrouch && !p.crouching) {
    p.crouching = true;
    p.y += p.height - 32;
    p.height = 32;
  } else if (!input.down && p.crouching) {
    // Only stand up if ceiling above has room!
    const testBox: Rect = { x: p.x + 2, y: p.y - 14, width: p.width - 4, height: 14 };
    const ceilingHits = collectNearbySolids(world, testBox, false).filter((s) =>
      overlaps(testBox, s)
    );
    if (ceilingHits.length === 0) {
      p.crouching = false;
      p.y -= 46 - p.height;
      p.height = 46;
    }
  }

  // Fireball trigger (either dedicated Fire button OR pressing Run/B fresh!)
  const fireTriggered = input.fire && !world.prevFireHeld;
  world.prevFireHeld = input.fire;
  if (fireTriggered && p.powerState === 2 && p.fireCooldown <= 0 && world.fireballs.length < 2) {
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
  }

  // =========================================================================
  // 1. HORIZONTAL MOVEMENT, SPRINT, ICE INERTIA & SKID BRAKING
  // =========================================================================
  const sprinting = input.run || input.fire;
  const starBoost = p.starTimer > 0 ? 1.15 : 1.0;
  const maxSpeed = (sprinting ? 5.7 : 3.65) * starBoost;
  const groundAccel = biome.slippery
    ? sprinting
      ? 0.24
      : 0.19
    : sprinting
    ? 0.46
    : 0.36;
  const airAccel = 0.28;
  const accel = p.onGround ? groundAccel : airAccel;
  const groundFriction = biome.slippery ? 0.945 : 0.82;

  p.skidding = false;
  if (!p.crouching) {
    if (input.left && !input.right) {
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

  p.x += p.vx;
  const maxWorldX = world.totalCols * TILE - p.width;
  if (p.x < world.cameraX) {
    p.x = world.cameraX;
    if (p.vx < 0) p.vx = 0;
  } else if (p.x > maxWorldX) {
    p.x = maxWorldX;
    if (p.vx > 0) p.vx = 0;
  }

  const horizSolids = collectNearbySolids(world, p, false);
  for (const s of horizSolids) {
    if (overlaps(p, s)) {
      if (p.vx > 0) {
        p.x = s.x - p.width;
        p.vx = 0;
      } else if (p.vx < 0) {
        p.x = s.x + s.width;
        p.vx = 0;
      }
    }
  }

  // =========================================================================
  // 2. COYOTE TIME, JUMP BUFFER, MOMENTUM JUMP, APEX HANG & CORNER CORRECTION
  // =========================================================================
  const jumpJustPressed = input.jump && !world.prevJumpHeld;
  world.prevJumpHeld = input.jump;

  if (p.onGround) {
    p.coyoteTimer = 6;
    p.airJumpsLeft = world.doubleJumpAssist ? 1 : 0;
    p.stompCombo = 0;
  } else if (p.coyoteTimer > 0) {
    p.coyoteTimer -= 1;
  }

  if (jumpJustPressed) {
    p.jumpBufferTimer = 7;
  } else if (p.jumpBufferTimer > 0) {
    p.jumpBufferTimer -= 1;
  }

  if (p.jumpBufferTimer > 0 && p.coyoteTimer > 0) {
    // Momentum-coupled jump: faster horizontal speed gives extra apex height!
    const speedRatio = Math.min(1, Math.abs(p.vx) / 5.5);
    p.vy = -10.65 - speedRatio * 1.35;
    p.onGround = false;
    p.coyoteTimer = 0;
    p.jumpBufferTimer = 0;
    spawnDust(world, p.x + p.width / 2, p.y + p.height, 3);
    events.push({ type: 'sfx', id: p.powerState > 0 ? 'jump_big' : 'jump' });
    events.push({ type: 'haptic', kind: 'light' });
  } else if (jumpJustPressed && !p.onGround && p.coyoteTimer <= 0 && p.airJumpsLeft > 0) {
    // Optional Assist Air-Boots Jump (clean, zero score-farming slop!)
    p.vy = -10.1;
    p.airJumpsLeft -= 1;
    p.jumpBufferTimer = 0;
    spawnDust(world, p.x + p.width / 2, p.y + p.height, 5);
    events.push({ type: 'sfx', id: 'jump' });
    events.push({ type: 'haptic', kind: 'medium' });
  }

  // Variable jump height cut when releasing A early
  if (!input.jump && p.vy < -4.2) {
    p.vy *= 0.62;
  }

  // Distinct rising, apex hang-time, and snappy falling gravity
  const gravity =
    input.jump && Math.abs(p.vy) < 2.3
      ? 0.27
      : p.vy < 0
      ? 0.45
      : 0.58;
  p.vy = Math.min(p.vy + gravity, 12.2);

  const prevY = p.y;
  p.y += p.vy;
  p.onGround = false;

  const vertSolids = collectNearbySolids(world, p, p.vy < 0);
  for (const s of vertSolids) {
    if (!overlaps(p, s)) continue;

    if (p.vy > 0) {
      // Hidden blocks don't block falling from above
      if (s.block?.type === 'hidden') continue;
      // Moving platforms act as semi-solid from above if player was above platform top
      if (s.platform && prevY + p.height > s.y + 10) continue;

      p.y = s.y - p.height;
      p.vy = 0;
      p.onGround = true;
    } else if (p.vy < 0) {
      if (s.platform) continue;
      // Hidden blocks only trigger when player's head was below the block bottom
      if (s.block?.type === 'hidden' && prevY < s.y + s.height - 8) continue;

      // 7px Head Corner Correction: nudge smoothly around outer ceiling corners!
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
  } else {
    p.animTimer = 0;
  }

  // Pit / Lava death check
  const playerFootCol = Math.floor((p.x + p.width / 2) / TILE);
  if (
    p.y > LOGICAL_HEIGHT + 24 ||
    (world.lavaCols.has(playerFootCol) && p.y + p.height >= GROUND_ROW * TILE + 12)
  ) {
    killPlayer(world, events);
    return events;
  }

  // Smooth forward-scrolling camera clamped to world bounds
  const lookAhead = p.facing === 1 ? 36 : 0;
  const targetCam = p.x + lookAhead - viewportWorldWidth * 0.35;
  const maxCam = Math.max(0, world.totalCols * TILE - viewportWorldWidth);
  if (targetCam > world.cameraX) {
    world.cameraX = Math.min(maxCam, world.cameraX + (targetCam - world.cameraX) * 0.22);
  }

  // =========================================================================
  // 3. SPRINGS, CHECKPOINT, BLOCK BOUNCES & COINS
  // =========================================================================
  for (const sp of world.springs) {
    if (sp.compressTimer > 0) sp.compressTimer -= 1;
    if (p.vy >= 0 && overlaps(p, sp) && prevY + p.height <= sp.y + 18) {
      sp.compressTimer = 14;
      p.y = sp.y - p.height;
      p.vy = input.jump ? -15.4 : -12.2;
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
      p.y -= 16;
      p.height = 46;
    }
    spawnText(world, world.checkpoint.x - 12, world.checkpoint.y - 10, '¡CHECKPOINT!', '#38bdf8');
    spawnSparks(world, world.checkpoint.x + 10, world.checkpoint.y + 12, '#38bdf8', 8);
    events.push({ type: 'sfx', id: 'checkpoint' });
    events.push({ type: 'haptic', kind: 'success' });
  }

  for (const b of world.blocks) {
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

  // =========================================================================
  // 4. POWERUPS (Smooth emergence from blocks + patrol + collection)
  // =========================================================================
  for (let i = world.powerups.length - 1; i >= 0; i--) {
    const pw = world.powerups[i];
    if (pw.spawning) {
      pw.y -= 1.2;
      if (pw.y <= pw.spawnStartY) {
        pw.y = pw.spawnStartY;
        pw.spawning = false;
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
        p.starTimer = 600; // 10 seconds of Starman rush!
        events.push({ type: 'sfx', id: 'powerup_collect' });
        events.push({ type: 'bgm', track: 'starman' });
        events.push({ type: 'haptic', kind: 'success' });
        spawnText(world, p.x, p.y - 12, '¡ESTRELLA!', '#fef08a');
      } else if (pw.kind === 'mushroom') {
        addScore(world, 1000);
        if (p.powerState === 0) {
          p.powerState = 1;
          p.y -= 16;
          p.height = 46;
        }
        events.push({ type: 'sfx', id: 'powerup_collect' });
        events.push({ type: 'haptic', kind: 'success' });
        spawnText(world, p.x, p.y - 12, '¡SUPER! +1000', '#4ade80');
      } else {
        addScore(world, 1000);
        if (p.powerState === 0) {
          p.y -= 16;
          p.height = 46;
        }
        p.powerState = 2;
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
  // 5. FIREBALLS (Bounce across terrain, roast enemies & damage Rey Koopa!)
  // =========================================================================
  for (let i = world.fireballs.length - 1; i >= 0; i--) {
    const fb = world.fireballs[i];
    fb.animFrame += 1;
    fb.vy = Math.min(fb.vy + 0.48, 9);
    fb.x += fb.vx;
    fb.y += fb.vy;

    let explode = false;
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

    for (const en of world.enemies) {
      if (en.state !== 'squashed' && en.state !== 'knocked' && overlaps(fb, en)) {
        // Piranha inside pipe shouldn't get hit when completely hidden
        if (en.type === 'piranha' && en.y > en.baseY + en.height - 6) continue;
        explode = true;
        knockEnemy(world, en, 0, events);
        break;
      }
    }

    if (!explode && world.boss && !world.boss.defeated && overlaps(fb, world.boss)) {
      explode = true;
      world.boss.hp -= 1;
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
      fb.x < world.cameraX - 32 ||
      fb.x > world.cameraX + viewportWorldWidth + 64 ||
      fb.y > LOGICAL_HEIGHT + 16
    ) {
      if (explode) spawnSparks(world, fb.x + 6, fb.y + 6, '#fb923c', 4);
      world.fireballs.splice(i, 1);
    }
  }

  // =========================================================================
  // 6. ENEMIES (Goomba, Green/Red Koopa, Shell Physics, Paratroopa, Piranha, Spiny)
  // =========================================================================
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const en = world.enemies[i];

    // Activate enemies once within generous wake range of viewport
    if (!en.active) {
      if (en.x <= world.cameraX + viewportWorldWidth + 96) {
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

    // Piranha Plant vertical pipe cycle (holds safely when player stands right next to pipe!)
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

      // Exposed hitbox check
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

    // Physics integration for land/flying enemies & sliding shells
    const isShellSlide = en.state === 'shell_slide';
    en.vy = Math.min(en.vy + (en.type === 'paratroopa' ? 0.3 : 0.46), 10.5);

    // Smart Red Koopa ledge turn-around when walking on solid ground!
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
          en.vy = -7.2; // Graceful winged bounce!
          en.onGround = false;
        } else {
          en.vy = 0;
        }
      }
    }

    // Sliding Koopa Shell mows down other enemies with escalating combo!
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

      // Kick an idle/waking shell on contact!
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

      const prevBottom = prevY + p.height;
      const stomping = p.vy > 0 && prevBottom <= en.y + 18;

      if (stomping && en.type !== 'spiny') {
        p.vy = input.jump ? -10.4 : -8.0;
        p.airJumpsLeft = world.doubleJumpAssist ? 1 : 0;
        events.push({ type: 'sfx', id: 'stomp' });
        events.push({ type: 'haptic', kind: 'medium' });
        awardCombo(world, p.stompCombo, en.x, en.y, events);
        p.stompCombo += 1;
        spawnSparks(world, en.x + en.width / 2, en.y + 4, '#ffffff', 4);

        if (en.type === 'paratroopa') {
          // Strip wings -> becomes regular Red Koopa!
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

    if (en.y > LOGICAL_HEIGHT + 64 || en.x < world.cameraX - 256) {
      world.enemies.splice(i, 1);
    }
  }

  // =========================================================================
  // 7. FORTRESS BOSS (REY KOOPA) & GOLDEN AXE!
  // =========================================================================
  if (world.boss) {
    const boss = world.boss;
    const axeRect: Rect = { x: boss.axeX, y: boss.axeY, width: TILE, height: TILE };

    // Grabbing the Golden Axe triggers the iconic bridge collapse victory!
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

      // Patrol back and forth across bridge around homeX
      if (boss.x < boss.homeX - 3.5 * TILE) boss.vx = 1.15;
      if (boss.x > boss.homeX + 2.5 * TILE) boss.vx = -1.15;
      boss.x += boss.vx;

      // Periodic high jumps so player can dash underneath!
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

      // Breathe undulating plasma fire waves!
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

  // Update Boss Fire Waves
  for (let i = world.bossFires.length - 1; i >= 0; i--) {
    const bf = world.bossFires[i];
    bf.animTimer += 1;
    bf.x += bf.vx;
    if (Math.abs(bf.y - bf.targetY) > 1.5) {
      bf.y += bf.y < bf.targetY ? 1.4 : -1.4;
    }
    if (overlaps(p, bf)) {
      damagePlayer(world, events);
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

  // Flagpole Goal check
  if (world.flagpole && overlaps(p, world.flagpole)) {
    startFlagpoleSequence(world, events);
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
