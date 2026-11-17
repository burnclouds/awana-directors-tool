// The Progress sheet: the date received sits under each book's tab, the book the child is in is worked out and marked and opens first, and the Person tab shows it instead of asking for a code. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/received-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  await tab('person'); await page.waitForTimeout(400); await page.selectOption('#peGroup', 'Sparks'); await page.waitForTimeout(300);
  // A Sparks child like Judah: WR finished (all core sections), no handbook code, HG never recorded.
  const id = await page.evaluate(() => { const A = App, M = Model, S = Season, k = A.master.people.find(x => M.isActive(x) && M.isClubber(x) && M.groupOf(M.room(x)) === 'Sparks'), id = k.x_ClubberID;
    A.season.handbooks[id] = "WR '25-26 / SS 260923"; ['HG', 'WR', 'SS'].forEach(b => delete (A.season.progress[id] || {})[b]); A.season.doneBooks = {}; A.season.received = {};
    A.season.config.progress.Sparks.perBook.forEach(bl => bl.items.forEach(i => S.setProgress(A.season, id, 'WR', bl.key + '.' + i, '2026-09-23'))); A.touch(); return id; });
  await page.selectOption('#pePerson', id); await page.waitForTimeout(500);
  await test('the handbook row is gone from the sheet; the book the child is in (SkyStormer, after Wingrunner) opens first and is marked', async () => {
    assert.strictEqual(await page.locator('#progressWrap .hbbox').count(), 0, 'no handbook boxes on Progress');
    const on = await page.$eval('.booktabs button.on', e => e.textContent.replace(/\s+/g, ' ').trim()), cur = await page.$eval('.booktabs button.cur', e => e.textContent.replace(/\s+/g, ' ').trim());
    assert(/SkyStormer/.test(on) && /SkyStormer/.test(cur), on + ' | ' + cur);
  });
  await test('the date received is under the book tab: typed digit by digit it is saved, shown after a redraw, and kept per book', async () => {
    const box = page.locator('input[data-recv="SS"]'); await box.focus(); await page.keyboard.type('09232026', { delay: 50 }); await page.waitForTimeout(200);
    assert.strictEqual(await page.evaluate(i => App.season.received[i].SS, id), '2026-09-23'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(400);
    await page.click('.booktabs button[data-book="WR"]'); await page.waitForTimeout(300); assert.strictEqual(await page.inputValue('input[data-recv="WR"]'), '', 'another book has its own date');
    await page.click('button[data-recvtoday="WR"]'); await page.waitForTimeout(300); assert.strictEqual(await page.evaluate(i => App.season.received[i].WR, id), await page.evaluate(() => App.today()));
  });
  await test('the Person tab says which book is in use (worked out) beside the handbook on file, which stays editable; the note change keeps the stored code', async () => {
    await tab('person'); await page.waitForTimeout(300); await page.selectOption('#pePerson', id); await page.waitForTimeout(400); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(200);
    const t = await page.textContent('.hbbox'); assert(/Book in use:\s*SkyStormer/.test(t) && /worked out/.test(t), t); assert.strictEqual(await page.inputValue('.hbbox input[data-hb="code"]'), 'WR', 'the code on file is still there to edit');
    await page.fill('.hbbox input[data-hb="note"]', "WR '25-26 / SS 260923 (moved up)"); await page.dispatchEvent('.hbbox input[data-hb="note"]', 'change'); await page.waitForTimeout(300);
    const hb = await page.evaluate(i => Season.handbookParts(App.season.handbooks[i]), id); assert.strictEqual(hb.code, 'WR', 'the stored code is untouched'); assert(/moved up/.test(hb.note));
  });
  await test('an award for that child names the worked-out book: a Blue Jewel is SS, and Judah-style children are not flagged "needs a handbook"', async () => {
    assert.strictEqual(await page.evaluate(i => Season.jewelName(App.season, i, 1), id), 'SS Blue Jewel 1');
    assert.strictEqual(await page.evaluate(i => Season.childBook(App.season, i), id), 'SS');
  });
  await test('T&T: with Start Zone finished and no date received, a button offers the Start Zone date (it is never filled in by itself)', async () => {
    await tab('person'); await page.waitForTimeout(300); await page.selectOption('#peGroup', 'T&T'); await page.waitForTimeout(300);
    const t = await page.evaluate(() => { const A = App, M = Model, S = Season, k = A.master.people.find(x => M.isActive(x) && M.isClubber(x) && M.groupOf(M.room(x)) === 'T&T'), id = k.x_ClubberID;
      A.season.handbooks[id] = ''; delete A.season.handbooks[id]; A.season.received = {}; S.setProgress(A.season, id, 'common', 'SZ.1', '2026-09-09'); S.setProgress(A.season, id, 'common', 'SZ.2', '2026-09-16'); A.touch(); return id; });
    await page.selectOption('#pePerson', t); await page.waitForTimeout(300); await page.click('#peSub button[data-sub="progress"]'); await page.waitForTimeout(500); assert.strictEqual(await page.inputValue('#progressWrap input[data-recv]'), '', 'not filled in by itself');
    const b = page.locator('#progressWrap button[data-recvsz]'); assert(/Use Start Zone finished 9\/16/.test(await b.textContent())); await b.click(); await page.waitForTimeout(400);
    assert.strictEqual(await page.inputValue('input[data-recv]'), '2026-09-16'); assert.strictEqual(await page.locator('button[data-recvsz]').count(), 0, 'gone once a date is there');
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
