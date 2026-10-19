#!/usr/bin/env python3
"""
moonbridge.py - the Pi's seat at the MoonBoard.

The wall's controller takes one Bluetooth connection. Until now a phone held it,
awake on the page by the wall, and every other phone lit the wall through that
phone by way of the relay. This program takes the phone's place, from the
majlis ceiling.

It keeps one quiet line open to the relay (/pi) and stays OFF the wall, so the
official Moon app still works. When a phone taps Connect the relay asks it to
wake: it finds the wall, holds it, and joins the room on /ws as a bridge -
exactly what a phone at the wall does - and writes everyone's lights. It lets
go when asked (Settings on the page), when nobody has had the app open for 15
minutes, when the relay has been out of reach for 2, or when the wall goes away
(switched off at night) and is not back within 3.

    moonbridge.py                   run (the moonbridge service does this)
    moonbridge.py --scan            list what Bluetooth can see for 10 seconds
    moonbridge.py --probe           find the wall, connect, list its services, let go (writes nothing)
    moonbridge.py --light 'l#S36,P37,E38#'
                                    find the wall, light that, let go
    moonbridge.py --fake-wall       no Bluetooth: a pretend wall that logs what it is sent
    moonbridge.py --fake-wall=off   a pretend wall that is never found

With --fake-wall, `kill -USR1` switches the pretend wall off (the link drops and
it cannot be found) and `kill -USR2` switches it back on - for trying the
"lost" path without going near the real one.

Settings come from the environment (the service reads ~/moonbridge/env):
    MOONBRIDGE_RELAY    wss://moonboard-relay.willslawrence.workers.dev
    MOONBRIDGE_ROOM     the room code (otherwise the file `room` beside this one)
    MOONBRIDGE_NAME     MoonBoard  the wall's Bluetooth name starts with this (Linux is told no name;
                                   then the Nordic UART service it advertises is what finds it)
    MOONBRIDGE_ADDRESS             the wall's Bluetooth address, once known: then only that box will do
    MOONBRIDGE_ADAPTER             which Bluetooth adapter: its address (survives restarts) or hciN
                                   (default: BlueZ's own choice)
    MOONBRIDGE_CONNECT  60         seconds one Bluetooth connect may take
    MOONBRIDGE_HUNT     180        seconds to look for the wall before giving up
    MOONBRIDGE_IDLE     900        seconds with no page open before letting go
    MOONBRIDGE_OFFLINE  120        seconds without the relay before letting go
"""

import argparse
import asyncio
import json
import os
import re
import signal
import subprocess
import sys
import time
from contextlib import suppress
from pathlib import Path
from urllib.parse import quote

from websockets.asyncio.client import connect as ws_connect
from websockets.exceptions import InvalidStatus

NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
NUS_RX      = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"   # written with response: the box has no other kind
# Nordic DFU / bootloader. Writing there is how a box gets bricked.
DFU_MARKERS = ("fe59", "00001530-1212-efde-1523-785feabcd123",
               "00001531-1212-efde-1523-785feabcd123",
               "00001532-1212-efde-1523-785feabcd123")
PAYLOAD = re.compile(r"^l#[SPE0-9,]*#$")
CHUNK, GAP = 20, 0.03      # the page's pieces and pause; the box garbles bigger or faster
PING = 30                  # seconds between pings on the relay line (answered without waking it)
OLD_RELAY_WAIT = 600       # a relay from before the Pi has no /pi: ask again this seldom until it is deployed
SEEN_EVERY = float(os.environ.get("MOONBRIDGE_SEEN", 60))   # while holding: how often to ask when a page last looked
CONNECT_S = float(os.environ.get("MOONBRIDGE_CONNECT", 60))   # seconds a Bluetooth connect may take
REPLACED_WAIT = 300        # another copy of this program took the room's line: do not fight it for it


def log(*parts):
    print(time.strftime("%H:%M:%S"), *parts, flush=True)


def spell(seconds):
    return f"{seconds / 60:.0f} minutes" if seconds >= 120 else f"{seconds:.0f} seconds"


def short(e):
    s = str(e) or type(e).__name__
    return s if len(s) < 160 else s[:157] + "..."


