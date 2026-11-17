// Wide screen: on a child's Progress sheet the person bar (Person, Previous, Next) stays at the top while the sheet scrolls. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/pinned-person-bar-browser.test.js
const { chromium } = require('playwright');
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
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
  const prep = async (w, h) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } }), page = await ctx.newPage(), errs = [];
    page.on('dialog', d => d.dismiss()); page.on('pageerror', e => errs.push(e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    await page.evaluate(() => { const k = App.master.people.find(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'T&T'); App.showPerson(k[Model.X.ID]); });
    await page.waitForTimeout(400); return { page, errs };
  };
  const bar = page => page.evaluate(() => { const b = document.getElementById('personBar').getBoundingClientRect(), s = document.querySelector('main'), m = s.getBoundingClientRect(); return { gap: Math.round(b.top - m.top), h: Math.round(b.height), scrolled: s.scrollTop }; });
  await test('Progress sheet, wide screen: the person bar is still at the top of the page after scrolling the sheet', async () => {
    const { page, errs } = await prep(1280, 700); assert.strictEqual(await page.evaluate(() => document.getElementById('progressWrap').hidden), false, 'the Progress sheet is showing');
    await page.mouse.move(600, 400); await page.mouse.wheel(0, 1500); await page.waitForTimeout(400);
    const r = await bar(page); assert(r.scrolled > 300, 'the page scrolled (' + r.scrolled + ')'); assert(r.h > 10 && Math.abs(r.gap) <= 2, 'bar pinned at the top, gap ' + r.gap);
    assert.strictEqual(await page.evaluate(() => { const r = document.querySelector('#personBar select').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), true, 'the Person selector is on screen');
    assert.deepStrictEqual(errs, []); await page.close();
  });
  await test('the pinned Next button still steps to the next child', async () => {
    const { page } = await prep(1280, 700); const was = await page.inputValue('#pePerson');
    await page.mouse.move(600, 400); await page.mouse.wheel(0, 1500); await page.waitForTimeout(300); await page.click('#btnPeNext'); await page.waitForTimeout(500);
    assert.notStrictEqual(await page.inputValue('#pePerson'), was); await page.close();
  });
  await test('not pinned while the sheet is not showing', async () => {
    const { page } = await prep(1280, 700); await page.evaluate(() => { document.getElementById('progressWrap').hidden = true; });
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.getElementById('personBar')).position), 'static'); await page.close();
  });
  console.log(passed + ' passed, ' + failed + ' failed'); await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})();
