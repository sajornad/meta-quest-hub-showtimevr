# meta-quest-provisioner

Local macOS tool to manage Meta Quest devices via ADB.

## Run (one command)

```bash
cd /Users/danielrojasroa/.openclaw/workspace/meta-quest-provisioner
./run.sh
```

- UI: http://localhost:5173
- API: http://localhost:5179

## Settings

Settings are stored in:

- `./.data/settings.json`

Fields:
- `apkPath`: path to your APK
- `videoPath`: path to your 360 video file
- `brandingPath`: folder to push to `/sdcard/Download/`
- `configBasePath`: base `config.txt` path
- `packageName`: Android package name used for installed/uninstall checks
- `lastUsedID`: integer 1-50
- `autoIncrement`: boolean

## Requirements

- `adb` installed and available in PATH
- Meta Quest connected by USB and authorized for ADB
