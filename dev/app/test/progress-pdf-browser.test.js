// A real print to PDF (Chromium's own printer, the page's print CSS and the app's before/after print steps) of a class's progress sheets: one page per child, letter size,
// and a filled-in date prints whole (not cut off as 09/30/2). Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/progress-pdf-browser.test.js
const { chromium } = require('playwright');
const assert = require('assert'), fs = require('fs'), http = require('http'), os = require('os'), path = require('path'), cp = require('child_process');
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
const pagesOf = buf => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
const hasPdftotext = (() => { try { return cp.spawnSync('pdftotext', ['-v']).status !== null; } catch (e) { return false; } })();
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto('http://localhost:' + server.address().port + '/index.html'); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => App.showTab('reports'));      // not a staged tab: the seeds below call App.touch(), and on Roster (or Options, Person...) that would leave an unapplied draft that blocks the next tab switch
  const printed = async (room, report) => {
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="reports"]').click()); await page.waitForTimeout(300);
    await page.evaluate(([r, v]) => { App.reportOptions({ room: r }); App.showReport(v); }, [room, report]); await page.waitForTimeout(800);
    const sheets = await page.$$eval('#report .onepage', e => e.length);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(300);
    const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true }); await page.emulateMedia({ media: 'screen' }); await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    return { sheets, buf };
  };
  // Dates the sheets show: a Given and an Announced date on the first Sparks child of the room, and one on a T&T child.
  const room = g => page.evaluate(g2 => { const p = App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === g2); return Model.room(p); }, g);
  for (const group of ['Sparks', 'T&T', 'Cubbies']) {
    await test(group + ': a class printed to a real PDF is one letter page per child', async () => {
      const r = await room(group); await page.evaluate(g => { const kid = App.master.people.filter(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === g)[0]; const id = kid[Model.X.ID], T = App.season.config.progress[g];
        if (g !== 'Cubbies') { const bk = g === 'Sparks' ? 'HG' : 'AoG', bl = T.perBook.find(b => b.awards && b.awards.length); Season.setProgress(App.season, id, bk, bl.key + '.' + bl.items[0], '2026-09-30'); }
        App.touch(); }, group);
      const { sheets, buf } = await printed(r, 'progressSheets'); assert(sheets >= 2, 'sheets on screen: ' + sheets); assert.strictEqual(pagesOf(buf), sheets, sheets + ' children but ' + pagesOf(buf) + ' pages');
      assert(/MediaBox\s*\[\s*0\s+0\s+612\s+792\s*\]/.test(buf.toString('latin1')), 'letter portrait paper');
    });
  }
  await test('a printed sign-off or Given date fits its box on paper (9/30, 9/30/26)', async () => {
    // The record sheet (BACKLOG T6) prints dates as plain text in a fixed date part, so measure under print emulation: each printed date's text must fit inside its box (the PDF text keeps a clipped date's digits, a PDF cannot show it).
    // A Given date prints as M/D/YY, a sign-off as M/D. The first Sparks child gets dates here so there is something to measure.
    await page.evaluate(() => { const p = App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'Sparks'), id = p[Model.X.ID], b = App.season.config.progress.Sparks.perBook[0];
      b.items.forEach(i => Season.setProgress(App.season, id, 'HG', b.key + '.' + i, '2026-09-30')); Season.setGiven(App.season, id, 'HG Green Emblem', '2026-09-30'); App.season.handbooks[id] = 'HG 260916'; App.touch(); });
    const rooms = await page.evaluate(() => [...new Set(App.master.people.filter(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'Sparks').map(Model.room))]); let seen = 0; const tight = [];
    for (const r of rooms) {
      await page.evaluate(() => document.querySelector('.tabs button[data-tab="reports"]').click()); await page.evaluate(rm => { App.reportOptions({ room: rm }); App.showReport('progressSheets'); }, r); await page.waitForTimeout(700);
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(250);
      const res = await page.evaluate(() => [...document.querySelectorAll('#report td.so .dt, #report td.gv .v')].filter(e => e.textContent.trim()).map(e => { const rg = document.createRange(); rg.selectNodeContents(e); return { v: e.textContent, have: e.getBoundingClientRect().width, need: rg.getBoundingClientRect().width }; }));
      await page.emulateMedia({ media: 'screen' }); await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); seen += res.length; res.filter(x => x.need > x.have + 0.5).forEach(x => tight.push(x.v + ' ' + x.have + '<' + x.need));
    }
    assert(seen > 0, 'the test club has dates to print'); assert.deepStrictEqual(tight, [], 'dates too wide for their box on paper: ' + tight.slice(0, 3).join(', '));
  });
  await test('no report prints a blank first page (a named page on the first sheet makes Chromium print one), and the paper matches the first sheet', async () => {
    if (!hasPdftotext) { console.log('       (skipped: pdftotext is not installed)'); return; }
    const r = await room('Sparks'), bad = [];
    for (const [id, paper] of [['attendance', 'L'], ['binderClass', 'P'], ['volunteers', 'P'], ['progressSheets', 'P'], ['emergency', 'L']]) {
      const { buf } = await printed(r, id), f = path.join(os.tmpdir(), 'awana-blank-' + process.pid + '.pdf'); fs.writeFileSync(f, buf);
      const first = cp.spawnSync('pdftotext', ['-f', '1', '-l', '1', f, '-'], { encoding: 'utf8' }).stdout.replace(/\s/g, ''), box = /MediaBox\s*\[\s*0\s+0\s+(\d+)\s+(\d+)\s*\]/.exec(buf.toString('latin1')); fs.unlinkSync(f);
      if (!first.length) bad.push(id + ': page 1 is blank'); if (box && ((+box[1] > +box[2]) ? 'L' : 'P') !== paper) bad.push(id + ': first page is ' + box[1] + 'x' + box[2]);
    }
    assert.deepStrictEqual(bad, []);
  });
  await test('a report bundle that lists Progress sheets (the Class binder one) draws the sheets, not the "print from the app" note', async () => {
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="reports"]').click()); const idx = await page.evaluate(() => [...document.querySelectorAll('#rSel option')].map(o => o.value).filter(v => /^bundle:/.test(v)));
    const withSheets = [];
    for (const v of idx) { await page.evaluate(x => App.showReport(x), v); await page.waitForTimeout(600); const t = await page.$eval('#report', e => ({ note: /Progress sheets print from the app/.test(e.textContent), sheets: e.querySelectorAll('.onepage').length })); if (t.sheets) withSheets.push(v); assert(!t.note, v + ' shows the "print from the app" note'); }
    assert(withSheets.length >= 1, 'a bundle with Progress sheets: ' + idx.join(','));
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
