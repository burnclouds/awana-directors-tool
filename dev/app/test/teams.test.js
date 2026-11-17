// Color team assignment tests (Sparks and T&T play separately).
// Usage: node test/teams.test.js [planning-center-export.csv]
// Synthetic rosters are used throughout; the optional CSV adds a run against the real roster.
const fs = require('fs'), assert = require('assert');
const M = require('../model.js'), Teams = require('../teams.js');
const { C, X } = M;
const today = '2026-10-28';

// ---------- helpers ----------
const SPARK_ROOMS = ['Sparks A', 'Sparks B', 'Sparks C', 'Sparks D'];
const TT_ROOMS = ['T&T Boys (Group A)', 'T&T Boys (Group B)', 'T&T Girls (Group A)', 'T&T Girls (Group B)'];
function add(master, first, last, roomName, extra) {
  return M.addManualPerson(master, Object.assign({ [C.FIRST]: first, [C.LAST]: last, [C.ROOM]: roomName,
    [C.SELECTION]: /volunteer/i.test(roomName) ? 'Volunteer' : roomName.split(' ')[0] }, extra || {}), today);
}
function roster(nSparks, nTT) {
  const m = M.emptyMaster();
  m.pcCols = [C.REG, C.FIRST, C.LAST, C.ROOM, C.SELECTION];
  for (let i = 0; i < nSparks; i++) add(m, 'Spark' + i, 'Fam' + (i % 11), SPARK_ROOMS[i % 4]);
  for (let i = 0; i < nTT; i++) add(m, 'Trek' + i, 'Fam' + (i % 9), TT_ROOMS[i % 4]);
  add(m, 'Cub', 'Bear', 'Cubbies'); add(m, 'Pug', 'Gle', 'Puggles'); add(m, 'Vol', 'Unteer', 'Volunteers');
  add(m, 'Gone', 'Away', 'Sparks A', { [X.ACTIVE]: '0' });
  return m;
}
const grp = (m, g) => m.people.filter(p => M.isActive(p) && M.isClubber(p) && M.groupOf(M.room(p)) === g);
const col = q => 'team:' + q;
const counts = (m, g, q) => { const o = { Red: 0, Blue: 0, Green: 0, Yellow: 0 }; grp(m, g).forEach(p => { if (p[col(q)]) o[p[col(q)]]++; }); return o; };
const spread = c => Math.max(...Object.values(c)) - Math.min(...Object.values(c));
const seeded = n => Teams.mulberry32(n);
const colorsOf = (p, qs) => qs.map(q => p[col(q)]);

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}

// ---------- Q1: random but even ----------
test('Q1 splits Sparks and T&T evenly, each group on its own', () => {
  const m = roster(30, 27);
  Teams.assign(m, 'Q1', { rng: seeded(1) });
  ['Sparks', 'T&T'].forEach(g => {
    const c = counts(m, g, 'Q1');
    assert.strictEqual(Object.values(c).reduce((a, b) => a + b), grp(m, g).length, g + ' all assigned');
    assert(spread(c) <= 1, g + ' uneven: ' + JSON.stringify(c));
  });
});

test('only active Sparks and T&T clubbers get a color', () => {
  const m = roster(12, 12);
  Teams.assign(m, 'Q1', { rng: seeded(2) });
  m.people.filter(p => !grp(m, 'Sparks').includes(p) && !grp(m, 'T&T').includes(p))
    .forEach(p => assert.strictEqual(p[col('Q1')] || '', '', M.fullName(p) + ' should have no team'));
});

test('Q1 is random: different seeds differ, the same seed repeats', () => {
  const run = s => { const m = roster(24, 24); Teams.assign(m, 'Q1', { rng: seeded(s) }); return m.people.map(p => p[col('Q1')] || '').join(); };
  assert.strictEqual(run(7), run(7));
  assert.notStrictEqual(run(7), run(8));
});

// ---------- later quarters: never a repeat, mixed up ----------
test('Q2 never repeats a Q1 color and stays even', () => {
  const m = roster(32, 28);
  Teams.assign(m, 'Q1', { rng: seeded(3) });
  Teams.assign(m, 'Q2', { rng: seeded(4) });
  grp(m, 'Sparks').concat(grp(m, 'T&T')).forEach(p => assert.notStrictEqual(p[col('Q2')], p[col('Q1')], M.fullName(p)));
  ['Sparks', 'T&T'].forEach(g => assert(spread(counts(m, g, 'Q2')) <= 1, g + ' uneven in Q2'));
});

