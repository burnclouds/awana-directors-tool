// Cubbies achievement record (reports-season.js achievement with group Cubbies) and the pace strip staying off for Cubbies (pace.js does not support Cubbies).
// Usage: node test/cubbies-record.test.js   (uses the invented TEST season in dev/test-data)
const assert = require('assert'), fs = require('fs'), path = require('path');
const M = require('../model.js'), Cal = require('../calendar.js'), Season = require('../season.js'), Reports = require('../reports.js'), Pace = require('../pace.js');
require('../reports-season.js');
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).filter(f => /TEST.*\.json$/.test(f)).sort().pop();      // the invented TEST season; no real data
const season = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')), master = M.fromRoster(season.roster), calendar = season.calendar;
const ach = opts => Reports.LIST.find(r => r.id === 'achievement').render({ master, settings: { quarter: 'Q1', club: 'x' }, calendar, season, opts });
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const cub = master.people.filter(p => M.isActive(p) && M.isClubber(p) && M.groupOf(M.room(p)) === 'Cubbies');
test('Cubbies have an achievement record: one sheet per child with name, Apple Acres, Trail and six units', () => {
  assert(cub.length > 0, 'test data has Cubbies');
  const html = ach({ group: 'Cubbies' });
  assert(/Cubbies Achievement Record/.test(html));
  assert(!/No children in/.test(html));
  const one = ach({ group: 'Cubbies', kid: cub[0][M.X.ID] });
  assert(one.includes(M.fullName(cub[0])));
  ['Apple Acres', 'Trail', 'Unit 1', 'Unit 6'].forEach(l => assert(one.includes(l), l));
  assert(/Book:/.test(one));      // the record sheet's header line (was "Handbook:" on the old record)
});
test('Sparks and T&T records are still produced', () => {
  assert(/Sparks Achievement Record/.test(ach({ group: 'Sparks' })));
  assert(/T&amp;T Achievement Record|T&T Achievement Record/.test(ach({ group: 'T&T' })));
});
test('Pace does not support Cubbies, so no pace row exists for a Cubbies child', () => {
  assert.strictEqual(Pace.kid({ master, season, calendar }, cub[0]), null);
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
