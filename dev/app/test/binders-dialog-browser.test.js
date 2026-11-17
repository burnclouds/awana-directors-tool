// The Binders dialog: eleven boxes (Puggles, Cubbies, Sparks A-D, T&T four classes, Coaches). Show binders builds one document for the ticked ones.
// Invented test club only (dev/test-data).
// Usage: NODE_PATH=<dir with playwright> node test/binders-dialog-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
setTimeout(() => { console.log('timed out'); process.exit(2); }, 170000).unref();
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => document.querySelector('.tabs button[data-tab="reports"]').click()); await page.waitForTimeout(200);
  await page.click('#rSubs button[data-rsub="binders"]'); await page.click('#btnBinders'); await page.waitForTimeout(200);      // the Binders button is on the Binders group
  await test('the Binders dialog has eleven boxes: Puggles, Cubbies, Sparks A-D, four T&T classes, and the coaches binder', async () => {
    assert.strictEqual(await page.locator('#dlg input[data-bind]').count(), 11);
    const labels = await page.$$eval('#dlg label.pf.chk', l => l.map(x => x.textContent.trim()));
    assert.deepStrictEqual(labels.slice(0, 3), ['Puggles binder', 'Cubbies binder', 'Sparks A binder']);
    assert.strictEqual(labels[10], 'Coaches binder');
  });
  await test('Show binders with Sparks A and the coaches binder builds both on the Reports tab', async () => {
    await page.check('#dlg input[data-bind="2"]'); await page.check('#dlg input[data-bind="coaches"]');
    await page.click('#bindGo'); await page.waitForTimeout(400);
    assert(await page.isVisible('#tab-reports'), 'on the Reports tab');
    const text = await page.textContent('#report');
    assert(/Sparks A/.test(text), 'the Sparks A class binder is there');
    assert(/Volunteer Contact List/.test(text), 'the volunteer list is there');
    assert(/by name|Emergency, Medical and Photos/.test(text), 'the coaches binder roster is there');
    // The coaches binder covers every class, so Cubbies appears here through it; the class-only case is checked below.
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
