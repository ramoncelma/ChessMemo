import { exportAll, importAll, type Backup } from "./backup";

const PROFILE_KEY = "chessmemo.profile";
const LOCAL_CHANGE_KEY = "chessmemo.localLastChange";
const GIST_FILE = "chessmemo.json";
const GIST_DESC_PREFIX = "ChessMemo profile: ";

export interface Profile {
  name: string;
  token: string;
  gistId: string;
  lastSyncedAt: number;
}

export type SyncStatus =
  | "ok"
  | "pulled"
  | "pushed"
  | "conflict"
  | "skip"
  | "error";

export interface SyncResult {
  status: SyncStatus;
  message?: string;
  remoteUpdatedAt?: number;
  localChangeAt?: number;
}

export function getProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function setProfile(p: Profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}

export function clearProfile() {
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(LOCAL_CHANGE_KEY);
}

export function getLocalChange(): number {
  const raw = localStorage.getItem(LOCAL_CHANGE_KEY);
  return raw ? Number(raw) : 0;
}

function clearLocalChange() {
  localStorage.removeItem(LOCAL_CHANGE_KEY);
}

function gistHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function postJson(
  url: string,
  method: "POST" | "PATCH",
  token: string,
  body: unknown,
): Promise<Response> {
  return fetch(url, {
    method,
    headers: { ...gistHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

interface GistDto {
  id: string;
  description: string | null;
  updated_at: string;
  files: Record<
    string,
    { content: string; truncated?: boolean; raw_url?: string }
  >;
}

export async function createGist(
  name: string,
  token: string,
): Promise<{ gistId: string; updatedAt: number }> {
  const backup = await exportAll();
  const res = await postJson("https://api.github.com/gists", "POST", token, {
    description: GIST_DESC_PREFIX + name,
    public: false,
    files: { [GIST_FILE]: { content: JSON.stringify(backup) } },
  });
  if (!res.ok) {
    throw new Error(`GitHub refused gist creation (${res.status}). ${await res.text()}`);
  }
  const json = (await res.json()) as GistDto;
  clearLocalChange();
  return { gistId: json.id, updatedAt: new Date(json.updated_at).getTime() };
}

export async function readGist(
  token: string,
  gistId: string,
): Promise<{ updatedAt: number; backup: Backup }> {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: gistHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`Could not read gist (${res.status}).`);
  }
  const json = (await res.json()) as GistDto;
  const file = json.files[GIST_FILE];
  if (!file) throw new Error(`Gist is missing ${GIST_FILE}.`);

  // GitHub truncates file contents larger than ~1 MB in the gist response and
  // sets `truncated: true`; we then have to fetch the full body from raw_url.
  // Without this, large repertoires (lots of lines + games cache) cause
  // "Gist content is not valid JSON" on pull.
  let content = file.content;
  if (file.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url);
    if (!raw.ok) {
      throw new Error(
        `Could not fetch full gist content (${raw.status}). Try again.`,
      );
    }
    content = await raw.text();
  }

  let backup: Backup;
  try {
    backup = JSON.parse(content) as Backup;
  } catch {
    throw new Error(
      "Gist content isn't valid JSON. The gist may have been edited manually or corrupted; use Push to overwrite it with this device's data.",
    );
  }
  return { updatedAt: new Date(json.updated_at).getTime(), backup };
}

export async function findGistByName(
  token: string,
  name: string,
): Promise<string | null> {
  const desc = GIST_DESC_PREFIX + name;
  const res = await fetch("https://api.github.com/gists?per_page=100", {
    headers: gistHeaders(token),
  });
  if (!res.ok) throw new Error(`Could not list gists (${res.status}).`);
  const list = (await res.json()) as GistDto[];
  const match = list.find((g) => g.description === desc);
  return match ? match.id : null;
}

export async function pushToCloud(): Promise<number> {
  const profile = getProfile();
  if (!profile) throw new Error("No profile linked on this device.");
  const backup = await exportAll();
  const res = await postJson(
    `https://api.github.com/gists/${profile.gistId}`,
    "PATCH",
    profile.token,
    { files: { [GIST_FILE]: { content: JSON.stringify(backup) } } },
  );
  if (!res.ok) {
    throw new Error(`Push failed (${res.status}). ${await res.text()}`);
  }
  const json = (await res.json()) as GistDto;
  const ts = new Date(json.updated_at).getTime();
  setProfile({ ...profile, lastSyncedAt: ts });
  clearLocalChange();
  return ts;
}

export async function pullFromCloud(): Promise<number> {
  const profile = getProfile();
  if (!profile) throw new Error("No profile linked on this device.");
  const { updatedAt, backup } = await readGist(profile.token, profile.gistId);
  await importAll(backup);
  setProfile({ ...profile, lastSyncedAt: updatedAt });
  clearLocalChange();
  return updatedAt;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function markDirty() {
  localStorage.setItem(LOCAL_CHANGE_KEY, String(Date.now()));
  if (!getProfile()) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    pushToCloud().catch((err) => {
      console.warn("Auto-push to cloud failed:", err);
    });
  }, 5000);
}

// Push immediately if a debounced push is pending. Call before leaving the
// page so unsent changes aren't lost.
export async function flushPendingPush(): Promise<void> {
  if (!debounceTimer) return;
  clearTimeout(debounceTimer);
  debounceTimer = null;
  if (!getProfile()) return;
  await pushToCloud();
}

// Run at app startup. Reconciles local vs remote:
//   - remote newer & no local edits  -> pull
//   - local edits & remote unchanged -> push
//   - both changed                   -> conflict (no action, user decides)
//   - nothing changed                -> ok
export async function syncOnStart(): Promise<SyncResult> {
  const profile = getProfile();
  if (!profile) return { status: "skip" };
  try {
    const { updatedAt, backup } = await readGist(profile.token, profile.gistId);
    const localChange = getLocalChange();
    const remoteNewer = updatedAt > profile.lastSyncedAt;
    const localDirty = localChange > 0 && localChange > profile.lastSyncedAt;

    if (remoteNewer && localDirty) {
      return {
        status: "conflict",
        remoteUpdatedAt: updatedAt,
        localChangeAt: localChange,
      };
    }
    if (remoteNewer) {
      await importAll(backup);
      setProfile({ ...profile, lastSyncedAt: updatedAt });
      clearLocalChange();
      return { status: "pulled", remoteUpdatedAt: updatedAt };
    }
    if (localDirty) {
      const ts = await pushToCloud();
      return { status: "pushed", remoteUpdatedAt: ts };
    }
    return { status: "ok" };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
