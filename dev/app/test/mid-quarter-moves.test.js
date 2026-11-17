// Mid-quarter team moves (docs/superpowers/specs/2026-11-12-mid-quarter-moves.md): progress stays the same; game points are tracked by date, so a clubber gets the points for each date
// they attended on whatever team they were on that night. A color played by a move counts as played for the no-repeat rule; when all four are used up (a Quarter 1 move leaves
// nothing new for Quarter 4) the child may have the color they spent the fewest nights on. Invented people only. Usage: node test/mid-quarter-moves.test.js
const assert = require('assert');
const M = require('../model.js'), S = require('../season.js'), Teams = require('../teams.js'), TeamPlan = require('../teamplan.js'), Rp = require('../reports.js'); require('../reports-season.js');
const { C, X } = M;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const night = (d, q) => ({ Date: d, Type: 'Club', Quarter: q, 'No Club': '' });
const clone = o => JSON.parse(JSON.stringify(o));

// ---------- points follow the night ----------
// Q2 nights: Green wins the first three (place 1 = 3 points, spirit 1), Blue wins the later ones (place 1, spirit 2); the child is Green by the roster and moves to Blue from 11/11.
const NIGHTS = ['2026-10-28', '2026-11-04', '2026-11-11', '2026-11-18', '2026-12-02'], cal = NIGHTS.map(d => night(d, 'Q2'));
function club() {
  const s = S.blank('2026-27');
  NIGHTS.forEach((d, i) => { const early = i < 2; S.setGame(s, d, 'Sparks', 'Green', { place: early ? 1 : 4, spirit: early ? 1 : 0 }); S.setGame(s, d, 'Sparks', 'Blue', { place: early ? 4 : 1, spirit: early ? 0 : 2 }); });
  return s;
}
const pts = (s, id = 'k1', dflt = 'Green') => { const g = S.kidGamePoints(s, id, 'Sparks', S.teamResolver(s, id, () => dflt, () => 'Q2'), cal).Q2; return g.place + g.spirit; };
const attend = (s, dates, id = 'k1') => dates.forEach(d => S.setMark(s, d, id, 'a', 1));

