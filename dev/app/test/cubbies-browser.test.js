// Cubbies on the Progress tab (invented test club): the group, the 8 or 28 boxes, the emblems that are earned, and the Options switch.
// Usage: NODE_PATH=<dir with playwright> node test/cubbies-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  // Options (like Roster, Calendar and Color teams) holds a change as an unapplied draft, and the app asks before you leave the tab: the test presses Apply first, as a leader would.
  const tab = async t => { const ok = await page.$('dialog[open] button'); if (ok) { await ok.click(); await page.waitForTimeout(150); }      // the app's own "Please note" dialog (a refused change) stays open until OK is pressed
    if (await page.isVisible('#btnDraftApply')) { await page.click('#btnDraftApply'); await page.waitForTimeout(200); } await page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t); };
  await tab('person'); await page.waitForTimeout(300); await page.selectOption('#peGroup', 'Cubbies'); await page.waitForTimeout(400);
  await test('Progress has a Cubbies group: Apple Acres, the Trail and six units, one box each by default, with both books as tabs', async () => {
    const t = await page.textContent('#progressWrap'); assert(/Apple Acres/.test(t) && /Trail/.test(t) && /Unit 6/.test(t), t.slice(0, 200)); assert.strictEqual(await page.locator('#progressWrap input[type="date"][data-key]').count(), 8);
    const tabs = await page.$$eval('.booktabs button', b => b.map(x => x.textContent.trim())); assert(tabs.some(x => /Appleseed/i.test(x)) && tabs.some(x => /HoneyComb/i.test(x)), tabs.join('|'));
  });
  await test('dating the Trail earns the Trail Emblem and dating Unit 1 earns the Green Apple Emblem, shown on the sheet and waiting on the Awards page', async () => {
    await page.fill('#progressWrap input[data-key="TR.1"]', '2026-11-04'); await page.press('#progressWrap input[data-key="TR.1"]', 'Enter'); await page.waitForTimeout(300); await page.fill('#progressWrap input[data-key="U1.1"]', '2026-11-04'); await page.press('#progressWrap input[data-key="U1.1"]', 'Enter'); await page.waitForTimeout(300);
    const t = await page.textContent('#progressWrap'); assert(/Trail Emblem/.test(t) && /Unit 1 Green Apple Emblem/.test(t), t.slice(0, 400));
    await tab('awards'); await page.waitForTimeout(500); await page.click('#awSubs button[data-awsub="hand"]'); await page.waitForTimeout(250); const h = await page.textContent('#awSecHand'); assert(/Trail Emblem/.test(h) && /Green Apple Emblem/.test(h), h.slice(0, 300));
    const opts = await page.$$eval('#awType option', o => o.map(x => x.textContent)); assert(opts.some(x => /Trail Emblem/.test(x)) && opts.some(x => /Green Apple Emblem/.test(x)), opts.join('|'));
  });
  await test('Options: one box per Bear Hug makes 28 boxes and keeps the dates; one per unit is refused while a unit is partly done, and works when it is not', async () => {
    await tab('options'); await page.waitForTimeout(400); await page.check('input[name="optCubbies"][value="section"]'); await page.waitForTimeout(300);
    await tab('person'); await page.waitForTimeout(300); assert.strictEqual(await page.locator('#progressWrap input[type="date"][data-key]').count(), 28);
    assert.strictEqual(await page.inputValue('#progressWrap input[data-key="TR.2"]'), '2026-11-04', 'the Trail date carried to both Bear Hugs');
    await page.fill('#progressWrap input[data-key="U2.7"]', '2026-11-11'); await page.press('#progressWrap input[data-key="U2.7"]', 'Enter'); await page.waitForTimeout(250); await tab('options'); await page.waitForTimeout(300); await page.click('input[name="optCubbies"][value="unit"]'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => App.season.config.cubbiesDetail), 'section', 'refused: still one per Bear Hug');
    await tab('person'); await page.waitForTimeout(250); await page.fill('#progressWrap input[data-key="U2.7"]', ''); await page.press('#progressWrap input[data-key="U2.7"]', 'Enter'); await page.waitForTimeout(250); await tab('options'); await page.waitForTimeout(300); await page.click('input[name="optCubbies"][value="unit"]'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => App.season.config.cubbiesDetail), undefined);
  });
  await test('a Cubbies child has a Print this record button that opens the Progress sheets (every book) for the Cubbies child', async () => {
    await tab('person'); await page.waitForTimeout(300); await page.selectOption('#peGroup', 'Cubbies'); await page.waitForTimeout(400);
    assert.strictEqual(await page.locator('#btnPrPrint').count(), 1, 'print button present for Cubbies');
    await page.evaluate(() => { window.__sr = null; const o = App.showReport; App.showReport = function (id) { window.__sr = { id, opts: JSON.parse(JSON.stringify(App.reportOptions ? (App.ropts || {}) : {})) }; return o.apply(this, arguments); }; });
    await page.click('#btnPrPrint'); await page.waitForTimeout(500);
    const sr = await page.evaluate(() => window.__sr); assert(sr && sr.id === 'progressSheets', JSON.stringify(sr));      // N57: Print record opens Progress sheets with every book
    assert.strictEqual(await page.inputValue('#oBooksSel'), 'all'); const txt = await page.evaluate(() => document.body.innerText); assert(/Cubbies \u00b7 2026-27/.test(txt), 'report shows the Cubbies record');
  });
  await test('no script errors',() => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
