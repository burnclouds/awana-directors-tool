// The Print class binders pop-up: a quick pick (the saved bundles), the pages in each binder, the classes. Show binders makes "Your binders" the selected report.
// Invented test club only (dev/test-data).
// Usage: NODE_PATH=<dir with playwright> node test/binders-dialog-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
setTimeout(() => { console.log('timed out'); process.exit(2); }, 170000).unref();
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => document.querySelector('.tabs button[data-tab="reports"]').click()); await page.waitForTimeout(200);
  await page.click('#rSubs button[data-rsub="binders"]'); await page.click('#btnBinders'); await page.waitForTimeout(200);      // the Binders button is on the Binders group
  await test('the pop-up has a quick pick, the pages in each binder, and one box per class that has children (from the roster) with Select all / Select none', async () => {
    assert.deepStrictEqual(await page.$$eval('#bindQuick option', o => o.map(x => x.textContent)), ['Quarterly Printables', 'Coaches binder', 'Class binder', 'Custom: the pages I tick below']);
    assert.strictEqual(await page.inputValue('#bindQuick'), '2', 'it opens on the Class binder'); assert.strictEqual(await page.locator('#dlg input[data-part]').count(), 8);
    const classes = await page.$$eval('#dlg input[data-bind]', l => l.map(x => x.dataset.room)); assert.strictEqual(classes.length, 10); assert.deepStrictEqual(classes.slice(0, 3), ['Puggles', 'Cubbies', 'Sparks A']);
    assert.deepStrictEqual(await page.$$eval('#dlg input[data-part]:checked', l => l.map(x => x.dataset.part)), ['attendance', 'binderClass', 'volunteers', 'progressSheets'], 'the Class binder pages are ticked');
    assert.strictEqual(await page.locator('#dlg input[data-bind="coaches"]').count(), 0, 'the Coaches binder is a quick pick now, not a class box');
  });
  await test('choosing a quick pick ticks its pages; changing a page makes it Custom', async () => {
    await page.selectOption('#bindQuick', { label: 'Coaches binder' });
    assert.deepStrictEqual(await page.$$eval('#dlg input[data-part]:checked', l => l.map(x => x.dataset.part)), ['binderClass', 'volunteers', 'binderAll', 'binderTeams', 'noteSheets']);
    await page.uncheck('#dlg input[data-part="volunteers"]'); assert.strictEqual(await page.inputValue('#bindQuick'), '', 'now Custom');
  });
  await test('the Class binder needs a class: Show binders with none ticked stays open and nothing is shown', async () => {
    await page.selectOption('#bindQuick', { label: 'Class binder' }); await page.click('#bindNone'); await page.click('#bindGo'); await page.waitForTimeout(300);
    assert(await page.isVisible('#dlg'), 'the pop-up is still open (the app asked for a class, and the test harness answered it)'); assert.notStrictEqual(await page.inputValue('#rSel'), 'bundle:picked', 'nothing was shown');
  });
  await test('Show binders with the Class binder for Sparks A makes "Your binders" the selected report, drawn with the bundle quarter and with no other class', async () => {
    await page.click('#bindNone'); await page.check('#dlg input[data-room="Sparks A"]'); await page.click('#bindGo'); await page.waitForTimeout(500);
    assert(await page.isVisible('#tab-reports'), 'on the Reports tab'); assert.strictEqual(await page.inputValue('#rSel'), 'bundle:picked'); assert(/Last made in Print class binders: Class binder: Sparks A/.test(await page.$eval('#rSel option:checked', o => o.textContent)));
    assert(await page.isVisible('#qWrap') && await page.locator('#qWrap button.on').count() === 1, 'the Quarter pills show the quarter to print'); assert(/Class binder: Sparks A/.test(await page.textContent('#bNote')), 'the note names the binders');
    const h2 = await page.$$eval('#report .sheet h2', h => h.map(x => x.textContent)); assert(h2.some(t => /Sparks A/.test(t)) && !h2.some(t => /Cubbies|Puggles|Sparks B/.test(t)), 'only Sparks A: ' + h2.join(' | '));
    assert(/Volunteer Contact List/.test(await page.textContent('#report')), 'the volunteer list is there'); assert((await page.locator('#report .onepage').count()) > 0, 'with its progress sheets');
  });
  await test('Coaches binder: no classes needed, the whole club once', async () => {
    await page.click('#btnBinders'); await page.waitForTimeout(150); await page.selectOption('#bindQuick', { label: 'Coaches binder' }); await page.click('#bindNone'); await page.click('#bindGo'); await page.waitForTimeout(500);
    const text = await page.textContent('#report'); assert(/by name|Emergency, Medical and Photos/.test(text), 'the coaches roster'); assert(/Volunteer Contact List/.test(text)); assert.strictEqual(await page.inputValue('#rSel'), 'bundle:picked');
  });
  await test('the picked binders can be changed: the button reopens the pop-up with the last choice', async () => {
    await page.click('#btnBinders'); await page.waitForTimeout(150); assert.strictEqual(await page.inputValue('#bindQuick'), '1', 'Coaches binder'); await page.keyboard.press('Escape');
  });
  await test('closing the pop-up leaves nothing on the shared dialog: a later dialog with an input does not throw', async () => {
    await page.click('#btnBinders'); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    const before = errs.length; await page.evaluate(() => { const dl = document.getElementById('dlg'); dl.innerHTML = '<label>Name <input id="zz" type="text"></label>'; dl.showModal(); }); await page.fill('#zz', 'x'); await page.press('#zz', 'Tab'); await page.waitForTimeout(100);
    await page.evaluate(() => document.getElementById('dlg').close()); assert.strictEqual(errs.length, before, 'page errors: ' + errs.slice(before).join(' | '));
  });
  await test('Coaches binder (team pages) asks about locking an unlocked quarter before printing; picking a Quarter pill does not change the app-wide quarter', async () => {
    const wide = await page.evaluate(() => ({ s: document.getElementById('sQuarter').value, f: document.getElementById('fQuarter').value }));
    await page.click('#btnBinders'); await page.waitForTimeout(150); await page.selectOption('#bindQuick', { label: 'Coaches binder' }); await page.click('#bindNone'); await page.click('#bindGo'); await page.waitForTimeout(500);
    const q = await page.$eval('#qWrap button.on', b => b.dataset.q), other = ['Q1', 'Q2', 'Q3', 'Q4'].find(x => x !== q); await page.click('#qWrap button[data-q="' + other + '"]'); await page.waitForTimeout(300);
    assert.deepStrictEqual(await page.evaluate(() => ({ s: document.getElementById('sQuarter').value, f: document.getElementById('fQuarter').value })), wide, 'the app-wide quarter is unchanged');
    const state = await page.evaluate(oq => TeamPlan.stateOf(App.season, App.calendar, oq, App.today()), other);
    await page.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; document.getElementById('btnPrint').click(); }); await page.waitForTimeout(250);
    if (state !== 'locked') assert(await page.isVisible('#lockAsk'), 'the lock question appears for ' + other + ' (' + state + ')'); else assert.strictEqual(await page.evaluate(() => window.__printed || 0), 1, 'a locked quarter prints at once');
    await page.evaluate(() => { const b = document.getElementById('lockAskCancel'); if (b) b.click(); });
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
