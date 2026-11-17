// The last review items: a new year starts clean, report sheets take the quarter from their night, the Attendance Summary shows only the marks a room has,
// print columns have fixed widths. Invented test club only.
// Usage: node test/review-leftovers.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Season = require('../season.js'), M = require('../model.js'), Reports = require('../reports.js'), RS = require('../reports-season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).find(f => /TEST.*\.json$/.test(f));
const load = () => { const s = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')); return { season: s, master: M.fromRoster(s.roster), calendar: s.calendar }; };

// ---------- a new year starts clean ----------
test('new year: pending Planning Center changes and the uniform order / receive / give record are cleared; sizes verified and notes carry over', () => {
  const s = Season.blank('2026-27'), id = Object.keys({ k1: 1 })[0];
  s.roster.people[id] = { pc: { Grade: '1' }, v: { 'ov:Grade': '2', 'ov:Birthdate': '2020-01-01', x_Uni_OrderedDate: '2026-09-01', x_Uni_SizeOrdered: 'M', x_Uni_ReceivedDate: '2026-09-20', x_Uni_GivenDate: '2026-09-27', x_Uni_SizeGiven: 'M',
    x_Uni_SizeVerified: 'M', x_Uni_Notes: 'long sleeves', 'team:Q1': 'Red', x_Active: '1' } };
  const n = Season.newSeason(s, '2027-28'), v = n.roster.people[id].v;
  assert.deepStrictEqual(Object.keys(v).filter(k => k.startsWith('ov:') || /Ordered|Received|Given/.test(k)), []);
  assert.strictEqual(v.x_Uni_SizeVerified, 'M'); assert.strictEqual(v.x_Uni_Notes, 'long sleeves'); assert.strictEqual(v['team:Q1'], 'Red'); assert.strictEqual(v.x_Active, '1');
  assert.strictEqual(s.roster.people[id].v['ov:Grade'], '2', 'last year\'s file is not touched');
});
test('new year: with the test club\'s real structure nothing year-bound is left, and everyone is still there', () => {
  const c = load(), n = Season.newSeason(c.season, '2027-28'), people = Object.values(n.roster.people);
  assert.strictEqual(people.length, Object.keys(c.season.roster.people).length);
  assert(!people.some(p => Object.keys(p.v || {}).some(k => k.startsWith('ov:') || /^x_Uni_(Ordered|SizeOrdered|Received|Given|SizeGiven)/.test(k))));
});

// ---------- report sheets: the quarter comes from the night ----------
// Flags 1 and 3 (Mike, 2026-11-13): the attendance sheet's title, dates and Color Team column are all the quarter picked with the Quarter pills; the Night picker (which defaults to the latest night, usually in a
// later quarter) must not switch the team column to its own quarter. A night inside the picked quarter still gives "teams as of that night" (moves).
test('attendance sheet: the Color Team column and heading follow the Quarter pills for every quarter and both classes, not the Night picker', () => {
  const c = load(), byGroup = g => c.master.people.find(x => M.isClubber(x) && M.isActive(x) && M.groupOf(M.room(x)) === g);
  ['Sparks', 'T&T'].forEach(g => {
    const p = byGroup(g); assert(p, 'a ' + g + ' child exists');
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach((q, i) => p['team:' + q] = ['Red', 'Blue', 'Green', 'Yellow'][i]);
    const nightIn = q => c.calendar.find(r => r.Quarter === q && /club night/i.test(r.Type || 'club night'));
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach((q, qi) => {
      ['Q1', 'Q2', 'Q3', 'Q4'].forEach(nq => {
        const n = nightIn(nq); if (!n) return;
        const html = Reports.LIST.find(r => r.id === 'attendance').render({ master: c.master, settings: { quarter: q, club: 'x', dates: '' }, calendar: c.calendar, season: c.season, opts: { room: M.room(p), date: n.Date } });
        const i = html.indexOf(M.fullName(p)), cell = /class="teamcol team-(\w+)"/.exec(html.slice(i));
        assert(new RegExp(q + ' Color Team').test(html) && !new RegExp('(?!' + q + ')Q[1-4] Color Team').test(html), g + ' ' + q + ' with the Night in ' + nq + ': the heading is ' + q);
        assert(cell && cell[1] === ['Red', 'Blue', 'Green', 'Yellow'][qi], g + ' ' + q + ' with the Night in ' + nq + ': the team is the ' + q + ' team, got ' + (cell && cell[1]));
      });
    });
  });
});
test('attendance sheet: a night from another quarter does not change the team column (the Quarter pills win); the Color teams sheet still follows a date it is given', () => {
  const c = load(), id = Object.keys(c.season.roster.people).find(i => M.groupOf(M.room(c.master.people.find(p => p[M.X.ID] === i))) === 'Sparks');
  const p = c.master.people.find(x => x[M.X.ID] === id), q3 = c.calendar.find(r => r.Quarter === 'Q3'), q2 = c.calendar.find(r => r.Quarter === 'Q2');
  assert(q3 && q2, 'test calendar has Q2 and Q3 nights');
  p['team:Q2'] = 'Red'; p['team:Q3'] = 'Blue';
  const sheet = (date, quarter) => Reports.LIST.find(r => r.id === 'attendance').render({ master: c.master, settings: { quarter, club: 'x', dates: '' }, calendar: c.calendar, season: c.season, opts: { room: M.room(p), date } });
  const cell = html => { const i = html.indexOf(M.fullName(p)); return /class="teamcol team-(\w+)"/.exec(html.slice(i))[1]; };
  assert.strictEqual(cell(sheet(q3.Date, 'Q2')), 'Red', 'a Q3 night under a Q2 setting: the Q2 team');
  assert.strictEqual(cell(sheet(q2.Date, 'Q3')), 'Blue', 'a Q2 night under a Q3 setting: the Q3 team');
  assert(/Q2 Color Team/.test(sheet(q3.Date, 'Q2')) && !/Q3 Color Team/.test(sheet(q3.Date, 'Q2')), 'the heading names the picked quarter');
  const teams = Reports.LIST.find(r => r.id === 'teams').render({ master: c.master, settings: { quarter: 'Q2', club: 'x' }, calendar: c.calendar, season: c.season, opts: { date: q3.Date } });
  assert(/Q3 Color Teams/.test(teams) && !/Q2 Color Teams/.test(teams), 'the Color teams sheet too');
});

test('attendance sheet: the date columns are the club nights of the quarter picked with the Quarter pills, whatever Night is picked, and the title says that quarter', () => {
  const Cal = require('../calendar.js'), c = load(), p = c.master.people.find(x => M.isClubber(x) && M.isActive(x) && M.groupOf(M.room(x)) === 'Sparks');
  ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => {
    const want = Cal.nights(c.calendar, q).map(r => Cal.short(r.Date)); if (!want.length) return;
    ['', ...['Q1', 'Q2', 'Q3', 'Q4'].map(nq => (c.calendar.find(r => r.Quarter === nq && Cal.nights([r]).length) || {}).Date).filter(Boolean)].forEach(night => {
      const html = Reports.LIST.find(r => r.id === 'attendance').render({ master: c.master, settings: { quarter: q, club: 'x', dates: '' }, calendar: c.calendar, season: c.season, opts: { room: M.room(p), date: night } });
      const got = [...html.matchAll(/<th colspan="\d+" class="date">([^<]+)<\/th>/g)].map(m => m[1]);
      assert.deepStrictEqual(got, want, q + ' with the Night "' + night + '": the date columns are the ' + q + ' nights');
      assert(new RegExp(q + ' Attendance').test(html) && !new RegExp('(?!' + q + ')Q[1-4] Attendance').test(html), q + ': the title names ' + q);
    });
  });
});

