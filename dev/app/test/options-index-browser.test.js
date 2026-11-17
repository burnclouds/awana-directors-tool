// UX-29: Options has a sticky index (links, or a "Go to section" list on a narrow screen) that moves focus to the section; each section is a clearly separated card with a heading bar; Validate and Debug are the index's last entry.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/options-index-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async w => { const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); await page.evaluate(() => App.showTab('options')); await page.waitForSelector('.optindex'); return { page, ctx, errs }; };
  await test('1280: one index link per section; each link moves focus to its section heading; the index stays in view after scrolling', async () => {
    const { page, ctx, errs } = await open(1280); const n = await page.$$eval('#optionsWrap > section.optsec', s => s.length), links = await page.$$eval('.optindex a[data-optgo]', a => a.map(x => x.dataset.optgo)); assert(n >= 8, 'sections: ' + n); assert.strictEqual(links.length, n, 'a link for each');
    for (const id of links) { await page.click('.optindex a[data-optgo="' + id + '"]'); await page.waitForTimeout(60); assert.strictEqual(await page.evaluate(() => document.activeElement.parentElement.id), id, 'focus on the heading of ' + id); }
    const top = await page.evaluate(() => document.querySelector('.optindex').getBoundingClientRect().top); assert(top >= 0 && top < 200, 'the index is still in view after scrolling: ' + top);
    assert(await page.isVisible('.optindex button[data-optsub="validate"]') && await page.isVisible('.optindex button[data-optsub="debug"]'), 'Validate and Debug are in the index'); assert.deepStrictEqual(errs, []); await ctx.close();
  });
  await test('each section is a card with a heading bar and at least 24px below it', async () => {
    const { page, ctx } = await open(1280); const r = await page.evaluate(() => [...document.querySelectorAll('#optionsWrap > section.optsec')].map(s => { const h = getComputedStyle(s.querySelector('h3')), c = getComputedStyle(s); return { bg: h.backgroundColor, mb: parseFloat(c.marginBottom), fw: +h.fontWeight, fs: parseFloat(h.fontSize) }; }));
    assert(r.every(x => x.bg !== 'rgba(0, 0, 0, 0)' && x.mb >= 24 && x.fw >= 600 && x.fs >= 16), JSON.stringify(r.find(x => !(x.bg !== 'rgba(0, 0, 0, 0)' && x.mb >= 24)))); await ctx.close();
  });
  for (const w of [390, 430, 600]) {
    await test('at ' + w + ': the "Go to section" list jumps to the section, nothing scrolls sideways, the sub-nav is not repeated at the top', async () => {
      const { page, ctx } = await open(w); assert(await page.isVisible('#optGo'), 'the list shows'); assert(!(await page.isVisible('.optlinks')), 'the links are hidden'); assert.strictEqual(await page.$$eval('#tab-options > nav.optsubs', n => n.length), 0, 'the old sub-nav bar is gone from Options');
      const target = await page.$$eval('#optGo option', o => o[o.length - 1].value); await page.selectOption('#optGo', target); await page.waitForTimeout(120); assert.strictEqual(await page.evaluate(() => document.activeElement.parentElement.id), target, 'focus on the section');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll'); await ctx.close();
    });
  }
  await test('Validate and Debug open from the index and Options comes back from them', async () => {
    const { page, ctx } = await open(1280); await page.click('.optindex button[data-optsub="debug"]'); await page.waitForTimeout(250); assert(await page.isVisible('#tab-debug')); await page.click('#tab-debug .optsubs button[data-optsub="options"]'); await page.waitForTimeout(250); assert(await page.isVisible('#tab-options')); await ctx.close();
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
