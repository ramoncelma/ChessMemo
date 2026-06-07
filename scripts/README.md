# Static masters opening-book pipeline

The app's "GM weights" are computed from a static aggregated opening book
hosted as a GitHub Release. This directory holds the build pipeline.

## What gets built

For every position reached in any master game, up to a chosen depth, we
record `{ total: games-reached, counts: { SAN -> games-played-here } }`.
After pruning positions reached by fewer than `MIN_TOTAL` games, the
result is gzipped to one `masters.json.gz` blob plus a tiny
`masters-manifest.json` the app reads to detect updates.

FEN keys are normalised the same way the app normalises queries:
placement + side + castling + en-passant ("-"), no move counters.
Different move orders that reach the same position aggregate into the
same entry — exactly what we want for an opening book.

## Sample run

```
npm run build-masters-sample
```

Runs the pipeline on `test-fixtures/sample.pgn` (10 hand-crafted games),
writes the output to `test-fixtures/out/`. Use this to verify the
pipeline shape after any change.

## Full run

You need a Lichess Masters PGN dump. Two reasonable sources:

- `https://database.lichess.org/` — official, monthly dumps of all
  variants. Filter to standard masters.
- `https://database.nikonoel.fr/` — community-maintained masters-only
  dump, smaller download.

```
npm run build-masters /path/to/lichess_db_masters_2025-01.pgn ./out [--depth=30] [--min=10]
```

Defaults: `depth = 30 plies`, `min = 10 games`. Adjust as needed.

Expect the script to run in the ~hours range on a beefy laptop for the
full ~3.4 M-game dump. It logs throughput every 5 s so you can see if
something is wrong.

## Publishing a new version

1. Run the script with the latest PGN dump.
2. Tag a GitHub Release `masters-YYYY-MM-DD` on
   `ramoncelma/chessmemo`.
3. Upload `out/masters.json.gz` as the release asset.
4. Commit `out/masters-manifest.json` to the repo at
   `public/masters-manifest.json` so the app's GitHub Pages serves it.
   The app polls this file to detect available updates.

`manifest.url` is computed from the version stamp; double-check it
matches the release tag before publishing.