// ---------- print: fixed date columns ----------
test('attendance sheets: every column has a width, the date columns are equal, and the widths add up to 100%', () => {
  const c = load(), html = Reports.LIST.find(r => r.id === 'attendance').render({ master: c.master, settings: { quarter: 'Q2', club: 'x', dates: '' }, calendar: c.calendar, season: c.season, opts: {} });
  const groups = [...html.matchAll(/<colgroup>(.*?)<\/colgroup>/g)].map(m => [...m[1].matchAll(/width:([\d.]+)%/g)].map(x => +x[1]));
  assert(groups.length > 1);
  groups.forEach(w => {
    assert(Math.abs(w.reduce((a, b) => a + b, 0) - 100) < 0.5, 'adds to ' + w.reduce((a, b) => a + b, 0));
    const dates = w.slice(w[1] === 7 ? 2 : 1); assert(dates.every(x => x === dates[0]), 'date columns equal');
  });
});

// ---------- money columns: kept in the file, never shown, asked about or compared ----------
const Csv = require('../csv.js'), Todo = require('../todo.js'), exportText = fs.readFileSync(path.join(dir, fs.readdirSync(dir).filter(f => /TEST.*\.csv$/.test(f)).sort()[0]), 'utf8');
test('money columns: no balance-due list, no "paid / balance" column in the Uniform Tracking report, and not in the Edit dialog column list', () => {
  const c = load(); c.master.people.forEach(p => { p['Balance Due'] = '$50'; });
  assert(!Todo.compute({ master: c.master, season: c.season, quarter: 'Q2', today: '2026-11-04' }).groups.some(g => g.id === 'balance'));
  assert(!Reports.UNI_HEAD.some(h => /paid|balance/i.test(h)));
  const html = Reports.LIST.find(r => r.id === 'uniforms').render({ master: c.master, settings: { quarter: 'Q2', club: 'x' }, calendar: c.calendar, season: c.season, opts: {} });
  assert(!/\$50|due/i.test(html), 'no amount owed on the sheet');
  assert.deepStrictEqual(M.HIDDEN_COLS.slice().sort(), ['Attendee Balance Due', 'Balance Due', 'Registration Amount Paid']);
});
test('money columns: an import neither lists them as changes nor loses them; the new amounts are still stored', () => {
  const m = M.loadMaster(exportText, '2026-10-28'), recs = Csv.toRecords(Csv.parse(exportText)), p = m.people.find(x => x['Balance Due'] !== undefined);
  const rec = recs.records.find(r => r['Registration ID'] === p['Registration ID'] && r['First Name'] === p['First Name']); rec['Balance Due'] = '$999'; rec['Registration Amount Paid'] = '$1';
  const plan = M.planImport(m, recs), mine = plan.matched.find(x => x.person === p);
  assert(!mine.changes.some(c => M.HIDDEN_COLS.includes(c.col)), 'not shown as a field change');
  M.applyPlan(m, plan, { rename: new Set(), add: new Set(), deactivate: new Set() }, '2026-11-04');
  assert.strictEqual(p['Balance Due'], '$999'); assert.strictEqual(p['Registration Amount Paid'], '$1');
  assert.strictEqual(M.toRoster(m).people[p['x_ClubberID']].pc['Balance Due'], '$999', 'kept in the data file');
});

