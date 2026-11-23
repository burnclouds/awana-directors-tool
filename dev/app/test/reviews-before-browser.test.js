// N69: Reviews can be marked finished before another club without writing review dates; the saved marker is undoable. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/reviews-before-browser.test.js
const { open } = require('./lib/app-page');
(async () => {
  const t = await open(), { page, assert } = t, errs = [];
  page.on('pageerror', e => errs.push(e.message));
  const id = await page.evaluate(() => {
    document.querySelector('.tabs button[data-tab="person"]').click();
    const M = Model, p = App.master.people.find(x => M.isActive(x) && M.isClubber(x) && M.groupOf(M.room(x)) === 'Sparks');
    return p && p[M.X.ID];
  });
  assert(id, 'an invented Sparks child exists');
  await page.waitForTimeout(250);
  await page.evaluate(id => {
    const s = App.season;
    s.handbooks[id] = 'HG';
    delete s.doneReviews?.[id]; delete s.doneBooks?.[id];
    delete s.progress[id];
    App.touch(); App.showPerson(id, { sub: 'progress' });
  }, id);
  await page.waitForTimeout(300);
  await t.test('the Reviews area has one named Finished Before checkbox', async () => {
    const box = page.locator('#progressWrap input[data-reviewsdone="HG"]');
    assert.strictEqual(await box.count(), 1);
    assert.match(await box.getAttribute('aria-label'), /reviews finished before/i);
    assert(await page.locator('#progressWrap .previews input[data-key^="RJ1."]').count() > 0, 'review rows are available before marking');
  });
  await t.test('checking it stores no review dates and the label explains how to restore the rows', async () => {
    await page.check('#progressWrap input[data-reviewsdone="HG"]'); await page.waitForTimeout(250);
    const saved = await page.evaluate(id => {
      const text = Season.toJson(App.season), opened = Season.fromJson(text);
      return { marker: opened.doneReviews[id], progress: opened.progress[id] || {}, hidden: !document.querySelector('#progressWrap .previews input[data-key^="RJ1."]'), note: document.querySelector('#progressWrap .previews').textContent };
    }, id);
    assert.deepStrictEqual(saved.marker, ['HG']); assert(saved.hidden, 'review rows are collapsed while completed before');
    assert(saved.note.includes('uncheck to view or edit'), saved.note);
    const keys = Object.keys(saved.progress.HG || {}).filter(k => /^\w+\.[5-8]$/.test(k)); assert.deepStrictEqual(keys, [], 'no review sign-off keys were created');
  });
  await t.test('unchecking restores the editable rows and Undo restores the marker', async () => {
    await page.uncheck('#progressWrap input[data-reviewsdone="HG"]'); await page.waitForTimeout(250);
    assert.strictEqual(await page.evaluate(id => (App.season.doneReviews || {})[id], id), undefined);
    assert(await page.locator('#progressWrap .previews input[data-key^="RJ1."]').count() > 0, 'review rows return');
    await page.check('#progressWrap input[data-reviewsdone="HG"]'); await page.waitForTimeout(200);
    await page.click('#btnUndo'); await page.waitForTimeout(250);
    assert.strictEqual(await page.evaluate(id => (App.season.doneReviews || {})[id], id), undefined, 'Undo removes the marker');
    assert(await page.locator('#progressWrap .previews input[data-key^="RJ1."]').count() > 0, 'Undo restores the rows');
  });
  await t.test('no script errors', async () => assert.deepStrictEqual(errs, []));
  await t.done();
})();
