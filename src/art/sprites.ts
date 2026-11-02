import { BIOMES, type BiomeDefinition } from '../engine/biomes';
import type { BiomeId } from '../engine/types';

export type PaletteMap = Record<string, string>;

export interface PixelSpriteDef {
  width: number;
  height: number;
  rows: string[];
  palette: PaletteMap;
  extrude?: boolean;
}

// ============================================================================
// CHARACTER PALETTES (Standard, Fire, and 4 Starman Rainbow Frames)
// ============================================================================
const HERO_BASE: PaletteMap = {
  '.': 'transparent',
  K: '#141013', // Crisp dark outline
  R: '#e11d2e', // Cap / tunic crimson
  r: '#991b1b', // Cap shadow
  H: '#ff6b6b', // Cap specular highlight
  S: '#ffcca0', // Warm skin
  s: '#d9915b', // Skin shadow
  B: '#1d4ed8', // Royal blue overalls
  b: '#1e3a8a', // Overalls shadow
  L: '#60a5fa', // Overalls highlight
  Y: '#facc15', // Brass buttons
  M: '#3b1d0e', // Mustache / hair / boots dark
  N: '#78350f', // Leather boots midtone
  W: '#ffffff', // Gloves / eye sclera
  g: '#cbd5e1', // Glove shadow
};

const HERO_FIRE: PaletteMap = {
  ...HERO_BASE,
  R: '#fff7ed', // Cream-white cap & tunic
  r: '#fed7aa',
  H: '#ffffff',
  B: '#dc2626', // Fiery red overalls
  b: '#7f1d1d',
  L: '#f87171',
  Y: '#fde047',
};

const HERO_STAR_GOLD: PaletteMap = {
  ...HERO_BASE,
  R: '#fde047',
  r: '#ca8a04',
  H: '#ffffff',
  B: '#f97316',
  b: '#9a3412',
  L: '#fed7aa',
};

const HERO_STAR_CYAN: PaletteMap = {
  ...HERO_BASE,
  R: '#38bdf8',
  r: '#0284c7',
  H: '#e0f2fe',
  B: '#a855f7',
  b: '#581c87',
  L: '#e9d5ff',
};

const HERO_STAR_EMERALD: PaletteMap = {
  ...HERO_BASE,
  R: '#4ade80',
  r: '#15803d',
  H: '#dcfce7',
  B: '#facc15',
  b: '#a16207',
  L: '#fef08a',
};

// ============================================================================
// SMALL HERO SPRITES (16x16)
// ============================================================================
const SMALL_IDLE = [
  '....KKKKKK......',
  '...KRRRRRRK.....',
  '..KRHRRRRRRK....',
  '..KRRRRRRRRRRK..',
  '..KMMSSSKSSK....',
  '.KMMSWSSKSSSK...',
  '.KMMSWSSKSSSSK..',
  '.KMMSSSSMMMMK...',
  '..KKSSSSSSSSK...',
  '..KRRBRRBRRK....',
  '.KRRRBBBBBRRRK..',
  '.KWWBBBBBBBWWK..',
  '.KWgBYBBBBYBWK..',
  '..KKBBBBBBBKK...',
  '..KNNNKKKNNNK...',
  '.KMMMMK.KMMMMK..',
];

const SMALL_RUN1 = [
  '....KKKKKK......',
  '...KRRRRRRK.....',
  '..KRHRRRRRRK....',
  '..KRRRRRRRRRRK..',
  '..KMMSSSKSSK....',
  '.KMMSWSSKSSSK...',
  '.KMMSWSSKSSSSK..',
  '.KMMSSSSMMMMK...',
  '..KKSSSSSSSSK...',
  '.KWWKRRBRRK.....',
  '.KWWBBBBBBBRWK..',
  '..KKBYBBBBYWWK..',
  '...KBBBBBBBBK...',
  '..KNNNKKKNNNK...',
  '.KMMMMK..KMMMMK.',
  '..........KKKK..',
];

const SMALL_RUN2 = [
  '....KKKKKK......',
  '...KRRRRRRK.....',
  '..KRHRRRRRRK....',
  '..KRRRRRRRRRRK..',
  '..KMMSSSKSSK....',
  '.KMMSWSSKSSSK...',
  '.KMMSWSSKSSSSK..',
  '.KMMSSSSMMMMK...',
  '..KKSSSSSSSSK...',
  '...KRRRBBBRK....',
  '..KRRRRBBBBBK...',
  '..KWWBBBBBBWK...',
  '..KWgBYBBBYK....',
  '...KKBBBBBBK....',
  '...KNNNKKNNK....',
  '...KMMMMKKKK....',
];

const SMALL_RUN3 = [
  '....KKKKKK......',
  '...KRRRRRRK.....',
  '..KRHRRRRRRK....',
  '..KRRRRRRRRRRK..',
  '..KMMSSSKSSK....',
  '.KMMSWSSKSSSK...',
  '.KMMSWSSKSSSSK..',
  '.KMMSSSSMMMMK...',
  '..KKSSSSSSSSK...',
  '....KRRBRRKWWK..',
  '..KWRBBBBBBBWWK.',
  '.KWWBYBBBBYKK...',
  '..KKBBBBBBBK....',
  '.KNNNK..KNNNK...',
  'KMMMMK...KMMMMK.',
  'KKKK......KKKK..',
];

const SMALL_JUMP = [
  '....KKKKKK..KKK.',
  '...KRRRRRRKKWWWK',
  '..KRHRRRRRRKWWgK',
  '..KRRRRRRRRRRRRK',
  '..KMMSSSKSSKRRK.',
  '.KMMSWSSKSSSKK..',
  '.KMMSWSSKSSSSK..',
  '.KMMSSSSMMMMK...',
  '..KKSSSSSSSSK...',
  '.KRRRBBBBBRK....',
  'KWWBBBBBBBBBK...',
  'KWgBYBBBBBYBK...',
  '.KKBBBBBBBBKNNK.',
  '..KNNNKBBBBKMMMK',
  '.KMMMMKKKKKKMMK.',
  '.KKKK.......KK..',
];

const SMALL_SKID = [
  '....KKKKKK......',
  '...KRRRRRRK.....',
  '..KRRRRRHRRK....',
  '.KRRRRRRRRRRK...',
  '...KSSKSSSMMK...',
  '..KSSSKSSWSMMK..',
  '.KSSSSKSSWSMMK..',
  '..KMMMMSSSSMMK..',
  '...KSSSSSSSSKK..',
  '..KWWKBBBBRRRK..',
  '.KWWBBBBBBBRWWK.',
  '..KKBYBBBBYBWWK.',
  '...KBBBBBBBBKK..',
  '..KNNNKKKNNNK...',
  '.KMMMMK.KMMMMK..',
  '.KKKK....KKKK...',
];

const SMALL_DEAD = [
  '....KKKKKK......',
  '...KRRRRRRK.....',
  '..KRHRRRRRRK....',
  '..KRRRRRRRRRRK..',
  '..KSSSSSSSKK....',
  '.KSKKSKSSKKSK...',
  '.KSKKSKSSKKSK...',
  '.KSSSSMMMMSSK...',
  '..KKSSSSSSSSK...',
  '.KWWKBBBBBKWWK..',
  'KWWgBBBBBBBgWWK.',
  '.KKKBYBBBBYBKKK.',
  '...KBBBBBBBBK...',
  '..KNNNK..KNNNK..',
  '.KMMMMK..KMMMMK.',
  '.KKKKK....KKKKK.',
];