def parse(raw):
    if not isinstance(raw, str):
        return None
    with suppress(ValueError):
        m = json.loads(raw)
        return m if isinstance(m, dict) else None
    return None


class Settings:
    def __init__(self):
        e = os.environ
        self.relay = e.get("MOONBRIDGE_RELAY", "wss://moonboard-relay.willslawrence.workers.dev").rstrip("/")
        room = e.get("MOONBRIDGE_ROOM", "").strip()
        if not room:
            f = Path(__file__).with_name("room")
            room = f.read_text().strip() if f.exists() else ""
        self.room = room
        self.name = e.get("MOONBRIDGE_NAME", "MoonBoard")
        self.address = e.get("MOONBRIDGE_ADDRESS", "").strip()
        self.adapter = e.get("MOONBRIDGE_ADAPTER", "").strip()     # e.g. hci1; empty = BlueZ's default
        self.hunt = float(e.get("MOONBRIDGE_HUNT", 180))
        self.idle = float(e.get("MOONBRIDGE_IDLE", 900))
        self.offline = float(e.get("MOONBRIDGE_OFFLINE", 120))

    def url(self, path):
        return f"{self.relay}{path}?room={quote(self.room)}"


class Wall:
    """The controller, over Bluetooth."""

    def __init__(self, prefix, address="", adapter=""):
        self.prefix = prefix.lower()
        self.address = address.upper()     # once known, only this box will do
        self.adapter = adapter              # hciN, or the adapter's own address so two sticks can never swap
        self.bluez = {}
        self.client = None
        self.lost = asyncio.Event()     # set when the link drops by itself

    @property
    def connected(self):
        return bool(self.client and self.client.is_connected)

    def pick_adapter(self):
        """hciN as BlueZ numbers it today. An address is looked up each time: with two USB
        sticks the numbers can change between restarts, their addresses never do."""
        a = self.adapter
        if not a:
            self.bluez = {}
        elif re.fullmatch(r"hci\d+", a):
            self.bluez = {"adapter": a}
        else:
            for d in sorted(Path("/sys/class/bluetooth").glob("hci*")):
                # the kernel gives no address in sysfs; BlueZ has it on the bus
                r = subprocess.run(["busctl", "get-property", "org.bluez", f"/org/bluez/{d.name}",
                                    "org.bluez.Adapter1", "Address"], capture_output=True, text=True)
                if a.upper() in r.stdout.upper():
                    self.bluez = {"adapter": d.name}
                    break
            else:
                raise RuntimeError(f"no Bluetooth adapter with address {a} - is the stick plugged in?")

    async def find(self, seconds):
        from bleak import BleakScanner
        self.pick_adapter()

        def match(dev, adv):
            if self.address:
                return dev.address.upper() == self.address
            # By name where it gives one; the box gives Linux none, only its service - which
            # is how the page and Moon's app find it too.
            return ((adv.local_name or dev.name or "").lower().startswith(self.prefix)
                    or NUS_SERVICE in [u.lower() for u in adv.service_uuids])
        return await BleakScanner.find_device_by_filter(match, timeout=seconds, bluez=self.bluez)

    async def connect(self, dev):
        from bleak import BleakClient
        loop = asyncio.get_running_loop()

        def gone(c):
            # Also called when we let go ourselves; by then self.client is no longer c.
            if c is self.client:
                loop.call_soon_threadsafe(self.lost.set)
        # 32s on the first real connect (2026-10-19): Bluetooth shares the Pi's radio with 2.4 GHz Wi-Fi
        client = BleakClient(dev, disconnected_callback=gone, timeout=CONNECT_S, bluez=self.bluez)
        await client.connect()
        ch = client.services.get_characteristic(NUS_RX)
        if ch is None or any(m in ch.uuid.lower() for m in DFU_MARKERS):
            with suppress(Exception):
                await client.disconnect()
            raise RuntimeError(f"{dev.name or dev.address} has no Nordic UART - not the wall")
        self.lost.clear()
        self.client = client
        return dev.name or dev.address

    async def write(self, payload):
        data = payload.encode()
        for i in range(0, len(data), CHUNK):
            await self.client.write_gatt_char(NUS_RX, data[i:i + CHUNK], response=True)
            await asyncio.sleep(GAP)

    async def let_go(self):
        c, self.client = self.client, None
        if c is not None:
            with suppress(Exception):
                await c.disconnect()


