// Debug tab: "Books with no dates" counts the bare book codes with no dates, lists them, and Reset clears them (a child with a date is not touched). Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/debug-nodate-browser.test.js
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
  // a child with a bare code and no dates, and a child with a bare code and a sign-off (must be kept)
  const ids = await page.evaluate(() => { const M = Model, ps = App.master.people.filter(p => M.isActive(p) && M.isClubber(p)); const a = ps[0][M.X.ID], b = ps[1][M.X.ID];
    App.season.handbooks[a] = 'WR'; App.season.handbooks[b] = 'AS'; App.season.progress[b] = { AS: { 'AS1.1': '2026-11-05' } }; delete App.season.progress[a]; App.touch(); return { a, b }; });
  await page.evaluate(() => App.tabs.debug()); await page.waitForTimeout(200);
  await test('the count finds the bare code with no dates, and lists the child', async () => {
    await page.evaluate(() => document.getElementById('dbgNoDateCount').click()); await page.waitForTimeout(200);
    const t = await page.textContent('#debugWrap'); const sec = t.slice(t.indexOf('Books with no dates'), t.indexOf('Open now')); assert(/\d+ child/.test(sec) && /WR/.test(sec), sec.slice(0, 300));
  });
  await test('Reset clears the bare code; a child with a sign-off keeps theirs', async () => {
    await page.evaluate(() => document.getElementById('dbgNoDateReset').click()); await page.waitForTimeout(300);
    const h = await page.evaluate(([a, b]) => [App.season.handbooks[a], App.season.handbooks[b]], [ids.a, ids.b]);
    assert.strictEqual(h[0], undefined, 'bare code cleared'); assert.strictEqual(h[1], 'AS', 'child with a sign-off unchanged');
  });
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