// ============================================================================
// SUPER / FIRE HERO SPRITES (16x24)
// ============================================================================
const BIG_IDLE = [
  '....KKKKKKK.....',
  '...KRRRRRRRK....',
  '..KRHRRRRRRRK...',
  '..KRRRRRRRRRRRK.',
  '..KMMSSSSKSSK...',
  '.KMMSWSSSKSSSK..',
  '.KMMSWSSSKSSSSK.',
  '.KMMSSSSSMMMMK..',
  '.KMMSSSSSSSSSK..',
  '..KKKSSSSSSKK...',
  '...KRRBRRRBRK...',
  '..KRRRBBBBBRRK..',
  '.KRRRRBBBBBRRRK.',
  '.KRRRRBYBBYRRRK.',
  '.KWWWRBBBBBRWWWK',
  '.KWWgBBBBBBBgWWK',
  '.KWWgBBBBBBBgWWK',
  '..KKKBBBBBBBKKK.',
  '...KBBBBBBBBBK..',
  '..KBBBBKKKBBBBK.',
  '..KBBBKKKKKBBBK.',
  '..KNNNNK.KNNNNK.',
  '.KMMMMMK.KMMMMMK',
  '.KKKKKK...KKKKKK',
];

const BIG_RUN1 = [
  '....KKKKKKK.....',
  '...KRRRRRRRK....',
  '..KRHRRRRRRRK...',
  '..KRRRRRRRRRRRK.',
  '..KMMSSSSKSSK...',
  '.KMMSWSSSKSSSK..',
  '.KMMSWSSSKSSSSK.',
  '.KMMSSSSSMMMMK..',
  '.KMMSSSSSSSSSK..',
  '..KKKSSSSSSKK...',
  '.KWWKRBRRRBRK...',
  'KWWWRRBBBBBRRK..',
  'KWgKRRBYBBYRRWWK',
  '.KK.KBBBBBBBWWWK',
  '....KBBBBBBBBKK.',
  '...KBBBBBBBBBK..',
  '..KBBBBKKKBBBBK.',
  '.KBBBBK...KBBBBK',
  '.KNNNNK....KNNNK',
  'KMMMMMK....KMMMK',
  'KKKKKK.....KKKK.',
  '................',
  '................',
  '................',
];

const BIG_RUN2 = [
  '....KKKKKKK.....',
  '...KRRRRRRRK....',
  '..KRHRRRRRRRK...',
  '..KRRRRRRRRRRRK.',
  '..KMMSSSSKSSK...',
  '.KMMSWSSSKSSSK..',
  '.KMMSWSSSKSSSSK.',
  '.KMMSSSSSMMMMK..',
  '.KMMSSSSSSSSSK..',
  '..KKKSSSSSSKK...',
  '...KRRBRRRBRK...',
  '..KRRRBBBBBRRK..',
  '..KRRRBYBBYRRK..',
  '..KWWBBBBBBBWWK.',
  '..KWgBBBBBBBgWK.',
  '...KKBBBBBBBKK..',
  '...KBBBBBBBBBK..',
  '...KBBBBKBBBBK..',
  '...KBBBK.KBBBK..',
  '...KNNNK.KNNNK..',
  '..KMMMMK.KMMMMK.',
  '..KKKKK...KKKKK.',
  '................',
  '................',
];

const BIG_RUN3 = [
  '....KKKKKKK.....',
  '...KRRRRRRRK....',
  '..KRHRRRRRRRK...',
  '..KRRRRRRRRRRRK.',
  '..KMMSSSSKSSK...',
  '.KMMSWSSSKSSSK..',
  '.KMMSWSSSKSSSSK.',
  '.KMMSSSSSMMMMK..',
  '.KMMSSSSSSSSSK..',
  '..KKKSSSSSSKK...',
  '...KRBRRRBRKWWK.',
  '..KRRBBBBBRRWWWK',
  '.KWWRRBYBBYRRKWK',
  'KWWWBBBBBBBK.KK.',
  '.KKBBBBBBBBK....',
  '..KBBBBBBBBBK...',
  '.KBBBBKKKBBBBK..',
  'KBBBBK...KBBBBK.',
  'KNNNK....KNNNNK.',
  'KMMMK....KMMMMMK',
  '.KKKK.....KKKKKK',
  '................',
  '................',
  '................',
];

const BIG_JUMP = [
  '....KKKKKKK.KKK.',
  '...KRRRRRRRKKWWK',
  '..KRHRRRRRRRKWWK',
  '..KRRRRRRRRRRRRK',
  '..KMMSSSSKSSKRRK',
  '.KMMSWSSSKSSSKRK',
  '.KMMSWSSSKSSSSK.',
  '.KMMSSSSSMMMMK..',
  '.KMMSSSSSSSSSK..',
  '..KKKSSSSSSKK...',
  '..KRRRBBBBBRK...',
  '.KRRRRBBBBBRRK..',
  'KWWWRRBYBBYRRK..',
  'KWWgBBBBBBBBBK..',
  '.KKKBBBBBBBBBK..',
  '...KBBBBBBBBBK..',
  '..KBBBBKKKBBBBK.',
  '.KBBBBK..KBBBBKN',
  '.KNNNNK...KKKKMM',
  'KMMMMMK......KMM',
  'KKKKKK........KK',
  '................',
  '................',
  '................',
];

const BIG_SKID = [
  '....KKKKKKK.....',
  '...KRRRRRRRK....',
  '..KRRRRRRHRRK...',
  '.KRRRRRRRRRRRK..',
  '...KSSKSSSSMMK..',
  '..KSSSKSSSWSMMK.',
  '.KSSSSKSSSWSMMK.',
  '..KMMMMSSSSSMMK.',
  '..KSSSSSSSSSMMK.',
  '...KKSSSSSSKKK..',
  '..KWWKBBBBBRRK..',
  '.KWWWBBBBBBBRRK.',
  '.KWgKBYBBBBYWWWK',
  '..KKKBBBBBBBWWgK',
  '....KBBBBBBBBKK.',
  '...KBBBBBBBBBK..',
  '..KBBBBKKKBBBBK.',
  '..KBBBK...KBBBK.',
  '.KNNNNK...KNNNNK',
  '.KMMMMK...KMMMMK',
  '.KKKKK.....KKKKK',
  '................',
  '................',
  '................',
];

const BIG_CROUCH = [
  '................',
  '................',
  '................',
  '................',
  '....KKKKKKK.....',
  '...KRRRRRRRK....',
  '..KRHRRRRRRRK...',
  '..KRRRRRRRRRRRK.',
  '..KMMSSSSKSSK...',
  '.KMMSWSSSKSSSK..',
  '.KMMSWSSSKSSSSK.',
  '.KMMSSSSSMMMMK..',
  '..KKKSSSSSSKK...',
  '.KWWKRBBBBBRKWWK',
  'KWWgBBBBBBBBBgWK',
  '.KKKBYBBBBBYBKKK',
  '..KBBBBBBBBBBBK.',
  '..KBBBBKKKKBBBK.',
  '..KNNNNK..KNNNNK',
  '.KMMMMMK..KMMMMK',
  '.KKKKKK....KKKKK',
  '................',
  '................',
  '................',
];

const BIG_THROW = [
  '....KKKKKKK.....',
  '...KRRRRRRRK....',
  '..KRHRRRRRRRK...',
  '..KRRRRRRRRRRRK.',
  '..KMMSSSSKSSK...',
  '.KMMSWSSSKSSSK..',
  '.KMMSWSSSKSSSSK.',
  '.KMMSSSSSMMMMK..',
  '.KMMSSSSSSSSSK..',
  '..KKKSSSSSSKK...',
  '...KRRBBBBBRKKK.',
  '..KRRRBBBBBRWWWK',
  '..KRRRBYBBYRWWgK',
  '..KWWBBBBBBBKKK.',
  '..KWgBBBBBBBBK..',
  '...KKBBBBBBBBK..',
  '...KBBBBBBBBBK..',
  '..KBBBBKKKBBBBK.',
  '..KBBBK...KBBBK.',
  '..KNNNK...KNNNNK',
  '.KMMMMK...KMMMMK',
  '.KKKKK.....KKKKK',
  '................',
  '................',
];

