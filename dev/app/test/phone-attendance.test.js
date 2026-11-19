// Club night on a phone (390 x 844): every box is on screen, big enough to hit, the whole cell is the target, and the first child is near the top.
// Usage: NODE_PATH=<dir with playwright> node test/phone-attendance.test.js [screenshot-dir]        (invented test club only)
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f))), shots = process.argv[2];
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
  const browser = await chromium.launch(), W = 390;
  const ctx = await browser.newContext({ viewport: { width: W, height: 844 }, hasTouch: true, isMobile: true }), page = await ctx.newPage(); page.on('dialog', d => d.accept());
  await page.goto('http://localhost:' + server.address().port + '/index.html'); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('button[data-tab="attend"]').click());      // on a phone the tabs are in the menu; this test is about the Attendance layout, not the menu await page.waitForTimeout(200);
  const room = async prefix => { const v = await page.evaluate(p => [...document.querySelectorAll('#attRoom option')].map(o => o.value).find(x => x.startsWith(p)), prefix); await page.selectOption('#attRoom', v); await page.waitForTimeout(150); };
  const shot = async n => { if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, 'phone-attendance-' + n + '.png') }); } };

  for (const [grp, marks] of [['Puggles', 1], ['Sparks', 4]]) {
    await test(grp + ': the page does not scroll sideways and every box is inside the screen', async () => {
      await room(grp); await shot(grp);
      assert(await page.evaluate(w => document.documentElement.scrollWidth <= w, W), 'page scrolls sideways');
      const boxes = await page.locator('#attendWrap input[data-m]').evaluateAll(l => l.slice(0, 40).map(e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; }));
      assert(boxes.length >= marks, 'boxes found'); assert(boxes.every(([l, r]) => l >= 0 && r <= W), 'a box is off screen: ' + JSON.stringify(boxes.find(([l, r]) => l < 0 || r > W)));
      // The grid either fits the screen or scrolls inside its own box; it must never push the page sideways (checked above).
    });
  }
  await room('Sparks');
  await test('each box sits in a target at least 32 px square, and tapping the cell around the box ticks it', async () => {
    const t = await page.locator('#attendWrap td.chk label').first().boundingBox(); assert(t.width >= 32 && t.height >= 32, JSON.stringify(t));
    const cell = page.locator('#attendWrap tbody tr').first().locator('td.chk').first(), before = await cell.locator('input').isChecked(), b = await cell.boundingBox();
    // The far corner, not the one beside the name: since R12 the name link is 44px tall, and the browser's touch adjustment sends a tap 2px from its edge to the link.
    await page.touchscreen.tap(b.x + b.width - 3, b.y + 2); await page.waitForTimeout(150);
    assert.strictEqual(await page.locator('#attendWrap tbody tr').first().locator('td.chk input').first().isChecked(), !before, 'cell corner did not toggle');
  });
  await test('every box has a name a screen reader can read ("Present, <name>")', async () => {
    const l = await page.locator('#attendWrap input[data-m]').first().getAttribute('aria-label'); assert(/^Present, \S+/.test(l), l);
  });
  await test('the marks come before the Team and Year columns', async () => {
    const heads = await page.locator('#attendWrap thead th').allInnerTexts(), i = heads.indexOf('Present'), t = heads.findIndex(h => /team$/.test(h)), y = heads.indexOf('Year');
    assert(i > 0 && t > i && y > t, heads.join(' | '));
  });
  await test('the first child is in the top half of the screen and the top bar is one slim row', async () => {
    const top = await page.locator('#attendWrap tbody tr').first().boundingBox(), bar = await page.locator('header.top').boundingBox();
    assert(top.y < 420, 'first child at y=' + Math.round(top.y)); assert(bar.height <= 60, 'top bar is ' + Math.round(bar.height) + ' px tall');
    await shot('top');
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
