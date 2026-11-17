// Three unverified color-team claims from docs/reviews/REVIEW-2026-11-14-colorteams-and-print.md section 2 (BACKLOG N2: T2, T3, T4). Each check asserts the CORRECT behavior.
// A check listed in OPEN is a verified bug in app code: it is expected to fail ("open"), the run stays green, and it goes RED when the bug is fixed
// ("now passes: remove from OPEN and close it in BACKLOG.md"), the same way test/backlog-open-items.test.js works. Invented people only.
// Usage: node test/teams-gaps.test.js
const assert = require('assert');
const M = require('../model.js'), Teams = require('../teams.js'), TeamPlan = require('../teamplan.js'), Season = require('../season.js'), DM = require('../datamerge.js');
const { C, X } = M;
const OPEN = new Set([]);
let passed = 0, failed = 0, stillOpen = 0;
function check(id, name, fn) {
  let err = null; try { fn(); } catch (e) { err = e; }
  if (OPEN.has(id)) {
    if (err) { stillOpen++; console.log('  open ' + id + ' ' + name + '\n       (expected, still open) ' + String(err.message).split('\n')[0]); }
    else { failed++; console.log('  FAIL ' + id + ' ' + name + '\n       now passes: remove ' + id + ' from OPEN and close it in BACKLOG.md'); }
  } else if (err) { failed++; console.log('  FAIL ' + id + ' ' + name + '\n       ' + String(err.message).split('\n')[0]); }
  else { passed++; console.log('  ok   ' + id + ' ' + name); }
}
const clone = o => JSON.parse(JSON.stringify(o));
const ROOMS = ['Sparks A', 'Sparks B', 'Sparks C', 'Sparks D'], QS = ['Q1', 'Q2', 'Q3', 'Q4'], COLORS = Teams.COLORS;
const night = (d, q) => ({ Date: d, Type: 'Club', Quarter: q, 'No Club': '' });
// Q1 from 9/9, Q2 from 10/28, Q3 from 1/6, Q4 from 3/3. On 2026-12-20: Q1 and Q2 have started (locked), Q3 is ready to lock, Q4 is projected.
const CAL = [night('2026-09-09', 'Q1'), night('2026-09-16', 'Q1'), night('2026-10-28', 'Q2'), night('2026-11-04', 'Q2'), night('2027-01-06', 'Q3'), night('2027-01-13', 'Q3'), night('2027-03-03', 'Q4'), night('2027-03-10', 'Q4')];
const TODAY = '2026-12-20';
function roster(n, colorFn) {
  const m = M.emptyMaster(); m.pcCols = [C.REG, C.FIRST, C.LAST, C.ROOM, C.SELECTION];
  for (let i = 0; i < n; i++) {
    const p = M.addManualPerson(m, { [C.FIRST]: 'Kid' + i, [C.LAST]: 'Fam' + i, [C.ROOM]: ROOMS[i % 4], [C.SELECTION]: 'Sparks' }, '2026-09-01');
    if (colorFn) QS.forEach(q => { const c = colorFn(i, q); if (c) { M.addUserCol(m, 'team:' + q); p['team:' + q] = c; } });
  }
  return m;
}
const kidsOf = m => m.people.filter(p => M.isActive(p) && M.isClubber(p) && M.groupOf(M.room(p)) === 'Sparks');
const sizes = (kids, q) => COLORS.map(c => kids.filter(p => p['team:' + q] === c).length);
const spread = a => Math.max(...a) - Math.min(...a);

