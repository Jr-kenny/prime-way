// Icons as inline SVG paths. No Unicode glyphs, no emoji, no text
// symbols anywhere in the UI: every icon here is drawn.

import React from 'react';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';

type IconProps = { size?: number; color?: string };

function Base({
  size = 24,
  color = '#000',
  children,
  filled,
}: IconProps & { children: React.ReactNode; filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'}>
      {children}
    </Svg>
  );
}

export function HomeIcon({ size, color }: IconProps) {
  return (
    <Base size={size} color={color} filled>
      <Path
        fillRule="evenodd"
        d="M11.3 2.7a1 1 0 0 1 1.4 0l8 7.2a1 1 0 0 1-.7 1.7H19v7.4a2 2 0 0 1-2 2h-3.5v-6h-3v6H7a2 2 0 0 1-2-2v-7.4H4a1 1 0 0 1-.7-1.7l8-7.2Z"
      />
    </Base>
  );
}

export function HistoryIcon({ size, color }: IconProps) {
  return (
    <Base size={size} color={color}>
      <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="2" />
      <Polyline points="12,7.5 12,12 15.5,14" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  );
}

export function SwapIcon({ size, color }: IconProps) {
  return (
    <Base size={size} color={color}>
      <Polyline points="7,4 7,16 4,13" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="17,20 17,8 20,11" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="7" y1="20" x2="17" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Line x1="7" y1="4" x2="17" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Base>
  );
}

export function ContactsIcon({ size, color }: IconProps) {
  return (
    <Base size={size} color={color} filled>
      <Path
        fillRule="evenodd"
        d="M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6.5 8.5c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5Z"
      />
    </Base>
  );
}

export function SettingsIcon({ size, color }: IconProps) {
  return (
    <Base size={size} color={color}>
      <Circle cx="12" cy="12" r="3.2" stroke={color} strokeWidth="2" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 12 + Math.cos(rad) * 6.2;
        const y1 = 12 + Math.sin(rad) * 6.2;
        const x2 = 12 + Math.cos(rad) * 8.6;
        const y2 = 12 + Math.sin(rad) * 8.6;
        return (
          <Line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2" strokeLinecap="round" />
        );
      })}
    </Base>
  );
}

export function ChevronRightIcon({ size = 20, color }: IconProps) {
  return (
    <Base size={size} color={color}>
      <Polyline points="9,5 16,12 9,19" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  );
}

export function ChevronLeftIcon({ size = 20, color }: IconProps) {
  return (
    <Base size={size} color={color}>
      <Polyline points="15,5 8,12 15,19" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  );
}

export function ArrowDownIcon({ size, color }: IconProps) {
  return (
    <Base size={size} color={color}>
      <Line x1="12" y1="4" x2="12" y2="19" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <Polyline points="6,13 12,19 18,13" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  );
}

export function ArrowUpRightIcon({ size, color }: IconProps) {
  return (
    <Base size={size} color={color}>
      <Line x1="6" y1="18" x2="18" y2="6" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <Polyline points="9,6 18,6 18,15" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  );
}

export function WalletIcon({ size, color }: IconProps) {
  return (
    <Base size={size} color={color}>
      <Path
        d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <Circle cx="17" cy="13.5" r="1.3" fill={color} />
    </Base>
  );
}

export function CheckIcon({ size = 18, color }: IconProps) {
  return (
    <Base size={size} color={color}>
      <Polyline points="4.5,12.5 9.5,17.5 19.5,6.5" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  );
}

export function CopyIcon({ size, color }: IconProps) {
  return (
    <Base size={size} color={color}>
      <Path
        d="M8 8h10a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 20H8a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 8 8Z"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <Path
        d="M16 5.5v-1A1.5 1.5 0 0 0 14.5 3h-9A1.5 1.5 0 0 0 4 4.5v9A1.5 1.5 0 0 0 5.5 15h1"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Base>
  );
}

export function WarningIcon({ size, color }: IconProps) {
  return (
    <Base size={size} color={color} filled>
      <Path
        fillRule="evenodd"
        d="M12 2.5 22 20.5H2L12 2.5Zm-1 6.5v5h2V9h-2Zm0 6.5v2h2v-2h-2Z"
      />
    </Base>
  );
}

export function PlusIcon({ size, color }: IconProps) {
  return (
    <Base size={size} color={color}>
      <Line x1="12" y1="5" x2="12" y2="19" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <Line x1="5" y1="12" x2="19" y2="12" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </Base>
  );
}
