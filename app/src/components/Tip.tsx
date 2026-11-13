// Tip (?): explanations hide behind a small tap target, never left
// open on the screen. Ported from the prototype.

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme-context';
import { FONTS } from '../theme';

export function Tip({ text }: { text: string }) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityLabel="Tip"
        accessibilityRole="button"
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [
          styles.btn,
          { borderColor: palette.line, backgroundColor: palette.soft },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={[styles.mark, { color: palette.muted }]}>?</Text>
      </Pressable>
      {open ? (
        <Pressable
          onPress={() => setOpen(false)}
          style={[styles.pop, { backgroundColor: palette.ink }]}
        >
          <Text style={[styles.popText, { color: palette.bg }]}>{text}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', marginLeft: 7 },
  btn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { fontFamily: FONTS.heading, fontSize: 13, lineHeight: 15 },
  pop: {
    position: 'absolute',
    left: -90,
    top: 30,
    width: 208,
    borderRadius: 12,
    padding: 10,
    zIndex: 45,
  },
  popText: { fontFamily: FONTS.bodySemi, fontSize: 13, lineHeight: 19 },
});