test('points follow the night: Green for the nights before the move, Blue from the move date on, and the earlier nights do not change when the move is added', () => {
  const s = club(); attend(s, NIGHTS); const before = pts(s);      // all five on Green: 3+1 + 3+1 + 0 + 0 + 0 = 8
  assert.strictEqual(before, 8); S.setTeamMove(s, 'k1', 'Q2', '2026-11-11', 'Blue');
  assert.strictEqual(pts(s), (3 + 1) + (3 + 1) + (3 + 2) + (3 + 2) + (3 + 2), 'two nights Green, three Blue');
  const early = S.kidGamePoints(s, 'k1', 'Sparks', S.teamResolver(s, 'k1', () => 'Green', () => 'Q2'), cal.slice(0, 2)).Q2; assert.deepStrictEqual(early, { place: 6, spirit: 2 }, 'the first two nights are exactly as before');
});
test('only attended nights count: a night missed gives no points whichever team they were on', () => {
  const s = club(); attend(s, ['2026-10-28', '2026-11-18']); S.setTeamMove(s, 'k1', 'Q2', '2026-11-11', 'Blue');
  assert.strictEqual(pts(s), (3 + 1) + (3 + 2));
});
test('a move dated on a night they missed still takes effect: the first night they attend after it scores for the new team', () => {
  const s = club(); attend(s, ['2026-11-04', '2026-11-18']); S.setTeamMove(s, 'k1', 'Q2', '2026-11-11', 'Blue');      // 11/11 missed
  assert.strictEqual(S.teamOn(s, 'k1', '2026-11-11', 'Q2', 'Green'), 'Blue'); assert.strictEqual(pts(s), (3 + 1) + (3 + 2));
});
test('the move day itself counts for the new team', () => {
  const s = club(); attend(s, ['2026-11-11']); S.setTeamMove(s, 'k1', 'Q2', '2026-11-11', 'Blue'); assert.strictEqual(pts(s), 3 + 2);
});
test('a backdated move recalculates only the nights from its date, and removing it restores the earlier totals', () => {
  const s = club(); attend(s, NIGHTS); const base = pts(s);
  S.setTeamMove(s, 'k1', 'Q2', '2026-11-11', 'Blue'); const late = pts(s);      // entered late for 11/11: only 11/11 on is recalculated
  S.setTeamMove(s, 'k1', 'Q2', '2026-10-28', 'Blue'); assert.strictEqual(base, 8); assert.strictEqual(late, 4 + 4 + 5 + 5 + 5); assert.strictEqual(pts(s), 0 + 0 + 5 + 5 + 5, 'dated back to the first night: Blue lost the first two nights, so they now score nothing');
  S.removeTeamMove(s, 'k1', 'Q2', '2026-10-28'); assert.strictEqual(pts(s), late, 'removing the backdated move goes back to the 11/11 move'); S.removeTeamMove(s, 'k1', 'Q2', '2026-11-11'); assert.strictEqual(pts(s), base, 'and removing that restores the original totals');
});
test('two moves in one quarter: each night uses the latest move on or before it', () => {
  const s = club(); attend(s, NIGHTS); S.setTeamMove(s, 'k1', 'Q2', '2026-11-04', 'Blue'); S.setTeamMove(s, 'k1', 'Q2', '2026-11-18', 'Green');
  assert.deepStrictEqual(NIGHTS.map(d => S.teamOn(s, 'k1', d, 'Q2', 'Green')), ['Green', 'Blue', 'Blue', 'Green', 'Green']);
});
test('a one-night exception beats a move for that night only', () => {
  const s = club(); attend(s, NIGHTS); S.setTeamMove(s, 'k1', 'Q2', '2026-11-04', 'Blue'); S.setNightTeam(s, '2026-11-18', 'k1', 'Yellow');
  assert.deepStrictEqual(NIGHTS.map(d => S.teamOn(s, 'k1', d, 'Q2', 'Green')), ['Green', 'Blue', 'Blue', 'Yellow', 'Blue']);
});
test('team standings are the same before and after a move: a move changes who gets individual points, not what a team scored', () => {
  const s = club(); attend(s, NIGHTS); const a = JSON.stringify(S.standings(s, 'Sparks', 'Q2', cal)); S.setTeamMove(s, 'k1', 'Q2', '2026-11-11', 'Blue'); assert.strictEqual(JSON.stringify(S.standings(s, 'Sparks', 'Q2', cal)), a);
});
test('progress, awards, attendance, given and handbooks are identical before and after a move', () => {
  const s = club(); attend(s, NIGHTS); s.progress.k1 = { HG: { 'R.1': '2026-10-28' } }; s.handbooks.k1 = 'HG 260916'; s.given.k1 = { 'HG Rank Emblem': '2026-11-04' };
  const before = S.snapshot(s); S.setTeamMove(s, 'k1', 'Q2', '2026-11-11', 'Blue'); const after = S.snapshot(s);
  ['progress', 'handbooks', 'attendance', 'awards', 'given', 'givenNoDate', 'received', 'doneBooks', 'games'].forEach(k => assert.deepStrictEqual(after[k], before[k], k + ' unchanged'));
  assert.notDeepStrictEqual(after.teamMoves, before.teamMoves, 'only the moves changed');
});
test('a move is one History entry and undoes cleanly', () => {
  const s = club(), before = S.snapshot(s); S.setTeamMove(s, 'k1', 'Q2', '2026-11-11', 'Blue'); const e = S.record(s, before, { separate: true, now: '2026-11-12T20:00:00Z' });
  assert(e && /Team moves/.test(e.label), e && e.label); assert.deepStrictEqual(S.snapshot(S.at(s, 0)).teamMoves, {});
});

// ---------- the date checks ----------
test('a move date outside the quarter, or before its first night, is refused with the reason; one inside is accepted (also backdated)', () => {
  const s = club();
  assert.throws(() => S.setTeamMove(s, 'k1', 'Q2', '2026-10-21', 'Blue', cal), /not in Q2 \(club nights 10\/28 to 12\/2\)/); assert.throws(() => S.setTeamMove(s, 'k1', 'Q2', '2027-01-20', 'Blue', cal), /Pick a night in Q2/);
  assert.throws(() => S.setTeamMove(s, 'k1', 'Q2', '2026-13-40', 'Blue', cal)); assert.throws(() => S.setTeamMove(s, 'k1', 'Q2', '2026-11-11', 'Purple', cal), /Red, Blue, Green or Yellow/);
  S.setTeamMove(s, 'k1', 'Q2', '2026-10-28', 'Blue', cal); S.setTeamMove(s, 'k1', 'Q2', '2026-11-25', 'Red', cal); assert.strictEqual(S.movesOf ? 0 : 0, 0); assert.strictEqual(s.teamMoves.k1.length, 2, 'the first night and a date with no club night are both fine');
});

// ---------- the readable line ----------
test('the team story reads "Green, then Blue from 11/4" and is empty for a child who never moved', () => {
  const s = club(); S.setTeamMove(s, 'k1', 'Q2', '2026-11-04', 'Blue'); S.setTeamMove(s, 'k1', 'Q2', '2026-11-18', 'Red');
  assert.strictEqual(S.teamStory(s, 'k1', 'Q2', 'Green'), 'Green, then Blue from 11/4, then Red from 11/18'); assert.strictEqual(S.teamStory(s, 'k2', 'Q2', 'Green'), ''); assert.strictEqual(S.teamStory(s, 'k1', 'Q3', 'Green'), '');
});

