// Shared bits, styled after the prototype: big rounded buttons,
// section labels, settings rows, mascot messages.

import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { FONTS } from '../theme';
import { useTheme } from '../theme-context';
import { Pip, type PipExpression } from './Pip';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

export function Screen({
  children,
  style,
  refreshControl,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  refreshControl?: React.ReactElement;
}) {
  const { palette } = useTheme();
  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: palette.bg }, style]}
      contentContainerStyle={styles.screenContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 28 },
});

export function Heading({
  children,
  center,
  size = 25,
}: {
  children: React.ReactNode;
  center?: boolean;
  size?: number;
}) {
  const { palette } = useTheme();
  return (
    <Text
      style={{
        fontFamily: FONTS.display,
        fontWeight: '900',
        fontSize: size,
        color: palette.ink,
        textAlign: center ? 'center' : 'left',
        lineHeight: size * 1.15,
      }}
    >
      {children}
    </Text>
  );
}

export function Subtext({
  children,
  center,
}: {
  children: React.ReactNode;
  center?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <Text
      style={{
        fontFamily: FONTS.bodySemi,
        fontSize: 14.5,
        color: palette.muted,
        textAlign: center ? 'center' : 'left',
        lineHeight: 21,
      }}
    >
      {children}
    </Text>
  );
}

export function BigButton({
  title,
  onPress,
  disabled,
  secondary,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: secondary ? palette.soft : palette.accent,
          borderRadius: 20,
          minHeight: 56,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 20,
          opacity: disabled ? 0.4 : pressed ? 0.9 : 1,
        },
      ]}
    >
      <Text
        style={{
          fontFamily: FONTS.display,
          fontWeight: '800',
          fontSize: 18,
          color: secondary ? palette.ink : palette.accentInk,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function BackButton({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingVertical: 8 }}
    >
      <ChevronLeftIcon size={20} color={palette.ink} />
      <Text style={{ fontFamily: FONTS.heading, fontWeight: '700', fontSize: 15, color: palette.ink }}>{title}</Text>
    </Pressable>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  const { palette } = useTheme();
  return (
    <Text
      style={{
        fontFamily: FONTS.heading,
        fontSize: 14,
        color: palette.ink,
        marginTop: 24,
        marginBottom: 10,
      }}
    >
      {children}
    </Text>
  );
}

export function MascotMsg({
  expression,
  text,
}: {
  expression: PipExpression;
  text: string;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 12,
        alignItems: 'flex-start',
        backgroundColor: palette.soft,
        borderRadius: 18,
        padding: 12,
        marginTop: 16,
      }}
    >
      <Pip expression={expression} size={52} />
      <Text
        style={{
          flex: 1,
          fontFamily: FONTS.bodySemi,
          fontSize: 14.5,
          color: palette.ink,
          lineHeight: 20,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

export function Row({
  title,
  sub,
  onPress,
  right,
  danger,
}: {
  title: string;
  sub?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 15,
        paddingHorizontal: 6,
        borderBottomWidth: 1,
        borderBottomColor: palette.line,
        minHeight: 56,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: FONTS.heading,
            fontSize: 16,
            color: danger ? palette.bad : palette.ink,
          }}
        >
          {title}
        </Text>
        {sub ? (
          <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: palette.muted, marginTop: 2 }}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress ? <ChevronRightIcon size={20} color={palette.muted} /> : null}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 2,
        borderColor: selected ? palette.accent : palette.line,
        backgroundColor: selected ? palette.accentSoft : palette.surface,
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 16,
        minHeight: 44,
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontFamily: FONTS.heading,
          fontSize: 14,
          color: selected ? palette.accent : palette.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
