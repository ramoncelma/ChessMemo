import { useEffect, useRef, useState } from "react";
import { setVacationStart } from "./clock";
import { markDirty } from "./sync";
import type { Lang } from "./i18n";

export interface BoardTheme {
  id: string;
  name: string;
  light: string;
  dark: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: "green", name: "Tournament", light: "#eeeed2", dark: "#769656" },
  { id: "wood", name: "Wood", light: "#f0d9b5", dark: "#b58863" },
  { id: "ocean", name: "Ocean", light: "#dee3e6", dark: "#4b7399" },
  { id: "slate", name: "Slate", light: "#e7ecf1", dark: "#647d92" },
  { id: "berry", name: "Berry", light: "#efe6f4", dark: "#9b6bb3" },
  { id: "coral", name: "Coral", light: "#f6e6df", dark: "#c97b63" },
];

export const PIECE_SETS = [
  "cburnett",
  "merida",
  "alpha",
  "pirouetti",
  "fresca",
  "gioco",
  "tatiana",
  "staunty",
] as const;

export type PieceSet = (typeof PIECE_SETS)[number];

export type Theme = "light" | "dark";

export type Speed =
  | "bullet"
  | "blitz"
  | "rapid"
  | "classical"
  | "correspondence";

export const SPEEDS: Speed[] = [
  "bullet",
  "blitz",
  "rapid",
  "classical",
  "correspondence",
];

// Lichess explorer time-control buckets that the /lichess endpoint accepts.
// Bullet is excluded by default — opening choices at < 3 min are mostly
// time-pressure noise rather than considered preparation.
export const LICHESS_SPEEDS: Speed[] = ["bullet", "blitz", "rapid", "classical"];

// Lichess explorer rating buckets. Each value is the LOWER BOUND of a band
// the API understands; the bands are 200 ELO wide except the top one which
// is open-ended. The "0" bucket covers everyone below 1000.
export const LICHESS_RATINGS = [
  0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500,
] as const;
export type LichessRating = (typeof LICHESS_RATINGS)[number];

export function lichessRatingLabel(r: LichessRating): string {
  if (r === 0) return "0–999";
  if (r === 2500) return "2500+";
  return `${r}–${r + 199}`;
}

// Which weight source drives line ordering, the "Exclude rarer" filter, and
// the percentage column in line lists. The other source is still shown next
// to it as a secondary number — this just picks which one is "primary".
export type WeightRankingSource = "gm" | "lichess";

// Which scheduler runs grading. "sr" is the custom fixed-interval system
// (with user-editable level intervals below). "fsrs" delegates to the
// standard ts-fsrs algorithm — same Again/Hard/Good/Easy interface but
// FSRS-driven intervals.
export type MemorizationMethod = "sr" | "fsrs";

export interface SrsLevelConfig {
  name: string;
  // 0 for level 0 (brand-new). Otherwise the gap before this level becomes
  // due next.
  intervalMs: number;
}

export const DEFAULT_SRS_LEVELS: SrsLevelConfig[] = [
  { name: "New", intervalMs: 0 },
  { name: "8 hours", intervalMs: 8 * 3600_000 },
  { name: "2 days", intervalMs: 2 * 24 * 3600_000 },
  { name: "5 days", intervalMs: 5 * 24 * 3600_000 },
  { name: "2 weeks", intervalMs: 14 * 24 * 3600_000 },
  { name: "1 month", intervalMs: 30 * 24 * 3600_000 },
  { name: "2 months", intervalMs: 60 * 24 * 3600_000 },
  { name: "3 months", intervalMs: 90 * 24 * 3600_000 },
  { name: "6 months", intervalMs: 180 * 24 * 3600_000 },
];

