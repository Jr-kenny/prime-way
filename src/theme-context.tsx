// Theme state: system, light or dark. Light is AMOLED white, dark is
// AMOLED black. The choice is remembered on the device.

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { DARK, LIGHT, type Palette, type ThemeName } from './theme';
import { loadThemeChoice, saveThemeChoice, type ThemeChoice } from './store/settings';

interface ThemeState {
  name: ThemeName;
  choice: ThemeChoice;
  palette: Palette;
  setChoice: (c: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeState>({
  name: 'light',
  choice: 'system',
  palette: LIGHT,
  setChoice: () => {},
});

export function useTheme(): ThemeState {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [choice, setChoiceState] = useState<ThemeChoice>('system');

  useEffect(() => {
    loadThemeChoice().then(setChoiceState);
  }, []);

  const name: ThemeName =
    choice === 'system' ? (system === 'dark' ? 'dark' : 'light') : choice;

  const value = useMemo<ThemeState>(
    () => ({
      name,
      choice,
      palette: name === 'dark' ? DARK : LIGHT,
      setChoice: (c: ThemeChoice) => {
        setChoiceState(c);
        saveThemeChoice(c);
      },
    }),
    [name, choice],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