// ---------- the color history (no-repeat, Quarter 4) ----------
test('colorHistory: the colors moved to in each quarter, and the nights attended on each color (by the team on that night)', () => {
  const s = club(); attend(s, NIGHTS); S.setTeamMove(s, 'k1', 'Q2', '2026-11-11', 'Blue');
  const h = S.colorHistory(s, 'k1', () => 'Green', cal); assert.deepStrictEqual(h.moves, { Q1: [], Q2: ['Blue'], Q3: [], Q4: [] }); assert.deepStrictEqual(h.time, { Green: 2, Blue: 3 });
  const none = S.colorHistory(s, 'nobody', () => 'Red', cal); assert.deepStrictEqual(none.moves, { Q1: [], Q2: [], Q3: [], Q4: [] }); assert.deepStrictEqual(none.time, {}); assert.deepStrictEqual(none.end, { Q1: '', Q2: '', Q3: '', Q4: '' }, 'no moves: no effective color of its own');
});
test('forbidFinal: a moved-to color in another quarter is forbidden, like a roster color', () => {
  const hist = { moves: { Q1: ['Blue'], Q2: [], Q3: [], Q4: [] }, time: {} };
  assert.deepStrictEqual([...Teams.forbidFinal(new Set([0]), hist, 'Q3')].sort(), [0, 1]); assert.deepStrictEqual([...Teams.forbidFinal(new Set([0]), hist, 'Q1')], [0], 'the quarter being filled is not counted against itself');
});
test('forbidFinal: with all four used up, only the color played the fewest nights is allowed; equal time (or no history) allows anything, as before', () => {
  const four = () => new Set([0, 1, 2, 3]), hist = { moves: { Q1: ['Blue'], Q2: [], Q3: [], Q4: [] }, time: { Red: 2, Blue: 5, Green: 6, Yellow: 6 } };
  assert.deepStrictEqual([...Teams.forbidFinal(four(), hist, 'Q4')].sort(), [1, 2, 3], 'Red (index 0) is the only allowed color');
  assert.deepStrictEqual([...Teams.forbidFinal(four(), { moves: {}, time: { Red: 3, Blue: 3, Green: 3, Yellow: 3 } }, 'Q4')], []); assert.deepStrictEqual([...Teams.forbidFinal(four(), undefined, 'Q4')], []);
  assert.deepStrictEqual([...Teams.forbidFinal(four(), { moves: {}, time: { Red: 2, Blue: 2, Green: 6, Yellow: 6 } }, 'Q4')].sort(), [2, 3], 'a tie for least time leaves both allowed');
});

