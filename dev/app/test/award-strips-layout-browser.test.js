// Award slips (Awards to hand out), the paper layout, from Chromium's own print engine on invented TEST data (Mike, 2026-11-20): as much of the page as possible is used.
//  - the strips sit 3px apart, across and down (the dashed border is the cut line);
//  - every piece of text on a strip is between 8pt and 10pt;
//  - no page overflows: one PDF page per sheet, for strips with short, long and many awards;
//  - the page holds more strips than before: 54 one-award strips fit on 3 pages (the old 11/12pt layout needed 5).
// Usage: NODE_PATH=<dir with playwright> node test/award-strips-layout-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
setTimeout(() => { console.log('timed out'); process.exit(2); }, 200000).unref();
const pdfPages = buf => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto('http://localhost:' + server.address().port + '/index.html'); await page.evaluate(() => { App.today = () => '2026-11-18'; }); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => App.showTab('reports'));
  // Seed waiting awards: `n` children with one short award each (the capacity case), plus a mix: long names, several awards, many awards.
  const seed = async (n, mixed) => page.evaluate(([n, mixed]) => { const s = App.season, M = Model; Season.snapshot && 0;
    const kids = App.master.people.filter(p => M.isActive(p) && M.isClubber(p) && ['Cubbies', 'Sparks', 'T&T'].includes(M.groupOf(M.room(p))));
    Object.keys(s.awards).forEach(d => { delete s.awards[d]; }); s.given = {}; s.givenNoDate = {}; s.held = {};
    kids.slice(0, n).forEach((p, i) => { const id = p[M.X.ID]; const count = mixed ? [1, 2, 3, 1, 5, 2, 8][i % 7] : 1; for (let k = 1; k <= count; k++) Season.addAward(s, '2026-10-21', id, (mixed && (i + k) % 3 === 0 ? 'A rather long award name, ' + (30 + k * 7) + ' letters of it, to make this line wrap ' : 'Test Award ') + k); });
    App.touch(); return kids.length; }, [n, mixed]);
  const show = async () => { await page.evaluate(() => { App.showReport('handOut'); App.reportOptions({ group: '', room: '' }); }); await page.waitForTimeout(600); };
  const printed = async fn => { await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await page.emulateMedia({ media: 'print' }); await page.setViewportSize({ width: 979, height: 900 }); await page.waitForTimeout(250); try { return await fn(); } finally { await page.emulateMedia({ media: 'screen' }); await page.setViewportSize({ width: 1366, height: 900 }); await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); } };

  await seed(24, true); await show();
  await test('strips are 3px apart across a row and 3px apart down the page', async () => {
    const g = await printed(() => page.evaluate(() => { const R = x => x.getBoundingClientRect(), across = [], down = []; let n = 0;
      document.querySelectorAll('#report .sheet.strips').forEach(sh => { const rows = [...sh.querySelectorAll('.striprow')]; n += rows.length;
        rows.forEach((r, i) => { const s = [...r.querySelectorAll('.strip')].map(R); if (s.length === 2) across.push(+(s[1].left - s[0].right).toFixed(2));
          if (i) { const prev = [...rows[i - 1].querySelectorAll('.strip')].map(R); down.push(+(s[0].top - Math.max(...prev.map(x => x.bottom))).toFixed(2)); } }); });
      return { across, down, n }; }));
    assert(g.n >= 4, 'rows: ' + g.n); g.across.forEach(a => assert(Math.abs(a - 3) <= 0.6, 'across: ' + g.across.join(','))); g.down.forEach(d => assert(Math.abs(d - 3) <= 0.6, 'down: ' + g.down.join(',')));
  });
  await test('every piece of text on a strip is between 8pt and 10pt', async () => {
    const sizes = await printed(() => page.evaluate(() => { const out = {}; document.querySelectorAll('#report .strip *').forEach(e => { if ([...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) { const px = parseFloat(getComputedStyle(e).fontSize), pt = +(px * 0.75).toFixed(2); out[pt] = (out[pt] || 0) + 1; } }); return out; }));
    const pts = Object.keys(sizes).map(Number); assert(pts.length, 'no text found'); pts.forEach(p => assert(p >= 7.99 && p <= 10.01, 'text at ' + p + 'pt (' + JSON.stringify(sizes) + ')'));
  });
  await test('no page overflows: one PDF page per sheet, with short, long and many awards (24 children, mixed)', async () => {
    const sheets = await page.$$eval('#report .sheet.strips', s => s.length), buf = await page.pdf({ preferCSSPageSize: true, printBackground: true }).catch(() => null);
    const pdf = await printed(() => page.pdf({ preferCSSPageSize: true, printBackground: true })); assert.strictEqual(pdfPages(pdf), sheets, sheets + ' sheets but ' + pdfPages(pdf) + ' printed pages');
  });
  await seed(54, false); await show();
  await test('capacity: 54 strips with one award each fit on 3 pages (the old layout needed 5), and no page overflows', async () => {
    const sheets = await page.$$eval('#report .sheet.strips', s => s.length), strips = await page.$$eval('#report .strip', s => s.length); assert.strictEqual(strips, 54, 'strips: ' + strips);
    const pdf = await printed(() => page.pdf({ preferCSSPageSize: true, printBackground: true })); assert.strictEqual(pdfPages(pdf), sheets, sheets + ' sheets but ' + pdfPages(pdf) + ' printed pages'); assert(sheets <= 3, sheets + ' pages for 54 strips');
  });
  await seed(100, true); await show();
  await test('a large mixed run (100 children) never overflows a page', async () => {
    const sheets = await page.$$eval('#report .sheet.strips', s => s.length), pdf = await printed(() => page.pdf({ preferCSSPageSize: true, printBackground: true })); assert(sheets >= 5, 'sheets: ' + sheets); assert.strictEqual(pdfPages(pdf), sheets, sheets + ' sheets but ' + pdfPages(pdf) + ' printed pages');
  });
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
