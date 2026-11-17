// The report title follows the season ("AWANA Club 26-27") until the user types their own, and typing one keeps it.
// Usage: NODE_PATH=<dir with playwright> node test/club-title.test.js        (uses ../../test-data)
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), files = fs.readdirSync(td);
const DATA = path.join(td, files.find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async ctx => { const p = await ctx.newPage(); p.on('dialog', d => d.dismiss()); await p.goto(url); return p; };
  const title = p => p.inputValue('#sClub');
  const load = async p => { await p.setInputFiles('#fileAny', [DATA]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); };
  const reports = async p => { await p.evaluate(() => document.querySelector('.tabs button[data-tab="reports"]').click()); await p.selectOption('#rSel', 'paceWatch'); await p.waitForTimeout(150); };
  const ctx = await browser.newContext();
  let p = await open(ctx);
  await test('with no file open the title is "AWANA Club" and this school year from today\'s date', async () => {
    const t = new Date(), a = t.getFullYear() - (t.getMonth() < 7 ? 1 : 0);
    assert.strictEqual(await title(p), 'AWANA Club ' + String(a).slice(-2) + '-' + String(a + 1).slice(-2));
  });
  await test('opening the 2026-27 data file sets it to "AWANA Club 26-27"', async () => { await load(p); assert.strictEqual(await title(p), 'AWANA Club 26-27'); });
  await test('a typed title is kept in the data file (config.clubTitle): it is in the open file, and the browser keeps no copy', async () => {
    await reports(p); await p.fill('#sClub', 'Grace Church AWANA');
    assert.strictEqual(await p.evaluate(() => App.season.config.clubTitle), 'Grace Church AWANA');
    assert.strictEqual(await p.evaluate(() => localStorage.getItem('awana.settings')), null);
  });
  await test('clearing the box removes it from the file and goes back to following the season', async () => {
    await reports(p); await p.fill('#sClub', ''); await p.dispatchEvent('#sClub', 'change'); assert.strictEqual(await title(p), 'AWANA Club 26-27');
    assert.strictEqual(await p.evaluate(() => 'clubTitle' in App.season.config), false);
  });
  await test('a title kept only in an old browser setting is not used: the file decides, and the old setting is removed', async () => {
    await p.close();      // the page with the file open is closed first (its unsaved edits would stop a reload)
    const q = await open(ctx);      // a fresh page (no file open) on the same browser storage
    await q.evaluate(() => localStorage.setItem('awana.settings', JSON.stringify({ quarter: 'Q2', club: 'FBK Club 2026-2027' })));
    await q.reload(); await load(q); assert.strictEqual(await title(q), 'AWANA Club 26-27');
    assert.strictEqual(await q.evaluate(() => localStorage.getItem('awana.settings')), null);
    p = q;
  });
  await test('the title is what the reports print', async () => {
    await reports(p); await p.fill('#sClub', 'My Club'); await p.waitForTimeout(200);
    assert(/My Club/.test(await p.textContent('#report')));
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
