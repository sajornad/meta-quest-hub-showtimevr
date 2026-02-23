export type Settings = {
  apkPath: string;
  videoPath: string;
  brandingPath: string;
  configBasePath: string;

  remoteConfigPath: string;
  remoteBrandingDir: string;
  remoteVideoPath: string;

  lastUsedID: number;
  autoIncrement: boolean;
  packageName: string;
};

export type Device = {
  serial: string;
  model?: string;
  battery?: number;
  installed?: boolean;
};

const API_BASE = ""; // same origin

export async function getSettings(): Promise<Settings> {
  const r = await fetch(`${API_BASE}/api/settings`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function putSettings(patch: Partial<Settings>): Promise<Settings> {
  const r = await fetch(`${API_BASE}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getDevices(): Promise<Device[]> {
  const r = await fetch(`${API_BASE}/api/devices`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function provision(serial: string, currentId: number): Promise<{ ok: boolean; nextId?: number; error?: string }> {
  const r = await fetch(`${API_BASE}/api/provision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serial, currentId }),
  });
  return r.json();
}

export async function uninstall(serial: string): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`${API_BASE}/api/uninstall`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serial }),
  });
  return r.json();
}

export function subscribeLogs(onLine: (line: any) => void) {
  let stopped = false;
  let es: EventSource | null = null;
  let retryMs = 500;
  let retryTimer: any = null;

  const connect = () => {
    if (stopped) return;
    try {
      es = new EventSource(`${API_BASE}/api/logs/stream`);
    } catch {
      scheduleReconnect();
      return;
    }

    es.onmessage = (ev) => {
      try {
        onLine(JSON.parse(ev.data));
      } catch {
        /* ignore */
      }
    };

    es.onerror = () => {
      // Auto-reconnect (useful when the server restarts or the tab sleeps).
      try {
        es?.close();
      } catch {
        /* ignore */
      }
      es = null;
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      retryMs = Math.min(5000, Math.floor(retryMs * 1.5));
      connect();
    }, retryMs);
  };

  connect();

  return () => {
    stopped = true;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    try {
      es?.close();
    } catch {
      /* ignore */
    }
    es = null;
  };
}

export type FsEntry = { name: string; path: string; isDir: boolean };
export type FsListResponse = { path: string; parent: string | null; entries: FsEntry[]; error?: string };

export async function fsHome(): Promise<{ home: string }> {
  const r = await fetch(`${API_BASE}/api/fs/home`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fsList(p: string): Promise<FsListResponse> {
  const u = new URL(`${API_BASE}/api/fs/list`, window.location.origin);
  u.searchParams.set("path", p);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
