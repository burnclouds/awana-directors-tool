// Color team plan (year grid engine): quarter states, locks, pins, attendance turnout, projection and recalculation.
// Usage: node test/teamplan.test.js
// Synthetic people only (invented names); no real data is read.
const assert = require('assert');
const M = require('../model.js'), Season = require('../season.js'), TeamPlan = require('../teamplan.js');
const { C, X } = M;
const TODAY = '2026-11-03';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}

// A calendar with Q1 started, Q2 ten days away, Q3 far off, Q4 with no nights at all.
const night = (d, q) => ({ Date: d, Type: 'Club', Quarter: q, 'No Club': '' });
const calendar = [night('2026-09-16', 'Q1'), night('2026-09-23', 'Q1'), night('2026-10-28', 'Q1'), night('2026-11-13', 'Q2'), night('2026-11-20', 'Q2'), night('2027-01-22', 'Q3')];
const person = (id, extra) => Object.assign({ [X.ID]: id, [C.FIRST]: 'Kid' + id, [C.LAST]: 'Test', [C.ROOM]: 'Sparks A' }, extra || {});
const fresh = () => Season.fromJson(Season.toJson(Season.blank('2026-27')));

// ---------- states ----------
test('a quarter whose first night has passed is locked; the next one ten days out is ready; a far one and one with no nights are projected', () => {
  const s = fresh();
  assert.strictEqual(TeamPlan.stateOf(s, calendar, 'Q1', TODAY), 'locked');
  assert.strictEqual(TeamPlan.stateOf(s, calendar, 'Q2', TODAY), 'ready');
  assert.strictEqual(TeamPlan.stateOf(s, calendar, 'Q3', TODAY), 'projected');
  assert.strictEqual(TeamPlan.stateOf(s, calendar, 'Q4', TODAY), 'projected');
});
test('only the next unlocked quarter can be ready, even when a later one is also close', () => {
  const s = fresh(), cal = calendar.filter(r => r.Date !== '2027-01-22').concat([night('2026-11-27', 'Q3')]);
  assert.strictEqual(TeamPlan.stateOf(s, cal, 'Q2', TODAY), 'ready');
  assert.strictEqual(TeamPlan.stateOf(s, cal, 'Q3', TODAY), 'projected');
});

// ---------- locks ----------
test('lock and unlock round-trip; locking a quarter far ahead makes it locked and leaves the next one ready', () => {
  const s = fresh();
  TeamPlan.lock(s, 'Q3', TODAY);
  assert.strictEqual(TeamPlan.stateOf(s, calendar, 'Q3', TODAY), 'locked');
  assert.strictEqual(TeamPlan.stateOf(s, calendar, 'Q2', TODAY), 'ready');
  TeamPlan.unlock(s, 'Q3', calendar, TODAY);
  assert.strictEqual(TeamPlan.stateOf(s, calendar, 'Q3', TODAY), 'projected');
});
test('a quarter that has already started cannot be unlocked: its colors are edited by hand', () => {
  const s = fresh();
  assert.throws(() => TeamPlan.unlock(s, 'Q1', calendar, TODAY), /already started/);
});
test('locking records the day and keeps the projection marks, so an unlock returns the quarter to projected', () => {
  const s = fresh();
  TeamPlan.setProjected(s, '1', 'Q2', 'Red'); TeamPlan.setProjected(s, '1', 'Q3', 'Blue');
  TeamPlan.lock(s, 'Q2', TODAY);
  assert.strictEqual(s.config.teamPlan.proj['1'], '-RB-', 'marks untouched by a lock'); assert.strictEqual(s.config.teamPlan.locked.Q2, TODAY);
});

