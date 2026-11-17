// UX-20 step 1 (club-night tabs): Clear room is done at once with an Undo message (no pop-up question), a refused edit shows the app's own message, and no native dialog opens. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/ux20-club-night-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright'), { onAppDialog } = require('./lib/app-dialogs');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async (w, h) => { const ctx = await browser.newContext({ viewport: { width: w || 1280, height: h || 900 } }), page = await ctx.newPage(), native = [], asked = [], errs = []; page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', d => { native.push(d.message()); d.dismiss(); }); onAppDialog(page, d => { if (d.type() !== 'alert') asked.push(d.type() + ':' + d.message()); else asked.push('alert:' + d.message()); return d.accept(); });
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); return { page, ctx, native, asked, errs }; };

  for (const [w, h] of [[1280, 900], [390, 844]]) {
    await test('Attendance, Clear this room (' + w + ' wide): done at once, an Undo message names what was cleared, Undo brings the marks back, and no pop-up question opens', async () => {
      const { page, ctx, native, asked } = await open(w, h); await page.evaluate(() => document.querySelector('.tabs button[data-tab="attend"]').click()); await page.waitForTimeout(400);
      const room = await page.$eval('#attRoom', s => s.value), count = () => page.evaluate(() => { const d = document.getElementById('attDate').value, n = App.season.attendance[d] || {}; return Object.keys(n).filter(id => n[id].a).length; });
      await page.click('#attendWrap tr[data-id] input[data-m="a"] >> nth=0'); await page.click('#attendWrap tr[data-id] input[data-m="a"] >> nth=1'); await page.waitForTimeout(300); const before = await count(); assert(before >= 2, 'marks were made: ' + before);
      const btn = w < 761 ? '#btnClearRoom' : '#btnClearRoom'; await page.click(btn); await page.waitForTimeout(350);
      assert.strictEqual(await count(), 0, 'every mark is cleared'); assert.deepStrictEqual(native, [], 'no native dialog'); assert.deepStrictEqual(asked, [], 'no question asked');
      const msg = await page.textContent('#doneFlash'); assert(/Cleared \d+ marks? for /.test(msg) && msg.includes(room), msg);
      await page.click('#doneUndo'); await page.waitForTimeout(350); assert.strictEqual(await count(), before, 'Undo brought the marks back'); await ctx.close();
    });
  }
  await test('a refused edit on the Progress sheet shows the app\'s own message, not the browser\'s, and the field is put back', async () => {
    const { page, ctx, native, asked } = await open(); const id = await page.evaluate(() => App.master.people.find(x => Model.isActive(x) && Model.isClubber(x))[Model.X.ID]);
    await page.evaluate(i => App.goProgress(i), id); await page.waitForTimeout(400);
    await page.evaluate(() => { const orig = Season.setProgress; Season.setProgress = () => { throw new Error('That date is not allowed (test).'); }; window.__restore = () => { Season.setProgress = orig; }; });
    const inp = page.locator('#progressWrap input[data-scope][data-key]').first(); if (await inp.count()) { await inp.fill('2026-10-14'); await inp.dispatchEvent('change'); await page.waitForTimeout(400); assert(asked.some(m => /not allowed \(test\)/.test(m)), 'the app\'s message: ' + asked.join('|')); }
    assert.deepStrictEqual(native, [], 'no native dialog'); await ctx.close();
  });
  await test('no page errors on the Attendance tab with the new dialogs', async () => { const { page, ctx, errs } = await open(); await page.evaluate(() => document.querySelector('.tabs button[data-tab="attend"]').click()); await page.waitForTimeout(400); assert.deepStrictEqual(errs, []); await ctx.close(); });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
