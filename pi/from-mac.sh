#!/bin/bash
# Run ON THE MAC once the Pi is on the Wi-Fi: copies the bridge to it, with the
# crew's room code (the page's DEFAULT_ROOM, so the two can never differ), and installs it there. Again any time this folder
# changes. A new card for the Pi is: Imager (see the vault's setup note), then this.
#
#   pi/from-mac.sh [host]        host defaults to majlis-pi.local
set -euo pipefail
cd "$(dirname "$0")"
HOST=${1:-majlis-pi.local}
SSH="ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new will@$HOST"

ROOM=$(grep -o "const DEFAULT_ROOM = '[^']*'" ../docs/index.html | cut -d"'" -f2)
[ -n "$ROOM" ] || { echo "no DEFAULT_ROOM in docs/index.html"; exit 1; }
$SSH 'mkdir -p ~/moonbridge'
scp -q -o StrictHostKeyChecking=accept-new moonbridge.py requirements.txt moonbridge.service install.sh "will@$HOST:moonbridge/"
printf '%s\n' "$ROOM" | $SSH 'cat > ~/moonbridge/room'
$SSH 'bash ~/moonbridge/install.sh'
