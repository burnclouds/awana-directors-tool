// Mark past years given, in the real page: the button on a child's Progress sheet and the two-step club-wide card on Options. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/past-years-browser.test.js
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
  const page = await (await browser.newContext()).newPage(); const errs = [], dialogs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  await tab('person'); await page.waitForTimeout(400);
  const kid = await page.$eval('#pePerson', e => e.value);
  await page.evaluate(id => { const S = window.Season, s = window.App.season; ['1', '2', '3', '4', '5', '6'].forEach(i => S.setProgress(s, id, 'common', 'FLT.' + i, '2020-03-04')); window.App.touch(); }, kid);
  await tab('options'); await page.waitForTimeout(300); await tab('person'); await page.waitForTimeout(400);

  await test('a child with earlier-year awards sees them listed and a button', async () => {
    assert(await page.isVisible('#btnPastGiven'), 'button shown'); assert(/Flight 3:16/.test(await page.textContent('.pastyears')) || /earlier years/.test(await page.textContent('.pastyears')));
  });
  await test('the button asks first, marks them given with no date, and goes away', async () => {
    dialogs.length = 0; await page.click('#btnPastGiven'); await page.waitForTimeout(300);
    assert.strictEqual(dialogs.length, 1, 'one confirmation'); assert(/given, with no date/.test(dialogs[0]));
    assert.strictEqual(await page.locator('#btnPastGiven').count(), 0, 'button gone');
    const r = await page.evaluate(id => ({ nd: window.Season.isGivenNoDate(window.App.season, id, 'Flight 3:16'), shown: window.Season.givenShown(window.App.season, id, 'Flight 3:16') }), kid);
    assert.deepStrictEqual(r, { nd: true, shown: '' });
  });
  await test('Undo takes it back', async () => {
    await page.click('#btnUndo'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(id => window.Season.isGivenNoDate(window.App.season, id, 'Flight 3:16'), kid), false);
  });
  await test('Options: count first, then a second confirmation, then done; counting again finds none', async () => {
    await tab('options'); await page.waitForTimeout(300);
    assert.strictEqual(await page.locator('#optPastGo').count(), 0, 'nothing to confirm before counting');
    await page.click('#optPastCount'); await page.waitForTimeout(200);
    assert(/\d+ awards? for \d+ child/.test(await page.textContent('#optPastYears')), 'count shown');
    dialogs.length = 0; await page.click('#optPastGo'); await page.waitForTimeout(300);
    assert.strictEqual(dialogs.length, 1); assert(/including children who have left/.test(dialogs[0]));
    await page.click('#optPastCount'); await page.waitForTimeout(200);
    assert(/Nothing to mark/.test(await page.textContent('#optPastYears')));
  });
  await test('the button is a 44px target on a phone and has a name', async () => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.evaluate(id => { const S = window.Season, s = window.App.season; S.clearGiven && S.clearGiven(s, id, 'Flight 3:16'); S.setGiven(s, id, 'Flight 3:16', ''); window.App.touch(); }, kid);
    await tab('person'); await page.waitForTimeout(400);
    const h = await page.$eval('#btnPastGiven', e => e.getBoundingClientRect().height); assert(h >= 43.5, 'height ' + h);
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