// ---------- T4: Recalculate after a child leaves ----------
// 12 children in a Latin square for Q1 and Q2 (played, locked); Q3 and Q4 are projected, applied, then one child leaves and one color is pinned by hand.
function t4(how) {
  const m = roster(12, (i, q) => (q === 'Q1' || q === 'Q2') ? COLORS[(i + QS.indexOf(q)) % 4] : ''), season = Season.blank('2026-27');
  const ctx = { master: m, season, calendar: CAL, today: TODAY };
  TeamPlan.applyPlan(ctx, TeamPlan.project(ctx, { rng: Teams.mulberry32(11) }));
  const kids = kidsOf(m), pinKid = kids[2], leaver = kids[5], a = pinKid['team:Q3'], b = pinKid['team:Q4'];
  assert(a && b && a !== b, 'the projection filled Q3 and Q4 for the pin child');
  pinKid['team:Q3'] = b; pinKid['team:Q4'] = a;      // a hand swap: Q3 is now a pin (the mark still says ' + a + ')
  M.addUserCol(m, 'team:Q3');
  assert(TeamPlan.isPinned(m, season, pinKid, 'Q3'), 'Q3 is a pin for the child');
  const locked = kids.map(p => [p[X.ID], p['team:Q1'], p['team:Q2']].join('|')), pinQ3 = pinKid['team:Q3'];
  if (how === 'inactive') M.setActive(leaver, false); else m.people.splice(m.people.indexOf(leaver), 1);
  return { m, season, ctx, kids: kidsOf(m), leaver, pinKid, pinQ3, locked, allBefore: m.people.slice() };
}
['inactive', 'removed'].forEach(how => {
  check('T4-' + how, 'Recalculate after a child ' + (how === 'inactive' ? 'is made inactive' : 'is removed from the roster') + ': no crash, no repeat, locks and pins kept, sizes count active children only', () => {
    const x = t4(how), before = new Map(x.m.people.map(p => [p[X.ID], QS.map(q => p['team:' + q] || '').join('|')]));
    let plan; assert.doesNotThrow(() => { plan = TeamPlan.recalc(x.ctx, { rng: Teams.mulberry32(5) }); TeamPlan.applyPlan(x.ctx, plan); }, 'recalc and apply do not throw');
    assert(!(String(x.leaver[X.ID]) in plan.colors), 'the plan gives the child who left no color');
    assert(!plan.changes.some(c => String(c.id) === String(x.leaver[X.ID])), 'and lists no change for them');
    const active = kidsOf(x.m); assert.strictEqual(active.length, 11);
    active.forEach(p => { const cs = QS.map(q => p['team:' + q]); assert(cs.every(Boolean), p[C.FIRST] + ' has all four colors'); assert.strictEqual(new Set(cs).size, 4, p[C.FIRST] + ' repeats a color: ' + cs.join()); });
    active.forEach(p => assert.strictEqual([p[X.ID], p['team:Q1'], p['team:Q2']].join('|'), x.locked.find(l => l.startsWith(p[X.ID] + '|')), 'a locked quarter did not move for ' + p[C.FIRST]));
    assert.strictEqual(x.pinKid['team:Q3'], x.pinQ3, 'the pin did not move');
    if (how === 'inactive') assert.strictEqual(QS.map(q => x.leaver['team:' + q] || '').join('|'), before.get(x.leaver[X.ID]), 'the child who left keeps their own colors untouched');
    ['Q3', 'Q4'].forEach(q => { const s = sizes(active, q); assert.strictEqual(s.reduce((a, b) => a + b, 0), 11, q + ' counts 11 active children: ' + s); assert(spread(s) <= 1, q + ' sizes within one child: ' + s); });
    const a = Teams.audit(x.m, 'Q4'); assert.strictEqual(a.groups.Sparks.total, 11, 'the audit counts 11'); assert.deepStrictEqual(a.repeats, [], 'the audit finds no repeat');
    assert.deepStrictEqual(TeamPlan.balanceNotes(x.ctx, null), [], 'no uneven note for the open quarters');
  });
});

