// BACKLOG B9 (print notes from the 2026-11-14 review, section 4): the Achievement Record has no "Given" box for Flight 3:16; Pace watch says it is leader-only;
// Awards earned lets several children share a page; Dates attended counts club nights only; a slide with too many names cannot run off the bottom unannounced.
// Invented TEST data only (test-data/ ... TEST.json), changed in memory.
// Usage: node test/print-b9-items.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Season = require('../season.js'), M = require('../model.js'), Reports = require('../reports.js'), Slides = require('../slides.js');
require('../reports-season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).filter(f => /TEST.*\.json$/.test(f)).sort().pop();
const load = () => { const s = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')); return { s, master: M.fromRoster(s.roster) }; };
const sparks = m => m.people.filter(p => M.isClubber(p) && M.isActive(p) && M.groupOf(M.room(p)) === 'Sparks');
const render = (x, id, opts, master) => Reports.LIST.find(r => r.id === id).render({ master: master || x.master, settings: { quarter: 'Q2', club: 'AWANA Club' }, calendar: x.s.calendar, season: x.s, opts: opts || {} });
const count = (h, re) => (h.match(re) || []).length;
const text = h => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

// ---- 1. Flight 3:16 has no Given box on the Achievement Record ----
test('B9.1 the Achievement Record prints no Given box on the Flight 3:16 row, but keeps them on the awards that are handed out', () => {
  const x = load(), p = sparks(x.master)[0], html = render(x, 'achievement', { group: 'Sparks', kid: p[M.X.ID] });
  // The record sheet (recordSheet): the Flight 3:16 block is two table rows (6 sections, 4 boxes a row) with no award rail; the next row is Rank, which has Given boxes.
  const rows = html.split('<tr '), i = rows.findIndex(r => /<b>Flight 3:16 Booklet<\/b>/.test(r)); assert(i > 0, 'the Flight 3:16 row is there');
  const flight = rows[i] + rows[i + 1];
  assert(!/class="gv/.test(flight), 'no Given box on Flight 3:16'); assert(count(flight, /<td class="so/g) === 6, 'its six section boxes are still there');
  assert(count(html, /class="gv gd/g) > 0, 'other awards still have their Given box');
});

// ---- 2. Pace watch says it is for leaders only ----
test('B9.2 every Pace watch page says it is for leaders only, not to be handed to parents', () => {
  const x = load(), html = render(x, 'paceWatch', { group: 'Sparks' }), sheets = count(html, /<section class="sheet/g);
  assert(sheets > 0, 'there are pace pages');
  assert.strictEqual(count(html, /<p class="sub">[^<]*For leaders only: do not hand this page to parents/g), sheets, 'each page says it in its subtitle');
});

// ---- 3. Awards earned: several children to a page ----
const eight = () => {
  const x = load(), kids = sparks(x.master).slice(0, 8); assert.strictEqual(kids.length, 8);
  kids.forEach(p => { ['Red Jewel 1', 'Blue Jewel 1', 'Green Jewel 2'].forEach(a => Season.addAward(x.s, '2026-10-21', p[M.X.ID], a)); });
  return { x, kids, master: { people: kids } };
};
test('B9.3 eight children with three awards each fit on at most two pages, every child named once', () => {
  const { x, kids, master } = eight(), html = render(x, 'awardsByChild', { group: 'Sparks' }, master), sheets = count(html, /<section class="sheet/g);
  assert(sheets >= 1 && sheets <= 2, sheets + ' sheets');
  assert.strictEqual(count(html, /<div class="achild">/g), 8);
  kids.forEach(p => assert.strictEqual(count(text(html), new RegExp(M.fullName(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' ', 'g')), 1, M.fullName(p)));
  assert.strictEqual(count(html, /<h2>/g), sheets, 'every page has a title for the page-pick row');
});
test('B9.3 a child block is never split: each .achild sits wholly inside one sheet, and every sheet has an h2 for the page-pick row', () => {
  const { x, master } = eight(), html = render(x, 'awardsByChild', { group: 'Sparks' }, master), parts = html.split('<section class="sheet').slice(1);
  parts.forEach(sec => { assert(/<h2>/.test(sec)); assert.strictEqual(count(sec, /<div class="achild">/g), count(sec, /<\/table>|No awards earned yet/g)); });
  assert(fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8').split('\n').some(l => /\.achild/.test(l) && /break-inside:\s*avoid/.test(l)), 'print CSS keeps a child block together');
});
test('B9.3 a child with many awards prints every one of them, and a single chosen child still gets the one-child page', () => {
  const { x, kids, master } = eight(), id = kids[0][M.X.ID];
  for (let i = 1; i <= 4; i++) ['HG', 'WR', 'SS'].forEach(k => ['Red', 'Blue', 'Green'].forEach(c => [1, 2, 3, 4].forEach(n => Season.addAward(x.s, '2026-10-2' + i, id, k + ' ' + c + ' Jewel ' + n))));
  const html = render(x, 'awardsByChild', { group: 'Sparks' }, master), mine = Season.awardLedger(x.s, id, 'Sparks', x.s.calendar).filter(r => !r.carried).length;
  assert(mine > 30, 'the test child has ' + mine + ' awards');
  const block = html.split('<div class="achild">').find(b => b.indexOf(M.fullName(kids[0])) === 6 || b.startsWith('<h3>' + M.fullName(kids[0])));
  assert(block && count(block.split('</table>')[0], /<tr>/g) - 1 >= mine, 'all ' + mine + ' award rows printed');
  const one = render(x, 'awardsByChild', { group: 'Sparks', kid: id }, master);
  assert.strictEqual(count(one, /<section class="sheet/g), 1); assert(new RegExp('<h2>' + M.fullName(kids[0]) + ' — Awards</h2>').test(one));
});

// ---- 4. Dates attended counts club nights, not events ----
test('B9.4 Dates attended counts a club night but not a present mark on an Event date, and says so', () => {
  const x = load(); x.s.attendance = {}; const p = sparks(x.master)[0], id = p[M.X.ID], ev = '2026-10-03', night = '2026-10-07';
  assert(x.s.calendar.some(r => r.Date === ev && r.Type === 'Event') && x.s.calendar.some(r => r.Date === night && r.Type === 'Club night'), 'fixture calendar');
  Season.setMark(x.s, ev, id, 'a', true, 'Sparks'); Season.setMark(x.s, night, id, 'a', true, 'Sparks');
  const html = render(x, 'attendDates', { group: 'Sparks', room: M.room(p) }), rowHtml = html.split('<tr>').find(r => r.includes(M.fullName(p)));
  assert(rowHtml, 'the child has a row'); const cells = rowHtml.replace(/<\/td>/g, '|').replace(/<[^>]*>/g, '').split('|').map(c => c.trim());
  assert.strictEqual(cells[2], '1', 'one night: ' + cells.join(' / ')); assert(/10\/07\/26/.test(cells[3]) && !/10\/03\/26/.test(cells[3]), cells[3]);
  assert.strictEqual(Season.totals(x.s, id, x.s.calendar).year.a, 1, 'the same count as the child\'s own total');
  assert(/events are not counted/.test(html));
});

// ---- 5. Slides: text fits the 1080 slide or says it does not ----
const names = n => Array.from({ length: n }, (_, i) => ({ n: 'Child' + String(i).padStart(2, '0') + ' X.', a: 'Blue Jewel 1' }));
const bottom = (r, top) => top + r.lines.length * r.fs * Slides.GAP;
test('B9.5 45 names in one Sparks column: the text never passes the bottom of the 1080 slide; the cut is marked and counted', () => {
  const r = Slides.fitColumn(names(45), 552, Slides.H - Slides.BOTTOM - Slides.TOP_MULTI, Slides.approxMeasure);
  assert(bottom(r, Slides.TOP_MULTI) <= Slides.H - Slides.BOTTOM + 0.01, 'bottom at ' + bottom(r, Slides.TOP_MULTI));
  assert(r.fs >= Slides.FS_MIN, 'never smaller than the readable minimum'); assert(r.hidden > 0, 'some names do not fit at 13px'); assert(r.lines[r.lines.length - 1] === '+ ' + r.hidden + ' more not shown');
  assert.strictEqual(r.lines.length - 1 + r.hidden, 45, 'every name is either drawn or counted');
});
test('B9.5 31 names in one column fit at the readable minimum with nothing cut; a few names stay at the full 24px', () => {
  const avail = Slides.H - Slides.BOTTOM - Slides.TOP_MULTI, a = Slides.fitColumn(names(31), 552, avail, Slides.approxMeasure), b = Slides.fitColumn(names(5), 552, avail, Slides.approxMeasure);
  assert.strictEqual(a.hidden, 0); assert(bottom(a, Slides.TOP_MULTI) <= Slides.H - Slides.BOTTOM); assert.strictEqual(b.fs, 24); assert.strictEqual(b.lines.length, 5);
});
test('B9.5 a single-club slide (three columns) holds 90 names; 120 names are cut and marked in the last column', () => {
  const avail = Slides.H - Slides.BOTTOM - Slides.TOP_SINGLE, ok = Slides.fitColumns(names(90), 544, avail, Slides.approxMeasure), over = Slides.fitColumns(names(120), 544, avail, Slides.approxMeasure);
  assert.strictEqual(ok.hidden, 0); assert(over.hidden > 0 && over.out[2][over.out[2].length - 1] === '+ ' + over.hidden + ' more not shown');
  [ok, over].forEach(r => r.out.forEach(c => assert(bottom({ lines: c, fs: r.fs }, Slides.TOP_SINGLE) <= Slides.H - Slides.BOTTOM + 0.01)));
});
test('B9.5 buildSlides warns when a slide cannot show everyone, and stays quiet otherwise', () => {
  const x = load(), kids = sparks(x.master);
  const pending = (s, id, g) => [{ award: 'Blue Jewel 1', earned: '2026-10-21', held: false }];
  const many = x.master.people.filter(p => M.isClubber(p) && M.isActive(p)), big = { people: [] };
  for (let i = 0; i < 45; i++) { const q = Object.assign({}, kids[0]); q[M.X.ID] = 'T' + i; q[M.C.FIRST] = 'Kid' + String(i).padStart(2, '0'); big.people.push(q); }
  const w = Slides.buildSlides(x.s, big, '2026-10-21', { pending }).warnings; assert(w.some(t => /more awards than fit/.test(t)), w.join(' | '));
  const calm = Slides.buildSlides(x.s, { people: kids.slice(0, 3) }, '2026-10-21', { pending }).warnings; assert(!calm.some(t => /more awards than fit/.test(t)));
  assert(many.length > 0);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
