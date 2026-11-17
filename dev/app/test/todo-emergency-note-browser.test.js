// S12: the To do page no longer shows an "emergency contact name not given" note. A child with a parent's phone (or any phone number) is not flagged for it,
// and the header counts and the badge still agree. Invented TEST club only, chosen by name.
// Usage: NODE_PATH=<dir with playwright> node test/todo-emergency-note-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.json$/.test(f)).sort().pop());
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), page = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
  await page.goto('http://localhost:' + server.address().port + '/index.html'); await page.setInputFiles('#splashFiles', [DATA]);
  await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => App.showTab('todo')); await page.waitForSelector('#todoWrap .pcard'); await page.waitForTimeout(200);
  await test('the header shows to do and to check, with no emergency note count', async () => {
    const t = await page.textContent('#todoWrap'); assert(/\d+ to do, \d+ to check/.test(t) || /Nothing left to do/.test(t), 'the usual counts');
    assert(!/emergency contact name/i.test(t), 'no emergency-name note in the header');
  });
  await test('no card or row says the emergency contact name is not given', async () => {
    const t = await page.textContent('#todoWrap'); assert(!/Emergency contact name not given/.test(t), 'no note'); assert(!/No emergency contact name/.test(t), 'no row');
  });
  await test('the badge matches the header count', async () => {
    const badge = +(await page.textContent('#todoBadge')) || 0, header = +((await page.textContent('#todoWrap')).match(/(\d+) to do,/) || [])[1] || 0; assert.strictEqual(badge, header, 'badge ' + badge + ' vs header ' + header);
  });
  await test('no script errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
