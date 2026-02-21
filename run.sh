#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR"

echo "[meta-quest-provisioner] Installing root deps (if needed)…"
npm install

echo "[meta-quest-provisioner] Installing client deps (if needed)…"
( cd client && npm install )

echo "[meta-quest-provisioner] Starting dev servers…"
echo "  UI:  http://localhost:5173"
echo "  API: http://localhost:5179"

npm run dev
