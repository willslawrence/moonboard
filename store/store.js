/* The store for a wall that is a photo and a set of routes people have made on it.
   The Sun board at Will's is the first: no lights, no Bluetooth, holds picked on a picture.

   It keeps, for each wall: who climbs there, the routes (name, grade, who set it, which
   holds and what each is for), and a logbook of tries and sends. Nothing here knows about
   the MoonBoard; that side of the app keeps its own logbook with the relay.

   It runs as a Pages Function (functions/api/[[path]].js) on the same address as the page,
   on a D1 database. Everything is under /api/w/<wall>:

     GET  /api/w/sun                  the wall as it stands: people, routes, everyone's tally
     POST /api/w/sun/person           { name }                             add a climber
     POST /api/w/sun/route            { by, name, grade, marks, feet, tape, note, id? }
                                      a new route, or with id the setter's change to one
     POST /api/w/sun/route/retire     { by, id, retired }                  the setter takes it down, or puts it back
     POST /api/w/sun/log              { person, route, result }            a try or a send
     POST /api/w/sun/log/undo         { person }                           take back that climber's last entry
     GET  /api/w/sun/log?person=&route=&limit=                             logbook rows, newest first
     POST /api/w/sun/fix              { by, kind, v, x, y, h?, size? }     the map of holds is wrong here (see below)
     POST /api/w/sun/fix/undo         { k }                                take that back
     POST /api/w/sun/fixes/done       { ks }                               these are in the published map now

   A write answers with the wall as it now stands, so the phone that wrote is up to date
   without asking again. There are no accounts, as on the rest of the app: a name is a name.
   "Only the setter changes a route" is a courtesy the page keeps, not a lock.

   A logbook row is one try or one send. The tally per climber and route is the same shape
   the MoonBoard side uses, so the two read alike:
     a  tries since the last send        r  the last send's result, or null
     s  every send's result, in order     d  when the last row was written
   and it is always worked out again from the rows, so an undo cannot leave it wrong.

   The map of holds (which outline on which picture is a hold) is a file that ships with the
   page. It is made from photos by a program, and the program is sometimes wrong, so anyone at
   the wall can say so: "there is a hold here that has no outline" (add, with a rough size),
   "this outline is tape, not a hold" (drop), "this is a hold but the outline is the wrong
   shape" (redo). Those are kept here and go out with the wall, and the page acts on them at
   once: a dropped outline is gone, an added hold is a ring that can be picked, under the name
   x<number>. When the map is next made they are worked into it properly and marked done. */

export const RESULTS = ['try', 'flash', '2nd', '3rd', '4+'];
export const ROLES = ['s', 'h', 'f', 'e', 'n'];            // start, hold, foot only, finish, and a hold with its number in a climb by number
export const FEET = ['any', 'follow', 'marked'];           // any feet, feet follow hands, marked feet only
export const GRADE_MIN = -1, GRADE_MAX = 17;                // VB is -1, then V0 to V17
const WALLS = { sun: 'Sun board' };                         // the walls there are; "test-..." is any wall a check makes
const MAX_ROUTES = 3000, MAX_PEOPLE = 300, MAX_MARKS = 250, MAX_FIXES = 2000;
const FIX_KINDS = ['add', 'drop', 'redo'], FIX_SIZES = ['s', 'm', 'l'];

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const bad = (msg, status = 400) => json({ error: msg }, status);
/* A line of text someone typed: no control characters, no angle brackets, one space between
   words, and not longer than it has any reason to be. */
