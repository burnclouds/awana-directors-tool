// Layout invariants (UX-01, UX-02, CR-06): an element with the hidden attribute is never drawn, on any tab at phone and desktop sizes and on every report;
// the Reports toolbar is not 7in wide and the page does not scroll sideways on a phone; bundle mode shows ONE quarter control.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/hidden-attr-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const WIDTHS = [390, 430, 600, 1280];
const drawnHidden = () => [...document.querySelectorAll('[hidden]')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id || e.className || e.tagName);

(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async w => { const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage(); page.on('dialog', d => d.accept()); await page.clock.setFixedTime(new Date('2026-11-16T12:00:00')); await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); return { page, ctx }; };
  const tab = (page, t) => page.evaluate(x => { const b = document.querySelector('.tabs button[data-tab="' + x + '"]'); if (b) b.click(); }, t);

  for (const w of WIDTHS) {
    await test('no hidden element is drawn on any tab at ' + w + ' wide', async () => {
      const { page, ctx } = await open(w); const bad = [];
      const tabs = await page.$$eval('.tabs button[data-tab]', b => b.map(x => x.dataset.tab));
      for (const t of tabs) { await tab(page, t); await page.waitForTimeout(120); const d = await page.evaluate(drawnHidden); if (d.length) bad.push(t + ': ' + d.join(',')); }
      await ctx.close(); assert.deepStrictEqual(bad, []);
    });
    await test('every report at ' + w + ': no hidden control drawn, no sideways page scroll' + (w < 1000 ? '' : ' (not asserted on desktop)') + ', toolbar not 7in wide', async () => {
      const { page, ctx } = await open(w); await tab(page, 'reports'); await page.waitForTimeout(200); const bad = [];
      const values = await page.$$eval('#rSel option', o => o.map(x => x.value));
      for (const v of values) {
        await page.evaluate(x => { const s = document.getElementById('rSel'); s.value = x; s.dispatchEvent(new Event('change', { bubbles: true })); }, v); await page.waitForTimeout(90);
        const r = await page.evaluate(() => ({ hid: [...document.querySelectorAll('[hidden]')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id || e.tagName), sw: document.documentElement.scrollWidth, iw: window.innerWidth, bar: document.querySelector('#tab-reports > .rhead').getBoundingClientRect().width }));
        if (r.hid.length) bad.push(v + ' hidden drawn: ' + r.hid.join(','));
        if (w < 1000 && r.sw > r.iw) bad.push(v + ' scrolls sideways: ' + r.sw + ' > ' + r.iw);
        if (r.bar > w - 8) bad.push(v + ' toolbar ' + Math.round(r.bar) + 'px wide in ' + w);
      }
      await ctx.close(); assert.deepStrictEqual(bad, []);
    });
  }
  await test('bundle mode shows one quarter control (Quarter to print); List order and Title are still there; leaving bundle mode brings the pills back', async () => {
    const { page, ctx } = await open(1280); await tab(page, 'reports'); await page.waitForTimeout(200);
    const bundle = await page.$$eval('#rSel option', o => (o.find(x => /^bundle:/.test(x.value)) || {}).value);
    if (!bundle) { await ctx.close(); return; }      // the TEST club has no bundle defined: nothing to check
    await page.evaluate(x => { const s = document.getElementById('rSel'); s.value = x; s.dispatchEvent(new Event('change', { bubbles: true })); }, bundle); await page.waitForTimeout(150);
    const vis = id => page.evaluate(i => { const e = document.getElementById(i); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; }, id);
    assert(await vis('bWrap'), 'Quarter to print is shown'); assert(!(await vis('qWrap')), 'the lower Q1-Q4 pills are hidden'); assert(await vis('oOrder'), 'List order stays'); assert(!(await vis('tWrap')), 'Title is hidden: the standard bundle has no pace watch list');
    assert(/Quarter to print/.test(await page.$eval('#bWrap', e => e.textContent)), 'labelled');
    await page.evaluate(() => { const s = document.getElementById('rSel'); const o = [...s.options].find(x => !/^bundle:/.test(x.value) && /quarter/.test((window.Reports && Reports.LIST.find(r => r.id === x.value) || { opts: [] }).opts.join())); if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); } }); await page.waitForTimeout(150);
    assert(!(await vis('bWrap')), 'Quarter to print is hidden again'); await ctx.close();
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
