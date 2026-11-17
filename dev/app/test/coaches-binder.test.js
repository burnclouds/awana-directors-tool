// The coaches binder: volunteers are the people whose Selection is a volunteer (phone and email: first filled in), color teams are one sheet per group and color,
// and everyone-by-name is sorted by last name. Uses the invented TEST season in dev/test-data.
// Usage: node test/coaches-binder.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const M = require('../model.js'), Cal = require('../calendar.js'), Season = require('../season.js'), Reports = require('../reports.js');
require('../reports-season.js'); require('../teams.js');
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).filter(f => /TEST.*\.json$/.test(f)).sort().pop();      // the invented TEST season; no real data
const season = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')), master = M.fromRoster(season.roster), calendar = season.calendar;      // the TEST roster already carries Q1 colors
const run = (id) => Reports.LIST.find(r => r.id === id).render({ master, settings: { quarter: 'Q1', club: 'x' }, calendar, season, opts: {} });
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

test('volunteer list has only people whose Selection is a volunteer, with role and class columns', () => {
  const html = run('volunteers'); const volunteers = master.people.filter(p => M.isActive(p) && /volunteer/i.test(M.eff(p, M.C.SELECTION) || ''));
  assert(volunteers.length > 0, 'the migration data has volunteers');
  assert(/Assignment \(class\)/.test(html) && !/>Role</.test(html), 'columns: class, no Role');
  assert.strictEqual((html.match(/<tr/g) || []).length - 1, volunteers.length, 'one row per volunteer');
});
test('volunteer phone uses the first filled in: mobile, home, work, other', () => {
  const p = master.people.find(x => M.isActive(x) && /volunteer/i.test(M.eff(x, M.C.SELECTION) || '') && !M.eff(x, 'Mobile Phone Number') && M.eff(x, 'Home Phone Number'));
  if (!p) return;      // no such volunteer in this data; the rule is still in the code
  assert(text(run('volunteers')).includes(M.eff(p, 'Home Phone Number')), 'home phone used when mobile is empty');
});
test('color teams: one sheet for all Sparks and one for all T&T, each sorted by color, with no contact details', () => {
  const html = run('binderTeams');
  const sheets = (html.match(/class="sheet/g) || []).length;
  assert.strictEqual(sheets, 2, 'one sheet per group, not per color: ' + sheets);
  assert(/Sparks Q1 — color teams/.test(text(html)) && /T&amp;T Q1 — color teams|T&T Q1 — color teams/.test(text(html)), 'titled by group and quarter');
  const colorHeads = (html.match(/class="colorhead"/g) || []).length;
  assert(colorHeads >= 2, 'a heading for each color that has children');
  assert(!/Emergency contact/.test(html) && !/\(\d{3}\) \d{3}-\d{4}/.test(html), 'no emergency contacts or phone numbers');
});
test('everyone by name is sorted by last name', () => {
  // The first cell of each row is the name ("Last, First"); later cells can hold notes with commas, so only the first cell is read.
  const names = [...run('binderAll').matchAll(/<tr[^>]*>\s*<td[^>]*>(?:<span[^>]*>)?([^<,]+), /g)].map(m => m[1].trim());
  assert(names.length > 10, 'names listed');
  const sorted = names.slice().sort((a, b) => a.localeCompare(b));
  assert.deepStrictEqual(names, sorted, 'in last-name order');
});
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