// ---------- History ----------
const said = (a, b) => Season.diff(a, b).map(c => Season.describe(c, id => 'Kid ' + id));
const copy = s => Season.fromJson(Season.toJson(s));
test('History says "Locked Q3" and "Unlocked Q3" in words, whether or not a plan existed before', () => {
  const a = fresh(), b = copy(a); TeamPlan.lock(b, 'Q3', TODAY);
  assert(said(a, b).some(t => /Locked Q3/.test(t)), 'first lock: ' + said(a, b).join(' | '));
  const c = copy(b); TeamPlan.setProjected(c, '1', 'Q4', 'Red'); const d = copy(c); TeamPlan.lock(d, 'Q4', TODAY);
  assert(said(c, d).some(t => /Locked Q4/.test(t)), 'a second lock: ' + said(c, d).join(' | '));
  const e = copy(d); TeamPlan.unlock(e, 'Q4', calendar, TODAY); assert(said(d, e).some(t => /Unlocked Q4/.test(t)), 'unlock: ' + said(d, e).join(' | '));
});
test('History names the child for a changed projection and says when the priorities changed', () => {
  const a = fresh(), b = copy(a); TeamPlan.setProjected(b, '7', 'Q3', 'Blue'); const c = copy(b); TeamPlan.setProjected(c, '7', 'Q3', 'Red');
  assert(said(b, c).some(t => /Kid 7/.test(t)), said(b, c).join(' | ')); const d = copy(a); TeamPlan.setPriorities(d, { order: ['grade', 'turnout', 'apart'], off: [] });
  assert(said(a, d).some(t => /priorities/i.test(t)), said(a, d).join(' | '));
});

// ---------- pins ----------
test('a color is a pin when it differs from the projected one, or when nothing was projected', () => {
  const s = fresh(), p = person('1', { 'team:Q2': 'Red', 'team:Q3': 'Blue' }), m = { people: [p] };
  assert.strictEqual(TeamPlan.isPinned(m, s, p, 'Q2'), true, 'no teamPlan at all: every entered color is a pin');
  TeamPlan.setProjected(s, '1', 'Q2', 'Red');
  assert.strictEqual(TeamPlan.isPinned(m, s, p, 'Q2'), false, 'same as projected');
  p['team:Q2'] = 'Green';
  assert.strictEqual(TeamPlan.isPinned(m, s, p, 'Q2'), true, 'hand-changed away from the projection');
  assert.strictEqual(TeamPlan.isPinned(m, s, person('2'), 'Q2'), false, 'a blank is never a pin');
});

// ---------- file ----------
test('an older file without teamPlan round-trips byte for byte and gains no teamPlan key', () => {
  const s = fresh(), text = Season.toJson(s);
  assert(!('teamPlan' in s.config), 'blank season has no teamPlan');
  assert.strictEqual(Season.toJson(Season.fromJson(text)), text);
});
test('a plan with a lock and projections survives toJson / fromJson unchanged, and a new year starts without one', () => {
  const s = fresh(); TeamPlan.setProjected(s, '1', 'Q3', 'Blue'); TeamPlan.lock(s, 'Q2', TODAY);
  const text = Season.toJson(s), back = Season.fromJson(text);
  assert.deepStrictEqual(back.config.teamPlan, s.config.teamPlan);
  assert.strictEqual(Season.toJson(back), text);
  assert(!('teamPlan' in Season.newSeason(back, '2027-28').config), 'colors start over each year');
});
test('config() always returns the three parts and creates nothing in the file', () => {
  const s = fresh(), c = TeamPlan.config(s);
  assert.deepStrictEqual(Object.keys(c).sort(), ['locked', 'prio', 'proj']);
  assert(!('teamPlan' in s.config), 'reading did not write');
});

