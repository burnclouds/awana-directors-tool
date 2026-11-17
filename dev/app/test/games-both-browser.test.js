// Game results: Sparks and T&T are scored on one screen, no group box. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/games-both-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
setTimeout(() => { console.log('timed out'); process.exit(2); }, 120000).unref();
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => App.showTab('games')); await page.waitForTimeout(300);
  const sec = g => '#gamesWrap section[data-group="' + g + '"]';
  await test('there is no group box, and Sparks and T&T each have an entry table and a standings table', async () => {
    assert.strictEqual(await page.locator('#gameGroup').count(), 0, 'group box gone');
    for (const g of ['Sparks', 'T&T']) assert.strictEqual(await page.locator(sec(g) + ' table.games').count(), 2, g + ' has two tables');
  });
  await test('the two groups sit side by side on a wide screen', async () => {
    const a = await page.locator(sec('Sparks')).boundingBox(), b = await page.locator(sec('T&T')).boundingBox();
    assert(Math.abs(a.y - b.y) < 5 && b.x > a.x + 100, 'same row: ' + JSON.stringify([a, b]));
  });
  await test('a Sparks place and a T&T place for the same color save under their own groups', async () => {
    const night = await page.evaluate(() => document.getElementById('gameDate').value);
    await page.locator(sec('Sparks') + ' tr[data-team="Red"] button[data-f="place"][data-v="1"]').click(); await page.waitForTimeout(200);
    await page.locator(sec('T&T') + ' tr[data-team="Red"] button[data-f="place"][data-v="3"]').click(); await page.waitForTimeout(200);
    const g = await page.evaluate(d => JSON.parse(JSON.stringify(App.season.games[d])), night);
    assert.strictEqual(g.Sparks.Red.place, 1, 'Sparks'); assert.strictEqual(g['T&T'].Red.place, 3, 'T&T');
    assert.strictEqual(await page.locator(sec('Sparks') + ' tr[data-team="Red"] button[data-f="place"][data-v="1"]').getAttribute('aria-pressed'), 'true', 'Sparks still shows 1');
  });
  await test('the same-place warning shows only in the group that has it', async () => {
    await page.locator(sec('Sparks') + ' tr[data-team="Blue"] button[data-f="place"][data-v="1"]').click(); await page.waitForTimeout(200);
    assert.strictEqual(await page.locator(sec('Sparks') + ' p.bad').count(), 1, 'Sparks warns');
    assert.strictEqual(await page.locator(sec('T&T') + ' p.bad').count(), 0, 'T&T does not');
  });
  await test('a whole night for both groups is scored without touching any other control, and the data keeps its shape', async () => {
    const night = await page.evaluate(() => document.getElementById('gameDate').value), teams = await page.evaluate(() => Season.teamOrder(App.season));
    for (const g of ['Sparks', 'T&T']) for (let i = 0; i < teams.length; i++) {
      const pl = page.locator(sec(g) + ' tr[data-team="' + teams[i] + '"] button[data-f="place"][data-v="' + (i + 1) + '"]'); if ((await pl.getAttribute('aria-pressed')) !== 'true') { await pl.click(); await page.waitForTimeout(80); }      /* the last place is filled in by itself once three are set */
      await page.locator(sec(g) + ' tr[data-team="' + teams[i] + '"] button[data-f="spirit"][data-v="' + (i % 4) + '"]').click(); await page.waitForTimeout(80);
    }
    const g = await page.evaluate(d => JSON.parse(JSON.stringify(App.season.games[d])), night);
    assert.deepStrictEqual(Object.keys(g).sort(), ['Sparks', 'T&T'], 'games[date] holds exactly the two groups');
    for (const grp of ['Sparks', 'T&T']) { assert.deepStrictEqual(Object.keys(g[grp]).sort(), teams.slice().sort(), grp + ' has every team'); teams.forEach((t, i) => assert.deepStrictEqual(g[grp][t], { place: i + 1, spirit: i % 4 }, grp + ' ' + t + ' is { place, spirit } and nothing else')); }
    assert.strictEqual(await page.evaluate(() => document.getElementById('gameGroup') === null), true, 'no group control was needed');
  });
  await test('UX-11: tapping places 1, 2, 3 on three teams sets the fourth to 4 in the same Undo step; a tie (1, 1, 2) leaves the fourth blank; a second tap clears; Clear empties the row', async () => {
    await page.evaluate(() => { const d = document.getElementById('gameDate').value; delete App.season.games[d]; App.changed(); App.showTab('games'); });
    const teams = await page.evaluate(() => Season.teamOrder(App.season)), row = t => sec('Sparks') + ' tr[data-team="' + t + '"] ', hist = () => page.evaluate(() => App.season.history.length), night = await page.evaluate(() => document.getElementById('gameDate').value);
    for (let i = 0; i < 3; i++) { await page.locator(row(teams[i]) + 'button[data-f="place"][data-v="' + (i + 1) + '"]').click(); await page.waitForTimeout(100); }
    assert.strictEqual(await page.locator(row(teams[3]) + 'button[data-f="place"][data-v="4"]').getAttribute('aria-pressed'), 'true', 'the fourth got 4'); await page.click('#btnUndo'); await page.waitForTimeout(200); assert.strictEqual(await page.locator(row(teams[2]) + 'button[aria-pressed="true"][data-f="place"]').count() + await page.locator(row(teams[3]) + 'button[aria-pressed="true"][data-f="place"]').count(), 0, 'one Undo takes back the third tap and the automatic fourth together');
    await page.click('#btnRedo'); await page.waitForTimeout(200); assert.strictEqual(await page.locator(row(teams[3]) + 'button[data-f="place"][data-v="4"]').getAttribute('aria-pressed'), 'true', 'Redo brings both back');
    await page.locator(row(teams[3]) + 'button[data-f="place"][data-v="4"]').click(); await page.waitForTimeout(100); assert.strictEqual(await page.locator(row(teams[3]) + 'button[data-f="place"][data-v="4"]').getAttribute('aria-pressed'), 'false', 'a second tap clears');
    await page.locator(row(teams[1]) + 'button[data-f="place"][data-v="1"]').click(); await page.waitForTimeout(100);      /* now 1, 1, 3 and the fourth blank: a tie is allowed */
    const g = await page.evaluate(d => JSON.parse(JSON.stringify(App.season.games[d].Sparks)), night); assert.strictEqual(g[teams[3]] && g[teams[3]].place, undefined, 'a tie leaves the fourth blank');
    await page.locator(row(teams[0]) + 'button[data-f="spirit"][data-v="2"]').click(); await page.waitForTimeout(100); await page.locator(row(teams[0]) + 'button[data-clearrow]').click(); await page.waitForTimeout(100);
    assert.strictEqual(await page.locator(row(teams[0]) + 'button[aria-pressed="true"]').count(), 0, 'Clear empties the row'); assert(await page.locator(row(teams[0]) + 'button[data-clearrow]').isDisabled(), 'and Clear is disabled on an empty row');
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  // ---- on a phone (R12): stacked, 44px boxes, 16px text, nothing scrolls sideways ----
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }), ph = await pctx.newPage(); const perrs = []; ph.on('pageerror', e => perrs.push(e.message)); ph.on('dialog', d => d.accept());
  await ph.goto(url); await ph.setInputFiles('#splashFiles', [DATA]); await ph.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); await ph.evaluate(() => App.showTab('games')); await ph.waitForTimeout(300);
  await test('on a phone the groups are stacked, the score boxes are 44px tall with 16px text, and the page does not scroll sideways', async () => {
    const a = await ph.locator(sec('Sparks')).boundingBox(), b = await ph.locator(sec('T&T')).boundingBox(); assert(b.y > a.y + a.height - 5 && Math.abs(a.x - b.x) < 5, 'stacked: ' + JSON.stringify([a, b]));
    const r = await ph.evaluate(() => { const els = [...document.querySelectorAll('#gamesWrap .tapgrp button, #gameDate')].filter(e => e.offsetParent !== null); return { n: els.length, h: Math.min(...els.map(e => e.getBoundingClientRect().height)), f: Math.min(...els.map(e => parseFloat(getComputedStyle(e).fontSize))), sw: document.documentElement.scrollWidth > innerWidth || document.getElementById('gamesWrap').scrollWidth > document.getElementById('gamesWrap').clientWidth + 1 }; });
    assert(r.n >= 60, 'boxes found: ' + r.n); assert(r.h >= 43.5, 'a box is ' + Math.round(r.h) + 'px tall'); assert(r.f >= 16, 'font ' + r.f + 'px'); assert.strictEqual(r.sw, false, 'sideways scroll');
  });
  await test('no script errors on the phone', () => assert.deepStrictEqual(perrs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
