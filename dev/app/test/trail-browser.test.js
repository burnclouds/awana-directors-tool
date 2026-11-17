// Recent places: the last 10 places visited, a tap to go back to one. On a wide screen the list opens from a Recent button after More;
// on a phone it opens from a Recent places menu button. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/trail-browser.test.js
const { chromium } = require('playwright');
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f))), EXPORT = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort()[0]), NEWER = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort().pop());
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
  // The list is read from the Recent menu on a wide screen (it holds the same places as the phone's menu, and is in the page even while closed).
  const chips = page => page.$$eval('#trailTopMenu .chip', e => e.map(x => x.textContent));
  const current = page => page.$eval('#trailTopMenu .chip[aria-current="true"]', e => e.textContent);
  // Opens the Recent menu on a wide screen and picks a place by its label.
  const pickTop = async (page, label) => { await page.click('#trailTop'); await page.waitForTimeout(100); await page.click('#trailTopMenu .chip:has-text("' + label + '")'); await page.waitForTimeout(300); };
  const sparks = async page => { const r = (await page.$$eval('#attRoom option', o => o.map(x => x.value))).find(v => /Spark/i.test(v)); await page.selectOption('#attRoom', r); await page.waitForTimeout(150); return r; };

  await test('visiting tabs builds the list: the Recent button appears from the second place, the current one is marked, a revisit does not add a duplicate', async () => {
    const { page } = await open(); assert(!(await page.isVisible('#trailTop')), 'one place is not a trail');
    await tab(page, 'attend'); await page.waitForTimeout(200); const room = await sparks(page);
    await tab(page, 'games'); await page.waitForTimeout(200); await tab(page, 'store'); await page.waitForTimeout(200);
    assert(await page.isVisible('#trailTop'), 'the Recent button shows');
    const c = await chips(page); assert.strictEqual(c.length, 4, c.join(' | ')); assert(/^Awana store points/.test(c[0]) && /^Games/.test(c[1]) && /^Attendance · \d+\/\d+ · /.test(c[2]) && c[3] === 'Roster', c.join(' | '));
    assert.strictEqual(await current(page), c[0]);
    await tab(page, 'attend'); await page.waitForTimeout(200);
    const c2 = await chips(page); assert.strictEqual(c2.length, 4, 'no duplicate'); assert(/^Attendance/.test(c2[0]) && /Spark/.test(c2[0]) && c2[0].includes(room), 'the revisited place moves to the front: ' + c2.join(' | '));
    await page.close();
  });
  await test('on a wide screen the chip row is hidden, the Recent button sits after More, and the menu closes on Escape or an outside click', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(200); await sparks(page); await tab(page, 'games'); await page.waitForTimeout(200);
    assert(!(await page.isVisible('#trailBar')), 'the chip row is hidden on a wide screen');
    const x = await page.evaluate(() => [document.getElementById('tabMore').getBoundingClientRect().left, document.getElementById('trailTop').getBoundingClientRect().left]);
    assert(x[1] > x[0], 'Recent is after More: ' + x.join(' < '));
    await page.click('#trailTop'); await page.waitForTimeout(100); assert(await page.isVisible('#trailTopMenu'), 'the menu opens');
    await page.keyboard.press('Escape'); await page.waitForTimeout(100); assert(!(await page.isVisible('#trailTopMenu')), 'Esc closes it');
    await page.click('#trailTop'); await page.waitForTimeout(100); await page.click('h1'); await page.waitForTimeout(100); assert(!(await page.isVisible('#trailTopMenu')), 'an outside click closes it');
    await page.close();
  });
  await test('a menu item jumps back to that place with its night and class, without reordering the list', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(200); const room = await sparks(page); const date = await page.$eval('#attDate', e => e.value);
    await tab(page, 'games'); await page.waitForTimeout(200); await tab(page, 'calendar'); await page.waitForTimeout(200);
    await page.selectOption('#attRoom', room).catch(() => {});
    const before = await chips(page); await pickTop(page, 'Attendance');
    assert(await page.isVisible('#tab-attend')); assert.strictEqual(await page.$eval('#attDate', e => e.value), date); assert.strictEqual(await page.$eval('#attRoom', e => e.value), room);
    assert.deepStrictEqual(await chips(page), before, 'the order did not change'); assert(/^Attendance/.test(await current(page)));
    await page.close();
  });
  await test('moving to another child or night on the same tab replaces that place instead of adding one', async () => {
    const { page } = await open(); await tab(page, 'person'); await page.waitForTimeout(250);
    for (let i = 0; i < 4; i++) { await page.click('#btnPeNext'); await page.waitForTimeout(120); }
    const c = await chips(page); assert.strictEqual(c.filter(x => /^Person/.test(x)).length, 1, c.join(' | '));
    const name = (await page.$eval('#pePerson', e => e.selectedOptions[0].textContent)).split(/ — /).pop().trim();
    assert(c[0] === 'Person · ' + name || c[0].includes(name), c.join(' | ') + ' vs ' + name);
    await page.close();
  });
  await test('the list holds at most 10 places', async () => {
    const { page } = await open();
    for (const t of ['todo', 'attend', 'games', 'awards','person', 'uniforms', 'calendar', 'stats', 'store', 'reports', 'history', 'options']) { await tab(page, t); await page.waitForTimeout(120); }
    const c = await chips(page); assert.strictEqual(c.length, 10, c.join(' | ')); assert(/^Options/.test(c[0])); assert(!c.includes('Roster'), 'the oldest place fell off');
    await page.close();
  });
  await test('the Back to Attendance button and the list agree: going back to attendance does not add a second Attendance place', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(200); await sparks(page);
    await page.locator('#attendWrap a[data-person]').first().click(); await page.waitForTimeout(250); await page.click('#btnPeBack'); await page.waitForTimeout(300);
    const c = await chips(page); assert.strictEqual(c.filter(x => /^Attendance/.test(x)).length, 1, c.join(' | ')); assert(/^Attendance/.test(await current(page)));
    await page.close();
  });
  await test('the list is not saved anywhere: no storage entry mentions it, and opening another file starts it over', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(200); await tab(page, 'person'); await page.waitForTimeout(200);
    const stored = await page.evaluate(() => JSON.stringify(Object.assign({}, localStorage, sessionStorage)).toLowerCase()); assert(!/trail|recent/.test(stored), stored.slice(0, 200));
    assert(!(await page.evaluate(() => JSON.stringify(App.season).includes('trail'))), 'not in the data file');
    await page.setInputFiles('#fileAny', [DATA]); await page.waitForTimeout(800);
    assert(!(await page.isVisible('#trailTop')) || (await chips(page)).length <= 2, 'the places of the old file are gone');
    await page.close();
  });
  await test('on a phone the chips are a Recent places menu: it opens, lists the places, and a tap goes there', async () => {
    const { page } = await open(); await page.setViewportSize({ width: 390, height: 844 });
    await tab(page, 'attend'); await page.waitForTimeout(200); const room = await sparks(page); await tab(page, 'games'); await page.waitForTimeout(200);
    /* UX-07: on a phone the Recent places are the last group of the tab menu; the bar is gone */
    assert(!(await page.isVisible('#trailBar')), 'no Recent bar on a phone'); assert(!(await page.isVisible('#trailTop')), 'the desktop Recent button is hidden on a phone');
    await page.click('#tabMenu'); await page.waitForTimeout(100); assert(await page.isVisible('#recentGrp'), 'a Recent group in the menu'); await page.click('#recentGrp .grphead'); await page.waitForTimeout(100);
    assert.strictEqual(await page.$$eval('#recentGrp .chip', e => e.length), 3);
    assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways scroll');
    await page.click('#recentGrp .chip:has-text("Attendance")'); await page.waitForTimeout(300);
    assert(await page.isVisible('#tab-attend')); assert.strictEqual(await page.$eval('#attRoom', e => e.value), room); assert(!(await page.isVisible('#tabsNav')), 'the menu closes');
    await page.click('#tabMenu'); await page.keyboard.press('Escape'); assert(!(await page.isVisible('#tabsNav')), 'Esc closes it');
    await page.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
