// R17 in a browser: importing an export with extra columns and odd rows keeps all of it through save and reopen; the import is ONE History entry (one undo step); the same export
// again changes nothing; a money-only change is logged; an export opened before a data file is applied after the open as its own entry; the To do page and the columns dialog say
// what was kept; a guest linked to the nameless row moves it into the record. Invented test club only (TEST data + test/pc-fixture.js).
// Usage: NODE_PATH=<dir with playwright> node test/pc-capture-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), os = require('os'), path = require('path');
const { chromium } = require('playwright');
const Csv = require('../csv.js'), Fx = require('./pc-fixture.js');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.json$/.test(f)).sort().pop()), PLAIN = path.join(td, '20261103 -- demo-club-2026-27 TEST.csv');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html', f = path.join(app, u);
  if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
});
const sortRows = rows => rows.map(r => JSON.stringify(r)).sort();
(async () => {
  await new Promise(r => server.listen(0, r));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-pccapture-')), fixText = Fx.build(fs.readFileSync(PLAIN, 'utf8')), FIX = path.join(tmp, '20261110 -- demo-club-2026-27 TEST extra.csv'); fs.writeFileSync(FIX, fixText);
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const open = async () => { const page = await browser.newPage(), msgs = []; page.on('dialog', d => { msgs.push(d.message()); d.accept(); }); page.on('pageerror', e => msgs.push('PAGE ERROR ' + e.message)); await page.goto(url); return { page, msgs }; };
  const grid = page => page.evaluate(() => { const b = Model.exportBack(App.season.roster); return b; });
  // Open the TEST data file, then import `file` and Apply the review with the nameless row unticked.
  const importFixture = async (file, untick) => {
    const { page, msgs } = await open(); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); await page.waitForTimeout(300);
    await page.setInputFiles('#fileAny', [file || FIX]); await page.waitForSelector('#review:not([hidden])', { timeout: 8000 });
    if (untick !== false) await page.locator('input[data-ad]').last().uncheck(); await page.click('#rvApply'); await page.waitForTimeout(600); return { page, msgs };
  };
  const sameGrid = (back, text) => { const g = Fx.grid(text); assert.deepStrictEqual(back.header, g.header, 'the header as exported'); assert.deepStrictEqual(sortRows(back.rows), sortRows(g.rows), 'every row, cell for cell'); };

  await test('importing an export with extra columns and odd rows keeps all of it through save and reopen', async () => {
    const { page, msgs } = await importFixture(); const text = await page.evaluate(() => App.snapshotJson());
    const p2 = await open(); await p2.page.evaluate(t => App.openSeason(t), text); await p2.page.waitForTimeout(300);
    sameGrid(await grid(p2.page), fixText); const kept = await p2.page.evaluate(() => Validate.validate(App.snapshotJson(), 'awana-2026-27-20261110-100000.json').findings.map(f => f.msg).join(' | '));
    assert(/Planning Center export kept: \d+ rows/.test(kept), kept); assert(!msgs.concat(p2.msgs).some(m => /PAGE ERROR/.test(m)), msgs.concat(p2.msgs).join(' | ')); await page.close(); await p2.page.close();
  });
  await test('the import is one History entry and Undo takes all of it back; Redo brings it back', async () => {
    const { page } = await importFixture(), h = await page.evaluate(() => ({ n: App.season.history.length, last: App.season.history[App.season.history.length - 1].label }));
    assert(/^Planning Center import: 20261110/.test(h.last), h.last); const before = await page.evaluate(() => App.season.history.filter(e => /^Planning Center import/.test(e.label)).length); assert.strictEqual(before, 1, 'exactly one import entry');
    await page.click('#btnUndo'); await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(() => Model.exportBack(App.season.roster)), null, 'after Undo there is no record'); assert.strictEqual(await page.evaluate(() => App.season.history.filter(e => /^Planning Center import/.test(e.label)).length), 1, 'Undo is itself logged; the import entry is still there');
    await page.click('#btnRedo'); await page.waitForTimeout(400); sameGrid(await grid(page), fixText); await page.close();
  });
  await test('the same export a second time changes nothing', async () => {
    const { page } = await importFixture(), s = await page.evaluate(() => ({ n: App.season.history.length, dirty: App.dirty(), hash: App.season.roster.pcExport.hash }));
    await page.setInputFiles('#fileAny', [FIX]); await page.waitForTimeout(700);
    const t = await page.evaluate(() => ({ n: App.season.history.length, dirty: App.dirty(), hash: App.season.roster.pcExport.hash, flash: (document.getElementById('flash') || {}).textContent || '', shown: !(document.getElementById('flash') || { hidden: true }).hidden }));
    assert.strictEqual(t.n, s.n, 'no new entry'); assert.strictEqual(t.hash, s.hash); assert(/This export is already in the file \(imported \d{4}-\d{2}-\d{2}\)/.test(t.flash) && t.shown, t.flash); assert(await page.locator('#review').isHidden(), 'no review'); await page.close();
  });
  await test('a different export (one cell changed) is a new entry and a new hash', async () => {
    const { page } = await importFixture(), s = await page.evaluate(() => ({ n: App.season.history.length, hash: App.season.roster.pcExport.hash }));
    const rows = Csv.parse(fixText), gi = rows[0].indexOf('Times Attended'); rows[2][gi] = '77'; const f2 = path.join(tmp, '20261117 -- demo-club-2026-27 TEST extra.csv'); fs.writeFileSync(f2, Csv.serialize(rows));
    await page.setInputFiles('#fileAny', [f2]); await page.waitForTimeout(900); if (await page.locator('#review').isVisible()) { await page.click('#rvApply'); await page.waitForTimeout(500); }
    const t = await page.evaluate(() => ({ n: App.season.history.length, hash: App.season.roster.pcExport.hash, label: App.season.history[App.season.history.length - 1].label }));
    assert.strictEqual(t.n, s.n + 1, 'one new entry'); assert.notStrictEqual(t.hash, s.hash); assert(/^Planning Center import: 20261117/.test(t.label), t.label); await page.close();
  });
  await test('an export that changes only a money column is logged, and the history still adds up', async () => {
    const { page } = await importFixture(PLAIN, false), n0 = await page.evaluate(() => App.season.history.length);
    const rows = Csv.parse(fs.readFileSync(PLAIN, 'utf8')), bi = rows[0].indexOf('Balance Due'); rows[1][bi] = '123.45'; const f2 = path.join(tmp, '20261104 -- demo-club-2026-27 TEST money.csv'); fs.writeFileSync(f2, Csv.serialize(rows));
    await page.setInputFiles('#fileAny', [f2]); await page.waitForTimeout(900);
    const t = await page.evaluate(() => ({ n: App.season.history.length, dirty: App.dirty(), last: App.season.history[App.season.history.length - 1], replay: Validate.validate(App.snapshotJson(), 'awana-2026-27-20261110-100000.json').findings.some(f => /differs from what the history says/.test(f.msg)) }));
    assert.strictEqual(t.n, n0 + 1, 'one new entry'); assert.strictEqual(t.dirty, true); assert(t.last.changes.some(c => c.p.includes('Balance Due')), 'the money column change is in it'); assert.strictEqual(t.replay, false, 'no replay warning'); await page.close();
  });
  await test('an export opened before the data file is applied after the open, as its own entry', async () => {
    const { page, msgs } = await open(); await page.setInputFiles('#splashFiles', [FIX]); await page.waitForTimeout(800); await page.setInputFiles('#fileAny', [DATA]); await page.waitForSelector('#review:not([hidden])', { timeout: 8000 });
    await page.locator('input[data-ad]').last().uncheck(); await page.click('#rvApply'); await page.waitForTimeout(600);
    const t = await page.evaluate(() => { const h = App.season.history; return { last: h[h.length - 1].label, before: h[h.length - 2].label, replay: Validate.validate(App.snapshotJson(), 'awana-2026-27-20261110-100000.json').findings.some(f => /differs from what the history says/.test(f.msg)) }; });
    assert(/^Planning Center import: 20261110/.test(t.last), t.last); assert(!/^Planning Center import/.test(t.before), 'the entry before is the file\'s own: ' + t.before); assert.strictEqual(t.replay, false);
    assert(!msgs.some(m => /PAGE ERROR/.test(m)), msgs.join(' | ')); await page.close();
  });
  await test('the same export opened before a data file that already holds it changes nothing', async () => {
    const { page } = await importFixture(), saved = path.join(tmp, 'awana-2026-27-TEST-20261110-100000.json'); fs.writeFileSync(saved, await page.evaluate(() => App.snapshotJson())); await page.close();
    const p2 = await open(); await p2.page.setInputFiles('#splashFiles', [FIX]); await p2.page.waitForTimeout(800); await p2.page.setInputFiles('#fileAny', [saved]); await p2.page.waitForTimeout(1000);
    const t = await p2.page.evaluate(() => ({ dirty: App.dirty(), review: !document.getElementById('review').hidden, replay: Validate.validate(App.snapshotJson(), 'awana-2026-27-20261110-100000.json').findings.some(f => /differs from what the history says/.test(f.msg)) }));
    assert.strictEqual(t.dirty, false, 'not unsaved'); assert.strictEqual(t.review, false, 'no review'); assert.strictEqual(t.replay, false); await p2.page.close();
  });
  await test('the To do page says what was kept, and the columns dialog lists every column with its status', async () => {
    const { page } = await importFixture(); await page.evaluate(() => document.querySelector('.tabs button[data-tab="todo"]').click()); await page.waitForTimeout(300);
    const todo = await page.locator('#tab-todo').innerText(); assert(/Kept from the export: \d+ columns \(\d+ not used by the app\), 1 row that belongs to nobody, 1 blank row/.test(todo), todo.slice(0, 600));
    await page.evaluate(() => document.getElementById('pcColsMore').click()); await page.waitForTimeout(300); const dlg = await page.locator('#dlg').innerText();
    assert(/Every column kept/.test(dlg) && /Favourite Snack TEST/.test(dlg) && /pc:x_Notes/.test(dlg) && /kept, not used/.test(dlg) && /used by the app/.test(dlg), dlg.slice(0, 400)); await page.close();
  });
  await test('linking a guest to the nameless row moves it from the rows that belong to nobody into the record', async () => {
    const { page } = await importFixture(), id = await page.evaluate(() => { const g = Model.addManualPerson(App.master, { 'First Name': 'Guest', 'Last Name': 'Kid', 'Assignment Area: Classes': 'Sparks A', 'Selection': 'Clubber' }, App.today()); App.touch(); App.refresh(); return g[Model.X.ID]; });
    assert.strictEqual(await page.evaluate(() => App.master.pcExport.loose.length), 1); await page.evaluate(i => App.linkGuest(i), id); await page.waitForSelector('#lgRows tr'); await page.locator('#lgRows tr', { hasText: Fx.NOBODY }).locator('button[data-link]').click(); await page.waitForTimeout(500);
    const t = await page.evaluate(i => ({ loose: App.master.pcExport.loose.length, inIds: App.master.pcExport.ids[i] === 1 }), id); assert.strictEqual(t.loose, 0, 'out of loose'); assert.strictEqual(t.inIds, true, 'into ids'); await page.close();
  });
  await browser.close(); server.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})().catch(e => { console.log('ERROR ' + e.message); process.exit(1); });
