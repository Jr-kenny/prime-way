import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFonts, Nunito_800ExtraBold, Nunito_900Black } from '@expo-google-fonts/nunito';
import {
  NunitoSans_400Regular,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
} from '@expo-google-fonts/nunito-sans';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme-context';
import { WalletProvider, useWallet } from './src/wallet/WalletContext';
import { AppNavigator } from './src/navigation/AppNavigator';

function Root() {
  const { palette, name } = useTheme();
  const { address, privyStarted } = useWallet();
  const [fontsLoaded] = useFonts({
    Nunito_800ExtraBold,
    Nunito_900Black,
    NunitoSans_400Regular,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
  });

  if (!fontsLoaded || !privyStarted) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <AppNavigator hasWallet={!!address} />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <WalletProvider>
          <Root />
        </WalletProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