export interface Settings {
  boardThemeId: string;
  pieceSet: PieceSet;
  theme: Theme;
  positionMissResetsLine: boolean;
  lang: Lang;
  lichessUser: string;
  chesscomUser: string;
  importSince: string; // YYYY-MM-DD
  speeds: Record<Speed, boolean>;
  opponentDelayMs: number;
  engineLines: 1 | 2 | 3;
  engineArrows: boolean;
  replayFromStartOnMiss: boolean;
  vacationStartedAt: number | null;
  chapterView: "list" | "grid";
  forgiveIfEngineEquivalent: boolean;
  forgiveCpTolerance: number; // centipawns; 20 = 0.2 pawns
  coverageThreshold: number; // "1 in N" — lines rarer than this are eligible
                              // for the "Exclude rarer" action.
  maxMemorizationDepth: number; // plies; misses on plies >= this don't
                                 // count as SRS misses (still shown in UI)
  // GM (Lichess Masters Explorer) query params. null = "no bound, all years".
  mastersSinceYear: number | null;
  mastersUntilYear: number | null;
  // Lichess (Lichess Explorer /lichess endpoint) query params.
  lichessSpeeds: Record<Speed, boolean>;
  lichessRatings: Record<number, boolean>;
  lichessSinceYear: number | null;
  lichessUntilYear: number | null;
  // Which source drives ranking — see WeightRankingSource above.
  weightRankingSource: WeightRankingSource;
  memorizationMethod: MemorizationMethod;
  srsLevels: SrsLevelConfig[];
}

const DEFAULTS: Settings = {
  boardThemeId: "green",
  pieceSet: "cburnett",
  theme: "light",
  positionMissResetsLine: false,
  lang: "en",
  lichessUser: "",
  chesscomUser: "",
  importSince: "",
  speeds: {
    bullet: false,
    blitz: true,
    rapid: true,
    classical: true,
    correspondence: false,
  },
  opponentDelayMs: 350,
  engineLines: 1,
  engineArrows: true,
  replayFromStartOnMiss: false,
  vacationStartedAt: null,
  chapterView: "list",
  forgiveIfEngineEquivalent: false,
  forgiveCpTolerance: 20,
  coverageThreshold: 200,
  maxMemorizationDepth: 30,
  mastersSinceYear: null,
  mastersUntilYear: null,
  lichessSpeeds: {
    bullet: false,
    blitz: true,
    rapid: true,
    classical: true,
    correspondence: false,
  },
  lichessRatings: Object.fromEntries(LICHESS_RATINGS.map((r) => [r, true])) as Record<
    number,
    boolean
  >,
  lichessSinceYear: null,
  lichessUntilYear: null,
  weightRankingSource: "gm",
  memorizationMethod: "sr",
  srsLevels: DEFAULT_SRS_LEVELS,
};
const KEY = "chessmemo.settings";
const LICHESS_TOKEN_KEY = "chessmemo.lichessToken";

