// N3 / B8: the attendance sheet's Night box and the quarter. Invented children and nights only.
//  1. A Night from ANOTHER quarter (the box defaults to the latest night, usually a later quarter) prints the team of the sheet's own quarter and no "*" from the other quarter.
//  2. A one-night fill-in (Season.setNightTeam):
//     - on a sheet for a CHOSEN night it is that night's team (the sheet says "Teams as of <night>"): kept on purpose, pinned here;
//     - on a quarter-long binder sheet (the Binders button / a bundle before the quarter starts is "as of the first night" only because the app picked it) it must not set the printed team:
//       fixed in reports.js 1.15.0 (opts.asOfFirst); a move still counts.
// Usage: node test/attendance-quarter-night.test.js
const assert = require('assert');
const M = require('../model.js'), S = require('../season.js'), R = require('../reports.js');
const { C, X } = M;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const night = (d, q) => ({ Date: d, Type: 'Club', Quarter: q, 'No Club': '' });
const Q2 = ['2026-10-28', '2026-11-04', '2026-11-11', '2026-11-18'], Q3 = ['2027-01-06', '2027-01-13', '2027-01-20'];
const calendar = Q2.map(d => night(d, 'Q2')).concat(Q3.map(d => night(d, 'Q3')));
const kid = (id, first, last, q2, q3) => { const p = {}; p[X.ID] = id; p[C.FIRST] = first; p[C.LAST] = last; p[C.ROOM] = 'Sparks A'; p[C.SELECTION] = 'Clubber (Cubbies, Sparks & TnT only)'; p['team:Q2'] = q2; p['team:Q3'] = q3; return p; };
const fresh = () => ({ master: { people: [kid('k1', 'Ada', 'Moss', 'Red', 'Green'), kid('k2', 'Ben', 'Pike', 'Blue', 'Yellow')] }, season: S.blank('2026-27') });
const attendance = R.LIST.find(r => r.id === 'attendance');
const sheet = (x, quarter, opts) => attendance.render({ master: x.master, season: x.season, calendar, settings: { quarter, club: 'Test Club' }, opts: Object.assign({ room: 'Sparks A' }, opts) });
// The team cell of a child's row: [text without the star, has star].
const cell = (html, name) => { const row = new RegExp('<td class="name[^"]*">' + name + '</td><td class="teamcol[^"]*">([^<]*)</td>').exec(html); assert(row, name + ' has a row with a team cell'); return { team: row[1].replace('*', ''), star: row[1].includes('*') }; };

// ---------- 1. a Night from another quarter ----------
test('Q2 sheet with a Q3 night chosen: the Q2 team, no star, the same page as with no night', () => {
  const x = fresh(), withNight = sheet(x, 'Q2', { date: '2027-01-13' }), none = sheet(x, 'Q2', { date: '' });
  assert.deepStrictEqual(cell(withNight, 'Ada Moss'), { team: 'Red', star: false }); assert.deepStrictEqual(cell(withNight, 'Ben Pike'), { team: 'Blue', star: false });
  assert.strictEqual(withNight, none, 'a night outside the quarter changes nothing on the sheet');
  assert(!/Teams as of/.test(withNight), 'the note does not claim "as of" a night of another quarter'); assert(/Q2 teams/.test(withNight));
  Q2.forEach(d => assert(withNight.includes('>' + M.md(d) + '<'), M.md(d) + ' is a column')); Q3.forEach(d => assert(!withNight.includes('>' + M.md(d) + '<'), M.md(d) + ' is not a column'));
});
test('Q2 sheet with a Q3 night chosen: a move made in Q3 neither changes the Q2 team nor puts a star on the Q2 sheet', () => {
  const x = fresh(); S.setTeamMove(x.season, 'k1', 'Q3', '2027-01-13', 'Yellow', calendar);
  const h = sheet(x, 'Q2', { date: '2027-01-13' }); assert.deepStrictEqual(cell(h, 'Ada Moss'), { team: 'Red', star: false });
  assert.strictEqual(h, sheet(x, 'Q2', { date: '' }));
  // and the same child on the Q3 sheet, at that night, is on the new team with a star (the star belongs to the quarter of the sheet)
  assert.deepStrictEqual(cell(sheet(x, 'Q3', { date: '2027-01-13' }), 'Ada Moss'), { team: 'Yellow', star: true });
});
test('Q2 sheet with a Q3 night chosen: a Q2 move still counts (latest in the quarter) and keeps its star', () => {
  const x = fresh(); S.setTeamMove(x.season, 'k1', 'Q2', '2026-11-11', 'Blue', calendar);
  assert.deepStrictEqual(cell(sheet(x, 'Q2', { date: '2027-01-13' }), 'Ada Moss'), { team: 'Blue', star: true });
  assert.deepStrictEqual(cell(sheet(x, 'Q2', { date: '2027-01-13' }), 'Ben Pike'), { team: 'Blue', star: false });
});
test('a night inside the quarter still means "teams as of that night" (before and from the move)', () => {
  const x = fresh(); S.setTeamMove(x.season, 'k1', 'Q2', '2026-11-11', 'Blue', calendar);
  assert.deepStrictEqual(cell(sheet(x, 'Q2', { date: '2026-11-04' }), 'Ada Moss'), { team: 'Red', star: true });
  assert.deepStrictEqual(cell(sheet(x, 'Q2', { date: '2026-11-11' }), 'Ada Moss'), { team: 'Blue', star: true }); assert(/Teams as of 2026-11-11/.test(sheet(x, 'Q2', { date: '2026-11-11' })));
});