class FakeWall:
    """A pretend wall for trying everything else: it logs what it is sent."""

    def __init__(self, on=True):
        self.on = on                    # switched on, and so findable
        self.held = False
        self.lost = asyncio.Event()
        self.writes = []

    @property
    def connected(self):
        return self.held

    async def find(self, seconds):
        end = time.monotonic() + seconds         # found as soon as it is on, as a real scan would
        while not self.on:
            if time.monotonic() >= end:
                return None
            await asyncio.sleep(0.2)
        await asyncio.sleep(1.0)
        return "fake"

    async def connect(self, dev):
        self.lost.clear()
        self.held = True
        return "MoonBoard A (pretend)"

    async def write(self, payload):
        await asyncio.sleep(0.05 * (1 + len(payload) // CHUNK))
        self.writes.append(payload)
        log("pretend wall shows", payload)

    async def let_go(self):
        self.held = False

    def switch(self, on):
        self.on = on
        if not on and self.held:
            self.held = False
            self.lost.set()
        log("pretend wall switched", "on" if on else "off")


class Bridge:
    def __init__(self, cfg, wall):
        self.cfg, self.wall = cfg, wall
        self.state, self.why = "asleep", ""
        self.ctl = None                     # the /pi line, while it is open
        self.heard = time.monotonic()       # the last word from the relay on it
        self.seen_at = time.monotonic()     # when a page last looked, as the relay last said
        self.job = None                     # the task holding (or looking for) the wall
        self.release = None                 # why the job is being stopped from outside
        self.last = None                    # (payload, meta) last written: repeated when the bridge reconnects
        self.lock = asyncio.Lock()          # one write at a time; a payload goes in pieces

    # ---------- the relay line ----------

    async def tell(self, msg):
        ws = self.ctl
        if ws is not None:
            with suppress(Exception):
                await ws.send(json.dumps(msg))

    async def set_state(self, state, why=""):
        self.state, self.why = state, why
        log("now", state + (f" ({why})" if why else ""))
        await self.tell({"type": "state", "state": state, "why": why})

    async def control(self):
        """Keep the /pi line open for good, and do what comes down it."""
        wait = 2
        while True:
            replaced = False
            try:
                async with ws_connect(self.cfg.url("/pi"), ping_interval=None, open_timeout=20,
                                      close_timeout=5, max_size=2 ** 16) as ws:
                    self.ctl, self.heard, wait = ws, time.monotonic(), 2
                    log("relay line open")
                    await self.tell({"type": "state", "state": self.state, "why": self.why})
                    pinger = asyncio.create_task(self.ping(ws))
                    try:
                        async for raw in ws:
                            self.heard = time.monotonic()
                            if raw == "pong":
                                continue
                            m = parse(raw) or {}
                            kind = m.get("type")
                            if kind == "wake":
                                self.wake()
                            elif kind == "sleep":
                                await self.let_go("asked")
                            elif kind == "seen" and isinstance(m.get("ago"), (int, float)):
                                self.seen_at = time.monotonic() - max(0, m["ago"]) / 1000
                    finally:
                        self.ctl = None
                        pinger.cancel()
                    replaced = ws.close_reason == "replaced"
            except asyncio.CancelledError:
                raise
            except InvalidStatus as e:
                if getattr(e.response, "status_code", None) == 404:
                    log(f"the relay has no /pi yet - it needs the new deploy; asking again in {spell(OLD_RELAY_WAIT)}")
                    await asyncio.sleep(OLD_RELAY_WAIT)
                    continue
                log("relay line:", short(e))
            except Exception as e:
                log("relay line:", short(e))
            if replaced:
                # The relay keeps one line per room. A second copy of this program is running
                # somewhere (a test left going?): fighting it for the line would only flap.
                log(f"another Pi took this room's line - trying again in {spell(REPLACED_WAIT)}")
                await self.let_go("replaced")
                await asyncio.sleep(REPLACED_WAIT)
                continue
            log(f"relay line closed - again in {wait}s")
            await asyncio.sleep(wait)
            wait = min(60, wait * 2)

    async def ping(self, ws):
        while True:
            await asyncio.sleep(PING)
            if time.monotonic() - self.heard > PING * 2.5:
                log("relay line has gone quiet - starting it again")
                with suppress(Exception):
                    await ws.close()
                return
            with suppress(Exception):
                await ws.send("ping")

    # ---------- the wall ----------

    def wake(self):
        if self.job and not self.job.done():
            return                          # already looking, or already holding it
        self.job = asyncio.create_task(self.hold())

    async def let_go(self, why):
        job = self.job
        if job and not job.done():
            self.release = why
            job.cancel()
            with suppress(BaseException):
                await job

    async def find(self):
        """Look for the wall until it is found or the hunt runs out. Its name, or None."""
        end = time.monotonic() + self.cfg.hunt
        while True:
            left = end - time.monotonic()
            if left <= 0:
                log(f"the wall was not found in {spell(self.cfg.hunt)} - switched off, or the Moon app has it")
                return None
            try:
                dev = await self.wall.find(min(10.0, max(1.0, left)))
                if dev is None:
                    continue
                name = await self.wall.connect(dev)
                log("holding", name)
                return name
            except asyncio.CancelledError:
                raise
            except Exception as e:
                log("wall:", short(e))
                await asyncio.sleep(3)

    async def hold(self):
        why = "error"
        try:
            await self.set_state("waking")
            if not await self.find():
                why = "not found"
                return
            self.seen_at = time.monotonic()     # the phone that asked is there now
            while True:
                await self.set_state("holding")
                bridge = asyncio.create_task(self.bridge())
                try:
                    why = await self.watch()
                finally:
                    bridge.cancel()
                    with suppress(BaseException):
                        await bridge
                if why != "lost":
                    return
                await self.set_state("waking", "lost")
                if not await self.find():
                    return                      # why stays "lost"
        except asyncio.CancelledError:
            why = self.release or "asked"
            raise
        except Exception as e:
            log("holding the wall went wrong:", short(e))
        finally:
            await self.wall.let_go()
            self.release = None
            await self.set_state("asleep", why)

    async def watch(self):
        """Hold the wall until something ends it, and say what: lost, idle or offline."""
        ask = 0.0
        while True:
            now = time.monotonic()
            if self.wall.lost.is_set() or not self.wall.connected:
                log("the wall has gone (switched off?)")
                return "lost"
            if now - self.seen_at > self.cfg.idle:
                log(f"nobody has had the app open for {spell(self.cfg.idle)} - letting go")
                return "idle"
            if self.ctl is None and now - self.heard > self.cfg.offline:
                log(f"no relay for {spell(self.cfg.offline)} - letting go so a phone can have the wall")
                return "offline"
            if now >= ask:
                await self.tell({"type": "seen"})
                ask = now + SEEN_EVERY
            with suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self.wall.lost.wait(), timeout=5)

    async def bridge(self):
        """Sit in the room as a bridge on /ws, as the phone at the wall does."""
        wait = 1
        while True:
            try:
                async with ws_connect(self.cfg.url("/ws"), ping_interval=None, open_timeout=20,
                                      close_timeout=5, max_size=2 ** 16) as ws:
                    wait = 1
                    await ws.send(json.dumps({"type": "hello", "v": 2, "pi": 1}))
                    if self.last:
                        payload, meta = self.last
                        await ws.send(json.dumps({"type": "now", "payload": payload, "now": meta, "again": True}))
                    log("bridging the room")
                    async for raw in ws:
                        m = parse(raw)
                        if not m or m.get("type") != "write":
                            continue
                        out = await self.write(m.get("payload"), m.get("now"))
                        await ws.send(json.dumps({"type": "result", "id": m.get("id"), **out}))
            except asyncio.CancelledError:
                raise
            except Exception as e:
                log("bridge:", short(e))
            await asyncio.sleep(wait)
            wait = min(30, wait * 2)

    async def write(self, payload, meta):
        if not isinstance(payload, str) or not PAYLOAD.match(payload):
            return {"error": "payload must match l#...#"}
        async with self.lock:
            if not self.wall.connected:
                return {"error": "the Pi has lost the wall and is looking for it"}
            try:
                await asyncio.wait_for(self.wall.write(payload), timeout=6)   # inside the relay's 8s
            except Exception as e:
                log("write failed:", short(e))
                return {"error": "the write to the wall failed"}
        self.last = (payload, meta if isinstance(meta, dict) else None)
        log("lit", payload)
        return {"ok": True}


async def run(cfg, wall):
    if not cfg.room:
        sys.exit("no room code: set MOONBRIDGE_ROOM or put it in the file `room` beside this one")
    log(f"moonbridge: {cfg.relay}, room {cfg.room[:4]}..., asleep until a phone asks")
    bridge = Bridge(cfg, wall)
    main = asyncio.current_task()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, main.cancel)
    if isinstance(wall, FakeWall):
        loop.add_signal_handler(signal.SIGUSR1, lambda: wall.switch(False))
        loop.add_signal_handler(signal.SIGUSR2, lambda: wall.switch(True))
    control = asyncio.create_task(bridge.control())
    try:
        await control
    except asyncio.CancelledError:
        log("stopping")
    finally:
        await bridge.let_go("stopped")      # never leave the wall held by a program that has gone
        control.cancel()
        with suppress(BaseException):
            await control


