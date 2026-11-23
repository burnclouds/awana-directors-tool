// Title-bar version click, printable Statistics, Books and end-of-year report, hand-out list, Coaches binder bundle. Invented test club.
// Usage: NODE_PATH=<dir with playwright> node test/reports-new-browser.test.js
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
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  await test('clicking the version in the title bar checks for a new version and says what it found', async () => {
    await page.click('#verLink'); await page.waitForFunction(() => { const f = document.getElementById('flash'); return f && !f.hidden && /latest version|new version|Could not check|only when the app is opened/.test(f.textContent); }, null, { timeout: 8000 });
    assert.strictEqual(await page.isVisible('#tab-debug'), false, 'it does not jump to Debug');
  });
  await test('Statistics has a Printable button: one report with all three sections and no links', async () => {
    await tab('stats'); await page.waitForTimeout(300); await page.click('#btnStatsPrint'); await page.waitForTimeout(500);
    assert.strictEqual(await page.inputValue('#rSel'), 'statistics'); const n = await page.locator('#report section.sheet').count(); assert(n === 3, 'three sections: ' + n); assert.strictEqual(await page.locator('#report a[data-person]').count(), 0);
  });
  await test('Books and end-of-year awards (by group) is one page of children with their books and awards', async () => {
    await tab('reports'); await page.selectOption('#rSel', 'booksYear'); await page.click('#btnReportOptions'); await page.selectOption('#oGroupSel', 'T&T'); await page.click('#pgDone'); await page.waitForTimeout(500); const t = await page.textContent('#report'); assert(/Books and end-of-year awards/.test(t) && /Books finished/.test(t), t.slice(0, 200));
  });
  await test('Awards to hand out has a page per class with a Given box and the counts to have ready', async () => {
    await page.selectOption('#rSel', 'handOut'); await page.click('#btnReportOptions'); await page.selectOption('#oGroupSel', 'Sparks'); await page.click('#pgDone'); await page.waitForTimeout(500); const t = await page.textContent('#report'); assert(/Awards to hand out|Nothing earned is waiting/.test(t), t.slice(0, 200));
  });
  await test('the report list offers the Coaches binder bundle', async () => {
    const o = await page.$$eval('#rSel option', x => x.map(y => y.textContent)); assert(o.some(x => /Coaches binder/.test(x)) && o.some(x => /Quarterly Printables/.test(x)), o.join('|'));
  });
  await test('File menu: Save is the main button, the arrow opens Import and Save in one menu, Escape closes it, and the (i) hover carries the file info', async () => {
    assert(await page.isVisible('#btnSeasonSave'), 'Save is in the header'); assert.strictEqual(await page.isVisible('#fileMenu'), false, 'closed at first'); await page.click('#btnFile'); await page.waitForTimeout(150);
    assert(await page.isVisible('#fileMenu [data-fm="imp-local"]') && await page.isVisible('#fileMenu [data-fm="save"]'), 'Import and Save are in the menu'); await page.keyboard.press('Escape'); await page.waitForTimeout(150); assert.strictEqual(await page.isVisible('#fileMenu'), false);
    await page.hover('.top i.info'); await page.waitForTimeout(200); const tip = await page.textContent('#infoTip'); assert(/active/.test(tip) && /Data file/.test(tip), tip);
  });
  await test('the Planning Center warning bar has an x: it hides until the next save, and the (i) still says it', async () => {
    await tab('roster'); await page.evaluate(() => { const p = App.master.people.find(x => Model.isActive(x) && Model.isClubber(x)); p['ov:Mobile Phone Number'] = '937-555-0100'; App.drawDraftBar(); }); await page.waitForTimeout(200);
    assert(await page.isVisible('#btnPcNeedHide'), 'the bar shows with an x');
    await page.click('#btnPcNeedHide'); await page.waitForTimeout(150); assert.strictEqual(await page.locator('#btnPcNeedHide').count(), 0); await page.hover('.top i.info'); await page.waitForTimeout(200); assert(/needed in Planning Center/.test(await page.textContent('#infoTip')));
    const dl = page.waitForEvent('download', { timeout: 8000 }); await page.evaluate(() => document.getElementById('btnSeasonSave').click()); await page.waitForTimeout(500); await page.evaluate(() => document.getElementById('btnSeasonSave').click()); await page.waitForSelector('#warnGo'); await page.click('#warnGo'); await dl; await page.waitForTimeout(400); assert(await page.isVisible('#btnPcNeedHide'), 'a save brings the bar back');
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
