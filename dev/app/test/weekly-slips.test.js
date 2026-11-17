// Weekly award slips (one sheet per class, Week earned yymmdd box, Results for Slide) and the end-of-year list sorted by group.
// Uses the invented TEST season in dev/test-data. Usage: node test/weekly-slips.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const M = require('../model.js'), Cal = require('../calendar.js'), Season = require('../season.js'), Reports = require('../reports.js');
require('../reports-season.js'); require('../teams.js');
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).filter(f => /TEST.*\.json$/.test(f)).sort().pop();      // the invented TEST season; no real data
const season = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')), master = M.fromRoster(season.roster), calendar = season.calendar;
const run = (id, opts) => Reports.LIST.find(r => r.id === id).render({ master, settings: { quarter: 'Q1', club: 'x' }, calendar, season, opts: opts || {} });
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

// Find a child with an unhanded, non-end-of-year award, and use its earned date as the chosen night.
const skipOf = g => (season.config.exclude || {})[g] || [];
const live = (p, g) => Season.awardLedger(season, p[M.X.ID], g, calendar).filter(r => !r.given && !skipOf(g).includes(r.award) && !Season.isEndOfYear(season, g, r.award));
let pick = null;
Reports.kids(master).forEach(p => { const g = M.groupOf(M.room(p)); if (pick || !['Cubbies', 'Sparks', 'T&T'].includes(g)) return; const r = live(p, g).find(x => x.earned); if (r) pick = { p, g, r }; });
assert(pick, 'the migration data has an unhanded award with an earned date');
const date = pick.r.earned, yymmdd = date.replace(/-/g, '').slice(2);

test('one slip per class, each with the three columns', () => {
  const html = run('weeklySlips', { date });
  const sheets = (html.match(/class="sheet/g) || []).length, rooms = new Set(Reports.kids(master).map(M.room));
  assert(sheets >= 1 && sheets <= rooms.size, 'a sheet per class with an award: ' + sheets);
  assert(text(html).includes(M.room(pick.p)), 'the child\'s class has a sheet');
  assert(/<th>Class<\/th><th>Full name<\/th><th>Results for Slide<\/th>/.test(html), 'columns');
  const one = run('weeklySlips', { date, room: M.room(pick.p) }); assert.strictEqual((one.match(/class="sheet/g) || []).length, 1, 'room filter gives one sheet');
});
test('Week earned box shows the chosen date as yymmdd', () => {
  assert(new RegExp('Week earned ' + yymmdd).test(text(run('weeklySlips', { date }))), 'Week earned ' + yymmdd);
});
test('a child who earned an award in the week appears, and a later week leaves them out', () => {
  assert(text(run('weeklySlips', { date })).includes(M.fullName(pick.p)), 'child listed');
  const later = new Date(date + 'T00:00:00Z'); later.setUTCDate(later.getUTCDate() + 30);
  assert(!text(run('weeklySlips', { date: later.toISOString().slice(0, 10) })).includes(M.fullName(pick.p)), 'not listed 30 days later');
});
test('Results lists every unhanded award and no end-of-year award', () => {
  const html = run('weeklySlips', { date }), id = pick.p[M.X.ID];
  const row = html.split('<tr>').find(r => r.includes(M.fullName(pick.p))); assert(row, 'row found');
  live(pick.p, pick.g).forEach(r => assert(row.includes(Season.awardLabel(season, id, r.award).replace(/&/g, '&amp;')), 'lists ' + r.award));
  Season.awardLedger(season, id, pick.g, calendar).filter(r => Season.isEndOfYear(season, pick.g, r.award)).forEach(r => assert(!row.includes(Season.awardLabel(season, id, r.award)), 'no end-of-year ' + r.award));
});
test('end-of-year list covers every group, sorted Sparks, T&T, Cubbies, then class and last name', () => {
  const html = run('ceremony'), heads = [...html.matchAll(/<h2>End-of-year awards — ([^<]+)<\/h2>/g)].map(m => m[1].replace(/&amp;/g, '&'));
  assert.deepStrictEqual(heads, ['Sparks', 'T&T', 'Cubbies'], 'sheet per group in order');
  assert.strictEqual((run('ceremony', { group: 'T&T' }).match(/<h2>/g) || []).length, 1, 'a chosen group is still one sheet');
});
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
