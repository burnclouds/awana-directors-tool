// The service worker (sw.js): the app's files are cached whole per release, the app starts offline after one online visit, and a new
// release waits until the page asks for it (Update now). Runs make-deploy.sh on a copy, so the real generated sw.js is tested.
// Usage: NODE_PATH=<dir with playwright> node test/service-worker-browser.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), http = require('http');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..', '..', '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-sw-'));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
cp.execSync('mkdir -p "' + tmp + '/dev" "' + tmp + '/deploy" && cp "' + root + '/make-deploy.sh" "' + tmp + '/" && cp -r "' + root + '/dev/app" "' + tmp + '/dev/app" && cp -r "' + root + '/dev/test-data" "' + tmp + '/dev/test-data" && rm -rf "' + tmp + '/dev/app/test" && mkdir -p "' + tmp + '/dev/tools" && cp "' + root + '/dev/tools/minify.js" "' + tmp + '/dev/tools/" && ln -s "' + root + '/node_modules" "' + tmp + '/node_modules"');
cp.execSync('sh make-deploy.sh', { cwd: tmp, stdio: 'pipe' });
const deploy = path.join(tmp, 'deploy'), types = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.csv': 'text/csv', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, ''); if (u === '' || u.endsWith('/')) u += 'index.html';
  const f = path.join(deploy, u); if (!f.startsWith(deploy) || !fs.existsSync(f)) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/app/', browser = await chromium.launch();
  const keysOf = p => p.evaluate(() => caches.keys());
  const waitControl = p => p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  const ctx = await browser.newContext(), p = await ctx.newPage(); p.on('dialog', d => d.dismiss());
  await test('the first visit installs the worker and caches the whole shell for this release', async () => {
    await p.goto(base); await waitControl(p); await p.evaluate(() => { window.__ctl = navigator.serviceWorker.controller; });
    const keys = await keysOf(p), mine = keys.filter(k => k.startsWith('awana-shell-')); assert.strictEqual(mine.length, 1, 'one shell cache: ' + keys.join(','));
    const n = await p.evaluate(async name => (await (await caches.open(name)).keys()).length, mine[0]);
    const listed = (fs.readFileSync(path.join(deploy, 'app', 'sw.js'), 'utf8').match(/const SHELL = (\[.*\]);/) || [])[1];
    assert.strictEqual(n, JSON.parse(listed).length, 'every listed file is cached');
  });
  await test('the app starts with the network off (after one online visit)', async () => {
    await ctx.setOffline(true); await p.reload(); await p.waitForFunction(() => /No data file|active|unsaved|Open/.test(document.body.innerText), null, { timeout: 15000 });
    assert(await p.evaluate(() => typeof App === 'object'), 'the app script ran'); await ctx.setOffline(false);
  });
  await test('a new release waits until the page asks for it, then takes over and its files are cached', async () => {
    const sw = path.join(deploy, 'app', 'sw.js'); fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const RELEASE = '[^']*';/, "const RELEASE = 'next-test';"));
    await p.evaluate(() => { window.__ctl = navigator.serviceWorker.controller; });      // the worker this page is controlled by now
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));      // what the app's update check asks for
    for (let i = 0; i < 30; i++) { if (await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting)) break; await p.waitForTimeout(500); }
    const waiting = await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting);
    assert.strictEqual(waiting, true, 'the new worker is waiting');
    await p.waitForSelector('#updateBar:not([hidden])', { timeout: 8000 });      // the update bar shows it, though the version check has not run
    const stillOld = await p.evaluate(() => navigator.serviceWorker.controller === window.__ctl);
    assert.strictEqual(stillOld, true, 'the open page is still controlled by the previous release');
    const switched = await p.evaluate(() => App.swApply()); assert.strictEqual(switched, true, 'the page took over');
    await p.waitForTimeout(300); assert((await keysOf(p)).some(k => k.endsWith('next-test')), 'the new release cache exists');
    assert.strictEqual(await p.evaluate(() => navigator.serviceWorker.controller !== window.__ctl), true, 'the page is now controlled by the new release');
  });
  const setRelease = name => { const sw = path.join(deploy, 'app', 'sw.js'); fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const RELEASE = '[^']*';/, "const RELEASE = '" + name + "';")); };
  await test('Update now with no worker waiting yet (the page never asked the browser to look) finds the new release, waits for its install and takes over', async () => {
    setRelease('next-test-2'); await p.evaluate(() => { window.__ctl = navigator.serviceWorker.controller; });
    assert.strictEqual(await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting), false, 'nothing is waiting: the browser has not looked');
    const switched = await p.evaluate(() => App.swApply()); assert.strictEqual(switched, true, 'the page took over without being asked to look first');
    assert((await keysOf(p)).some(k => k.endsWith('next-test-2')), 'the new release cache exists'); assert.strictEqual(await p.evaluate(() => navigator.serviceWorker.controller !== window.__ctl), true, 'controlled by the new release');
  });
  await test('with no new release on the site, applying reports not ready (so the page does not reload into the old files)', async () => {
    const switched = await p.evaluate(() => App.swApply()); assert.strictEqual(switched, false); assert.strictEqual(await p.evaluate(() => App.swControlled()), true);
  });
  await test('the version check itself starts the new release installing, so it is waiting before Update now is pressed', async () => {
    setRelease('next-test-3'); const ix = path.join(deploy, 'app', 'index.html'); fs.writeFileSync(ix, fs.readFileSync(ix, 'utf8').replace(/(name="app-version" content=")[^"]*/, '$19.99.99'));
    await p.evaluate(() => App.updates.check());
    for (let i = 0; i < 30; i++) { if (await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting)) break; await p.waitForTimeout(500); }
    assert.strictEqual(await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting), true, 'a worker is waiting with no manual update call');
  });
  await test('a cold start after a deploy keeps one release: the page and its scripts stay the old release until Update now, then both are the new one', async () => {
    // A fresh visitor installs release A (whatever is deployed now). Then a new release B is deployed: a new page version, a new RELEASE and a changed script.
    const ctx2 = await browser.newContext(), q = await ctx2.newPage(); q.on('dialog', d => d.dismiss());
    await q.goto(base); await waitControl(q);
    const verA = await q.evaluate(() => document.querySelector('meta[name="app-version"]').content);
    const ix = path.join(deploy, 'app', 'index.html'); fs.writeFileSync(ix, fs.readFileSync(ix, 'utf8').replace(/(name="app-version" content=")[^"]*/, '$110.0.0'));
    const hp = path.join(deploy, 'app', 'app-help.js'); fs.appendFileSync(hp, '\n;window.__B = true;\n');
    setRelease('release-B');
    await q.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));      // the browser looks for the new worker, as it does on a navigation
    for (let i = 0; i < 30; i++) { if (await q.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting)) break; await q.waitForTimeout(500); }
    await q.reload(); await q.waitForFunction(() => typeof App === 'object', null, { timeout: 15000 });      // a cold start: a navigation, with release B on the server and A still in control
    const shown = await q.evaluate(() => ({ ver: document.querySelector('meta[name="app-version"]').content, b: typeof window.__B }));
    assert.strictEqual(shown.ver, verA, 'the page is still release A (it showed ' + shown.ver + ')');
    assert.strictEqual(shown.b, 'undefined', 'release A\'s page ran release B\'s script');
    await q.evaluate(() => App.updates.check()); await q.waitForSelector('#updateBar:not([hidden])', { timeout: 8000 });      // the update check still sees the server's copy
    assert.strictEqual(await q.evaluate(() => App.swApply()), true, 'Update now can switch to release B');
    await q.reload(); await q.waitForFunction(() => typeof App === 'object', null, { timeout: 15000 });
    const now = await q.evaluate(() => ({ ver: document.querySelector('meta[name="app-version"]').content, b: window.__B === true }));
    assert.strictEqual(now.ver, '10.0.0', 'after Update now the page is release B'); assert.strictEqual(now.b, true, 'and so are its scripts');
    await ctx2.close();
  });
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})().catch(e => { console.log('ERROR ' + e.message); process.exit(1); });
