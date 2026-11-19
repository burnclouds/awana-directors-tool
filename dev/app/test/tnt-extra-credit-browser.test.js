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
  await test('a T&T child: the Silver and Gold blocks sit under the extra-credit heading', async () => {
    assert(await showGroup('T&T'), 'no T&T child in the test data'); await page.waitForTimeout(500);
    const n = await page.$$eval('.pextra', els => els.length); assert.strictEqual(n, 1, 'heading count ' + n);
    const after = await page.evaluate(() => { const h = document.querySelector('.pextra'); const next = h && h.nextElementSibling; return next && /^(Silver|Gold)/.test(next.querySelector('.plabel') ? next.querySelector('.plabel').textContent : ''); });
    assert(after, 'the heading is not directly above a Silver or Gold block');
  });
  await test('a Sparks child has no extra-credit heading', async () => {
    assert(await showGroup('Sparks'), 'no Sparks child'); await page.waitForTimeout(500);
    assert.strictEqual(await page.$$eval('.pextra', els => els.length), 0);
  });
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
