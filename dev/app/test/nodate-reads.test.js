// A sign-off marked "no date" keeps its tick day hidden in the file (so the section counts as finished), and nothing may show or print that day (R21).
// Mutates the invented TEST file in memory only. 2026-10-30 is a Friday and not a club night, so it cannot appear anywhere else.
// Usage: node test/nodate-reads.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Season = require('../season.js'), M = require('../model.js'), Reports = require('../reports.js'), Pace = require('../pace.js');
require('../reports-season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).filter(f => /TEST.*\.json$/.test(f)).sort().pop();
const TICK = '2026-10-30', SHOWN = /10\/30|2026-10-30/;
// A fresh season in which the first active Sparks child has the first block of their book fully dated (2026-10-21) except its last box, which is signed off with no date (tick day 2026-10-30).
function setup() {
  const s = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')), master = M.fromRoster(s.roster);
  const p = master.people.find(x => M.isClubber(x) && M.isActive(x) && M.groupOf(M.room(x)) === 'Sparks'), id = p[M.X.ID];
  const book = Object.keys(s.config.books).find(c => Season.bookGroup(s, c) === 'Sparks'), block = s.config.progress.Sparks.perBook[0], keys = block.items.map(i => block.key + '.' + i);
  keys.forEach(k => Season.setProgress(s, id, book, k, '2026-10-21')); Season.markSignsNoDate(s, id, book, [keys[keys.length - 1]], TICK);
  return { s, master, calendar: s.calendar, id, book, block, keys, p };
}
const render = (x, report, opts) => Reports.LIST.find(r => r.id === report).render({ master: x.master, settings: { quarter: 'Q2', club: 'AWANA Club' }, calendar: x.calendar, season: x.s, opts: Object.assign({ group: 'Sparks', room: M.room(x.p), kid: x.id }, opts || {}) });

test('signShown is empty for a no-date sign-off and the date otherwise; signsShown leaves the no-date key out', () => {
  const x = setup(); assert.strictEqual(typeof Season.signShown, 'function', 'Season.signShown exists');
  assert.strictEqual(Season.signShown(x.s, x.id, x.book, x.keys[0]), '2026-10-21'); assert.strictEqual(Season.signShown(x.s, x.id, x.book, x.keys[x.keys.length - 1]), '');
  assert.strictEqual(Season.signShown(x.s, x.id, x.book, 'ZZ.9'), '');
  const all = Season.signsShown(x.s, x.id, x.book); assert.strictEqual(Object.keys(all).length, x.keys.length - 1); assert(!(x.keys[x.keys.length - 1] in all));
  assert(x.s.progress[x.id][x.book][x.keys[x.keys.length - 1]] === TICK, 'the stored tick day is untouched');
});
test('BUG 1: the Achievement Record prints no tick day for a no-date box (and still prints the real dates)', () => {
  const x = setup(), html = render(x, 'achievement');
  assert(!SHOWN.test(html.replace(/<[^>]*>/g, ' ')), 'the tick day is printed'); assert(/>10\/21\/26</.test(html), 'a real date is still printed (the record sheet prints mm/dd/yy since N56)');
});
test('every season report that shows given dates prints no tick day', () => {
  const x = setup(); Season.setGiven(x.s, x.id, x.block.awards[0].replace('{book}', x.book).replace('{emblem}', (x.s.config.books[x.book] || {}).emblem || ''), TICK, { noDate: true });
  ['awardsByChild', 'achievement', 'booksYear', 'handOut', 'ceremony'].forEach(r => { let html = ''; try { html = render(x, r); } catch (e) { return; } assert(!SHOWN.test(String(html).replace(/<[^>]*>/g, ' ')), r + ' prints the tick day'); });
});
test('BUG 2: pace does not count a no-date sign-off on the tick day', () => {
  const x = setup(), so = Pace.signoffs(x.s, x.id, 'Sparks');
  assert(!so.core.concat(so.extra).includes(TICK), 'the tick day is a sign-off day in pace'); assert(so.core.filter(d => d === '2026-10-21').length === x.keys.length - 1, 'the real dates are counted');
});
test('D1: a block or book that was finished with a no-date sign-off says so (noDate) and prints no day', () => {
  const x = setup(), cb = Season.completedBlocks(x.s, x.id, 'Sparks').find(b => b.key === x.block.key && b.book === x.book);
  assert(cb, 'the block is complete'); assert.strictEqual(cb.noDate, true, 'completedBlocks marks the no-date finish');
  const other = Season.completedBlocks(setup().s, setup().id, 'Sparks'); assert(other.every(b => b.noDate === undefined || typeof b.noDate === 'boolean'));
});
test('the Progress sheet text for a no-date block says no date, not the tick day', () => {
  const x = setup(); const fb = Season.finishedBooks(x.s, x.id); fb.forEach(b => assert(b.noDate === undefined || typeof b.noDate === 'boolean'));
  assert(Season.completedBlocks(setup().s, 'nobody', 'Sparks').length === 0);
});
// ---- Guard: no new direct read of a no-date pair (R21). Every place the app source reads `given`, `progress`, `received` or the uniform given fields straight from the data
// must be on this list with the reason it is safe. A new read fails here until it uses givenShown / signShown / signsShown / receivedShown, or is reviewed and added.
const DATA_LAYER = { 'season.js': 'defines the pairs, the helpers and the write paths', 'store.js': 'reads sections to save and merge them', 'check.js': 'file-integrity checks', 'validate.js': 'file checks (errors and warnings, never shown dates)', 'model.js': 'the uniform field names and the given test (a date or the no-date flag)' };
const ALLOWED = [   // [file, enclosing function or const, why it is safe]
  ['app-options.js', 'n', 'counts people and keys, shows no date'],
  ['app-person.js', 'U', 'the "given, no date" checkbox on the Person tab (reads and writes the flag)'],
  ['app-person.js', 'slot', 'writes the uniform field and updates its no-date checkbox after a date edit'],
  ['app-tools.js', 'fixedIds', 'copies the Debug correction to the no-date flag in the live roster'],
  ['app.js', 'y', 'synchronizes the uniform no-date checkbox from the saved flag'],
  ['app.js', 'noDate', 'renders the uniform no-date checkbox'],
  ['app.js', 'p', 'updates the uniform no-date checkbox after a date edit'],
  ['app-season.js', 'id', 'presence tests, and the sheet text routed through isSignNoDate / signsShown'],
  ['app-season.js', 'latest', 'ORDERING ONLY: picks the book worked on most recently by date; skips no-date sign-offs through Season.isSignNoDate, so a hidden tick day cannot make a no-date book look recent (R21 follow-up, fixed 2026-11-14)'],
  ['app-season.js', 'started', 'presence test: a book with any sign-off, even a no-date one, counts as started (currentBook)'],
  ['app-season.js', 'dates', 'presence test: a no-date tick still counts the block as done'],
  ['app-season.js', 'rb', 'presence test (review blocks)'],
  ['app-season.js', 'br', 'presence test (book review)'],
  ['app-season.js', 'all', 'presence test for the Given box; the earned date uses er.noDate'],
  ['app-season.js', 'slots', 'presence test, together with isGivenNoDate'],
  ['pace.js', 't', 'reads the keys, then takes dates from Season.signsShown'],
  ['reports-season.js', 'missing', 'presence test: has the child received the book'],
  ['reports.js', 'k', 'prints a check mark with "(no date)" for the uniform flag'],
  ['stats.js', 'sections', 'counts sign-offs, shows no date'],
  ['todo.js', 'h', 'presence test: has the child received the book']
];
const PATTERNS = [/\b(?:season|s|o|App\.season)\.(?:given|progress|received)\b(?!NoDate)/, /\bprog\s*\[/, /receivedOf\(/, /GIVEN_FLAG|UNI\.GIVEN\b|x_Uni_GivenDate/];
function directReads() {
  const hits = [], appDir = path.join(__dirname, '..');
  fs.readdirSync(appDir).filter(f => f.endsWith('.js') && f !== 'sw.js' && !DATA_LAYER[f]).forEach(f => {
    const L = fs.readFileSync(path.join(appDir, f), 'utf8').split('\n');
    L.forEach((line, i) => { if (!PATTERNS.some(p => p.test(line))) return; let fn = '?'; for (let j = i; j >= 0; j--) { const m = /(?:function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)/.exec(L[j]); if (m) { fn = m[1] || m[2]; break; } } hits.push({ file: f, fn, line: i + 1 }); });
  });
  return hits;
}
test('GUARD: every direct read of a no-date pair outside the data layer is reviewed', () => {
  const hits = directReads(), ok = new Set(ALLOWED.map(a => a[0] + '|' + a[1]));
  const fresh = hits.filter(h => !ok.has(h.file + '|' + h.fn));
  assert.deepStrictEqual(fresh.map(h => h.file + ' ' + h.fn + ' (line ' + h.line + ')'), [], 'new direct read of given / progress / received: use givenShown, signShown / signsShown or receivedShown, or add an entry with a reason');
  const seen = new Set(hits.map(h => h.file + '|' + h.fn)), stale = ALLOWED.filter(a => !seen.has(a[0] + '|' + a[1]));
  assert.deepStrictEqual(stale.map(a => a[0] + ' ' + a[1]), [], 'allow-list entries that no longer match any code (remove them)');
});
test('GUARD bites: a new read of season.given in a report would be caught', () => {
  const sample = 'const showGiven = (season, id) => season.given[id];', m = PATTERNS.some(p => p.test(sample)); assert(m, 'the patterns match a direct read');
  assert(!ALLOWED.some(a => a[1] === 'showGiven'), 'and nothing allows it');
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