// Shift BIG run/jump/skid/crouch down so feet align strictly on row 23!
function bottomAlignRows(rows: string[], targetHeight: number): string[] {
  const nonEmpty = rows.filter((r) => !/^\.+$/.test(r));
  const padCount = Math.max(0, targetHeight - nonEmpty.length);
  const emptyRow = '.'.repeat(rows[0].length);
  const padded = [...Array.from({ length: padCount }, () => emptyRow), ...nonEmpty];
  return padded.slice(0, targetHeight);
}

// ============================================================================
// ENEMY SPRITES
// ============================================================================
const GOOMBA_PAL: PaletteMap = {
  '.': 'transparent',
  K: '#141013',
  M: '#9a3412', // Mushroom cap chestnut
  L: '#ea580c', // Cap highlight
  D: '#5c1d0c', // Cap shadow
  S: '#fed7aa', // Stem cream
  s: '#fdba74',
  W: '#ffffff',
  F: '#1e1b18', // Feet
};

const GOOMBA_CAVERN_PAL: PaletteMap = {
  ...GOOMBA_PAL,
  M: '#1d4ed8',
  L: '#60a5fa',
  D: '#172554',
  S: '#cbd5e1',
  s: '#94a3b8',
};

const GOOMBA_WALK1 = [
  '.....KKKKKK.....',
  '....KLLLLMMK....',
  '...KLLLMMMMMK...',
  '..KLLMMMMMMMMK..',
  '.KLMMKWMMMKMMDK.',
  '.KMMKWWMMWWKMDK.',
  'KMMMKWKMMKWKMMDK',
  'KMMMKWKMMKWKMMDK',
  'KMMMMWWMMWWMMMMK',
  '.KDDDDDDDDDDDDK.',
  '..KKKKSSSSKKKK..',
  '....KSSSSSSK....',
  '...KFFSSSSFFK...',
  '..KFFFFKKFFFFK..',
  '..KFFFFK.KFFFK..',
  '...KKKK...KKK...',
];

const GOOMBA_WALK2 = [
  '.....KKKKKK.....',
  '....KLLLLMMK....',
  '...KLLLMMMMMK...',
  '..KLLMMMMMMMMK..',
  '.KLMMKWMMMKMMDK.',
  '.KMMKWWMMWWKMDK.',
  'KMMMKWKMMKWKMMDK',
  'KMMMKWKMMKWKMMDK',
  'KMMMMWWMMWWMMMMK',
  '.KDDDDDDDDDDDDK.',
  '..KKKKSSSSKKKK..',
  '....KSSSSSSK....',
  '...KFFSSSSFFK...',
  '...KFFFK.KFFFFK.',
  '...KKKK..KFFFFK.',
  '..........KKKK..',
];

const GOOMBA_FLAT = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '....KKKKKKKK....',
  '..KKLLLLMMMMKK..',
  '.KMMKWWKKWWKMMK.',
  'KDDDDDDDDDDDDDDK',
  '.KKKKSSSSSSKKKK.',
  '..KFFFFKKFFFFK..',
  '..KKKKK..KKKKK..',
  '................',
];

const KOOPA_GREEN_PAL: PaletteMap = {
  '.': 'transparent',
  K: '#141013',
  G: '#16a34a', // Green shell
  L: '#4ade80', // Shell highlight
  D: '#14532d', // Shell shadow
  Y: '#facc15', // Head / skin yellow
  y: '#ca8a04',
  W: '#ffffff', // Shell rim / eyes / wings
  g: '#cbd5e1',
  B: '#ea580c', // Boots
};

const KOOPA_RED_PAL: PaletteMap = {
  ...KOOPA_GREEN_PAL,
  G: '#dc2626',
  L: '#f87171',
  D: '#7f1d1d',
  B: '#2563eb',
};

// Koopa faces RIGHT by default (matches Hero convention: facing=1 -> right!)
const KOOPA_WALK1 = [
  '................',
  '.......KKKKK....',
  '......KYYYYYK...',
  '.....KYYYWKYYK..',
  '.....KYYYWKYYYK.',
  '.....KYYYYYYYYYK',
  '.....KYYYYYKKKK.',
  '......KYYYYK....',
  '..KKKKKYYYYK....',
  '.KWWLLLGGGGKK...',
  '.KWLGGGGGGGGGK..',
  'KWLGGKGGGGKGGDK.',
  'KWGGGGGGGGGGGDK.',
  'KWGGGGKGGKGGGDK.',
  'KWGGGGGGGGGGGDWK',
  'KWWDDDDDDDDDDWWK',
  '.KKWWWWWWWWWWKK.',
  '...KYYYYKYYYYK..',
  '..KYYYYK..KYYYK.',
  '..KYYYYK..KYYYK.',
  '..KBBBBK..KBBBBK',
  '.KBBBBBK..KBBBBK',
  '.KBBBBBK..KBBBBK',
  '.KKKKKK....KKKKK',
];

const KOOPA_WALK2 = [
  '................',
  '.......KKKKK....',
  '......KYYYYYK...',
  '.....KYYYWKYYK..',
  '.....KYYYWKYYYK.',
  '.....KYYYYYYYYYK',
  '.....KYYYYYKKKK.',
  '......KYYYYK....',
  '..KKKKKYYYYK....',
  '.KWWLLLGGGGKK...',
  '.KWLGGGGGGGGGK..',
  'KWLGGKGGGGKGGDK.',
  'KWGGGGGGGGGGGDK.',
  'KWGGGGKGGKGGGDK.',
  'KWGGGGGGGGGGGDWK',
  'KWWDDDDDDDDDDWWK',
  '.KKWWWWWWWWWWKK.',
  '....KYYYYYYYK...',
  '...KYYYYKKYYYK..',
  '...KYYYK..KYYYK.',
  '...KBBBK..KBBBBK',
  '..KBBBBK..KBBBBK',
  '..KBBBBK...KKKKK',
  '..KKKKK.........',
];

const PARATROOPA_FLY1 = [
  '.KKKK...........',
  'KWWWWK.KKKKK....',
  'KWWWgWKYYYYYK...',
  'KWWWWKYYYWKYYK..',
  '.KWWWKYYYWKYYYK.',
  '..KKKKYYYYYYYYYK',
  '.....KYYYYYKKKK.',
  '......KYYYYK....',
  '..KKKKKYYYYK....',
  '.KWWLLLGGGGKK...',
  '.KWLGGGGGGGGGK..',
  'KWLGGKGGGGKGGDK.',
  'KWGGGGGGGGGGGDK.',
  'KWGGGGKGGKGGGDK.',
  'KWGGGGGGGGGGGDWK',
  'KWWDDDDDDDDDDWWK',
  '.KKWWWWWWWWWWKK.',
  '...KYYYYKYYYYK..',
  '..KYYYYK..KYYYK.',
  '..KBBBBK..KBBBBK',
  '.KBBBBBK..KBBBBK',
  '.KKKKKK....KKKKK',
  '................',
  '................',
];

const PARATROOPA_FLY2 = [
  '................',
  '.......KKKKK....',
  '......KYYYYYK...',
  '.....KYYYWKYYK..',
  '.....KYYYWKYYYK.',
  '.....KYYYYYYYYYK',
  '.KKKKKYYYYYKKKK.',
  'KWWWWWKYYYYK....',
  'KWWWWgWYYYYK....',
  '.KWWWWLGGGGKK...',
  '..KKKKGGGGGGGK..',
  'KWLGGKGGGGKGGDK.',
  'KWGGGGGGGGGGGDK.',
  'KWGGGGKGGKGGGDK.',
  'KWGGGGGGGGGGGDWK',
  'KWWDDDDDDDDDDWWK',
  '.KKWWWWWWWWWWKK.',
  '....KYYYYYYYK...',
  '...KYYYK.KYYYK..',
  '...KBBBK.KBBBBK.',
  '..KBBBBK..KKKKK.',
  '..KKKKK.........',
  '................',
  '................',
];

