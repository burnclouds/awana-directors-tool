// Attendance: the child's name opens the Person tab, whose Back to Attendance button returns to the same night and class. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/attend-person-browser.test.js
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
  const kidOf = (page, group) => page.evaluate(g => { const p = App.master.people.find(q => Model.isActive(q) && Model.isClubber(q) && Model.groupOf(Model.room(q)) === g); return p && p[Model.X.ID]; }, group);
  await test('the name on the attendance sheet is a link to the Person tab; Back to Attendance returns to the same night and class', async () => {
    const { page, msgs } = await open(); await tab(page, 'attend'); await page.waitForTimeout(250);
    await page.selectOption('#attRoom', await page.$$eval('#attRoom option', o => o.map(x => x.value).find(v => /Sparks|Spark/i.test(v)) || o[1].value)); await page.waitForTimeout(150);
    const date = await page.$eval('#attDate', e => e.value), room = await page.$eval('#attRoom', e => e.value);
    const link = page.locator('#attendWrap a[data-person]').nth(1), id = await link.getAttribute('data-person'), name = await link.textContent();
    await link.click(); await page.waitForTimeout(250);
    assert(await page.isVisible('#tab-person'), 'Person tab is shown'); assert.strictEqual(await page.$eval('#pePerson', e => e.value), id);
    assert(await page.isVisible('#btnPeBack'), 'the back button is shown'); assert(/Back to Attendance/.test(await page.textContent('#btnPeBack')));
    await page.click('#btnPeBack'); await page.waitForTimeout(250);
    assert(await page.isVisible('#tab-attend')); assert.strictEqual(await page.$eval('#attDate', e => e.value), date); assert.strictEqual(await page.$eval('#attRoom', e => e.value), room);
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.dataset.person), id, 'focus is back on the child');
    assert(!msgs.some(m => /ERROR/.test(m)), msgs.join());
    await tab(page, 'person'); await page.waitForTimeout(150); assert(!(await page.isVisible('#btnPeBack')), 'a direct visit to the Person tab has no back button');
    await page.close();
  });
  const goSparks = async page => { await tab(page, 'attend'); await page.waitForTimeout(250); const sparks = (await page.$$eval('#attRoom option', o => o.map(x => x.value))).find(v => /Spark/i.test(v)); await page.selectOption('#attRoom', sparks); await page.waitForTimeout(150); return sparks; };
  const back = async page => { await page.click('#btnPeBack'); await page.waitForTimeout(900);      /* the "Unapplied changes" choice is answered by this page's dialog handler (accept = Apply and continue) */ if (!(await page.isVisible('#tab-attend')) && await page.isVisible('#btnDraftApply')) { await page.click('#btnDraftApply'); await page.waitForTimeout(200); await page.click('#btnPeBack'); await page.waitForTimeout(300); } };
  await test('a change of team made on the Person tab shows on the sheet when you go back', async () => {
    const { page } = await open(); await goSparks(page);
    const q = (await page.textContent('#attendWrap thead')).match(/Q\d/)[0], link = page.locator('#attendWrap a[data-person]').first(), id = await link.getAttribute('data-person');
    await link.click(); await page.waitForTimeout(250); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(150);
    const sel =page.locator('select[data-team="' + q + '"]'), cur = await sel.inputValue(), next = cur === 'Green' ? 'Blue' : 'Green';
    await sel.selectOption(next); await page.waitForTimeout(150); await back(page);
    assert(await page.isVisible('#tab-attend'), 'back on Attendance');
    assert.strictEqual((await page.textContent('#attendWrap tr[data-id="' + id + '"] .team')).trim(), next);
    await page.close();
  });
  await test('a child moved to another class on the Person tab is no longer on the sheet, and a message says where they went', async () => {
    const { page } = await open(); const room = await goSparks(page);
    const link = page.locator('#attendWrap a[data-person]').first(), id = await link.getAttribute('data-person'); await link.click(); await page.waitForTimeout(250); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(150);
    const target = (await page.$$eval('select[data-pc="' + await page.evaluate(() => Model.C.ROOM) + '"] option', o => o.map(x => x.value))).find(v => v !== room && /Spark/i.test(v));
    assert(target, 'the test club has a second Sparks class to move to');
    await page.selectOption('select[data-pc="' + await page.evaluate(() => Model.C.ROOM) + '"]', target); await page.waitForTimeout(150); await back(page);
    assert(await page.isVisible('#tab-attend')); assert.strictEqual(await page.$eval('#attRoom', e => e.value), room, 'the sheet is still the class you were on');
    assert.strictEqual(await page.$$eval('#attendWrap tr[data-id="' + id.replace(/"/g, '\\"') + '"]', e => e.length), 0, 'the child is not on this sheet any more');
    assert(new RegExp('is now in ' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(await page.textContent('#flash')), 'the message names the new class');
    await page.close();
  });
  await test('from the keyboard, P on a box opens the Person tab; the name link is not a Tab stop', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(250);
    assert.strictEqual(await page.$eval('#attendWrap a[data-person]', e => e.tabIndex), -1);
    const id = await page.$eval('#attendWrap tr[data-id]', e => e.dataset.id); await page.focus('#attendWrap tr[data-id] input[data-m]'); await page.keyboard.press('p'); await page.waitForTimeout(250);
    assert(await page.isVisible('#tab-person')); assert.strictEqual(await page.$eval('#pePerson', e => e.value), id); assert(await page.isVisible('#btnPeBack'));
    await page.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
