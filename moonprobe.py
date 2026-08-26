#!/usr/bin/env python3
"""
moonprobe.py - probe and drive a MoonBoard LED controller over BLE.

    python3 moonprobe.py go                 # scan + auto-find + full probe (safe, read-only)
    python3 moonprobe.py scan               # just list what's visible
    python3 moonprobe.py probe <addr|name>
    python3 moonprobe.py send  "l#S5,P9,P13,E18#"
    python3 moonprobe.py say "WILL WALL" [delay]    # scrolling marquee (default 0.07s/frame)
    python3 moonprobe.py show                       # USA -> KSA -> HI (held)
    python3 moonprobe.py finale                     # fast HI WILL scroll -> Will's layout, held
    python3 moonprobe.py sign                       # WILL / WALL, static, stays lit
    python3 moonprobe.py flag                       # stars and stripes, hung vertically
    python3 moonprobe.py bigtest                    # 5 S + 5 P + 5 E, one column each
    python3 moonprobe.py colors [hold]              # same hold as S, then P, then E
    python3 moonprobe.py walk  [count]              # light #1, #2, #3 ... one at a time
    python3 moonprobe.py walk  [count] [addr|name]  # ... on a specific device

Everything is also appended to probe.log next to this file.
Read-only except `send`, which writes one ASCII string - the same thing the
official MoonBoard app does. Firmware/DFU characteristics are hard-blocked.
"""

import asyncio
import json
import os
import sys
import datetime
import urllib.request
import urllib.error
from pathlib import Path

from bleak import BleakScanner, BleakClient

NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
NUS_RX      = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"   # we write here
NUS_TX      = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"   # box notifies here

# Never touch these - Nordic DFU / bootloader. Writing here is how you brick a box.
DFU_MARKERS = ("fe59", "00001530-1212-efde-1523-785feabcd123",
               "00001531-1212-efde-1523-785feabcd123",
               "00001532-1212-efde-1523-785feabcd123")

NAME_HINTS = ("moonboard", "moon", "led")
SCAN_SECONDS = 10.0
LOG = Path(__file__).with_name("probe.log")


def say(*parts):
    line = " ".join(str(p) for p in parts)
    print(line, flush=True)
    with LOG.open("a") as f:
        f.write(line + "\n")


def is_dfu(uuid: str) -> bool:
    u = uuid.lower()
    return any(m in u for m in DFU_MARKERS)


async def scan_all():
    say(f"scanning {SCAN_SECONDS:.0f}s ...")
    devices = await BleakScanner.discover(timeout=SCAN_SECONDS, return_adv=True)
    rows = []
    for addr, (d, adv) in devices.items():
        rows.append((d.name or "(no name)", addr, adv.rssi, list(adv.service_uuids or [])))
    rows.sort(key=lambda r: -r[2])
    for name, addr, rssi, uuids in rows:
        extra = f"  adv:{','.join(uuids)}" if uuids else ""
        say(f"  {rssi:>4} dBm  {name:<28} {addr}{extra}")
    return rows


def pick(rows):
    """Best guess at the MoonBoard: name hint first, then advertised NUS."""
    for name, addr, rssi, uuids in rows:
        if any(h in name.lower() for h in NAME_HINTS):
            return name, addr, "name match"
    for name, addr, rssi, uuids in rows:
        if any(NUS_SERVICE in u.lower() for u in uuids):
            return name, addr, "advertises Nordic UART"
    return None


async def dump(addr, name):
    say(f"\nconnecting to {name} @ {addr} ...")
    async with open_client(addr) as client:
        say("connected.\n")
        found_nus = writable = None
        for service in client.services:
            flag = ""
            if service.uuid.lower() == NUS_SERVICE:
                flag = "   <<< Nordic UART Service"
                found_nus = True
            if is_dfu(service.uuid):
                flag = "   <<< DFU / bootloader - DO NOT WRITE"
            say(f"SERVICE {service.uuid}{flag}")
            for c in service.characteristics:
                props = ",".join(c.properties)
                mark = ""
                if ("write" in props or "write-without-response" in props) and not is_dfu(c.uuid):
                    mark = "  <- writable"
                    if writable is None:
                        writable = c.uuid
                if is_dfu(c.uuid):
                    mark = "  <- DFU, blocked"
                say(f"  char  {c.uuid}  [{props}]{mark}")
            say("")

        if found_nus:
            say("RESULT: Nordic UART present. `send` should work as planned.")
        elif writable:
            say(f"RESULT: no Nordic UART, but a writable characteristic exists: {writable}")
        else:
            say("RESULT: no Nordic UART and nothing writable found.")


