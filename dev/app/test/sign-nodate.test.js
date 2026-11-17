// Sign-offs marked "no date": an award given before its section is finished marks the section's empty sign-offs as no date, so the section counts as finished. The day given is kept inside; no sign-off shows it. Invented test club only.
// Usage: node test/sign-nodate.test.js
const assert = require('assert');
const S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

test('unsignedIn lists the empty sign-offs of one block; marking them no date fills them with the given day and marks them', () => {
  const s = S.blank('2026-27');
  S.setProgress(s, 'k1', 'HG', '1.1', '2026-10-07');
  assert.deepStrictEqual(S.unsignedIn(s, 'k1', 'HG', '1', ['1', '2', '3']), ['1.2', '1.3']);
  S.markSignsNoDate(s, 'k1', 'HG', ['1.2', '1.3'], '2026-11-03');
  assert.deepStrictEqual(s.progress.k1.HG, { '1.1': '2026-10-07', '1.2': '2026-11-03', '1.3': '2026-11-03' });
  assert.strictEqual(S.isSignNoDate(s, 'k1', 'HG', '1.2'), true); assert.strictEqual(S.isSignNoDate(s, 'k1', 'HG', '1.1'), false);
  assert.deepStrictEqual(S.unsignedIn(s, 'k1', 'HG', '1', ['1', '2', '3']), [], 'nothing left to mark');
});

test('a typed date replaces the no-date mark; clearing a sign-off removes it too', () => {
  const s = S.blank('2026-27'); S.markSignsNoDate(s, 'k1', 'HG', ['1.2'], '2026-11-03');
  S.setProgress(s, 'k1', 'HG', '1.2', '2026-10-28'); assert.strictEqual(S.isSignNoDate(s, 'k1', 'HG', '1.2'), false);
  S.markSignsNoDate(s, 'k1', 'HG', ['1.2'], '2026-11-03'); S.setProgress(s, 'k1', 'HG', '1.2', ''); assert.strictEqual(S.isSignNoDate(s, 'k1', 'HG', '1.2'), false); assert.deepStrictEqual(s.progressNoDate || {}, {}, 'the mark goes with the date');
});

test('the file stays small with no marks, and a file with marks round trips', () => {
  const s = S.blank('2026-27'); S.setProgress(s, 'k1', 'HG', '1.1', '2026-10-07');
  assert(!('progressNoDate' in JSON.parse(S.toJson(s))), 'nothing written when no sign-off is marked');
  S.markSignsNoDate(s, 'k1', 'HG', ['1.2'], '2026-11-03'); const t = S.fromJson(S.toJson(s));
  assert.strictEqual(S.isSignNoDate(t, 'k1', 'HG', '1.2'), true); assert.strictEqual(t.progress.k1.HG['1.2'], '2026-11-03');
});

console.log(passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
