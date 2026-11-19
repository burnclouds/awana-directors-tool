// N1: Coaches binder notes sheets (a block for each club night of a quarter). Invented test club only.
// Usage: node test/coaches-notes.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const R = require('../reports.js'); require('../reports-season.js');
const Model = require('../model.js'), Season = require('../season.js'), Cal = require('../calendar.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const td = path.join(__dirname, '..', '..', 'test-data'), json = fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f));
const season = Season.fromJson(fs.readFileSync(path.join(td, json), 'utf8')), master = Model.fromRoster(season.roster);
const calendar = season.calendar, def = R.LIST.find(r => r.id === 'noteSheets');
const ctx = (q, extra) => Object.assign({ master, calendar, settings: { quarter: q, club: 'Test club' }, opts: {} }, extra || {});
const run = (q, extra) => def.render(ctx(q, extra));
const count = (h, re) => (h.match(re) || []).length, P = R.NIGHTS_PER_PAGE, rowsFor = R.rowsFor;
const nightsOf = q => calendar.filter(r => r.Type !== 'Event' && r['No Club'] !== '1' && r.Quarter === q);
test('A0 the report exists, takes the quarter, and exports its layout constants', () => { assert(def, 'noteSheets in LIST'); assert.deepStrictEqual(def.opts, ['quarter']); assert(P >= 11 && rowsFor(P) >= 1); });
test('A1 one block per club night; events and No Club nights are not blocks', () => {
  for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) assert.strictEqual(count(run(q), /class="nblock"/g), nightsOf(q).length, q);
  const h = run('Q3'); calendar.filter(r => r.Quarter === 'Q3' && (r.Type === 'Event' || r['No Club'] === '1') && r.Theme).forEach(r => assert(!h.includes(r.Theme), 'not ' + r.Theme));
});
test('A3 a whole quarter is ONE page (even the longest TEST quarter); a very long one shares its nights evenly over more pages', () => {
  for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) { const h = run(q); assert.strictEqual(count(h, /<section class="sheet/g), 1, q + ' on one page'); assert.strictEqual(count(h, /<table class="nsheet"/g), 1); assert(h.includes('Coaches notes, ' + q + ', page 1 of 1')); }
  const long = Array.from({ length: 30 }, (_, i) => ({ Date: new Date(Date.UTC(2026, 8, 2 + 7 * i)).toISOString().slice(0, 10), Quarter: 'Q1', Type: 'Club', 'No Club': '', Theme: 'T' + i })), h = run('Q1', { calendar: long }), pages = Math.ceil(30 / P);
  assert.strictEqual(count(h, /<section class="sheet/g), pages); for (let i = 1; i <= pages; i++) assert(h.includes('page ' + i + ' of ' + pages));
  const per = h.split('<section class="sheet').slice(1).map(s => count(s, /class="nblock"/g)); assert.strictEqual(per.reduce((a, b) => a + b, 0), 30); assert(Math.max(...per) - Math.min(...per) <= 1, 'even: ' + per);
});
test('A4 heading has the date (M/D, no year) and the theme', () => {
  const r = nightsOf('Q1')[0], h = run('Q1'), [y, m, d] = r.Date.split('-'); assert(h.includes('<b>' + (+m) + '/' + (+d) + '</b>'), 'M/D date, no year');
  if (r.Theme) assert(h.includes(r.Theme.replace(/&/g, '&amp;')));
});
test('A5 a night with no theme prints cleanly; A6 a theme is escaped', () => {
  const cal = [{ Date: '2026-09-13', Quarter: 'Q1', Type: 'Club', 'No Club': '', Theme: '' }, { Date: '2026-09-20', Quarter: 'Q1', Type: 'Club', 'No Club': '', Theme: '<b>Hats & Caps</b>' }];
  const h = run('Q1', { calendar: cal }); assert(h.includes('<b>9/13</b></div></th>') &&!/undefined/.test(h)); assert(h.includes('&lt;b&gt;Hats &amp; Caps&lt;/b&gt;') && !h.includes('<b>Hats'));
});
test('A7 column titles once; each night has its write-in rows (eight blank cells, plus the date cell on the first); no inputs', () => {
  for (const q of ['Q2', 'Q4']) {
    const h = run(q), n = nightsOf(q).length; assert(!/<input/.test(h));
    assert.strictEqual(count(h, /<th>Night<\/th><th colspan="2" class="r1">Workers Not Available<\/th><th class="gp"><\/th><th class="c3">Item \/ Size<\/th><th>Group<\/th><th>Name<\/th><th class="r2">Paid<\/th><th class="gp"><\/th><th class="c8">Notes<\/th>/g), 1, 'titles once, with a gap between the three major columns');
    assert.strictEqual(count(h, /<tr class="nr[^"]*"/g), n * rowsFor(n), q + ' rows'); assert.strictEqual(count(h, /<th rowspan="\d+" class="nhead">/g), n);
    assert.strictEqual(count(h, /<tr class="nr[^"]*" style="height:[\d.]+in">(<th[^>]*>.*?<\/th>)?(<td[^>]*><\/td>){9}<\/tr>/g), n * rowsFor(n), 'nine cells in every row: 2 workers, gap, item/size, group, name, paid, gap, notes');
    assert.strictEqual(count(h, /<tbody class="ngap">/g), n - 1, 'a gap between nights, none after the last');
  }
  assert(rowsFor(7) >= rowsFor(14) && rowsFor(14) >= 2);
});
test('A8/A9 no nights and no calendar say so', () => {
  const none = run('Q1', { calendar: calendar.filter(r => r.Quarter !== 'Q1') }); assert(/class="empty"[^>]*>[^<]*Q1/.test(none) && !/<section/.test(none));
  assert(/Load a calendar/.test(run('Q1', { calendar: [] })));
});
test('A10 printed-on line', () => { assert(run('Q1', { today: '2026-11-18' }).includes('Printed 11/18/26')); assert(!/Printed/.test(run('Q1'))); });
test('A12 the quarter comes from settings, not opts.date', () => { const d = nightsOf('Q2')[0].Date; assert.strictEqual(count(run('Q1', { opts: { date: d } }), /class="nblock"/g), nightsOf('Q1').length); });
test('A13/A14 standard Coaches binder ends with it; a saved bundle is untouched', () => {
  const b = R.bundlesOf(null); assert.strictEqual(b[1].items[b[1].items.length - 1].report, 'noteSheets'); assert(!b[0].items.concat(b[2].items).some(i => i.report === 'noteSheets'));
  assert.deepStrictEqual(R.bundlesOf({ config: { bundles: [{ name: 'Coaches binder', items: [{ report: 'binderAll' }] }] } })[0].items.map(i => i.report), ['binderAll']);
});
test('A15 runBundle for the Coaches binder holds the blocks and the volunteers page', () => {
  const h = R.runBundle(ctx('Q2'), R.bundlesOf(null)[1], 'Q2'); assert.strictEqual(count(h, /class="nblock"/g), nightsOf('Q2').length); assert(/Volunteer Contact List/.test(h));
});
console.log('\n' + passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
