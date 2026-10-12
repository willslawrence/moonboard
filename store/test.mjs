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
// a climb by number, on a wall of its own
await call('POST', '/api/w/test-n/person', { name: 'Nia' });
const seq = [{ h: 'a1', r: 'n', n: 1 }, { h: 'a2', r: 'n', n: 2 }, { h: 'a3', r: 'n', n: 4 }, { h: 'a1', r: 'n', n: 7 }, { v: 'overhang', x: 0.5, y: 0.25, r: 'n', n: 8 }, { h: 'f1', r: 'f' }];
s = await call('POST', '/api/w/test-n/route', { by: 'Nia', name: 'Blue numbers', grade: 3, marks: seq, feet: 'any' });
check('a climb by number needs no start or finish, keeps its numbers and its gaps, and a hold may carry two',
  s.id === 1 && JSON.stringify(s.routes[0].marks) === JSON.stringify(seq), s.routes && s.routes[0]);
check('a number that is not a whole one from 1 to 999 is refused',
  (await call('POST', '/api/w/test-n/route', { by: 'Nia', name: 'x', grade: 3, marks: [{ h: 'a1', r: 'n', n: 0 }, { h: 'a2', r: 'n', n: 2 }] })).status === 400 &&
  (await call('POST', '/api/w/test-n/route', { by: 'Nia', name: 'x', grade: 3, marks: [{ h: 'a1', r: 'n' }, { h: 'a2', r: 'n', n: 2 }] })).status === 400);
check('one numbered hold is not a climb by number: it still wants a start and a finish',
  (await call('POST', '/api/w/test-n/route', { by: 'Nia', name: 'x', grade: 3, marks: [{ h: 'a1', r: 'n', n: 1 }, { h: 'a2', r: 'h' }] })).status === 400);
s = await call('POST', '/api/w/test-n/route', { by: 'Nia', name: 'The hundred', grade: 5,
  marks: Array.from({ length: 100 }, (_, i) => ({ h: 'h' + i, r: 'n', n: i + 1 })) });
check('a hundred holds are not too many', s.id === 2 && s.routes[1].marks.length === 100 && s.routes[1].marks[99].n === 100, s.error);
check('two hundred and fifty-one are',
  (await call('POST', '/api/w/test-n/route', { by: 'Nia', name: 'x', grade: 5, marks: Array.from({ length: 251 }, (_, i) => ({ h: 'h' + i, r: 'n', n: i + 1 })) })).status === 400);
// brought in from somewhere else, with the day it really happened
s = await call('POST', '/api/w/test-n/route', { by: 'Nia', name: 'Old one', grade: 4, marks: [{ h: 'a1', r: 's' }, { h: 'a2', r: 'e' }], t: '2025-12-13T19:25:23.691000+00:00' });
const old1 = s.routes.find(r => r.name === 'Old one');
check('a route may say when it was really made', old1.t === '2025-12-13T19:25:23.691Z', old1);
s = await call('POST', '/api/w/test-n/route', { by: 'Nia', name: 'From the future', grade: 4, marks: [{ h: 'a1', r: 's' }, { h: 'a2', r: 'e' }], t: '2031-01-01T00:00:00Z' });
check('but not a day that has not come', s.routes.find(r => r.name === 'From the future').t.startsWith('2026-10-'), s.routes.find(r => r.name === 'From the future'));
await call('POST', '/api/w/test-n/log', { person: 'Nia', route: old1.id, result: '4+', t: '2026-01-05T10:00:00Z' });
s = await call('GET', '/api/w/test-n/log?person=Nia');
check('and so may a go', s.entries[0].t === '2026-01-05T10:00:00.000Z' && s.entries[0].result === '4+', s.entries && s.entries[0]);
await call('POST', '/api/w/test-n/reset', {});

