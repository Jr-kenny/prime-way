// Prime Way themes. Light is true AMOLED white, dark is true
// AMOLED black, charcoal is a soft dark grey. All three are
// intentional, not one inverted from the other.
//
// There is no embedded or designer font anywhere in the app: the
// system font is used throughout. FONTS is kept as a map of
// undefined values so the ~100 existing fontFamily references keep
// compiling and resolve to the system font; weight comes from the
// fontWeight set next to each use.

export type ThemeName = 'light' | 'dark' | 'charcoal';

export interface Palette {
  bg: string;
  surface: string;
  soft: string;
  soft2: string;
  ink: string;
  muted: string;
  line: string;
  balcard: string;
  dock: string;
  accent: string;
  accentDeep: string;
  accentInk: string;
  accentSoft: string;
  good: string;
  goodSoft: string;
  bad: string;
  badSoft: string;
  amber: string;
}

export const LIGHT: Palette = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  soft: '#F6F6F4',
  soft2: '#ECECE8',
  ink: '#221812',
  muted: '#6F6359',
  line: '#EBEBE6',
  balcard: '#F4EFE8',
  dock: '#FFFFFF',
  accent: '#0b84ff',
  accentDeep: '#0066e8',
  accentInk: '#FFFFFF',
  accentSoft: '#E5F1FF',
  good: '#0E9F8A',
  goodSoft: '#E2F5F1',
  bad: '#D64545',
  badSoft: '#FDECEC',
  amber: '#F5A524',
};

export const DARK: Palette = {
  bg: '#000000',
  surface: '#0A0A0A',
  soft: '#141210',
  soft2: '#1E1A16',
  ink: '#F7EFE6',
  muted: '#A08D7D',
  line: '#241E18',
  balcard: '#262019',
  dock: '#171310',
  accent: '#0b84ff',
  accentDeep: '#0066e8',
  accentInk: '#FFFFFF',
  accentSoft: '#0D1F33',
  good: '#2ED3B7',
  goodSoft: '#0C2420',
  bad: '#FF7A6B',
  badSoft: '#2A1210',
  amber: '#FFB84D',
};

export const CHARCOAL: Palette = {
  bg: '#0E0E11',
  surface: '#16161B',
  soft: '#1D1D23',
  soft2: '#26262E',
  ink: '#F4F4F2',
  muted: '#9C9CA6',
  line: '#26262E',
  balcard: '#1D1D23',
  dock: '#16161B',
  accent: '#0b84ff',
  accentDeep: '#0066e8',
  accentInk: '#FFFFFF',
  accentSoft: '#16222E',
  good: '#2ED3B7',
  goodSoft: '#0C2420',
  bad: '#FF7A6B',
  badSoft: '#2A1210',
  amber: '#FFB84D',
};

export const PALETTES: Record<ThemeName, Palette> = {
  light: LIGHT,
  dark: DARK,
  charcoal: CHARCOAL,
};

export const FONTS: {
  display: string | undefined;
  heading: string | undefined;
  body: string | undefined;
  bodySemi: string | undefined;
  bodyBold: string | undefined;
} = {
  display: undefined,
  heading: undefined,
  body: undefined,
  bodySemi: undefined,
  bodyBold: undefined,
};
