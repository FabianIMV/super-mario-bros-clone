import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

import { buildSpriteAtlasBuffer } from '../src/art/atlasBuilder';
import { buildAllSpriteDefinitions } from '../src/art/sprites';
import { synthesizeBgmWav, synthesizeSfxWav } from '../src/audio/wavSynth';
import {
  BIOMES,
  GROUND_ROW,
  LOGICAL_HEIGHT,
  SMW_TOTAL_LEVELS,
  TILE,
  TOTAL_LEVELS,
  WORLD_VERTICAL_LIFT,
} from '../src/engine/biomes';
import { stepWorld } from '../src/engine/physics';
import type { BgmTrackId, Enemy, GamePartition, InputState, SfxId } from '../src/engine/types';
import { buildWorldState, gridKey } from '../src/levels/levelBuilder';

// ============================================================================
// Minimal Pure-Node PNG Encoder (CRC32 + zlib deflate)
// ============================================================================
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([typeBuf, Buffer.from(data)]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(payload), 0);
  return Buffer.concat([lenBuf, payload, crcBuf]);
}

function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // Filter type None
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(
      raw,
      y * stride + 1
    );
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

function scaleNearest(
  srcW: number,
  srcH: number,
  srcRgba: Uint8Array,
  scale: number,
  bgRgb?: [number, number, number]
): { width: number; height: number; rgba: Uint8Array } {
  const dstW = srcW * scale;
  const dstH = srcH * scale;
  const dst = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < dstW; x++) {
      const sx = Math.floor(x / scale);
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 4;
      const a = srcRgba[si + 3];
      if (a === 0 && bgRgb) {
        dst[di] = bgRgb[0];
        dst[di + 1] = bgRgb[1];
        dst[di + 2] = bgRgb[2];
        dst[di + 3] = 255;
      } else {
        dst[di] = srcRgba[si];
        dst[di + 1] = srcRgba[si + 1];
        dst[di + 2] = srcRgba[si + 2];
        dst[di + 3] = a;
      }
    }
  }
  return { width: dstW, height: dstH, rgba: dst };
}

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}

const NO_INPUT: InputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  run: false,
  fire: false,
  spin: false,
};

// ============================================================================
// 1. Validate Sprite Definitions & Compiled Atlas
// ============================================================================
console.log('1. Validating pixel-art sprite definitions & GPU atlas...');
const spriteDefs = buildAllSpriteDefinitions();
const spriteNames = Object.keys(spriteDefs);
assert(spriteNames.length >= 100, `Expected >=100 sprites, got ${spriteNames.length}`);

for (const [name, def] of Object.entries(spriteDefs)) {
  assert(
    def.rows.length === def.height,
    `Sprite ${name} row count ${def.rows.length} !== height ${def.height}`
  );
  for (let r = 0; r < def.rows.length; r++) {
    assert(
      def.rows[r].length === def.width,
      `Sprite ${name} row ${r} length ${def.rows[r].length} !== width ${def.width} ("${def.rows[r]}")`
    );
    for (const ch of def.rows[r]) {
      assert(
        ch === '.' || ch in def.palette,
        `Sprite ${name} row ${r} uses undefined palette char '${ch}'`
      );
    }
  }
}

const atlas = buildSpriteAtlasBuffer();
// Verify zero fallback magenta pixels (#ff00ff)
for (let i = 0; i < atlas.rgba.length; i += 4) {
  if (
    atlas.rgba[i] === 255 &&
    atlas.rgba[i + 1] === 0 &&
    atlas.rgba[i + 2] === 255 &&
    atlas.rgba[i + 3] === 255
  ) {
    throw new Error(`Magenta fallback pixel detected in atlas at byte ${i}`);
  }
}
console.log(`   ✔ ${spriteNames.length} sprites compiled cleanly into ${atlas.width}x${atlas.height} atlas.`);

// Export scaled atlas preview PNG + custom pixel-art app icons!
const PROJECT_ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const previewDir = path.join('/tmp', 'spb-preview');
fs.mkdirSync(previewDir, { recursive: true });
const scaledAtlas = scaleNearest(atlas.width, atlas.height, atlas.rgba, 3, [20, 26, 42]);
fs.writeFileSync(
  path.join(previewDir, 'atlas_preview.png'),
  encodeRgbaPng(scaledAtlas.width, scaledAtlas.height, scaledAtlas.rgba)
);

