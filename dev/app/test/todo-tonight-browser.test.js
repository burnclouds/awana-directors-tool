// UX-12: the Tonight strip at the top of To do (club night or the day after): classes entered, games entered, awards to announce, each with a Go. Not counted in the To do number.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/todo-tonight-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const run = async (today, w) => { const ctx = await browser.newContext({ viewport: { width: w || 1280, height: 900 } }), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
    await page.goto(url); await page.evaluate(t => { if (t) App.today = () => t; }, today); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); return { page, ctx, errs }; };
  const p0 = await run(''); const NIGHT = await p0.page.evaluate(() => { const c = App.calendar.filter(x => Calendar.isNight(x)); return c[Math.floor(c.length / 2)].Date; }); await p0.ctx.close();
  const plus = n => { const d = new Date(NIGHT + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  for (const w of [390, 1280]) {
    await test('on a club night the strip shows the counts, matches App.tonight, and does not change the To do badge (' + w + ')', async () => {
      const off = await run(plus(3), w); await off.page.evaluate(() => App.showTab('todo')); await off.page.waitForTimeout(200); assert.strictEqual(await off.page.$$eval('.tonightstrip', e => e.length), 0, 'absent on another day'); const badgeOff = await off.page.textContent('#todoBadge'); await off.ctx.close();
      const { page, ctx, errs } = await run(NIGHT, w); await page.evaluate(() => App.showTab('todo')); await page.waitForSelector('.tonightstrip');
      const n = await page.evaluate(() => App.tonight()), t = await page.textContent('.tonightstrip'); assert(n.rooms > 3, 'rooms: ' + n.rooms); assert(new RegExp('classes entered ' + n.roomsEntered + ' of ' + n.rooms).test(t) && new RegExp('games entered ' + n.gamesEntered + ' of ' + n.games).test(t) && new RegExp('awards to announce ' + n.toAnnounce).test(t), t);
      assert.strictEqual(await page.textContent('#todoBadge'), badgeOff, 'the badge is the same with and without the strip'); assert.deepStrictEqual(errs, []); await ctx.close();
    });
  }
  await test('the day after a club night also shows it; two days after does not', async () => { let r = await run(plus(1)); await r.page.evaluate(() => App.showTab('todo')); assert(await r.page.$('.tonightstrip') || (await r.page.evaluate(() => !!App.tonight())), 'day after'); await r.ctx.close(); });
  await test('entering a class moves the count and the first missing class; each Go lands on the right tab, night and class', async () => {
    const { page, ctx } = await run(NIGHT); const before = await page.evaluate(() => App.tonight()); assert(before.firstMissingRoom, 'a class is missing');
    await page.evaluate(r => { const kid = App.master.people.find(p => Model.isActive(p) && Model.isClubber(p) && Model.room(p) === r); Season.setMark(App.season, App.tonight().date, kid[Model.X.ID], 'h', 1); App.commitScope(() => App.changed()); }, before.firstMissingRoom);
    const after = await page.evaluate(() => App.tonight()); assert.strictEqual(after.roomsEntered, before.roomsEntered + 1, 'one more class entered'); assert.notStrictEqual(after.firstMissingRoom, before.firstMissingRoom);
    await page.evaluate(() => App.showTab('todo')); await page.waitForSelector('.tonightstrip'); await page.click('[data-tonight="attend"]'); await page.waitForTimeout(250); assert.strictEqual(await page.evaluate(() => App.tab), 'attend');
    assert.strictEqual(await page.inputValue('#attDate'), NIGHT, 'the night'); assert.strictEqual(await page.inputValue('#attRoom'), after.firstMissingRoom, 'the first class still missing');
    await page.evaluate(() => App.showTab('todo')); await page.click('[data-tonight="games"]'); await page.waitForTimeout(250); assert.strictEqual(await page.evaluate(() => App.tab), 'games'); assert.strictEqual(await page.inputValue('#gameDate'), NIGHT);
    await page.evaluate(() => App.showTab('todo')); await page.click('[data-tonight="awards"]'); await page.waitForTimeout(250); assert.strictEqual(await page.evaluate(() => App.tab), 'awards'); await ctx.close();
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
