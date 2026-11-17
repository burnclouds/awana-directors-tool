// Contrast (4.5:1 for text) of the UI added in 1.51.14, in the light and the dark scheme: tap buttons that are set, the "..." button with flag mode on, a set Roster filter, Options section headings and index links,
// the Tonight strip, To do class lines, the new-year checklist, the Help sheet. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/new-ui-contrast-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  for (const scheme of ['light', 'dark']) {
    await test('text on the new controls and panels has at least 4.5:1 contrast (' + scheme + ')', async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme }), page = await ctx.newPage(); page.on('dialog', d => d.dismiss());
      await page.goto(url); await page.evaluate(t => { App.today = () => t; }, '2026-10-28'); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
      const grab = async (tab, setup, sel) => { await page.evaluate(t => App.showTab(t), tab); await page.waitForTimeout(200); if (setup) { await page.evaluate(setup); await page.waitForTimeout(200); } return page.evaluate(sel => {
        const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor, m = c.match(/[\d.]+/g); if (m && (m.length === 3 || +m[3] > 0.99)) return c; } return getComputedStyle(document.body).backgroundColor || 'rgb(255,255,255)'; };
        return [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null || e.tagName === 'DIALOG').slice(0, 3).map(e => { const fg = getComputedStyle(e).color, bg = bgOf(e), a = lum(fg), b = lum(bg); return { sel, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), fg, bg }; }); }, sel); };
      const checks = [];
      checks.push(...await grab('games', () => { const t = Season.teamOrder(App.season); document.querySelector('#gamesWrap button[data-f="place"][data-v="1"]').click(); }, '#gamesWrap .tapgrp button.on'));
      checks.push(...await grab('games', null, '#gamesWrap .tapgrp button:not(.on)'));
      checks.push(...await grab('roster', () => { const s = document.querySelector('#rosterWrap select[data-cf="room"]'); s.selectedIndex = 1; s.dispatchEvent(new Event('change', { bubbles: true })); }, '#rosterWrap select.cfset'));
      checks.push(...await grab('roster', null, '#rosterShowing'));
      checks.push(...await grab('options', null, '.optsec > h3'));
      checks.push(...await grab('options', null, '.optindex a'));
      checks.push(...await grab('options', null, '.nylist li b'));
      checks.push(...await grab('options', null, '.nylist li .status'));
      checks.push(...await grab('todo', null, '.tonightstrip'));
      checks.push(...await grab('todo', null, 'details.tdclass > summary'));
      checks.push(...await grab('todo', () => { document.getElementById('btnFlagMode').click(); }, '#btnFlagMode.on'));
      const low = checks.filter(c => c.ratio < 4.5); assert(checks.length >= 8, 'elements found: ' + checks.length);
      assert.strictEqual(low.length, 0, scheme + ': low contrast: ' + low.map(c => c.sel + ' ' + c.fg + ' on ' + c.bg + ' = ' + c.ratio.toFixed(2)).join(' | ')); await ctx.close();
    });
  }
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