test('Q2 mixes teams: no old team lands together in one new team', () => {
  const m = roster(32, 0);
  Teams.assign(m, 'Q1', { rng: seeded(5) });
  Teams.assign(m, 'Q2', { rng: seeded(6) });
  const sparks = grp(m, 'Sparks');
  let worst = 0;
  Teams.COLORS.forEach(nc => Teams.COLORS.forEach(oc => {
    worst = Math.max(worst, sparks.filter(p => p[col('Q2')] === nc && p[col('Q1')] === oc).length);
  }));
  assert(worst <= 3, 'up to ' + worst + ' kids from one old team ended up together (8 per team, 3 other old teams => ideal 3)');
});

test('four quarters in a row: every kid gets four different colors and teams stay even', () => {
  const m = roster(32, 28);
  ['Q1', 'Q2', 'Q3', 'Q4'].forEach((q, i) => Teams.assign(m, q, { rng: seeded(10 + i) }));
  grp(m, 'Sparks').concat(grp(m, 'T&T')).forEach(p =>
    assert.strictEqual(new Set(colorsOf(p, ['Q1', 'Q2', 'Q3', 'Q4'])).size, 4, M.fullName(p) + ' repeated a color: ' + colorsOf(p, ['Q1', 'Q2', 'Q3', 'Q4'])));
  ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => ['Sparks', 'T&T'].forEach(g => assert(spread(counts(m, g, q)) <= 1, g + ' ' + q)));
});

test('uneven group sizes (30 and 27): across many random draws nobody repeats and every quarter stays even', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const m = roster(30, 27);
    const rng = seeded(seed);
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => Teams.assign(m, q, { rng }));
    grp(m, 'Sparks').concat(grp(m, 'T&T')).forEach(p =>
      assert.strictEqual(new Set(colorsOf(p, ['Q1', 'Q2', 'Q3', 'Q4'])).size, 4, 'seed ' + seed + ' ' + M.fullName(p)));
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => ['Sparks', 'T&T'].forEach(g =>
      assert(spread(counts(m, g, q)) <= 1, 'seed ' + seed + ' ' + g + ' ' + q + ' ' + JSON.stringify(counts(m, g, q)))));
  }
});

test('kids who were teammates are kept apart as well as the head count allows', () => {
  // Times a pair shares a team now after already sharing one in an earlier quarter (30 Sparks: 24 / 48 is the floor).
  const together = (m, q) => { const ps = grp(m, 'Sparks'); let n = 0;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) if (ps[i][col(q)] === ps[j][col(q)])
      ['Q1', 'Q2'].filter(e => e < q).forEach(e => { if (ps[i][col(e)] === ps[j][col(e)]) n++; });
    return n; };
  for (let seed = 1; seed <= 10; seed++) {
    const m = roster(30, 0), rng = seeded(seed);
    ['Q1', 'Q2', 'Q3'].forEach(q => Teams.assign(m, q, { rng }));
    assert(together(m, 'Q2') <= 24, 'seed ' + seed + ' Q2 repeat pairs ' + together(m, 'Q2'));
    assert(together(m, 'Q3') <= 48, 'seed ' + seed + ' Q3 repeat pairs ' + together(m, 'Q3'));
  }
});

// ---------- current assignments are respected ----------
test('existing assignments are kept; only the unassigned are filled', () => {
  const m = roster(24, 0);
  Teams.assign(m, 'Q1', { rng: seeded(30) });
  const before = m.people.map(p => p[col('Q1')]);
  const r = Teams.assign(m, 'Q1', { rng: seeded(31) });                 // run again: nothing to do
  assert.deepStrictEqual(m.people.map(p => p[col('Q1')]), before);
  assert.strictEqual(r.assigned.length, 0);
  assert.strictEqual(r.kept, 24);
});

test('assignments typed in by hand (or imported) are honored and counted for balance', () => {
  const m = roster(24, 0);
  const s = grp(m, 'Sparks');
  s.slice(0, 6).forEach(p => { p[col('Q1')] = 'Red'; });                // lopsided on purpose
  Teams.assign(m, 'Q1', { rng: seeded(32) });
  s.slice(0, 6).forEach(p => assert.strictEqual(p[col('Q1')], 'Red'));
  const c = counts(m, 'Sparks', 'Q1');
  assert.deepStrictEqual(c, { Red: 6, Blue: 6, Green: 6, Yellow: 6 });
});

test('a color typed in lowercase is recognised and left alone', () => {
  const m = roster(8, 0);
  const p = grp(m, 'Sparks')[0]; p[col('Q1')] = 'blue';
  Teams.assign(m, 'Q1', { rng: seeded(33) });
  assert.strictEqual(p[col('Q1')], 'blue');
});