export function getLichessToken(): string {
  try {
    return localStorage.getItem(LICHESS_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setLichessToken(token: string) {
  try {
    if (token) localStorage.setItem(LICHESS_TOKEN_KEY, token);
    else localStorage.removeItem(LICHESS_TOKEN_KEY);
  } catch {
    // ignore
  }
}

function read(): Settings {
  // One-shot migration: previous builds kept the Lichess token inside
  // chessmemo.settings, which is part of the gist sync payload. The token
  // is now stored under a separate, never-synced key. Anything we find
  // under the old name is moved over and removed from settings before we
  // ever return — so no subsequent push can carry it.
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.lichessToken === "string" && parsed.lichessToken) {
        try {
          if (!localStorage.getItem(LICHESS_TOKEN_KEY)) {
            localStorage.setItem(LICHESS_TOKEN_KEY, parsed.lichessToken);
          }
        } catch {
          // ignore
        }
        delete parsed.lichessToken;
        try {
          localStorage.setItem(KEY, JSON.stringify(parsed));
        } catch {
          // ignore
        }
      }
      const merged = { ...DEFAULTS, ...parsed } as Settings;
      setVacationStart(merged.vacationStartedAt ?? null);
      return merged;
    }
  } catch {
    // ignore malformed settings
  }
  return DEFAULTS;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(read);
  const firstRun = useRef(true);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(settings));
    document.documentElement.dataset.theme = settings.theme;
    setVacationStart(settings.vacationStartedAt);
    if (firstRun.current) {
      firstRun.current = false;
    } else {
      markDirty();
    }
  }, [settings]);

  return {
    settings,
    setBoardTheme: (boardThemeId: string) =>
      setSettings((s) => ({ ...s, boardThemeId })),
    setPieceSet: (pieceSet: PieceSet) =>
      setSettings((s) => ({ ...s, pieceSet })),
    setTheme: (theme: Theme) => setSettings((s) => ({ ...s, theme })),
    setPositionMissResetsLine: (positionMissResetsLine: boolean) =>
      setSettings((s) => ({ ...s, positionMissResetsLine })),
    setLang: (lang: Lang) => setSettings((s) => ({ ...s, lang })),
    setLichessUser: (lichessUser: string) =>
      setSettings((s) => ({ ...s, lichessUser })),
    setChesscomUser: (chesscomUser: string) =>
      setSettings((s) => ({ ...s, chesscomUser })),
    setImportSince: (importSince: string) =>
      setSettings((s) => ({ ...s, importSince })),
    setSpeed: (speed: Speed, on: boolean) =>
      setSettings((s) => ({ ...s, speeds: { ...s.speeds, [speed]: on } })),
    setOpponentDelayMs: (opponentDelayMs: number) =>
      setSettings((s) => ({ ...s, opponentDelayMs })),
    setEngineLines: (engineLines: 1 | 2 | 3) =>
      setSettings((s) => ({ ...s, engineLines })),
    setEngineArrows: (engineArrows: boolean) =>
      setSettings((s) => ({ ...s, engineArrows })),
    setReplayFromStartOnMiss: (replayFromStartOnMiss: boolean) =>
      setSettings((s) => ({ ...s, replayFromStartOnMiss })),
    setVacation: (on: boolean) =>
      setSettings((s) => ({
        ...s,
        vacationStartedAt: on ? Date.now() : null,
      })),
    setChapterView: (chapterView: "list" | "grid") =>
      setSettings((s) => ({ ...s, chapterView })),
    setForgiveIfEngineEquivalent: (forgiveIfEngineEquivalent: boolean) =>
      setSettings((s) => ({ ...s, forgiveIfEngineEquivalent })),
    setForgiveCpTolerance: (forgiveCpTolerance: number) =>
      setSettings((s) => ({ ...s, forgiveCpTolerance })),
    setCoverageThreshold: (coverageThreshold: number) =>
      setSettings((s) => ({ ...s, coverageThreshold })),
    setMaxMemorizationDepth: (maxMemorizationDepth: number) =>
      setSettings((s) => ({ ...s, maxMemorizationDepth })),
    setMastersSinceYear: (mastersSinceYear: number | null) =>
      setSettings((s) => ({ ...s, mastersSinceYear })),
    setMastersUntilYear: (mastersUntilYear: number | null) =>
      setSettings((s) => ({ ...s, mastersUntilYear })),
    setLichessSpeed: (speed: Speed, on: boolean) =>
      setSettings((s) => ({
        ...s,
        lichessSpeeds: { ...s.lichessSpeeds, [speed]: on },
      })),
    setLichessRating: (rating: number, on: boolean) =>
      setSettings((s) => ({
        ...s,
        lichessRatings: { ...s.lichessRatings, [rating]: on },
      })),
    setLichessSinceYear: (lichessSinceYear: number | null) =>
      setSettings((s) => ({ ...s, lichessSinceYear })),
    setLichessUntilYear: (lichessUntilYear: number | null) =>
      setSettings((s) => ({ ...s, lichessUntilYear })),
    setWeightRankingSource: (weightRankingSource: WeightRankingSource) =>
      setSettings((s) => ({ ...s, weightRankingSource })),
    setMemorizationMethod: (memorizationMethod: MemorizationMethod) =>
      setSettings((s) => ({ ...s, memorizationMethod })),
    setSrsLevels: (srsLevels: SrsLevelConfig[]) =>
      setSettings((s) => ({ ...s, srsLevels })),
  };
}

export function themeById(id: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
}
