// The flag popup: a yellow flag opens a popup with the note; it can be edited and saved, or the flag cleared. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/flagpop-browser.test.js
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
  const open = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }), page = await ctx.newPage(), errs = [];
    page.on('dialog', d => d.dismiss()); page.on('pageerror', e => errs.push(e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    // an anchor to hang the popup on, and two flags on it
    await page.evaluate(() => { const a = document.createElement('button'); a.id = 'anc'; a.textContent = 'x'; a.style.cssText = 'position:fixed;left:300px;top:300px'; document.body.appendChild(a); });
    return { page, errs };
  };
  const mk = (page, notes) => page.evaluate(ns => { const kid = App.master.people.find(p => Model.isActive(p) && Model.isClubber(p))[Model.X.ID]; return ns.map(n => App.addFlag({ kid, level: 'child', note: n })); }, notes);
  const notesOf = page => page.evaluate(() => Season.flagList(App.season).map(f => f.note));
  const show = (page, ids) => page.evaluate(i => App.flagPop.show(i, document.getElementById('anc')), ids);

  await test('opens with the saved note in a text box; Save keeps an edit, and the file is marked unsaved', async () => {
    const { page } = await open(), [id] = await mk(page, ['check Rank 3']); await show(page, [id]);
    assert.strictEqual(await page.inputValue('.flagpop textarea[data-fnote="' + id + '"]'), 'check Rank 3');
    await page.fill('.flagpop textarea', 'ask the leaders'); await page.click('.flagpop button[data-fsave="' + id + '"]');
    assert.deepStrictEqual(await notesOf(page), ['ask the leaders']); assert.strictEqual(await page.evaluate(() => App.dirty()), true); await page.close();
  });
  await test('an empty note is refused (the old note stays); Clear removes the flag and closes the popup', async () => {
    const { page } = await open(), [id] = await mk(page, ['keep me']); await show(page, [id]);
    await page.fill('.flagpop textarea', '   '); await page.click('.flagpop button[data-fsave="' + id + '"]');
    assert.deepStrictEqual(await notesOf(page), ['keep me']); assert.strictEqual(await page.locator('.flagpop').isVisible(), true, 'still open');
    await page.click('.flagpop button[data-fclear="' + id + '"]'); assert.deepStrictEqual(await notesOf(page), []); assert.strictEqual(await page.locator('.flagpop:visible').count(), 0); await page.close();
  });
  await test('two flags: two text boxes; clearing one keeps the other', async () => {
    const { page } = await open(), ids = await mk(page, ['one', 'two']); await show(page, ids);
    assert.strictEqual(await page.locator('.flagpop textarea').count(), 2);
    await page.click('.flagpop button[data-fclear="' + ids[0] + '"]'); assert.deepStrictEqual(await notesOf(page), ['two']); await page.close();
  });
  await test('markup in a note is shown as text, never as HTML', async () => {
    const { page } = await open(), [id] = await mk(page, ['<b>x</b> & y']); await show(page, [id]);
    assert.strictEqual(await page.inputValue('.flagpop textarea'), '<b>x</b> & y'); assert.strictEqual(await page.locator('.flagpop .fpnote b').count(), 0); await page.close();
  });
  await test('Esc, a click elsewhere and a tab change each close it; an unsaved edit is discarded', async () => {
    const { page } = await open(), [id] = await mk(page, ['saved']);
    for (const how of ['esc', 'outside', 'tab']) {
      await show(page, [id]); await page.fill('.flagpop textarea', 'not saved');
      if (how === 'esc') await page.keyboard.press('Escape'); else if (how === 'outside') await page.mouse.click(40, 700); else await page.evaluate(() => App.showTab('todo'));
      assert.strictEqual(await page.locator('.flagpop:visible').count(), 0, how + ' closes it'); assert.deepStrictEqual(await notesOf(page), ['saved'], how + ' does not save');
    }
    await page.close();
  });
  await test('the popup stays inside the window for an anchor at each corner', async () => {
    const { page } = await open(), [id] = await mk(page, ['note']);
    for (const [l, t] of [[2, 2], [1250, 2], [2, 770], [1250, 770]]) {
      await page.evaluate(([l, t]) => { const a = document.getElementById('anc'); a.style.left = l + 'px'; a.style.top = t + 'px'; }, [l, t]); await show(page, [id]);
      const r = await page.evaluate(() => { const b = document.querySelector('.flagpop').getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: innerWidth, h: innerHeight }; });
      assert(r.l >= 0 && r.t >= 0 && r.r <= r.w && r.b <= r.h, 'inside at ' + l + ',' + t + ': ' + JSON.stringify(r)); await page.keyboard.press('Escape');
    }
    await page.close();
  });
  console.log(passed + ' passed, ' + failed + ' failed'); await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})();