async def autofind():
    """Scan and auto-pick the MoonBoard, same logic as `go`."""
    rows = await scan_all()
    if not rows:
        say("\nnothing found. Bluetooth on? box powered? app force-quit?")
        return None
    hit = pick(rows)
    if not hit:
        say("\nno obvious MoonBoard in that list.")
        return None
    name, addr, why = hit
    say(f"\npicked: {name} @ {addr}  ({why})")
    return name, addr


async def find(target):
    if RELAY_ROOM:
        return ("relay", "relay")
    if target is None:
        return await autofind()
    rows = await scan_all()
    t = target.lower()
    for name, addr, rssi, uuids in rows:
        if addr.lower() == t or t in name.lower():
            return name, addr
    say(f"\nno match for '{target}'.")
    return None


async def cmd_go():
    say("\n" + "=" * 60)
    say(f"run at {datetime.datetime.now():%Y-%m-%d %H:%M:%S}")
    say("=" * 60)
    rows = await scan_all()
    if not rows:
        say("\nnothing found. Bluetooth on? box powered? app force-quit?")
        return
    hit = pick(rows)
    if not hit:
        say("\nno obvious MoonBoard in that list.")
        say("If you recognise one, run:  moonprobe.py probe <address>")
        return
    name, addr, why = hit
    say(f"\npicked: {name} @ {addr}  ({why})")
    await dump(addr, name)


CHUNK = 20   # default BLE MTU payload; the page chunks the same way

RELAY_HOST = "https://moonboard-relay.willslawrence.workers.dev"
RELAY_ROOM = None            # set by --relay; when set, every write goes over HTTP


class RelayClient:
    """Duck-types the bit of BleakClient we use, but POSTs to the relay Worker
    instead of writing over Bluetooth. The phone on the other end does the BLE."""

    def __init__(self, room):
        self.room = room
        self.buf = b""

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def start_notify(self, *a, **k):
        pass

    async def write_gatt_char(self, _uuid, data, response=True):
        # Callers chunk at 20 bytes; reassemble and post whole payloads.
        self.buf += bytes(data)
        if not self.buf.endswith(b"#"):
            return
        payload, self.buf = self.buf.decode("utf-8", "replace"), b""
        body = json.dumps({"payload": payload}).encode()
        req = urllib.request.Request(
            f"{RELAY_HOST}/send?room={self.room}",
            data=body, headers={"Content-Type": "application/json"}, method="POST")

        def post():
            try:
                with urllib.request.urlopen(req, timeout=15) as r:
                    return r.status, r.read().decode()
            except urllib.error.HTTPError as e:
                return e.code, e.read().decode()
            except Exception as e:
                return 0, str(e)

        status, text = await asyncio.to_thread(post)
        if status != 200:
            say(f"  relay error {status}: {text}")


def open_client(addr):
    return RelayClient(RELAY_ROOM) if RELAY_ROOM else BleakClient(addr, timeout=20.0)


async def write_payload(client, payload):
    """Write in 20-byte chunks, same as the web page does."""
    data = payload.encode("utf-8")
    say(f"  -> {payload}   ({len(data)}B, {-(-len(data)//CHUNK)} chunk(s))")
    for i in range(0, len(data), CHUNK):
        await client.write_gatt_char(NUS_RX, data[i:i + CHUNK], response=True)
        await asyncio.sleep(0.03)


def notify_handler(_, data: bytearray):
    say(f"  <- box sent: {data!r}")


async def cmd_send(target, payload):
    if not (payload.startswith("l#") and payload.endswith("#")):
        say("refusing: payload must look like  l#S5,P9,E18#")
        return
    hit = await find(target)
    if not hit:
        return
    name, addr = hit
    say(f"\nconnecting to {name} @ {addr} ...")
    async with open_client(addr) as client:
        say("connected.")
        try:
            await client.start_notify(NUS_TX, notify_handler)
        except Exception as e:
            say(f"  (no notify channel: {e})")
        await write_payload(client, payload)
        say("  written. watching 5s - look at the wall.")
        await asyncio.sleep(5.0)
    say("done.")


