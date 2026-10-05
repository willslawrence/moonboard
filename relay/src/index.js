/**
 * MoonBoard relay.
 *
 * The phone opens a WebSocket to /ws?room=<code> and acts as the BLE bridge.
 * Anything POSTed to /send?room=<code> is broadcast to that room's bridges,
 * which write it to the wall over Bluetooth.
 *
 * The room also remembers what is on the wall - which problem, and who put it
 * up - so every phone can show it and jump to it. /status hands that back.
 *
 * And it keeps the line: who is waiting to go next and with which problem
 * (/line?room=<code>), plus the problems that have been up this session.
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

const PAYLOAD = /^l#[SPE0-9,]*#$/;

/* Who lit what, as the page reports it alongside a payload. Everything here is
   shown on other people's phones, so it is cut down to the three things the page
   uses and nothing else gets through. */
const cleanMeta = (m) => {
  if (!m || typeof m !== "object" || !Number.isFinite(Number(m.id))) return null;
  return {
    id: Number(m.id),
    by: typeof m.by === "string" ? m.by.trim().slice(0, 24) : "",
    board: typeof m.board === "string" ? m.board.slice(0, 12) : "",
  };
};

const LINE_MAX = 12;                        // people waiting at once
const HIST_MAX = 80;                        // problems in one session
const LINE_TTL = 3 * 60 * 60 * 1000;        // an unused spot this old belongs to someone who went home
const NIGHT_GAP = 4 * 60 * 60 * 1000;       // this long with nothing lit and it is a new session

export class Relay {
  constructor(state) {
    this.state = state;
    this.sockets = new Set();
    this.pending = new Map();      // command id -> resolver waiting on the bridge
    /* What is on the wall right now: {payload, t, id?, by?, board?}, or null.
       Memory only, on purpose. It means something only while a phone is bridging,
       that open socket is what keeps this object alive, and a bridge repeats what
       it last wrote every time it connects - so there is nothing worth storing. */
    this.now = null;
    /* Bridges that report what they light themselves. A phone on an older build
       writes to the wall over Bluetooth without a word to us, so with one of those
       connected we cannot know what is up there and say nothing rather than guess. */
    this.tells = new Set();
    /* Who is waiting to go next, and which problems have been up this session.
       Unlike `now` these are kept in storage. The phone holding the Bluetooth
       drops off every time its screen sleeps, this object can be gone from memory
       a minute later, and a line that vanished with it would be no line at all. */
    this.line = [];                // [{id, by, board, t}] next first, one spot each
    this.hist = [];                // [{id, by, board, t}] oldest first, each problem once
    this.ready = null;             // the one read of storage
  }

  load() {
    if (!this.ready) {
      this.ready = this.state.storage.get("queue").then((q) => {
        if (q && Array.isArray(q.line)) this.line = q.line;
        if (q && Array.isArray(q.hist)) this.hist = q.hist;
      }).catch(() => {});
    }
    return this.ready;
  }

  save() {
    this.state.storage.put("queue", { line: this.line, hist: this.hist }).catch(() => {});
  }

  /* Nobody clears up after themselves at a climbing wall. A spot that has sat
     unused for hours is dropped, and after a long quiet gap the list of what has
     been up starts again - it is tonight's, not this week's. */
  prune() {
    const t = Date.now();
    const line = this.line.filter((e) => t - e.t < LINE_TTL);
    const last = this.hist[this.hist.length - 1];
    const hist = last && t - last.t > NIGHT_GAP ? [] : this.hist;
    if (line.length === this.line.length && hist === this.hist) return;
    this.line = line;
    this.hist = hist;
    this.save();
  }

  /* A named problem has just gone up. It joins tonight's list - once, at the end,
     however many times it is lit - and if the climber it went up for was waiting
     with it, their turn has come and their spot in the line is used. */
  wentUp(m) {
    this.prune();
    this.hist = this.hist.filter((h) => !(h.id === m.id && h.board === m.board));
    this.hist.push({ id: m.id, by: m.by, board: m.board, t: Date.now() });
    if (this.hist.length > HIST_MAX) this.hist = this.hist.slice(-HIST_MAX);
    if (m.by) {
      const who = m.by.toLowerCase();
      this.line = this.line.filter((e) => !(e.by.toLowerCase() === who && e.id === m.id));
    }
    this.save();
  }

