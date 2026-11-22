// Generates every app icon from one SVG: the Flat-set knight (white on
// black, the Strategy Night look).
//   assets/icon.png + assets/icon.ico   desktop app / installer
//   public/favicon.svg                  browser tab
//   public/icon-192.png, icon-512.png   PWA install icons
//   public/icon-maskable-512.png        Android adaptive icon (extra padding)
//   public/apple-touch-icon.png         iOS home screen
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;

// Same knight as src/pieces.js (FLAT n), in a 0..100 box.
const KNIGHT = '<rect x="22" y="80" width="56" height="10" rx="2"/>'
  + '<path d="M30 80 C29 70 33 62 41 56 C35 58 28 59 23 56 C18.5 53 18 47.5 21 44 L31 32 C35 27 39 22.5 43 19.5 L45.5 9 L51.5 17 C63 18 74 28 76 44 C77 56 75.5 68 74.5 80 Z"/>'
  + '<rect x="27" y="73" width="46" height="7" rx="2"/>'
  + '<path d="M53 21 C63 25 69.5 34 70 47 C70.5 57 69.5 66 68.5 72" fill="none" stroke="#000" stroke-width="3.5"/>'
  + '<ellipse cx="40" cy="30" rx="3.2" ry="2" transform="rotate(-28 40 30)" fill="#000" stroke="none"/>';

// scale = how much of the tile the knight fills (maskable icons need a safe zone).
function iconSVG({ size, radius, scale }) {
  const k = size * scale;
  const off = (size - k) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#000"/>
  <g transform="translate(${off} ${off}) scale(${k / 100})" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round">${KNIGHT}</g>
</svg>`;
}

async function png(svg, size, out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
}

async function main() {
  const assets = path.join(__dirname, '..', 'assets');
  const pub = path.join(__dirname, '..', 'public');
  fs.mkdirSync(assets, { recursive: true });
  fs.mkdirSync(pub, { recursive: true });

  const rounded = iconSVG({ size: 512, radius: 112, scale: 0.72 });
  const square = iconSVG({ size: 512, radius: 0, scale: 0.72 });
  const maskable = iconSVG({ size: 512, radius: 0, scale: 0.56 });

  await png(rounded, 512, path.join(assets, 'icon.png'));
  await png(rounded, 256, path.join(assets, 'icon-256.png'));
  fs.writeFileSync(path.join(assets, 'icon.ico'), await pngToIco([path.join(assets, 'icon-256.png')]));

  fs.writeFileSync(path.join(pub, 'favicon.svg'), iconSVG({ size: 64, radius: 14, scale: 0.78 }));
  await png(rounded, 192, path.join(pub, 'icon-192.png'));
  await png(rounded, 512, path.join(pub, 'icon-512.png'));
  await png(maskable, 512, path.join(pub, 'icon-maskable-512.png'));
  await png(square, 180, path.join(pub, 'apple-touch-icon.png')); // iOS rounds it itself

  console.log('Icons written to assets/ and public/');
}

main().catch((err) => { console.error(err); process.exit(1); });