test('an invalid color is treated as unassigned and replaced', () => {
  const m = roster(8, 0);
  const p = grp(m, 'Sparks')[0]; p[col('Q1')] = 'Purple';
  Teams.assign(m, 'Q1', { rng: seeded(34) });
  assert(Teams.COLORS.includes(p[col('Q1')]));
});

// ---------- adding students ----------
test('a student added mid-quarter gets a color that keeps the teams even, others untouched', () => {
  const m = roster(24, 20);
  Teams.assign(m, 'Q1', { rng: seeded(40) });
  const before = new Map(m.people.map(p => [p[X.ID], p[col('Q1')]]));
  const newbie = add(m, 'New', 'Kid', 'Sparks C');
  const r = Teams.assign(m, 'Q1', { rng: seeded(41) });
  assert.deepStrictEqual(r.assigned.map(a => a.person), [newbie]);
  m.people.filter(p => p !== newbie).forEach(p => assert.strictEqual(p[col('Q1')], before.get(p[X.ID])));
  assert(spread(counts(m, 'Sparks', 'Q1')) <= 1);
});

test('a student added in Q3 (no history) lands on the smallest team, existing Q3 teams kept', () => {
  const m = roster(24, 0);
  ['Q1', 'Q2', 'Q3'].forEach((q, i) => Teams.assign(m, q, { rng: seeded(50 + i) }));
  const before = new Map(m.people.map(p => [p[X.ID], p[col('Q3')]]));
  const newbie = add(m, 'Late', 'Joiner', 'Sparks A');
  Teams.assign(m, 'Q3', { rng: seeded(53) });
  assert(Teams.COLORS.includes(newbie[col('Q3')]));
  m.people.filter(p => p !== newbie).forEach(p => assert.strictEqual(p[col('Q3')], before.get(p[X.ID])));
  assert(spread(counts(m, 'Sparks', 'Q3')) <= 1);
});

test('several new students in Q2 get colors they have not had and keep teams even', () => {
  const m = roster(24, 0);
  Teams.assign(m, 'Q1', { rng: seeded(60) });
  Teams.assign(m, 'Q2', { rng: seeded(61) });
  const newbies = [add(m, 'N1', 'X', 'Sparks A'), add(m, 'N2', 'Y', 'Sparks B'), add(m, 'N3', 'Z', 'Sparks C')];
  newbies[0]['team:Q1'] = 'Red';                                        // joined in Q1 elsewhere; history says Red
  Teams.assign(m, 'Q2', { rng: seeded(62) });
  assert.notStrictEqual(newbies[0]['team:Q2'], 'Red');
  newbies.forEach(p => assert(Teams.COLORS.includes(p['team:Q2'])));
  assert(spread(counts(m, 'Sparks', 'Q2')) <= 1);
});

// ---------- redo ----------
test('redo re-draws the whole quarter, still obeying history', () => {
  const m = roster(24, 0);
  Teams.assign(m, 'Q1', { rng: seeded(70) });
  Teams.assign(m, 'Q2', { rng: seeded(71) });
  const first = m.people.map(p => p['team:Q2']).join();
  Teams.assign(m, 'Q2', { rng: seeded(72), redo: true });
  assert.notStrictEqual(m.people.map(p => p['team:Q2']).join(), first);
  grp(m, 'Sparks').forEach(p => assert.notStrictEqual(p['team:Q2'], p['team:Q1']));
  assert.deepStrictEqual(Object.values(counts(m, 'Sparks', 'Q2')), [6, 6, 6, 6]);
});

// ---------- hard cases ----------
test('a kid with three colors behind them gets the one left, even when it makes the quarter lopsided', () => {
  const m = roster(8, 0);
  grp(m, 'Sparks').forEach((p, i) => { p['team:Q1'] = ['Red', 'Blue', 'Green'][i % 3]; p['team:Q2'] = ['Blue', 'Green', 'Red'][i % 3]; p['team:Q3'] = ['Green', 'Red', 'Blue'][i % 3]; });
  Teams.assign(m, 'Q4', { rng: seeded(80) });
  grp(m, 'Sparks').forEach(p => assert.strictEqual(p['team:Q4'], 'Yellow'));      // "never the same color" beats "even"
  const a = Teams.audit(m, 'Q4');
  assert.strictEqual(a.repeats.length, 0);
  assert.strictEqual(a.ok, false);                                                  // but the imbalance is surfaced
  assert(a.groups.Sparks.spread > 1);
});