async def cmd_walk(target, count):
    """Calibration: light one hold at a time so the numbering can be read off the wall."""
    hit = await find(target)
    if not hit:
        return
    name, addr = hit
    say(f"\nconnecting to {name} @ {addr} ...")
    async with open_client(addr) as client:
        say("connected.\n")
        for n in range(1, count + 1):
            payload = f"l#S{n}#"
            say(f"  -> {payload}   <-- which hold lit?")
            await client.write_gatt_char(NUS_RX, payload.encode("utf-8"), response=True)
            await asyncio.sleep(4.0)
        say("\nclearing.")
        await client.write_gatt_char(NUS_RX, b"l##", response=True)
    say("done. Tell Claude which physical hold lit for each number.")


async def cmd_colors(target, hold):
    """Light ONE hold as each type in turn, so the real colour map can be read off."""
    hit = await find(target)
    if not hit:
        return
    name, addr = hit
    say(f"\nconnecting to {name} @ {addr} ...")
    async with open_client(addr) as client:
        say("connected.\n")

        async def w(payload, note, dwell=8.0):
            say(f"  -> {payload}   <-- {note}")
            await client.write_gatt_char(NUS_RX, payload.encode("utf-8"), response=True)
            await asyncio.sleep(dwell)

        say(f"  LOOK AT HOLD {hold}. Starting in 3s ...")
        await asyncio.sleep(3.0)
        await w("l##", "wall should now be DARK - does it clear?")
        for kind, label in (("S", "start"), ("P", "move"), ("E", "end")):
            await w(f"l#{kind}{hold}#", f"'{kind}' ({label}) - what colour is that hold?")
        await w("l##", "clearing again")
    say("done. Report: did l## go dark, and the colour for S / P / E.")


def idx(col, row):
    """0-based serpentine: odd columns bottom->top, even columns top->bottom."""
    return (col - 1) * 18 + ((row - 1) if col % 2 else (18 - row))


FONT = {
    "W": ["X...X", "X...X", "X.X.X", "XX.XX", "X...X"],
    "I": ["XXX", ".X.", ".X.", ".X.", "XXX"],
    "L": ["X..", "X..", "X..", "X..", "XXX"],
    "A": [".X.", "X.X", "XXX", "X.X", "X.X"],
    "H": ["X.X", "X.X", "XXX", "X.X", "X.X"],
    " ": ["..", "..", "..", "..", ".."],
}


def text_columns(text):
    """Render text to a list of columns; each column is (set_of_font_rows, letter_index)."""
    cols = []
    for i, ch in enumerate(text.upper()):
        glyph = FONT.get(ch, FONT[" "])
        width = len(glyph[0])
        for x in range(width):
            rows = {y for y in range(5) if glyph[y][x] == "X"}
            cols.append((rows, i))
        cols.append((set(), i))          # 1-column gap after each letter
    return cols


FONT3 = {
    "W": ["X...X", "X.X.X", ".X.X."],
    "I": ["XXX", ".X.", "XXX"],
    "L": ["X..", "X..", "XXX"],
    "A": [".X.", "XXX", "X.X"],
}


def sign_cells():
    """WILL over WALL, two letters per line - the only way 4 letters fit in 11 columns.
    WILL green (S), WALL blue (P); S+P with no E is a proven-good combination."""
    lines = [("W", "I", 16, "S"), ("L", "L", 12, "S"),
             ("W", "A", 6, "P"),  ("L", "L", 2, "P")]
    cells = {}
    for a, b, base, kind in lines:
        rows = [FONT3[a][y] + "." + FONT3[b][y] for y in range(3)]
        for y, line in enumerate(rows):
            for x, ch in enumerate(line):
                if ch == "X":
                    cells[(x + 1, base + 2 - y)] = kind
    return cells


# Will's own layout, read off his screenshot: WILL across the top, HI below.
WILL_HI = [
    (7, 18), (9, 18), (11, 18),
    (9, 17), (11, 17),
    (1, 16), (5, 16), (7, 16), (9, 16), (11, 16),
    (1, 15), (3, 15), (5, 15), (7, 15), (9, 15), (11, 15),
    (2, 14), (4, 14), (7, 14), (9, 14), (11, 14),
    (2, 11), (5, 11), (7, 11), (8, 11), (9, 11), (10, 11), (11, 11),
    (2, 10), (5, 10), (9, 10),
    (2, 9), (3, 9), (4, 9), (5, 9), (9, 9),
    (2, 8), (5, 8), (9, 8),
    (2, 7), (5, 7), (7, 7), (8, 7), (9, 7), (10, 7), (11, 7),
]