  /* again: the bridge is repeating what it last lit, as it does every time it
     reconnects. That is news only if we never heard it the first time - otherwise
     a phone waking up would count as the problem going up a second time, and use
     the spot of a climber who had put their name down for another go on it. */
  setNow(payload, meta, again) {
    if (typeof payload !== "string" || !PAYLOAD.test(payload) || payload === "l##") {
      this.now = null;
      return;
    }
    const m = cleanMeta(meta);
    const same = this.now && this.now.payload === payload &&
      (this.now.id ?? null) === (m ? m.id : null) && (this.now.by ?? "") === (m ? m.by : "");
    if (same) return;                              // a re-send is not a new route
    this.now = { payload, t: Date.now(), ...(m || {}) };
    if (!m) return;
    const last = this.hist[this.hist.length - 1];
    if (again && last && last.id === m.id && last.by === m.by && last.board === m.board) return;
    this.wentUp(m);
  }

  drop(ws) {
    this.sockets.delete(ws);
    this.tells.delete(ws);
    if (this.sockets.size === 0) this.now = null;  // nobody at the wall, nothing to say
  }

  async fetch(request) {
    const url = new URL(request.url);
    await this.load();

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      // A first bridge is a new evening at the wall; whatever was up last time is gone.
      if (this.sockets.size === 0) this.now = null;
      this.sockets.add(server);
      server.addEventListener("close", () => this.drop(server));
      server.addEventListener("error", () => this.drop(server));
      server.addEventListener("message", (e) => {
        // bridge reporting back: {type:"result", id, ok|error}
        let m = null;
        try { m = JSON.parse(typeof e.data === "string" ? e.data : "{}"); } catch { return; }
        if (!m) return;
        // "I will tell you what I light myself" - see this.tells
        if (m.type === "hello") { this.tells.add(server); return; }
        // the bridge lit something over Bluetooth directly: {type:"now", payload, now},
        // with again:true when it is only repeating itself after reconnecting
        if (m.type === "now") { this.setNow(m.payload, m.now, m.again === true); return; }
        if (m.type !== "result") return;
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
      if (typeof payload !== "string" || !PAYLOAD.test(payload)) {
        return json({ error: "payload must match l#...#" }, 400);
      }
      if (this.sockets.size === 0) {
        return json({ error: "no bridge connected", bridges: 0 }, 409);
      }
      const id = crypto.randomUUID();
      const meta = cleanMeta(body.now);        // which problem and whose phone, if it said
      const msg = JSON.stringify({ type: "write", payload, id, now: meta });
      let sent = 0;
      for (const ws of [...this.sockets]) {
        try { ws.send(msg); sent++; } catch { this.drop(ws); }
      }
      if (sent === 0) return json({ error: "no bridge connected", bridges: 0 }, 409);

      // Wait for the bridge to say what the wall actually did. Reporting
      // "sent" when the phone is not connected to the board hides real failures.
      const result = await new Promise((resolve) => {
        const timer = setTimeout(() => { this.pending.delete(id); resolve(null); }, 8000);
        this.pending.set(id, (r) => { clearTimeout(timer); this.pending.delete(id); resolve(r); });
      });

      if (!result) {
        this.setNow(payload, meta);
        return json({ ok: true, bridges: sent, ack: false,
                      note: "bridge did not confirm - it may be on an older build" });
      }
      if (result.error) return json({ error: result.error, bridges: sent }, 502);
      this.setNow(payload, meta);
      return json({ ok: true, bridges: sent, wrote: payload });
    }

    /* The line. Joining it never touches the wall, and it does not need a phone
       at the wall either - you can put your name down while the Bluetooth phone
       is waking up. One spot each: joining again with another problem keeps your
       place and swaps the problem. Leaving the line is how a spot is given up;
       having your problem go up (see wentUp) is how it is used. */
    if (url.pathname === "/line" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      const by = body && typeof body.by === "string" ? body.by.trim().slice(0, 24) : "";
      if (!by) return json({ error: "a name is required" }, 400);
      this.prune();
      const mine = (e) => e.by.toLowerCase() === by.toLowerCase();
      if (body.op === "leave") {
        this.line = this.line.filter((e) => !mine(e));
      } else if (body.op === "join") {
        const m = cleanMeta(body);
        if (!m) return json({ error: "which problem?" }, 400);
        const spot = this.line.find(mine);
        if (spot) {
          spot.id = m.id; spot.board = m.board; spot.t = Date.now();
        } else {
          if (this.line.length >= LINE_MAX) return json({ error: "the line is full" }, 409);
          this.line.push({ id: m.id, by, board: m.board, t: Date.now() });
        }
      } else {
        return json({ error: "op must be join or leave" }, 400);
      }
      this.save();
      return json({ ok: true, line: this.line, hist: this.hist });
    }

    if (url.pathname === "/status") {
      const sure = this.sockets.size > 0 &&
        [...this.sockets].every((ws) => this.tells.has(ws));
      this.prune();
      return json({ bridges: this.sockets.size, now: sure ? this.now : null,
                    line: this.line, hist: this.hist });
    }

    return json({ error: "not found" }, 404);
  }

  broadcast(data, except) {
    for (const ws of [...this.sockets]) {
      if (ws === except) continue;
      try { ws.send(data); } catch { this.drop(ws); }
    }
  }
}


/**
 * Tick lists.
 *
 * One shared Durable Object holds everyone's projects. No logins - the whole
 * point is that Will, Sara and Abdu can see each other's lists - so anyone with
 * the page can read and write. Problems are keyed by their MoonBoard id.
 *
 * Storage:
 *   people          -> ["Will", "Sara", ...]           insertion order
 *   list:<person>   -> [problemId, ...]                their projects
 *   done:<id>       -> ["Will", ...]                   who has sent it
 *   wins            -> {"Will": 3, ...}                 connect four record
 *   snake           -> {"Will": 24, ...}                best snake length
 *   log:<iso>-<r>   -> {t, person, id, result}           one row per tap, append only
 *   stats:<person>  -> {<id>: {a, r, s, d}}              attempts / last result /
 *                                                       sends in order / last date
 *
 * s is the ordered list of sends. MoonBoard scores the FIRST successful ascent,
 * not the best one, so s[0] is what counts - send it second go and flash it later
 * and the second go still scores.
 *
 * result is one of: try flash 2nd 3rd 4+
 *
 * stats is what the page reads constantly - the attempt count and the derived
 * send grade - so it stays in the snapshot. The log rows are only read when the
 * logbook panel opens, which keeps /lists small as the log grows.
 */
const RESULTS = ["try", "flash", "2nd", "3rd", "4+"];
const BOARDS = ["2016-40", "2019-40", "2019-25", "2024-40", "2024-25"];

// Timestamp-prefixed so storage.list() comes back in chronological order.
const logKey = (iso) => "log:" + iso + "-" + Math.random().toString(36).slice(2, 8);

export class Lists {
  constructor(state) {
    this.state = state;
  }

