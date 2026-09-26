#!/usr/bin/env bash
# Runs ON YOUR MAC. Copies the server to the VM's ~/salasar folder and (re)starts it.
#
#   media-server/deploy/push.sh ubuntu@1.2.3.4 ~/.ssh/your-vm.key
#
# The first run also uploads frontend/serviceAccountKey.json as the VM's Firebase key
# and creates ~/salasar/salasar.env from deploy/salasar.env (edit that file first).
set -euo pipefail

TARGET="${1:?usage: push.sh user@host path/to/ssh-key}"
KEY="${2:?usage: push.sh user@host path/to/ssh-key}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SSH=(ssh -i "$KEY" -o ConnectTimeout=15)

"${SSH[@]}" "$TARGET" 'mkdir -p ~/salasar/app ~/salasar/data && chmod 700 ~/salasar'

rsync -az --delete -e "ssh -i $KEY" \
  --exclude node_modules --exclude data --exclude .env --exclude 'service-account.json' \
  "$HERE/" "$TARGET:salasar/app/"

if ! "${SSH[@]}" "$TARGET" 'test -f ~/salasar/service-account.json'; then
  scp -i "$KEY" -q "$HERE/../frontend/serviceAccountKey.json" "$TARGET:salasar/service-account.json"
fi
if [ -f "$HERE/deploy/salasar.env" ]; then
  scp -i "$KEY" -q "$HERE/deploy/salasar.env" "$TARGET:salasar/salasar.env"
fi

"${SSH[@]}" "$TARGET" 'bash ~/salasar/app/deploy/install.sh'
