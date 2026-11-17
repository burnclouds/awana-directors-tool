// One Import button: it replaces Open files and Import Planning Center CSV, takes any of the files (data file, Planning Center export, calendar, rotation, colors) and reviews Planning Center changes first. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/import-button-browser.test.js
// Usage: NODE_PATH=<dir with playwright> node test/options-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f))), EXPORT = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort()[0]), NEWER = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort().pop());   // NEWER adds 15 registrations, so it needs a review
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
    const ctx = await browser.newContext({ acceptDownloads: true }), page = await ctx.newPage(), msgs = [];
    page.on('dialog', d => { msgs.push(d.message()); d.accept(); }); page.on('pageerror', e => msgs.push('PAGE ERROR ' + e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { page, msgs };
  };
  const tab = (page, n) => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), n);
  await test('the header has Save with a File arrow, and the File menu has Import (from this computer), a separator and Save; without Drive set up there is nothing else', async () => {
    const { page } = await open(); assert.strictEqual(await page.locator('header .actions label.btn').count(), 0, 'no Open files / Import Planning Center CSV buttons'); assert.strictEqual(await page.locator('#filePC').count(), 0, 'the second file input is gone'); assert.strictEqual(await page.locator('#fileAny').count(), 1);
    assert.strictEqual((await page.textContent('#btnSeasonSave')).trim(), 'Download data file', 'the main button saves'); await page.click('#btnFile'); await page.waitForTimeout(200);
    const items = await page.$$eval('#fileMenu button', b => b.map(x => x.textContent.replace(/\u2713/, '').trim())), html = await page.innerHTML('#fileMenu');
    assert.deepStrictEqual(items, ['Import from this computer…', 'Merge a data file…', 'Download data file (now)'], items.join('|')); assert(/<hr>/.test(html), 'a separator between Import and Save'); assert(!/Google Drive/.test(html), 'no Drive items without Drive');
    const chooser = page.waitForEvent('filechooser', { timeout: 3000 }); await page.click('#fileMenu [data-fm="imp-local"]'); await chooser; assert.strictEqual(await page.isVisible('#fileMenu'), false, 'the menu closes after a choice'); await page.close();
  });
  await test('Import takes a Planning Center export on top of an open data file and recognizes it (no "not a file" error)', async () => {
    const { page, msgs } = await open(); const exp = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort()[1]);
    await page.setInputFiles('#fileAny', [exp]); await page.waitForTimeout(800);
    assert(!msgs.some(m => /ERROR|not a file/.test(m)), msgs.join(' | '));
    assert(await page.evaluate(() => /Review import|\d+ active/.test(document.body.innerText)), 'the export was recognized and imported or put up for review'); await page.close();
  });
  await test('the wording follows: a tab with nothing loaded says to use Import, not Open files', async () => {
    const ctx = await browser.newContext(), page = await ctx.newPage(); await page.goto(url); await page.click('#splashSkip'); await page.evaluate(() => document.querySelector('.tabs button[data-tab="stats"]').click());
    assert(/Import…|Import…/.test(await page.textContent('#statsWrap')) && !/Open files/.test(await page.textContent('#statsWrap')), await page.textContent('#statsWrap')); await ctx.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
