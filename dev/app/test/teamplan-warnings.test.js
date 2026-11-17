// Color team warnings (Fable review A8, A9): a color only counts as "already had" when it was played or hand-set, not when it is just the plan's projection,
// and size warnings stay quiet while children in the group are still blank. Invented people only.
// Usage: node test/teamplan-warnings.test.js
const assert = require('assert');
const M = require('../model.js'), Season = require('../season.js'), TeamPlan = require('../teamplan.js');
const { C, X } = M;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const TODAY = '2026-11-03';
const night = (d, q) => ({ Date: d, Type: 'Club', Quarter: q, 'No Club': '' });
const calendar = [night('2026-09-16', 'Q1'), night('2026-09-23', 'Q1'), night('2026-10-28', 'Q1'), night('2026-11-13', 'Q2'), night('2026-11-20', 'Q2'), night('2027-01-22', 'Q3'), night('2027-04-02', 'Q4')];
const ROOMS = ['Sparks A', 'Sparks B', 'Sparks C', 'Sparks D'];
function world(n) {
  const m = M.emptyMaster(); m.pcCols = [C.REG, C.FIRST, C.LAST, C.ROOM, C.SELECTION];
  for (let i = 0; i < n; i++) M.addManualPerson(m, { [C.FIRST]: 'Kid' + i, [C.LAST]: 'Fam' + i, [C.ROOM]: ROOMS[i % 4], [C.SELECTION]: 'Sparks' }, '2026-10-01');
  const season = Season.fromJson(Season.toJson(Season.blank('2026-27')));
  const kids = m.people.filter(p => M.isActive(p) && M.isClubber(p));
  return { m, season, kids, ctx: { master: m, season, calendar, today: TODAY, history: p => Season.colorHistory(season, String(p[X.ID]), q => M.teamOf(p, q), calendar) } };
}
// Q1 Red is played (locked); Q2 Blue, Q3 Green, Q4 Yellow are the plan's projection (unpinned) unless pinned() is called.
function fill(w, kid) { const cols = { Q1: 'Red', Q2: 'Blue', Q3: 'Green', Q4: 'Yellow' }; Object.keys(cols).forEach(q => { M.addUserCol(w.m, 'team:' + q); kid['team:' + q] = cols[q]; if (q !== 'Q1') TeamPlan.setProjected(w.season, kid[X.ID], q, cols[q]); }); }