// Generate crisp 1024x1024 Pixel-Art App Icon & Splash Icon from hero_big_norm_jump!
function generateAppIcons(): void {
  const assetsDir = path.join(PROJECT_ROOT, 'assets');
  const iconSize = 1024;
  const rgba = new Uint8Array(iconSize * iconSize * 4);

  // Deep royal arcade cabinet background with golden pixel border
  for (let y = 0; y < iconSize; y++) {
    for (let x = 0; x < iconSize; x++) {
      const idx = (y * iconSize + x) * 4;
      const border = x < 48 || x >= iconSize - 48 || y < 48 || y >= iconSize - 48;
      const innerRim =
        !border && (x < 68 || x >= iconSize - 68 || y < 68 || y >= iconSize - 68);
      if (border) {
        rgba[idx] = 20;
        rgba[idx + 1] = 16;
        rgba[idx + 2] = 19;
        rgba[idx + 3] = 255;
      } else if (innerRim) {
        rgba[idx] = 250;
        rgba[idx + 1] = 204;
        rgba[idx + 2] = 21;
        rgba[idx + 3] = 255;
      } else {
        // Sky gradient + ground strip at bottom!
        if (y > 780) {
          const isCap = y <= 828;
          rgba[idx] = isCap ? 34 : 200;
          rgba[idx + 1] = isCap ? 197 : 90;
          rgba[idx + 2] = isCap ? 94 : 25;
          rgba[idx + 3] = 255;
        } else {
          const t = y / 780;
          rgba[idx] = Math.round(35 + t * 55);
          rgba[idx + 1] = Math.round(96 + t * 75);
          rgba[idx + 2] = Math.round(235 + t * 20);
          rgba[idx + 3] = 255;
        }
      }
    }
  }

  // Stamp Super Hero Jump Sprite at 24x pixel scale slightly left of center jumping toward [?]!
  const heroRect = atlas.rects.hero_big_norm_jump;
  const scale = 24;
  const startX = 188;
  const startY = 204;
  for (let sy = 0; sy < heroRect.height; sy++) {
    for (let sx = 0; sx < heroRect.width; sx++) {
      const ai = ((heroRect.y + sy) * atlas.width + (heroRect.x + sx)) * 4;
      if (atlas.rgba[ai + 3] === 0) continue;
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          const dx = startX + sx * scale + px;
          const dy = startY + sy * scale + py;
          const di = (dy * iconSize + dx) * 4;
          rgba[di] = atlas.rgba[ai];
          rgba[di + 1] = atlas.rgba[ai + 1];
          rgba[di + 2] = atlas.rgba[ai + 2];
          rgba[di + 3] = 255;
        }
      }
    }
  }

  // Also stamp a [?] block in top-right corner of the icon!
  const qRect = atlas.rects.tile_question_1;
  const qScale = 14;
  const qX = 656;
  const qY = 104;
  for (let sy = 0; sy < qRect.height; sy++) {
    for (let sx = 0; sx < qRect.width; sx++) {
      const ai = ((qRect.y + sy) * atlas.width + (qRect.x + sx)) * 4;
      if (atlas.rgba[ai + 3] === 0) continue;
      for (let py = 0; py < qScale; py++) {
        for (let px = 0; px < qScale; px++) {
          const dx = qX + sx * qScale + px;
          const dy = qY + sy * qScale + py;
          const di = (dy * iconSize + dx) * 4;
          rgba[di] = atlas.rgba[ai];
          rgba[di + 1] = atlas.rgba[ai + 1];
          rgba[di + 2] = atlas.rgba[ai + 2];
          rgba[di + 3] = 255;
        }
      }
    }
  }

  const iconPng = encodeRgbaPng(iconSize, iconSize, rgba);
  fs.writeFileSync(path.join(assetsDir, 'icon.png'), iconPng);
  fs.writeFileSync(path.join(assetsDir, 'splash-icon.png'), iconPng);
  fs.writeFileSync(path.join(assetsDir, 'android-icon-foreground.png'), iconPng);

  // 64x64 favicon
  const favRgba = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const si = (Math.floor((y * iconSize) / 64) * iconSize + Math.floor((x * iconSize) / 64)) * 4;
      const di = (y * 64 + x) * 4;
      favRgba[di] = rgba[si];
      favRgba[di + 1] = rgba[si + 1];
      favRgba[di + 2] = rgba[si + 2];
      favRgba[di + 3] = 255;
    }
  }
  fs.writeFileSync(path.join(assetsDir, 'favicon.png'), encodeRgbaPng(64, 64, favRgba));
}

generateAppIcons();
console.log('   ✔ Generated custom pixel-art assets/icon.png, splash-icon.png & favicon.png.');

// ============================================================================
// 2. Validate All 24 Stages (1-1 through 6-4)
// ============================================================================
console.log('2. Validating all 24 stages (1-1 through 6-4)...');
for (let idx = 0; idx < TOTAL_LEVELS; idx++) {
  const w = buildWorldState(idx);
  const isFortress = (idx % 4) === 3;
  assert(w.blocks.length > 80, `Stage ${w.worldLabel} has too few blocks`);
  assert(w.checkpoint !== null, `Stage ${w.worldLabel} missing checkpoint`);

  // Verify player spawns cleanly on solid ground
  const spawnCol = Math.floor(w.player.x / TILE);
  assert(
    w.blockGrid.has(gridKey(spawnCol, GROUND_ROW)),
    `Stage ${w.worldLabel} player spawn col ${spawnCol} has no ground`
  );

  // Check pit spans are crossable (unless spanned by a platform or bridge!)
  let consecutiveGap = 0;
  for (let col = 0; col < w.totalCols - 8; col++) {
    const hasGround = w.blockGrid.has(gridKey(col, GROUND_ROW));
    const hasBridge =
      w.blockGrid.has(gridKey(col, 10)) ||
      w.blockGrid.has(gridKey(col, 9)) ||
      w.blockGrid.has(gridKey(col, 8)) ||
      w.blockGrid.has(gridKey(col, 7));
    const hasLiftNearby = w.platforms.some(
      (pl) => Math.abs(pl.startX - col * TILE) <= 6 * TILE
    );

    if (!hasGround && !hasBridge && !hasLiftNearby) {
      consecutiveGap++;
      assert(
        consecutiveGap <= 4,
        `Stage ${w.worldLabel} has unbridged gap > 4 tiles at col ${col}`
      );
    } else {
      consecutiveGap = 0;
    }
  }

  if (isFortress) {
    assert(w.boss !== null, `Fortress stage ${w.worldLabel} missing Rey Koopa boss`);
    assert(w.flagpole === null, `Fortress stage ${w.worldLabel} should use Golden Axe instead of flagpole`);
  } else {
    assert(w.flagpole !== null, `Stage ${w.worldLabel} missing flagpole`);
  }
}
console.log('   ✔ All 24 stages passed structural, spawn, checkpoint, boss & gap solvability checks.');

