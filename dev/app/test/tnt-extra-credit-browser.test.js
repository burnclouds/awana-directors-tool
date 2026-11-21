// N32: on a T&T child's Progress page the Silver and Gold extra-credit blocks sit under a visible heading; a Sparks or Cubbies page has none. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/tnt-extra-credit-browser.test.js
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
  await page.waitForTimeout(400);
  const showGroup = async group => page.evaluate(g => { const A = window.App, M = window.Model, p = A.master.people.find(x => M.isActive(x) && M.groupOf(M.room(x)) === g);
    if (!p) return false; A.showPerson(p[M.X.ID], { sub: 'progress' }); return true; }, group);
  await test('a T&T child: Silver and Gold rows sit directly under each emblem section (N59)', async () => {
    assert(await showGroup('T&T'), 'no T&T child in the test data'); await page.waitForTimeout(500);
    const sections = await page.$$eval('.tnt-section', els => els.length);
    assert.strictEqual(sections, 8, '8 T&T emblem sections with Silver and Gold directly under each');
    // Check Green Emblem 1 section
    const geSec = await page.evaluate(() => {
      const sec = Array.from(document.querySelectorAll('.tnt-section')).find(s => s.textContent.includes('Green Emblem 1'));
      if (!sec) return null;
      const rows = Array.from(sec.querySelectorAll('.tnt-row'));
      const labels = rows.map(r => r.querySelector('.plabel') ? r.querySelector('.plabel').textContent.trim() : '');
      const boxes = rows.map(r => Array.from(r.querySelectorAll('.pcell:not(.pcell-ghost) input[data-key]')).map(i => i.dataset.key.replace(/^[A-Z0-9]+\./, '')));
      const gives = rows.map(r => !!r.querySelector('.pgive'));
      return { labels, boxes, gives };
    });
    assert(geSec, 'Green Emblem 1 section found');
    assert.deepStrictEqual(geSec.labels.map(l => l.replace(/ ✓$/, '')), ['Green Emblem 1', 'Silver 2', 'Gold 2'], '3 rows: Emblem, Silver 2, Gold 2');
    assert.deepStrictEqual(geSec.boxes[0], ['2.1', '2.2', '2.3', '2.4'], 'Emblem boxes 2.1 to 2.4');
    assert.deepStrictEqual(geSec.boxes[1], ['2.1', '2.2', '2.3', '2.4'], 'Silver 2 boxes 2.1 to 2.4');
    assert.deepStrictEqual(geSec.boxes[2], ['2.1', '2.2', '2.3', '2.4'], 'Gold 2 boxes 2.1 to 2.4');
    assert.deepStrictEqual(geSec.gives, [true, true, true], 'each row has its own Given box');
  });
  await test('a Sparks child has no .tnt-section', async () => {
    assert(await showGroup('Sparks'), 'no Sparks child'); await page.waitForTimeout(500);
    assert.strictEqual(await page.$$eval('.tnt-section', els => els.length), 0);
  });
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