// ---------- attendance turnout ----------
// Eight club nights; the three kids start attending at different times, so "rate" must not punish a late start.
const NIGHTS = ['2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30', '2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28'];
function turnoutFixture() {
  const m = M.emptyMaster(); m.pcCols = [C.REG, C.FIRST, C.LAST, C.ROOM, C.SELECTION];
  const add = (first, room) => M.addManualPerson(m, { [C.FIRST]: first, [C.LAST]: 'Test', [C.ROOM]: room, [C.SELECTION]: room.split(' ')[0] }, TODAY);
  const a = add('Avery', 'Sparks A'), b = add('Blake', 'Sparks A'), c = add('Casey', 'Sparks B');
  const d = add('Dana', 'Cubbies');      // comes every night, so every night counts (a night nobody attended is not a night); she is in another group
  const s = fresh(), cal = NIGHTS.map(d => night(d, 'Q1'));
  const present = (p, idx) => idx.forEach(i => { (s.attendance[NIGHTS[i - 1]] = s.attendance[NIGHTS[i - 1]] || {})[p[X.ID]] = { a: 1 }; });
  present(a, [1, 2, 5, 8]); present(b, [6, 8]); present(c, [7, 8]); present(d, [1, 2, 3, 4, 5, 6, 7, 8]);
  return { ctx: { master: m, season: s, calendar: cal, today: TODAY }, a, b, c, m };
}
test('a child present at 4 of the 8 nights since their first night has a rate of 0.5 over 8 nights', () => {
  const f = turnoutFixture(), r = TeamPlan.rate(f.ctx, f.a);
  assert.strictEqual(r.rate, 0.5); assert.strictEqual(r.nights, 8); assert.strictEqual(r.usedAverage, false);
});
test('a child who started at night 6 and came to 2 of the 3 nights since is not marked down for the nights before', () => {
  const f = turnoutFixture(), r = TeamPlan.rate(f.ctx, f.b);
  assert(Math.abs(r.rate - 2 / 3) < 1e-9, 'rate ' + r.rate); assert.strictEqual(r.nights, 3);
});
test('a child with fewer than 3 counted nights gets the group average, and says so', () => {
  const f = turnoutFixture(), r = TeamPlan.rate(f.ctx, f.c), avg = (0.5 + 2 / 3) / 2;
  assert.strictEqual(r.usedAverage, true); assert.strictEqual(r.nights, 2);
  assert(Math.abs(r.rate - avg) < 1e-9, 'rate ' + r.rate + ' vs ' + avg);
});
test('a club night after today does not count', () => {
  const f = turnoutFixture(); f.ctx.calendar = f.ctx.calendar.concat([night('2026-11-04', 'Q2'), night('2026-11-11', 'Q2')]);
  f.ctx.season.attendance['2026-11-04'] = { [f.a[X.ID]]: { a: 1 } };
  assert.strictEqual(TeamPlan.rate(f.ctx, f.a).nights, 8, 'a night in the future is not counted');
});
test('expected turnout per team sums the members\' rates; an empty group gives zeros, never NaN', () => {
  const f = turnoutFixture(), color = p => ({ [f.a[X.ID]]: 'Red', [f.b[X.ID]]: 'Red', [f.c[X.ID]]: 'Blue' })[p[X.ID]] || '';
  const t = TeamPlan.turnout(f.ctx, 'Sparks', color);
  assert(Math.abs(t.Red - (0.5 + 2 / 3)) < 1e-9, 'Red ' + t.Red); assert(t.Blue > 0 && t.Green === 0 && t.Yellow === 0);
  const e = TeamPlan.turnout(f.ctx, 'T&T', color);
  assert.deepStrictEqual(e, { Red: 0, Blue: 0, Green: 0, Yellow: 0 });
});
test('ratesOf lists every child in the group with the rate used and whether the group average stood in', () => {
  const f = turnoutFixture(), rs = TeamPlan.ratesOf(f.ctx, 'Sparks');
  assert.strictEqual(rs.length, 3); const by = n => rs.find(r => r.person[C.FIRST] === n);
  assert.strictEqual(by('Avery').rate, 0.5); assert.strictEqual(by('Avery').usedAverage, false); assert.strictEqual(by('Casey').usedAverage, true); assert.strictEqual(by('Casey').nights, 2);
});
test('with no attendance at all every child is expected (rate 1), so turnout equals head count', () => {
  const f = turnoutFixture(); f.ctx.season.attendance = {};
  const r = TeamPlan.rate(f.ctx, f.a); assert.strictEqual(r.rate, 1); assert.strictEqual(r.usedAverage, true);
});

