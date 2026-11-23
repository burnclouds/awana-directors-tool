// Progress pace (pace.js) on the invented test club, with sign-off dates put in by hand so every number can be worked out directly.
// Usage: node test/pace.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Season = require('../season.js'), M = require('../model.js'), Pace = require('../pace.js'), RS = require('../reports-season.js');
const { reviewPace } = require('../../tools/review-pace.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).find(f => /TEST.*\.json$/.test(f));
const load = () => { const s = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')); return { season: s, master: M.fromRoster(s.roster), calendar: s.calendar }; };
const X = M.X;

// A Sparks child with 8+ nights, and a T&T child, picked from the data.
function pick(ctx, group, minNights) {
  const held = Season.heldNights(ctx.season, ctx.calendar);
  return ctx.master.people.filter(p => M.isActive(p) && M.isClubber(p) && M.groupOf(M.room(p)) === group)
    .find(p => held.filter(d => (ctx.season.attendance[d][p[X.ID]] || {}).a).length >= minNights);
}
// The test club has 7 nights so far; two more nights for a child let the 2-window rules be checked.
const grow = (ctx, p) => ['2026-10-28', '2026-11-04'].forEach(d => Season.setMark(ctx.season, d, p[X.ID], 'a', true));
const nightsOf = (ctx, p) => Season.heldNights(ctx.season, ctx.calendar).filter(d => (ctx.season.attendance[d][p[X.ID]] || {}).a);

test('a class with no sign-offs entered is "not entered", and nobody in it is on a list', () => {
  const ctx = load(), rows = Pace.rows(ctx);
  assert(rows.length > 0); rows.forEach(r => { assert.strictEqual(r.roomEntered, false); assert.strictEqual(r.list, ''); });
});
test('core counts Flight 3:16, Start Zones, Rank and jewel items; reviews and Silver / Gold are counted apart', () => {
  const ctx = load(), sp = pick(ctx, 'Sparks', 3), tt = pick(ctx, 'T&T', 3), n = nightsOf(ctx, sp);
  const id = sp[X.ID], t = ctx.season.config.progress.Sparks, book = Object.keys(ctx.season.config.books).find(c => ctx.season.config.books[c].group === 'Sparks') || 'HG';
  Season.setProgress(ctx.season, id, 'common', 'FLT.1', n[0]);
  Season.setProgress(ctx.season, id, book, 'R.1', n[0]);
  Season.setProgress(ctx.season, id, book, 'RJ1.1', n[1]);
  Season.setProgress(ctx.season, id, book, 'RJ1.5', n[2]);          // a review
  let r = Pace.rows(ctx).find(x => x.id === id);
  assert.strictEqual(r.core, 3, 'Flight + Rank + jewel section'); assert.strictEqual(r.extra, 1, 'one review');
  assert.strictEqual(r.per[0], 2); assert.strictEqual(r.per[1], 1); assert.strictEqual(r.per[2], 0, 'a review does not move the night');
  const ttId = tt[X.ID], m = nightsOf(ctx, tt);
  Season.setProgress(ctx.season, ttId, 'common', 'SZ.1', m[0]);
  Season.setProgress(ctx.season, ttId, 'AoG', 'BE1.1.1', m[0]);
  Season.setProgress(ctx.season, ttId, 'AoG', 'SV1.' + ctx.season.config.progress['T&T'].perBook.find(b => b.key === 'SV1').items[0], m[1]);
  r = Pace.rows(ctx).find(x => x.id === ttId);
  assert.strictEqual(r.core, 2, 'Start Zone + emblem section'); assert.strictEqual(r.extra, 1, 'one Silver item'); assert(r.extraTotal >= 8);
});
test('a month of work signed off in one visit is one big night, and overall pace is per night attended', () => {
  const ctx = load(), p = pick(ctx, 'Sparks', 6), id = p[X.ID], book = 'HG'; grow(ctx, p); const n = nightsOf(ctx, p);
  ['R.1', 'R.2', 'R.3', 'R.4'].forEach(k => Season.setProgress(ctx.season, id, book, k, n[0]));
  const gap = new Date(n[0] + 'T12:00:00Z'); gap.setUTCDate(gap.getUTCDate() + 1);      // a date between two nights goes to the next night attended
  Season.setProgress(ctx.season, id, book, 'R.5', gap.toISOString().slice(0, 10));
  const r = Pace.rows(ctx).find(x => x.id === id);
  assert.strictEqual(r.per[0], 4); assert.strictEqual(r.per[1], 1); assert.strictEqual(r.core, 5);
  assert.strictEqual(Math.round(r.overall * 1000), Math.round(5 / n.length * 1000));
  assert.strictEqual(r.recent, r.per.slice(-4).reduce((a, b) => a + b, 0) / 4);
});
test('a fast start that went quiet is "capable, slowed"; steady slow stays "steadily slow"; the trend arrow needs two windows', () => {
  const ctx = load(), held = Season.heldNights(ctx.season, ctx.calendar);
  const cands = ctx.master.people.filter(p => M.isActive(p) && M.isClubber(p) && M.groupOf(M.room(p)) === 'Sparks' && nightsOf(ctx, p).length >= 6 && !ctx.season.progress[p[X.ID]]).slice(0, 2);
  assert(cands.length === 2, 'test data has two Sparks with 6+ nights'); cands.forEach(p => grow(ctx, p));
  const [a, b] = cands, na = nightsOf(ctx, a), nb = nightsOf(ctx, b);
  let k = 0; const keys = ['R.1', 'R.2', 'R.3', 'R.4', 'R.5', 'R.6', 'R.7', 'R.8', 'RJ1.1', 'RJ1.2', 'RJ1.3', 'RJ1.4'];
  na.slice(0, 4).forEach(d => { for (let i = 0; i < 2; i++) Season.setProgress(ctx.season, a[X.ID], 'HG', keys[k++], d); });      // 2 a night for four nights, then nothing
  Season.setProgress(ctx.season, b[X.ID], 'HG', 'R.1', nb[0]);                                                                // one section all year
  const rows = Pace.rows(ctx), ra = rows.find(x => x.id === a[X.ID]), rb = rows.find(x => x.id === b[X.ID]);
  assert.strictEqual(ra.list, 'stalled'); assert.strictEqual(ra.trend, 'down'); assert(ra.peak >= 2);
  assert.strictEqual(rb.list, 'steady');
  const early = rows.filter(x => x.room === ra.room && x.nights > 0 && x.nights < 3);
  assert(early.length > 0, 'precondition: a child in the same class has fewer than 3 nights'); early.forEach(x => { assert(x.roomEntered); assert.strictEqual(x.list, '', x.name + ' is too early to tell'); });
});
test('the room table and the watch list report render without error', () => {
  const ctx = load(); ctx.opts = { group: 'Sparks' };
  const rooms = Pace.room(Pace.rows(ctx)); assert(rooms.length > 0 && rooms.every(r => typeof r.entered === 'boolean'));
  const html = RS.paceWatch(Object.assign({ settings: {} }, ctx)); assert(/Pace Watch List/.test(html));
  assert(/Capable, slowed|Steadily slow|Needs encouragement|Nobody to watch|No sign-off dates/.test(html));
});
test('threshold review reports aggregate coverage and excludes classes without sign-offs from the medians', () => {
  const { season } = load();
  const before = reviewPace(season);
  assert(before.heldNights > 0);
  assert.deepStrictEqual(before.thresholds, Pace.CFG);
  before.groups.forEach(group => {
    assert(group.clubbers > 0 && group.classesWithoutSignoffs > 0);
    assert.strictEqual(group.eligibleForWatch, 0);
    assert.strictEqual(group.eligibleForTrend, 0);
    assert.strictEqual(group.medianOverall, null);
  });
  const ctx = { season, calendar: season.calendar, master: M.fromRoster(season.roster) };
  const child = pick(ctx, 'Sparks', 4), id = child[M.X.ID];
  Season.setProgress(season, id, 'HG', 'R.1', nightsOf(ctx, child)[0]);
  const snapshot = JSON.stringify(season), after = reviewPace(season), sparks = after.groups[0];
  assert.strictEqual(sparks.withDatedCoreSignoffs, 1);
  assert(sparks.eligibleForWatch > 0 && sparks.medianOverall !== null);
  assert.strictEqual(sparks.classesWithoutSignoffs, before.groups[0].classesWithoutSignoffs - 1);
  assert(!JSON.stringify(after).includes(id) && !JSON.stringify(after).includes(M.fullName(child)));
  assert.strictEqual(JSON.stringify(season), snapshot);
});
test('rollover evidence exposes the effect of dated carried sections without tuning thresholds', () => {
  const ctx = load(), closed = ctx.season, child = pick(ctx, 'Sparks', 4), id = child[M.X.ID];
  const prior = nightsOf(ctx, child)[0];
  Season.setProgress(closed, id, 'HG', 'R.1', prior);
  Season.markSignsNoDate(closed, id, 'HG', ['R.2'], prior);
  const next = Season.newSeason(closed, '2027-28');
  const dates = ['2027-09-08', '2027-09-15', '2027-09-22', '2027-09-29'];
  next.calendar = dates.map(Date => ({ Date, Type: 'Club night', Quarter: 'Q1' }));
  dates.forEach(d => Season.setMark(next, d, id, 'a', true));
  Season.setProgress(next, id, 'HG', 'R.3', dates[1]);
  const pace = season => Pace.rows({ season, calendar: season.calendar, master: M.fromRoster(season.roster) }).find(row => row.id === id);
  const before = JSON.stringify(next), current = pace(next);
  assert.equal(Season.seasonStart(next), dates[0]);
  assert.deepStrictEqual(current.per, [1, 1, 0, 0], 'the real earlier date lands in the first attended-night bucket');
  const comparison = JSON.parse(before);
  Season.setProgress(comparison, id, 'HG', 'R.1', '');
  assert.deepStrictEqual(pace(comparison).per, [0, 1, 0, 0], 'a current-season-only comparison removes the carried date');
  assert.equal(current.overall, 0.5);
  assert.equal(pace(comparison).overall, 0.25);
  assert.strictEqual(JSON.stringify(next), before);
});
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
