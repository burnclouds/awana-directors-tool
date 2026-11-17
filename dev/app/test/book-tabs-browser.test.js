// The book tabs on a child's Progress sheet are colored (Mike, 2026-11-12): blue = the book in work, red = started, not finished and not the current book, green = finished, inverted green = finished
// with the Book Review. The tab being looked at is outlined, never filled blue. Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/book-tabs-browser.test.js
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
    page.on('dialog', d => d.accept()); page.on('pageerror', e => errs.push(e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { page, errs };
  };
  // A T&T child with: Agents of Grace finished, Discovery of Grace started (one date), Evidence of Grace current (handbook) with a date, Grace in Action untouched.
  const tnt = page => page.evaluate(() => {
    const kid = App.master.people.find(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'T&T'), id = kid[Model.X.ID], T = App.season.config.progress['T&T'], core = T.perBook.filter(b => !/^(SV|GD)/.test(b.key)), s = App.season;
    delete s.progress[id]; delete s.doneBooks[id]; const codes = Season.bookOrder(s, 'T&T'); core.forEach(b => b.items.forEach(i => Season.setProgress(s, id, codes[0], b.key + '.' + i, '2026-10-07')));
    Season.setProgress(s, id, codes[1], core[0].key + '.' + core[0].items[0], '2026-10-14'); Season.setProgress(s, id, codes[2], core[0].key + '.' + core[0].items[0], '2026-10-21'); s.handbooks[id] = codes[2] + ' 260916'; App.touch(); App.showPerson(id);
    return { id, codes };
  });
  const tab = (page, code) => page.$eval('#progressWrap .booktabs button[data-book="' + code + '"]', e => { const c = getComputedStyle(e); return { cls: e.className, bg: c.backgroundColor, color: c.color, outline: c.outlineStyle + ' ' + c.outlineWidth, mark: (e.querySelector('.bkmark') || {}).textContent || '', title: e.title }; });

  await test('T&T: finished is green with a check, started but not current is red, current is blue, untouched is plain', async () => {
    const { page } = await open(), c = await tnt(page); await page.waitForTimeout(400);
    const [a, d, e, g] = await Promise.all(c.codes.slice(0, 4).map(x => tab(page, x)));
    assert(/\bst-done\b/.test(a.cls) && a.bg === 'rgb(46, 125, 50)' && a.mark.trim() === '✓' && /Finished/.test(a.title), JSON.stringify(a));
    assert(/\bst-open\b/.test(d.cls) && d.bg === 'rgb(179, 38, 30)' && /Started, not finished/.test(d.title), JSON.stringify(d));
    assert(/\bst-cur\b/.test(e.cls) && e.bg === 'rgb(31, 78, 121)' && /book this child is in/.test(e.title), JSON.stringify(e));
    assert(!/\bst-/.test(g.cls) && g.title === '' && g.mark === '', JSON.stringify(g)); await page.close();
  });
  await test('the tab being looked at is outlined and keeps its own color: choosing the red tab does not turn it (or any other) blue', async () => {
    const { page } = await open(), c = await tnt(page); await page.waitForTimeout(400);
    await page.click('#progressWrap .booktabs button[data-book="' + c.codes[1] + '"]'); await page.waitForTimeout(400);
    const sel = await tab(page, c.codes[1]), cur = await tab(page, c.codes[2]), fin = await tab(page, c.codes[0]);
    assert(/solid 3px/.test(sel.outline) && sel.bg === 'rgb(179, 38, 30)', 'outlined, still red: ' + JSON.stringify(sel)); assert(/^none/.test(cur.outline) && cur.bg === 'rgb(31, 78, 121)', 'the current book is still blue'); assert(/^none/.test(fin.outline) && fin.bg === 'rgb(46, 125, 50)');
    assert.strictEqual(await page.$$eval('#progressWrap .booktabs button.on', e => e.length), 1, 'one tab is outlined'); await page.close();
  });
  await test('Sparks: a book finished with its reviews is inverted green with two checks; finished without is solid green; the book in work is blue', async () => {
    const { page } = await open();
    const c = await page.evaluate(() => {
      const kid = App.master.people.find(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'Sparks'), id = kid[Model.X.ID], T = App.season.config.progress.Sparks.perBook, s = App.season; delete s.progress[id]; delete s.doneBooks[id];
      T.forEach(b => b.items.concat(b.review || []).forEach(i => Season.setProgress(s, id, 'HG', b.key + '.' + i, '2026-10-07'))); T.forEach(b => b.items.forEach(i => Season.setProgress(s, id, 'WR', b.key + '.' + i, '2026-10-14')));
      Season.setProgress(s, id, 'SS', T[0].key + '.' + T[0].items[0], '2026-10-21'); App.touch(); App.showPerson(id); return { id, cur: Season.childBook(s, id) };
    });
    await page.waitForTimeout(400); const hg = await tab(page, 'HG'), wr = await tab(page, 'WR'), ss = await tab(page, 'SS');
    assert(/\bst-rev\b/.test(hg.cls) && hg.bg === 'rgb(232, 245, 233)' && hg.color === 'rgb(27, 94, 32)' && hg.mark.trim() === '✓✓' && /Book Review/.test(hg.title), 'inverted green: ' + JSON.stringify(hg));
    assert(/\bst-done\b/.test(wr.cls) && wr.bg === 'rgb(46, 125, 50)' && wr.mark.trim() === '✓', 'solid green (finished, no review): ' + JSON.stringify(wr));
    assert.strictEqual(c.cur, 'SS'); assert(/\bst-cur\b/.test(ss.cls) && ss.bg === 'rgb(31, 78, 121)', 'the book in work (SkyStormer) is blue: ' + JSON.stringify(ss)); await page.close();
  });
  await test('a finished book that is still the child\'s current book is green (finished wins), and keeps the dot that says it is the current one', async () => {
    const { page } = await open(), c = await tnt(page); await page.evaluate(([id, code]) => { const s = App.season, T = s.config.progress['T&T']; T.perBook.filter(b => !/^(SV|GD)/.test(b.key)).forEach(b => b.items.forEach(i => Season.setProgress(s, id, code, b.key + '.' + i, '2026-10-21'))); App.touch(); App.showPerson(id); }, [c.id, c.codes[2]]); await page.waitForTimeout(400);
    const e = await tab(page, c.codes[2]); assert(/\bst-done\b/.test(e.cls) && /\bcur\b/.test(e.cls) && e.bg === 'rgb(46, 125, 50)', JSON.stringify(e)); assert.strictEqual(await page.$$eval('#progressWrap .booktabs button[data-book="' + c.codes[2] + '"] .curdot', x => x.length), 1); await page.close();
  });
  await test('the tabs do not run together: at least 8 px between neighbours (so the outline of the selected one has room), and comfortable padding inside each', async () => {
    const { page } = await open(), c = await tnt(page); await page.waitForTimeout(400);
    const boxes = await page.$$eval('#progressWrap .booktabs button', b => b.map(x => { const r = x.getBoundingClientRect(), s = getComputedStyle(x); return { l: r.left, r: r.right, t: r.top, pl: parseFloat(s.paddingLeft) }; }));
    assert(boxes.length >= 3); for (let i = 1; i < boxes.length; i++) if (Math.abs(boxes[i].t - boxes[i - 1].t) < 4) assert(boxes[i].l - boxes[i - 1].r >= 8, 'gap ' + (boxes[i].l - boxes[i - 1].r) + ' between tab ' + (i - 1) + ' and ' + i);
    assert(boxes.every(b => b.pl >= 12), 'side padding ' + boxes.map(b => b.pl)); await page.close();
  });
  await test('a narrow screen wraps the tabs with no sideways scroll, and no script errors', async () => {
    const { page, errs } = await open(); await tnt(page); await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(400);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll'); await page.close(); assert.deepStrictEqual(errs, []);
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
