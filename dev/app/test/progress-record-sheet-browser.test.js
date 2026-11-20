// The printed progress sheet (BACKLOG T6, recordSheet in reports-season.js): a real Chromium PDF on the invented TEST club, plus DOM checks under print emulation.
// Every section has a box of at least 0.9in x 0.28in, every award has two Given boxes, a no-date sign-off prints no day, an earned-not-given award carries the EARNED tag,
// a held award prints as plain earned (no HOLD), no announced date appears, Blue Jewels print, one PDF page per child for Sparks, T&T and Cubbies (also Cubbies by Bear Hug),
// and no page's text reaches the bottom margin. The T&T Discovery / Extra Credit hook (TNT_PENDING_AWARDS) is empty and tested.
// Usage: NODE_PATH=<dir with playwright> node test/progress-record-sheet-browser.test.js
const { chromium } = require('playwright');
const assert = require('assert'), fs = require('fs'), http = require('http'), os = require('os'), path = require('path'), cp = require('child_process');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
setTimeout(() => { console.log('timed out'); process.exit(2); }, 280000).unref();
const pagesOf = buf => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
const hasPdftotext = (() => { try { return cp.spawnSync('pdftotext', ['-v']).status !== null; } catch (e) { return false; } })();
const TICK = '2026-10-30', ANN = '2026-12-24';      // the hidden day of a no-date sign-off, and an announced date: neither may print
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto('http://localhost:' + server.address().port + '/index.html'); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  // Test data, in memory: for the first child of each group, the first block fully dated, its last box no-date; a second block complete and given with a date; a third complete and given no date;
  // a fourth complete and held; an announced date on a block that is still not given.
  const setup = await page.evaluate(([TICK, ANN]) => {
    const out = {}, S = Season, A = App, X = Model.X;
    ['Sparks', 'T&T', 'Cubbies'].forEach(g => {
      const p = A.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === g), id = p[X.ID], T = A.season.config.progress[g];
      const book = g === 'Sparks' ? 'HG' : g === 'T&T' ? 'AoG' : 'AS', em = (A.season.config.books[book] || {}).emblem || '', nm = b => b.awards.map(a => a.replace('{book}', book).replace('{emblem}', em))[b.awards.length - 1];
      const blocks = T.perBook.filter(b => b.awards.length && !/Pilot/.test(b.awards[0]));
      const sign = (b, d) => b.items.forEach(i => S.setProgress(A.season, id, book, b.key + '.' + i, d));
      const [b1, b2, b3, b4, b5] = blocks;
      sign(b1, '2026-10-21'); if (g !== 'Cubbies') S.markSignsNoDate(A.season, id, book, [b1.key + '.' + b1.items[b1.items.length - 1]], TICK); else S.markSignsNoDate(A.season, id, book, [b1.key + '.' + b1.items[0]], TICK);
      sign(b2, '2026-10-14'); S.setGiven(A.season, id, nm(b2), '2026-10-28');
      sign(b3, '2026-10-07'); S.setGiven(A.season, id, nm(b3), '2026-10-08', { noDate: true });
      sign(b4, '2026-09-30'); S.setHold(A.season, id, nm(b4), true);
      sign(b5, '2026-09-23'); S.addAward(A.season, ANN, id, nm(b5));
      A.season.handbooks[id] = book + ' 260916';
      out[g] = { id, book, room: Model.room(p), b1: nm(b1), b2: nm(b2), b3: nm(b3), b4: nm(b4), b5: nm(b5), name: Model.fullName(p) };
    });
    return out;      // no App.touch() here: on the Roster tab it leaves an unapplied draft, and the app then asks before the Reports tab can open (the data is already in memory)
  }, [TICK, ANN]);
  const show = async (room, report, group, kid) => { await page.evaluate(() => document.querySelector('.tabs button[data-tab="reports"]').click()); await page.evaluate(([r, v, g, k]) => { App.reportOptions({ room: r, group: g, kid: k || '' }); App.showReport(v); }, [room, report, group, kid]); await page.waitForTimeout(700); };
  const printed = async (room, report, group) => {
    await show(room, report, group);
    const sheets = await page.$$eval('#report .onepage', e => e.length);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(300);
    const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true }); await page.emulateMedia({ media: 'screen' }); await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    return { sheets, buf };
  };
  const lowest = buf => { const f = path.join(os.tmpdir(), 'awana-rec-' + process.pid + '.pdf'); fs.writeFileSync(f, buf); const o = cp.spawnSync('pdftotext', ['-bbox', f, '-'], { encoding: 'utf8' }).stdout; fs.unlinkSync(f);
    const per = []; let n = -1; o.split('\n').forEach(l => { if (/<page /.test(l)) { n++; per[n] = 0; } const m = /<word [^>]*yMax="([\d.]+)"/.exec(l); if (m) per[n] = Math.max(per[n], +m[1]); }); return per; };
  const text = buf => { const f = path.join(os.tmpdir(), 'awana-rect-' + process.pid + '.pdf'); fs.writeFileSync(f, buf); const o = cp.spawnSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }).stdout; fs.unlinkSync(f); return o; };
  const measures = {};
  for (const g of ['Sparks', 'T&T', 'Cubbies']) {
    await test(g + ': one PDF page per child, letter, text ends above the bottom margin', async () => {
      const { sheets, buf } = await printed(setup[g].room, 'progressSheets', g); assert(sheets >= 2, 'sheets on screen: ' + sheets); assert.strictEqual(pagesOf(buf), sheets, sheets + ' children but ' + pagesOf(buf) + ' pages');
      assert(/MediaBox\s*\[\s*0\s+0\s+612\s+792\s*\]/.test(buf.toString('latin1')), 'letter portrait');
      if (!hasPdftotext) { console.log('       (position check skipped: pdftotext is not installed)'); return; }
      const lo = lowest(buf); measures[g] = { pages: pagesOf(buf), lowest: Math.max(...lo) }; assert(Math.max(...lo) <= 792 - 36, 'text reaches ' + Math.max(...lo) + 'pt, margin starts at 756pt');
    });
  }
  await test('Cubbies by Bear Hug (cubbiesDetail section): four boxes a unit row, still one page per child', async () => {
    await page.evaluate(() => { Season.setCubbiesDetail(App.season, 'section'); App.touch(); });
    const { sheets, buf } = await printed(setup.Cubbies.room, 'progressSheets', 'Cubbies'); assert.strictEqual(pagesOf(buf), sheets);
    const n = await page.evaluate(() => document.querySelectorAll('#report .onepage:first-child td.so').length); assert(n >= 4 * 6 + 2 + 2, 'section boxes: ' + n);
    if (hasPdftotext) { const lo = lowest(buf); measures['Cubbies by Bear Hug'] = { pages: pagesOf(buf), lowest: Math.max(...lo) }; assert(Math.max(...lo) <= 756); }
    await page.evaluate(() => { Season.setCubbiesDetail(App.season, 'unit'); App.touch(); });
  });
  for (const g of ['Sparks', 'T&T', 'Cubbies']) {
    await test(g + ': every section box is at least 0.9in x 0.28in and every award has two Given boxes (print emulation)', async () => {
      await show(setup[g].room, 'progressSheets', g); await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await page.emulateMedia({ media: 'print' });
      const r = await page.evaluate(() => { const boxes = [...document.querySelectorAll('#report td.so')].map(t => t.getBoundingClientRect());
        return { n: boxes.length, small: boxes.filter(b => b.width < 0.9 * 96 - 0.5 || b.height < 0.28 * 96 - 0.5).length, an: document.querySelectorAll('#report td.an').length, gd: document.querySelectorAll('#report td.gv.gd').length, gi: document.querySelectorAll('#report td.gv.gi').length,
          bad: [...document.querySelectorAll('#report td.an')].filter(a => !(a.nextElementSibling && a.nextElementSibling.classList.contains('gd') && a.nextElementSibling.nextElementSibling && a.nextElementSibling.nextElementSibling.classList.contains('gi'))).length, inputs: document.querySelectorAll('#report .onepage input').length }; });
      await page.emulateMedia({ media: 'screen' }); await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      assert(r.n > 20, 'section boxes: ' + r.n); assert.strictEqual(r.small, 0, r.small + ' boxes under 0.9in x 0.28in'); assert(r.an > 0 && r.an === r.gd && r.an === r.gi && r.bad === 0, JSON.stringify(r)); assert.strictEqual(r.inputs, 0, 'plain table, no inputs');
    });
  }
  // The first child of the room is the one set up above only if listed first; open that child's sheet through the Achievement Record (kid option) so the checks look at the right page.
  const one = async g => { await show(setup[g].room, 'achievement', g, setup[g].id); };
  await test('Sparks: states: earned-not-given has the EARNED tag; held prints as earned; given prints its date; given no date prints a check; no announced date prints', async () => {
    await one('Sparks'); const s = setup.Sparks;
    const r = await page.evaluate(() => { const cells = [...document.querySelectorAll('#report td.an')].map(a => ({ name: a.querySelector('span').textContent, e: a.classList.contains('e'), g: a.classList.contains('g'), tag: (a.querySelector('.tag') || {}).textContent || '', v: a.nextElementSibling.querySelector('.v').textContent })); return { cells, all: document.getElementById('report').innerText }; });
    const by = {}; r.cells.forEach(c => { by[c.name] = c; });
    const label = n => n.replace(/^HG /, '').replace('{emblem}', '').replace(/ Jewel (\d)$/, ' $1'),      // N56: the award cells at the right drop the word Jewel
       c1 = by[label(s.b1)], c2 = by[label(s.b2)], c3 = by[label(s.b3)], c4 = by[label(s.b4)], c5 = by[label(s.b5)];
    assert(c1 && c1.e && /^EARNED/.test(c1.tag) && c1.v === '', 'earned not given (no-date last box): ' + JSON.stringify(c1)); assert(/EARNED ✓/.test(c1.tag), 'a no-date finish says EARNED with a check, not a day: ' + c1.tag);
    assert(c2 && c2.g && !c2.e && c2.v === '10/28/26', 'given with its date: ' + JSON.stringify(c2)); assert(c3 && c3.g && /no date/.test(c3.v) && !/\d/.test(c3.v), 'given, no date: ' + JSON.stringify(c3));
    assert(c4 && c4.e && /^EARNED 09\/30\/26$/.test(c4.tag), 'held prints as earned: ' + JSON.stringify(c4)); assert(!/hold/i.test(r.all), 'no HOLD anywhere on the page'); assert(c5 && c5.e, 'announced and earned is earned, not given');
    assert(!/12\/24/.test(r.all), 'the announced date is not printed'); assert(!/10\/30/.test(r.all), 'the no-date tick day is not printed');
  });
  await test('a no-date sign-off prints a check in the date part and no digits (all three groups)', async () => {
    for (const g of ['Sparks', 'T&T', 'Cubbies']) { await one(g); const r = await page.evaluate(() => [...document.querySelectorAll('#report td.so .dt')].map(d => d.textContent)); assert(r.includes('✓'), g + ': a check mark prints'); assert(r.filter(t => t === '✓').every(t => !/\d/.test(t)));
      assert(r.some(t => /^10\/21\/26$/.test(t)) || g === 'Cubbies', g + ': a dated sign-off prints mm/dd/yy (N56)'); }
  });
  await test('the PDF text: no tick day, no announced day, no HOLD', async () => {
    if (!hasPdftotext) { console.log('       (skipped: pdftotext is not installed)'); return; }
    for (const g of ['Sparks', 'T&T', 'Cubbies']) { const { buf } = await printed(setup[g].room, 'progressSheets', g); const t = text(buf); assert(!/10\/30|12\/24|\bHOLD\b/i.test(t), g + ': ' + (/10\/30|12\/24|\bHOLD\b/i.exec(t) || [])[0]); }
  });
  await test('Blue Jewels print as four cells in two rows, with the earned date and a Given box under each', async () => {
    const id = setup.Sparks.id;
    const jew = await page.evaluate(id2 => { const A = App, S = Season; const days = A.calendar.filter(r => Calendar.isNight(r)).map(r => r.Date).sort(); days.slice(0, 7).forEach(d => { A.season.attendance[d] = A.season.attendance[d] || {}; A.season.attendance[d][id2] = { a: 1 }; }); A.touch(); return S.sparkJewels(A.season, id2, A.calendar).map(j => j.n + ':' + j.date); }, id);
    await one('Sparks');
    const r = await page.evaluate(() => { const row = [...document.querySelectorAll('#report tr')].find(t => /Blue Jewels/.test(t.textContent)); return { bj: document.querySelectorAll('#report td.bj').length, given: [...document.querySelectorAll('#report td.bg')].length, first: row ? row.querySelector('td.bj .v').textContent : '' }; });
    assert.strictEqual(r.bj, 4, 'four earned cells'); assert.strictEqual(r.given, 4, 'four Given cells');
    if (jew.length) assert(/^\d\d\/\d\d\/\d\d$/.test(r.first), 'the first jewel shows its earned date, in full (N56): ' + r.first + ' (' + jew + ')');
  });
  await test('Review Emblem and Book award rows print, each with its own Given boxes', async () => {
    await one('Sparks'); const r = await page.evaluate(() => [...document.querySelectorAll('#report td.an')].map(a => a.querySelector('span').textContent));
    assert(r.some(x => /Review Emblem/.test(x)), 'Review Emblem award'); assert(r.some(x => /Book Award/.test(x)), 'Book award: ' + r.slice(-3));
    await one('T&T'); const t = await page.evaluate(() => [...document.querySelectorAll('#report td.an')].map(a => a.querySelector('span').textContent)); assert(t.some(x => /Alpha Award/.test(x)), 'T&T book award is Alpha: ' + t.slice(-2));
  });
  await test('T&T Discovery / Extra Credit hook: TNT_PENDING_AWARDS is empty (not built, BACKLOG W3); an entry would print as a row with two Given boxes', async () => {
    const RS = require('../reports-season.js'); assert.deepStrictEqual(RS.TNT_PENDING_AWARDS, []);
    const before = await page.evaluate(() => document.querySelectorAll('#report td.an').length); assert(before > 0);
    RS.TNT_PENDING_AWARDS.push({ label: 'Discovery Blue', award: '{book} Discovery Award Blue Emblem' });
    try { const Season = require('../season.js'), M = require('../model.js'), Reports = require('../reports.js'); const s = Season.fromJson(fs.readFileSync(DATA, 'utf8')), master = M.fromRoster(s.roster), p = master.people.find(x => M.isClubber(x) && M.isActive(x) && M.groupOf(M.room(x)) === 'T&T');
      const h = RS.recordBody({ season: s, calendar: s.calendar, master }, p, 'AoG'); assert(/Discovery Blue/.test(h), 'the hook row prints'); assert(/Discovery Award Blue Emblem|Blue Emblem/.test(h)); assert(/class="gv gd/.test(h)); }
    finally { RS.TNT_PENDING_AWARDS.length = 0; }
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  console.log('PDF measurements: ' + JSON.stringify(measures));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
