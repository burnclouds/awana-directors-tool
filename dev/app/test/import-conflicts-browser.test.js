// The "Needs your decision" screen: a pending change of yours that a Planning Center export now contradicts.
// Default (Use Planning Center) takes the export's value and drops the change; Keep mine takes the export's value and keeps the change pending;
// Cancel leaves the file as it was. Invented test club only (dev/test-data).
// Usage: NODE_PATH=<dir with playwright> node test/import-conflicts-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
const EXPORT = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort()[0]);
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html', f = path.join(app, u);
  if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
});
setTimeout(() => { console.log('timed out'); process.exit(2); }, 170000).unref();
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  // Opens the data file, gives one active child a Grade that differs from the export and a pending change of yours, then imports the export.
  const setup = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }), page = await ctx.newPage(), errs = [], alerts = [];
    page.on('dialog', async d => { alerts.push(d.message()); await d.accept(); });
    page.on('pageerror', e => errs.push('PAGE ERROR ' + e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]);
    await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    const id = await page.evaluate(() => { const p = App.master.people.find(x => Model.isClubber(x) && Model.isActive(x)); p.Grade = 'Wrong grade'; p['ov:Grade'] = 'Wanted'; return p[Model.X.ID]; });
    await page.setInputFiles('#fileAny', [EXPORT]);
    await page.waitForFunction(() => !document.getElementById('conflicts').hidden, null, { timeout: 15000 });
    const state = () => page.evaluate(i => { const p = App.master.people.find(x => x[Model.X.ID] === i); return { grade: p.Grade, ov: p['ov:Grade'] }; }, id);
    const finish = async () => {
      if (await page.evaluate(() => !document.getElementById('review').hidden)) await page.click('#rvApply');
      await page.waitForTimeout(300);
    };
    return { page, errs, alerts, ctx, id, state, finish };
  };

  await test('Needs your decision screen opens with the conflicting field highlighted and Use Planning Center as the default', async () => {
    const s = await setup();
    assert(await s.page.locator('#conflictsBody .cf-conflict').count() >= 1, 'a highlighted conflicting row');
    assert.strictEqual(await s.page.locator('#conflictsBody input[value=pc]:checked').count(), await s.page.locator('#conflictsBody input[value=pc]').count(), 'every choice defaults to Use Planning Center');
    await s.ctx.close();
  });

  await test('Use Planning Center (default): the file takes the export value and the pending change is dropped', async () => {
    const s = await setup();
    await s.page.click('#cfNext'); await s.finish();
    const st = await s.state();
    assert.notStrictEqual(st.grade, 'Wrong grade', 'the file now holds the export value');
    assert(!st.ov, 'the pending change is dropped');
    assert.deepStrictEqual(s.errs, [], 'no script errors');
    await s.ctx.close();
  });

  await test('Keep mine: the file takes the export value and the pending change stays and is still listed as needing a change in Planning Center', async () => {
    const s = await setup();
    await s.page.locator('#conflictsBody input[value=mine]').first().check();
    await s.page.click('#cfNext'); await s.finish();
    const st = await s.state();
    assert.notStrictEqual(st.grade, 'Wrong grade', 'the file holds the export value');
    assert.strictEqual(st.ov, 'Wanted', 'the pending change is kept');
    const listed = await s.page.evaluate(i => Model.pendingChanges(App.master).some(c => c.person[Model.X.ID] === i && c.col === 'Grade'), s.id);
    assert.strictEqual(listed, true, 'the red warning list still has the change');
    assert.deepStrictEqual(s.errs, [], 'no script errors');
    await s.ctx.close();
  });

  await test('Cancel: the data file is unchanged (the export-declined flag is not checked here)', async () => {
    const s = await setup();
    await s.page.click('#cfCancel'); await s.page.waitForTimeout(300);
    const st = await s.state();
    assert.strictEqual(st.grade, 'Wrong grade', 'the grade is unchanged'); assert.strictEqual(st.ov, 'Wanted', 'the pending change is unchanged');
    assert.deepStrictEqual(s.errs, [], 'no script errors');
    await s.ctx.close();
  });

  server.close(); await browser.close().catch(() => {});
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
