import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export class ConfigManipulator {
  constructor(private baseConfigPath: string) {}

  createTempConfigWithId(currentId: number): { tempPath: string; cleanup: () => void } {
    if (!this.baseConfigPath) throw new Error("configBasePath is not set");
    if (!fs.existsSync(this.baseConfigPath)) {
      throw new Error(`Base config not found: ${this.baseConfigPath}`);
    }

    const base = fs.readFileSync(this.baseConfigPath, "utf-8");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mqh-config-"));
    const tempPath = path.join(tmpDir, "config.txt");

    // The base config uses '#' as a placeholder for the incremental ID.
    // We only replace placeholders in known fields, not general comments.
    let next = base;
    next = next.replace(/3GOVideo-#/g, `3GOVideo-${currentId}`);
    next = next.replace(/(\bnr\s*=\s*)#/gi, `$1${currentId}`);

    // Update or append the marker line.
    if (/#\s*ID_INCREMENTAL\s*=/.test(next)) {
      next = next.replace(/#\s*ID_INCREMENTAL\s*=\s*#?/gi, `#ID_INCREMENTAL=${currentId}`);
      next = next.replace(/(#ID_INCREMENTAL=)\d+/gi, `$1${currentId}`);
    } else {
      next = next.replace(/\s+$/g, "") + `\n#ID_INCREMENTAL=${currentId}\n`;
    }

    fs.writeFileSync(tempPath, next, "utf-8");

    const cleanup = () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    };

    return { tempPath, cleanup };
  }
}
