// The attendance sheet prints the recorded marks: a tick in each mark cell that has a record, blank where there is none.
// Uses the invented TEST season in dev/test-data. Usage: node test/attendance-fill-print.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const M = require('../model.js'), Cal = require('../calendar.js'), Season = require('../season.js'), Reports = require('../reports.js');
require('../reports-season.js'); require('../teams.js');
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).filter(f => /TEST.*\.json$/.test(f)).sort().pop();      // the invented TEST season; no real data
const season = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')), master = M.fromRoster(season.roster), calendar = season.calendar;
const html = Reports.LIST.find(r => r.id === 'attendance').render({ master, settings: { quarter: 'Q1', club: 'x' }, calendar, season, opts: { room: 'Sparks A' } });
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

test('a recorded mark prints as a tick', () => {
  const ticks = (html.match(/&#10003;/g) || []).length;
  assert(ticks > 0, 'the Sparks A sheet has ticks for the nights already recorded');
});
test('the number of ticks equals the number of marks recorded for these nights', () => {
  const nights = Cal.nights(calendar, 'Q1').map(r => r.Date);
  const kids = master.people.filter(p => M.isActive(p) && M.isClubber(p) && M.room(p) === 'Sparks A');
  const keys = ['a', 'h', 'p', 'x'];
  let expected = 0;
  nights.forEach(n => { const night = (season.attendance || {})[n] || {}; kids.forEach(p => { const m = night[p[M.X.ID]] || {}; keys.forEach(k => { if (m[k]) expected++; }); }); });
  assert.strictEqual((html.match(/&#10003;/g) || []).length, expected, 'one tick per recorded mark');
});
test('no junk text on the sheet', () => assert(!/undefined|NaN|\[object/.test(html)));
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
