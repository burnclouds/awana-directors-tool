// Uniforms on a phone (390 and 430 wide): one card per child (the same table, laid out with CSS), no sideways page scroll, labels visible, nothing clipped, 44px controls, and every control still works. A table again at 1280.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/uniforms-cards-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
setTimeout(() => { console.log('timed out'); process.exit(2); }, 170000).unref();
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async (w, h) => { const ctx = await browser.newContext({ viewport: { width: w, height: h } }), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(url); await page.evaluate(() => { App.today = () => '2026-11-18'; }); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    await page.evaluate(() => App.showTab('uniforms')); await page.waitForSelector('#uniWrap table.uni tbody tr'); return { page, ctx, errs }; };
  for (const [w, h] of [[390, 844], [430, 932]]) {
    await test('phone ' + w + ': cards, no sideways scroll, labels shown, nothing clipped, 44px controls', async () => {
      const { page, ctx, errs } = await open(w, h);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways page scroll'); assert(!(await page.locator('#uniWrap.wide').count()), 'not the wide scroll box');
      assert.strictEqual(await page.$eval('#uniWrap thead', e => getComputedStyle(e).display), 'none', 'the header row is hidden'); assert.strictEqual(await page.$eval('#uniWrap tbody tr', e => getComputedStyle(e).display), 'grid', 'a row is a card');
      const r = await page.evaluate(() => { const tr = document.querySelector('#uniWrap tbody tr'), card = tr.getBoundingClientRect(), bad = [], small = [], labels = [];
        tr.querySelectorAll('td[data-label]').forEach(td => { const c = getComputedStyle(td, '::before'); labels.push([td.dataset.label, c.content.replace(/^"|"$/g, ''), c.display]); });
        tr.querySelectorAll('input, button, label, select').forEach(e => { const b = e.getBoundingClientRect(); if (b.width && (b.left < card.left - 1 || b.right > card.right + 1)) bad.push(e.tagName + ':' + (e.dataset.u || e.className)); if (b.width && b.height < 43.5 && e.tagName !== 'INPUT' || (e.type !== 'checkbox' && e.tagName === 'INPUT' && b.height < 43.5)) small.push(e.tagName + ':' + (e.dataset.u || e.className) + ':' + Math.round(b.height)); });
        return { bad, small, labels, namePlain: !tr.querySelector('td.uname').dataset.label, classPlain: !tr.querySelector('td.uclass').dataset.label }; });
      assert.deepStrictEqual(r.bad, [], 'clipped: ' + r.bad.join(',')); assert.deepStrictEqual(r.small, [], 'under 44px: ' + r.small.join(',')); assert(r.labels.length >= 6, 'labels: ' + r.labels.length); assert(r.labels.every(([a, b, d]) => a === b && d === 'block'), JSON.stringify(r.labels)); assert(r.namePlain && r.classPlain, 'the name and class title carry no label');
      assert.deepStrictEqual(errs, []); await ctx.close();
    });
    await test('phone ' + w + ': a size saves, Today fills a date, the no date tick counts as given, the bulk button works, and each box is named for the child', async () => {
      const { page, ctx } = await open(w, h); const id = await page.$eval('#uniWrap tbody tr', e => e.dataset.id), row = '#uniWrap tbody tr[data-id="' + id + '"]', val = k => page.evaluate(([i, k]) => App.master.people.find(x => x[Model.X.ID] === i)[Model.UNI[k]] || '', [id, k]);
      await page.fill(row + ' input[data-u="' + await page.evaluate(() => Model.UNI.SIZE_VERIFIED) + '"]', 'YM'); await page.keyboard.press('Tab'); await page.waitForTimeout(200); assert.strictEqual(await val('SIZE_VERIFIED'), 'YM', 'size saved');
      await page.click(row + ' td[data-label="Ordered"] .todaybtn'); await page.waitForTimeout(250); assert.strictEqual(await val('ORDERED'), '2026-11-18', 'Today on Ordered');
      await page.check(row + ' input[data-uflag]'); await page.waitForTimeout(250); assert(await page.evaluate(i => Model.uniGiven(App.master.people.find(x => x[Model.X.ID] === i)), id), 'the no date tick counts as given out');
      const n = +(await page.getAttribute('#uBulkReceived', 'data-n')); if (n) { await page.click('#uBulkReceived'); await page.waitForTimeout(250); assert(await page.evaluate(() => App.master.people.filter(p => p[Model.UNI.RECEIVED] === '2026-11-18').length >= 1), 'bulk marked rows'); }
      const names = await page.$$eval(row + ' input[type=text], ' + row + ' input[type=date]', e => e.map(x => x.getAttribute('aria-label') || '')), who = await page.$eval(row + ' td.uname', e => e.textContent.trim()); assert(names.length >= 3 && names.every(a => a.includes(who)), 'aria-labels name the child: ' + names.join(' | '));
      await ctx.close();
    });
    await test('phone ' + w + ': Tab goes through a card in the order it is drawn (sizes, then Ordered, Received, Given out, Notes)', async () => {
      const { page, ctx } = await open(w, h); const first = await page.$eval('#uniWrap tbody tr input[type=text]', e => { e.focus(); return true; }); assert(first);
      const order = []; for (let i = 0; i < 9; i++) { order.push(await page.evaluate(() => { const a = document.activeElement, tr = a.closest('tr'); if (!tr) return -1; return [...tr.querySelectorAll('input, button, select')].indexOf(a); })); await page.keyboard.press('Tab'); }
      const seen = order.filter(i => i >= 0); assert(seen.length >= 5, 'stayed in the card for a while: ' + order.join(',')); assert(seen.every((v, i) => !i || v >= seen[i - 1]), 'never goes backwards: ' + order.join(',')); await ctx.close();
    });
  }
  await test('1280: it is still a table (header row shown, rows are table rows)', async () => {
    const { page, ctx } = await open(1280, 900); assert.notStrictEqual(await page.$eval('#uniWrap thead', e => getComputedStyle(e).display), 'none'); assert.strictEqual(await page.$eval('#uniWrap tbody tr', e => getComputedStyle(e).display), 'table-row'); await ctx.close();
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
