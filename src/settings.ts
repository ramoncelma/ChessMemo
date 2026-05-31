import { useEffect, useRef, useState } from "react";
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
};
const KEY = "chessmemo.settings";

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
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
  };
}

export function themeById(id: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
}
