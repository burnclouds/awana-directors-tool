// Flag anything: the Flag button in the top bar, flag mode, a note on any element of any tab, the To do list with its readable trail, and Go. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/flag-anything-browser.test.js
const { chromium } = require('playwright');
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
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
  const open = async (withData = true) => {
    const ctx = await browser.newContext({ acceptDownloads: true }), page = await ctx.newPage(), msgs = [];
    page.on('dialog', d => { msgs.push(d.message()); d.accept(); }); page.on('pageerror', e => msgs.push('PAGE ERROR ' + e.message));
    await page.goto(url); if (withData) { await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); }
    return { page, msgs };
  };
  const tab = (page, n) => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), n);
  const flags = page => page.evaluate(() => Season.flagList(App.season).filter(f => f.level === 'element'));

  await test('the Flag button is in the top bar on every tab, flag mode turns on and off with it and with Esc, and the old Note buttons are gone', async () => {
    const { page } = await open();
    for (const t of ['roster', 'stats', 'uniforms', 'debug', 'reports']) { await tab(page, t); await page.waitForTimeout(100); assert(await page.isVisible('#btnFlagMode'), 'visible on ' + t); }
    assert.strictEqual(await page.$$eval('[data-tabnote]', e => e.length), 0, 'the per-tab Note buttons are removed');
    await page.click('#btnFlagMode'); assert.strictEqual(await page.getAttribute('#btnFlagMode', 'aria-pressed'), 'true'); assert(await page.evaluate(() => document.body.classList.contains('flagmode')));
    await page.keyboard.press('Escape'); assert.strictEqual(await page.getAttribute('#btnFlagMode', 'aria-pressed'), 'false'); assert(!(await page.evaluate(() => document.body.classList.contains('flagmode'))));
    await page.click('#btnFlagMode'); await page.click('#btnFlagMode'); assert.strictEqual(await page.getAttribute('#btnFlagMode', 'aria-pressed'), 'false', 'the button turns it off'); await page.close();
  });
  await test('without a data file the flag cannot be kept: a message says so and flag mode does not turn on', async () => {
    const { page } = await open(false); await page.evaluate(() => document.getElementById('btnFlagMode').click()); assert.strictEqual(await page.getAttribute('#btnFlagMode', 'aria-pressed'), 'false'); assert(/Open a data file first/.test(await page.textContent('#flash'))); await page.close();
  });
  await test('flag mode: a click flags the element instead of using it; the dialog names the trail; the flag is saved with the tab, trail and note', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(250);
    const before = await page.evaluate(() => JSON.stringify(App.season.attendance)); await page.click('#btnFlagMode'); await page.click('#btnAllPresent'); await page.waitForTimeout(200);
    assert.strictEqual(await page.evaluate(() => JSON.stringify(App.season.attendance)), before, 'the click did not run the button'); assert(await page.isVisible('dialog[open] #flNote'), 'the note box opened');
    const head = await page.textContent('dialog[open] h3'), where = await page.textContent('dialog[open] p.status'); assert(/Mark everyone present/.test(head), head); assert(/^Attendance/.test(where), where);
    await page.fill('#flNote', 'Check this button'); await page.click('#flSave'); await page.waitForTimeout(200);
    const f = await flags(page); assert.strictEqual(f.length, 1); assert.strictEqual(f[0].tab, 'attend'); assert.strictEqual(f[0].trail[0], 'Attendance'); assert.strictEqual(f[0].trail.at(-1), 'Mark everyone present'); assert.strictEqual(f[0].note, 'Check this button');
    assert.strictEqual(await page.getAttribute('#btnFlagMode', 'aria-pressed'), 'false', 'Save leaves flag mode: the page is usable at once'); await page.close();
  });
  await test('To do lists the flag with its readable trail, and Go opens the tab and highlights the element', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(250); await page.click('#btnFlagMode'); await page.click('#btnClearRoom'); await page.fill('#flNote', 'Is this the right button?'); await page.click('#flSave'); await page.waitForTimeout(150);
    await page.keyboard.press('Escape'); await tab(page, 'todo'); await page.waitForTimeout(300);
    const row = page.locator('tr[data-flag]').filter({ hasText: 'Is this the right button?' }); assert.strictEqual(await row.count(), 1); assert(/Attendance › .*Clear this room/.test(await row.textContent()), await row.textContent());
    await row.locator('button[data-goflag]').click(); await page.waitForTimeout(700); assert(await page.isVisible('#tab-attend'), 'the Attendance tab is open');
    assert(await page.evaluate(() => document.getElementById('btnClearRoom').classList.contains('flashflag')), 'the button is highlighted'); await page.close();
  });
  await test('a flag on a Statistics heading, an empty control with a label, and a table cell keeps the heading and column header in its trail', async () => {
    const { page } = await open(); await tab(page, 'uniforms'); await page.waitForTimeout(300);
    // A small table of our own with two rows of the same name: the label comes from the column header, the second row is told apart by its position.
    await page.evaluate(() => { const s = document.getElementById('tab-uniforms'), h = document.createElement('h3'); h.textContent = 'Test heading'; const t = document.createElement('table'); t.id = 'tTbl';
      t.innerHTML = '<thead><tr><th>Name</th><th>Size</th></tr></thead><tbody><tr><td>Green</td><td><input id="a1"></td></tr><tr><td>Green</td><td><input id="a2"></td></tr></tbody>'; s.appendChild(h); s.appendChild(t); });
    const one = await page.evaluate(() => App.flagTrail.infoOf(document.getElementById('a1'))), two = await page.evaluate(() => App.flagTrail.infoOf(document.getElementById('a2')));
    assert.deepStrictEqual(one.trail, ['Uniforms', 'Test heading', 'Green', 'Size']); assert.strictEqual(one.rowIndex, 0); assert.strictEqual(two.rowIndex, 1); assert.strictEqual(one.label, 'Size');
    assert.strictEqual(await page.evaluate(() => App.flagTrail.locate({ trail: ['Uniforms', 'Test heading', 'Green', 'Size'], rowIndex: 1 }).id), 'a2', 'the second Green row is found by its position');
    await page.close();
  });
  await test('a flag whose spot is gone still shows on To do, marked "spot not found", and Go opens the tab with a message', async () => {
    const { page } = await open(); await page.evaluate(() => { App.addFlag({ level: 'element', tab: 'stats', trail: ['Statistics', 'A section that was renamed', 'Count'], label: 'Count', note: 'Gone' }); });
    await tab(page, 'todo'); await page.waitForTimeout(250); const row = page.locator('tr[data-flag]').filter({ hasText: 'Gone' }); assert(/A section that was renamed/.test(await row.textContent()));
    await row.locator('button[data-goflag]').click(); await page.waitForTimeout(800); assert(await page.isVisible('#tab-stats'), 'the tab is open'); assert(/Spot not found/.test(await page.textContent('#flash')));
    await tab(page, 'todo'); await page.waitForTimeout(250); assert(/spot not found/.test(await page.locator('tr[data-flag]').filter({ hasText: 'Gone' }).textContent())); await page.close();
  });
  await test('a flag can be cleared from its own dialog, flags are in the data file, and a phone width keeps the Flag button reachable', async () => {
    const { page } = await open(); await tab(page, 'stats'); await page.waitForTimeout(300); await page.click('#btnFlagMode'); await page.click('#tab-stats h3, #tab-stats h2, #tab-stats b'); await page.fill('#flNote', 'Look at this'); await page.click('#flSave'); await page.waitForTimeout(150);
    assert.strictEqual((await flags(page)).length, 1); assert(await page.evaluate(() => /"level":"element"/.test(Season.toJson(App.season))), 'saved in the file');
    await page.click('#btnFlagMode'); await page.click('#tab-stats h3, #tab-stats h2, #tab-stats b'); await page.waitForTimeout(150); assert(await page.isVisible('dialog[open] [data-dlgclear]'), 'the existing flag is listed in the dialog'); await page.click('dialog[open] [data-dlgclear]'); await page.waitForTimeout(150); assert.strictEqual((await flags(page)).length, 0);
    await page.keyboard.press('Escape'); await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200); assert(!(await page.isVisible('#btnFlagMode')), 'on a phone Flag lives in the "..." menu (UX-10)'); await page.click('#btnOverflow'); assert(await page.isVisible('#overflowMenu [data-ov="flag"]'), 'Flag is in the menu on screen'); await page.keyboard.press('Escape');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll'); await page.close();
  });
  await test('no script errors', async () => { const { page, msgs } = await open(); await tab(page, 'stats'); await page.click('#btnFlagMode'); await page.keyboard.press('Escape'); await page.close(); assert.deepStrictEqual(msgs.filter(m => /PAGE ERROR/.test(m)), []); });
  await test('Esc in the note box cancels the note without saving, and leaves flag mode', async () => {
    const { page } = await open(); await tab(page, 'stats'); await page.waitForTimeout(300); const before = (await flags(page)).length;
    await page.click('#btnFlagMode'); await page.click('#tab-stats h3, #tab-stats h2, #tab-stats b'); await page.fill('#flNote', 'Not this one'); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    assert.strictEqual((await flags(page)).length, before, 'nothing was saved'); assert.strictEqual(await page.getAttribute('#btnFlagMode', 'aria-pressed'), 'false', 'flag mode is off');
    assert.strictEqual(await page.isVisible('dialog[open]'), false, 'the note box is closed'); await page.close();
  });
  await test('S14: a flag on a Uniforms row belongs to that child: the Child column names the child, and Where has no child name', async () => {
    const { page } = await open(); await tab(page, 'uniforms'); await page.waitForTimeout(300);
    await page.click('#btnFlagMode'); await page.locator('#uniWrap tbody tr[data-id] td').nth(1).click(); await page.fill('#flNote', 'Check this uniform'); await page.click('#flSave'); await page.waitForTimeout(200);
    const f = await page.evaluate(() => Object.values(App.season.flags).find(x => x.note === 'Check this uniform'));
    assert(f && f.kid, 'the flag is saved with a child: ' + JSON.stringify(f && f.kid));
    const nm = await page.evaluate(id => Model.fullName(App.master.people.find(p => p[Model.X.ID] === id)), f.kid);
    await tab(page, 'todo'); await page.waitForTimeout(250);
    const txt = await page.locator('tr[data-flag]').filter({ hasText: 'Check this uniform' }).textContent();
    assert(txt.includes(nm), 'the child is named: ' + txt.slice(0, 120)); assert(!txt.includes('Uniforms › ' + nm), 'Where has no child name: ' + txt.slice(0, 120));
    await page.context().close();
  });
  await test('S8: a flag on a text box survives a reload of the file, and Go opens that box (no "Spot not found")', async () => {
    const os = require('os'); const { page } = await open(); await tab(page, 'roster'); await page.waitForTimeout(300);
    await page.click('#btnFlagMode'); await page.locator('#tab-roster input[type=text]').first().click({ force: true }); await page.fill('#flNote', 'Check this box'); await page.click('#flSave'); await page.waitForTimeout(200);
    const json = await page.evaluate(() => App.snapshotJson()); const file = path.join(os.tmpdir(), 'awana-s8-' + Date.now() + '.json'); fs.writeFileSync(file, json);
    const again = await open(false); await again.page.setInputFiles('#splashFiles', [file]); await again.page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    await tab(again.page, 'todo'); await again.page.waitForTimeout(250);
    await again.page.locator('tr[data-flag] button[data-goflag]').first().click(); await again.page.waitForTimeout(900);
    const flash = await again.page.textContent('#flash').catch(() => ''); assert(!/Spot not found/.test(flash), 'the spot was found: ' + flash.slice(0, 120));
    await again.page.context().close(); await page.context().close(); fs.unlinkSync(file);
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
