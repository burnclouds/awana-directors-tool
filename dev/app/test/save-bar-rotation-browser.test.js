// Backlog S9: the phone Save bar (R12) also shows in landscape, and it comes back at once after rotating to portrait (no edit needed).
// Desktop is unchanged: no bar at a wide window. Test data only (the TEST file in ../../test-data).
// Usage: NODE_PATH=<dir with playwright> node test/save-bar-rotation-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), files = fs.readdirSync(td);
const DATA = path.join(td, files.find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  // A phone: touch screen, mobile emulation. Landscape is 844 by 390 (wider than 760px, short).
  const openPhone = async (w, h) => {
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: w, height: h }, hasTouch: true, isMobile: true }); const p = await ctx.newPage();
    p.on('dialog', d => d.accept()); await p.goto(url); await p.setInputFiles('#splashFiles', [DATA]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { p, ctx };
  };
  const openDesktop = async () => {
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
    p.on('dialog', d => d.accept()); await p.goto(url); await p.setInputFiles('#splashFiles', [DATA]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { p, ctx };
  };
  // Twenty unsaved edits: the threshold for the Save bar (NUDGE_EDITS in app-season.js).
  const MANY = async (p, n) => { await p.evaluate(count => { const id = Object.keys(App.season.roster.people)[0]; for (let i = 0; i < count; i++) { Season.setMark(App.season, '2026-11-0' + (1 + i % 8), id, 'h', 1); App.commitScope(() => App.changed()); } }, n); await p.waitForTimeout(150); };
  const shown = p => p.evaluate(() => { const b = document.getElementById('saveNudge'); return !!b && !b.hidden && getComputedStyle(b).display !== 'none'; });

  await test('a phone in landscape shows the Save bar after 20 unsaved edits', async () => {
    const { p, ctx } = await openPhone(844, 390); await MANY(p, 19); assert.strictEqual(await shown(p), false, '19 edits show nothing');
    await MANY(p, 1); assert.strictEqual(await shown(p), true, 'the bar is shown in landscape'); await ctx.close();
  });
  await test('rotating a phone back to portrait shows the bar at once, without another edit', async () => {
    const { p, ctx } = await openPhone(844, 390); await MANY(p, 20); assert.strictEqual(await shown(p), true, 'shown in landscape first');
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
    assert.strictEqual(await shown(p), true, 'still shown in portrait after rotating back'); await ctx.close();
  });
  await test('a wide desktop window shows no Save bar, even with 20 unsaved edits', async () => {
    const { p, ctx } = await openDesktop(); await MANY(p, 20); assert.strictEqual(await shown(p), false, 'desktop unchanged'); await ctx.close();
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
