import { useEffect, useState } from "react";

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

export interface Settings {
  boardThemeId: string;
  pieceSet: PieceSet;
  theme: Theme;
  positionMissResetsLine: boolean;
}

const DEFAULTS: Settings = {
  boardThemeId: "green",
  pieceSet: "cburnett",
  theme: "light",
  positionMissResetsLine: false,
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

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(settings));
    document.documentElement.dataset.theme = settings.theme;
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
  };
}

export function themeById(id: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
}
