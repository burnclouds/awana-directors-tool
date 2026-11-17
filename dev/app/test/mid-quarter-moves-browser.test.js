// A mid-quarter move from the Person tab: the child's page says "Green, then Blue from 11/4", game points follow the team on each night attended, and the standings report lists who moved.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/mid-quarter-moves-browser.test.js
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
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage(), msgs = [];
    page.on('dialog', d => { msgs.push(d.message()); d.accept(); }); page.on('pageerror', e => msgs.push('PAGE ERROR ' + e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { page, msgs };
  };
  // A Sparks child with a team in a quarter that has a club night, and the first club night after the quarter's first.
  const pick = page => page.evaluate(() => {
    const nights = App.nightList().filter(n => n.quarter); for (const n of nights) { const q = n.quarter, same = nights.filter(x => x.quarter === q); if (same.length < 3) continue;
      const kid = App.master.people.find(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'Sparks' && Model.teamOf(p, q));
      if (kid) return { id: kid[Model.X.ID], q, color: Model.teamOf(kid, q), from: same[1].date, last: same[same.length - 1].date, other: Teams.COLORS.find(c => c !== Model.teamOf(kid, q)) }; } return null; });

  await test('Person > Registration: Move to Blue starting a night in the quarter records one dated move, and the Attendance page says "Green, then Blue from that night"', async () => {
    const { page } = await open(), c = await pick(page); assert(c, 'the test club has a Sparks child with a team');
    await page.evaluate(i => App.showPerson(i), c.id); await page.waitForTimeout(300); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(250);
    await page.selectOption('#peMoveTeam', c.other); await page.selectOption('#peMoveFrom', c.from); await page.click('#peMoveAdd'); await page.waitForTimeout(300);
    const moves = await page.evaluate(i => App.season.teamMoves[i], c.id); assert.deepStrictEqual(moves, [{ q: c.q, from: c.from, team: c.other }]);
    await page.click('#peSub button[data-sub="attendance"]'); await page.waitForTimeout(250);
    const t = await page.textContent('#personWrap .teamstory'); assert(new RegExp(c.q + ': ' + c.color + ', then ' + c.other + ' from \\d+/\\d+').test(t), t); assert(/Game points follow the team on each night attended/.test(t)); await page.close();
  });
  await test('a child who never moved has no moves line', async () => {
    const { page } = await open(), c = await pick(page); await page.evaluate(i => App.showPerson(i), c.id); await page.waitForTimeout(300); await page.click('#peSub button[data-sub="attendance"]'); await page.waitForTimeout(250);
    assert.strictEqual(await page.$$eval('#personWrap .teamstory', e => e.length), 0); await page.close();
  });
  await test('the Team column on the night-by-night table follows the move (the new color from the move night on, starred where it differs from the quarter color)', async () => {
    const { page } = await open(), c = await pick(page);
    await page.evaluate(([i, q, d, t]) => { Season.setTeamMove(App.season, i, q, d, t, App.calendar); App.touch(); App.showPerson(i); }, [c.id, c.q, c.from, c.other]); await page.waitForTimeout(300); await page.click('#peSub button[data-sub="attendance"]'); await page.waitForTimeout(300);
    const rows = await page.$$eval('#personWrap table.att tbody tr', r => r.map(x => ({ date: x.cells[0].textContent.trim(), q: x.cells[1].textContent.trim(), team: x.cells[2].textContent.trim() })));
    const after = rows.filter(r => r.q === c.q && r.team.includes(c.other)); assert(after.length >= 1, JSON.stringify(rows.slice(0, 6))); assert(after.every(r => /\*/.test(r.team)), 'starred as different from the quarter color'); await page.close();
  });
  await test('the standings report lists the clubbers who changed team this quarter, with their teams in words', async () => {
    const { page } = await open(), c = await pick(page);
    await page.evaluate(([i, q, d, t]) => { Season.setTeamMove(App.season, i, q, d, t, App.calendar); App.touch(); }, [c.id, c.q, c.from, c.other]);
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="reports"]').click()); await page.waitForTimeout(300);
    await page.evaluate(q => { document.getElementById('sQuarter').value = q; document.getElementById('sQuarter').dispatchEvent(new Event('input', { bubbles: true })); App.reportOptions({ group: 'Sparks' }); App.showReport('standings'); }, c.q); await page.waitForTimeout(800);
    const txt = await page.textContent('#report'); assert(/Changed team this quarter/.test(txt), txt.slice(0, 200)); assert(new RegExp(c.color + ', then ' + c.other + ' from').test(txt)); await page.close();
  });
  await test('no script errors', async () => { const { page, msgs } = await open(); await page.close(); assert.deepStrictEqual(msgs.filter(m => /PAGE ERROR/.test(m)), []); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
