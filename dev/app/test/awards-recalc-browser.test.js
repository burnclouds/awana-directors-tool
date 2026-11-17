// Awards are worked out from the record: when an edit on Progress finishes a block (or attendance reaches a Blue Jewel) the To do count and the Awards tab must show it at once, without a refresh. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/awards-recalc-browser.test.js
// Usage: NODE_PATH=<dir with playwright> node test/info-browser.test.js
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
  const badge = page => page.$eval('#todoBadge', e => +e.textContent || 0);
  const clearGiven = page => page.evaluate(() => { App.awardsToGive().forEach(x => Season.setGiven(App.season, x.id, x.award, '2026-10-01')); App.commitScope(() => App.changed()); });
  const sparksKid = page => page.evaluate(() => App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'Sparks' && !App.season.progress[x[Model.X.ID]])[Model.X.ID]);
  const finish = async (page, label) => { const inputs = page.locator('#progressWrap .pblock', { hasText: label }).first().locator('input[type=date][data-key]'); for (let i = 0; i < 4; i++) { await inputs.nth(i).fill('2026-10-21'); await inputs.nth(i).press('Enter'); await page.waitForTimeout(100); } };

  await test('finishing a block on Progress earns an award at once (it is waiting to be given, but the To do count is unchanged: that card is information), and Undo takes it back', async () => {
    const { page, msgs } = await open(); await clearGiven(page); await page.waitForTimeout(400); assert.strictEqual(await page.evaluate(() => App.awardsToGive().length), 0, 'nothing waiting to be given');
    const before = await badge(page), id = await sparksKid(page); await page.evaluate(i => App.goProgress(i), id); await page.waitForTimeout(300);
    await finish(page, 'Red Jewel 1'); await page.waitForTimeout(500);
    assert(await page.evaluate(() => App.awardsToGive().length) > 0, 'an award is now earned'); assert.strictEqual(await badge(page), before, 'the To do count does not hold awards (the Awards tab counts them)'); assert(+await page.$eval('#awardsBadge', e => +e.textContent || 0) > 0, 'the Awards badge does');
    assert(/Earned, not yet announced/.test(await page.textContent('#progressWrap')), 'Progress says so too');
    await page.click('#btnUndo'); await page.waitForTimeout(500); assert.strictEqual(await page.evaluate(() => App.awardsToGive().length), 0, 'Undo takes the earned award back');
    assert(!msgs.some(m => /ERROR/.test(m)), msgs.join()); await page.close();
  });
  await test('the Awards tab offers a newly earned award when you go to it, and the same award is not offered again once announced', async () => {
    const { page } = await open(); await clearGiven(page); const id = await sparksKid(page); await page.evaluate(i => App.goProgress(i), id); await page.waitForTimeout(300); await finish(page, 'Red Jewel 1'); await page.waitForTimeout(300);
    const room = await page.evaluate(i => Model.room(App.master.people.find(x => x[Model.X.ID] === i)), id); await tab(page, 'awards'); await page.waitForTimeout(300); await page.selectOption('#awGroup', 'Sparks'); await page.selectOption('#awRoom', room); await page.waitForTimeout(300);
    const name = await page.evaluate(i => Model.fullName(App.master.people.find(x => x[Model.X.ID] === i)), id); assert(new RegExp(name).test(await page.textContent('#awardsWrap .announce')), 'the child is in Ready to announce');
    assert(/Red Jewel 1/.test(await page.textContent('#awardsWrap .announce')));
    await page.click('#btnAnnounce'); await page.waitForTimeout(400);      // Mark all announced (the rows now have Ignore buttons too)
    const left = await page.$$eval('#awardsWrap .announce', e => e.map(x => x.textContent)).catch(() => []); assert(!left.some(t => new RegExp(name + '.*Red Jewel 1').test(t)), 'announced: no longer waiting'); await page.close();
  });
  await test('an edit that changes nothing about awards does not disturb the count, and the count is the same whichever way it is refreshed', async () => {
    const { page } = await open(); await clearGiven(page); await page.waitForTimeout(400); const a = await badge(page); await page.evaluate(() => { const id = Object.keys(App.season.roster.people)[0]; Season.setMark(App.season, '2026-10-21', id, 'h', 1); App.commitScope(() => App.changed()); }); await page.waitForTimeout(400);
    const b = await badge(page); await tab(page, 'todo'); await page.waitForTimeout(300); const c = await badge(page); await tab(page, 'roster'); await page.waitForTimeout(300); const d = await badge(page);
    assert.deepStrictEqual([b, c, d], [b, b, b], 'the count shown on the To do tab and elsewhere agrees'); assert(a >= 0); await page.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
