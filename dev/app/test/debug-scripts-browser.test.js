// The Debug tab's script list (BACKLOG H9): a script that is not one of the app's files, such as the two Google scripts drive.js adds to the page when Google Drive is used,
// is named as from another site, not flagged "not registered"; a missing or old app file still is. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/debug-scripts-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
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
    const page = await (await browser.newContext()).newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { page, errs };
  };
  // type text/plain: the element counts in document.scripts but nothing is fetched or run
  const addScript = (page, src) => page.evaluate(s => { const e = document.createElement('script'); e.type = 'text/plain'; e.src = s; document.head.appendChild(e); }, src);
  const debugText = async page => { await page.evaluate(() => document.querySelector('.tabs button[data-tab="debug"]').click()); await page.waitForTimeout(200); return page.textContent('#debugWrap'); };

  await test('with only the app\'s own scripts, nothing is "not registered"', async () => {
    const { page } = await open(), t = await debugText(page); await page.close();
    assert(/Scripts on this page \(\d+\)/.test(t)); assert(!/not registered/.test(t), 'the app\'s own scripts all report a version');
  });
  await test('Google\'s two scripts, once added by Google Drive, are named as from another site and are not flagged', async () => {
    const { page } = await open(); await addScript(page, 'https://accounts.google.com/gsi/client'); await addScript(page, 'https://apis.google.com/js/api.js');
    const t = await debugText(page); await page.close();
    assert(/from another site \(accounts\.google\.com\)/.test(t) && /from another site \(apis\.google\.com\)/.test(t), 'both are named'); assert(!/not registered/.test(t), 'neither is flagged');
  });
  await test('an app file that did not register (a missing or old copy) is still flagged', async () => {
    const { page } = await open(); await addScript(page, 'app-missing-file.js?v=1');
    const t = await debugText(page); await page.close(); assert(/app-missing-file\.js/.test(t) && /not registered/.test(t));
  });
  await test('no script errors', async () => { const { page, errs } = await open(); await debugText(page); await page.close(); assert.deepStrictEqual(errs, []); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
