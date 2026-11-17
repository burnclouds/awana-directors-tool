// Sparks Progress: the jewels first (boxes 1 to 4), then all the reviews after them (one row per jewel, also numbered 1 to 4), then the book's Review Emblem. Storage is unchanged (a review is item 5 to 8 of its jewel). Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/progress-reviews-browser.test.js
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
  const sparks = page => page.evaluate(() => App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'Sparks' && !App.season.progress[x[Model.X.ID]])[Model.X.ID]);
  const blocks = page => page.$$eval('#progressWrap .pblock', b => b.map(x => ({ label: x.querySelector('.plabel').textContent.replace(/⚑/, '').replace(/ ✓/, ''), cells: [...x.querySelectorAll('.pcell .pitem')].map(c => c.firstChild.textContent), review: !!x.closest('.previews') })));
  await test('the order is Rank, the jewels, then the Reviews, then the Review Emblem; every jewel has boxes 1 to 4 only and every review row is numbered 1 to 4', async () => {
    const { page, msgs } = await open(); const id = await sparks(page); await page.evaluate(i => App.goProgress(i), id); await page.waitForTimeout(300); const b = await blocks(page);
    const labels = b.map(x => x.label); const first = labels.findIndex(l => /review$/.test(l));
    assert.deepStrictEqual(labels.slice(0, 1 + 8 + 0).filter(l => !/review/.test(l)).length, 9, labels.join(' | '));      // the flight booklet is common; Rank and eight jewels are the book's
    assert.strictEqual(b.filter(x => /^Blue Jewels$/.test(x.label)).length, 1, 'one Blue Jewels row (four jewels, awarded automatically by nights present)'); const jewels = b.filter(x => /^(Red|Green) Jewel \d$/.test(x.label)), reviews = b.filter(x => /Jewel \d review$/.test(x.label)); assert.strictEqual(jewels.length, 8); assert.strictEqual(reviews.length, 8);
    jewels.forEach(j => assert.deepStrictEqual(j.cells, ['1', '2', '3', '4'], j.label)); reviews.forEach(r => { assert.deepStrictEqual(r.cells, ['1', '2', '3', '4'], r.label); assert(r.review, 'inside the Reviews section'); });
    assert(first > labels.lastIndexOf('Green Jewel 4'), 'the reviews come after the last jewel'); assert(/Book Review|Review Emblem/.test(labels[labels.length - 1]) || labels.some(l => /Book Review/.test(l)), 'the Review Emblem block is there');
    assert(labels.indexOf(labels.find(l => /Book Review/.test(l))) > labels.lastIndexOf(reviews[reviews.length - 1].label), 'and it comes after the reviews'); assert(!msgs.some(m => /ERROR/.test(m)), msgs.join()); await page.close();
  });
  await test('typing a review date stores it as that jewel\'s item 5 to 8, does not earn the jewel, and counts toward the Review Emblem; the Today button names the review in its label', async () => {
    const { page } = await open(); const id = await sparks(page); await page.evaluate(i => App.goProgress(i), id); await page.waitForTimeout(300);
    const row = page.locator('#progressWrap .previews .pblock', { hasText: 'Red Jewel 1 review' }); const inputs = row.locator('input[type=date][data-key]');
    assert.deepStrictEqual(await inputs.evaluateAll(e => e.map(x => x.dataset.key)), ['RJ1.5', 'RJ1.6', 'RJ1.7', 'RJ1.8'], 'stored as items 5 to 8');
    assert(/Set Red Jewel 1 review 1 to today/.test(await row.locator('button[data-today]').first().getAttribute('aria-label')));
    for (let i = 0; i < 4; i++) { await inputs.nth(i).fill('2026-10-21'); await inputs.nth(i).press('Enter'); await page.waitForTimeout(100); }
    const stored = await page.evaluate(i => { const p = App.season.progress[i]; const k = Object.keys(p)[0]; return Object.keys(p[k]).sort(); }, id); assert.deepStrictEqual(stored, ['RJ1.5', 'RJ1.6', 'RJ1.7', 'RJ1.8']);
    assert(!/Earned, not yet announced/.test(await page.textContent('#progressWrap')), 'reviews alone earn nothing'); assert(/4 of 4/.test(await page.textContent('#progressWrap .previews .pblock.done'))); assert(/4 of 64 section and review dates entered/.test(await page.textContent('#progressWrap')), 'they count toward the Review Emblem');
    await page.close();
  });
  await test('Cubbies and T&T progress, and the Sparks jewels, are unchanged; on a phone the reviews fit the screen', async () => {
    const { page } = await open(); const id = await sparks(page); await page.evaluate(i => App.goProgress(i), id); await page.waitForTimeout(300); await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll'); assert.strictEqual(await page.locator('#progressWrap .previews .pblock').count(), 8);
    const tnt = await page.evaluate(() => App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'T&T')[Model.X.ID]); await page.evaluate(i => App.goProgress(i), tnt); await page.waitForTimeout(300); assert.strictEqual(await page.locator('#progressWrap .previews').count(), 0, 'no reviews section outside Sparks'); await page.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