// a go against the clock on a climb by number: how far, and how long
await call('POST', '/api/w/test-t/person', { name: 'Nia' }); await call('POST', '/api/w/test-t/person', { name: 'Omar' });
s = await call('POST', '/api/w/test-t/route', { by: 'Nia', name: 'Circuit', grade: 5, marks: Array.from({ length: 20 }, (_, i) => ({ h: 'h' + i, r: 'n', n: i + 1 })) });
const circ = s.id;
s = await call('POST', '/api/w/test-t/log', { person: 'Nia', route: circ, result: 'try', n: 12, secs: 95 });
check('a go against the clock is kept with the number reached and the seconds it took', s.status === 200 && s.stats.Nia[circ].a === 1 && JSON.stringify(s.stats.Nia[circ].g) === '[12,95]', s.stats || s);
s = await call('POST', '/api/w/test-t/log', { person: 'Nia', route: circ, result: 'try', n: 9, secs: 40 });
check('a shorter go does not become the best', JSON.stringify(s.stats.Nia[circ].g) === '[12,95]' && s.stats.Nia[circ].a === 2, s.stats.Nia[circ]);
s = await call('POST', '/api/w/test-t/log', { person: 'Nia', route: circ, result: 'try', n: 12, secs: 80 });
check('as far again but quicker does', JSON.stringify(s.stats.Nia[circ].g) === '[12,80]', s.stats.Nia[circ]);
s = await call('POST', '/api/w/test-t/log', { person: 'Nia', route: circ, result: '4+', n: 20, secs: 300 });
check('further is better however long it took, and reaching the top can be a send', JSON.stringify(s.stats.Nia[circ].g) === '[20,300]' && s.stats.Nia[circ].r === '4+' && s.stats.Nia[circ].a === 0, s.stats.Nia[circ]);
s = await call('POST', '/api/w/test-t/log', { person: 'Omar', route: circ, result: 'try' });
check('a go with no clock says nothing of one', s.stats.Omar[circ].a === 1 && s.stats.Omar[circ].g === undefined, s.stats.Omar[circ]);
check('how far without how long is refused, and so is the other way round', (await call('POST', '/api/w/test-t/log', { person: 'Nia', route: circ, result: 'try', n: 5 })).status === 400 &&
  (await call('POST', '/api/w/test-t/log', { person: 'Nia', route: circ, result: 'try', secs: 50 })).status === 400);
check('nonsense for either is refused', (await call('POST', '/api/w/test-t/log', { person: 'Nia', route: circ, result: 'try', n: 0, secs: 50 })).status === 400 &&
  (await call('POST', '/api/w/test-t/log', { person: 'Nia', route: circ, result: 'try', n: 5, secs: 1.5 })).status === 400 &&
  (await call('POST', '/api/w/test-t/log', { person: 'Nia', route: circ, result: 'try', n: 5, secs: 90000 })).status === 400);
