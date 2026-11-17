// "Announced, no date" on the Progress sheet: an earned award can be counted as told to the group with no date, shown as a tick that can be cleared.
// Invented test club only (dev/test-data).
// Usage: NODE_PATH=<dir with playwright> node test/told-no-date-browser.test.js
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
  // A Sparks child with an earned award that has no announce date yet (set up in the page, as the Awards tab would record it).
  // Finish Red Jewel 1 in the HG book for one Sparks child, which earns it (as the progress sheet does), so there is an earned award not yet announced.
  const setup = await page.evaluate(() => {
    const M = window.Model, S = window.Season, s = window.App.season;
    const p = window.App.master.people.find(x => M.isActive(x) && M.isClubber(x) && M.groupOf(M.room(x)) === 'Sparks'), id = p[M.X.ID];
    s.handbooks[id] = 'HG 260916';
    [1, 2, 3, 4].forEach(i => S.setProgress(s, id, 'HG', 'RJ1.' + i, '2026-10-0' + i));
    window.App.touch();
    const sug = S.suggestedAwards(s, id, 'Sparks');
    return { id, award: sug.length ? sug[0].award : null };
  });
  await page.evaluate(id => window.App.showPerson(id), setup.id); await page.waitForTimeout(400);
  await page.click('#peSub button[data-sub="progress"]'); await page.waitForTimeout(300);
  await test('an earned award with no announce date shows a "no date" tick beside Announced, unticked', async () => {
    assert(setup.award, 'the test club has an earned, not yet announced Sparks award');
    const sel = 'input[data-annnodate-tick="' + setup.award + '"]';
    assert(await page.locator(sel).count() === 1, 'the tick is on the sheet');
    assert.strictEqual(await page.isChecked(sel), false, 'not ticked at first');
  });
  await test('ticking it counts the award as announced with no date; unticking takes it back', async () => {
    const a = setup.award, sel = 'input[data-annnodate-tick="' + a + '"]';
    await page.check(sel); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(([i, x]) => window.Season.isAnnNoDate(window.App.season, i, x), [setup.id, a]), true, 'saved as told, no date');
    await page.uncheck(sel); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(([i, x]) => window.Season.isAnnNoDate(window.App.season, i, x), [setup.id, a]), false, 'taken back');
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