// ---------- audit ----------
test('audit reports counts, unassigned, repeats and imbalance', () => {
  const m = roster(16, 0);
  Teams.assign(m, 'Q1', { rng: seeded(90) });
  Teams.assign(m, 'Q2', { rng: seeded(91) });
  let a = Teams.audit(m, 'Q2');
  assert.deepStrictEqual(a.groups.Sparks.counts, { Red: 4, Blue: 4, Green: 4, Yellow: 4 });
  assert.strictEqual(a.repeats.length + a.unassigned.length, 0);
  assert.strictEqual(a.ok, true);
  const p = grp(m, 'Sparks')[0];
  p['team:Q2'] = p['team:Q1'];
  const q = grp(m, 'Sparks')[1]; q['team:Q2'] = '';
  a = Teams.audit(m, 'Q2');
  assert.deepStrictEqual(a.repeats.map(r => r.person), [p]);
  assert.deepStrictEqual(a.unassigned, [q]);
  assert.strictEqual(a.ok, false);
});

// ---------- importing existing assignments ----------
test('import a list of current assignments by name; unknown names and bad colors are reported', () => {
  const m = roster(8, 0);
  const csv = 'Name,Color\nSpark0 Fam0,Red\nspark1 fam1,blue\nSpark2 Fam2,Purple\nNobody Here,Green\n';
  const r = Teams.importList(m, 'Q1', csv);
  assert.strictEqual(r.set, 2);
  assert.deepStrictEqual(r.unmatched, ['Nobody Here']);
  assert.deepStrictEqual(r.invalid, ['Spark2 Fam2']);
  assert.strictEqual(grp(m, 'Sparks')[0]['team:Q1'], 'Red');
  assert.strictEqual(grp(m, 'Sparks')[1]['team:Q1'], 'Blue');
  assert.strictEqual(m.userCols.includes('team:Q1'), true);
});

test('import accepts First/Last/Team columns too, then assignment builds on what was imported', () => {
  const m = roster(8, 0);
  Teams.importList(m, 'Q1', 'First Name,Last Name,Team\nSpark0,Fam0,Green\nSpark1,Fam1,Green\n');
  Teams.assign(m, 'Q1', { rng: seeded(95) });
  assert.strictEqual(grp(m, 'Sparks')[0]['team:Q1'], 'Green');
  assert.deepStrictEqual(Object.values(counts(m, 'Sparks', 'Q1')), [2, 2, 2, 2]);
});

test('import matches on the Unique ID first, so a changed or shared name cannot misplace a color', () => {
  const m = roster(8, 0);
  const [a, b] = grp(m, 'Sparks');
  const csv = 'Unique ID,Name,Color\n' + a[X.ID] + ',Somebody Else Entirely,Green\n' + b[X.ID] + ',' + M.fullName(b) + ',Yellow\n';
  const r = Teams.importList(m, 'Q1', csv);
  assert.strictEqual(r.set, 2);
  assert.strictEqual(a['team:Q1'], 'Green');
  assert.strictEqual(b['team:Q1'], 'Yellow');
});

test('one file with Q1..Q4 columns fills every quarter; blanks are left alone', () => {
  const m = roster(8, 0);
  const [a, b] = grp(m, 'Sparks');
  const csv = 'Unique ID,Name,Q1,Q2,Q3,Q4\n' + a[X.ID] + ',x,Red,Blue,Green,Yellow\n' + b[X.ID] + ',x,Blue,,Red,\n';
  const r = Teams.importList(m, null, csv);
  assert.strictEqual(r.set, 6);
  assert.deepStrictEqual(colorsOf(a, ['Q1', 'Q2', 'Q3', 'Q4']), ['Red', 'Blue', 'Green', 'Yellow']);
  assert.deepStrictEqual(colorsOf(b, ['Q1', 'Q2', 'Q3', 'Q4']).map(x => x || ''), ['Blue', '', 'Red', '']);
  ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => assert(m.userCols.includes('team:' + q)));
});

test('a multi-quarter import then fills the blanks without touching what was imported', () => {
  const m = roster(12, 0);
  const s = grp(m, 'Sparks');
  Teams.importList(m, null, 'Unique ID,Q1\n' + s.map((p, i) => p[X.ID] + ',' + Teams.COLORS[i % 4]).join('\n') + '\n');
  const q1 = s.map(p => p['team:Q1']);
  Teams.assign(m, 'Q2', { rng: seeded(130) });
  assert.deepStrictEqual(s.map(p => p['team:Q1']), q1);
  s.forEach(p => assert.notStrictEqual(p['team:Q2'], p['team:Q1']));
});