s = await call('GET', '/api/w/test-t/log?person=Nia');
check('the logbook rows carry them', s.entries.length === 4 && s.entries[0].n === 20 && s.entries[0].secs === 300 && s.entries[0].result === '4+' && s.entries[3].n === 12 && s.entries[3].secs === 95, s.entries);
s = await call('GET', '/api/w/test-t/log?person=Omar');
check('and a row with no clock has neither', s.entries.length === 1 && !('n' in s.entries[0]) && !('secs' in s.entries[0]), s.entries);
s = await call('POST', '/api/w/test-t/log/undo', { person: 'Nia' });
check('taking the last go back takes its best with it', JSON.stringify(s.stats.Nia[circ].g) === '[12,80]' && s.stats.Nia[circ].r === null && s.stats.Nia[circ].a === 3, s.stats.Nia[circ]);
await call('POST', '/api/w/test-t/reset', {});
console.log('further rules: the flat wall off limits');
{
  await call('POST', '/api/w/test-r/person', { name: 'Abdu' }); await call('POST', '/api/w/test-r/person', { name: 'Nia' });
  let t = await call('POST', '/api/w/test-r/route', { by: 'Abdu', name: 'Plain', grade: 4, marks, feet: 'marked' });
  check('a route with no further rules says nothing of them', t.status === 200 && !('rules' in t.routes[0]), t.routes && t.routes[0]);
  t = await call('POST', '/api/w/test-r/route', { by: 'Abdu', name: 'No smearing', grade: 5, marks, feet: 'follow', rules: ['flatoff', 'nonsense'] });
  const made = t.routes.find(r => r.name === 'No smearing');
  check('a route can say the flat wall is off limits, beside its rule for feet, and a rule nobody knows is dropped', t.status === 200 && JSON.stringify(made.rules) === '["flatoff"]' && made.feet === 'follow', made);
  t = await call('POST', '/api/w/test-r/route', { by: 'Abdu', id: made.id, name: 'No smearing', grade: 6, marks, feet: 'follow' });
  check('a change that does not mention the rules leaves them alone (a phone on an older page)', t.status === 200 && t.routes[1].grade === 6 && JSON.stringify(t.routes[1].rules) === '["flatoff"]', t.routes && t.routes[1]);
  t = await call('POST', '/api/w/test-r/route', { by: 'Abdu', id: made.id, name: 'No smearing', grade: 6, marks, feet: 'follow', rules: [] });
  check('a change that says none takes them off', t.status === 200 && !('rules' in t.routes[1]), t.routes && t.routes[1]);
  const before = JSON.stringify({ ...t.routes[0], edited: 0 });
  t = await call('POST', '/api/w/test-r/route/rules', { by: 'Abdu', id: 1, rules: ['flatoff'] });
  const after = { ...t.routes[0], edited: 0 }; const had = after.rules; delete after.rules;
  check('the setter can set the rules alone, and nothing else of the route changes: not its holds, name, grade or feet', t.status === 200 && JSON.stringify(had) === '["flatoff"]' && JSON.stringify(after) === before, [before, after]);
  check('it is his to set and nobody else\'s', (await call('POST', '/api/w/test-r/route/rules', { by: 'Nia', id: 1, rules: [] })).status === 403 && JSON.stringify((await call('GET', '/api/w/test-r')).routes[0].rules) === '["flatoff"]');
  check('a route that is not there, or rules that are not a list, are refused', (await call('POST', '/api/w/test-r/route/rules', { by: 'Abdu', id: 99, rules: ['flatoff'] })).status === 404 && (await call('POST', '/api/w/test-r/route/rules', { by: 'Abdu', id: 1, rules: 'flatoff' })).status === 400);
  t = await call('POST', '/api/w/test-r/route/rules', { by: 'Abdu', id: 1, rules: [] });
  check('and an empty list takes them off again', t.status === 200 && !('rules' in t.routes[0]));
  await call('POST', '/api/w/test-r/reset', {});
}
{ // a database made before there was a clock has no such columns: they are added, and what it held is kept
  const { standInD1 } = await import('./stand-in-d1.mjs');
  const oldDb = standInD1();
  for (const q of [
    `CREATE TABLE people (wall TEXT NOT NULL, name TEXT NOT NULL, t TEXT NOT NULL, PRIMARY KEY (wall, name))`,
    `CREATE TABLE routes (wall TEXT NOT NULL, id INTEGER NOT NULL, name TEXT NOT NULL, grade INTEGER NOT NULL, setter TEXT NOT NULL, marks TEXT NOT NULL, feet TEXT NOT NULL, tape TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', t TEXT NOT NULL, edited TEXT, retired INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (wall, id))`,
    `CREATE TABLE log (k INTEGER PRIMARY KEY AUTOINCREMENT, wall TEXT NOT NULL, t TEXT NOT NULL, person TEXT NOT NULL, route INTEGER NOT NULL, result TEXT NOT NULL)`,
    `CREATE TABLE stats (wall TEXT NOT NULL, person TEXT NOT NULL, route INTEGER NOT NULL, a INTEGER NOT NULL, r TEXT, s TEXT NOT NULL, d TEXT, PRIMARY KEY (wall, person, route))`,
    `INSERT INTO people VALUES ('sun', 'Will', '2026-10-01T00:00:00.000Z')`,
    `INSERT INTO routes (wall, id, name, grade, setter, marks, feet, t) VALUES ('sun', 1, 'Old', 3, 'Will', '[{"h":"a","r":"n","n":1},{"h":"b","r":"n","n":2}]', 'any', '2026-10-01T00:00:00.000Z')`,
    `INSERT INTO log (wall, t, person, route, result) VALUES ('sun', '2026-10-02T00:00:00.000Z', 'Will', 1, 'try')`,
    `INSERT INTO stats VALUES ('sun', 'Will', 1, 1, NULL, '[]', '2026-10-02T00:00:00.000Z')`,
  ]) await oldDb.prepare(q).run();
  const ask = async (method, path, body) => { const r = await handle(new Request('https://x.test' + path, body ? { method, body: JSON.stringify(body) } : { method }), oldDb); return { status: r.status, ...(await r.json()) }; };
  let o = await ask('GET', '/api/w/sun');
  check('a database made before there was a clock still opens, with what it held', o.status === 200 && o.routes.length === 1 && o.stats.Will[1].a === 1 && o.stats.Will[1].g === undefined, o);
  o = await ask('POST', '/api/w/sun/log', { person: 'Will', route: 1, result: 'try', n: 2, secs: 30 });
  check('and takes a go against the clock', o.status === 200 && o.stats.Will[1].a === 2 && JSON.stringify(o.stats.Will[1].g) === '[2,30]', o.stats || o);
  o = await ask('GET', '/api/w/sun');
  check('and opens again after that', o.status === 200 && JSON.stringify(o.stats.Will[1].g) === '[2,30]');
  check('its old route has no further rules, and can be given one', !('rules' in o.routes[0]) && JSON.stringify((await ask('POST', '/api/w/sun/route/rules', { by: 'Will', id: 1, rules: ['flatoff'] })).routes[0].rules) === '["flatoff"]');
}
console.log('taking one entry out of a logbook');
{
  await call('POST', '/api/w/test-d/person', { name: 'Ana' }); await call('POST', '/api/w/test-d/person', { name: 'Bo' }); await call('POST', '/api/w/test-e/person', { name: 'Ana' });
  const rt = (await call('POST', '/api/w/test-d/route', { by: 'Ana', name: 'Del', grade: 2, marks })).id;
  const other = (await call('POST', '/api/w/test-e/route', { by: 'Ana', name: 'Elsewhere', grade: 2, marks })).id;
  for (const r of ['try', 'try', '3rd']) await call('POST', '/api/w/test-d/log', { person: 'Ana', route: rt, result: r });
  await call('POST', '/api/w/test-d/log', { person: 'Bo', route: rt, result: 'flash' });
  await call('POST', '/api/w/test-e/log', { person: 'Ana', route: other, result: 'try' });
  const rows = (await call('GET', '/api/w/test-d/log?person=Ana')).entries;                 // newest first: her send, then her two tries
  check('the rows of a logbook say their numbers', rows.length === 3 && rows.every(x => Number.isInteger(x.k)) && rows.map(x => x.result).join() === '3rd,try,try', rows);
  let d = await call('POST', '/api/w/test-d/log/delete', { person: 'Ana', k: rows[2].k });       // her first try, the oldest of the three
  check('an entry that is not the last is taken out, and the tally counted again', d.status === 200 && d.deleted === rt && d.stats.Ana[rt].a === 0 && d.stats.Ana[rt].s.join() === '3rd', d.stats || d);
  check('the others are still there', (await call('GET', '/api/w/test-d/log?person=Ana')).entries.map(x => x.k).join() === rows[0].k + ',' + rows[1].k);
  const his = (await call('GET', '/api/w/test-d/log?person=Bo')).entries[0].k, far = (await call('GET', '/api/w/test-e/log?person=Ana')).entries[0].k;
  check('somebody else\'s entry is not taken under her name', (await call('POST', '/api/w/test-d/log/delete', { person: 'Ana', k: his })).status === 404 && (await call('GET', '/api/w/test-d/log?person=Bo')).entries.length === 1);
  check('nor her own entry on another wall', (await call('POST', '/api/w/test-d/log/delete', { person: 'Ana', k: far })).status === 404 && (await call('GET', '/api/w/test-e/log?person=Ana')).entries.length === 1);
  check('an entry that is not there, or not named, is refused', (await call('POST', '/api/w/test-d/log/delete', { person: 'Ana', k: 999999 })).status === 404 &&
    (await call('POST', '/api/w/test-d/log/delete', { person: 'Ana' })).status === 400 && (await call('POST', '/api/w/test-d/log/delete', { k: rows[0].k })).status === 400);
  d = await call('POST', '/api/w/test-d/log/delete', { person: 'Ana', k: rows[0].k });           // her send
  check('with the send taken out the route is no longer sent', d.status === 200 && d.stats.Ana[rt].a === 1 && !d.stats.Ana[rt].s && d.stats.Ana[rt].r === null, d.stats || d);
  d = await call('POST', '/api/w/test-d/log/delete', { person: 'Ana', k: rows[1].k });
  check('with her last entry gone she has no tally on it, and his stands', d.status === 200 && !(d.stats.Ana || {})[rt] && d.stats.Bo[rt].s.join() === 'flash', d.stats || d);
  check('taking the same entry twice finds nothing the second time', (await call('POST', '/api/w/test-d/log/delete', { person: 'Ana', k: rows[1].k })).status === 404);
}
console.log('a logbook brought in from a file');
{
  const W = '/api/w/test-i';
  await call('POST', W + '/reset', {});
  await call('POST', W + '/person', { name: 'Ida' }); await call('POST', W + '/person', { name: 'Jo' });
  let d = await call('POST', W + '/route', { by: 'Ida', name: 'Slab', grade: 2, marks: [{ h: 'a1', r: 's' }, { h: 'a2', r: 'e' }] });
  const slab = d.id;
  d = await call('POST', W + '/route', { by: 'Ida', name: 'Numbers', grade: 4, marks: Array.from({ length: 12 }, (_, i) => ({ h: 'n' + i, r: 'n', n: i + 1 })) });
  const nums = d.id;
  // she has logged something today already: a try, then a send
  await call('POST', W + '/log', { person: 'Ida', route: slab, result: 'try' });
  d = await call('POST', W + '/log', { person: 'Ida', route: slab, result: '2nd' });
  check('(before: one send of it, second go)', d.stats.Ida[slab].s.join() === '2nd' && d.stats.Ida[slab].a === 0, d.stats);
  const file = [
    { route: slab, result: 'flash', t: '2026-03-01T09:00:00.000Z' },                // a year's-old flash of the same route
    { route: slab, result: 'try', t: '2026-03-02T09:00:00.000Z' },
    { route: nums, result: 'try', t: '2026-03-02T09:05:00.000Z', n: 7, secs: 61 },   // a go against the clock
    { route: nums, result: '3rd', t: '2026-03-03T09:05:00.000Z', n: 12, secs: 200 },
    { route: 999, result: 'try', t: '2026-03-01T09:00:00.000Z' },                    // no such route
    { route: slab, result: 'sent', t: '2026-03-01T09:00:00.000Z' },                  // not a result
    { route: slab, result: 'try', t: 'last week' },                                  // no time
    { route: slab, result: 'try', t: '2031-01-01T00:00:00.000Z' },                   // still to come
    { route: nums, result: 'try', t: '2026-03-04T09:00:00.000Z', n: 5 },             // half a go against the clock
    { route: slab, result: 'flash', t: '2026-03-01T09:00:30.000Z' },                 // the first line again, half a minute on
  ];
  check('a stranger cannot import', (await call('POST', W + '/log/import', { person: 'Nobody', entries: file })).status === 404);
  check('and it wants a list', (await call('POST', W + '/log/import', { person: 'Ida' })).status === 400);
  d = await call('POST', W + '/log/import', { person: 'Ida', entries: file, dry: true });
  check('asked first, it says what would go in and what would not, and writes nothing', d.status === 200 && d.dry === true && d.would === 4 && d.skipped.length === 6 &&
    d.skipped.map(x => x.i).join() === '4,5,6,7,8,9' && (await call('GET', W + '/log?person=Ida')).entries.length === 2, d);
  check('each line left out says why', d.skipped.map(x => x.why).join(' | ') ===
    'no such route | not a try or a send | no time that can be read | a time still to come | a go against the clock says both how far and how long | already in the logbook', d.skipped);
  d = await call('POST', W + '/log/import', { person: 'Ida', entries: file });
  check('then the four goes are in, each with the time it happened', d.status === 200 && d.imported === 4 && d.skipped.length === 6, d);
  let l = await call('GET', W + '/log?person=Ida');
  check('the logbook gives the latest to have happened first, though the old ones were written last', l.entries.length === 6 &&
    l.entries.map(e => e.t.slice(0, 10)).join() === '2026-10-09,2026-10-09,2026-03-03,2026-03-02,2026-03-02,2026-03-01' && l.entries[0].result === '2nd', l.entries.map(e => e.t + ' ' + e.result));
  check('the tally is counted in the order the goes happened: the old flash is her first send, and no try has come since her last',
    d.stats.Ida[slab].s.join() === 'flash,2nd' && d.stats.Ida[slab].a === 0 && d.stats.Ida[slab].r === '2nd' && d.stats.Ida[slab].d.startsWith('2026-10-09'), d.stats.Ida[slab]);
  check('a go against the clock keeps how far and how long, and the best of them is in the tally',
    d.stats.Ida[nums].s.join() === '3rd' && JSON.stringify(d.stats.Ida[nums].g) === '[12,200]' && l.entries.some(e => e.route === nums && e.n === 7 && e.secs === 61), d.stats.Ida[nums]);
  d = await call('POST', W + '/log/import', { person: 'Ida', entries: file });
  check('the same file again adds nothing', d.imported === 0 && d.skipped.filter(x => x.why === 'already in the logbook').length === 5 && (await call('GET', W + '/log?person=Ida')).entries.length === 6, d);
  check('nobody else has gained anything', !d.stats.Jo && (await call('GET', W + '/log?person=Jo')).entries.length === 0);
  // a go logged with an earlier time, the ordinary way, is counted where it belongs too
  d = await call('POST', W + '/log', { person: 'Jo', route: slab, result: '3rd' });
  d = await call('POST', W + '/log', { person: 'Jo', route: slab, result: 'flash', t: '2026-02-01T10:00:00Z' });
  check('an earlier go written later is her first send all the same', d.stats.Jo[slab].s.join() === 'flash,3rd' && d.stats.Jo[slab].r === '3rd', d.stats.Jo[slab]);
  // many at once
  const many = Array.from({ length: 500 }, (_, i) => ({ route: i % 2 ? slab : nums, result: 'try', t: new Date(Date.parse('2026-01-01T08:00:00Z') + i * 3600e3).toISOString() }));
  d = await call('POST', W + '/log/import', { person: 'Jo', entries: many.concat([{ route: slab, result: 'try', t: '2026-09-09T09:09:00Z' }]) });
  check('five hundred goes go in at one call, and no more than that', d.imported === 500 && (await call('GET', W + '/log?person=Jo&limit=3000')).entries.length === 502, [d.imported, d.error]);
  await call('POST', W + '/reset', {});
}
check('a body that is not JSON is refused',
  (await handle(new Request('https://x.test/api/w/sun/person', { method: 'POST', body: 'name=Will' }), db)).status === 400);
check('other methods are refused', (await handle(new Request('https://x.test/api/w/sun', { method: 'DELETE' }), db)).status === 405);
check('with no database it says so', (await handle(new Request('https://x.test/api/w/sun'), undefined)).status === 500);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