// ---------- CSV templates: what the app can read in, it can also save ----------
const Teams = require('../teams.js'), Calendar = require('../calendar.js'), Rotation = require('../rotation.js');
test('Color teams CSV: one row per active Sparks / T&T child with Q1-Q4 colors, and importing it back reproduces the colors (also after editing one in the file)', () => {
  const c = load(), m = c.master, text = Teams.exportList(m), recs = Csv.toRecords(Csv.parse(text));
  assert.deepStrictEqual(recs.cols, ['Unique ID', 'Name', 'Group', 'Class', 'Q1', 'Q2', 'Q3', 'Q4']);
  const kids = m.people.filter(p => M.isActive(p) && M.isClubber(p) && ['Sparks', 'T&T'].includes(M.groupOf(M.room(p))));
  assert.strictEqual(recs.records.length, kids.length);
  const k = kids.find(p => p['team:Q2']), row = recs.records.find(x => x['Unique ID'] === k[M.X.ID]); assert.strictEqual(row.Q2, k['team:Q2']); assert.strictEqual(row.Name, M.fullName(k));
  const before = JSON.stringify(kids.map(p => [p['team:Q1'], p['team:Q2'], p['team:Q3'], p['team:Q4']]));
  const out = Teams.importList(m, null, text); assert.strictEqual(out.unmatched.length, 0); assert.strictEqual(JSON.stringify(kids.map(p => [p['team:Q1'], p['team:Q2'], p['team:Q3'], p['team:Q4']])), before, 'round trip changes nothing');
  const edited = text.replace(new RegExp('(' + k[M.X.ID] + '[^\\n]*?)' + k['team:Q2']), (x, a) => a + 'Yellow'); Teams.importList(m, null, edited); assert.strictEqual(k['team:Q2'], 'Yellow', 'an edited color is picked up');
});
test('Calendar and Rotation CSV: saved text opens again unchanged; an empty one is still a usable template', () => {
  const c = load(); assert.strictEqual(Calendar.toCsv(Calendar.load(Calendar.toCsv(c.calendar))), Calendar.toCsv(c.calendar));
  const empty = Calendar.toCsv([]); assert(/^\uFEFF?Date,Type,Quarter/.test(empty)); assert.doesNotThrow(() => Calendar.load(empty + 'x'.slice(1)));
  const grid = Rotation.blank(); assert.deepStrictEqual(Rotation.load(Rotation.toCsv(grid)), grid);
});

