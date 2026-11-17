// UX-05: config.startTab chooses the tab a data file opens on (absent = Roster). 'tonight' = Attendance on a club night or the day after it, otherwise To do; 'todo' = To do.
// It applies once when a file is opened. Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/start-tab-browser.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const withStart = v => { const j = JSON.parse(fs.readFileSync(DATA, 'utf8')); j.config = j.config || {}; if (v) j.config.startTab = v; else delete j.config.startTab; const f = path.join(os.tmpdir(), 'awana-2026-27-TEST-20260101-000000-' + (v || 'none') + '.json'); fs.writeFileSync(f, JSON.stringify(j)); return f; };
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const run = async (file, today, w) => { const ctx = await browser.newContext({ viewport: { width: w || 1280, height: 900 } }), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
    await page.goto(url); await page.evaluate(t => { App.today = () => t; }, today); await page.setInputFiles('#splashFiles', [file]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ tab: App.tab })); const night = await page.evaluate(() => { const c = App.calendar.filter(x => Calendar.isNight(x)); return c.length ? c[Math.floor(c.length / 2)].Date : ''; }); return { page, ctx, errs, tab: r.tab, night }; };
  const probe = await run(withStart(''), '2026-01-01'); const NIGHT = probe.night; await probe.ctx.close(); assert(NIGHT, 'the test calendar has club nights');
  const dayAfter = (() => { const d = new Date(NIGHT + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })(), far = (() => { const d = new Date(NIGHT + 'T12:00:00'); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10); })();
  for (const w of [390, 1280]) {
    await test('no startTab: opens on Roster, as it always has (' + w + ')', async () => { const r = await run(withStart(''), NIGHT, w); assert.strictEqual(r.tab, 'roster'); assert.deepStrictEqual(r.errs, []); await r.ctx.close(); });
    await test('startTab tonight (' + w + '): Attendance on that night on a club night, and on the night before the day after; To do on any other day', async () => {
      let r = await run(withStart('tonight'), NIGHT, w); assert.strictEqual(r.tab, 'attend'); assert.strictEqual(await r.page.inputValue('#attDate').catch(() => NIGHT), NIGHT); await r.ctx.close();
      r = await run(withStart('tonight'), dayAfter, w); assert.strictEqual(r.tab, 'attend', 'the day after'); await r.ctx.close();
      r = await run(withStart('tonight'), far, w); assert.strictEqual(r.tab, 'todo', 'another day'); await r.ctx.close();
    });
  }
  await test('startTab todo opens To do', async () => { const r = await run(withStart('todo'), NIGHT); assert.strictEqual(r.tab, 'todo'); await r.ctx.close(); });
  await test('Options: Start on is a setting; Roster removes the key; the setting is in the file', async () => {
    const r = await run(withStart(''), NIGHT); await r.page.evaluate(() => App.showTab('options')); await r.page.waitForSelector('#optStartTab');
    await r.page.selectOption('#optStartTab', 'todo'); await r.page.waitForTimeout(150); await r.page.click('#btnDraftApply'); await r.page.waitForTimeout(200); assert.strictEqual(await r.page.evaluate(() => App.season.config.startTab), 'todo');
    await r.page.selectOption('#optStartTab', 'roster'); await r.page.waitForTimeout(150); await r.page.click('#btnDraftApply'); await r.page.waitForTimeout(200); assert.strictEqual(await r.page.evaluate(() => 'startTab' in App.season.config), false, 'the key is removed'); await r.ctx.close();
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
