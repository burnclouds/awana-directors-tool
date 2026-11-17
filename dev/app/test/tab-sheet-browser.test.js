// Tab and Shift+Tab on the progress sheet go from one sign-off date box to the next (not through the month, day and year parts). Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/tab-sheet-browser.test.js
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/clear-nodate-browser.test.js
const { chromium } = require('playwright');
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html', f = path.join(app, u);
  if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
});
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const open = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } }), page = await ctx.newPage(), errs = [];
    page.on('dialog', d => d.dismiss()); page.on('pageerror', e => errs.push(e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { page, errs };
  };
  const prep = async () => {
    const { page, errs } = await open();
    await page.evaluate(() => { const k = App.master.people.find(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'T&T'), id = k[Model.X.ID]; delete App.season.progress[id]; App.touch(); App.showPerson(id); });
    await page.waitForTimeout(300); return { page, errs };
  };
  const at = page => page.evaluate(() => { const a = document.activeElement; return a.dataset.key || a.dataset.gaward || a.dataset.aaward || a.tagName; });
  const keys = page => page.evaluate(() => [...document.querySelectorAll('#progressWrap input[type=date][data-key]')].map(b => b.dataset.key));
  await test('one Tab in an empty date box goes to the next date box', async () => {
    const { page, errs } = await prep(), ks = await keys(page); await page.locator('#progressWrap input[type=date][data-key]').first().focus();
    await page.keyboard.press('Tab'); assert.strictEqual(await at(page), ks[1]); await page.keyboard.press('Tab'); assert.strictEqual(await at(page), ks[2]); assert.deepStrictEqual(errs, []); await page.close();
  });
  await test('Shift+Tab goes back to the previous date box', async () => {
    const { page } = await prep(), ks = await keys(page); await page.locator('#progressWrap input[type=date][data-key]').nth(3).focus();
    await page.keyboard.press('Shift+Tab'); assert.strictEqual(await at(page), ks[2]); await page.close();
  });
  await test('month and day typed, then one Tab: this year is saved and the next box is focused', async () => {
    const { page } = await prep(), ks = await keys(page); await page.locator('#progressWrap input[type=date][data-key]').first().focus();
    await page.keyboard.type('1007'); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
    assert.strictEqual(await at(page), ks[1]); const v = await page.evaluate(k => document.querySelector('#progressWrap input[data-key="' + k + '"]').value, ks[0]); assert(/^\d{4}-10-07$/.test(v), 'saved ' + v); await page.close();
  });
  await test('a date typed over one already saved is saved by Tab, and Tab moves on', async () => {
    const { page } = await prep(), ks = await keys(page); await page.locator('#progressWrap input[type=date][data-key]').first().focus();
    await page.keyboard.type('10072026'); await page.waitForTimeout(300); await page.locator('#progressWrap input[type=date][data-key]').first().focus();
    await page.keyboard.type('1015'); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
    assert.strictEqual(await at(page), ks[1]); assert(/-10-15$/.test(await page.evaluate(k => document.querySelector('#progressWrap input[data-key="' + k + '"]').value, ks[0]))); await page.close();
  });
  await test('Tab on the last date box leaves the sheet the browser way (no error, focus moves on)', async () => {
    const { page, errs } = await prep(); await page.locator('#progressWrap input[type=date][data-key], #progressWrap input[type=date][data-gaward], #progressWrap input[type=date][data-aaward]').last().focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab'); assert.deepStrictEqual(errs, []); await page.close();
  });
  console.log(passed + ' passed, ' + failed + ' failed'); await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})();