FONT7 = {
    "U": ["X.X", "X.X", "X.X", "X.X", "X.X", "X.X", "XXX"],
    "S": ["XXX", "X..", "X..", "XXX", "..X", "..X", "XXX"],
    "A": [".X.", "X.X", "X.X", "XXX", "X.X", "X.X", "X.X"],
    "K": ["X.X", "X.X", "XX.", "X..", "XX.", "X.X", "X.X"],
    "H": ["X.X", "X.X", "X.X", "XXX", "X.X", "X.X", "X.X"],
    "I": ["XXX", ".X.", ".X.", ".X.", ".X.", ".X.", "XXX"],
}
WORD_TOP = 12          # 7 rows tall -> occupies rows 6..12


def word_cells(word, kinds):
    """3-wide glyphs with 1-column gaps. Three letters fill all 11 columns exactly."""
    cells = {}
    span = len(word) * 4 - 1
    left = (11 - span) // 2 + 1
    for i, ch in enumerate(word.upper()):
        glyph = FONT7[ch]
        for y, line in enumerate(glyph):
            for x, c in enumerate(line):
                if c == "X":
                    cells[(left + i * 4 + x, WORD_TOP - y)] = kinds[i % len(kinds)]
    return cells


async def cmd_show(target):
    """HI blue -> KSA green -> USA red/blue, held."""
    seq = [("HI",  ["P"],            2.5),
           ("KSA", ["S"],            2.5),
           ("USA", ["E", "P", "E"],  None)]
    for word, kinds, _ in seq:
        cells = word_cells(word, kinds)
        say(f"\n{word}  ({len(cells)} holds)")
        for r in range(13, 4, -1):
            say("   " + " ".join("#" if (c, r) in cells else "." for c in range(1, 12)))

    hit = await find(target)
    if not hit:
        return
    name, addr = hit
    say(f"\nconnecting to {name} @ {addr} ...")
    async with open_client(addr) as client:
        say("connected.")
        for word, kinds, hold in seq:
            cells = word_cells(word, kinds)
            parts = [f"{k}{idx(c, r)}" for (c, r), k in
                     sorted(cells.items(), key=lambda kv: "SPE".index(kv[1]))]
            payload = "l#" + ",".join(parts) + "#"
            say(f"  {word}: {len(payload)}B")
            await write_payload(client, payload)
            if hold:
                await asyncio.sleep(hold)
    say("\ndone - USA stays lit.")


async def cmd_finale(target):
    """Scroll HI WILL fast, then land on Will's own layout and hold it."""
    payload = "l#" + ",".join(f"S{idx(c, r)}" for c, r in WILL_HI) + "#"
    say(f"\nfinal frame: {len(WILL_HI)} holds, {len(payload)} bytes")
    for r in range(18, 0, -1):
        say(f"{r:>2} " + " ".join("#" if (c, r) in WILL_HI else "." for c in range(1, 12)))
    say("   " + " ".join("ABCDEFGHIJK"))

    hit = await find(target)
    if not hit:
        return
    name, addr = hit
    say(f"\nconnecting to {name} @ {addr} ...")
    async with open_client(addr) as client:
        say("connected. scrolling ...")
        cols = text_columns("HI WILL")
        for shift in range(-11, len(cols) + 1):
            cells = {}
            for sc in range(1, 12):
                src = sc - 1 + shift
                if 0 <= src < len(cols):
                    rows, letter = cols[src]
                    for fy in rows:
                        br = 7 + (4 - fy)
                        if 1 <= br <= 18:
                            cells[(sc, br)] = "SPE"[letter % 3]
            parts = [f"{k}{idx(c, r)}" for (c, r), k in
                     sorted(cells.items(), key=lambda kv: "SPE".index(kv[1]))]
            data = ("l#" + ",".join(parts) + "#").encode()
            for i in range(0, len(data), CHUNK):
                await client.write_gatt_char(NUS_RX, data[i:i + CHUNK], response=True)
            await asyncio.sleep(0.03)

        await client.write_gatt_char(NUS_RX, b"l##", response=True)
        await asyncio.sleep(0.4)
        say("landing on WILL / HI ...")
        await write_payload(client, payload)
    say("\ndone - stays lit.")


