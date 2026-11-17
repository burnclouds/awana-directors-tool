// The More menu (and the Save menu) open over a tab's own sticky toolbar: on Reports the toolbar (.rhead, z-index 20) painted over the middle of the menu, because the whole header is one
// stacking layer (#stickyTop is a flex item of body, so its z-index counts even though it is position:static) and that layer was below the toolbar. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/more-menu-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.json$/.test(f)).sort().pop());
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  await new Promise(r => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port + '/index.html', browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), p = await ctx.newPage(); p.on('dialog', d => d.dismiss());
  await p.goto(url); await p.setInputFiles('#splashFiles', [DATA]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); await p.waitForTimeout(300);
  // Is every item of the open More menu the thing on top at its own centre?
  const covered = () => p.evaluate(() => [...document.querySelectorAll('#moreMenu button')].filter(b => b.offsetParent !== null).map(b => { const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e && (e === b || b.contains(e)) ? null : b.textContent.trim() + ' (covered by ' + (e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : e.className ? '.' + String(e.className).split(' ')[0] : '') : 'nothing') + ')'; }).filter(Boolean));
  for (const tab of ['reports', 'person', 'roster', 'todo', 'attend', 'calendar']) {
    await test('on ' + tab + ' every item of the More menu is on top of the page', async () => {
      await p.evaluate(t => document.querySelector('.tabs button[data-tab="' + t + '"]').click(), tab); await p.waitForTimeout(300);
      await p.click('#tabMore'); await p.waitForTimeout(200);
      const n = await p.evaluate(() => [...document.querySelectorAll('#moreMenu button')].filter(b => b.offsetParent !== null).length); assert(n >= 3, 'the More menu has ' + n + ' items');
      const c = await covered(); assert.deepStrictEqual(c, [], 'covered: ' + c.join('; '));
      await p.keyboard.press('Escape'); await p.waitForTimeout(100);
    });
  }
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})().catch(e => { console.log('ERROR ' + e.message); process.exit(1); });
