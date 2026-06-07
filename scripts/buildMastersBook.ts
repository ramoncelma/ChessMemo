#!/usr/bin/env tsx
/**
 * Build the static Lichess Masters opening book.
 *
 * Streams a Lichess Masters PGN dump, parses each game manually (faster
 * than chess.js's `loadPgn` because we skip the round-trip validation
 * Lichess has already done), walks each game to MAX_DEPTH plies, and
 * aggregates per-FEN move counts. Positions with fewer than MIN_TOTAL
 * games are pruned. The aggregated book is gzipped and a manifest is
 * written alongside it for the app to pick up.
 *
 * Usage:
 *   tsx scripts/buildMastersBook.ts <input.pgn> <output-dir> [--depth=N] [--min=N]
 *
 * Tunables (env or CLI override):
 *   MAX_DEPTH (default 30)  — number of plies to record per game.
 *   MIN_TOTAL (default 10)  — prune positions reached by fewer games.
 *
 * Output:
 *   <output-dir>/masters.json.gz       — the book
 *   <output-dir>/masters-manifest.json — version metadata for the app
 */

import { Chess } from "chess.js";
import { createReadStream, createWriteStream, mkdirSync, statSync } from "fs";
import { writeFile } from "fs/promises";
import { createGzip } from "zlib";
import { createInterface } from "readline";
import { join } from "path";
import { Readable } from "stream";

// ---- Config -----------------------------------------------------------------

function getArgs() {
  const argv = process.argv.slice(2);
  const positional: string[] = [];
  let depth = Number(process.env.MAX_DEPTH ?? 30);
  let min = Number(process.env.MIN_TOTAL ?? 10);
  for (const a of argv) {
    if (a.startsWith("--depth=")) depth = Number(a.slice("--depth=".length));
    else if (a.startsWith("--min=")) min = Number(a.slice("--min=".length));
    else positional.push(a);
  }
  if (positional.length < 2) {
    console.error(
      "Usage: tsx scripts/buildMastersBook.ts <input.pgn> <output-dir> " +
        "[--depth=N] [--min=N]",
    );
    process.exit(1);
  }
  return { inputPath: positional[0], outDir: positional[1], depth, min };
}

const { inputPath, outDir, depth: MAX_DEPTH, min: MIN_TOTAL } = getArgs();

// ---- Aggregation ------------------------------------------------------------

interface Entry {
  total: number;
  counts: Map<string, number>;
}

const book = new Map<string, Entry>();

// Same normalisation the app uses when querying Lichess: keep placement,
// side, castling, drop en-passant and the move counters. Two PGNs that
// reach "the same position" via different move orders therefore key the
// same entry, which is exactly what we want for an opening book.
function normalizeFen(fen: string): string {
  const parts = fen.split(" ");
  if (parts.length < 4) return fen;
  return `${parts[0]} ${parts[1]} ${parts[2]} -`;
}

// Lichess Masters PGNs are very clean — no comments, no variations — but
// we still tokenise defensively so an oddball game can't poison the run.
function extractSanTokens(movetext: string): string[] {
  // Strip comments {...} and variations (...). Lichess masters dumps
  // shouldn't have these but better safe than sorry. This regex pass
  // assumes no nesting; for masters PGNs that's true.
  let s = movetext.replace(/\{[^}]*\}/g, "");
  s = s.replace(/\([^)]*\)/g, "");
  // Strip move numbers ("1.", "23.", "23...") and game-result markers.
  s = s.replace(/\d+\.+/g, "");
  s = s.replace(/\$\d+/g, ""); // numeric annotation glyphs
  s = s.replace(/(?:1-0|0-1|1\/2-1\/2|\*)/g, "");
  return s.split(/\s+/).filter((t) => t.length > 0);
}

function processGame(pgn: string) {
  // Split headers (lines starting with "[") from movetext.
  const lines = pgn.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].startsWith("[")) i++;
  // Optional blank line separator.
  while (i < lines.length && lines[i].trim() === "") i++;
  const movetext = lines.slice(i).join(" ");
  const sans = extractSanTokens(movetext);
  if (sans.length === 0) return;

  const ch = new Chess();
  const limit = Math.min(sans.length, MAX_DEPTH);
  for (let p = 0; p < limit; p++) {
    const san = sans[p];
    const fenBefore = normalizeFen(ch.fen());
    let entry = book.get(fenBefore);
    if (!entry) {
      entry = { total: 0, counts: new Map() };
      book.set(fenBefore, entry);
    }
    entry.total++;
    entry.counts.set(san, (entry.counts.get(san) ?? 0) + 1);
    try {
      ch.move(san);
    } catch {
      // illegal SAN — abandon the rest of this game.
      return;
    }
  }
}

