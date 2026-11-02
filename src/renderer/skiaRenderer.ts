import {
  BlendMode,
  FilterMode,
  MipmapMode,
  PaintStyle,
  Skia,
  TileMode,
  type SkCanvas,
  type SkFont,
  type SkPaint,
  type SkPicture,
} from '@shopify/react-native-skia';
import { getSkiaSpriteAtlas, type SkiaSpriteAtlas } from '../art/skiaAtlas';
import { BIOMES, GROUND_ROW, LOGICAL_HEIGHT, TILE, type BiomeDefinition } from '../engine/biomes';
import { gridKey } from '../levels/levelBuilder';
import type { Enemy, Player, WorldState } from '../engine/types';

export class SkiaWorldRenderer {
  private recorder = Skia.PictureRecorder();
  private spritePaint: SkPaint;
  private fillPaint: SkPaint;
  private strokePaint: SkPaint;
  private skyPaint: SkPaint;
  private flashPaint: SkPaint;
  private cachedSkyBiome = '';
  private cachedSkyHeight = 0;

  constructor() {
    this.spritePaint = Skia.Paint();
    this.spritePaint.setAntiAlias(false);

    this.fillPaint = Skia.Paint();
    this.fillPaint.setAntiAlias(false);
    this.fillPaint.setStyle(PaintStyle.Fill);

    this.strokePaint = Skia.Paint();
    this.strokePaint.setAntiAlias(false);
    this.strokePaint.setStyle(PaintStyle.Stroke);

    this.skyPaint = Skia.Paint();

    this.flashPaint = Skia.Paint();
    this.flashPaint.setAntiAlias(false);
    this.flashPaint.setColorFilter(
      Skia.ColorFilter.MakeBlend(Skia.Color('#ffffff'), BlendMode.SrcATop)
    );
  }