// ============================================================================
// 2b. Validate All 20 Super Plomero World Stages (Y-1 through K-4)
// ============================================================================
console.log('2b. Validating all 20 Super Plomero World stages (Y-1 .. K-4)...');
assert(SMW_TOTAL_LEVELS === 20, `Expected 20 SMW levels, got ${SMW_TOTAL_LEVELS}`);
const smwLabels = new Set<string>();
for (let idx = 0; idx < SMW_TOTAL_LEVELS; idx++) {
  const w = buildWorldState(idx, undefined, 'smw');
  const isCastle = idx % 4 === 3;
  assert(w.partition === 'smw', `SMW stage ${idx} has wrong partition`);
  assert(w.totalStagesInPartition === 20, `SMW stage ${w.worldLabel} wrong total`);
  assert(!smwLabels.has(w.worldLabel), `Duplicate SMW label ${w.worldLabel}`);
  smwLabels.add(w.worldLabel);
  assert(w.blocks.length > 80, `SMW stage ${w.worldLabel} has too few blocks`);
  assert(w.dragonCoins.length === 5, `SMW stage ${w.worldLabel} needs 5 Dragon Coins, got ${w.dragonCoins.length}`);
  const spawnCol = Math.floor(w.player.x / TILE);
  assert(
    w.blockGrid.has(gridKey(spawnCol, GROUND_ROW)),
    `SMW stage ${w.worldLabel} spawn col ${spawnCol} has no ground`
  );
  let gap = 0;
  for (let col = 0; col < w.totalCols - 8; col++) {
    const solid =
      w.blockGrid.has(gridKey(col, GROUND_ROW)) ||
      [6, 7, 8, 9, 10].some((r) => w.blockGrid.has(gridKey(col, r))) ||
      w.platforms.some((pl) => Math.abs(pl.startX - col * TILE) <= 6 * TILE);
    gap = solid ? 0 : gap + 1;
    assert(gap <= 4, `SMW stage ${w.worldLabel} has unbridged gap > 4 at col ${col}`);
  }
  if (isCastle) {
    assert(w.boss !== null, `SMW castle ${w.worldLabel} missing Rey Koopa`);
  } else {
    assert(w.goalTape !== null, `SMW stage ${w.worldLabel} missing Giant Gate goal tape`);
  }
}
{
  const y1 = buildWorldState(0, undefined, 'smw');
  assert(y1.blocks.some((b) => b.content === 'yoshi_egg'), 'Y-1 must contain a Yoshi Egg block');
  assert(y1.blocks.some((b) => b.content === 'feather'), 'Y-1 must contain a Cape Feather block');
  assert(y1.blocks.some((b) => b.type === 'rotating'), 'Y-1 must contain Rotating blocks');
}
console.log(`   ✔ All 20 SMW stages valid (${Array.from(smwLabels).join(' ')}).`);

// ============================================================================
// 3. Validate Authentic Platformer Physics Invariants
// ============================================================================
console.log('3. Running frame-accurate 60Hz physics invariant tests...');

// 3a. Coyote Time Test: Walk off a ledge, press Jump 4 frames AFTER leaving ground!
{
  const w = buildWorldState(0);
  // Place player at right edge of col 41 right before pit at col 42..43
  w.player.x = 42 * TILE - 4;
  w.player.y = GROUND_ROW * TILE - w.player.height;
  w.player.vx = 3.5;
  w.player.onGround = true;
  w.player.coyoteTimer = 6;

  // Step 3 frames walking off into air without pressing jump
  for (let f = 0; f < 3; f++) {
    stepWorld(w, { ...NO_INPUT, right: true }, 960);
  }
  assert(!w.player.onGround, 'Player should be airborne over pit');
  assert(w.player.coyoteTimer > 0, 'Coyote timer should still be active');

  // Press jump on 4th airborne frame!
  stepWorld(w, { ...NO_INPUT, right: true, jump: true }, 960);
  assert(w.player.vy < -9.5, `Coyote jump should fire! Got vy=${w.player.vy}`);
}

// 3b. Jump Buffer Test: Press Jump 4 frames BEFORE touching ground -> auto-jumps on land!
{
  const w = buildWorldState(0);
  w.player.x = 5 * TILE;
  w.player.y = GROUND_ROW * TILE - w.player.height - 14;
  w.player.vy = 5.0;
  w.player.onGround = false;
  w.player.coyoteTimer = 0;

  // Press jump mid-air just before landing
  stepWorld(w, { ...NO_INPUT, jump: true }, 960);
  let jumpedOnLanding = false;
  for (let f = 0; f < 6; f++) {
    stepWorld(w, { ...NO_INPUT, jump: true }, 960);
    if (w.player.vy < -9.5) {
      jumpedOnLanding = true;
      break;
    }
  }
  assert(jumpedOnLanding, 'Buffered jump should trigger automatically upon landing!');
}