// ---------- 2. one-night fill-in ----------
test('DESIGN (pinned): a sheet for a chosen night shows that night\'s fill-in team, and the other nights show the quarter team', () => {
  const x = fresh(); S.setMark(x.season, '2026-11-04', 'k1', 'a', 1); S.setNightTeam(x.season, '2026-11-04', 'k1', 'Yellow');
  assert.strictEqual(cell(sheet(x, 'Q2', { date: '2026-11-04' }), 'Ada Moss').team, 'Yellow');
  assert.strictEqual(cell(sheet(x, 'Q2', { date: '2026-11-11' }), 'Ada Moss').team, 'Red');
  assert.strictEqual(cell(sheet(x, 'Q2', { date: '' }), 'Ada Moss').team, 'Red', 'with no night chosen the fill-in does not count');
  assert.strictEqual(cell(sheet(x, 'Q2', { date: '2026-11-04' }), 'Ada Moss').star, false, 'a fill-in is not a team change: no star');
});
const bundle = (x, today, room) => R.runBundle({ master: x.master, season: x.season, calendar, settings: { quarter: 'Q2', club: 'Test Club' }, today, opts: {} }, { name: 'B', items: [{ report: 'attendance', room }] }, 'Q2');
test('FIXED: a binder printed before the quarter starts ("as of the first night") ignores a fill-in recorded on that first night', () => {
  const x = fresh(); S.setMark(x.season, '2026-10-28', 'k1', 'a', 1); S.setNightTeam(x.season, '2026-10-28', 'k1', 'Yellow');
  const h = bundle(x, '2026-10-20', 'Sparks A'); assert.strictEqual(cell(h, 'Ada Moss').team, 'Red', 'the quarter team, not the first night\'s fill-in');
});
test('a binder printed before the quarter starts still counts a move dated the first night', () => {
  const x = fresh(); S.setTeamMove(x.season, 'k1', 'Q2', '2026-10-28', 'Blue', calendar);
  assert.deepStrictEqual(cell(bundle(x, '2026-10-20', 'Sparks A'), 'Ada Moss'), { team: 'Blue', star: true });
});
test('a binder printed mid-quarter shows the color the child plays now and ignores fill-ins', () => {
  const x = fresh(); S.setMark(x.season, '2026-11-04', 'k1', 'a', 1); S.setNightTeam(x.season, '2026-11-04', 'k1', 'Yellow'); S.setTeamMove(x.season, 'k2', 'Q2', '2026-11-11', 'Green', calendar);
  const h = bundle(x, '2026-11-12', 'Sparks A'); assert.strictEqual(cell(h, 'Ada Moss').team, 'Red'); assert.deepStrictEqual(cell(h, 'Ben Pike'), { team: 'Green', star: true });
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