// ---------- T3: two leaders each place a new child on the smallest team in their own copy; the copies are merged ----------
// Base: 8 children, 2 per team in Q2 (every team is "smallest"). Leader A adds a new child on Red; leader B adds a different new child on Red.
// Correct: the merged file has no team more than one child larger than another (10 children can be 3/3/2/2), OR the merge tells the leader the teams are uneven.
check('T3-merge-sizes', 'two new children placed on the smallest team in two copies, then merged: teams stay within one child, or the merge says they are uneven', () => {
  const m0 = roster(8, (i, q) => q === 'Q2' ? COLORS[i % 4] : ''), base = Season.blank('2026-27'); base.roster = M.toRoster(m0);
  const addKid = (season, name, color) => {
    const m = M.fromRoster(season.roster), before = Season.snapshot(season);
    const p = M.addManualPerson(m, { [C.FIRST]: name, [C.LAST]: 'Newfam', [C.ROOM]: 'Sparks A', [C.SELECTION]: 'Sparks' }, '2026-11-04'); p[X.ID] = 'new-' + name; M.addUserCol(m, 'team:Q2'); p['team:Q2'] = color;
    season.roster = M.toRoster(m); Season.record(season, before, { separate: true, now: color === 'Red' && name === 'Ann' ? '2026-11-05T20:00:00Z' : '2026-11-05T20:05:00Z' });
  };
  const mine = clone(base), other = clone(base);
  // both leaders look at the sizes (2/2/2/2) and place their new child on the first smallest team
  addKid(mine, 'Ann', 'Red'); addKid(other, 'Bea', 'Red');
  const P = DM.plan(mine, other, { from: 'Sam', now: '2026-11-05T21:00:00Z', base: Season.snapshot(base), names: id => id });
  assert.strictEqual(P.conflicts.length, 0, 'different children: the merge itself has no conflict');
  const out = DM.finish(P, {}), merged = M.fromRoster(out.roster), kids = kidsOf(merged);  assert.strictEqual(kids.length, 10, 'both new children are in the merged file');
  const s = sizes(kids, 'Q2'), uneven = spread(s) > 1;
  const said = DM.toText(P, DM.summary(P)) + JSON.stringify(P.blanks) +JSON.stringify(TeamPlan.balanceNotes({ master: merged, season: out, calendar: CAL, today: '2026-10-01' }, null));
  assert(!uneven || /uneven|balanc|team size/i.test(said), 'merged Q2 sizes are ' + COLORS.map((c, k) => c + ' ' + s[k]).join(', ') + ' (spread ' + spread(s) + ') and neither the merge summary nor balanceNotes says so');
});

