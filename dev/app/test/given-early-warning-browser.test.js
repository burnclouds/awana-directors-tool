// An award given before its section is finished: no pop-up interrupts data entry. The section's empty sign-offs are marked as no date, and a yellow warning with the count sits under the award until the
// file is saved (and is never printed). Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/given-early-warning-browser.test.js
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
  const open = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true }), page = await ctx.newPage(), dialogs = [], errs = [];
    await ctx.addInitScript(() => { window.showSaveFilePicker = undefined; });      // so a save is an ordinary download the test can see
    page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); }); page.on('pageerror', e => errs.push(e.message));      // dismissing would cancel the old confirm, so a pop-up shows up in `dialogs` and as a missing award
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { page, dialogs, errs };
  };
  const leave = page => page.evaluate(() => document.activeElement && document.activeElement.blur());      // (Tab would stop on the date box's calendar icon first)
  // A T&T child with no sign-offs at all, on the Progress sheet; returns the child and the first Given box with no date (its award, section and number of sign-offs).
  const setup = async page => {
    const r = await page.evaluate(() => {
      const kid = App.master.people.find(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'T&T'), id = kid[Model.X.ID]; delete App.season.progress[id]; App.touch(); App.showPerson(id);
      const i = [...document.querySelectorAll('#progressWrap input[type=date][data-gaward]')].find(x => !x.value && x.dataset.gitems); if (!i) return null; i.id = 'gbox';
      const list = i.dataset.gitems.split(',').filter(Boolean); return { id, award: i.dataset.gaward, book: i.dataset.gbook, block: i.dataset.gblock, items: list.length, list };
    });
    await page.waitForTimeout(200); return r;
  };
  const give = async (page, text) => { await page.focus('#gbox'); await page.keyboard.type(text); await leave(page); await page.waitForTimeout(500); };
  const givenOf = (page, c) => page.evaluate(([i, a]) => (App.season.given[i] || {})[a] || '', [c.id, c.award]);
  const empties = (page, c) => page.evaluate(([i, b, k, list]) => Season.unsignedIn(App.season, i, b, k, list).length, [c.id, c.book, c.block, c.list]);

  await test('typing a given date before the section is finished shows no pop-up; the empty sign-offs become no date and a yellow warning with the count appears under the award', async () => {
    const { page, dialogs } = await open(), c = await setup(page); assert(c, 'an empty Given box on the sheet'); assert(await empties(page, c) > 0, 'the section starts unfinished');
    await give(page, '11122026'); assert.deepStrictEqual(dialogs, [], 'no pop-up'); assert.strictEqual(await givenOf(page, c), '2026-11-12', 'the award is given with that date'); assert.strictEqual(await empties(page, c), 0, 'no sign-off is left empty');
    const w = page.locator('#progressWrap .pgive .pwarn'); assert.strictEqual(await w.count(), 1); const t = await w.textContent(); assert(/Given before its section was finished/.test(t) && new RegExp(c.items + ' empty sign-off').test(t) && /saved/.test(t), t);
    assert.strictEqual(await w.locator('span[aria-hidden]').textContent(), '⚠', 'a warning triangle'); await page.close();
  });
  await test('the warning stays through other tabs and redraws, and goes away when the file is saved', async () => {
    const { page, dialogs } = await open(), c = await setup(page); await give(page, '11122026');
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="todo"]').click()); await page.waitForTimeout(200); await page.evaluate(i => App.showPerson(i), c.id); await page.waitForTimeout(400);
    assert.strictEqual(await page.locator('#progressWrap .pwarn').count(), 1, 'still there after leaving the tab and coming back');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), (async () => { await page.evaluate(() => document.getElementById('btnSeasonSave').click()); await page.waitForTimeout(200); await page.evaluate(() => document.getElementById('btnSeasonSave').click()); })()]); assert(dl, 'the file is saved');      // TEST data: the first press arms the save await page.waitForTimeout(600);
    assert.strictEqual(await page.locator('#progressWrap .pwarn').count(), 0, 'gone after the save'); assert.deepStrictEqual(dialogs, []); await page.close();
  });
  await test('the "no date" tick on an award does the same: no pop-up, the warning shown', async () => {
    const { page, dialogs } = await open(), c = await setup(page); await page.check('#progressWrap input[data-gnodate="' + c.award + '"]'); await page.waitForTimeout(500);
    assert.deepStrictEqual(dialogs, []); assert.strictEqual(await page.locator('#progressWrap .pwarn').count(), 1); assert(await page.evaluate(([i, a]) => Season.isGivenNoDate(App.season, i, a), [c.id, c.award])); await page.close();
  });
  await test('an award whose section is finished gives no warning', async () => {
    const { page, dialogs } = await open(), c = await setup(page);
    await page.evaluate(([i, b, k, n]) => { const T = App.season.config.progress['T&T'], bl = T.perBook.find(x => x.key === k); bl.items.forEach(it => Season.setProgress(App.season, i, b, k + '.' + it, '2026-10-07')); App.touch(); App.showPerson(i); const x = [...document.querySelectorAll('#progressWrap input[type=date][data-gaward]')].find(y => y.dataset.gblock === k && !y.value); x.id = 'gbox'; }, [c.id, c.book, c.block, c.items]);
    await page.waitForTimeout(200); await give(page, '11122026'); assert.deepStrictEqual(dialogs, []); assert.strictEqual(await page.locator('#progressWrap .pwarn').count(), 0); await page.close();
  });
  await test('clearing the date of an early award removes its warning', async () => {
    const { page } = await open(), c = await setup(page); await give(page, '11122026'); assert.strictEqual(await page.locator('#progressWrap .pwarn').count(), 1);
    await page.evaluate(() => { const i = document.querySelector('#progressWrap .pwarn').closest('.pgive').querySelector('input[type=date][data-gaward]'); i.id = 'gbox'; });
    await page.focus('#gbox'); await page.keyboard.press('Backspace'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Backspace'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Backspace'); await leave(page); await page.waitForTimeout(500);
    assert.strictEqual(await givenOf(page, c), '', 'the date is cleared'); assert.strictEqual(await page.locator('#progressWrap .pwarn').count(), 0, 'and its note with it'); await page.close();
  });
  await test('the warning is not printed, and a phone width has no sideways scroll', async () => {
    const { page } = await open(), c = await setup(page); await give(page, '11122026');
    await page.emulateMedia({ media: 'print' }); assert.strictEqual(await page.$eval('#progressWrap .pwarn', e => getComputedStyle(e).display), 'none'); await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300); assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll'); await page.close();
  });
  await test('no script errors', async () => { const { page, errs } = await open(); await page.close(); assert.deepStrictEqual(errs, []); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
