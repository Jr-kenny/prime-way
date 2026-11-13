import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme-context';
import { WalletProvider, useWallet } from './src/wallet/WalletContext';
import { AppNavigator } from './src/navigation/AppNavigator';

function Root() {
  const { palette, name } = useTheme();
  const { address, privyStarted } = useWallet();

  if (!privyStarted) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={name === 'light' ? 'dark' : 'light'} />
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
