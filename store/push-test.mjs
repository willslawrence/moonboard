// The connect alerts on their own: the stand-in D1, a made-up key, and a stand-in for the push
// services that records who was pinged.   node store/push-test.mjs
import { handlePush } from './push.js';
import { standInD1 } from './stand-in-d1.mjs';

let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok || detail === undefined ? '' : '\n       ' + JSON.stringify(detail))); };

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const env = { DB: standInD1(), VAPID_JWK: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)) };
let clock = Date.parse('2026-10-23T18:00:00Z');
const now = () => clock;
let pinged = [], gone = new Set();
globalThis.fetch = async url => { pinged.push(url.split('/').pop()); return new Response('', { status: gone.has(url) ? 410 : 201 }); };
const pending = [];
const call = async (method, path, body) => {
  const r = await handlePush(new Request('https://x.test/api/push/' + path, { method, body: body ? JSON.stringify(body) : undefined }), env, p => pending.push(p), now);
  await Promise.all(pending.splice(0));
  return { status: r.status, ...(await r.json()) };
};
async function phone(id){
  const k = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey));
  const b64u = b => Buffer.from(b).toString('base64url');
  return { endpoint: 'https://web.push.apple.com/' + id, keys: { p256dh: b64u(raw), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) } };
}
const [willPhone, willPad, abdu, sara, away] = await Promise.all(['willPhone', 'willPad', 'abdu', 'sara', 'away'].map(phone));

console.log('signing up');
check('the key is there for subscribe', (await call('GET', 'key')).key?.length === 87);
check('a phone without a room is refused', (await call('POST', 'subscribe', { ...abdu })).status === 400);
for (const [p, name] of [[willPhone, 'Will'], [willPad, 'will'], [abdu, 'Abdu'], [sara, 'Sara']])
  check(name + ' signs up', (await call('POST', 'subscribe', { ...p, room: 'moonwall-crew', name })).ok === true);
check('a phone at another MoonBoard signs up', (await call('POST', 'subscribe', { ...away, room: 'gym-xyz', name: 'Faisal' })).ok === true);

console.log('who is pinged');
pinged = [];
let r = await call('POST', 'connected', { room: 'moonwall-crew', by: 'Will', endpoint: willPhone.endpoint });
check('Will connects: Abdu and Sara, not Will\'s own phone or iPad, not the other gym', pinged.sort().join() === 'abdu,sara' && r.pinging === 2, pinged);
pinged = []; clock += 5 * 60e3;
r = await call('POST', 'connected', { room: 'moonwall-crew', by: 'Abdu', endpoint: abdu.endpoint });
check('Abdu five minutes later: Will\'s two, and Sara is left alone (pinged 5 min ago)', pinged.sort().join() === 'willPad,willPhone', pinged);
pinged = []; clock += 10 * 60e3;
r = await call('POST', 'connected', { room: 'moonwall-crew', by: 'Sara', endpoint: sara.endpoint });
check('Sara ten minutes after that: nobody, everyone heard in the last 20 minutes', pinged.length === 0 && r.pinging === 0, pinged);
pinged = []; clock += 30 * 60e3;
r = await call('POST', 'connected', { room: 'moonwall-crew', by: '', endpoint: '' });
check('somebody with no name, later: all four crew phones', pinged.length === 4, pinged);
pinged = []; clock += 30 * 60e3;
await call('POST', 'connected', { room: 'gym-xyz', by: 'Someone' });
check('another MoonBoard pings only its own phones', pinged.join() === 'away', pinged);

console.log('phones that let go');
gone.add(sara.endpoint); pinged = []; clock += 30 * 60e3;
await call('POST', 'connected', { room: 'moonwall-crew', by: 'Abdu', endpoint: abdu.endpoint });
pinged = []; clock += 30 * 60e3;
await call('POST', 'connected', { room: 'moonwall-crew', by: 'Abdu', endpoint: abdu.endpoint });
check('a phone the push service has forgotten is dropped', !pinged.includes('sara') && pinged.length === 2, pinged);
check('unsubscribe', (await call('POST', 'unsubscribe', { endpoint: willPad.endpoint })).ok === true);
pinged = []; clock += 30 * 60e3;
await call('POST', 'connected', { room: 'moonwall-crew', by: 'Abdu', endpoint: abdu.endpoint });
check('and it hears nothing more', pinged.join() === 'willPhone', pinged);
check('without the key, the alerts say they are not set up', (await handlePush(new Request('https://x.test/api/push/key'), { DB: env.DB })).status === 503);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
