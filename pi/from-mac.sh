#!/bin/bash
# Run ON THE MAC once the Pi is on the Wi-Fi: copies the bridge to it, with the
# room code from .relay-room, and installs it there. Again any time this folder
# changes. A new card for the Pi is: Imager (see the vault's setup note), then this.
#
#   pi/from-mac.sh [host]        host defaults to majlis-pi.local
set -euo pipefail
cd "$(dirname "$0")"
HOST=${1:-majlis-pi.local}
SSH="ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new will@$HOST"

[ -s ../.relay-room ] || { echo "no ../.relay-room on this Mac"; exit 1; }
$SSH 'mkdir -p ~/moonbridge'
scp -q -o StrictHostKeyChecking=accept-new moonbridge.py requirements.txt moonbridge.service install.sh "will@$HOST:moonbridge/"
scp -q ../.relay-room "will@$HOST:moonbridge/room"
$SSH 'bash ~/moonbridge/install.sh'