// ---- Main -------------------------------------------------------------------

async function main() {
  mkdirSync(outDir, { recursive: true });

  const sizeBytes = statSync(inputPath).size;
  console.log(
    `Streaming ${inputPath} (${(sizeBytes / 1024 / 1024).toFixed(1)} MB)`,
  );
  console.log(`  depth cap = ${MAX_DEPTH} plies, min total = ${MIN_TOTAL}`);

  const startTime = Date.now();
  const stream = createReadStream(inputPath);
  const reader = createInterface({ input: stream, crlfDelay: Infinity });

  let currentGame: string[] = [];
  let games = 0;
  let lastLog = Date.now();

  for await (const line of reader) {
    if (line.startsWith("[Event ") && currentGame.length > 0) {
      processGame(currentGame.join("\n"));
      games++;
      currentGame = [line];
      if (Date.now() - lastLog > 5000) {
        const rate = games / ((Date.now() - startTime) / 1000);
        console.log(
          `  ${games.toLocaleString()} games processed, ` +
            `${book.size.toLocaleString()} unique positions ` +
            `(${rate.toFixed(0)} games/s)`,
        );
        lastLog = Date.now();
      }
    } else {
      currentGame.push(line);
    }
  }
  if (currentGame.length > 0) {
    processGame(currentGame.join("\n"));
    games++;
  }
  const streamDurMs = Date.now() - startTime;
  console.log(
    `Done streaming ${games.toLocaleString()} games in ` +
      `${(streamDurMs / 1000).toFixed(1)}s — ${book.size.toLocaleString()} ` +
      `unique positions before pruning.`,
  );

  // ---- Prune & emit ---------------------------------------------------------

  let kept = 0;
  const out: Record<string, { total: number; counts: Record<string, number> }> = {};
  for (const [fen, entry] of book) {
    if (entry.total < MIN_TOTAL) continue;
    const counts: Record<string, number> = {};
    for (const [san, c] of entry.counts) counts[san] = c;
    out[fen] = { total: entry.total, counts };
    kept++;
  }
  const droppedPct = 100 * (1 - kept / Math.max(1, book.size));
  console.log(
    `Kept ${kept.toLocaleString()} positions after pruning ` +
      `(${droppedPct.toFixed(1)}% dropped at MIN_TOTAL=${MIN_TOTAL}).`,
  );

  // Stream the JSON through gzip into the output file.
  const json = JSON.stringify(out);
  const uncompressedSize = Buffer.byteLength(json);
  const outFile = join(outDir, "masters.json.gz");
  await new Promise<void>((resolve, reject) => {
    const gz = createGzip({ level: 9 });
    const writer = createWriteStream(outFile);
    Readable.from(json).pipe(gz).pipe(writer);
    writer.on("finish", () => resolve());
    writer.on("error", reject);
  });
  const compressedSize = statSync(outFile).size;

  // Manifest — version stamps the date the script ran on; downstream consumers
  // (the app) compare this against the version they have to know whether to
  // offer an update.
  const today = new Date().toISOString().slice(0, 10);
  const version = today;
  const manifest = {
    version,
    url: `https://github.com/ramoncelma/chessmemo/releases/download/masters-${version}/masters.json.gz`,
    compressedSize,
    uncompressedSize,
    positionCount: kept,
    rawGameCount: games,
    createdAt: today,
    depthCap: MAX_DEPTH,
    minTotal: MIN_TOTAL,
  };
  await writeFile(
    join(outDir, "masters-manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  const totalSec = (Date.now() - startTime) / 1000;
  console.log("");
  console.log("Output:");
  console.log(
    `  ${outFile} ` +
      `(${(compressedSize / 1024 / 1024).toFixed(1)} MB gzipped, ` +
      `${(uncompressedSize / 1024 / 1024).toFixed(1)} MB raw)`,
  );
  console.log(`  ${join(outDir, "masters-manifest.json")}`);
  console.log("");
  console.log(`Total time: ${totalSec.toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
