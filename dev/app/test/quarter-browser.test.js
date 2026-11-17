// The default quarter in a real browser: a fresh browser follows the calendar, and a quarter typed by hand is only an override that expires.
// Usage: NODE_PATH=<dir with playwright> node test/quarter-browser.test.js        (invented test club only)
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
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
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const open = async (day, saved) => {
    const ctx = await browser.newContext(), page = await ctx.newPage(); page.on('dialog', d => d.accept());
    if (saved) await page.addInitScript(s => { try { localStorage.setItem('awana.settings', s); } catch (e) { /* none */ } }, JSON.stringify(saved));
    await page.clock.setFixedTime(new Date(day + 'T12:00:00')); await page.goto(url);
    await page.setInputFiles('#splashFiles', [DATA]); await page.waitForTimeout(700);
    return { page, ctx };
  };
  await test('a fresh browser on 2027-01-15 is in Q3: settings, Roster column and the Attendance night all agree', async () => {
    const { page, ctx } = await open('2027-01-15');
    assert.strictEqual(await page.evaluate(() => App.settings.quarter), 'Q3');
    assert(/Q3 team/.test(await page.locator('#rosterWrap thead').innerText()), 'Roster column is Q3');
    await page.click('button[data-tab="attend"]'); await page.waitForTimeout(200);
    assert(/\(Q3\)/.test(await page.locator('#attDate option:checked').innerText()), 'Attendance opens on a Q3 night');
    await ctx.close();
  });
  await test('a quarter typed by hand holds for a week (this page session), then the calendar takes over again', async () => {
    const { page, ctx } = await open('2027-01-15');
    await page.click('button[data-tab="reports"]'); await page.click('#qWrap button[data-q="Q1"]'); await page.waitForTimeout(200);
    assert.strictEqual(await page.evaluate(() => App.settings.quarter), 'Q1');
    await page.clock.setFixedTime(new Date('2027-01-18T12:00:00')); await page.click('button[data-tab="roster"]'); await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(() => App.settings.quarter), 'Q1', 'three days old: still the override');
    await page.clock.setFixedTime(new Date('2027-01-23T12:00:00')); await page.evaluate(() => App.refresh()); await page.waitForTimeout(150);      // any refresh (an edit, a tab) re-reads the quarter
    const after = await page.evaluate(() => [App.settings.quarter, App.settings.quarterOverride, new Date().toDateString()]);
    assert.strictEqual(after[0], 'Q3', 'eight days old: expired (page says ' + JSON.stringify(after) + ')'); await ctx.close();
  });
  await test('choosing a quarter on the Reports tab becomes an override kept in memory with today\'s date, and nothing is written to the browser', async () => {
    const { page, ctx } = await open('2027-01-15');
    await page.click('button[data-tab="reports"]'); await page.click('#qWrap button[data-q="Q4"]'); await page.waitForTimeout(200);
    const s = await page.evaluate(() => ({ q: App.settings.quarter, o: App.settings.quarterOverride, keys: Object.keys(localStorage).filter(k => /^awana/.test(k)) }));
    assert.strictEqual(s.q, 'Q4'); assert.deepStrictEqual(s.o, { q: 'Q4', on: '2027-01-15' });
    assert(!s.keys.includes('awana.settings'), 'no settings key in the browser');
    await ctx.close();
  });
  await test('the Quarter chooser, and its note show only on reports that depend on the quarter', async () => {
    const { page, ctx } = await open('2027-01-15');
    await page.click('button[data-tab="reports"]');
    const shown = async id => page.evaluate(i => { const e = document.getElementById(i); return !!e && !e.hidden && e.offsetParent !== null; }, id);
    for (const [report, want] of [['attendance', true], ['teams', true], ['binderClass', false], ['uniforms', false], ['binderAll', false], ['handbooks', false]]) {
      await page.selectOption('#rSel', report); await page.waitForTimeout(150);
      for (const id of ['qWrap']) assert.strictEqual(await shown(id), want, report + ': ' + id + ' should be ' + (want ? 'shown' : 'hidden'));
      if (!want) assert.strictEqual(await shown('calNote'), false, report + ': the nights note should be hidden');
    }
    await ctx.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
