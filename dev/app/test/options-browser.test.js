// The Options tab in real Chromium: the team color order (every screen follows it), this year's T&T book (offered to a T&T child with no handbook), game place points, Blue Jewel weeks and the store settings.
// Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/options-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f))), EXPORT = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort()[0]), NEWER = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort().pop());   // NEWER adds 15 registrations, so it needs a review
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
  const open = async () => {
    const ctx = await browser.newContext({ acceptDownloads: true }), page = await ctx.newPage(), msgs = [];
    page.on('dialog', d => { msgs.push(d.message()); d.accept(); }); page.on('pageerror', e => msgs.push('PAGE ERROR ' + e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { page, msgs };
  };
  const tab = (page, n) => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), n);
  const kidOf = (page, group) => page.evaluate(g => { const p = App.master.people.find(q => Model.isActive(q) && Model.isClubber(q) && Model.groupOf(Model.room(q)) === g); return p && p[Model.X.ID]; }, group);

  await test('moving a color on Options changes the order on the Games tab', async () => {
    const { page, msgs } = await open(); await tab(page, 'options'); await page.waitForTimeout(150);
    assert.deepStrictEqual(await page.$$eval('.teamorder .team', e => e.map(x => x.textContent)), ['Red', 'Yellow', 'Green', 'Blue']);
    assert(await page.isDisabled('[data-tmove="Red:-1"]'), 'the first color cannot move up');
    await page.click('[data-tmove="Blue:-1"]'); await page.click('[data-tmove="Blue:-1"]'); await page.waitForTimeout(150);
    assert.deepStrictEqual(await page.$$eval('.teamorder .team', e => e.map(x => x.textContent)), ['Red', 'Blue', 'Yellow', 'Green']);
    assert.deepStrictEqual(await page.evaluate(() => App.season.config.teamOrder), ['Red', 'Blue', 'Yellow', 'Green']);
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.dataset.tmove), 'Blue:-1', 'focus stays on the button that was used');
    await tab(page, 'games'); await page.waitForTimeout(250);
    const games = await page.evaluate(() => [...document.querySelectorAll('#gamesWrap .team')].map(x => x.textContent));
    assert.deepStrictEqual(games.slice(0, 4), ['Red', 'Blue', 'Yellow', 'Green'], games.join());
    assert(!msgs.some(m => /ERROR/.test(m)), msgs.join());
    await page.close();
  });
  await test('the Person tab team picker lists the colors in the chosen order', async () => {
    const { page } = await open(); await page.evaluate(() => { Season.setTeamOrder(App.season, ['Green', 'Blue', 'Red', 'Yellow']); App.touch(); });
    await page.evaluate(i => App.showPerson(i, { sub: 'registration' }), await kidOf(page, 'Sparks')); await page.waitForTimeout(300);
    assert.deepStrictEqual(await page.$$eval('select[data-team="Q1"] option', o => o.map(x => x.textContent).filter(t => t && t !== 'No team')), ['Green', 'Blue', 'Red', 'Yellow']);      // the colors in the chosen order ("No team" is a separate choice listed first)
    await page.close();
  });
  await test('the books table has a This year tick for Cubbies and T&T books (one per group), none for Sparks books', async () => {
    const { page } = await open(); await tab(page, 'options'); await page.waitForTimeout(150);
    const rows = await page.$$eval('table.books tbody tr', r => r.map(x => ({ code: x.dataset.code, tick: !!x.querySelector('[data-yb]') })));
    assert.deepStrictEqual(rows.filter(r => r.tick).map(r => r.code).sort(), ['AS', 'AoG', 'DoG', 'EoG', 'GiA', 'HC'], JSON.stringify(rows));      // the nine standard books assert(rows.filter(r => ['HG', 'WR', 'SS'].includes(r.code)).every(r => !r.tick));
    await page.check('[data-yb="AoG"]'); await page.waitForTimeout(150); await page.check('[data-yb="HC"]'); await page.waitForTimeout(150);
    assert.deepStrictEqual(await page.evaluate(() => App.season.config.yearBook), { Cubbies: 'HC', Sparks: '', 'T&T': 'AoG' });
    await page.uncheck('[data-yb="AoG"]'); await page.waitForTimeout(150);
    assert.deepStrictEqual(await page.evaluate(() => App.season.config.yearBook), { Cubbies: 'HC', Sparks: '', 'T&T': '' });
    await page.close();
  });
  await test('this year\'s book is offered to a T&T or Cubbies child with no handbook, and one tap fills it in', async () => {
    const { page } = await open(); await tab(page, 'options'); await page.waitForTimeout(150); await page.check('[data-yb="AoG"]'); await page.waitForTimeout(150); await page.check('[data-yb="HC"]'); await page.waitForTimeout(150);
    for (const [group, code] of [['T&T', 'AoG'], ['Cubbies', 'HC']]) {
      const kid = await kidOf(page, group); await page.evaluate(i => { delete App.season.handbooks[i]; }, kid);
      await page.evaluate(i => App.showPerson(i, { sub: 'registration' }), kid); await page.waitForTimeout(300);
      assert.strictEqual(await page.$eval('[data-hbuse]', e => e.textContent), 'Use ' + code); assert.strictEqual(await page.$eval('[data-hb="code"]', e => e.placeholder), code);
      assert.strictEqual(await page.evaluate(i => App.season.handbooks[i] || '', kid), '', 'offering does not save anything');
      await page.click('[data-hbuse]'); await page.waitForTimeout(250);
      assert.strictEqual(await page.evaluate(i => Season.handbookParts(App.season.handbooks[i]).code, kid), code);
    }
    await page.close();
  });
  await test('nothing chosen: nothing offered; a Sparks child is never offered a book', async () => {
    const { page } = await open(); const t = await kidOf(page, 'T&T'), sp = await kidOf(page, 'Sparks');
    await page.evaluate(([a, b]) => { delete App.season.handbooks[a]; delete App.season.handbooks[b]; }, [t, sp]);
    await page.evaluate(i => App.showPerson(i, { sub: 'registration' }), t); await page.waitForTimeout(300); assert.strictEqual(await page.$$eval('[data-hbuse]', e => e.length), 0);
    await page.evaluate(() => { App.season.config.yearBook = { Cubbies: 'HC', 'T&T': 'AoG', Sparks: 'HG' }; });
    await page.evaluate(i => App.showPerson(i, { sub: 'registration' }), sp); await page.waitForTimeout(300); assert.strictEqual(await page.$$eval('[data-hbuse]', e => e.length), 0);
    await page.close();
  });
  await test('moving a book to another group, changing its code or deleting it clears it as the year\'s book', async () => {
    const { page } = await open(); await tab(page, 'options'); await page.waitForTimeout(150); await page.check('[data-yb="AoG"]'); await page.waitForTimeout(150);
    await page.selectOption('tr[data-code="AoG"] select[data-bf="group"]', 'Sparks'); await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(() => App.season.config.yearBook['T&T']), ''); assert.strictEqual(await page.$$eval('tr[data-code="AoG"] [data-yb]', e => e.length), 0);
    await page.selectOption('tr[data-code="AoG"] select[data-bf="group"]', 'T&T'); await page.waitForTimeout(150); await page.check('[data-yb="AoG"]'); await page.waitForTimeout(150);
    await page.fill('tr[data-code="AoG"] input[data-bf="code"]', 'ZQ'); await page.press('tr[data-code="ZQ"] input[data-bf="code"], tr[data-code="AoG"] input[data-bf="code"]', 'Tab'); await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(() => App.season.config.yearBook['T&T']), 'ZQ', 'a renamed book stays the year\'s book');
    await page.click('[data-bdel="ZQ"]'); await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(() => App.season.config.yearBook['T&T']), ''); await page.close();
  });
  await test('Sparks books: in order by default (no tick on HG, WR, SS); All Together lets the club pick one book, offered to Sparks and opened first on Progress', async () => {
    const { page } = await open(); await tab(page, 'options'); await page.waitForTimeout(150);
    assert.strictEqual(await page.$eval('input[name="optSparks"]:checked', e => e.value), 'sequence'); assert.strictEqual(await page.$$eval('tr[data-code="WR"] [data-yb]', e => e.length), 0);
    await page.check('input[name="optSparks"][value="together"]'); await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(() => App.season.config.sparksBooks), 'together'); assert.strictEqual(await page.$$eval('[data-yb]', e => e.length), 9, 'the Cubbies and T&T books and the three Sparks books');
    await page.check('tr[data-code="WR"] [data-yb]'); await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(() => App.season.config.yearBook.Sparks), 'WR');
    await page.check('tr[data-code="SS"] [data-yb]'); await page.waitForTimeout(150); assert.strictEqual(await page.evaluate(() => App.season.config.yearBook.Sparks), 'SS', 'one Sparks book at a time');
    await page.check('tr[data-code="WR"] [data-yb]'); await page.waitForTimeout(150);
    const kid = await kidOf(page, 'Sparks'); await page.evaluate(i => { delete App.season.handbooks[i]; }, kid);
    await page.evaluate(i => App.showPerson(i, { sub: 'registration' }), kid); await page.waitForTimeout(300);
    assert.strictEqual(await page.$eval('[data-hbuse]', e => e.textContent), 'Use WR');
    await page.evaluate(i => App.goProgress(i), kid); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => document.querySelector('#prBooks button[data-book].on, #progressWrap button[data-book].on') && (document.querySelector('#prBooks button[data-book].on, #progressWrap button[data-book].on').dataset.book)), 'WR');      // the book tabs sit in the selector bar (#prBooks)
    await tab(page, 'options'); await page.waitForTimeout(150); await page.check('input[name="optSparks"][value="sequence"]'); await page.waitForTimeout(150);
    await page.evaluate(i => App.showPerson(i, { sub: 'registration' }), kid); await page.waitForTimeout(300); assert.strictEqual(await page.$$eval('#personWrap [data-hbuse]', e => e.length), 0, 'in order again: nothing offered');
    await page.close();
  });
  await test('place points and Blue Jewel weeks: good values are kept, bad ones are refused with a message', async () => {
    const { page } = await open(); await tab(page, 'options'); await page.waitForTimeout(150);
    await page.fill('[data-pp="1"]', '5'); await page.press('[data-pp="1"]', 'Tab'); await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(() => App.season.config.placePoints[1]), 5);
    await page.fill('[data-pp="2"]', 'x'); await page.press('[data-pp="2"]', 'Tab'); await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(() => App.season.config.placePoints[2]), 2); assert(/whole numbers/.test(await page.textContent('#optionsWrap')));
    await page.fill('#optJewels', '5, 10, 20, 30'); await page.press('#optJewels', 'Tab'); await page.waitForTimeout(150);
    assert.deepStrictEqual(await page.evaluate(() => App.season.config.blueJewelWeeks), [5, 10, 20, 30]);
    await page.fill('#optJewels', '30, 20, 10, 5'); await page.press('#optJewels', 'Tab'); await page.waitForTimeout(150);
    assert.deepStrictEqual(await page.evaluate(() => App.season.config.blueJewelWeeks), [5, 10, 20, 30]); assert(/rising order/.test(await page.textContent('#optionsWrap')));
    await page.close();
  });
  await test('the store settings on Options are the ones on the store tab', async () => {
    const { page } = await open(); await tab(page, 'options'); await page.waitForTimeout(150);
    await page.fill('#optionsWrap [data-k="max"]', '150'); await page.press('#optionsWrap [data-k="max"]', 'Tab'); await page.waitForTimeout(150);
    await page.fill('#optionsWrap [data-w="attendance"]', '2'); await page.press('#optionsWrap [data-w="attendance"]', 'Tab'); await page.waitForTimeout(150);
    await page.uncheck('#optionsWrap [data-p="T&T"]'); await page.waitForTimeout(150);
    const c = await page.evaluate(() => App.season.config.store); assert.strictEqual(c.max, 150); assert.strictEqual(c.weights.attendance, 2); assert.deepStrictEqual(c.programs, ['Sparks']);
    await tab(page, 'store'); await page.waitForTimeout(250);
    assert.strictEqual(await page.$eval('#storeWrap [data-k="max"]', e => e.value), '150'); assert.strictEqual(await page.$eval('#storeWrap [data-w="attendance"]', e => e.value), '2');
    assert.strictEqual(await page.$eval('#storeWrap [data-p="T&T"]', e => e.checked), false);
    await page.fill('#storeWrap [data-k="min"]', '20'); await page.press('#storeWrap [data-k="min"]', 'Tab'); await tab(page, 'options'); await page.waitForTimeout(250);
    assert.strictEqual(await page.$eval('#optionsWrap [data-k="min"]', e => e.value), '20');
    await page.close();
  });
  await test('Options lists the balancing priorities: three fixed ones, then three Mike can reorder and switch; changes persist and Reset restores the defaults', async () => {
    const { page, msgs } = await open(); await tab(page, 'options'); await page.waitForTimeout(150);
    const names = () => page.$$eval('#optionsWrap .prio li', e => e.map(x => x.dataset.prio));
    assert.deepStrictEqual(await names(), ['norepeat', 'friend', 'headcount', 'apart', 'turnout', 'grade']);
    assert.strictEqual(await page.$$eval('#optionsWrap .prio li[data-fixed] button, #optionsWrap .prio li[data-fixed] input', e => e.length), 0, 'the fixed priorities have no controls');
    assert(await page.isChecked('[data-pon="turnout"]') && await page.isChecked('[data-pon="grade"]'), 'turnout and grade default to on');
    assert(await page.isDisabled('[data-pmove="apart:-1"]'), 'the first tunable one cannot move up');
    await page.click('[data-pmove="grade:-1"]'); await page.waitForTimeout(150);
    assert.deepStrictEqual(await names(), ['norepeat', 'friend', 'headcount', 'apart', 'grade', 'turnout']);
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.dataset.pmove), 'grade:-1', 'focus stays on the button that was used');
    await page.click('[data-pmove="grade:-1"]'); await page.waitForTimeout(150);
    assert.deepStrictEqual(await names(), ['norepeat', 'friend', 'headcount', 'grade', 'apart', 'turnout']);
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.dataset.pmove), 'grade:1', 'at the top, focus moves to the other arrow instead of being lost');
    await page.uncheck('[data-pon="turnout"]'); await page.waitForTimeout(150);
    assert.deepStrictEqual(await page.evaluate(() => App.season.config.teamPlan.prio), { order: ['grade', 'apart', 'turnout'], off: ['turnout'] });
    await tab(page, 'roster'); await tab(page, 'options'); await page.waitForTimeout(150);
    assert(!(await page.isChecked('[data-pon="turnout"]')), 'still off after leaving the tab');
    await page.click('#optPrioReset'); await page.waitForTimeout(150);
    assert.deepStrictEqual(await names(), ['norepeat', 'friend', 'headcount', 'apart', 'turnout', 'grade']);
    assert.strictEqual(await page.evaluate(() => !!(App.season.config.teamPlan && App.season.config.teamPlan.prio)), false, 'defaults store no priorities (the demo file carries a plan of its own, so the plan itself may exist)');
    assert(!msgs.some(m => /ERROR/.test(m)), msgs.join());
    await page.close();
  });
  await test('the Drive card is absent while Drive is not set up', async () => {
    const { page } = await open(); await tab(page, 'options'); await page.waitForTimeout(150);
    assert(!/Google Drive/.test(await page.textContent('#optionsWrap')));
    await page.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
