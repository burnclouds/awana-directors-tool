// The default quarter comes from the calendar (the latest club night on or before today), not from a fixed "Q2". Pure calendar logic; the browser side is in quarter-browser.test.js.
// Usage: node test/quarter.test.js
const assert = require('assert'), Calendar = require('../calendar.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const row = (Date, Quarter, extra) => Object.assign({ Date, Type: 'Club night', Quarter, 'No Club': '' }, extra || {});
const cal = [row('2026-09-09', 'Q1'), row('2026-10-28', 'Q2'), row('2026-12-30', 'Q2', { 'No Club': '1' }), row('2027-01-13', 'Q3'), row('2027-02-13', 'Q3', { Type: 'Event' }), row('2027-04-07', 'Q4')];

test('on a club night: that night\'s quarter', () => assert.strictEqual(Calendar.currentQuarter(cal, '2026-10-28'), 'Q2'));
test('between nights: the quarter of the latest night before today', () => assert.strictEqual(Calendar.currentQuarter(cal, '2027-01-15'), 'Q3'));
test('a no-club night or an event does not move the quarter on', () => {
  assert.strictEqual(Calendar.currentQuarter(cal, '2026-12-31'), 'Q2'); assert.strictEqual(Calendar.currentQuarter(cal, '2027-03-01'), 'Q3');
});
test('before the season starts: the first night\'s quarter; after it ends: the last night\'s', () => {
  assert.strictEqual(Calendar.currentQuarter(cal, '2026-08-01'), 'Q1'); assert.strictEqual(Calendar.currentQuarter(cal, '2027-09-01'), 'Q4');
});
test('no calendar: no answer, so the caller keeps what it had', () => assert.strictEqual(Calendar.currentQuarter([], '2027-01-15'), ''));

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
