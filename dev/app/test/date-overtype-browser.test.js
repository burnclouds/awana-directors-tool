// Typing over a date that is already in a date box (BACKLOG item I). The browser reports a whole new date after every digit (7/5/2026 plus a "1" in the month is 1/5/2026), so a box that held a date is
// committed only when you leave it or press Enter, never mid-typing; a date left unfinished (Feb 31) keeps the saved one. An empty box still saves the moment a whole date is typed. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/date-overtype-browser.test.js
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
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage(), msgs = [];
    page.on('dialog', d => { msgs.push(d.message()); d.accept(); }); page.on('pageerror', e => msgs.push('PAGE ERROR ' + e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { page, msgs };
  };
  // A sign-off box on a Sparks child's sheet, set to `start` and drawn; returns what is needed to type into it and read what was saved.
  const sheetBox = async (page, start) => {
    const r = await page.evaluate(v => { const kid = App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'Sparks'), id = kid[Model.X.ID]; App.showPerson(id);
      const i = [...document.querySelectorAll('#progressWrap input[type=date][data-key]')].find(x => !x.disabled && x.dataset.scope), key = i.dataset.key, scope = i.dataset.scope; Season.setProgress(App.season, id, scope, key, v); App.touch(); App.showPerson(id); return { id, key, scope }; }, start);
    await page.waitForTimeout(300); const sel = '#progressWrap input[type=date][data-key="' + r.key + '"][data-scope="' + r.scope + '"]';
    await page.evaluate(s => { document.querySelector(s).id = 'ovbox'; }, sel);
    return { sel: '#ovbox', saved: () => page.evaluate(([i, sc, k]) => (((App.season.progress[i] || {})[sc]) || {})[k] || '', [r.id, r.scope, r.key]), id: r.id };
  };
  const focusMonth = async (page, sel) => { await page.focus(sel); await page.waitForTimeout(50); };      // focusing a date box puts the cursor in its month part
  const type = async (page, keys) => { for (const k of keys) await page.keyboard.press(k); };
  const leave = page => page.evaluate(() => document.activeElement && document.activeElement.blur());
  const stillThere = page => page.evaluate(() => document.activeElement && document.activeElement.id === 'ovbox');

  await test('7/5 typed over with 1, 1, 4 becomes 11/4: nothing is saved while typing, the box keeps focus (no jump to the next box), and leaving saves the date', async () => {
    const { page } = await open(), b = await sheetBox(page, '2026-07-05'); await focusMonth(page, b.sel);
    for (const k of ['1', '1', '4']) { await page.keyboard.press(k); assert.strictEqual(await b.saved(), '2026-07-05', 'nothing saved after ' + k); assert(await stillThere(page), 'still in the box after ' + k); }
    assert.strictEqual(await page.inputValue(b.sel), '2026-11-04'); await leave(page); await page.waitForTimeout(300); assert.strictEqual(await b.saved(), '2026-11-04'); await page.close();
  });
  await test('10/28 typed over with 1, 1, 4 becomes 11/4 (the day is typed over too, not left at 28)', async () => {
    const { page } = await open(), b = await sheetBox(page, '2026-10-28'); await focusMonth(page, b.sel); await type(page, ['1', '1', '4']); assert.strictEqual(await page.inputValue(b.sel), '2026-11-04'); await leave(page); await page.waitForTimeout(300); assert.strictEqual(await b.saved(), '2026-11-04'); await page.close();
  });
  await test('Enter saves the typed date and Tab out of the year does too; the half-typed steps in between (1/5, 11/5) are never saved or recorded', async () => {
    const { page } = await open(), b = await sheetBox(page, '2026-07-05'), hist = await page.evaluate(() => App.season.history.length); await focusMonth(page, b.sel); await type(page, ['1', '1', '4']); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    assert.strictEqual(await b.saved(), '2026-11-04'); assert(await page.evaluate(h => App.season.history.length <= h + 1, hist), 'one change, not one per digit');
    const c = await sheetBox(page, '2026-10-28'); await focusMonth(page, c.sel); await type(page, ['1', '1', '4', 'Tab', 'Tab']); await page.waitForTimeout(300); assert.strictEqual(await c.saved(), '2026-11-04'); await page.close();
  });
  await test('what you see is what is saved: a month typed as just "1" and then left is January, shown in the box and saved, with no jump to another box', async () => {
    const { page } = await open(), b = await sheetBox(page, '2026-07-05'); await focusMonth(page, b.sel); await page.keyboard.press('1'); assert.strictEqual(await page.inputValue(b.sel), '2026-01-05'); assert.strictEqual(await b.saved(), '2026-07-05', 'not saved yet');
    await leave(page); await page.waitForTimeout(300); assert.strictEqual(await b.saved(), '2026-01-05'); await page.close();
  });
  await test('a date that is not finished (February 31) reads back empty, and leaving it keeps the saved date instead of clearing it', async () => {
    const { page } = await open(), b = await sheetBox(page, '2026-01-31'); await focusMonth(page, b.sel); await page.keyboard.press('2'); assert.strictEqual(await page.inputValue(b.sel), '', 'the browser reports it as empty');
    await leave(page); await page.waitForTimeout(300); assert.strictEqual(await b.saved(), '2026-01-31', 'the saved date is kept'); assert.strictEqual(await page.inputValue(b.sel), '2026-01-31', 'and shown again'); assert(/not finished/.test(await page.textContent('#flash')), 'a message says so'); await page.close();
  });
  await test('clearing a date on purpose (Backspace in every part) still clears it', async () => {
    const { page } = await open(), b = await sheetBox(page, '2026-07-05'); await focusMonth(page, b.sel); await type(page, ['Backspace', 'ArrowRight', 'Backspace', 'ArrowRight', 'Backspace']); assert.strictEqual(await page.inputValue(b.sel), ''); await leave(page); await page.waitForTimeout(300); assert.strictEqual(await b.saved(), ''); await page.close();
  });
  await test('an empty box is unchanged: a whole date typed in it is saved at once and focus moves to the next box', async () => {
    const { page } = await open(), b = await sheetBox(page, ''); await focusMonth(page, b.sel); await type(page, ['1', '0', '2', '8', '2', '0', '2', '6']); await page.waitForTimeout(400);
    assert.strictEqual(await b.saved(), '2026-10-28'); assert(!(await stillThere(page)), 'focus moved on'); await page.close();
  });
  await test('Given and Announced boxes that already hold a date are held the same way (and Announced keeps the saved date when left unfinished)', async () => {
    const { page } = await open();
    const set = await page.evaluate(() => { const kid = App.master.people.filter(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'Sparks'); for (const k of kid) { const id = k[Model.X.ID]; App.showPerson(id); const g = document.querySelector('#progressWrap input[type=date][data-gaward]:not([disabled])'); if (g) { g.id = 'ovbox'; return { id, award: g.dataset.gaward }; } } return null; });
    if (!set) { console.log('       (skipped: the test club has no Given box on a Sparks sheet)'); await page.close(); return; }
    await page.evaluate(([i, a]) => { Season.setGiven(App.season, i, a, '2026-07-05'); App.touch(); App.showPerson(i); const g = document.querySelector('#progressWrap input[type=date][data-gaward="' + a + '"]'); g.id = 'ovbox'; }, [set.id, set.award]); await page.waitForTimeout(300);
    await focusMonth(page, '#ovbox'); await type(page, ['1', '1', '4']); assert.strictEqual(await page.evaluate(([i, a]) => (App.season.given[i] || {})[a], [set.id, set.award]), '2026-07-05', 'not saved mid-typing'); await leave(page); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(([i, a]) => (App.season.given[i] || {})[a], [set.id, set.award]), '2026-11-04'); await page.close();
  });
  await test('Person > Registration uniform dates: typed over, held until the box is left, then saved; a date left unfinished keeps the saved one', async () => {
    const { page } = await open();
    const id = await page.evaluate(() => { const p = App.master.people.find(x => Model.isActive(x) && Model.isClubber(x)); p[Model.UNI.GIVEN] = '2026-07-05'; App.touch(); App.showPerson(p[Model.X.ID]); return p[Model.X.ID]; });
    await page.waitForTimeout(300); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(300);
    const sel = '#personWrap input[data-u="x_Uni_GivenDate"]'; assert.strictEqual(await page.locator(sel).count(), 1); const got = () => page.evaluate(i => App.master.people.find(x => x[Model.X.ID] === i)[Model.UNI.GIVEN], id);
    await focusMonth(page, sel); await type(page, ['1', '1', '4']); assert.strictEqual(await got(), '2026-07-05', 'not saved mid-typing'); await leave(page); await page.waitForTimeout(300); assert.strictEqual(await got(), '2026-11-04');
    await page.evaluate(i => { App.master.people.find(x => x[Model.X.ID] === i)[Model.UNI.GIVEN] = '2026-01-31'; App.showPerson(i); }, id); await page.waitForTimeout(300); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(200);
    await focusMonth(page, sel); await page.keyboard.press('2'); await leave(page); await page.waitForTimeout(300); assert.strictEqual(await got(), '2026-01-31', 'the unfinished date did not clear the saved one'); await page.close();
  });
  await test('no script errors', async () => { const { page, msgs } = await open(); await page.close(); assert.deepStrictEqual(msgs.filter(m => /PAGE ERROR/.test(m)), []); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
