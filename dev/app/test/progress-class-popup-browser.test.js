// N4: Progress sheets open on one class; All classes (and a class binder with many sheets) draws behind a "Drawing N progress sheets" pop-up. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/progress-class-popup-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
setTimeout(() => { console.log('timed out'); process.exit(2); }, 200000).unref();
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.addInitScript(() => { window.__busyShows = 0; const s = HTMLDialogElement.prototype.showModal; HTMLDialogElement.prototype.showModal = function () { if (this.id === 'busy') window.__busyShows++; return s.apply(this, arguments); }; });
  await page.goto('http://localhost:' + server.address().port + '/index.html'); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => document.querySelector('.tabs button[data-tab="reports"]').click()); await page.waitForTimeout(200);
  const idle = () => page.waitForFunction(() => !document.getElementById('busy').open); const sheets = () => page.locator('#report .onepage').count();
  const total = await page.evaluate(() => ['Cubbies', 'Sparks', 'T&T'].length && Reports.kids(App.master).filter(p => ['Cubbies', 'Sparks', 'T&T'].includes(Model.groupOf(Model.room(p)))).length);
  const kidsIn = room => page.evaluate(r => Reports.kids(App.master).filter(p => Model.room(p) === r).length, room);

  await test('N4-1/3: opens on the first class (Cubbies), with no pop-up, and the note says what is shown', async () => {
    await page.evaluate(() => App.showReport('attendance')); await page.waitForTimeout(300); const before = await page.evaluate(() => window.__busyShows);
    await page.evaluate(() => App.showReport('progressSheets')); await page.waitForSelector('#report .onepage'); await page.waitForTimeout(200);
    assert.strictEqual(await page.inputValue('#oRoomSel'), 'Cubbies'); assert.strictEqual(await sheets(), await kidsIn('Cubbies'));
    assert.strictEqual(await page.evaluate(() => window.__busyShows), before, 'no pop-up for one class');
    const note = await page.textContent('#bNote'); assert(note === 'Cubbies', note);
    assert.strictEqual((await page.textContent('#pageSum')).trim(), 'Pages to print: all ' + await kidsIn('Cubbies'));
  });
  await test('N4-2: another class draws just that class', async () => {
    await page.click('#btnReportOptions'); await page.selectOption('#oRoomSel', 'Sparks A'); await page.click('#pgDone'); await idle(); await page.waitForTimeout(200);
    assert.strictEqual(await sheets(), await kidsIn('Sparks A')); assert(/Sparks A/.test(await page.textContent('#bNote')));
  });
  await test('N4-4/5/6: All classes opens the pop-up (old report stays under it), then everyone is drawn and the pop-up goes', async () => {
    const r = await page.evaluate(() => { const s = document.getElementById('oRoomSel'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); const b = document.getElementById('busy'); return { open: b.open, modal: b.matches(':modal'), text: b.textContent, old: document.querySelectorAll('#report .onepage').length, inline: !!document.getElementById('drawing') }; });
    assert(r.open && r.modal && new RegExp('Drawing ' + total + ' progress sheets').test(r.text), JSON.stringify(r)); assert(r.old > 0 && r.old < total, 'old report still shown: ' + r.old); assert(!r.inline);
    await idle(); await page.waitForTimeout(200); assert.strictEqual(await sheets(), total); assert.strictEqual((await page.textContent('#pageSum')).trim(), 'Pages to print: all ' + total);
  });
  await test('N4-7: Esc (a cancel event) does not close the pop-up', async () => {
    await page.evaluate(() => { const s = document.getElementById('oRoomSel'); s.value = 'Cubbies'; s.dispatchEvent(new Event('change', { bubbles: true })); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); });
    const r = await page.evaluate(() => { const b = document.getElementById('busy'), ev = new Event('cancel', { cancelable: true }); b.dispatchEvent(ev); return { prevented: ev.defaultPrevented, open: b.open }; });
    assert(r.prevented, 'cancel prevented'); await idle();
  });
  await test('N4-11: Choose pages works on the full list', async () => {
    await page.click('#btnReportOptions'); await page.waitForSelector('#reportOptions[open]'); assert.strictEqual(await page.locator('#reportOptions input[data-pg]').count() >= total, true);
    await page.click('#reportOptions button:text-is("Select none")'); await page.locator('#reportOptions input[data-pg]').nth(0).check(); await page.click('#reportOptions button:text-is("Done")');
    assert.strictEqual((await page.textContent('#pageSum')).trim(), 'Pages to print: 1 of ' + total);
  });
  await test('N4-10: the Class binder with All classes draws behind the pop-up; one class does not', async () => {
    await page.evaluate(() => App.showReport('attendance')); const label = await page.$$eval('#rSel option', o => o.find(x => /Class binder/.test(x.textContent)).value);
    await page.selectOption('#rSel', label); await idle(); await page.waitForTimeout(300);
    const before = await page.evaluate(() => window.__busyShows); await page.click('#btnReportOptions'); await page.selectOption('#oRoomSel', ''); await page.click('#pgDone'); await idle(); await page.waitForTimeout(200);
    assert.strictEqual(await page.evaluate(() => window.__busyShows), before + 1, 'pop-up for the whole club'); assert.strictEqual(await sheets(), total);
    await page.click('#btnReportOptions'); await page.selectOption('#oRoomSel', 'Sparks C'); await page.click('#pgDone'); await idle(); await page.waitForTimeout(200); assert.strictEqual(await page.evaluate(() => window.__busyShows), before + 1, 'none for one class'); assert.strictEqual(await sheets(), await kidsIn('Sparks C'));
  });
  await test('N4-13/14: reportOptions keeps its meaning; the choice survives a trip to another report', async () => {
    await page.evaluate(() => App.showReport('progressSheets')); await idle();
    await page.evaluate(() => App.reportOptions({ room: '' })); await idle(); await page.waitForTimeout(200); assert.strictEqual(await sheets(), total, 'everyone');
    await page.evaluate(() => App.reportOptions({ room: 'Sparks B' })); await idle(); await page.waitForTimeout(200); assert.strictEqual(await sheets(), await kidsIn('Sparks B'));
    await page.click('#btnReportOptions'); await page.selectOption('#oRoomSel', ''); await page.click('#pgDone'); await idle(); await page.evaluate(() => App.showReport('attendance')); await page.waitForTimeout(200); await page.evaluate(() => App.showReport('progressSheets')); await idle(); await page.waitForTimeout(200);
    assert.strictEqual(await sheets(), total, 'All classes kept');
  });
  await test('N4-8: PDF of one class and of everyone has one page per sheet', async () => {
    const pdf = async () => { await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(300); const b = await page.pdf({ preferCSSPageSize: true }); await page.emulateMedia({ media: 'screen' }); await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); return [...b.toString('latin1').matchAll(/\/Type\s*\/Page[^s]/g)].length; };
    assert.strictEqual(await pdf(), total, 'everyone'); await page.click('#btnReportOptions'); await page.selectOption('#oRoomSel', 'Cubbies'); await page.click('#pgDone'); await idle(); await page.waitForTimeout(300); assert.strictEqual(await pdf(), await kidsIn('Cubbies'), 'one class');
  });
  await test('N4-9: on a phone the pop-up fits and the picker is easy to tap', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.click('#btnReportOptions');
    const height = await page.locator('#oRoomSel').evaluate(el => el.getBoundingClientRect().height);
    await page.selectOption('#oRoomSel', ''); await page.click('#pgDone');
    const r = await page.evaluate(() => { const b = document.getElementById('busy'), x = b.getBoundingClientRect(); return { open: b.open, l: x.left, r: innerWidth - x.right }; });
    assert(r.open && r.l >= 8 && r.r >= 8, JSON.stringify(r)); assert(height >= 44, 'picker height ' + height); await idle(); await page.waitForTimeout(200);
    assert(await page.evaluate(() => document.getElementById('report').scrollWidth <= document.getElementById('report').clientWidth + 1), 'no sideways scroll'); await page.setViewportSize({ width: 1366, height: 900 });
  });
  await test('N4-12: a draw that throws does not leave the pop-up open, and the next draw works', async () => {
    await page.click('#btnReportOptions'); await page.selectOption('#oRoomSel', 'Cubbies'); await page.click('#pgDone'); await idle(); const n0 = errs.length;
    await page.evaluate(() => { const d = Reports.LIST.find(x => x.id === 'progressSheets'); window.__r = d.render; d.render = () => { throw new Error('stub draw failure'); }; });
    await page.click('#btnReportOptions'); await page.selectOption('#oRoomSel', ''); await page.click('#pgDone'); await idle(); await page.waitForTimeout(200);
    assert.strictEqual(errs.length - n0, 1, 'one stub error'); assert(/stub draw failure/.test(errs[errs.length - 1]));
    await page.evaluate(() => { Reports.LIST.find(x => x.id === 'progressSheets').render = window.__r; }); await page.click('#btnReportOptions'); await page.selectOption('#oRoomSel', 'Cubbies'); await page.click('#pgDone'); await idle(); await page.waitForTimeout(200);
    assert.strictEqual(await sheets(), await kidsIn('Cubbies')); errs.length = n0;
  });
  await test('N4-15: the Debug tab shows the last big draw', async () => {
    await page.click('#btnReportOptions'); await page.selectOption('#oRoomSel', ''); await page.click('#pgDone'); await idle(); await page.waitForTimeout(200);
    await page.evaluate(() => App.showTab('debug')); await page.waitForTimeout(300); assert(/Last big draw[\s\S]{0,40}\d+ progress sheets in [\d.]+ s/.test(await page.textContent('#debugWrap')));
  });
  await test('no script errors', async () => assert.deepStrictEqual(errs, []));
  console.log('\n' + passed + ' passed, ' + failed + ' failed'); await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})();
