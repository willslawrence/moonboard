/* Connect alerts (Will, 2026-10-23: "When someone connects the moonboard… pings phones").

   A phone that turns on "Tell me when someone connects the wall" in Settings signs up here with
   its push subscription, the room it climbs in and its climber's name. The phone that gets the
   wall (the Pi took it for that phone, or its own Bluetooth connected) says so, and every other
   signed-up phone in that room gets a notification: never the connecting phone, never another phone
   of the same climber, and no phone more than once in 2 hours. No logins, as everywhere on the
   site; the 2 hours is what keeps it from becoming a nuisance.

     GET  /api/push/key                                          { key } for pushManager.subscribe
     POST /api/push/subscribe   { endpoint, keys, room, name }   this phone wants the alerts
     POST /api/push/unsubscribe { endpoint }                     it doesn't any more
     POST /api/push/connected   { room, by, endpoint }           answers at once; the pings go after

   The Sun board (Will, 2026-10-23: "One notification at most every 3 hours if someone has logged a climb"): a
   phone that turns on "Tell me when someone logs a climb" on the Sun page signs up in push_sun, and every try or
   send logged on the Sun board (POST /api/w/sun/log, see functions/api/[[path]].js) pings the others, but none of
   the same climber's and no phone more than once in 3 hours.

     POST /api/push/sun/subscribe   { endpoint, keys, name }
     POST /api/push/sun/unsubscribe { endpoint }

   The VAPID key is the Pages project's secret VAPID_JWK (store/webpush.js). */
import { publicKeyOf, sendPush } from './webpush.js';

const QUIET = 2 * 3600e3;   // Will, 2026-10-23: "At most one every 2 hours so not to spam"
const SUN_QUIET = 3 * 3600e3;   // Will: "at most every 3 hours"
const HOME_ROOM = 'moonwall-crew';
const ready = new WeakSet();

