// N57 (Mike, 2026-11-20): ONE report, Progress sheets, with a Books choice: the child's current book (what goes in the class binder), every book the child has started (the records files), or BLANK sheets
// (a few per class, so a new child already has a sheet: usually 3). A blank carries the class and club year, no name, a write-in book ("Book: ________") and no dates or awards. The class binder bundle can add blanks after each
// class's sheets. The old Achievement record is the same report with "every book" (kept as a hidden alias, so saved bundles and the Person tab's Print record keep working). Invented test club only. Usage: node test/progress-books-blank.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Season = require('../season.js'), M = require('../model.js'), Reports = require('../reports.js'); require('../reports-season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).filter(f => /TEST.*\.json$/.test(f)).sort().pop();
const s = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')), master = M.fromRoster(s.roster);
const ROOM = 'Sparks A', kidsOf = room => master.people.filter(p => M.isActive(p) && M.isClubber(p) && M.room(p) === room), two = kidsOf(ROOM)[0], twoId = two[M.X.ID];
s.handbooks[twoId] = 'WR 261014'; s.progress[twoId] = { HG: { 'RJ1.1': '2026-09-23' }, WR: { 'RJ1.1': '2026-10-14' } };      // one child who has started two Sparks books
const run = (id, opts, bundle) => { const ctx = { master, settings: { quarter: 'Q2', club: 'AWANA Club 26-27', dates: '' }, calendar: s.calendar, season: s, today: '2026-11-20', opts: opts || {} }; return bundle ? Reports.runBundle(ctx, bundle, 'Q2') : Reports.LIST.find(r => r.id === id).render(ctx); };
const pages = h => (h.match(/class="onepage"/g) || []).length, blanks = h => (h.match(/<h2>_{6,} —/g) || []).length;
const classes = [...new Set(master.people.filter(p => M.isActive(p) && M.isClubber(p) && ['Cubbies', 'Sparks', 'T&T'].includes(M.groupOf(M.room(p)))).map(p => M.room(p)))];

test('the report list: Progress sheets has the Books option; Achievement records is a hidden alias', () => {
  const ps = Reports.LIST.find(r => r.id === 'progressSheets'), ac = Reports.LIST.find(r => r.id === 'achievement'); assert(ps.opts.includes('books'), 'opts: ' + ps.opts.join()); assert(ac && ac.hidden === true, 'achievement stays resolvable but is hidden from the picker');
});
test('Books = current (the default): one page per child, whatever books they have started', () => { assert.strictEqual(pages(run('progressSheets', { room: ROOM })), kidsOf(ROOM).length); assert.strictEqual(pages(run('progressSheets', { room: ROOM, books: 'current' })), kidsOf(ROOM).length); });
test('Books = every book started: a child with two books gets two pages, everyone else one', () => {
  const h = run('progressSheets', { room: ROOM, books: 'all' }); assert.strictEqual(pages(h), kidsOf(ROOM).length + 1, 'pages ' + pages(h)); assert(/Book: <b>Hangglider<\/b>/.test(h) && /Book: <b>Wingrunner<\/b>/.test(h), 'both books appear');
});
test('the Achievement alias is the same report with every book, for one child chosen by group and child', () => {
  assert.strictEqual(pages(run('achievement', { group: 'Sparks', room: '', kid: twoId })), 2); assert.strictEqual(pages(run('achievement', { group: 'Sparks', room: '', kid: kidsOf(ROOM)[1][M.X.ID] })), 1);
});
test('Books = blank: 3 blank sheets for the class by default, with the class and year, no name, a write-in book and no dates', () => {
  const h = run('progressSheets', { room: ROOM, books: 'blank' }); assert.strictEqual(pages(h), 3); assert.strictEqual(blanks(h), 3, 'every sheet is a blank'); assert(h.includes(ROOM + ' · 2026-27'), 'class and year');
  assert(kidsOf(ROOM).every(p => !h.includes(M.fullName(p))), 'no child name'); assert(/Book: <b>________<\/b>/.test(h), 'the book is a write-in');
  assert.deepStrictEqual([...h.matchAll(/<span class="dt">([^<]+)<\/span>/g)].map(m => m[1]), [], 'no date in any box'); assert(!/EARNED|\bHG\b|\bWR\b|\bSS\b/.test(h.replace(/<[^>]*>/g, ' ')), 'no earned tag and no book code');
  assert(/Wings\/Red 1/.test(h), 'the Sparks blank has the Wings/Red 1 cell');
});
test('the blank count is an option, and All classes gives that many for each class', () => {
  assert.strictEqual(pages(run('progressSheets', { room: ROOM, books: 'blank', blanks: 5 })), 5); assert.strictEqual(pages(run('progressSheets', { room: ROOM, books: 'blank', blanks: 0 })), 3, '0 in the report means the default 3');
  assert.strictEqual(pages(run('progressSheets', { room: '', books: 'blank' })), 3 * classes.length, 'classes: ' + classes.length);
});
test('blank sheets are made for Cubbies and T&T too (a write-in book), and never for Puggles', () => {
  const h = run('progressSheets', { room: '', books: 'blank' }); assert(blanks(h) === 3 * classes.length, 'every sheet is a blank: ' + blanks(h) + ' of ' + pages(h)); assert(h.includes('Cubbies · 2026-27') && /T&amp;T (Boys|Girls) \(Group [AB]\) · 2026-27/.test(h), 'Cubbies and T&T blanks'); assert(!h.includes('Puggles'), 'no Puggles');
});
test('the class binder can add blanks after each class\'s sheets: the children first, then the blanks', () => {
  const b = { name: 'x', items: [{ report: 'progressSheets', room: ROOM, blanks: 3 }] }, h = run('', {}, b), n = kidsOf(ROOM).length; assert.strictEqual(pages(h), n + 3);
  const heads = [...h.matchAll(/<h2>([^<]*)<\/h2>/g)].map(m => m[1]); assert(heads.slice(0, n).every(x => !/^_{6,}/.test(x)) && heads.slice(n).every(x => /^_{6,} —/.test(x)), 'order: ' + heads.slice(n - 1).join(' | '));
  assert.strictEqual(pages(run('', {}, { name: 'x', items: [{ report: 'progressSheets', room: ROOM, blanks: 0 }] })), n); assert.strictEqual(pages(run('', {}, { name: 'x', items: [{ report: 'progressSheets', room: ROOM }] })), n, 'no blanks unless asked');
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
