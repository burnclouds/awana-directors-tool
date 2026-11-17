// R18: a file opens in one spelling. config.driveDirs has exactly { club, slides } (an older file's open / data folders are folded into club), and a person's roster `v` no longer holds a copy of its own
// id (x_ClubberID). The migration is logged by the "File upgrade" entry fromJson already writes (R20), so the History still explains the data. Clubber data is never dropped: a stored x_ClubberID that
// differs from the person's id is kept and reported. Invented ids only; the TEST file is changed in memory.
// Usage: node test/legacy-spellings.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Season = require('../season.js'), V = require('../validate.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const td = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(td).filter(f => /TEST.*\.json$/.test(f)).sort().pop();
const raw = () => JSON.parse(fs.readFileSync(path.join(td, file), 'utf8'));
const OK_NAME = 'awana-2026-27-20261029-122918.json';
const FOLDER = (id, name) => ({ id, name });

// An older file: separate open and data folders, and x_ClubberID in two people's v (one equal to the key, one not).
function oldFile() {
  const o = raw(), ids = Object.keys(o.roster.people);
  o.config.driveDirs = { open: FOLDER('PO', 'Open'), data: FOLDER('PD', 'Data'), slides: null };
  o.roster.people[ids[0]].v.x_ClubberID = ids[0]; o.roster.people[ids[1]].v.x_ClubberID = '7000009_Test_Kid';
  return { o, ids };
}
const hasUp = s => s.history.length && s.history[s.history.length - 1].label === 'File upgrade';

test('normDriveDirs folds open and data into club, keeps slides, and is idempotent', () => {
  assert(Season.normDriveDirs, 'Season.normDriveDirs is exported'); const n = Season.normDriveDirs, A = FOLDER('A', 'a'), B = FOLDER('B', 'b'), C = FOLDER('C', 'c'), X = FOLDER('X', 'x');
  assert.deepStrictEqual(n({ open: A, data: B, slides: C }), { club: B, slides: C }); assert.deepStrictEqual(n({ open: A, data: null, slides: null }), { club: A, slides: null });
  assert.deepStrictEqual(n({ club: X, open: A, data: B }), { club: X, slides: null }); assert.deepStrictEqual(n({ data: null, open: null, slides: null }), { club: null, slides: null });
  [null, 'x', [], undefined, 5].forEach(v => assert.deepStrictEqual(n(v), { club: null, slides: null }));
  const once = n({ open: A, data: B, slides: C }); assert.deepStrictEqual(n(once), once);
});
test('the TEST file opens with one spelling', () => {
  assert.deepStrictEqual(Object.keys(Season.fromJson(JSON.stringify(raw())).config.driveDirs).sort(), ['club', 'slides']);
});
test('an older file\'s folders move to club with no folder lost, and x_ClubberID equal to the id leaves v', () => {
  const { o, ids } = oldFile(), s = Season.fromJson(JSON.stringify(o));
  assert.deepStrictEqual(s.config.driveDirs, { club: FOLDER('PD', 'Data'), slides: null });
  assert(!('x_ClubberID' in s.roster.people[ids[0]].v), 'the copy of its own id is gone');
});
test('clubber data is never dropped: an x_ClubberID that differs from the id stays, and the file check says so', () => {
  const { o, ids } = oldFile(), s = Season.fromJson(JSON.stringify(o));
  assert.strictEqual(s.roster.people[ids[1]].v.x_ClubberID, '7000009_Test_Kid', 'kept as it was');
  const r = V.validate(Season.toJson(s), OK_NAME); assert(r.findings.some(f => f.level === 'info' && /differs from the person's id/.test(f.msg)), r.findings.map(f => f.msg).join(' | '));
  assert(!r.findings.some(f => f.level === 'error'), 'no error');
});
test('the migration is logged as one File upgrade version, and the History still explains the data', () => {
  const { o } = oldFile(), n = o.history.length, s = Season.fromJson(JSON.stringify(o));
  assert(n > 0, 'the TEST file has a History'); assert.strictEqual(s.history.length, n + 1); assert(hasUp(s), 'the last entry is File upgrade');
  assert(s.history[n].changes.some(c => c.p[0] === 'config' && c.p[1] === 'driveDirs'), 'the folder move is in it'); assert(s.history[n].changes.some(c => c.p.includes('x_ClubberID')), 'the id copy removal is in it');
  assert.deepStrictEqual(Season.replayDiff(s), []);
  const r = V.validate(Season.toJson(s), OK_NAME); assert(!r.findings.some(f => /differs from what the history says/.test(f.msg)), 'no replay warning');
});
test('History that names x_ClubberID in an old person record still replays clean after the open', () => {
  const { o, ids } = oldFile(); const id = ids[0], p = JSON.parse(JSON.stringify(o.roster.people[id]));
  o.history.push({ t: o.history[o.history.length - 1].t, label: 'Added one person', changes: [{ p: ['roster', 'people', id, 'v', 'x_Notes'], n: 'hello' }] }); p.v.x_Notes = 'hello'; o.roster.people[id].v.x_Notes = 'hello';
  const s = Season.fromJson(JSON.stringify(o)); assert.deepStrictEqual(Season.replayDiff(s), []);
});
test('idempotent: opening the saved file again changes nothing and adds no second entry', () => {
  const { o } = oldFile(), t1 = Season.toJson(Season.fromJson(JSON.stringify(o))), s2 = Season.fromJson(t1); assert.strictEqual(Season.toJson(s2), t1);
  const t0 = Season.toJson(Season.fromJson(JSON.stringify(raw()))); assert.strictEqual(Season.toJson(Season.fromJson(t0)), t0);
});
test('a file with no History is migrated in place with no entry', () => {
  const { o, ids } = oldFile(); o.history = []; const s = Season.fromJson(JSON.stringify(o));
  assert.strictEqual(s.history.length, 0); assert.deepStrictEqual(Object.keys(s.config.driveDirs).sort(), ['club', 'slides']); assert(!('x_ClubberID' in s.roster.people[ids[0]].v));
});
test('restore to before the upgrade and save: the file opens in the new spelling again', () => {
  const { o } = oldFile(), s = Season.fromJson(JSON.stringify(o)), n = s.history.length, back = Season.restoreTo(s, n - 1).season, again = Season.fromJson(Season.toJson(back));
  assert.deepStrictEqual(Object.keys(again.config.driveDirs).sort(), ['club', 'slides']); assert.deepStrictEqual(Season.replayDiff(again), []);
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
