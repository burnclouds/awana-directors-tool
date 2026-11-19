// N37 (punch margins): binder pages print with a 0.85in left margin so a three-hole punch clears the first column; attendance (landscape) keeps its own margin.
// Checks the page margin the app writes for each report (#pageStyle). Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/punch-margin-browser.test.js
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
  const marginFor = async report => {
    await page.evaluate(r => App.showReport(r), report); await page.waitForTimeout(700);
    return page.evaluate(() => { const s = document.getElementById('pageStyle'); return s ? s.textContent : ''; });
  };
  await test('the Emergency pages by class (binderClass) leave 0.85in on the left', async () => {
    const css = await marginFor('binderClass'); assert(/margin: 0\.5in 0\.4in 0\.5in 0\.85in/.test(css), 'margin: ' + css.slice(0, 200));
  });
  await test('everyone by name (binderAll) and the volunteer list leave the same left margin', async () => {
    assert(/0\.85in/.test(await marginFor('binderAll')), 'binderAll');
    assert(/0\.85in/.test(await marginFor('volunteers')), 'volunteers');
  });
  await test('color teams for the coaches (binderTeams) leave the same left margin', async () => {
    assert(/0\.85in/.test(await marginFor('binderTeams')), 'binderTeams');
  });
  await test('coaches notes keep a 0.85in left margin with 0.3in on the other sides', async () => {
    const css = await marginFor('noteSheets'); assert(/0\.3in 0\.4in 0\.3in 0\.85in/.test(css), 'notes margin: ' + css.slice(0, 200));
  });
  await test('attendance (landscape) keeps its own margin, with no punch margin', async () => {
    const css = await marginFor('attendance'); assert(!/0\.85in/.test(css), 'attendance: ' + css.slice(0, 200)); assert(/size: landscape; margin: 0\.4in/.test(css), css.slice(0, 200));
  });
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
