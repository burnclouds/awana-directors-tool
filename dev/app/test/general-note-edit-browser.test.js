// A General note can be edited on the To do tab (Notes and flags): Edit turns its text into a box, Save keeps it, Cancel drops the change.
// Usage: NODE_PATH=<dir with playwright> node test/general-note-edit-browser.test.js        (uses ../../test-data, test club only)
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), files = fs.readdirSync(td);
const DATA = path.join(td, files.find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async () => {
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
    p.on('dialog', d => d.accept()); await p.goto(url); await p.setInputFiles('#splashFiles', [DATA]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    await p.evaluate(() => { App.addNote('Ask the leaders about the Rank sign-offs'); }); await p.waitForTimeout(150);
    return { p, ctx };
  };
  const noteRow = p => p.locator('tr[data-flag]').filter({ hasText: 'Ask the leaders about the Rank sign-offs' });
  await test('Edit on a general note turns its text into a box; Save keeps the new text', async () => {
    const { p, ctx } = await open(); await p.evaluate(() => document.querySelector('.tabs button[data-tab="todo"]').click()); await p.waitForTimeout(250);
    await noteRow(p).locator('button[data-editnote]').click(); await p.waitForTimeout(100);
    assert(await p.isVisible('textarea[data-noteedit]'), 'the note is a box');
    await p.fill('textarea[data-noteedit]', 'Ask the leaders about the Rank sign-offs on Thursday'); await p.click('button[data-notesave]'); await p.waitForTimeout(200);
    const flags = await p.evaluate(() => Season.flagList(App.season).map(f => f.note)); assert(flags.includes('Ask the leaders about the Rank sign-offs on Thursday'), flags.join(' | '));
    assert(await p.isVisible('tr[data-flag] td.wrap:has-text("on Thursday")'), 'the row shows the new text'); await ctx.close();
  });
  await test('Cancel leaves the note as it was', async () => {
    const { p, ctx } = await open(); await p.evaluate(() => document.querySelector('.tabs button[data-tab="todo"]').click()); await p.waitForTimeout(250);
    await noteRow(p).locator('button[data-editnote]').click(); await p.fill('textarea[data-noteedit]', 'Something else'); await p.click('button[data-notecancel]'); await p.waitForTimeout(150);
    const flags = await p.evaluate(() => Season.flagList(App.season).map(f => f.note)); assert(flags.includes('Ask the leaders about the Rank sign-offs'), flags.join(' | ')); await ctx.close();
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
