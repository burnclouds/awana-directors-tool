// The Hand out list: "Given today" and "no date" on a row record the award as handed over, from the list itself.
// Invented test club only (dev/test-data).
// Usage: NODE_PATH=<dir with playwright> node test/hand-out-given-browser.test.js
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
  // Finish Red Jewel 1 in the HG book for one Sparks child, so an award is earned and waiting to be handed out.
  const setup = await page.evaluate(() => {
    const M = window.Model, S = window.Season, s = window.App.season;
    const p = window.App.master.people.find(x => M.isActive(x) && M.isClubber(x) && M.groupOf(M.room(x)) === 'Sparks'), id = p[M.X.ID];
    s.handbooks[id] = 'HG 260916';
    [1, 2, 3, 4].forEach(i => S.setProgress(s, id, 'HG', 'RJ1.' + i, '2026-10-0' + i));
    window.App.touch();
    const sug = S.suggestedAwards(s, id, 'Sparks');
    return { id, award: sug.length ? sug[0].award : null };
  });
  await page.evaluate(() => window.App.showTab('awards')); await page.waitForTimeout(300);
  await page.click('#awSubs button[data-awsub="hand"]'); await page.waitForTimeout(300);
  await test('a Hand out row has a Given today button and a no-date tick', async () => {
    assert(setup.award, 'an earned Sparks award is waiting');
    assert(await page.locator('button[data-hogtoday="' + setup.id + '"][data-hoaward="' + setup.award + '"]').count() === 1, 'the Given today button is on the row');
    assert(await page.locator('input[data-hognodate="' + setup.id + '"][data-hoaward="' + setup.award + '"]').count() === 1, 'the no-date tick is on the row');
  });
  await test('Given today records the award as handed over today, and it leaves Hand out', async () => {
    await page.click('button[data-hogtoday="' + setup.id + '"][data-hoaward="' + setup.award + '"]'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(([i, a]) => window.Season.givenShown(window.App.season, i, a), [setup.id, setup.award]), await page.evaluate(() => window.App.today()), 'recorded today');
    assert(await page.locator('button[data-hogtoday="' + setup.id + '"][data-hoaward="' + setup.award + '"]').count() === 0, 'no longer on Hand out');
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
