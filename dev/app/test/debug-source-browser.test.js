// N9 point 7: the Debug tab's "Built from" row shows the source the page was built from (the app-source meta), with +changes spelled out; "–" when the page has none. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/debug-source-browser.test.js
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
  const built = async value => {
    await page.evaluate(v => { document.querySelectorAll('meta[name="app-source"]').forEach(m => m.remove()); if (v !== null) { const m = document.createElement('meta'); m.name = 'app-source'; m.content = v; document.head.appendChild(m); } App.tabs.debug(); }, value);
    return page.evaluate(() => { const row = [...document.querySelectorAll('#debugWrap tr, table tr')].find(r => /Built from/.test(r.textContent)); return row ? row.textContent.replace(/\s+/g, ' ').trim() : ''; });
  };
  await test('a page built from a commit names it on the Debug tab', async () => { const row = await built('a1b2c3d'); assert(/Built from\s*a1b2c3d/.test(row), 'row: ' + row); });
  await test('uncommitted changes are spelled out', async () => { const row = await built('a1b2c3d+changes'); assert(/with changes not yet committed/.test(row), 'row: ' + row); });
  await test('an older page with no source tag shows a dash', async () => { const row = await built(null); assert(/Built from\s*–/.test(row), 'row: ' + row); });
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
