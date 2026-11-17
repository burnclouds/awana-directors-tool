const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });

// Statistics sub-tabs: Attendance; Progress, awards and pace; Color teams. One group shows at a time, the choice survives a redraw, the keyboard stays on the pressed button, and a phone gets no sideways page scroll.
// Usage: NODE_PATH=<dir with playwright> node test/stats-subtabs-browser.test.js
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } }), page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  const heads = () => page.$$eval('#statsWrap h3', h => h.map(x => x.textContent.trim()));
  const pressed = () => page.$$eval('#statsWrap .statsubs button', b => b.filter(x => x.getAttribute('aria-pressed') === 'true').map(x => x.textContent));
  await tab('stats'); await page.waitForTimeout(400);

  await test('three groups, Attendance first; only its sections show', async () => {
    assert.deepStrictEqual(await page.$$eval('#statsWrap .statsubs button', b => b.map(x => x.textContent)), ['Attendance', 'Progress, awards and pace', 'Color teams']);
    assert.deepStrictEqual(await pressed(), ['Attendance']);
    const h = await heads(); assert(h.includes('Attendance by class') && h.includes('Most nights present'), h.join(' | ')); assert(!h.includes('Sparks pace') && !h.includes('Achievement'), 'progress sections are not on this group: ' + h.join(' | '));
  });
  await test('Progress, awards and pace holds the pace views and Achievement together, pace first; the pressed button keeps keyboard focus', async () => {
    await page.click('#statsWrap button[data-sub="progress"]'); await page.waitForTimeout(250);
    assert.deepStrictEqual(await pressed(), ['Progress, awards and pace']);
    const h = await heads(); assert(h.includes('Sparks pace') && h.includes('Achievement'), h.join(' | ')); assert(!h.includes('Attendance by class'), 'attendance sections are not here');
    assert(h.indexOf('Sparks pace') < h.indexOf('Achievement'), 'pace comes before achievement');
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.dataset.sub), 'progress', 'focus stays on the button after the redraw');
  });
  await test('Color teams shows the team points (or says there are none); the choice survives a refresh', async () => {
    await page.click('#statsWrap button[data-sub="teams"]'); await page.waitForTimeout(250);
    const t = await page.textContent('#statsWrap'); assert(/Color team points|No color team points/.test(t), 'team points or the empty note');
    await page.evaluate(() => App.refresh()); await page.waitForTimeout(300); assert.deepStrictEqual(await pressed(), ['Color teams'], 'still Color teams after a redraw');
  });
  await test('keyboard: Tab to a group button and press Enter or Space', async () => {
    await page.focus('#statsWrap button[data-sub="attendance"]'); await page.keyboard.press('Enter'); await page.waitForTimeout(200); assert.deepStrictEqual(await pressed(), ['Attendance']);
    await page.keyboard.press('Tab'); await page.keyboard.press('Space'); await page.waitForTimeout(200); assert.deepStrictEqual(await pressed(), ['Progress, awards and pace']);
  });
  await test('a phone: the three buttons are 44px tall and the page does not scroll sideways on any group', async () => {
    await page.setViewportSize({ width: 375, height: 667 }); await page.waitForTimeout(300);
    for (const g of ['attendance', 'progress', 'teams']) {
      await page.evaluate(() => document.querySelector('#statsWrap').scrollIntoView()); await page.click('#statsWrap button[data-sub="' + g + '"]').catch(async () => { await page.evaluate(x => document.querySelector('#statsWrap button[data-sub="' + x + '"]').click(), g); }); await page.waitForTimeout(250);
      const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth, h: Math.min(...[...document.querySelectorAll('#statsWrap .statsubs button')].map(b => b.getBoundingClientRect().height)) }));
      assert(r.sw <= r.w, g + ': page scrolls sideways ' + r.sw + ' > ' + r.w); assert(r.h >= 44, g + ': buttons ' + r.h + 'px');
    }
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
