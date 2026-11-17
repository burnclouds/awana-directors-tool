// The local save style is a setting of the data file (config.saveStyleLocal): Options shows it, a change is stored in the file and recorded in History.
// Usage: NODE_PATH=<dir with playwright> node test/save-style-browser.test.js        (uses ../../test-data)
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), files = fs.readdirSync(td);
const DATA = path.join(td, files.find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async () => { const ctx = await browser.newContext(); const p = await ctx.newPage(); p.on('dialog', d => d.dismiss()); await p.goto(url); await p.setInputFiles('#splashFiles', [DATA]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); return { p, ctx }; };
  const options = p => p.evaluate(() => document.querySelector('.tabs button[data-tab="options"]').click()).then(() => p.waitForTimeout(250));
  await test('a new file starts with one file (the save-over choice) and Options shows it checked', async () => {
    const { p, ctx } = await open(); await options(p);
    assert.strictEqual(await p.evaluate(() => App.season.config.saveStyleLocal), 'single');
    assert.strictEqual(await p.$eval('input[name="optLocalSave"][value="single"]', e => e.checked), true);
    await ctx.close();
  });
  await test('choosing a new dated file is stored in the data file, recorded in History, and shown after the screen is redrawn', async () => {
    const { p, ctx } = await open(); await options(p);
    const h0 = await p.evaluate(() => App.season.history.length);
    await p.check('input[name="optLocalSave"][value="dated"]'); await p.waitForTimeout(200);
    assert.strictEqual(await p.evaluate(() => App.season.config.saveStyleLocal), 'dated');
    assert(await p.evaluate(() => App.season.history.length) > h0, 'a History line was added');
    assert.strictEqual(await p.$eval('input[name="optLocalSave"][value="dated"]', e => e.checked), true, 'the choice shows after the screen is redrawn');
    await ctx.close();
  });
  await test('the choice is kept in the file (not the browser): no browser key is written', async () => {
    const { p, ctx } = await open(); await options(p);
    await p.check('input[name="optLocalSave"][value="dated"]'); await p.waitForTimeout(150);
    assert.strictEqual(await p.evaluate(() => Object.keys(localStorage).filter(k => /^awana/.test(k)).includes('awana.settings')), false);
    await ctx.close();
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