// ---------- engine: projection and minimum-change recalculation ----------
const Teams = require('../teams.js');
const COLORS4 = ['Red', 'Blue', 'Green', 'Yellow'];
const seeded = n => Teams.mulberry32(n);
// An invented club: `nS` Sparks in two rooms, `nT` T&T. Q1 is already played (colors drawn, locked by its first night); Q2 to Q4 are open.
function club(nS, nT, seed) {
  const m = M.emptyMaster(); m.pcCols = [C.REG, C.FIRST, C.LAST, C.ROOM, C.SELECTION, C.GRADE];
  const rooms = ['Sparks A', 'Sparks B'], tt = ['T&T Boys (Group A)', 'T&T Girls (Group B)'];
  const add = (first, room, grade) => M.addManualPerson(m, { [C.FIRST]: first, [C.LAST]: 'Fam', [C.ROOM]: room, [C.SELECTION]: room.split(' ')[0], [C.GRADE]: grade }, TODAY);
  for (let i = 0; i < nS; i++) add('Spark' + i, rooms[i % 2], i % 2 ? '1' : 'K');
  for (let i = 0; i < nT; i++) add('Trek' + i, tt[i % 2], i % 2 ? '5' : '3');
  Teams.assign(m, 'Q1', { rng: seeded(seed || 7) });
  const s = fresh(); NIGHTS.forEach(d => { s.attendance[d] = {}; });
  return { master: m, season: s, calendar: NIGHTS.map(d => night(d, 'Q1')).concat(calendar.filter(r => r.Quarter !== 'Q1')), today: TODAY };
}
const kidsIn = (ctx, g) => ctx.master.people.filter(p => M.isActive(p) && M.isClubber(p) && M.groupOf(M.room(p)) === g);
const sizes = (ctx, g, q) => { const o = { Red: 0, Blue: 0, Green: 0, Yellow: 0 }; kidsIn(ctx, g).forEach(p => { if (p['team:' + q]) o[p['team:' + q]]++; }); return o; };
const gap = o => Math.max(...Object.values(o)) - Math.min(...Object.values(o));
const cells = ctx => JSON.stringify(ctx.master.people.map(p => [p[X.ID]].concat(['Q1', 'Q2', 'Q3', 'Q4'].map(q => p['team:' + q] || ''))));
const planned = (ctx, seed) => { const plan = TeamPlan.project(ctx, { rng: seeded(seed || 1) }); TeamPlan.applyPlan(ctx, plan); return plan; };

