#!/usr/bin/env bash
# Runs ON THE VM (called by push.sh). Installs/updates the Salasar media server as a
# systemd service. Everything lives in ~/salasar:
#   ~/salasar/app/                  server code
#   ~/salasar/data/                 guests/, photos/, guests.csv  ← the archive
#   ~/salasar/salasar.env           settings
#   ~/salasar/service-account.json  Firebase admin key (chmod 600)
# It never touches anything outside ~/salasar except its own systemd unit.
set -euo pipefail

BASE="$HOME/salasar"
APP="$BASE/app"
# Node lives in ~/salasar/node so nothing system-wide changes for other projects.
export PATH="$BASE/node/bin:$PATH"
cd "$APP"

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "✖ Node.js 20+ is required on the VM (found: $(node -v 2>/dev/null || echo none))."
  echo "  Unpack a Node 22 linux tarball into $BASE/node and re-run."
  exit 1
fi

mkdir -p "$BASE/data"
chmod 700 "$BASE" "$BASE/data"
[ -f "$BASE/service-account.json" ] && chmod 600 "$BASE/service-account.json"
[ -f "$BASE/salasar.env" ] || { echo "✖ $BASE/salasar.env is missing"; exit 1; }
chmod 600 "$BASE/salasar.env"

npm ci --omit=dev --no-audit --no-fund --silent

sudo tee /etc/systemd/system/salasar-media.service >/dev/null <<UNIT
[Unit]
Description=Salasar media server (ID photos + guest archive)
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$APP
Environment=ENV_FILE=$BASE/salasar.env
Environment=GOOGLE_APPLICATION_CREDENTIALS=$BASE/service-account.json
Environment=DATA_DIR=$BASE/data
ExecStart=$(command -v node) src/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable salasar-media >/dev/null 2>&1
sudo systemctl restart salasar-media
sleep 2
PORT=$(grep -E '^PORT=' "$BASE/salasar.env" | cut -d= -f2 || true)
curl -fsS "http://127.0.0.1:${PORT:-8080}/health" && echo && echo "✔ salasar-media is running" || { sudo journalctl -u salasar-media -n 30 --no-pager; exit 1; }
