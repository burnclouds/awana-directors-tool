// Reports groups (sub-tabs): Attendance, Binders, Progress Sheets, Other; the progress-sheet tick for class binders; the header stays in view. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/reports-subtabs-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
setTimeout(() => { console.log('timed out'); process.exit(2); }, 120000).unref();
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 700 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => App.showTab('reports')); await page.waitForTimeout(300);
  const shown = () => page.evaluate(() => [...document.querySelectorAll('#rSel option')].filter(o => !o.hidden).map(o => o.value));
  const on = () => page.evaluate(() => document.querySelector('#rSubs button.on').dataset.rsub);
  await test('five groups: Attendance, Color teams, Binders, Progress & awards, Other', async () => {
    assert.deepStrictEqual(await page.$$eval('#rSubs button', b => b.map(x => x.textContent)), ['Attendance', 'Color teams', 'Binders', 'Progress & awards', 'Other']);
  });
  await test('each group lists only its own reports, and every report is in exactly one group', async () => {
    const all = await page.evaluate(() => [...document.querySelectorAll('#rSel option')].map(o => o.value).filter(v => !/^bundle:/.test(v))), seen = [];
    for (const g of ['attend', 'teams', 'binders', 'progress', 'other']) { await page.click('#rSubs button[data-rsub="' + g + '"]'); await page.waitForTimeout(150); const s = (await shown()).filter(v => !/^bundle:/.test(v)); assert(s.length, g + ' has reports'); assert.strictEqual(await on(), g); seen.push(...s); }
    assert.deepStrictEqual(seen.slice().sort(), all.slice().sort(), 'a report is missing or in two groups');
  });
  await test('Print is visible on every group; the Binders button only on Binders', async () => {
    for (const g of ['attend', 'teams', 'binders', 'progress', 'other']) { await page.click('#rSubs button[data-rsub="' + g + '"]'); await page.waitForTimeout(100); assert(await page.isVisible('#btnPrint'), g + ' print'); assert.strictEqual(await page.isVisible('#btnBinders'), g === 'binders', g + ' binders button'); }
  });
  await test('showReport opens a report in its own group (Planning Center changes is in Other)', async () => {
    await page.evaluate(() => App.showReport('pcChanges')); await page.waitForTimeout(200); assert.strictEqual(await on(), 'other');
    await page.evaluate(() => App.showReport('attendance')); await page.waitForTimeout(200); assert.strictEqual(await on(), 'attend');
  });
  await test('the progress-sheet tick in the Print class binders pop-up leaves the progress sheets out of a class binder, and ticking puts them back', async () => {
    await page.click('#rSubs button[data-rsub="binders"]');
    const run = async tick => {
      await page.click('#btnBinders'); await page.waitForTimeout(200); await page.locator('#bindSheets').setChecked(tick);
      await page.locator('input[data-bind="1"]').check(); await page.click('#bindGo'); await page.waitForTimeout(500);
      return page.locator('#report .onepage').count();
    };
    assert.strictEqual(await run(false), 0, 'no progress sheets when unticked');
    await page.click('#rSubs button[data-rsub="binders"]'); assert((await run(true)) > 0, 'progress sheets when ticked');
  });
  await test('the report header (groups, Print) stays at the top while the report scrolls', async () => {
    await page.evaluate(() => App.showReport('attendance')); await page.waitForTimeout(300);
    const before = await page.evaluate(() => document.querySelector('#tab-reports > .rhead').getBoundingClientRect().top);
    await page.evaluate(() => { const r = document.getElementById('report'); r.lastElementChild.scrollIntoView({ block: 'end' }); }); await page.waitForTimeout(300);
    const y = await page.evaluate(() => document.querySelector('#tab-reports > .rhead').getBoundingClientRect().top), pb = await page.locator('#btnPrint').boundingBox();
    assert(y >= -1 && y < before, 'the header moved up to the top and stayed: ' + before + ' -> ' + y);
    assert(pb && pb.y >= 0 && pb.y < 700, 'Print is in view: ' + (pb && pb.y));
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
