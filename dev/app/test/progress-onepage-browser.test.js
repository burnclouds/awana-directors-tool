// Progress sheets: one printed page per child, sized by print CSS only (no zoom script).
// Invented test club only (dev/test-data).
// Usage: NODE_PATH=<dir with playwright> node test/progress-onepage-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
setTimeout(() => { console.log('timed out'); process.exit(2); }, 170000).unref();
const pages = buf => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
// Many pages are chosen in the Choose pages pop-up (more than 12); a few are ticked under the report.
async function untick(page, which) { if (await page.locator('#btnChoosePages').count()) { await page.click('#btnChoosePages'); await page.locator('#dlg input[data-pg]')[which]().uncheck(); await page.click('#pgDone'); } else await page.locator('#pagePick input')[which]().uncheck(); }
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => window.App.showReport('progressSheets')); await page.waitForTimeout(300);
  const n = await page.locator('#report .onepage').count();
  const screenH = await page.evaluate(() => [...document.querySelectorAll('#report .onepage')].map(o => [o.getBoundingClientRect().height, o.firstElementChild.getBoundingClientRect().height, getComputedStyle(o).overflow]));
  await test('there are several progress sheets', () => assert(n >= 3, 'n=' + n));
  await test('screen: the wrapper is a plain box around its sheet', () => screenH.forEach(([h, sh, ov]) => { assert(Math.abs(h - sh) < 2); assert.strictEqual(ov, 'visible'); }));
  await test('no zoom or width is set by beforeprint', async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    const st = await page.evaluate(() => [...document.querySelectorAll('#report .onepage')].map(o => o.style.zoom + '|' + o.style.width));
    assert(st.every(s => s === '|'), st.join());
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  });
  await test('the record sheet is plain table text: no date inputs to blank (it was the entry form before BACKLOG T6)', async () => {
    assert.strictEqual(await page.locator('#report .onepage input').count(), 0); assert(await page.locator('#report .onepage table.rec').count() >= 3, 'one record table per child');
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); assert.strictEqual(await page.locator('input[type=date][data-blank-print]').count(), 0);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  });
  await test('print: each child sheet fits the letter page box (720 x 960)', async () => {
    await page.setViewportSize({ width: 720, height: 960 }); await page.emulateMedia({ media: 'print' });
    const hs = await page.$$eval('#report .onepage', e => e.map(x => x.getBoundingClientRect().height));
    const bad = hs.filter(h => h > 962); assert(!bad.length, bad.length + ' of ' + hs.length + ' too tall, max ' + Math.max(...hs));
  });
  await test('PDF has one page per child', async () => {
    const buf = await page.pdf({ format: 'Letter', preferCSSPageSize: true }); assert.strictEqual(pages(buf), n, pages(buf) + ' pages for ' + n);
  });
  await test('an unticked child leaves no blank page', async () => {
    await page.emulateMedia({ media: 'screen' }); await page.setViewportSize({ width: 1366, height: 900 });
    await untick(page, 'first'); await page.emulateMedia({ media: 'print' });
    const buf = await page.pdf({ format: 'Letter', preferCSSPageSize: true }); assert.strictEqual(pages(buf), n - 1, pages(buf) + ' pages for ' + (n - 1));
  });
  await test('unticking the last child too leaves no trailing blank page', async () => {
    await page.emulateMedia({ media: 'screen' }); await untick(page, 'last'); await page.emulateMedia({ media: 'print' });
    const buf = await page.pdf({ format: 'Letter', preferCSSPageSize: true }); assert.strictEqual(pages(buf), n - 2, pages(buf) + ' pages for ' + (n - 2));
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
