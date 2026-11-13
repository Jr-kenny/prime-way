// Account switcher: a bottom sheet listing every wallet, with
// the active one marked, plus an Add account row. Used from Home
// and from Settings.

import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useWallet } from '../wallet/WalletContext';
import { shortAddress } from '../lib/format';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';
import { CheckIcon, PlusIcon } from './icons';

export function AccountSwitcher({
  visible,
  onClose,
  onAddAccount,
}: {
  visible: boolean;
  onClose: () => void;
  onAddAccount: () => void;
}) {
  const { palette } = useTheme();
  const { wallets, activeId, setActiveWallet } = useWallet();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: palette.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 22,
            paddingBottom: 28,
          }}
          onPress={() => {}}
        >
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: palette.line,
              alignSelf: 'center',
              marginBottom: 16,
            }}
          />
          <Text style={{ fontFamily: FONTS.display, fontWeight: '800', fontSize: 22, color: palette.ink }}>
            Switch account
          </Text>
          {wallets.map((w) => {
            const active = w.id === activeId;
            return (
              <Pressable
                key={w.id}
                onPress={() => {
                  setActiveWallet(w.id);
                  onClose();
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: palette.line,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 16, color: palette.ink }}>
                    {w.label}
                  </Text>
                  <Text style={{ fontSize: 13, color: palette.muted, fontWeight: '600', marginTop: 2 }}>
                    {shortAddress(w.address)}
                    {w.source === 'privy' ? ' · Privy' : w.source === 'imported-mnemonic' ? ' · Recovery phrase' : ' · Private key'}
                  </Text>
                </View>
                {active ? <CheckIcon size={20} color={palette.accent} /> : null}
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => {
              onClose();
              onAddAccount();
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 }}
          >
            <PlusIcon size={20} color={palette.accent} />
            <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 16, color: palette.accent }}>
              Add account
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
