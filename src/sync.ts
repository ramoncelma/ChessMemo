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

// Thrown when GitHub returns 404 for a gist read/patch — usually because the
// linked gist was deleted (e.g. by a recreateGist run on a different device)
// and this device is still pointing at the stale id. Callers catch this and
// try to recover by re-resolving the gist id from the profile name.
class GistNotFoundError extends Error {
  constructor() {
    super("Gist not found (404).");
    this.name = "GistNotFoundError";
  }
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
  if (res.status === 404) throw new GistNotFoundError();
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

// Re-resolve the linked gist by searching the user's gists for the profile's
// description prefix. Used as a fallback when the stored gistId 404's because
// the gist was deleted/recreated on another device. Updates the local profile
// when a match is found so subsequent calls hit it directly.
async function relinkGistId(profile: Profile): Promise<Profile> {
  const found = await findGistByName(profile.token, profile.name);
  if (!found) {
    throw new Error(
      `The linked gist no longer exists on GitHub and no gist named "${profile.name}" was found on this account. ` +
        `Re-link the profile in Settings → Sync (or push a fresh one from a device that still has its data).`,
    );
  }
  const updated: Profile = { ...profile, gistId: found };
  setProfile(updated);
  return updated;
}

export async function pushToCloud(): Promise<number> {
  let profile = getProfile();
  if (!profile) throw new Error("No profile linked on this device.");
  const backup = await exportAll();
  const send = (p: Profile) =>
    postJson(
      `https://api.github.com/gists/${p.gistId}`,
      "PATCH",
      p.token,
      { files: { [GIST_FILE]: { content: JSON.stringify(backup) } } },
    );
  let res = await send(profile);
  if (res.status === 404) {
    profile = await relinkGistId(profile);
    res = await send(profile);
  }
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
  let profile = getProfile();
  if (!profile) throw new Error("No profile linked on this device.");
  let read;
  try {
    read = await readGist(profile.token, profile.gistId);
  } catch (err) {
    if (!(err instanceof GistNotFoundError)) throw err;
    profile = await relinkGistId(profile);
    read = await readGist(profile.token, profile.gistId);
  }
  await importAll(read.backup);
  setProfile({ ...profile, lastSyncedAt: read.updatedAt });
  clearLocalChange();
  return read.updatedAt;
}

// Delete the linked gist on GitHub and create a fresh one with the current
// local data. Used to scrub leaked secrets from gist history (gists are
// version-controlled — even a "scrub" push leaves the prior revisions
// reachable via the History tab).
export async function recreateGist(): Promise<{ gistId: string; updatedAt: number }> {
  const profile = getProfile();
  if (!profile) throw new Error("No profile linked on this device.");
  const del = await fetch(`https://api.github.com/gists/${profile.gistId}`, {
    method: "DELETE",
    headers: gistHeaders(profile.token),
  });
  if (!del.ok && del.status !== 404) {
    throw new Error(`Could not delete the old gist (${del.status}).`);
  }
  const { gistId, updatedAt } = await createGist(profile.name, profile.token);
  setProfile({ ...profile, gistId, lastSyncedAt: updatedAt });
  return { gistId, updatedAt };
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

async function backupHash(b: Backup): Promise<string> {
  const text = JSON.stringify(b);
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

// Run at app startup. Reconciles local vs remote:
//   - remote newer & no local edits  -> pull
//   - local edits & remote unchanged -> push
//   - both changed                   -> if contents are byte-identical, just
//                                        resync timestamps (this happens when
//                                        a previous push reached GitHub but
//                                        we never recorded the response);
//                                        otherwise true conflict
//   - nothing changed                -> ok
export async function syncOnStart(): Promise<SyncResult> {
  let profile = getProfile();
  if (!profile) return { status: "skip" };
  try {
    let read;
    try {
      read = await readGist(profile.token, profile.gistId);
    } catch (err) {
      if (!(err instanceof GistNotFoundError)) throw err;
      profile = await relinkGistId(profile);
      read = await readGist(profile.token, profile.gistId);
    }
    const { updatedAt, backup } = read;
    const localChange = getLocalChange();
    const remoteNewer = updatedAt > profile.lastSyncedAt;
    const localDirty = localChange > 0 && localChange > profile.lastSyncedAt;

    if (remoteNewer && localDirty) {
      // Possibly a phantom conflict — the previous push completed on
      // GitHub but we lost the response, so we still think we're dirty.
      // Hash both sides; if they match, just update our bookkeeping.
      const localBackup = await exportAll();
      const [remoteHash, localHash] = await Promise.all([
        backupHash(backup),
        backupHash(localBackup),
      ]);
      if (remoteHash === localHash) {
        setProfile({ ...profile, lastSyncedAt: updatedAt });
        clearLocalChange();
        return { status: "ok" };
      }
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
