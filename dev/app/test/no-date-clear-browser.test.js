// N43: (a) typing a real date clears a box's "no date" line and Clear button at once; (b) the Date received "no date" tick sits on the same line as its box; (c) a book finished before shows no sections, but keeps its reviews, and unticking brings the sections back. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/no-date-clear-browser.test.js
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
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => document.querySelector('.tabs button[data-tab="person"]').click()); await page.waitForTimeout(300);      // open the Person tab first: a change made on another tab is held as a draft
  // a Sparks child, and a sign-off in HG marked "no date" (as a Given no-date tick does)
  const { id, key } = await page.evaluate(() => { const M = Model, S = Season, s = App.season; const k = App.master.people.find(p => M.isActive(p) && M.isClubber(p) && M.groupOf(M.room(p)) === 'Sparks')[M.X.ID];
    const b = s.config.progress.Sparks.perBook[0], key = b.key + '.' + b.items[0];
    s.handbooks[k] = 'HG';      // the sheet opens on the child's book: Hangglider
    S.markSignsNoDate(s, k, 'HG', [key], '2026-11-03'); App.touch(); return { id: k, key }; });
  await page.evaluate(i => App.showPerson(i, { sub: 'progress' }), id); await page.waitForTimeout(500);
  await test('(a) typing a date clears the box\'s "no date" line and Clear button', async () => {
    const before = await page.locator('#progressWrap button[data-clearnd]').count(); assert(before >= 1, 'the no-date mark is shown first');
    const box = page.locator('#progressWrap input[data-scope="HG"][data-key="' + key + '"]');
    await box.fill('2026-11-04'); await box.press('Tab'); await page.waitForTimeout(300);
    const left = await page.evaluate(k => { const c = document.querySelector('#progressWrap input[data-scope="HG"][data-key="' + k + '"]').closest('.pcell'); return { status: [...c.querySelectorAll('.status')].filter(s => s.textContent.trim() === 'no date').length, clear: c.querySelectorAll('button[data-clearnd]').length }; }, key);
    assert.strictEqual(left.status, 0, '"no date" line still shown'); assert.strictEqual(left.clear, 0, 'Clear still shown');
  });
  await test('(b) the Date received "no date" tick is on the same line as its box', async () => {
    const same = await page.evaluate(() => { const r = document.querySelector('.recvrow'); if (!r) return 'no row'; const u = r.querySelector('.uov'); if (!u) return 'no tick'; return getComputedStyle(u).display; });
    assert(same === 'inline-block' || same === 'no tick' || same === 'no row', 'display: ' + same);
  });
  await test('(c) a book finished before shows no sections, keeps its reviews, and unticking brings them back', async () => {
    const sectionsShown = () => page.evaluate(() => [...document.querySelectorAll('#progressWrap .pblock:not(.bookaward)')].filter(b => !/review/i.test((b.querySelector('.plabel') || {}).textContent || '')).length);
    const shown = await sectionsShown(); assert(shown >= 1, 'sections shown first');
    await page.evaluate(i => { App.season.doneBooks = App.season.doneBooks || {}; App.season.doneBooks[i] = ['HG']; App.touch(); }, id);
    await page.evaluate(i => App.showPerson(i, { sub: 'progress' }), id); await page.waitForTimeout(500);
    assert.strictEqual(await sectionsShown(), 0, 'sections still shown for a book finished before');
    const kept = await page.evaluate(i => App.season.progress[i] && App.season.progress[i].HG && Object.keys(App.season.progress[i].HG).length, id); assert(kept >= 1, 'the dates were deleted');
    await page.evaluate(i => { App.season.doneBooks[i] = []; App.touch(); }, id);
    await page.evaluate(i => App.showPerson(i, { sub: 'progress' }), id); await page.waitForTimeout(500);
    assert(await sectionsShown() >= 1, 'sections did not come back');
  });
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
