// N44 (part a): a flag made on a filter (the Attendance Class picker) remembers the filter's value; Go sets the filter back to it; a bug report on a filter keeps it too. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/flag-filter-browser.test.js
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
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => document.querySelector('.tabs button[data-tab="attend"]').click()); await page.waitForTimeout(400);
  const rooms = await page.evaluate(() => [...document.querySelectorAll('#attRoom option')].map(o => o.value).filter(Boolean));
  assert(rooms.length >= 2, 'need two classes in the test club');
  const [first, second] = rooms;
  await test('a flag on the Class filter keeps the class it was made on', async () => {
    await page.evaluate(v => { const s = document.getElementById('attRoom'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, first); await page.waitForTimeout(300);
    const id = await page.evaluate(v => App.addFlag({ kid: '', level: 'element', note: 'wrong class', tab: 'attend', trail: ['Attendance', 'Class'], filter: { id: 'attRoom', value: v } }), first);
    assert.deepStrictEqual(await page.evaluate(i => App.season.flags[i].filter, id), { id: 'attRoom', value: first });
    await page.evaluate(v => { const s = document.getElementById('attRoom'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, second); await page.waitForTimeout(300);
    await page.evaluate(i => App.goFlag(i), id); await page.waitForTimeout(700);
    assert.strictEqual(await page.evaluate(() => document.getElementById('attRoom').value), first, 'Go did not set the class back');
  });
  await test('a bug report made on a filter keeps the filter too', async () => {
    const id = await page.evaluate(v => App.addFlag({ kid: '', level: 'bug', note: 'the class list is wrong', tab: 'attend', trail: ['Attendance', 'Class'], filter: { id: 'attRoom', value: v } }), second);
    assert.deepStrictEqual(await page.evaluate(i => App.season.flags[i].filter, id), { id: 'attRoom', value: second });
  });
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
