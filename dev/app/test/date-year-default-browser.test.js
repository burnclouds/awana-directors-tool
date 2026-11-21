// Date boxes default to this year: type month and day, leave the box, and the year is this year; a short year means 20xx; a typed year is left alone. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/date-year-default-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); page.on('dialog', d => d.accept()); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const year = await page.evaluate(() => App.today().slice(0, 4));
  await page.evaluate(() => { const b = document.getElementById('btnDraftApply'); if (b && !b.closest('[hidden]')) b.click(); });
  const kid = await page.evaluate(() => { const p = App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'Sparks'); const id = p[Model.X.ID]; App.season.progress = {}; App.touch(); return id; });
  await page.evaluate(() => document.querySelector('.tabs button[data-tab="person"]').click()); await page.waitForTimeout(300);
  const setSel = (sel, v) => page.evaluate(([s, v]) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
  await setSel('#peGroup', 'Sparks'); await page.waitForTimeout(300); await setSel('#pePerson', kid); await page.waitForTimeout(400);
  await page.evaluate(() => { const b = document.querySelector('.booktabs button[data-book="HG"]'); if (b) b.click(); }); await page.waitForTimeout(300);
  const box = i => page.locator('#progressWrap input[type=date][data-key="FLT.' + i + '"]'), saved = i => page.evaluate(([id, k]) => ((App.season.progress[id] || {}).common || {})[k] || '', [kid, 'FLT.' + i]);
  const type = async (i, keys) => { await box(i).click({ position: { x: 12, y: 10 } }); await page.keyboard.type(keys); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(250); };

  await test('month and day typed, no year: the year is this year', async () => { await type(1, '1014'); assert.strictEqual(await saved(1), year + '-10-14'); });
  await test('with slashes and a one-digit month and day', async () => { await type(2, '3/5'); assert.strictEqual(await saved(2), year + '-03-05'); });
  await test('a typed year is left alone', async () => { await type(3, '10142025'); assert.strictEqual(await saved(3), '2025-10-14'); });
  await test('an impossible day is not filled in', async () => { await type(5, '0230'); assert.strictEqual(await saved(5), ''); });
  await test('Enter in the box also fills the year', async () => { await box(6).click({ position: { x: 12, y: 10 } }); await page.keyboard.type('1021'); await page.keyboard.press('Enter'); await page.waitForTimeout(300); assert.strictEqual(await saved(6), year + '-10-21'); });
  await test('Flight 3:16 "Same date": offered only after a box is dated; fills this box and every empty one before it with the last date; Today is still there', async () => {
    await page.evaluate(id => { App.season.progress = {}; Season.setProgress(App.season, id, 'common', 'FLT.1', '2026-09-16'); App.touch(); App.refresh(); }, kid);
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="roster"]').click()); await page.waitForTimeout(200);
    await page.evaluate(() => { const b = document.getElementById('btnDraftApply'); if (b && !b.closest('[hidden]')) b.click(); }); await page.evaluate(() => document.querySelector('.tabs button[data-tab="person"]').click()); await page.waitForTimeout(400);
    await setSel('#pePerson', kid); await page.waitForTimeout(400); await page.evaluate(() => { const b = document.querySelector('.booktabs button[data-book="HG"]'); if (b) b.click(); }); await page.waitForTimeout(300);
    const flt = page.locator('#progressWrap .pblock', { hasText: 'Flight 3:16 Booklet' });
    assert.strictEqual(await flt.locator('button[data-copylast]').count(), 5, 'one beside Today on each empty box after a dated one'); assert.strictEqual(await flt.locator('button[data-today]').count(), 5);
    await flt.locator('.pcell', { has: page.locator('input[data-key="FLT.4"]') }).locator('button[data-copylast]').click(); await page.waitForTimeout(300);
    const f = await page.evaluate(id => (App.season.progress[id] || {}).common, kid); assert.deepStrictEqual(f, { 'FLT.1': '2026-09-16', 'FLT.2': '2026-09-16', 'FLT.3': '2026-09-16', 'FLT.4': '2026-09-16' }, JSON.stringify(f));
    await flt.locator('.pcell', { has: page.locator('input[data-key="FLT.6"]') }).locator('button[data-copylast]').click(); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(id => Object.keys(App.season.progress[id].common).length, kid), 6, 'all six signed off'); assert(await flt.evaluate(e => e.classList.contains('done')), 'the block is complete');
    assert.strictEqual(await flt.locator('button[data-copylast]').count(), 0, 'no Same date buttons in this block once nothing in it is empty');      // other blocks still offer the last date entered for their first box (it is a paste of the last date anywhere)
  });
  await test('Same date works in every section row (Rank here, and the jewel review rows), filling only the empty boxes up to the one pressed', async () => {
    const keys = await page.evaluate(() => { const b = [...document.querySelectorAll('#progressWrap .pblock')].find(x => /^Rank/.test(x.querySelector('.plabel').textContent)); return b ? [...b.querySelectorAll('input[data-key]')].map(i => i.dataset.key) : []; });
    assert(keys.length >= 4, 'the Rank block has its boxes: ' + keys.length);
    await page.evaluate(([id, k0, k2]) => { Season.setProgress(App.season, id, 'HG', k0, '2026-09-23'); Season.setProgress(App.season, id, 'HG', k2, '2026-09-30'); App.touch(); App.refresh(); }, [kid, keys[0], keys[2]]);
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="roster"]').click()); await page.waitForTimeout(200);
    await page.evaluate(() => { const b = document.getElementById('btnDraftApply'); if (b && !b.closest('[hidden]')) b.click(); }); await page.evaluate(() => document.querySelector('.tabs button[data-tab="person"]').click()); await page.waitForTimeout(400);
    await setSel('#pePerson', kid); await page.waitForTimeout(400); await page.evaluate(() => { const b = document.querySelector('.booktabs button[data-book="HG"]'); if (b) b.click(); }); await page.waitForTimeout(300);
    const rank = page.locator('#progressWrap .pblock', { hasText: 'Rank' }).first();
    await rank.locator('.pcell', { has: page.locator('input[data-key="' + keys[4] + '"]') }).locator('button[data-copylast]').click(); await page.waitForTimeout(300);
    const got = await page.evaluate(([id, ks]) => ks.map(k => ((App.season.progress[id] || {}).HG || {})[k] || ''), [kid, keys]);
    assert.deepStrictEqual(got.slice(0, 5), ['2026-09-23', '', '2026-09-30', '2026-09-30', '2026-09-30'], 'boxes 4 and 5 take the last date before them (box 3); box 2, before that date, is not touched: ' + JSON.stringify(got));
  });
  await test('a whole date typed in a sign-off box is saved at once: the block turns green, the Awards badge and pace follow, and focus moves to the next date box', async () => {
    await page.evaluate(id => { App.season.progress = {}; App.season.awards = {}; App.season.given = {}; App.season.handbooks[id] = 'HG 260916'; ['1', '2', '3'].forEach(i => Season.setProgress(App.season, id, 'HG', 'RJ1.' + i, '2026-10-0' + i)); App.touch(); App.refresh(); }, kid);
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="roster"]').click()); await page.waitForTimeout(200);
    await page.evaluate(() => { const b = document.getElementById('btnDraftApply'); if (b && !b.closest('[hidden]')) b.click(); }); await page.evaluate(() => document.querySelector('.tabs button[data-tab="person"]').click()); await page.waitForTimeout(400);
    await setSel('#pePerson', kid); await page.waitForTimeout(400); await page.evaluate(() => { const b = document.querySelector('.booktabs button[data-book="HG"]'); if (b) b.click(); }); await page.waitForTimeout(300);
    const badge = async () => +(await page.textContent('#awardsBadge') || 0), b0 = await badge(), blk = () => page.locator('#progressWrap .pblock', { hasText: 'Red Jewel 1' }).first();
    assert.strictEqual(await blk().evaluate(e => e.classList.contains('done')), false);
    await page.locator('#progressWrap input[type=date][data-key="RJ1.4"]').click({ position: { x: 12, y: 10 } }); await page.keyboard.type('10042026'); await page.waitForTimeout(500);
    assert.strictEqual(await blk().evaluate(e => e.classList.contains('done')), true, 'block done with no page change'); assert(await badge() > b0, 'the Awards badge counts the new awards');
    assert.strictEqual(await page.evaluate(() => /^(gaward|aaward|key)$/.test(Object.keys(document.activeElement.dataset).find(k => /^(gaward|aaward|key)$/.test(k)) || '')), true, 'focus moved to another date box');
  });
  await test('Date received has a "no date" tick: the box stays empty, Today goes, the printed record shows a check; un-ticking clears it', async () => {
    await page.evaluate(id => { delete (App.season.received || {})[id]; App.season.handbooks[id] = ''; App.touch(); App.refresh(); }, kid);
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="roster"]').click()); await page.waitForTimeout(200);
    await page.evaluate(() => { const b = document.getElementById('btnDraftApply'); if (b && !b.closest('[hidden]')) b.click(); }); await page.evaluate(() => document.querySelector('.tabs button[data-tab="person"]').click()); await page.waitForTimeout(400);
    await setSel('#pePerson', kid); await page.waitForTimeout(400); await page.evaluate(() => { const b = document.querySelector('.booktabs button[data-book="HG"]'); if (b) b.click(); }); await page.waitForTimeout(300);
    assert.strictEqual(await page.locator('#progressWrap button[data-recvtoday="HG"]').count(), 1, 'Today is offered before anything is entered');
    await page.locator('#progressWrap input[data-recvnd="HG"]').click(); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(id => App.season.received[id].HG, kid), 'no date'); assert.strictEqual(await page.locator('#progressWrap input[data-recv="HG"]').inputValue(), '', 'no day in the box');
    assert.strictEqual(await page.locator('#progressWrap button[data-recvtoday="HG"]').count(), 0, 'Today goes once the book is received'); assert.strictEqual(await page.locator('#progressWrap input[data-recvnd="HG"]').isChecked(), true);
    await page.evaluate(({ id, room }) => { App.showReport('progressSheets'); App.reportOptions({ room, kid: id, books: 'all' }); }, { id: kid, room: await page.evaluate(id => Model.room(App.master.people.find(p => p.x_ClubberID === id)), kid) }); await page.waitForTimeout(500);
    assert(/Received: <b class="rc">✓ no date<\/b>/.test(await page.evaluate(() => document.getElementById('report').innerHTML.replace(/&#10003;/g, '✓'))), 'the printed record says no date');      // the record sheet header (was "Received: ✓ (no date)")
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="person"]').click()); await page.waitForTimeout(400);
    await page.locator('#progressWrap input[data-recvnd="HG"]').click(); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(id => (App.season.received || {})[id] === undefined || (App.season.received[id].HG || '') === '', kid), true, 'un-ticking clears it');
  });
  await test('Tab skips the Today and Same date buttons in the sheet', async () => {
    assert.strictEqual(await page.evaluate(() => [...document.querySelectorAll('#progressWrap .todaybtn[data-today], #progressWrap .todaybtn[data-copylast], #progressWrap .todaybtn[data-gsame], #progressWrap .todaybtn[data-asame], #progressWrap .todaybtn[data-rsame], #progressWrap .todaybtn[data-recvsame]')].filter(b => b.tabIndex !== -1).length), 0);
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
