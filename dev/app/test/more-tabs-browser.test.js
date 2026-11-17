// The desktop tab strip is one row with a More menu for the rarely used tabs; the phone menu still lists every tab; keyboard works. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/more-tabs-browser.test.js
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
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); await page.waitForTimeout(400);
  await test('at 1366 and 1280 the tab strip is one row, with the More button last', async () => {
    for (const w of [1366, 1280]) { await page.setViewportSize({ width: w, height: 768 }); await page.waitForTimeout(250);
      const r = await page.evaluate(() => { const v = [...document.querySelectorAll('.tabs button')].filter(x => x.offsetParent); return { rows: new Set(v.map(x => Math.round(x.getBoundingClientRect().top))).size, last: v[v.length - 1].id, hidden: [...document.querySelectorAll('.tabs button.moretab')].every(x => !x.offsetParent) }; });
      assert.strictEqual(r.rows, 1, w + ' wide: ' + r.rows + ' rows'); assert.strictEqual(r.last, 'tabMore'); assert(r.hidden, 'the More tabs are not in the strip'); }
  });
  await test('the More menu lists the other tabs, opens one, shows "More: History" while it is open, and Escape closes it', async () => {
    await page.click('#tabMore'); await page.waitForTimeout(200); const items = await page.$$eval('#moreMenu button', b => b.map(x => x.textContent)); assert.deepStrictEqual(items, ['Uniforms', 'Calendar', 'Statistics', 'Awana store points', 'History', 'Options', 'How it works']);
    assert.strictEqual(await page.getAttribute('#tabMore', 'aria-expanded'), 'true'); await page.click('#moreMenu button[data-moretab="history"]'); await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(() => App.tab), 'history'); assert(await page.isVisible('#tab-history')); assert(/More: History/.test(await page.textContent('#tabMore')), await page.textContent('#tabMore')); assert(await page.evaluate(() => document.getElementById('tabMore').classList.contains('on')));
    assert.strictEqual(await page.isVisible('#moreMenu'), false, 'closed after choosing'); await page.click('#tabMore'); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(150); assert.strictEqual(await page.isVisible('#moreMenu'), false);
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'tabMore', 'focus returns to the More button');
    await page.click('.tabs button[data-tab="roster"]'); await page.waitForTimeout(300); assert(/^More\s*▾?\s*$/.test((await page.textContent('#tabMore')).replace(/\s+/g, ' ').trim()) || !/More:/.test(await page.textContent('#tabMore')), 'the label goes back to More');
  });
  await test('Validate and Debug are pages of Options: a pill bar on each, Options stays marked, neither is in the strip or More', async () => {
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="options"]').click()); await page.waitForTimeout(300); await page.click('#tab-options .optsubs button[data-optsub="debug"]'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => App.tab), 'debug'); assert(await page.evaluate(() => document.querySelector('.tabs button[data-tab="options"]').classList.contains('on')), 'Options stays marked'); assert(/More: Options/.test(await page.textContent('#tabMore')), 'the More button says Options while on Validate or Debug');
    await page.click('#tab-debug .optsubs button[data-optsub="validate"]'); await page.waitForTimeout(300); assert(await page.isVisible('#tab-validate')); await page.click('#tab-validate .optsubs button[data-optsub="options"]'); await page.waitForTimeout(300); assert(await page.isVisible('#tab-options'));
    assert.strictEqual(await page.locator('.tabs button[data-tab="debug"]:visible, .tabs button[data-tab="validate"]:visible').count(), 0);
  });
  await test('keyboard: Right arrow along the strip reaches More without opening anything, and Enter opens the menu with arrow keys moving through it', async () => {
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="roster"]').click()); await page.waitForTimeout(200); await page.focus('.tabs button[data-tab="reports"]'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150); assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'tabMore');
    assert.notStrictEqual(await page.evaluate(() => App.tab), undefined); await page.keyboard.press('Enter'); await page.waitForTimeout(200); assert(await page.isVisible('#moreMenu'));
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100); assert.strictEqual(await page.evaluate(() => document.activeElement.dataset.moretab), 'calendar'); await page.keyboard.press('Enter'); await page.waitForTimeout(300); assert.strictEqual(await page.evaluate(() => App.tab), 'calendar');
  });
  await test('on a phone there is no More button: the tab menu still lists every tab', async () => {
    await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(300); assert.strictEqual(await page.isVisible('#tabMore'), false); await page.click('#tabMenu'); await page.waitForTimeout(200);
    const open = await page.evaluate(() => { document.querySelectorAll('.tabgrp').forEach(g => g.classList.add('open')); return [...document.querySelectorAll('.tabs button[data-tab]')].filter(x => x.offsetParent).length; }); assert.strictEqual(open, 14, 'tabs listed on a phone: ' + open);      // 14, not 16: Validate and Debug have the hidden attribute and are reached from the Options sub-nav. The old 16 counted them only because .tabs button { display:flex } overrode [hidden] (UX-01).
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
