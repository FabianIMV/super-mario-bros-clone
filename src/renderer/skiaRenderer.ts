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
import {
  BIOMES,
  GROUND_ROW,
  LOGICAL_HEIGHT,
  TILE,
  WORLD_VERTICAL_LIFT,
  type BiomeDefinition,
} from '../engine/biomes';
import { gridKey } from '../levels/levelBuilder';
import { lavaTideRise, platformGlow } from '../engine/mechanics';
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

    const shakeX =
      world.screenShake > 0 ? Math.sin(world.frameCount * 1.9) * world.screenShake : 0;
    const shakeY =
      world.screenShake > 0 ? Math.cos(world.frameCount * 2.3) * (world.screenShake * 0.6) : 0;
    const camX = Math.round((world.cameraX + shakeX) * 2) / 2;

    // 2. Celestial Atmosphere
    this.drawCelestialBackdrop(canvas, world, biome, viewportWorldW);

    // 3. Parallax Scenery Layer (lifted cleanly with playfield!)
    canvas.save();
    canvas.translate(0, -WORLD_VERTICAL_LIFT);
    this.drawSceneryLayer(canvas, world, biome, camX, viewportWorldW);
    canvas.restore();

    // Enter World Camera Transform (lifted by WORLD_VERTICAL_LIFT so ground sits clear above lower controls!)
    canvas.save();
    canvas.translate(-camX, shakeY - WORLD_VERTICAL_LIFT);

    // 4. Left & Right Seamless Decorative Border Ground & Start Fence
    this.drawBorderTerrain(canvas, atlas, world, camX, viewportWorldW);

    // 5. Classic Flagpole OR SMW Striped Giant Gate & Moving Tape
    this.drawFlagpoleAndCastle(canvas, world);
    this.drawGoalTapeAndCastle(canvas, world);

    // 6. Mid-stage Checkpoint Pennant
    this.drawCheckpoint(canvas, world);

    // 7. Spawning Powerups & Piranha Plants
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

    // 8. Visible Tilemap Blocks, Lava Pools, Pipes, Moving Platforms & Springs
    const startCol = Math.max(0, Math.floor(camX / TILE) - 1);
    const endCol = Math.min(world.totalCols - 1, Math.ceil((camX + viewportWorldW) / TILE) + 1);

    this.drawLowGravZones(canvas, world, camX, viewportWorldW);
    this.drawLavaPools(canvas, atlas, world, startCol, endCol);
    this.drawPipes(canvas, atlas, world, camX, viewportWorldW);
    this.drawMovingPlatforms(canvas, atlas, world, camX, viewportWorldW);
    this.drawSprings(canvas, atlas, world);
    this.drawVisibleBlocks(canvas, atlas, world, startCol, endCol);
    this.drawIcicles(canvas, world, camX, viewportWorldW);

    // 9. Red Berries, Coins, SMW Dragon Coins & Active Powerups
    for (const br of world.berries) {
      if (br.eaten) continue;
      if (br.x + br.width < camX - 16 || br.x > camX + viewportWorldW + 16) continue;
      const bob = Math.sin(world.frameCount * 0.07 + br.x * 0.05) * 1.5;
      this.blitSprite(canvas, atlas, 'berry_red', br.x - 2, br.y - 2 + bob, 24, 24, false);
    }

    const coinFrame = (Math.floor(world.frameCount / 7) % 4) + 1;
    const coinSpriteKey = `coin_${coinFrame}`;
    for (const c of world.coinsList) {
      if (c.collected) continue;
      if (c.x + c.width < camX - 16 || c.x > camX + viewportWorldW + 16) continue;
      const bob = Math.sin(world.frameCount * 0.08 + c.phase) * 2.2;
      this.blitSprite(canvas, atlas, coinSpriteKey, c.x - 3, c.y - 1 + bob, 24, 24, false);
    }

    const dcKey = Math.floor(world.frameCount / 9) % 2 === 0 ? 'dragon_coin_1' : 'dragon_coin_2';
    for (const dc of world.dragonCoins) {
      if (dc.collected) continue;
      if (dc.x + dc.width < camX - 24 || dc.x > camX + viewportWorldW + 24) continue;
      const bob = Math.sin(world.frameCount * 0.07 + dc.phase) * 2.8;
      this.blitSprite(canvas, atlas, dcKey, dc.x - 4, dc.y - 2 + bob, 32, 48, false);
    }

    for (const pw of world.powerups) {
      if (!pw.spawning) {
        this.drawPowerup(canvas, atlas, world, pw.kind, pw.x, pw.y, pw.width, pw.height);
      }
    }

    // 10. Unmounted Yoshis & Eggs!
    this.drawYoshis(canvas, atlas, world);

    // 11. Active Land & Flying Enemies
    for (const en of world.enemies) {
      if (en.type === 'piranha') continue;
      if (en.x + en.width < camX - 40 || en.x > camX + viewportWorldW + 40) continue;
      this.drawEnemy(canvas, atlas, world, en);
    }

    // 12. Fortress Boss (Rey Koopa), Golden Axe & Boss Fire Waves
    this.drawBossAndAxe(canvas, atlas, world);

    // 13. Hero Plomero (including Riding Yoshi + Extending Tongue + Golden SMW Cape!)
    if (!world.player.enteringCastle) {
      this.drawHero(canvas, atlas, world, world.player);
    }

    // 14. Player & Yoshi Fireballs
    const fbKey = Math.floor(world.frameCount / 4) % 2 === 0 ? 'fireball_1' : 'fireball_2';
    for (const fb of world.fireballs) {
      const sz = fb.fromYoshi ? 24 : 20;
      this.blitSprite(canvas, atlas, fbKey, fb.x - 4, fb.y - 4, sz, sz, fb.vx < 0);
    }

    // 15. Particles & Floating Pixel Score Popups
    for (const pt of world.particles) {
      if (pt.kind === 'wind') {
        this.fillPaint.setColor(Skia.Color(pt.color));
        canvas.drawRect(Skia.XYWHRect(pt.x, pt.y, 26, 2), this.fillPaint);
      } else if (pt.kind === 'coin_pop') {
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

  private drawBorderTerrain(
    canvas: SkCanvas,
    atlas: SkiaSpriteAtlas,
    world: WorldState,
    camX: number,
    viewportW: number
  ): void {
    const prefix = world.biomeId;
    const biome = BIOMES[world.biomeId];

    // Left start terrace (cols -10..-1) so negative cameraX renders rich natural ground!
    if (camX < 0) {
      const minLeftCol = Math.floor(camX / TILE) - 1;
      for (let col = minLeftCol; col < 0; col++) {
        this.blitSprite(canvas, atlas, `${prefix}_ground_top`, col * TILE, GROUND_ROW * TILE, TILE, TILE, false);
        this.blitSprite(canvas, atlas, `${prefix}_ground_deep`, col * TILE, (GROUND_ROW + 1) * TILE, TILE, TILE, false);
        this.blitSprite(canvas, atlas, `${prefix}_ground_deep`, col * TILE, (GROUND_ROW + 2) * TILE, TILE, TILE, false);
        if (biome.underground) {
          this.blitSprite(canvas, atlas, `${prefix}_hard`, col * TILE, 0, TILE, TILE, false);
        }
      }

      // Cute wooden start signpost right at x = -22 marking the stage boundary!
      this.fillPaint.setColor(Skia.Color('#451a03'));
      canvas.drawRect(Skia.XYWHRect(-20, GROUND_ROW * TILE - 34, 6, 34), this.fillPaint);
      this.fillPaint.setColor(Skia.Color('#fde68a'));
      canvas.drawRect(Skia.XYWHRect(-34, GROUND_ROW * TILE - 46, 32, 18), this.fillPaint);
      this.fillPaint.setColor(Skia.Color('#dc2626'));
      canvas.drawRect(Skia.XYWHRect(-26, GROUND_ROW * TILE - 40, 16, 6), this.fillPaint);
    }

    // Right end terrace (cols totalCols..totalCols+8)
    const maxVisCol = Math.ceil((camX + viewportW) / TILE) + 1;
    for (let col = world.totalCols; col <= maxVisCol; col++) {
      this.blitSprite(canvas, atlas, `${prefix}_ground_top`, col * TILE, GROUND_ROW * TILE, TILE, TILE, false);
      this.blitSprite(canvas, atlas, `${prefix}_ground_deep`, col * TILE, (GROUND_ROW + 1) * TILE, TILE, TILE, false);
      this.blitSprite(canvas, atlas, `${prefix}_ground_deep`, col * TILE, (GROUND_ROW + 2) * TILE, TILE, TILE, false);
    }
  }

  private drawCelestialBackdrop(
    canvas: SkCanvas,
    world: WorldState,
    biome: BiomeDefinition,
    viewportW: number
  ): void {
    if (biome.hasStars) {
      for (let i = 0; i < 28; i++) {
        const sx = (i * 97 + 31) % Math.ceil(viewportW);
        const sy = 18 + ((i * 53) % 190);
        const twinkle = (world.frameCount + i * 7) % 36 < 6;
        this.fillPaint.setColor(Skia.Color(twinkle ? '#fde047' : '#e2e8f0'));
        const sz = i % 4 === 0 ? 4 : 2;
        canvas.drawRect(Skia.XYWHRect(sx, sy, sz, sz), this.fillPaint);
      }
      this.fillPaint.setColor(Skia.Color('#fef9c3'));
      canvas.drawCircle(viewportW - 110, 62, 22, this.fillPaint);
      this.fillPaint.setColor(Skia.Color(biome.skyTop));
      canvas.drawCircle(viewportW - 101, 56, 18, this.fillPaint);
    } else if (world.biomeId === 'desert' || world.biomeId === 'donut_plains') {
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
      if (drawX + 200 < 0 || drawX - 200 > viewportW) continue;

      if (sc.kind === 'yoshi_house') {
        // Iconic Yoshi's Island Treehouse Cabin & Mailbox!
        this.fillPaint.setColor(Skia.Color('#78350f'));
        canvas.drawRect(Skia.XYWHRect(drawX + 22, sc.y - 68, 36, 68), this.fillPaint);
        this.fillPaint.setColor(Skia.Color('#064e3b'));
        canvas.drawRect(Skia.XYWHRect(drawX - 8, sc.y - 118, 96, 56), this.fillPaint);
        this.fillPaint.setColor(Skia.Color('#16a34a'));
        canvas.drawRect(Skia.XYWHRect(drawX - 4, sc.y - 114, 88, 48), this.fillPaint);
        this.fillPaint.setColor(Skia.Color('#ef4444'));
        canvas.drawRect(Skia.XYWHRect(drawX + 8, sc.y - 102, 8, 8), this.fillPaint);
        canvas.drawRect(Skia.XYWHRect(drawX + 58, sc.y - 96, 8, 8), this.fillPaint);
        canvas.drawRect(Skia.XYWHRect(drawX + 34, sc.y - 108, 8, 8), this.fillPaint);
        // Red Mailbox
        this.fillPaint.setColor(Skia.Color('#dc2626'));
        canvas.drawRect(Skia.XYWHRect(drawX + 74, sc.y - 34, 18, 14), this.fillPaint);
        this.fillPaint.setColor(Skia.Color('#451a03'));
        canvas.drawRect(Skia.XYWHRect(drawX + 80, sc.y - 20, 5, 20), this.fillPaint);
      } else if (sc.kind === 'smw_hill') {
        // Authentic rounded SNES Super Mario World dome hills with spot highlights!
        const w = sc.scale === 1 ? 92 : 136;
        const h = sc.scale === 1 ? 66 : 98;
        this.fillPaint.setColor(Skia.Color(biome.hillOutline));
        canvas.drawRect(Skia.XYWHRect(drawX - 3, sc.y - h + 16, w + 6, h - 16), this.fillPaint);
        canvas.drawCircle(drawX + w / 2, sc.y - h + 22, w / 2 + 2, this.fillPaint);

        const bodyCol = sc.scale === 1 ? biome.distantHill : biome.nearHill;
        this.fillPaint.setColor(Skia.Color(bodyCol));
        canvas.drawRect(Skia.XYWHRect(drawX, sc.y - h + 18, w, h - 18), this.fillPaint);
        canvas.drawCircle(drawX + w / 2, sc.y - h + 22, w / 2 - 1, this.fillPaint);

        this.fillPaint.setColor(Skia.Color(biome.bushHighlight));
        canvas.drawRect(Skia.XYWHRect(drawX + w * 0.28, sc.y - h + 24, 14, 8), this.fillPaint);
        canvas.drawRect(Skia.XYWHRect(drawX + w * 0.56, sc.y - h + 44, 16, 8), this.fillPaint);
      } else if (sc.kind === 'cloud') {
        const w = sc.scale === 1 ? 68 : 104;
        this.fillPaint.setColor(Skia.Color(biome.cloudShadow));
        canvas.drawRect(Skia.XYWHRect(drawX + 4, sc.y + 18, w - 8, 10), this.fillPaint);
        this.fillPaint.setColor(Skia.Color(biome.cloudFill));
        canvas.drawRect(Skia.XYWHRect(drawX, sc.y + 8, w, 16), this.fillPaint);
        canvas.drawRect(Skia.XYWHRect(drawX + 14, sc.y, w - 28, 14), this.fillPaint);
      } else if (sc.kind === 'hill' || sc.kind === 'dune') {
        const w = sc.scale === 1 ? 104 : 156;
        const h = sc.scale === 1 ? 52 : 78;
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

    this.fillPaint.setColor(Skia.Color('#141013'));
    canvas.drawRect(Skia.XYWHRect(fp.x - 10, GROUND_ROW * TILE - TILE, TILE, TILE), this.fillPaint);
    this.fillPaint.setColor(Skia.Color('#d97706'));
    canvas.drawRect(
      Skia.XYWHRect(fp.x - 8, GROUND_ROW * TILE - TILE + 2, TILE - 4, TILE - 4),
      this.fillPaint
    );

    this.fillPaint.setColor(Skia.Color('#e2e8f0'));
    canvas.drawRect(Skia.XYWHRect(fp.x + 3, fp.y, 6, fp.height - TILE), this.fillPaint);
    this.fillPaint.setColor(Skia.Color('#facc15'));
    canvas.drawCircle(fp.x + 6, fp.y, 9, this.fillPaint);

    this.fillPaint.setColor(Skia.Color('#16a34a'));
    canvas.drawRect(Skia.XYWHRect(fp.x - 34, fp.flagY, 38, 24), this.fillPaint);
    this.fillPaint.setColor(Skia.Color('#fde047'));
    canvas.drawRect(Skia.XYWHRect(fp.x - 22, fp.flagY + 6, 12, 12), this.fillPaint);

    this.drawCastleBuilding(canvas, fp.castleX, fp.castleY);
  }

  private drawGoalTapeAndCastle(canvas: SkCanvas, world: WorldState): void {
    const gt = world.goalTape;
    if (!gt) return;

    // SMW Twin Striped Giant Gate Posts!
    const postXs = [gt.x - 6, gt.x + 22];
    const stripes = Math.floor(gt.height / 12);
    for (const px of postXs) {
      this.fillPaint.setColor(Skia.Color('#090d16'));
      canvas.drawRect(Skia.XYWHRect(px - 2, gt.y - 2, 12, gt.height + 4), this.fillPaint);
      for (let s = 0; s < stripes; s++) {
        this.fillPaint.setColor(Skia.Color(s % 2 === 0 ? '#ffffff' : '#1e293b'));
        canvas.drawRect(Skia.XYWHRect(px, gt.y + s * 12, 8, 12), this.fillPaint);
      }
      this.fillPaint.setColor(Skia.Color('#facc15'));
      canvas.drawCircle(px + 4, gt.y - 4, 8, this.fillPaint);
    }

    // Moving Golden/Crimson Tape Bar!
    if (!gt.triggered) {
      this.fillPaint.setColor(Skia.Color('#090d16'));
      canvas.drawRect(Skia.XYWHRect(gt.x - 2, gt.barY - 5, 32, 12), this.fillPaint);
      this.fillPaint.setColor(Skia.Color('#fde047'));
      canvas.drawRect(Skia.XYWHRect(gt.x, gt.barY - 3, 28, 8), this.fillPaint);
      this.fillPaint.setColor(Skia.Color('#ef4444'));
      canvas.drawRect(Skia.XYWHRect(gt.x + 8, gt.barY - 3, 12, 4), this.fillPaint);
    }

    this.drawCastleBuilding(canvas, gt.castleX, gt.castleY);
  }

  private drawCastleBuilding(canvas: SkCanvas, cx: number, cy: number): void {
    this.fillPaint.setColor(Skia.Color('#141013'));
    canvas.drawRect(Skia.XYWHRect(cx - 2, cy + 34, 132, 96), this.fillPaint);
    canvas.drawRect(Skia.XYWHRect(cx + 22, cy - 2, 84, 40), this.fillPaint);

    this.fillPaint.setColor(Skia.Color('#b45309'));
    canvas.drawRect(Skia.XYWHRect(cx, cy + 36, 128, 92), this.fillPaint);
    canvas.drawRect(Skia.XYWHRect(cx + 24, cy, 80, 38), this.fillPaint);

    for (let i = 0; i < 5; i++) {
      this.fillPaint.setColor(Skia.Color('#d97706'));
      canvas.drawRect(Skia.XYWHRect(cx + i * 28, cy + 26, 16, 10), this.fillPaint);
    }
    for (let i = 0; i < 4; i++) {
      canvas.drawRect(Skia.XYWHRect(cx + 24 + i * 22, cy - 10, 14, 10), this.fillPaint);
    }

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
    const rise = lavaTideRise(world);
    for (let col = startCol; col <= endCol; col++) {
      if (!world.lavaCols.has(col)) continue;
      const colRise = rise > 0 && !world.boss?.bridgeCols.includes(col) ? rise : 0;
      if (colRise > 0) {
        this.fillPaint.setColor(Skia.Color('#ea580c'));
        const top = GROUND_ROW * TILE + 6 - colRise;
        canvas.drawRect(
          Skia.XYWHRect(col * TILE, top, TILE, (GROUND_ROW + 1) * TILE - top + 1),
          this.fillPaint
        );
      }
      this.blitSprite(canvas, atlas, lavaKey, col * TILE, GROUND_ROW * TILE + 6 - colRise, TILE, TILE, false);
      this.fillPaint.setColor(Skia.Color('#dc2626'));
      canvas.drawRect(
        Skia.XYWHRect(col * TILE, (GROUND_ROW + 1) * TILE, TILE, TILE * 2),
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
      const glow = platformGlow(pl, world.frameCount);
      if (pl.blink && glow === 0) {
        // Apagada: solo un contorno punteado para saber dónde volverá
        this.fillPaint.setColor(Skia.Color('rgba(190, 242, 100, 0.35)'));
        for (let k = 0; k < tiles * 4; k += 2) {
          canvas.drawRect(Skia.XYWHRect(pl.x + k * 8, pl.y, 6, 3), this.fillPaint);
        }
        continue;
      }
      for (let t = 0; t < tiles; t++) {
        this.blitSprite(canvas, atlas, 'tile_bridge', pl.x + t * TILE, pl.y - 4, TILE, TILE, false);
      }
      if (pl.blink) {
        // Luciérnagas sobre la plataforma
        this.fillPaint.setColor(Skia.Color(glow < 1 ? 'rgba(217, 249, 157, 0.35)' : '#d9f99d'));
        for (let k = 0; k < tiles * 2; k++) {
          const fx = pl.x + 8 + k * 16;
          const fy = pl.y - 10 + Math.sin(world.frameCount * 0.12 + k) * 3;
          canvas.drawCircle(fx, fy, 2.5, this.fillPaint);
        }
        if (glow < 1) {
          this.fillPaint.setColor(Skia.Color('rgba(9, 13, 22, 0.45)'));
          canvas.drawRect(Skia.XYWHRect(pl.x, pl.y - 4, pl.width, TILE), this.fillPaint);
        }
      }
    }
  }

  private drawSprings(canvas: SkCanvas, atlas: SkiaSpriteAtlas, world: WorldState): void {
    for (const sp of world.springs) {
      if (sp.kind === 'mushroom') {
        this.drawBounceMushroom(canvas, sp.x, sp.y, sp.width, sp.height, sp.compressTimer);
        continue;
      }
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

        if (b.type === 'rotating' && b.spinTimer > 0) {
          const flip = Math.floor(b.spinTimer / 4) % 2 === 1;
          this.blitSprite(canvas, atlas, 'tile_rotating_spin', b.x, b.y, TILE, TILE, flip);
          continue;
        }

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
          case 'rotating':
            spriteKey = 'tile_rotating_idle';
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

        if (b.crumble) {
          const shake = b.crumbleTimer ? Math.sin(world.frameCount * 2.1) * 2 : 0;
          this.blitSprite(canvas, atlas, spriteKey, b.x + shake, b.y, TILE, TILE, false);
          this.fillPaint.setColor(Skia.Color('rgba(40, 20, 10, 0.75)'));
          canvas.drawRect(Skia.XYWHRect(b.x + 8 + shake, b.y + 6, 2, 10), this.fillPaint);
          canvas.drawRect(Skia.XYWHRect(b.x + 10 + shake, b.y + 14, 8, 2), this.fillPaint);
          canvas.drawRect(Skia.XYWHRect(b.x + 22 + shake, b.y + 4, 2, 8), this.fillPaint);
          continue;
        }

        this.blitSprite(canvas, atlas, spriteKey, b.x, b.y, TILE, TILE, false);

        // Extend deep ground 1 row lower so WORLD_VERTICAL_LIFT shows continuous earth to bottom of screen!
        if (row === GROUND_ROW + 1 && b.type === 'ground_deep') {
          this.blitSprite(
            canvas,
            atlas,
            `${prefix}_ground_deep`,
            b.x,
            (GROUND_ROW + 2) * TILE,
            TILE,
            TILE,
            false
          );
        }
      }
    }
  }

  private drawBounceMushroom(
    canvas: SkCanvas,
    x: number,
    y: number,
    w: number,
    h: number,
    compress: number
  ): void {
    const squash = compress > 0 ? 6 : 0;
    // Tallo
    this.fillPaint.setColor(Skia.Color('#fef3c7'));
    canvas.drawRect(Skia.XYWHRect(x + 8, y + 12, w - 16, h - 12), this.fillPaint);
    // Sombrero rojo con lunares
    this.fillPaint.setColor(Skia.Color('#090d16'));
    canvas.drawRect(Skia.XYWHRect(x - 5, y + 1 + squash, w + 10, 15 - squash), this.fillPaint);
    this.fillPaint.setColor(Skia.Color('#dc2626'));
    canvas.drawRect(Skia.XYWHRect(x - 3, y + 3 + squash, w + 6, 11 - squash), this.fillPaint);
    canvas.drawRect(Skia.XYWHRect(x + 3, y - 1 + squash, w - 6, 5), this.fillPaint);
    this.fillPaint.setColor(Skia.Color('#ffffff'));
    canvas.drawCircle(x + 4, y + 7 + squash, 2.5, this.fillPaint);
    canvas.drawCircle(x + w / 2, y + 3 + squash, 3, this.fillPaint);
    canvas.drawCircle(x + w - 4, y + 7 + squash, 2.5, this.fillPaint);
  }

  private drawIcicles(canvas: SkCanvas, world: WorldState, camX: number, viewportW: number): void {
    if (!world.icicles || world.icicles.length === 0) return;
    for (const ic of world.icicles) {
      if (ic.state === 'gone') continue;
      if (ic.x + ic.width < camX - 20 || ic.x > camX + viewportW + 20) continue;
      const jitter = ic.state === 'shake' ? Math.sin(world.frameCount * 2.7) * 1.5 : 0;
      const x = ic.x + jitter;
      // Carámbano escalonado en pixel-art (ancho → punta) con contorno oscuro
      const steps = [16, 12, 8, 4];
      this.fillPaint.setColor(Skia.Color('#0c4a6e'));
      for (let i = 0; i < steps.length; i++) {
        const sw = steps[i] + 4;
        canvas.drawRect(Skia.XYWHRect(x + (16 - sw) / 2, ic.y + i * 6 - 1, sw, 8), this.fillPaint);
      }
      for (let i = 0; i < steps.length; i++) {
        const sw = steps[i];
        this.fillPaint.setColor(Skia.Color(i % 2 === 0 ? '#e0f2fe' : '#7dd3fc'));
        canvas.drawRect(Skia.XYWHRect(x + (16 - sw) / 2, ic.y + i * 6, sw, 6), this.fillPaint);
      }
      this.fillPaint.setColor(Skia.Color('#ffffff'));
      canvas.drawRect(Skia.XYWHRect(x + 3, ic.y + 1, 2, 10), this.fillPaint);
    }
  }

  private drawLowGravZones(canvas: SkCanvas, world: WorldState, camX: number, viewportW: number): void {
    if (!world.lowGravZones || world.lowGravZones.length === 0) return;
    for (const z of world.lowGravZones) {
      if (z.x1 < camX || z.x0 > camX + viewportW) continue;
      this.fillPaint.setColor(Skia.Color('rgba(167, 139, 250, 0.13)'));
      canvas.drawRect(Skia.XYWHRect(z.x0, 0, z.x1 - z.x0, GROUND_ROW * TILE + 40), this.fillPaint);
      // Burbujas que suben lentamente
      this.fillPaint.setColor(Skia.Color('rgba(221, 214, 254, 0.55)'));
      const width = z.x1 - z.x0;
      for (let i = 0; i < Math.ceil(width / 40); i++) {
        const bx = z.x0 + ((i * 53) % width);
        const by = GROUND_ROW * TILE - ((world.frameCount * 0.6 + i * 47) % (GROUND_ROW * TILE));
        canvas.drawCircle(bx, by, 2 + (i % 3), this.fillPaint);
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
    const alt = Math.floor(world.frameCount / 8) % 2 === 0;
    const key =
      kind === 'mushroom'
        ? 'mushroom_super'
        : kind === 'one_up'
        ? 'mushroom_1up'
        : kind === 'feather'
        ? alt
          ? 'feather_1'
          : 'feather_2'
        : kind === 'star'
        ? alt
          ? 'star_1'
          : 'star_2'
        : alt
        ? 'flower_1'
        : 'flower_2';
    this.blitSprite(canvas, atlas, key, x - 2, y - 2, w + 4, h + 4, false);
  }

  private drawYoshis(canvas: SkCanvas, atlas: SkiaSpriteAtlas, world: WorldState): void {
    for (const yo of world.yoshis) {
      if (yo.state === 'hatching') {
        const eggKey = Math.floor(yo.animTimer / 5) % 2 === 0 ? 'yoshi_egg_1' : 'yoshi_egg_2';
        this.blitSprite(canvas, atlas, eggKey, yo.x + 2, yo.y + 12, 32, 32, false);
      } else {
        const moving = Math.abs(yo.vx) > 0.2;
        const key = moving
          ? Math.floor(yo.animTimer / 5) % 2 === 0
            ? 'yoshi_run1'
            : 'yoshi_run2'
          : 'yoshi_idle';
        this.blitSprite(canvas, atlas, key, yo.x - 3, yo.y - 4, 40, 48, yo.facing === -1);
      }
    }
  }

  private drawEnemy(
    canvas: SkCanvas,
    atlas: SkiaSpriteAtlas,
    world: WorldState,
    en: Enemy
  ): void {
    const step = Math.floor(en.animTimer / 9) % 2 === 0;
    const isKnocked = en.state === 'knocked';

    if (en.type === 'galoomba') {
      const key = step ? 'galoomba_walk1' : 'galoomba_walk2';
      this.blitSprite(canvas, atlas, key, en.x - 3, en.y - 4, 32, 32, en.facing === 1, isKnocked);
      return;
    }

    if (en.type === 'rex') {
      if (en.state === 'rex_squished') {
        this.blitSprite(canvas, atlas, 'rex_half', en.x - 3, en.y - 4, 32, 32, en.facing === 1, isKnocked);
      } else {
        const key = step ? 'rex_walk1' : 'rex_walk2';
        this.blitSprite(canvas, atlas, key, en.x - 3, en.y - 10, 32, 48, en.facing === 1, isKnocked);
      }
      return;
    }

    if (en.type === 'chuck') {
      const key = Math.abs(en.vx) > 1.2 ? 'chuck_charge' : 'chuck_idle';
      this.blitSprite(canvas, atlas, key, en.x - 4, en.y - 6, 40, 48, en.facing === 1, isKnocked);
      return;
    }

    if (en.type === 'bullet_bill') {
      this.blitSprite(canvas, atlas, 'bullet_bill', en.x - 3, en.y - 4, 32, 32, en.facing === 1, isKnocked);
      return;
    }

    if (en.type === 'goomba') {
      const blue = world.biomeId === 'cavern' || world.biomeId === 'night' || world.biomeId === 'vanilla_dome';
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

    // 1. RIDING YOSHI! (Draws Yoshi + Extendable Red Tongue + Rider + Optional Golden Cape!)
    if (p.mountedYoshi && !p.dead) {
      const yoshiBottom = p.y + p.height;
      const yoshiX = p.x - 9;
      const yoshiY = yoshiBottom - 48;

      // Extendable Red Tongue when eating!
      if (p.yoshiTongueTimer > 0) {
        const progress = 1 - p.yoshiTongueTimer / 18;
        const reach = Math.sin(progress * Math.PI) * 58;
        const mouthX = p.facing === 1 ? yoshiX + 34 : yoshiX + 6;
        const mouthY = yoshiY + 14;
        const stemX = p.facing === 1 ? mouthX : mouthX - reach;

        this.fillPaint.setColor(Skia.Color('#090d16'));
        canvas.drawRect(Skia.XYWHRect(stemX - 1, mouthY - 2, reach + 2, 8), this.fillPaint);
        this.fillPaint.setColor(Skia.Color('#ef4444'));
        canvas.drawRect(Skia.XYWHRect(stemX, mouthY, reach, 5), this.fillPaint);
        const tipX = p.facing === 1 ? mouthX + reach : mouthX - reach;
        canvas.drawCircle(tipX, mouthY + 2.5, 5, this.fillPaint);
      }

      const riderOffsetY = p.crouching ? -8 : -16;
      if (p.powerState === 3) {
        const capeKey =
          !p.onGround && p.vy > 1.5
            ? 'cape_parachute'
            : Math.abs(p.vx) > 0.3 || !p.onGround
            ? 'cape_back_flutter'
            : 'cape_back_idle';
        const capeX = p.facing === 1 ? p.x - 16 : p.x + 6;
        this.blitSprite(canvas, atlas, capeKey, capeX, yoshiY + riderOffsetY + 6, 32, 32, flipX);
      }

      // Rider sprite sitting on Yoshi's saddle
      if (p.powerState === 0) {
        this.blitSprite(
          canvas,
          atlas,
          `hero_small_${variant}_idle`,
          p.x - 5,
          yoshiY + 2,
          32,
          32,
          flipX
        );
      } else {
        this.blitSprite(
          canvas,
          atlas,
          `hero_big_${variant}_${p.crouching ? 'crouch' : 'idle'}`,
          p.x - 5,
          yoshiY + riderOffsetY,
          32,
          48,
          flipX
        );
      }

      // Yoshi foreground body & saddle
      const yoshiKey =
        p.yoshiTongueTimer > 0
          ? 'yoshi_eat'
          : Math.abs(p.vx) > 0.25
          ? Math.floor(p.animTimer * 1.4) % 2 === 0
            ? 'yoshi_run1'
            : 'yoshi_run2'
          : 'yoshi_idle';
      this.blitSprite(canvas, atlas, yoshiKey, yoshiX, yoshiY, 40, 48, flipX);

      // Cheek glow when Yoshi holds triple fire breath!
      if (p.yoshiMouthItem === 'fire') {
        const cheekX = p.facing === 1 ? yoshiX + 31 : yoshiX + 9;
        this.fillPaint.setColor(Skia.Color('#fb923c'));
        canvas.drawCircle(cheekX, yoshiY + 13, 5, this.fillPaint);
      }
      return;
    }

    // 2. SMALL OR DYING HERO
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
      const spinFlip = p.spinJumping ? Math.floor(world.frameCount / 3) % 2 === 1 : flipX;
      this.blitSprite(
        canvas,
        atlas,
        `hero_small_${variant}_${pose}`,
        p.x - 5,
        p.y - 2,
        32,
        32,
        spinFlip
      );
      return;
    }

    // 3. CAPE PLOMERO SPECIAL POSES (360° Cape Spin & Horizontal Superhero Flight!)
    const drawY = p.y + p.height - 48;
    if (p.powerState === 3 && p.capeSpinTimer > 0) {
      const spinFlip = Math.floor(p.capeSpinTimer / 3) % 2 === 1;
      this.blitSprite(canvas, atlas, 'hero_cape_spin', p.x - 13, drawY, 48, 48, spinFlip);
      return;
    }

    if (p.powerState === 3 && p.capeFlying && !p.onGround) {
      const flyKey = Math.floor(world.frameCount / 4) % 2 === 0 ? 'hero_cape_fly1' : 'hero_cape_fly2';
      this.blitSprite(canvas, atlas, flyKey, p.x - 13, p.y + 8, 48, 32, flipX);
      return;
    }

    // Draw billowing Golden Cape behind Super Plomero when powerState === 3!
    if (p.powerState === 3) {
      if (!p.onGround && p.vy > 1.5) {
        this.blitSprite(canvas, atlas, 'cape_parachute', p.x - 5, drawY - 12, 32, 32, flipX);
      } else {
        const capeKey =
          Math.abs(p.vx) > 0.3 || !p.onGround ? 'cape_back_flutter' : 'cape_back_idle';
        const capeOffsetX = p.facing === 1 ? -15 : 5;
        this.blitSprite(canvas, atlas, capeKey, p.x + capeOffsetX, drawY + 12, 32, 32, flipX);
      }
    }

    // 4. STANDARD SUPER / FIRE / CAPE BODY
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

    const bodyFlip = p.spinJumping ? Math.floor(world.frameCount / 3) % 2 === 1 : flipX;
    this.blitSprite(canvas, atlas, `hero_big_${variant}_${pose}`, p.x - 5, drawY, 32, 48, bodyFlip);
  }
}
