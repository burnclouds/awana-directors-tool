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
  await test('RP2: a long run of pages (progress sheets for everyone) shows a summary and a Choose pages button, not a tick for each child', async () => {
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
  await test('RP2: a short run of pages (an attendance sheet per room) is chosen in the same pop-up, with Select all and Select none', async () => {
    await page.evaluate(() => App.showReport('attendance')); await page.waitForTimeout(400);
    const n = await page.locator('#report .sheet').count(); assert(n > 1 && n <= 12, 'precondition: ' + n); assert.strictEqual(await page.locator('#pagePick input[type=checkbox]').count(), 0, 'no inline ticks'); assert(await page.isVisible('#btnChoosePages'));
    assert.strictEqual((await page.textContent('#pageSum')).trim(), 'Pages to print: all ' + n); await page.click('#btnChoosePages'); await page.click('#pgNone'); assert.strictEqual((await page.textContent('#pageSum')).trim(), 'Pages to print: 0 of ' + n); await page.click('#pgAll'); await page.click('#pgDone');
  });
  await test('RP3: Puggles are not in the Class list of Progress Sheets (they are on Attendance), and a Puggles class binder has no progress sheet', async () => {
    const rooms = async r => { await page.evaluate(x => App.showReport(x), r); await page.waitForTimeout(250); return page.$$eval('#oRoomSel option', o => o.map(x => x.textContent)); };
    assert((await rooms('attendance')).includes('Puggles'), 'precondition: Puggles are a room'); assert(!(await rooms('progressSheets')).includes('Puggles'), 'not on Progress Sheets');
    await page.click('#rSubs button[data-rsub="binders"]'); await page.click('#btnBinders'); await page.waitForTimeout(200); await page.selectOption('#bindQuick', { label: 'Class binder' }); await page.click('#bindNone');
    await page.locator('#dlg input[data-room="Puggles"]').check(); assert(await page.locator('#bindSheets').isChecked(), 'progress sheets are ticked'); await page.click('#bindGo'); await page.waitForTimeout(500);
    assert.strictEqual(await page.locator('#report .onepage').count(), 0, 'no progress sheet'); assert(await page.locator('#report .sheet').count() >= 2, 'but the attendance sheet and roster are there');
  });
  await test('RP4: the progress-sheet tick is one of the "pages in each binder" (not on the bar), it is ticked at first, and unticking it leaves the sheets out; the choice is remembered', async () => {
    assert.strictEqual(await page.locator('#bSheets').count(), 0, 'no tick on the bar'); assert.strictEqual(await page.locator('#bSheetsWrap').count(), 0);
    await page.click('#btnBinders'); await page.waitForTimeout(200); await page.selectOption('#bindQuick', { label: 'Class binder' }); await page.click('#bindNone'); assert(await page.locator('#bindSheets').isVisible() && await page.locator('#bindSheets').isChecked());
    await page.locator('#dlg input[data-bind="1"]').check(); await page.click('#bindGo'); await page.waitForTimeout(500); const withSheets = await page.locator('#report .onepage').count(); assert(withSheets > 0, 'sheets with the tick');
    await page.click('#btnBinders'); await page.waitForTimeout(200); await page.locator('#bindSheets').uncheck(); await page.click('#bindGo'); await page.waitForTimeout(500); assert.strictEqual(await page.locator('#report .onepage').count(), 0, 'none without it');
    await page.click('#btnBinders'); await page.waitForTimeout(200); assert(!(await page.locator('#bindSheets').isChecked()), 'the choice is remembered for the visit'); assert.strictEqual(await page.inputValue('#bindQuick'), '', 'and it is a custom choice'); await page.keyboard.press('Escape');
  });
  await test('Print class binders pop-up: three labelled steps; Select all and Select none act on the classes only, never on the pages', async () => {
    await page.click('#btnBinders'); await page.waitForTimeout(200); const n = await page.locator('#dlg input[data-bind]').count(); assert(n >= 10, 'classes listed: ' + n);
    assert.deepStrictEqual(await page.$$eval('#dlg fieldset legend', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim().replace(/^(\d)\. /, '$1 '))), ['1 Quick pick', '2 Pages in each binder (an option, not a binder)', '3 Classes to print']);
    assert.strictEqual(await page.locator('#dlg fieldset.bindpick #bindSheets').count(), 0, 'the progress-sheet tick is not among the classes'); assert.strictEqual(await page.locator('#dlg fieldset.bindopt #bindSheets').count(), 1);
    const pages = await page.$$eval('#dlg input[data-part]', l => l.map(x => x.checked).join()); await page.click('#bindAll'); assert.strictEqual(await page.locator('#dlg input[data-bind]:checked').count(), n); assert.strictEqual((await page.textContent('#bindCount')).trim(), n + ' of ' + n + ' selected');
    assert.strictEqual(await page.$$eval('#dlg input[data-part]', l => l.map(x => x.checked).join()), pages, 'pages untouched'); await page.click('#bindNone'); assert.strictEqual(await page.locator('#dlg input[data-bind]:checked').count(), 0); assert.strictEqual((await page.textContent('#bindCount')).trim(), '0 of ' + n + ' selected'); await page.keyboard.press('Escape');
  });
  const group = id => page.evaluate(i => { const o = [...document.querySelectorAll('#rSel option')].find(x => x.value === i); return o ? { hidden: o.hidden } : null; }, id);
  await test('groups: Color teams, the coaches team list and Game standings are in Color teams; Awards to hand out and End-of-year list are with Progress & awards; Uniforms and Lessons are in Other', async () => {
    const where = async id => { await page.evaluate(x => App.showReport(x), id); await page.waitForTimeout(150); return page.evaluate(() => document.querySelector('#rSubs button.on').dataset.rsub); };
    assert.strictEqual(await where('teams'), 'teams'); assert.strictEqual(await where('standings'), 'teams'); assert.strictEqual(await where('binderTeams'), 'teams'); assert.strictEqual(await where('handOut'), 'progress'); assert.strictEqual(await where('ceremony'), 'progress'); assert.strictEqual(await where('uniforms'), 'other'); assert.strictEqual(await where('lessons'), 'other'); assert.strictEqual(await where('photos'), 'binders');
  });
  await test('the bundle note does not stay behind on an ordinary report; Title and List order show only where the bundle uses them', async () => {
    const pick = async v => { await page.selectOption('#rSel', v); await page.waitForTimeout(350); }, vis = id => page.isVisible('#' + id);
    await page.click('#rSubs button[data-rsub="binders"]'); await pick({ label: 'Quarterly Printables (bundle)' }); assert(/in one print job/.test(await page.textContent('#bNote')), 'the note shows for a bundle'); assert(await vis('oOrder') && !(await vis('tWrap')), 'teams: List order yes, Title no');
    await pick({ label: 'Coaches binder (bundle)' }); assert(!(await vis('oOrder')) && !(await vis('tWrap')) && !(await vis('dateBar')), 'the Coaches binder uses neither');
    await page.evaluate(() => App.showReport('attendance')); await page.waitForTimeout(250); assert.strictEqual((await page.textContent('#bNote')).trim(), '', 'no bundle note on Attendance sheets');
  });
  await test('the standard Class binder bundle takes its class from the Class picker (it is shown) and a Puggles pick has no progress sheet', async () => {
    await page.click('#rSubs button[data-rsub="binders"]'); await page.selectOption('#rSel', { label: 'Class binder (bundle)' }); await page.waitForTimeout(400); assert(await page.isVisible('#oRoomSel'), 'the Class picker is shown');
    await page.selectOption('#oRoomSel', 'Sparks A'); await page.waitForTimeout(400); const h2 = await page.$$eval('#report .sheet h2', h => h.map(x => x.textContent)); assert(h2.some(t => /Sparks A/.test(t)) && !h2.some(t => /Cubbies|Sparks B/.test(t)), h2.join(' | ')); assert((await page.locator('#report .onepage').count()) > 0, 'progress sheets for Sparks A');
    await page.selectOption('#oRoomSel', 'Puggles'); await page.waitForTimeout(400); assert.strictEqual(await page.locator('#report .onepage').count(), 0, 'none for Puggles');
  });
  await test('"Planning Center data as of" is under the contact and medical pages only, not under attendance sheets or team lists', async () => {
    await page.click('#rSubs button[data-rsub="binders"]'); await page.selectOption('#rSel', { label: 'Quarterly Printables (bundle)' }); await page.waitForTimeout(450);
    const r = await page.evaluate(() => [...document.querySelectorAll('#report .sheet h2')].map(h => ({ t: h.textContent, asof: !!(h.nextElementSibling && h.nextElementSibling.classList.contains('asof')) })));
    const hasAsOf = await page.evaluate(() => !!App.master && !!App.master.pcAsOf); if (hasAsOf) assert(r.some(x => /Emergency|Medical/.test(x.t) && x.asof), 'on the contact pages');
    assert(!r.some(x => /Attendance|Color Teams/i.test(x.t) && x.asof), 'not on attendance or teams: ' + JSON.stringify(r.filter(x => x.asof).map(x => x.t)));
  });
  await test('No report has a Night picker any more (it only served the weekly award slips, which are retired); the print buttons on other tabs say Print ...', async () => {
    await page.evaluate(() => App.showReport('attendance')); await page.waitForTimeout(250); assert(!(await page.isVisible('#oDateSel')), 'no Night on Attendance sheets');
    assert.strictEqual(await page.locator('#oDateSel').count(), 0, 'no Night picker at all'); assert(!(await page.evaluate(() => Reports.LIST.some(r => r.id === 'weeklySlips'))), 'the weekly slips report is gone');
    assert(/^Print statistics/.test((await page.$eval('#btnStatsPrint', e => e.textContent)).trim()), 'Statistics'); 
  });
  await test('Color teams (Sparks, T&T) print one page per group: tighter rows, no group spills onto a second page', async () => {
    await page.evaluate(() => App.showReport('teams')); await page.waitForTimeout(400); const sheets = await page.locator('#report .sheet').count(); assert.strictEqual(sheets, 2);
    await page.emulateMedia({ media: 'print' }); const buf = await page.pdf({ format: 'Letter', preferCSSPageSize: true }); await page.emulateMedia({ media: 'screen' });
    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length; assert.strictEqual(pages, sheets, pages + ' pages for ' + sheets + ' sheets');
  });
  await test('RP5: one bar in the order what, when, who, how many, go: Report, Quarter, Group, Class, ..., Pages to print, Print last; everything is inside it and the header (no second bar)', async () => {
    await page.evaluate(() => App.showReport('attendance')); await page.selectOption('#oRoomSel', ''); await page.waitForTimeout(300);      // all classes (an earlier test left one chosen)
    const m = await page.evaluate(() => { const bar = document.getElementById('rBar'), order = ['rSel', 'qWrap', 'oGroup', 'oRoom', 'oKid', 'dateBar', 'calNote', 'pagePick', 'btnBinders', 'btnPrint'].map(id => document.getElementById(id)),
        inside = order.every(e => e && bar.contains(e)), pos = order.map(e => [...bar.querySelectorAll('*')].indexOf(e)), visible = e => e.getClientRects().length > 0, vis = order.filter(visible).map(e => e.id);
      return { inside, sorted: pos.every((x, i) => !i || x > pos[i - 1]), vis, oneRow: !document.querySelector('#tab-reports > #dateBar, #tab-reports > #pagePick'), headerHasBar: !!document.querySelector('#tab-reports > .rhead > #rBar'), printLast: [...bar.querySelectorAll('button')].filter(visible).pop().id }; });
    assert(m.inside && m.sorted, 'inside the one bar, in order: ' + JSON.stringify(m)); assert(m.oneRow && m.headerHasBar, 'no second bar below the header'); assert.strictEqual(m.printLast, 'btnPrint', 'Print is the last button'); assert(m.vis.includes('qWrap') && m.vis.includes('pagePick'), m.vis.join());
  });
  await test('RP5: on a phone the Reports bar is not sticky (it scrolls away) and the page does not scroll sideways', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(250);
    const m = await page.evaluate(() => ({ pos: getComputedStyle(document.querySelector('#tab-reports > .rhead')).position, side: document.documentElement.scrollWidth <= innerWidth }));
    await page.setViewportSize({ width: 1366, height: 900 }); await page.waitForTimeout(250); assert.strictEqual(m.pos, 'static'); assert(m.side, 'no sideways scroll');
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('#tab-reports > .rhead')).position), 'sticky', 'and sticky again on a computer');
  });
  await test('Print class binders with no file open does not throw: it says to open a file first', async () => {
    const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 800 } }), p2 = await ctx2.newPage(), e2 = []; p2.on('pageerror', e => e2.push(e.message)); p2.on('dialog', d => d.accept());
    await p2.goto(url); await p2.evaluate(() => App.showTab('reports')); await p2.evaluate(() => document.getElementById('btnBinders').click()); await p2.waitForTimeout(300); assert.deepStrictEqual(e2, []); await ctx2.close();
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
