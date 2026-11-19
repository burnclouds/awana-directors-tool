// N9 point 8: the top bar shows a chip while this browser is offline, at desktop and phone widths, and hides it when the connection returns. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/offline-chip-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  for (const [label, vp] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport: vp }), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    await test(label + ': the chip is hidden while online', async () => { assert(!(await page.isVisible('#offlineChip'))); });
    await test(label + ': the chip shows when the browser goes offline, in plain words', async () => {
      await ctx.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline'))); await page.waitForTimeout(200);
      assert(await page.isVisible('#offlineChip'), 'not shown'); assert(/Offline/.test(await page.textContent('#offlineChip')));
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth); assert(fits, 'the chip makes the page scroll sideways');
    });
    await test(label + ': the chip hides again when the connection returns', async () => {
      await ctx.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online'))); await page.waitForTimeout(200);
      assert(!(await page.isVisible('#offlineChip')));
    });
    await test(label + ': no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
