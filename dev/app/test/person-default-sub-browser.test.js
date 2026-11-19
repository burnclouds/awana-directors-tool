// N6 (1.51.16): a volunteer or a Puggle (no progress sheet) opens on Registration, not on an empty Progress page; a child opens on Progress; the leader's own
// sub-tab choice is kept. Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/person-default-sub-browser.test.js
const { open } = require('./lib/app-page'), assert = require('assert');
(async () => {
  const t = await open({ viewport: { width: 1280, height: 900 } }), page = t.page;
  const ids = await page.evaluate(() => { const X = Model.X, act = App.master.people.filter(p => Model.isActive(p)); const f = fn => { const p = act.find(fn); return p ? p[X.ID] : null; };
    return { vol: f(p => Model.isVolunteer(p)), pug: f(p => Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'Puggles'), spark: f(p => Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'Sparks'), tnt: f(p => Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'T&T') }; });
  assert(ids.vol && ids.pug && ids.spark, 'test club has a volunteer, a Puggle and a Sparks child: ' + JSON.stringify(ids));
  const show = id => page.evaluate(id => App.showPerson(id), id);
  const on = () => page.evaluate(() => (document.querySelector('#peSub button.on') || {}).textContent);
  const pick = async id => { await page.selectOption('#pePerson', id); await page.waitForTimeout(100); };

  await t.test('N6-1 a volunteer found from anywhere (showPerson, search) opens on Registration', async () => {
    await show(ids.vol); assert.strictEqual(await on(), 'Registration');
    await page.evaluate(() => { document.querySelector('.tabs button[data-tab="search"]') ; });
  });
  await t.test('N6-2 a Puggle opens on Registration', async () => { await show(ids.pug); assert.strictEqual(await on(), 'Registration'); });
  await t.test('N6-3 a Sparks child opens on Progress', async () => { await show(ids.spark); assert.strictEqual(await on(), 'Progress'); });
  await t.test('N6-4 stepping from a volunteer to a child brings Progress back, and back again shows Registration', async () => {
    await show(ids.vol); assert.strictEqual(await on(), 'Registration');
    await pick(ids.spark); assert.strictEqual(await on(), 'Progress');
    await pick(ids.vol); assert.strictEqual(await on(), 'Registration');
  });
  await t.test('N6-5 Attendance chosen on a child stays Attendance on a volunteer', async () => {
    await show(ids.spark); await page.click('#peSub button[data-sub="attendance"]'); assert.strictEqual(await on(), 'Attendance');
    await pick(ids.vol); assert.strictEqual(await on(), 'Attendance');
  });
  await t.test('N6-6 clicking Progress on a volunteer is a choice: the "no progress sheet" message shows', async () => {
    await show(ids.vol); await page.click('#peSub button[data-sub="progress"]'); assert.strictEqual(await on(), 'Progress');
    assert(/has no progress sheet/.test(await page.evaluate(() => document.getElementById('progressWrap').textContent + document.getElementById('tab-person').textContent)), 'message');
  });
  await t.test('N6-7 on the fallback Registration the view is the held (draft) one, not live', async () => {
    await show(ids.vol); assert.strictEqual(await page.evaluate(() => App.personSub()), 'registration');
    assert.strictEqual(await page.evaluate(() => App.progressShowing()), false);
    await show(ids.spark); assert.strictEqual(await page.evaluate(() => App.personSub()), 'progress');
  });
  await t.done();
})();
