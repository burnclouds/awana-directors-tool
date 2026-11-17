// New color year (Fable review A6, A7): Start new year and New season archive last year's colors and clear what belonged to last year's quarters
// ("No team" marks, dated moves, accepted repeats), and New season says the calendar still has to be replaced. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/teams-new-year-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
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
  const open = async answer => {
    const ctx = await browser.newContext(), page = await ctx.newPage(), seen = { dialogs: [], errors: [] };
    page.on('dialog', d => { seen.dialogs.push(d.message()); d.type() === 'prompt' ? d.accept(answer) : d.accept(); }); page.on('pageerror', e => seen.errors.push(e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { page, seen, ctx };
  };
  // a Sparks child with a color in Q1, a "No team" mark on Q1, a dated move, and an accepted repeat
  const dirty = page => page.evaluate(() => {
    const kids = App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'Sparks'), a = kids[0], b = kids[1];
    Model.setTeamChoice(App.master, a, 'Q1', Model.NO_TEAM); Model.setTeamChoice(App.master, b, 'Q1', 'Red');
    Season.setTeamMove(App.season, String(b[Model.X.ID]), 'Q2', '2026-11-11', 'Blue');
    App.season.config.teamsOk = { repeats: [String(b[Model.X.ID])], uneven: ['Q2'] }; App.commitScope(() => App.changed());
    return { a: String(a[Model.X.ID]), b: String(b[Model.X.ID]) };
  });
  const look = (page, ids) => page.evaluate(ids => {
    const pa = App.master.people.find(p => String(p[Model.X.ID]) === ids.a), pb = App.master.people.find(p => String(p[Model.X.ID]) === ids.b);
    return { year: App.season.year, noteam: pa['x_noteam:Q1'] || '', q1: pb['team:Q1'] || '', archived: App.master.userCols.filter(c => /^team:\d{4}-\d{2}:Q\d$/.test(c)), moves: Object.keys(App.season.teamMoves || {}).length, ok: JSON.stringify(App.season.config.teamsOk) };
  }, ids);

  await test('A6: Start new year archives the colors and clears No team marks, dated moves and accepted repeats', async () => {
    const { page, seen, ctx } = await open('2025-26'); const ids = await dirty(page);
    await page.evaluate(() => App.showTab('teams')); await page.waitForTimeout(400); await page.click('#btnTeamYear'); await page.waitForTimeout(600);
    const r = await look(page, ids);
    assert(r.archived.length >= 1, 'archived: ' + JSON.stringify(r.archived)); assert.strictEqual(r.noteam, '', 'No team mark cleared'); assert.strictEqual(r.q1, '', 'Q1 is blank');
    assert.strictEqual(r.moves, 0, 'moves cleared'); assert.strictEqual(r.ok, '{"repeats":[],"uneven":[]}', 'accepted repeats cleared'); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('A7: New season archives last year\'s colors, starts Q1 to Q4 blank, and says the calendar must be replaced', async () => {
    const { page, seen, ctx } = await open('2027-28'); const ids = await dirty(page), oldYear = await page.evaluate(() => App.season.year);
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="options"]').click()); await page.waitForTimeout(400); await page.click('#btnNewSeason'); await page.waitForTimeout(800);
    const r = await look(page, ids); assert.strictEqual(r.year, '2027-28');
    assert(r.archived.some(c => c.startsWith('team:' + oldYear + ':')), 'archived under last year\'s label: ' + JSON.stringify(r.archived)); assert.strictEqual(r.q1, '', 'Q1 blank'); assert.strictEqual(r.noteam, '', 'No team cleared');
    assert.strictEqual(r.moves, 0); const flash = await page.evaluate(() => (document.getElementById('flash') || {}).textContent || '');
    assert(/calendar/i.test(flash) && /archived/i.test(flash), 'the leader is told about the calendar: ' + flash.slice(0, 200)); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
