// Shared setup for browser tests (N9.10): serve dev/app, open the invented TEST club, run tests, print to PDF with the media reset.
// Used by the tests written for 1.51.16; older tests keep their own copy. Usage in a test:
//   const { open } = require('./lib/app-page'); const t = await open(); await t.test('name', async () => { ... t.page ... }); await t.done();
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..', '..'), td = path.join(app, '..', 'test-data');
const TEST_FILE = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.csv': 'text/csv' };

async function open(opts) {
  opts = opts || {};
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html', f = path.join(app, u);
    if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), context = await browser.newContext(opts.viewport ? { viewport: opts.viewport } : {}), page = await context.newPage();
  page.on('dialog', d => d.accept());
  const url = 'http://localhost:' + server.address().port + '/index.html?nocache=' + Date.now();
  await page.goto(url);
  await page.setInputFiles('#splashFiles', [opts.file || TEST_FILE]);
  await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  let passed = 0, failed = 0;
  return {
    page, browser, server, url, TEST_FILE, assert,
    async test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } },
    // Draw a report, switch to print emulation, run fn, always switch back (leaving 'print' on would leak into later checks).
    async printed(fn) { await page.emulateMedia({ media: 'print' }); try { return await fn(); } finally { await page.emulateMedia({ media: null }); } },
    async pdf() { await page.emulateMedia({ media: 'print' }); try { return await page.pdf({ preferCSSPageSize: true, printBackground: true }); } finally { await page.emulateMedia({ media: null }); } },
    async report(id, setup) { await page.evaluate(([i, s]) => { if (s) (0, eval)(s); App.showReport(i); }, [id, setup || '']); await page.waitForFunction(() => document.querySelectorAll('#report .sheet').length > 0); },
    async done() { await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0); },
  };
}
module.exports = { open, TEST_FILE };
