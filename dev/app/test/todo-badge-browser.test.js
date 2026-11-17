// The number on the To do tab says what it counts: its hover title lists the cards that add up to it, and the number equals the sum of those cards (and the "N to do" line on the page).
// Awards are not in it (the Awards tab has its own number). Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/todo-badge-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.json$/.test(f)).sort().pop()), EXPORT = path.join(td, '20261028 -- demo-club-2026-27 TEST.csv');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
setTimeout(() => { console.log('timed out'); process.exit(2); }, 120000).unref();
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(url); await p.setInputFiles('#fileAny', [DATA, EXPORT]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); await p.waitForTimeout(400);
  const badge = () => p.evaluate(() => { const b = document.getElementById('todoBadge'); return { n: +b.textContent || 0, title: b.title, aria: b.getAttribute('aria-label') || '' }; });
  await test('the badge has a hover title and a label that name what it counts, awards left out', async () => {
    const b = await badge(); assert(b.n > 0, 'the TEST club has things to do (badge ' + b.n + ')');
    assert(new RegExp('^' + b.n + ' to do').test(b.title), 'the title starts with the number: ' + b.title); assert(/Awards are not counted/.test(b.title), b.title); assert.strictEqual(b.aria, b.title, 'the same words for a screen reader');
  });
  await test('the title lists every "to do" card with its count, and the counts add up to the badge', async () => {
    const b = await badge(); const parts = [...b.title.matchAll(/([A-Za-z][^,:.]*?) (\d+)(?=,|\.)/g)].map(m => +m[2]); assert(parts.length >= 1, 'cards named in the title: ' + b.title);
    assert.strictEqual(parts.reduce((s, n) => s + n, 0), b.n, 'the listed counts add up to ' + b.n + ': ' + b.title);
  });
  await test('by task: the "to do" card headings add up to the badge, and to the "N to do" line', async () => {
    await p.evaluate(() => App.showTab('todo')); await p.waitForTimeout(400); await p.locator('input[name=tdView][value=task]').check(); await p.waitForTimeout(300);
    const r = await p.evaluate(() => { const heads = [...document.querySelectorAll('#todoWrap section.pcard:not(.flagcard) h3')].map(h => h.innerText.replace(/\s+/g, ' ').trim()).filter(t => /\bto do$/.test(t)); const sum = heads.reduce((s, t) => s + (+(/\((\d+)\)/.exec(t) || [0, 0])[1]), 0); const line = (/(\d+) to do, \d+ to check/.exec(document.getElementById('todoWrap').innerText) || [0, -1])[1]; return { cards: heads.length, sum, line: +line, badge: +document.getElementById('todoBadge').textContent || 0 }; });
    assert(r.cards >= 1, 'to do cards: ' + r.cards); assert.strictEqual(r.sum, r.badge, 'cards ' + r.sum + ' vs badge ' + r.badge); assert.strictEqual(r.line, r.badge, 'the page line ' + r.line + ' vs badge ' + r.badge);
  });
  await test('by person: the per-child "to do" counts add up to the badge too', async () => {
    await p.locator('input[name=tdView][value=person]').check(); await p.waitForTimeout(300);
    const r = await p.evaluate(() => { const sum = [...document.querySelectorAll('#todoWrap section.todocard h3 .status')].reduce((s, e) => s + (+(/(\d+) to do/.exec(e.innerText) || [0, 0])[1]), 0); return { sum, badge: +document.getElementById('todoBadge').textContent || 0 }; });
    assert.strictEqual(r.sum, r.badge, 'children ' + r.sum + ' vs badge ' + r.badge);
  });
  await test('the badge and its title follow an edit; with nothing to do there is no badge and no title', async () => {
    await p.locator('input[name=tdView][value=task]').check(); await p.waitForTimeout(300);
    const before = await badge(); await p.evaluate(() => { const b = document.querySelector('#todoWrap button[data-ignall]'); if (b) b.click(); }); await p.waitForTimeout(500);
    const after = await badge(); assert(after.n < before.n || before.n === 0, 'ignoring items lowers the badge: ' + before.n + ' -> ' + after.n); if (after.n === 0) assert.strictEqual(after.title, '', 'no title when there is no number'); else assert(new RegExp('^' + after.n + ' to do').test(after.title), after.title);
  });
  await test('the Awards badge says what it counts too', async () => {
    const t = await p.evaluate(() => { const b = document.getElementById('awardsBadge'); return { n: +b.textContent || 0, title: b.title }; });
    if (t.n) assert(/award/i.test(t.title), 'the Awards badge has a title: ' + JSON.stringify(t)); else assert(true);
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
