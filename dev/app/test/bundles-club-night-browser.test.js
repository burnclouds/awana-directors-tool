// N9 point 13: the Club night pack is a standard bundle (announce list and hand-out strips); a club with its own bundles can add the standard ones it lacks, and its own bundles are not changed. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/bundles-club-night-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext()).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await test('the standard bundles include the Club night pack, with the announce list and the hand-out strips', async () => {
    const names = await page.evaluate(() => AwanaReports.DEFAULT_BUNDLES().map(b => b.name)).catch(() => null);
    const list = await page.evaluate(() => Reports.DEFAULT_BUNDLES().map(b => b.name));
    assert(list.includes('Club night pack'), list.join(', ')); assert(names === null || names.includes('Club night pack'));
    const pack = await page.evaluate(() => Reports.DEFAULT_BUNDLES().find(b => b.name === 'Club night pack').items.map(i => i.report));
    assert.deepStrictEqual(pack, ['announceList', 'handOut']);
  });
  await test('the quick pick opens the printable pack and its slide exporter uses the current club night', async () => {
    const night = await page.evaluate(() => {
      const p = App.master.people.find(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'Sparks');
      const id = p[Model.X.ID];
      const section = App.season.config.progress.Sparks.perBook[0];
      section.items.forEach(item => Season.setProgress(App.season, id, 'HG', section.key + '.' + item, '2026-10-01'));
      App.commitScope(() => App.touch());
      App.showReport('bundle:3');
      return App.nextNight();
    });
    await page.click('#btnReportOptions'); await page.click('#btnBinders', { timeout: 3000 });
    await page.selectOption('#bindQuick', '3');
    assert(!(await page.locator('#bindBlanks').isVisible()));
    await page.click('#bindGo', { timeout: 3000 });
    assert.strictEqual(await page.locator('#packNight').count(), 0);
    await page.click('#btnReportOptions');
    assert(!(await page.locator('#qWrap').isVisible()));
    assert((await page.textContent('#report')).includes('Club night ' + night));
    assert(await page.locator('#report .strip').count());
    assert(await page.locator('#btnPrint').isEnabled());
    await page.evaluate(date => {
      App.season.adults[date] = [{ n: 'Example Adult', a: 'Example award' }];
    }, night);
    await page.click('#btnPackSlides', { timeout: 3000 });
    const [, month, day] = night.split('-');
    assert((await page.textContent('#dlg h3')).includes(Number(month) + '/' + Number(day)));
    await page.click('#slTabs [data-slide="adult"]');
    assert((await page.textContent('#slAdultRows')).includes('Example Adult'));
    assert(await page.locator('#slOne').isEnabled());
    await page.click('#slClose');
    const stripPage = await page.locator('#report .sheet').evaluateAll(sheets => sheets.findIndex(sheet => sheet.classList.contains('strips')));
    assert(stripPage > 0, 'hand-out strips follow the portrait announcement list');
    await page.click('#btnReportOptions');
    await page.click('#pgNone');
    await page.locator('#reportPageOptions input[data-pg="' + stripPage + '"]').check();
    await page.click('#pgDone');
    assert.match(await page.textContent('#pageStyle'), /^@page \{ size: landscape;/);
    await page.evaluate(() => App.showReport('bundle:0'));
    assert(!(await page.locator('#btnPackSlides').isVisible()));
  });
  await test('N62: a shared PDF saved with this night’s lesson is offered by the club night pack', async () => {
    const index = await page.evaluate(() => {
      const index = App.calendar.findIndex(Calendar.isNight);
      App.today = () => App.calendar[index].Date;
      App.showTab('calendar');
      return index;
    });
    await page.click('#calSubs button[data-calsub="lessons"]');
    if (await page.locator('#btnLessonsOn').isVisible()) await page.click('#btnLessonsOn');
    const lesson = page.locator('#calWrap tr[data-i="' + index + '"] td').filter({ has: page.locator('input[data-c="Puggles Lesson"]') });
    await lesson.locator('input[data-c="Puggles Lesson"]').fill('Sample lesson');
    await lesson.locator('summary').click();
    const box = lesson.locator('input[data-coloring-pdf]');
    await box.fill('file:///tmp/sample.pdf'); await box.blur();
    assert.strictEqual(await box.inputValue(), '');
    const url = 'https://example.test/coloring.pdf?group=puggles&date=club-night';
    await box.fill(url); await box.blur();
    await page.click('#btnDraftApply');
    await page.evaluate(() => App.showReport('bundle:3'));
    await page.click('#btnReportOptions');
    const panel = page.locator('#packColoringSheets');
    const copies = await page.evaluate(() => Reports.kids(App.master).filter(p => Model.groupOf(Model.room(p)) === 'Puggles').length);
    assert((await panel.textContent()).includes('Puggles · Sample lesson · ' + copies));
    const link = panel.getByRole('link', { name: 'Open PDF', exact: true });
    assert.strictEqual(await link.getAttribute('href'), url);
    assert.strictEqual(await link.getAttribute('target'), '_blank');
    assert.strictEqual(await link.getAttribute('rel'), 'noopener noreferrer');
    assert.strictEqual(await page.locator('#report a[href="' + url + '"]').count(), 0, 'PDFs are printed separately');
    await page.click('#pgDone');
  });
  await test('a club with its own bundles sees the add button; it adds the standard bundles it lacks and leaves its own unchanged', async () => {
    await page.evaluate(() => { App.season.config.bundles = [{ name: 'Mine', items: [{ report: 'attendance' }] }]; App.touch(); });
    await page.evaluate(() => App.tabs.options()); await page.waitForTimeout(300);      // draw the Options page (it sits under More, so the tab button alone does not draw it here)
    assert(await page.$('#optBundleAddStd'), 'no add button shown for a club with its own bundles');
    await page.evaluate(() => document.getElementById('optBundleAddStd').click()); await page.waitForTimeout(400);
    const names = await page.evaluate(() => App.season.config.bundles.map(b => b.name));
    assert.strictEqual(names[0], 'Mine', names.join(', ')); assert(names.includes('Club night pack') && names.includes('Quarterly Printables'), names.join(', '));
    assert.deepStrictEqual(await page.evaluate(() => App.season.config.bundles[0].items.map(i => i.report)), ['attendance'], 'own bundle unchanged');
  });
  await test('pressing it again adds nothing', async () => {
    await page.evaluate(() => document.getElementById('optBundleAddStd').click()); await page.waitForTimeout(300);
    const n = await page.evaluate(() => App.season.config.bundles.length); assert.strictEqual(n, 5, 'bundles ' + n + ' (their own one, plus the four standard)');
  });
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