async def cmd_sign(target):
    cells = sign_cells()
    for r in range(18, 0, -1):
        say(f"{r:>2} " + " ".join("#" if (c, r) in cells else "." for c in range(1, 12)))
    say("   " + " ".join("ABCDEFGHIJK"))

    parts = [f"{k}{idx(c, r)}" for (c, r), k in
             sorted(cells.items(), key=lambda kv: "SPE".index(kv[1]))]
    payload = "l#" + ",".join(parts) + "#"
    say(f"\n{len(cells)} holds, {len(payload)} bytes "
        f"(125B worked, 562B did not - this is the in-between test)")

    hit = await find(target)
    if not hit:
        return
    name, addr = hit
    say(f"\nconnecting to {name} @ {addr} ...")
    async with open_client(addr) as client:
        say("connected.")
        await write_payload(client, payload)
    say("\ndone - it stays lit until the next command.")


async def cmd_say(target, text, base_row, delay):
    """Scroll text across the board. Small per-frame payloads stay under the box's buffer."""
    cols = text_columns(text)
    types = "SPE"                        # each letter a different colour, keeps strings well-formed

    def frame(shift):
        cells = {}
        for screen_col in range(1, 12):
            src = screen_col - 1 + shift
            if 0 <= src < len(cols):
                rows, letter = cols[src]
                for fy in rows:
                    board_row = base_row + (4 - fy)
                    if 1 <= board_row <= 18:
                        cells[(screen_col, board_row)] = types[letter % 3]
        return cells

    hit = await find(target)
    if not hit:
        return
    name, addr = hit
    say(f"\nconnecting to {name} @ {addr} ...")
    async with open_client(addr) as client:
        say(f"connected. scrolling {text!r} ...\n")
        peak = 0
        for shift in range(-11, len(cols) + 1):
            cells = frame(shift)
            parts = [f"{k}{idx(c, r)}" for (c, r), k in
                     sorted(cells.items(), key=lambda kv: "SPE".index(kv[1]))]
            payload = "l#" + ",".join(parts) + "#"
            peak = max(peak, len(payload))
            data = payload.encode()
            for i in range(0, len(data), CHUNK):
                await client.write_gatt_char(NUS_RX, data[i:i + CHUNK], response=True)
            await asyncio.sleep(delay)
        await client.write_gatt_char(NUS_RX, b"l##", response=True)
        say(f"largest frame: {peak} bytes")
    say("done.")


def flag_cells():
    """US flag hung vertically: union top-left, stripes running down.
    S=green (stars), P=blue (union field), E=red (stripes). No white LED exists."""
    CANTON_COLS, CANTON_ROWS = range(1, 7), range(12, 19)   # cols A-F, rows 12-18
    cells = {}

    # stripes: every other column red, full height outside the canton
    for col in range(1, 12):
        if col % 2 == 0:
            continue                                        # the "white" stripes stay dark
        for row in range(1, 19):
            if col in CANTON_COLS and row in CANTON_ROWS:
                continue
            cells[(col, row)] = "E"

    # union field + staggered stars
    for row in CANTON_ROWS:
        for col in CANTON_COLS:
            # stars on alternate rows only, staggered - a full checkerboard
            # reads as a checkerboard, not a star field
            star = row % 2 == 0 and ((col % 2 == 1) if (row % 4 == 2) else (col % 2 == 0))
            cells[(col, row)] = "S" if star else "P"
    return cells


def flag_preview(cells):
    glyph = {"S": "*", "P": "#", "E": "=", None: "."}
    out = []
    for row in range(18, 0, -1):
        line = f"{row:>2} " + " ".join(glyph[cells.get((c, row))] for c in range(1, 12))
        out.append(line)
    out.append("   " + " ".join("ABCDEFGHIJK"))
    out.append("   * green star   # blue field   = red stripe   . unlit")
    return "\n".join(out)


