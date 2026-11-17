// S7: the Color teams page at a desktop width (1280 by 900) and a phone width (390 by 844). Checks: the page never scrolls sideways;
// the grid is the only area that scrolls by itself (plus an open attendance list in the side panel, which scrolls inside itself and does not make the page taller);
// the attendance table in the side panel fits the panel, so the Rate text is not clipped. Invented TEST club only.
// Usage: NODE_PATH=<dir with playwright> node test/color-teams-widths-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async (w, h) => { const ctx = await browser.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage(); p.on('dialog', d => d.accept()); await p.goto(url); await p.setInputFiles('#splashFiles', [DATA]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); return { p, ctx }; };
  const showTeams = async p => { await p.evaluate(() => document.querySelector('.tabs button[data-tab="games"]').click()); await p.waitForTimeout(500); await p.evaluate(() => document.querySelector('#tab-games [data-sub="teams"]').click()); await p.waitForTimeout(500);
    await p.evaluate(() => { const q = document.getElementById('tQuarter'); q.value = 'Q2'; q.dispatchEvent(new Event('change', { bubbles: true })); }); await p.waitForTimeout(500); };

  for (const [w, h] of [[1280, 900], [390, 844]]) {
    await test(w + ' by ' + h + ': the page does not scroll sideways', async () => {
      const { p, ctx } = await open(w, h); await showTeams(p);
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'page width ' + await p.evaluate(() => document.documentElement.scrollWidth) + ' vs ' + w);
      await ctx.close();
    });
    await test(w + ' by ' + h + ': the side-panel attendance table fits its panel (no clipped Rate text)', async () => {
      const { p, ctx } = await open(w, h); await showTeams(p);
      const r = await p.evaluate(() => { const why = document.querySelector('.tgwhy'); if (!why) return null; why.querySelectorAll('details').forEach(d => { d.open = true; }); const t = why.querySelector('table'); if (!t) return null; return { table: t.scrollWidth, space: t.parentElement.clientWidth, cell: getComputedStyle(t.querySelector('td:last-child')).whiteSpace }; });
      if (r) { assert(r.table <= r.space + 1, 'table ' + r.table + 'px in ' + r.space + 'px'); assert.strictEqual(r.cell, 'normal', 'the Rate text wraps'); }
      await ctx.close();
    });
    await test(w + ' by ' + h + ': only the grid and an open side list scroll by themselves', async () => {
      const { p, ctx } = await open(w, h); await showTeams(p);
      const scrollers = await p.evaluate(() => [...document.querySelectorAll('#tab-games *')].filter(e => e.offsetParent && /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 2).map(e => e.className || e.tagName));
      const unexpected = scrollers.filter(c => !/tgscroll|tgwhy|absencecard|scroll/.test(String(c)));
      assert.deepStrictEqual(unexpected, [], 'unexpected scroll areas: ' + unexpected.join(', '));
      await ctx.close();
    });
  }
  await test('1280 by 900: an open side list does not make the page taller', async () => {
    const { p, ctx } = await open(1280, 900); await showTeams(p);
    const before = await p.evaluate(() => document.documentElement.scrollHeight);
    await p.evaluate(() => { const d = document.querySelector('.tgwhy details'); if (d) d.open = true; }); await p.waitForTimeout(200);
    const after = await p.evaluate(() => document.documentElement.scrollHeight);
    assert(after <= Math.max(before, 900) + 2, 'page grew from ' + before + ' to ' + after);
    await ctx.close();
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
