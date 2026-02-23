# meta-quest-provisioner

Local macOS tool to manage Meta Quest devices via ADB, installing Config.txt, 360 Video, Branding to Showtime VR.

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
- `apkPath`: path to your APK (**installed first** in provisioning)
- `videoPath`: path to your 360 video file
- `brandingPath`: local folder to push
- `configBasePath`: base `config.txt` path
- `packageName`: Android package name used for installed/uninstall checks
- `remoteConfigPath`: remote destination for config on the Quest
- `remoteBrandingDir`: remote destination directory for branding on the Quest
- `remoteVideoPath`: remote destination for the 360 video on the Quest
- `lastUsedID`: integer 1-50
- `autoIncrement`: boolean

## Requirements

- `adb` installed and available in PATH
- Meta Quest connected by USB and authorized for ADB
