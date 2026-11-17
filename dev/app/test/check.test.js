// Data checks (check.js): what is an error (an entry point refuses it), what only warns, and what a scan of the file finds. Invented test club only.
// Usage: node test/check.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Check = require('../check.js'), S = require('../season.js'), M = require('../model.js'), Todo = require('../todo.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).find(f => /TEST.*\.json$/.test(f));
const load = () => { const s = S.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')); return { season: s, master: M.fromRoster(s.roster), calendar: s.calendar }; };

test('dates: blank is fine; impossible or out-of-range dates are errors', () => {
  assert.strictEqual(Check.date(''), null); assert.strictEqual(Check.date('2026-10-28'), null);
  ['2026-02-30', '2026-13-01', '0002-10-28', '2200-01-01', '10/28/2026', 'soon'].forEach(v => assert.strictEqual(Check.date(v).level, 'error', v));
});
test('birthdates: month/day/year or ISO; a day that does not exist, a year before 1990 and a date in the future are errors', () => {
  assert.strictEqual(Check.birthdate('1/16/2020'), null); assert.strictEqual(Check.birthdate('2020-01-16'), null); assert.strictEqual(Check.birthdate(''), null);
  ['2/30/2020', '13/1/2020', '1/1/1850', 'yesterday'].forEach(v => assert.strictEqual(Check.birthdate(v).level, 'error', v));
  assert.strictEqual(Check.birthdate('1/1/2031', '2026-10-30').level, 'error'); assert.strictEqual(Check.birthdate('3/4/1984', '2026-10-30', false), null, 'an adult born in 1984 is fine'); assert.strictEqual(Check.birthdate('3/4/1984', '2026-10-30', true).level, 'error', 'a child born in 1984 is not'); assert.strictEqual(Check.birthdate('1/1/2026', '2026-10-30'), null);
});
test('phone boxes may hold several numbers, labels, names and extensions (all invented numbers); only a number that is really too short or long warns', () => {
  const ok = ['(513) 555-0147', '513-555-0147; 513-555-0199', '513-555-0147 & 937-555-0100', '513-555-0147 and 937-555-0100', '513-555-0147 / 937-555-0100', '513-555-0147, 937-555-0100',
    'Mom 513-555-0147', 'Pat Rivera 513-555-0147', 'Mom: 513-555-0147; Dad: 937-555-0100', '513-555-0147 ext. 12', '513-555-0147 x12', '+1 513 555 0147', '555-0147', 'cell 513.555.0147\n937.555.0100'];
  ['N/A','n/a','NA','None','not applicable'].forEach(v => assert.strictEqual(Check.phone(v), null, 'N/A is accepted: ' + v)); assert.strictEqual(Check.phone('N').level, 'warn', 'a lone N is still a typo'); assert.strictEqual(Check.phone('N/A', true).level, 'warn', 'a child\'s contact number is never N/A'); assert.strictEqual(Check.field('Please provide the primary phone number for a parent.', 'N/A', undefined, true).level, 'warn'); assert.strictEqual(Check.field('Mobile Phone Number', 'N/A', undefined, false), null, 'an adult may');
  assert.strictEqual(Check.phone('937/555/0142'), null, 'area/prefix/line with slashes is one number'); assert.strictEqual(Check.phone('Mom 937 / 555 / 0142; Dad 513/555/0100 ext. 12'), null); assert.strictEqual(Check.phone('555-0142/937-555-0100'), null, 'slashes still separate two numbers'); assert.strictEqual(Check.phone('937/555/014').level, 'warn', 'a short last group still warns');
  ok.forEach(v => assert.strictEqual(Check.phone(v), null, 'should be fine: ' + JSON.stringify(v)));
  const bad = ['555', '1', '555-01', '513-555-0147; 55', '5135550147513555019912', 'Mom', 'call me'];
  bad.forEach(v => { const r = Check.phone(v); assert.strictEqual(r && r.level, 'warn', 'should warn: ' + JSON.stringify(v)); });
  assert.strictEqual(Check.phone(''), null, 'an empty box is not checked here');
  assert.strictEqual(Check.field('Mobile Phone Number', 'Mom: 513-555-0147; Dad: 937-555-0100'), null);
});
test('emails are errors when malformed (several in one box are fine); phones and grades only warn; team colors are errors', () => {
  assert.strictEqual(Check.email('a@example.com, b@example.org'), null); assert.strictEqual(Check.email('no-at-sign').level, 'error'); assert.strictEqual(Check.email('x@').level, 'error');
  assert.strictEqual(Check.phone('(513) 555-0147'), null); assert.strictEqual(Check.phone('555').level, 'warn');
  assert.strictEqual(Check.grade('Kindergarten'), null); assert.strictEqual(Check.grade('3rd'), null); assert.strictEqual(Check.grade('Fourteenth').level, 'warn');
  assert.strictEqual(Check.teamColor('Red'), null); assert.strictEqual(Check.teamColor('Purple').level, 'error'); assert.strictEqual(Check.teamColor(''), null);
  assert.strictEqual(Check.field('Mobile Phone Number', '1').level, 'warn'); assert.strictEqual(Check.field('Home Email Address', 'bad').level, 'error'); assert.strictEqual(Check.field('Birthdate', '2/30/2020').level, 'error'); assert.strictEqual(Check.field('Last Name', 'anything'), null);
});
test('books: a code is recognized in any capitals (and an older two-letter spelling); an unknown code only warns; the list itself is checked (2 or 3 letters, no duplicates, a name, a real group)', () => {
  const books = { HG: { name: 'Hangglider', emblem: 'Green', group: 'Sparks' }, AoG: { name: 'Agents of Grace', emblem: '', group: 'T&T' } };
  assert.strictEqual(Check.bookCode('HG', books), null); assert.strictEqual(Check.bookCode('hg', books), null); assert.strictEqual(Check.bookCode('Hang', books).level, 'warn', 'a book NAME in the code box does not match (H and A are not HG)'); assert.strictEqual(Check.bookCode('AOG', books), null);
  const u = Check.bookCode('ZZ', books); assert(u && u.level === 'warn' && /not one of your books/.test(u.msg)); assert.strictEqual(Check.bookCode('', books), null); assert.strictEqual(Check.bookCode('12', books).level, 'warn');
  assert.deepStrictEqual(Check.bookList(books), []);
  const bad = Check.bookList({ hg: { name: 'x' }, AB: { name: '' }, CD: { name: 'y', group: 'Teens' }, ABCD: { name: 'z' }, A: { name: 'z' }, Ab: { name: 'dup' } }).map(b => b.code); assert.deepStrictEqual(bad.sort(), ['A', 'AB', 'ABCD', 'Ab', 'CD']);      // hg is fine now: any capitals; A and ABCD are the wrong length; Ab repeats AB
});
test('scan: an unknown handbook code and progress in an unknown book are found by child; known ones are not; the standard book list passes clean', () => {
  const c = load(), id = Object.keys(c.season.roster.people).find(i => M.isActive(c.master.people.find(p => p[M.X.ID] === i)));
  assert.strictEqual(Check.scan(c).filter(f => f.area === 'Books').length, 0, 'the test club starts clean');
  c.season.handbooks[id] = 'QQ 261014 note'; const f = Check.scan(c).filter(x => x.area === 'Books'); assert.strictEqual(f.length, 1); assert.strictEqual(f[0].id, id); assert(/"QQ" is not one of your books/.test(f[0].msg));
  c.season.handbooks[id] = 'HG 261014'; c.season.progress[id] = { ZZ: { 'R.1': '2026-10-14' } }; assert(/progress is recorded for "ZZ"/.test(Check.scan(c).filter(x => x.area === 'Books')[0].msg));
});
test('scan: invalid birthdate, email and team color on a person are found (and an inactive person is not nagged about)', () => {
  const c = load(), p = c.master.people.find(x => M.isActive(x) && M.isClubber(x)), q = c.master.people.filter(x => M.isActive(x) && M.isClubber(x))[1];
  p[M.C.BDAY] = '2/30/2020'; p['team:Q2'] = 'Purple'; M.setField(q, 'Home Email Address', 'not an email');
  const f = Check.scan(c).filter(x => x.area === 'People'); assert(f.some(x => x.id === p[M.X.ID] && x.field === M.C.BDAY && x.level === 'error')); assert(f.some(x => x.id === p[M.X.ID] && x.field === 'team:Q2')); assert(f.some(x => x.id === q[M.X.ID] && /email/i.test(x.field)));
  M.setActive(p, false); assert(!Check.scan(c).some(x => x.id === p[M.X.ID]), 'inactive people are left alone');
});
test('To do: "Unrecognized book" lists the child with the code, pointing at the handbook field; fixing the code (or adding the book) clears it', () => {
  const c = load(), id = Object.keys(c.season.roster.people).find(i => M.isActive(c.master.people.find(p => p[M.X.ID] === i)));
  c.season.handbooks[id] = 'QQ 261014'; const todo = () => Todo.compute({ master: c.master, season: c.season, calendar: c.calendar, quarter: 'Q2', today: '2026-11-04' }).groups.find(g => g.id === 'books');
  const g = todo(); assert(g && g.items.length === 1 && g.items[0].id === id && /QQ/.test(g.items[0].text) && g.items[0].fields.includes('handbook'), JSON.stringify(g));
  c.season.config.books.QQ = { name: 'Quest', emblem: 'Purple', group: 'Sparks' }; assert.strictEqual(todo(), undefined, 'adding the book clears the item');
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
