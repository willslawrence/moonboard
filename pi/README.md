# The Pi

A Raspberry Pi 5 on the majlis ceiling takes the place of the phone that used to
stay awake by the wall holding its Bluetooth. Nobody needs Bluefy any more: every
phone lights the wall through the relay, and the Pi writes it.

It is **asleep until a phone taps Connect**, and lets go of the wall when asked
(Settings on the page), when nobody has had the app open for 15 minutes, when the
relay has been out of reach for 2, or when the wall is switched off and not back
within 3. So the official Moon app still works whenever the crew is not climbing.

| File | What it is |
|---|---|
| `moonbridge.py` | The program. One quiet line to the relay (`/pi`), a bridge on `/ws` while it holds the wall. `--scan`, `--light`, `--fake-wall` for trying things. |
| `moonbridge.service` | Runs it for good, from boot. |
| `install.sh` | Run on the Pi: packages, security updates that install themselves, Python, Bluetooth, the service. Safe to run again. |
| `from-mac.sh` | Run on the Mac: copies this folder and the room code to the Pi and runs `install.sh`. |
| `check-card.py` | Run on the Mac after Imager writes the card: name, user, SSH key, Wi-Fi country, without printing a password. |

The relay side is in `relay/src/index.js` (`/pi`, `/pi/wake`, `/pi/sleep`, `pi` in
`/status`); the page side is the Connect button. A new card is Imager with the
settings in the vault note *Raspberry Pi Setup Day*, then `pi/from-mac.sh`.

On the Pi: `journalctl -u moonbridge -f` shows what it is doing. `~/moonbridge/env` (hand-made, never
copied over by `from-mac.sh`) pins the wall (`MOONBRIDGE_ADDRESS=C2:EF:46:4E:88:99`, confirmed 2026-10-19;
clear it if the controller is replaced) and the Bluetooth stick (`MOONBRIDGE_ADAPTER=50:3D:D1:BC:16:AE`).
Through the onboard radio the box gave Linux no name, only its Nordic UART service, which is how the
bridge finds it; through the stick it shows as "MoonBoard A".

**Bluetooth:** the wall goes through a USB stick, a TP-Link UB500 Plus in a black (USB 2) port, picked
by its address so a second stick can never take its place. The Pi's own Bluetooth is off
(`dtoverlay=disable-bt` in `/boot/firmware/config.txt`). On 2026-10-19 the stick connected 10 times out
of 10 at about 5 seconds each; the onboard radio, shared with the Wi-Fi, managed 4 of 10 at 17-31 s.
From a tap on Connect to the page saying Connected takes 8-20 seconds: longest when the wall has sat
idle (its first connect then takes about 11 s), and about 6 s of every one is the Pi opening its bridge
line to the relay. BlueZ's LE connection settings in `/etc/bluetooth/main.conf` were raised during the
onboard-radio trouble (intervals 40-80, supervision timeout 6 s; the original is `main.conf.orig`) and
kept, since every test with the stick ran on them. `node pi-real.mjs` in the vault's test rig checks
the whole path on the crew's room: Connect, the hello through the Pi, Clear, Let go, the wall left dark.

**Wi-Fi:** the Pi must use the modem's **2.4 GHz** network (`Lawrencestc_4G`). Linux does not allow the
modem's 5 GHz channel 149 under Saudi rules and drops it a minute after start-up. Both bands are one
network, so phones on 5 GHz reach the Pi as usual.
