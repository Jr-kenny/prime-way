// Prime Way themes. Ported from the flow prototype (index.html).
// Light is true AMOLED white, dark is true AMOLED black. Both are
// intentional, not one inverted from the other.

export type ThemeName = 'light' | 'dark';

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
  accent: '#E8641C',
  accentInk: '#FFFFFF',
  accentSoft: '#FDEEE2',
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
  accent: '#F07A35',
  accentInk: '#1A0E04',
  accentSoft: '#2A1A0E',
  good: '#2ED3B7',
  goodSoft: '#0C2420',
  bad: '#FF7A6B',
  badSoft: '#2A1210',
  amber: '#FFB84D',
};

export const FONTS = {
  display: 'Nunito_900Black',
  heading: 'Nunito_800ExtraBold',
  body: 'NunitoSans_400Regular',
  bodySemi: 'NunitoSans_600SemiBold',
  bodyBold: 'NunitoSans_700Bold',
};