  async snapshot() {
    const people = (await this.state.storage.get("people")) || [];
    const lists = {};
    for (const p of people) lists[p] = (await this.state.storage.get("list:" + p)) || [];
    const done = {};
    const doneRows = await this.state.storage.list({ prefix: "done:" });
    for (const [k, v] of doneRows) if (v && v.length) done[k.slice(5)] = v;
    const wins = (await this.state.storage.get("wins")) || {};
    const snake = (await this.state.storage.get("snake")) || {};
    const stats = {};
    for (const p of people) {
      const st = await this.state.storage.get("stats:" + p);
      if (st && Object.keys(st).length) stats[p] = st;
    }
    // Which hold set and angle is on the wall - one wall, so one setting for everyone.
    const board = (await this.state.storage.get("board")) || "2016-40";
    // Which problems have beta. The moves themselves are fetched when one is opened.
    const betas = [];
    for (const [k] of await this.state.storage.list({ prefix: "beta:" })) betas.push(Number(k.slice(5)));
    return { people, lists, done, wins, snake, stats, board, betas };
  }

  /* Replay the whole log and rewrite every derived index from it. The log is
     the source of truth; stats and done are caches, and caches drift. Ticks
     that have no log rows at all - the ones that predate the logbook - are
     left alone rather than erased, because the log can't speak for them. */
  async rebuild(){
    const rows = await this.state.storage.list({ prefix: "log:" });
    const byPerson = {};                 // person -> id -> {a, sends, d}
    const touched = new Set();           // "person|id" seen in the log
    for (const [, row] of rows) {
      if (!row) continue;
      const per = (byPerson[row.person] = byPerson[row.person] || {});
      const e = (per[row.id] = per[row.id] || { a: 0, sends: [], d: null });
      if (row.result === "try") e.a++;
      else { e.sends.push(row.result); e.a = 0; }
      e.d = row.t;
      touched.add(row.person + "|" + row.id);
    }

    const people = (await this.state.storage.get("people")) || [];
    for (const person of people) {
      const st = {};
      const per = byPerson[person] || {};
      for (const id in per) {
        const e = per[id];
        if (!e.a && !e.sends.length) continue;
        const row = { a: e.a, r: e.sends.length ? e.sends[e.sends.length - 1] : null, d: e.d };
        if (e.sends.length) row.s = e.sends;
        st[id] = row;
      }
      if (Object.keys(st).length) await this.state.storage.put("stats:" + person, st);
      else await this.state.storage.delete("stats:" + person);
    }

    const existing = await this.state.storage.list({ prefix: "done:" });
    const done = {};
    for (const [k, v] of existing) {
      const id = k.slice(5);
      // keep names with no log rows for this problem - nothing to replay for them
      const keep = (v || []).filter((n) => !touched.has(n + "|" + id));
      if (keep.length) done[id] = keep;
    }
    for (const person in byPerson)
      for (const id in byPerson[person])
        if (byPerson[person][id].sends.length)
          done[id] = [...new Set([...(done[id] || []), person])];

    for (const [k] of existing) await this.state.storage.delete(k);
    for (const id in done) await this.state.storage.put("done:" + id, done[id]);
  }

