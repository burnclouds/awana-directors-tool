// Batch 11 in the browser: UX-24 (Roster Edit opens the Person page on Registration; the raw dialog is All fields; Add person groups its fields), UX-13 (the new club year checklist on Options, each step worked out from the file).
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/batch11-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async (w, today) => { const ctx = await browser.newContext({ viewport: { width: w || 1280, height: 900 } }), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(url); if (today) await page.evaluate(t => { App.today = () => t; }, today); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); return { page, ctx, errs }; };
  for (const w of [390, 1280]) {
    await test('UX-24 (' + w + '): Roster Edit opens the Person page on Registration, with a field focused; All fields still opens the raw dialog', async () => {
      const { page, ctx, errs } = await open(w); await page.evaluate(() => App.showTab('roster')); await page.waitForSelector('#rosterWrap tbody tr'); const id = await page.$eval('#rosterWrap tbody tr', r => r.dataset.id);
      if (w < 761) { await page.evaluate(i => { const r = document.querySelector('#rosterWrap tr[data-id="' + CSS.escape(i) + '"] [data-edit]'); r.click(); }, id); } else await page.click('#rosterWrap tr[data-id="' + id.replace(/"/g, '\\"') + '"] [data-edit]');
      await page.waitForTimeout(300); assert.strictEqual(await page.evaluate(() => App.tab), 'person'); assert.strictEqual(await page.evaluate(i => document.getElementById('pePerson').value === i, id), true, 'that person'); assert(await page.isVisible('#personWrap .pgrid'), 'the Registration fields show');
      assert.strictEqual(await page.evaluate(() => /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !!document.activeElement.closest('.pgrid')), true, 'a field is focused');
      await page.click('#personWrap button[data-all]'); await page.waitForSelector('#dlg[open] [data-col]'); assert(await page.$$eval('#dlg [data-col]', e => e.length) > 8, 'the raw dialog lists every column'); await page.keyboard.press('Escape'); assert.deepStrictEqual(errs, []); await ctx.close();
    });
  }
  await test('UX-24: Add a person groups its fields in fieldsets (Name, Class and grade, Contact, Medical, Club fields)', async () => {
    const { page, ctx } = await open(1280); await page.evaluate(() => App.showTab('roster')); await page.click('#btnAddPerson'); await page.waitForSelector('#dlg[open] fieldset.addgrp'); const legends = await page.$$eval('#dlg fieldset.addgrp > legend', l => l.map(x => x.textContent));
    assert(['Name', 'Class and grade'].every(x => legends.includes(x)), legends.join('|')); assert(await page.$('#dlg [data-col="First Name"]') && await page.$('#dlg [data-col="Last Name"]'), 'the required fields are there'); await page.keyboard.press('Escape'); await ctx.close();
  });
  await test('UX-13: the checklist shows four steps worked out from the file; each Go goes to the right place', async () => {
    const { page, ctx } = await open(1280, '2030-01-15'); await page.evaluate(() => App.showTab('options')); await page.waitForSelector('.nychecklist'); const steps = await page.$$eval('.nylist li', l => l.map(x => [x.dataset.ny, x.classList.contains('nydone')]));
    assert.deepStrictEqual(steps.map(s => s[0]), ['season', 'calendar', 'colors', 'books']); assert.strictEqual(steps[0][1], false, 'the file is not 2029-30'); assert.strictEqual(steps[1][1], false, 'no club night is ahead of 2030');
    await page.click('button[data-nygo="calendar"]'); await page.waitForTimeout(200); assert.strictEqual(await page.evaluate(() => App.tab), 'calendar', 'Go to calendar'); await page.evaluate(() => App.showTab('options')); await page.click('button[data-nygo="colors"]'); await page.waitForTimeout(200); assert(await page.isVisible('#subTeams'), 'Go to colors');
    await page.evaluate(() => App.showTab('options')); await page.waitForSelector('.nychecklist'); const bk = await page.$('button[data-nygo="books"]'); if (bk) { await bk.click(); await page.waitForTimeout(150); assert.strictEqual(await page.evaluate(() => document.activeElement.parentElement.id), 'optBooksTop', 'Go to books'); } await ctx.close();
  });
  await test('UX-13: doing a step ticks it (the calendar, the colors, the year', async () => {
    const { page, ctx } = await open(1280); const yr = await page.evaluate(() => Season.defaultYear(App.today())); await page.evaluate(y => { App.season.year = y; }, yr); await page.evaluate(() => App.showTab('options')); await page.waitForSelector('.nychecklist');
    const st = () => page.$$eval('.nylist li', l => Object.fromEntries(l.map(x => [x.dataset.ny, x.classList.contains('nydone')]))); assert.strictEqual((await st()).season, true, 'the year matches today');
    await page.evaluate(() => { const kids = App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && Model.hasColorTeams(Model.groupOf(Model.room(p)))); kids.forEach(p => { p['team:Q1'] = 'Red'; }); App.commitScope(() => App.changed()); App.showTab('options'); }); await page.waitForTimeout(200); assert.strictEqual((await st()).colors, true, 'every Sparks and T&T child has a Q1 color');
    await page.evaluate(() => { delete App.master.people.find(p => Model.isActive(p) && Model.isClubber(p) && Model.hasColorTeams(Model.groupOf(Model.room(p))))['team:Q1']; App.changed(); App.showTab('options'); }); await page.waitForTimeout(200); assert.strictEqual((await st()).colors, false, 'one missing colour un-ticks it'); await ctx.close();
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
