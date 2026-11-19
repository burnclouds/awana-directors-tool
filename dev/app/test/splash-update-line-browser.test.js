// N7 (1.51.16): the start screen says where the update check stands without a click: "Checking for updates...", then "Checked for updates at HH:MM",
// or "Could not check for updates (offline)". A click during the launch check waits for that one check (one request). The service worker marks an offline answer.
// Invented test club only (no file is opened). Usage: NODE_PATH=<dir with playwright> node test/splash-update-line-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..');
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
let mode = 'ok', checks = 0, delay = 0;
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html', f = path.join(app, u);
  if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
  const send = () => { res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); };
  if (u === 'index.html' && /_=/.test(req.url)) { checks++; if (mode === 'down') { res.statusCode = 500; return res.end(); } if (delay) return setTimeout(send, delay); }
  send();
});
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const fresh = async () => { const ctx = await browser.newContext(), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); await page.goto(url); await page.waitForSelector('#splash:not([hidden])'); return { ctx, page, errs }; };
  const msg = page => page.textContent('#splashUpdMsg');

  await test('N7-1 with no click: "Checking for updates..." while the launch check runs, then "Checked for updates at HH:MM"', async () => {
    mode = 'ok'; delay = 900; checks = 0; const { ctx, page } = await fresh();
    await page.waitForFunction(() => /Checking for updates/.test(document.getElementById('splashUpdMsg').textContent), null, { timeout: 5000 });
    await page.waitForFunction(() => /Checked for updates at \d\d:\d\d/.test(document.getElementById('splashUpdMsg').textContent), null, { timeout: 8000 });
    assert(!/ on \d/.test(await msg(page)), 'today: no date added: ' + await msg(page)); assert.strictEqual(checks, 1, 'one request'); await ctx.close();
  });
  await test('N7-2 the site cannot be reached: "Could not check", with no click', async () => {
    mode = 'down'; delay = 0; const { ctx, page } = await fresh();
    await page.waitForFunction(() => /Could not check/.test(document.getElementById('splashUpdMsg').textContent), null, { timeout: 8000 }); await ctx.close();
  });
  await test('N7-3 a click during the launch check makes no second request and shows the real result', async () => {
    mode = 'ok'; delay = 1200; checks = 0; const { ctx, page } = await fresh();
    await page.waitForFunction(() => /Checking for updates/.test(document.getElementById('splashUpdMsg').textContent), null, { timeout: 5000 });
    await page.click('#splashVer');
    await page.waitForFunction(() => /Checked for updates at/.test(document.getElementById('splashUpdMsg').textContent), null, { timeout: 8000 });
    assert.strictEqual(checks, 1, 'requests ' + checks); await ctx.close();
  });
  await test('N7-4 offline: the check says so (a request that fails, and the service worker\'s marked cached copy)', async () => {
    for (const how of ['abort', 'marked']) {
      mode = 'ok'; delay = 0; const ctx = await browser.newContext(), page = await ctx.newPage();
      await page.route(/index\.html\?_=/, route => how === 'abort' ? route.abort() : route.fulfill({ status: 200, contentType: 'text/html', headers: { 'x-awana-offline': '1' }, body: fs.readFileSync(path.join(app, 'index.html'), 'utf8') }));
      await page.goto(url); await page.waitForSelector('#splash:not([hidden])');
      await page.waitForFunction(() => /offline/.test(document.getElementById('splashUpdMsg').textContent), null, { timeout: 8000 }); assert(!/latest version/.test(await msg(page)), how + ': ' + await msg(page)); await ctx.close();
    }
  });
  await test('N7-5 sw.js marks an offline answer, and only the update check\'s request', async () => {
    const sw = fs.readFileSync(path.join(app, 'sw.js'), 'utf8'); assert(/x-awana-offline/.test(sw)); assert(/navigate/.test(sw.split('x-awana-offline')[0]), 'the navigation branch is separate and untouched');
  });
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