const KOOPA_SHELL1 = [
  '................',
  '................',
  '....KKKKKKKK....',
  '..KKLLLLGGGGKK..',
  '.KLLGGGGGGGGGDK.',
  '.KLGGKGGGGKGGDK.',
  'KWLGGGGGGGGGGDWK',
  'KWGGGGKGGKGGGDWK',
  'KWGGGGGGGGGGGDWK',
  'KWWDDDDDDDDDDWWK',
  '.KKWWWWWWWWWWKK.',
  '..KKKKKKKKKKKK..',
  '................',
  '................',
  '................',
  '................',
];

const KOOPA_SHELL2 = [
  '................',
  '................',
  '....KKKKKKKK....',
  '..KKGGGGLLLLKK..',
  '.KGGGGGGGGLLLDK.',
  '.KGGGKGGGGKLGDK.',
  'KWGGGGGGGGGLGDWK',
  'KWGGGKGGGGKGGDWK',
  'KWGGGGGGGGGGGDWK',
  'KWWDDDDDDDDDDWWK',
  '.KKWWWWWWWWWWKK.',
  '..KKKKKKKKKKKK..',
  '................',
  '................',
  '................',
  '................',
];

const KOOPA_SHELL_WAKE = [
  '................',
  '....KKKKKKKK....',
  '..KKLLLLGGGGKK..',
  '.KLLGGGGGGGGGDK.',
  '.KLGGKGGGGKGGDK.',
  'KWLGGGGGGGGGGDWK',
  'KWGGGGKGGKGGGDWK',
  'KWWDDDDDDDDDDWWK',
  '.KKWWWWWWWWWWKK.',
  '..KYYKKKKKKYYK..',
  '.KBBBK....KBBBK.',
  '.KKKK......KKKK.',
  '................',
  '................',
  '................',
  '................',
];

const PIRANHA_PAL: PaletteMap = {
  '.': 'transparent',
  K: '#141013',
  R: '#dc2626',
  L: '#f87171',
  D: '#7f1d1d',
  W: '#ffffff',
  G: '#16a34a',
  g: '#4ade80',
};

const PIRANHA_OPEN = [
  '................',
  '..KKKK....KKKK..',
  '.KRRRRK..KRRRRK.',
  'KRWRRRRKRRRRRWRK',
  'KRRRRRKWWKRRRRRK',
  'KRRWRKWWWWKRWRRK',
  'KRRRRKWWWWKRRRRK',
  'KRRRRRKKKKRRRRRK',
  '.KWRRRRRRRRRRWK.',
  '.KRRRRWRRWRRRRK.',
  '..KDDDDDDDDDDK..',
  '....KKKKKKKK....',
  '.....KggGGK.....',
  '..KKKKKggKKKKK..',
  '.KGGGGKggKGGGGK.',
  'KggGGGKggKGGGggK',
  '.KGGGGKggKGGGGK.',
  '..KKKKKggKKKKK..',
  '.....KggGGK.....',
  '.....KggGGK.....',
  '.....KggGGK.....',
  '.....KggGGK.....',
  '.....KggGGK.....',
  '.....KKKKKK.....',
];

const PIRANHA_CLOSED = [
  '................',
  '....KKKKKKKK....',
  '..KKRRRRRRRRKK..',
  '.KRWRRRRRRRRWRK.',
  'KRRRRRWRRWRRRRRK',
  'KRRRRRRRRRRRRRRK',
  'KRRWRRRRRRRRWRRK',
  'KRRRRWWWWWWWRRRK',
  'KRRRRRRRRRRRRRRK',
  '.KRRRRWRRWRRRRK.',
  '..KDDDDDDDDDDK..',
  '....KKKKKKKK....',
  '.....KggGGK.....',
  '..KKKKKggKKKKK..',
  '.KggGGGggGGGggK.',
  '.KGGGGGGGGGGGGK.',
  '..KKKKKggKKKKK..',
  '.....KggGGK.....',
  '.....KggGGK.....',
  '.....KggGGK.....',
  '.....KggGGK.....',
  '.....KggGGK.....',
  '.....KggGGK.....',
  '.....KKKKKK.....',
];

const SPINY_PAL: PaletteMap = {
  '.': 'transparent',
  K: '#141013',
  R: '#dc2626',
  D: '#7f1d1d',
  W: '#ffffff',
  Y: '#fde047',
  B: '#f97316',
};

const SPINY_WALK1 = [
  '..KK...KK...KK..',
  '.KWWK.KWWK.KWWK.',
  '.KWWKKKWWKKKWWK.',
  '..KRRRRRRRRRRK..',
  '.KRRRRRRRRRRRRK.',
  'KKWRRRRRRRRRRWKK',
  'KRRRRRRRRRRRRRRK',
  'KDDDDDDDDDDDDDDK',
  '.KKKKYYYYYYKKKK.',
  '..KYYKWYYWKYYK..',
  '..KYYYYYYYYYYK..',
  '..KBBBK..KBBBK..',
  '.KBBBBK..KBBBBK.',
  '.KKKKK....KKKKK.',
  '................',
  '................',
];

const SPINY_WALK2 = [
  '...KK..KK..KK...',
  '..KWWKKWWKKWWK..',
  '..KWWKRRRRKWWK..',
  '..KRRRRRRRRRRK..',
  '.KRRRRRRRRRRRRK.',
  'KKWRRRRRRRRRRWKK',
  'KRRRRRRRRRRRRRRK',
  'KDDDDDDDDDDDDDDK',
  '.KKKKYYYYYYKKKK.',
  '..KYYKWYYWKYYK..',
  '..KYYYYYYYYYYK..',
  '...KBBBBBBBBK...',
  '..KBBBBKKBBBBK..',
  '..KKKKK..KKKKK..',
  '................',
  '................',
];

// ============================================================================
// FORTRESS BOSS: REY KOOPA (24x24 -> drawn at 64x64 world units!)
// Faces LEFT by default (-1) toward approaching player; flipped when facing=1
// ============================================================================
const BOSS_PAL: PaletteMap = {
  '.': 'transparent',
  K: '#141013',
  G: '#15803d', // Armored emerald hide
  L: '#4ade80',
  D: '#052e16',
  R: '#dc2626', // Mane / hair / eyes
  O: '#f97316', // Fiery glow
  Y: '#fde047', // Horns / belly / claws
  y: '#ca8a04',
  W: '#ffffff', // Spikes / fangs
};

const BOSS_IDLE = [
  '.....KK...KKKK..........',
  '....KWWK.KRRRRK..KK.....',
  '....KWWKKRRRRRRKKWWK....',
  '...KYYYYKRRRRRRKWWWK....',
  '..KGGGGGGKRRRRKGGGGK....',
  '.KGGKRWGGGKGGGGGGGGGK...',
  'KGGGKRWGGGGGGGGGGGWGGK..',
  'KGGGGGGGGGGGGGGGGGWWGK..',
  'KWWWWGGGGGGGGGGGGGGGGGK.',
  '.KKKKYYYYYYGGGGGGGGWWWK.',
  '..KYYYYYYYYKGGGGGGGGGGK.',
  '...KKKKKKKKYYYYGGGGGGDK.',
  '....KYYYYYYYYYYKGGGGDDK.',
  '...KYYYYYYYYYYYYKGGDDWWK',
  '...KYYyYYYYYYyYYKGGDDWWK',
  '..KGGGGKYYYYYYYYKGGGDDK.',
  '.KGGGGGKYYYYYYYYKGGGGDK.',
  '.KWGGGGKYYYYYYYYKGGGGK..',
  '..KKKKK..KYYYYK..KGGGK..',
  '........KGGGGGGK.KGGGK..',
  '.......KWWGGGGK..KWWGK..',
  '......KWWWGGGGK.KWWWGK..',
  '......KKKKKKKKK.KKKKKK..',
  '........................',
];

