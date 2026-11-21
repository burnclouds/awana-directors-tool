const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });

// Given, date unknown, in the real app: the Awards tab and the Progress tab can mark an award given with no date, nothing shows the ticked day as a given date (screen or printed record), and un-ticking undoes it.
// Usage: NODE_PATH=<dir with playwright> node test/given-nodate-browser.test.js
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext()).newPage(); page.on('dialog', d => d.accept()); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  const kid = await page.evaluate(() => { const p = App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'Sparks'); return { id: p[Model.X.ID] || Model.idOf(p), room: Model.room(p) }; });
  const AW = 'Test Award';
  await page.evaluate(({ id, AW }) => { Season.addAward(App.season, '2026-10-21', id, AW); App.touchSeason && App.touchSeason(); }, { id: kid.id, AW });

  await test('Awards tab: Given and "no date" are not on it (they are on Progress); an award marked given with no date leaves To hand out', async () => {
    await tab('awards'); await page.waitForTimeout(400); await page.selectOption('#awGroup', 'Sparks'); await page.waitForTimeout(400);
    await page.click('#awSubs button[data-awsub="hand"]'); await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('#awardsWrap input[data-given2], #awardsWrap input[data-given-nd]').count(), 0, 'no Given or no-date boxes on the Awards tab');
    assert(/Test Award/.test(await page.textContent('#awSecHand')), 'an announced award not yet given waits on To hand out');
    await page.evaluate(({ id, AW }) => { Season.setGiven(App.season, id, AW, '2026-11-03', { noDate: true }); App.touchSeason && App.touchSeason(); }, { id: kid.id, AW });
    await tab('person'); await page.waitForTimeout(200); await tab('awards'); await page.waitForTimeout(400); await page.click('#awSubs button[data-awsub="hand"]'); await page.waitForTimeout(200);
    assert(!/Test Award/.test(await page.textContent('#awSecHand')), 'given (no date): it has left To hand out');
    await page.evaluate(({ id, AW }) => { Season.setGiven(App.season, id, AW, ''); App.touchSeason && App.touchSeason(); }, { id: kid.id, AW });
  });
  // Flight 3:16 has no award to give (its block only shows Complete), so the Progress tests use Red Jewel 1 of the Hangglider book, which has a Given box on every child's HG sheet once given.
  const AW2 = 'HG Green Jewel 1';      // (not Red Jewel 1: since N56 it shares the Wings/Red 1 cell with the Pilot Wing, which shows as given only when both are)
  const open = async () => { await page.evaluate(({ id }) => { ui_kid = id; }, { id: kid.id }).catch(() => {}); await tab('person'); await page.waitForTimeout(300); await page.selectOption('#peGroup', 'Sparks'); await page.selectOption('#peClass', kid.room).catch(() => {}); await page.selectOption('#pePerson', kid.id); await page.waitForTimeout(400); await page.click('.booktabs button[data-book="HG"]'); await page.waitForTimeout(200); };

  await test('Progress tab: a no-date award shows an empty date box, the "no date" tick on and no Today button; ticking and un-ticking round trips', async () => {
    await page.evaluate(({ id, AW2 }) => { Season.setGiven(App.season, id, AW2, '2026-11-03', { noDate: true }); }, { id: kid.id, AW2 });
    await open();
    const box = page.locator('input[data-gaward="' + AW2 + '"]'); assert.strictEqual(await box.inputValue(), '', 'the ticked day is not shown in the Given date box');
    assert.strictEqual(await page.locator('input[data-gnodate="' + AW2 + '"]').isChecked(), true, 'the no-date tick is on');
    assert.strictEqual(await page.locator('button[data-gtoday="' + AW2 + '"]').count(), 0, 'no Today button on an award already given');
    await box.focus(); await box.blur(); await page.waitForTimeout(250);      // leaving the empty box alone must not clear the give
    assert.strictEqual(await page.evaluate(({ id, AW2 }) => Season.isGivenNoDate(App.season, id, AW2), { id: kid.id, AW2 }), true, 'still given, no date');
    await page.locator('input[data-gnodate="' + AW2 + '"]').click(); await page.waitForTimeout(300);      // un-tick (an award not earned yet loses its Given box once it is not given, so click rather than uncheck)
    assert.strictEqual(await page.evaluate(({ id, AW2 }) => !!(App.season.given[id] || {})[AW2], { id: kid.id, AW2 }), false, 'un-ticking clears it');
    await page.evaluate(({ id, AW2 }) => Season.setGiven(App.season, id, AW2, '2026-11-03', { noDate: true }), { id: kid.id, AW2 }); await open();
    await page.fill('input[data-gaward="' + AW2 + '"]', '2026-10-28'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(({ id, AW2 }) => [Season.isGivenNoDate(App.season, id, AW2), Season.givenShown(App.season, id, AW2)], { id: kid.id, AW2 }).then(x => x.join()), 'false,2026-10-28', 'typing a real date replaces the no-date mark');
  });
  await test('the printed Achievement Record shows a check and "no date", never the day the box was ticked', async () => {
    await page.evaluate(({ id, AW2, today }) => { App.season.handbooks[id] = 'HG 260916'; Season.setGiven(App.season, id, AW2, today, { noDate: true }); },{ id: kid.id, AW2, today: '2026-11-03' });
    await page.evaluate(({ id, room }) => { App.showReport('progressSheets'); App.reportOptions({ room, kid: id, books: 'all' }); }, { id: kid.id, room: kid.room }); await page.waitForTimeout(600);
    const text = (await page.textContent('#report')).replace(/\s+/g, ' ');
    assert(/\u2713 no date/.test(text), 'the record says "no date"');      // the record sheet prints "\u2713 no date" in the Given box (was "\u2713 (no date)") assert(!/11\/03\/26/.test(text), 'the ticked day 11/03/26 is not printed');
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
