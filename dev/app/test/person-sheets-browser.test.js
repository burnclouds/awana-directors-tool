// A child's page on the Person tab: the Progress sub-tab (one book tab per progress sheet, + Add sheet, the shared sheet boxes, Finished before),
// and the Awards sub-tab (what was earned, no Given tick, the Announce page for the chosen night). Invented test club.
// Usage: NODE_PATH=<dir with playwright> node test/person-sheets-browser.test.js
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
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  const kids = await page.evaluate(() => { const f = g => App.master.people.find(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === g)[Model.X.ID]; return { c: f('Cubbies'), s: f('Sparks'), t: f('T&T') }; });
  // Opens a child on a Person sub-tab ('progress' | 'awards' | 'registration' | 'attendance').
  const open = async (id, sub = 'progress') => { await page.evaluate(([i, s]) => App.showPerson(i, { sub: s }), [id, sub]); await page.waitForTimeout(400); };
  const bookTabs = () => page.$$eval('#progressWrap .booktabs button', b => b.map(x => x.textContent.trim()));
  const subTabs = () => page.$$eval('#peSub button[data-sub]', b => b.map(x => x.dataset.sub));
  await test('the Progress sub-tab has one book tab for the book of the child\'s class, and a + Add sheet picker for the rest', async () => {
    await open(kids.s); assert.deepStrictEqual(await subTabs(), ['progress', 'attendance', 'awards', 'registration'], 'four sub-tabs, Progress first');
    assert((await bookTabs()).length >= 1, 'a book tab'); assert(await page.isVisible('#peAddSheet'), 'the + Add sheet picker');
    const o = await page.$$eval('#peAddSheet option', x => x.map(y => y.textContent)); assert(o.some(y => /Honeycomb|HoneyComb/i.test(y)) && o.some(y => /Agents of Grace/.test(y)), o.join('|'));
  });
  await test('a book tab is the progress sheet: dates entered there are saved, and the Progress view shows the same dates', async () => {
    await page.click('#progressWrap .booktabs button'); await page.waitForTimeout(250);
    const key = await page.$eval('#progressWrap input[type="date"][data-key]', e => e.dataset.key), scope = await page.$eval('#progressWrap input[type="date"][data-key]', e => e.dataset.scope);
    await page.fill('#progressWrap input[data-key="' + key + '"]', '2026-11-04'); await page.press('#progressWrap input[data-key="' + key + '"]', 'Enter'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(([i, sc, k]) => App.season.progress[i][sc][k], [kids.s, scope, key]), '2026-11-04', 'saved');
    assert.strictEqual(await page.inputValue('#progressWrap input[data-key="' + key + '"]'), '2026-11-04', 'still shown');
    await open(kids.s); assert.strictEqual(await page.inputValue('#progressWrap input[data-key="' + key + '"]'), '2026-11-04', 'shown again after leaving the child');
  });
  await test('+ Add sheet opens another book\'s sheet (a Sparks child can have a Cubbies book), and Apple Acres shows only on the first Cubbies book', async () => {
    await open(kids.s); await page.selectOption('#peAddSheet', 'HC'); await page.waitForTimeout(300); assert((await bookTabs()).some(x => /HoneyComb/i.test(x)), (await bookTabs()).join('|'));
    assert(!/Apple Acres/.test(await page.textContent('#progressWrap')), 'not on HoneyComb'); await page.selectOption('#peAddSheet', 'AS'); await page.waitForTimeout(300); assert(/Apple Acres/.test(await page.textContent('#progressWrap')), 'on AppleSeed, the first Cubbies book');
  });
  await test('Finished before is a tick on the sheet and is saved with the child', async () => {
    await page.check('#progressWrap input[data-bookdone="AS"]'); await page.waitForTimeout(300); assert(await page.evaluate(i => (App.season.doneBooks[i] || []).includes('AS'), kids.s));
  });
  await test('a Cubbies child and a T&T child get their own books; Start Zone only on the first T&T book', async () => {
    await open(kids.c); assert((await bookTabs()).some(x => /Appleseed|HoneyComb/i.test(x)), (await bookTabs()).join('|'));
    await open(kids.t); const t = await bookTabs(); assert(t.some(x => /Agents|Discovery|Grace|Evidence/.test(x)), t.join('|'));
    await page.click('#progressWrap .booktabs button[data-book="DoG"]'); await page.waitForTimeout(300); assert(!/Start Zone/.test(await page.textContent('#progressWrap')), 'not on Discovery of Grace');
  });
  await test('the Awards sub-tab shows what the child earned and was told to the group, has no Given tick, and opens the Announce page for the chosen night', async () => {
    await open(kids.s, 'awards'); assert((await subTabs()).includes('awards'), 'Awards sub-tab exists');
    const night = await page.evaluate(i => { const d = App.nightList().map(n => n.date)[0]; Season.addAward(App.season, d, i, 'Certificate of Award'); App.touch(); App.refresh(); return d; }, kids.s);
    await open(kids.s, 'awards');
    const txt = await page.textContent('#personWrap .peawards'); assert(/Certificate of Award/.test(txt) && /Awards earned/.test(txt), txt.slice(0, 200));
    assert((await page.locator('#personWrap .peawards input[type="checkbox"]').count()) === 0, 'no Given tick');
    await page.selectOption('#peAwNight', night); await page.click('[data-peannpage]'); await page.waitForTimeout(400);
    assert(await page.isVisible('#tab-awards'), 'on the Awards tab'); assert.strictEqual(await page.inputValue('#awDate'), night);
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
