// Night by night statistics (S15) in a real browser: children and adults on their own, the Whole season / quarter buttons, the choice surviving a redraw, and the printed report.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/stats-nights-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } }), page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.clock.setFixedTime(new Date('2026-11-16T12:00:00'));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => document.querySelector('.tabs button[data-tab="stats"]').click()); await page.waitForTimeout(400);
  const table = () => page.$$eval('#statsWrap h3', hs => { const h = hs.find(x => /Night by night/.test(x.textContent)); const t = h && h.nextElementSibling && h.nextElementSibling.querySelector('table') || (h && h.parentElement.querySelector('table')); return t ? [...t.querySelectorAll('tr')].map(r => [...r.children].map(c => c.textContent.trim())) : null; });

  await test('the Night by night heading is on the Attendance group, with the span buttons', async () => {
    assert(await page.$eval('#statsWrap', el => /Night by night: children and adults/.test(el.textContent)), 'heading');
    assert.deepStrictEqual(await page.$$eval('#statsWrap .statspan button', b => b.map(x => x.textContent)), ['Whole season', 'Q1', 'Q2', 'Q3', 'Q4']);
  });
  await test('the table has Figure, Children, Adults and the eight rows in order', async () => {
    const t = await table(); assert(t, 'table found');
    assert.deepStrictEqual(t[0], ['Figure', 'Children', 'Adults']);
    assert.deepStrictEqual(t.slice(1).map(r => r[0]), ['Nights counted', 'Highest', 'Lowest', 'Average (mean)', 'Median', 'Mode', 'Standard deviation (population, σ)', 'Standard deviation (sample, s)']);
  });
  await test('TEST data: 7 children nights; adults show that none are marked', async () => {
    const t = await table();
    assert.strictEqual(t[1][1], '7', 'nights counted for children');
    assert(/No adults marked/.test(t[1][2]), 'adults column explains');
  });
  await test('Q2 has no held nights on TEST data: its button is disabled, and Whole season brings the figures back', async () => {
    assert(await page.$eval('#statsWrap .statspan button[data-span="Q2"]', b => b.disabled), 'Q2 disabled');
    await page.click('#statsWrap .statspan button[data-span="Q1"]'); await page.waitForTimeout(200);
    assert(await page.$eval('#statsWrap .statspan button[data-span="Q1"]', b => b.getAttribute('aria-pressed') === 'true'), 'Q1 pressed');
    const q1 = await table(); assert.strictEqual(q1[1][1], '7', 'Q1 holds all seven nights');
    await page.click('#statsWrap .statspan button[data-span="season"]'); await page.waitForTimeout(200);
    assert.strictEqual((await table())[1][1], '7');
  });
  await test('the chosen span survives a redraw', async () => {
    await page.click('#statsWrap .statspan button[data-span="Q1"]'); await page.waitForTimeout(150);
    await page.evaluate(() => App.refresh()); await page.waitForTimeout(300);
    assert(await page.$eval('#statsWrap .statspan button[data-span="Q1"]', b => b.getAttribute('aria-pressed') === 'true'), 'still Q1 after refresh');
    await page.click('#statsWrap .statspan button[data-span="season"]'); await page.waitForTimeout(150);
  });
  await test('the span buttons do not change the section (sub-tab) pressed', async () => {
    const before = await page.$$eval('#statsWrap .statsubs button', b => b.filter(x => x.getAttribute('aria-pressed') === 'true').map(x => x.textContent));
    await page.click('#statsWrap .statspan button[data-span="Q1"]'); await page.waitForTimeout(150);
    assert.deepStrictEqual(await page.$$eval('#statsWrap .statsubs button', b => b.filter(x => x.getAttribute('aria-pressed') === 'true').map(x => x.textContent)), before);
    await page.click('#statsWrap .statspan button[data-span="season"]'); await page.waitForTimeout(150);
  });
  await test('a phone (375 wide): span buttons are at least 44px tall, and no sideways page scroll', async () => {
    await page.setViewportSize({ width: 375, height: 667 }); await page.waitForTimeout(250);
    const h = await page.$$eval('#statsWrap .statspan button', b => b.map(x => x.getBoundingClientRect().height));
    assert(h.every(x => x >= 43.5), 'heights ' + h.join(','));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll');
    await page.setViewportSize({ width: 1280, height: 900 });
  });
  await test('the printable Statistics report carries the new heading', async () => {
    const html = await page.evaluate(() => { App.showReport('statistics'); return document.body.innerHTML; });
    assert(/Night by night: children and adults/.test(html), 'printable report has the heading');
    await page.evaluate(() => document.querySelector('.report-close, #btnReportClose') && document.querySelector('.report-close, #btnReportClose').click());
  });
  await test('no stray commas between the Night by night heading and its table, on screen and in the printed report', async () => {
    const stray = await page.evaluate(() => {
      const bad = []; const scan = root => root.querySelectorAll('.scroll').forEach(w => { const prev = w.previousSibling; if (prev && prev.nodeType === 3 && /,/.test(prev.textContent.trim())) bad.push(prev.textContent); w.childNodes.forEach(n => { if (n.nodeType === 3 && n.textContent.trim()) bad.push(n.textContent); }); });
      scan(document.getElementById('statsWrap')); App.showReport('statistics'); scan(document.getElementById('report')); return bad;
    });
    assert.deepStrictEqual(stray, [], 'stray text next to a table: ' + JSON.stringify(stray));
  });
  await test('no page errors', async () => { assert.deepStrictEqual(errs, []); });

  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
