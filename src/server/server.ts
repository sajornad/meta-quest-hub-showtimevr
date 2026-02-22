import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

import { loadSettings, saveSettings, type Settings } from "./settings";
import { ConfigManipulator } from "./configManipulator";
import { LogBus } from "./logBus";
import * as adb from "./adb";

const app = express();
const log = new LogBus(800);

app.use(cors());
app.use(bodyParser.json());

let settings: Settings = loadSettings();

const HOME = os.homedir();
function safePath(p: string) {
  const resolved = path.resolve(p);
  if (!resolved.startsWith(HOME)) {
    throw new Error(`Path outside home is not allowed: ${resolved}`);
  }
  return resolved;
}

app.get("/api/settings", (_req, res) => {
  res.json(settings);
});

app.put("/api/settings", (req, res) => {
  const next = { ...settings, ...(req.body ?? {}) } as Settings;
  // clamp lastUsedID
  if (typeof next.lastUsedID === "number") {
    next.lastUsedID = Math.max(1, Math.min(50, Math.floor(next.lastUsedID)));
  }
  settings = next;
  saveSettings(settings);
  log.info("Settings updated");
  res.json(settings);
});

app.get("/api/fs/home", (_req, res) => {
  res.json({ home: HOME });
});

app.get("/api/fs/list", (req, res) => {
  try {
    const p = typeof req.query.path === "string" ? req.query.path : HOME;
    const dir = safePath(p);
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .map((e) => {
        const fullPath = path.join(dir, e.name);
        return {
          name: e.name,
          path: fullPath,
          isDir: e.isDirectory(),
        };
      })
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const parent = dir === HOME ? null : path.dirname(dir);
    res.json({ path: dir, parent: parent && parent.startsWith(HOME) ? parent : null, entries });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

app.get("/api/devices", async (_req, res) => {
  try {
    const devices = adb.getDevices(log);
    const enriched = devices.map((d) => {
      const battery = adb.getBattery(d.serial, log);
      const installed = adb.isPackageInstalled(d.serial, settings.packageName, log);
      return { ...d, battery, installed };
    });
    res.json(enriched);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

app.post("/api/provision", async (req, res) => {
  const { serial, currentId } = req.body ?? {};
  if (!serial) return res.status(400).json({ ok: false, error: "serial is required" });
  const id = Number(currentId);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "currentId must be a number" });

  let cleanup: (() => void) | null = null;
  const progress = (pct: number, message: string) => {
    log.info(`[progress serial=${serial} pct=${pct}] ${message}`);
  };
  try {
    log.info(`Provisioning started for ${serial} with ID ${id}`);
    progress(5, "Starting provisioning");

    // Build temp config inside try so we can return JSON errors.
    const manip = new ConfigManipulator(settings.configBasePath);
    const tmp = manip.createTempConfigWithId(id);
    cleanup = tmp.cleanup;

    // 1) install APK first
    progress(15, "Installing APK");
    adb.installApk(serial, settings.apkPath, log);
    progress(45, "APK installed");

    // 2) push config + assets to configurable remote paths
    progress(55, "Transferring config.txt");
    adb.pushFile(serial, tmp.tempPath, settings.remoteConfigPath, log);

    progress(70, "Transferring 360 video");
    adb.pushFile(serial, settings.videoPath, settings.remoteVideoPath, log);

    progress(85, "Transferring branding folder");
    adb.pushDir(serial, settings.brandingPath, settings.remoteBrandingDir, log);

    // update lastUsedID if auto increment
    settings.lastUsedID = Math.max(1, Math.min(50, Math.floor(id)));
    if (settings.autoIncrement) {
      settings.lastUsedID = settings.lastUsedID >= 50 ? 1 : settings.lastUsedID + 1;
    }
    saveSettings(settings);

    progress(100, "Provisioning complete");
    log.info(`Provisioning complete for ${serial}`);
    res.json({ ok: true, nextId: settings.lastUsedID });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    log.error(msg);
    // Many failures here are bad paths / adb errors; treat as 400 unless it looks like an internal crash.
    const status = msg.includes("not set") || msg.includes("not found") ? 400 : 500;
    res.status(status).json({ ok: false, error: msg });
  } finally {
    try {
      cleanup?.();
    } catch {
      // ignore
    }
  }
});

app.post("/api/uninstall", async (req, res) => {
  const { serial } = req.body ?? {};
  if (!serial) return res.status(400).json({ error: "serial is required" });
  try {
    log.info(`Uninstall started for ${serial}`);
    adb.uninstall(serial, settings.packageName, log);
    log.info(`Uninstall complete for ${serial}`);
    res.json({ ok: true });
  } catch (e: any) {
    log.error(e?.message ?? String(e));
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

// SSE log stream
app.get("/api/logs/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // send buffer first
  for (const line of log.getBuffer()) {
    res.write(`data: ${JSON.stringify(line)}\n\n`);
  }

  const off = log.onLine((line) => {
    res.write(`data: ${JSON.stringify(line)}\n\n`);
  });

  req.on("close", () => {
    off();
    res.end();
  });
});

// serve frontend in production (placeholder)
app.use(express.static(path.resolve(process.cwd(), "client", "dist")));

const PORT = process.env.PORT ? Number(process.env.PORT) : 5179;
app.listen(PORT, () => {
  log.info(`Server listening on http://localhost:${PORT}`);
});
