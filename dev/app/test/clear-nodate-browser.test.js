// A sign-off marked no date shows an empty box, so it has its own Clear button: pressing it takes the mark off and the section is unfinished again (no award earned from it).
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/clear-nodate-browser.test.js
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
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } }), page = await ctx.newPage(), errs = [];
    page.on('dialog', d => d.dismiss()); page.on('pageerror', e => errs.push(e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { page, errs };
  };
  // A T&T child with no sign-offs; a section is signed off with no date through the Given box's no-date tick. Returns the child, award, book, block and its item keys.
  const setup = async page => {
    const r = await page.evaluate(() => {
      const kid = App.master.people.find(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'T&T'), id = kid[Model.X.ID]; delete App.season.progress[id]; App.touch(); App.showPerson(id);
      const i = [...document.querySelectorAll('#progressWrap input[type=date][data-gaward]')].find(x => !x.value && x.dataset.gitems); if (!i) return null;
      const list = i.dataset.gitems.split(',').filter(Boolean); return { id, award: i.dataset.gaward, book: i.dataset.gbook, block: i.dataset.gblock, list };
    });
    await page.waitForTimeout(200); return r;
  };
  const empties = (page, c) => page.evaluate(([i, b, k, list]) => Season.unsignedIn(App.season, i, b, k, list).length, [c.id, c.book, c.block, c.list]);

  await test('a no-date sign-off has a Clear button; pressing it makes the section unfinished again', async () => {
    const { page, errs } = await open(), c = await setup(page); assert(c, 'a Given box on the sheet');
    await page.check('#progressWrap input[data-gnodate="' + c.award + '"]'); await page.waitForTimeout(400);
    assert.strictEqual(await empties(page, c), 0, 'every sign-off in the section is filled (no date)');
    const n = await page.locator('#progressWrap button[data-clearnd]').count(); assert(n >= c.list.length, 'a Clear button on each no-date sign-off, found ' + n);
    await page.locator('#progressWrap button[data-clearnd]').first().click(); await page.waitForTimeout(400);
    assert.strictEqual(await empties(page, c), 1, 'one sign-off is empty again'); assert.strictEqual(await page.locator('#progressWrap button[data-clearnd]').count(), n - 1, 'its Clear button is gone');
    assert.deepStrictEqual(errs, []); await page.close();
  });
  await test('clearing every no-date sign-off leaves no no-date marks and the section is not complete', async () => {
    const { page } = await open(), c = await setup(page);
    await page.check('#progressWrap input[data-gnodate="' + c.award + '"]'); await page.waitForTimeout(400);
    for (let i = 0; i < c.list.length; i++) { await page.locator('#progressWrap button[data-clearnd]').first().click(); await page.waitForTimeout(250); }
    assert.strictEqual(await empties(page, c), c.list.length, 'all empty'); assert.strictEqual(await page.evaluate(([i, b]) => Season.noDateSigns(App.season, i, b).length, [c.id, c.book]), 0, 'no no-date marks left');
    const done = await page.evaluate(([i, k]) => Season.completedBlocks(App.season, i, 'T&T').some(b => b.key === k), [c.id, c.block]); assert.strictEqual(done, false, 'the block is not completed'); await page.close();
  });
  await test('unticking the Given no-date box takes back the sign-offs it marked no date; the section is unfinished', async () => {
    const { page } = await open(), c = await setup(page);
    await page.check('#progressWrap input[data-gnodate="' + c.award + '"]'); await page.waitForTimeout(400); assert.strictEqual(await empties(page, c), 0);
    await page.uncheck('#progressWrap input[data-gnodate="' + c.award + '"]'); await page.waitForTimeout(400);
    assert.strictEqual(await empties(page, c), c.list.length, 'all sign-offs empty again'); assert.strictEqual(await page.locator('#progressWrap button[data-clearnd]').count(), 0);
    assert.strictEqual(await page.evaluate(([i, a]) => !!(App.season.given[i] || {})[a], [c.id, c.award]), false, 'not given'); await page.close();
  });
  await test('clearing a typed Given date does the same, and leaves real sign-off dates alone', async () => {
    const { page } = await open(), c = await setup(page);
    await page.evaluate(([i, b, k]) => { Season.setProgress(App.season, i, b, k, '2026-10-07'); App.touch(); App.showPerson(i); }, [c.id, c.book, c.list[0] ? c.block + '.' + c.list[0] : '']);
    await page.waitForTimeout(300); await page.focus('#progressWrap input[data-gaward="' + c.award + '"]'); await page.keyboard.type('11122026'); await page.evaluate(() => document.activeElement.blur()); await page.waitForTimeout(500);
    assert.strictEqual(await empties(page, c), 0);
    await page.fill('#progressWrap input[data-gaward="' + c.award + '"]', ''); await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.waitForTimeout(500);
    assert.strictEqual(await empties(page, c), c.list.length - 1, 'only the no-date ones are taken back'); await page.close();
  });
  console.log(passed + ' passed, ' + failed + ' failed'); await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})();
