// Uniforms tab and Person tab: the "no date" box beside Given out, and what follows it (the filter, the count, the To do item). Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/uniform-given-browser.test.js
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
  const noOrder = page => page.evaluate(() => { const p = App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.uniformItems(x).length && !x[Model.UNI.ORDERED] && !x[Model.UNI.GIVEN]); return p && p[Model.X.ID]; });
  const todoIds = page => page.evaluate(() => { const g = Todo.compute({ master: App.master, season: App.season, quarter: 'Q2', today: '2026-10-29' }).groups.find(x => x.id === 'uniform'); return g ? g.items.map(i => i.id) : []; });
  await test('Uniforms tab: a no-date box beside Given out; ticking it counts as given (the filter), clears the To do item, and unticking brings it back', async () => {
    const { page, msgs } = await open(); const id = await noOrder(page); assert(id, 'a child with a uniform and nothing recorded'); assert((await todoIds(page)).includes(id));
    await tab(page, 'uniforms'); await page.waitForTimeout(250);
    const box = page.locator('#uniWrap tr[data-id="' + id + '"] input[data-uflag]'); assert.strictEqual(await box.count(), 1); assert(/no date/.test(await page.textContent('#uniWrap tr[data-id="' + id + '"] .uov')));
    await box.check(); await page.waitForTimeout(250);
    assert.strictEqual(await page.evaluate(i => App.master.people.find(x => x[Model.X.ID] === i)[Model.UNI.GIVEN_FLAG], id), '1'); assert(!(await todoIds(page)).includes(id), 'cleared from To do');
    await page.selectOption('#uFilter', 'give'); await page.waitForTimeout(200); assert.strictEqual(await page.$$eval('#uniWrap tr[data-id="' + id.replace(/"/g, '\\"') + '"]', e => e.length), 0, 'a child given out (no date) is not in "received, not given out"');
    await page.selectOption('#uFilter', ''); await page.waitForTimeout(200); await page.locator('#uniWrap tr[data-id="' + id + '"] input[data-uflag]').uncheck(); await page.waitForTimeout(250);
    assert((await todoIds(page)).includes(id), 'unticking puts it back'); assert(!msgs.some(m => /ERROR/.test(m)), msgs.join()); await page.close();
  });
  await test('Person tab: the same box, stored in the data file, and typing a date works as before', async () => {
    const { page } = await open(); const id = await noOrder(page); await page.evaluate(i => App.showPerson(i), id); await page.waitForTimeout(300); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(200);
    const box = page.locator('#personWrap input[data-flag="x_Uni_GivenFlag"]'); assert.strictEqual(await box.count(), 1); await box.check(); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(i => App.master.people.find(x => x[Model.X.ID] === i)[Model.UNI.GIVEN_FLAG], id), '1');
    await page.evaluate(() => { App.season.roster = Model.toRoster(App.master); });      // what Download data file writes
    assert.strictEqual(await page.evaluate(i => App.season.roster.people[i].v.x_Uni_GivenFlag, id), '1', 'it is in the data file');
    await page.fill('#personWrap input[data-u="x_Uni_GivenDate"]', '2026-10-21'); await page.press('#personWrap input[data-u="x_Uni_GivenDate"]', 'Tab'); await page.waitForTimeout(200);
    assert.strictEqual(await page.evaluate(i => App.master.people.find(x => x[Model.X.ID] === i)[Model.UNI.GIVEN], id), '2026-10-21'); await page.close();
  });
  await test('on a phone the no-date box is still there (only the (i) notes are hidden)', async () => {
    const { page } = await open(); await page.setViewportSize({ width: 390, height: 844 }); await tab(page, 'uniforms'); await page.waitForTimeout(250);
    assert(await page.locator('#uniWrap input[data-uflag]').first().isVisible()); await page.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
