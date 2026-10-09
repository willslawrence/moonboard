// The store, on its own: no Cloudflare, no browser. A stand-in for D1 is made from the SQLite
// that comes with Node, with the few calls the store uses.   node store/test.mjs
import { handle } from './store.js';
import { standInD1 } from './stand-in-d1.mjs';

let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok || detail === undefined ? '' : '\n       ' + JSON.stringify(detail))); };
const db = standInD1();
let clock = Date.parse('2026-10-09T18:00:00Z');
const now = () => new Date(clock += 60000).toISOString();
const call = async (method, path, body) => {
  const r = await handle(new Request('https://x.test' + path, { method, body: body ? JSON.stringify(body) : undefined }), db, now);
  return { status: r.status, ...(await r.json()) };
};
const marks = [{ h: 'W012', r: 's' }, { h: 'W040', r: 'h' }, { h: 'W041', r: 'f' }, { v: 'over', x: 0.42, y: 0.137512, r: 'h' }, { h: 'K003', r: 'e' }];

console.log('a wall that does not exist, and an empty one');
check('an unknown wall is refused', (await call('GET', '/api/w/moon')).status === 404);
check('anything outside /api/w is refused', (await call('GET', '/api/lists')).status === 404);
let s = await call('GET', '/api/w/sun');
check('the Sun board starts empty', s.status === 200 && s.wall === 'sun' && s.people.length === 0 && s.routes.length === 0 && Object.keys(s.stats).length === 0 && s.fixes.length === 0, s);

console.log('people');
s = await call('POST', '/api/w/sun/person', { name: '  Will ' });
check('a name is added, trimmed', s.people.join() === 'Will' && s.name === 'Will', s);
s = await call('POST', '/api/w/sun/person', { name: 'will' });
check('the same name in another spelling is the same climber', s.people.join() === 'Will' && s.name === 'Will', s);
s = await call('POST', '/api/w/sun/person', { name: 'Sara' });
s = await call('POST', '/api/w/sun/person', { name: 'Abdullah \u{1F9D7}' });
check('names keep their order and an emoji', s.people.length === 3 && s.people[2] === 'Abdullah \u{1F9D7}', s.people);
check('an empty name is refused', (await call('POST', '/api/w/sun/person', { name: '  ' })).status === 400);
check('markup in a name is taken out', (await call('POST', '/api/w/test-a/person', { name: '<b>Bo</b>' })).name === 'b Bo /b');

console.log('making a route');
check('a stranger cannot make one', (await call('POST', '/api/w/sun/route', { by: 'Nobody', name: 'X', grade: 3, marks })).status === 404);
check('it needs a name', (await call('POST', '/api/w/sun/route', { by: 'Will', name: '', grade: 3, marks })).error === 'the route needs a name');
check('it needs a grade', (await call('POST', '/api/w/sun/route', { by: 'Will', name: 'X', grade: 3.5, marks })).status === 400 &&
  (await call('POST', '/api/w/sun/route', { by: 'Will', name: 'X', grade: 40, marks })).status === 400);
check('it needs two holds', (await call('POST', '/api/w/sun/route', { by: 'Will', name: 'X', grade: 3, marks: [marks[0]] })).error === 'pick at least two holds');
check('it needs a start', (await call('POST', '/api/w/sun/route', { by: 'Will', name: 'X', grade: 3, marks: marks.slice(1) })).error === 'mark a hold to start on');
check('it needs a finish', (await call('POST', '/api/w/sun/route', { by: 'Will', name: 'X', grade: 3, marks: marks.slice(0, 4) })).error === 'mark a hold to finish on');
check('a hold that is not a hold is refused', (await call('POST', '/api/w/sun/route', { by: 'Will', name: 'X', grade: 3, marks: [...marks, { h: 'bad id!', r: 'h' }] })).status === 400);
check('a point off the picture is refused', (await call('POST', '/api/w/sun/route', { by: 'Will', name: 'X', grade: 3, marks: [...marks, { v: 'over', x: 1.2, y: 0.5, r: 'h' }] })).status === 400);
s = await call('POST', '/api/w/sun/route', { by: 'Will', name: ' Sun  up ', grade: 3, marks: [...marks, { h: 'W012', r: 'h' }], feet: 'follow', tape: 'blue 62', note: 'sit start' });
const r1 = s.routes[0];
check('a route is made and numbered 1', s.status === 200 && s.id === 1 && s.routes.length === 1 && r1.id === 1, s);
check('it keeps its name tidy, its grade, setter, feet rule, tape and note', r1.name === 'Sun up' && r1.grade === 3 && r1.setter === 'Will' && r1.feet === 'follow' && r1.tape === 'blue 62' && r1.note === 'sit start' && r1.retired === false, r1);
check('a hold picked twice is kept once, the first time', r1.marks.length === 5 && r1.marks[0].h === 'W012' && r1.marks[0].r === 's', r1.marks);
check('a point on a picture is kept to four places', r1.marks[3].v === 'over' && r1.marks[3].x === 0.42 && r1.marks[3].y === 0.1375, r1.marks[3]);
s = await call('POST', '/api/w/sun/route', { by: 'Sara', name: 'Second', grade: -1, marks, feet: 'nonsense' });
check('the next is 2, VB is a grade, and an unknown feet rule becomes any feet', s.id === 2 && s.routes[1].grade === -1 && s.routes[1].feet === 'any', s.routes[1]);

