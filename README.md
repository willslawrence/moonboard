# MoonBoard Direct

Drive a MoonBoard v1 LED controller directly over BLE — no Arduino replacement
controller, no Raspberry Pi. We act as the BLE central and write the same
`l#S5,P9,E18#` ASCII string to the Nordic UART Service that the official app uses.

- **`docs/index.html`** — single-page control UI, with all **549 MoonBoard 2016
  benchmarks** built in: search by name or setter, filter by grade, tap one to
  light it. Row 1 doubles as a grade meter — one light per V-grade, left to
  right (no benchmark uses row 1, so it's free). The bar runs B1..K1 - A1 is
  index 0 and doesn't light - three green, three blue, then red, and it
  flashes three times on send so it reads as a grade rather than as holds. The page is search-and-light only; log your sends in
  the real MoonBoard app. iPhone: open in
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

## Board image

`docs/board-2016.png` is the 2016 wall photo from Moonboard-Guidebook (MIT), with
rings drawn over it the way the official app does. Hold centres on the 450x692
source are `x = 65 + (col-1)*34.6`, `y = 60 + (18-row)*34.6`, `r = 20`; the page
stores those as percentages so the overlay scales with the image. Column letters
and row numbers are printed on the photo. The wall artwork itself is Moon
Climbing's — fine for a personal page, not for anything you ship.

## Benchmark data

The 549 problems are the 2016-40 subset of
[smchase/Moonboard-Guidebook](https://github.com/smchase/Moonboard-Guidebook)'s
`benchmarks.json`, inlined into the page so it works with no network at the wall.
Holds arrive as `E6`-style grid refs and go through the same `holdNum()` as
hand-tapped problems, so the calibration dropdown still governs the payload.

## Setup

```bash
python3 -m venv .venv && ./.venv/bin/pip install bleak
./go.sh
```

## Relay (drive the wall remotely)

`relay/` is a Cloudflare Worker at `moonboard-relay.willslawrence.workers.dev`.
The phone opens a WebSocket to `/ws?room=<code>` and acts as the BLE bridge;
anything POSTed to `/send?room=<code>` is written to the wall.

The **room code is the only secret** and is never committed — it lives in
`.relay-room` (gitignored) or `$MOONBOARD_ROOM`.

```bash
./relay.sh "l#S36,P37,E38#"     # one payload
./go.sh --relay show            # any command, over the relay
```

Deploy: `cd relay && npx wrangler deploy`
