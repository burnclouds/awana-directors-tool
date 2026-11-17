// Reports clean-up (RP1 to RP4): one (i) in the Reports bar; a long run of pages is chosen in a "Choose pages" pop-up (names, Select all, Select none); Puggles have no progress sheets; the progress-sheet tick is in the Print class binders pop-up. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/reports-cleanup-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
setTimeout(() => { console.log('timed out'); process.exit(2); }, 150000).unref();
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 800 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => App.showTab('reports')); await page.waitForTimeout(300);
  const infos = () => page.evaluate(() => [...document.querySelectorAll('#tab-reports .rhead i.info, #tab-reports #dateBar i.info, #tab-reports .bar i.info')].filter(e => e.offsetParent !== null).length);
  await test('RP1: one (i) in the Reports bars, on every group, and its note covers printing, the quarter, pages and where contact data comes from', async () => {
    for (const r of ['attendance', 'binderClass', 'progressSheets', 'teams']) { await page.evaluate(x => App.showReport(x), r); await page.waitForTimeout(200); assert.strictEqual(await infos(), 1, r + ': ' + await infos() + ' info buttons'); }
    await page.evaluate(() => App.showReport('attendance')); await page.waitForTimeout(150);
    const txt = await page.evaluate(() => Info.get('reports.print').html.replace(/<[^>]+>/g, ' ')); for (const w of ['Printing', 'Quarter and title', 'Pages to print', 'Emergency contacts']) assert(txt.includes(w), w);
    assert(await page.evaluate(() => !Info.get('reports.quarter') && !Info.get('reports.emergency')), 'the two old notes are folded in');
  });
  await test('RP2: many pages (progress sheets for everyone) show a summary and a Choose pages button, not a tick for each child', async () => {
    await page.evaluate(() => App.showReport('progressSheets')); await page.waitForTimeout(500);
    const n = await page.locator('#report .onepage').count(); assert(n > 12, 'precondition: ' + n + ' sheets');
    assert(await page.isVisible('#btnChoosePages')); assert.strictEqual(await page.locator('#pagePick input[type=checkbox]').count(), 0, 'no inline ticks');
    assert.strictEqual((await page.textContent('#pageSum')).trim(), 'Pages to print: all ' + n);
  });
  await test('RP2: the pop-up lists one name per page; Select none, Select all and a single tick act on the printed pages and the summary', async () => {
    const n = await page.locator('#report .onepage').count(); await page.click('#btnChoosePages');
    assert.strictEqual(await page.locator('#dlg input[data-pg]').count(), n, 'one tick per page'); assert(/—|[A-Za-z]/.test(await page.locator('#dlg .pglist label').first().textContent()), 'a name');
    await page.click('#pgNone'); assert.strictEqual(await page.locator('#dlg input[data-pg]:checked').count(), 0); assert(/^0 of /.test((await page.textContent('#pgCount')).trim()), await page.textContent('#pgCount'));
    assert(await page.evaluate(() => [...document.querySelectorAll('#report .sheet')].every(s => s.classList.contains('skip'))), 'every page is left out');
    await page.click('#pgAll'); assert(await page.evaluate(() => [...document.querySelectorAll('#report .sheet')].every(s => !s.classList.contains('skip'))), 'every page is back');
    await page.locator('#dlg input[data-pg]').nth(2).uncheck(); assert.strictEqual((await page.textContent('#pgCount')).trim(), (n - 1) + ' of ' + n + ' selected');
    await page.click('#pgDone'); assert.strictEqual((await page.textContent('#pageSum')).trim(), 'Pages to print: ' + (n - 1) + ' of ' + n); assert(!(await page.isVisible('#dlg')), 'the pop-up closes');
  });
  await test('RP2: a short run of pages (an attendance sheet per room) keeps the inline ticks', async () => {
    await page.evaluate(() => App.showReport('attendance')); await page.waitForTimeout(400);
    const n = await page.locator('#report .sheet').count(); assert(n > 1 && n <= 12, 'precondition: ' + n); assert.strictEqual(await page.locator('#pagePick input[type=checkbox]').count(), n); assert(!(await page.locator('#btnChoosePages').count()));
  });
  await test('RP3: Puggles are not in the Class list of Progress Sheets (they are on Attendance), and a Puggles binder has no progress sheet', async () => {
    const rooms = async r => { await page.evaluate(x => App.showReport(x), r); await page.waitForTimeout(250); return page.$$eval('#oRoomSel option', o => o.map(x => x.textContent)); };
    assert((await rooms('attendance')).includes('Puggles'), 'precondition: Puggles are a room'); assert(!(await rooms('progressSheets')).includes('Puggles'), 'not on Progress Sheets');
    await page.click('#rSubs button[data-rsub="binders"]'); await page.click('#btnBinders'); await page.waitForTimeout(200);
    const idx = await page.evaluate(() => [...document.querySelectorAll('#dlg input[data-bind]')].findIndex(i => i.parentElement.textContent.includes('Puggles')));
    await page.locator('#dlg input[data-bind="' + idx + '"]').check(); assert(await page.locator('#bindSheets').isChecked(), 'progress sheets are ticked'); await page.click('#bindGo'); await page.waitForTimeout(500);
    assert.strictEqual(await page.locator('#report .onepage').count(), 0, 'no progress sheet'); assert(await page.locator('#report .sheet').count() >= 2, 'but the attendance sheet and roster are there');
  });
  await test('RP4: the progress-sheet tick is in the Print class binders pop-up (not on the bar), it is ticked at first, and unticking it leaves the sheets out', async () => {
    assert.strictEqual(await page.locator('#bSheets').count(), 0, 'no tick on the bar'); assert.strictEqual(await page.locator('#bSheetsWrap').count(), 0);
    await page.click('#btnBinders'); await page.waitForTimeout(200); assert(await page.locator('#bindSheets').isVisible() && await page.locator('#bindSheets').isChecked());
    await page.locator('#dlg input[data-bind="1"]').check(); await page.click('#bindGo'); await page.waitForTimeout(500); const withSheets = await page.locator('#report .onepage').count(); assert(withSheets > 0, 'sheets with the tick');
    await page.click('#btnBinders'); await page.waitForTimeout(200); await page.locator('#bindSheets').uncheck(); await page.locator('#dlg input[data-bind="1"]').check(); await page.click('#bindGo'); await page.waitForTimeout(500); assert.strictEqual(await page.locator('#report .onepage').count(), 0, 'none without it');
    await page.click('#btnBinders'); await page.waitForTimeout(200); assert(!(await page.locator('#bindSheets').isChecked()), 'the choice is remembered for the visit'); await page.keyboard.press('Escape');
  });
  await test('Print class binders pop-up: Select all and Select none act on the binders only; the progress-sheet option is a separate, labelled box and is not changed by them', async () => {
    await page.click('#btnBinders'); await page.waitForTimeout(200); const n = await page.locator('#dlg input[data-bind]').count(); assert(n >= 10, 'binders listed: ' + n);
    assert.strictEqual(await page.locator('#dlg fieldset.bindpick #bindSheets').count(), 0, 'the option is not inside the binder list'); assert.strictEqual(await page.locator('#dlg fieldset.bindopt #bindSheets').count(), 1);
    assert(/Binders to print/.test(await page.textContent('#dlg fieldset.bindpick legend')) && /Option/.test(await page.textContent('#dlg fieldset.bindopt legend')) && /not a binder/.test(await page.textContent('#dlg fieldset.bindopt legend')), 'legends say which is which');
    const sheets = await page.locator('#bindSheets').isChecked(); assert.strictEqual((await page.textContent('#bindCount')).trim(), '0 of ' + n + ' selected');
    await page.click('#bindAll'); assert.strictEqual(await page.locator('#dlg input[data-bind]:checked').count(), n, 'all, the coaches binder too'); assert.strictEqual((await page.textContent('#bindCount')).trim(), n + ' of ' + n + ' selected'); assert.strictEqual(await page.locator('#bindSheets').isChecked(), sheets, 'the option is untouched');
    await page.click('#bindNone'); assert.strictEqual(await page.locator('#dlg input[data-bind]:checked').count(), 0); assert.strictEqual(await page.locator('#bindSheets').isChecked(), sheets, 'still untouched');
    await page.locator('#dlg input[data-bind="0"]').check(); assert.strictEqual((await page.textContent('#bindCount')).trim(), '1 of ' + n + ' selected'); await page.keyboard.press('Escape');
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