console.log('changing a route');
check('someone else cannot change it', (await call('POST', '/api/w/sun/route', { id: 1, by: 'Sara', name: 'Mine now', grade: 3, marks })).status === 403);
s = await call('POST', '/api/w/sun/route', { id: 1, by: 'Will', name: 'Sun up', grade: 4, marks: marks.slice().reverse().map((m, i) => ({ ...m, r: i === 0 ? 's' : i === 4 ? 'e' : 'h' })) });
check('the setter can: grade and holds change, the number and the date made do not', s.routes[0].id === 1 && s.routes[0].grade === 4 && s.routes[0].marks[0].h === 'K003' && s.routes[0].t === r1.t && !!s.routes[0].edited, s.routes[0]);
check('a route that is not there cannot be changed', (await call('POST', '/api/w/sun/route', { id: 99, by: 'Will', name: 'X', grade: 3, marks })).status === 404);
check('someone else cannot take it down', (await call('POST', '/api/w/sun/route/retire', { id: 1, by: 'Sara', retired: true })).status === 403);
s = await call('POST', '/api/w/sun/route/retire', { id: 2, by: 'Sara', retired: true });
check('the setter takes one down: it stays, marked', s.routes.length === 2 && s.routes[1].retired === true);
s = await call('POST', '/api/w/sun/route/retire', { id: 2, by: 'Sara', retired: false });
check('and puts it back', s.routes[1].retired === false);

console.log('the logbook');
check('a stranger cannot log', (await call('POST', '/api/w/sun/log', { person: 'Nobody', route: 1, result: 'try' })).status === 404);
check('a route that is not there cannot be logged', (await call('POST', '/api/w/sun/log', { person: 'Will', route: 9, result: 'try' })).status === 404);
check('a result that is not one is refused', (await call('POST', '/api/w/sun/log', { person: 'Will', route: 1, result: 'sent' })).status === 400);
await call('POST', '/api/w/sun/log', { person: 'Will', route: 1, result: 'try' });
s = await call('POST', '/api/w/sun/log', { person: 'Will', route: 1, result: 'try' });
check('two tries count two', s.stats.Will[1].a === 2 && s.stats.Will[1].r === null && !('s' in s.stats.Will[1]), s.stats);
s = await call('POST', '/api/w/sun/log', { person: 'Will', route: 1, result: '3rd' });
check('a send keeps its result and starts the tries again', s.stats.Will[1].a === 0 && s.stats.Will[1].r === '3rd' && s.stats.Will[1].s.join() === '3rd', s.stats);
await call('POST', '/api/w/sun/log', { person: 'Will', route: 1, result: 'try' });
s = await call('POST', '/api/w/sun/log', { person: 'Will', route: 1, result: 'flash' });
check('a second send is kept after the first, which stays first', s.stats.Will[1].s.join() === '3rd,flash' && s.stats.Will[1].r === 'flash' && s.stats.Will[1].a === 0, s.stats);
s = await call('POST', '/api/w/sun/log', { person: 'Sara', route: 1, result: 'flash' });
check('each climber has a tally of their own', s.stats.Sara[1].s.join() === 'flash' && s.stats.Will[1].s.length === 2, s.stats);
let l = await call('GET', '/api/w/sun/log?person=Will');
check('a climber\'s rows come newest first', l.entries.length === 5 && l.entries[0].result === 'flash' && l.entries[4].result === 'try' && l.entries.every(e => e.person === 'Will'), l.entries);
l = await call('GET', '/api/w/sun/log?route=1&limit=2');
check('rows can be asked for by route, and limited', l.entries.length === 2 && l.entries[0].person === 'Sara', l.entries);
l = await call('GET', '/api/w/sun/log');
check('and all together', l.entries.length === 6);

console.log('undo');
s = await call('POST', '/api/w/sun/log/undo', { person: 'Will' });
check('undo takes back that climber\'s last row, and the tally follows', s.undone === 1 && s.stats.Will[1].s.join() === '3rd' && s.stats.Will[1].a === 1 && s.stats.Sara[1].s.join() === 'flash', s.stats);
s = await call('POST', '/api/w/sun/log/undo', { person: 'Sara' });
check('undoing a climber\'s only row leaves no tally at all', !('Sara' in s.stats), s.stats);
check('with nothing left there is nothing to undo', (await call('POST', '/api/w/sun/log/undo', { person: 'Sara' })).status === 404);
for (let i = 0; i < 4; i++) s = await call('POST', '/api/w/sun/log/undo', { person: 'Will' });
check('undone all the way back, the tally is gone', !('Will' in s.stats) && (await call('GET', '/api/w/sun/log')).entries.length === 0, s.stats);

