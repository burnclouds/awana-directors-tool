// Plan item 3: the Download button shows a dot while there are unsaved changes. Plan item 5: a Present row on Attendance is tinted.
// Usage: NODE_PATH=<dir with playwright> node test/save-dot-browser.test.js        (uses ../../test-data)
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), files = fs.readdirSync(td);
const DATA = path.join(td, files.find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async () => { const ctx = await browser.newContext({ acceptDownloads: true }); const p = await ctx.newPage(); p.on('dialog', d => d.accept()); await p.goto(url); await p.setInputFiles('#splashFiles', [DATA]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); return { p, ctx }; };
  const dot = p => p.evaluate(() => document.getElementById('btnSeasonSave').classList.contains('unsaved'));
  await test('a clean file has no dot on Download data file', async () => {
    const { p, ctx } = await open(); assert.strictEqual(await dot(p), false); await ctx.close();
  });
  await test('an edit shows the dot, and a save clears it', async () => {
    const { p, ctx } = await open();
    await p.evaluate(() => { const id = Object.keys(App.season.roster.people)[0]; Season.setMark(App.season, '2026-10-28', id, 'h', 1); App.commitScope(() => App.changed()); });
    await p.waitForTimeout(150); assert.strictEqual(await dot(p), true, 'the dot is on');
    await p.evaluate(() => document.getElementById('btnSeasonSave').click()); await p.waitForTimeout(100);
    await p.evaluate(() => document.getElementById('btnSeasonSave').click()); await p.waitForTimeout(400);      // test data: the first press arms the button, the second saves
    assert.strictEqual(await dot(p), false, 'the dot is off after the save');
    await ctx.close();
  });
  await test('a Present box tints its row on Attendance, and clearing it removes the tint', async () => {
    const { p, ctx } = await open();
    await p.evaluate(() => document.querySelector('.tabs button[data-tab="attend"]').click()); await p.waitForTimeout(250);
    const cb = p.locator('#attendWrap tbody tr').first().locator('input[type=checkbox]').first();
    await cb.check(); await p.waitForTimeout(150);
    assert.strictEqual(await p.locator('#attendWrap tbody tr.here').count(), 1, 'one row is tinted');
    await cb.uncheck(); await p.waitForTimeout(150);
    assert.strictEqual(await p.locator('#attendWrap tbody tr.here').count(), 0, 'the tint is gone');
    await ctx.close();
  });
  // ---- R12: unsaved work in words on a phone ----
  const openPhone = async () => { const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage(); p.on('dialog', d => d.accept()); await p.goto(url); await p.setInputFiles('#splashFiles', [DATA]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); await p.waitForTimeout(300); return { p, ctx }; };
  const edit = (p, n) => p.evaluate(count => { const id = Object.keys(App.season.roster.people)[0]; for (let i = 0; i < count; i++) { Season.setMark(App.season, '2026-10-28', id, i % 2 ? 'h' : 'a', i % 3 === 0 ? 0 : 1); App.commitScope(() => App.changed()); Season.setMark(App.season, '2026-11-0' + (1 + i % 8), id, 'h', 1); App.commitScope(() => App.changed()); } }, n || 1);
  const chip = p => p.evaluate(() => { const e = document.getElementById('seasonStatus'), s = getComputedStyle(e), r = e.getBoundingClientRect(); return { shown: s.display !== 'none' && r.width > 0, text: e.innerText, size: parseFloat(s.fontSize), before: getComputedStyle(e, '::before').content, left: r.left, right: r.right }; });
  await test('on a phone a clean file shows no unsaved words', async () => {
    const { p, ctx } = await openPhone(); const c = await chip(p); assert(!c.shown || c.size === 0, JSON.stringify(c)); await ctx.close();
  });
  await test('on a phone one edit says "1 unsaved edit" in readable words, inside the screen', async () => {
    const { p, ctx } = await openPhone(); await p.evaluate(() => { const id = Object.keys(App.season.roster.people)[0]; Season.setMark(App.season, '2026-10-28', id, 'h', 1); App.commitScope(() => App.changed()); }); await p.waitForTimeout(150);
    const c = await chip(p); assert(c.shown, JSON.stringify(c)); assert(/^1 unsaved edit$/.test(c.text.trim()), c.text); assert(c.size >= 12, 'font ' + c.size); assert(c.before === 'none' || c.before === 'normal', 'no dot: ' + c.before); assert(c.left >= 0 && c.right <= 390, JSON.stringify(c)); await ctx.close();
  });
  await test('Download stays fully on screen with the words showing, and nothing scrolls sideways', async () => {
    const { p, ctx } = await openPhone(); await edit(p, 12); await p.waitForTimeout(150);
    const r = await p.evaluate(() => { const b = document.getElementById('btnSeasonSave').getBoundingClientRect(); return { l: b.left, r: b.right, sw: document.documentElement.scrollWidth, n: document.getElementById('seasonStatus').innerText }; });
    assert(r.l >= 0 && r.r <= 390, JSON.stringify(r)); assert(r.sw <= 390, 'the page scrolls sideways: ' + r.sw); assert(/unsaved edits/.test(r.n), r.n); await ctx.close();
  });
  await test('saving clears the words', async () => {
    const { p, ctx } = await openPhone(); await edit(p, 1); await p.evaluate(() => document.getElementById('btnSeasonSave').click()); await p.waitForTimeout(100);
    await p.evaluate(() => document.getElementById('btnSeasonSave').click()); await p.waitForTimeout(400); const c = await chip(p); assert(!c.shown || c.size === 0, JSON.stringify(c)); await ctx.close();
  });
  await test('the Download button\'s name says unsaved while dirty, and not after a save', async () => {
    const { p, ctx } = await openPhone(); assert.strictEqual(await p.evaluate(() => document.getElementById('btnSeasonSave').getAttribute('aria-label')), null); await edit(p, 1);
    assert(/unsaved/.test(await p.evaluate(() => document.getElementById('btnSeasonSave').getAttribute('aria-label')) || ''), 'aria-label while dirty');
    await p.evaluate(() => document.getElementById('btnSeasonSave').click()); await p.waitForTimeout(100); await p.evaluate(() => document.getElementById('btnSeasonSave').click()); await p.waitForTimeout(400);
    assert.strictEqual(await p.evaluate(() => document.getElementById('btnSeasonSave').getAttribute('aria-label')), null); await ctx.close();
  });
  // ---- R12: a Save bar on a phone when unsaved work has waited too long ----
  const ONE = p => p.evaluate(() => { const id = Object.keys(App.season.roster.people)[0], k = '2026-11-0' + (1 + (window.__n = (window.__n || 0) + 1) % 8); Season.setMark(App.season, k, id, 'h', 1); App.commitScope(() => App.changed()); });
  const MANY = async (p, n) => { for (let i = 0; i < n; i++) await ONE(p); await p.waitForTimeout(150); };
  const bar = p => p.evaluate(() => { const b = document.getElementById('saveNudge'); if (!b) return { exists: false }; const s = getComputedStyle(b), r = b.getBoundingClientRect(); return { exists: true, shown: !b.hidden && s.display !== 'none', text: document.getElementById('saveNudgeText').textContent, top: r.top, btns: [...b.querySelectorAll('button')].map(x => { const q = x.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height)]; }), pad: parseFloat(getComputedStyle(document.body).paddingBottom) }; });
  await test('after 20 unsaved edits a Save bar appears with 44px buttons; 19 show none', async () => {
    const { p, ctx } = await openPhone(); await MANY(p, 19); assert.strictEqual((await bar(p)).shown, false, '19 edits'); await MANY(p, 1);
    const b = await bar(p); assert(b.shown, JSON.stringify(b)); assert(/20 edits are not saved yet/.test(b.text), b.text); assert.strictEqual(b.btns.length, 2); assert(b.btns.every(([w, h]) => w >= 44 && h >= 44), JSON.stringify(b.btns)); await ctx.close();
  });
  await test('after 15 minutes the bar appears with one edit', async () => {
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }), p = await ctx.newPage(); p.on('dialog', d => d.accept()); await p.clock.install(); await p.goto(url);
    await p.setInputFiles('#splashFiles', [DATA]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); await ONE(p); assert.strictEqual((await bar(p)).shown, false);
    await p.clock.fastForward('15:40'); await p.waitForTimeout(100); const b = await bar(p); assert(b.shown, JSON.stringify(b)); assert(/last 15 minutes/.test(b.text), b.text); await ctx.close();
  });
  await test('Save now saves and the bar goes away', async () => {
    const { p, ctx } = await openPhone(); await MANY(p, 20); const dl = p.waitForEvent('download', { timeout: 5000 });
    await p.evaluate(() => document.getElementById('saveNudgeBtn').click()); await p.waitForTimeout(100); await p.evaluate(() => document.getElementById('saveNudgeBtn').click()); await dl; await p.waitForTimeout(300);
    assert.strictEqual((await bar(p)).shown, false); await ctx.close();
  });
  await test('Later hides the bar until 20 more edits', async () => {
    const { p, ctx } = await openPhone(); await MANY(p, 20); await p.evaluate(() => document.getElementById('saveNudgeLater').click()); await p.waitForTimeout(100);
    assert.strictEqual((await bar(p)).shown, false); await MANY(p, 19); assert.strictEqual((await bar(p)).shown, false, '19 more'); await MANY(p, 1); const b = await bar(p); assert(b.shown && /40 edits/.test(b.text), JSON.stringify(b)); await ctx.close();
  });
  await test('the bar covers nothing: the page keeps room under it, and a toast sits above it', async () => {
    const { p, ctx } = await openPhone(); await MANY(p, 20); const b = await bar(p); assert(b.pad >= 60, 'room under the page: ' + b.pad);
    await p.evaluate(() => App.flash('hello', 'info')); const f = await p.evaluate(() => document.getElementById('flash').getBoundingClientRect().bottom); assert(f <= b.top + 1, 'the toast bottom ' + f + ' is under the bar top ' + b.top); await ctx.close();
  });
  await test('no bar while a dialog is open', async () => {
    const { p, ctx } = await openPhone(); await p.evaluate(() => { const d = document.getElementById('dlg'); d.innerHTML = '<p>x</p>'; d.showModal(); }); await MANY(p, 20);
    assert.strictEqual((await bar(p)).shown, false, 'hidden under a dialog'); await ctx.close();
  });
  await test('no bar on a computer, and none in print', async () => {
    const { p, ctx } = await open(); for (let i = 0; i < 20; i++) await ONE(p); await p.waitForTimeout(150); assert.strictEqual((await bar(p)).shown, false, 'computer'); assert(await p.evaluate(() => document.getElementById('seasonStatus').classList.contains('nudge')), 'the chip still turns bold'); await ctx.close();
    const ph = await openPhone(); await MANY(ph.p, 20); await ph.p.emulateMedia({ media: 'print' }); assert.strictEqual((await bar(ph.p)).shown, false, 'print'); await ph.ctx.close();
  });
  await test('on a computer the chip is unchanged', async () => {
    const { p, ctx } = await open(); await p.evaluate(() => { const id = Object.keys(App.season.roster.people)[0]; Season.setMark(App.season, '2026-10-28', id, 'h', 1); App.commitScope(() => App.changed()); }); await p.waitForTimeout(150);
    const r = await p.evaluate(() => { const e = document.getElementById('seasonStatus'); return { t: e.innerText.trim(), bg: getComputedStyle(e).backgroundColor }; }); assert.strictEqual(r.t, '1 unsaved edit'); assert.strictEqual(r.bg, 'rgb(255, 243, 224)'); await ctx.close();
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
