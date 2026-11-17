// N1 / B4 / B7: the printed paper itself, from Chromium's own print engine, on invented TEST data (dev/test-data) only.
//  - Statistics report: no table is wider than the page (the "Pattern" column ran off the right edge: tables 875 to 1,015px on a 704px sheet, the screen box clipped them).
//  - Awards earned per child: several children share a page; the PDF has one page per sheet (nothing spills), each child block sits whole on one page, nothing is cut at the bottom.
//  - Binders button: the first page of a class binder is the landscape attendance sheet (792 x 612 pt), the following portrait pages are 612 x 792 pt; the coaches binder opens portrait.
//  - B7: emergency pages print at 12px and still fit one page per class; attendance names are left-aligned and a long one is shrunk or wrapped, never cut with an ellipsis.
// How: a DOM measurement under emulateMedia('print') with the viewport set to the printable width (7.5in = 720px) for the table widths (a PDF keeps clipped text, so it cannot show a clip);
// page.pdf for page sizes and counts (MediaBox read from the PDF bytes, no pdf library); pdftotext -bbox, when installed, for the lowest text on each page (a check that is skipped, and says so, without it).
// Usage: NODE_PATH=<dir with playwright> node test/print-pdf-n1-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), os = require('os'), path = require('path'), cp = require('child_process');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
setTimeout(() => { console.log('timed out'); process.exit(2); }, 240000).unref();
const hasPdftotext = (() => { try { return cp.spawnSync('pdftotext', ['-v']).status !== null; } catch (e) { return false; } })();
const boxes = buf => [...buf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(m => [Math.round(m[1]), Math.round(m[2])]);
// For each page: the lowest word (pt from the top) and the words, from pdftotext -bbox. null without pdftotext.
function textPages(buf) {
  if (!hasPdftotext) return null;
  const f = path.join(os.tmpdir(), 'awana-n1-' + process.pid + '.pdf'); fs.writeFileSync(f, buf);
  const html = cp.spawnSync('pdftotext', ['-bbox', f, '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout; fs.unlinkSync(f);
  return html.split('<page ').slice(1).map(pg => { const ws = [...pg.matchAll(/yMax="([\d.]+)">([^<]*)</g)]; return { bottom: Math.max(0, ...ws.map(m => +m[1])), text: ws.map(m => m[2]).join(' ') }; });
}
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto('http://localhost:' + server.address().port + '/index.html'); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const toReports = async () => { await page.evaluate(() => document.querySelector('.tabs button[data-tab="reports"]').click()); await page.waitForTimeout(200); };
  const show = async (id, opts) => { await toReports(); await page.evaluate(([r, o]) => { App.reportOptions(o || {}); App.showReport(r); }, [id, opts]); await page.waitForFunction(() => document.querySelectorAll('#report .sheet').length > 0); await page.waitForTimeout(300); };
  const openBinders = async ticks => {
    await toReports(); await page.click('#rSubs button[data-rsub="binders"]'); await page.click('#btnBinders'); await page.waitForTimeout(200);
    for (const t of ticks) await page.check('#dlg input[data-bind="' + t + '"]');
    await page.click('#bindGo'); await page.waitForTimeout(500);
  };
  const toPdf = async () => { await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(250); const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true }); await page.emulateMedia({ media: 'screen' }); await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); return buf; };
  const PAGE_BOTTOM = 792 - 36;      // portrait letter, 0.5in margin

  // ---- Statistics ----
  await test('Statistics: no table is wider than the printable width and no box clips one (the Pattern column was cut off)', async () => {
    await show('statistics');
    await page.setViewportSize({ width: 720, height: 960 }); await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(300);
    const r = await page.evaluate(() => [...document.querySelectorAll('#report .sheet.stats')].map(s => { const sr = s.getBoundingClientRect(); return {
      sheetRight: sr.right, tables: [...s.querySelectorAll('table')].map(t => ({ right: t.getBoundingClientRect().right, w: Math.round(t.getBoundingClientRect().width) })),
      clip: [...s.querySelectorAll('.scroll')].filter(b => getComputedStyle(b).overflowX !== 'visible' && b.scrollWidth > b.clientWidth + 1).length,
      cells: [...s.querySelectorAll('td, th')].filter(c => c.getBoundingClientRect().right > sr.right + 1).length }; }));
    await page.emulateMedia({ media: 'screen' }); await page.setViewportSize({ width: 1366, height: 900 });
    assert(r.length >= 3, 'three Statistics sheets: ' + r.length);
    const tables = r.reduce((n, s) => n + s.tables.length, 0); assert(tables >= 6, 'the sheets have their tables: ' + tables);
    r.forEach((s, i) => { s.tables.forEach(t => assert(t.right <= s.sheetRight + 1, 'sheet ' + i + ': a table is ' + t.w + 'px wide and ends at ' + Math.round(t.right) + ' past the sheet edge ' + Math.round(s.sheetRight)));
      assert.strictEqual(s.clip, 0, 'sheet ' + i + ': a box still clips a table'); assert.strictEqual(s.cells, 0, 'sheet ' + i + ': a cell runs past the edge'); });
  });
  await test('Statistics: the PDF is portrait letter and still carries every column heading, "Pattern" included', async () => {
    await show('statistics'); const buf = await toPdf(); boxes(buf).forEach(b => assert.deepStrictEqual(b, [612, 792]));
    const pages = textPages(buf); if (!pages) return console.log('       (text check skipped: pdftotext is not installed)');
    assert(/Pattern/.test(pages.map(p => p.text).join(' ')), 'the Pattern heading is in the PDF'); pages.forEach((p, i) => assert(p.bottom <= PAGE_BOTTOM + 1, 'page ' + (i + 1) + ' text runs to ' + Math.round(p.bottom) + 'pt'));
  });

  // ---- Awards earned per child ----
  for (const group of ['Cubbies', 'Sparks', 'T&T']) {
    await test('Awards earned (' + group + '): children share pages, one PDF page per sheet, no block split and nothing cut at the bottom', async () => {
      await show('awardsByChild', { group, room: '', kid: '' });
      const sheets = await page.$$eval('#report .sheet', es => es.map(e => e.querySelectorAll('.achild').length)), kids = sheets.reduce((a, b) => a + b, 0);
      assert(kids >= 8, 'the test club has several ' + group + ' children: ' + kids); assert(sheets.length < kids, 'children share pages (' + sheets.length + ' pages for ' + kids + ' children)');
      const buf = await toPdf(); assert.strictEqual(boxes(buf).length, sheets.length, sheets.length + ' sheets but ' + boxes(buf).length + ' PDF pages: a block spilled onto an extra page');
      const pages = textPages(buf); if (!pages) return console.log('       (per-page text check skipped: pdftotext is not installed)');
      pages.forEach((p, i) => { assert.strictEqual((p.text.match(/Attendance:/g) || []).length, sheets[i], 'page ' + (i + 1) + ' holds ' + (p.text.match(/Attendance:/g) || []).length + ' of its ' + sheets[i] + ' child blocks'); assert(p.bottom <= PAGE_BOTTOM + 1, 'page ' + (i + 1) + ' text runs to ' + Math.round(p.bottom) + 'pt, past ' + PAGE_BOTTOM); });
    });
  }

  // ---- Binders button ----
  await test('Binders: a class binder opens on landscape paper for the attendance sheet, the rest are portrait', async () => {
    await show('teams'); await openBinders(['2']);      // Sparks A; the last report was portrait
    const first = await page.$eval('#report .sheet', s => s.classList.contains('landscape') ? 'landscape' : 'portrait'); assert.strictEqual(first, 'landscape');
    const buf = await toPdf(), b = boxes(buf); assert(b.length >= 4, 'attendance, emergency, volunteers and progress sheets: ' + b.length + ' pages');
    assert.deepStrictEqual(b[0], [792, 612], 'first page is ' + b[0]); b.slice(1).forEach((x, i) => assert.deepStrictEqual(x, [612, 792], 'page ' + (i + 2) + ' is ' + x));
    const sheets = await page.$$eval('#report .sheet:not(.skip)', es => es.length); assert(b.length >= sheets && b.length <= sheets + 1, sheets + ' sheets but ' + b.length + ' pages');      // the volunteer list is a table and runs onto a second page (header repeated); every other sheet is one page
  });
  await test('Binders: the coaches binder opens portrait, even right after a landscape report', async () => {
    await show('attendance'); await openBinders(['coaches']);
    const buf = await toPdf(), b = boxes(buf); assert(b.length >= 3, b.length + ' pages'); b.forEach((x, i) => assert.deepStrictEqual(x, [612, 792], 'page ' + (i + 1) + ' is ' + x));
  });

  // ---- B7 ----
  await test('B7: emergency pages print at 12px and every class still fits one PDF page', async () => {
    await show('binderClass'); const sheets = await page.$$eval('#report .sheet', es => es.length); assert(sheets >= 3, 'class pages: ' + sheets);
    await page.emulateMedia({ media: 'print' }); const px = await page.$$eval('#report table.emerg td, #report table.emerg th', es => [...new Set(es.map(e => getComputedStyle(e).fontSize))]); await page.emulateMedia({ media: 'screen' });
    assert.deepStrictEqual(px, ['12px'], 'cell font sizes in print: ' + px);
    const buf = await toPdf(); assert.strictEqual(boxes(buf).length, sheets, sheets + ' classes but ' + boxes(buf).length + ' pages');
    const pages = textPages(buf); if (pages) pages.forEach((p, i) => assert(p.bottom <= PAGE_BOTTOM + 1, 'class page ' + (i + 1) + ' runs to ' + Math.round(p.bottom) + 'pt'));
  });
  await test('B7: the coaches list (everyone by name) at 12px is portrait letter with nothing past the bottom margin', async () => {
    await show('binderAll'); const buf = await toPdf(); boxes(buf).forEach(b => assert.deepStrictEqual(b, [612, 792]));
    const pages = textPages(buf); if (pages) pages.forEach((p, i) => assert(p.bottom <= PAGE_BOTTOM + 1, 'page ' + (i + 1) + ' runs to ' + Math.round(p.bottom) + 'pt'));
  });
  await test('B7: attendance names are left-aligned, not truncated, and the longest invented name is whole on one line or wrapped', async () => {
    // A long invented name, set in memory only.
    const longName = await page.evaluate(() => { const p = App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'Sparks'); p[Model.C.FIRST] = 'Maximilian Bartholomew'; p[Model.C.LAST] = 'Featherstonehaugh-Montgomery'; return Model.fullName(p); });
    await show('attendance', { room: '' }); await page.emulateMedia({ media: 'print' });
    const r = await page.evaluate(n => { const td = [...document.querySelectorAll('#report td.name')].find(c => c.textContent === n); if (!td) return null; const cs = getComputedStyle(td); return { align: cs.textAlign, ellipsis: cs.textOverflow, overflow: cs.overflowX, ws: cs.whiteSpace, fs: cs.fontSize, cls: td.className, clipped: td.scrollWidth > td.clientWidth + 1, h: td.getBoundingClientRect().height }; }, longName);
    await page.emulateMedia({ media: 'screen' });
    assert(r, 'the long name is on the sheet'); assert.strictEqual(r.align, 'left'); assert.notStrictEqual(r.ellipsis, 'ellipsis'); assert(/\bxlong\b/.test(r.cls) || /\blong\b/.test(r.cls), 'a long name is marked to shrink: ' + r.cls); assert(parseFloat(r.fs) <= 11, 'font shrinks: ' + r.fs); assert(!r.clipped, 'name is cut: ' + JSON.stringify(r));
    const buf = await toPdf(); boxes(buf).forEach(b => assert.deepStrictEqual(b, [792, 612])); const pages = textPages(buf);
    if (pages) { assert(pages.some(p => p.text.includes('Featherstonehaugh-Montgomery') || p.text.includes('Featherstonehaugh-')), 'the surname is in the PDF'); pages.forEach((p, i) => assert(p.bottom <= 612 - 29 + 1, 'attendance page ' + (i + 1) + ' runs to ' + Math.round(p.bottom) + 'pt')); }
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
