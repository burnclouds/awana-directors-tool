// N57 in the app (Mike, 2026-11-20): Progress sheets has a Books picker: current book (the class binder), every book started (the records files), or blank sheets with a count per class (default 3).
// The Achievement record is no longer its own report in the list; the Person tab's Print record opens Progress sheets for that child with every book. The Print class binders pop-up can add blanks after each class's sheets.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/progress-books-blank-browser.test.js
const { open } = require('./lib/app-page');
(async () => {
  const t = await open({ viewport: { width: 1366, height: 900 } }), page = t.page, assert = t.assert, errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.evaluate(() => { App.showTab('todo'); const s = App.season, M = Model, kid = App.master.people.find(p => M.isActive(p) && M.isClubber(p) && M.room(p) === 'Sparks A'), id = kid[M.X.ID]; window.__kid = id; window.__kidName = M.fullName(kid);
    s.handbooks[id] = 'WR 261014'; s.progress[id] = { HG: { 'RJ1.1': '2026-09-23' }, WR: { 'RJ1.1': '2026-10-14' } }; });      // a Sparks child with two books started (in memory only: no App.touch, so no draft is left open)
  const pages = () => page.locator('#report .onepage').count(), kids = n => page.evaluate(r => App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && Model.room(p) === r).length, n);
  const show = async () => { await page.evaluate(() => { App.showReport('progressSheets'); }); await page.waitForTimeout(500); };
  await show();
  await t.test('the Books picker is on Progress sheets: current book, every book started, blank sheets; and it opens on the current book (one page per child)', async () => {
    assert(await page.isVisible('#oBooks'), 'the picker shows'); assert.deepStrictEqual(await page.$$eval('#oBooksSel option', o => o.map(x => x.value)), ['current', 'all', 'blank']); assert.strictEqual(await page.inputValue('#oBooksSel'), 'current');
    await page.selectOption('#oRoomSel', 'Sparks A'); await page.waitForTimeout(400); assert.strictEqual(await pages(), await kids('Sparks A')); assert(!(await page.isVisible('#oBlanks')), 'the blank count is hidden until Blank is picked');
  });
  await t.test('Every book started: the child with two books gets two pages', async () => {
    await page.selectOption('#oBooksSel', 'all'); await page.waitForTimeout(400); assert.strictEqual(await pages(), (await kids('Sparks A')) + 1);
  });
  await t.test('Blank sheets: the count box appears (3), and the class prints that many blanks with the class and year, no child names', async () => {
    await page.selectOption('#oBooksSel', 'blank'); await page.waitForTimeout(400); assert(await page.isVisible('#oBlanks')); assert.strictEqual(await page.inputValue('#oBlanksNum'), '3'); assert.strictEqual(await pages(), 3);
    const h = await page.textContent('#report'); assert(h.includes('Sparks A') && h.includes('2026-27') && !h.includes(await page.evaluate(() => window.__kidName)), 'class and year, no name');
    await page.fill('#oBlanksNum', '5'); await page.dispatchEvent('#oBlanksNum', 'change'); await page.waitForTimeout(400); assert.strictEqual(await pages(), 5);
  });
  await t.test('Blank sheets for All classes: the count for every class that has a progress sheet (never Puggles)', async () => {
    await page.fill('#oBlanksNum', '2'); await page.dispatchEvent('#oBlanksNum', 'change'); await page.selectOption('#oRoomSel', ''); await page.waitForTimeout(800);
    const n = await page.evaluate(() => Reports.roomsOf(Reports.kids(App.master)).filter(r => Model.groupOf(r) !== 'Puggles').length); assert.strictEqual(await pages(), 2 * n, 'classes ' + n);
  });
  await t.test('the report list no longer offers Achievement records, and the Books picker is not on other reports', async () => {
    const titles = await page.$$eval('#rSel option', o => o.map(x => x.textContent)); assert(!titles.some(x => /Achievement/.test(x)), titles.filter(x => /Progress|Achiev/.test(x)).join(' | '));
    await page.evaluate(() => App.showReport('attendance')); await page.waitForTimeout(300); assert(!(await page.isVisible('#oBooks')), 'hidden on Attendance');
  });
  await t.test('the Person tab Print record opens Progress sheets for that child with every book (two pages for the child with two books)', async () => {
    await page.evaluate(() => App.showTab('person')); await page.waitForTimeout(300); await page.selectOption('#peGroup', 'Sparks'); await page.waitForTimeout(300); await page.selectOption('#pePerson', await page.evaluate(() => window.__kid)); await page.waitForTimeout(400);
    assert.strictEqual(await page.locator('#btnPrPrint').count(), 1, 'the Print record button is there'); await page.click('#btnPrPrint'); await page.waitForTimeout(700);
    assert.strictEqual(await page.inputValue('#rSel'), 'progressSheets'); assert.strictEqual(await page.inputValue('#oBooksSel'), 'all'); assert.strictEqual(await page.inputValue('#oKidSel'), await page.evaluate(() => window.__kid));
    assert.strictEqual(await pages(), 2, 'the child\'s two books are two pages'); assert((await page.textContent('#report')).includes(await page.evaluate(() => window.__kidName)), 'the child\'s name');
  });
  await t.test('the Print class binders pop-up can add blank progress sheets after each class: a count box, default 3, 0 leaves them out', async () => {
    await page.evaluate(() => App.showTab('reports')); await page.click('#rSubs button[data-rsub="binders"]'); await page.click('#btnBinders'); await page.waitForTimeout(200);
    assert.strictEqual(await page.inputValue('#bindBlanks'), '3'); await page.click('#bindNone'); await page.check('#dlg input[data-room="Sparks A"]'); await page.click('#bindGo'); await page.waitForTimeout(600);
    const n = await kids('Sparks A'), withBlanks = await pages(); assert.strictEqual(withBlanks, n + 3, 'children then 3 blanks');
    await page.click('#btnBinders'); await page.waitForTimeout(200); await page.fill('#bindBlanks', '0'); await page.dispatchEvent('#bindBlanks', 'change'); await page.click('#bindNone'); await page.check('#dlg input[data-room="Sparks A"]'); await page.click('#bindGo'); await page.waitForTimeout(600); assert.strictEqual(await pages(), n);
  });
  await t.test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await t.done();
})();
