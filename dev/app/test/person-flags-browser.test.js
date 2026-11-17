// Person tab notes: no flag is drawn beside a Club record field until it has a note; a flagged field shows a yellow flag whose popup edits the note (flags are started only by the top-bar Flag button and the To do box).
// Usage: NODE_PATH=<dir with playwright> node test/person-flags-browser.test.js        (uses ../../test-data)
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), files = fs.readdirSync(td);
const DATA = path.join(td, files.find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const ctx = await browser.newContext(); const p = await ctx.newPage(); p.on('dialog', d => d.accept()); await p.goto(url);
  await p.setInputFiles('#splashFiles', [DATA]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const kid = await p.evaluate(() => { const x = App.master.people.find(q => Model.isActive(q) && Model.isClubber(q)); return x[Model.X.ID]; });
  const show = async () => { await p.evaluate(id => App.showPerson(id), kid); await p.waitForTimeout(300); await p.click('#peSub button[data-sub="registration"]'); await p.waitForTimeout(250); };
  const fields = () => p.evaluate(() => [...document.querySelectorAll('button.flagbtn[data-fplace]')].map(b => JSON.parse(b.dataset.fplace).field));
  await show();
  await test('with no notes there is no flag beside any Club, Uniform or Award field', async () => {
    assert.deepStrictEqual(await fields(), []); assert.strictEqual(await p.locator('#personWrap button.flagbtn').count(), 0);
  });
  await test('a note on Active and on No photos shows a yellow flag beside each, carrying the child and the level "field"', async () => {
    await p.evaluate(id => { App.addFlag({ kid: id, level: 'field', field: 'Club · Active', note: 'check active' }); App.addFlag({ kid: id, level: 'field', field: 'Club · No photos', note: 'ask about photos' }); }, kid);
    await show(); const f = await fields(); assert.deepStrictEqual(f.sort(), ['Club · Active', 'Club · No photos'], f.join(' | '));
    const r = await p.evaluate(() => [...document.querySelectorAll('button.flagbtn[data-fplace]')].map(b => JSON.parse(b.dataset.fplace))); assert(r.every(x => x.kid === kid && x.level === 'field'));
    assert.strictEqual(await p.locator('#personWrap button.flagbtn.on').count(), 2);
  });
  await test('clicking the yellow flag opens the popup; editing the note saves it to the file', async () => {
    await p.locator('#personWrap button.flagbtn[data-fplace*="Club · Active"]').click(); await p.waitForSelector('.flagpop');
    assert.strictEqual(await p.inputValue('.flagpop textarea'), 'check active'); await p.fill('.flagpop textarea', 'Active is wrong'); await p.click('.flagpop button[data-fsave]'); await p.waitForTimeout(200);
    const saved = await p.evaluate(() => Object.values(App.season.flags).find(f => f.field === 'Club · Active')); assert(saved && saved.note === 'Active is wrong' && saved.kid === kid, 'the edited note is in the file');
  });
  await test('Clear in the popup removes the flag and its yellow mark', async () => {
    await p.locator('#personWrap button.flagbtn[data-fplace*="Club · No photos"]').click(); await p.click('.flagpop button[data-fclear]'); await p.waitForTimeout(300);
    assert.deepStrictEqual(await fields(), ['Club · Active']);
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
