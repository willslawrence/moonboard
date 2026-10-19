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

On the Pi: `journalctl -u moonbridge -f` shows what it is doing.
