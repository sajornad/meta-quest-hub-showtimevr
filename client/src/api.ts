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
  const es = new EventSource(`${API_BASE}/api/logs/stream`);
  es.onmessage = (ev) => {
    try { onLine(JSON.parse(ev.data)); } catch { /* ignore */ }
  };
  return () => es.close();
}