// ---------- handbook codes: one written form per book: the book's code (AoG) ----------
test('handbook codes: AO, ao and AOG all save as AoG (the book\'s code); a typed book name finds the book; an unknown code is left as typed', () => {
  const s = Season.blank('2026-27');
  ['AO', 'ao', 'AOG', 'aog', 'AoG'].forEach(v => assert.strictEqual(Season.bookCode(s, v), 'AoG', v));
  assert.strictEqual(Season.bookCode(s, 'Agents of Grace'), 'AoG'); assert.strictEqual(Season.bookCode(s, 'hg'), 'HG'); assert.strictEqual(Season.bookCode(s, 'Hangglider'), 'HG'); assert.strictEqual(Season.bookCode(s, 'QQ'), 'QQ');
  s.config.books.AGR = s.config.books.AoG; delete s.config.books.AoG; assert.strictEqual(Season.bookCode(s, 'agr'), 'AGR', 'the code is whatever is on Options');
});
test('tidy handbook codes: only another spelling of a listed book is rewritten (date and note kept); a typed name or an unknown code is left for a person', () => {
  const s = Season.blank('2026-27'); Object.assign(s.handbooks, { a: 'AOG 261014 new', b: 'ao 261021', c: 'AoG 261028', d: 'Hang 261014', e: 'QQ 261014', f: 'hg 260916' });
  const list = Season.tidyHandbookCodes(s, false); assert.deepStrictEqual(list.map(x => x.id + ':' + x.from + '>' + x.to).sort(), ['a:AOG>AoG', 'b:ao>AoG', 'f:hg>HG']);
  assert.strictEqual(s.handbooks.a, 'AOG 261014 new', 'looking changes nothing'); Season.tidyHandbookCodes(s, true);
  assert.deepStrictEqual([s.handbooks.a, s.handbooks.b, s.handbooks.c, s.handbooks.d, s.handbooks.e, s.handbooks.f], ['AoG 261014 new', 'AoG 261021', 'AoG 261028', 'Hang 261014', 'QQ 261014', 'HG 260916']);
  assert.strictEqual(Season.tidyHandbookCodes(s, false).length, 0, 'nothing left to tidy');
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
