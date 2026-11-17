// UX-25: Uniforms bulk buttons. "Mark the N shown as ordered/received today" act only on the rows shown that have no date in that column; the message says so; Apply/Discard as on any draft tab.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/uniform-bulk-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const col = (page, ids, key) => page.evaluate(([i, k]) => i.map(id => App.master.people.find(x => x[Model.X.ID] === id)[Model.UNI[k]] || ''), [ids, key]);
  for (const w of [390, 1280]) {
    await test('bulk ordered (' + w + '): only shown rows without a date are marked; rows with a date are untouched; Discard puts it all back', async () => {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
      await page.goto(url); await page.evaluate(() => { App.today = () => '2026-11-18'; }); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
      await page.evaluate(() => App.showTab('uniforms')); await page.waitForSelector('#uniWrap table.uni tbody tr');
      const rows = await page.$$eval('#uniWrap tbody tr', r => r.map(x => x.dataset.id)); assert(rows.length >= 2, 'uniform rows: ' + rows.length);
      await page.evaluate(id => { App.master.people.find(x => x[Model.X.ID] === id)[Model.UNI.ORDERED] = '2026-09-01'; App.commitScope(() => App.changed()); App.showTab('uniforms'); }, rows[0]); await page.waitForTimeout(150);
      const before = await col(page, rows, 'ORDERED'), n = before.filter(x => !x).length;
      assert(new RegExp('Mark the ' + n + ' shown as ordered today').test(await page.textContent('#uBulkOrdered')), await page.textContent('#uBulkOrdered')); await page.click('#uBulkOrdered'); await page.waitForTimeout(250);
      const after = await col(page, rows, 'ORDERED');
      assert.strictEqual(after[0], '2026-09-01', 'a row with a date is untouched'); assert(after.slice(1).every((x, i) => before[i + 1] ? x === before[i + 1] : x === '2026-11-18'), 'the others got today'); assert(/left alone/.test(await page.textContent('#doneFlash')), 'the message says so'); assert(await page.$eval('#uBulkOrdered', b => b.disabled), 'nothing left to mark');
      await page.click('#btnDraftDiscard'); await page.waitForTimeout(400); const back = await col(page, rows, 'ORDERED'); assert.deepStrictEqual(back, before, 'Discard restores every row'); assert.deepStrictEqual(errs, []); await ctx.close();
    });
  }
  await test('received works the same way and Apply keeps it', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage(); page.on('dialog', d => d.accept()); await page.goto(url); await page.evaluate(() => { App.today = () => '2026-11-18'; }); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    await page.evaluate(() => App.showTab('uniforms')); await page.waitForSelector('#uniWrap table.uni tbody tr'); const n = +(await page.getAttribute('#uBulkReceived', 'data-n')); assert(n > 0); await page.click('#uBulkReceived'); await page.waitForTimeout(200); await page.click('#btnDraftApply'); await page.waitForTimeout(250);
    assert.strictEqual(await page.evaluate(() => App.master.people.filter(p => p[Model.UNI.RECEIVED] === '2026-11-18').length >= 1), true); await ctx.close();
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
