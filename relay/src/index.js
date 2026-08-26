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
        // bridge reporting back: {ok:true} / {error:"..."} - fan out so
        // whoever sent the command can see what the wall did with it
        this.broadcast(typeof e.data === "string" ? e.data : "", server);
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
      const msg = JSON.stringify({ type: "write", payload });
      let sent = 0;
      for (const ws of [...this.sockets]) {
        try { ws.send(msg); sent++; } catch { this.sockets.delete(ws); }
      }
      return json({ ok: true, bridges: sent });
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
