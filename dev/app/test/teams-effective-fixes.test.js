// Fixes from the 2026-11-14 Fable review of color teams (docs/reviews/REVIEW-2026-11-14-colorteams-and-print.md):
//   A2 Assign blanks / Re-draw leave a child marked "No team" alone
//   A3 Assign blanks sizes the teams by the color each child plays now (moves count), not the roster color
//   A4 a child who got a color through the move box is not "blank": Assign blanks does not write a second color
// Usage: node test/teams-effective-fixes.test.js   (invented people only)
const assert = require('assert');
const M = require('../model.js'), Teams = require('../teams.js'), Season = require('../season.js');
const { C, X } = M;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const today = '2026-10-28', Q = 'Q2', col = 'team:' + Q;
const ROOMS = ['Sparks A', 'Sparks B', 'Sparks C', 'Sparks D'];
function roster(n) {
  const m = M.emptyMaster(); m.pcCols = [C.REG, C.FIRST, C.LAST, C.ROOM, C.SELECTION];
  for (let i = 0; i < n; i++) M.addManualPerson(m, { [C.FIRST]: 'Kid' + i, [C.LAST]: 'Fam' + i, [C.ROOM]: ROOMS[i % 4], [C.SELECTION]: 'Sparks' }, today);
  return m;
}
const sparks = m => m.people.filter(p => M.isActive(p) && M.isClubber(p) && M.groupOf(M.room(p)) === 'Sparks');
const hist = (season, cal) => p => Season.colorHistory(season, String(p[X.ID]), q => M.teamOf(p, q), cal);
const cal = [{ Date: '2026-11-04', Quarter: 'Q2', Counted: '1' }, { Date: '2026-11-11', Quarter: 'Q2', Counted: '1' }, { Date: '2026-11-18', Quarter: 'Q2', Counted: '1' }];

