// Clicking a top-level tab scrolls the page (on a desktop the area under the header) to its top (also when it is the tab you are on); a tab that cannot be left (held changes) does not scroll. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/tab-scroll-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 700 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const click = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  await test('clicking another tab while scrolled down opens it at the top', async () => {
    await click('roster'); await page.waitForTimeout(400); await page.evaluate(() => document.querySelector('main').scrollTop = 600); await page.waitForTimeout(150);
    assert(await page.evaluate(() => document.querySelector('main').scrollTop) > 100, 'the page is scrolled'); await click('attend'); await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(() => Math.round(document.querySelector('main').scrollTop)), 0);
  });
  await test('clicking the tab you are on scrolls it back to the top', async () => {
    await click('roster'); await page.waitForTimeout(400); await page.evaluate(() => document.querySelector('main').scrollTop = 500); await page.waitForTimeout(150);
    await click('roster'); await page.waitForTimeout(300); assert.strictEqual(await page.evaluate(() => Math.round(document.querySelector('main').scrollTop)), 0);
  });
  await test('arrow-key tab switching also opens at the top', async () => {
    await click('roster'); await page.waitForTimeout(300); await page.evaluate(() => document.querySelector('main').scrollTop = 500); await page.focus('.tabs button[data-tab="roster"]'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(() => Math.round(document.querySelector('main').scrollTop)), 0);
  });
  await test('on a desktop only the area under the header scrolls: the window has no scroll bar of its own and the header stays put', async () => {
    await click('roster'); await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const m = document.querySelector('main'), d = document.documentElement, top = document.getElementById('stickyTop').getBoundingClientRect(), topBefore = Math.round(top.top); m.scrollTop = 400;
      return { windowScrolls: d.scrollHeight > d.clientHeight + 1, mainScrolls: m.scrollHeight > m.clientHeight, mainTop: Math.round(m.getBoundingClientRect().top), headBottom: Math.round(top.bottom), headMoved: Math.round(document.getElementById('stickyTop').getBoundingClientRect().top) - topBefore }; });
    assert.strictEqual(r.windowScrolls, false, 'the window itself does not scroll'); assert(r.mainScrolls, 'main scrolls'); assert(r.mainTop >= r.headBottom - 1, 'the scroller starts under the header: ' + JSON.stringify(r)); assert.strictEqual(r.headMoved, 0, 'the header did not move');
  });
  await test('on a phone the page scrolls as before', async () => {
    await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(300);
    const m = await page.evaluate(() => getComputedStyle(document.querySelector('main')).overflowY); assert.notStrictEqual(m, 'auto', 'main is not the scroller on a phone: ' + m); await page.setViewportSize({ width: 1280, height: 700 });
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