test('project fills every open cell: sizes within one in each group and quarter, and no child repeats a color in the year', () => {
  const ctx = club(14, 9); planned(ctx);
  ['Sparks', 'T&T'].forEach(g => ['Q2', 'Q3', 'Q4'].forEach(q => assert(gap(sizes(ctx, g, q)) <= 1, g + ' ' + q + ' ' + JSON.stringify(sizes(ctx, g, q)))));
  ctx.master.people.filter(p => p['team:Q1']).forEach(p => {
    const c = ['Q1', 'Q2', 'Q3', 'Q4'].map(q => p['team:' + q]); assert(c.every(Boolean), 'blank cell for ' + p[X.ID]); assert.strictEqual(new Set(c).size, 4, 'repeat for ' + p[X.ID] + ': ' + c);
  });
});
test('a pinned color and a locked quarter are byte-identical after project and after recalc', () => {
  const ctx = club(14, 9), kid = kidsIn(ctx, 'Sparks')[0]; kid['team:Q3'] = COLORS4.find(c => c !== kid['team:Q1']);
  const q1 = JSON.stringify(ctx.master.people.map(p => p['team:Q1'])), pin = kid['team:Q3'];
  planned(ctx); assert.strictEqual(kid['team:Q3'], pin, 'pin kept by project'); assert.strictEqual(JSON.stringify(ctx.master.people.map(p => p['team:Q1'])), q1, 'Q1 untouched');
  const plan = TeamPlan.recalc(ctx, { rng: seeded(2) }); TeamPlan.applyPlan(ctx, plan);
  assert.strictEqual(kid['team:Q3'], pin, 'pin kept by recalc'); assert.strictEqual(JSON.stringify(ctx.master.people.map(p => p['team:Q1'])), q1);
});
test('recalc with nothing to change says 0 children and lists nothing', () => {
  const ctx = club(14, 9); planned(ctx); const r = TeamPlan.recalc(ctx, { rng: seeded(3) });
  assert.strictEqual(r.count, 0); assert.deepStrictEqual(r.changes, []);
});
test('after one hand edit, recalc changes only what the edit forces, never a pin, and each change has a reason', () => {
  const ctx = club(14, 9); planned(ctx); const before = cells(ctx), kid = kidsIn(ctx, 'Sparks')[3];
  const was = kid['team:Q3']; kid['team:Q3'] = COLORS4.find(c => c !== was && c !== kid['team:Q1'] && c !== kid['team:Q2']);      // a hand edit: now a pin
  const edited = cells(ctx), r = TeamPlan.recalc(ctx, { rng: seeded(4) });
  assert(r.count >= 1 && r.count <= 4, 'count ' + r.count); assert.strictEqual(r.changes.length > 0, true);
  r.changes.forEach(c => { assert(c.reason && c.reason.length > 10, 'reason: ' + c.reason); assert(c.id !== kid[X.ID] || c.q !== 'Q3', 'the pin is never a change'); });
  TeamPlan.applyPlan(ctx, r); const after = JSON.parse(cells(ctx)), was2 = JSON.parse(edited), ids = new Set(r.changes.map(c => c.id));
  after.forEach((row, i) => { if (!ids.has(row[0])) assert.deepStrictEqual(row, was2[i], 'child ' + row[0] + ' changed but is not in the plan'); });
  assert(!r.changes.some(c => c.id === kid[X.ID] && c.q === 'Q3'));
  assert.strictEqual(r.count, ids.size, 'count is the number of distinct children');
});
test('a group of three children and a group with a team left empty do not throw', () => {
  const ctx = club(3, 5); planned(ctx);
  ['Q2', 'Q3', 'Q4'].forEach(q => kidsIn(ctx, 'Sparks').forEach(p => assert(COLORS4.includes(p['team:' + q]), q)));
});
test('with expected turnout on, a team of high attenders is balanced with low ones; with it off, no such care is taken', () => {
  const run = (off) => { let worst = 0, best = Infinity;
    for (let seed = 1; seed <= 8; seed++) {
      const ctx = club(16, 0, 11), K = kidsIn(ctx, 'Sparks'); ctx.season.config.teamPlan = { prio: { off: off ? ['turnout'] : [] } };
      K.forEach((p, i) => { const high = i % 4 < 2; NIGHTS.forEach((d, n) => { if (high || n === 0) ctx.season.attendance[d][p[X.ID]] = { a: 1 }; }); });
      planned(ctx, seed); const turn = TeamPlan.turnout(ctx, 'Sparks', p => p['team:Q2']);
      const spread = Math.max(...Object.values(turn)) - Math.min(...Object.values(turn)); worst = Math.max(worst, spread); best = Math.min(best, spread);
    } return { worst, best }; };
  const on = run(false), off = run(true);
  assert(on.worst < 0.5, 'turnout on: even every time (worst spread ' + on.worst.toFixed(2) + ')'); assert(off.worst >= 0.75, 'turnout off: at least one seed is lopsided (' + off.worst.toFixed(2) + ')');
});
test('grade spread only breaks ties: team sizes stay even with it on or off', () => {
  ['grade', 'none'].forEach(off => { const ctx = club(14, 9); ctx.season.config.teamPlan = { prio: { off: off === 'grade' ? ['grade'] : [] } }; planned(ctx);
    ['Q2', 'Q3', 'Q4'].forEach(q => assert(gap(sizes(ctx, 'Sparks', q)) <= 1, off + ' ' + q)); });
});

