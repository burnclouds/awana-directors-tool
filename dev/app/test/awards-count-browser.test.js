// The Awards tab number is every award still to announce or hand out, once each; ignored ("left off the slide") and given awards are never counted, and To do holds no awards.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/awards-count-browser.test.js
const { chromium } = require('playwright');
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
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
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage(), errs = [];
    page.on('dialog', d => d.dismiss()); page.on('pageerror', e => errs.push(e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { page, errs };
  };
  const count = page => page.evaluate(() => App.awardsToGive().length);
  const first = page => page.evaluate(() => { const x = App.awardsToGive()[0]; return x && { id: x.id, award: x.award, group: Model.groupOf(Model.room(App.master.people.find(p => p[Model.X.ID] === x.id))) }; });
  const awardsTab = async page => {
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="awards"]').click()); await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('#awSubs button[data-awsub="hand"]').click()); await page.waitForTimeout(300);
    return page.evaluate(() => { const h = document.querySelector('#awSecHand h3'), m = h && h.textContent.match(/\((\d+)\)/); return m ? +m[1] : 0; });
  };
  const badge = (page, id) => page.evaluate(i => { App.updateTodoBadge(); return new Promise(r => setTimeout(() => r(+document.getElementById(i).textContent || 0), 400)); }, id);
  await test('the Awards tab number equals what the Hand out list shows', async () => {
    const { page, errs } = await open(), n = await count(page); assert(n >= 1, 'the test club has an award waiting');
    assert.strictEqual(await badge(page, 'awardsBadge'), n); assert.strictEqual(await awardsTab(page), n); assert.deepStrictEqual(errs, []); await page.close();
  });
  await test('To do has no awards card and its number does not include awards', async () => {
    const { page } = await open(), a = await first(page), before = await badge(page, 'todoBadge');
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="todo"]').click()); await page.waitForTimeout(300);
    assert(!/Awards earned, not yet given/.test(await page.textContent('#todoWrap')), 'no awards card');
    await page.evaluate(a => { const c = App.season.config; c.exclude = c.exclude || {}; (c.exclude[a.group] = c.exclude[a.group] || []).push(a.award); App.touch(); }, a);
    assert.strictEqual(await badge(page, 'todoBadge'), before, 'the To do number is the same with the award ignored'); await page.close();
  });
  await test('an award left off the slide (ignored) is not counted', async () => {
    const { page } = await open(), a = await first(page), n = await count(page);
    await page.evaluate(a => { const c = App.season.config; c.exclude = c.exclude || {}; (c.exclude[a.group] = c.exclude[a.group] || []).push(a.award); App.touch(); }, a);
    assert.strictEqual(await count(page), n - 1); assert.strictEqual(await awardsTab(page), n - 1, 'and the Awards tab agrees'); await page.close();
  });
  await test('an award announced with no date still has to be handed out, so it is still counted', async () => {
    const { page } = await open(), a = await first(page), n = await count(page);
    await page.evaluate(a => { Season.setAnnNoDate(App.season, a.id, a.award, true); App.touch(); }, a);
    assert.strictEqual(await count(page), n); await page.close();
  });
  await test('an ignored award lowers the Awards tab number by one', async () => {
    const { page } = await open(), a = await first(page), before = await badge(page, 'awardsBadge');
    await page.evaluate(a => { const c = App.season.config; c.exclude = c.exclude || {}; (c.exclude[a.group] = c.exclude[a.group] || []).push(a.award); App.touch(); }, a);
    assert.strictEqual(await badge(page, 'awardsBadge'), before - 1); await page.close();
  });
  await test('an award given with no date is not counted', async () => {
    const { page } = await open(), a = await first(page), n = await count(page);
    await page.evaluate(a => { Season.setGiven(App.season, a.id, a.award, '2026-10-01', { noDate: true }); App.touch(); }, a);
    assert.strictEqual(await count(page), n - 1); await page.close();
  });
  console.log(passed + ' passed, ' + failed + ' failed'); await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})();