  /* Rebuild the indexes for one person and problem by replaying what's left in
     the log. Deleting an arbitrary old row can't be unwound arithmetically - the
     attempt count and the order of sends both depend on everything around it -
     so the only honest answer is to read the rows back. */
  async recompute(person, id){
    const rows = await this.state.storage.list({ prefix: "log:" });   // chronological
    let a = 0, sends = [], d = null;
    for (const [, row] of rows) {
      if (!row || row.person !== person || Number(row.id) !== Number(id)) continue;
      if (row.result === "try") a++;
      else { sends.push(row.result); a = 0; }
      d = row.t;
    }
    const key = "stats:" + person;
    const st = (await this.state.storage.get(key)) || {};
    if (!a && !sends.length) delete st[id];
    else {
      const e = { a, r: sends.length ? sends[sends.length - 1] : null, d };
      if (sends.length) e.s = sends;
      st[id] = e;
    }
    await this.state.storage.put(key, st);

    const dk = "done:" + id;
    let who = (await this.state.storage.get(dk)) || [];
    who = sends.length
      ? (who.includes(person) ? who : [...who, person])
      : who.filter((x) => x !== person);
    if (who.length) await this.state.storage.put(dk, who);
    else await this.state.storage.delete(dk);
  }

  /* Fold one log row into the indexes, or peel it back off with dir = -1.
     A send resets the attempt count so a repeat project starts clean; undoing a
     send has to put the count back and drop the name from done, or the chips
     beside the board would claim something that isn't true any more. */
  async applyRow(row, dir) {
    const key = "stats:" + row.person;
    const st = (await this.state.storage.get(key)) || {};
    const cur = st[row.id] || { a: 0, r: null, d: null };

    if (row.result === "try") {
      cur.a = Math.max(0, cur.a + dir);
    } else if (dir > 0) {
      cur.before = cur.a;                    // so an undo can restore it
      cur.a = 0;
      cur.r = row.result;
      cur.s = [...(cur.s || []), row.result];
    } else {
      cur.a = cur.before || 0;
      delete cur.before;
      cur.s = (cur.s || []).slice(0, -1);
      cur.r = cur.s.length ? cur.s[cur.s.length - 1] : null;
      if (!cur.s.length) delete cur.s;
    }
    cur.d = dir > 0 ? row.t : cur.d;
    // Undoing back to nothing should leave nothing behind.
    if (cur.a === 0 && !cur.r) delete st[row.id];
    else st[row.id] = cur;
    await this.state.storage.put(key, st);

    if (row.result !== "try") {
      const dk = "done:" + row.id;
      let who = (await this.state.storage.get(dk)) || [];
      who = dir > 0
        ? (who.includes(row.person) ? who : [...who, row.person])
        : who.filter((x) => x !== row.person);
      if (who.length) await this.state.storage.put(dk, who);
      else await this.state.storage.delete(dk);
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/lists" && request.method === "GET") {
      return json(await this.snapshot());
    }

    if (path === "/lists/beta" && request.method === "GET") {
      const id = Number(url.searchParams.get("id"));
      return json({ beta: (await this.state.storage.get("beta:" + id)) || null });
    }

    if (path === "/lists/log" && request.method === "GET") {
      const person = url.searchParams.get("person") || "";
      // One person's logbook can run to hundreds of rows once an old one is
      // imported, so a named request reads the whole log rather than the last 500.
      const limit = Math.min(3000, Math.max(1, Number(url.searchParams.get("limit")) || 100));
      const rows = await this.state.storage.list(person
        ? { prefix: "log:", reverse: true }
        : { prefix: "log:", reverse: true, limit: 500 });
      const out = [];
      for (const [key, row] of rows) {
        if (!row) continue;
        if (person && row.person !== person) continue;
        out.push({ ...row, k: key });
        if (out.length >= limit) break;
      }
      return json({ entries: out });
    }

    const body = request.method === "POST"
      ? await request.json().catch(() => null)
      : null;
    if (!body) return json({ error: "expected a JSON body" }, 400);

    const clean = (v) => typeof v === "string" ? v.trim().slice(0, 24) : "";

    /* Beta: one per problem, the order hands and feet go on. Whoever saves last
       replaces it. A move is a limb (LH RH LF RF) and a hold; row 0 is the
       kickboard. An empty list of moves removes the beta. */
    if (path === "/lists/beta") {
      const id = Number(body.id);
      const person = clean(body.person);
      if (!Number.isFinite(id) || !person) return json({ error: "id and person required" }, 400);
      const moves = (Array.isArray(body.moves) ? body.moves : []).slice(0, 80)
        .filter((m) => m && (
          (["LH", "RH", "LF", "RF"].includes(m.l) && (/^[A-K](\d|1[0-8])$/.test(m.h) ||
            (m.l[1] === "F" && ["FL", "FR", "FD"].includes(m.h)))) ||       // a hold, or a flagged foot
          (m.l === "HP" && ["HL", "HC", "HR"].includes(m.h))))               // hips left, square, right
        .map((m) => ({ l: m.l, h: m.h }));
      if (moves.length) {
        await this.state.storage.put("beta:" + id, { by: person, t: new Date().toISOString(), moves });
      } else {
        await this.state.storage.delete("beta:" + id);
      }
      return json({ ...(await this.snapshot()), beta: moves.length ? { by: person, moves } : null });
    }

    if (path === "/lists/board") {
      const board = clean(body.board);
      if (!BOARDS.includes(board)) return json({ error: "unknown board" }, 400);
      await this.state.storage.put("board", board);
      return json(await this.snapshot());
    }

    if (path === "/lists/person") {
      const name = clean(body.name);
      if (!name) return json({ error: "name required" }, 400);
      const people = (await this.state.storage.get("people")) || [];
      if (people.some((p) => p.toLowerCase() === name.toLowerCase())) {
        return json({ error: "that name is already here" }, 409);
      }
      if (people.length >= 24) return json({ error: "too many lists" }, 409);
      people.push(name);
      await this.state.storage.put("people", people);
      return json(await this.snapshot());
    }

    if (path === "/lists/tick") {
      const person = clean(body.person);
      const id = Number(body.id);
      if (!person || !Number.isFinite(id)) return json({ error: "person and id required" }, 400);
      const people = (await this.state.storage.get("people")) || [];
      if (!people.includes(person)) return json({ error: "unknown person" }, 404);
      const key = "list:" + person;
      let ids = (await this.state.storage.get(key)) || [];
      ids = body.on ? (ids.includes(id) ? ids : [...ids, id]) : ids.filter((x) => x !== id);
      await this.state.storage.put(key, ids);
      return json(await this.snapshot());
    }

    if (path === "/lists/done") {
      const person = clean(body.person);
      const id = Number(body.id);
      if (!person || !Number.isFinite(id)) return json({ error: "person and id required" }, 400);
      const key = "done:" + id;
      let who = (await this.state.storage.get(key)) || [];
      who = body.on ? (who.includes(person) ? who : [...who, person]) : who.filter((x) => x !== person);
      if (who.length) await this.state.storage.put(key, who);
      else await this.state.storage.delete(key);
      return json(await this.snapshot());
    }

    if (path === "/lists/log") {
      const person = clean(body.person);
      const id = Number(body.id);
      const result = clean(body.result);
      if (!person || !Number.isFinite(id)) return json({ error: "person and id required" }, 400);
      if (!RESULTS.includes(result)) return json({ error: "bad result" }, 400);
      const people = (await this.state.storage.get("people")) || [];
      if (!people.includes(person)) return json({ error: "unknown person" }, 404);

      const row = { t: new Date().toISOString(), person, id, result };
      await this.state.storage.put(logKey(row.t), row);
      await this.applyRow(row, 1);
      return json(await this.snapshot());
    }

    if (path === "/lists/log/undo") {
      const person = clean(body.person);
      if (!person) return json({ error: "person required" }, 400);
      // Newest first, so the first row belonging to this person is theirs to undo.
      const rows = await this.state.storage.list({ prefix: "log:", reverse: true, limit: 200 });
      for (const [key, row] of rows) {
        if (!row || row.person !== person) continue;
        if (row.lock) return json({ error: "that entry is locked" }, 409);
        await this.state.storage.delete(key);
        await this.recompute(row.person, row.id);
        return json(await this.snapshot());
      }
      return json({ error: "nothing to undo" }, 404);
    }

    /* Locking is what stops a stray tap costing you a send you did months ago.
       Climbed only ever adds a row now, so the only way to lose one is here. */
    if (path === "/lists/rebuild") {
      await this.rebuild();
      return json(await this.snapshot());
    }

    /* Import from the official MoonBoard logbook - one call per person with the
       whole batch, every row carrying the day it was really climbed, so first-
       ascent points and the logbook's days stay true. Rows land locked (they're
       history, not taps) and tagged src:"moonboard". A send already logged for
       the same problem on the same day is skipped, so a re-run or an ascent
       logged in both apps can't double up. Projects go onto the person's list.
       dry:true reports what would happen and writes nothing. */
    if (path === "/lists/log/import") {
      const person = clean(body.person);
      const people = (await this.state.storage.get("people")) || [];
      if (!people.includes(person)) return json({ error: "unknown person" }, 404);
      const entries = Array.isArray(body.entries) ? body.entries.slice(0, 3000) : [];
      const day = (iso) => String(iso).slice(0, 10);

      // "id|YYYY-MM-DD|send" or "...|try" already in the log - one of each per problem per day
      const kind = (result) => result === "try" ? "try" : "send";
      const have = new Set();
      for (const [, row] of await this.state.storage.list({ prefix: "log:" }))
        if (row && row.person === person) have.add(row.id + "|" + day(row.t) + "|" + kind(row.result));

      const add = [], skipped = [];
      for (const e of entries) {
        const id = Number(e && e.id);
        const result = clean(e && e.result);
        const t = e && typeof e.t === "string" && /^\d{4}-\d{2}-\d{2}/.test(e.t) ? new Date(e.t) : null;
        if (!Number.isFinite(id) || !RESULTS.includes(result) || !t || isNaN(t)) {
          skipped.push({ id: e && e.id, t: e && e.t, why: "bad row" });
          continue;
        }
        const k = id + "|" + day(t.toISOString()) + "|" + kind(result);
        if (have.has(k)) { skipped.push({ id, t: e.t, why: "already logged" }); continue; }
        have.add(k);
        add.push({ t: t.toISOString(), person, id, result, src: "moonboard", lock: true });
      }
      const listKey = "list:" + person;
      const listed = (await this.state.storage.get(listKey)) || [];
      const projects = (Array.isArray(body.projects) ? body.projects : [])
        .map(Number).filter((id) => Number.isFinite(id) && !listed.includes(id));
      const newProjects = [...new Set(projects)];

      if (body.dry) return json({ dry: true, would: add.length, skipped, projects: newProjects.length });

      for (const row of add) await this.state.storage.put(logKey(row.t), row);
      if (newProjects.length) await this.state.storage.put(listKey, [...listed, ...newProjects]);
      await this.rebuild();
      return json({ ...(await this.snapshot()), imported: add.length, skipped, projects: newProjects.length });
    }

    if (path === "/lists/log/lock") {
      const person = clean(body.person);
      if (!person) return json({ error: "person required" }, 400);
      const rows = await this.state.storage.list({ prefix: "log:" });
      let n = 0;
      for (const [key, row] of rows) {
        if (!row || row.person !== person || row.lock) continue;
        await this.state.storage.put(key, { ...row, lock: true });
        n++;
      }
      return json({ ...(await this.snapshot()), locked: n });
    }

    if (path === "/lists/log/entry") {
      const key = typeof body.key === "string" ? body.key : "";
      const action = clean(body.action);
      if (!key.startsWith("log:")) return json({ error: "bad key" }, 400);
      const row = await this.state.storage.get(key);
      if (!row) return json({ error: "no such entry" }, 404);

      if (action === "lock" || action === "unlock") {
        await this.state.storage.put(key, { ...row, lock: action === "lock" });
        return json(await this.snapshot());
      }
      if (action === "delete") {
        if (row.lock) return json({ error: "unlock it first" }, 409);
        await this.state.storage.delete(key);
        await this.recompute(row.person, row.id);
        return json(await this.snapshot());
      }
      return json({ error: "action must be delete, lock or unlock" }, 400);
    }

    if (path === "/lists/snake") {
      const person = clean(body.person);
      const score = Number(body.score);
      if (!person || !Number.isFinite(score)) return json({ error: "person and score required" }, 400);
      const people = (await this.state.storage.get("people")) || [];
      if (!people.includes(person)) return json({ error: "unknown person" }, 404);
      const snake = (await this.state.storage.get("snake")) || {};
      // Normally a personal best only ever goes up; set:true forces it, which is
      // the only way to clear a score that shouldn't be there.
      if (body.set) {
        if (score > 0) snake[person] = score; else delete snake[person];
        await this.state.storage.put("snake", snake);
      } else if (score > (snake[person] || 0)) {
        snake[person] = score;
        await this.state.storage.put("snake", snake);
      }
      return json(await this.snapshot());
    }

    if (path === "/lists/win") {
      const person = clean(body.winner);
      if (!person) return json({ error: "winner required" }, 400);
      const people = (await this.state.storage.get("people")) || [];
      if (!people.includes(person)) return json({ error: "unknown person" }, 404);
      const wins = (await this.state.storage.get("wins")) || {};
      wins[person] = (wins[person] || 0) + (body.undo ? -1 : 1);
      if (wins[person] <= 0) delete wins[person];
      await this.state.storage.put("wins", wins);
      return json(await this.snapshot());
    }

    return json({ error: "not found" }, 404);
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    if (url.pathname === "/") {
      return json({ service: "moonboard-relay", routes: ["/ws?room=", "/send?room=", "/status?room=", "/line?room=", "/lists", "/lists/log"] });
    }

    if (url.pathname === "/lists" || url.pathname.startsWith("/lists/")) {
      return env.LISTS.get(env.LISTS.idFromName("v1")).fetch(request);
    }

    const room = url.searchParams.get("room");
    if (!room || room.length < 6) {
      return json({ error: "room= required, at least 6 chars" }, 400);
    }

    const id = env.RELAY.idFromName(room);
    return env.RELAY.get(id).fetch(request);
  },
};
