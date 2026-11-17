// The desktop header is short: title, buttons and status on one row, one (i), the Recent chips scroll away, and the held-changes bar shows only when there is something to apply. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/header-browser.test.js
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
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  await tab('person'); await page.waitForTimeout(500);
  await test('the sticky header is at most 140 px at 1366x768 (it was 206)', async () => {
    const h = await page.evaluate(() => Math.round(document.getElementById('stickyTop').getBoundingClientRect().height)); assert(h <= 140, 'height ' + h);
  });
  await test('the title and the buttons share one row, and there is one (i) in the bar', async () => {
    const r = await page.evaluate(() => { const t = document.querySelector('.top h1').getBoundingClientRect(), b = document.getElementById('btnFile').getBoundingClientRect(), i = document.querySelectorAll('.top i.info');
      return { sameRow: Math.abs((t.top + t.height / 2) - (b.top + b.height / 2)) < 20, infos: i.length, note: i[0] && i[0].dataset.info }; });
    assert(r.sameRow, 'one row'); assert.strictEqual(r.infos, 1); assert.strictEqual(r.note, 'files.bar');
  });
  await test('the status is short ("N active · PC data DATE") with the long form as its tooltip, and unsaved edits are one orange chip', async () => {
    const t = await page.$eval('#status', e => ({ text: e.textContent, title: e.title })); assert(/^\d+ active · PC data \d{4}-\d\d-\d\d/.test(t.text), t.text); assert(/Planning Center data as of/.test(t.title), t.title);
    await page.evaluate(() => { App.season.handbooks['x'] = 'HG'; App.touch(); }); await page.waitForTimeout(200);
    const c = await page.$eval('#seasonStatus', e => ({ text: e.textContent.trim(), dirty: e.classList.contains('dirty'), bg: getComputedStyle(e).backgroundColor, title: e.title })); assert(c.dirty && /unsaved/.test(c.text) && c.text.length < 24, JSON.stringify(c)); assert(c.bg !== 'rgba(0, 0, 0, 0)', 'a chip'); assert(/Data file/.test(c.title));
  });
  await test('Recent places is not in the sticky header or inside the scrolling page; on a wide screen it is a Recent button in the tab strip, after More, and the old bar is hidden', async () => {
    assert.strictEqual(await page.evaluate(() => !!document.getElementById('stickyTop').querySelector('#trailBar')), false); assert.strictEqual(await page.evaluate(() => !!document.querySelector('main #trailBar')), false);
    await page.evaluate(() => { document.querySelector('.tabs button[data-tab="attend"]').click(); document.querySelector('.tabs button[data-tab="roster"]').click(); }); await page.waitForTimeout(300);
    assert(await page.evaluate(() => !document.getElementById('trailBar').offsetParent), 'the chip bar is hidden on a wide screen');
    assert(await page.evaluate(() => { const b = document.getElementById('trailTop'), m = document.getElementById('tabMore'); return !!b.offsetParent && b.getBoundingClientRect().left > m.getBoundingClientRect().left; }), 'Recent is in the tab strip, after More');
  });
  await test('a held-changes tab with nothing to apply shows no bar; the first change shows it, Discard hides it again', async () => {
    await tab('options'); await page.waitForTimeout(400); assert.strictEqual(await page.isVisible('#draftBar'), false, 'no bar while idle');
    await page.evaluate(() => { App.season.config.drivePinDays = 12; App.touch(); }); await page.waitForTimeout(300); assert(await page.isVisible('#draftBar'), 'the bar appears with a change'); assert(/1 change not applied yet/.test(await page.textContent('#draftBar')));
    page.once('dialog', d => d.accept()); await page.click('#btnDraftDiscard'); await page.waitForTimeout(300); assert.strictEqual(await page.isVisible('#draftBar'), false, 'gone again');
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