  renderWorldPicture(
    world: WorldState,
    screenWidth: number,
    screenHeight: number,
    pixelFont: SkFont | null,
    crtScanlines: boolean
  ): SkPicture {
    const atlas = getSkiaSpriteAtlas();
    const bounds = Skia.XYWHRect(0, 0, screenWidth, screenHeight);
    const canvas = this.recorder.beginRecording(bounds);

    const scale = screenHeight / LOGICAL_HEIGHT;
    const viewportWorldW = screenWidth / scale;
    const biome = BIOMES[world.biomeId];

    // 1. Sky Vertical Gradient (Full-bleed widescreen across iPhone 12 OLED!)
    if (this.cachedSkyBiome !== world.biomeId || this.cachedSkyHeight !== screenHeight) {
      this.skyPaint.setShader(
        Skia.Shader.MakeLinearGradient(
          Skia.Point(0, 0),
          Skia.Point(0, screenHeight),
          [Skia.Color(biome.skyTop), Skia.Color(biome.skyBottom)],
          null,
          TileMode.Clamp
        )
      );
      this.cachedSkyBiome = world.biomeId;
      this.cachedSkyHeight = screenHeight;
    }
    canvas.drawRect(bounds, this.skyPaint);

    canvas.save();
    canvas.scale(scale, scale);

    // Optional screen shake offset (snapped to pixel grid)
    const shakeX =
      world.screenShake > 0 ? Math.sin(world.frameCount * 1.9) * world.screenShake : 0;
    const shakeY =
      world.screenShake > 0 ? Math.cos(world.frameCount * 2.3) * (world.screenShake * 0.6) : 0;
    const camX = Math.round((world.cameraX + shakeX) * 2) / 2;

    // 2. Celestial Atmosphere (Stars / Desert Sun / Moon) in screen-relative world space
    this.drawCelestialBackdrop(canvas, world, biome, viewportWorldW);

    // 3. Parallax Scenery Layer
    this.drawSceneryLayer(canvas, world, biome, camX, viewportWorldW);

    // Enter World Camera Transform
    canvas.save();
    canvas.translate(-camX, shakeY);

    // 4. Flagpole & Brick Castle
    this.drawFlagpoleAndCastle(canvas, world);

    // 5. Mid-stage Checkpoint Pennant
    this.drawCheckpoint(canvas, world);

    // 6. Spawning Powerups & Piranha Plants (drawn BEFORE blocks & pipes so they emerge cleanly!)
    for (const pw of world.powerups) {
      if (pw.spawning) {
        this.drawPowerup(canvas, atlas, world, pw.kind, pw.x, pw.y, pw.width, pw.height);
      }
    }
    for (const en of world.enemies) {
      if (en.type === 'piranha') {
        this.drawEnemy(canvas, atlas, world, en);
      }
    }

    // 7. Visible Tilemap Blocks, Lava Pools, Pipes, Moving Platforms & Springs
    const startCol = Math.max(0, Math.floor(camX / TILE) - 1);
    const endCol = Math.min(world.totalCols - 1, Math.ceil((camX + viewportWorldW) / TILE) + 1);

    this.drawLavaPools(canvas, atlas, world, startCol, endCol);
    this.drawPipes(canvas, atlas, world, camX, viewportWorldW);
    this.drawMovingPlatforms(canvas, atlas, world, camX, viewportWorldW);
    this.drawSprings(canvas, atlas, world);
    this.drawVisibleBlocks(canvas, atlas, world, startCol, endCol);

    // 8. Floating Coins & Active Powerups
    const coinFrame = (Math.floor(world.frameCount / 7) % 4) + 1;
    const coinSpriteKey = `coin_${coinFrame}`;
    for (const c of world.coinsList) {
      if (c.collected) continue;
      if (c.x + c.width < camX - 16 || c.x > camX + viewportWorldW + 16) continue;
      const bob = Math.sin(world.frameCount * 0.08 + c.phase) * 2.2;
      this.blitSprite(canvas, atlas, coinSpriteKey, c.x - 3, c.y - 1 + bob, 24, 24, false);
    }

    for (const pw of world.powerups) {
      if (!pw.spawning) {
        this.drawPowerup(canvas, atlas, world, pw.kind, pw.x, pw.y, pw.width, pw.height);
      }
    }

    // 9. Active Land & Flying Enemies
    for (const en of world.enemies) {
      if (en.type === 'piranha') continue;
      if (en.x + en.width < camX - 32 || en.x > camX + viewportWorldW + 32) continue;
      this.drawEnemy(canvas, atlas, world, en);
    }

    // 10. Fortress Boss (Rey Koopa), Golden Axe & Boss Fire Waves
    this.drawBossAndAxe(canvas, atlas, world);

    // 11. Hero Plomero
    if (!world.player.enteringCastle) {
      this.drawHero(canvas, atlas, world, world.player);
    }

    // 12. Player Fireballs
    const fbKey = Math.floor(world.frameCount / 4) % 2 === 0 ? 'fireball_1' : 'fireball_2';
    for (const fb of world.fireballs) {
      this.blitSprite(canvas, atlas, fbKey, fb.x - 4, fb.y - 4, 20, 20, fb.vx < 0);
    }

    // 13. Particles & Floating Pixel Score Popups
    for (const pt of world.particles) {
      if (pt.kind === 'coin_pop') {
        this.blitSprite(canvas, atlas, 'coin_1', pt.x - 4, pt.y - 4, 22, 22, false);
      } else {
        this.fillPaint.setColor(Skia.Color(pt.color));
        canvas.drawRect(Skia.XYWHRect(pt.x, pt.y, pt.size, pt.size), this.fillPaint);
      }
    }

    if (pixelFont) {
      for (const ft of world.floatingTexts) {
        this.fillPaint.setColor(Skia.Color('#090d16'));
        canvas.drawText(ft.text, ft.x + 2, ft.y + 2, this.fillPaint, pixelFont);
        this.fillPaint.setColor(Skia.Color(ft.color));
        canvas.drawText(ft.text, ft.x, ft.y, this.fillPaint, pixelFont);
      }
    }

    canvas.restore(); // End camera transform
    canvas.restore(); // End world scale

    // Optional Retro CRT Scanline Filter
    if (crtScanlines) {
      this.fillPaint.setColor(Skia.Color('rgba(0, 0, 0, 0.16)'));
      for (let sy = 0; sy < screenHeight; sy += 3) {
        canvas.drawRect(Skia.XYWHRect(0, sy, screenWidth, 1), this.fillPaint);
      }
    }

    return this.recorder.finishRecordingAsPicture();
  }

