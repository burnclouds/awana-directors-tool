// The Roster tab has its own quarter picker for the team column (flag 10): it sets the same app-wide quarter the Reports pills and the Color teams box use, so they stay in step.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/roster-quarter-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.json$/.test(f)).sort().pop());
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  await new Promise(r => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port + '/index.html', browser = await chromium.launch();
  const open = async opts => { const ctx = await browser.newContext(opts || { viewport: { width: 1280, height: 800 } }), p = await ctx.newPage(); p.on('dialog', d => d.dismiss()); await p.goto(url); await p.setInputFiles('#splashFiles', [DATA]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); await p.waitForTimeout(300); await p.evaluate(() => document.querySelector('.tabs button[data-tab="roster"]').click()); await p.waitForTimeout(250); return { p, ctx }; };
  const head = p => p.evaluate(() => { const t = [...document.querySelectorAll('#rosterWrap thead th')].map(h => h.innerText.trim()).find(x => /team$/.test(x)); const sel = document.querySelector('#rosterWrap select.teamsel'); return { th: t, field: sel && sel.dataset.f }; });
  await test('the Roster bar has a quarter picker that shows the quarter of the team column', async () => {
    const { p, ctx } = await open(); const q = await p.evaluate(() => { const s = document.getElementById('fQuarter'); return s ? { n: s.options.length, v: s.value, offscreen: s.getBoundingClientRect().right > innerWidth } : null; });
    assert(q, 'no #fQuarter on the Roster tab'); assert.strictEqual(q.n, 4); const h = await head(p); assert.strictEqual(h.th, q.v + ' team', 'the header names the picked quarter'); await ctx.close();
  });
  await test('choosing another quarter changes the team column header and the cells it edits', async () => {
    const { p, ctx } = await open(); const cur = await p.evaluate(() => document.getElementById('fQuarter').value), other = cur === 'Q4' ? 'Q1' : 'Q4';
    await p.selectOption('#fQuarter', other); await p.waitForTimeout(250); const h = await head(p);
    assert.strictEqual(h.th, other + ' team'); assert.strictEqual(h.field, 'team:' + other); await ctx.close();
  });
  await test('it stays in step with the Reports quarter pills and the Color teams box', async () => {
    const { p, ctx } = await open(); await p.selectOption('#fQuarter', 'Q2'); await p.waitForTimeout(200);
    await p.evaluate(() => document.querySelector('.tabs button[data-tab="reports"]').click()); await p.waitForTimeout(250);
    assert.strictEqual(await p.evaluate(() => document.getElementById('sQuarter').value), 'Q2', 'Reports follows Roster');
    await p.evaluate(() => document.querySelector('#qWrap button[data-q="Q4"]').click()); await p.waitForTimeout(200);
    await p.evaluate(() => document.querySelector('.tabs button[data-tab="roster"]').click()); await p.waitForTimeout(250);
    assert.strictEqual(await p.evaluate(() => document.getElementById('fQuarter').value), 'Q4', 'Roster follows Reports'); assert.strictEqual((await head(p)).th, 'Q4 team'); await ctx.close();
  });
  await test('on a phone the picker is at least 44px tall and fully on screen', async () => {
    const { p, ctx } = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const r = await p.evaluate(() => { const b = document.getElementById('fQuarter').getBoundingClientRect(); return { h: b.height, l: b.left, r: b.right, w: innerWidth, side: document.documentElement.scrollWidth > innerWidth }; });
    assert(r.h >= 43.5, 'height ' + r.h); assert(r.l >= 0 && r.r <= r.w, JSON.stringify(r)); assert(!r.side, 'the page scrolls sideways'); await ctx.close();
  });
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})().catch(e => { console.log('ERROR ' + e.message); process.exit(1); });