async def scan():
    from bleak import BleakScanner
    log("looking for 10 seconds ...")
    found = await BleakScanner.discover(timeout=10.0, return_adv=True)
    rows = sorted(found.values(), key=lambda da: -(da[1].rssi or -999))
    for dev, adv in rows:
        name = adv.local_name or dev.name or "(no name)"
        uart = " Nordic UART" if NUS_SERVICE in [u.lower() for u in adv.service_uuids] else ""
        print(f"  {adv.rssi:>4} dBm  {dev.address}  {name}{uart}")
    print(f"{len(rows)} seen")


async def probe(cfg, wall):
    dev = await wall.find(20)
    if dev is None:
        sys.exit("nothing found - is the wall switched on, and the Moon app closed?")
    from bleak import BleakClient
    log(f"found {dev.address} ({dev.name or 'no name'}) - connecting, reading only")
    async with BleakClient(dev, timeout=CONNECT_S, bluez=wall.bluez) as client:
        for svc in client.services:
            chars = ", ".join(sorted(c.uuid[:8] + "[" + ",".join(c.properties) + "]" for c in svc.characteristics))
            print(f"  service {svc.uuid}: {chars}")
    log("let go")


async def light_once(cfg, wall, payload):
    if not PAYLOAD.match(payload):
        sys.exit("refusing: a payload looks like l#S36,P37,E38#")
    cfg.hunt = min(cfg.hunt, 30)
    b = Bridge(cfg, wall)
    if not await b.find():
        sys.exit(1)
    try:
        out = await b.write(payload, None)
        print(out)
        await asyncio.sleep(1)
    finally:
        await wall.let_go()
        log("let go")


def main():
    ap = argparse.ArgumentParser(description="The Pi's seat at the MoonBoard.")
    ap.add_argument("--scan", action="store_true", help="list what Bluetooth can see")
    ap.add_argument("--light", metavar="PAYLOAD", help="find the wall, light this, let go")
    ap.add_argument("--probe", action="store_true", help="find the wall, list its services, let go")
    ap.add_argument("--fake-wall", nargs="?", const="on", choices=["on", "off"],
                    help="a pretend wall instead of Bluetooth")
    a = ap.parse_args()
    cfg = Settings()
    wall = FakeWall(a.fake_wall == "on") if a.fake_wall else Wall(cfg.name, cfg.address, cfg.adapter)
    if a.scan:
        asyncio.run(scan())
    elif a.probe:
        asyncio.run(probe(cfg, wall))
    elif a.light:
        asyncio.run(light_once(cfg, wall, a.light))
    else:
        with suppress(KeyboardInterrupt):
            asyncio.run(run(cfg, wall))


if __name__ == "__main__":
    main()
