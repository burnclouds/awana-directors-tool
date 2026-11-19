// N40 Option A, Debug tab "Readable copy": the button downloads a read-only JSON with the codes spelled out, to this computer; the data file is not changed; the app refuses to open the copy. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/debug-readable-browser.test.js
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
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => App.showTab('debug')); await page.waitForTimeout(250);
  const before = await page.evaluate(() => ({ h: App.season.history.length, json: JSON.stringify(App.season) }));
  let copy = null, fileName = '';
  await test('the Debug tab has the Readable copy button, and a press downloads one file named READABLE', async () => {
    assert(await page.evaluate(() => !!document.getElementById('dbgReadable')), 'no button');
    const dl = page.waitForEvent('download', { timeout: 8000 });
    await page.click('#dbgReadable'); await page.waitForTimeout(150); await page.click('#dbgReadable');      // test data: two presses (the app's own guard for invented files)
    const d = await dl; fileName = d.suggestedFilename(); assert(/READABLE/.test(fileName) && /\.json$/.test(fileName), fileName); copy = JSON.parse(fs.readFileSync(await d.path(), 'utf8'));
  });
  await test('the copy is marked readable and read-only, names the children, and spells out the codes', async () => {
    assert.strictEqual(copy.readable, true); assert.strictEqual(copy.readOnly, true); assert(Object.keys(copy.who).length > 50, 'who has ' + Object.keys(copy.who).length);
    const hb = Object.values(copy.handbooks)[0]; assert(hb && 'code' in hb && 'date' in hb, 'handbook not split: ' + JSON.stringify(hb)); const night = Object.values(copy.attendance)[0], mark = Object.values(night)[0]; assert(mark.present === true, 'attendance mark not spelled out: ' + JSON.stringify(mark));
  });
  await test('making the copy does not change the data file', async () => {
    const after = await page.evaluate(() => ({ h: App.season.history.length, json: JSON.stringify(App.season) })); assert.strictEqual(after.h, before.h, 'History changed'); assert.strictEqual(after.json, before.json, 'data changed');
  });
  await test('the app refuses to open the copy, with a plain sentence', async () => {
    const msg = await page.evaluate(t => { try { Season.fromJson(t); return ''; } catch (e) { return e.message; } }, JSON.stringify(copy)); assert(/readable copy.*for reading only/.test(msg), msg);
  });
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
