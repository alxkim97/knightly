# Knightly: handoff notes

Chess app: learn (Duolingo-style path), puzzles, play vs Stockfish. One codebase builds a **web app (PWA, Vercel)** and a **Windows desktop app (Electron)**. Owner: Alex. Working style: discuss the plan before building, then build and verify; commit only when asked.

## Status (v2.4.0 in the working tree, uncommitted; v2.3.0 sync is on `main` and deployed on Vercel)
- Phase 5 Supabase sync done and verified (two-device test). `SUPABASE-SETUP.md` SQL has been run in the WorkLog project (needs the `grant ... to authenticated` line; run it in the **worklog** project, not lifelog).
- v2.4.0 (this session, not committed): play-screen overhaul.
  - Pass-and-play and vs-computer screens: bigger board with a per-device size slider (`settings.boardScale`, device-only), a "Pieces" quick picker (closes on outside click), Soft pieces default, "Alex Kim" next to the version, Look button removed from rail and top bar, macOS-style overlay scrollbars, pinch/double-tap zoom locked off on mobile.
  - Promotion chooser (board.js `_askPromotion`; premoves still auto-queen).
  - Human-like thinking pauses (`thinkDelay` in ai.js, per level).
  - Result screen overlay; Resign now shows it instead of leaving.
  - Automatic game review after every vs-computer game: `analysis.js` (Stockfish at full strength, 220 ms/position, grades by win-chance lost: best/good/inaccuracy/mistake/blunder, accuracy %, rule-based plain-English explanations from chess.js + the engine lines), `views/review-panel.js`, `views/gamereview.js` (saved games). The job survives leaving the game screen and still saves the summary.
  - Habits: finished games are stored as `progress.games` (synced as `game` rows). `insights.js` + `views/insights.js` ("Your play", reached from Play) give stats, where points are lost by phase, thinking-time habits, openings and up to 5 tips.
  - Tests: `npm test` = 14 tests (rows, analysis, insights).
- Not verified: the desktop installer; the new screens on a real phone; review speed on a slow device.
- Rejected: Vecteezy chess set (decision: original piece art only).
- Sync design: one table `knightly_items` (user_id, kind, key, data, deleted, client_at, updated_at) in the **WorkLog Supabase project** (`uhlbrxyvhfmfeakckzlu`, same as Vetted).
  - RLS: own rows only, not worklog_members.
  - `knightly_push(items)` RPC: the server keeps the row with the highest client_at.
  - Realtime on the table, plus a catch-up pull by updated_at.
- Next: commit v2.4.0 when Alex says so, push `main` (Vercel redeploys), rebuild desktop (`npm run electron:build`), sign in on real devices (first sign-in uploads local progress).

## Desktop updates (v2.5.0, uncommitted)
- Same scheme as Vetted: electron-updater reads GitHub Releases of the (now **public**) `alxkim97/knightly` repo (`build.publish` in package.json). Main process in `main.js` (checks 8 s after launch, then every 6 h, packaged builds only), UI in Settings -> App updates (`src/updates.js`, works for desktop and web).
- The app lives in the tray, so install is via the "Restart to update" button (`quitAndInstall`), not on quit.
- Release flow: bump `version`, `npm run release` (builds with `--publish never`, then `scripts/publish-release.js` uploads `Knightly-Setup-X.exe`, `.blockmap`, `latest.yml` with `gh`). gh is logged in as alxkim97 at `C:\Program Files\GitHub CLI\gh.exe`.
- 2.3.0 and older installs have no updater: install 2.5.0 by hand once; later versions update in place.
- Not yet verified: a real update (needs 2.5.0 published, then a 2.5.1 release).

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
- Games (`kind: game`) are add/update/delete rows: the review summary is attached later by updating the same row; undo after a finished game deletes it.
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
