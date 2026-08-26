#!/usr/bin/env python3
"""
moonprobe.py - probe and drive a MoonBoard LED controller over BLE.

    python3 moonprobe.py go                 # scan + auto-find + full probe (safe, read-only)
    python3 moonprobe.py scan               # just list what's visible
    python3 moonprobe.py probe <addr|name>
    python3 moonprobe.py send  <addr|name> "l#S5,P9,P13,E18#"

Everything is also appended to probe.log next to this file.
Read-only except `send`, which writes one ASCII string - the same thing the
official MoonBoard app does. Firmware/DFU characteristics are hard-blocked.
"""

import asyncio
import sys
import datetime
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
    async with BleakClient(addr, timeout=20.0) as client:
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


async def find(target):
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
    async with BleakClient(addr, timeout=20.0) as client:
        say("connected.")
        try:
            await client.start_notify(NUS_TX, notify_handler)
        except Exception as e:
            say(f"  (no notify channel: {e})")
        say(f"  -> writing: {payload}")
        await client.write_gatt_char(NUS_RX, payload.encode("utf-8"), response=False)
        say("  written. watching 5s - look at the wall.")
        await asyncio.sleep(5.0)
    say("done.")


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    cmd = args[0]
    if cmd == "go":
        asyncio.run(cmd_go())
    elif cmd == "scan":
        asyncio.run(scan_all())
    elif cmd == "probe" and len(args) == 2:
        async def r():
            hit = await find(args[1])
            if hit:
                await dump(hit[1], hit[0])
        asyncio.run(r())
    elif cmd == "send" and len(args) == 3:
        asyncio.run(cmd_send(args[1], args[2]))
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
