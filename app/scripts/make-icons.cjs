// Generate Prime Way's launcher icons from the PrimeWayMark
// (PRIME top, straight road underneath, clear gap below PRIME).
// Run: `node scripts/make-icons.cjs`
// Requires `sharp` (devDependency). Outputs land in assets/.
//
// Source of truth: src/components/PrimeWayMark.tsx — same letter
// paths, same road geometry, same gap. No fox anywhere: Pip is a
// mascot inside the app only, never the launcher icon.
// One correction vs PrimeWayMark.tsx as committed: the road's
// dashed centre line there is stroked #F4F4F2, the same colour as
// the road itself, so it is invisible. Here (and in the component,
// fixed in the same change) it is #0E0E11, so the dash actually
// reads as a road marking, as in the accepted 2026-11-12 design.

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'assets');

const LETTER = '#F4F4F2';
const INK = '#0E0E11';
const STROKE = 9;

// Letter paths copied exactly from PrimeWayMark.tsx (viewBox 232).
const LETTERS = `
  <path d="M18 52 V14 H34 Q50 14 50 26 Q50 38 34 38 H18" stroke="${LETTER}" stroke-width="${STROKE}" fill="none" stroke-linecap="square" stroke-linejoin="round"/>
  <path d="M62 52 V14 H78 Q94 14 94 25 Q94 36 78 36 H62 M80 36 L96 52" stroke="${LETTER}" stroke-width="${STROKE}" fill="none" stroke-linecap="square" stroke-linejoin="round"/>
  <path d="M110 14 H128 M119 14 V52 M110 52 H128" stroke="${LETTER}" stroke-width="${STROKE}" fill="none" stroke-linecap="square" stroke-linejoin="round"/>
  <path d="M142 52 V14 L158 34 L174 14 V52" stroke="${LETTER}" stroke-width="${STROKE}" fill="none" stroke-linecap="square" stroke-linejoin="round"/>
  <path d="M188 14 H214 M188 31 H206 M188 52 H214 M188 14 V52" stroke="${LETTER}" stroke-width="${STROKE}" fill="none" stroke-linecap="square" stroke-linejoin="round"/>
`;

// Road: straight, centred, symmetrical, clear gap below PRIME
// (PRIME baseline y=52, road top y=78), widening to a broad base.
const ROAD = `
  <path d="M96 78 L136 78 L168 196 L64 196 Z" fill="${LETTER}"/>
  <line x1="116" y1="92" x2="116" y2="186" stroke="${INK}" stroke-width="5" stroke-dasharray="12 10" stroke-linecap="round"/>
`;

function mark({ circle = true, mono = false, inverse = false } = {}) {
  if (mono) {
    // Android monochrome: white shapes only, no circle, no dash.
    return `
      <g fill="none" stroke="#FFFFFF" stroke-width="${STROKE}" stroke-linecap="square" stroke-linejoin="round">
        <path d="M18 52 V14 H34 Q50 14 50 26 Q50 38 34 38 H18"/>
        <path d="M62 52 V14 H78 Q94 14 94 25 Q94 36 78 36 H62 M80 36 L96 52"/>
        <path d="M110 14 H128 M119 14 V52 M110 52 H128"/>
        <path d="M142 52 V14 L158 34 L174 14 V52"/>
        <path d="M188 14 H214 M188 31 H206 M188 52 H214 M188 14 V52"/>
      </g>
      <path d="M96 78 L136 78 L168 196 L64 196 Z" fill="#FFFFFF"/>
    `;
  }
  if (inverse) {
    // Light variant: PRIME is wider than the circle at the top, so
    // white letters on a white square would spill off the black
    // badge and vanish. Inverse instead: black letters and road on
    // white, no circle, white dash on the black road.
    return `
      <g fill="none" stroke="${INK}" stroke-width="${STROKE}" stroke-linecap="square" stroke-linejoin="round">
        <path d="M18 52 V14 H34 Q50 14 50 26 Q50 38 34 38 H18"/>
        <path d="M62 52 V14 H78 Q94 14 94 25 Q94 36 78 36 H62 M80 36 L96 52"/>
        <path d="M110 14 H128 M119 14 V52 M110 52 H128"/>
        <path d="M142 52 V14 L158 34 L174 14 V52"/>
        <path d="M188 14 H214 M188 31 H206 M188 52 H214 M188 14 V52"/>
      </g>
      <path d="M96 78 L136 78 L168 196 L64 196 Z" fill="${INK}"/>
      <line x1="116" y1="92" x2="116" y2="186" stroke="#FFFFFF" stroke-width="5" stroke-dasharray="12 10" stroke-linecap="round"/>
    `;
  }
  return `
    ${circle ? `<circle cx="116" cy="116" r="114" fill="${INK}"/><circle cx="116" cy="116" r="114" fill="none" stroke="#26262E" stroke-width="2"/>` : ''}
    ${LETTERS}
    ${ROAD}
  `;
}

// Place the 232-box mark, scaled to `size`, centred in a `canvas`.
function svg({ canvas, size, bg = null, markOpts = {} }) {
  const off = (canvas - size) / 2;
  const scale = size / 232;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">
    ${bg ? `<rect width="${canvas}" height="${canvas}" fill="${bg}"/>` : ''}
    <g transform="translate(${off} ${off}) scale(${scale})">${mark(markOpts)}</g>
  </svg>`;
}

async function main() {
  // icon.png: black square, badge fills 920 of 1024.
  await sharp(Buffer.from(svg({ canvas: 1024, size: 920, bg: '#000000' }))).png().toFile(path.join(OUT, 'icon.png'));
  // icon-light.png: inverse black-on-white mark (see mark()).
  await sharp(Buffer.from(svg({ canvas: 1024, size: 920, bg: '#FFFFFF', markOpts: { inverse: true } }))).png().toFile(path.join(OUT, 'icon-light.png'));
  // favicon.png: same as icon, 512.
  await sharp(Buffer.from(svg({ canvas: 512, size: 460, bg: '#000000' }))).png().toFile(path.join(OUT, 'favicon.png'));
  // splash-icon.png: badge on transparent (splash bg is black in app.json).
  await sharp(Buffer.from(svg({ canvas: 1024, size: 920 }))).png().toFile(path.join(OUT, 'splash-icon.png'));
  // Android adaptive foreground: mark on transparent, sized to the
  // 66dp safe zone of the 108dp layer (~676 of 1024).
  await sharp(Buffer.from(svg({ canvas: 1024, size: 676 }))).png().toFile(path.join(OUT, 'android-icon-foreground.png'));
  // Android adaptive background: plain black.
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toFile(path.join(OUT, 'android-icon-background.png'));
  // Android monochrome: white PRIME+road on transparent.
  await sharp(Buffer.from(svg({ canvas: 1024, size: 676, markOpts: { mono: true } }))).png().toFile(path.join(OUT, 'android-icon-monochrome.png'));
  console.log('launcher icons written to', OUT);
}

main().catch((err) => { console.error(err); process.exit(1); });
