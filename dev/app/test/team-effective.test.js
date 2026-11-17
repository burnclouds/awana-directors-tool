// Effective color (flags 5, 6, 9 of Mike's 2026-11-13 file): a child moved to Green from the first club night of Q2 never played the roster's Red in Q2, so the year grid, the "Repeated colors" check,
// the team planner and the Roster column must use the EFFECTIVE color (the latest move), not the roster default alone. A mid-quarter move keeps the roster color for the nights before it.
// Invented people only. Usage: node test/team-effective.test.js
const assert = require('assert');
const M = require('../model.js'), S = require('../season.js'), Teams = require('../teams.js'), TeamPlan = require('../teamplan.js');
const { C, X } = M;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const night = (d, q) => ({ Date: d, Type: 'Club', Quarter: q, 'No Club': '' });
const Q1 = ['2026-09-09', '2026-09-16'], Q2 = ['2026-10-28', '2026-11-04', '2026-11-11'];
const cal = Q1.map(d => night(d, 'Q1')).concat(Q2.map(d => night(d, 'Q2')));
const kid = (id, first, over) => Object.assign({ [X.ID]: id, [C.FIRST]: first, [C.LAST]: 'Test', [C.ROOM]: 'Sparks A', [C.SELECTION]: 'Clubber (Cubbies, Sparks & TnT only)', [X.ACTIVE]: '1' }, over || {});
const hist = (s, p) => S.colorHistory(s, String(p[X.ID]), q => M.teamOf(p, q), cal);

// ---- the history says what was played ----
test('colorHistory: a move on or before the first night of the quarter replaces the roster color (replaced), and end is the latest move', () => {
  const s = S.blank('2026-27'); S.setTeamMove(s, 'k1', 'Q2', '2026-10-28', 'Green');
  const h = S.colorHistory(s, 'k1', () => 'Red', cal);
  assert.strictEqual(h.replaced.Q2, true); assert.strictEqual(h.end.Q2, 'Green'); assert.deepStrictEqual(h.list.Q2, [{ from: '2026-10-28', team: 'Green' }]); assert.strictEqual(h.replaced.Q1, false); assert.strictEqual(h.end.Q1, '');
});
test('colorHistory: a mid-quarter move leaves the roster color played (not replaced)', () => {
  const s = S.blank('2026-27'); S.setTeamMove(s, 'k1', 'Q2', '2026-11-04', 'Yellow');
  const h = S.colorHistory(s, 'k1', () => 'Red', cal); assert.strictEqual(h.replaced.Q2, false); assert.strictEqual(h.end.Q2, 'Yellow');
});

// ---- Teams.effective ----
test('Teams.effective: the color is the latest move; played drops the roster color only when it was replaced from the first night', () => {
  const p = kid('k1', 'Ann', { 'team:Q2': 'Red' }), s = S.blank('2026-27');
  assert.deepStrictEqual(Teams.effective(p, 'Q2', hist(s, p)), { color: 'Red', played: ['Red'], replaced: false, moved: [] }, 'no moves: the roster color');
  S.setTeamMove(s, 'k1', 'Q2', '2026-10-28', 'Green'); let e = Teams.effective(p, 'Q2', hist(s, p));
  assert.strictEqual(e.color, 'Green'); assert.deepStrictEqual(e.played, ['Green']); assert.strictEqual(e.replaced, true); assert.deepStrictEqual(e.moved, [], 'a move from the first night is the quarter color: no "moved" marker');
  S.setTeamMove(s, 'k1', 'Q2', '2026-11-11', 'Yellow'); e = Teams.effective(p, 'Q2', hist(s, p));
  assert.strictEqual(e.color, 'Yellow'); assert.deepStrictEqual(e.played, ['Green', 'Yellow']); assert.deepStrictEqual(e.moved, [{ from: '2026-11-11', team: 'Yellow' }]);
  const q = kid('k2', 'Bo', { 'team:Q2': 'Red' }); S.setTeamMove(s, 'k2', 'Q2', '2026-11-04', 'Blue'); e = Teams.effective(q, 'Q2', hist(s, q));
  assert.strictEqual(e.color, 'Blue'); assert.deepStrictEqual(e.played, ['Red', 'Blue']); assert.deepStrictEqual(e.moved, [{ from: '2026-11-04', team: 'Blue' }]);
  assert.deepStrictEqual(Teams.effective(p, 'Q2', undefined), { color: 'Red', played: ['Red'], replaced: false, moved: [] }, 'without a history it is the roster color');
});