// 3c. Momentum-Coupled Jump Height Test: Sprinting jumps higher than standing jump!
function measureJumpApex(sprintSpeed: number): number {
  const w = buildWorldState(0);
  w.player.x = 6 * TILE;
  w.player.y = GROUND_ROW * TILE - w.player.height;
  w.player.vx = sprintSpeed;
  w.player.onGround = true;
  const startY = w.player.y;
  let minY = startY;
  for (let f = 0; f < 40; f++) {
    stepWorld(w, { ...NO_INPUT, jump: true, right: sprintSpeed > 0, run: sprintSpeed > 0 }, 960);
    if (w.player.y < minY) minY = w.player.y;
  }
  return startY - minY;
}
const standingApex = measureJumpApex(0);
const sprintApex = measureJumpApex(5.6);
assert(
  sprintApex > standingApex + 18,
  `Sprint jump (${sprintApex.toFixed(1)}) should exceed standing jump (${standingApex.toFixed(1)})`
);

// 3d. Koopa Shell Stomp -> Kick -> Multi-Goomba Bowling Combo Test!
{
  const w = buildWorldState(0);
  w.enemies = [
    {
      id: 901,
      type: 'koopa_green',
      state: 'walk',
      x: 8 * TILE,
      y: GROUND_ROW * TILE - 38,
      baseY: GROUND_ROW * TILE - 38,
      vx: 0,
      vy: 0,
      width: 26,
      height: 38,
      facing: -1,
      onGround: true,
      stateTimer: 0,
      kickGraceTimer: 0,
      shellCombo: 0,
      animTimer: 0,
      hp: 1,
      active: true,
    },
    {
      id: 902,
      type: 'goomba',
      state: 'walk',
      x: 11 * TILE,
      y: GROUND_ROW * TILE - 28,
      baseY: GROUND_ROW * TILE - 28,
      vx: 0,
      vy: 0,
      width: 26,
      height: 28,
      facing: -1,
      onGround: true,
      stateTimer: 0,
      kickGraceTimer: 0,
      shellCombo: 0,
      animTimer: 0,
      hp: 1,
      active: true,
    },
    {
      id: 903,
      type: 'goomba',
      state: 'walk',
      x: 13 * TILE,
      y: GROUND_ROW * TILE - 28,
      baseY: GROUND_ROW * TILE - 28,
      vx: 0,
      vy: 0,
      width: 26,
      height: 28,
      facing: -1,
      onGround: true,
      stateTimer: 0,
      kickGraceTimer: 0,
      shellCombo: 0,
      animTimer: 0,
      hp: 1,
      active: true,
    },
  ];

  // Drop player onto Koopa to turn into idle shell
  w.player.x = 8 * TILE;
  w.player.y = GROUND_ROW * TILE - 38 - w.player.height - 4;
  w.player.vy = 6;
  w.player.onGround = false;
  for (let f = 0; f < 5; f++) stepWorld(w, NO_INPUT, 960);
  assert(w.enemies[0].state === 'shell_idle', 'Koopa should become shell_idle after stomp');

  // Walk player into left side of shell to kick it right through both Goombas!
  w.player.x = w.enemies[0].x - w.player.width + 2;
  w.player.y = GROUND_ROW * TILE - w.player.height;
  w.player.vy = 0;
  stepWorld(w, { ...NO_INPUT, right: true }, 960);
  assert(w.enemies[0].state === 'shell_slide', 'Shell should slide when kicked');

  // Move player safely upward out of the way and step 40 frames
  w.player.y = 2 * TILE;
  w.player.vy = -8;
  for (let f = 0; f < 35; f++) stepWorld(w, NO_INPUT, 960);

  assert(
    w.enemies[0].shellCombo >= 2,
    `Sliding shell should have bowled over both Goombas! Got combo=${w.enemies[0].shellCombo}`
  );
}

// 3e. Fortress Boss Golden Axe Collapse & Stage Advance Test!
{
  const w = buildWorldState(3); // Stage 1-4 Fortress!
  assert(w.boss !== null, '1-4 should have Rey Koopa');
  w.player.x = w.boss!.axeX;
  w.player.y = w.boss!.axeY;
  stepWorld(w, NO_INPUT, 960);
  assert(w.status === 'boss_collapse', 'Touching Golden Axe should start boss_collapse');
  for (let f = 0; f < 175; f++) {
    stepWorld(w, NO_INPUT, 960);
  }
  assert(w.levelIndex === 4, `After 1-4 boss collapse, should advance to 2-1 (idx 4), got ${w.levelIndex}`);
}

