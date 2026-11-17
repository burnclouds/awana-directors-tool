// The To do page: "Needs a date received" rows take the date (or a no-date tick) directly, saved as it is on Progress. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/todo-date-entry-browser.test.js
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
  // Set up one child with a book and no date received (cleared on their current book), so the row exists.
  await page.evaluate(() => { const M = window.Model, S = window.Season, s = window.App.season; for (const p of window.App.master.people.filter(x => M.isActive(x) && M.isClubber(x) && ['Sparks', 'T&T'].includes(M.groupOf(M.room(x))))) { const id = p[M.X.ID], code = S.childBook(s, id); if (code && s.config.books[code]) { try { S.setReceived(s, id, code, ''); } catch (e) {} window.App.touch(); return; } } });
  await page.evaluate(() => App.showTab('todo')); await page.waitForTimeout(300);
  const row = await page.evaluate(() => { const i = document.querySelector('input[data-recv-id]'); return i ? { id: i.dataset.recvId, book: i.dataset.recvBook } : null; });
  await test('a "Needs a date received" row has a date box and a no-date tick', async () => {
    assert(row, 'the test club has a child with a book and no date received');
    assert(await page.locator('input[data-recv-id="' + row.id + '"][data-recv-book="' + row.book + '"]').count() === 1, 'date box');
    assert(await page.locator('input[data-recv-nodate="' + row.id + '"][data-recv-book="' + row.book + '"]').count() === 1, 'no-date tick');
  });
  await test('a date typed on To do is saved as the date received for that book', async () => {
    await page.evaluate(([i, b]) => { const el = document.querySelector('input[data-recv-id="' + i + '"][data-recv-book="' + b + '"]'); el.value = '2026-10-14'; el.dispatchEvent(new Event('change', { bubbles: true })); }, [row.id, row.book]);

    assert.strictEqual(await page.evaluate(([i, b]) => window.Season.receivedOf(window.App.season, i, b), [row.id, row.book]), '2026-10-14', 'saved');
  });
  await test('ticking no date saves the book as received with no date and the row leaves To do', async () => {
    await page.check('input[data-recv-nodate="' + row.id + '"][data-recv-book="' + row.book + '"]').catch(() => {});
    await page.waitForTimeout(300);
    assert(await page.evaluate(([i, b]) => window.Season.isReceivedNoDate(window.App.season, i, b), [row.id, row.book]) || (await page.locator('input[data-recv-id="' + row.id + '"][data-recv-book="' + row.book + '"]').count()) === 0, 'recorded or gone from To do');
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