// ---- the repeated-colors check (flag 9) ----
test('audit: a child moved to Green from the first night of Q2 is not reported as repeating Red, and counts on Green', () => {
  const m = M.emptyMaster(); m.pcCols = [C.REG, C.FIRST, C.LAST, C.ROOM, C.SELECTION];
  const a = M.addManualPerson(m, { [C.FIRST]: 'Ann', [C.LAST]: 'Test', [C.ROOM]: 'Sparks A', [C.SELECTION]: 'Clubber' }, '2026-10-01'); a['team:Q1'] = 'Blue'; a['team:Q2'] = 'Red';
  const s = S.blank('2026-27'), id = String(a[X.ID]), history = p => S.colorHistory(s, String(p[X.ID]), q => M.teamOf(p, q), cal);
  // Red was played in Q3 by a move: with the roster default alone that looks like a repeat of Red in Q2
  a['team:Q3'] = 'Red';
  let r = Teams.audit(m, 'Q3', { history }); assert.strictEqual(r.repeats.length, 1, 'before the move: Red in Q3 repeats Red from Q2');
  S.setTeamMove(s, id, 'Q2', '2026-10-28', 'Green');
  r = Teams.audit(m, 'Q3', { history }); assert.strictEqual(r.repeats.length, 0, 'after the move she never played Red in Q2, so Red in Q3 is not a repeat');
  r = Teams.audit(m, 'Q2', { history }); assert.strictEqual(r.groups.Sparks.counts.Green, 1, 'counted on Green in Q2'); assert.strictEqual(r.groups.Sparks.counts.Red, 0);
  a['team:Q3'] = 'Green'; r = Teams.audit(m, 'Q3', { history }); assert.strictEqual(r.repeats.length, 1, 'Green in Q3 IS a repeat of the Green she played in Q2');
});

// ---- the planner must not forbid a color that was replaced ----
test('planner: the replaced roster color is not forbidden, the moved-to color is', () => {
  const m = M.emptyMaster(); m.pcCols = [C.REG, C.FIRST, C.LAST, C.ROOM, C.SELECTION];
  const kids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(n => M.addManualPerson(m, { [C.FIRST]: n, [C.LAST]: 'Test', [C.ROOM]: 'Sparks A', [C.SELECTION]: 'Clubber' }, '2026-10-01'));
  kids.forEach((p, i) => { p['team:Q1'] = ['Red', 'Blue', 'Green', 'Yellow'][i % 4]; p['team:Q2'] = ['Blue', 'Green', 'Yellow', 'Red'][i % 4]; });
  const s = S.blank('2026-27'), target = kids[0];      // Q1 Red, Q2 Blue
  S.setTeamMove(s, String(target[X.ID]), 'Q2', '2026-10-28', 'Green');      // she was never on Blue in Q2: Green instead
  const history = p => S.colorHistory(s, String(p[X.ID]), q => M.teamOf(p, q), cal);
  const forb = Teams.forbiddenFor(target, 'Q3', history(target));
  assert(forb.has(Teams.COLORS.indexOf('Red')) && forb.has(Teams.COLORS.indexOf('Green')), 'Red (Q1) and Green (the Q2 move) are forbidden in Q3');
  assert(!forb.has(Teams.COLORS.indexOf('Blue')), 'Blue was the replaced roster color of Q2: she never played it');
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
