# Knightly: handoff notes

Chess app: learn (Duolingo-style path), puzzles, play vs Stockfish. One codebase builds a **web app (PWA, Vercel)** and a **Windows desktop app (Electron)**. Owner: Alex. Working style: discuss the plan before building, then build and verify; commit only when asked.

## Status (v2.3.0, branch `v2-web`, not pushed or merged into `main`)
- Phases 1-4 committed (201e43d, 99eb00f, 1d803c4). **Phase 5 Supabase sync: code written, uncommitted.**
  - Signed-out behaviour verified in Electron. Row logic has unit tests (`npm test`).
  - **Not yet verified against the real cloud:** Alex has to run the SQL in `SUPABASE-SETUP.md` first. Then run the two-device test (see Testing).
- Sync design: one table `knightly_items` (user_id, kind, key, data, deleted, client_at, updated_at) in the **WorkLog Supabase project** (`uhlbrxyvhfmfeakckzlu`, same as Vetted).
  - RLS: own rows only, not worklog_members.
  - `knightly_push(items)` RPC: the server keeps the row with the highest client_at.
  - Realtime on the table, plus a catch-up pull by updated_at.
- Next: SQL run, then two-device e2e, commit. Then Vercel: push `v2-web`, Alex imports the GitHub repo in the Vercel dashboard (no Vercel CLI on this PC; Coin/NutriLog deploy via GitHub). Password sign-in needs no Supabase redirect URLs.

## Commands
`npm run dev` (web dev server) · `npm run build` (-> `dist/`, what Vercel runs) · `npm run preview` · `npm start` (build + desktop) · `npm run electron:dev` · `npm run electron:build` (installer -> `release/`) · `npm run build-course` (validates + writes `public/data/course.json`) · `npm test` (row/sync unit tests, node:test) · `build-lessons`, `fetch-puzzles`, `build-icon`.

## Layout
- `src/` ES modules bundled by Vite. `app.js` core (settings, progress, routing, shell) · `main.js` entry + view registry · `platform.js` storage (Electron files on desktop, localStorage on web) · `engine.js` chess.js game store · `board.js` ChessBoard (+ `boardThumb`, marks, arrows, tap mode) · `pieces.js` 5 SVG piece sets · `theme.js` skins/board/piece colours · `look-picker.js` · `content.js` lessons/puzzles/course loaders + unlock rules · `streak.js` · `review.js` · `sound.js` · `ai.js` (Stockfish worker).
- Sync: `rowsShape.js` (pure progress<->rows, diff, merge; tested) · `sync.js` (engine; local state lives in `progress._sync` = rows + dirty ids + deviceId + uid + clock) · `cloud.js` (Supabase client, lazy-loaded only when signed in; session key `knightly-auth`). `App.getProgress()` returns ONE object for the session; remote changes are copied into it in place.
- `src/views/` one file per screen. `course.js` = the shared full-screen exercise player used by Learn lessons AND Review sessions.
- `public/` served as-is: `stockfish/`, `data/{course,lessons,puzzles}.json`, icons. `main.js`/`preload*.js` = Electron shell (loads `dist/`, `--dev` uses the dev server). `mini.html` + `src/mini.js` = desktop-only pop-out board.
- A new view needs: render fn, entry in `App.views` in `src/main.js` (`focus` hides the stats column, `live` means it is never re-rendered on a look change).

## Decisions already made (don't re-litigate)
- Look: default skin **Strategy Night** (black/white, Anton caps, from the Dribbble "Brutalism meets Strategy" reference). 9 skins; user ranked Strategy Night > Brutal = Midnight. No NutriLog Aura colours. Default pieces **Flat**, default board **Green**. Original SVG piece sets only (Flat, Soft, Staunton, Modern, Letter); never copy Duolingo/Vecteezy/Dribbble art. Knight has only an eye + mane line (no nostril/mouth).
- No lives. Unlimited practice. Streak: 1 lesson or 10 new puzzles per local day; one auto freeze per week. Daily XP goal 20/50/100 (default 50).
- Learn: 5 units, 27 lessons, 139 exercises; unit N+1 opens when unit N's checkpoint is passed; lessons inside an open unit in any order. `scripts/build-course.js` validates every FEN/move/answer with chess.js and fails the build on errors; keep it that way when adding content.
- Review: miss -> due tomorrow; first-try correct -> 3, 7, 21 days, then learned; miss -> back to tomorrow (counted instantly). Early practice never advances items. Data in `progress.review`; puzzle refs are `pz:<id>`.
- Progress shape lives in `App.defaultProgress()` (`src/app.js`); migrations go in `getProgress()`.

## Sync decisions (phase 5, don't re-litigate)
- WorkLog Supabase project like Vetted, sign in with the WorkLog account (email + password). Sign-in is **optional**; the app works fully signed out.
- Synced settings: everything except `sound` and `miniAlwaysOnTop` (per device). Migrations of settings save locally only.
- Counters (XP, wins/losses/draws, puzzles today, reviews, learned, active days) live in **per-device rows** (`count` kind, key `<date>|<deviceId>` or `base|<deviceId>`); totals are sums. Diffs turn counter increases into increments on this device's row for today; decreases are ignored (reset uses `App.resetProgress()` which tombstones rows).
- Streak is **derived** from active days (`computeStreak` in streak.js): one missed day between active days is frozen, once per week. Not stored.
- Lessons merge field by field (max best/plays, min first, max last). Review items, settings and puzzle meta: latest client_at wins. Puzzles, classic lessons and events are add-only. History entries have random ids.
- First sign-in on an install uploads its local progress (merged with the cloud). Signing in as a different account than last time replaces local progress with that account's.

## Testing gotchas (Windows, VS Code)
- Debug hook: `localStorage.knightly_debug = '1'` exposes `window.__knightly = { App, Sync }` for Electron test scripts (`Sync.debugClient()` gives the Supabase client).
- Two-device sync test: two BrowserWindows with separate `partition`s on `vite preview`. Network offline via `session.enableNetworkEmulation({ offline: true })`. Only run it against an account with no Knightly rows yet: it hard-deletes everything at the end. The script used last time lives in the session scratchpad (may be gone); rebuild it from this description.
- Electron `capturePage` returns stale frames unless the window has `backgroundThrottling: false` (and `webContents.invalidate()` before capture).
- No browser tool: tests drive the built app in an Electron window (`vite preview` on :4173, `webContents.executeJavaScript`, `sendInputEvent` for real clicks, `capturePage` for screenshots).
- Electron must run **outside the tool sandbox** (`dangerouslyDisableSandbox`) and with **`ELECTRON_RUN_AS_NODE` unset** (VS Code sets it).
- **Never pass a URL as a CLI arg** to electron.exe (it opens it instead of your script); hardcode it in the script. Launch with `& electron.exe script.cjs` in PowerShell and poll a trace file; stdout does not come back.
- Frameless pop-out window screenshots fail (`UnknownVizError`); check its DOM instead.
- Files here are CRLF: multi-line `Edit` strings can miss in files written by older tools; prefer small single-line anchors. Stop any background `vite preview` when finished.

## Known gaps
- Desktop installer (`electron:build`) not tested; desktop app was tested in dev (loads `dist/`, pop-out board OK).
- XP ranks (Pawn..King) are cosmetic. Vercel project not yet created/deployed.
