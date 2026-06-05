import { get, set } from "idb-keyval";

const KEYS = [
  "chessmemo.studies",
  "chessmemo.reviewlog",
  "chessmemo.lichessGames",
  "chessmemo.manualGames",
];

export interface Backup {
  v: 1;
  exportedAt: number;
  data: Record<string, unknown>;
  settings?: unknown;
}

export async function exportAll(): Promise<Backup> {
  const data: Record<string, unknown> = {};
  for (const k of KEYS) data[k] = await get(k);
  let settings: unknown;
  try {
    const raw = localStorage.getItem("chessmemo.settings");
    if (raw) settings = JSON.parse(raw);
  } catch {
    // ignore
  }
  return { v: 1, exportedAt: Date.now(), data, settings };
}

export async function importAll(b: Backup): Promise<void> {
  if (!b || b.v !== 1 || !b.data) throw new Error("Not a ChessMemo backup");
  for (const k of KEYS) {
    if (k in b.data) await set(k, b.data[k]);
  }
  if (b.settings)
    localStorage.setItem("chessmemo.settings", JSON.stringify(b.settings));
}

export function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