// The warning must not cry wolf: two new children on different teams leave 3/3/2/2, and the merge says nothing about team sizes.
check('T3-no-false-warning', 'two new children on different teams, merged: no uneven-team row in the merge summary', () => {
  const m0 = roster(8, (i, q) => q === 'Q2' ? COLORS[i % 4] : ''), base = Season.blank('2026-27'); base.roster = M.toRoster(m0);
  const addKid = (season, name, color, now) => {
    const m = M.fromRoster(season.roster), before = Season.snapshot(season);
    const p = M.addManualPerson(m, { [C.FIRST]: name, [C.LAST]: 'Newfam', [C.ROOM]: 'Sparks A', [C.SELECTION]: 'Sparks' }, '2026-11-04'); p[X.ID] = 'new-' + name; M.addUserCol(m, 'team:Q2'); p['team:Q2'] = color;
    season.roster = M.toRoster(m); Season.record(season, before, { separate: true, now });
  };
  const mine = clone(base), other = clone(base); addKid(mine, 'Ann', 'Red', '2026-11-05T20:00:00Z'); addKid(other, 'Bea', 'Blue', '2026-11-05T20:05:00Z');
  const P = DM.plan(mine, other, { from: 'Sam', now: '2026-11-05T21:00:00Z', base: Season.snapshot(base), names: id => id });
  const S = DM.summary(P), rows = S.rows.filter(r => /team sizes/.test(r.where));
  assert.strictEqual(rows.length, 0, 'a false warning: ' + JSON.stringify(rows));
});
check('T3-warning-row', 'the uneven-team row names the quarter, the group and both sets of sizes', () => {
  const m0 = roster(8, (i, q) => q === 'Q2' ? COLORS[i % 4] : ''), base = Season.blank('2026-27'); base.roster = M.toRoster(m0);
  const addKid = (season, name, now) => {
    const m = M.fromRoster(season.roster), before = Season.snapshot(season);
    const p = M.addManualPerson(m, { [C.FIRST]: name, [C.LAST]: 'Newfam', [C.ROOM]: 'Sparks A', [C.SELECTION]: 'Sparks' }, '2026-11-04'); p[X.ID] = 'new-' + name; M.addUserCol(m, 'team:Q2'); p['team:Q2'] = 'Red';
    season.roster = M.toRoster(m); Season.record(season, before, { separate: true, now });
  };
  const mine = clone(base), other = clone(base); addKid(mine, 'Ann', '2026-11-05T20:00:00Z'); addKid(other, 'Bea', '2026-11-05T20:05:00Z');
  const P = DM.plan(mine, other, { from: 'Sam', now: '2026-11-05T21:00:00Z', base: Season.snapshot(base), names: id => id });
  const row = DM.summary(P).rows.find(r => /team sizes/.test(r.where));
  assert(row, 'no row'); assert.strictEqual(row.where, 'Q2 Sparks team sizes'); assert.strictEqual(row.tag, 'Review'); assert(/Red 3/.test(row.now) && /Red 4/.test(row.after), row.now + ' -> ' + row.after);
});

// ---------- T2: a color typed in other capitals in an old file ----------
// Teams.colorOf (audit) lowercases, so 'red' counts as Red there. Correct: the planner and the grid treat it as Red too (or the loader normalizes it to Red).
const capsRoster = (n, lower) => { const m = roster(n, (i, q) => q === 'Q2' ? COLORS[i % 4] : ''); lower.forEach(i => { m.people[i]['team:Q2'] = m.people[i]['team:Q2'].toLowerCase(); }); const s0 = Season.blank('2026-27'); s0.roster = M.toRoster(m); return loadFile(s0); };
// An old file is opened through the loader (Season.fromJson), which writes the canonical color spelling (season.js upgradeTeamColors). Setting 'red' on an open master would bypass it, and no screen can do that.
const loadFile = s0 => { const s = Season.fromJson(Season.toJson(s0)); return { master: M.fromRoster(s.roster), season: s }; };
check('T2-audit', 'Teams.audit counts a color typed "red" or "RED" as Red (the old audit, as the review says)', () => {
  const x = capsRoster(8, [0]); x.master.people[4]['team:Q2'] = 'RED';
  const a = Teams.audit(x.master, 'Q2').groups.Sparks; assert.deepStrictEqual(a.counts, { Red: 2, Blue: 2, Green: 2, Yellow: 2 }, JSON.stringify(a.counts)); assert(Teams.audit(x.master, 'Q2').ok, 'audit is ok');
});
check('T2-pin', 'the planner does not read a color typed "red" as a hand-set pin when its projection mark says Red', () => {
  const x = capsRoster(8, [0]), p = x.master.people[0], other = x.master.people[4];
  TeamPlan.setProjected(x.season, p[X.ID], 'Q2', 'Red'); TeamPlan.setProjected(x.season, other[X.ID], 'Q2', 'Red');
  assert.strictEqual(other['team:Q2'], 'Red'); assert(!TeamPlan.isPinned(x.master, x.season, other, 'Q2'), 'control: "Red" matching its mark is not a pin');
  assert.strictEqual(p['team:Q2'], 'Red', 'opening the old file writes "Red" for a typed "red" (season.js upgradeTeamColors)');
  assert(!TeamPlan.isPinned(x.master, x.season, p, 'Q2'), '"red" whose mark is R is treated as a pin (teamplan.js isPinned: LETTER[value] is exact), so Recalculate will never move it and the grid draws the pin icon');
});
check('T2-notes', 'the planner sizes (balanceNotes) count a color typed "red" as Red', () => {
  const m0 = roster(12, (i, q) => q === 'Q2' ? COLORS[i % 4] : ''); m0.people.filter(p => p['team:Q2'] === 'Red').slice(0, 2).forEach(p => { p['team:Q2'] = 'red'; });
  const s0 = Season.blank('2026-27'); s0.roster = M.toRoster(m0); const { master: m } = loadFile(s0);
  assert.strictEqual(Teams.audit(m, 'Q2').ok, true, 'control: the audit sees 3/3/3/3');
  const notes = TeamPlan.balanceNotes({ master: m, season: Season.blank('2026-27'), calendar: CAL, today: '2026-10-01' }, null).filter(n => n.q === 'Q2');
  assert.deepStrictEqual(notes, [], 'balanceNotes says the teams are uneven: ' + notes.map(n => n.sizes).join());
});
check('T2-recalc', 'Recalculate keeps a child typed "red" (with a Red projection mark) at 12 children 3/3/3/3 without uneven teams', () => {
  const m = roster(12, (i, q) => q === 'Q2' ? COLORS[i % 4] : ''), season = Season.blank('2026-27'), ctx = { master: m, season, calendar: CAL, today: '2026-10-01' };
  TeamPlan.applyPlan(ctx, TeamPlan.project(ctx, { rng: Teams.mulberry32(3) }));
  const red = m.people.find(p => p['team:Q2'] === 'Red'); red['team:Q2'] = 'red';
  TeamPlan.applyPlan(ctx, TeamPlan.recalc(ctx, { rng: Teams.mulberry32(3) }));
  const a = Teams.audit(m, 'Q2'); assert(a.groups.Sparks.spread <= 1 && !a.repeats.length, 'sizes ' + JSON.stringify(a.groups.Sparks.counts));
});

