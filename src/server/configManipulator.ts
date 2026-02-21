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

    const appended = base.replace(/\s+$/g, "") + `\n#ID_INCREMENTAL=${currentId}\n`;
    fs.writeFileSync(tempPath, appended, "utf-8");

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
