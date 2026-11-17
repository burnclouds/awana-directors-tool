// One rule for "which nights count": a club night on the calendar (not an event, not "no club") with at least one person present.
// Season.heldNights is that rule; the Attendance Summary, Statistics, the store and Blue Jewels all follow it. Invented test club only.
// Usage: node test/nights.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Season = require('../season.js'), M = require('../model.js'), Stats = require('../stats.js'), Store = require('../store.js'), V = require('../validate.js');
require('../reports.js'); const RS = require('../reports-season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).find(f => /TEST.*\.json$/.test(f)), X = M.X;
const load = () => { const s = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')); return { season: s, master: M.fromRoster(s.roster), calendar: s.calendar }; };
const night = (Date, Quarter, extra) => Object.assign({ Date, Type: 'Club night', Quarter, 'No Club': '' }, extra || {});
const cal = [night('2026-09-09', 'Q1'), night('2026-09-16', 'Q1'), night('2026-10-03', 'Q2', { Type: 'Event' }), night('2026-11-04', 'Q2'), night('2026-11-25', 'Q2', { 'No Club': '1' })];

test('unticking a box on a night nobody has been entered for does not create a night', () => {
  const s = Season.blank('2026-27');
  Season.setMark(s, '2026-11-04', 'k1', 'a', 0);
  assert.deepStrictEqual(Object.keys(s.attendance), []);
});
test('taking the last mark off a night removes the night', () => {
  const s = Season.blank('2026-27');
  Season.setMark(s, '2026-11-04', 'k1', 'a', 1); Season.setMark(s, '2026-11-04', 'k2', 'a', 1);
  Season.setMark(s, '2026-11-04', 'k1', 'a', 0);
  assert.deepStrictEqual(Object.keys(s.attendance), ['2026-11-04']);
  Season.setMark(s, '2026-11-04', 'k2', 'a', 0);
  assert.deepStrictEqual(Object.keys(s.attendance), []);
});
test('heldNights: club nights with at least one person present, in date order', () => {
  const s = Season.blank('2026-27');
  s.attendance = { '2026-11-04': { k1: { a: 1 } }, '2026-09-09': { k1: { a: 1 } }, '2026-09-16': {}, '2026-10-03': { k1: { a: 1 } }, '2026-11-25': { k1: { a: 1 } } };
  assert.deepStrictEqual(Season.heldNights(s, cal), ['2026-09-09', '2026-11-04']);      // empty night, Event and No Club all stay out
});
test('heldNights: a night with only handbook, participation or extra marks was not held', () => {
  const s = Season.blank('2026-27');
  s.attendance = { '2026-09-09': { k1: { h: 1, p: 1 } }, '2026-09-16': { k1: { a: 1 } } };
  assert.deepStrictEqual(Season.heldNights(s, cal), ['2026-09-16']);
});
test('Blue Jewels count only club nights that were held', () => {
  const s = Season.blank('2026-27'); s.config.blueJewelWeeks = [2, 3];
  s.attendance = { '2026-09-09': { k1: { a: 1 } }, '2026-10-03': { k1: { a: 1 } }, '2026-11-25': { k1: { a: 1 } }, '2026-11-04': { k1: { a: 1 } } };
  const j = Season.blueJewels(s, 'k1', cal);
  assert.deepStrictEqual(j.map(x => [x.n, x.date]), [[1, '2026-11-04']]);                // 2 nights count, so jewel 1 (2 weeks) is on the second
});

// ---------- every screen agrees ----------
const stars = html => (html.match(/ ★<\/td>|<\/b> ★/g) || []).length;
const emptyNight = ctx => { ctx.season.attendance['2026-11-04'] = {}; };       // what an old saved file may hold
test('a leftover empty night changes no screen: Statistics and the store both keep saying the same number of nights', () => {
  const ctx = load(), before = Stats.compute(ctx), n = before.club.nights, perfect = before.kids.perfect;
  assert(n > 1 && perfect > 0, 'the test club needs several nights and some perfect attenders');
  emptyNight(ctx);
  const st = Stats.compute(ctx), sto = Store.compute(ctx);
  assert.strictEqual(st.club.nights, n); assert.strictEqual(sto.nightsSoFar, n); assert.strictEqual(st.kids.perfect, perfect);
  assert.strictEqual(Season.heldNights(ctx.season, ctx.calendar).length, n);
});

// ---------- Statistics follows the rest: active children, awards that everyone gets are not counted ----------
test('Statistics: a child marked inactive is not ranked or counted as perfect', () => {
  const ctx = load(), r0 = Stats.compute(ctx), top = ctx.master.people.find(p => p[X.ID] === r0.kids.top[0].id);
  top.x_Active = '0';
  const r1 = Stats.compute(ctx);
  assert(!r1.kids.top.some(x => x.id === top[X.ID]), 'inactive child still listed');
  assert.strictEqual(r0.kids.top[0].count, r0.club.nights, 'precondition: the top child was here every night');
  assert.strictEqual(r1.kids.perfect, r0.kids.perfect - 1);
  assert.strictEqual(r1.club.nights, r0.club.nights);                              // the nights themselves still happened
});
test('Statistics: "most awards" skips the awards in config.exclude, as the store does', () => {
  const ctx = load(), r = Stats.compute(ctx), sto = Store.compute(ctx);
  let compared = 0; r.achievers.forEach(a => { const k = sto.kids.find(x => x.id === a.id); if (k && k.group !== 'Cubbies') { assert.strictEqual(a.count, k.counts.awards, a.name); compared++; } });
  assert(compared > 0, 'some children were compared with the store');
});
test('Statistics: class share cannot go over 100% when children have left', () => {
  const ctx = load(), sparks = ctx.master.people.filter(p => M.isActive(p) && M.isClubber(p) && M.room(p) === M.room(ctx.master.people.find(q => M.groupOf(M.room(q)) === 'Sparks')));
  sparks.slice(1).forEach(p => { p.x_Active = '0'; });                              // all but one leave the room
  let rated = 0; Stats.compute(ctx).classes.forEach(c => { if (c.rate !== null) { assert(c.rate <= 100, c.room + ' share ' + c.rate); rated++; } });
  assert(rated > 0, 'some class has a share');
});

// ---------- Validate warns about records on dates that do not count ----------
test('Validate warns about attendance, games or awards on dates that are not club nights', () => {
  const ctx = load(), event = ctx.calendar.find(r => r.Type === 'Event').Date, any = Object.keys(ctx.season.attendance)[0], id = Object.keys(ctx.season.attendance[any])[0];
  const clean = V.validate(Season.toJson(ctx.season), file).findings;
  assert(!clean.some(f => /not (a )?club nights?/.test(f.msg)), 'no warning on the clean file');
  Season.setMark(ctx.season, event, id, 'a', 1);
  const f = V.validate(Season.toJson(ctx.season), file).findings.find(x => /not (a )?club nights?/.test(x.msg));
  assert(f && f.level === 'warn', 'expected a warning'); assert(f.msg.includes(event), 'names the date');
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
