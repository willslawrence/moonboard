/**
 * MoonBoard relay.
 *
 * The phone opens a WebSocket to /ws?room=<code> and acts as the BLE bridge.
 * Anything POSTed to /send?room=<code> is broadcast to that room's bridges,
 * which write it to the wall over Bluetooth.
 *
 * The room code IS the secret - it is never in the (public) page source.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export class Relay {
  constructor(state) {
    this.state = state;
    this.sockets = new Set();
    this.pending = new Map();      // command id -> resolver waiting on the bridge
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      this.sockets.add(server);
      server.addEventListener("close", () => this.sockets.delete(server));
      server.addEventListener("error", () => this.sockets.delete(server));
      server.addEventListener("message", (e) => {
        // bridge reporting back: {type:"result", id, ok|error}
        let m = null;
        try { m = JSON.parse(typeof e.data === "string" ? e.data : "{}"); } catch { return; }
        if (!m || m.type !== "result") return;
        if (m.id && this.pending.has(m.id)) return this.pending.get(m.id)(m);
        // Older bridges answer without an id - resolve the oldest waiter.
        const first = this.pending.keys().next();
        if (!first.done) this.pending.get(first.value)(m);
      });
      server.send(JSON.stringify({ type: "hello", bridges: this.sockets.size }));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/send" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      const payload = body && body.payload;
      if (typeof payload !== "string" || !/^l#[SPE0-9,]*#$/.test(payload)) {
        return json({ error: "payload must match l#...#" }, 400);
      }
      if (this.sockets.size === 0) {
        return json({ error: "no bridge connected", bridges: 0 }, 409);
      }
      const id = crypto.randomUUID();
      const msg = JSON.stringify({ type: "write", payload, id });
      let sent = 0;
      for (const ws of [...this.sockets]) {
        try { ws.send(msg); sent++; } catch { this.sockets.delete(ws); }
      }
      if (sent === 0) return json({ error: "no bridge connected", bridges: 0 }, 409);

      // Wait for the bridge to say what the wall actually did. Reporting
      // "sent" when the phone is not connected to the board hides real failures.
      const result = await new Promise((resolve) => {
        const timer = setTimeout(() => { this.pending.delete(id); resolve(null); }, 8000);
        this.pending.set(id, (r) => { clearTimeout(timer); this.pending.delete(id); resolve(r); });
      });

      if (!result) {
        return json({ ok: true, bridges: sent, ack: false,
                      note: "bridge did not confirm - it may be on an older build" });
      }
      if (result.error) return json({ error: result.error, bridges: sent }, 502);
      return json({ ok: true, bridges: sent, wrote: payload });
    }

    if (url.pathname === "/status") {
      return json({ bridges: this.sockets.size });
    }

    return json({ error: "not found" }, 404);
  }

  broadcast(data, except) {
    for (const ws of [...this.sockets]) {
      if (ws === except) continue;
      try { ws.send(data); } catch { this.sockets.delete(ws); }
    }
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    if (url.pathname === "/") {
      return json({ service: "moonboard-relay", routes: ["/ws?room=", "/send?room=", "/status?room="] });
    }

    const room = url.searchParams.get("room");
    if (!room || room.length < 6) {
      return json({ error: "room= required, at least 6 chars" }, 400);
    }

    const id = env.RELAY.idFromName(room);
    return env.RELAY.get(id).fetch(request);
  },
};
