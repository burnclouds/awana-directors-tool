// Debug tab: count and clear the Given dates nobody entered. Ones a person ticks stay. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/assumed-given-browser.test.js
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
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  await tab('awards'); await page.waitForTimeout(300);
  const ids = await page.evaluate(() => { const A = App, M = Model, S = Season, k = A.master.people.filter(x => M.isActive(x) && M.isClubber(x) && M.groupOf(M.room(x)) === 'Sparks').slice(0, 2).map(x => x.x_ClubberID);
    A.season.awards = {}; A.season.given = {}; A.season.givenNoDate = {};
    k.forEach(id => { S.addAward(A.season, '2026-10-28', id, 'HG Red Jewel 1'); S.addAward(A.season, '2026-10-28', id, 'HG Green Jewel 1'); });
    A.season.given[k[0]] = { 'HG Red Jewel 1': '2026-10-28' }; A.season.given[k[1]] = { 'HG Red Jewel 1': '2026-10-28', 'HG Green Jewel 1': '2026-10-28' };      // put there without the History seeing it, as an old upgrade did
    A.touch(); A.season.history = []; return k; });      // and the History knows nothing of them
  await tab('debug'); await page.waitForTimeout(400);
  await test('Count finds the Given dates the History never saw, with the children and the days', async () => {
    await page.click('#dbgAssumedCount'); await page.waitForTimeout(300); const t = await page.textContent('#debugWrap');
    assert(/3 Given dates for 2 children, on 10\/28 \(3\)/.test(t), t.slice(t.indexOf('Given dates nobody'), t.indexOf('Given dates nobody') + 400));
  });
  await test('a Given date a person ticks is not counted; Clear removes the others, the awards stay announced, and Undo brings them back', async () => {
    await tab('awards'); await page.waitForTimeout(300); await page.evaluate(id => { Season.setGiven(App.season, id, 'HG Green Jewel 1', '2026-11-03'); App.touch(); }, ids[0]);
    await tab('debug'); await page.waitForTimeout(300); await page.click('#dbgAssumedCount'); await page.waitForTimeout(300); assert(/3 Given dates for 2 children/.test(await page.textContent('#debugWrap')), 'three of the four');
    await page.click('#dbgAssumedClear'); await page.waitForTimeout(400);
    const r = await page.evaluate(([a, b]) => ({ g: JSON.stringify(App.season.given), ann: Object.keys(App.season.awards['2026-10-28']).length }), ids); assert.strictEqual(r.ann, 2, 'still announced'); assert.strictEqual(r.g, JSON.stringify({ [ids[0]]: { 'HG Green Jewel 1': '2026-11-03' } }), 'only the one a person entered is left: ' + r.g);
    await tab('awards'); await page.waitForTimeout(300); await page.click('#btnUndo'); await page.waitForTimeout(400); assert.strictEqual(await page.evaluate(() => Object.values(App.season.given).reduce((n, g) => n + Object.keys(g).length, 0)), 4, 'Undo restores them');
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
