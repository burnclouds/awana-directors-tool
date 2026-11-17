// On a child's Progress sheet a sign-off marked "no date" keeps a hidden tick day. "Same date" must never copy that day into a real box, and a half-typed entry in a
// no-date box must not put the hidden day back into the box (R21, BUG 3 and BUG 4). Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/nodate-sheet-browser.test.js
const { chromium } = require('playwright');
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.json$/.test(f)).sort().pop());
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
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } }), page = await ctx.newPage();
    page.on('dialog', d => d.dismiss()); await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]);
    await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); return page;
  };
  // Three neighbouring sign-off boxes of one row: the first has a real date (2026-10-21), the second is signed off with NO date (hidden tick day 2026-10-30), the third is empty.
  const setup = page => page.evaluate(() => {
    const kid = App.master.people.find(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'T&T'), id = kid[Model.X.ID];
    delete App.season.progress[id]; if (App.season.progressNoDate) delete App.season.progressNoDate[id]; App.touch(); App.showPerson(id);
    const ins = [...document.querySelectorAll('#progressWrap input[type=date][data-key]')]; let trio = null;
    for (let i = 0; i + 2 < ins.length && !trio; i++) { const a = ins[i], b = ins[i + 1], c = ins[i + 2]; if (a.dataset.scope === b.dataset.scope && b.dataset.scope === c.dataset.scope && a.dataset.key.split('.')[0] === c.dataset.key.split('.')[0]) trio = [a, b, c].map(x => x.dataset.key); }
    if (!trio) return null; const scope = ins[0].dataset.scope;
    const sc = ins.find(x => x.dataset.key === trio[0]).dataset.scope;
    Season.setProgress(App.season, id, sc, trio[0], '2026-10-21'); Season.markSignsNoDate(App.season, id, sc, [trio[1]], '2026-10-30'); App.touch(); App.showPerson(id);
    return { id, scope: sc, keys: trio };
  });
  const box = (page, c, k) => page.locator('#progressWrap input[type=date][data-scope="' + c.scope + '"][data-key="' + k + '"]');

  await test('Same date skips a no-date box: it offers the last REAL date and never the hidden tick day', async () => {
    const page = await open(), c = await setup(page); assert(c, 'three neighbouring sign-off boxes on a T&T sheet');
    const attrs = await page.evaluate(([scope, k3]) => [...document.querySelectorAll('#progressWrap button[data-copylast]')].map(b => ({ date: b.dataset.date, fill: b.dataset.copylast, title: b.title })).filter(b => b.fill.split(',').includes(k3)), [c.scope, c.keys[2]]);
    assert(attrs.length >= 1, 'a Same date button for the empty box');
    attrs.forEach(a => { assert.strictEqual(a.date, '2026-10-21', 'the date offered'); assert(!/2026-10-30/.test(a.title + a.date), 'the tick day is offered'); assert(!a.fill.split(',').includes(c.keys[1]), 'the no-date box is not filled over'); });
  });
  await test('pressing Same date leaves the no-date box as it was', async () => {
    const page = await open(), c = await setup(page);
    await page.evaluate(k3 => { const b = [...document.querySelectorAll('#progressWrap button[data-copylast]')].find(x => x.dataset.copylast.split(',').includes(k3)); b.click(); }, c.keys[2]); await page.waitForTimeout(300);
    const r = await page.evaluate(([id, sc, ks]) => ({ third: App.season.progress[id][sc][ks[2]], second: App.season.progress[id][sc][ks[1]], marked: Season.isSignNoDate(App.season, id, sc, ks[1]) }), [c.id, c.scope, c.keys]);
    assert.strictEqual(r.third, '2026-10-21', 'the empty box got the real date'); assert.strictEqual(r.second, '2026-10-30', 'the no-date box keeps its hidden day'); assert.strictEqual(r.marked, true, 'and its no-date mark');
  });
  await test('a half-typed date in a no-date box goes back to empty, not to the hidden day', async () => {
    const page = await open(), c = await setup(page), b = box(page, c, c.keys[1]);
    assert.strictEqual(await b.inputValue(), '', 'a no-date box starts empty'); await b.fill('0002-10-28'); await b.blur(); await page.waitForTimeout(300);
    assert.strictEqual(await box(page, c, c.keys[1]).inputValue(), '', 'the box shows the hidden day after a bad entry');
    const marked = await page.evaluate(([id, sc, k]) => Season.isSignNoDate(App.season, id, sc, k), [c.id, c.scope, c.keys[1]]); assert.strictEqual(marked, true, 'the no-date mark is still there');
  });
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})().catch(e => { console.log('ERROR ' + e.message); process.exit(1); });
