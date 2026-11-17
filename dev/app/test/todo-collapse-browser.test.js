// UX-23 (To do grouped by class under collapsible lines, groups of things to check start closed, no duplicate "Open Person page" button) and UX-22 (a caption over every box in a phone card).
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/todo-collapse-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async (w, view) => { const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); await page.evaluate(() => App.showTab('todo')); await page.waitForSelector('#todoWrap');
    if (view === 'task') { await page.check('input[name="tdView"][value="task"]'); await page.waitForTimeout(250); } return { page, ctx, errs }; };
  for (const w of [390, 1280]) {
    await test('To do (' + w + '): the cards sit under class lines with counts; the page is much shorter than with every class open; no duplicate Open Person page button', async () => {
      const { page, ctx, errs } = await open(w); const n = await page.$$eval('details.tdclass', d => d.length); assert(n >= 2, 'class lines: ' + n); assert(await page.$$eval('details.tdclass > summary', s => s.every(x => /\(\d+\)$/.test(x.textContent.trim()))), 'each line carries a count');
      assert.strictEqual(await page.$$eval('button[data-person-open]', b => b.length), 0, 'the duplicate button is gone'); const dflt = await page.evaluate(() => document.getElementById('todoWrap').scrollHeight);
      await page.$$eval('details.tdclass', d => d.forEach(x => { x.open = true; })); const all = await page.evaluate(() => document.getElementById('todoWrap').scrollHeight); assert(dflt < all, 'default ' + dflt + ' < all open ' + all);
      await page.$$eval('details.tdclass', d => d.forEach(x => { x.open = false; })); await page.waitForTimeout(100); const none = await page.evaluate(() => document.getElementById('todoWrap').scrollHeight); assert(none < all * 0.6, 'closed ' + none + ' vs open ' + all); assert.deepStrictEqual(errs, []); await ctx.close();
    });
  }
  await test('task view: classes holding only things to check start closed, classes with something to do start open; opening one is remembered across a redraw', async () => {
    const { page, ctx } = await open(1280, 'task'); const info = await page.$$eval('#todoWrap section.pcard', s => s.map(x => ({ level: (x.querySelector('h3 .status') || {}).textContent, details: [...x.querySelectorAll('details.tdclass')].map(d => d.open) })).filter(x => x.details.length));
    assert(info.length, 'some groups are split by class'); info.forEach(g => { if (/check/.test(g.level)) assert(g.details.every(o => !o), 'to check groups start closed'); if (/to do/.test(g.level)) assert(g.details.every(o => o), 'to do groups start open'); });
    const closed = await page.$('details.tdclass:not([open])'); if (closed) { const key = await closed.getAttribute('data-tdkey'); await closed.evaluate(d => { d.open = true; }); await page.waitForTimeout(100); await page.evaluate(() => App.tabs.todo()); await page.waitForTimeout(150); assert.strictEqual(await page.$eval('details.tdclass[data-tdkey="' + key.replace(/"/g, '\\"') + '"]', d => d.open), true, 'remembered'); }
    await ctx.close();
  });
  for (const w of [390, 430, 600]) {
    await test('UX-22 (' + w + '): every visible box in a card row has a visible caption, a label or an aria-label', async () => {
      const { page, ctx } = await open(w, 'task'); await page.$$eval('details.tdclass', d => d.forEach(x => { x.open = true; })); await page.waitForTimeout(300);
      const bad = await page.evaluate(() => [...document.querySelectorAll('#todoWrap .pcard table.roster tbody td input:not([type=hidden]), #todoWrap .pcard table.roster tbody td select, #todoWrap .pcard table.roster tbody td textarea')].filter(e => e.offsetParent !== null).filter(e => { const td = e.closest('td'); return !(td.dataset.label || e.getAttribute('aria-label') || e.closest('label')); }).map(e => e.outerHTML.slice(0, 80)));
      assert.deepStrictEqual(bad, [], 'boxes with no caption'); const caps = await page.evaluate(() => { const t = document.querySelector('#todoWrap .pcard td[data-label]'); return t ? getComputedStyle(t, '::before').content : 'none'; }); if (caps !== 'none') assert(/\w/.test(caps), 'a caption shows: ' + caps); await ctx.close();
    });
  }
  await test('UX-22 at 1280: no captions (the table head is shown)', async () => {
    const { page, ctx } = await open(1280, 'task'); await page.$$eval('details.tdclass', d => d.forEach(x => { x.open = true; })); const c = await page.evaluate(() => { const t = document.querySelector('#todoWrap .pcard td'); return t ? getComputedStyle(t, '::before').content : 'none'; }); assert(c === 'none' || c === 'normal', c); assert(await page.isVisible('#todoWrap .pcard thead')); await ctx.close();
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
