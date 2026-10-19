#!/bin/bash
# Sets up the Pi's seat at the MoonBoard. Run ON THE PI, as will, from ~/moonbridge
# (from-mac.sh copies the files there and runs this). Safe to run again: it only
# brings things to where they should be.
set -euo pipefail
cd "$(dirname "$0")"
DIR=$PWD

[ "$(id -un)" = will ] || { echo "run this as will"; exit 1; }
[ -s room ] || { echo "no room file - from-mac.sh copies it from the Mac"; exit 1; }
chmod 600 room

echo "== packages (and security updates that install themselves)"
APT='sudo DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300'   # waits out an update already running
$APT update -qq
$APT install -y -qq python3-venv bluez iw unattended-upgrades
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' |
  sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null

echo "== Python for the bridge (pinned in requirements.txt)"
[ -x venv/bin/python ] || python3 -m venv venv
venv/bin/pip install -q --upgrade pip
venv/bin/pip install -q -r requirements.txt

echo "== Bluetooth on, and this user allowed to use it"
sudo rfkill unblock bluetooth || true
sudo usermod -aG bluetooth will

echo "== Wi-Fi never dozes (a dozing radio is slow to answer the relay)"
printf '[connection]\nwifi.powersave = 2\n' |
  sudo tee /etc/NetworkManager/conf.d/99-wifi-powersave-off.conf >/dev/null
sudo iw dev wlan0 set power_save off 2>/dev/null || true

echo "== the service"
sudo install -m 644 moonbridge.service /etc/systemd/system/moonbridge.service
sudo systemctl daemon-reload
sudo systemctl enable moonbridge >/dev/null
sudo systemctl restart moonbridge
sleep 3
systemctl --no-pager --lines=8 status moonbridge || true
echo
echo "done - the bridge is asleep until a phone taps Connect. Its log: journalctl -u moonbridge -f"