  private blitSprite(
    canvas: SkCanvas,
    atlas: SkiaSpriteAtlas,
    key: string,
    x: number,
    y: number,
    w: number,
    h: number,
    flipX: boolean,
    flipY = false,
    flashWhite = false
  ): void {
    const src = atlas.rects[key];
    if (!src) return;
    const paint = flashWhite ? this.flashPaint : this.spritePaint;

    if (!flipX && !flipY) {
      canvas.drawImageRectOptions(
        atlas.image,
        src,
        Skia.XYWHRect(x, y, w, h),
        FilterMode.Nearest,
        MipmapMode.None,
        paint
      );
      return;
    }

    canvas.save();
    canvas.translate(flipX ? x + w : x, flipY ? y + h : y);
    canvas.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    canvas.drawImageRectOptions(
      atlas.image,
      src,
      Skia.XYWHRect(0, 0, w, h),
      FilterMode.Nearest,
      MipmapMode.None,
      paint
    );
    canvas.restore();
  }

  private drawCelestialBackdrop(
    canvas: SkCanvas,
    world: WorldState,
    biome: BiomeDefinition,
    viewportW: number
  ): void {
    if (biome.hasStars) {
      for (let i = 0; i < 28; i++) {
        const sx = ((i * 97 + 31) % Math.ceil(viewportW));
        const sy = 18 + ((i * 53) % 190);
        const twinkle = (world.frameCount + i * 7) % 36 < 6;
        this.fillPaint.setColor(Skia.Color(twinkle ? '#fde047' : '#e2e8f0'));
        const sz = i % 4 === 0 ? 4 : 2;
        canvas.drawRect(Skia.XYWHRect(sx, sy, sz, sz), this.fillPaint);
      }
      // Crisp Crescent Moon
      this.fillPaint.setColor(Skia.Color('#fef9c3'));
      canvas.drawCircle(viewportW - 110, 62, 22, this.fillPaint);
      this.fillPaint.setColor(Skia.Color(biome.skyTop));
      canvas.drawCircle(viewportW - 101, 56, 18, this.fillPaint);
    } else if (world.biomeId === 'desert') {
      this.fillPaint.setColor(Skia.Color('rgba(254, 240, 138, 0.28)'));
      canvas.drawCircle(viewportW - 130, 74, 42, this.fillPaint);
      this.fillPaint.setColor(Skia.Color('#fef08a'));
      canvas.drawCircle(viewportW - 130, 74, 26, this.fillPaint);
    }
  }

