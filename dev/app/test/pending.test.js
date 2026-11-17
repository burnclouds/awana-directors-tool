// Earned, not announced: the list the slides and the Announce page draw from, Mark all announced, holds, and fixing Announced by hand. Invented ids only.
// Usage: node test/pending.test.js
const assert = require('assert');
const S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
// k1 (Sparks, HG) finished Red Jewel 1 on 10/04: earns "HG Pilot Wing" and "HG Red Jewel 1". k2 finished nothing.
function club() {
  const s = S.blank('2026-27'); s.calendar = [{ Date: '2026-09-09', Quarter: 'Q1', Type: 'Club night' }, { Date: '2026-10-07', Quarter: 'Q2', Type: 'Club night' }];
  s.handbooks.k1 = 'HG 260916'; ['1', '2', '3', '4'].forEach((i, n) => S.setProgress(s, 'k1', 'HG', 'RJ1.' + i, '2026-10-0' + (n + 1)));
  return s;
}
const names = rows => rows.map(r => r.award);

test('pending lists what is earned and not announced, with the day it was earned', () => {
  const s = club(), p = S.pendingAwards(s, 'k1', 'Sparks', s.calendar);
  assert.deepStrictEqual(names(p), ['HG Pilot Wing', 'HG Red Jewel 1']); assert.strictEqual(p[0].earned, '2026-10-04'); assert.strictEqual(p[0].held, false);
  assert.deepStrictEqual(S.pendingAwards(s, 'k2', 'Sparks', s.calendar), []);
});

test('announce stamps awards on the night and they leave the pending list for good', () => {
  const s = club(); S.announce(s, '2026-10-07', [['k1', 'HG Pilot Wing'], ['k1', 'HG Red Jewel 1']]);
  assert.deepStrictEqual(s.awards['2026-10-07'].k1, ['HG Pilot Wing', 'HG Red Jewel 1']);
  assert.deepStrictEqual(S.pendingAwards(s, 'k1', 'Sparks', s.calendar), []);
});

test('a held award stays on the list, flagged, but is not on the slides and is skipped by announce', () => {
  const s = club(); S.setHold(s, 'k1', 'HG Pilot Wing', true);
  const p = S.pendingAwards(s, 'k1', 'Sparks', s.calendar); assert.deepStrictEqual(p.map(r => [r.award, r.held]), [['HG Pilot Wing', true], ['HG Red Jewel 1', false]]);
  assert.deepStrictEqual(S.slidePending(s, 'Sparks', ['k1', 'k2'], s.calendar), [{ id: 'k1', results: ['HG Red Jewel 1'] }]);
  S.announce(s, '2026-10-07', [['k1', 'HG Pilot Wing'], ['k1', 'HG Red Jewel 1']]);
  assert.deepStrictEqual(s.awards['2026-10-07'].k1, ['HG Red Jewel 1'], 'the held one was not announced');
  assert.deepStrictEqual(names(S.pendingAwards(s, 'k1', 'Sparks', s.calendar)), ['HG Pilot Wing']);
  S.setHold(s, 'k1', 'HG Pilot Wing', false); assert.deepStrictEqual(S.slidePending(s, 'Sparks', ['k1'], s.calendar), [{ id: 'k1', results: ['HG Pilot Wing'] }], 'released, it is on the next slide');
});

test('slides keep the same awards until they are announced, however often they are drawn', () => {
  const s = club(), a = S.slidePending(s, 'Sparks', ['k1'], s.calendar), b = S.slidePending(s, 'Sparks', ['k1'], s.calendar);
  assert.deepStrictEqual(a, b); assert.deepStrictEqual(a[0].results, ['HG Pilot Wing', 'HG Red Jewel 1']);
});

test('awards on the left-off-the-slide list are never pending', () => {
  const s = club(); s.config.exclude.Sparks = ['HG Pilot Wing'];
  assert.deepStrictEqual(names(S.pendingAwards(s, 'k1', 'Sparks', s.calendar)), ['HG Red Jewel 1']);
});

test('awards finished before the first club night belong to an earlier year and are not pending', () => {
  const s = club(); s.calendar = [{ Date: '2026-10-07', Quarter: 'Q2', Type: 'Club night' }]; s.progress.k1.HG = { 'RJ1.1': '2026-09-01', 'RJ1.2': '2026-09-02', 'RJ1.3': '2026-09-03', 'RJ1.4': '2026-09-04' };
  assert.deepStrictEqual(S.pendingAwards(s, 'k1', 'Sparks', s.calendar), []);
});

test('setAnnounced sets, moves and clears the announce night, and never touches Given', () => {
  const s = club(); S.setGiven(s, 'k1', 'HG Red Jewel 1', '2026-10-14');
  S.setAnnounced(s, 'k1', 'HG Red Jewel 1', '2026-10-07'); assert.deepStrictEqual(s.awards['2026-10-07'].k1, ['HG Red Jewel 1']);
  S.setAnnounced(s, 'k1', 'HG Red Jewel 1', '2026-10-14'); assert.strictEqual(s.awards['2026-10-07'], undefined, 'it moved'); assert.deepStrictEqual(s.awards['2026-10-14'].k1, ['HG Red Jewel 1']);
  S.setAnnounced(s, 'k1', 'HG Red Jewel 1', ''); assert.deepStrictEqual(s.awards, {}); assert.strictEqual((s.given.k1 || {})['HG Red Jewel 1'], '2026-10-14', 'Given stays');
  assert(names(S.pendingAwards(s, 'k1', 'Sparks', s.calendar)).includes('HG Red Jewel 1'), 'pending again');
});

test('removing the last announcement leaves a Given date alone (Given is independent)', () => {
  const s = S.blank('2026-27'); S.addAward(s, '2026-10-21', 'k1', 'Flight 3:16'); S.setGiven(s, 'k1', 'Flight 3:16', '2026-10-28'); S.removeAward(s, '2026-10-21', 'k1', 'Flight 3:16');
  assert.strictEqual((s.given.k1 || {})['Flight 3:16'], '2026-10-28');
});

test('the move and undo-a-night functions are gone', () => {
  assert.strictEqual(S.moveAnnouncements, undefined); assert.strictEqual(S.unannounce, undefined); assert.strictEqual(S.slideAwards, undefined);
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