// ---------- the draw and the plan use it ----------
const TODAY = '2026-12-10';
function add(master, first, extra) { return M.addManualPerson(master, Object.assign({ [C.FIRST]: first, [C.LAST]: 'Test', [C.ROOM]: 'Sparks A', [C.SELECTION]: 'Sparks' }, extra || {}), TODAY); }
function sparks() {      // ten Sparks (teams of 3, 3, 2, 2): the child "m" had Red then a move to Blue in Q1, Green in Q2, Yellow in Q3
  const master = M.emptyMaster(); master.pcCols = [C.REG, C.FIRST, C.LAST, C.ROOM, C.SELECTION]; const people = [];
  for (let i = 0; i < 8; i++) people.push(add(master, 'Kid' + i, { 'team:Q1': Teams.COLORS[i % 4], 'team:Q2': Teams.COLORS[(i + 1) % 4], 'team:Q3': Teams.COLORS[(i + 2) % 4] }));
  const m = add(master, 'Mover', { 'team:Q1': 'Red', 'team:Q2': 'Green', 'team:Q3': 'Yellow' }); people.push(m);
  people.push(add(master, 'Other', { 'team:Q1': 'Blue', 'team:Q2': 'Red', 'team:Q3': 'Green' }));
  return { master, people, m };
}
const H = { moves: { Q1: ['Blue'], Q2: [], Q3: [], Q4: [] }, time: { Red: 2, Blue: 6, Green: 7, Yellow: 7 } };      // Red the least time
const histFor = m => p => p === m ? H : undefined;
test('Teams.assign: with a Quarter 1 move, Quarter 4 gives that child the color they spent the fewest nights on, never a color they have not been on less', () => {
  for (let seed = 1; seed <= 12; seed++) { const { master, m } = sparks(); Teams.assign(master, 'Q4', { rng: Teams.mulberry32(seed), history: histFor(m) }); assert.strictEqual(m['team:Q4'], 'Red', 'seed ' + seed + ': ' + m['team:Q4']); }
});
test('Teams.assign: without the history the same child is given Blue, the one color the roster says is unused, which the move had already played: so the rule is really from the moves', () => {
  for (let seed = 1; seed <= 12; seed++) { const { master, m } = sparks(); Teams.assign(master, 'Q4', { rng: Teams.mulberry32(seed) }); assert.strictEqual(m['team:Q4'], 'Blue', 'seed ' + seed); }
});
test('Teams.assign: a child moved to Blue in Q1 who had Red then Green is not given Blue in Q3 (the move counts as played): Yellow is the only new color', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const master = M.emptyMaster(); master.pcCols = [C.REG, C.FIRST, C.LAST, C.ROOM, C.SELECTION]; for (let i = 0; i < 8; i++) add(master, 'Kid' + i, { 'team:Q1': Teams.COLORS[i % 4], 'team:Q2': Teams.COLORS[(i + 1) % 4] });
    const m = add(master, 'Mover', { 'team:Q1': 'Red', 'team:Q2': 'Green' }); Teams.assign(master, 'Q3', { rng: Teams.mulberry32(seed), history: p => p === m ? { moves: { Q1: ['Blue'], Q2: [], Q3: [], Q4: [] }, time: {} } : undefined });
    assert.strictEqual(m['team:Q3'], 'Yellow', 'seed ' + seed + ': ' + m['team:Q3']);
  }
});
test('Teams.audit: a Quarter 4 repeat is not flagged when all four are used and the color is the one played least; it is flagged otherwise', () => {
  const { master, people, m } = sparks(); m['team:Q4'] = 'Red';
  people.forEach(p => { if (p !== m) p['team:Q4'] = Teams.COLORS[(Teams.COLORS.indexOf(p['team:Q3']) + 1) % 4]; });
  assert(Teams.audit(master, 'Q4').repeats.some(r => r.person === m), 'without history, Red in Q4 repeats Q1');
  assert(!Teams.audit(master, 'Q4', { history: histFor(m) }).repeats.some(r => r.person === m), 'with history Red is the least played');
  m['team:Q4'] = 'Green'; assert(Teams.audit(master, 'Q4', { history: histFor(m) }).repeats.some(r => r.person === m), 'Green is not the least played');
});
test('TeamPlan.project: Quarter 4 for that child is the least-played color too, and the plan never creates, changes or removes a move', () => {
  const season = S.blank('2026-27'), { master, m } = sparks(); S.setTeamMove(season, m[X.ID], 'Q1', '2026-09-23', 'Blue'); const moves = clone(season.teamMoves);
  const calendar = [night('2026-09-16', 'Q1'), night('2026-09-23', 'Q1'), night('2026-11-04', 'Q2'), night('2026-12-02', 'Q3'), night('2027-03-03', 'Q4')];
  const ctx = { master, season, calendar, today: TODAY, history: histFor(m) };
  const plan = TeamPlan.project(ctx, { rng: Teams.mulberry32(7) }); TeamPlan.applyPlan(ctx, plan);
  assert.strictEqual(m['team:Q4'], 'Red'); assert.deepStrictEqual(season.teamMoves, moves, 'the move is untouched after project'); TeamPlan.applyPlan(ctx, TeamPlan.recalc(ctx, { rng: Teams.mulberry32(7) })); assert.deepStrictEqual(season.teamMoves, moves, 'and after a recalculation');
});

// ---------- the printed standings ----------
test('the standings report lists clubbers who changed team this quarter, with their teams in words, and the team results are unchanged', () => {
  const s = club(), master = M.emptyMaster(); master.pcCols = [C.REG, C.FIRST, C.LAST, C.ROOM, C.SELECTION]; const a = add(master, 'Mover', { 'team:Q2': 'Green' }); add(master, 'Stayer', { 'team:Q2': 'Blue' }); attend(s, NIGHTS, a[X.ID]);
  const render = () => Rp.LIST.find(r => r.id === 'standings').render({ master, season: s, calendar: cal, settings: { quarter: 'Q2' }, opts: { group: 'Sparks' } });
  const without = render(); assert(!/Changed team this quarter/.test(without)); S.setTeamMove(s, a[X.ID], 'Q2', '2026-11-11', 'Blue'); const html = render();
  assert(/Changed team this quarter \(1\)/.test(html) && /Green, then Blue from 11\/11/.test(html) && /Mover Test/.test(html), html.slice(0, 300));
  assert(without.startsWith(html.split('<h3>Changed team this quarter')[0]), 'the team table and the night by night results are the same, the note is added after them');
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
