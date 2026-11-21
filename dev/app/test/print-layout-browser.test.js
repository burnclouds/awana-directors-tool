// Printing: an Achievement Record is one page per book (it fits a letter page), the first sheet decides the paper so nothing starts with a blank page, and a mixed bundle keeps each orientation. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/print-layout-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  await tab('person'); await page.waitForTimeout(300);
  const ids = await page.evaluate(() => { const A = App, M = Model, S = Season, pick = g => A.master.people.find(x => M.isActive(x) && M.isClubber(x) && M.groupOf(M.room(x)) === g).x_ClubberID, sp = pick('Sparks'), tt = pick('T&T'), T = A.season.config.progress;
    ['HG', 'WR'].forEach((bk, n) => T.Sparks.perBook.forEach(bl => bl.items.concat(bl.review || []).forEach(i => S.setProgress(A.season, sp, bk, bl.key + '.' + i, '2026-10-0' + (n + 1)))));
    T.Sparks.common.forEach(bl => bl.items.forEach(i => S.setProgress(A.season, sp, 'common', bl.key + '.' + i, '2026-09-23'))); A.season.handbooks[sp] = 'WR 260916';
    ['AoG', 'DoG'].forEach((bk, n) => T['T&T'].perBook.forEach(bl => bl.items.forEach(i => S.setProgress(A.season, tt, bk, bl.key + '.' + i, '2026-10-0' + (n + 1))))); A.season.handbooks[tt] = 'AoG 260916'; A.touch(); return { sp, tt }; });
  await tab('reports'); await page.waitForTimeout(400);
  const PAPER = 790, PAGE_H = 9.9 * 96;      // the window a little wider than the 7.5in of paper, for the scrollbar and page padding the print view adds; checked against a real PDF (one page per book)      // 8.5in less 0.5in margins wide; 11in less margins high, a little to spare
  for (const [group, id, books] of [['Sparks', ids.sp, 2], ['T&T', ids.tt, 2]]) {
    await test(group + ': one sheet per book, each short enough for one page, with the sheet\'s own record on it', async () => {
      await page.evaluate(([g, i]) => { App.showReport('progressSheets'); App.reportOptions({ room: Model.room(App.master.people.find(p => p[Model.X.ID] === i)), kid: i, books: 'all' }); }, [group, id]); await page.waitForTimeout(600);
      await page.setViewportSize({ width: PAPER, height: 1000 }); await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(300);
      const h = await page.$$eval('#report .sheet', e => e.map(x => Math.round(x.getBoundingClientRect().height)));
      await page.emulateMedia({ media: 'screen' }); await page.setViewportSize({ width: 1280, height: 900 });
      assert.strictEqual(h.length, books, 'one sheet per book: ' + h); assert(h.every(x => x <= PAGE_H), 'each fits one page (' + Math.round(PAGE_H) + 'px): ' + h);
    });
  }
  await test('the Pilot Wing and Red Jewel 1 are one cell, Wings/Red 1 (N56), with its own Given boxes: given when both are given (no book code)', async () => {
    await page.evaluate(id => { const A = App, S = Season; S.addAward(A.season, '2026-10-21', id, 'WR Pilot Wing'); S.addAward(A.season, '2026-10-21', id, 'WR Red Jewel 1'); S.setGiven(A.season, id, 'WR Red Jewel 1', '2026-10-28'); A.touch(); }, ids.sp);
    const cell = async () => { await page.evaluate(i => { App.showReport('progressSheets'); App.reportOptions({ room: Model.room(App.master.people.find(p => p[Model.X.ID] === i)), kid: i, books: 'all' }); }, ids.sp); await page.waitForTimeout(600);
      return page.evaluate(() => { const sheet = [...document.querySelectorAll('#report .sheet')].find(x => /Wingrunner/.test(x.textContent)), all = [...sheet.querySelectorAll('td.an')].map(x => x.querySelector('span').textContent), a = [...sheet.querySelectorAll('td.an')].find(x => x.querySelector('span').textContent === 'Wings/Red 1'); return { all, cls: a ? a.className : '', date: a ? a.nextElementSibling.querySelector('.v').textContent : '', boxes: a ? a.nextElementSibling.classList.contains('gd') && a.nextElementSibling.nextElementSibling.classList.contains('gi') : false }; }); };
    let c = await cell(); assert(c.all.includes('Wings/Red 1') && !c.all.some(x => /Pilot Wing$|Red Jewel 1$/.test(x)), 'one merged cell: ' + c.all.join(' | ')); assert(c.boxes, 'its two Given boxes (date and initials)');
    assert(/\be\b/.test(c.cls) && !/\bg\b/.test(c.cls), 'only Red Jewel 1 is given, so the cell is still earned, not given: ' + c.cls);
    await page.evaluate(id => { Season.setGiven(App.season, id, 'WR Pilot Wing', '2026-10-30'); App.touch(); }, ids.sp); c = await cell();
    assert(/\bg\b/.test(c.cls) && c.date === '10/30/26', 'both given: the cell is given with the later date: ' + JSON.stringify(c)); assert(!/WR /.test(c.all.join(' ')), 'no book code on the book\'s own page');
  });
  await test('the printout starts on the first sheet\'s paper: no named page on it (a named first page prints a blank page first)', async () => {
    const css = await page.$eval('#pageStyle', e => e.textContent); assert(/@page \{ size: portrait/.test(css), css); assert(!/#report \.sheet\.portrait/.test(css), 'the first orientation has no named page: ' + css);
    await page.evaluate(() => App.showReport('teams')); await page.waitForTimeout(400); const c2 = await page.$eval('#pageStyle', e => e.textContent); assert(/size: (portrait|landscape)/.test(c2));
  });
  await test('a bundle mixing portrait and landscape keeps both: the first sets the default and the other orientation has its own page', async () => {
    await page.selectOption('#rSel', 'bundle:0'); await page.waitForTimeout(600); const css = await page.$eval('#pageStyle', e => e.textContent), kinds = await page.$$eval('#report .sheet', e => [...new Set(e.map(x => x.classList.contains('landscape') ? 'landscape' : 'portrait'))]);
    assert(kinds.length === 2 ? /#report \.sheet\.\w+ \{ page: pg/.test(css) : true, css + ' | ' + kinds);
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
