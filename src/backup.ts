import { get, set } from "idb-keyval";

// Keys whose value is wholesale replaced by what the backup carries.
const KEYS = [
  "chessmemo.studies",
  "chessmemo.reviewlog",
  "chessmemo.lichessGames",
  "chessmemo.manualGames",
];

// Keys whose value is MERGED with the local copy on import rather than
// replaced — used for the masters position cache, so a device that pulls a
// shared cache from the gist keeps any extra positions it has fetched
// itself, and a device that has just been linked picks up the existing
// cache without any Lichess API access of its own.
const MERGE_KEYS = ["chessmemo.mastersCache.v2"];

// Settings fields that must NEVER leave the device. The gist sync would
// otherwise republish them and Lichess / similar services scan public gists
// and auto-revoke tokens they find.
const SECRET_SETTING_KEYS = ["lichessToken"] as const;

export interface Backup {
  v: 1;
  exportedAt: number;
  data: Record<string, unknown>;
  settings?: unknown;
}

export async function exportAll(): Promise<Backup> {
  const data: Record<string, unknown> = {};
  for (const k of KEYS) data[k] = await get(k);
  for (const k of MERGE_KEYS) data[k] = await get(k);
  let settings: unknown;
  try {
    const raw = localStorage.getItem("chessmemo.settings");
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      for (const k of SECRET_SETTING_KEYS) delete obj[k];
      settings = obj;
    }
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
  for (const k of MERGE_KEYS) {
    if (!(k in b.data)) continue;
    const incoming = (b.data[k] ?? {}) as Record<string, unknown>;
    const local =
      ((await get<Record<string, unknown>>(k)) ?? {}) as Record<string, unknown>;
    // Incoming wins on conflict — the gist's copy is the canonical shared
    // dataset; values for the same FEN should be near-identical anyway.
    const merged: Record<string, unknown> = { ...local, ...incoming };
    await set(k, merged);
  }
  if (b.settings) {
    // Preserve any device-local secrets the incoming payload doesn't carry —
    // otherwise importing on a device that already has a Lichess token would
    // wipe it out.
    let local: Record<string, unknown> = {};
    try {
      const raw = localStorage.getItem("chessmemo.settings");
      if (raw) local = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // ignore
    }
    const merged: Record<string, unknown> = {
      ...(b.settings as Record<string, unknown>),
    };
    for (const k of SECRET_SETTING_KEYS) {
      if (local[k] !== undefined) merged[k] = local[k];
    }
    localStorage.setItem("chessmemo.settings", JSON.stringify(merged));
  }
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
