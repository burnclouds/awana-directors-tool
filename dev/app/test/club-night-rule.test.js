// One "club night" rule (CR-10): a calendar row is a club night unless it is an Event or marked No Club. Calendar.isNight is the rule; Season.counted and the validator use it.
// Usage: node test/club-night-rule.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Calendar = require('../calendar.js'), Season = require('../season.js'), V = require('../validate.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const rows = [
  { Date: '2026-11-04', Type: 'Club night', Quarter: 'Q2', 'No Club': '' },
  { Date: '2026-11-11', Type: 'Event', Quarter: 'Q2', 'No Club': '' },
  { Date: '2026-11-18', Type: 'Club night', Quarter: 'Q2', 'No Club': '1' },
  { Date: '2026-11-25', Quarter: 'Q2' },                                  // no Type at all: still a club night
  { Date: '2026-12-02', Type: 'Special', Quarter: 'Q2', 'No Club': '' }   // any other type counts too
];
test('Season.counted, Calendar.nights and the validator agree on which rows are club nights', () => {
  const a = Object.keys(Season.counted(rows)).sort(), b = Calendar.nights(rows).map(r => r.Date).sort();
  assert.deepStrictEqual(a, ['2026-11-04', '2026-11-25', '2026-12-02']); assert.deepStrictEqual(a, b);
  const s = Season.blank('2026-27'); s.calendar = rows; Season.addAbsence(s, '70001_Ann_Lee', ['2026-11-04'], '', ['2026-11-04'], new Date(2026, 10, 1));
  s.absences['70001_Ann_Lee'][Object.keys(s.absences['70001_Ann_Lee'])[0]].nights['2026-11-11'] = 1;      // an Event night: not a club night, so the validator warns
  const f = V.validate(Season.toJson(s), 'awana-2026-27-20261101-000000.json').findings.filter(x => x.check === 'absences' && /no longer a club night/.test(x.msg));
  assert.strictEqual(f.length, 1, 'the Event night is the only non-club night');
});
test('a junk calendar row does not throw', () => { assert.deepStrictEqual(Object.keys(Season.counted([null, undefined, { Date: '2026-11-04', Quarter: 'Q1' }])), ['2026-11-04']); });
test('source guard: the inline rule is not repeated in season.js or validate.js', () => {
  ['season.js', 'validate.js'].forEach(f => assert(!/'No Club'\] !== '1'/.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')), f + ' repeats the club-night rule; use Calendar.isNight'));
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
