// Validator tests: the data JSON, the Planning Center export and the older calendar/colors CSVs.
// Usage: node test/validate.test.js [data.json] [planning-center-export.csv]   (the optional files are checked for zero errors)
const assert = require('assert'), fs = require('fs'), path = require('path');
const V = require('../validate.js'), S = require('../season.js'), Mdl = require('../model.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}
const OK_NAME = 'awana-2026-27-20261029-122918.json';
const levels = r => r.findings.map(f => f.level + ': ' + f.msg);
const has = (r, level, re) => r.findings.some(f => f.level === level && re.test(f.msg));
const clone = x => JSON.parse(JSON.stringify(x));

// A small valid season: two kids, one night, a calendar, a rotation and two logged edits.
function goodSeason() {
  const m = Mdl.emptyMaster(); m.pcCols = Mdl.TRACKED.slice();
  ['Ann', 'Bo'].forEach(f => Mdl.addManualPerson(m, { 'First Name': f, 'Last Name': 'Test', 'Assignment Area: Classes': 'Sparks A', 'Selection': 'Clubber', 'Registration ID': '1' }, '2026-10-01'));
  const s = S.blank('2026-27'); s.roster = Mdl.toRoster(m);
  s.calendar = [{ Date: '2026-10-28', Type: 'Club night', Quarter: 'Q2', Theme: '', Notes: '', 'No Club': '', 'Puggles Lesson': '', 'Cubbies Lesson': '', 'Sparks Lesson': '', 'T&T Lesson': '' }];
  s.rotation = [['Time', 'Sparks'], ['6:30', 'Gym']];
  const id = Object.keys(s.roster.people)[0];
  let before = S.snapshot(s); S.setMark(s, '2026-10-28', id, 'a', 1); S.record(s, before, { now: '2026-10-28T23:00:00.000Z' });
  before = S.snapshot(s); S.setGame(s, '2026-10-28', 'Sparks', 'Red', { place: 1, spirit: 2 }); S.record(s, before, { now: '2026-10-29T12:00:00.000Z' });
  return { s, id };
}
const run = (s, name) => V.validate(S.toJson(s), name || OK_NAME);

test('a valid data file has no errors or warnings, and says what it holds', () => {
  const { s } = goodSeason(), r = run(s);
  assert.strictEqual(r.kind, 'data'); assert.deepStrictEqual(levels(r).filter(x => !x.startsWith('info')), []);
  assert(r.findings.some(f => f.level === 'info' && /2 people/.test(f.msg)), levels(r).join(' | '));
});
test('kinds are recognised from the contents: data, Planning Center export, calendar, colors, old master, rotation, and unknown', () => {
  assert.strictEqual(V.detect(S.toJson(S.blank('x'))), 'data');
  assert.strictEqual(V.detect('Registration ID,First Name,Last Name,Assignment Area: Classes\n1,A,B,Sparks A\n'), 'pc');
  assert.strictEqual(V.detect('Date,Type,Quarter\n2026-09-09,Club night,Q1\n'), 'calendar');
  assert.strictEqual(V.detect('Unique ID,Q1,Q2\nx,Red,Blue\n'), 'colors');
  assert.strictEqual(V.detect('x_ClubberID,First Name,Last Name\n'), 'master');
  assert.strictEqual(V.detect('Time,Sparks\n6:30,Gym\n'), 'rotation');
  assert.strictEqual(V.detect('{"awards":[]}'), 'json');
  assert.strictEqual(V.detect('hello,world\n1,2\n'), '');
});
test('not JSON, wrong format and a newer version are errors', () => {
  assert(has(V.validate('{"format":"awana-season"', OK_NAME), 'error', /not valid JSON/i));
  assert(has(V.validate('{"format":"nope"}', OK_NAME), 'error', /not an AWANA data file|format/i));
  const n = clone(goodSeason().s); n.version = 99;
  assert(has(V.validate(JSON.stringify(n), OK_NAME), 'error', /newer version/));
});
test('the file name must carry a real yyyymmdd-hhmmss tag', () => {
  const { s } = goodSeason();
  assert(has(run(s, 'awana-2026-27.json'), 'warn', /yyyymmdd-hhmmss/));
  assert(has(run(s, 'awana-2026-27-20261340-122918.json'), 'warn', /not a real date or time/));
  assert(!has(run(s, OK_NAME), 'warn', /yyyymmdd|real date/));
});
test('bad dates, marks and game scores are errors', () => {
  const { s, id } = goodSeason();
  const a = clone(s); a.attendance['2026-13-45'] = {}; assert(has(run(a), 'error', /2026-13-45.*not a real date/));
  const b = clone(s); b.attendance['2026-10-28'][id].z = 1; assert(has(run(b), 'error', /unknown mark "z"/));
  const c = clone(s); c.games['2026-10-28'].Sparks.Red.place = 9; assert(has(run(c), 'error', /place 9/));
  const d = clone(s); d.games['2026-10-28'].Sparks.Purple = { place: 1 }; assert(has(run(d), 'error', /team "Purple"/));
  const e = clone(s); e.progress[id] = { HG: { 'RJ1.1': 'soon' } }; assert(has(run(e), 'error', /"soon".*not a real date/));
});
test('records that point at someone not on the roster are a warning, naming how many', () => {
  const { s } = goodSeason(), a = clone(s); a.attendance['2026-10-28'].ghost_id = { a: 1 }; a.awards['2026-10-28'] = { ghost_id: ['Bible Buddy'] }; a.handbooks.ghost_id = 'HG 260916';
  assert(has(run(a), 'warn', /3 records refer to people who are not on the roster/), levels(run(a)).join(' | '));
});
test('calendar problems: bad type, bad quarter, duplicate dates, and club nights off the club day', () => {
  const { s } = goodSeason();
  const a = clone(s); a.calendar[0].Type = 'Party'; assert(has(run(a), 'error', /Type "Party"/));
  const b = clone(s); b.calendar[0].Quarter = 'Q9'; assert(has(run(b), 'error', /Quarter "Q9"/));
  const c = clone(s); c.calendar.push(clone(c.calendar[0])); assert(has(run(c), 'warn', /2026-10-28 appears 2 times/));
  const d = clone(s); d.config.clubDay = 4; assert(has(run(d), 'warn', /1 club night is not on a Thursday/));
  const e = clone(s); e.config.clubDay = 9; assert(has(run(e), 'error', /club day/i));
});
test('the roster and rotation shapes are checked', () => {
  const { s, id } = goodSeason();
  const a = clone(s); delete a.roster.people[id].pc; assert(has(run(a), 'error', /no Planning Center record|missing "pc"/));
  const b = clone(s); b.roster.people[id].v['team:Q1'] = 'Purple'; assert(has(run(b), 'error', /team:Q1.*"Purple"/));
  const c = clone(s); c.rotation = 'nope'; assert(has(run(c), 'error', /rotation/i));
});
test('the history is checked: entries well-formed, in time order, and agreeing with the data', () => {
  const { s, id } = goodSeason();
  const a = clone(s); a.history[0].t = 'yesterday-ish'; assert(has(run(a), 'error', /version 1.*time/i));
  const b = clone(s); b.history[1].t = '2026-10-01T00:00:00.000Z'; assert(has(run(b), 'warn', /out of time order/));
  const c = clone(s); delete c.attendance['2026-10-28'][id].a; c.attendance['2026-10-28'][id].h = 1;
  assert(has(run(c), 'warn', /differs from what the history says/), levels(run(c)).join(' | '));
  const d = clone(s); d.history[0].changes = 'x'; assert(has(run(d), 'error', /version 1.*changes/i));
});
test('an old version-1 file is accepted with a note, not an error', () => {
  const o = clone(goodSeason().s); o.version = 1; delete o.history; delete o.roster; delete o.calendar; delete o.rotation;
  const r = V.validate(JSON.stringify(o), OK_NAME);
  assert(!r.findings.some(f => f.level === 'error'), levels(r).join(' | ')); assert(has(r, 'info', /older format/i));
});

// ---------- Planning Center export ----------
const PC_HEAD = 'Registration ID,First Name,Last Name,Grade,Selection,Assignment Area: Classes,Status\n';
const pc = rows => PC_HEAD + rows.join('\n') + '\n';
const PC_NAME = '20261028 -- sc-awana-club-2026-27.csv';
test('a clean Planning Center export has no problems and the as-of date comes from the file name', () => {
  const full = 'Registration ID,First Name,Last Name,Grade,Birthdate,Age,Selection,Assignment Area: Classes,Status,Emergency Contact,Mobile Phone Number,Home Email Address\n';
  const r = V.validate(full + ['1,Ann,Lee,2nd Grade,5/1/2019,7,Clubber,Sparks A,Active,Pat Lee - 555-0100,(937) 555-0100,lee@example.com', '1,Bo,Lee,Kindergarten,3/2/2021,5,Clubber,Sparks B,Active,Pat Lee - 555-0100,(937) 555-0100,lee@example.com',
    '2,Cy,Kim,5th Grade,1/9/2016,10,Clubber,T&T Boys (Group A),Active,Sun Kim - 555-0101,(937) 555-0101,kim@example.com', '3,Di,Moe,,6/6/1980,46,Awana Adult Volunteer,Volunteers,Active,,(937) 555-0102,moe@example.com'].join('\n') + '\n', PC_NAME);
  assert.strictEqual(r.kind, 'pc'); assert.deepStrictEqual(r.findings.filter(f => f.level !== 'info' && !/^Columns:/.test(f.msg)).map(f => f.level + ': ' + f.msg), []);      // this header is a trimmed one: the column report (test/pc-columns.test.js) has its own checks
  assert(has(r, 'info', /4 people.*as of 2026-10-28/), levels(r).join(' | '));
});
test('Planning Center problems: missing columns, blank names or rooms, unknown rooms, duplicates, no date in the name', () => {
  assert(has(V.validate('Registration ID,First Name,Last Name,Grade,Selection,Status\n1,A,B,K,Clubber,Active\n', PC_NAME), 'warn', /Columns: There is no .Assignment Area: Classes. column/), 'a missing class column is a warning that says what it affects, not an error');
  const r = V.validate(pc(['1,Ann,Lee,2nd,Clubber,,Active', '2,,Kim,5th,Clubber,Sparks A,Active', '3,Cy,Moe,K,Clubber,Sparks Z,Active', '4,Di,Ng,K,Clubber,Sparks A,Active', '5,Di,Ng,K,Clubber,Sparks A,Active', ',Ed,Pa,K,Clubber,Sparks A,Active']), 'export.csv');
  assert(has(r, 'warn', /row 2.*no room/)); assert(has(r, 'error', /row 3.*First Name/)); assert(has(r, 'warn', /"Sparks Z"/));
  assert(has(r, 'warn', /Di Ng.*twice|appears 2 times/)); assert(has(r, 'error', /row 7.*Registration ID/)); assert(has(r, 'warn', /no yyyymmdd date/));
});
test('a Planning Center export with the wrong Status or an impossible date in the name is flagged', () => {
  assert(has(V.validate(pc(['1,Ann,Lee,2nd,Clubber,Sparks A,Inactive']), PC_NAME), 'warn', /1 .*not Active/i));
  assert(has(V.validate(pc(['1,Ann,Lee,2nd,Clubber,Sparks A,Active']), '20261345 -- x.csv'), 'warn', /not a real date/));
});

// ---------- the older CSVs ----------
test('a calendar CSV is validated with the calendar loader, and old colors and master CSVs are recognised', () => {
  assert(has(V.validate('Date,Type,Quarter\n2026-09-09,Club night,Q1\n2026-09-16,Club night,Q1\n', 'calendar.csv'), 'info', /2 dates/));
  assert(has(V.validate('Date,Type,Quarter\n09/09/2026,Club night,Q1\n', 'calendar.csv'), 'error', /Bad date/));
  assert(has(V.validate('Date,Type,Quarter\n2026-09-10,Club night,Q1\n', 'calendar.csv'), 'warn', /not on a Wednesday/));
  assert(has(V.validate('Unique ID,Q1,Q2\nx,Red,Blue\ny,Purple,Blue\n', 'colors.csv'), 'error', /"Purple"/));
  assert(has(V.validate('x_ClubberID,First Name,Last Name\n1_A_B,A,B\n', 'master.csv'), 'info', /old master/i));
  assert(has(V.validate('hello,world\n1,2\n', 'x.csv'), 'warn', /not a file this app knows/));
});

// ---------- inspect: the dates shown on the debug tab ----------
test('inspect reports the dates inside each file: tag in the name, last edit, club year and export date', () => {
  const { s } = goodSeason(); s.roster.pcAsOf = '2026-10-28'; s.roster.pcSource = PC_NAME;
  const i = V.inspect(S.toJson(s), OK_NAME, Date.UTC(2026, 9, 29, 12, 30, 0));
  assert.strictEqual(i.kind, 'data'); assert.strictEqual(i.nameStamp, '2026-10-29 12:29:18');
  assert.strictEqual(i.facts['Club year'], '2026-27'); assert.strictEqual(i.facts['Planning Center data as of'], '2026-10-28');
  assert.strictEqual(i.facts['Versions logged'], '2'); assert(/^2026-10-29/.test(i.facts['Last edit']), i.facts['Last edit']);
  const p = V.inspect(pc(['1,Ann,Lee,2nd,Clubber,Sparks A,Active']), PC_NAME, Date.UTC(2026, 9, 28, 21, 0, 0));
  assert.strictEqual(p.kind, 'pc'); assert.strictEqual(p.nameStamp, '2026-10-28'); assert.strictEqual(p.facts.People, '1');
});

// ---------- the real files, when given ----------
const [dataArg, pcArg] = process.argv.slice(2);
if (dataArg) test('the real data file validates with no errors', () => { const r = V.validate(fs.readFileSync(dataArg, 'utf8'), path.basename(dataArg)); assert.deepStrictEqual(r.findings.filter(f => f.level === 'error').map(f => f.msg), []); });
if (pcArg) test('the real Planning Center export validates with no errors', () => { const r = V.validate(fs.readFileSync(pcArg, 'utf8'), path.basename(pcArg)); assert.deepStrictEqual(r.findings.filter(f => f.level === 'error').map(f => f.msg), []); });

test('a team move dated outside its quarter\'s club nights is a warning (a calendar edit can strand it); one inside is not', () => {
  const { s, id } = goodSeason(); s.calendar.push(Object.assign({}, s.calendar[0], { Date: '2026-11-04' }), Object.assign({}, s.calendar[0], { Date: '2027-01-06', Quarter: 'Q3' }));
  const before = S.snapshot(s); S.setTeamMove(s, id, 'Q2', '2026-11-04', 'Blue'); S.record(s, before, { now: '2026-10-30T12:00:00.000Z' });
  assert.deepStrictEqual(levels(run(s)).filter(l => /^(error|warn)/.test(l)), [], 'inside Q2: no warning');
  const bad = clone(s); bad.teamMoves[id][0].from = '2027-01-06';      // a real night, but in Q3
  const r = run(bad); assert(has(r, 'warn', /Team move.*outside Q2.*it will not apply/), levels(r).join(' | '));
});
test('team moves and one-night teams: good ones pass, bad ones are named', () => {
  const { s, id } = goodSeason();
  const before = S.snapshot(s); S.setTeamMove(s, id, 'Q2', '2026-10-28', 'Blue'); S.setNightTeam(s, '2026-10-28', id, 'Green'); S.record(s, before, { now: '2026-10-30T12:00:00.000Z' });
  assert.deepStrictEqual(levels(run(s)).filter(l => /^(error|warn)/.test(l)), []);
  const bad = clone(s); bad.teamMoves[id][0].team = 'Purple'; bad.attendance['2026-10-28'][id].t = 'Mauve';
  const r = run(bad); assert(has(r, 'error', /Team move/) && has(r, 'error', /team "Mauve"/), levels(r).join(' | '));
  const bad2 = clone(s); bad2.teamMoves[id][0].from = '2026-02-30'; assert(has(run(bad2), 'error', /Team move/));
  const bad3 = clone(s); delete bad3.attendance['2026-10-28'][id].a; assert(has(run(bad3), 'warn', /not marked present/));
});

// ---- R16: a check for each of the eleven sections that had none, and the damaged-section rule (docs/retired/plans/items/R16-file-check-coverage.md) ----
const td = path.join(__dirname, '..', '..', 'test-data');
const testFile = () => JSON.parse(fs.readFileSync(path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.json$/.test(f)).sort().pop()), 'utf8'));
const runO = o => V.validate(JSON.stringify(o), OK_NAME);
const GHOST = '7000001_Test_Kid';
const mut = fn => { const o = testFile(); fn(o, Object.keys(o.roster.people)[0]); return runO(o); };
const hasC = (r, level, re, check) => r.findings.some(f => f.level === level && re.test(f.msg) && (!check || f.check === check));
test('the TEST file has no errors or warnings, and every finding says which check made it', () => {
  const o = testFile(); assert(!(GHOST in o.roster.people), 'the ghost id is not on the TEST roster');
  const r = runO(o); assert.deepStrictEqual(r.findings.filter(f => f.level !== 'info'), [], 'the TEST file must be clean');
  assert(r.findings.every(f => typeof f.check === 'string' && f.check), 'every finding has a check name');
  const bad = mut((o2, kid) => { o2.attendance[Object.keys(o2.attendance)[0]][kid] = 5; o2.blueDrops = []; });
  assert(bad.findings.every(f => typeof f.check === 'string' && f.check), 'also on a file with errors');
  assert(bad.findings.some(f => f.check === 'attendance'), 'the attendance error says "attendance"');
});
test('a section that is not an object is an error that says the records would be lost, for every object section', () => {
  const words = { blueDrops: 'Dropped Blue Jewel', held: 'Held awards', doneBooks: 'Books finished before', doneReviews: 'Reviews finished before', received: 'Date received', givenNoDate: 'Given, no date', progressNoDate: 'No-date sign-offs', extraSheets: 'Added sheets', announcedNoDate: 'Told, no date', blueWings: 'Blue Jewel placement', blueOverrides: 'Blue Jewel given by hand', flags: 'Flag' };
  Object.keys(words).forEach(k => { const r = mut(o => { o[k] = []; }); assert(hasC(r, 'error', new RegExp(words[k] + ' section is a list.*lost at the next save'), k), k + ': ' + levels(r).join(' | ')); });
  ['handbooks', 'attendance', 'awards', 'given', 'adults', 'teamMoves', 'games', 'progress'].forEach(k => { const r = mut(o => { o[k] = 'x'; }); assert(has(r, 'error', /section is text.*lost at the next save/), k + ': ' + levels(r).join(' | ')); });
  assert(hasC(mut(o => { o.blueDrops = null; }), 'error', /section is empty \(null\)/, 'blueDrops'));
});
test('held: awards held back are an object of award to 1', () => {
  assert(hasC(mut((o, k) => { o.held = { [k]: ['HG Red Jewel 1'] }; }), 'error', /Held awards for/, 'held'));
  const w = mut((o, k) => { o.held = { [k]: { 'HG Red Jewel 1': true } }; }); assert(hasC(w, 'warn', /1 held mark that is not 1 \(/, 'held') && !has(w, 'error', /./));
  assert(hasC(mut((o, k) => { o.held = { [k]: { 'HG Red Jewel 1': 0 } }; }), 'error', /Held award/, 'held'));
  assert(!has(mut((o, k) => { o.held = { [k]: { 'HG Red Jewel 1': 1 } }; }), 'warn', /held/), 'a correct hold is fine');
});
test('flags: a flag has a real level, a note, a real date and (mostly) a known child', () => {
  const ok = (k, over) => Object.assign({ kid: k, level: 'child', book: '', block: '', key: '', note: 'x', at: '2026-10-28' }, over || {});
  assert(!has(mut((o, k) => { o.flags = { f1: ok(k), f2: ok('', { level: 'general' }), f3: ok('', { level: 'element', tab: 'roster', trail: ['Roster'], label: 'Roster', rowIndex: 0 }) }; }), 'error', /./), 'valid flags are fine');
  [[{ level: 'nope' }], [{ note: '' }], [{ at: '2026-02-30' }], [{ level: 'element', kid: '', tab: 'x', trail: [] }], [{ level: 'attend', kid: '' }]].forEach(([over]) => {
    assert(hasC(mut((o, k) => { o.flags = { f1: ok(k, over) }; }), 'error', /Flag f1/, 'flags'), JSON.stringify(over));
  });
  assert(hasC(mut(o => { o.flags = { f1: 'text' }; }), 'error', /Flag f1/, 'flags'));
});
test('doneBooks, received, givenNoDate, progressNoDate, extraSheets, announcedNoDate: shape errors and half-pairs', () => {
  assert(hasC(mut((o, k) => { o.doneBooks = { [k]: 'AoG' }; }), 'error', /Books finished before/, 'doneBooks'));
  assert(hasC(mut((o, k) => { o.doneBooks = { [k]: ['ZZ'] }; }), 'warn', /not in the list of books \(/, 'doneBooks'));
  assert(hasC(mut((o, k) => { o.doneReviews = { [k]: 'HG' }; }), 'error', /Reviews finished before/, 'doneReviews'));
  assert(hasC(mut((o, k) => { o.doneReviews = { [k]: ['ZZ'] }; }), 'warn', /not in the list of books \(/, 'doneReviews'));
  assert(hasC(mut((o, k) => { o.doneReviews = { [k]: ['AoG'] }; }), 'warn', /without Sparks reviews/, 'doneReviews'));
  assert(hasC(mut((o, k) => { o.received = { [k]: { HG: '2026-02-30' } }; }), 'error', /Date received/, 'received'));
  assert(!has(mut((o, k) => { o.received = { [k]: { HG: 'no date' } }; }), 'error', /./) && !has(mut((o, k) => { o.received = { [k]: { HG: '' } }; }), 'error', /./), '"no date" and empty are fine');
  assert(hasC(mut((o, k) => { o.received = { [k]: { ZZ: '2026-09-16' } }; }), 'warn', /not in the list of books/, 'received'));
  assert(has(mut((o, k) => { o.givenNoDate = { [k]: { a: 1 } }; }), 'error', /cannot open this file|Given, no date/), 'a map where a list belongs is an error (the app cannot open it at all)');
  assert(hasC(mut((o, k) => { o.givenNoDate = { [k]: ['X'] }; }), 'warn', /no date given .*\(/, 'givenNoDate'));
  assert(hasC(mut((o, k) => { o.progressNoDate = { [k]: ['RJ1.1'] }; }), 'error', /No-date sign-offs/, 'progressNoDate'));
  assert(hasC(mut((o, k) => { o.progressNoDate = { [k]: { HG: ['RJ1.9'] } }; }), 'warn', /has no sign-off/, 'progressNoDate'));
  assert(hasC(mut((o, k) => { o.extraSheets = { [k]: { WR: 1 } }; }), 'error', /Added sheets/, 'extraSheets'));
  assert(hasC(mut((o, k) => { o.announcedNoDate = { [k]: 'X' }; }), 'error', /Told, no date/, 'announcedNoDate'));
  assert(!has(mut((o, k) => { o.announcedNoDate = { [k]: ['HG Red Jewel 2'] }; o.extraSheets = { [k]: ['WR'] }; o.doneBooks = { [k]: ['AoG'] }; o.doneReviews = { [k]: ['HG'] }; }), 'warn', /./), 'valid values are fine');
});
test('blueWings, blueOverrides, blueDrops: shape errors', () => {
  const w = { book: 'HG', slot: 2, n: 1, threshold: 6, earned: '2025-10-01', date: '2025-11-05', year: '2025-26' };
  assert(!has(mut((o, k) => { o.blueWings = { [k]: [w] }; }), 'error', /./), 'a valid placement is fine');
  assert(hasC(mut((o, k) => { o.blueWings = { [k]: [Object.assign({}, w, { slot: 5 })] }; }), 'error', /Blue Jewel placement/, 'blueWings'));
  assert(hasC(mut((o, k) => { o.blueOverrides = { [k]: [{ book: 'HG', n: 2, date: 'soon', note: '' }] }; }), 'error', /Blue Jewel given by hand/, 'blueOverrides'));
  assert(hasC(mut((o, k) => { o.blueOverrides = { [k]: [{ book: 'HG', n: 2, date: '2025-10-07' }] }; }), 'error', /Blue Jewel given by hand/, 'blueOverrides'));
  assert(hasC(mut((o, k) => { o.blueDrops = { [k]: ['1-2026-10-07'] }; }), 'error', /Dropped Blue Jewel/, 'blueDrops'));
  assert(hasC(mut((o, k) => { o.blueDrops = { [k]: ['2|2026-10-07', '1|2026-10-07'] }; }), 'warn', /dropped Blue Jewel list/i, 'blueDrops'));
  assert(!has(mut((o, k) => { o.blueDrops = { [k]: ['1|2026-10-07', '2|2026-10-07'] }; }), 'warn', /./), 'a valid list is fine');
});
test('records for people who are not on the roster are one warning, with the ids inside the parentheses', () => {
  const r = mut(o => { ['held', 'doneBooks', 'doneReviews', 'received', 'givenNoDate', 'progressNoDate', 'extraSheets', 'announcedNoDate', 'blueWings', 'blueOverrides', 'blueDrops'].forEach(k => { o[k] = { [GHOST]: k === 'held' ? { x: 1 } : k === 'received' ? { HG: '2026-09-16' } : k === 'progressNoDate' ? { HG: [] } : [] }; }); });
  assert(hasC(r, 'warn', /records refer to people who are not on the roster/, 'ghosts'), levels(r).join(' | '));
  r.findings.filter(f => f.level === 'warn').forEach(f => { if (f.msg.includes(GHOST)) assert(f.msg.indexOf(GHOST) > f.msg.indexOf('('), 'an id before the parenthesis would break the anonymizer\'s carried-over matching: ' + f.msg); });
});

// ---- R16 part 2: the shape of every config key ----
const cfgBad = (name, fn, re, level) => test('config: ' + name, () => { const r = mut(o => fn(o.config, o, Object.keys(o.roster.people)[0])); assert(hasC(r, level || 'error', re, 'config'), levels(r).join(' | ')); });
cfgBad('a book that is not an object', c => { c.books.HG = 'Hang Glider'; }, /Book HG/);
cfgBad('a book code of the wrong length', c => { c.books.TOOLONG = { name: 'x', emblem: '', group: 'Sparks' }; }, /Book TOOLONG/);
cfgBad('a book in a group that does not exist', c => { c.books.HG.group = 'Teens'; }, /Book HG.*group/);
test('config: a progress template whose parts are not lists is an error (the app cannot open it at all)', () => { const r = mut(o => { o.config.progress.Sparks.perBook = 'x'; }); assert(has(r, 'error', /progress template for Sparks|cannot open this file/), levels(r).join(' | ')); });
cfgBad('a progress block with no key', c => { c.progress.Sparks.perBook = [{ label: 'x', items: ['1'], awards: [] }]; }, /progress template for Sparks/);
['awardLists', 'exclude'].forEach(k => cfgBad(k + ' with a group that is not a list', c => { c[k].Sparks = 'x'; }, new RegExp(k)));
cfgBad('completion that is not an object', c => { c.completion = []; }, /completion/);
cfgBad('endOfYear that is not an object', c => { c.endOfYear = 5; }, /endOfYear/);
cfgBad('store method that is not known', c => { c.store.method = 'guess'; }, /store points/);
cfgBad('store minimum that is not a number', c => { c.store.min = 'a'; }, /store points/);
cfgBad('store weight below zero', c => { c.store.weights.awards = -1; }, /store points/);
cfgBad('a team plan color code that is not four of R B G Y -', (c, o, k) => { c.teamPlan.proj[k] = 'RBX-'; }, /team plan/);
cfgBad('a team plan lock on a quarter that does not exist', c => { c.teamPlan.locked = { Q9: '2026-10-01' }; }, /team plan/);
cfgBad('a team plan for someone not on the roster', c => { c.teamPlan.proj[GHOST] = 'RB--'; }, /team plan/, 'warn');
cfgBad('accepted team warnings of the wrong shape', c => { c.teamsOk = { repeats: 'x', uneven: ['Q7'] }; }, /accepted team warnings/);
cfgBad('an ignored To do item with no bars', c => { c.todoIgnored = ['no bars here']; }, /ignored To do item/);
cfgBad('a Drive folder that is not an object', c => { c.driveDirs = { club: 'folder' }; }, /Drive folder/);
cfgBad('a Drive folder with a number for an id', c => { c.driveDirs = { club: { id: 5, name: 'x' } }; }, /Drive folder/);
cfgBad('a report bundle with no items', c => { c.bundles = [{ name: 'x' }]; }, /report bundle/);
cfgBad('a book order that is a list', c => { c.bookOrder = ['AoG']; }, /book order/);
cfgBad('slide names that are not text', c => { c.slideNames = { a: 1 }; }, /slideNames/);
cfgBad('medRead that is not text', c => { c.medRead = { a: 1 }; }, /medRead/);
cfgBad('a club title that is a number', c => { c.clubTitle = 5; }, /clubTitle/);
cfgBad('a Cubbies detail setting that is not known', c => { c.cubbiesDetail = 'x'; }, /cubbiesDetail/);
test('config: an older T&T book setting and the legacy Drive keys are info, never an error or warning', () => {
  const r = mut(o => { o.config.tntBook = 'AoG'; o.config.driveDirs = { open: { id: 'a', name: 'b' }, data: null, slides: null }; });
  assert(!has(r, 'error', /./) && !has(r, 'warn', /./), levels(r).join(' | ')); assert(r.findings.some(f => f.level === 'info' && f.check === 'config' && /tntBook/.test(f.msg)), 'an info line for tntBook');
});
test('config: a setting this app does not know is kept and reported as one info line', () => {
  const r = mut(o => { o.config.futureThing = 1; o.config.otherThing = 2; });
  assert(!has(r, 'error', /./) && !has(r, 'warn', /./)); assert(r.findings.some(f => f.level === 'info' && f.check === 'config' && /2 settings this app does not know are kept as they are \(futureThing, otherThing\)/.test(f.msg)), levels(r).join(' | '));
});
test('config: good values of every kind are accepted', () => {
  const r = mut(o => { Object.assign(o.config, { clubTitle: 'Club', driveKeepName: 'x', cubbiesDetail: 'unit', slideNames: { a: 'b' }, medRead: {}, medPrinted: {}, bookOrder: { Sparks: ['HG'] }, bundles: [{ name: 'x', items: [{ report: 'a' }] }] }); o.config.teamPlan.locked = { Q1: '2026-10-01' }; o.config.driveDirs = { club: { id: 'a', name: 'b' }, slides: null }; o.config.todoIgnored = ['a|b|c']; });
  assert(!has(r, 'error', /./) && !has(r, 'warn', /./), levels(r).join(' | '));
});
test('every section and every config key the code uses has a file check, and the rule bites', () => {
  const src = fs.readdirSync(path.join(__dirname, '..')).filter(f => /\.js$/.test(f)).map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  const used = new Set((src.match(/config\.([A-Za-z]+)/g) || []).map(m => m.slice(7))); used.delete('js');
  Object.keys(require('../catalog.js').defaultConfig()).forEach(k => used.add(k)); ['driveKeepName', 'bookOrder', 'cubbiesDetail', 'clubTitle', 'slideNames', 'bundles', 'medRead', 'medPrinted', 'teamPlan', 'tntBook'].forEach(k => used.add(k));
  const missingCfg = [...used].filter(k => !V.CHECKED_CONFIG.includes(k)); assert.deepStrictEqual(missingCfg, [], 'config keys with no file check: ' + missingCfg.join(', '));
  const missingSec = S.SECTIONS.filter(k => !V.CHECKED_SECTIONS.includes(k)); assert.deepStrictEqual(missingSec, [], 'sections with no file check: ' + missingSec.join(', '));
  assert.deepStrictEqual(V.CHECKED_SECTIONS.filter(k => !S.SECTIONS.includes(k)), [], 'a check for a section that no longer exists');
  assert.deepStrictEqual(S.SECTIONS.concat(['futureSection']).filter(k => !V.CHECKED_SECTIONS.includes(k)), ['futureSection'], 'a new section would be caught');
});

// ---- R17 task 4: the kept export record is checked ----
const goodCap = (o, kid) => { const names = o.roster.pcCols.concat(['Favourite Snack TEST']); return { at: '2026-11-03T19:00:00.000Z', hash: 'abc12345-100', header: names.slice(), names, rows: 3, blankRows: 1, ids: { [kid]: 1 }, loose: [names.map((n, i) => (i === names.length - 1 ? 'x' : ''))] }; };
const withCap = fn => mut((o, kid) => { o.roster.pcExport = goodCap(o, kid); if (fn) fn(o.roster.pcExport, o, kid); });
test('pcExport is checked: a clean record gives the two info lines, and nothing else', () => {
  const clean = withCap(); assert(!clean.findings.some(f => f.level !== 'info'), levels(clean).join(' | '));
  assert(hasC(clean, 'info', /Planning Center export kept: 3 rows \(1 belongs to nobody, 1 blank\), \d+ columns \(1 not used by this app: “Favourite Snack TEST”\)/, 'roster'), levels(clean).join(' | '));
  const earlier = mut((o, kid) => { const c = o.roster.pcExport = goodCap(o, kid); c.names = o.roster.pcCols.slice(0, -1); c.header = c.names.slice(); c.loose = [c.names.map(() => '')]; });      // the export lacks the last column the file still holds values for
  assert(hasC(earlier, 'info', /1 column holds values from an earlier export \(/, 'roster'), levels(earlier).join(' | '));
});
test('pcExport is checked: each corruption has its finding', () => {
  assert(hasC(withCap(c => { c.names = c.names.slice(0, 2); c.loose = [['', '']]; }), 'error', /export record: fewer stored names than header cells/, 'roster'));
  assert(hasC(withCap(c => { c.names[1] = c.names[0]; c.header = c.names.slice(); }), 'error', /export record: the name .* appears twice/, 'roster'));
  assert(hasC(withCap(c => { c.ids['7000001_Nobody_Here'] = 1; c.rows = 4; }), 'warn', /export record: 1 person .* is not on the roster/, 'roster'));
  assert(hasC(withCap(c => { c.loose = [[1, 2]]; }), 'error', /export record: a kept row is not/, 'roster'));
  assert(hasC(withCap(c => { c.loose = [['a', 'b']]; }), 'error', /export record: a kept row is not/, 'roster'));
  assert(hasC(withCap(c => { c.rows = 99; }), 'warn', /export record: the row counts do not add up/, 'roster'));
  const extra = withCap(c => { c.futureBit = 1; }); assert(hasC(extra, 'info', /not known to this app.*roster › pcExport › futureBit/, 'file'), levels(extra).join(' | ')); assert(!extra.findings.some(f => f.level !== 'info'));
  assert(hasC(withCap(c => { c.ids = []; }), 'error', /export record/, 'roster'));
});
test('a version 6 file with people and no export record says so (info)', () => {
  const r = mut(o => { o.version = 6; }); assert(hasC(r, 'info', /No Planning Center export has been captured in this file yet/, 'roster'), levels(r).join(' | '));
  assert(!hasC(mut(o => { o.version = 5; }), 'info', /No Planning Center export has been captured/), 'an older file is not told this');
});

// ---- R17 task 2: unknown keys are listed, never errors ----
test('unknown keys are listed as one info line, and are not errors or warnings', () => {
  const r = mut((o, kid) => { o.futureThing = { a: 1 }; o.roster.futureKey = [1]; });
  assert(hasC(r, 'info', /2 parts of this file are not known to this app and are kept as they are \(futureThing, roster › futureKey\)/, 'file'), levels(r).join(' | '));
  assert(!r.findings.some(f => f.level !== 'info' && /not known to this app/.test(f.msg)));
  const r2 = mut((o, kid) => { o.roster.people[kid].extraBit = 'x'; }); assert(hasC(r2, 'info', /1 part of this file is not known to this app and is kept as it is \(person › extraBit\)/, 'file'), levels(r2).join(' | '));
});

// ---- R16 task 3: roster checks ----
test('roster: people or the roster itself is not an object', () => {
  assert(hasC(mut(o => { o.roster.people = []; }), 'error', /The roster's people/, 'roster'));
  assert(hasC(mut(o => { o.roster = []; }), 'error', /The roster's people/, 'roster'));
});
test('roster: column lists are text without repeats; pcAsOf and pcSource', () => {
  assert(hasC(mut(o => { o.roster.pcCols = ['A', 'A']; }), 'error', /column names.*twice/, 'roster'));
  assert(hasC(mut(o => { o.roster.cols = ['x_A', 5]; }), 'error', /column names/, 'roster'));
  assert(hasC(mut(o => { o.roster.pcAsOf = '2026-13-01'; }), 'warn', /as of/, 'roster'));
  assert(hasC(mut(o => { o.roster.pcSource = 5; }), 'warn', /as of|source/, 'roster'));
  assert(!has(mut(o => { delete o.roster.pcAsOf; delete o.roster.pcSource; }), 'warn', /as of|source/), 'absent is fine');
});
test('roster: a packed pc list of the wrong length says both counts', () => {
  const r = mut((o, k) => { o.roster.people[k].pc = o.roster.people[k].pc.slice(1); });
  const n = testFile().roster.pcCols.length;
  assert(hasC(r, 'error', new RegExp('has ' + (n - 1) + ' Planning Center values but the file names ' + n + ' columns'), 'roster'), levels(r).join(' | '));
});
test('roster: owned fields are text, flags are 1 or 0, dates are real', () => {
  assert(hasC(mut((o, k) => { o.roster.people[k].v.x_Notes = 5; }), 'error', /owned field/, 'roster'));
  assert(hasC(mut((o, k) => { o.roster.people[k].v.x_Active = 'yes'; }), 'error', /x_Active/, 'roster'));
  assert(hasC(mut((o, k) => { o.roster.people[k].v['x_noteam:Q1'] = 'maybe'; }), 'error', /x_noteam:Q1/, 'roster'));
  assert(hasC(mut((o, k) => { o.roster.people[k].v.x_Uni_GivenDate = 'soon'; }), 'error', /x_Uni_GivenDate/, 'roster'));
  assert(hasC(mut((o, k) => { o.roster.people[k].v.x_FirstSeen = '2026-02-30'; }), 'error', /x_FirstSeen/, 'roster'));
  assert(!has(mut((o, k) => { Object.assign(o.roster.people[k].v, { x_Active: '0', x_NoPhotos: '1', 'x_noteam:Q2': '1', x_Uni_GivenDate: '2026-10-07' }); }), 'error', /./), 'good values are fine');
});
test('roster: an owned field the app does not know, and the older ID field, are one info line each, with no person named', () => {
  const r = mut((o, k) => { o.roster.people[k].v.x_Mystery = 'a'; });
  assert(hasC(r, 'info', /1 owned field this app does not know is kept as it is \(x_Mystery\)/, 'roster'), levels(r).join(' | '));
  const r2 = mut((o, k) => { o.roster.people[k].v.x_ClubberID = k; });
  assert(hasC(r2, 'info', /older copy of their own ID/, 'roster'));
  const r3 = mut((o, k) => { o.roster.people[k].v.x_ClubberID = '7000009_Test_Kid'; }); assert(hasC(r3, 'info', /differs from the person's id; it is kept/, 'roster'), 'a different value is kept and reported');
  assert(!r2.findings.some(f => f.level === 'info' && /older copy of their own ID/.test(f.msg) && f.msg.includes(Object.keys(testFile().roster.people)[0])), 'no id in the message');
  assert(!has(mut((o, k) => { o.roster.people[k].v['ov:Phone'] = '1'; }), 'info', /does not know/), 'reserved prefixes are known');
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
