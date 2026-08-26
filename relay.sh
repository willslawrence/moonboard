#!/bin/bash
# Send one payload through the relay:  ./relay.sh "l#S36,P37,E38#"
cd "$(dirname "$0")"
ROOM="${MOONBOARD_ROOM:-$(cat .relay-room 2>/dev/null)}"
[ -z "$ROOM" ] && { echo "no room code (.relay-room missing)"; exit 1; }
curl -s -X POST "https://moonboard-relay.willslawrence.workers.dev/send?room=$ROOM" \
  -H 'Content-Type: application/json' -d "{\"payload\":\"$1\"}"; echo