async function tables(db){
  if (ready.has(db)) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, room TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '', p256dh TEXT NOT NULL, auth TEXT NOT NULL, t INTEGER NOT NULL, pinged INTEGER NOT NULL DEFAULT 0)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS push_sun (endpoint TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '',
    p256dh TEXT NOT NULL, auth TEXT NOT NULL, t INTEGER NOT NULL, pinged INTEGER NOT NULL DEFAULT 0)`).run();
  ready.add(db);
}

const json = (body, status = 200) => new Response(JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const roomOf = v => (typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? v : null);
const nameOf = v => (typeof v === 'string' ? v.trim().slice(0, 40) : '');
const endpointOf = v => (typeof v === 'string' && /^https:\/\/\S{8,1000}$/.test(v) ? v : null);

// What a phone shows, in Will's words: "🧗 Abdu climbing at Will's Wall".
export function messageFor(room, by){
  const wall = room === HOME_ROOM ? "Will's Wall" : 'the MoonBoard';
  return { title: `🧗 ${by || 'Someone'} climbing at ${wall}`, body: 'Tap to open the app.', url: '/', tag: 'connect-' + room };
}

export async function handlePush(request, env, waitUntil = p => p, now = Date.now){
  if (!env.VAPID_JWK) return json({ error: 'notifications are not set up' }, 503);
  const db = env.DB, jwk = JSON.parse(env.VAPID_JWK);
  const what = new URL(request.url).pathname.replace(/^\/api\/push\/?/, '');
  if (what === 'key' && request.method === 'GET') return json({ key: publicKeyOf(jwk) });
  if (request.method !== 'POST') return json({ error: 'not found' }, 404);
  await tables(db);
  const b = await request.json().catch(() => ({}));

  if (what === 'sun/subscribe'){
    const endpoint = endpointOf(b.endpoint), k = b.keys || {};
    if (!endpoint || !/^[\w-]{40,200}$/.test(k.p256dh || '') || !/^[\w-]{10,60}$/.test(k.auth || ''))
      return json({ error: 'expected endpoint and keys' }, 400);
    await db.prepare(`INSERT INTO push_sun (endpoint, name, p256dh, auth, t) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (endpoint) DO UPDATE SET name = excluded.name, p256dh = excluded.p256dh, auth = excluded.auth, t = excluded.t`)
      .bind(endpoint, nameOf(b.name), k.p256dh, k.auth, now()).run();
    return json({ ok: true });
  }

  if (what === 'sun/unsubscribe'){
    const endpoint = endpointOf(b.endpoint);
    if (!endpoint) return json({ error: 'expected an endpoint' }, 400);
    await db.prepare('DELETE FROM push_sun WHERE endpoint = ?').bind(endpoint).run();
    return json({ ok: true });
  }

  if (what === 'subscribe'){
    const endpoint = endpointOf(b.endpoint), room = roomOf(b.room), k = b.keys || {};
    if (!endpoint || !room || !/^[\w-]{40,200}$/.test(k.p256dh || '') || !/^[\w-]{10,60}$/.test(k.auth || ''))
      return json({ error: 'expected endpoint, keys and room' }, 400);
    await db.prepare(`INSERT INTO push_subs (endpoint, room, name, p256dh, auth, t) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (endpoint) DO UPDATE SET room = excluded.room, name = excluded.name, p256dh = excluded.p256dh,
      auth = excluded.auth, t = excluded.t`).bind(endpoint, room, nameOf(b.name), k.p256dh, k.auth, now()).run();
    return json({ ok: true });
  }

  if (what === 'unsubscribe'){
    const endpoint = endpointOf(b.endpoint);
    if (!endpoint) return json({ error: 'expected an endpoint' }, 400);
    await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(endpoint).run();
    return json({ ok: true });
  }

  if (what === 'connected'){
    const room = roomOf(b.room);
    if (!room) return json({ error: 'expected a room' }, 400);
    const by = nameOf(b.by), from = endpointOf(b.endpoint) || '', t = now();
    const subs = (await db.prepare('SELECT * FROM push_subs WHERE room = ? AND endpoint != ? AND pinged < ?')
      .bind(room, from, t - QUIET).all()).results
      .filter(s => !by || s.name.toLowerCase() !== by.toLowerCase());
    if (!subs.length) return json({ ok: true, pinging: 0 });
    await db.prepare(`UPDATE push_subs SET pinged = ? WHERE endpoint IN (${subs.map(() => '?').join(',')})`)
      .bind(t, ...subs.map(s => s.endpoint)).run();
    const message = messageFor(room, by);
    waitUntil((async () => {
      for (const s of subs){
        const r = await sendPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, jwk,
          'https://wills-wall.pages.dev').catch(() => null);
        if (r && (r.status === 404 || r.status === 410)) await db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint).run();
      }
    })());
    return json({ ok: true, pinging: subs.length });
  }
  return json({ error: 'not found' }, 404);
}

/* A try or a send was logged on the Sun board by this climber: ping the other signed-up phones,
   each at most once in 3 hours. Called after the log is written (functions/api/[[path]].js). */
export async function sunLogged(env, person, now = Date.now){
  if (!env.VAPID_JWK) return 0;
  const db = env.DB, jwk = JSON.parse(env.VAPID_JWK), by = nameOf(person), t = now();
  await tables(db);
  const subs = (await db.prepare('SELECT * FROM push_sun WHERE pinged < ?').bind(t - SUN_QUIET).all()).results
    .filter(s => !by || s.name.toLowerCase() !== by.toLowerCase());
  if (!subs.length) return 0;
  await db.prepare(`UPDATE push_sun SET pinged = ? WHERE endpoint IN (${subs.map(() => '?').join(',')})`)
    .bind(t, ...subs.map(s => s.endpoint)).run();
  const message = { title: `☀️ ${by || 'Someone'} climbing on the Sun board`, body: 'Tap to open the app.', url: '/sun/', tag: 'sun-log' };
  for (const s of subs){
    const r = await sendPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, jwk,
      'https://wills-wall.pages.dev').catch(() => null);
    if (r && (r.status === 404 || r.status === 410)) await db.prepare('DELETE FROM push_sun WHERE endpoint = ?').bind(s.endpoint).run();
  }
  return subs.length;
}
