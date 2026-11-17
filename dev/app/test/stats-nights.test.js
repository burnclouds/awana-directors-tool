// Night-by-night statistics (S15): children and adults per held night, each on its own. Hand-worked numbers, invented data only.
// Usage: node test/stats-nights.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Stats = require('../stats.js'), Season = require('../season.js'), M = require('../model.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const close = (a, b, msg) => assert(Math.abs(a - b) < 1e-9, (msg || '') + ' got ' + a + ' want ' + b);

// Eight held nights: n1..n4 in Q1, n5..n8 in Q2. Children 2,4,4,4,5,5,7,9; adults 3,0,2,3,0,5,3,0 (0 = none marked).
const kids = [2, 4, 4, 4, 5, 5, 7, 9], adults = [3, 0, 2, 3, 0, 5, 3, 0];
const nights = kids.map((k, i) => ({ date: new Date(Date.UTC(2026, 8, 9 + 7 * i)).toISOString().slice(0, 10), quarter: i < 4 ? 'Q1' : 'Q2', kids: k, adults: adults[i] }));

test('children, whole season: mean 5, median 4.5, mode 4, max 9, min 2, sigma 2, sample s 2.1381', () => {
  const f = Stats.nightFigures(nights, 'season').children;
  assert.strictEqual(f.n, 8); close(f.mean, 5); close(f.median, 4.5); assert.deepStrictEqual(f.modes, [4]);
  assert.strictEqual(f.max, 9); assert.strictEqual(f.min, 2); close(f.popSd, 2); close(f.sampleSd, Math.sqrt(32 / 7));
  assert.deepStrictEqual(f.maxDates, [nights[7].date]); assert.deepStrictEqual(f.minDates, [nights[0].date]);
});
test('children, Q1: mean 3.5, median 4, mode 4, max on three nights (tie), sigma sqrt 0.75, s 1', () => {
  const f = Stats.nightFigures(nights, 'Q1').children;
  close(f.mean, 3.5); close(f.median, 4); assert.deepStrictEqual(f.modes, [4]); assert.strictEqual(f.max, 4);
  assert.strictEqual(f.maxDates.length, 3); close(f.popSd, Math.sqrt(0.75)); close(f.sampleSd, 1);
});
test('children, Q2: mean 6.5, median 6, mode 5, sigma sqrt 2.75, s sqrt(11/3)', () => {
  const f = Stats.nightFigures(nights, 'Q2').children;
  close(f.mean, 6.5); close(f.median, 6); assert.deepStrictEqual(f.modes, [5]);
  close(f.popSd, Math.sqrt(2.75)); close(f.sampleSd, Math.sqrt(11 / 3));
});
test('adults, whole season: nights with no adults marked are left out (5 nights), mean 3.2, median 3, mode 3, sigma sqrt 0.96', () => {
  const f = Stats.nightFigures(nights, 'season').adults;
  assert.strictEqual(f.n, 5); close(f.mean, 3.2); close(f.median, 3); assert.deepStrictEqual(f.modes, [3]);
  assert.strictEqual(f.max, 5); assert.strictEqual(f.min, 2); close(f.popSd, Math.sqrt(0.96)); close(f.sampleSd, Math.sqrt(1.2));
});
test('adults, Q1 (3,2,3): mean 8/3, median 3, mode 3, sigma sqrt(2/9), s sqrt(1/3)', () => {
  const f = Stats.nightFigures(nights, 'Q1').adults;
  close(f.mean, 8 / 3); close(f.median, 3); assert.deepStrictEqual(f.modes, [3]);
  close(f.popSd, Math.sqrt(2 / 9)); close(f.sampleSd, Math.sqrt(1 / 3));
});
test('adults, Q2 (5,3): mean 4, median 4, no mode (every value once), sigma 1, s sqrt 2', () => {
  const f = Stats.nightFigures(nights, 'Q2').adults;
  close(f.mean, 4); close(f.median, 4); assert.deepStrictEqual(f.modes, []);
  close(f.popSd, 1); close(f.sampleSd, Math.sqrt(2));
});
test('an empty span (Q3) gives nulls and does not throw; one night has no sample sigma', () => {
  const f = Stats.nightFigures(nights, 'Q3');
  assert.strictEqual(f.children.n, 0); assert.strictEqual(f.children.mean, null); assert.strictEqual(f.adults.sampleSd, null);
  assert.strictEqual(Stats.spread([7]).sampleSd, null); close(Stats.spread([7]).popSd, 0);
});
test('tied modes are all listed; a list with no repeats has none', () => {
  assert.deepStrictEqual(Stats.spread([1, 1, 2, 2, 3]).modes, [1, 2]); assert.deepStrictEqual(Stats.spread([1, 2, 3]).modes, []);
});
test('the TEST club: the whole-season children figures agree with the tile numbers already shown', () => {
  const td = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f));
  const s = Season.fromJson(fs.readFileSync(path.join(td, file), 'utf8')), master = M.fromRoster(s.roster);
  const r = Stats.compute({ master, season: s, calendar: s.calendar });
  const f = r.nightFigures.children;
  assert.strictEqual(f.n, r.club.nights); assert.strictEqual(f.max, r.club.high.count); assert.strictEqual(f.min, r.club.low.count);
  assert.strictEqual(Math.round(f.mean * 10) / 10, r.club.average, 'mean rounds to the tile');
  assert.strictEqual(r.nightFigures.adults.n, 0, 'no adults are marked on the TEST club');
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