// ---------- new year ----------
test('a new year archives the old colors and starts from a clean, even Q1', () => {
  const m = roster(24, 20);
  ['Q1', 'Q2'].forEach((q, i) => Teams.assign(m, q, { rng: seeded(100 + i) }));
  const oldQ1 = m.people.map(p => p['team:Q1'] || '');
  const r = Teams.startNewYear(m, '2026-27');
  assert.deepStrictEqual(r.archived, ['team:2026-27:Q1', 'team:2026-27:Q2']);
  assert.deepStrictEqual(m.people.map(p => p['team:2026-27:Q1'] || ''), oldQ1);
  m.people.forEach(p => { assert.strictEqual(p['team:Q1'] || '', ''); assert.strictEqual(p['team:Q2'] || '', ''); });
  Teams.assign(m, 'Q1', { rng: seeded(103) });
  ['Sparks', 'T&T'].forEach(g => assert(spread(counts(m, g, 'Q1')) <= 1));
  // last year's colors do not restrict this year
  const c = counts(m, 'Sparks', 'Q1');
  assert.strictEqual(Object.values(c).reduce((a, b) => a + b), 24);
});

test('starting a new year survives a CSV round trip and refuses to overwrite an archive', () => {
  const m = roster(12, 0);
  Teams.assign(m, 'Q1', { rng: seeded(110) });
  Teams.startNewYear(m, '2026-27');
  const back = M.loadMaster(M.toCsv(m), today);
  assert.deepStrictEqual(back.people.map(p => p['team:2026-27:Q1'] || ''), m.people.map(p => p['team:2026-27:Q1'] || ''));
  Teams.assign(m, 'Q1', { rng: seeded(111) });
  assert.throws(() => Teams.startNewYear(m, '2026-27'), /already/i);
});

test('a roster rolled into a new year can add students and keep going through Q2', () => {
  const m = roster(24, 0);
  Teams.assign(m, 'Q1', { rng: seeded(120) });
  Teams.startNewYear(m, '2026-27');
  Teams.assign(m, 'Q1', { rng: seeded(121) });
  add(m, 'Fresh', 'Face', 'Sparks D');
  Teams.assign(m, 'Q1', { rng: seeded(122) });
  Teams.assign(m, 'Q2', { rng: seeded(123) });
  grp(m, 'Sparks').forEach(p => assert.notStrictEqual(p['team:Q2'], p['team:Q1']));
  assert(spread(counts(m, 'Sparks', 'Q2')) <= 1);
});

// ---------- real roster ----------
if (process.argv[2]) {
  test('real roster: four quarters, never a repeat, always even', () => {
    const real = M.loadMaster(fs.readFileSync(process.argv[2], 'utf8'), today);
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach((q, i) => Teams.assign(real, q, { rng: seeded(200 + i) }));
    const a = Teams.audit(real, 'Q4');
    assert.strictEqual(a.repeats.length, 0);
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => ['Sparks', 'T&T'].forEach(g => assert(spread(counts(real, g, q)) <= 1, g + ' ' + q)));
    console.log('       real roster sizes: Sparks ' + grp(real, 'Sparks').length + ', T&T ' + grp(real, 'T&T').length);
  });
}

// ---------- the solver the year plan reuses ----------
test('attempt() takes an optional per-kid, per-color cost, so a caller can steer who stays where (sizes still win)', () => {
  const none = () => new Set(), forbidden = [none(), none(), none(), none()];
  assert.deepStrictEqual(Teams.attempt(4, [0, 0, 0, 0], 1, [0, 1, 2, 3], forbidden, seeded(1), (i, k) => k === (i + 1) % 4 ? 0 : 5), [1, 2, 3, 0]);
  const lopsided = Teams.attempt(4, [0, 0, 0, 0], 1, [0, 1, 2, 3], forbidden, seeded(1), (i, k) => k === 0 ? 0 : 5);
  assert.deepStrictEqual(lopsided.slice().sort(), [0, 1, 2, 3], 'one kid per team even though every kid prefers Red');
});

test('dry run: the colors Assign blanks would give are returned and nothing is written; a real run with the same seed gives the same colors', () => {
  const m = roster(24, 24), before = JSON.stringify(m.people);
  const dry = Teams.assign(m, 'Q1', { dry: true, rng: seeded(7) });
  assert.strictEqual(JSON.stringify(m.people), before, 'no person changed');
  assert.strictEqual(dry.assigned.length, 48, 'every child got a suggestion');
  const want = new Map(dry.assigned.map(x => [x.person[X.ID], x.color]));
  Teams.assign(m, 'Q1', { rng: seeded(7) });
  m.people.filter(p => want.has(p[X.ID])).forEach(p => assert.strictEqual(p[col('Q1')], want.get(p[X.ID]), 'same color as the real run'));
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
