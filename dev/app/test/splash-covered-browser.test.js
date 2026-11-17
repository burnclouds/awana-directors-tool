// On a phone (390px) the opening screen's card is not covered by the sticky tab-menu bar: what is drawn at the title and at the first
// step is the splash itself. Born from review item R22 (Mike's phone screenshot: the bar sat across the card's title).
// Usage: NODE_PATH=<dir with playwright> node test/splash-covered-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  await new Promise(r => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port + '/index.html', browser = await chromium.launch();
  const cases = [['phone, light', { width: 390, height: 844 }, 'light', true], ['phone, dark', { width: 390, height: 844 }, 'dark', true], ['small phone', { width: 320, height: 568 }, 'light', true], ['phone, landscape', { width: 844, height: 390 }, 'light', true], ['desktop', { width: 1280, height: 800 }, 'light', false]];
  for (const [label, viewport, colorScheme, touch] of cases) {
    await test('the opening screen is not covered by the page behind it (' + label + ')', async () => {
      const ctx = await browser.newContext({ viewport, colorScheme, hasTouch: touch, isMobile: touch }), p = await ctx.newPage();
      await p.goto(url); await p.waitForSelector('#splash:not([hidden]) .splash-card h2'); await p.waitForTimeout(800);      // the page's scripts have run (the bar is placed after they do)
      // The splash fills the screen, so every point of the viewport must belong to it: sample a column near the left edge, the middle and the right edge, every 6px down.
      const r = await p.evaluate(() => {
        const covered = {}; let n = 0;
        for (const x of [12, Math.floor(innerWidth / 2), innerWidth - 12]) for (let y = 2; y < innerHeight; y += 6) {
          const el = document.elementFromPoint(x, y); n++;
          if (!(el && el.closest('#splash'))) { const k = el ? (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')) : 'nothing'; covered[k] = (covered[k] || 0) + 1; }
        }
        // The browser's hit test does not see the sticky bar painting over the card (found with a screenshot), so also check the styles: while the
        // opening screen shows, the tab bar must be hidden or stacked below it.
        const sp = getComputedStyle(document.getElementById('splash')), tw = document.querySelector('.tabwrap'), cs = getComputedStyle(tw), rect = tw.getBoundingClientRect();
        const shown = cs.visibility !== 'hidden' && cs.display !== 'none' && rect.height > 0, above = (Number(cs.zIndex) || 0) > (Number(sp.zIndex) || 0);
        if (shown && above) covered['.tabwrap (z-index ' + cs.zIndex + ' over the splash ' + sp.zIndex + ')'] = 1;
        return { n, covered, title: !!document.querySelector('#splash:not([hidden]) .splash-card h2') };
      });
      assert(r.title, 'the splash title exists');
      assert.deepStrictEqual(r.covered, {}, 'parts of the screen are drawn above the opening screen: ' + JSON.stringify(r.covered) + ' of ' + r.n + ' points');
      await ctx.close();
    });
  }
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})().catch(e => { console.log('ERROR ' + e.message); process.exit(1); });
