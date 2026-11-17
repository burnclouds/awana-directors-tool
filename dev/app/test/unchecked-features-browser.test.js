// Browser checks for three features that had no automated test: the To do Ignore button (and Show ignored), the
// per-night checkboxes on the Person page, and the PWA install files (manifest, icons, service worker).
// Invented test club only (dev/test-data).
// Usage: NODE_PATH=<dir with playwright> node test/unchecked-features-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html', f = path.join(app, u);
  if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
});
setTimeout(() => { console.log('timed out'); process.exit(2); }, 150000).unref();
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const open = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }), page = await ctx.newPage(), errs = [];
    page.on('dialog', d => d.accept());
    page.on('pageerror', e => errs.push('PAGE ERROR ' + e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]);
    await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { page, errs, ctx };
  };

  await test('To do: Ignore hides an item, the open count drops by one, and the ignored item is stored in the data file', async () => {
    const s = await open(); const { page } = s;
    await page.evaluate(() => App.showTab('todo')); await page.waitForTimeout(300);
    const ign = page.locator('button[data-ign]');
    assert(await ign.count() > 0, 'at least one item with an Ignore button (test club must have an open to-do item)');
    const before = await ign.count();
    await ign.first().click(); await page.waitForTimeout(300);
    assert.strictEqual(await page.locator('button[data-ign]').count(), before - 1, 'one fewer open item after Ignore');
    const stored = await page.evaluate(() => App.season.config.todoIgnored.length);
    assert.strictEqual(stored, 1, 'the ignored item is saved in config.todoIgnored');
    assert.deepStrictEqual(s.errs, [], 'no script errors');
    await s.ctx.close();
  });

  await test('Person page: a night checkbox changes the stored mark for that night by exactly one', async () => {
    const s = await open(); const { page } = s;
    const id = await page.evaluate(() => App.master.people.find(x => Model.isClubber(x))[Model.X.ID]);
    await page.evaluate(() => App.showTab('person')); await page.waitForTimeout(300); await page.click('#peSub button[data-sub="attendance"]'); await page.waitForTimeout(200);
    const cb = page.locator('input[type=checkbox][data-mark]').first();
    assert(await cb.count() > 0, 'a night checkbox is on the Person page');
    const key = await cb.getAttribute('data-mark'), date = await cb.getAttribute('data-date');
    // Count the set marks for this mark on this night before and after: one click moves the count by one.
    const count = () => page.evaluate(([k, d]) => Object.values(App.season.attendance[d] || {}).filter(m => m[k]).length, [key, date]);
    const was = await cb.isChecked(), before = await count();
    await cb.click(); await page.waitForTimeout(200);
    const now = await cb.isChecked(), after = await count();
    assert.strictEqual(now, !was, 'the checkbox changed');
    assert.strictEqual(after - before, now ? 1 : -1, 'the season data changed by one mark on ' + date + ' (' + before + ' -> ' + after + ')');
    assert.deepStrictEqual(s.errs, [], 'no script errors');
    await s.ctx.close();
  });

  await test('PWA install: manifest has name, start_url, display and icons, and every icon file exists', async () => {
    const s = await open(); const { page } = s;
    const m = JSON.parse(fs.readFileSync(path.join(app, 'manifest.json'), 'utf8'));
    assert(m.name && m.start_url && m.display, 'manifest has name, start_url and display');
    assert(Array.isArray(m.icons) && m.icons.length, 'manifest lists icons');
    for (const ic of m.icons) assert(fs.existsSync(path.join(app, ic.src.replace(/^\.?\//, ''))), 'icon file exists: ' + ic.src);
    const reg = await page.evaluate(async () => { if (!('serviceWorker' in navigator)) return 'unsupported'; const r = await navigator.serviceWorker.getRegistration(); if (r) return 'registered'; await new Promise(z => setTimeout(z, 1500)); const r2 = await navigator.serviceWorker.getRegistration(); return r2 ? 'registered' : 'none'; });
    assert.notStrictEqual(reg, 'unsupported', 'browser supports service workers');
    // Not asserted here: dev/app/sw.js is the template (__RELEASE__ / __SHELL__) and the registration is checked on the built deploy by service-worker-browser.test.js.
    await s.ctx.close();
  });

  server.close(); await browser.close();
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
