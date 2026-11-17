// Attendance: previous / next buttons beside the night and the room pickers. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/attend-steps-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); page.on('dialog', d => d.accept()); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => { const b = document.getElementById('btnDraftApply'); if (b && !b.closest('[hidden]')) b.click(); });
  await page.evaluate(() => document.querySelector('.tabs button[data-tab="attend"]').click()); await page.waitForTimeout(400);
  const vals = sel => page.$$eval(sel + ' option', o => o.map(x => x.value)), cur = sel => page.inputValue(sel);

  await test('the night and room pickers each have a previous and a next button', async () => {
    for (const id of ['attNightPrev', 'attNightNext', 'attRoomPrev', 'attRoomNext']) assert.strictEqual(await page.locator('#' + id).count(), 1, id);
  });
  await test('Next night / Previous night step through the nights in the picker, and are greyed out at the ends', async () => {
    const nights = await vals('#attDate'); await page.selectOption('#attDate', nights[0]); await page.waitForTimeout(200);
    assert.strictEqual(await page.isDisabled('#attNightPrev'), true, 'first night: no previous'); await page.click('#attNightNext'); await page.waitForTimeout(250); assert.strictEqual(await cur('#attDate'), nights[1]);
    await page.click('#attNightPrev'); await page.waitForTimeout(250); assert.strictEqual(await cur('#attDate'), nights[0]);
    await page.selectOption('#attDate', nights[nights.length - 1]); await page.waitForTimeout(200); assert.strictEqual(await page.isDisabled('#attNightNext'), true, 'last night: no next');
  });
  await test('Next room / Previous room step through the rooms, the sheet follows, and they are greyed out at the ends', async () => {
    const rooms = await vals('#attRoom'); assert(rooms.length > 2); await page.selectOption('#attRoom', rooms[0]); await page.waitForTimeout(200);
    assert.strictEqual(await page.isDisabled('#attRoomPrev'), true); await page.click('#attRoomNext'); await page.waitForTimeout(250); assert.strictEqual(await cur('#attRoom'), rooms[1]);
    assert(/of \d+ present/.test(await page.textContent('#attCount')), 'the sheet redrew'); await page.click('#attRoomPrev'); await page.waitForTimeout(250); assert.strictEqual(await cur('#attRoom'), rooms[0]);
    await page.selectOption('#attRoom', rooms[rooms.length - 1]); await page.waitForTimeout(200); assert.strictEqual(await page.isDisabled('#attRoomNext'), true);
  });
  await test('stepping keeps the keyboard focus on the button so it can be pressed again', async () => {
    const rooms = await vals('#attRoom'); await page.selectOption('#attRoom', rooms[0]); await page.waitForTimeout(200); await page.focus('#attRoomNext'); await page.keyboard.press('Enter'); await page.waitForTimeout(250); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    assert.strictEqual(await cur('#attRoom'), rooms[2]); assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'attRoomNext');
  });
  // UX-03: on a phone each stepper is a 44px-wide, 38px-tall button, the select fully visible, then another button. The 38px height is deliberate (see the TOUCH SIZE NOTE in style.css).
  for (const w of [390, 430, 600]) {
    await test('a phone (' + w + ' wide): the Night and Room steppers do not overlap, and the select is fully visible', async () => {
      const ctx = await browser.newContext({ viewport: { width: w, height: 844 } }), p = await ctx.newPage(); p.on('dialog', d => d.accept());
      await p.goto(url); await p.setInputFiles('#splashFiles', [DATA]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
      await p.evaluate(() => document.querySelector('.tabs button[data-tab="attend"]').click()); await p.waitForTimeout(400);
      const g = await p.evaluate(() => { const box = i => { const r = document.getElementById(i).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
        const st = (a, s, b) => ({ prev: box(a), sel: box(s), next: box(b) }); return { night: st('attNightPrev', 'attDate', 'attNightNext'), room: st('attRoomPrev', 'attRoom', 'attRoomNext'), sw: document.documentElement.scrollWidth, iw: window.innerWidth }; });
      for (const k of ['night', 'room']) {
        const s = g[k];
        assert(s.prev.r <= s.sel.l + 0.5, k + ': the previous button overlaps the select'); assert(s.sel.r <= s.next.l + 0.5, k + ': the next button covers the select (select ' + Math.round(s.sel.l) + '-' + Math.round(s.sel.r) + ', button from ' + Math.round(s.next.l) + ')');
        assert(s.prev.w >= 43.5 && s.prev.w <= 48 && s.next.w >= 43.5 && s.next.w <= 48, k + ': button width ' + Math.round(s.prev.w) + '/' + Math.round(s.next.w));
        assert(s.prev.h >= 37.5 && s.prev.h <= 40 && s.next.h >= 37.5 && s.next.h <= 40, k + ': button height ' + Math.round(s.prev.h) + '/' + Math.round(s.next.h) + ' (38px is the decision)');
        assert(s.sel.w >= 120, k + ': the select is ' + Math.round(s.sel.w) + 'px wide'); assert(s.next.r <= g.iw + 0.5 && s.prev.l >= -0.5, k + ': inside the screen');
      }
      assert(g.sw <= g.iw, 'no sideways page scroll: ' + g.sw + ' > ' + g.iw);
      if (w >= 580) assert(Math.abs(g.night.sel.t - g.room.sel.t) <= 6, 'both steppers share a row at ' + w);
      await ctx.close();
    });
  }
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
