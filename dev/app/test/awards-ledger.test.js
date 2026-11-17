// The award ledger (earned / announced / given / held per child and award). Invented test club only. (Moving or undoing a night's announcements was removed in 1.50.28: Announced is edited on Progress.)
// Usage: node test/awards-ledger.test.js
const assert = require('assert');
const S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
test('the ledger: one row per award with earned, announced and given, and a status', () => {
  const s = S.blank('2026-27'); s.calendar = [{ Date: '2026-09-09', Quarter: 'Q1' }]; s.handbooks.k = 'WR 260916';
  const sign = (b, bl, items, d) => items.forEach(i => S.setProgress(s, 'k', b, bl + '.' + i, d)); sign('WR', 'RJ1', ['1', '2', '3', '4'], '2026-10-14'); sign('WR', 'GJ1', ['1', '2', '3', '4'], '2026-10-21');
  S.addAward(s, '2026-10-28', 'k', 'WR Red Jewel 1'); S.setGiven(s, 'k', 'WR Red Jewel 1', '2026-11-03'); S.addAward(s, '2026-10-28', 'k', 'WR Pilot Wing');
  const l = S.awardLedger(s, 'k', 'Sparks', s.calendar), by = a => l.find(r => r.award === a);
  assert.deepStrictEqual([by('WR Red Jewel 1').status, by('WR Red Jewel 1').given, by('WR Red Jewel 1').announced, by('WR Red Jewel 1').earned], ['Given', '2026-11-03', '2026-10-28', '2026-10-14']);
  assert.strictEqual(by('WR Pilot Wing').status, 'Earned, not given'); assert.strictEqual(by('WR Green Jewel 1').status, 'Earned, not given'); assert.strictEqual(by('WR Green Jewel 1').earned, '2026-10-21');
});
test('a ledger row says whether the award is held', () => {
  const s = S.blank('2026-27'); s.calendar = [{ Date: '2026-09-09', Quarter: 'Q1' }]; s.handbooks.k = 'HG 260916'; ['1', '2', '3', '4'].forEach(i => S.setProgress(s, 'k', 'HG', 'RJ1.' + i, '2026-10-14'));
  S.setHold(s, 'k', 'HG Red Jewel 1', true); const l = S.awardLedger(s, 'k', 'Sparks', s.calendar);
  assert.strictEqual(l.find(r => r.award === 'HG Red Jewel 1').held, true); assert.strictEqual(l.find(r => r.award === 'HG Pilot Wing').held, false);
});
test('earlier-year awards that were never announced or given are left out of the ledger', () => {
  const s = S.blank('2026-27'); s.calendar = [{ Date: '2026-09-09', Quarter: 'Q1' }]; ['1', '2', '3', '4'].forEach(i => S.setProgress(s, 'k', 'HG', 'RJ1.' + i, '2025-04-02'));
  assert.deepStrictEqual(S.awardLedger(s, 'k', 'Sparks', s.calendar), []); S.setGiven(s, 'k', 'HG Red Jewel 1', '2025-04-09'); assert.strictEqual(S.awardLedger(s, 'k', 'Sparks', s.calendar).length, 1);
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