// 3f. SMW: Yoshi Egg hatch -> Mount -> Tongue eats Red Koopa -> Triple Fireball spit!
function makeEnemy(id: number, type: Enemy['type'], col: number, h: number): Enemy {
  return {
    id,
    type,
    state: 'walk',
    x: col * TILE,
    y: GROUND_ROW * TILE - h,
    baseY: GROUND_ROW * TILE - h,
    vx: 0,
    vy: 0,
    width: 26,
    height: h,
    facing: -1,
    onGround: true,
    hp: type === 'rex' ? 2 : 1,
    stateTimer: 0,
    kickGraceTimer: 0,
    shellCombo: 0,
    animTimer: 0,
    active: true,
  };
}
{
  const w = buildWorldState(0, undefined, 'smw');
  w.enemies = [];
  const eggBlock = w.blocks.find((b) => b.content === 'yoshi_egg')!;
  // Stand beneath egg block and jump into it
  w.player.x = eggBlock.x + 5;
  w.player.y = GROUND_ROW * TILE - w.player.height;
  w.player.onGround = true;
  let hatched = false;
  for (let f = 0; f < 40 && !hatched; f++) {
    stepWorld(w, { ...NO_INPUT, jump: f < 14 }, 960);
    if (w.yoshis.length > 0) hatched = true;
  }
  assert(hatched, 'Bumping Yoshi Egg block should hatch a Yoshi');
  for (let f = 0; f < 140 && !w.player.mountedYoshi; f++) {
    const yo = w.yoshis[0];
    const dir = yo && yo.x > w.player.x ? { right: true } : { left: true };
    stepWorld(w, { ...NO_INPUT, ...dir }, 960);
  }
  assert(w.player.mountedYoshi, 'Plomero should mount Yoshi on contact');

  // Clear area, place Red Koopa right in front, flick tongue
  w.player.x = 30 * TILE;
  w.player.y = GROUND_ROW * TILE - w.player.height;
  w.player.vx = 0;
  w.player.vy = 0;
  w.player.facing = 1;
  w.player.onGround = true;
  w.player.invulnTimer = 0;
  w.enemies = [makeEnemy(990, 'koopa_red', 0, 38)];
  w.enemies[0].x = w.player.x + w.player.width + 18;
  w.enemies[0].y = w.player.y + w.player.height - 38;
  w.enemies[0].baseY = w.enemies[0].y;
  stepWorld(w, { ...NO_INPUT, spin: true }, 960);
  for (let f = 0; f < 14 && w.enemies.length > 0; f++) stepWorld(w, NO_INPUT, 960);
  assert(w.enemies.length === 0, 'Yoshi tongue should swallow the Red Koopa');
  assert(w.player.yoshiMouthItem === 'fire', 'Swallowing Red Koopa should grant fire breath');
  for (let f = 0; f < 20; f++) stepWorld(w, NO_INPUT, 960);
  const before = w.fireballs.length;
  stepWorld(w, { ...NO_INPUT, spin: true }, 960);
  const yoshiFires = w.fireballs.filter((fb) => fb.fromYoshi).length;
  assert(yoshiFires >= 3 && w.fireballs.length >= before + 3, `Yoshi should spit 3 fireballs, got ${yoshiFires}`);
}

// 3g. SMW: Cape Feather -> P-Meter sprint -> Cape takeoff & Cape Spin flips Rotating block
{
  const w = buildWorldState(1, { score: 0, highScore: 0, coins: 0, lives: 3, powerState: 3 }, 'smw');
  w.enemies = [];
  w.player.x = 4 * TILE;
  w.player.y = GROUND_ROW * TILE - w.player.height;
  w.player.onGround = true;
  // Make a flat runway so the P-Meter can fill
  for (let col = 0; col < 60; col++) {
    for (let r = 4; r < GROUND_ROW; r++) {
      const b = w.blockGrid.get(gridKey(col, r));
      if (b) {
        w.blockGrid.delete(gridKey(col, r));
        w.blocks.splice(w.blocks.indexOf(b), 1);
      }
    }
    if (!w.blockGrid.has(gridKey(col, GROUND_ROW))) {
      const nb = {
        id: 50000 + col, col, row: GROUND_ROW, x: col * TILE, y: GROUND_ROW * TILE,
        baseY: GROUND_ROW * TILE, width: TILE, height: TILE, type: 'ground_top' as const,
        content: null, coinsRemaining: 0, bounceY: 0, bounceVel: 0, spinTimer: 0,
      };
      w.blocks.push(nb);
      w.blockGrid.set(gridKey(col, GROUND_ROW), nb);
    }
  }
  w.pipes = w.pipes.filter((pp) => pp.x > 60 * TILE);
  w.springs = [];
  w.platforms = [];
  let frames = 0;
  while (w.player.pMeter < 108 && frames < 160) {
    stepWorld(w, { ...NO_INPUT, right: true, run: true }, 960);
    frames++;
  }
  assert(w.player.pMeter >= 108, `P-Meter should fill when sprinting, got ${w.player.pMeter}`);
  stepWorld(w, { ...NO_INPUT, right: true, run: true, jump: true }, 960);
  assert(w.player.capeFlying, 'Full P-Meter + Cape + Jump should trigger Cape takeoff');
  const startY = w.player.y;
  for (let f = 0; f < 12; f++) stepWorld(w, { ...NO_INPUT, right: true, run: true, jump: true }, 960);
  assert(w.player.y < startY - 40, 'Cape takeoff should soar upward');

  // Cape spin on ground flips adjacent Rotating block
  const w2 = buildWorldState(1, { score: 0, highScore: 0, coins: 0, lives: 3, powerState: 3 }, 'smw');
  w2.enemies = [];
  const col = 10;
  const row = GROUND_ROW - 1;
  const rot = {
    id: 77777, col, row, x: col * TILE, y: row * TILE, baseY: row * TILE, width: TILE,
    height: TILE, type: 'rotating' as const, content: null, coinsRemaining: 0,
    bounceY: 0, bounceVel: 0, spinTimer: 0,
  };
  for (const c of [8, 9, 10]) {
    for (let r = 0; r < GROUND_ROW; r++) {
      const ob = w2.blockGrid.get(gridKey(c, r));
      if (ob) { w2.blockGrid.delete(gridKey(c, r)); w2.blocks.splice(w2.blocks.indexOf(ob), 1); }
    }
  }
  w2.blocks.push(rot);
  w2.blockGrid.set(gridKey(col, row), rot);
  w2.player.x = col * TILE - w2.player.width - 2;
  w2.player.y = GROUND_ROW * TILE - w2.player.height;
  w2.player.facing = 1;
  w2.player.onGround = true;
  for (let f = 0; f < 4; f++) stepWorld(w2, { ...NO_INPUT, fire: f === 0 }, 960);
  assert(rot.spinTimer > 0, 'Cape Spin should flip adjacent Rotating block');
}

