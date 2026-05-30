# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev        # Vite dev server
npm run build      # tsc -b && vite build  (the project has no test runner)
npm run preview    # serve the production build
npm run typecheck  # tsc -b --noEmit
```

There is no test framework wired up; the build's TypeScript pass is the only static check. Always run `npm run build` after non-trivial changes — it catches both type errors and Vite issues.

## Deployment

`.github/workflows/deploy.yml` deploys to GitHub Pages on push to `claude/chess-spaced-repetition-app-bH1jZ`. The workflow sets `VITE_BASE=/<repo>/` so asset paths resolve under the project subpath; `vite.config.ts` reads that env var. There is no staging — pushes go straight to Pages.

## Architecture

ChessMemo is a 100% client-side React/TypeScript PWA. All data lives in the user's browser; there is no backend. Anything that touches "the network" goes from the user's browser directly to public, CORS-enabled APIs (Lichess, Chess.com, jsDelivr).

### The spaced-repetition unit is the *line*, not the position

The most important architectural invariant: SRS scheduling is per **line** (a complete root-to-leaf path through a chapter's PGN tree), not per move or per position. This was a refactor from an earlier per-position model — anywhere you see the word "card" in older notes/commits, the unit is now a `Line`.

Data model in `src/types.ts`:
- `Study` — a repertoire. Contains `chapters: Chapter[]`, `lines: Line[]`, `orientation`, and `categories: Speed[]` (which chess time controls this repertoire is for).
- `Chapter` — `{ name, pgn }`. The PGN is the source of truth; lines are derived from it.
- `Line` — a `LineMove[]` plus an SRS `Schedule`, attempts/misses counters, response-time arrays (per-line and per-move), an optional `paused` flag, and an optional `weight` (master-frequency %).

### Module responsibilities

- `src/pgnTree.ts` — Parses PGN to a tree (`parsePgn`), enumerates all complete lines (`enumerateLines`), merges two trees (`mergeTrees`), serializes a tree back to PGN with variations (`treeToPgn`). Tree merge + serialize underpin both Import-merge-into-chapter and the multi-line Manual Builder.
- `src/pgn.ts` — `buildLines(pgn, orientation, chapterIdx)` extracts trainee-side lines for a chapter.
- `src/srs.ts` — **Custom fixed-interval scheduler** (not FSRS, despite the dependency still being in `package.json`). Eight levels with intervals 8h / 2d / 5d / 2w / 1mo / 2mo / 3mo / 6mo. A clean line `promote()`s one level; any miss `resetLevel()`s to level 1 (8h). `RESPONSE_TIMEOUT_MS = 30_000` — anything slower than that counts as a miss.
- `src/storage.ts` — IndexedDB persistence via `idb-keyval`. `normalize()` migrates older shapes: legacy `pgn` string → `chapters: [{pgn}]`; missing `lines` → rebuilt with `buildLines` per chapter; missing `sched`/timing/`paused` fields → defaulted.
- `src/useStudies.ts` — The single source of truth for study mutation. All page components mutate via the methods returned here (`addStudy`, `addChapter`, `addToChapter`, `updateLine`, `setPaused`, `setLineWeights`, `pauseLowWeight`, …). Also exports the `LineItem` / `PositionItem` constructors (`lineItemsOf`, `chapterLineItems`, `dueLines`, `buildPositions`) — **these helpers filter out `paused` lines**, so paused lines are silently excluded from practice and the SRS calendar.
- `src/settings.ts` — `useSettings` persists to `localStorage` (separate from study data in IndexedDB) and applies `data-theme` on the `<html>` element. Owns Lichess/Chess.com usernames, opponent delay, language, theme, board appearance.
- `src/i18n.ts` — Provides `useT()` via React context. Dictionaries for `en`/`es`/`ca`/`pt`/`fr`/`de` keyed identically; missing keys fall back to English. `levelName()` / `levelInterval()` derive the funny names + intervals shown across the UI.
- `src/games.ts` — Lichess (NDJSON `/api/games/user/{user}`) and Chess.com (`/pub/player/{user}/games/archives` then monthly archives, PGNs parsed via chess.js) fetchers. `analyzeAll()` walks each game against each repertoire's SAN trie. Deviations before fullmove 3 are classified `"off"` (a different opening, not a mistake) per user requirement.
- `src/weights.ts` — Computes per-line "master frequency" weights by querying `https://explorer.lichess.ovh/masters` for every unique FEN in a study (in-memory cached, throttled ~150 ms between calls), then taking the product of conditional move probabilities and normalising within each chapter so weights sum to 100.
- `src/engine.ts` — `fetchEval(fen)` uses Lichess's Cloud Eval API (returns null when the position isn't in cache). Used by `EnginePanel` in both readers.
- `src/lichess.ts` — Just builds analysis URLs (`/analysis/pgn/...`); not a network call.
- `src/backup.ts` — Export/import of the user's entire dataset as a single JSON file (the IndexedDB keys above + the `localStorage` settings). Used by Settings → Practice to move data between devices, since there is no server-side sync.

### App shell and routing

`src/App.tsx` is the entire router — a `tab` state string plus a `DrillState` discriminated union for the focused drill experience. No react-router. There are two drill components:

- `pages/LineDrill.tsx` — Step through a whole line: opponent moves auto-play after `settings.opponentDelayMs`; the user plays only their side's moves. Tracks per-move response times, the 30-second timeout rule, hints (count as miss), and an end-of-session **backlog** that cycles missed/hinted lines until played cleanly (without re-grading the SRS). `freezeOnSuccess` makes "Practice again" a no-op on clean runs (only misses reset).
- `pages/PositionDrill.tsx` — Random single-position recognition game. Does not affect scheduling unless `settings.positionMissResetsLine` is on.

The Read tab has three nested views: `ReadList` → `ReadView` (line list + LineBrowser) → `ChapterReader` (tree navigation with `MoveTree`). The Repertoire tab is a wrapper that switches between `Import` (PGN paste) and `ManualBuilder` (play moves on a board, save multiple lines, merged into one tree at save time).

### Conventions

- All visible strings go through `t("key", params)`. When adding keys, add them to every language dict in `src/i18n.ts` (the `en` dict is the fallback so partial additions don't crash, but please keep all six in sync).
- SRS-affecting writes always go through `updateLine` / `setPaused` / `setLineWeights` etc. — never mutate `study.lines` directly.
- Schedule comparisons: `Schedule.due` is a millisecond timestamp (number), not a `Date`. `isDue` and time helpers take numbers; callers using `new Date()` must `.getTime()`.
- `Settings` (the local-storage object) is keyed by names that ship to users; renaming a field requires a migration in `useSettings` or a `normalize` step.
- Don't reintroduce per-position SRS — the migration in `storage.ts` is one-way (lines rebuilt from chapter PGNs lose any old per-card progress).
