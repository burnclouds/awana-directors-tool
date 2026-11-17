// T2 in the browser (BACKLOG N2): a color typed "red" in an old file. The old audit counts it as Red; the year grid should draw the cell like a projected Red
// (no pin icon, no "moves to Red (dated move)" note). Expected-failing checks are listed in OPEN (same convention as test/teams-gaps.test.js). Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/teams-gaps-browser.test.js
const fs = require('fs'), http = require('http'), path = require('path'), assert = require('assert');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
const OPEN = new Set([]);
let passed = 0, failed = 0, stillOpen = 0;
async function check(id, name, fn) {
  let err = null; try { await fn(); } catch (e) { err = e; }
  const msg = err && String(err.message).split('\n')[0];
  if (OPEN.has(id)) { if (err) { stillOpen++; console.log('  open ' + id + ' ' + name + '\n       (expected, still open) ' + msg); } else { failed++; console.log('  FAIL ' + id + ' ' + name + '\n       now passes: remove ' + id + ' from OPEN and close it in BACKLOG.md'); } }
  else if (err) { failed++; console.log('  FAIL ' + id + ' ' + name + '\n       ' + msg); } else { passed++; console.log('  ok   ' + id + ' ' + name); }
}
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
const TODAY = '2026-12-20';      // Q3 is ready to lock (open), so its cells are editable selects
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const open = async () => {
    const page = await (await browser.newContext()).newPage(); page.setDefaultTimeout(12000); page.on('dialog', d => d.accept());
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    await page.evaluate(t => { App.today = () => t; }, TODAY); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('#teamsWrap .tg');
    // a child in the first class shown: Q3 projected as Red by the plan, then typed "red" in the file
    const id = await page.evaluate(() => {
      const kids = App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && ['Sparks', 'T&T'].includes(Model.groupOf(Model.room(p)))), room = [...new Set(kids.map(Model.room))].sort()[0], kid = kids.find(p => Model.room(p) === room);
      kid['team:Q1'] = 'Blue'; kid['team:Q2'] = 'Green'; kid['team:Q3'] = 'red'; TeamPlan.setProjected(App.season, kid[Model.X.ID], 'Q3', 'Red'); App.refresh(); return kid[Model.X.ID];
    });
    await page.waitForSelector('#teamsWrap .tg tr[data-kid="' + id + '"]'); return { page, id };
  };
  const cell = id => '#teamsWrap .tg tr[data-kid="' + id + '"] td[data-q="Q3"] ';
  // T2-grid-pin and T2-grid-note (the grid drawing a pin and a false "moves to Red" for a typed "red") are gone: the fix is in the loader (season.js upgradeTeamColors), so a "red" never reaches an open grid.
  // They set the value on an open master, which no screen can do. The loader is checked in test/teams-gaps.test.js (T2-loader, T2-pin, T2-notes). T2-grid-counted below stays as a guard on the size row.
  await check('T2-grid-counted', 'the team-size row under the grid counts the "red" child as Red (it uses the effective color)', async () => {
    const { page, id } = await open(); const r = await page.evaluate(id => { const k = App.master.people.find(p => p[Model.X.ID] === id), g = Model.groupOf(Model.room(k)); return { g, n: App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === g && Teams.effective(p, 'Q3').color === 'Red').length }; }, id);
    const t = await page.$eval('#teamsWrap .tg tfoot tr[data-sizes="' + r.g + '"] td[data-q="Q3"]', e => e.textContent); await page.close(); assert(new RegExp('Red ' + r.n + '(\\D|$)').test(t), 'sizes row "' + t + '" expected Red ' + r.n);
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed, ' + stillOpen + ' open'); process.exit(failed ? 1 : 0);
})();