// The loader fix itself (T2): what opening an old file with typed colors writes.
check('T2-loader', 'opening a file normalizes "red", "RED" and "Red " in quarter colors, past-year colors and dated moves, and leaves other text alone', () => {
  const m = roster(4, (i, q) => q === 'Q2' ? COLORS[i] : ''); M.addUserCol(m, 'team:2025-26:Q1');
  m.people[0]['team:Q2'] = 'red'; m.people[1]['team:Q2'] = 'BLUE'; m.people[2]['team:Q2'] = ' Green '; m.people[3]['team:Q2'] = 'Purple'; m.people[0]['team:2025-26:Q1'] = 'yellow';
  const s0 = Season.blank('2026-27'); s0.roster = M.toRoster(m); s0.teamMoves = { [m.people[0][X.ID]]: [{ q: 'Q2', from: '2026-11-04', team: 'blue' }] };
  s0.history = [{ t: '2026-10-01T00:00:00.000Z', label: 'start', changes: [] }];
  const s = Season.fromJson(Season.toJson(s0)), p = M.fromRoster(s.roster).people;
  assert.deepStrictEqual([0, 1, 2, 3].map(i => p[i]['team:Q2']), ['Red', 'Blue', 'Green', 'Purple'], 'quarter colors (Purple is not a color and stays as typed)');
  assert.strictEqual(p[0]['team:2025-26:Q1'], 'Yellow', 'a past year');
  assert.strictEqual(s.teamMoves[m.people[0][X.ID]][0].team, 'Blue', 'a dated move');
  assert.strictEqual(s.history[s.history.length - 1].label, 'File upgrade', 'the change is one "File upgrade" version in the History');
  const again = Season.fromJson(Season.toJson(s)); assert.strictEqual(again.history.length, s.history.length, 'opening it again changes nothing (idempotent)');
});

console.log(passed + ' passed, ' + failed + ' failed, ' + stillOpen + ' open');
process.exit(failed ? 1 : 0);
