// Report bundles in the real page: the Reports tab lists the bundle, a quarter is chosen (next one by default), one document is built, the lock question is asked once, and Options edits the bundle. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/bundles-browser.test.js
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
  const page = await (await browser.newContext()).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  await tab('reports'); await page.waitForTimeout(500);
  await test('the Reports list has the Quarterly Printables bundle under "Print several at once"', async () => {
    const o = await page.$$eval('#rSel optgroup option', e => e.map(x => x.textContent)); assert.deepStrictEqual(o, ['Quarterly Printables (bundle)', 'Coaches binder (bundle)', 'Class binder (bundle)', 'Club night pack (bundle)']);
  });
  await test('choosing it shows a quarter picker (the next quarter) and builds one document: attendance, class binders, color teams, the coaches binder', async () => {
    await page.selectOption('#rSel', 'bundle:0'); await page.waitForTimeout(500);
    await page.click('#btnReportOptions');
    assert(await page.isVisible('#qWrap'), 'quarter pills'); assert.strictEqual(await page.locator('#bQuarter').count(), 0, 'no separate Quarter to print select'); assert(!(await page.isVisible('#oRoom')), 'no room picker');
    const q = await page.$eval('#qWrap button.on', b => b.dataset.q), next = await page.evaluate(() => Reports.nextQuarter(App.calendar || [], App.today(), 'Q1')); assert.strictEqual(q, next, 'the default is the next quarter: ' + q);
    await page.click('#pgDone');
    const t = await page.textContent('#report'); assert(/Emergency, Medical and Photos/.test(t) && /everyone by name/.test(t), 'binder pages'); assert(new RegExp(q + ' Color Team').test(t), 'attendance sheets for ' + q);
    assert(/Color Teams|Color teams/i.test(t), 'color teams');
  });
  await test('changing the quarter rebuilds it for that quarter', async () => {
    const wideBefore = await page.evaluate(() => document.getElementById('sQuarter').value); await page.click('#btnReportOptions'); await page.click('#qWrap button[data-q="Q3"]'); await page.click('#pgDone'); await page.waitForTimeout(400); assert.strictEqual(await page.$eval('#qWrap button.on', b => b.dataset.q), 'Q3', 'the pill follows'); assert.strictEqual(await page.evaluate(() => document.getElementById('sQuarter').value), wideBefore, 'the app-wide quarter is unchanged'); assert(/Q3 Color Team/.test(await page.textContent('#report')));
  });
  await test('printing an unlocked bundle keeps its selected pages after locking the quarter', async () => {
    await page.click('#btnReportOptions'); await page.locator('#reportPageOptions input[data-pg]').first().uncheck(); await page.click('#pgDone');
    await page.evaluate(() => { window.__printed = 0; }); await page.click('#btnPrint'); await page.waitForTimeout(300);
    if (await page.isVisible('#lockAsk')) { assert(/Lock Q3 now/.test(await page.textContent('#lockAskBody')), 'asks about the chosen quarter'); await page.click('#lockAskLock'); await page.waitForTimeout(200); }
    assert.strictEqual(await page.evaluate(() => window.__printed), 1, 'printed once');
    assert(await page.locator('#report .sheet').first().evaluate(sheet => sheet.classList.contains('skip')), 'keeps the excluded page');
  });
  await test('Options edits the bundle: rename, add a report, move it up, remove it; the Reports list follows; Back to standard restores it', async () => {
    await tab('options'); await page.waitForTimeout(400);
    await page.fill('input[data-bname="0"]', 'Start of quarter'); await page.dispatchEvent('input[data-bname="0"]', 'change'); await page.waitForTimeout(300);
    await page.selectOption('select[data-badd="0"]', 'photos'); await page.waitForTimeout(300);
    assert.strictEqual(await page.$$eval('select[data-bitem^="0:"]', e => e.length), 5, 'five items');
    await page.click('button[data-bmove="0:4:-1"]'); await page.waitForTimeout(250); assert.strictEqual(await page.inputValue('select[data-bitem="0:3"]'), 'photos', 'moved up');
    await page.click('button[data-brem="0:3"]'); await page.waitForTimeout(250); assert.strictEqual(await page.$$eval('select[data-bitem^="0:"]', e => e.length), 4);
    await page.click('#btnDraftApply'); await tab('reports'); await page.waitForTimeout(400); assert.deepStrictEqual(await page.$$eval('#rSel optgroup option', e => e.map(x => x.textContent)), ['Start of quarter (bundle)', 'Coaches binder (bundle)', 'Class binder (bundle)', 'Club night pack (bundle)']);
    await tab('options'); await page.waitForTimeout(300); await page.click('#optBundleReset'); await page.waitForTimeout(300);
    await page.click('#btnDraftApply'); await tab('reports'); await page.waitForTimeout(400); assert.deepStrictEqual(await page.$$eval('#rSel optgroup option', e => e.map(x => x.textContent)), ['Quarterly Printables (bundle)', 'Coaches binder (bundle)', 'Class binder (bundle)', 'Club night pack (bundle)']);
    assert.strictEqual(await page.evaluate(() => App.season.config.bundles), undefined, 'nothing stored once back to standard');
  });
  await test('deleting a book in Options does not touch the bundles and throws no error (the book and bundle delete buttons are different buttons)', async () => {
    await tab('options'); await page.waitForTimeout(300); await page.click('#optBookAdd'); await page.waitForTimeout(250); const added = await page.evaluate(() => App.season.config.books && Object.keys(App.season.config.books).pop()), bn = await page.evaluate(() => (Reports.bundlesOf(App.season) || []).length);
    await page.click('[data-bdel="' + added + '"]'); await page.waitForTimeout(250); assert.strictEqual(await page.evaluate(() => (Reports.bundlesOf(App.season) || []).length), bn, 'the bundles are all still there');
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