  private drawSceneryLayer(
    canvas: SkCanvas,
    world: WorldState,
    biome: BiomeDefinition,
    camX: number,
    viewportW: number
  ): void {
    for (const sc of world.sceneries) {
      const drawX = sc.x - camX * sc.parallax;
      if (drawX + 180 < 0 || drawX - 180 > viewportW) continue;

      if (sc.kind === 'cloud') {
        const w = sc.scale === 1 ? 68 : 104;
        this.fillPaint.setColor(Skia.Color(biome.cloudShadow));
        canvas.drawRect(Skia.XYWHRect(drawX + 4, sc.y + 18, w - 8, 10), this.fillPaint);
        this.fillPaint.setColor(Skia.Color(biome.cloudFill));
        canvas.drawRect(Skia.XYWHRect(drawX, sc.y + 8, w, 16), this.fillPaint);
        canvas.drawRect(Skia.XYWHRect(drawX + 14, sc.y, w - 28, 14), this.fillPaint);
      } else if (sc.kind === 'hill' || sc.kind === 'dune') {
        const w = sc.scale === 1 ? 104 : 156;
        const h = sc.scale === 1 ? 52 : 78;
        this.fillPaint.setColor(Skia.Color(biome.hillOutline));
        // Stepped pixel-art pyramid/hill silhouette!
        const steps = 6;
        for (let s = 0; s < steps; s++) {
          const frac = (s + 1) / steps;
          const sw = w * frac;
          const sh = h / steps + 2;
          const sx = drawX + (w - sw) / 2;
          const sy = sc.y - h + s * (h / steps);
          this.fillPaint.setColor(Skia.Color(biome.hillOutline));
          canvas.drawRect(Skia.XYWHRect(sx - 2, sy - 2, sw + 4, sh + 2), this.fillPaint);
          this.fillPaint.setColor(Skia.Color(sc.scale === 1 ? biome.distantHill : biome.nearHill));
          canvas.drawRect(Skia.XYWHRect(sx, sy, sw, sh), this.fillPaint);
        }
      } else if (sc.kind === 'pine') {
        const baseX = drawX + 24;
        this.fillPaint.setColor(Skia.Color('#0f172a'));
        canvas.drawRect(Skia.XYWHRect(baseX + 14, sc.y - 18, 10, 18), this.fillPaint);
        for (let tier = 0; tier < 3; tier++) {
          const tw = 44 - tier * 10;
          const ty = sc.y - 34 - tier * 18;
          this.fillPaint.setColor(Skia.Color('#075985'));
          canvas.drawRect(Skia.XYWHRect(baseX + (38 - tw) / 2, ty, tw, 20), this.fillPaint);
          this.fillPaint.setColor(Skia.Color('#e0f2fe'));
          canvas.drawRect(Skia.XYWHRect(baseX + (38 - tw) / 2, ty, tw, 5), this.fillPaint);
        }
      } else if (sc.kind === 'bush') {
        const w = 44 + sc.scale * 16;
        this.fillPaint.setColor(Skia.Color('#09150d'));
        canvas.drawRect(Skia.XYWHRect(drawX - 2, sc.y - 18, w + 4, 18), this.fillPaint);
        this.fillPaint.setColor(Skia.Color(biome.bushFill));
        canvas.drawRect(Skia.XYWHRect(drawX, sc.y - 16, w, 16), this.fillPaint);
        this.fillPaint.setColor(Skia.Color(biome.bushHighlight));
        canvas.drawRect(Skia.XYWHRect(drawX + 6, sc.y - 14, w - 16, 4), this.fillPaint);
      } else if (sc.kind === 'pillar') {
        this.fillPaint.setColor(Skia.Color('#0f172a'));
        canvas.drawRect(Skia.XYWHRect(drawX, sc.y, 30, 11 * TILE), this.fillPaint);
        this.fillPaint.setColor(Skia.Color('#1e3a8a'));
        canvas.drawRect(Skia.XYWHRect(drawX + 4, sc.y, 10, 11 * TILE), this.fillPaint);
      } else if (sc.kind === 'banner') {
        this.fillPaint.setColor(Skia.Color('#450a0a'));
        canvas.drawRect(Skia.XYWHRect(drawX, sc.y, 28, 92), this.fillPaint);
        this.fillPaint.setColor(Skia.Color('#b91c1c'));
        canvas.drawRect(Skia.XYWHRect(drawX + 4, sc.y + 4, 20, 76), this.fillPaint);
        this.fillPaint.setColor(Skia.Color('#facc15'));
        canvas.drawRect(Skia.XYWHRect(drawX + 10, sc.y + 18, 8, 32), this.fillPaint);
      }
    }
  }

  private drawFlagpoleAndCastle(canvas: SkCanvas, world: WorldState): void {
    const fp = world.flagpole;
    if (!fp) return;

    // Base pedestal block
    this.fillPaint.setColor(Skia.Color('#141013'));
    canvas.drawRect(Skia.XYWHRect(fp.x - 10, GROUND_ROW * TILE - TILE, TILE, TILE), this.fillPaint);
    this.fillPaint.setColor(Skia.Color('#d97706'));
    canvas.drawRect(
      Skia.XYWHRect(fp.x - 8, GROUND_ROW * TILE - TILE + 2, TILE - 4, TILE - 4),
      this.fillPaint
    );

    // Pole & golden finial
    this.fillPaint.setColor(Skia.Color('#e2e8f0'));
    canvas.drawRect(Skia.XYWHRect(fp.x + 3, fp.y, 6, fp.height - TILE), this.fillPaint);
    this.fillPaint.setColor(Skia.Color('#facc15'));
    canvas.drawCircle(fp.x + 6, fp.y, 9, this.fillPaint);

    // Emerald Pennant Flag with Star Emblem
    this.fillPaint.setColor(Skia.Color('#16a34a'));
    canvas.drawRect(Skia.XYWHRect(fp.x - 34, fp.flagY, 38, 24), this.fillPaint);
    this.fillPaint.setColor(Skia.Color('#fde047'));
    canvas.drawRect(Skia.XYWHRect(fp.x - 22, fp.flagY + 6, 12, 12), this.fillPaint);

    // Pixel Brick Castle
    const cx = fp.castleX;
    const cy = fp.castleY;
    this.fillPaint.setColor(Skia.Color('#141013'));
    canvas.drawRect(Skia.XYWHRect(cx - 2, cy + 34, 132, 96), this.fillPaint);
    canvas.drawRect(Skia.XYWHRect(cx + 22, cy - 2, 84, 40), this.fillPaint);

    this.fillPaint.setColor(Skia.Color('#b45309'));
    canvas.drawRect(Skia.XYWHRect(cx, cy + 36, 128, 92), this.fillPaint);
    canvas.drawRect(Skia.XYWHRect(cx + 24, cy, 80, 38), this.fillPaint);

    // Battlements
    for (let i = 0; i < 5; i++) {
      this.fillPaint.setColor(Skia.Color('#d97706'));
      canvas.drawRect(Skia.XYWHRect(cx + i * 28, cy + 26, 16, 10), this.fillPaint);
    }
    for (let i = 0; i < 4; i++) {
      canvas.drawRect(Skia.XYWHRect(cx + 24 + i * 22, cy - 10, 14, 10), this.fillPaint);
    }

    // Castle Windows & Dark Archway Door
    this.fillPaint.setColor(Skia.Color('#090d16'));
    canvas.drawRect(Skia.XYWHRect(cx + 38, cy + 12, 14, 18), this.fillPaint);
    canvas.drawRect(Skia.XYWHRect(cx + 76, cy + 12, 14, 18), this.fillPaint);
    canvas.drawRect(Skia.XYWHRect(cx + 46, cy + 76, 36, 52), this.fillPaint);
    canvas.drawCircle(cx + 64, cy + 78, 18, this.fillPaint);
  }

