// The start screen's version line is also a "check for updates" link: it asks the site now and says what it found on the splash itself,
// with an Update now button when a newer version exists. Invented test club only (no file is opened: the check is on the splash).
// Usage: NODE_PATH=<dir with playwright> node test/splash-update-check-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
let fake = null, mode = 'ok', checks = 0;      // fake = the version the pretend site offers (null: the running one); mode 'down' = the site answers 500 to the check
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html', f = path.join(app, u);
  if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
  if (u === 'index.html' && /_=/.test(req.url)) { checks++; if (mode === 'down') { res.statusCode = 500; return res.end(); } }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); let body = fs.readFileSync(f);
  if (u === 'index.html' && /_=/.test(req.url) && fake) body = Buffer.from(String(body).replace(/(name="app-version" content=")[^"]*/, '$1' + fake).replace(/(name="app-build" content=")[^"]*/, '$1' + fake + '-build'));
  res.end(body);
});
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const fresh = async () => { const ctx = await browser.newContext(), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); await page.goto(url); await page.waitForSelector('#splash:not([hidden])'); return { ctx, page, errs }; };

  await test('the version line is a link and says how to use it', async () => {
    const { ctx, page } = await fresh(); const t = await page.textContent('#splashVer'), tag = await page.$eval('#splashVer', e => e.tagName);
    assert.strictEqual(tag, 'BUTTON'); assert(/^Version \d+\.\d+\.\d+\S* \(.+\)/.test(t), 'version and build still show: ' + t); assert(/check for updates/i.test(t), 'it says it checks: ' + t);
    assert(await page.$eval('#splashUpdApply', e => e.hidden), 'no Update now before a check'); await ctx.close();
  });
  await test('same version: it checks the site once and says you are on the latest', async () => {
    fake = null; mode = 'ok'; checks = 0; const { ctx, page } = await fresh(); await page.click('#splashVer');
    await page.waitForFunction(() => /latest version/.test(document.getElementById('splashUpdMsg').textContent)); assert.strictEqual(checks, 1, 'one request to the site'); assert(await page.$eval('#splashUpdApply', e => e.hidden)); await ctx.close();
  });
  await test('a newer version: it names it and shows Update now on the splash', async () => {
    fake = '9.9.9'; mode = 'ok'; const { ctx, page } = await fresh(); await page.click('#splashVer');
    await page.waitForFunction(() => /9\.9\.9 is available/.test(document.getElementById('splashUpdMsg').textContent)); assert(!(await page.$eval('#splashUpdApply', e => e.hidden)), 'Update now shows'); await ctx.close();
  });
  await test('the site cannot be reached: it says so and shows no Update now', async () => {
    fake = null; mode = 'down'; const { ctx, page } = await fresh(); await page.click('#splashVer');
    await page.waitForFunction(() => /Could not check/.test(document.getElementById('splashUpdMsg').textContent)); assert(await page.$eval('#splashUpdApply', e => e.hidden)); await ctx.close();
  });
  await test('no script errors on the splash', async () => { fake = null; mode = 'ok'; const { ctx, page, errs } = await fresh(); await page.click('#splashVer'); await page.waitForTimeout(300); assert.deepStrictEqual(errs, []); await ctx.close(); });

  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
