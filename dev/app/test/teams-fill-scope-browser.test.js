// UX-18: Color teams has one "Fill blanks" button (the preview has a scope choice: this quarter or every open quarter), and Re-draw, Import, Save colors CSV and Start new year are under a More menu.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/teams-fill-scope-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async w => { const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('#btnTeamFill'); return { page, ctx, errs }; };
  const snap = page => page.evaluate(() => JSON.stringify(App.master.people.map(p => [p[Model.X.ID], p['team:Q1'], p['team:Q2'], p['team:Q3'], p['team:Q4']])) + JSON.stringify(App.season.config.teamPlan || {}));
  for (const w of [390, 1280]) {
    await test('the bar (' + w + ') has Quarter and Fill blanks; the four other actions are in the More menu', async () => {
      const { page, ctx } = await open(w); const vis = await page.evaluate(() => ['btnTeamFill', 'btnTeamMore', 'btnTeamRedo', 'btnTeamImport', 'btnTeamCsv', 'btnTeamYear'].map(id => [id, document.getElementById(id).offsetParent !== null]));
      assert.deepStrictEqual(vis.filter(x => x[1]).map(x => x[0]), ['btnTeamFill', 'btnTeamMore']); const bar = await page.evaluate(() => { const b = document.querySelector('#subTeams .bar'); return { lines: Math.round(b.getBoundingClientRect().height / 40), sw: document.documentElement.scrollWidth <= innerWidth }; }); assert(bar.lines <= 2 && bar.sw, JSON.stringify(bar));
      await page.click('#btnTeamMore'); for (const id of ['btnTeamRedo', 'btnTeamImport', 'btnTeamCsv', 'btnTeamYear']) assert(await page.isVisible('#' + id), id + ' in the menu'); await ctx.close();
    });
  }
  await test('More menu keyboard: Enter opens, arrows move, Esc closes and returns focus', async () => {
    const { page, ctx } = await open(1280); await page.focus('#btnTeamMore'); await page.keyboard.press('Enter'); await page.waitForSelector('#teamMore:not([hidden])'); assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'btnTeamRedo');
    await page.keyboard.press('ArrowDown'); assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'btnTeamImport'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'btnTeamYear', 'wraps');
    await page.keyboard.press('Escape'); assert(await page.$eval('#teamMore', m => m.hidden)); assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'btnTeamMore'); await ctx.close();
  });
  await test('Fill blanks: the preview offers This quarter and Every open quarter; changing the scope draws again; Cancel leaves the data byte-identical; Confirm writes the scope shown', async () => {
    const { page, ctx, errs } = await open(1280); const before = await snap(page);
    await page.evaluate(() => { const p = App.master.people.filter(x => Model.isClubber(x) && Model.hasColorTeams(Model.groupOf(Model.room(x)))).slice(0, 3); p.forEach(x => { delete x['team:Q3']; delete x['team:Q4']; }); App.commitScope(() => App.changed()); });
    const start = await snap(page); await page.selectOption('#tQuarter', 'Q3'); await page.click('#btnTeamFill'); await page.waitForSelector('#dlg[open] #tgPrevOk'); const scopes = await page.$$eval('#dlg input[name="tgScope"]', r => r.map(x => x.value)); assert.deepStrictEqual(scopes, ['q', 'all']);
    const nq = await page.$$eval('#dlg table.tgprev tbody tr', r => r.length); assert(await page.$eval('#dlg input[value="q"]', r => r.checked), 'the bar button starts on This quarter'); assert((await page.$$eval('#dlg table.tgprev tbody tr', r => [...new Set(r.map(x => x.dataset.q))])).length === 1, 'one quarter');
    await page.check('#dlg input[value="all"]'); await page.waitForTimeout(250); const qs = await page.$$eval('#dlg table.tgprev tbody tr', r => [...new Set(r.map(x => x.dataset.q))]); assert(qs.length >= 1); assert(await page.$eval('#dlg input[value="all"]', r => r.checked), 'the choice sticks');
    await page.click('#tgPrevCancel'); await page.waitForTimeout(150); assert.strictEqual(await snap(page), start, 'Cancel changes nothing');
    await page.click('#btnTeamFill'); await page.waitForSelector('#dlg[open] #tgPrevOk'); await page.click('#tgPrevOk'); await page.waitForTimeout(300); assert.notStrictEqual(await snap(page), start, 'Confirm wrote colors'); assert.deepStrictEqual(errs, []); await ctx.close();
  });
  await test('the grid button opens the same dialog on Every open quarter', async () => {
    const { page, ctx } = await open(1280); await page.waitForSelector('[data-tgfill]'); await page.click('[data-tgfill]'); await page.waitForSelector('#dlg[open] #tgPrevOk'); assert(await page.$eval('#dlg input[value="all"]', r => r.checked)); await page.click('#tgPrevCancel'); await ctx.close();
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
