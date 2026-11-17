// UX-20 step 3: leaving a tab with unapplied changes asks "Apply and continue / Discard and continue / Stay here" in the app's dialog and the answer re-runs the tab change;
// New season asks for the year in a form that refuses a bad year, and offers a three-way choice when there is unsaved work. No native dialog opens. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/ux20-files-drafts-browser.test.js
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
  const makeDraft = page => page.evaluate(() => { App.showTab('roster'); const id = App.master.people.find(x => Model.isClubber(x))[Model.X.ID], night = Object.keys(App.season.attendance)[0]; Season.setMark(App.season, night, id, 'h', 1); App.changed(); });

  for (const [w, h] of [[1280, 900], [390, 844]]) {
    await test('leaving a tab with unapplied changes (' + w + ' wide): a three-way choice; Stay keeps you here with the change pending', async () => {
      const { page, ctx, native } = await open(w, h); await makeDraft(page); assert.strictEqual(await page.evaluate(() => App.draftPending()), true, 'a draft is pending');
      await page.evaluate(() => App.showTab('attend')); await page.waitForSelector('#ask[open]');
      assert.deepStrictEqual(await page.$$eval('#ask .dlgbtns button', b => b.map(x => x.dataset.ask)), ['apply', 'discard', 'stay'].filter(() => true).sort((a, b) => 0).length ? await page.$$eval('#ask .dlgbtns button', b => b.map(x => x.dataset.ask)) : [], 'three buttons');
      assert.deepStrictEqual((await page.$$eval('#ask .dlgbtns button', b => b.map(x => x.dataset.ask))).sort(), ['apply', 'discard', 'stay'], 'Apply, Discard and Stay'); assert(/Roster tab has 1 change/.test(await page.textContent('#askMsg')), await page.textContent('#askMsg'));
      await page.click('#ask [data-ask="stay"]'); await page.waitForTimeout(250); assert.strictEqual(await page.evaluate(() => App.tab), 'roster', 'still on Roster'); assert.strictEqual(await page.evaluate(() => App.draftPending()), true, 'the change is still pending'); assert.deepStrictEqual(native, []); await ctx.close();
    });
  }
  await test('Apply and continue: the change is applied (Undo can take it back) and the tab you asked for opens', async () => {
    const { page, ctx } = await open(); await makeDraft(page); await page.evaluate(() => App.showTab('attend')); await page.waitForSelector('#ask[open]'); await page.click('#ask [data-ask="apply"]'); await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(() => App.tab), 'attend', 'the asked-for tab opened'); assert.strictEqual(await page.evaluate(() => App.draftPending()), false, 'no draft left'); assert.strictEqual(await page.$eval('#btnUndo', b => b.disabled), false, 'the applied change is an Undo step'); await ctx.close();
  });
  await test('Discard and continue: the change is thrown away and the tab you asked for opens', async () => {
    const { page, ctx } = await open(); const before = await page.evaluate(() => JSON.stringify(App.season.attendance)); await makeDraft(page); assert.notStrictEqual(await page.evaluate(() => JSON.stringify(App.season.attendance)), before, 'the draft changed the data');
    await page.evaluate(() => App.showTab('attend')); await page.waitForSelector('#ask[open]'); await page.click('#ask [data-ask="discard"]'); await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(() => App.tab), 'attend'); assert.strictEqual(await page.evaluate(() => JSON.stringify(App.season.attendance)), before, 'the change was discarded'); await ctx.close();
  });
  await test('Esc on the question is Stay here', async () => {
    const { page, ctx } = await open(); await makeDraft(page); await page.evaluate(() => App.showTab('attend')); await page.waitForSelector('#ask[open]'); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    assert.strictEqual(await page.evaluate(() => App.tab), 'roster'); assert.strictEqual(await page.evaluate(() => App.draftPending()), true); await ctx.close();
  });
  await test('New season: the year form refuses a bad year under the field, and a good year starts the season (no native dialog)', async () => {
    const { page, ctx, native } = await open(); await page.evaluate(() => App.showTab('options')); await page.waitForTimeout(300); await page.click('#btnNewSeason'); await page.waitForSelector('#ask[open]');
    assert.strictEqual(await page.$eval('#askF0', e => e.value), '2027-28', 'the default is the next year, not a fixed one'); await page.fill('#askF0', '27'); await page.click('#ask [data-ask="ok"]'); assert(/Like 2026-27/.test(await page.textContent('#askErr0')), 'the format hint: ' + await page.textContent('#askErr0')); assert(await page.isVisible('#ask'), 'the form stays open');
    await page.fill('#askF0', '2028-2029'); await page.click('#ask [data-ask="ok"]'); await page.waitForTimeout(500); assert.strictEqual(await page.evaluate(() => App.season.year), '2028-29', 'a long year is shortened'); assert.deepStrictEqual(native, []); await ctx.close();
  });
  await test('New season with unsaved work: Download then continue / Continue without saving / Cancel; Cancel changes nothing', async () => {
    const { page, ctx } = await open(); await page.evaluate(() => App.commitScope(() => { App.season.config.bugButton = true; App.touch(); })); assert.strictEqual(await page.evaluate(() => App.dirty()), true, 'unsaved work');
    await page.evaluate(() => App.showTab('options')); await page.waitForTimeout(300); const year = await page.evaluate(() => App.season.year); await page.click('#btnNewSeason'); await page.waitForSelector('#ask[open]');
    assert.deepStrictEqual((await page.$$eval('#ask .dlgbtns button', b => b.map(x => x.dataset.ask))).sort(), ['cancel', 'go', 'save']); await page.click('#ask [data-ask="cancel"]'); await page.waitForTimeout(300); assert.strictEqual(await page.evaluate(() => App.season.year), year, 'nothing changed');
    await page.click('#btnNewSeason'); await page.waitForSelector('#ask[open]'); await page.click('#ask [data-ask="go"]'); await page.waitForSelector('#ask[open] #askF0'); await page.fill('#askF0', '2027-28'); await page.click('#ask [data-ask="ok"]'); await page.waitForTimeout(500);
    assert.strictEqual(await page.evaluate(() => App.season.year), '2027-28', 'continued without saving'); await ctx.close();
  });
  await test('no page errors through these flows', async () => { const { page, ctx, errs } = await open(); await makeDraft(page); await page.evaluate(() => App.showTab('attend')); await page.waitForSelector('#ask[open]'); await page.click('#ask [data-ask="apply"]'); await page.waitForTimeout(300); assert.deepStrictEqual(errs, []); await ctx.close(); });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
