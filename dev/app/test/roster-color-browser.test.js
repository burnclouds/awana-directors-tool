// The Roster's color team box takes the team's color, and follows when the team is changed. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/roster-color-browser.test.js
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
  await page.evaluate(() => document.querySelector('.tabs button[data-tab="roster"]').click()); await page.waitForTimeout(500);
  const sel = 'select.teamsel';
  await test('a child with a team has a colored box in the Roster, one with none has a plain one', async () => {
    const r = await page.$$eval(sel, els => els.map(e => ({ v: e.value, c: e.className, bg: getComputedStyle(e).backgroundColor })));
    assert(r.length > 0, 'team boxes exist'); const withTeam = r.find(x => x.v), without = r.find(x => !x.v);
    assert(withTeam && new RegExp('team-' + withTeam.v).test(withTeam.c) && withTeam.bg !== 'rgba(0, 0, 0, 0)', JSON.stringify(withTeam)); if (without) assert(!/team-/.test(without.c), 'plain when blank');
  });
  await test('changing the team changes the color at once, and the box has a name', async () => {
    const box = page.locator(sel).first(); await box.selectOption('Blue'); await page.waitForTimeout(200);
    assert(/team-Blue/.test(await box.getAttribute('class')), 'blue'); await box.selectOption('Red'); await page.waitForTimeout(200);
    const c = await box.getAttribute('class'); assert(/team-Red/.test(c) && !/team-Blue/.test(c), c);
    assert(/ team$/.test(await box.getAttribute('aria-label')), await box.getAttribute('aria-label'));
    await box.selectOption(''); await page.waitForTimeout(200); assert(!/team-/.test(await box.getAttribute('class')), 'blank again');
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