// 3h. LEFT-EDGE CONTROL NON-OCCLUSION INVARIANT (both partitions, iPhone 12 844x390)
const IPHONE_W = 844;
const IPHONE_H = 390;
const PX_SCALE = IPHONE_H / LOGICAL_HEIGHT;
const VIEW_W = IPHONE_W / PX_SCALE;
const DPAD_RIGHT_EDGE = 12 + 118 + 16; // leftMargin + dpadSize + slop
let minScreenXSeen = Infinity;
for (const part of ['classic', 'smw'] as GamePartition[]) {
  for (const lvl of [0, 4, 9]) {
    const w = buildWorldState(lvl, undefined, part);
    w.enemies = [];
    for (let f = 0; f < 160; f++) {
      stepWorld(w, { ...NO_INPUT, left: true, run: true }, VIEW_W);
      const sx = (w.player.x - w.cameraX) * PX_SCALE;
      if (sx < minScreenXSeen) minScreenXSeen = sx;
      assert(
        sx >= 185,
        `[${part} ${w.worldLabel}] Plomero screenX ${sx.toFixed(1)}px overlaps D-Pad (edge ${DPAD_RIGHT_EDGE}px)`
      );
    }
  }
}
assert(DPAD_RIGHT_EDGE <= 150, 'D-Pad right edge must be <= 150px');

console.log(
  `   ✔ SMW Yoshi/Tongue/Fire, Cape P-Meter takeoff, Cape Spin & left-edge clearance (min screenX ${minScreenXSeen.toFixed(1)}px vs D-Pad ${DPAD_RIGHT_EDGE}px) all green!`
);

console.log(
  `   ✔ Physics verified (Standing jump: ${standingApex.toFixed(1)}px, Sprint jump: ${sprintApex.toFixed(1)}px, Coyote, Buffer, Shell Combos & Boss Collapse all green!).`
);

// ============================================================================
// 4. Validate Synthesized Chiptune WAV Buffers (All 21 SFX + 5 BGM)
// ============================================================================
console.log('4. Validating NES chiptune WAV audio synthesis...');
const allSfx: SfxId[] = [
  'jump',
  'jump_big',
  'skid',
  'coin',
  'bump',
  'break_block',
  'stomp',
  'kick',
  'powerup_spawn',
  'powerup_collect',
  'one_up',
  'fireball',
  'power_down',
  'checkpoint',
  'spring',
  'boss_hit',
  'boss_roar',
  'bridge_collapse',
  'stage_clear',
  'die',
  'gameover',
  'spin_jump',
  'dragon_coin',
  'feather_get',
  'cape_spin',
  'yoshi_mount',
  'yoshi_tongue',
  'yoshi_swallow',
  'yoshi_spit',
  'wind_gust',
  'icicle_crack',
  'crumble',
  'key_get',
  'vault_open',
  'treasure',
  'portal',
  'wrench_throw',
  'wrench_catch',
  'wall_jump',
  'slide',
  'gem',
  'clock',
  'chase_growl',
  'lava_rise',
  'goal_locked',
];
const allBgm: BgmTrackId[] = [
  'overworld',
  'underground',
  'athletic',
  'fortress',
  'starman',
  'smw_overworld',
  'smw_athletic',
  'exp_overworld',
  'exp_cave',
  'dim_theme',
  'dim_core',
];

