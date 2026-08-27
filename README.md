# MoonBoard Direct

Drive a MoonBoard v1 LED controller directly over BLE — no Arduino replacement
controller, no Raspberry Pi. We act as the BLE central and write the same
`l#S5,P9,E18#` ASCII string to the Nordic UART Service that the official app uses.

- **`docs/index.html`** — single-page control UI, with all **549 MoonBoard 2016
  benchmarks** built in: search by name or setter, filter by grade, tap one to
  light it. Row 1 doubles as a grade meter — one light per V-grade, left to
  right (no benchmark uses row 1, so it's free). The bar runs B1..K1 - A1 is
  index 0 and doesn't light - five green up to V5, two blue for V6-V7, red from
  V8. The grade pill in the page uses the same thresholds. The page is search-and-light only; log your sends in
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

## Tick lists

Shared projects, no logins. The name picker in the header is who you are - set once,
remembered on the device - and the picker beside the search box is whose list you're
looking at. They're deliberately
separate: saving a problem shouldn't change what's on screen. The relay Worker holds one
Durable Object with everyone's lists — `GET /lists`, `POST /lists/person`, `/lists/tick`, `/lists/done` — so Will, Sara
and Abdu each keep a list and all three can see the others'. Problems are keyed by their
MoonBoard id. Anyone with the page can write; that's the point.

## Logbook

**Try** logs one attempt, **Climbed** asks how it went. Because the attempts are counted, the
app works out the grade for you: no tries logged means flash, one means 2nd go, three or more
means 4+. The chooser arrives with that already picked and you tap to confirm, or pick another
if it's wrong. **Undo my last entry** walks back a mis-tap.

Rows live in the relay Worker as an append-only `log:` prefix, with a per-person `stats:`
index carrying the attempt count and last result. `/lists` returns the index; the rows
themselves are only fetched when the **Logbook** panel opens, so the log can grow without
slowing the page. `done:` is still the chip and filter index and is kept in step by the same
write.

**Hide what I've climbed** in the filter panel drops anything you've ticked, so a session
list is what's actually left. The filter button carries a green dot whenever it or the grade
range is filtering, so a short list never looks like a bug.

**+ List** saves a problem to your list and tapping it again takes it off. **Climbed** logs
it globally against your name — everyone sees it. Who has climbed the selected problem runs
down the gutter left of the board, and each list row carries the same names as coloured
chips.

## Points

MoonBoard's own scheme: base 350 at 5+ climbing 50 a grade to 1200 at 8C, off the **setter**
grade, plus a bonus for a quick ascent - flash +53, second try +2, third try +1, nothing
beyond. Benchmarks only, and only the **first** successful ascent counts, so sending something
second go and flashing it later still scores the second go. That's why `stats` keeps the sends
in order rather than just the latest one. Ticks that predate the logbook have no recorded
result and score base with no bonus.

The top ten sits under the logbook; your own row is highlighted and pinned below if you're
outside it. Scores are worked out in the page from data it already has - no extra endpoint.

## Snake

Behind the **Snake** button. Played on B-K by the full 18 rows: column A sits out because A1
is index 0 and won't light, and A2 and A4 are dead. Green body, blue head, red food; swipe the
grid or use the arrows. It speeds up as it grows.

Snake suits this box in a way Tetris doesn't. Every write redraws the whole wall, and the safe
payload is about 250 bytes - roughly 49 lit LEDs. A Tetris stack passes that at four or five
rows and the string starts truncating. A snake is a few dozen cells however long the game runs,
and constant movement makes a full redraw read as animation rather than flicker. Best lengths
are kept per climber.

## Connect four

Behind the **Connect four** button at the bottom right, beside Settings. Opens as a full screen sheet and starts a game.

Each seat takes a climber from the tick-list roster, and a chess clock gives both the same
budget - two minutes by default - counting down only on their own turn. Run out and you lose
on time. A win is recorded against the winner's name and the ranking below the board shows
who's ahead; top of the pile is king of the board. Wins only count when both seats are
named, so a knockabout doesn't pollute the record. Seven columns on C–I, six rows on 7–12 — middle of the
wall, clear of the dead A2 and A4 holds. Green plays first, blue second, and a winning
line goes red. One write per move, which suits a protocol that only does whole-wall
rewrites.

Whose turn it is shows two ways: a pulsing coloured dot in the page, and row 14 on the
wall lit in that player's colour. The wall marker pulses at 1.2s, which rewrites the whole
board each frame - the pieces wink along with it, so there's a switch to leave the marker
steady instead.

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
