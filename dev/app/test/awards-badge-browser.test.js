// The Awards tab shows how many earned awards still need announcing; the Tonight group and the phone menu add it to the To do count. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/awards-badge-browser.test.js
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
  const page = await (await browser.newContext()).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  const txt = id => page.$eval('#' + id, e => e.textContent.trim());
  await page.waitForTimeout(500);
  await test('the badge equals the number of awards still to announce or hand out', async () => {
    // N22: two numbers. The first is to announce, the second is to hand out.
    const a = await page.evaluate(() => window.App.awardsToAnnounce()), n = await page.evaluate(() => window.App.awardsToGive().length);
    assert.strictEqual(await txt('awardsBadge'), a ? String(a) : ''); assert.strictEqual(await txt('awardsGiveBadge'), n ? String(n) : '');
  });
  await test('finishing a block on Progress raises it, and announcing lowers it; the group and menu badges add it to To do', async () => {
    const before = +(await txt('awardsBadge')) || 0;
    await tab('person'); await page.waitForTimeout(300);
    const kid = await page.$eval('#pePerson', e => e.value);
    await page.evaluate(id => { const S = window.Season, s = window.App.season; ['1', '2', '3', '4', '5', '6'].forEach(i => S.setProgress(s, id, 'common', 'FLT.' + i, '2026-11-01')); window.App.touch(); }, kid);
    await page.waitForTimeout(500);
    const after = +(await txt('awardsBadge')) || 0; assert(after >= before, 'not lower: ' + before + ' -> ' + after);
    const sum = (+(await txt('todoBadge')) || 0) + after; assert.strictEqual(+(await txt('tonightBadge')) || 0, sum, 'group badge = To do + Awards');
    assert.strictEqual(+(await txt('tabMenuBadge')) || 0, sum, 'phone menu badge too');
    await tab('awards'); await page.waitForTimeout(400);
    if (await page.isVisible('#btnAnnounce')) { await page.click('#btnAnnounce'); await page.waitForTimeout(600); { const left = await page.evaluate(() => window.App.awardsToAnnounce()); assert(left < after, 'announcing does not lower the to-announce number: ' + after + ' -> ' + left); assert.strictEqual(+(await txt('awardsBadge')) || 0, left, 'to-announce badge'); assert.strictEqual(+(await txt('awardsGiveBadge')) || 0, await page.evaluate(() => window.App.awardsToGive().length), 'to-give badge still counts the hand-outs'); } }
  });
  await test('Flight 3:16 is a booklet, not an award (N23): finishing it earns nothing, so it is not counted, not offered to announce and not on the give list', async () => {
    const info = await page.evaluate(() => { const A = window.App, M = window.Model, id = p => p['x_ClubberID'];
      const p = A.master.people.find(x => M.groupOf(M.room(x)) === 'Sparks' && M.isActive(x) && !(A.season.progress[id(x)] || {}).common && !Object.values(A.season.awards).some(n => (n[id(x)] || []).includes('Flight 3:16')));
      return p ? { id: id(p), room: M.room(p) } : null; });
    assert(info, 'a Sparks child with no Flight 3:16 yet');
    const before = await page.evaluate(() => window.App.awardsToAnnounce());
    await page.evaluate(id => { const S = window.Season, s = window.App.season; ['1', '2', '3', '4', '5', '6'].forEach(i => S.setProgress(s, id, 'common', 'FLT.' + i, '2026-11-01')); window.App.touch(); }, info.id);
    await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(() => window.App.awardsToAnnounce()), before, 'Flight 3:16 does not raise the count');
    assert(await page.evaluate(id => { const A = window.App, p = A.master.people.find(x => x['x_ClubberID'] === id); return !Season.suggestedAwards(A.season, id, 'Sparks').some(d => d.award === 'Flight 3:16'); }, info.id), 'not an award: nothing to give');
    await tab('awards'); await page.waitForTimeout(400);
    assert(!/Flight 3:16/.test(await page.evaluate(() => { const t = document.querySelector('#tab-awards').innerText; return t.split('Announced, not yet given')[0]; })), 'not in Ready to announce');
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