// ---------- priorities ----------
test('defaults: three fixed priorities first, then apart, turnout and grade, none switched off', () => {
  const pr = TeamPlan.priorities(fresh());
  assert.deepStrictEqual(pr.order, ['norepeat', 'friend', 'headcount', 'apart', 'turnout', 'grade']); assert.deepStrictEqual(pr.off, []);
});
test('setPriorities keeps the three fixed ones first and on, stores only what differs from the defaults, and leaves nothing behind when reset', () => {
  const s = fresh();
  TeamPlan.setPriorities(s, { order: ['grade', 'headcount', 'turnout', 'apart', 'norepeat'], off: ['turnout', 'headcount', 'bogus'] });
  const pr = TeamPlan.priorities(s);
  assert.deepStrictEqual(pr.order, ['norepeat', 'friend', 'headcount', 'grade', 'turnout', 'apart'], 'fixed first, the three moved');
  assert.deepStrictEqual(pr.off, ['turnout'], 'only a tunable priority can be switched off');
  assert.deepStrictEqual(s.config.teamPlan.prio, { order: ['grade', 'turnout', 'apart'], off: ['turnout'] });
  TeamPlan.setPriorities(s, { order: ['apart', 'turnout', 'grade'], off: [] });
  assert(!('teamPlan' in s.config), 'back to the defaults: nothing stored');
});
test('the order Mike sets decides which soft priority weighs most', () => {
  const s1 = fresh(), s2 = fresh(); TeamPlan.setPriorities(s2, { order: ['grade', 'turnout', 'apart'], off: [] });
  assert.deepStrictEqual(TeamPlan.priorities(s1).order.slice(3), ['apart', 'turnout', 'grade']); assert.deepStrictEqual(TeamPlan.priorities(s2).order.slice(3), ['grade', 'turnout', 'apart']);
});

// ---------- review fixes ----------
test('filling blanks in an earlier quarter never repeats a color the child already has later in the year', () => {
  const ctx = club(16, 0); planned(ctx, 3); kidsIn(ctx, 'Sparks').forEach(p => { p['team:Q2'] = ''; }); planned(ctx, 5);
  kidsIn(ctx, 'Sparks').forEach(p => assert.strictEqual(new Set(['Q1', 'Q2', 'Q3', 'Q4'].map(q => p['team:' + q])).size, 4, 'repeat for ' + p[X.ID] + ': ' + ['Q1', 'Q2', 'Q3', 'Q4'].map(q => p['team:' + q])));
});
test('lock then unlock leaves the projected colors projected, so a recalculation can still move them', () => {
  const ctx = club(14, 0); planned(ctx, 2); const k = kidsIn(ctx, 'Sparks')[0];
  assert.strictEqual(TeamPlan.isPinned(ctx.master, ctx.season, k, 'Q3'), false);
  TeamPlan.lock(ctx.season, 'Q3', TODAY); TeamPlan.unlock(ctx.season, 'Q3', ctx.calendar, TODAY);
  assert.strictEqual(TeamPlan.isPinned(ctx.master, ctx.season, k, 'Q3'), false, 'still projected after unlock');
});
test('balanceNotes names an open quarter whose teams are uneven once the plan is applied, instead of staying silent', () => {
  const ctx = club(14, 0); planned(ctx, 1); assert.deepStrictEqual(TeamPlan.balanceNotes(ctx, TeamPlan.recalc(ctx, { rng: seeded(1) })), [], 'even teams: no note');
  const sz = sizes(ctx, 'Sparks', 'Q4'), small = COLORS4.reduce((a, c) => sz[c] < sz[a] ? c : a), big = COLORS4.reduce((a, c) => sz[c] > sz[a] ? c : a);
  kidsIn(ctx, 'Sparks').find(p => p['team:Q4'] === small)['team:Q4'] = big;      // a hand edit from the smallest team to the largest
  const notes = TeamPlan.balanceNotes(ctx, { colors: {} });      // with no plan colors laid over it, this is the state as it stands
  assert(notes.some(n => n.q === 'Q4' && n.group === 'Sparks' && n.spread >= 2 && /Red \d/.test(n.sizes)), JSON.stringify(notes));
});
test('newYear clears the locks and the projection with the colors', () => {
  const s = fresh(); TeamPlan.setProjected(s, '1', 'Q3', 'Blue'); TeamPlan.lock(s, 'Q2', TODAY); TeamPlan.newYear(s);
  assert(!('teamPlan' in s.config), 'nothing left');
});

