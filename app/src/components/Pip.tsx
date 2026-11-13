// Pip the fox, the Prime Way mascot. Ported from the flow prototype
// (index.html): same flat vector art, same four expressions.
// Charming, never childish.

import React from 'react';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

export type PipExpression = 'happy' | 'thinking' | 'celebrating' | 'apologetic';

const EYES: Record<PipExpression, React.ReactNode> = {
  happy: (
    <G>
      <Ellipse cx="72" cy="98" rx="6.8" ry="8" fill="#241509" />
      <Circle cx="74.6" cy="94.8" r="2.3" fill="#fff" />
      <Ellipse cx="128" cy="98" rx="6.8" ry="8" fill="#241509" />
      <Circle cx="130.6" cy="94.8" r="2.3" fill="#fff" />
    </G>
  ),
  thinking: (
    <G>
      <Ellipse cx="69" cy="94" rx="6.8" ry="8" fill="#241509" />
      <Circle cx="71.6" cy="90.8" r="2.3" fill="#fff" />
      <Ellipse cx="125" cy="94" rx="6.8" ry="8" fill="#241509" />
      <Circle cx="127.6" cy="90.8" r="2.3" fill="#fff" />
      <Path d="M52 80 L86 84" stroke="#241509" strokeWidth="4.5" strokeLinecap="round" />
    </G>
  ),
  celebrating: (
    <G>
      <Path d="M58 100 Q72 86 86 100" stroke="#241509" strokeWidth="6" fill="none" strokeLinecap="round" />
      <Path d="M114 100 Q128 86 142 100" stroke="#241509" strokeWidth="6" fill="none" strokeLinecap="round" />
    </G>
  ),
  apologetic: (
    <G>
      <Ellipse cx="72" cy="104" rx="6.2" ry="7.4" fill="#241509" />
      <Ellipse cx="128" cy="104" rx="6.2" ry="7.4" fill="#241509" />
      <Path d="M54 84 L86 92" stroke="#241509" strokeWidth="4.5" strokeLinecap="round" />
      <Path d="M146 84 L114 92" stroke="#241509" strokeWidth="4.5" strokeLinecap="round" />
    </G>
  ),
};

const MOUTHS: Record<PipExpression, React.ReactNode> = {
  happy: (
    <Path d="M86 140 Q100 152 114 140" stroke="#241509" strokeWidth="5" fill="none" strokeLinecap="round" />
  ),
  thinking: (
    <Path d="M88 144 Q100 141 112 144" stroke="#241509" strokeWidth="5" fill="none" strokeLinecap="round" />
  ),
  celebrating: (
    <G>
      <Path d="M84 136 Q100 158 116 136 Q100 145 84 136 Z" fill="#241509" />
      <Ellipse cx="100" cy="147" rx="6.5" ry="3.6" fill="#E2707A" />
    </G>
  ),
  apologetic: (
    <Path d="M88 148 Q94 142 100 148 Q106 154 112 148" stroke="#241509" strokeWidth="4.5" fill="none" strokeLinecap="round" />
  ),
};

