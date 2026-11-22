# Knightly

Learn chess, solve puzzles and play the computer. One codebase builds both a
web app (installable PWA, hosted on Vercel) and the Windows desktop app
(Electron, with the pop-out mini board).

Nine looks (Strategy Night by default), five piece sets, piece and board
colour options — all under **Look** in the sidebar or in **Settings**.

## npm Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (once, or after pulling changes) |
| `npm run dev` | Web app dev server with live reload (also reachable from your phone on the same Wi-Fi) |
| `npm run build` | Build the web app into `dist/` (this is what Vercel runs) |
| `npm run preview` | Serve the built `dist/` locally |
| `npm start` | Build, then launch the desktop app |
| `npm run electron:dev` | Desktop app against the running dev server (run `npm run dev` first) |
| `npm run electron:build` | Build the Windows installer into `release/` (`build:win` is the same) |

Content pipeline scripts (run as needed):

| Command | What it does |
|---|---|
| `npm run fetch-puzzles` | Refresh `public/data/puzzles.json` from Lichess |
| `npm run build-lessons` | Rebuild `public/data/lessons.json` (every move checked with chess.js) |
| `npm run build-icon` | Regenerate desktop and web app icons |

## Layout

- `src/` — app code (ES modules, bundled by Vite). `src/views/` holds the screens.
- `public/` — served as-is: Stockfish engine, lesson and puzzle data, icons.
- `main.js`, `preload*.js` — Electron shell. Loads `dist/` (or the dev server with `--dev`).
- Desktop saves to `settings.json` / `progress.json` in the app's user-data folder; the web app uses browser storage.

See the full [npm cheat sheet](../NPM-CHEATSHEET.md) for how this compares
to other projects.
