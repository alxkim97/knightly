# Knightly

Chess app — drag-and-drop moves, premove vs computer, right-click
arrow/circle annotations, responsive layout.

## npm Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (once, or after pulling changes) |
| `npm run dev` | Launch the app in dev mode |
| `npm start` | Launch the app normally |
| `npm run build` / `build:win` | Build a Windows installer (same command) |

Content pipeline scripts (run as needed, not part of normal dev):

| Command | What it does |
|---|---|
| `npm run fetch-puzzles` | Fetch puzzle data |
| `npm run build-lessons` | Build lesson content |
| `npm run build-icon` | Regenerate the app icon |

See the full [npm cheat sheet](../NPM-CHEATSHEET.md) for how this compares
to other projects.
