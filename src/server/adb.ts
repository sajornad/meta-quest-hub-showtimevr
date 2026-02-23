import shell from "shelljs";
import { LogBus } from "./logBus";

export type AdbDevice = {
  serial: string;
  model?: string;
  device?: string;
  transportId?: string;
  battery?: number;
  installed?: boolean;
};

export type AdbExecOptions = {
  /** If true, do not log the raw adb command/stdout (only errors). */
  quiet?: boolean;
};

function exec(cmd: string, log?: LogBus, opts: AdbExecOptions = {}) {
  if (log && !opts.quiet) log.info(`$ ${cmd}`);

  const res = shell.exec(cmd, { silent: true });
  if (res.code !== 0) {
    if (log) log.error(res.stderr || `Command failed with code ${res.code}`);
    throw new Error(res.stderr || `Command failed: ${cmd}`);
  }

  if (log && !opts.quiet && res.stdout?.trim()) log.info(res.stdout.trim());
  return res.stdout;
}

export function parseAdbDevices(output: string): AdbDevice[] {
  const lines = output.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const devices: AdbDevice[] = [];
  for (const line of lines) {
    if (line.startsWith("List of devices")) continue;
    // Example: SERIAL device product:... model:Quest_2 device:... transport_id:1
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const serial = parts[0] ?? "";
    const state = parts[1];
    if (state !== "device") continue;
    const kv = Object.fromEntries(
      parts
        .slice(2)
        .map(p => p.split(":"))
        .filter(([k, v]) => k && v)
        .map(([k, v]) => [k, v])
    );
    devices.push({
      serial,
      model: (kv as any).model,
      device: (kv as any).device,
      transportId: (kv as any).transport_id,
    });
  }
  return devices;
}

export function getDevices(log?: LogBus, opts: AdbExecOptions = {}): AdbDevice[] {
  const out = exec("adb devices -l", log, opts);
  return parseAdbDevices(out);
}

export function getBattery(serial: string, log?: LogBus, opts: AdbExecOptions = {}): number | undefined {
  try {
    const out = exec(`adb -s ${serial} shell dumpsys battery`, log, opts);
    // Look for: level: 85
    const m = out.match(/level:\s*(\d+)/i);
    return m ? Number(m[1]) : undefined;
  } catch {
    return undefined;
  }
}

export function isPackageInstalled(serial: string, packageName: string, log?: LogBus, opts: AdbExecOptions = {}): boolean | undefined {
  if (!packageName) return undefined;
  try {
    const out = exec(`adb -s ${serial} shell pm list packages ${packageName}`, log, opts);
    return out.includes(packageName);
  } catch {
    return undefined;
  }
}

export function installApk(serial: string, apkPath: string, log?: LogBus, opts: AdbExecOptions = {}) {
  if (!apkPath) throw new Error("apkPath is not set");
  exec(`adb -s ${serial} install -r "${apkPath}"`, log, opts);
}

export function pushFile(serial: string, localPath: string, remotePath: string, log?: LogBus, opts: AdbExecOptions = {}) {
  exec(`adb -s ${serial} push "${localPath}" "${remotePath}"`, log, opts);
}

export function pushDir(serial: string, localDir: string, remoteDir: string, log?: LogBus, opts: AdbExecOptions = {}) {
  exec(`adb -s ${serial} push "${localDir}" "${remoteDir}"`, log, opts);
}

// Push ONLY the contents of localDir into remoteDir (not the folder itself).
export function pushDirContents(serial: string, localDir: string, remoteDir: string, log?: LogBus, opts: AdbExecOptions = {}) {
  // Using "/." keeps semantics: copy directory contents.
  exec(`adb -s ${serial} push "${localDir}/." "${remoteDir}"`, log, opts);
}

export function uninstall(serial: string, packageName: string, log?: LogBus, opts: AdbExecOptions = {}) {
  if (!packageName) throw new Error("packageName is not set");
  exec(`adb -s ${serial} uninstall ${packageName}`, log, opts);
}
