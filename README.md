# MoonBoard Direct

Drive a MoonBoard v1 LED controller directly over BLE — no Arduino replacement
controller, no Raspberry Pi. We act as the BLE central and write the same
`l#S5,P9,E18#` ASCII string to the Nordic UART Service that the official app uses.

- **`docs/index.html`** — single-page control UI. iPhone: open in
  [Bluefy](https://apps.apple.com/app/id1492822055) (iOS Safari has no Web Bluetooth).
- **`moonprobe.py`** — macOS BLE probe. `python3 moonprobe.py go` scans, finds the
  box, and dumps its GATT services. Read-only.

## Status

Nordic UART on the v1 box is **assumed, not yet verified** — the probe answers that.
Hold numbering (1–198) is likewise unconfirmed; the page ships four ordering modes
so it can be calibrated against the physical wall.

## Safety

Read-only except the one ASCII write. Nordic DFU/bootloader UUIDs are hard-blocked
in both the script and the page.

## Setup

```bash
python3 -m venv .venv && ./.venv/bin/pip install bleak
./go.sh
```
