// N5: the app checks for a newer version once at launch, as the last start-up step (not 15 seconds later), and stays quiet when there is nothing newer or the site cannot be reached. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/update-launch-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
let fake = null, checks = 0;      // fake: the version the pretend site offers (null: the running one); checks: how many version checks (index.html?_=...) reached the site
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html', f = path.join(app, u);
  if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); let body = fs.readFileSync(f);
  if (u === 'index.html') { if (/_=/.test(req.url)) checks++; if (fake && /_=/.test(req.url)) body = Buffer.from(String(body).replace(/(name="app-version" content=")[^"]*/, '$1' + fake).replace(/(name="app-build" content=")[^"]*/, '$1' + fake + '-build')); }
  res.end(body);
});
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const launch = async (setup) => { const ctx = await browser.newContext(), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); if (setup) await setup(page); checks = 0; const t0 = Date.now(); await page.goto(url); return { ctx, page, errs, t0 }; };

  await test('a newer version on the site shows the Update bar within seconds of opening, before the old 15 s delay, with nothing touched', async () => {
    fake = '9.9.9'; const { ctx, page, errs, t0 } = await launch(); await page.waitForSelector('#updateBar:not([hidden])', { timeout: 8000 });
    const ms = Date.now() - t0; assert(ms < 8000, 'bar after ' + ms + ' ms'); assert(/9\.9\.9/.test(await page.textContent('#updateText'))); assert.strictEqual(checks, 1, 'one check so far: ' + checks); assert.deepStrictEqual(errs, []); await ctx.close(); fake = null;
  });
  await test('the check does not hold up loading: a data file opens right away at launch, and the bar still comes', async () => {
    fake = '9.9.9'; const { ctx, page, errs } = await launch(); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent), null, { timeout: 8000 });
    await page.waitForSelector('#updateBar:not([hidden])', { timeout: 8000 }); assert.deepStrictEqual(errs, []); await ctx.close(); fake = null;
  });
  await test('the same version: no bar, exactly one check at launch, and no second check a moment later (the timer restarts after it)', async () => {
    fake = null; const { ctx, page, errs } = await launch(); await page.waitForFunction(() => App.updates.state().last, null, { timeout: 8000 }); await page.waitForTimeout(3000);
    assert(!(await page.isVisible('#updateBar')), 'no bar'); assert.strictEqual(checks, 1, 'checks: ' + checks); assert.deepStrictEqual(errs, []); await ctx.close();
  });
  await test('the site cannot be reached (offline or an error): silent: no bar, no error flash, no script error, and the app works', async () => {
    fake = '9.9.9'; const { ctx, page, errs } = await launch(p => p.route(/index\.html\?_=/, r => r.abort('internetdisconnected')));
    await page.waitForFunction(() => App.updates.state().last, null, { timeout: 8000 }); await page.waitForTimeout(500);
    assert(!(await page.isVisible('#updateBar')), 'no bar'); assert.deepStrictEqual(errs, []); assert(!(await page.locator('.flash.error, #flash.error').count()), 'no error flash');
    await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent), null, { timeout: 8000 }); await ctx.close(); fake = null;
  });
  await test('a page opened from a file (not http) makes no check at all', async () => {
    const ctx = await browser.newContext(), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); await page.goto('file://' + path.join(app, 'index.html')); await page.waitForTimeout(2500);
    assert.strictEqual(await page.evaluate(() => App.updates.web), false); assert.strictEqual(await page.evaluate(() => !!App.updates.state().last), false); assert.deepStrictEqual(errs, []); await ctx.close();
  });
  console.log('\n' + passed + ' passed, ' + failed + ' failed'); await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})();
