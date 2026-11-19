// Long messages in a table (Data checks on Options, the Validate results, the To do rows) wrap inside their own cell instead of running under the link or button beside them. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/table-wrap-browser.test.js
// Usage: NODE_PATH=<dir with playwright> node test/info-browser.test.js
// Usage: NODE_PATH=<dir with playwright> node test/options-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f))), EXPORT = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort()[0]), NEWER = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort().pop());   // NEWER adds 15 registrations, so it needs a review
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
    const ctx = await browser.newContext({ acceptDownloads: true }), page = await ctx.newPage(), msgs = [];
    page.on('dialog', d => { msgs.push(d.message()); d.accept(); }); page.on('pageerror', e => msgs.push('PAGE ERROR ' + e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { page, msgs };
  };
  const tab = (page, n) => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), n);
  const overlaps = (page, sel) => page.evaluate(s => [...document.querySelectorAll(s + ' tbody tr')].filter(tr => { const cells = [...tr.cells]; return cells.some((c, i) => i && c.getBoundingClientRect().left < cells[i - 1].getBoundingClientRect().right - 1) || cells.some(c => c.scrollWidth > c.clientWidth + 1); }).length, sel);
  await test('Options > Data checks: every message wraps inside its cell and the Open link is never covered, at desktop and narrower widths', async () => {
    const { page } = await open(); await tab(page, 'options'); await page.waitForTimeout(300);
    for (const w of [1280, 1000, 900]) { await page.setViewportSize({ width: w, height: 800 }); await page.waitForTimeout(700); const rows = await page.locator('#optChecks tbody tr').count(); assert(rows >= 2, 'there are warnings to look at: ' + rows);
      assert.strictEqual(await overlaps(page, '#optChecks table'), 0, 'a message runs under its neighbour at ' + w); }
    assert((await page.$$eval('#optionsWrap td.wrap', e => e.filter(x => getComputedStyle(x).whiteSpace === 'normal').length)) >= 2, 'the message cells really are allowed to wrap'); await page.close();
  });
  await test('the same on the To do tab (its Open links) and the Validate tab', async () => {
    const { page } = await open(); await tab(page, "todo"); await page.waitForTimeout(700); assert.strictEqual(await overlaps(page, '#todoWrap table'), 0, 'To do');
    await page.setInputFiles('#vFiles', [EXPORT]); await page.waitForTimeout(600); await tab(page, 'validate'); await page.waitForTimeout(250); assert.strictEqual(await overlaps(page, '#validateWrap table'), 0, 'Validate'); await page.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
