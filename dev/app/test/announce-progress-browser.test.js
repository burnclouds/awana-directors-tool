// Announced and Hold on the Progress sheet, per earned award: the same flags the Awards tab uses; clearing Announced never touches Given. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/announce-progress-browser.test.js
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
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  const kid = await page.evaluate(() => { const p = App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'Sparks'); const id = p[Model.X.ID];
    App.season.awards = {}; App.season.given = {}; App.season.givenNoDate = {}; App.season.held = {}; App.season.progress = {}; App.season.handbooks[id] = 'HG 260916';
    ['1', '2', '3', '4'].forEach(i => Season.setProgress(App.season, id, 'HG', 'RJ1.' + i, '2026-10-0' + i)); App.touch(); return { id, room: Model.room(p) }; });
  const AW = 'HG Red Jewel 1', HOLD = '#progressWrap input[data-hold="HG Red Jewel 1"]';      // the Awards tab has a Hold box for the same award too, so this one is scoped to the Progress sheet
  const open = async () => { await tab('person'); await page.waitForTimeout(300); await page.selectOption('#peGroup', 'Sparks'); await page.selectOption('#peClass', kid.room).catch(() => {}); await page.selectOption('#pePerson', kid.id); await page.waitForTimeout(400); await page.click('.booktabs button[data-book="HG"]'); await page.waitForTimeout(200); };
  const state = () => page.evaluate(({ id, AW }) => ({ held: Season.isHeld(App.season, id, AW), nights: Season.awardsOf(App.season, id).filter(a => a.award === AW).map(a => a.date), given: (App.season.given[id] || {})[AW] || '', pending: Season.pendingAwards(App.season, id, 'Sparks', App.calendar).map(r => r.award) }), { id: kid.id, AW });

  await test('an earned award shows an empty Announced date and an unchecked Hold box', async () => {
    await open(); assert.strictEqual(await page.locator('input[data-aaward="' + AW + '"]').inputValue(), ''); assert.strictEqual(await page.locator(HOLD).isChecked(), false);
  });
  await test('ticking Hold on Progress sets the same flag the Awards tab shows (a dimmed, held row), and unticking releases it', async () => {
    await page.locator(HOLD).click(); await page.waitForTimeout(300); assert.strictEqual((await state()).held, true);
    await tab('awards'); await page.waitForTimeout(400); await page.click('#awSubs button[data-awsub="announce"]'); await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('#awSecAnnounce tbody tr.held').count() > 0, true, 'held row on the Awards tab');
    await open(); await page.locator(HOLD).click(); await page.waitForTimeout(300); assert.strictEqual((await state()).held, false, 'released');
  });
  await test('setting Announced takes the award off the pending list and hides its Hold box; clearing it puts it back', async () => {
    const box = page.locator('input[data-aaward="' + AW + '"]'); await box.fill('2026-10-14'); await box.press('Enter'); await page.waitForTimeout(300);
    let st = await state(); assert.deepStrictEqual(st.nights, ['2026-10-14']); assert(!st.pending.includes(AW), 'no longer pending');
    assert.strictEqual(await page.locator(HOLD).count(), 0, 'no Hold box once announced');
    await page.locator('input[data-aaward="' + AW + '"]').fill(''); await page.locator('input[data-aaward="' + AW + '"]').press('Enter'); await page.waitForTimeout(300);
    st = await state(); assert.deepStrictEqual(st.nights, []); assert(st.pending.includes(AW), 'pending again');
  });
  await test('Announced has a Today button: it sets today as the announce night and then goes away', async () => {
    await page.evaluate(({ id, AW }) => { Season.setAnnounced(App.season, id, AW, ''); Season.setGiven(App.season, id, AW, ''); App.touch(); App.refresh(); }, { id: kid.id, AW });
    await tab('roster'); await page.waitForTimeout(200); await open();
    const today = await page.evaluate(() => App.today()), btn = page.locator('#progressWrap button[data-atoday="' + AW + '"]'); assert.strictEqual(await btn.count(), 1, 'offered while Announced is empty');
    await btn.click(); await page.waitForTimeout(300); assert.deepStrictEqual((await state()).nights, [today]); assert.strictEqual(await page.locator('#progressWrap button[data-atoday="' + AW + '"]').count(), 0, 'gone once announced');
  });
  await test('clearing Announced leaves a Given date alone', async () => {
    await page.evaluate(({ id, AW }) => { Season.setAnnounced(App.season, id, AW, '2026-10-14'); Season.setGiven(App.season, id, AW, '2026-10-21'); App.touch(); App.refresh(); }, { id: kid.id, AW });
    await tab('roster'); await page.waitForTimeout(200); await open(); const box = page.locator('input[data-aaward="' + AW + '"]'); assert.strictEqual(await box.inputValue(), '2026-10-14', 'the Announced date is shown');
    await box.fill(''); await box.press('Enter'); await page.waitForTimeout(300); const st = await state(); assert.deepStrictEqual(st.nights, [], 'announcement cleared: ' + JSON.stringify(st)); assert.strictEqual(st.given, '2026-10-21', 'Given kept: ' + JSON.stringify(st));
  });
  await test('Flight 3:16 has no award boxes: once all six are dated the block is green and says Complete', async () => {
    await page.evaluate(({ id }) => { ['1', '2', '3', '4', '5', '6'].forEach((i, n) => Season.setProgress(App.season, id, 'common', 'FLT.' + i, '2026-09-1' + n)); App.touch(); App.refresh(); }, { id: kid.id });
    await tab('roster'); await page.waitForTimeout(200); await open();
    const blk = page.locator('#progressWrap .pblock', { hasText: 'Flight 3:16 Booklet' });
    assert(await blk.evaluate(e => e.classList.contains('done')), 'green (done)'); assert(/Complete/.test(await blk.textContent()), 'says Complete');
    assert.strictEqual(await blk.locator('input[data-gaward], input[data-aaward], input[data-hold], input[data-gnodate]').count(), 0, 'no Given, Announced or Hold boxes');
  });
  await test('every Sparks sheet shows four Blue Jewels (earned by nights present) with their own Given, Announced and Hold boxes', async () => {
    await page.evaluate(id => { const nights = App.nightList().map(n => n.date).slice(0, 7); App.season.given = {}; App.season.awards = {}; nights.forEach(d => { (App.season.attendance[d] = App.season.attendance[d] || {})[id] = { a: 1 }; }); App.touch(); App.refresh(); }, kid.id);
    await tab('roster'); await page.waitForTimeout(200); await open();
    const bj = page.locator('#progressWrap .bjblock'); assert.strictEqual(await bj.count(), 1, 'one Blue Jewels row');
    const boxes = bj.locator('input[type=date][disabled]'); assert.strictEqual(await boxes.count(), 4, 'with four jewels'); const vals = await boxes.evaluateAll(els => els.map(e => e.value)); assert(vals[0] && !vals[1] && !vals[2] && !vals[3], 'only the first is earned after 7 nights present: ' + vals);
    assert(/6 nights/.test(await bj.textContent()) && /27 nights/.test(await bj.textContent()), 'each jewel shows its count of nights (Blue Jewel weeks on Options)'); assert.strictEqual(await bj.evaluate(e => e.classList.contains('done')), false, 'not complete until all four');
    assert.strictEqual(await bj.locator('input[data-gaward]').count(), 1, 'the earned jewel has a Given box, an unearned one has none'); assert.strictEqual(await bj.locator('input[data-aaward]').count(), 1);
    const name = await bj.locator('input[data-gaward]').getAttribute('data-gaward'); assert(/^HG Blue Jewel 1$/.test(name), name);
    await bj.locator('button[data-gtoday]').click(); await page.waitForTimeout(300); assert.strictEqual(await page.evaluate(([i, n]) => (App.season.given[i] || {})[n] || '', [kid.id, name]), await page.evaluate(() => App.today()), 'Given is set on Progress');
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
