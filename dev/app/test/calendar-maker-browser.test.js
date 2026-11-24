// N3: preview, apply and undo using an invented club.
const assert = require('node:assert/strict');
const { open } = require('./lib/app-page.js');

(async () => {
  const t = await open(), page = t.page;
  const state = () => page.evaluate(() => ({
    calendar: App.calendar, settings: App.season.config, history: App.season.history, dirty: App.dirty()
  }));
  const preview = async () => {
    await page.click('#btnCalMake');
    await page.fill('#calMaker input[name="first"]', '2040-09-05');
    await page.fill('#calMaker input[name="last"]', '2040-09-26');
    await page.click('#calMaker [data-recommend]');
    await page.getByRole('button', { name: 'Preview calendar' }).click();
  };

  await t.test('canceling the preview leaves rows, settings and history untouched', async () => {
    await page.evaluate(async () => {
      const season = Season.blank('2040-41');
      season.fake = true;
      await App.openSeason(Season.toJson(season));
      App.showTab('calendar');
    });
    const before = await state();
    await preview();
    assert.equal(await page.isVisible('#calMakerPreview'), true);
    assert.deepEqual(await state(), before);
    await page.click('#calMaker [data-close]');
    assert.deepEqual(await state(), before);
  });

  await t.test('one Apply logs the whole schedule, and Undo restores the previous settings and rows', async () => {
    const before = await state();
    await preview();
    await page.click('#calMaker [data-apply]');
    const after = await state();
    assert.equal(after.calendar.length, 4);
    assert.equal(after.history.length, before.history.length + 1);
    assert.equal(after.history.at(-1).label, 'Make calendar');
    assert.equal(after.dirty, true);
    await page.click('#btnUndo');
    const undone = await state();
    assert.deepEqual(undone.calendar, before.calendar);
    assert.deepEqual(undone.settings, before.settings);
  });
  await t.test('an off-weekday first calendar applies with an earlier sign-off notice', async () => {
    await page.evaluate(() => {
      const s = Season.blank('2040-41');
      s.fake = true;
      s.progress = { child: { HG: { 'Rank.1': '2040-09-03' } } };
      App.openSeason(Season.toJson(s), { refresh: true });
      App.showTab('calendar');
    });
    await page.click('#btnCalMake');
    for (const name of ['first', 'last']) await page.fill('#calMaker input[name="' + name + '"]', '2040-09-06');
    await page.locator('#calMaker input[name="last"]').press('Tab');
    assert.match(await page.textContent('#flash'), /special event or a different meeting/);
    await page.getByRole('button', { name: 'Preview calendar' }).click();
    assert.match(await page.textContent('#calMakerPreview'), /2040-09-06.*2040-09-03.*Rank.1/);
    await page.click('#calMaker [data-apply]');
    assert.deepEqual((await state()).calendar.map(r => r.Date), ['2040-09-06']);
  });
  await t.done();
})();
