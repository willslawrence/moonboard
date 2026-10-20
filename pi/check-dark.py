#!/usr/bin/env python3
"""
The lights go out when nobody is using the wall (Will, 2026-10-20), checked against
the pretend wall, with the relay pointed at a dead port: nothing real is touched.

    python3 pi/check-dark.py        (needs websockets, as moonbridge.py does; about 40 s)

1. Holding the wall, nothing new lit for a while: every light goes out, the wall is
   still held, the room is told (so no page shows a route on a dark wall), and the
   next route lights as ever. Out once, not again and again.
2. Asked to let go (Settings on the page): the lights go out, then the wall is let go.
3. Nobody has had the app open for a while: the same, before it lets go.
4. The wall switched off: nothing is written to it (it cannot be), and nothing breaks.
"""
import asyncio
import json
import os
import sys
import time
from pathlib import Path

os.environ.update(MOONBRIDGE_RELAY="ws://127.0.0.1:9", MOONBRIDGE_ROOM="check-dark", MOONBRIDGE_SEEN="1",
                  MOONBRIDGE_OFFLINE="600", MOONBRIDGE_HUNT="2")
sys.path.insert(0, str(Path(__file__).parent))
import moonbridge as mb  # noqa: E402

ROUTE, OTHER = "l#S36,P37,E38#", "l#S12,P50,E190#"
passed = failed = 0


def check(name, ok, detail=None):
    global passed, failed
    passed, failed = passed + bool(ok), failed + (not ok)
    print(("  ok   " if ok else "  FAIL ") + name + ("" if ok or detail is None else f"\n       {detail}"))


async def until(test, seconds):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if test():
            return True
        await asyncio.sleep(0.1)
    return test()


def bridge(dark=600, idle=600, relay="ws://127.0.0.1:9"):
    os.environ.update(MOONBRIDGE_DARK=str(dark), MOONBRIDGE_IDLE=str(idle), MOONBRIDGE_RELAY=relay)
    wall = mb.FakeWall(True)
    b = mb.Bridge(mb.Settings(), wall)
    b.heard = time.monotonic()
    return b, wall


async def held(b, wall):
    b.wake()
    return await until(lambda: wall.held and b.state == "holding", 8)


async def main():
    print("1. holding, nothing new lit")
    from websockets.asyncio.server import serve
    heard = []                                   # what a stand-in relay is told on the bridge line

    async def room(ws):
        try:
            async for raw in ws:
                try:
                    heard.append(json.loads(raw))
                except ValueError:
                    heard.append({"raw": raw})
        except Exception:
            pass                                 # the line dropped as the wall was let go: nothing to check there
    relay = await serve(room, "127.0.0.1", 0)
    b, wall = bridge(dark=2, relay=f"ws://127.0.0.1:{relay.sockets[0].getsockname()[1]}")
    check("the wall is found and held", await held(b, wall))
    check("it joins the room as a bridge", await until(lambda: any(m.get("type") == "hello" for m in heard), 5), heard)
    await b.write(ROUTE, {"id": 1, "by": "Will"})
    check("a route is lit", wall.writes[-1:] == [ROUTE])
    check("a while later every light is out, and the wall is still held",
          await until(lambda: wall.writes[-1:] == [mb.DARK], 9) and wall.held and b.is_dark(), wall.writes)
    check("and the room is told the wall is dark", await until(lambda: {"type": "now", "payload": mb.DARK, "now": None} in heard, 3), heard)
    n = len(wall.writes)
    await asyncio.sleep(6)
    check("out once: nothing more is written while it stays dark", len(wall.writes) == n, wall.writes)
    await b.write(OTHER, {"id": 2, "by": "Sara"})
    check("the next route lights as ever", wall.writes[-1:] == [OTHER] and not b.is_dark())
    await b.let_go("asked")
    check("asked to let go: the lights go out first, then the wall is let go",
          wall.writes[-1:] == [mb.DARK] and not wall.held and b.state == "asleep", (wall.writes, b.state))
    relay.close()

    print("2. asked to let go straight after a route")
    b, wall = bridge()
    await held(b, wall)
    await b.write(ROUTE, {"id": 1, "by": "Will"})
    await b.let_go("asked")
    check("lights out, then let go", wall.writes == [ROUTE, mb.DARK] and not wall.held, wall.writes)
    await b.let_go("asked")
    check("letting go again writes nothing more", wall.writes == [ROUTE, mb.DARK], wall.writes)

    print("3. nobody has had the app open")
    b, wall = bridge(idle=2)
    await held(b, wall)
    await b.write(ROUTE, {"id": 1, "by": "Will"})
    check("it lets go by itself, the lights out before it does",
          await until(lambda: b.state == "asleep", 12) and wall.writes == [ROUTE, mb.DARK] and not wall.held, (b.state, b.why, wall.writes))
    check("and says why", b.why == "idle", b.why)

    print("4. the wall switched off")
    b, wall = bridge()
    await held(b, wall)
    await b.write(ROUTE, {"id": 1, "by": "Will"})
    wall.switch(False)
    check("it gives up looking, and writes nothing to a wall that has gone",
          await until(lambda: b.state == "asleep", 15) and wall.writes == [ROUTE], (b.state, b.why, wall.writes))

    print(f"\n{passed} passed, {failed} failed")
    return failed


if __name__ == "__main__":
    sys.exit(1 if asyncio.run(main()) else 0)
