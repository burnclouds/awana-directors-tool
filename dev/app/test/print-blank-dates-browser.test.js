// Printing: an empty date box prints blank (no "mm/dd/yyyy"), and a filled one still prints its date. Before printing the empty ones are marked; after, the marks are removed.
// Invented test club only (dev/test-data).
// Usage: NODE_PATH=<dir with playwright> node test/print-blank-dates-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
setTimeout(() => { console.log('timed out'); process.exit(2); }, 170000).unref();
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  // The progress sheets used to hold date boxes; the new record sheet (BACKLOG T6) is plain table text, so no report prints a date input now. The beforeprint / afterprint hook and the print rule stay for any date box a
  // report might carry, and are pinned here with one empty and one filled date box put into the report area.
  await page.evaluate(() => { window.App.showReport('progressSheets'); const r = document.getElementById('report'); r.insertAdjacentHTML('beforeend', '<input type="date" id="tEmpty"><input type="date" id="tFull" value="2026-09-30">'); }); await page.waitForTimeout(300);
  await test('before printing no date box is marked', async () => {
    assert.strictEqual(await page.locator('input[type=date][data-blank-print]').count(), 0);
  });
  await test('while printing, empty date boxes are marked and print with no text; filled ones keep their date', async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    const marked = await page.locator('input[type=date][data-blank-print]').count();
    assert(marked > 0, 'the report area has an empty date box');
    await page.emulateMedia({ media: 'print' });
    const printed = await page.evaluate(() => { const e = document.querySelector('input[type=date][data-blank-print]'), f = [...document.querySelectorAll('input[type=date]:not([data-blank-print])')].find(i => i.value); return { empty: e ? getComputedStyle(e).color : null, filled: f ? getComputedStyle(f).color : null }; });
    assert.strictEqual(printed.empty, 'rgba(0, 0, 0, 0)', 'an empty box prints transparent');
    if (printed.filled) assert.notStrictEqual(printed.filled, 'rgba(0, 0, 0, 0)', 'a filled box prints its date');
  });
  await test('after printing the marks are removed', async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    assert.strictEqual(await page.locator('input[type=date][data-blank-print]').count(), 0);
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