  private drawCheckpoint(canvas: SkCanvas, world: WorldState): void {
    const cp = world.checkpoint;
    if (!cp) return;
    this.fillPaint.setColor(Skia.Color('#cbd5e1'));
    canvas.drawRect(Skia.XYWHRect(cp.x + 8, cp.y, 4, cp.height), this.fillPaint);
    this.fillPaint.setColor(Skia.Color(cp.activated ? '#38bdf8' : '#ef4444'));
    const flagY = cp.activated ? cp.y + 4 : cp.y + 28;
    canvas.drawRect(Skia.XYWHRect(cp.x + 12, flagY, 24, 16), this.fillPaint);
    this.fillPaint.setColor(Skia.Color('#fde047'));
    canvas.drawCircle(cp.x + 10, cp.y, 5, this.fillPaint);
  }

  private drawLavaPools(
    canvas: SkCanvas,
    atlas: SkiaSpriteAtlas,
    world: WorldState,
    startCol: number,
    endCol: number
  ): void {
    if (world.lavaCols.size === 0) return;
    const lavaKey = Math.floor(world.frameCount / 14) % 2 === 0 ? 'tile_lava_1' : 'tile_lava_2';
    for (let col = startCol; col <= endCol; col++) {
      if (!world.lavaCols.has(col)) continue;
      this.blitSprite(canvas, atlas, lavaKey, col * TILE, GROUND_ROW * TILE + 6, TILE, TILE, false);
      this.fillPaint.setColor(Skia.Color('#dc2626'));
      canvas.drawRect(
        Skia.XYWHRect(col * TILE, (GROUND_ROW + 1) * TILE, TILE, TILE),
        this.fillPaint
      );
    }
  }

  private drawPipes(
    canvas: SkCanvas,
    atlas: SkiaSpriteAtlas,
    world: WorldState,
    camX: number,
    viewportW: number
  ): void {
    const prefix = world.biomeId;
    for (const p of world.pipes) {
      if (p.x + p.width < camX - TILE || p.x > camX + viewportW + TILE) continue;
      const rows = Math.round(p.height / TILE);
      this.blitSprite(canvas, atlas, `${prefix}_pipe_tl`, p.x, p.y, TILE, TILE, false);
      this.blitSprite(canvas, atlas, `${prefix}_pipe_tr`, p.x + TILE, p.y, TILE, TILE, false);
      for (let r = 1; r < rows; r++) {
        this.blitSprite(canvas, atlas, `${prefix}_pipe_bl`, p.x, p.y + r * TILE, TILE, TILE, false);
        this.blitSprite(
          canvas,
          atlas,
          `${prefix}_pipe_br`,
          p.x + TILE,
          p.y + r * TILE,
          TILE,
          TILE,
          false
        );
      }
    }
  }