console.log('fixes to the map of holds');
check('a stranger cannot fix the map', (await call('POST', '/api/w/sun/fix', { by: 'Nobody', kind: 'add', v: 'kick', x: 0.5, y: 0.5 })).status === 404);
check('a fix needs a kind, a picture and a point on it', (await call('POST', '/api/w/sun/fix', { by: 'Will', kind: 'paint', v: 'kick', x: 0.5, y: 0.5 })).status === 400 &&
  (await call('POST', '/api/w/sun/fix', { by: 'Will', kind: 'add', v: 'kick', x: 1.5, y: 0.5 })).status === 400 && (await call('POST', '/api/w/sun/fix', { by: 'Will', kind: 'add', x: 0.5, y: 0.5 })).status === 400);
check('drop and redo need a hold', (await call('POST', '/api/w/sun/fix', { by: 'Will', kind: 'drop', v: 'kick', x: 0.5, y: 0.5 })).error === 'say which hold');
s = await call('POST', '/api/w/sun/fix', { by: 'Will', kind: 'add', v: 'kick', x: 0.123456, y: 0.5, size: 'l' });
check('a missed hold is kept, with where and how big, and goes out with the wall', s.fixes.length === 1 && s.fixes[0].kind === 'add' && s.fixes[0].v === 'kick' && s.fixes[0].x === 0.1235 && s.fixes[0].size === 'l' && s.fixes[0].by === 'Will' && s.fixes[0].k === 1, s.fixes);
s = await call('POST', '/api/w/sun/fix', { by: 'Sara', kind: 'add', v: 'kick', x: 0.2, y: 0.5, size: 'huge' });
check('a size that is not one becomes medium', s.fixes[1].size === 'm');
s = await call('POST', '/api/w/sun/fix', { by: 'Sara', kind: 'drop', v: 'wall', x: 0.3, y: 0.3, h: 'w37' });
s = await call('POST', '/api/w/sun/fix', { by: 'Will', kind: 'drop', v: 'wall', x: 0.3, y: 0.3, h: 'w37' });
check('the same outline dropped twice is dropped once', s.fixes.filter(f => f.kind === 'drop').length === 1 && s.fixes.length === 3, s.fixes);
s = await call('POST', '/api/w/sun/fix', { by: 'Will', kind: 'redo', v: 'wall', x: 0.3, y: 0.3, h: 'w37' });
check('but it can also be said to be the wrong shape', s.fixes.length === 4 && s.fixes[3].kind === 'redo' && s.fixes[3].h === 'w37');
s = await call('POST', '/api/w/sun/fix/undo', { k: 3 });
check('a fix can be taken back', s.fixes.length === 3 && !s.fixes.some(f => f.k === 3));
s = await call('POST', '/api/w/sun/fixes/done', { ks: [1, 2, 'x', 999] });
check('fixes worked into the map are done and no longer go out', s.fixes.length === 1 && s.fixes[0].k === 4, s.fixes);
check('a done one cannot be taken back', (await call('POST', '/api/w/sun/fix/undo', { k: 1 })).fixes.length === 1);
await call('POST', '/api/w/sun/fixes/done', { ks: [4] });

console.log('walls are apart, and only a check\'s wall can be emptied');
await call('POST', '/api/w/test-a/person', { name: 'Tess' });
s = await call('POST', '/api/w/test-a/route', { by: 'Tess', name: 'Test one', grade: 0, marks });
check('another wall numbers its routes from 1 and has its own people', s.id === 1 && s.people.includes('Tess') && !s.people.includes('Will'), s);
check('the Sun board did not gain it', (await call('GET', '/api/w/sun')).routes.length === 2);
check('the Sun board cannot be emptied', (await call('POST', '/api/w/sun/reset', {})).status === 404 && (await call('GET', '/api/w/sun')).routes.length === 2);
s = await call('POST', '/api/w/test-a/reset', {});
check('a check\'s wall can', s.routes.length === 0 && s.people.length === 0 && (await call('GET', '/api/w/sun')).people.length === 3, s);
check('a body that is not JSON is refused',
  (await handle(new Request('https://x.test/api/w/sun/person', { method: 'POST', body: 'name=Will' }), db)).status === 400);
check('other methods are refused', (await handle(new Request('https://x.test/api/w/sun', { method: 'DELETE' }), db)).status === 405);
check('with no database it says so', (await handle(new Request('https://x.test/api/w/sun'), undefined)).status === 500);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
