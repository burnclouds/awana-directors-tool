// N38: which book tab a child's Progress sheet opens on, in the real app, on invented TEST data.
//  - a Sparks child with no handbook, no progress and no received date opens on Hangglider (the first Sparks book);
//  - a bare code left in the handbook ("WR", nothing else recorded) makes it open on WingRunner (the reported case);
//  - Debug, Records that look wrong, Clear handbook codes clears that code and the sheet opens on Hangglider again.
//  - Cubbies and T&T open on this year's book when one is set, else on the first book of the group.
// Usage: NODE_PATH=<dir with playwright> node test/person-default-book-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext()).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const id = await page.evaluate(() => {      // an active Sparks child with every record removed, and the Sparks books worked through in turn (not the All Together method)
    const M = Model, p = App.master.people.find(x => M.isActive(x) && M.isClubber(x) && M.groupOf(M.room(x)) === 'Sparks'), kid = p[M.X.ID], s = App.season;
    ['handbooks', 'progress', 'received', 'doneBooks', 'extraSheets'].forEach(k => { if (s[k]) delete s[k][kid]; }); s.config.sparksBooks = 'sequence'; return kid;      // no App.touch(): on the Roster tab it would leave an unapplied draft that blocks the tab change

  });
  // The tab chosen for a child stays until you move to another child, so visit someone else first: this is the book the sheet opens on when it is opened fresh.
  const other = await page.evaluate(i => { const M = Model, p = App.master.people.find(x => M.isActive(x) && M.isClubber(x) && M.groupOf(M.room(x)) === 'Sparks' && x[M.X.ID] !== i); return p[M.X.ID]; }, id);
  const opensOn = async () => { await page.evaluate(o => { App.goProgress(o); }, other); await page.waitForTimeout(150); await page.evaluate(i => { App.goProgress(i); }, id); await page.waitForTimeout(300); return page.evaluate(() => { const b = document.querySelector('#progressWrap button[data-book].on'); return b ? b.dataset.book : ''; }); };
  await test('a Sparks child with no records opens on Hangglider', async () => { const got = await opensOn(); assert.strictEqual(got, 'HG', 'opens on "' + got + '"'); });
  await test('a bare WR code with nothing else makes it open on WingRunner (the reported case)', async () => {
    await page.evaluate(i => { App.season.handbooks[i] = 'WR'; }, id);
    const got = await opensOn(); assert.strictEqual(got, 'WR', 'opens on "' + got + '"');
  });
  await test('Debug, Records that look wrong, Clear handbook codes clears the code and the sheet opens on Hangglider again', async () => {
    await page.evaluate(() => App.showTab('debug')); await page.waitForTimeout(200);
    await page.evaluate(() => document.getElementById('dbgOddCheck').click()); await page.waitForTimeout(150);
    await page.locator('[data-oddfix="bare-handbook"]').click(); await page.waitForTimeout(250);
    assert.strictEqual(await page.evaluate(i => App.season.handbooks[i], id), undefined);
    const got = await opensOn(); assert.strictEqual(got, 'HG', 'opens on "' + got + '"');
  });
  // Cubbies and T&T: with nothing recorded the sheet opens on this year's book for the group when one is set, otherwise on the first book in the group's list.
  const groupCase = async (group, setYear) => page.evaluate(([g, year]) => {
    const M = Model, s = App.season, kids = App.master.people.filter(x => M.isActive(x) && M.isClubber(x) && M.groupOf(M.room(x)) === g);
    const kid = kids[0][M.X.ID], other = kids[1][M.X.ID];
    ['handbooks', 'progress', 'received', 'doneBooks', 'extraSheets'].forEach(k => { if (s[k]) delete s[k][kid]; }); s.config.yearBook = Object.assign({ Cubbies: '', Sparks: '', 'T&T': '' }, s.config.yearBook, { [g]: year });
    return { kid, other };
  }, [group, setYear]);
  const opensFor = async (c) => { await page.evaluate(o => { App.goProgress(o); }, c.other); await page.waitForTimeout(150); await page.evaluate(i => { App.goProgress(i); }, c.kid); await page.waitForTimeout(300); return page.evaluate(() => { const b = document.querySelector('#progressWrap button[data-book].on'); return b ? b.dataset.book : ''; }); };
  for (const [group, first, yearBook] of [['Cubbies', 'AS', 'HC'], ['T&T', null, 'DoG']]) {
    await test(group + ' child with no records: this year\'s book when one is set, else the first book of the group', async () => {
      const firstBook = first || await page.evaluate(() => Season.bookOrder(App.season, 'T&T')[0]);
      let c = await groupCase(group, ''); let got = await opensFor(c); assert.strictEqual(got, firstBook, 'no year book: opens on "' + got + '", expected the first book ' + firstBook);
      c = await groupCase(group, yearBook); got = await opensFor(c); assert.strictEqual(got, yearBook, 'year book ' + yearBook + ': opens on "' + got + '"');
    });
  }
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
