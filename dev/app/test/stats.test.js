// Statistics (stats.js) on the invented test club, checked against totals worked out directly from the raw attendance.
const assert = require('assert'), fs = require('fs'), path = require('path');
const Season = require('../season.js'), M = require('../model.js'), Stats = require('../stats.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).find(f => /TEST.*\.json$/.test(f));
const load = () => { const s = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')); return { season: s, master: M.fromRoster(s.roster), calendar: s.calendar }; };
const ctx = load(), r = Stats.compute(ctx), X = M.X;
const byId = new Map(ctx.master.people.map(p => [p[X.ID], p]));
const counted = Season.counted(ctx.calendar), dates = Object.keys(ctx.season.attendance).filter(d => counted[d]).sort();
const kidsOn = d => Object.keys(ctx.season.attendance[d]).filter(id => ctx.season.attendance[d][id].a && byId.get(id) && M.isClubber(byId.get(id)));

test('whole club: nights, average, highest, lowest and last night match the raw attendance', () => {
  const n = dates.map(d => kidsOn(d).length);
  assert.strictEqual(r.club.nights, dates.length);
  assert.strictEqual(r.club.average, Math.round(n.reduce((a, b) => a + b, 0) / n.length * 10) / 10);
  assert.strictEqual(r.club.high.count, Math.max(...n)); assert.strictEqual(r.club.low.count, Math.min(...n));
  assert.strictEqual(r.club.last.date, dates[dates.length - 1]); assert.strictEqual(r.club.last.count, n[n.length - 1]);
});
test('by class: each class average, highest and lowest night add up from the people in that room', () => {
  r.classes.forEach(c => {
    const per = dates.map(d => kidsOn(d).filter(id => M.room(byId.get(id)) === c.room).length);
    assert.strictEqual(c.average, Math.round(per.reduce((a, b) => a + b, 0) / per.length * 10) / 10, c.room);
    assert.strictEqual(c.high.count, Math.max(...per), c.room + ' high'); assert.strictEqual(c.low.count, Math.min(...per), c.room + ' low');
  });
  const total = r.classes.reduce((a, c) => a + c.average, 0);
  assert(Math.abs(total - r.club.average) < r.classes.length * 0.06, 'class averages should add up to the club average: ' + total + ' vs ' + r.club.average);
});
test('most nights present: sorted, counts right, everyone-every-night counted, ties beyond ten reported', () => {
  const k = r.kids; assert(k.top.length <= 10); assert(k.top.every((x, i) => !i || k.top[i - 1].count >= x.count));
  const mine = k.top[0], real = dates.filter(d => ctx.season.attendance[d][mine.id] && ctx.season.attendance[d][mine.id].a).length;
  assert.strictEqual(mine.count, real);
  const everyNight = ctx.master.people.filter(p => M.isClubber(p)).filter(p => dates.every(d => ctx.season.attendance[d][p[X.ID]] && ctx.season.attendance[d][p[X.ID]].a)).length;
  assert.strictEqual(k.perfect, everyNight);
  assert.strictEqual(k.tied, Math.max(0, everyNight - 10) * (k.top[9] && k.top[9].count === dates.length ? 1 : 0));
});
test('adults: none marked means "not tracked"; marking an adult makes them appear, ahead of nobody', () => {
  assert.strictEqual(r.adultsTracked, false);
  const c2 = load(), adult = c2.master.people.find(p => M.isActive(p) && !M.isClubber(p));
  [dates[0], dates[1], dates[2]].forEach(d => Season.setMark(c2.season, d, adult[X.ID], 'a', true));
  const r2 = Stats.compute(c2);
  assert(r2.adultsTracked); assert.strictEqual(r2.adults.top[0].id, adult[X.ID]); assert.strictEqual(r2.adults.top[0].count, 3);
  assert.strictEqual(r2.club.average, r.club.average, 'adults must not change the children\'s attendance');
});
test('achievement: awards per child counted from the awards section, sorted, leaders are in their own program', () => {
  const a = r.achievers[0], real = Object.keys(ctx.season.awards).reduce((n, d) => n + (ctx.season.awards[d][a.id] || []).length, 0);
  assert.strictEqual(a.count, real); assert(r.achievers.every((x, i) => !i || r.achievers[i - 1].count >= x.count));
  assert(Object.values(r.leaders).some(Boolean), 'some program has a leader'); Object.keys(r.leaders).forEach(g => { if (r.leaders[g]) assert.strictEqual(r.leaders[g].group, g); });
  assert(r.points[0].count >= r.points[1].count);
});
test('Sparks pace: only Sparks with 3+ nights, awards divided by nights attended, fastest first', () => {
  assert(r.pace.length > 0);
  r.pace.forEach(x => { assert(M.groupOf(x.room) === 'Sparks'); assert(x.nights >= Stats.MIN_NIGHTS); assert(Math.abs(x.pace - Math.round(x.awards / x.nights * 100) / 100) < 1e-9); });
  assert(r.pace.every((x, i) => !i || r.pace[i - 1].pace >= x.pace));
});
test('an empty season gives no nights instead of an error', () => {
  const e = Stats.compute({ master: ctx.master, season: Season.blank('2026-27'), calendar: ctx.calendar });
  assert.strictEqual(e.club.nights, 0); assert.strictEqual(e.club.last, null); assert.deepStrictEqual(e.classes.map(c => c.average).filter(Boolean), []);
});

// ---------- Participation and Extra: how freely each class gives them ----------
// A Sparks room of 5 children over 5 nights, built by hand so every band is known: night 1 all get Participation, 2 four of five (80%), 3 two of five, 4 nobody, 5 all.
function useCtx() {
  const c = load(), room = 'Sparks A', kids = c.master.people.filter(p => M.isClubber(p) && M.room(p) === room).slice(0, 5), s = Season.blank('2026-27'), cal = c.calendar.filter(r => r.Type !== 'Event' && r['No Club'] !== '1').slice(0, 5);
  assert.strictEqual(kids.length, 5);
  const marks = [[5, 0], [4, 5], [2, 0], [0, 1], [5, 2]];          // [participation, extra] given on each night
  cal.forEach((r, i) => kids.forEach((p, j) => { Season.setMark(s, r.Date, p[X.ID], 'a', 1, 'Sparks'); if (j < marks[i][0]) Season.setMark(s, r.Date, p[X.ID], 'p', 1); if (j < marks[i][1]) Season.setMark(s, r.Date, p[X.ID], 'x', 1); }));
  return { master: c.master, season: s, calendar: c.calendar, room };
}
test('markUse: nights fall in the right band (every child, 75%+, some, nobody) for Participation and for Extra', () => {
  const u = useCtx(), mu = Stats.markUse(u), part = mu.marks.find(m => m.mark === 'p').classes.find(c => c.room === u.room), ext = mu.marks.find(m => m.mark === 'x').classes.find(c => c.room === u.room);
  assert.deepStrictEqual(part.bands, { all: 2, most: 1, some: 1, none: 1 }); assert.strictEqual(part.usedNights, 5);
  assert.deepStrictEqual(ext.bands, { all: 1, most: 0, some: 2, none: 2 });
  assert.strictEqual(part.rate, Math.round(16 / 25 * 100)); assert.strictEqual(ext.rate, Math.round(8 / 25 * 100));
});
test('markUse: the pattern is "everyone", "rarely", "selective" or "too few nights"', () => {
  const u = useCtx(), pat = k => Stats.markUse(u).marks.find(m => m.mark === k).classes.find(c => c.room === u.room).pattern;
  assert.strictEqual(pat('p'), 'selective');                                  // 3 of 5 nights at 75%+ is 60%
  const dates = Object.keys(u.season.attendance).sort();
  dates.forEach(d => Object.keys(u.season.attendance[d]).forEach(id => { u.season.attendance[d][id].p = 1; }));
  assert.strictEqual(pat('p'), 'everyone');
  dates.forEach(d => Object.keys(u.season.attendance[d]).forEach(id => { delete u.season.attendance[d][id].p; }));
  assert.strictEqual(pat('p'), 'rarely');
  dates.slice(2).forEach(d => delete u.season.attendance[d]);
  assert.strictEqual(pat('p'), 'few');
});
test('markUse: a night with fewer than 3 children in the class is left out of the bands but its marks still count in "given to"', () => {
  const u = useCtx(), d = Object.keys(u.season.attendance).sort()[0], ids = Object.keys(u.season.attendance[d]);
  ids.slice(2).forEach(id => delete u.season.attendance[d][id]);             // 2 children left that night
  const c = Stats.markUse(u).marks.find(m => m.mark === 'p').classes.find(x => x.room === u.room);
  assert.strictEqual(c.nights, 5); assert.strictEqual(c.usedNights, 4); assert.strictEqual(c.rate, Math.round((2 + 4 + 2 + 0 + 5) / (2 + 5 + 5 + 5 + 5) * 100));
});
test('markUse: Puggles are left out, Cubbies appear only under Extra, Sparks and T&T under both; the test club\'s bands add up to its class-nights', () => {
  const mu = Stats.markUse(ctx), part = mu.marks.find(m => m.mark === 'p'), ext = mu.marks.find(m => m.mark === 'x');
  assert(!part.classes.some(c => c.group === 'Cubbies' || c.group === 'Puggles')); assert(ext.classes.some(c => c.group === 'Cubbies')); assert(![...part.classes, ...ext.classes].some(c => c.group === 'Puggles'));
  [part, ext].forEach(m => { assert.strictEqual(m.classNights, m.classes.reduce((n, c) => n + c.usedNights, 0)); m.classes.forEach(c => assert.strictEqual(c.bands.all + c.bands.most + c.bands.some + c.bands.none, c.usedNights)); });
  assert.deepStrictEqual(r.markUse.marks.map(m => m.mark), mu.marks.map(m => m.mark), 'Stats.compute carries the same table');
});
test('markUse: an empty season gives no marks, not an error', () => assert.deepStrictEqual(Stats.markUse({ master: ctx.master, season: Season.blank('2026-27'), calendar: ctx.calendar }).marks, []));
test('awards earned are counted from what was EARNED (Progress and attendance, plus any recorded by hand), not from what was announced or given', () => {
  const c = load(), kid = c.master.people.find(p => M.isActive(p) && M.isClubber(p) && M.groupOf(M.room(p)) === 'Sparks'), id = kid[X.ID];
  c.season.awards = {}; c.season.given = {}; c.season.progress = {}; c.season.config.exclude = { Sparks: ['Flight 3:16'] };
  const count = () => { const a = Stats.compute(c).achievers.find(x => x.id === id); return a ? a.count : 0; }, base = count();      // Blue Jewels from attendance are earned too
  ['1', '2', '3', '4'].forEach(i => Season.setProgress(c.season, id, 'HG', 'RJ1.' + i, '2026-10-01'));      // earns the Pilot Wing and Red Jewel 1: nothing announced, nothing given
  assert.strictEqual(count(), base + 2, 'two earned, none announced');
  Season.addAward(c.season, '2026-10-08', id, 'HG Red Jewel 1'); assert.strictEqual(count(), base + 2, 'announcing does not change the count');
  Season.setGiven(c.season, id, 'HG Red Jewel 1', '2026-10-15'); assert.strictEqual(count(), base + 2, 'neither does giving');
  Season.addAward(c.season, '2026-10-08', id, 'Recognition Certificate'); assert.strictEqual(count(), base + 3, 'one recorded by hand counts as earned');
  Season.addAward(c.season, '2026-10-08', id, 'Flight 3:16'); assert.strictEqual(count(), base + 3, 'the ones everybody gets stay out');
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
