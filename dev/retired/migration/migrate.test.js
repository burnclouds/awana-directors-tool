// Tests for the one-time Sheet -> season file migration (tools/build-season.js).
// Usage: node test/migrate.test.js [records.json roster.csv calendar.csv]   (the real-data check runs when all three are given)
const fs = require('fs'), assert = require('assert');
const M = require('../../app/model.js'), Calendar = require('../../app/calendar.js'), Season = require('../../app/season.js');
const { build } = require('./build-season.js');
const { C } = M;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

const master = M.emptyMaster();
master.pcCols = [C.REG, C.FIRST, C.LAST, C.ROOM, C.SELECTION];
const kid = (first, room) => M.addManualPerson(master, { [C.REG]: '100', [C.FIRST]: first, [C.LAST]: 'Test', [C.ROOM]: room, [C.SELECTION]: 'Clubber' }, '2026-10-28');
kid('Ann', 'Sparks A'); kid('Bo', 'T&T Boys (Group A)');
const cal = [{ Date: '2026-09-09', Type: 'Club night', Quarter: 'Q1', 'No Club': '' }, { Date: '2026-09-16', Type: 'Club night', Quarter: 'Q1', 'No Club': '' }];
const records = {
  attendance: { '2026-09-09': { '100_Ann_Test': { a: 1, h: 1 }, '999_Ghost_Kid': { a: 1 } }, '2026-09-30': { '100_Bo_Test': { a: 1 } } },
  handbooks: { '100_Ann_Test': 'HG 260916', '999_Ghost_Kid': 'WR' },
  games: { '2026-09-09': { Sparks: { Red: { place: 1, spirit: 3 } } } },
  awards: { '2026-09-16': { '100_Ann_Test': ['Start Zone 1'], '100_Bo_Test': ['Start Zone 1', 'Start Zone 2'] } },
};
const r = build(records, master, cal, '2026-27');

test('records land in the season file keyed by Unique ID', () => {
  assert.deepStrictEqual(r.season.attendance['2026-09-09']['100_Ann_Test'], { a: 1, h: 1 });
  assert.deepStrictEqual(r.season.games['2026-09-09'].Sparks.Red, { place: 1, spirit: 3 });
  assert.deepStrictEqual(r.season.awards['2026-09-16']['100_Bo_Test'], ['Start Zone 1', 'Start Zone 2']);
  assert.strictEqual(r.season.handbooks['100_Ann_Test'], 'HG 260916');
  assert.strictEqual(r.season.year, '2026-27');
});
test('Unique IDs that are not on the roster are reported, not silently dropped', () => {
  assert.deepStrictEqual(r.report.unknownIds, ['999_Ghost_Kid']);
  assert.deepStrictEqual(r.season.attendance['2026-09-09']['999_Ghost_Kid'], { a: 1 });
});
test('dates that are not club nights on the calendar are reported', () => {
  assert.deepStrictEqual(r.report.offCalendar, ['2026-09-30']);
});
test('the result is a valid season file that round-trips', () => {
  assert.deepStrictEqual(Season.fromJson(Season.toJson(r.season)), r.season);
});

if (process.argv[4]) {
  test('real Sheet history: 7 Q1 nights (75 present on night 1, 61 on night 7), 96 game values, every ID on the roster', () => {
    const rec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const real = M.loadMaster(fs.readFileSync(process.argv[3], 'utf8'), '2026-10-28');
    const calendar = Calendar.load(fs.readFileSync(process.argv[4], 'utf8'));
    const out = build(rec, real, calendar, '2026-27');
    const dates = Object.keys(out.season.attendance).sort();
    assert.strictEqual(dates.length, 7);
    assert.strictEqual(Object.keys(out.season.attendance[dates[0]]).filter(id => out.season.attendance[dates[0]][id].a).length, 75);
    assert.strictEqual(Object.keys(out.season.attendance[dates[6]]).filter(id => out.season.attendance[dates[6]][id].a).length, 61);
    const games = Object.values(out.season.games).reduce((n, d) => n + Object.values(d).reduce((m, g) => m + Object.values(g).reduce((k, t) => k + Object.keys(t).length, 0), 0), 0);
    assert.strictEqual(games, 96);
    assert.deepStrictEqual(out.report.offCalendar, []);
    console.log('       unknown IDs:', out.report.unknownIds.length, '| awards entries:', Object.values(out.season.awards).reduce((n, d) => n + Object.values(d).reduce((m, l) => m + l.length, 0), 0));
    assert.deepStrictEqual(out.report.unknownIds, []);
  });
}
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
