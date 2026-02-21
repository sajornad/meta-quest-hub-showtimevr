import fs from "node:fs";
import path from "node:path";

export type Settings = {
  apkPath: string;
  videoPath: string;
  brandingPath: string;
  configBasePath: string;
  lastUsedID: number; // 1-50
  autoIncrement: boolean;
  packageName: string;
};

const DEFAULT_SETTINGS: Settings = {
  apkPath: "",
  videoPath: "",
  brandingPath: "",
  configBasePath: "",
  lastUsedID: 1,
  autoIncrement: true,
  packageName: "",
};

export function getDataDir() {
  // Keep it local to the project by default (can be overridden later)
  return path.resolve(process.cwd(), ".data");
}

export function getSettingsPath() {
  return path.join(getDataDir(), "settings.json");
}

export function loadSettings(): Settings {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  const p = getSettingsPath();
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf-8");
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    // If corrupted, overwrite with defaults to keep tool usable
    fs.writeFileSync(p, JSON.stringify(DEFAULT_SETTINGS, null, 2), "utf-8");
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(next: Settings) {
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(next, null, 2), "utf-8");
}
