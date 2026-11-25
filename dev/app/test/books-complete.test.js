// Per-book T&T progress, the upgrade of an older file, books finished before (another club), and the awards for finished books. Invented test club only.
// Usage: node test/books-complete.test.js
const assert = require('assert');
const S = require('../season.js'), Catalog = require('../catalog.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const T = Catalog.tntTemplate(), D = '2026-10-14';
const coreSigns = (s, id, book, date) => T.perBook.filter(b => !/^(SV|GD)/.test(b.key)).forEach(b => b.items.forEach(i => S.setProgress(s, id, book, b.key + '.' + i, date)));
const sparkSigns = (s, id, book, date) => Catalog.sparksTemplate().perBook.forEach(b => b.items.forEach(i => S.setProgress(s, id, book, b.key + '.' + i, date)));

test('an older file (T&T under common, plain award names) opens with per-book T&T: dates move to the child\'s T&T book, award names get the book code', () => {
  const old = JSON.parse(S.toJson(S.blank('2025-26')));
  const oldT = { common: ['SZ1', 'SZ2', 'BE1', 'SV1'].map(k => ({ key: k, label: k, items: ['1'], awards: [k === 'BE1' ? 'Blue Emblem 1' : k] })), perBook: [] };
  old.config.progress['T&T'] = oldT; old.config.books = { AoG: { name: 'Agents of Grace', emblem: '', group: 'T&T' }, HG: { name: 'Hangglider', emblem: 'Green', group: 'Sparks' } };
  old.config.awardLists['T&T'] = ['Start Zone 1', 'Blue Emblem 1', 'Silver 1', 'Alpha Award Medallion'];
  old.progress = { a: { common: { 'SZ1.1': '2025-10-01', 'BE1.1.1': '2025-10-08', 'SV1.1.1': '2025-10-15', 'FLT.1': '2025-10-01' } } };
  old.awards = { '2025-10-15': { a: ['Blue Emblem 1'] } }; old.given = { a: { 'Blue Emblem 1': '2025-10-22', 'Start Zone 1': '2025-10-08' } };
  old.givenNoDate = { a: ['Blue Emblem 1'] }; old.handbooks = { a: 'AoG 250910' };
  const s = S.fromJson(JSON.stringify(old));
  assert.deepStrictEqual(s.config.progress['T&T'].common.map(b => b.key), ['SZ']); assert.strictEqual(s.config.progress['T&T'].perBook.length, 16);
  assert.deepStrictEqual(s.progress.a.common, { 'SZ.1': '2025-10-01', 'FLT.1': '2025-10-01' }, 'Start Zone (now one block, section 1) and Flight stay common');
  assert.deepStrictEqual(s.progress.a.AoG, { 'BE1.1.1': '2025-10-08', 'SV1.1.1': '2025-10-15' });
  assert.deepStrictEqual(s.awards['2025-10-15'].a, ['AoG Blue Emblem 1']); assert.strictEqual(s.given.a['AoG Blue Emblem 1'], '2025-10-22'); assert(!('Start Zone 1' in (s.given.a || {})), 'a record of Start Zone is removed on open: it is not an award (N23)');
  assert.strictEqual(S.isGivenNoDate(s, 'a', 'AoG Blue Emblem 1'), true);
  assert(s.config.awardLists['T&T'].includes('AoG Blue Emblem 1') && s.config.awardLists['T&T'].includes('DoG Blue Emblem 1') && !s.config.awardLists['T&T'].includes('Blue Emblem 1'));
  assert(s.config.books.DoG && s.config.books.GiA && s.config.books.EoG && s.config.books.AS, 'the other books join');
  const again = S.fromJson(S.toJson(s)); assert.deepStrictEqual(again.progress, s.progress, 'opening it again changes nothing'); assert.deepStrictEqual(again.given, s.given);
});
test('a child whose handbook is another T&T book gets their dates under that book', () => {
  const old = JSON.parse(S.toJson(S.blank('2025-26')));
  old.config.progress['T&T'] = { common: [{ key: 'BE1', label: 'x', items: ['1'], awards: ['Blue Emblem 1'] }], perBook: [] };
  old.config.books = { AoG: { name: 'a', emblem: '', group: 'T&T' }, DoG: { name: 'Discovery of Grace', emblem: '', group: 'T&T' } };
  old.progress = { a: { common: { 'BE1.1': '2025-10-08' } } }; old.handbooks = { a: 'DoG 250910' };
  assert.deepStrictEqual(S.fromJson(JSON.stringify(old)).progress.a, { DoG: { 'BE1.1': '2025-10-08' } });
});
test('a book is finished when every core section is dated; Silver / Gold and reviews are not needed', () => {
  const s = S.blank('2026-27'); coreSigns(s, 't', 'AoG', D);
  assert.deepStrictEqual(S.finishedBooks(s, 't').map(b => b.book + ':' + b.date), ['AoG:' + D]);
  const u = S.blank('2026-27'); coreSigns(u, 'u', 'AoG', D); S.setProgress(u, 'u', 'AoG', 'BE1.1.1', ''); assert.deepStrictEqual(S.finishedBooks(u, 'u'), [], 'one missing section');
  sparkSigns(s, 'k', 'HG', D); assert.deepStrictEqual(S.finishedBooks(s, 'k').map(b => b.book), ['HG']);
});
test('T&T awards by number of books, in any order: Alpha, Excellence, Challenge, then the Timothy Trophy', () => {
  const s = S.blank('2026-27'); coreSigns(s, 't', 'EoG', '2026-10-01');
  assert.deepStrictEqual(S.completionAwards(s, 't', 'T&T').map(a => a.award), ['Alpha Award Medallion']);
  coreSigns(s, 't', 'AoG', '2026-12-01'); coreSigns(s, 't', 'GiA', '2027-02-01'); coreSigns(s, 't', 'DoG', '2027-04-01');
  assert.deepStrictEqual(S.completionAwards(s, 't', 'T&T').map(a => a.award + '@' + a.date), ['Alpha Award Medallion@2026-10-01', 'Excellence Award Medallion@2026-12-01', 'Challenge Book Award Medallion@2027-02-01', 'Timothy Trophy Award@2027-04-01']);
  assert(S.suggestedAwards(s, 't', 'T&T').some(a => a.award === 'Timothy Trophy Award'), 'offered for announcing');
});
test('Sparks: 1st Book, 2nd Book, then the Sparky Award Sculpture', () => {
  const s = S.blank('2026-27'); ['HG', 'WR', 'SS'].forEach((b, i) => sparkSigns(s, 'k', b, '2026-1' + i + '-01'));
  assert.deepStrictEqual(S.completionAwards(s, 'k', 'Sparks').map(a => a.award), ['1st Book Award Medallion', '2nd Book Award Medallion', 'Sparky Award Sculpture']);
});
test('books finished before count, their awards are presumed received, and only a newly earned one is offered', () => {
  const s = S.blank('2026-27'); S.setBookDone(s, 'k', 'HG', true); S.setBookDone(s, 'k', 'WR', true);
  assert.deepStrictEqual(S.completionAwards(s, 'k', 'Sparks'), [], 'two books from elsewhere earn nothing here');
  sparkSigns(s, 'k', 'SS', D);
  assert.deepStrictEqual(S.completionAwards(s, 'k', 'Sparks').map(a => a.award), ['Sparky Award Sculpture'], 'the third book earns the trophy');
  assert.deepStrictEqual(S.finishedBooks(s, 'k').map(b => b.book + (b.before ? '*' : '')).sort(), ['HG*', 'SS', 'WR*']);
});
test('Cubbies books can be ticked as finished before; there are no Cubbies awards for the count', () => {
  const s = S.blank('2026-27'); S.setBookDone(s, 'c', 'HC', true); S.setBookDone(s, 'c', 'AS', true);
  assert.deepStrictEqual(S.finishedBooks(s, 'c').map(b => b.book).sort(), ['AS', 'HC']); assert.deepStrictEqual(S.completionAwards(s, 'c', 'Cubbies'), []);
  assert.throws(() => S.setBookDone(s, 'c', 'ZZ', true), /not one of your books/);
});
test('the finished-before list is written only when used, round trips, is logged by name and Undo restores it', () => {
  const s = S.blank('2026-27'); assert(!('doneBooks' in JSON.parse(S.toJson(s))));
  const before = S.snapshot(s); S.setBookDone(s, 'k', 'HG', true); S.setBookDone(s, 'k', 'WR', true);
  const t = S.fromJson(S.toJson(s)); assert.deepStrictEqual(t.doneBooks, { k: ['HG', 'WR'] });
  const ch = S.diff(before, S.snapshot(s)); assert(/books finished before: HG, WR/.test(S.describe(ch[0], id => id)));
  S.setBookDone(s, 'k', 'HG', false); S.setBookDone(s, 'k', 'WR', false); assert.deepStrictEqual(s.doneBooks, {});
});
test('earlier-year marking includes completion awards, and the same award is not offered again afterwards', () => {
  const s = S.blank('2026-27'); s.calendar = [{ Date: '2026-09-16', Quarter: 'Q1' }]; coreSigns(s, 't', 'AoG', '2025-03-01');
  assert(S.pastYearAwards(s, 't').includes('Alpha Award Medallion') && S.pastYearAwards(s, 't').includes('AoG Blue Emblem 1'));
  S.markPastYearsGiven(s, '2026-11-04'); assert.deepStrictEqual(S.suggestedAwards(s, 't', 'T&T'), []);
});
test('Sparks in order (the standard): the award follows the book, so Wingrunner alone earns the 2nd Book medallion', () => {
  const one = b => { const s = S.blank('2026-27'); sparkSigns(s, 'k', b, D); return S.completionAwards(s, 'k', 'Sparks').map(a => a.award); };
  assert.deepStrictEqual(one('HG'), ['1st Book Award Medallion']); assert.deepStrictEqual(one('WR'), ['2nd Book Award Medallion']); assert.deepStrictEqual(one('SS'), ['Sparky Award Sculpture']);
  const t = S.blank('2026-27'); t.config.sparksBooks = 'together'; sparkSigns(t, 'k', 'WR', D);
  assert.deepStrictEqual(S.completionAwards(t, 'k', 'Sparks').map(a => a.award), ['1st Book Award Medallion'], 'All Together: by the number of books');
});
test('catch-up: a Sparks child who finishes two books in one year is offered the second book\'s jewels too (they carry the book code)', () => {
  const s = S.blank('2026-27'); const rj = Catalog.sparksTemplate().perBook.find(b => b.key === 'RJ1');
  rj.items.forEach(i => S.setProgress(s, 'k', 'HG', 'RJ1.' + i, '2026-10-01')); S.addAward(s, '2026-10-08', 'k', 'HG Red Jewel 1'); S.setGiven(s, 'k', 'HG Red Jewel 1', '2026-10-15');
  rj.items.forEach(i => S.setProgress(s, 'k', 'WR', 'RJ1.' + i, '2026-11-05'));
  assert(S.suggestedAwards(s, 'k', 'Sparks').some(a => a.award === 'WR Red Jewel 1'), 'offered');
  assert(!S.suggestedAwards(s, 'k', 'Sparks').some(a => a.award === 'HG Red Jewel 1'), 'the first stays done');
});
test('Blue Jewels carry the book the child has; a later book change does not offer the same jewel again', () => {
  const s = S.blank('2026-27'); s.handbooks.k = 'HG 260916';
  assert.strictEqual(S.jewelName(s, 'k', 1), 'HG Blue Jewel 1'); s.handbooks.n = ''; assert.strictEqual(S.jewelName(s, 'n', 2), 'Blue Jewel 2', 'no book yet: no code');
  assert.strictEqual(S.baseAward(s, 'WR Blue Jewel 3'), 'Blue Jewel 3'); assert.strictEqual(S.baseAward(s, 'Blue Jewel 3'), 'Blue Jewel 3');
  s.handbooks.k = 'WR 261120'; assert.strictEqual(S.jewelName(s, 'k', 3), 'WR Blue Jewel 3');
});
test('the book code is left off when it is the child\'s own book, and shown for another', () => {
  const s = S.blank('2026-27'); s.handbooks.k = 'WR 260916';
  assert.strictEqual(S.awardLabel(s, 'k', 'WR Red Jewel 1'), 'Red Jewel 1'); assert.strictEqual(S.awardLabel(s, 'k', 'HG Red Jewel 1'), 'HG Red Jewel 1');
  assert.strictEqual(S.awardLabel(s, 'k', 'Alpha Award Medallion'), 'Alpha Award Medallion');
  s.config.yearBook['T&T'] = 'AoG'; assert.strictEqual(S.awardLabel(s, 't', 'AoG Blue Emblem 1'), 'Blue Emblem 1'); assert.strictEqual(S.awardLabel(s, 't', 'DoG Blue Emblem 1'), 'DoG Blue Emblem 1');
});
test('a Pilot Wing is shown by its book\'s color, for any book', () => {
  const s = S.blank('2026-27'); s.handbooks.k = 'WR 260916';
  assert.strictEqual(S.awardLabel(s, 'k', 'WR Pilot Wing'), 'Blue Pilot Wing'); assert.strictEqual(S.awardLabel(s, 'k', 'HG Pilot Wing'), 'Green Pilot Wing'); assert.strictEqual(S.awardLabel(s, 'k', 'SS Pilot Wing'), 'Red Pilot Wing');
  assert.strictEqual(S.awardLabel(s, 'k', 'WR Red Jewel 1'), 'Red Jewel 1', 'jewels unchanged');
});
test('an older file: plain jewel names get the book they were finished in (Red / Green) or the handbook (Blue); lists and the template follow', () => {
  const old = JSON.parse(S.toJson(S.blank('2025-26')));
  const tpl = Catalog.sparksTemplate(); tpl.perBook.forEach(b => { b.awards = b.awards.map(a => a.replace('{book} Red', 'Red').replace('{book} Green', 'Green')); });
  old.config.progress.Sparks = tpl; old.config.awardLists.Sparks = ['Flight 3:16', 'Blue Jewel 1', 'Red Jewel 1', 'HG Pilot Wing'];
  old.handbooks = { a: 'WR 260916' };
  old.progress = { a: { HG: { 'RJ1.1': '2025-10-01', 'RJ1.2': '2025-10-01', 'RJ1.3': '2025-10-01', 'RJ1.4': '2025-10-01' } } };
  old.awards = { '2025-10-08': { a: ['Red Jewel 1', 'Blue Jewel 1'] } }; old.given = { a: { 'Red Jewel 1': '2025-10-15', 'Blue Jewel 1': '2025-10-15' } };
  const s = S.fromJson(JSON.stringify(old));
  assert.deepStrictEqual(s.awards['2025-10-08'].a.sort(), ['HG Red Jewel 1', 'WR Blue Jewel 1'], 'Red from the book finished, Blue from the handbook');
  assert.deepStrictEqual(Object.keys(s.given.a).sort(), ['HG Red Jewel 1', 'WR Blue Jewel 1']);
  assert(/\{book\} Red Jewel 1/.test(s.config.progress.Sparks.perBook.find(b => b.key === 'RJ1').awards[1]));
  assert(s.config.awardLists.Sparks.includes('HG Red Jewel 1') && !s.config.awardLists.Sparks.includes('Red Jewel 1'));
  const again = S.fromJson(S.toJson(s)); assert.deepStrictEqual(again.given, s.given); assert.deepStrictEqual(again.awards, s.awards);
});
test('Start Zone is one block of two sections with no award: an earlier file (two blocks, one section each) moves its dates; nothing is given for it', () => {
  const T0 = Catalog.tntTemplate(); T0.common = [{ key: 'SZ1', label: 'Start Zone 1', items: ['1'], awards: ['Start Zone 1'] }, { key: 'SZ2', label: 'Start Zone 2', items: ['1'], awards: ['Start Zone 2'] }];      // the 1.50.13 to 1.50.16 shape
  const old = JSON.parse(S.toJson(S.blank('2026-27'))); old.config.progress['T&T'] = T0; old.config.awardLists['T&T'] = ['Start Zone 1', 'Start Zone 2', 'AoG Blue Emblem 1'];
  old.progress = { a: { common: { 'SZ1.1': '2026-09-23', 'SZ2.1': '2026-09-30' } }, b: { common: { 'SZ1.1': '2026-09-23' } } }; old.given = { a: { 'Start Zone 1': '2026-09-23' } };
  const s = S.fromJson(JSON.stringify(old));
  assert.deepStrictEqual(s.config.progress['T&T'].common, [{ key: 'SZ', label: 'Start Zone', items: ['1', '2'], awards: [] }]);
  assert.deepStrictEqual(s.progress.a.common, { 'SZ.1': '2026-09-23', 'SZ.2': '2026-09-30' }); assert.deepStrictEqual(s.progress.b.common, { 'SZ.1': '2026-09-23' });
  assert.deepStrictEqual(s.config.awardLists['T&T'], ['AoG Blue Emblem 1'], 'no longer award names to pick'); assert(!('Start Zone 1' in ((s.given || {}).a || {})), 'a record of an award that is not one is removed on open (N23)');
  assert.deepStrictEqual(S.completedBlocks(s, 'a', 'T&T').map(b => [b.key, b.awards, b.date]), [['SZ', [], '2026-09-30']], 'finished on its last section, nothing to announce');
  assert.deepStrictEqual(S.completedBlocks(s, 'b', 'T&T'), [], 'one section is not finished');
  assert.deepStrictEqual(S.suggestedAwards(s, 'a', 'T&T'), []); const again = S.fromJson(S.toJson(s)); assert.deepStrictEqual(again.progress, s.progress);
});
test('received dates per book: stored by book, omitted while empty, round trip, logged by name; the handbook string still supplies its own book\'s date', () => {
  const s = S.blank('2026-27'); assert(!('received' in JSON.parse(S.toJson(s)))); s.handbooks.k = 'WR 260916 note';
  assert.strictEqual(S.receivedOf(s, 'k', 'WR'), '2026-09-16', 'from the handbook string'); assert.strictEqual(S.receivedOf(s, 'k', 'SS'), '');
  const before = S.snapshot(s); S.setReceived(s, 'k', 'SS', '2026-09-23'); S.setReceived(s, 'k', 'WR', '2025-09-17'); assert.strictEqual(S.receivedOf(s, 'k', 'WR'), '2025-09-17', 'Progress wins');
  const t = S.fromJson(S.toJson(s)); assert.deepStrictEqual(t.received, { k: { SS: '2026-09-23', WR: '2025-09-17' } });
  assert(/received: SS /.test(S.describe(S.diff(before, S.snapshot(s)).find(c => c.p[0] === 'received'), x => x)), 'logged by name');
  S.setReceived(s, 'k', 'SS', ''); S.setReceived(s, 'k', 'WR', ''); assert.deepStrictEqual(s.received, { k: { WR: '' } }, 'WR was in the handbook string: clearing is remembered'); assert.strictEqual(S.receivedOf(s, 'k', 'WR'), '', 'and the string\'s date does not come back'); S.setHandbook(s, 'k', { code: 'WR', date: '', note: '' }); S.setReceived(s, 'k', 'WR', ''); assert.deepStrictEqual(s.received, {}, 'nothing to override: nothing stored'); assert.throws(() => S.setReceived(s, 'k', 'ZZ', '2026-01-01'), /not one of your books/);
});
test('the Sparks book is worked out: the latest-received one not finished; else the handbook; else the book after the last finished (Judah: WR finished, so SkyStormer); else the first started', () => {
  const s = S.blank('2026-27'); assert.strictEqual(S.sparksCurrent(s, 'k'), '', 'nothing says');
  S.setReceived(s, 'k', 'HG', '2025-09-17'); assert.strictEqual(S.sparksCurrent(s, 'k'), 'HG'); S.setReceived(s, 'k', 'WR', '2026-01-14'); assert.strictEqual(S.sparksCurrent(s, 'k'), 'WR', 'the latest received');
  sparkSigns(s, 'k', 'WR', D); assert.strictEqual(S.sparksCurrent(s, 'k'), 'HG', 'WR finished: HG is the latest received that is not finished');
  const j = S.blank('2026-27'); j.handbooks.j = "WR '25-26 / SS 260923"; sparkSigns(j, 'j', 'WR', D); assert.strictEqual(S.sparksCurrent(j, 'j'), 'SS', 'finishing WR puts the child in SS even though HG was never recorded');
  const g = S.blank('2026-27'); S.setBookDone(g, 'k', 'HG', true); assert.strictEqual(S.sparksCurrent(g, 'k'), 'WR', 'a book finished before moves them on');
  const m = S.blank('2026-27'); S.setProgress(m, 'k', 'WR', 'R.1', D); assert.strictEqual(S.sparksCurrent(m, 'k'), 'WR', 'the book they have started');
  const t = S.blank('2026-27'); t.config.sparksBooks = 'together'; S.setReceived(t, 'k', 'HG', D); assert.strictEqual(S.sparksCurrent(t, 'k'), '', 'not used with All Together');
});
test('childBook uses the worked-out book for Sparks (so jewels, labels and slide columns follow it) and the handbook for the other groups', () => {
  const s = S.blank('2026-27'); s.handbooks.k = 'WR 260916'; sparkSigns(s, 'k', 'WR', D); assert.strictEqual(S.childBook(s, 'k'), 'SS'); assert.strictEqual(S.jewelName(s, 'k', 1), 'SS Blue Jewel 1');
  s.handbooks.t = 'AoG 260916'; assert.strictEqual(S.childBook(s, 't'), 'AoG');
});
function assertReportBook(s, group, code) {
  assert.strictEqual(S.childBook(s, 'k', group), code);
  const name = code ? s.config.books[code].name : 'No Book Yet';
  assert.deepStrictEqual(S.handbookCounts(s, ['k'], group), { [name]: 1 });
}
test('the latest dated receipt selects the T&T book', () => {
  const s = S.blank('2026-27');
  S.setReceived(s, 'k', 'AoG', '2026-09-16');
  S.setReceived(s, 'k', 'DoG', D);
  assertReportBook(s, 'T&T', 'DoG');
});
test('a Cubbies received tick counts, and a dated receipt takes precedence', () => {
  const s = S.blank('2026-27');
  S.setReceived(s, 'k', 'AS', '', { noDate: true });
  assertReportBook(s, 'Cubbies', 'AS');
  S.setReceived(s, 'k', 'HC', D);
  assertReportBook(s, 'Cubbies', 'HC');
});
test('T&T receipt ties follow the configured book order', () => {
  const s = S.blank('2026-27');
  s.config.bookOrder = { 'T&T': ['DoG', 'AoG'] };
  S.setReceived(s, 'k', 'AoG', D);
  S.setReceived(s, 'k', 'DoG', D);
  assertReportBook(s, 'T&T', 'DoG');
});
test('cleared receipts and wrong-group or unknown keys do not count', () => {
  const s = S.blank('2026-27');
  S.setReceived(s, 'k', 'AoG', D);
  S.setReceived(s, 'k', 'AoG', '');
  s.received.k = { AoG: '', HC: D, ZZ: D };
  assertReportBook(s, 'T&T', '');
});
test('an explicit T&T handbook assignment wins over a receipt for another book', () => {
  const s = S.blank('2026-27');
  s.handbooks.k = 'AoG';
  S.setReceived(s, 'k', 'DoG', D);
  assertReportBook(s, 'T&T', 'AoG');
});
test('Cubbies and T&T report receipts take precedence over historical Sparks records', () => {
  const s = S.blank('2026-27');
  S.setReceived(s, 'k', 'HG', '2025-09-17');
  S.setReceived(s, 'k', 'HC', D);
  S.setReceived(s, 'k', 'AoG', D);
  assertReportBook(s, 'Cubbies', 'HC');
  assertReportBook(s, 'T&T', 'AoG');
  assert.strictEqual(S.childBook(s, 'k'), 'HG');
  assert.deepStrictEqual(S.handbookCounts(s, ['k']), { 'No Book Yet': 1 });
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