test('A9: colors only projected for later quarters are not "already had": the move box can suggest a color', () => {
  const w = world(8), kid = w.kids[0]; fill(w, kid);
  const use = TeamPlan.colorUse(w.ctx, kid, 'Q2');
  assert.deepStrictEqual(Object.keys(use), ['Red'], 'only the played quarter counts: ' + JSON.stringify(use));
  const s = TeamPlan.suggestMove(w.ctx, kid, 'Q2'); assert(s.to && s.to !== 'Red', 'a suggestion exists: ' + JSON.stringify(s));
});
test('A9: picking a color that is only projected for another quarter does not warn about a repeat; the played one does', () => {
  const w = world(8), kid = w.kids[0]; fill(w, kid);
  assert(!TeamPlan.checkChoice(w.ctx, kid, 'Q2', 'Green').warnings.some(x => /repeats a color/.test(x)), 'Green is only projected for Q3');
  assert(TeamPlan.checkChoice(w.ctx, kid, 'Q2', 'Red').warnings.some(x => /already been Red in Q1/.test(x)), 'Red was played in Q1');
});
test('A9: a color the leader set by hand (pinned) for a later quarter still counts', () => {
  const w = world(8), kid = w.kids[0]; fill(w, kid); delete w.season.config.teamPlan;      // no projection marks: every set color is a hand-set pin
  const use = TeamPlan.colorUse(w.ctx, kid, 'Q2'); assert.deepStrictEqual(Object.keys(use).sort(), ['Green', 'Red', 'Yellow'], JSON.stringify(use));
  assert(TeamPlan.checkChoice(w.ctx, kid, 'Q2', 'Green').warnings.some(x => /already been Green in Q3/.test(x)));
});
test('A9: a dated move in a later quarter counts as a color the child will have', () => {
  const w = world(8), kid = w.kids[0]; fill(w, kid); Season.setTeamMove(w.season, String(kid[X.ID]), 'Q3', '2027-01-22', 'Blue', calendar);
  assert(Object.keys(TeamPlan.colorUse(w.ctx, kid, 'Q2')).includes('Blue'), 'the move to Blue in Q3 is a decision');
});
test('A8: team-size and lopsided warnings stay quiet while children in the group are still blank, so picking colors one by one is not nagged', () => {
  const w = world(8); w.kids.slice(0, 2).forEach(k => { M.addUserCol(w.m, 'team:Q2'); k['team:Q2'] = 'Red'; });      // two children on Red, six still blank
  const r = TeamPlan.checkChoice(w.ctx, w.kids[2], 'Q2', 'Red');
  assert(!r.warnings.some(x => /uneven|regulars/.test(x)), JSON.stringify(r.warnings));
});
test('A8: once everyone has a color, an uneven pick is still reported', () => {
  const w = world(8), cols = ['Red', 'Blue', 'Green', 'Yellow']; M.addUserCol(w.m, 'team:Q2'); w.kids.forEach((k, i) => { k['team:Q2'] = cols[i % 4]; });
  const r = TeamPlan.checkChoice(w.ctx, w.kids[1], 'Q2', 'Red');      // Blue child to Red: sizes 3/1/2/2
  assert(r.warnings.some(x => /uneven/.test(x)), JSON.stringify(r.warnings));
});
test('the lopsided note says "has the regulars" only when the high team has regulars, and does not advise moving one who nearly always comes otherwise', () => {
  const w = world(20); M.addUserCol(w.m, "team:Q2"); const cols = ['Red', 'Blue', 'Green', 'Yellow'];
  // 20 children, 5 per team, six held nights (a night with no mark is not held; a child's rate counts from their first attended night). Red children come to 4 of 6 (0.67, under REGULAR 0.75);
  // everyone else to the first and last night only (0.33), and one Blue child also to night 4 so that night is held. Red leads, about 3.3 expected against 1.7, with no "regular" on it.
  w.kids.forEach((k, i) => { k['team:Q2'] = cols[i % 4]; });
  const nights = ['2026-09-16', '2026-09-23', '2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28'];
  w.ctx.calendar = nights.map(d => night(d, 'Q1')); w.season.attendance = {};
  nights.forEach((d, n) => { w.season.attendance[d] = {}; w.kids.forEach((k, i) => { const red = i % 4 === 0, here = red ? [0, 1, 2, 4].includes(n) : n === 0 || n === 5 || (i === 1 && n === 3); if (here) w.season.attendance[d][String(k[X.ID])] = { a: 1 }; }); });
  const b = TeamPlan.balance(w.ctx, 'Sparks', p => M.teamOf(p, 'Q2'));
  assert(b.lopsided, 'Red leads: ' + JSON.stringify(b.rows.map(r => [r.color, +r.expected.toFixed(1), r.regulars])));
  assert.strictEqual(b.rows.find(r => r.color === 'Red').regulars, 0, 'no regulars on the high team');
  assert(!/has the regulars/.test(b.note) && !/nearly always comes from Red/.test(b.note), b.note); assert(/Red is expected to have more children/.test(b.note) && /would even it out/.test(b.note), b.note);
});
test('the history blend: at exactly the blend nights (20) and above, this season stands alone; a lower knob moves the point; below it history still pulls', () => {
  const dates = n => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(2026, 8, 2 + 7 * i)); return d.toISOString().slice(0, 10); });
  const at = (n, knob) => {
    const w = world(8), ds = dates(n); w.ctx.calendar = ds.map(d => night(d, 'Q1')); w.ctx.today = '2027-12-31'; w.season.attendance = {};
    const k0 = String(w.kids[0][X.ID]); ds.forEach(d => { w.season.attendance[d] = { [k0]: { a: 1 } }; });      // this season's rate: 1 (came to every night)
    Season.addPastYear(w.season, '2025-26', { [k0]: { nights: 20, came: 4 } });      // history rate 0.2
    if (knob) TeamPlan.setBlendNights(w.season, knob);
    return TeamPlan.ratesOf(w.ctx, 'Sparks').find(r => String(r.person[X.ID]) === k0);
  };
  assert(Math.abs(at(19).rate - (16 / 17 + 0.2 / 17)) < 1e-9, 'one night short of 20: the weight on this season is 16/17, so history still pulls a little: ' + at(19).rate);
  assert.strictEqual(at(20).rate, 1, 'exactly 20 counted nights: this season alone'); assert.strictEqual(at(25).rate, 1, 'above 20: this season alone');
  assert.strictEqual(at(20).weight, 1);
  assert.strictEqual(at(10, 10).rate, 1, 'with the knob at 10, ten counted nights are enough'); assert(at(9, 10).rate < 1, 'nine are not');
});
test('the seeded shuffle calls the random source exactly length-1 times and gives the same order for the same numbers, whatever the browser\'s sort does', () => {
  let calls = 0; const seq = [0.9, 0.1, 0.5], rng = () => seq[calls++];
  const input = [0, 1, 2, 3], out = TeamPlan.shuffled(input, rng);
  assert.strictEqual(calls, 3, 'one call per swap, not per comparison'); assert.deepStrictEqual(input, [0, 1, 2, 3], 'the input is not changed');
  // Fisher-Yates from the end: i=3 j=floor(0.9*4)=3 (no change); i=2 j=floor(0.1*3)=0 swaps positions 2 and 0; i=1 j=floor(0.5*2)=1 (no change)
  assert.deepStrictEqual(out, [2, 1, 0, 3]);
  assert.deepStrictEqual(TeamPlan.shuffled(input, (i => () => [0.9, 0.1, 0.5][i++])(0)), out, 'the same numbers give the same order');
});
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
