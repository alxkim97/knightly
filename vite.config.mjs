import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

export default defineConfig({
  // Relative asset paths: fine on Vercel from '/', and required for the
  // Electron build, which loads dist/index.html straight off disk (file://
  // can't resolve root-absolute '/assets/...').
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    rolldownOptions: {
      // mini.html is the desktop-only pop-out board; the web app never links to it.
      input: { main: 'index.html', mini: 'mini.html' },
    },
  },
  server: {
    host: true, // reachable from a phone on the same Wi-Fi during dev
    watch: { ignored: ['**/release/**', '**/dist/**'] },
  },
  plugins: [
    VitePWA({
      registerType: 'prompt', // src/main.js applies updates between screens, never mid-game
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Knightly',
        short_name: 'Knightly',
        description: 'Learn chess, solve puzzles and play the computer.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Stockfish (~600 kB wasm) and the lesson/puzzle data are precached
        // so play, puzzles and lessons all work offline once installed.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2,wasm,json}'],
        globIgnores: ['**/mini.html', '**/assets/mini-*.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