export function Pip({
  expression,
  size = 120,
}: {
  expression: PipExpression;
  size?: number;
}) {
  const droop = expression === 'apologetic';
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      {/* bushy tail curled behind, right side, cream tip */}
      <Path
        d="M138 168 C182 166 198 128 184 92 C196 138 182 182 128 188 C120 189 118 176 128 172 Z"
        fill="#C24E10"
      />
      <Path d="M184 92 C190 112 188 134 178 150 C186 128 184 108 176 96 Z" fill="#FFF3E2" />
      {droop ? (
        <G>
          <Path d="M56 66 L16 58 L40 18 Z" fill="#D95A12" />
          <Path d="M40 18 L16 58 L34 52 Z" fill="#5C2E12" />
          <Path d="M44 34 L32 54 L50 50 Z" fill="#FFC79A" />
          <Path d="M144 66 L184 58 L160 18 Z" fill="#D95A12" />
          <Path d="M160 18 L184 58 L166 52 Z" fill="#5C2E12" />
          <Path d="M156 34 L168 54 L150 50 Z" fill="#FFC79A" />
        </G>
      ) : (
        <G>
          <Path d="M54 60 L30 2 L92 30 L80 58 Z" fill="#E8641C" />
          <Path d="M30 2 L44 30 L58 24 Z" fill="#5C2E12" />
          <Path d="M42 18 L50 44 L66 36 Z" fill="#FFC79A" />
          <Path d="M146 60 L170 2 L108 30 L120 58 Z" fill="#E8641C" />
          <Path d="M170 2 L156 30 L142 24 Z" fill="#5C2E12" />
          <Path d="M158 18 L150 44 L134 36 Z" fill="#FFC79A" />
        </G>
      )}
      {/* head, angular, with spiky cheek fur */}
      <Path
        d="M48 58 L152 58 L164 90 L150 108 L158 118 L134 142 L100 172 L66 142 L42 118 L50 108 L36 90 Z"
        fill="#F07A35"
      />
      <Path d="M48 58 L152 58 L158 76 L42 76 Z" fill="#E8641C" opacity={0.45} />
      {/* cream muzzle / chin patch */}
      <Path
        d="M100 106 C124 106 142 118 141 134 C140 152 122 168 100 172 C78 168 60 152 59 134 C58 118 76 106 100 106 Z"
        fill="#FFF6E8"
      />
      {/* cheek shading */}
      <Path d="M44 108 L58 130 L50 136 L38 116 Z" fill="#FFF6E8" opacity={0.8} />
      <Path d="M156 108 L142 130 L150 136 L162 116 Z" fill="#FFF6E8" opacity={0.8} />
      {EYES[expression]}
      {/* long fox nose */}
      <Path d="M88 122 L112 122 Q106 136 100 136 Q94 136 88 122 Z" fill="#241509" />
      <Ellipse cx="95" cy="125" rx="3.4" ry="2" fill="#fff" opacity={0.35} />
      {MOUTHS[expression]}
      {expression === 'thinking' && (
        <G>
          <Ellipse cx="172" cy="46" rx="17" ry="13" fill="#fff" stroke="#E4D5C2" strokeWidth="2.5" />
          <Circle cx="159" cy="61" r="5" fill="#fff" stroke="#E4D5C2" strokeWidth="2.5" />
          <Circle cx="151" cy="71" r="3" fill="#fff" stroke="#E4D5C2" strokeWidth="2" />
          <Circle cx="165" cy="46" r="2.4" fill="#B99B7E" />
          <Circle cx="172" cy="46" r="2.4" fill="#B99B7E" />
          <Circle cx="179" cy="46" r="2.4" fill="#B99B7E" />
        </G>
      )}
      {expression === 'celebrating' && (
        <G strokeLinecap="round" strokeWidth="4.5">
          <Path d="M14 58 l9 -6" stroke="#F5A524" />
          <Path d="M186 58 l-9 -6" stroke="#E8641C" />
          <Path d="M8 104 l11 -1" stroke="#0E9F8A" />
          <Path d="M192 104 l-11 -1" stroke="#F5A524" />
          <Path d="M24 30 l6 8" stroke="#0E9F8A" />
          <Path d="M176 30 l-6 8" stroke="#F5A524" />
        </G>
      )}
      {expression === 'apologetic' && (
        <Path d="M172 82 Q181 97 172 106 Q163 97 172 82 Z" fill="#7FC8E8" />
      )}
    </Svg>
  );
}

/** The app icon: Pip's face on the warm orange tile. */
export function AppIconSvg({ size = 200 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Path d="M0 46 Q0 0 46 0 H154 Q200 0 200 46 V154 Q200 200 154 200 H46 Q0 200 0 154 Z" fill="#E8641C" />
      <Path d="M58 72 L38 14 L98 42 L88 70 Z" fill="#8A3A08" />
      <Path d="M142 72 L162 14 L102 42 L112 70 Z" fill="#8A3A08" />
      <Path d="M52 32 L62 58 L78 50 Z" fill="#FFD9AE" />
      <Path d="M148 32 L138 58 L122 50 Z" fill="#FFD9AE" />
      <Path
        d="M52 66 L148 66 L158 96 L146 112 L152 120 L130 142 L100 166 L70 142 L48 120 L54 112 L42 96 Z"
        fill="#FFF7EA"
      />
      <Ellipse cx="100" cy="140" rx="29" ry="19" fill="#FDEBD2" />
      <Circle cx="80" cy="106" r="6.2" fill="#2B1A10" />
      <Circle cx="120" cy="106" r="6.2" fill="#2B1A10" />
      <Circle cx="82" cy="103.5" r="2" fill="#fff" />
      <Circle cx="122" cy="103.5" r="2" fill="#fff" />
      <Path d="M91 126 L109 126 Q103 138 100 138 Q97 138 91 126 Z" fill="#2B1A10" />
      <Path d="M88 146 Q100 155 112 146" stroke="#2B1A10" strokeWidth="5.5" fill="none" strokeLinecap="round" />
    </Svg>
  );
}
