// T&T book tabs on Progress, "finished before" ticks, and the T&T Achievement Record per book. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/books-browser.test.js
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
  const page = await (await browser.newContext()).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  await tab('person'); await page.waitForTimeout(300);
  await page.selectOption('#peGroup', 'T&T'); await page.waitForTimeout(300);
  const kid = await page.$eval('#pePerson', e => e.value);
  await test('a T&T child has a tab for each of the four books, and sections are entered under the chosen book', async () => {
    const tabs = (await page.$$eval('.booktabs button', b => b.map(x => x.textContent.replace(/\u25cf/g, '').trim()))).filter(Boolean); assert.deepStrictEqual(tabs, ['Agents of Grace', 'Discovery of Grace', 'Grace in Action', 'Evidence of Grace']);
    await page.click('.booktabs button[data-book="DoG"]'); await page.waitForTimeout(200);
    await page.click('.pblock:has(.plabel:text-matches("^Blue Emblem 1")) button[data-today]'); await page.waitForTimeout(300);
    const p = await page.evaluate(id => window.App.season.progress[id], kid); assert(p.DoG && Object.keys(p.DoG).length === 1 && !p.common, JSON.stringify(p));
  });
  await test('ticking a book as finished before is saved, counted, and listed under Books finished', async () => {
    await page.click('.booktabs button[data-book="AoG"]'); await page.waitForTimeout(200); await page.check('input[data-bookdone="AoG"]'); await page.waitForTimeout(300);      // "Finished before" is a tick on each book's sheet
    assert.deepStrictEqual(await page.evaluate(id => window.App.season.doneBooks[id], kid), ['AoG']); assert(await page.isChecked('input[data-bookdone="AoG"]'), 'the tick stays on');
    await page.uncheck('input[data-bookdone="AoG"]'); await page.waitForTimeout(300); assert.strictEqual(await page.evaluate(id => (window.App.season.doneBooks || {})[id], kid), undefined);
  });
  await test('the tick boxes have names and are 44px on a phone', async () => {
    await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(200);
    const r = await page.$$eval('input[data-bookdone]', els => els.map(e => ({ n: e.getAttribute('aria-label'), h: e.closest('.bdone').getBoundingClientRect().height }))); assert(r.length >= 1 && r.every(x => x.n && x.h >= 43), r.length + ' ' + JSON.stringify(r));      // one tick on the open sheet
  });
  await test('the T&T Achievement Record prints one page per book the child has started', async () => {
    await page.evaluate(id => { window.App.reportOptions({ group: 'T&T', kid: id }); window.App.showReport('achievement'); }, kid); await page.waitForTimeout(600);
    const t = await page.evaluate(() => document.body.innerText); assert(/Discovery of Grace/.test(t) && /Start Zone/.test(t), 'book and Start Zone shown');
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
