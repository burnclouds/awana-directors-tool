// The attendance report must print on letter LANDSCAPE (11 x 8.5 in): its sheets carry class 'landscape', the stylesheet maps that to a landscape named page,
// and Chromium's own print-to-PDF (no orientation forced) gives 792 x 612 pt pages. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/attendance-landscape-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html', f = path.join(app, u);
  if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
});
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const ctx = await browser.newContext(), page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => App.showReport('attendance'));
  await page.waitForFunction(() => document.querySelectorAll('#report .sheet').length > 0);
  await page.emulateMedia({ media: 'print' });

  await test('every attendance sheet has class landscape (and none portrait)', async () => {
    const r = await page.evaluate(() => [...document.querySelectorAll('#report .sheet')].map(s => s.className));
    assert(r.length > 0, 'no sheets'); r.forEach(c => assert(/\blandscape\b/.test(c) && !/\bportrait\b/.test(c), c));
  });
  await test('the page style is landscape for a landscape-first report, with no named page on the first sheet (a named first page prints a blank page before it)', async () => {
    const css = fs.readFileSync(path.join(app, 'style.css'), 'utf8');
    assert(/@page\s+land\s*\{[^}]*size:\s*11in\s+8\.5in/.test(css), '@page land is still defined');
    assert(!/#report\s+\.sheet\.landscape\s*\{[^}]*page:\s*land/.test(css), 'no static named page on .sheet.landscape');
    assert(/@page \{ size: landscape/.test(await page.$eval('#pageStyle', e => e.textContent)), 'the default page is landscape (setPageStyle)');
    const pg = await page.evaluate(() => getComputedStyle(document.querySelector('#report .sheet')).page); if (pg !== undefined) assert.notStrictEqual(pg, 'land');
  });
  await test('print-to-PDF without forcing orientation gives landscape pages (792 x 612 pt)', async () => {
    const buf = await page.pdf({ format: 'Letter', preferCSSPageSize: true, printBackground: true });
    const boxes = [...buf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(m => [Math.round(m[1]), Math.round(m[2])]);
    assert(boxes.length > 0, 'no MediaBox'); boxes.forEach(b => assert.deepStrictEqual(b, [792, 612], JSON.stringify(boxes)));
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