test('A2: Assign blanks does not give a color to a child marked No team, and keeps the mark', () => {
  const m = roster(9), kids = sparks(m); M.setTeamChoice(m, kids[0], Q, M.NO_TEAM);
  const r = Teams.assign(m, Q, { rng: Teams.mulberry32(1) });
  assert.strictEqual(kids[0][col] || '', '', 'no color written'); assert.strictEqual(kids[0]['x_noteam:' + Q], '1', 'the mark stays');
  assert(!r.assigned.some(a => a.person === kids[0]), 'not in the assigned list');
  assert.strictEqual(r.assigned.length, 8);
});
test('A2: Re-draw leaves a No team child alone too, and the other eight are spread 2/2/2/2', () => {
  const m = roster(9), kids = sparks(m); M.setTeamChoice(m, kids[0], Q, M.NO_TEAM);
  Teams.assign(m, Q, { rng: Teams.mulberry32(2), redo: true });
  assert.strictEqual(kids[0][col] || '', ''); assert.strictEqual(kids[0]['x_noteam:' + Q], '1');
  const c = { Red: 0, Blue: 0, Green: 0, Yellow: 0 }; kids.slice(1).forEach(p => c[p[col]]++);
  assert.deepStrictEqual(Object.values(c).sort(), [2, 2, 2, 2], JSON.stringify(c));
});
test('A2: the To do "best choice" dry run counts neither a No team child nor writes anything', () => {
  const m = roster(9), kids = sparks(m); M.setTeamChoice(m, kids[0], Q, M.NO_TEAM);
  const r = Teams.assign(m, Q, { dry: true, rng: Teams.mulberry32(3) });
  assert(!r.assigned.some(a => a.person === kids[0])); assert(kids.every(p => !p[col]), 'a dry run writes nothing');
});
test('A3: with one child moved, a new child goes to the smallest team by what teams play now, not by roster color', () => {
  const m = roster(9), kids = sparks(m), season = Season.blank('2026-27');
  // 8 children on 2/2/2/2 by roster; the ninth is new and blank. Move one Red child to Blue: now Red 1, Blue 3, Green 2, Yellow 2.
  const cols = ['Red', 'Blue', 'Green', 'Yellow']; kids.slice(0, 8).forEach((p, i) => { p[col] = cols[i % 4]; });
  const red = kids.find(p => p[col] === 'Red'); Season.setTeamMove(season, String(red[X.ID]), Q, '2026-11-11', 'Blue', cal);
  const landed = { Red: 0, Blue: 0, Green: 0, Yellow: 0 };
  for (let seed = 1; seed <= 40; seed++) {
    kids[8][col] = ''; const r = Teams.assign(m, Q, { rng: Teams.mulberry32(seed), history: hist(season, cal) });
    landed[r.assigned[0].color]++;
  }
  assert.strictEqual(landed.Red, 40, 'Red is the smallest team now: ' + JSON.stringify(landed));
});
test('A4: a child given a color only through a move is not blank, so Assign blanks writes nothing for them', () => {
  const m = roster(9), kids = sparks(m), season = Season.blank('2026-27');
  const cols = ['Red', 'Blue', 'Green', 'Yellow']; kids.slice(0, 8).forEach((p, i) => { p[col] = cols[i % 4]; });
  Season.setTeamMove(season, String(kids[8][X.ID]), Q, '2026-11-04', 'Green', cal);      // the new child's first color, through the move box
  const r = Teams.assign(m, Q, { rng: Teams.mulberry32(5), history: hist(season, cal) });
  assert.strictEqual(r.assigned.length, 0, 'nobody to assign'); assert.strictEqual(kids[8][col] || '', '', 'no second color written');
});
test('A4: To do "Needs a color team" lists a child with no color, but not one whose color came from a move', () => {
  const Todo = require('../todo.js'), m = roster(9), kids = sparks(m), season = Season.blank('2026-27');
  const cols = ['Red', 'Blue', 'Green', 'Yellow']; kids.slice(0, 7).forEach((p, i) => { p[col] = cols[i % 4]; });      // kids[7] and kids[8] have no roster color
  Season.setTeamMove(season, String(kids[8][X.ID]), Q, '2026-11-04', 'Green', cal);
  const t = Todo.compute({ master: m, season, calendar: cal, quarter: Q, today: '2026-11-12', newIds: new Set() }), g = t.groups.find(x => /color team/.test(x.title || x.label || ''));
  assert(g, 'the color team card exists: ' + t.groups.map(x => x.id).join());
  const names = g.items.map(i => i.person && i.person[X.ID] || i.id || '').map(String);
  assert(names.includes(String(kids[7][X.ID])), 'the child with no color is listed'); assert(!names.includes(String(kids[8][X.ID])), 'the child with a moved-in color is not');
});
// ---------- A1: printed lists show the color a child plays now ----------
const R = require('../reports.js');
const kidsP = id => ({ [X.ID]: id, [C.FIRST]: id === 'k1' ? 'Mover' : 'Stayer', [C.LAST]: 'Test', [C.ROOM]: 'Sparks A', [C.SELECTION]: 'Clubber (Cubbies, Sparks & TnT only)', ['team:' + Q]: 'Red' });
const pm = { people: [kidsP('k1'), kidsP('k2')] }, ps = Season.blank('2026-27'); Season.setTeamMove(ps, 'k1', Q, '2026-11-11', 'Blue', cal);
const calFull = [{ Date: '2026-11-04', Quarter: Q, Counted: '1' }, { Date: '2026-11-11', Quarter: Q, Counted: '1' }, { Date: '2026-11-18', Quarter: Q, Counted: '1' }];
const ctx = (extra) => Object.assign({ master: pm, season: ps, calendar: calFull, settings: { quarter: Q, dates: '' }, opts: { order: 'color' } }, extra || {});
const txt = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
test('A1: the Color teams list, with no night chosen, puts a moved child on the team they play now', () => {
  const t = txt(R.LIST.find(r => r.id === 'teams').render(ctx()));
  assert(/Blue\s+Mover Test/.test(t), 'Mover is on a Blue row: ' + t.slice(0, 260)); assert(!/Red\s+Mover/.test(t), 'and not on a Red row');
});
test('A1: the coaches color list counts the moved child on the new team', () => {
  const t = txt(R.LIST.find(r => r.id === 'binderTeams').render(ctx()));
  assert(/Blue team \(1\) Test, Mover/.test(t) && /Red team \(1\) Test, Stayer/.test(t), t.slice(0, 300));
});
test('A1: a binder bundle printed after the quarter started shows the move; before it starts, the first-night colors', () => {
  const b = { name: 'x', items: [{ report: 'teams' }] };
  const during = txt(R.runBundle(ctx({ today: '2026-11-12' }), b, Q)), before = txt(R.runBundle(ctx({ today: '2026-10-20' }), b, Q));
  assert(/Blue\s+Mover/.test(during), 'during: Mover on a Blue row'); assert(/Red\s+Mover/.test(before), 'before the quarter: Mover on a Red row (a move later in the quarter does not change a page printed before it starts)');
});
test('A1: with a night chosen the sheet still follows that night, and Season.quarterColor ignores a one-night exception', () => {
  const a = R.LIST.find(r => r.id === 'attendance'), h = d => a.render(ctx({ opts: { date: d, order: 'name' } }));
  assert(/team-Red">Red\*<\/td>/.test(h('2026-11-04')) && /team-Blue">Blue\*<\/td>/.test(h('2026-11-11')), 'as of the night');
  assert.strictEqual(Season.quarterColor(ps, 'k1', Q, 'Red'), 'Blue'); assert.strictEqual(Season.quarterColor(ps, 'k2', Q, 'Red'), 'Red');
});
// ---------- merge: two leaders' moves ----------
test('merge: moves for two different children merge without a clash; two different moves for the same child are reported, not lost', () => {
  const base = Season.blank('2026-27'), mk = () => JSON.parse(JSON.stringify(base));
  const ours = mk(), theirs = mk(), clash = mk(), clash2 = mk();
  Season.setTeamMove(ours, 'k1', Q, '2026-11-04', 'Blue', cal); Season.setTeamMove(theirs, 'k2', Q, '2026-11-11', 'Green', cal);
  const ok = Season.merge3(Season.snapshot(base), ours, theirs); assert.deepStrictEqual(ok.conflicts, [], 'different children: no clash');
  assert.strictEqual(ok.season.teamMoves.k1[0].team, 'Blue'); assert.strictEqual(ok.season.teamMoves.k2[0].team, 'Green');
  Season.setTeamMove(clash, 'k1', Q, '2026-11-04', 'Blue', cal); Season.setTeamMove(clash2, 'k1', Q, '2026-11-04', 'Green', cal);
  const bad = Season.merge3(Season.snapshot(base), clash, clash2); assert(bad.conflicts.length >= 1, 'the same child moved two ways is a conflict the leader sees');
  assert(bad.conflicts.some(c => c.path && c.path[0] === 'teamMoves'), 'and it is about the moves: ' + JSON.stringify(bad.conflicts.map(c => c.path)));
});
// ---------- A11 and the validator: year label, and a move outside its quarter ----------
test('A11: New season accepts 2027-28 and 2027-2028 (shortened), and refuses a label the file checker would reject', () => {
  const s = Season.blank('2026-27');
  assert.strictEqual(Season.newSeason(s, '2027-28').year, '2027-28'); assert.strictEqual(Season.newSeason(s, ' 2027-2028 ').year, '2027-28');
  ['27-28', '2027', 'next year', ''].forEach(y => assert.throws(() => Season.newSeason(s, y), /Year like 2027-28/, 'refused: ' + y));
});
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
