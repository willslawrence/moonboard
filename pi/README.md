# The Pi

A Raspberry Pi 5 on the majlis ceiling takes the place of the phone that used to
stay awake by the wall holding its Bluetooth. Nobody needs Bluefy any more: every
phone lights the wall through the relay, and the Pi writes it.

It is **asleep until a phone taps Connect**, and lets go of the wall when asked
(Settings on the page), when nobody has had the app open for 15 minutes, when the
relay has been out of reach for 2, or when the wall is switched off and not back
within 3. So the official Moon app still works whenever the crew is not climbing.

**The lights go out when nobody is using the wall** (since 2026-10-20), so the wall can be left
switched on. Will: "after a time of inactivity... clears all the lights off the LEDs so that they
end up not being on all the time." Before the Pi lets go, for any reason but a wall that has gone,
it writes `l##` (every light out). While it holds the wall, once nothing new has been lit for 30
minutes (`MOONBRIDGE_DARK`, seconds), it does the same and tells the room, so no page shows a route
on a dark wall; the next route lights as ever. A wall that a phone or the Moon app lit, with the Pi
asleep, is theirs: the Pi cannot reach it without taking it from them.

| File | What it is |
|---|---|
| `moonbridge.py` | The program. One quiet line to the relay (`/pi`), a bridge on `/ws` while it holds the wall. `--scan`, `--light`, `--fake-wall` for trying things. |
| `moonbridge.service` | Runs it for good, from boot. |
| `install.sh` | Run on the Pi: packages, security updates that install themselves, Python, Bluetooth, the service. Safe to run again. |
| `from-mac.sh` | Run on the Mac: copies this folder and the room code to the Pi and runs `install.sh`. |
| `check-card.py` | Run on the Mac after Imager writes the card: name, user, SSH key, Wi-Fi country, without printing a password. |
| `check-dark.py` | Run on the Mac: the lights going out, against the pretend wall and a stand-in relay (13 checks, about 40 s; needs `websockets`). Not copied to the Pi. |

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
**From a tap on Connect to the page saying Connected: about 5 seconds** (2026-10-19, was 8-20). Three
things make it so, and the first one lives outside this folder:
- **The box is trusted in BlueZ** (`bluetoothctl trust C2:EF:46:4E:88:99`, once, on the stick). An
  untrusted box is forgotten 30 s after each visit and its services read afresh, about 8 s at the
  box's own slow rhythm (it asks for 20-100 ms; the stick takes 97.5). Trusted, they stay cached, on
  disk too. A new stick or a wiped `/var/lib/bluetooth` needs the trust again.
- **The program connects to the box BlueZ already knows** (`Wall.known`) instead of scanning first,
  which waited for one more of its slow adverts. That quick try gets 10 s (`KNOWN_S`): once, on
  2026-10-20, it hung a full minute while a scan then connected in 6 s. A miss searches at once.
- **The relay's address is looked up at the wake**, beside the Bluetooth. The modem sometimes drops a
  lookup, and the Pi used to wait 5 s to ask again on every bridge line. NetworkManager's `home-4G`
  also has `dns-options timeout:1,attempts:3`, so a dropped lookup anywhere costs 1 s.

`/etc/bluetooth/main.conf` asks for 15-30 ms (`MinConnectionInterval = 12`, `MaxConnectionInterval = 24`)
and a 6 s supervision timeout, but the box's own wish decides its rhythm. The original is
`main.conf.orig`. `node pi-real.mjs` in the vault's test rig checks the whole path on the crew's room:
Connect, the hello through the Pi, Clear, Let go, the wall left dark.

**Wi-Fi:** the Pi must use the modem's **2.4 GHz** network (`Lawrencestc_4G`). Linux does not allow the
modem's 5 GHz channel 149 under Saudi rules and drops it a minute after start-up. Both bands are one
network, so phones on 5 GHz reach the Pi as usual.
