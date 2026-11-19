// N9 point 13: the Club night pack is a standard bundle (announce list and hand-out strips); a club with its own bundles can add the standard ones it lacks, and its own bundles are not changed. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/bundles-club-night-browser.test.js
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
  await test('the standard bundles include the Club night pack, with the announce list and the hand-out strips', async () => {
    const names = await page.evaluate(() => AwanaReports.DEFAULT_BUNDLES().map(b => b.name)).catch(() => null);
    const list = await page.evaluate(() => Reports.DEFAULT_BUNDLES().map(b => b.name));
    assert(list.includes('Club night pack'), list.join(', ')); assert(names === null || names.includes('Club night pack'));
    const pack = await page.evaluate(() => Reports.DEFAULT_BUNDLES().find(b => b.name === 'Club night pack').items.map(i => i.report));
    assert.deepStrictEqual(pack, ['announceList', 'handOut']);
  });
  await test('a club with its own bundles sees the add button; it adds the standard bundles it lacks and leaves its own unchanged', async () => {
    await page.evaluate(() => { App.season.config.bundles = [{ name: 'Mine', items: [{ report: 'attendance' }] }]; App.touch(); });
    await page.evaluate(() => App.tabs.options()); await page.waitForTimeout(300);      // draw the Options page (it sits under More, so the tab button alone does not draw it here)
    assert(await page.$('#optBundleAddStd'), 'no add button shown for a club with its own bundles');
    await page.evaluate(() => document.getElementById('optBundleAddStd').click()); await page.waitForTimeout(400);
    const names = await page.evaluate(() => App.season.config.bundles.map(b => b.name));
    assert.strictEqual(names[0], 'Mine', names.join(', ')); assert(names.includes('Club night pack') && names.includes('Quarterly Printables'), names.join(', '));
    assert.deepStrictEqual(await page.evaluate(() => App.season.config.bundles[0].items.map(i => i.report)), ['attendance'], 'own bundle unchanged');
  });
  await test('pressing it again adds nothing', async () => {
    await page.evaluate(() => document.getElementById('optBundleAddStd').click()); await page.waitForTimeout(300);
    const n = await page.evaluate(() => App.season.config.bundles.length); assert.strictEqual(n, 5, 'bundles ' + n + ' (their own one, plus the four standard)');
  });
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
