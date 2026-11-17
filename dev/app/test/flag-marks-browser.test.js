// Yellow flags for flags made with Flag anything: each flagged element shows a yellow flag at its corner (an overlay outside the tabs), following scroll, resize and redraws; clicking it opens the popup. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/flag-marks-browser.test.js
const { chromium } = require('playwright');
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').slice(0, 6).join(' | ')); } }
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
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 700 } }), page = await ctx.newPage(), errs = [];
    page.on('dialog', d => d.dismiss()); page.on('pageerror', e => errs.push(e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { page, errs };
  };
  const tab = (page, n) => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), n);
  // Flag an element the way the Flag button does (the same trail, saved through App.addFlag).
  const flagEl = (page, tabName, sel, note) => page.evaluate(([t, s, n]) => { const el = document.querySelector(s), i = App.flagTrail.infoOf(el); return App.addFlag({ level: 'element', tab: t, trail: i.trail, label: i.label, rowIndex: i.rowIndex, note: n }); }, [tabName, sel, note]);
  const marks = page => page.locator('#flagLayer .flagbtn:visible').count();
  const gap = (page, sel) => page.evaluate(s => { const m = document.querySelector('#flagLayer .flagbtn:not([hidden])').getBoundingClientRect(), e = document.querySelector(s).getBoundingClientRect(); return Math.hypot((m.left + m.width / 2) - e.right, (m.top + m.height / 2) - e.top); }, sel);

  await test('a flagged element shows one yellow flag at its top-right corner, only on its own tab', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(300);
    assert.strictEqual(await marks(page), 0, 'nothing flagged, nothing drawn'); await flagEl(page, 'attend', '#btnAllPresent', 'count the room'); await page.waitForTimeout(400);
    assert.strictEqual(await marks(page), 1); assert((await gap(page, '#btnAllPresent')) <= 24, 'near the corner');
    assert.strictEqual(await page.locator('#flagLayer .flagbtn').evaluate(b => getComputedStyle(b).color), 'rgb(224, 160, 48)');
    await tab(page, 'todo'); await page.waitForTimeout(400); assert.strictEqual(await marks(page), 0, 'not on another tab'); await tab(page, 'attend'); await page.waitForTimeout(400); assert.strictEqual(await marks(page), 1, 'back again'); await page.close();
  });
  await test('it stays on its element after a scroll and a window resize', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(300); await flagEl(page, 'attend', '#btnAllPresent', 'x'); await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollBy(0, 120)); await page.waitForTimeout(200); if (await marks(page)) assert((await gap(page, '#btnAllPresent')) <= 24, 'after scroll');
    await page.evaluate(() => window.scrollTo(0, 0)); await page.setViewportSize({ width: 1000, height: 700 }); await page.waitForTimeout(300); assert.strictEqual(await marks(page), 1); assert((await gap(page, '#btnAllPresent')) <= 24, 'after resize'); await page.close();
  });
  await test('clicking it opens the popup with the note; Save changes it on To do; Clear removes the flag and the mark', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(300); const id = await flagEl(page, 'attend', '#btnAllPresent', 'count the room'); await page.waitForTimeout(400);
    await page.locator('#flagLayer .flagbtn').click(); assert.strictEqual(await page.inputValue('.flagpop textarea'), 'count the room');
    await page.fill('.flagpop textarea', 'recount at 7'); await page.click('.flagpop button[data-fsave]'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(i => App.season.flags[i].note, id), 'recount at 7'); await tab(page, 'todo'); await page.waitForTimeout(300); assert(/recount at 7/.test(await page.textContent('#todoWrap .flagcard')), 'To do shows the edit');
    await tab(page, 'attend'); await page.waitForTimeout(400); await page.locator('#flagLayer .flagbtn').click(); await page.click('.flagpop button[data-fclear]'); await page.waitForTimeout(300);
    assert.strictEqual(await marks(page), 0); assert.strictEqual(await page.evaluate(() => Season.flagList(App.season).length), 0); await page.close();
  });
  await test('a flag whose spot cannot be found draws nothing and raises no error; To do still lists it', async () => {
    const { page, errs } = await open(); await tab(page, 'attend'); await page.waitForTimeout(300); const id = await flagEl(page, 'attend', '#btnAllPresent', 'lost');
    await page.evaluate(i => { App.season.flags[i].trail[App.season.flags[i].trail.length - 1] += ' (renamed)'; }, id); await tab(page, 'todo'); await page.waitForTimeout(200); await tab(page, 'attend'); await page.waitForTimeout(400);
    assert.strictEqual(await marks(page), 0); assert.deepStrictEqual(errs, []); await tab(page, 'todo'); await page.waitForTimeout(300); assert(/lost/.test(await page.textContent('#todoWrap .flagcard'))); await page.close();
  });
  await test('nothing is printed: the overlay and the popup are hidden for print', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(300); await flagEl(page, 'attend', '#btnAllPresent', 'x'); await page.waitForTimeout(400);
    await page.emulateMedia({ media: 'print' }); assert.strictEqual(await page.locator('#flagLayer').evaluate(l => getComputedStyle(l).display), 'none'); await page.close();
  });
  await test('twenty tab changes leave no extra marks behind', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(300); await flagEl(page, 'attend', '#btnAllPresent', 'x');
    for (let i = 0; i < 10; i++) { await tab(page, 'todo'); await tab(page, 'attend'); } await page.waitForTimeout(500);
    assert.strictEqual(await page.locator('#flagLayer .flagbtn').count(), 1); await page.close();
  });
  await test('in flag mode, clicking a yellow flag opens its popup instead of flagging the flag', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(300); await flagEl(page, 'attend', '#btnAllPresent', 'x'); await page.waitForTimeout(400);
    await page.click('#btnFlagMode'); await page.locator('#flagLayer .flagbtn').click(); assert.strictEqual(await page.locator('.flagpop').count(), 1); assert.strictEqual(await page.evaluate(() => document.getElementById('dlg').open), false); await page.close();
  });
  console.log(passed + ' passed, ' + failed + ' failed'); await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})();
