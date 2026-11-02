import { AlphaType, ColorType, Skia, type SkImage, type SkRect } from '@shopify/react-native-skia';
import { buildSpriteAtlasBuffer } from './atlasBuilder';

export interface SkiaSpriteAtlas {
  image: SkImage;
  rects: Record<string, SkRect>;
}

let cachedAtlas: SkiaSpriteAtlas | null = null;

export function getSkiaSpriteAtlas(): SkiaSpriteAtlas {
  if (cachedAtlas) return cachedAtlas;

  const built = buildSpriteAtlasBuffer();
  const data = Skia.Data.fromBytes(built.rgba);
  const image = Skia.Image.MakeImage(
    {
      width: built.width,
      height: built.height,
      alphaType: AlphaType.Premul,
      colorType: ColorType.RGBA_8888,
    },
    data,
    built.width * 4
  );

  if (!image) {
    throw new Error('Failed to create Skia pixel-art sprite atlas');
  }

  const skRects: Record<string, SkRect> = {};
  for (const [key, r] of Object.entries(built.rects)) {
    skRects[key] = Skia.XYWHRect(r.x, r.y, r.width, r.height);
  }

  cachedAtlas = { image, rects: skRects };
  return cachedAtlas;
}
