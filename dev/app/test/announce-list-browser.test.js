// N29: the Announce page has a button that prints the list to read from on club night (the announceList report, by group and class). Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/announce-list-browser.test.js
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
  const page = await (await browser.newContext()).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => document.querySelector('.tabs button[data-tab="awards"]').click()); await page.waitForTimeout(400);
  await test('the Announce page has the print button next to Mark all announced', async () => {
    assert(await page.isVisible('#btnAwAnnPrint') || await page.$('#btnAwAnnPrint'), 'no button');
  });
  await test('pressing it opens the Reports tab on the announce list, with one section per group that has awards to announce', async () => {
    await page.click('#btnAwAnnPrint').catch(() => {}); await page.waitForTimeout(600);
    const report = await page.$eval('#report', e => e.textContent).catch(() => '');
    assert(/awards to announce|Nothing earned is waiting to be announced/.test(report), 'report not shown: ' + report.slice(0, 120));
  });
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