  private drawMovingPlatforms(
    canvas: SkCanvas,
    atlas: SkiaSpriteAtlas,
    world: WorldState,
    camX: number,
    viewportW: number
  ): void {
    for (const pl of world.platforms) {
      if (pl.x + pl.width < camX - TILE || pl.x > camX + viewportW + TILE) continue;
      const tiles = Math.round(pl.width / TILE);
      for (let t = 0; t < tiles; t++) {
        this.blitSprite(canvas, atlas, 'tile_bridge', pl.x + t * TILE, pl.y - 4, TILE, TILE, false);
      }
    }
  }

  private drawSprings(canvas: SkCanvas, atlas: SkiaSpriteAtlas, world: WorldState): void {
    for (const sp of world.springs) {
      const key = sp.compressTimer > 0 ? 'spring_comp' : 'spring_idle';
      this.blitSprite(canvas, atlas, key, sp.x - 3, sp.y - 4, TILE, TILE, false);
    }
  }

  private drawVisibleBlocks(
    canvas: SkCanvas,
    atlas: SkiaSpriteAtlas,
    world: WorldState,
    startCol: number,
    endCol: number
  ): void {
    const qFrame = (Math.floor(world.frameCount / 10) % 3) + 1;
    const prefix = world.biomeId;

    for (let row = 0; row < 14; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const b = world.blockGrid.get(gridKey(col, row));
        if (!b || b.type === 'hidden') continue;

        let spriteKey: string;
        switch (b.type) {
          case 'ground_top':
            spriteKey = `${prefix}_ground_top`;
            break;
          case 'ground_deep':
            spriteKey = `${prefix}_ground_deep`;
            break;
          case 'brick':
            spriteKey = `${prefix}_brick`;
            break;
          case 'hard':
            spriteKey = `${prefix}_hard`;
            break;
          case 'question':
            spriteKey = `tile_question_${qFrame}`;
            break;
          case 'empty':
            spriteKey = 'tile_empty';
            break;
          case 'bridge':
            spriteKey = 'tile_bridge';
            break;
          default:
            spriteKey = `${prefix}_brick`;
        }

        this.blitSprite(canvas, atlas, spriteKey, b.x, b.y, TILE, TILE, false);
      }
    }
  }

  private drawPowerup(
    canvas: SkCanvas,
    atlas: SkiaSpriteAtlas,
    world: WorldState,
    kind: string,
    x: number,
    y: number,
    w: number,
    h: number
  ): void {
    const alt = Math.floor(world.frameCount / 7) % 2 === 0;
    const key =
      kind === 'mushroom'
        ? 'mushroom_super'
        : kind === 'one_up'
        ? 'mushroom_1up'
        : kind === 'star'
        ? alt
          ? 'star_1'
          : 'star_2'
        : alt
        ? 'flower_1'
        : 'flower_2';
    this.blitSprite(canvas, atlas, key, x - 2, y - 2, w + 4, h + 4, false);
  }

  private drawEnemy(
    canvas: SkCanvas,
    atlas: SkiaSpriteAtlas,
    world: WorldState,
    en: Enemy
  ): void {
    const step = Math.floor(en.animTimer / 9) % 2 === 0;
    const isKnocked = en.state === 'knocked';

    if (en.type === 'goomba') {
      const blue = world.biomeId === 'cavern' || world.biomeId === 'night';
      const prefix = blue ? 'goomba_blue' : 'goomba';
      const key =
        en.state === 'squashed'
          ? `${prefix}_flat`
          : step
          ? `${prefix}_walk1`
          : `${prefix}_walk2`;
      this.blitSprite(canvas, atlas, key, en.x - 3, en.y - 4, 32, 32, false, isKnocked);
      return;
    }

    if (en.type === 'piranha') {
      const hiddenY = en.baseY + en.height + 6;
      if (en.y >= hiddenY - 2) return;
      const key = Math.floor(en.animTimer / 8) % 2 === 0 ? 'piranha_open' : 'piranha_closed';
      this.blitSprite(canvas, atlas, key, en.x - 4, en.y - 6, 32, 48, false, false);
      return;
    }

    if (en.type === 'spiny') {
      const key = step ? 'spiny_walk1' : 'spiny_walk2';
      this.blitSprite(canvas, atlas, key, en.x - 3, en.y - 4, 32, 32, en.facing === -1, isKnocked);
      return;
    }

    if (en.type === 'paratroopa') {
      const key = Math.floor(en.animTimer / 7) % 2 === 0 ? 'paratroopa_fly1' : 'paratroopa_fly2';
      this.blitSprite(canvas, atlas, key, en.x - 3, en.y - 10, 32, 48, en.facing === -1, isKnocked);
      return;
    }

    // Green or Red Koopa & Shells
    const color = en.type === 'koopa_red' ? 'red' : 'green';
    if (en.state === 'shell_idle' || en.state === 'shell_slide' || en.state === 'shell_wake') {
      const key =
        en.state === 'shell_wake'
          ? `koopa_${color}_wake`
          : en.state === 'shell_slide' && Math.floor(en.animTimer / 3) % 2 === 1
          ? `koopa_${color}_shell2`
          : `koopa_${color}_shell1`;
      this.blitSprite(canvas, atlas, key, en.x - 3, en.y - 4, 32, 32, false, isKnocked);
    } else {
      const key = step ? `koopa_${color}_walk1` : `koopa_${color}_walk2`;
      this.blitSprite(canvas, atlas, key, en.x - 3, en.y - 10, 32, 48, en.facing === -1, isKnocked);
    }
  }

  private drawBossAndAxe(canvas: SkCanvas, atlas: SkiaSpriteAtlas, world: WorldState): void {
    const boss = world.boss;
    if (!boss) return;

    if (!boss.axeGrabbed) {
      const pulse = Math.sin(world.frameCount * 0.2) * 2;
      this.blitSprite(canvas, atlas, 'axe_1', boss.axeX, boss.axeY + pulse, TILE, TILE, false);
    }

    if (!boss.defeated || boss.fallingInLava) {
      const key = boss.roarTimer > 0 ? 'boss_roar' : 'boss_idle';
      // Boss sprite faces LEFT (-1) natively; flip when facing RIGHT (1)
      this.blitSprite(
        canvas,
        atlas,
        key,
        boss.x - 4,
        boss.y - 4,
        64,
        64,
        boss.facing === 1,
        false,
        boss.hurtFlashTimer > 0
      );
    }

    for (const bf of world.bossFires) {
      const key = Math.floor(bf.animTimer / 4) % 2 === 0 ? 'boss_fire1' : 'boss_fire2';
      this.blitSprite(canvas, atlas, key, bf.x, bf.y, bf.width, bf.height, bf.vx > 0);
    }
  }

  private drawHero(
    canvas: SkCanvas,
    atlas: SkiaSpriteAtlas,
    world: WorldState,
    p: Player
  ): void {
    if (p.invulnTimer > 0 && Math.floor(p.invulnTimer / 3) % 2 === 1) {
      return;
    }

    const variant =
      p.starTimer > 0
        ? `star${Math.floor(world.frameCount / 3) % 3}`
        : p.powerState === 2
        ? 'fire'
        : 'norm';

    const flipX = p.facing === -1;

    if (p.powerState === 0 || p.dead) {
      let pose = 'idle';
      if (p.dead) {
        pose = 'dead';
      } else if (!p.onGround && world.status !== 'flagpole') {
        pose = 'jump';
      } else if (p.skidding) {
        pose = 'skid';
      } else if (Math.abs(p.vx) > 0.2) {
        const runIdx = (Math.floor(p.animTimer) % 3) + 1;
        pose = `run${runIdx}`;
      }
      this.blitSprite(
        canvas,
        atlas,
        `hero_small_${variant}_${pose}`,
        p.x - 5,
        p.y - 2,
        32,
        32,
        flipX
      );
      return;
    }

    // Super / Fire Hero (16x24 sprite -> 32x48 world units aligned to bottom of hitbox)
    let pose = 'idle';
    if (p.crouching) {
      pose = 'crouch';
    } else if (p.throwPoseTimer > 0) {
      pose = 'throw';
    } else if (!p.onGround && world.status !== 'flagpole') {
      pose = 'jump';
    } else if (p.skidding) {
      pose = 'skid';
    } else if (Math.abs(p.vx) > 0.2) {
      const runIdx = (Math.floor(p.animTimer) % 3) + 1;
      pose = `run${runIdx}`;
    }

    const drawY = p.y + p.height - 48;
    this.blitSprite(
      canvas,
      atlas,
      `hero_big_${variant}_${pose}`,
      p.x - 5,
      drawY,
      32,
      48,
      flipX
    );
  }
}
