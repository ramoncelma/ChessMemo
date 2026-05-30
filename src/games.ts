import { get, set } from "idb-keyval";
import { Chess } from "chess.js";
import type { Speed } from "./settings";
import type { Study } from "./types";
export interface RealGame {
  id: string;
  url: string;
  color: "white" | "black";
  speed: string;
  createdAt: number;
  opponent: string;
  moves: string[]; // SAN
}

const GAMES_KEY = "chessmemo.lichessGames";

export async function loadGames(): Promise<RealGame[]> {
  return (await get<RealGame[]>(GAMES_KEY)) ?? [];
}

export async function saveGames(games: RealGame[]): Promise<void> {
  await set(GAMES_KEY, games);
}

// Fetch a user's games from the Lichess public API (CORS-enabled, no auth).
export async function fetchLichessGames(
  user: string,
  sinceMs: number,
  speeds: Speed[],
  max = 300,
): Promise<RealGame[]> {
  const params = new URLSearchParams({
    since: String(sinceMs),
    max: String(max),
    moves: "true",
    pgnInJson: "false",
  });
  if (speeds.length > 0) params.set("perfType", speeds.join(","));

  const res = await fetch(
    `https://lichess.org/api/games/user/${encodeURIComponent(user)}?${params}`,
    { headers: { Accept: "application/x-ndjson" } },
  );
  if (!res.ok) throw new Error(`Lichess returned ${res.status}`);
  const text = await res.text();

  const games: RealGame[] = [];
  const uname = user.toLowerCase();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const g = JSON.parse(trimmed);
    const white = g.players?.white?.user?.id?.toLowerCase() ?? "";
    const black = g.players?.black?.user?.id?.toLowerCase() ?? "";
    const color: "white" | "black" | null =
      white === uname ? "white" : black === uname ? "black" : null;
    if (!color) continue;
    const opponent =
      (color === "white"
        ? g.players?.black?.user?.name
        : g.players?.white?.user?.name) ?? "?";
    games.push({
      id: g.id,
      url: `https://lichess.org/${g.id}`,
      color,
      speed: g.speed ?? "",
      createdAt: g.createdAt ?? 0,
      opponent,
      moves: typeof g.moves === "string" && g.moves ? g.moves.split(" ") : [],
    });
  }
  return games;
}

// Fetch a user's games from Chess.com. The public API has CORS enabled and
// returns monthly archives; we walk the archives from `sinceMs` onward.
export async function fetchChessComGames(
  user: string,
  sinceMs: number,
  speeds: Speed[],
): Promise<RealGame[]> {
  const out: RealGame[] = [];
  const uname = user.toLowerCase();
  // chess.com calls correspondence "daily" and has no "classical" class.
  const accept = new Set<string>(
    speeds.map((s) => (s === "correspondence" ? "daily" : s)),
  );

  const arcRes = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`,
  );
  if (!arcRes.ok) throw new Error(`Chess.com ${arcRes.status}`);
  const archives: string[] = (await arcRes.json()).archives ?? [];

  const since = new Date(sinceMs);
  const sinceYM = since.getFullYear() * 12 + since.getMonth();

  for (const url of archives) {
    const m = url.match(/(\d{4})\/(\d{2})$/);
    if (!m) continue;
    const ym = parseInt(m[1], 10) * 12 + parseInt(m[2], 10) - 1;
    if (ym < sinceYM) continue;

    const monthRes = await fetch(url);
    if (!monthRes.ok) continue;
    const games: unknown[] = (await monthRes.json()).games ?? [];

    for (const raw of games) {
      const g = raw as Record<string, unknown>;
      const endTime = ((g.end_time as number) ?? 0) * 1000;
      if (endTime < sinceMs) continue;
      const tc = (g.time_class as string) ?? "";
      if (!accept.has(tc)) continue;

      const white = (
        ((g.white as Record<string, unknown>)?.username as string) ?? ""
      ).toLowerCase();
      const black = (
        ((g.black as Record<string, unknown>)?.username as string) ?? ""
      ).toLowerCase();
      const color: "white" | "black" | null =
        white === uname ? "white" : black === uname ? "black" : null;
      if (!color) continue;

      const opp =
        color === "white"
          ? ((g.black as Record<string, unknown>)?.username as string) ?? "?"
          : ((g.white as Record<string, unknown>)?.username as string) ?? "?";

      let moves: string[] = [];
      try {
        const ch = new Chess();
        ch.loadPgn((g.pgn as string) ?? "");
        moves = ch.history();
      } catch {
        continue;
      }

      out.push({
        id: (g.url as string) ?? `cc-${endTime}`,
        url: (g.url as string) ?? "",
        color,
        speed: tc === "daily" ? "correspondence" : tc,
        createdAt: endTime,
        opponent: opp,
        moves,
      });
    }
  }
  return out;
}

// --- Deviation analysis ---

interface TrieNode {
  children: Map<string, TrieNode>;
}

// Normalize SAN so Lichess and chess.js notation match (drop check/annotation).
function norm(san: string): string {
  return san.replace(/[+#!?]/g, "");
}

function buildTrie(study: Study): TrieNode {
  const root: TrieNode = { children: new Map() };
  for (const line of study.lines) {
    let node = root;
    for (const m of line.moves) {
      const key = norm(m.san);
      let child = node.children.get(key);
      if (!child) {
        child = { children: new Map() };
        node.children.set(key, child);
      }
      node = child;
    }
  }
  return root;
}

export type GameVerdict =
  | { kind: "off" }
  | { kind: "followed" }
  | { kind: "deviation"; fullmove: number; played: string; expected: string[] };

// Compare one game to one repertoire. Deviations before move 3 mean it is a
// different game (off); from move 3 a user mismatch is a real deviation.
export function analyzeGame(study: Study, game: RealGame): GameVerdict {
  if (game.color !== study.orientation) return { kind: "off" };
  const want = study.orientation === "white" ? 0 : 1; // parity of user plies
  const root = buildTrie(study);
  let node = root;

  for (let p = 0; p < game.moves.length; p++) {
    const san = game.moves[p];
    const child = node.children.get(norm(san));
    if (child) {
      node = child;
      if (node.children.size === 0) return { kind: "followed" }; // end of prep
      continue;
    }
    const fullmove = Math.floor(p / 2) + 1;
    const isUser = p % 2 === want;
    if (fullmove < 3) return { kind: "off" };
    if (isUser) {
      return {
        kind: "deviation",
        fullmove,
        played: san,
        expected: [...node.children.keys()],
      };
    }
    return { kind: "followed" }; // opponent left your prep
  }
  return { kind: "followed" };
}

export interface StudyReport {
  study: Study;
  followed: RealGame[];
  deviations: { game: RealGame; fullmove: number; played: string; expected: string[] }[];
}

export function analyzeAll(studies: Study[], games: RealGame[]): StudyReport[] {
  return studies.map((study) => {
    const report: StudyReport = { study, followed: [], deviations: [] };
    for (const game of games) {
      // A repertoire only applies to game modes it is tagged for.
      if (!study.categories.includes(game.speed as Speed)) continue;
      const v = analyzeGame(study, game);
      if (v.kind === "followed") report.followed.push(game);
      else if (v.kind === "deviation")
        report.deviations.push({
          game,
          fullmove: v.fullmove,
          played: v.played,
          expected: v.expected,
        });
    }
    return report;
  });
}
