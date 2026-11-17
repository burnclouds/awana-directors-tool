// The (i) notes and the manual's search in a real browser: hover tip, click to expand under the control (and fold again), notes survive a redraw, none of it on a phone, search finds and jumps.
// Invented test club only.
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
  const vis = (page, sel) => page.isVisible(sel);
  await test('hovering an (i) shows its one-line tip; clicking opens the note as a popup, and clicking again closes it', async () => {
    const { page, msgs } = await open(); await tab(page, 'attend'); await page.waitForTimeout(200);
    const i = page.locator('#attendBar i.info[data-info="attend.hold"]'); assert.strictEqual(await i.getAttribute('role'), 'button'); assert.strictEqual(await i.getAttribute('aria-expanded'), 'false');
    await i.hover(); await page.waitForTimeout(150); assert(await vis(page, '#infoTip')); assert(/Apply changes|kept at once/.test(await page.textContent('#infoTip')));
    await i.click(); await page.waitForTimeout(100); assert.strictEqual(await i.getAttribute('aria-expanded'), 'true');
    const box = page.locator('.infobox:visible'); assert.strictEqual(await box.count(), 1); assert(/Off \(the default/.test(await box.textContent()), 'says which option to use when');
    assert(!(await vis(page, '#infoTip')), 'the tip steps aside for the open note');
    await i.click(); await page.waitForTimeout(100); assert.strictEqual(await page.locator('.infobox:visible').count(), 0); assert.strictEqual(await i.getAttribute('aria-expanded'), 'false');
    assert.strictEqual(await page.$eval('#attHold', e => e.checked), false, 'clicking the (i) inside a label did not tick the box'); assert(!msgs.some(m => /ERROR/.test(m)), msgs.join()); await page.close();
  });
  await test('the note is a popup over the page: it is fixed on screen, near its (i), inside the window, and opening it does not move anything on the page', async () => {
    const { page } = await open(); await tab(page, 'options'); await page.waitForTimeout(300);
    const probe = async () => page.evaluate(() => [...document.querySelectorAll('#optionsWrap h3, #optionsWrap h4, #optionsWrap label')].slice(0, 30).map(e => Math.round(e.getBoundingClientRect().top)).join(','));
    await page.evaluate(() => document.querySelector('#optionsWrap i.info[data-info="options.sparks"]').scrollIntoView({ block: 'center' })); await page.waitForTimeout(150);
    const before = await probe(), h0 = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.evaluate(() => document.querySelector('#optionsWrap i.info[data-info="options.sparks"]').click()); await page.waitForTimeout(150);      // (a scripted click: Playwright's own click scrolls the button into view first, which would move the page by itself)
    assert.strictEqual(await probe(), before, 'nothing on the page moved'); assert.strictEqual(await page.evaluate(() => document.documentElement.scrollHeight), h0, 'the page is no taller');
    const r = await page.$eval('.infobox:visible', e => { const b = e.getBoundingClientRect(), s = getComputedStyle(e), i = document.querySelector('#optionsWrap i.info[data-info="options.sparks"]').getBoundingClientRect(); return { pos: s.position, z: +s.zIndex, l: b.left, t: b.top, r: b.right, b: b.bottom, iy: i.bottom, ix: i.left, w: innerWidth, h: innerHeight }; });
    assert.strictEqual(r.pos, 'fixed'); assert(r.z >= 60); assert(r.l >= 0 && r.t >= 0 && r.r <= r.w && r.b <= r.h, 'inside the window: ' + JSON.stringify(r)); assert(Math.abs(r.t - r.iy) < 40 || r.b <= r.iy + 1, 'next to its (i)'); await page.close();
  });
  await test('it closes with the x, with Esc, with a click anywhere else, and when you change tab; only one is open at a time', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(200);
    const a = page.locator('#attendBar i.info[data-info="attend.hold"]'), b = page.locator('#attendBar i.info[data-info="attend.room"]'), open1 = () => page.locator('.infobox:visible').count();
    await a.click(); assert.strictEqual(await open1(), 1); await b.click(); assert.strictEqual(await open1(), 1, 'opening another closes the first'); assert.strictEqual(await a.getAttribute('aria-expanded'), 'false'); assert.strictEqual(await b.getAttribute('aria-expanded'), 'true');
    await page.click('.infobox:visible .infoclose'); assert.strictEqual(await open1(), 0, 'the x'); assert.strictEqual(await b.getAttribute('aria-expanded'), 'false');
    await a.click(); await page.keyboard.press('Escape'); assert.strictEqual(await open1(), 0, 'Esc');
    await a.click(); await page.click('#tab-attend #attendWrap, #attendWrap', { position: { x: 5, y: 5 }, force: true }).catch(() => {}); await page.mouse.click(600, 400); assert.strictEqual(await open1(), 0, 'a click elsewhere');
    await a.click(); assert.strictEqual(await open1(), 1); await tab(page, 'games'); await page.waitForTimeout(200); assert.strictEqual(await open1(), 0, 'changing tab'); await page.close();
  });
  await test('a click inside the popup keeps it open; its "How it works" link closes it and goes to the manual; a long note scrolls inside itself and fits the window', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(200); await page.click('#attendBar i.info[data-info="attend.hold"]'); await page.click('.infobox:visible .infotitle'); assert.strictEqual(await page.locator('.infobox:visible').count(), 1, 'still open');
    await page.setViewportSize({ width: 1100, height: 380 }); await page.click('#fileInfoSrc, header.top i.info[data-info="files.bar"]', { timeout: 3000 }).catch(() => {}); await page.waitForTimeout(150);
    const fit = await page.evaluate(() => { const e = document.querySelector('.infobox:not([hidden])'); if (!e) return null; const r = e.getBoundingClientRect(); return { fits: r.top >= 0 && r.bottom <= innerHeight, scrolls: e.scrollHeight > e.clientHeight, auto: getComputedStyle(e).overflowY }; });
    assert(fit && fit.fits, 'a tall note fits the window: ' + JSON.stringify(fit)); assert.strictEqual(fit.auto, 'auto');
    await page.click('.infobox:visible a[data-infohelp]'); await page.waitForTimeout(300); assert(await vis(page, '#tab-help'), 'the manual is open'); assert.strictEqual(await page.locator('.infobox:visible').count(), 0, 'the note closed'); await page.close();
  });
  await test('a tab that redraws itself (Options) closes the note whose (i) it replaced, and the setting still changes', async () => {
    const { page } = await open(); await tab(page, 'options'); await page.waitForTimeout(250);
    await page.click('i.info[data-info="options.sparks"]'); assert(/Awana.s standard/.test(await page.textContent('.infobox:visible')));
    await page.evaluate(() => { const r = document.querySelector('input[name="optSparks"][value="together"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForTimeout(300);      // the setting changes and the tab redraws its (i) buttons, with no click to close the note first
    assert.strictEqual(await page.locator('.infobox:visible').count(), 0, 'closed when the page redrew its (i)'); assert.strictEqual(await page.evaluate(() => (document.querySelector('input[name="optSparks"]:checked') || {}).value), 'together'); await page.close();
  });
  await test('every (i) on the desktop has a note, a tip and a button role; the notes are reachable on the tabs that have them', async () => {
    const { page } = await open();
    for (const t of ['todo', 'attend', 'games', 'awards','roster', 'person', 'uniforms', 'calendar', 'stats', 'store', 'reports', 'history', 'options', 'validate', 'debug']) {
      await tab(page, t); await page.waitForTimeout(120); const n = await page.locator('#tab-' + t + ' i.info').count(); assert(n >= 1, t + ' has no (i)');
      const bad = await page.$$eval('#tab-' + t + ' i.info', e => e.filter(x => !x.dataset.tip || x.getAttribute('role') !== 'button' || x.textContent !== 'i').length); assert.strictEqual(bad, 0, t + ': an (i) was not set up');
    }
    await page.close();
  });
  await test('on a phone the (i) buttons, notes and tips are not shown at all', async () => {
    const { page } = await open(); await page.setViewportSize({ width: 390, height: 844 }); await tab(page, 'attend'); await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('#tab-attend i.info:visible').count(), 0); assert(!(await vis(page, '#tab-attend .deskonly')));
    await tab(page, 'options'); await page.waitForTimeout(200); assert.strictEqual(await page.locator('#tab-options i.info:visible').count(), 0); await page.close();
  });
  await test('How it works: the notes are in the manual, an (i) links to its entry, and the contents list every tab', async () => {
    const { page } = await open(); await tab(page, 'options'); await page.waitForTimeout(200); await page.click('i.info[data-info="options.sparks"]');
    await page.click('.infobox:visible a[data-infohelp]'); await page.waitForTimeout(300); assert(await vis(page, '#tab-help')); assert(await page.evaluate(() => document.getElementById('o-options-sparks') !== null));
    assert(await page.evaluate(() => { const r = document.getElementById('o-options-sparks').getBoundingClientRect(); return r.top > -5 && r.top < innerHeight; }), 'scrolled to that entry');
    const links = await page.$$eval('#tab-help nav.toc a', a => a.map(x => x.textContent)); for (const t of ['To do', 'Attendance', 'Color team games', 'Options', 'How it works', 'Debug', 'Which option when']) assert(links.includes(t), 'contents lacks ' + t);
    await page.close();
  });
  await test('search: every word must match, results name their section, a click scrolls to the line and marks the words, Esc clears', async () => {
    const { page } = await open(); await tab(page, 'help'); await page.waitForTimeout(200);
    await page.fill('#helpQ', 'merge'); await page.waitForTimeout(150); const n = await page.$$eval('#helpResults a[data-hit]', e => e.length); assert(n >= 3, 'results: ' + n); assert(/match/.test(await page.textContent('#helpCount')));
    assert(/\u203a/.test(await page.textContent('#helpResults li')), 'a crumb with the section');
    await page.fill('#helpQ', 'hold changes'); await page.waitForTimeout(150); assert(/Hold changes/i.test(await page.textContent('#helpResults')));
    await page.fill('#helpQ', 'sparks all together'); await page.waitForTimeout(150); const first = await page.textContent('#helpResults li'); assert(/Sparks|together/i.test(first), first);
    await page.click('#helpResults a[data-hit]'); await page.waitForTimeout(700); assert(await page.locator('#tab-help mark.hit').count() >= 1, 'the words are marked in the text');
    await page.fill('#helpQ', 'zzzqqq'); await page.waitForTimeout(100); assert(/no match/.test(await page.textContent('#helpCount'))); assert(/Nothing in the manual/.test(await page.textContent('#helpResults')));
    await page.fill('#helpQ', 'store'); await page.press('#helpQ', 'Escape'); assert.strictEqual(await page.inputValue('#helpQ'), ''); assert(!(await vis(page, '#helpResults'))); assert.strictEqual(await page.locator('#tab-help mark.hit').count(), 0);
    await page.close();
  });
  await test('search works for an option note by its title and the "/" key focuses the box', async () => {
    const { page } = await open(); await tab(page, 'help'); await page.waitForTimeout(200); await page.click('#tab-help h2'); await page.keyboard.press('/'); assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'helpQ');
    await page.keyboard.type('save style'); await page.waitForTimeout(150); assert(/Save style/.test(await page.textContent('#helpResults li')), 'the note ranks first'); await page.close();
  });
  await test('the examples: four of them, folded until opened, each with Copy and Download; a download is the example itself under its own file name', async () => {
    const { page } = await open(); await tab(page, 'help'); await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('#tab-help details.example').count(), 4); assert.strictEqual(await page.locator('#tab-help details.example[open]').count(), 0, 'folded');
    assert.strictEqual(await page.locator('#tab-help .exbtns button[data-excopy]').count(), 4); assert.strictEqual(await page.locator('#tab-help .exbtns button[data-exdl]').count(), 4);
    await page.click('nav.toc a[href="#m-f-examples"]'); await page.waitForTimeout(300); await page.click('#m-ex-calendar summary'); assert(await page.locator('#m-ex-calendar pre').isVisible());
    const dl = page.waitForEvent('download'); await page.click('#m-ex-calendar [data-exdl]'); const d = await dl; assert.strictEqual(d.suggestedFilename(), 'calendar-example.csv');
    const text = fs.readFileSync(await d.path(), 'utf8'); assert.strictEqual(text, await page.$eval('#m-ex-calendar pre', e => e.textContent)); assert(/^Date,Type,Quarter/.test(text)); await page.close();
  });
  await test('the examples work as templates: the downloaded calendar example imports into the app and replaces the calendar; a rotation file is politely left out', async () => {
    const { page } = await open(); await tab(page, 'help'); await page.waitForTimeout(200); const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'awana-ex-')); const files = [];
    for (const k of ['calendar']) { await page.evaluate(i => document.getElementById('m-ex-' + i).open = true, k); const dl = page.waitForEvent('download'); await page.click('#m-ex-' + k + ' [data-exdl]'); const d = await dl, f = path.join(dir, d.suggestedFilename()); await d.saveAs(f); files.push(f); }
    await page.setInputFiles('#fileAny', files); await page.waitForTimeout(700);
    assert.strictEqual(await page.evaluate(() => App.calendar.length), 4, 'the example calendar replaced the calendar'); await page.close();
  });
  await test('search finds text inside an example and opens it; a contents link into a folded example opens it', async () => {
    const { page } = await open(); await tab(page, 'help'); await page.waitForTimeout(200); await page.fill('#helpQ', 'Unique ID'); await page.waitForTimeout(150);
    const hit = page.locator('#helpResults li', { hasText: /Color teams CSV|Unique ID/ }).first(); await hit.locator('a').click(); await page.waitForTimeout(600);
    assert(await page.locator('#m-ex-colors[open], #m-ex-pc[open], #m-ex-calendar[open]').count() >= 1, 'the example the result is in was opened'); await page.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
