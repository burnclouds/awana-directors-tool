// N2 (1.51.16): the Calendar tab's Lessons by week view and the report that reads it. Invented test club only (its calendar still has the older Puggles # and Puggles Title
// columns: opening the file upgrades them). Usage: NODE_PATH=<dir with playwright> node test/calendar-lessons-browser.test.js
const { open } = require('./lib/app-page'), assert = require('assert');
(async () => {
  const t = await open({ viewport: { width: 1280, height: 900 } }), page = t.page, errs = [];
  page.on('pageerror', e => errs.push(e.message));
  const goCal = async () => { await page.evaluate(() => App.showTab('calendar')); await page.waitForTimeout(150); };
  const cfg = () => page.evaluate(() => App.season.config.lessons);

  await t.test('N2-1 the opened file has no Puggles # or Puggles Title any more; the Calendar tab has Dates and Lessons by week', async () => {
    const keys = await page.evaluate(() => Object.keys(App.season.calendar[0])); assert(!keys.includes('Puggles #') && !keys.includes('Puggles Title') && keys.includes('Puggles Lesson'), keys.join(','));
    await goCal(); assert.deepStrictEqual(await page.$$eval('#calSubs button', b => b.map(x => x.textContent)), ['Dates', 'Lessons by week']);
    assert.deepStrictEqual(await page.$$eval('#calWrap thead th', th => th.map(x => x.textContent)).then(h => h.filter(x => /Lesson/.test(x))), ['Puggles Lesson', 'Cubbies Lesson', 'Sparks Lesson', 'T&T Lesson'], 'the Dates view has one lesson column per group');
  });
  await t.test('N2-2 Lessons by week: one row for each club night (no events), the groups that are on, NO CLUB rows', async () => {
    await page.click('#calSubs button[data-calsub="lessons"]'); await page.waitForTimeout(150);
    const head = await page.$$eval('#calWrap thead th', th => th.map(x => x.textContent)); assert.deepStrictEqual(head, ['Date', 'Day', 'Theme', 'Puggles', 'Cubbies', 'Sparks', 'T&T']);
    const n = await page.evaluate(() => ({ rows: document.querySelectorAll('#calWrap tbody tr').length, want: App.season.calendar.filter(r => r.Type !== 'Event').length, noClub: document.querySelectorAll('#calWrap tbody td b').length, wantNo: App.season.calendar.filter(r => r.Type !== 'Event' && r['No Club'] === '1').length }));
    assert.strictEqual(n.rows, n.want); assert.strictEqual(n.noClub, n.wantNo, 'NO CLUB rows'); assert(n.noClub > 0);
  });
  await t.test('N2-3 switching Sparks and T&T off drops their columns; the choice is kept in the file (config.lessons) and the file still validates', async () => {
    await page.uncheck('#calWrap input[data-lg="Sparks"]'); await page.waitForTimeout(100); await page.uncheck('#calWrap input[data-lg="T&T"]'); await page.waitForTimeout(100);
    assert.deepStrictEqual(await page.$$eval('#calWrap thead th', th => th.map(x => x.textContent)), ['Date', 'Day', 'Theme', 'Puggles', 'Cubbies']);
    const c = await cfg(); assert.strictEqual(c.groups.Sparks.on, false); assert.strictEqual(c.groups['T&T'].on, false); assert.strictEqual(c.groups.Puggles.on, true);
    const bad = await page.evaluate(() => Validate.validate(Season.toJson(App.season), 'awana-2026-27-20261116-000000.json').findings.filter(f => f.level === 'error' && /lessons/.test(f.msg))); assert.deepStrictEqual(bad, []);
  });
  await t.test('N2-4 typing a Puggles lesson stores it in the calendar row and the Lessons by week report prints it, with no Sparks column', async () => {
    const box = page.locator('#calWrap tbody tr input[data-c="Puggles Lesson"]').first(); await box.fill('1.1 God Made the Light'); await box.blur(); await page.waitForTimeout(150);
    const stored = await page.evaluate(() => App.season.calendar.find(r => r.Type !== 'Event' && r['No Club'] !== '1')['Puggles Lesson']); assert.strictEqual(stored, '1.1 God Made the Light'); assert(!/Unapplied|Apply/i.test('') );
    await t.report('lessons'); const h = await page.evaluate(() => document.getElementById('report').innerHTML);
    assert(/1\.1 God Made the Light/.test(h)); assert(/<th>Puggles<\/th><th>Cubbies<\/th>/.test(h)); assert(!/<th>Sparks<\/th>/.test(h) && !/<th>T&amp;T<\/th>/.test(h)); assert(/NO CLUB/.test(h));
  });
  await t.test('N2-5 Turn off lessons by week: the grid offers to turn them back on, and the report says they are off', async () => {
    await goCal(); await page.click('#calSubs button[data-calsub="lessons"]'); await page.click('#btnLessonsOff'); await page.waitForTimeout(150);
    assert(await page.isVisible('#btnLessonsOn')); assert.strictEqual((await cfg()).on, false);
    await page.evaluate(() => App.showReport('lessons')); await page.waitForFunction(() => /not turned on/.test(document.getElementById('report').textContent));
    await goCal(); await page.click('#btnLessonsOn'); await page.waitForTimeout(150); assert.strictEqual((await cfg()).on, true);
  });
  await t.test('N2-6 back on Dates the typed lesson is in the Puggles Lesson column; on a phone nothing scrolls the page sideways', async () => {
    await page.click('#calSubs button[data-calsub="dates"]'); await page.waitForTimeout(100);
    assert((await page.$$eval('#calWrap input[data-c="Puggles Lesson"]', i => i.map(x => x.value))).includes('1.1 God Made the Light'));
    await page.setViewportSize({ width: 390, height: 844 }); await page.click('#calSubs button[data-calsub="lessons"]'); await page.waitForTimeout(150);
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); assert(w.sw <= w.cw + 1, 'page scrolls sideways ' + w.sw + '/' + w.cw);
  });
  await t.test('N2-7 no script errors', async () => { assert.deepStrictEqual(errs, []); });
  await t.done();
})();
