// Keyboard and screen-reader basics: table-cell inputs carry a spoken name (column heading plus row), and an open dialog wraps Tab and Shift+Tab inside itself.
// Usage: NODE_PATH=<dir with playwright> node test/a11y-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext()).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);

  await test('every input, select and text box in a table cell has a spoken name (Roster, Uniforms, Calendar), made of its column heading and its row', async () => {
    for (const t of ['roster', 'uniforms', 'calendar']) {
      await tab(t); await page.waitForTimeout(450);
      const bad = await page.evaluate(() => [...document.querySelectorAll('main td input, main td select, main td textarea')].filter(e => e.offsetParent && e.type !== 'file' && !(e.getAttribute('aria-label') || e.title || (e.labels && e.labels.length) || e.closest('label'))).length);
      assert.strictEqual(bad, 0, t + ': ' + bad + ' unnamed');
    }
    await tab('uniforms'); await page.waitForTimeout(300);
    const named = await page.$$eval('main td select, main td input', els => els.map(e => e.getAttribute('aria-label') || ''));
    assert(named.some(x => /^(Size|Ordered|Received), \S/.test(x)), 'a uniform cell is named by column and child: ' + named.slice(0, 3));
  });
  await test('an open dialog wraps Tab and Shift+Tab: focus never leaves it for the browser toolbar', async () => {
    const NEWER = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort().pop());
    await page.setInputFiles('#fileAny', [NEWER]); await page.waitForTimeout(900); assert(await page.isVisible('#review'), 'the import review opened');
    const n = await page.evaluate(() => [...document.getElementById('review').querySelectorAll('input,button,select,textarea,a[href]')].filter(x => !x.disabled && x.offsetParent && x.tabIndex >= 0).length);
    assert(n > 1, 'the review has controls');
    for (let i = 0; i < n + 3; i++) { await page.keyboard.press('Tab'); assert(await page.evaluate(() => document.getElementById('review').contains(document.activeElement)), 'Tab press ' + (i + 1) + ' left the dialog'); }
    for (let i = 0; i < n + 3; i++) { await page.keyboard.press('Shift+Tab'); assert(await page.evaluate(() => document.getElementById('review').contains(document.activeElement)), 'Shift+Tab press ' + (i + 1) + ' left the dialog'); }
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