function checkWav(name: string, bytes: Uint8Array): void {
  assert(bytes.length > 100, `WAV ${name} too small`);
  const riff = Buffer.from(bytes.slice(0, 4)).toString('ascii');
  const wave = Buffer.from(bytes.slice(8, 12)).toString('ascii');
  assert(riff === 'RIFF' && wave === 'WAVE', `Invalid RIFF/WAVE header in ${name}`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sumSq = 0;
  const count = (bytes.byteLength - 44) / 2;
  for (let i = 0; i < count; i++) {
    const s = dv.getInt16(44 + i * 2, true) / 32768;
    sumSq += s * s;
  }
  const rms = Math.sqrt(sumSq / count);
  assert(rms > 0.01 && Number.isFinite(rms), `WAV ${name} has invalid/silent RMS ${rms}`);
}

for (const id of allSfx) checkWav(`sfx_${id}`, synthesizeSfxWav(id));
for (const tr of allBgm) checkWav(`bgm_${tr}`, synthesizeBgmWav(tr));
console.log(`   ✔ All ${allSfx.length} SFX and ${allBgm.length} BGM chiptune WAV files verified.`);

// ============================================================================
// 5. Render iPhone 12 Landscape (844x390) Visual Verification Snapshots!
// ============================================================================
console.log('5. Rendering iPhone 12 (844x390) visual frame snapshots for inspection...');

function renderSnapshotPng(
  levelIdx: number,
  cameraTileCol: number,
  outName: string,
  partition: GamePartition = 'classic',
  leftEdgeShot = false
): void {
  const isSmw = partition === 'smw';
  const w = buildWorldState(
    levelIdx,
    {
      score: 14800,
      highScore: 32400,
      coins: 27,
      lives: 4,
      powerState: isSmw ? 3 : levelIdx === 3 ? 2 : 1,
      mountedYoshi: isSmw,
    },
    partition
  );
  if (leftEdgeShot) {
    // Press LEFT for 150 frames against the level start -> camera safe zone clamps
    for (let f = 0; f < 150; f++) stepWorld(w, { ...NO_INPUT, left: true }, 969);
  } else {
    w.cameraX = cameraTileCol * TILE;
    w.player.x = (cameraTileCol + 6) * TILE;
    w.player.y = GROUND_ROW * TILE - w.player.height - 24;
    w.player.onGround = false;
    w.frameCount = 24;
    stepWorld(w, { ...NO_INPUT, right: true, run: true, jump: true }, 960);
  }
  const lift = WORLD_VERTICAL_LIFT;

  const imgW = 844;
  const imgH = 390;
  const rgba = new Uint8Array(imgW * imgH * 4);
  const biome = BIOMES[w.biomeId];

  const parseHex = (h: string): [number, number, number] => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const topC = parseHex(biome.skyTop);
  const botC = parseHex(biome.skyBottom);

  for (let y = 0; y < imgH; y++) {
    const t = y / imgH;
    const r = Math.round(topC[0] + (botC[0] - topC[0]) * t);
    const g = Math.round(topC[1] + (botC[1] - topC[1]) * t);
    const b = Math.round(topC[2] + (botC[2] - topC[2]) * t);
    for (let x = 0; x < imgW; x++) {
      const i = (y * imgW + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }

  const scale = imgH / LOGICAL_HEIGHT;
  const blit = (key: string, wx: number, wy: number, ww: number, wh: number, flipX = false) => {
    const sr = atlas.rects[key];
    if (!sr) return;
    const dx0 = Math.round((wx - w.cameraX) * scale);
    const dy0 = Math.round((wy - lift) * scale);
    const dw = Math.max(1, Math.round((wx - w.cameraX + ww) * scale) - dx0);
    const dh = Math.max(1, Math.round((wy - lift + wh) * scale) - dy0);

    for (let py = 0; py < dh; py++) {
      const sy = Math.min(sr.height - 1, Math.floor((py * sr.height) / dh));
      const ty = dy0 + py;
      if (ty < 0 || ty >= imgH) continue;
      for (let px = 0; px < dw; px++) {
        const rawSx = Math.min(sr.width - 1, Math.floor((px * sr.width) / dw));
        const sx = flipX ? sr.width - 1 - rawSx : rawSx;
        const tx = dx0 + px;
        if (tx < 0 || tx >= imgW) continue;
        const ai = ((sr.y + sy) * atlas.width + (sr.x + sx)) * 4;
        if (atlas.rgba[ai + 3] === 0) continue;
        const di = (ty * imgW + tx) * 4;
        rgba[di] = atlas.rgba[ai];
        rgba[di + 1] = atlas.rgba[ai + 1];
        rgba[di + 2] = atlas.rgba[ai + 2];
        rgba[di + 3] = 255;
      }
    }
  };

  for (const c of w.lavaCols) {
    blit('tile_lava_1', c * TILE, GROUND_ROW * TILE + 6, TILE, TILE);
  }
  for (const en of w.enemies) {
    if (en.type === 'piranha') {
      blit('piranha_open', en.x - 4, en.baseY - 6, 32, 48);
    }
  }
  for (const p of w.pipes) {
    const rows = Math.round(p.height / TILE);
    blit(`${w.biomeId}_pipe_tl`, p.x, p.y, TILE, TILE);
    blit(`${w.biomeId}_pipe_tr`, p.x + TILE, p.y, TILE, TILE);
    for (let r = 1; r < rows; r++) {
      blit(`${w.biomeId}_pipe_bl`, p.x, p.y + r * TILE, TILE, TILE);
      blit(`${w.biomeId}_pipe_br`, p.x + TILE, p.y + r * TILE, TILE, TILE);
    }
  }
  for (const b of w.blocks) {
    if (b.type === 'hidden') continue;
    const key =
      b.type === 'question'
        ? 'tile_question_1'
        : b.type === 'empty'
        ? 'tile_empty'
        : b.type === 'bridge'
        ? 'tile_bridge'
        : b.type === 'rotating'
        ? 'tile_rotating_idle'
        : `${w.biomeId}_${b.type}`;
    blit(key, b.x, b.y, TILE, TILE);
  }
  // Left border terrain (cols -10..-1) so the safe-zone looks seamless
  for (let c = -10; c < 0; c++) {
    blit(`${w.biomeId}_ground_top`, c * TILE, GROUND_ROW * TILE, TILE, TILE);
    blit(`${w.biomeId}_ground_deep`, c * TILE, (GROUND_ROW + 1) * TILE, TILE, TILE);
  }
  for (const dc of w.dragonCoins) {
    if (!dc.collected) blit('dragon_coin_1', dc.x, dc.y, 24, 36);
  }
  for (const br of w.berries) {
    if (!br.eaten) blit('berry_red', br.x - 2, br.y - 2, 24, 24);
  }
  for (const c of w.coinsList) {
    blit('coin_1', c.x - 3, c.y - 1, 24, 24);
  }
  for (const en of w.enemies) {
    if (en.type === 'goomba') blit('goomba_walk1', en.x - 3, en.y - 4, 32, 32);
    if (en.type === 'koopa_green') blit('koopa_green_walk1', en.x - 3, en.y - 10, 32, 48, true);
    if (en.type === 'koopa_red') blit('koopa_red_walk1', en.x - 3, en.y - 10, 32, 48, true);
    if (en.type === 'paratroopa') blit('paratroopa_fly1', en.x - 3, en.y - 10, 32, 48, true);
    if (en.type === 'spiny') blit('spiny_walk1', en.x - 3, en.y - 4, 32, 32, true);
    if (en.type === 'galoomba') blit('galoomba_walk1', en.x - 3, en.y - 4, 32, 32);
    if (en.type === 'rex') blit('rex_walk1', en.x - 3, en.y + en.height - 48, 32, 48, true);
    if (en.type === 'chuck') blit('chuck_idle', en.x - 3, en.y + en.height - 48, 40, 48, true);
    if (en.type === 'bullet_bill') blit('bullet_bill', en.x - 3, en.y - 2, 32, 32, true);
  }
  if (w.boss) {
    blit('axe_1', w.boss.axeX, w.boss.axeY, TILE, TILE);
    blit('boss_roar', w.boss.x - 4, w.boss.y - 4, 64, 64, false);
    blit('boss_fire1', w.boss.x - 48, w.boss.y + 18, 36, 16, false);
  }
  const pl = w.player;
  const flip = pl.facing === -1;
  if (pl.mountedYoshi) {
    const yoshiX = pl.x - 9;
    const yoshiY = pl.y + pl.height - 48;
    if (pl.powerState === 3) {
      blit('cape_back_flutter', flip ? pl.x + 6 : pl.x - 16, yoshiY - 10, 32, 32, flip);
    }
    blit('hero_big_norm_idle', pl.x - 5, yoshiY - 16, 32, 48, flip);
    blit('yoshi_idle', yoshiX, yoshiY, 40, 48, flip);
  } else {
    if (pl.powerState === 3) {
      blit('cape_back_flutter', flip ? pl.x + 5 : pl.x - 15, pl.y + pl.height - 36, 32, 32, flip);
    }
    const heroKey = pl.powerState === 2 ? 'hero_big_fire_jump' : 'hero_big_norm_jump';
    blit(heroKey, pl.x - 5, pl.y + pl.height - 48, 32, 48, flip);
  }

  // Overlay semi-transparent control footprints (iPhone 12 geometry) to prove zero occlusion
  const blend = (x: number, y: number, rgb: [number, number, number], a: number) => {
    if (x < 0 || y < 0 || x >= imgW || y >= imgH) return;
    const i = (y * imgW + x) * 4;
    rgba[i] = Math.round(rgba[i] * (1 - a) + rgb[0] * a);
    rgba[i + 1] = Math.round(rgba[i + 1] * (1 - a) + rgb[1] * a);
    rgba[i + 2] = Math.round(rgba[i + 2] * (1 - a) + rgb[2] * a);
  };
  const dpadX0 = 28;
  const dpadY0 = imgH - 6 - 118 + 4;
  for (let y = dpadY0; y < dpadY0 + 118; y++) {
    for (let x = dpadX0; x < dpadX0 + 118; x++) {
      const inV = x >= dpadX0 + 40 && x < dpadX0 + 78;
      const inH = y >= dpadY0 + 40 && y < dpadY0 + 78;
      if (inV || inH) blend(x, y, [15, 23, 42], 0.55);
    }
  }
  const circle = (cx: number, cy: number, r: number, rgb: [number, number, number]) => {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) blend(x, y, rgb, 0.5);
      }
    }
  };
  const jx = imgW - 12 - 29 - 2;
  const jy = imgH - 6 - 29 - 26;
  circle(jx, jy, 29, [34, 197, 94]);
  circle(jx - 60, imgH - 6 - 29 - 2, 29, [234, 179, 8]);
  circle(jx - 78, imgH - 6 - 29 - 2 - 52, 23, [59, 130, 246]);
  circle(jx - 20, jy - 52, 23, [239, 68, 68]);

  if (leftEdgeShot) {
    const heroScreenX = (pl.x - w.cameraX) * scale;
    assert(
      heroScreenX >= 185 && heroScreenX > dpadX0 + 118,
      `[snapshot ${outName}] hero screenX ${heroScreenX.toFixed(1)} overlaps D-Pad`
    );
  }

  fs.writeFileSync(path.join(previewDir, outName), encodeRgbaPng(imgW, imgH, rgba));
}

renderSnapshotPng(0, 12, 'frame_1_1_meadow.png');
renderSnapshotPng(1, 24, 'frame_1_2_cavern.png');
renderSnapshotPng(3, 102, 'frame_1_4_boss.png');
renderSnapshotPng(0, 0, 'frame_smw_y1_yoshi_cape.png', 'smw', true);
renderSnapshotPng(0, 0, 'frame_classic_left_edge.png', 'classic', true);
renderSnapshotPng(1, 14, 'frame_smw_y2_cape.png', 'smw');
console.log('   ✔ Rendered iPhone 12 frames: frame_1_1_meadow, frame_1_2_cavern, frame_1_4_boss, frame_smw_y1_yoshi_cape, frame_classic_left_edge, frame_smw_y2_cape');
console.log('\nALL AUTOMATED CHECKS PASSED 100%!');
