// Awana store points (store.js): the weights, the three ways of turning them into points, the projection, and what is saved in the data file.
const assert = require('assert'), fs = require('fs'), path = require('path');
const Season = require('../season.js'), M = require('../model.js'), Store = require('../store.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).find(f => /TEST.*\.json$/.test(f));
const load = () => { const s = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')); return { season: s, master: M.fromRoster(s.roster), calendar: s.calendar }; };
const X = M.X, ctx0 = () => load();

test('settings: bad numbers fall back, max is never below min, unknown method becomes direct, weights are never negative', () => {
  const c = Store.normalize({ min: 'x', max: 5, method: 'nope', weights: { attendance: -3, extra: 'abc' } });
  assert.strictEqual(c.min, 15); assert.strictEqual(c.max, 15); assert.strictEqual(c.method, 'direct'); assert.strictEqual(c.weights.attendance, 0); assert.strictEqual(c.weights.extra, 1);
  assert.deepStrictEqual(Store.normalize(null), Store.DEFAULTS);
});
test('a minimum above the maximum is said out loud, not hidden', () => {
  const c = Store.normalize({ min: 300, max: 200 });
  assert.strictEqual(c.max, 300); assert(/maximum \(200\).*minimum \(300\)/.test(c.warning));
  assert.strictEqual(Store.normalize({ min: 15, max: 200 }).warning, undefined);
});
test('direct: the weighted total is the points, kept between the minimum and the maximum', () => {
  assert.deepStrictEqual(Store.award([3, 15, 100, 250], { min: 15, max: 200, method: 'direct' }), [15, 15, 100, 200]);
});
test('proportional: the best child gets the maximum, the rest in proportion, nobody under the minimum', () => {
  assert.deepStrictEqual(Store.award([10, 50, 100], { min: 15, max: 200, method: 'top' }), [20, 100, 200]);
  assert.deepStrictEqual(Store.award([1, 100], { min: 15, max: 200, method: 'top' }), [15, 200]);
});
test('range: lowest gets the minimum, highest the maximum, the middle in proportion; all equal gives the maximum', () => {
  assert.deepStrictEqual(Store.award([10, 55, 100], { min: 20, max: 200, method: 'range' }), [20, 110, 200]);
  assert.deepStrictEqual(Store.award([7, 7], { min: 15, max: 200, method: 'range' }), [200, 200]);
  assert.deepStrictEqual(Store.award([0, 0], { min: 15, max: 200, method: 'range' }), [15, 15]);
});
const ctx = load(), r = Store.compute(ctx);
test('counts: every active child is counted once and each earning matches the raw records', () => {
  const active = ctx.master.people.filter(p => M.isActive(p) && M.isClubber(p) && ['Sparks', 'T&T'].includes(M.groupOf(M.room(p)))); assert.strictEqual(r.kids.length, active.length);
  const att = r.kids.reduce((n, k) => n + k.counts.attendance, 0);
  const raw = active.reduce((n, p) => n + Object.keys(ctx.season.attendance).filter(d => Season.counted(ctx.calendar)[d] && ctx.season.attendance[d][p[X.ID]] && ctx.season.attendance[d][p[X.ID]].a).length, 0);
  assert.strictEqual(att, raw);
  const k = r.kids.find(x => x.group === 'T&T' && x.counts.awards >= 0), id = k.id; Season.addAward(ctx.season, '2026-10-21', id, 'Start Zone 1');
  assert.strictEqual(Store.compute(ctx).kids.find(x => x.id === id).counts.awards, k.counts.awards, 'an award that everyone gets is not counted');
  Season.addAward(ctx.season, '2026-10-21', id, 'Some Real Award'); assert.strictEqual(Store.compute(ctx).kids.find(x => x.id === id).counts.awards, k.counts.awards + 1);
});
test('projection: scales by club nights in the calendar over nights entered; shares of the points add to about 100%', () => {
  const q = Season.counted(ctx.calendar), total = Object.keys(q).length; assert.strictEqual(r.nightsTotal, total); assert(r.nightsSoFar > 0 && r.nightsSoFar < total);
  assert(Math.abs(r.factor - Math.round(total / r.nightsSoFar * 100) / 100) < 0.01);
  const k = r.kids[0]; assert(Math.abs(k.rawProjected - k.rawNow * r.nightsTotal / r.nightsSoFar) < 0.2 * r.kids.length);
  const share = r.categories.reduce((n, c) => n + c.share, 0); assert(share >= 98 && share <= 102, 'shares add to ' + share);
});
test('projection: a past night nobody entered is not a night still to come', () => {
  const c = load(), held = Season.heldNights(c.season, c.calendar), last = held[held.length - 1], counted = Object.keys(Season.counted(c.calendar));
  const base = Store.compute(c), future = counted.filter(d => d > last).length;
  assert(future > 0, 'precondition: the calendar has nights still to come'); assert.strictEqual(base.nightsTotal, held.length + future);
  // with today given, tonight (not yet entered) is still to come; nights before today are not
  const after = Store.compute(Object.assign({ today: last }, c)), early = Store.compute(Object.assign({ today: '2020-01-01' }, c));
  assert.strictEqual(after.nightsTotal, base.nightsTotal); assert.strictEqual(early.nightsTotal, base.nightsTotal);
  const c2 = load(); delete c2.season.attendance[held[2]];                 // a night in the middle that was never entered
  const r2 = Store.compute(c2); assert.strictEqual(r2.nightsSoFar, held.length - 1); assert.strictEqual(r2.nightsTotal, held.length - 1 + future);
  assert(r2.nightsTotal < counted.length, 'the unentered night ' + held[2] + ' is left out of the total');
  const d2 = counted.filter(d => d > last).sort()[0];
  assert.strictEqual(Store.compute(Object.assign({ today: d2 }, c)).nightsTotal, base.nightsTotal);
});
test('weights: doubling a weight raises the weighted share of that earning and moves the points; zero leaves it out', () => {
  const c2 = load(); c2.season.config.store = { weights: { attendance: 2 } };
  const a = Store.compute(c2), base = r.categories.find(c => c.key === 'attendance');
  assert.strictEqual(a.categories.find(c => c.key === 'attendance').weightedTotal, base.weightedTotal * 2);
  c2.season.config.store = { weights: { spirit: 0, place: 0 } }; const b = Store.compute(c2);
  assert.strictEqual(b.categories.find(c => c.key === 'spirit').share, 0); assert(b.now.total < r.now.total);
});
test('"scale to fit": multiplying every weight by the fit factor puts the best child exactly on the maximum (direct method)', () => {
  const c2 = load(), f = r.fitFactor.projected, w = {}; Object.keys(Store.DEFAULTS.weights).forEach(k => { w[k] = Store.DEFAULTS.weights[k] * f; });
  c2.season.config.store = { weights: w }; const x = Store.compute(c2); assert.strictEqual(x.projected.max, 200); assert.strictEqual(x.projected.atMax >= 1, true);
});
test('the settings are written to the data file and come back; an older file without them gets the defaults', () => {
  const c2 = load(); c2.season.config.store = { min: 20, max: 150, method: 'range', weights: { attendance: 2.5 } };
  const back = Season.fromJson(Season.toJson(c2.season)); assert.deepStrictEqual(Store.normalize(back.config.store).weights.attendance, 2.5); assert.strictEqual(back.config.store.max, 150);
  const old = JSON.parse(Season.toJson(c2.season)); delete old.config.store; assert.deepStrictEqual(Store.normalize(Season.fromJson(JSON.stringify(old)).config.store), Store.normalize(Season.blank('x').config.store));
});
test('programs: Sparks and T&T only by default; ticking Cubbies adds them, and an empty list gives no children, not an error', () => {
  assert.deepStrictEqual(Store.normalize(null).programs, ['Sparks', 'T&T']); assert(r.kids.every(k => k.group === 'Sparks' || k.group === 'T&T')); assert.deepStrictEqual(r.groups.map(g => g.group), ['Sparks', 'T&T']);
  const c2 = load(); c2.season.config.store = { programs: ['Cubbies', 'Sparks', 'T&T', 'Nonsense'] }; const a = Store.compute(c2);
  const cubbies = c2.master.people.filter(p => M.isActive(p) && M.isClubber(p) && M.groupOf(M.room(p)) === 'Cubbies').length;
  assert.strictEqual(a.kids.length, r.kids.length + cubbies); assert.deepStrictEqual(a.cfg.programs, ['Cubbies', 'Sparks', 'T&T']);
  c2.season.config.store = { programs: [] }; const none = Store.compute(c2); assert.strictEqual(none.kids.length, 0); assert.strictEqual(none.now.total, 0);
  const back = Season.fromJson(Season.toJson(c2.season)); assert.deepStrictEqual(back.config.store.programs, []);
  const c3 = load(); c3.season.config.store = { min: 15 }; assert.deepStrictEqual(Store.normalize(c3.season.config.store).programs, ['Sparks', 'T&T'], 'a saved file without the list gets the default');
});
test('an empty season gives zeros, not errors', () => {
  const e = Store.compute({ master: ctx.master, season: Season.blank('2026-27'), calendar: ctx.calendar });
  assert.strictEqual(e.nightsSoFar, 0); assert.strictEqual(e.factor, 0); assert.strictEqual(e.now.total, e.kids.length * 15);
});
test('markShare: per class, the weighted Participation and Extra points and their share of the class total', () => {
  const rr = Store.compute(ctx0()); assert(rr.markShare.length > 0); let withShare = 0;
  rr.markShare.forEach(c => {
    const ks = rr.kids.filter(k => k.room === c.room), w = rr.cfg.weights;
    assert.strictEqual(c.kids, ks.length);
    assert(Math.abs(c.participationPoints - w.participation * ks.reduce((n, k) => n + k.counts.participation, 0)) < 0.2);
    assert(Math.abs(c.extraPoints - w.extra * ks.reduce((n, k) => n + k.counts.extra, 0)) < 0.2);
    if (c.raw) { assert(Math.abs(c.participationShare - Math.round(c.participationPoints / c.raw * 100)) <= 1); withShare++; }
  });
  assert(withShare > 0, 'some class has points to take a share of');
  const c2 = ctx0(); c2.season.config.store = { weights: { participation: 0 } };
  assert(Store.compute(c2).markShare.every(c => c.participationPoints === 0 && c.participationShare === 0), 'weight 0 leaves it out');
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