async def cmd_flag(target):
    cells = flag_cells()
    say("\n" + flag_preview(cells))
    parts = [f"{kind}{idx(c, r)}" for (c, r), kind in
             sorted(cells.items(), key=lambda kv: "SPE".index(kv[1]))]
    payload = "l#" + ",".join(parts) + "#"
    say(f"\n{len(cells)} holds, {len(payload)} bytes")

    hit = await find(target)
    if not hit:
        return
    name, addr = hit
    say(f"\nconnecting to {name} @ {addr} ...")
    async with open_client(addr) as client:
        say("connected.")
        await write_payload(client, payload)
    say("\n\U0001f1fa\U0001f1f8 done - go look at the wall.")


async def cmd_bigtest(target):
    """5 starts, 5 moves, 5 ends - one vertical bar per type, easy to read back."""
    bars = [("S", 1, "A"), ("P", 3, "C"), ("E", 5, "E")]
    parts, legend = [], []
    for kind, col, letter in bars:
        holds = [idx(col, r) for r in range(2, 7)]
        parts += [f"{kind}{h}" for h in holds]
        legend.append(f"  {kind} -> column {letter}, rows 2-6  (indices {holds[0]}-{holds[-1]})")
    payload = "l#" + ",".join(parts) + "#"

    hit = await find(target)
    if not hit:
        return
    name, addr = hit
    say(f"\nconnecting to {name} @ {addr} ...")
    async with open_client(addr) as client:
        say("connected.\n")
        try:
            await client.start_notify(NUS_TX, notify_handler)
        except Exception as e:
            say(f"  (no notify channel: {e})")
        await write_payload(client, payload)
    say("\nexpected layout - three vertical bars of 5, rows 2-6:")
    for l in legend:
        say(l)
    say("\nRead back the colour of each bar. Wall stays lit until the next command.")


def main():
    global RELAY_ROOM
    args = sys.argv[1:]
    if args and args[0] == "--relay":
        args = args[1:]
        COMMANDS = {"go", "scan", "probe", "send", "walk", "colors",
                    "bigtest", "flag", "say", "sign", "finale", "show"}
        RELAY_ROOM = (args.pop(0) if args and args[0] not in COMMANDS else None) \
            or os.environ.get("MOONBOARD_ROOM") \
            or (Path(__file__).with_name(".relay-room").read_text().strip()
                if Path(__file__).with_name(".relay-room").exists() else None)
        if not RELAY_ROOM:
            print("no room code: pass it, set MOONBOARD_ROOM, or create .relay-room")
            return
        say(f"(relay mode - room {RELAY_ROOM[:9]}…)")
    if not args:
        print(__doc__)
        return
    cmd = args[0]
    if cmd == "go":
        asyncio.run(cmd_go())
    elif cmd == "scan":
        asyncio.run(scan_all())
    elif cmd == "probe":
        async def r():
            hit = await find(args[1] if len(args) > 1 else None)
            if hit:
                await dump(hit[1], hit[0])
        asyncio.run(r())
    elif cmd == "show":
        asyncio.run(cmd_show(args[1] if len(args) > 1 else None))
    elif cmd == "finale":
        asyncio.run(cmd_finale(args[1] if len(args) > 1 else None))
    elif cmd == "sign":
        asyncio.run(cmd_sign(args[1] if len(args) > 1 else None))
    elif cmd == "say":
        rest = args[1:]
        text = rest[0] if rest else "WILL WALL"
        delay = 0.07
        for a in rest[1:]:
            try:
                delay = float(a)
            except ValueError:
                pass
        asyncio.run(cmd_say(None, text, 7, delay))
    elif cmd == "flag":
        asyncio.run(cmd_flag(args[1] if len(args) > 1 else None))
    elif cmd == "bigtest":
        asyncio.run(cmd_bigtest(args[1] if len(args) > 1 else None))
    elif cmd == "colors":
        rest = args[1:]
        target, hold = None, 0
        for a in rest:
            if a.isdigit():
                hold = int(a)
            else:
                target = a
        asyncio.run(cmd_colors(target, hold))
    elif cmd == "walk":
        rest = args[1:]
        target = None
        n = 3
        for a in rest:
            if a.isdigit():
                n = int(a)
            else:
                target = a
        asyncio.run(cmd_walk(target, n))
    elif cmd == "send" and len(args) >= 2:
        # target optional:  send "l#...#"   or   send <name> "l#...#"
        if len(args) == 2:
            asyncio.run(cmd_send(None, args[1]))
        else:
            asyncio.run(cmd_send(args[1], args[2]))
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