// ---------- "No team" for a quarter (a child who joined after it began) ----------
const Todo = require('../todo.js');
test('No team: the mark is a flag beside a blank color; choosing a color (or blank) takes it off', () => {
  const ctx = club(14, 9), kid = kidsIn(ctx, 'Sparks')[0];
  M.setTeamChoice(ctx.master, kid, 'Q3', M.NO_TEAM);
  assert.strictEqual(kid['team:Q3'], ''); assert(M.noTeam(kid, 'Q3')); assert(!M.noTeam(kid, 'Q2'), 'only that quarter');
  assert(ctx.master.userCols.includes('x_noteam:Q3') && M.isUserCol('x_noteam:Q3'), 'kept with the other user columns');
  M.setTeamChoice(ctx.master, kid, 'Q3', 'Blue'); assert.strictEqual(kid['team:Q3'], 'Blue'); assert(!M.noTeam(kid, 'Q3'));
  M.setTeamChoice(ctx.master, kid, 'Q3', M.NO_TEAM); M.setTeamChoice(ctx.master, kid, 'Q3', ''); assert(!M.noTeam(kid, 'Q3') && kid['team:Q3'] === '');
});
test('No team: a projection leaves that child blank for that quarter and still evens out everyone else', () => {
  const ctx = club(14, 9), kid = kidsIn(ctx, 'Sparks')[0]; M.setTeamChoice(ctx.master, kid, 'Q3', M.NO_TEAM);
  planned(ctx);
  assert.strictEqual(kid['team:Q3'], '', 'not given a color'); assert(M.noTeam(kid, 'Q3'), 'still marked');
  assert.notStrictEqual(kid['team:Q2'], '', 'other quarters are planned as usual');
  const others = kidsIn(ctx, 'Sparks').filter(p => p !== kid), n = COLORS4.map(c => others.filter(p => p['team:Q3'] === c).length);
  assert.strictEqual(n.reduce((a, b) => a + b, 0), 13, 'every other child has a color'); assert(Math.max(...n) - Math.min(...n) <= 1, 'sizes even: ' + n);
});
test('No team: the unassigned warning and the team audit ignore that child for that quarter only', () => {
  const ctx = club(14, 9), kid = kidsIn(ctx, 'Sparks')[0]; kid['team:Q2'] = ''; kid['team:Q1'] = '';
  const before = Teams.audit(ctx.master, 'Q2'); assert(before.unassigned.includes(kid), 'blank counts as unassigned');
  M.setTeamChoice(ctx.master, kid, 'Q2', M.NO_TEAM);
  const after = Teams.audit(ctx.master, 'Q2'); assert(!after.unassigned.includes(kid), 'no longer unassigned'); assert.strictEqual(after.groups.Sparks.total, before.groups.Sparks.total - 1, 'not counted in the group');
  assert(Teams.audit(ctx.master, 'Q1').unassigned.includes(kid), 'Q1 is unaffected');
});
test('No team: the To do list stops asking for a color for that quarter only', () => {
  const ctx = club(14, 9), kid = kidsIn(ctx, 'Sparks')[0]; kid['team:Q2'] = ''; kid['team:Q1'] = '';
  const ask = q => (Todo.compute({ master: ctx.master, quarter: q, today: TODAY }).groups.find(g => g.id === 'teams') || { items: [] }).items.some(i => i.id === String(kid[X.ID]));
  assert(ask('Q2'), 'asked while blank'); M.setTeamChoice(ctx.master, kid, 'Q2', M.NO_TEAM); assert(!ask('Q2'), 'not asked once marked'); assert(ask('Q1'), 'Q1 still asked');
});
test('No team: a child with no team earns no game points (a blank color never has)', () => {
  const s = fresh(); s.attendance['2026-10-28'] = { '1': { a: 1, g: 'Sparks' } }; Season.setGame(s, '2026-10-28', 'Sparks', 'Red', { place: 1, spirit: 2 });
  const cal = [night('2026-10-28', 'Q1')], pts = Season.kidGamePoints(s, '1', 'Sparks', () => '', cal);
  assert.deepStrictEqual(pts.year, { place: 0, spirit: 0 }); assert.strictEqual(Season.kidGamePoints(s, '1', 'Sparks', () => 'Red', cal).year.spirit, 2, 'a team does earn them');
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
