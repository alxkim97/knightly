const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1c2230"/>
      <stop offset="1" stop-color="#2a3350"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <text x="256" y="382" font-size="380" text-anchor="middle"
        font-family="Segoe UI Symbol, DejaVu Sans, Arial, sans-serif"
        fill="#f3f5fa">&#9822;</text>
</svg>`;

async function main() {
  const assetsDir = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const svgBuffer = Buffer.from(svg);
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(assetsDir, 'icon.png'));
  await sharp(svgBuffer).resize(256, 256).png().toFile(path.join(assetsDir, 'icon-256.png'));

  const icoBuffer = await pngToIco([path.join(assetsDir, 'icon-256.png')]);
  fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoBuffer);

  console.log('Wrote assets/icon.png, icon-256.png, icon.ico');
}

main().catch((err) => { console.error(err); process.exit(1); });