const BOSS_ROAR = [
  '.....KK...KKKK..........',
  '....KWWK.KRRRRK..KK.....',
  '....KWWKKRRRRRRKKWWK....',
  '...KYYYYKRRRRRRKWWWK....',
  '..KGGGGGGKRRRRKGGGGK....',
  '.KGGKOWGGGKGGGGGGGGGK...',
  'KGGGKOWGGGGGGGGGGGWGGK..',
  'KWWWWGGGGGGGGGGGGGWWGK..',
  'KOOOOOKGGGGGGGGGGGGGGGK.',
  'KOYOOYOKYYYYGGGGGGGWWWK.',
  'KWWWWWWKYYYYKGGGGGGGGGK.',
  '.KKKKKKYYYYYKGGGGGGGGDK.',
  '...KWWYYYYYYYYYYKGGGDDK.',
  '..KWWWYYYYYYYYYYKGGDDWWK',
  '..KKKK.KYYYYYYYYKGGDDWWK',
  '.......KYYYYYYYYKGGGDDK.',
  '......KYYYYYYYYYKGGGGDK.',
  '......KGGGGKYYYYKGGGGK..',
  '.....KGGGGGKYYYYKKGGGK..',
  '.....KWGGGGKGGGGK.KGGK..',
  '......KKKKKWWGGGK.KWWK..',
  '.........KWWWGGGK.KWWWK.',
  '.........KKKKKKKK.KKKKK.',
  '........................',
];

const BOSS_FIRE_PAL: PaletteMap = {
  '.': 'transparent',
  K: '#450a0a',
  R: '#ef4444',
  O: '#f97316',
  Y: '#fde047',
  W: '#ffffff',
};

const BOSS_FIRE1 = [
  '....KKKKKKK.....',
  '..KKRRRRRRRKK...',
  '.KRROOOOOOORRK..',
  'KROOYYYYYYYOORK.',
  'KROYWWWWWWWYOORK',
  'KROOYYYYYYYOORK.',
  '.KRROOOOOOORRK..',
  '..KKRRRRRRRKK...',
];

const BOSS_FIRE2 = [
  '..KKKKKKK.......',
  '.KRRRRRRRRKK....',
  'KROOOOOOOOORRKK.',
  'KROYYYYYYYYOORRK',
  'KROYWWWWWWYOORK.',
  'KROOYYYYYYOORK..',
  '.KKRROOOOORKK...',
  '...KKKKKKK......',
];

// ============================================================================
// COLLECTIBLES & INTERACTIVES (16x16)
// ============================================================================
const ITEM_PAL: PaletteMap = {
  '.': 'transparent',
  K: '#141013',
  Y: '#facc15',
  L: '#fef08a',
  D: '#b45309',
  R: '#ef4444',
  r: '#991b1b',
  G: '#22c55e',
  g: '#15803d',
  O: '#f97316',
  W: '#ffffff',
  S: '#fde68a',
  C: '#94a3b8',
};

const COIN_1 = [
  '.....KKKKKK.....',
  '...KKLLLLYYKK...',
  '..KLLYYYYYYDYK..',
  '.KLYYKKKKKKYYDK.',
  '.KLYKLLLLYYKYDK.',
  'KLYYKLYYYYYKYYDK',
  'KLYYKLYYYYYKYYDK',
  'KLYYKLYYYYYKYYDK',
  'KLYYKLYYYYYKYYDK',
  'KLYYKLYYYYYKYYDK',
  'KLYYKLYYYYYKYYDK',
  '.KLYKYYYYDDKYDK.',
  '.KLYYKKKKKKYYDK.',
  '..KYYYYYYYYDDK..',
  '...KKDDDDDDKK...',
  '.....KKKKKK.....',
];

const COIN_2 = [
  '......KKKK......',
  '....KKLLYYKK....',
  '...KLYYYYYDYK...',
  '..KLYKKKKKYYDK..',
  '..KLYKLLYYKYDK..',
  '..KLYKLYYYKYDK..',
  '..KLYKLYYYKYDK..',
  '..KLYKLYYYKYDK..',
  '..KLYKLYYYKYDK..',
  '..KLYKLYYYKYDK..',
  '..KLYKLYYYKYDK..',
  '..KLYKYYDDKYDK..',
  '..KLYKKKKKYYDK..',
  '...KYYYYYYDDK...',
  '....KKDDDDKK....',
  '......KKKK......',
];

const COIN_3 = [
  '.......KK.......',
  '......KLLK......',
  '.....KLYDK......',
  '.....KLYDK......',
  '.....KLYDK......',
  '.....KLYDK......',
  '.....KLYDK......',
  '.....KLYDK......',
  '.....KLYDK......',
  '.....KLYDK......',
  '.....KLYDK......',
  '.....KLYDK......',
  '.....KLYDK......',
  '.....KLYDK......',
  '......KDDK......',
  '.......KK.......',
];

const MUSHROOM_SUPER = [
  '....KKKKKKKK....',
  '..KKRRRRRRRRKK..',
  '.KRRWWWRRRRRRRK.',
  'KRRWWWWWRRRWWWRK',
  'KRRWWWWWRRWWWWWK',
  'KRRRWWWRRRWWWWWK',
  'KRRRRRRRRRRWWWRK',
  'KWWWRRRRRRRRRRRK',
  'KWWWWRRRRRRWWWRK',
  'KrrWWWRRRRRWWWrK',
  '.KKKKKKKKKKKKKK.',
  '..KSSSSSSSSSSK..',
  '..KSSKWSSWKSSK..',
  '..KSSKWSSWKSSK..',
  '...KSSSSSSSSK...',
  '....KKKKKKKK....',
];

const MUSHROOM_1UP = MUSHROOM_SUPER;
const MUSHROOM_1UP_PAL: PaletteMap = {
  ...ITEM_PAL,
  R: '#22c55e',
  r: '#15803d',
};

const FLOWER_1 = [
  '....KKKKKKKK....',
  '..KKOOOOOOOOkk..'.replace('kk', 'KK'),
  '.KOORRRRRRRROOK.',
  'KOORRYYYYYYRROOK',
  'KOORYWWWWWWYROOK',
  'KOORYWKWKWKYROOK',
  'KOORYWWWWWWYROOK',
  '.KOORRYYYYRROOK.',
  '..KKOOOOOOOOkk..'.replace('kk', 'KK'),
  '....KKKKKKKK....',
  '......KGGK......',
  '..KKKKKGGKKKKK..',
  '.KGGGGGGGGGGGGK.',
  '.KggGGGGGGGGggK.',
  '..KKKKKGGKKKKK..',
  '......KKKK......',
];

const FLOWER_2 = [
  '....KKKKKKKK....',
  '..KKRRRRRRRRKK..',
  '.KRROOOOOOOORRK.',
  'KRROOYYYYYYOORRK',
  'KRROYWWWWWWYORRK',
  'KRROYWKWKWKYORRK',
  'KRROYWWWWWWYORRK',
  '.KRROOYYYYOORRK.',
  '..KKRRRRRRRRKK..',
  '....KKKKKKKK....',
  '......KGGK......',
  '..KKKKKGGKKKKK..',
  '.KggGGGGGGGGggK.',
  '.KGGGGGGGGGGGGK.',
  '..KKKKKGGKKKKK..',
  '......KKKK......',
];

const STAR_1 = [
  '.......KK.......',
  '......KLLK......',
  '......KYYK......',
  '.....KLYYYK.....',
  'KKKKKLYYYYYKKKKK',
  'KLLLYYYYYYYYYYDK',
  '.KLYYYKYYKYYYDK.',
  '..KLYYKYYKYYDK..',
  '...KLYYYYYYDK...',
  '..KLYYYYYYYYDK..',
  '..KLYYYKKYYYDK..',
  '.KLYYYK..KYYYDK.',
  '.KLYYK....KYYDK.',
  'KKKKK......KKKKK',
  '................',
  '................',
];

