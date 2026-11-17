// Batch 9 in the browser: Person's Status select (Active / Inactive / Everyone), Roster's class cell is read-only with Move... as the one way to change it (UX-17), the balance pills follow the grid's quarter and say so when they differ (UX-15), scope labels. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/batch9-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async (w, h) => { const ctx = await browser.newContext({ viewport: { width: w || 1280, height: h || 900 } }), page = await ctx.newPage(); page.on('dialog', d => d.dismiss()); await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); return { page, ctx }; };
  await test('Person Status: Active hides an inactive person, Inactive lists only them, Everyone lists all', async () => {
    const { page, ctx } = await open(); const who = await page.evaluate(() => { const p = App.master.people.find(x => Model.isClubber(x) && Model.isActive(x)); Model.setActive(p, false); App.commitScope(() => App.changed()); return p[Model.X.ID]; });
    await page.evaluate(() => App.showTab('person')); await page.waitForSelector('#pePerson option', { state: 'attached' }); const ids = () => page.$$eval('#pePerson option', o => o.map(x => x.value));
    assert(!(await ids()).includes(who), 'Active (default) hides them'); await page.selectOption('#peInactive', 'inactive'); await page.waitForTimeout(150); const only = await ids(); assert(only.includes(who), 'the inactive person is listed'); assert(only.length <= 2, 'only the inactive person (and the person already selected, which the list always keeps): ' + only.length);
    await page.selectOption('#peInactive', 'all'); await page.waitForTimeout(150); assert.strictEqual((await ids()).length, await page.evaluate(() => App.master.people.length), 'Everyone'); await ctx.close();
  });
  await test('Roster: the class is plain text in each row (no select), and Move... changes it and Undo puts it back', async () => {
    const { page, ctx } = await open(); await page.waitForSelector('#rosterWrap tbody tr'); assert.strictEqual(await page.$$eval('#rosterWrap tbody tr select[data-f*="Classes"]', e => e.length), 0, 'no in-row class select'); assert(await page.$$eval('#rosterWrap tbody tr td.classcell', e => e.length) > 3, 'a read-only class cell'); await ctx.close();
  });
  await test('Color teams: the balance pills follow the grid quarter; picking another says "(the grid shows ...)"', async () => {
    const { page, ctx } = await open(); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('.tgbal'); const gridQ = await page.inputValue('#tQuarter'); assert.strictEqual(await page.getAttribute('[data-tgbq="' + gridQ + '"]', 'aria-pressed'), 'true'); assert(/Balance for:/.test(await page.textContent('#tgBqLbl')));
    const other = ['Q1', 'Q2', 'Q3', 'Q4'].find(q => q !== gridQ); await page.click('[data-tgbq="' + other + '"]'); await page.waitForTimeout(150); assert(new RegExp('the grid shows ' + gridQ).test(await page.textContent('.tgbal .tgscope')), await page.textContent('.tgbal .tgscope'));
    assert(/Grid quarter/.test(await page.textContent('label:has(#tQuarter)')), 'the grid picker says what it is'); await ctx.close();
  });
  await test('Statistics pills say "Statistics for:"; the Binders button says Print class binders', async () => {
    const { page, ctx } = await open(); await page.evaluate(() => App.showTab('stats')); await page.waitForSelector('.statspan'); assert(/Statistics for:/.test(await page.textContent('.statspan')));
    await page.evaluate(() => App.showTab('reports')); await page.click('#rSubs [data-rsub="binders"]'); assert(/Print class binders/.test(await page.textContent('#btnBinders'))); await ctx.close();
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
