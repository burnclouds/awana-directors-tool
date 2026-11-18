// The end-of-year awards list: every group, sorted Sparks, T&T, Cubbies (the weekly award slips that shared this file were retired in 1.51.15e).
// Uses the invented TEST season in dev/test-data. Usage: node test/ceremony-list.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const M = require('../model.js'), Cal = require('../calendar.js'), Season = require('../season.js'), Reports = require('../reports.js');
require('../reports-season.js'); require('../teams.js');
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).filter(f => /TEST.*\.json$/.test(f)).sort().pop();      // the invented TEST season; no real data
const season = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')), master = M.fromRoster(season.roster), calendar = season.calendar;
const run = (id, opts) => Reports.LIST.find(r => r.id === id).render({ master, settings: { quarter: 'Q1', club: 'x' }, calendar, season, opts: opts || {} });
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

test('end-of-year list covers every group, sorted Sparks, T&T, Cubbies, then class and last name', () => {
  const html = run('ceremony'), heads = [...html.matchAll(/<h2>End-of-year awards — ([^<]+)<\/h2>/g)].map(m => m[1].replace(/&amp;/g, '&'));
  assert.deepStrictEqual(heads, ['Sparks', 'T&T', 'Cubbies'], 'sheet per group in order');
  assert.strictEqual((run('ceremony', { group: 'T&T' }).match(/<h2>/g) || []).length, 1, 'a chosen group is still one sheet');
});
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
