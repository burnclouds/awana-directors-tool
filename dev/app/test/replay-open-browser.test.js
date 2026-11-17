// R20: the History tab says when the History no longer adds up to the data, and "Reconcile History" records the difference as one version. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/replay-open-browser.test.js
const { chromium } = require('playwright');
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.json$/.test(f)).sort().pop());
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
  const open = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } }), page = await ctx.newPage(), errs = [];
    page.on('dialog', d => d.dismiss()); page.on('pageerror', e => errs.push(e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { page, errs };
  };
  const showHistory = page => page.evaluate(() => { document.querySelector('[data-tab=history]').click(); });
  await test('a clean file shows no reconcile line', async () => {
    const { page, errs } = await open(); await showHistory(page);
    assert.strictEqual(await page.locator('#historyReconcile').isVisible(), false); assert.deepStrictEqual(errs, []); await page.close();
  });
  await test('one place that History does not explain: the line says so, the button records it, the line goes', async () => {
    const { page, errs } = await open();
    const n0 = await page.evaluate(() => { const s = App.season, b = Season.snapshot(s); s.given['7999999_Test_Kid'] = { 'Zany Trophy': '2026-10-01' }; Season.record(s, b, { now: '2026-10-29T10:00:00.000Z' }); s.given['7999999_Test_Kid']['Zany Trophy'] = '2026-10-02'; return s.history.length; });
    await showHistory(page);
    assert.strictEqual(await page.locator('#historyReconcile').isVisible(), true);
    assert(/in 1 place /.test(await page.locator('#historyReconcileText').textContent()), await page.locator('#historyReconcileText').textContent());
    await page.click('#hReconcile');
    assert.strictEqual(await page.locator('#historyReconcile').isVisible(), false);
    const r = await page.evaluate(() => ({ n: App.season.history.length, diff: Season.replayDiff(App.season).length, label: App.season.history[App.season.history.length - 1].label }));
    assert.strictEqual(r.n, n0 + 1); assert.strictEqual(r.diff, 0); assert(/^Reconciled/.test(r.label), r.label);
    assert.deepStrictEqual(errs, []); await page.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
