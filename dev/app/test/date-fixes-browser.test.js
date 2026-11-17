// Opening a data file that holds dates that are not real: the Fix dates dialog, Cancel, correcting, removing, merging, and the History entry. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/date-fixes-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), os = require('os'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f));
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-datefix-')), base = JSON.parse(fs.readFileSync(path.join(td, DATA), 'utf8'));
  const night = Object.keys(base.attendance)[0], kid = Object.keys(base.attendance[night])[0], XSS = '<img src=x onerror="window.__pwned=1">';
  const file = path.join(tmp, 'awana-2026-27-TEST-20261031-100000.json'), bad = JSON.parse(JSON.stringify(base));
  bad.attendance[night][kid].t = 'Red';                                   // so correcting the other entry onto this night is a real clash
  bad.attendance[XSS] = { [kid]: { a: 1 } };
  bad.attendance['2026-9-9x'] = { [kid]: { a: 1, t: 'Blue' } };
  fs.writeFileSync(file, JSON.stringify(bad));
  const clean = path.join(tmp, 'awana-2026-27-TEST-20261031-110000.json'); fs.writeFileSync(clean, JSON.stringify(base));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const open = async () => { const page = await browser.newPage(); const msgs = []; page.on('dialog', d => { msgs.push(d.message()); d.accept(); }); page.on('pageerror', e => msgs.push('PAGE ERROR ' + e.message)); await page.goto(url); return { page, msgs }; };

  await test('a clean file opens with no dialog', async () => {
    const { page } = await open(); await page.setInputFiles('#splashFiles', [clean]); await page.waitForTimeout(600);
    assert(!(await page.locator('#dlg[open]').count())); assert(await page.evaluate(() => !!App.season)); await page.close();
  });
  await test('a file with bad dates stops at the dialog, shows the value as text, and Cancel opens nothing', async () => {
    const { page } = await open(); await page.setInputFiles('#splashFiles', [file]); await page.waitForTimeout(600);
    assert(await page.locator('#dlg[open]').count(), 'dialog open'); assert.strictEqual(await page.locator('#dlg tr[data-i]').count(), 2);
    assert.strictEqual(await page.evaluate(() => window.__pwned), undefined, 'markup in a date ran'); assert(await page.locator('#dlg code', { hasText: 'onerror' }).count());
    assert(await page.locator('#dfGo').isDisabled(), 'Fix and open waits for a date on the row with no guess');
    await page.click('#dfCancel'); assert(await page.evaluate(() => !App.season), 'nothing opened'); await page.close();
  });
  await test('correcting one (merge, keep the new one) and removing the other opens a clean, unsaved file with a History entry', async () => {
    const { page, msgs } = await open(); await page.setInputFiles('#splashFiles', [file]); await page.waitForTimeout(600);
    const rows = page.locator('#dlg tr[data-i]'), guessed = rows.filter({ has: page.locator('input[type=date]:not([value=""])') });
    await rows.filter({ hasText: 'onerror' }).locator('input[value=remove]').check();
    const r = rows.filter({ hasNotText: 'onerror' }); await r.locator('input[type=date]').fill(night);
    assert(await r.locator('[data-clash]').isVisible(), 'clash shown'); await r.locator('select[data-pref]').selectOption('new');
    await page.click('#dfGo'); await page.waitForTimeout(600);
    const o = await page.evaluate(([n, k, x]) => ({ keys: Object.keys(App.season.attendance), t: App.season.attendance[n][k].t, last: App.season.history[App.season.history.length - 1].label, dirty: App.dirty(), x }), [night, kid, XSS]);
    assert(!o.keys.includes(XSS) && !o.keys.includes('2026-9-9x')); assert.strictEqual(o.t, 'Blue'); assert(/^Date fixes: 1 corrected, 1 removed/.test(o.last), o.last); assert(o.dirty, 'unsaved');
    assert(!msgs.some(m => /PAGE ERROR/.test(m)), msgs.join(' | ')); await page.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
