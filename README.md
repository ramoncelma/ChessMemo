# ChessMemo

An iOS app for memorizing chess content from PGN files using spaced repetition,
with on-demand Stockfish analysis. Inspired by Chessbook, but extended to handle
three distinct kinds of PGN content in dedicated menus.

This repo is the **prototype skeleton** — it compiles, runs in the simulator,
exercises the architecture end-to-end, and has tests for the non-trivial parts
(PGN parser, FSRS scheduler, drill engine). Polish, full chess rules, and the
bundled Stockfish binary are explicit TODOs (see *Known gaps* below).

---

## Decisions captured from the spec interview

| Topic | Decision |
| --- | --- |
| Content types | Three top-level menus: **Repertoires**, **Full Games**, **Tactics** |
| Drill direction | Per-menu: Repertoire = user picks side, app plays opponent. Games = both sides. Tactics = side to move. |
| SRS algorithm | **FSRS** (v4-style, four-rating: `Again`/`Hard`/`Good`/`Easy`) |
| On wrong move | Configurable: `showMove` / `showMoveAndComment` / `autoLecture`, plus retry count |
| Stockfish | On-device bundled binary (UCI over stdio) |
| Storage | Local only, SwiftData |
| Distribution | Undecided — kept GPL-aware (Stockfish is GPL, see *Licensing*) |

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  ChessMemo (iOS app target, SwiftUI)                     │
│  Views ─ DrillView, LectureView, AnalysisView, BoardView │
│  Persistence ─ SwiftData (Repertoire, Card, ReviewLog)   │
└─────────────────────┬────────────────────────────────────┘
                      │ depends on
┌─────────────────────▼────────────────────────────────────┐
│  ChessMemoCore (Swift Package — pure logic, testable)    │
│  PGN/      Tokenizer + recursive-descent parser → tree   │
│  Chess/    Board, Move, SAN encode/decode (minimal)      │
│  SRS/      FSRS scheduler + Card state machine           │
│  Drill/    DrillSession — selects next card, judges move │
│  Engine/   UCIEngine protocol + StockfishProcess adapter │
└──────────────────────────────────────────────────────────┘
```

### Why a separate Swift Package?

- Logic is testable on `swift test` without a simulator.
- The PGN parser and FSRS implementation are the parts most likely to grow;
  isolating them keeps the app target thin.
- A future macOS or web companion can reuse the package.

---

## Drill flow (the part that really matters)

1. User picks a menu → picks a repertoire/game/tactic → taps **Drill**.
2. `DrillEngine` asks FSRS for the next due `Card`. A card is keyed by:
   - `(repertoireId, fenAfterPreviousMove, expectedMoveSAN, color)`
3. App replays the line up to that position on the board.
4. User makes a move on the board.
5. `DrillEngine.judge(move:)` returns:
   - `.correct` → ask FSRS for next interval, advance to next card.
   - `.incorrect` → consume a retry if `maxRetries > 0`. On final failure,
     branch on `AppSettings.onFailure`:
     - `showMove` — flash the correct move, continue.
     - `showMoveAndComment` — flash correct move + PGN comment inline.
     - `autoLecture` — push `LectureView` rooted at the failed node.
6. After the line is finished (or on failure), card is rescheduled with rating
   `Again` (failure), `Hard`/`Good`/`Easy` (success — currently auto-rated
   `Good` on first-try success, `Hard` if retries were used; a tap-to-rate UI
   is a TODO).

Lecture mode is the same view tree as drill, just non-interactive: it walks
the variation tree, surfaces NAGs and `{comments}`, and lets the user step
through any branch. Switching to/from lecture preserves the current node.

---

## Repository layout

```
.
├── README.md                      ← you are here
├── project.yml                    ← XcodeGen spec to (re)generate the .xcodeproj
├── ChessMemoCore/                 ← Swift Package
│   ├── Package.swift
│   ├── Sources/ChessMemoCore/
│   │   ├── PGN/
│   │   ├── Chess/
│   │   ├── SRS/
│   │   ├── Drill/
│   │   └── Engine/
│   └── Tests/ChessMemoCoreTests/
└── ChessMemo/                     ← iOS app target
    ├── ChessMemoApp.swift
    ├── ContentView.swift
    ├── Models/
    ├── Views/
    └── Resources/
```

## How to build

You need macOS + Xcode 15.4 or later.

```bash
# 1. Generate the Xcode project from project.yml
brew install xcodegen
xcodegen generate

# 2. Run core tests (works on macOS or Linux)
cd ChessMemoCore && swift test

# 3. Open and run the iOS app
open ../ChessMemo.xcodeproj
```

---

## Known gaps (intentional, scoped for prototype)

1. **Chess move legality.** `Chess/Board.swift` tracks piece positions and
   accepts move-by-move replay from parsed PGN SAN, but does **not** validate
   pseudo-legal/legal moves for arbitrary user input. For the drill prototype
   we compare the user's tap-to-tap input against the expected SAN; full
   legality should come from integrating
   [`chesskit-app/chesskit-swift`](https://github.com/chesskit-app/chesskit-swift)
   (add as SwiftPM dependency in `project.yml`). Marked `// TODO(chess-rules)`.
2. **Stockfish binary.** `Engine/StockfishProcess.swift` speaks UCI but the
   binary is not bundled. Build Stockfish for iOS (arm64) and drop it at
   `ChessMemo/Resources/stockfish`. On iOS, `Process` is unavailable in
   sandboxed apps — the real adapter needs to use `posix_spawn` against a
   binary linked into the app, or compile Stockfish as a static library and
   call into it via a thin C++ bridge. The protocol is in place; the
   implementation is a stub returning a fixed evaluation.
3. **SwiftData migrations.** Models are versioned via `@Model` but no
   migration plan is set up yet.
4. **No iCloud sync, no accounts.** Per spec.
5. **Auto-rating in FSRS.** The four-button rating UI (Again/Hard/Good/Easy)
   is not surfaced yet; the engine auto-rates based on retries used.

---

## Licensing

Stockfish is GPLv3. If this app is ever distributed via the App Store, either:
- Open-source the entire app under a GPL-compatible licence, or
- Replace Stockfish with a non-copyleft engine (e.g. Leela's BSD bits, or a
  network-only eval like Lichess cloud).

No licence file is checked in yet because the distribution model is undecided.
