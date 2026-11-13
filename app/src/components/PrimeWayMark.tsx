// The Prime Way mark for onboarding: a black circular badge with
// PRIME in solid heavy hand-drawn letterforms, and a straight road
// underneath it, centred and symmetrical, cut off with a clear gap
// below PRIME, widening to a broad base at the bottom with a dashed
// centre line. No plain P, no send arrow, no fox here.

import React from 'react';
import Svg, { Circle, Line, Path } from 'react-native-svg';

const LETTER = '#F4F4F2';
const STROKE = 9;

function Letters() {
  // Heavy single-stroke letterforms: P round bowl, R straight
  // kicking leg, I thick bar, M middle about 60% down, E shorter
  // middle bar. Drawn as strokes so they read as solid filled
  // extra-bold lettering.
  return (
    <>
      {/* P */}
      <Path
        d="M18 52 V14 H34 Q50 14 50 26 Q50 38 34 38 H18"
        stroke={LETTER}
        strokeWidth={STROKE}
        fill="none"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      {/* R */}
      <Path
        d="M62 52 V14 H78 Q94 14 94 25 Q94 36 78 36 H62 M80 36 L96 52"
        stroke={LETTER}
        strokeWidth={STROKE}
        fill="none"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      {/* I */}
      <Path
        d="M110 14 H128 M119 14 V52 M110 52 H128"
        stroke={LETTER}
        strokeWidth={STROKE}
        fill="none"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      {/* M */}
      <Path
        d="M142 52 V14 L158 34 L174 14 V52"
        stroke={LETTER}
        strokeWidth={STROKE}
        fill="none"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      {/* E */}
      <Path
        d="M188 14 H214 M188 31 H206 M188 52 H214 M188 14 V52"
        stroke={LETTER}
        strokeWidth={STROKE}
        fill="none"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
    </>
  );
}

export function PrimeWayMark({ size = 160 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 232 232">
      <Circle cx="116" cy="116" r="114" fill="#0E0E11" />
      <Circle cx="116" cy="116" r="114" fill="none" stroke="#26262E" strokeWidth="2" />
      {/* PRIME, centred across the top half */}
      <Letters />
      {/* Road: straight, centred, symmetrical, clear gap below
          PRIME, widening to a broad base at the bottom. */}
      <Path d="M96 78 L136 78 L168 196 L64 196 Z" fill="#F4F4F2" />
      <Line
        x1="116"
        y1="92"
        x2="116"
        y2="186"
        stroke="#F4F4F2"
        strokeWidth="5"
        strokeDasharray="12 10"
        strokeLinecap="round"
      />
    </Svg>
  );
}
