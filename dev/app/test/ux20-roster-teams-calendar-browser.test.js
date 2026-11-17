// UX-20 step 2 (Roster, Color teams, Calendar): Add column is a form (Kind, then a name, a date or a quarter, with a live preview and a duplicate check), deleting a calendar date and moving dates are done at once with an Undo message,
// and no native dialog opens. Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/ux20-roster-teams-calendar-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright'); require('./lib/app-dialogs'); /* this test drives the dialogs by hand: loading the helper exempts it from pw-dialog-compat.js */
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async (w, h) => { const ctx = await browser.newContext({ viewport: { width: w || 1280, height: h || 900 } }), page = await ctx.newPage(), native = [], errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => { native.push(d.message()); d.dismiss(); });
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); return { page, ctx, native, errs }; };
  const tab = (page, t) => page.evaluate(x => App.showTab(x), t);
  const vis = (page, i) => page.evaluate(n => { const el = document.getElementById(n); return !!el && !el.closest('.askfield').hidden; }, i);
  const preview = page => page.textContent('#askPreview');

  for (const [w, h] of [[1280, 900], [390, 844]]) {
    await test('Add column (' + w + ' wide): fields follow the Kind, the preview builds the column name, bad answers are explained, a duplicate is refused, no native dialog', async () => {
      const { page, ctx, native } = await open(w, h); await tab(page, 'roster'); await page.waitForTimeout(300); await page.click('#btnAddCol'); await page.waitForSelector('#ask[open]');
      assert.strictEqual(await page.$eval('#askF0', s => s.value), 'x_', 'Club field is the default kind'); assert(await vis(page, 'askF1') && !(await vis(page, 'askF2')) && !(await vis(page, 'askF3')), 'a club field asks for a name only');
      assert.strictEqual(await preview(page), 'Column: x_'); await page.fill('#askF1', 'Allergy note'); assert.strictEqual(await preview(page), 'Column: x_Allergy note');
      await page.click('#ask [data-ask="ok"]'); await page.waitForTimeout(250); const first = await page.evaluate(() => Model.isUserCol('x_Allergy note') && App.master.userCols.includes('x_Allergy note')); assert(first, 'the column was added'); assert(/Column x_Allergy note added/.test(await page.textContent('#doneFlash')));
      await page.click('#btnAddCol'); await page.waitForSelector('#ask[open]'); await page.selectOption('#askF0', 'award:'); assert(!(await vis(page, 'askF1')) && (await vis(page, 'askF2')), 'an award date asks for a date only');
      await page.click('#ask [data-ask="ok"]'); assert(/Choose a date/.test(await page.textContent('#askErr2')), 'no date: ' + await page.textContent('#askErr2')); assert(await page.isVisible('#ask'), 'the form stays open');
      await page.fill('#askF2', '2026-11-04'); assert.strictEqual(await preview(page), 'Column: award:2026-11-04'); await page.click('#ask [data-ask="ok"]'); await page.waitForTimeout(250); assert(await page.evaluate(() => App.master.userCols.includes('award:2026-11-04')));
      await page.click('#btnAddCol'); await page.waitForSelector('#ask[open]'); await page.selectOption('#askF0', 'award:'); await page.fill('#askF2', '2026-11-04'); await page.click('#ask [data-ask="ok"]'); assert(/already a column award:2026-11-04/.test(await page.textContent('#askErr0')), 'duplicate: ' + await page.textContent('#askErr0'));
      await page.selectOption('#askF0', 'team:'); assert(await vis(page, 'askF3') && !(await vis(page, 'askF2')), 'a color team asks for a quarter only'); assert.strictEqual(await preview(page), 'Column: team:Q1'); await page.click('#ask [data-ask="cancel"]');
      assert.deepStrictEqual(native, [], 'no native dialog'); await ctx.close();
    });
  }
  await test('Add column: an empty name is explained under the Name field', async () => {
    const { page, ctx } = await open(); await tab(page, 'roster'); await page.waitForTimeout(300); await page.click('#btnAddCol'); await page.waitForSelector('#ask[open]'); await page.click('#ask [data-ask="ok"]');
    assert(/Give the column a name/.test(await page.textContent('#askErr1')), await page.textContent('#askErr1')); assert.strictEqual(await page.getAttribute('#askF1', 'aria-invalid'), 'true'); await ctx.close();
  });
  await test('Calendar: Delete a date is done at once (no question), the message says Apply or Discard (the tab stages its changes, so no Undo button), and Discard brings it back', async () => {
    const { page, ctx, native } = await open(); await tab(page, 'calendar'); await page.waitForTimeout(400); const n = () => page.evaluate(() => App.calendar.length), before = await n(); await page.click('#tab-calendar button[data-del] >> nth=0'); await page.waitForTimeout(300);
    assert.strictEqual(await n(), before - 1, 'the date is gone'); const said = await page.textContent('#doneFlash'); assert(/Deleted .* from the calendar/.test(said) && /Apply to keep it, or Discard/.test(said), said); assert(!(await page.isVisible('#doneUndo')), 'no Undo button on a staged tab');
    await page.click('#btnDraftDiscard'); await page.waitForSelector('#ask[open]'); assert(/Throw away 1 change/.test(await page.textContent('#askMsg')), 'the Discard question is the app\'s own, in red'); await page.click('#ask [data-ask="ok"]'); await page.waitForTimeout(300);
    assert.strictEqual(await n(), before, 'Discard brought it back'); assert.deepStrictEqual(native, [], 'no native dialog at all'); await ctx.close();
  });
  await test('Calendar: Move every date forward is a form (a number with limits); the dates move; an Undo message says so', async () => {
    const { page, ctx, native } = await open(); await tab(page, 'calendar'); await page.waitForTimeout(400); const first = () => page.evaluate(() => App.calendar.map(r => r.Date).sort()[0]), was = await first();
    await page.click('#btnCalShift'); await page.waitForSelector('#ask[open]'); assert.strictEqual(await page.$eval('#askF0', e => e.value), '52'); await page.fill('#askF0', '200'); await page.click('#ask [data-ask="ok"]'); assert(/from 1 to 104/.test(await page.textContent('#askErr0')), 'limits: ' + await page.textContent('#askErr0'));
    await page.fill('#askF0', '1'); await page.click('#ask [data-ask="ok"]'); await page.waitForTimeout(300); const now = await first(), days = Math.round((Date.parse(now + 'T12:00:00Z') - Date.parse(was + 'T12:00:00Z')) / 86400000); assert.strictEqual(days, 7, 'moved one week');
    assert(/moved forward 1 week/.test(await page.textContent('#doneFlash'))); assert.deepStrictEqual(native, []); await ctx.close();
  });
  await test('no page errors on Roster, Color teams and Calendar with the new dialogs', async () => { const { page, ctx, errs } = await open(); for (const t of ['roster', 'teams', 'calendar']) { await tab(page, t); await page.waitForTimeout(300); } assert.deepStrictEqual(errs, []); await ctx.close(); });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
