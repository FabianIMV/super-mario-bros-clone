import { buildAllSpriteDefinitions, type PixelSpriteDef } from './sprites';

export interface SpriteRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CompiledAtlasData {
  width: number;
  height: number;
  rgba: Uint8Array;
  rects: Record<string, SpriteRect>;
}

function parseHexRgba(hex: string): [number, number, number, number] {
  if (!hex || hex === 'transparent') return [0, 0, 0, 0];
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return [r, g, b, 255];
  }
  return [255, 0, 255, 255];
}

export function buildSpriteAtlasBuffer(): CompiledAtlasData {
  const defs = buildAllSpriteDefinitions();
  const entries = Object.entries(defs);
  const atlasWidth = 256;
  const gutter = 2;

  // Pack shelf-by-shelf with 2px gutter around every sprite
  const placements: Array<{ name: string; def: PixelSpriteDef; x: number; y: number }> = [];
  let cursorX = gutter;
  let cursorY = gutter;
  let rowHeight = 0;

  for (const [name, def] of entries) {
    const cellW = def.width + gutter * 2;
    const cellH = def.height + gutter * 2;
    if (cursorX + cellW > atlasWidth) {
      cursorX = gutter;
      cursorY += rowHeight;
      rowHeight = 0;
    }
    placements.push({
      name,
      def,
      x: cursorX + gutter,
      y: cursorY + gutter,
    });
    cursorX += cellW;
    if (cellH > rowHeight) rowHeight = cellH;
  }

  const rawHeight = cursorY + rowHeight + gutter;
  // Next power-of-two height for optimal GPU texture alignment
  let atlasHeight = 64;
  while (atlasHeight < rawHeight) atlasHeight *= 2;

  const rgba = new Uint8Array(atlasWidth * atlasHeight * 4);
  const rects: Record<string, SpriteRect> = {};

  const setPixel = (px: number, py: number, color: [number, number, number, number]) => {
    if (px < 0 || px >= atlasWidth || py < 0 || py >= atlasHeight) return;
    const idx = (py * atlasWidth + px) * 4;
    rgba[idx] = color[0];
    rgba[idx + 1] = color[1];
    rgba[idx + 2] = color[2];
    rgba[idx + 3] = color[3];
  };

  for (const { name, def, x, y } of placements) {
    rects[name] = { x, y, width: def.width, height: def.height };

    // Pre-parse palette
    const parsedPal: Record<string, [number, number, number, number]> = {};
    for (const [ch, hex] of Object.entries(def.palette)) {
      parsedPal[ch] = parseHexRgba(hex);
    }

    const getCellColor = (col: number, row: number): [number, number, number, number] => {
      const rowStr = def.rows[row] ?? '';
      const ch = rowStr[col] ?? '.';
      return parsedPal[ch] ?? [0, 0, 0, 0];
    };

    for (let row = 0; row < def.height; row++) {
      for (let col = 0; col < def.width; col++) {
        setPixel(x + col, y + row, getCellColor(col, row));
      }
    }

    // 1px edge extrusion for opaque tiles so scaled tilemaps never show subpixel seams!
    if (def.extrude) {
      for (let col = 0; col < def.width; col++) {
        setPixel(x + col, y - 1, getCellColor(col, 0));
        setPixel(x + col, y + def.height, getCellColor(col, def.height - 1));
      }
      for (let row = 0; row < def.height; row++) {
        setPixel(x - 1, y + row, getCellColor(0, row));
        setPixel(x + def.width, y + row, getCellColor(def.width - 1, row));
      }
      setPixel(x - 1, y - 1, getCellColor(0, 0));
      setPixel(x + def.width, y - 1, getCellColor(def.width - 1, 0));
      setPixel(x - 1, y + def.height, getCellColor(0, def.height - 1));
      setPixel(x + def.width, y + def.height, getCellColor(def.width - 1, def.height - 1));
    }
  }

  return { width: atlasWidth, height: atlasHeight, rgba, rects };
}
