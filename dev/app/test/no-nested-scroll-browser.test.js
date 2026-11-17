// One vertical scroll bar only: the page's. No box inside a tab (or the manual, or a list in a tab) may scroll up and down by itself, on a desktop or a phone;
// a box wider than the screen scrolls sideways; a table that fits keeps its header in view as the page scrolls. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/no-nested-scroll-browser.test.js
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
  const TABS = ['todo', 'attend', 'games', 'awards','roster', 'person', 'uniforms', 'calendar', 'stats', 'store', 'reports', 'history', 'options', 'help', 'validate', 'debug'];
  const nested = page => page.evaluate(() => [...document.querySelectorAll('main *, #optionsWrap *')].filter(e => !e.closest('dialog, .modal-wrap, #splash, .tabs, .trailmenu, .savemenu, textarea, select')).filter(e => { const c = getComputedStyle(e); return /auto|scroll|overlay/.test(c.overflowY) && e.scrollHeight > e.clientHeight + 1; }).map(e => (e.id || e.className || e.tagName) + ' ' + e.scrollHeight + '>' + e.clientHeight));
  for (const [name, size] of [['desktop', { width: 1280, height: 720 }], ['wide desktop', { width: 1920, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    await test(name + ': no box inside any tab has an up-and-down scroll bar of its own', async () => {
      const { page } = await open(); await page.setViewportSize(size); const bad = [];
      for (const t of TABS) { await tab(page, t); await page.waitForTimeout(200); if (t === 'help') { await page.fill('#helpQ', 'a'); await page.waitForTimeout(150); } (await nested(page)).forEach(b => bad.push(t + ': ' + b)); }
      assert.deepStrictEqual(bad, [], bad.join(' | ')); await page.close();
    });
  }
  await test('the Person tab (with its attention card and attendance table) and Options (with Data checks) scroll as one page', async () => {
    const { page } = await open(); await page.setViewportSize({ width: 1280, height: 720 });
    const id = await page.evaluate(() => App.master.people.find(x => Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'Sparks')[Model.X.ID]); await page.evaluate(i => App.showPerson(i, { attention: true }), id); await page.waitForTimeout(300);
    assert.deepStrictEqual(await nested(page), []); assert(await page.evaluate(() => { const m = document.querySelector('main'); return m.scrollHeight > m.clientHeight + 200; }), 'the page (the main area under the header) is what scrolls');
    await tab(page, 'options'); await page.waitForTimeout(250); assert.deepStrictEqual(await nested(page), []); await page.close();
  });
  await test('a table wider than the screen scrolls sideways inside its box; one that fits does not (and keeps its header in view as the page scrolls)', async () => {
    const { page } = await open(); await page.setViewportSize({ width: 1280, height: 720 });
    await tab(page, 'roster'); await page.waitForTimeout(300); assert(!(await page.$eval('#rosterWrap', e => e.classList.contains('wide'))), 'the roster fits at this width');
    await page.evaluate(() => { document.querySelector('main').scrollTop = 900; }); await page.waitForTimeout(150); const top = await page.$eval('#rosterWrap thead th', e => e.getBoundingClientRect().top), mtop = await page.$eval('main', e => e.getBoundingClientRect().top); assert(top >= mtop - 1 && top <= mtop + 3, 'the column header stayed in view at the top of the scrolling area (' + mtop + 'px): ' + top);      // the header, tabs and Recent bar sit above the scroller, so the column heading sticks flush to its top
    await page.setViewportSize({ width: 900, height: 720 }); await page.waitForTimeout(400); assert(await page.$eval('#rosterWrap', e => e.classList.contains('wide')), 'narrower: it scrolls sideways instead'); await page.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
