// B3: the Binders button sets the paper from the first sheet (like every other report) and refreshes the page-pick row.
// Before the fix the paper stayed as the last report shown (attendance prints landscape, so Binders after a landscape report printed on the wrong paper, or the reverse).
// Invented test club only (dev/test-data).
// Usage: NODE_PATH=<dir with playwright> node test/binders-paper-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
setTimeout(() => { console.log('timed out'); process.exit(2); }, 170000).unref();
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const pageCss = () => page.$eval('#pageStyle', e => e.textContent).catch(() => '');
  const showReport = async id => { await page.evaluate(r => App.showReport(r), id); await page.waitForFunction(() => document.querySelectorAll('#report .sheet').length > 0); };
  const openBinders = async (quick, classes = []) => {      // quick: the quick pick's name; classes: indexes of the class boxes to tick (none = the whole club)
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="reports"]').click()); await page.waitForTimeout(200);
    await page.click('#rSubs button[data-rsub="binders"]'); await page.click('#btnReportOptions'); await page.click('#btnBinders'); await page.waitForTimeout(200);
    await page.selectOption('#bindQuick', { label: quick }); await page.click('#bindNone');
    for (const t of classes) await page.check('#dlg input[data-bind="' + t + '"]');
    await page.click('#bindGo'); await page.waitForTimeout(400);
  };
  const firstOrient = () => page.evaluate(() => { const s = document.querySelector('#report .sheet'); return s ? (s.classList.contains('landscape') ? 'landscape' : 'portrait') : ''; });
  await test('coaches binder: the page style follows the first sheet and the page-pick row exists', async () => {
    await showReport('attendance');
    const before = await pageCss(); assert(/@page \{ size: landscape/.test(before), 'precondition: attendance set landscape paper');
    await openBinders('Coaches binder');
    const first = await firstOrient(); assert(first, 'no sheets in #report');
    assert(new RegExp('@page \\{ size: ' + first + ';').test(await pageCss()), 'first sheet is ' + first + ' but #pageStyle says: ' + (await pageCss()).slice(0, 60));
    const sheets = await page.locator('#report .sheet').count(); assert(sheets >= 2, 'coaches binder should be several sheets');
    assert(await page.locator('#pageSum').isVisible(), 'the page-pick row is hidden');
    await page.click('#btnReportOptions'); assert(await page.locator('#reportPageOptions input[data-pg]').count() > 1); await page.click('#pgDone'); assert.strictEqual((await page.textContent('#pageSum')).trim(), 'Pages to print: all ' + sheets, 'the count stays');
  });
  await test('coming from a portrait report, a class binder (landscape attendance first) says landscape', async () => {
    await showReport('teams');
    assert(/@page \{ size: portrait/.test(await pageCss()), 'precondition: the color teams report set portrait paper');
    await openBinders('Class binder', ['2']);      // Sparks A: attendance is its first sheet
    assert.strictEqual(await firstOrient(), 'landscape', 'the first sheet should be the landscape attendance sheet');
    assert(/@page \{ size: landscape/.test(await pageCss()), '#pageStyle did not follow: ' + (await pageCss()).slice(0, 60));
    assert(await page.locator('#pageSum').isVisible(), 'the page-pick row is hidden');
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