const STAR_2 = [
  '.......KK.......',
  '......KWWK......',
  '......KLLK......',
  '.....KWLLLK.....',
  'KKKKKWLLLLLKKKKK',
  'KWWWLLLLLLLLLLYK',
  '.KWLLLKLLKLLLYK.',
  '..KWLLKLLKLLYK..',
  '...KWLLLLLLYK...',
  '..KWLLLLLLLLYk..'.replace('k', 'K'),
  '..KWLLLKKLLLYK..',
  '.KWLLLK..KLLLYK.',
  '.KWLLK....KLLYK.',
  'KKKKK......KKKKK',
  '................',
  '................',
];

const FIREBALL_1 = [
  '................',
  '................',
  '.....KKKKKK.....',
  '....KRRRRRRK....',
  '...KRROOOORRK...',
  '..KROOYYYYOORK..',
  '..KROYWWWWYORK..',
  '..KROYWWWWYORK..',
  '..KROOYYYYOORK..',
  '...KRROOOORRK...',
  '....KRRRRRRK....',
  '.....KKKKKK.....',
  '................',
  '................',
  '................',
  '................',
];

const FIREBALL_2 = [
  '................',
  '......KKKK......',
  '....KKRRRRKK....',
  '...KRROOOORRK...',
  '..KROOYYYYOORK..',
  '.KROYWWWWWWYORK.',
  '.KROYWWWWWWYORK.',
  '..KROOYYYYOORK..',
  '...KRROOOORRK...',
  '....KKRRRRKK....',
  '......KKKK......',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const SPRING_IDLE = [
  'KKKKKKKKKKKKKKKK',
  'KRRRRWWWWWWWRRRK',
  'KrrrrrrrrrrrrrrK',
  'KKKKKKKKKKKKKKKK',
  '...KCCK..KCCK...',
  '..KCCK....KCCK..',
  '...KCCKKKKCCK...',
  '....KKKKKKKK....',
  '...KCCKKKKCCK...',
  '..KCCK....KCCK..',
  '...KCCK..KCCK...',
  'KKKKKKKKKKKKKKKK',
  'KRRRRWWWWWWWRRRK',
  'KrrrrrrrrrrrrrrK',
  'KKKKKKKKKKKKKKKK',
  '................',
];

const SPRING_COMP = [
  '................',
  '................',
  '................',
  '................',
  '................',
  'KKKKKKKKKKKKKKKK',
  'KRRRRWWWWWWWRRRK',
  'KKKKKKKKKKKKKKKK',
  '.KCCCCCCCCCCCCK.',
  'KKKKKKKKKKKKKKKK',
  '.KCCCCCCCCCCCCK.',
  'KKKKKKKKKKKKKKKK',
  'KRRRRWWWWWWWRRRK',
  'KrrrrrrrrrrrrrrK',
  'KKKKKKKKKKKKKKKK',
  '................',
];

const AXE_1 = [
  '......KKKKKK....',
  '....KKLLLLYYKK..',
  '...KLLYYYYYYYYK.',
  '..KLLYYYYYYKKYYK',
  '..KLYYYYYYKKKYYK',
  '..KLYYYYYKK.KYYK',
  '...KLYYYKK..KYYK',
  '....KKKKDD..KKK.',
  '.......KDDK.....',
  '......KDDK......',
  '.....KDDK.......',
  '....KDDK........',
  '...KDDK.........',
  '..KDDK..........',
  '..KKK...........',
  '................',
];

// ============================================================================
// BIOME TILE GENERATORS (16x16 crisp pixel tiles with edge extrusion!)
// ============================================================================
function makeBiomeTiles(b: BiomeDefinition): Record<string, PixelSpriteDef> {
  const groundPal: PaletteMap = {
    '.': 'transparent',
    K: b.groundDark,
    C: b.groundCap,
    H: b.groundCapHighlight,
    M: b.groundMain,
    S: b.groundShadow,
  };

  const groundTopRows = [
    'HHHHHHHHHHHHHHHH',
    'CCCCCCCCCCCCCCCC',
    'CCCCHHCCCCCHHCCC',
    'CCKKKKKKKKKKKKCC',
    'KKMMMMKMMMMMMMKK',
    'MMMMMMKMMMMMMMMM',
    'MMMMSSKMMMMMMSSM',
    'SSKKKKKMMMMMMMMK',
    'KKMMMMMMMMMMMMKS',
    'MMMMMMMMKMMMMMKS',
    'MMSSMMMMKMMMMSSK',
    'KKKKMMMMKKKKKKKM',
    'MMMMKKKKMMMMMMKM',
    'MMMMMMMMMMMMSSKM',
    'MMSSMMMMMMKKKKSM',
    'KKKKMMMMMMKMMMMM',
  ];

  const groundDeepRows = [
    'MMMMMMKMMMMMMMMM',
    'MMMMSSKMMMMMMSSM',
    'SSKKKKKMMMMMMMMK',
    'KKMMMMMMMMMMMMKS',
    'MMMMMMMMKMMMMMKS',
    'MMSSMMMMKMMMMSSK',
    'KKKKMMMMKKKKKKKM',
    'MMMMKKKKMMMMMMKM',
    'MMMMMMMMMMMMSSKM',
    'MMSSMMMMMMKKKKSM',
    'KKKKMMMMMMKMMMMM',
    'MMMMKKKKMMMMMMMM',
    'MMMMMMMMKMMMMSSM',
    'MMMMSSMMKMMMMKKK',
    'KKKKKKMMKKKKKMMM',
    'MMMMMMMMMMMMMMMM',
  ];

  const brickPal: PaletteMap = {
    K: b.mortar,
    L: b.brickLight,
    M: b.brickMain,
    D: b.brickDark,
  };

  const brickRows = [
    'LLLLLLLKLLLLLLLK',
    'LMMMMMDKLMMMMMDK',
    'LMMMMMDKLMMMMMDK',
    'DDDDDDDKDDDDDDDK',
    'KKKKKKKKKKKKKKKK',
    'LLLKLLLLLLLKLLLL',
    'MMDKLMMMMMDKLMMM',
    'MMDKLMMMMMDKLMMM',
    'DDDKDDDDDDDKDDDD',
    'KKKKKKKKKKKKKKKK',
    'LLLLLLLKLLLLLLLK',
    'LMMMMMDKLMMMMMDK',
    'LMMMMMDKLMMMMMDK',
    'DDDDDDDKDDDDDDDK',
    'KKKKKKKKKKKKKKKK',
    'LLLKLLLLLLLKLLLL',
  ];

  const hardPal: PaletteMap = {
    K: '#141013',
    L: b.hardLight,
    M: b.hardMain,
    D: b.hardDark,
  };

  const hardRows = [
    'KKKKKKKKKKKKKKKK',
    'KLLLLLLLLLLLLLDK',
    'KLMKKKKKKKKKKDDK',
    'KLMKLLLLLLLMKDDK',
    'KLMKLMMMMMMMKDDK',
    'KLMKLMMMMMMMKDDK',
    'KLMKLMMMMMMMKDDK',
    'KLMKLMMMMMMMKDDK',
    'KLMKLMMMMMMMKDDK',
    'KLMKLMMMMMMMKDDK',
    'KLMKLMMMMMMMKDDK',
    'KLMKLMMMMMMMKDDK',
    'KLMKDDDDDDDDKDDK',
    'KLMKKKKKKKKKKDDK',
    'KDDDDDDDDDDDDDDK',
    'KKKKKKKKKKKKKKKK',
  ];

  const pipePal: PaletteMap = {
    '.': 'transparent',
    K: '#09150d',
    L: b.pipeLight,
    M: b.pipeMain,
    D: b.pipeDark,
  };

  const pipeTopLeft = [
    'KKKKKKKKKKKKKKKK',
    'KLLLLLLLLMMMMMMM',
    'KMMLLLLLLMMMMMMM',
    'KMMLLLLLLMMMMMMM',
    'KMMLLLLLLMMMMMMM',
    'KMMLLLLLLMMMMMMM',
    'KMMLLLLLLMMMMMMM',
    'KMMLLLLLLMMMMMMM',
    'KMMLLLLLLMMMMMMM',
    'KMMLLLLLLMMMMMMM',
    'KDDDDDDDDDDDDDDD',
    'KKKKKKKKKKKKKKKK',
    '..KMMLLLLLLMMMMM',
    '..KMMLLLLLLMMMMM',
    '..KMMLLLLLLMMMMM',
    '..KMMLLLLLLMMMMM',
  ];

  const pipeTopRight = [
    'KKKKKKKKKKKKKKKK',
    'MMMMMMDDDDDDDDDK',
    'MMMMMMDDDDDDDDDK',
    'MMMMMMDDDDDDDDDK',
    'MMMMMMDDDDDDDDDK',
    'MMMMMMDDDDDDDDDK',
    'MMMMMMDDDDDDDDDK',
    'MMMMMMDDDDDDDDDK',
    'MMMMMMDDDDDDDDDK',
    'MMMMMMDDDDDDDDDK',
    'DDDDDDDDDDDDDDDK',
    'KKKKKKKKKKKKKKKK',
    'MMMMDDDDDDDDDK..',
    'MMMMDDDDDDDDDK..',
    'MMMMDDDDDDDDDK..',
    'MMMMDDDDDDDDDK..',
  ];

  const pipeBodyLeft = Array.from({ length: 16 }, () => '..KMMLLLLLLMMMMM');
  const pipeBodyRight = Array.from({ length: 16 }, () => 'MMMMDDDDDDDDDK..');

  return {
    [`${b.id}_ground_top`]: { width: 16, height: 16, rows: groundTopRows, palette: groundPal, extrude: true },
    [`${b.id}_ground_deep`]: { width: 16, height: 16, rows: groundDeepRows, palette: groundPal, extrude: true },
    [`${b.id}_brick`]: { width: 16, height: 16, rows: brickRows, palette: brickPal, extrude: true },
    [`${b.id}_hard`]: { width: 16, height: 16, rows: hardRows, palette: hardPal, extrude: true },
    [`${b.id}_pipe_tl`]: { width: 16, height: 16, rows: pipeTopLeft, palette: pipePal },
    [`${b.id}_pipe_tr`]: { width: 16, height: 16, rows: pipeTopRight, palette: pipePal },
    [`${b.id}_pipe_bl`]: { width: 16, height: 16, rows: pipeBodyLeft, palette: pipePal },
    [`${b.id}_pipe_br`]: { width: 16, height: 16, rows: pipeBodyRight, palette: pipePal },
  };
}

// Universal interactive tiles (Question blocks, Empty block, Bridge, Lava)
const QUESTION_BASE = [
  'KKKKKKKKKKKKKKKK',
  'KLLLLLLLLLLLLLDK',
  'KLKMMMMMMMMMMKDK',
  'KLMMMMKKKKMMMMDK',
  'KLMMMKWWWWKMMMDK',
  'KLMMMKWKWWKMMMDK',
  'KLMMMMKKWWKMMMDK',
  'KLMMMMMKWWKMMMDK',
  'KLMMMMMKWWKMMMDK',
  'KLMMMMMKKKKMMMDK',
  'KLMMMMMKWWKMMMDK',
  'KLMMMMMKWWKMMMDK',
  'KLMMMMMKKKKMMMDK',
  'KLKDDDDDDDDDDKDK',
  'KDDDDDDDDDDDDDDK',
  'KKKKKKKKKKKKKKKK',
];

const EMPTY_BLOCK = [
  'KKKKKKKKKKKKKKKK',
  'KLLLLLLLLLLLLLDK',
  'KLKMMMMMMMMMMKDK',
  'KLMMMMMMMMMMMMDK',
  'KLMMMMMMMMMMMMDK',
  'KLMMMMMMMMMMMMDK',
  'KLMMMMMMMMMMMMDK',
  'KLMMMMMMMMMMMMDK',
  'KLMMMMMMMMMMMMDK',
  'KLMMMMMMMMMMMMDK',
  'KLMMMMMMMMMMMMDK',
  'KLMMMMMMMMMMMMDK',
  'KLMMMMMMMMMMMMDK',
  'KLKDDDDDDDDDDKDK',
  'KDDDDDDDDDDDDDDK',
  'KKKKKKKKKKKKKKKK',
];

const BRIDGE_TILE = [
  '..KKKK....KKKK..',
  '.KLLLLK..KLLLLK.',
  'KKKKKKKKKKKKKKKK',
  'KLLLLLLLLLLLLLLK',
  'KMMMMMMMMMMMMMMK',
  'KDDDDDDDDDDDDDDK',
  'KKKKKKKKKKKKKKKK',
  '..KMMK....KMMK..',
  '..KDDK....KDDK..',
  '..KKKK....KKKK..',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const LAVA_1 = [
  '..YYYY....YYYY..',
  '.YWWWWY..YWWWWY.',
  'YOOOOOOYYOOOOOOY',
  'OOOOOOOOOOOOOOOO',
  'RRRRROOOOOORRRRR',
  'RRRRRRRRRRRRRRRR',
  'KKKKKKKKKKKKKKKK',
  'RRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRR',
  'KKKKKKKKKKKKKKKK',
  'RRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRR',
];

const LAVA_2 = [
  '......YYYY......',
  '.....YWWWWY.....',
  'YY..YOOOOOOY..YY',
  'OOYYOOOOOOOOYYOO',
  'OOOOORRRRRROOOOO',
  'RRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRR',
  'KKKKKKKKKKKKKKKK',
  'RRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRR',
  'KKKKKKKKKKKKKKKK',
  'RRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRR',
  'RRRRRRRRRRRRRRRR',
];

export function buildAllSpriteDefinitions(): Record<string, PixelSpriteDef> {
  const defs: Record<string, PixelSpriteDef> = {};

  const heroVariants: Array<[string, PaletteMap]> = [
    ['norm', HERO_BASE],
    ['fire', HERO_FIRE],
    ['star0', HERO_STAR_GOLD],
    ['star1', HERO_STAR_CYAN],
    ['star2', HERO_STAR_EMERALD],
  ];

  const smallPoses: Record<string, string[]> = {
    idle: SMALL_IDLE,
    run1: SMALL_RUN1,
    run2: SMALL_RUN2,
    run3: SMALL_RUN3,
    jump: SMALL_JUMP,
    skid: SMALL_SKID,
    dead: SMALL_DEAD,
  };

  const bigPoses: Record<string, string[]> = {
    idle: bottomAlignRows(BIG_IDLE, 24),
    run1: bottomAlignRows(BIG_RUN1, 24),
    run2: bottomAlignRows(BIG_RUN2, 24),
    run3: bottomAlignRows(BIG_RUN3, 24),
    jump: bottomAlignRows(BIG_JUMP, 24),
    skid: bottomAlignRows(BIG_SKID, 24),
    crouch: bottomAlignRows(BIG_CROUCH, 24),
    throw: bottomAlignRows(BIG_THROW, 24),
  };

  for (const [vName, pal] of heroVariants) {
    for (const [poseName, rows] of Object.entries(smallPoses)) {
      defs[`hero_small_${vName}_${poseName}`] = { width: 16, height: 16, rows, palette: pal };
    }
    for (const [poseName, rows] of Object.entries(bigPoses)) {
      defs[`hero_big_${vName}_${poseName}`] = { width: 16, height: 24, rows, palette: pal };
    }
  }

  // Enemies
  defs.goomba_walk1 = { width: 16, height: 16, rows: GOOMBA_WALK1, palette: GOOMBA_PAL };
  defs.goomba_walk2 = { width: 16, height: 16, rows: GOOMBA_WALK2, palette: GOOMBA_PAL };
  defs.goomba_flat = { width: 16, height: 16, rows: GOOMBA_FLAT, palette: GOOMBA_PAL };
  defs.goomba_blue_walk1 = { width: 16, height: 16, rows: GOOMBA_WALK1, palette: GOOMBA_CAVERN_PAL };
  defs.goomba_blue_walk2 = { width: 16, height: 16, rows: GOOMBA_WALK2, palette: GOOMBA_CAVERN_PAL };
  defs.goomba_blue_flat = { width: 16, height: 16, rows: GOOMBA_FLAT, palette: GOOMBA_CAVERN_PAL };

  defs.koopa_green_walk1 = { width: 16, height: 24, rows: bottomAlignRows(KOOPA_WALK1, 24), palette: KOOPA_GREEN_PAL };
  defs.koopa_green_walk2 = { width: 16, height: 24, rows: bottomAlignRows(KOOPA_WALK2, 24), palette: KOOPA_GREEN_PAL };
  defs.koopa_green_shell1 = { width: 16, height: 16, rows: KOOPA_SHELL1, palette: KOOPA_GREEN_PAL };
  defs.koopa_green_shell2 = { width: 16, height: 16, rows: KOOPA_SHELL2, palette: KOOPA_GREEN_PAL };
  defs.koopa_green_wake = { width: 16, height: 16, rows: KOOPA_SHELL_WAKE, palette: KOOPA_GREEN_PAL };

  defs.koopa_red_walk1 = { width: 16, height: 24, rows: bottomAlignRows(KOOPA_WALK1, 24), palette: KOOPA_RED_PAL };
  defs.koopa_red_walk2 = { width: 16, height: 24, rows: bottomAlignRows(KOOPA_WALK2, 24), palette: KOOPA_RED_PAL };
  defs.koopa_red_shell1 = { width: 16, height: 16, rows: KOOPA_SHELL1, palette: KOOPA_RED_PAL };
  defs.koopa_red_shell2 = { width: 16, height: 16, rows: KOOPA_SHELL2, palette: KOOPA_RED_PAL };
  defs.koopa_red_wake = { width: 16, height: 16, rows: KOOPA_SHELL_WAKE, palette: KOOPA_RED_PAL };

  defs.paratroopa_fly1 = { width: 16, height: 24, rows: bottomAlignRows(PARATROOPA_FLY1, 24), palette: KOOPA_RED_PAL };
  defs.paratroopa_fly2 = { width: 16, height: 24, rows: bottomAlignRows(PARATROOPA_FLY2, 24), palette: KOOPA_RED_PAL };

  defs.piranha_open = { width: 16, height: 24, rows: bottomAlignRows(PIRANHA_OPEN, 24), palette: PIRANHA_PAL };
  defs.piranha_closed = { width: 16, height: 24, rows: bottomAlignRows(PIRANHA_CLOSED, 24), palette: PIRANHA_PAL };

  defs.spiny_walk1 = { width: 16, height: 16, rows: SPINY_WALK1, palette: SPINY_PAL };
  defs.spiny_walk2 = { width: 16, height: 16, rows: SPINY_WALK2, palette: SPINY_PAL };

  defs.boss_idle = { width: 24, height: 24, rows: BOSS_IDLE, palette: BOSS_PAL };
  defs.boss_roar = { width: 24, height: 24, rows: BOSS_ROAR, palette: BOSS_PAL };
  defs.boss_fire1 = { width: 16, height: 8, rows: BOSS_FIRE1, palette: BOSS_FIRE_PAL };
  defs.boss_fire2 = { width: 16, height: 8, rows: BOSS_FIRE2, palette: BOSS_FIRE_PAL };

  // Collectibles & Interactives
  defs.coin_1 = { width: 16, height: 16, rows: COIN_1, palette: ITEM_PAL };
  defs.coin_2 = { width: 16, height: 16, rows: COIN_2, palette: ITEM_PAL };
  defs.coin_3 = { width: 16, height: 16, rows: COIN_3, palette: ITEM_PAL };
  defs.coin_4 = { width: 16, height: 16, rows: COIN_2, palette: ITEM_PAL };
  defs.mushroom_super = { width: 16, height: 16, rows: MUSHROOM_SUPER, palette: ITEM_PAL };
  defs.mushroom_1up = { width: 16, height: 16, rows: MUSHROOM_1UP, palette: MUSHROOM_1UP_PAL };
  defs.flower_1 = { width: 16, height: 16, rows: FLOWER_1, palette: ITEM_PAL };
  defs.flower_2 = { width: 16, height: 16, rows: FLOWER_2, palette: ITEM_PAL };
  defs.star_1 = { width: 16, height: 16, rows: STAR_1, palette: ITEM_PAL };
  defs.star_2 = { width: 16, height: 16, rows: STAR_2, palette: ITEM_PAL };
  defs.fireball_1 = { width: 16, height: 16, rows: FIREBALL_1, palette: ITEM_PAL };
  defs.fireball_2 = { width: 16, height: 16, rows: FIREBALL_2, palette: ITEM_PAL };
  defs.spring_idle = { width: 16, height: 16, rows: SPRING_IDLE, palette: ITEM_PAL };
  defs.spring_comp = { width: 16, height: 16, rows: SPRING_COMP, palette: ITEM_PAL };
  defs.axe_1 = { width: 16, height: 16, rows: AXE_1, palette: ITEM_PAL };

  // Universal Question, Empty, Bridge, Lava tiles
  defs.tile_question_1 = {
    width: 16,
    height: 16,
    rows: QUESTION_BASE,
    palette: { K: '#261008', L: '#fef08a', M: '#f59e0b', D: '#b45309', W: '#fffbeb' },
    extrude: true,
  };
  defs.tile_question_2 = {
    width: 16,
    height: 16,
    rows: QUESTION_BASE,
    palette: { K: '#261008', L: '#fde047', M: '#d97706', D: '#92400e', W: '#fef9c3' },
    extrude: true,
  };
  defs.tile_question_3 = {
    width: 16,
    height: 16,
    rows: QUESTION_BASE,
    palette: { K: '#261008', L: '#fbbf24', M: '#b45309', D: '#78350f', W: '#fde68a' },
    extrude: true,
  };
  defs.tile_empty = {
    width: 16,
    height: 16,
    rows: EMPTY_BLOCK,
    palette: { K: '#1c1917', L: '#a8a29e', M: '#78716c', D: '#44403c' },
    extrude: true,
  };
  defs.tile_bridge = {
    width: 16,
    height: 16,
    rows: BRIDGE_TILE,
    palette: { '.': 'transparent', K: '#1c1917', L: '#fdba74', M: '#c2410c', D: '#7c2d12' },
  };
  defs.tile_lava_1 = {
    width: 16,
    height: 16,
    rows: LAVA_1,
    palette: { '.': 'transparent', K: '#7f1d1d', R: '#dc2626', O: '#f97316', Y: '#facc15', W: '#ffffff' },
    extrude: true,
  };
  defs.tile_lava_2 = {
    width: 16,
    height: 16,
    rows: LAVA_2,
    palette: { '.': 'transparent', K: '#7f1d1d', R: '#dc2626', O: '#f97316', Y: '#facc15', W: '#ffffff' },
    extrude: true,
  };

  for (const biomeId of Object.keys(BIOMES) as BiomeId[]) {
    Object.assign(defs, makeBiomeTiles(BIOMES[biomeId]));
  }

  return defs;
}