const clean = (v, max) => typeof v === 'string'
  ? v.replace(/[\x00-\x1f\x7f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
const unit = v => typeof v === 'number' && v >= 0 && v <= 1;
const isTest = wall => /^test-[a-z0-9-]{1,24}$/.test(wall);

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS people (wall TEXT NOT NULL, name TEXT NOT NULL, t TEXT NOT NULL, PRIMARY KEY (wall, name))`,
  `CREATE TABLE IF NOT EXISTS routes (wall TEXT NOT NULL, id INTEGER NOT NULL, name TEXT NOT NULL, grade INTEGER NOT NULL,
     setter TEXT NOT NULL, marks TEXT NOT NULL, feet TEXT NOT NULL, tape TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
     t TEXT NOT NULL, edited TEXT, retired INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (wall, id))`,
  `CREATE TABLE IF NOT EXISTS log (k INTEGER PRIMARY KEY AUTOINCREMENT, wall TEXT NOT NULL, t TEXT NOT NULL,
     person TEXT NOT NULL, route INTEGER NOT NULL, result TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS log_pair ON log (wall, person, route, k)`,
  `CREATE INDEX IF NOT EXISTS log_wall ON log (wall, k)`,
  `CREATE TABLE IF NOT EXISTS stats (wall TEXT NOT NULL, person TEXT NOT NULL, route INTEGER NOT NULL, a INTEGER NOT NULL,
     r TEXT, s TEXT NOT NULL, d TEXT, PRIMARY KEY (wall, person, route))`,
  `CREATE TABLE IF NOT EXISTS fixes (k INTEGER PRIMARY KEY AUTOINCREMENT, wall TEXT NOT NULL, t TEXT NOT NULL, who TEXT NOT NULL,
     kind TEXT NOT NULL, v TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, h TEXT, size TEXT, done INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS fixes_wall ON fixes (wall, done, k)`,
];
/* The tables are made the first time this copy of the code is asked for anything; asking
   again costs nothing. A failure is forgotten, so the next request tries afresh. */
const made = new WeakMap();
function tables(db){
  if (!made.has(db)) made.set(db, db.batch(SCHEMA.map(q => db.prepare(q))).catch(e => { made.delete(db); throw e; }));
  return made.get(db);
}

/* Which holds, and what each is for. A hold is named by its id on the wall's map of holds;
   a spot nobody has mapped is a point on one of the wall's pictures instead ({ v, x, y },
   as fractions of the picture's width and height).
   A climb by number is hands in order, each hold with its number ({ r: 'n', n }). The numbers
   are the ones on the wall, so some may be missing, and one hold may carry two. */
function cleanMarks(v){
  if (!Array.isArray(v) || v.length < 2 || v.length > MAX_MARKS) return null;
  const out = [], seen = new Set();
  for (const m of v){
    if (!m || !ROLES.includes(m.r)) return null;
    const num = m.r === 'n' ? { n: m.n } : {};
    if (m.r === 'n' && !(Number.isInteger(m.n) && m.n >= 1 && m.n <= 999)) return null;
    if (typeof m.h === 'string' && /^[A-Za-z0-9_.-]{1,16}$/.test(m.h)){
      const key = m.r === 'n' ? m.h + ' ' + m.n : m.h;        // a hold once, or once for each number it carries
      if (seen.has(key)) continue;
      seen.add(key); out.push({ h: m.h, r: m.r, ...num });
    } else if (typeof m.v === 'string' && /^[a-z0-9-]{1,16}$/.test(m.v) && unit(m.x) && unit(m.y)){
      out.push({ v: m.v, x: Math.round(m.x * 1e4) / 1e4, y: Math.round(m.y * 1e4) / 1e4, r: m.r, ...num });
    } else return null;
  }
  return out.length >= 2 ? out : null;
}

async function snapshot(db, wall){
  const [p, r, s, f] = await db.batch([
    db.prepare('SELECT name FROM people WHERE wall = ? ORDER BY t, name').bind(wall),
    db.prepare('SELECT id, name, grade, setter, marks, feet, tape, note, t, edited, retired FROM routes WHERE wall = ? ORDER BY id').bind(wall),
    db.prepare('SELECT person, route, a, r, s, d FROM stats WHERE wall = ?').bind(wall),
    db.prepare('SELECT k, who, kind, v, x, y, h, size FROM fixes WHERE wall = ? AND done = 0 ORDER BY k').bind(wall),
  ]);
  const stats = {};
  for (const row of s.results){
    const e = { a: row.a, r: row.r, d: row.d };
    const sends = JSON.parse(row.s);
    if (sends.length) e.s = sends;
    (stats[row.person] = stats[row.person] || {})[row.route] = e;
  }
  return {
    wall, people: p.results.map(x => x.name),
    routes: r.results.map(x => ({ ...x, marks: JSON.parse(x.marks), retired: !!x.retired })),
    stats,
    fixes: f.results.map(x => { const o = { k: x.k, by: x.who, kind: x.kind, v: x.v, x: x.x, y: x.y }; if (x.h) o.h = x.h; if (x.size) o.size = x.size; return o; }),
  };
}

/* One climber's tally on one route, from that pair's rows. */
async function recount(db, wall, person, route){
  const rows = (await db.prepare('SELECT result, t FROM log WHERE wall = ? AND person = ? AND route = ? ORDER BY k')
    .bind(wall, person, route).all()).results;
  let a = 0, d = null; const sends = [];
  for (const row of rows){
    if (row.result === 'try') a++; else { sends.push(row.result); a = 0; }
    d = row.t;
  }
  if (!rows.length)
    return db.prepare('DELETE FROM stats WHERE wall = ? AND person = ? AND route = ?').bind(wall, person, route).run();
  return db.prepare(`INSERT INTO stats (wall, person, route, a, r, s, d) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (wall, person, route) DO UPDATE SET a = excluded.a, r = excluded.r, s = excluded.s, d = excluded.d`)
    .bind(wall, person, route, a, sends.length ? sends[sends.length - 1] : null, JSON.stringify(sends), d).run();
}

const knows = async (db, wall, name) =>
  !!(await db.prepare('SELECT 1 AS ok FROM people WHERE wall = ? AND name = ?').bind(wall, name).first());

export async function handle(request, db, now = () => new Date().toISOString()){
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/w\/([a-z0-9-]{1,32})(\/.*)?$/);
  if (!m) return bad('not found', 404);
  const wall = m[1], path = m[2] || '';
  if (!WALLS[wall] && !isTest(wall)) return bad('no such wall', 404);
  if (!db) return bad('the store has no database bound to it', 500);
  await tables(db);

  if (request.method === 'GET'){
    if (path === '') return json(await snapshot(db, wall));
    if (path === '/log'){
      const person = clean(url.searchParams.get('person') || '', 40);
      const route = Number(url.searchParams.get('route') || 0);
      const limit = Math.min(3000, Math.max(1, Number(url.searchParams.get('limit')) || 300));
      const where = ['wall = ?'], args = [wall];
      if (person){ where.push('person = ?'); args.push(person); }
      if (route){ where.push('route = ?'); args.push(route); }
      const rows = await db.prepare('SELECT k, t, person, route, result FROM log WHERE ' + where.join(' AND ') + ' ORDER BY k DESC LIMIT ?')
        .bind(...args, limit).all();
      return json({ entries: rows.results });
    }
    return bad('not found', 404);
  }
  if (request.method !== 'POST') return bad('GET or POST', 405);

  let body;
  try{ body = JSON.parse((await request.text()).slice(0, 40000)); }catch(e){ return bad('the body must be JSON'); }
  if (!body || typeof body !== 'object') return bad('the body must be JSON');

  if (path === '/person'){
    const name = clean(body.name, 40);
    if (!name) return bad('a name is needed');
    const have = (await db.prepare('SELECT name FROM people WHERE wall = ?').bind(wall).all()).results.map(x => x.name);
    // two spellings of one name would be two climbers ever after
    const same = have.find(n => n.toLowerCase() === name.toLowerCase());
    if (!same){
      if (have.length >= MAX_PEOPLE) return bad('this wall has all the names it can hold', 409);
      await db.prepare('INSERT OR IGNORE INTO people (wall, name, t) VALUES (?, ?, ?)').bind(wall, name, now()).run();
    }
    return json({ ...(await snapshot(db, wall)), name: same || name });
  }

  if (path === '/route'){
    const by = clean(body.by, 40), name = clean(body.name, 60);
    const grade = Number(body.grade), marks = cleanMarks(body.marks);
    const feet = FEET.includes(body.feet) ? body.feet : 'any';
    const tape = clean(body.tape, 40), note = clean(body.note, 200);
    if (!by || !(await knows(db, wall, by))) return bad('say who you are first', 404);
    if (!name) return bad('the route needs a name');
    if (!Number.isInteger(grade) || grade < GRADE_MIN || grade > GRADE_MAX) return bad('the route needs a grade');
    if (!marks) return bad('pick at least two holds');
    if (marks.filter(k => k.r === 'n').length < 2){          // a climb by number starts at its lowest number and ends at its highest
      if (!marks.some(k => k.r === 's')) return bad('mark a hold to start on');
      if (!marks.some(k => k.r === 'e')) return bad('mark a hold to finish on');
    }

    if (body.id !== undefined && body.id !== null){
      const id = Number(body.id);
      const cur = await db.prepare('SELECT setter FROM routes WHERE wall = ? AND id = ?').bind(wall, id).first();
      if (!cur) return bad('no such route', 404);
      if (cur.setter !== by) return bad('only ' + cur.setter + ' changes this route', 403);
      await db.prepare('UPDATE routes SET name = ?, grade = ?, marks = ?, feet = ?, tape = ?, note = ?, edited = ? WHERE wall = ? AND id = ?')
        .bind(name, grade, JSON.stringify(marks), feet, tape, note, now(), wall, id).run();
      return json({ ...(await snapshot(db, wall)), id });
    }
    const count = (await db.prepare('SELECT COUNT(*) AS n FROM routes WHERE wall = ?').bind(wall).first()).n;
    if (count >= MAX_ROUTES) return bad('this wall has all the routes it can hold', 409);
    // the number is taken in the same statement that uses it, so two phones cannot be given the same one
    const made = await db.prepare(`INSERT INTO routes (wall, id, name, grade, setter, marks, feet, tape, note, t)
        SELECT ?, COALESCE(MAX(id), 0) + 1, ?, ?, ?, ?, ?, ?, ?, ? FROM routes WHERE wall = ? RETURNING id`)
      .bind(wall, name, grade, by, JSON.stringify(marks), feet, tape, note, now(), wall).first();
    return json({ ...(await snapshot(db, wall)), id: made.id });
  }

  if (path === '/route/retire'){
    const by = clean(body.by, 40), id = Number(body.id);
    const cur = await db.prepare('SELECT setter FROM routes WHERE wall = ? AND id = ?').bind(wall, id).first();
    if (!cur) return bad('no such route', 404);
    if (cur.setter !== by) return bad('only ' + cur.setter + ' takes this route down', 403);
    await db.prepare('UPDATE routes SET retired = ?, edited = ? WHERE wall = ? AND id = ?').bind(body.retired ? 1 : 0, now(), wall, id).run();
    return json(await snapshot(db, wall));
  }

  if (path === '/log'){
    const person = clean(body.person, 40), route = Number(body.route), result = body.result;
    if (!person || !(await knows(db, wall, person))) return bad('say who you are first', 404);
    if (!RESULTS.includes(result)) return bad('a try, or how many goes the send took');
    if (!(await db.prepare('SELECT 1 AS ok FROM routes WHERE wall = ? AND id = ?').bind(wall, route).first())) return bad('no such route', 404);
    await db.prepare('INSERT INTO log (wall, t, person, route, result) VALUES (?, ?, ?, ?, ?)').bind(wall, now(), person, route, result).run();
    await recount(db, wall, person, route);
    return json(await snapshot(db, wall));
  }

  if (path === '/log/undo'){
    const person = clean(body.person, 40);
    const last = await db.prepare('SELECT k, route FROM log WHERE wall = ? AND person = ? ORDER BY k DESC LIMIT 1').bind(wall, person).first();
    if (!last) return bad('nothing to undo', 404);
    await db.prepare('DELETE FROM log WHERE k = ?').bind(last.k).run();
    await recount(db, wall, person, last.route);
    return json({ ...(await snapshot(db, wall)), undone: last.route });
  }

  if (path === '/fix'){
    const by = clean(body.by, 40), kind = body.kind, v = typeof body.v === 'string' && /^[a-z0-9-]{1,16}$/.test(body.v) ? body.v : '';
    if (!by || !(await knows(db, wall, by))) return bad('say who you are first', 404);
    if (!FIX_KINDS.includes(kind) || !v || !unit(body.x) || !unit(body.y)) return bad('a fix is add, drop or redo, at a point on one of the pictures');
    const h = typeof body.h === 'string' && /^[A-Za-z0-9_.-]{1,16}$/.test(body.h) ? body.h : null;
    if (kind !== 'add' && !h) return bad('say which hold');
    const size = kind === 'add' ? (FIX_SIZES.includes(body.size) ? body.size : 'm') : null;
    // the same thing said twice is said once
    const same = kind === 'add' ? null
      : await db.prepare('SELECT k FROM fixes WHERE wall = ? AND done = 0 AND kind = ? AND h = ?').bind(wall, kind, h).first();
    if (!same){
      const n = (await db.prepare('SELECT COUNT(*) AS n FROM fixes WHERE wall = ? AND done = 0').bind(wall).first()).n;
      if (n >= MAX_FIXES) return bad('that is all the fixes this wall can hold until the map is next made', 409);
      await db.prepare('INSERT INTO fixes (wall, t, who, kind, v, x, y, h, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(wall, now(), by, kind, v, Math.round(body.x * 1e4) / 1e4, Math.round(body.y * 1e4) / 1e4, kind === 'add' ? null : h, size).run();
    }
    return json(await snapshot(db, wall));
  }

  if (path === '/fix/undo'){
    await db.prepare('DELETE FROM fixes WHERE wall = ? AND k = ? AND done = 0').bind(wall, Number(body.k)).run();
    return json(await snapshot(db, wall));
  }

  // said by whoever has just published a map with these worked in
  if (path === '/fixes/done'){
    const ks = Array.isArray(body.ks) ? body.ks.map(Number).filter(Number.isInteger).slice(0, MAX_FIXES) : [];
    for (let i = 0; i < ks.length; i += 50)
      await db.batch(ks.slice(i, i + 50).map(k => db.prepare('UPDATE fixes SET done = 1 WHERE wall = ? AND k = ?').bind(wall, k)));
    return json(await snapshot(db, wall));
  }

  // a check clears up after itself; a real wall cannot be emptied this way
  if (path === '/reset' && isTest(wall)){
    await db.batch(['people', 'routes', 'log', 'stats', 'fixes'].map(t => db.prepare('DELETE FROM ' + t + ' WHERE wall = ?').bind(wall)));
    return json(await snapshot(db, wall));
  }
  return bad('not found', 404);
}
