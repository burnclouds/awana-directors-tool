// The weekly import and file opening in a real browser: several data files at once, and an inactive child staying inactive. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/import-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), os = require('os'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)), EXPORT = fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort()[0];
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html', f = path.join(app, u);
  if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
});
(async () => {
  await new Promise(r => server.listen(0, r));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-importbrowser-')), base = JSON.parse(fs.readFileSync(path.join(td, DATA), 'utf8'));
  const older = path.join(tmp, 'awana-2026-27-TEST-20261029-100000.json'), newer = path.join(tmp, 'awana-2026-27-TEST-20261030-100000.json');
  const lastT = base.history[base.history.length - 1].t, later = new Date(Date.parse(lastT) + 3600e3).toISOString();
  fs.writeFileSync(older, JSON.stringify(base)); fs.writeFileSync(newer, JSON.stringify(Object.assign({}, base, { history: base.history.concat([{ t: later, label: 'one more edit', changes: [] }]) })));
  const exportPath = path.join(td, EXPORT);
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const open = async () => { const page = await browser.newPage(); const msgs = []; page.on('dialog', d => { msgs.push(d.message()); d.accept(); }); page.on('pageerror', e => msgs.push('PAGE ERROR ' + e.message)); await page.goto(url); return { page, msgs }; };

  await test('picking two data files opens the newest one and says which', async () => {
    const { page, msgs } = await open();
    await page.setInputFiles('#splashFiles', [newer, older]); await page.waitForTimeout(600);
    assert(await page.evaluate(() => App.season.history.some(e => e.label === 'one more edit')), 'the newer file is open');      // (opening an old-layout file also adds one "File upgrade" entry, so the count is not compared)
    assert(msgs.some(m => /Opened the newest, awana-2026-27-TEST-20261030/.test(m)), msgs.join(' | '));
    await page.close();
    const second = await open();
    await second.page.setInputFiles('#splashFiles', [older, newer]); await second.page.waitForTimeout(600);
    assert(await second.page.evaluate(() => App.season.history.some(e => e.label === 'one more edit')), 'same answer in the other order');
    await second.page.close();
  });
  await test('a child marked inactive by hand is still inactive after the same export is imported again', async () => {
    const { page, msgs } = await open();
    await page.setInputFiles('#splashFiles', [newer, exportPath]); await page.waitForTimeout(800);
    const id = await page.evaluate(() => { const p = App.master.people.find(x => Model.isClubber(x) && Model.isActive(x)); Model.setActive(p, false); return p.x_ClubberID; });
    await page.setInputFiles('#fileAny', [exportPath]); await page.waitForTimeout(800);
    assert.strictEqual(await page.evaluate(i => Model.isActive(App.master.people.find(x => x.x_ClubberID === i)), id), false);
    assert(await page.locator('#review').isHidden(), 'no review was forced');
    assert(!msgs.some(m => /PAGE ERROR/.test(m)), msgs.join(' | '));
    await page.close();
  });
  await test('the import review opens for the invented registrations, with no script errors', async () => {
    const { page, msgs } = await open();
    await page.setInputFiles('#splashFiles', [newer, exportPath]); await page.waitForTimeout(800);
    await page.setInputFiles('#fileAny', [path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort()[1])]); await page.waitForTimeout(800);
    assert(await page.locator('#review').isVisible()); assert(/New people/.test(await page.locator('#reviewBody').innerText()));
    assert(!msgs.some(m => /PAGE ERROR/.test(m)), msgs.join(' | '));
    await page.close();
  });
  // ---- R10: an export older than the file's Planning Center data ----
  const dataPc = JSON.parse(JSON.stringify(base)); dataPc.roster.pcAsOf = '2026-11-03'; dataPc.roster.pcSource = '20261103 -- demo-club-2026-27 TEST.csv';
  const newerPc = path.join(tmp, 'awana-2026-27-TEST-20261104-100000.json'); fs.writeFileSync(newerPc, JSON.stringify(dataPc));
  const openAnswering = async ok => { const page = await browser.newPage(); const msgs = []; page.on('dialog', d => { msgs.push(d.message()); if (/older than the Planning Center data/.test(d.message()) && !ok) d.dismiss(); else d.accept(); }); page.on('pageerror', e => msgs.push('PAGE ERROR ' + e.message)); await page.goto(url); return { page, msgs }; };
  const OLDER = /older than the Planning Center data already in this file/;
  await test('an export older than the file\'s Planning Center data asks first; Cancel leaves the file as it was', async () => {
    const { page, msgs } = await openAnswering(false);
    await page.setInputFiles('#splashFiles', [newerPc]); await page.waitForTimeout(600);
    await page.setInputFiles('#fileAny', [exportPath]); await page.waitForTimeout(800);
    const asked = msgs.filter(m => OLDER.test(m)); assert.strictEqual(asked.length, 1, msgs.join(' | ')); assert(/2026-10-28/.test(asked[0]) && /2026-11-03/.test(asked[0]), asked[0]);
    const s = await page.evaluate(() => ({ asOf: App.master.pcAsOf, src: App.master.pcSource, dirty: App.dirty(), has: App.hasPcExport }));
    assert.strictEqual(s.asOf, '2026-11-03'); assert(/^20261103/.test(s.src)); assert.strictEqual(s.dirty, false, 'not marked unsaved'); assert(!s.has, 'nothing imported');
    assert(await page.locator('#review').isHidden()); assert(!msgs.some(m => /PAGE ERROR/.test(m)), msgs.join(' | ')); await page.close();
  });
  await test('...and OK imports it anyway', async () => {
    const { page, msgs } = await openAnswering(true);
    await page.setInputFiles('#splashFiles', [newerPc]); await page.waitForTimeout(600);
    await page.setInputFiles('#fileAny', [exportPath]); await page.waitForTimeout(800);
    if (await page.locator('#review').isVisible()) await page.click('#rvApply'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => App.master.pcAsOf), '2026-10-28'); assert(/^20261028/.test(await page.evaluate(() => App.master.pcSource)));
    assert(!msgs.some(m => /PAGE ERROR/.test(m)), msgs.join(' | ')); await page.close();
  });
  await test('an older export opened before the data file is not applied to it, and a message says why', async () => {
    const { page, msgs } = await openAnswering(true);
    await page.setInputFiles('#splashFiles', [exportPath]); await page.waitForTimeout(800);
    await page.setInputFiles('#fileAny', [newerPc]); await page.waitForTimeout(800);
    assert.strictEqual(await page.evaluate(() => App.master.pcAsOf), '2026-11-03'); assert(!msgs.some(m => OLDER.test(m)), 'it did not ask');
    assert(await page.locator('#flash').isVisible()); assert(/is older than this file.s Planning Center data \(as of 2026-11-03\), so it was not applied/.test(await page.locator('#flash').textContent()), await page.locator('#flash').textContent());
    await page.evaluate(() => { document.getElementById('flash').hidden = true; });
    await page.setInputFiles('#fileAny', [newerPc]); await page.waitForTimeout(800);
    assert(await page.locator('#flash').isHidden(), 'the declined export is not tried again'); assert(!msgs.some(m => /PAGE ERROR/.test(m)), msgs.join(' | ')); await page.close();
  });
  await test('the same day is not older: the weekly re-import never asks', async () => {
    const { page, msgs } = await open();
    await page.setInputFiles('#splashFiles', [newer, exportPath]); await page.waitForTimeout(800); await page.setInputFiles('#fileAny', [exportPath]); await page.waitForTimeout(800);
    assert(!msgs.some(m => /older than/.test(m)), msgs.join(' | ')); await page.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
