// Generate Prime Way's app icons from the Pip SVG (same art as the
// prototype's appIcon). Run once: `node scripts/make-icons.cjs`.
// Requires `sharp` (devDependency). Outputs land in assets/.

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'assets');

const GRADIENT = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F07A35"/><stop offset="1" stop-color="#E8641C"/></linearGradient></defs>`;

const FACE = `
<path d="M58 72 L38 14 L98 42 L88 70 Z" fill="#8A3A08"/><path d="M142 72 L162 14 L102 42 L112 70 Z" fill="#8A3A08"/>
<path d="M52 32 L62 58 L78 50 Z" fill="#FFD9AE"/><path d="M148 32 L138 58 L122 50 Z" fill="#FFD9AE"/>
<path d="M52 66 L148 66 L158 96 L146 112 L152 120 L130 142 L100 166 L70 142 L48 120 L54 112 L42 96 Z" fill="#FFF7EA"/>
<ellipse cx="100" cy="140" rx="29" ry="19" fill="#FDEBD2"/>
<circle cx="80" cy="106" r="6.2" fill="#2B1A10"/><circle cx="120" cy="106" r="6.2" fill="#2B1A10"/>
<circle cx="82" cy="103.5" r="2" fill="#fff"/><circle cx="122" cy="103.5" r="2" fill="#fff"/>
<path d="M91 126 L109 126 Q103 138 100 138 Q97 138 91 126 Z" fill="#2B1A10"/>
<path d="M88 146 Q100 155 112 146" stroke="#2B1A10" stroke-width="5.5" fill="none" stroke-linecap="round"/>`;

const svg = (inner, size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200">${inner}</svg>`;

const full = svg(
  GRADIENT + '<rect width="200" height="200" rx="46" fill="url(#g)"/>' + FACE,
  1024,
);
// Foreground for Android adaptive icons: the face alone, centred with
// safe padding (the 200 box has room around the face already).
const foreground = svg(FACE, 1024);

async function main() {
  await sharp(Buffer.from(full)).png().toFile(path.join(OUT, 'icon.png'));
  await sharp(Buffer.from(full)).resize(48, 48).png().toFile(path.join(OUT, 'favicon.png'));
  await sharp(Buffer.from(foreground)).png().toFile(path.join(OUT, 'android-icon-foreground.png'));
  await sharp(Buffer.from(foreground)).png().toFile(path.join(OUT, 'android-icon-monochrome.png'));
  await sharp(Buffer.from(full)).resize(512, 512).png().toFile(path.join(OUT, 'splash-icon.png'));
  // Adaptive icon background: plain orange.
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 232, g: 100, b: 28, alpha: 1 } },
  })
    .png()
    .toFile(path.join(OUT, 'android-icon-background.png'));
  console.log('icons written to', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
