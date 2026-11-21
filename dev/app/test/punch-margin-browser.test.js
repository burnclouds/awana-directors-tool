// N37 and N47 (punch margins): only the pages that are hole-punched (progress sheets, achievement records) print with a 0.85in left margin; attendance (landscape) is punched along the top; every other report uses the normal page.
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
  // N47 (Mike, 2026-11-19): only attendance sheets, progress reports and blank incident reports are hole-punched; everything else goes in a page protector and uses the whole page.
  await test('the pages that go in page protectors have no punch margin: emergency pages (by class and everyone by name), coaches color teams, volunteer list', async () => {
    for (const r of ['binderClass', 'binderAll', 'binderTeams', 'volunteers']) { const css = await marginFor(r); assert(!/0\.85in/.test(css), r + ' still leaves 0.85in: ' + css.slice(0, 160)); assert(/margin: 0\.5in\b/.test(css), r + ' is not the normal 0.5in margin: ' + css.slice(0, 160)); }
  });
  await test('coaches notes use the whole page (0.25in), with no punch margin', async () => {
    const css = await marginFor('noteSheets'); assert(!/0\.85in/.test(css), 'notes: ' + css.slice(0, 200)); assert(/@page \{ size: portrait; margin: 0\.25in;/.test(css), 'notes margin: ' + css.slice(0, 200));
  });
  await test('progress sheets (current book or every book) keep the 0.85in punch margin', async () => {
    for (const r of ['progressSheets']) { const css = await marginFor(r); assert(/0\.85in/.test(css), r + ': ' + css.slice(0, 200)); }
  });
  await test('attendance (landscape) is punched along the top, so it keeps 0.4in at the sides', async () => {
    const css = await marginFor('attendance'); assert(!/0\.85in/.test(css), 'attendance: ' + css.slice(0, 200)); assert(/size: landscape; margin: 0\.4in/.test(css), css.slice(0, 200));
    await page.emulateMedia({ media: 'print' }); const pad = await page.evaluate(() => { const s = document.querySelector('#report .sheet.att'); return s ? getComputedStyle(s).paddingTop : ''; }); await page.emulateMedia({ media: 'screen' });
    assert.strictEqual(pad, '43.2px', 'attendance: 0.4in page margin + 0.45in = 0.85in clear at the top for the punch (print), got ' + pad);
  });
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
