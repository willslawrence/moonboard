#!/usr/bin/env python3
"""
check-card.py - read the Pi's freshly written card on the Mac, before it goes up
the ladder: is the name right, is Wi-Fi set for Saudi Arabia, will this Mac's
key let Claude in? Reads only, and never prints a password.

    python3 pi/check-card.py [/Volumes/bootfs]

After Raspberry Pi Imager has written the card it ejects it: take the reader out
and put it back, and the card's first part shows up as /Volumes/bootfs.
"""
import re
import sys
from pathlib import Path

WANT_HOST = "majlis-pi"
WANT_USER = "will"
WANT_COUNTRY = "SA"

vol = Path(sys.argv[1] if len(sys.argv) > 1 else "/Volumes/bootfs")
bad = 0


def row(ok, text):
    global bad
    bad += 0 if ok else 1
    print(("  ✅ " if ok else "  ⚠️  ") + text)


if not (vol / "config.txt").exists():
    sys.exit(f"no Raspberry Pi card at {vol} - is the reader plugged in? (ls /Volumes)")

ud = (vol / "user-data").read_text(errors="replace") if (vol / "user-data").exists() else ""
nc = (vol / "network-config").read_text(errors="replace") if (vol / "network-config").exists() else ""
legacy = (vol / "firstrun.sh").exists()
print(f"card at {vol}")
row(ud.startswith("#cloud-config") or legacy, "settings from Imager are on the card"
    + (" (old style, firstrun.sh)" if legacy and not ud.startswith("#cloud-config") else ""))

# what Imager writes is plain YAML; a line scan is enough for a checklist
host = re.search(r"^hostname:\s*['\"]?([\w.-]+)", ud, re.M)
row(bool(host) and host.group(1) == WANT_HOST,
    f"name: {host.group(1) if host else '(none)'} (want {WANT_HOST})")

users = re.findall(r"^\s*-?\s*name:\s*['\"]?([\w.-]+)", ud, re.M)
row(WANT_USER in users, f"user: {', '.join(users) or '(none)'} (want {WANT_USER})")

pub = Path.home() / ".ssh/id_ed25519.pub"
key = pub.read_text().split()[1] if pub.exists() else None
row(bool(key) and key in ud, "this Mac's SSH key is on it (so Claude can log in)")
ssh_on = re.search(r"^\s*enable_ssh:\s*true", ud, re.M) or "ssh_authorized_keys" in ud or legacy
row(bool(ssh_on), "remote login (SSH) switched on")

tz = re.search(r"^timezone:\s*['\"]?([\w/+-]+)", ud, re.M)
row(bool(tz) and tz.group(1) == "Asia/Riyadh", f"time zone: {tz.group(1) if tz else '(none)'}")

country = re.search(r"regulatory-domain:\s*['\"]?([A-Z]{2})", nc)
row(bool(country) and country.group(1) == WANT_COUNTRY,
    f"Wi-Fi country: {country.group(1) if country else '(none)'} (want {WANT_COUNTRY})")
nets = re.findall(r"^\s+['\"]?([^'\"\n]+?)['\"]?:\s*$", nc.split("access-points:", 1)[1], re.M) \
    if "access-points:" in nc else []
nets = [n for n in nets if n.strip() not in ("password", "auth", "hidden")]
row(bool(nets), f"Wi-Fi network: {', '.join(nets) or '(none)'}")
row(bool(re.search(r"^\s+password:\s*\S", nc, re.M)), "Wi-Fi password is set (not shown)")

print()
print("all good - card into the Pi" if not bad else f"{bad} thing(s) to look at before it goes up")
sys.exit(1 if bad else 0)
