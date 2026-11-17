// Books on the Options tab and the To do page: a handbook whose book is not on the list is listed as "Unrecognized book"; adding or correcting the book and pressing Apply changes updates the
// To do page and its badge at once (this was the reported case: the book AoG added, the list still showing). Books are one 2 or 3 letter code, with no "written as" column.
// Usage: NODE_PATH=<dir with playwright> node test/book-todo-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const ctx = await browser.newContext(), page = await ctx.newPage(); page.on('dialog', d => d.accept()); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  const unrecognized = async () => { await tab('todo'); await page.waitForTimeout(250); await page.check('input[name=tdView][value=task]'); await page.waitForTimeout(200); const h = await page.$$eval('#todoWrap h3', x => x.map(e => e.textContent.replace(/\s+/g, ' ').trim())); const m = h.map(x => /^Unrecognized book \((\d+)\)/.exec(x)).find(Boolean); return m ? +m[1] : 0; };
  const badge = () => page.textContent('#todoBadge');
  const apply = async () => { await page.click('#btnDraftApply'); await page.waitForTimeout(400); };

  await test('the books table has one code column (2 or 3 letters) and no "Written as" column', async () => {
    await tab('options'); await page.waitForTimeout(250);
    const heads = await page.$$eval('#optionsWrap table.books th', h => h.map(x => x.textContent.trim())); assert.deepStrictEqual(heads.slice(0, 3), ['Code', 'Name', 'Emblem color'], heads.join());
    assert.strictEqual(await page.getAttribute('#optionsWrap tr[data-code="AoG"] input[data-bf="code"]', 'maxlength'), '3'); assert.strictEqual(await page.locator('#optionsWrap input[data-bf="spell"]').count(), 0);
    assert.strictEqual(await unrecognized(), 0, 'the test club has no unrecognized books');
  });
  let n = 0; const base = +(await badge()) || 0;
  await test('removing the book AoG and applying lists every T&T handbook as an unrecognized book, and the badge follows', async () => {
    const before = +(await badge()) || 0; await tab('options'); await page.waitForTimeout(250); await page.click('#optionsWrap button[data-bdel="AoG"]'); await page.waitForTimeout(200); await apply();
    n = await unrecognized(); assert(n > 5, 'unrecognized: ' + n); assert(+(await badge()) > before, 'badge ' + (await badge()) + ' vs ' + before);
  });
  await test('a wrong code (AG) leaves them listed; correcting it to AoG and applying clears them from the To do page and the badge, with nothing else pressed', async () => {
    await tab('options'); await page.waitForTimeout(250); await page.click('#optBookAdd'); await page.waitForTimeout(200);
    const row = page.locator('#optionsWrap tr[data-code]').filter({ has: page.locator('input[data-bf="name"][value="New book"]') }); const old = await row.getAttribute('data-code');
    await row.locator('input[data-bf="name"]').fill('Agents of Grace'); await row.locator('input[data-bf="code"]').fill('AG'); await page.keyboard.press('Tab'); await page.waitForTimeout(200);
    await page.locator('#optionsWrap tr[data-code="AG"] select[data-bf="group"]').selectOption('T&T'); await page.waitForTimeout(150); await apply();
    assert.strictEqual(await unrecognized(), n, 'AG is not AoG: still listed');
    await tab('options'); await page.waitForTimeout(250); await page.locator('#optionsWrap tr[data-code="AG"] input[data-bf="code"]').fill('AoG'); await page.keyboard.press('Tab'); await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('#optionsWrap tr[data-code="AoG"]').count(), 1, 'the code was accepted'); await apply();
    assert.strictEqual(await unrecognized(), 0, 'the list follows the applied change'); await tab('roster'); await page.waitForTimeout(200); assert.strictEqual(+(await badge()) || 0, base, 'the badge follows too');
  });
  await test('a code that is not 2 or 3 letters, or repeats another book, is refused with the reason', async () => {
    await tab('options'); await page.waitForTimeout(250); const inp = page.locator('#optionsWrap tr[data-code="HG"] input[data-bf="code"]');
    await inp.fill('H1'); await page.keyboard.press('Tab'); await page.waitForTimeout(200); assert(/2 or 3 letters/.test(await page.textContent('#optionsWrap [role=alert]')));
    await page.locator('#optionsWrap tr[data-code="HG"] input[data-bf="code"]').fill('aog'); await page.keyboard.press('Tab'); await page.waitForTimeout(200); assert(/already a book/.test(await page.textContent('#optionsWrap [role=alert]')));
    assert.deepStrictEqual(errs, []);
  });
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
