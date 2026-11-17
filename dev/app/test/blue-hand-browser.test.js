// Blue Jewels by hand on the Progress sheet: "Grant by hand" fills an empty slot (a date and a note are asked for), "Drop" removes it again (asked to confirm). Sparks only. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/blue-hand-browser.test.js
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
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 900 } }), page = await ctx.newPage(), msgs = [], answers = [];
    page.on('dialog', async d => { msgs.push(d.message()); if (d.type() === 'prompt') { await d.accept(answers.shift() || ''); } else { await d.accept(); } });
    page.on('pageerror', e => msgs.push('PAGE ERROR ' + e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { page, msgs, answers, ctx };
  };
  const sparksKid = page => page.evaluate(() => App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'Sparks')[Model.X.ID]);

  await test('Grant by hand on the Progress sheet asks for the day and a note, then the slot shows as granted with a Drop button', async () => {
    const s = await open(); const { page } = s;
    const id = await sparksKid(page); await page.evaluate(i => App.goProgress(i), id); await page.waitForTimeout(300);
    const btn = page.locator('[data-bjgrant]').first(); assert(await btn.count() > 0, 'a Grant by hand button is on the row');
    s.answers.push('2026-10-14', 'Entered from paper, missed the night');
    await btn.click(); await page.waitForTimeout(300);
    const ov = await page.evaluate(i => (App.season.blueOverrides || {})[i] || [], id);
    assert.strictEqual(ov.length, 1, 'one override saved'); assert.strictEqual(ov[0].date, '2026-10-14'); assert.strictEqual(ov[0].note, 'Entered from paper, missed the night');
    assert(await page.locator('[data-bjdrop]').count() > 0, 'the granted slot now has a Drop button');
    assert.deepStrictEqual(s.msgs.filter(m => /PAGE ERROR/.test(m)), [], 'no script errors');
    await s.ctx.close();
  });

  await test('Drop removes a granted Blue Jewel (after a confirm) and its slot is free again', async () => {
    const s = await open(); const { page } = s;
    const id = await sparksKid(page); await page.evaluate(i => App.goProgress(i), id); await page.waitForTimeout(300);
    s.answers.push('2026-10-14', 'test');
    await page.locator('[data-bjgrant]').first().click(); await page.waitForTimeout(300);
    await page.locator('[data-bjdrop][data-bjov="1"]').first().click(); await page.waitForTimeout(300);
    const ov = await page.evaluate(i => (App.season.blueOverrides || {})[i] || [], id);
    assert.strictEqual(ov.length, 0, 'the grant is gone');
    assert(await page.locator('[data-bjgrant]').count() > 0, 'the slot can be granted again');
    assert.deepStrictEqual(s.msgs.filter(m => /PAGE ERROR/.test(m)), [], 'no script errors');
    await s.ctx.close();
  });

  await test('a grant with a bad date is refused with a message, and nothing is saved', async () => {
    const s = await open(); const { page } = s;
    const id = await sparksKid(page); await page.evaluate(i => App.goProgress(i), id); await page.waitForTimeout(300);
    s.answers.push('not a date', '');
    await page.locator('[data-bjgrant]').first().click(); await page.waitForTimeout(300);
    const ov = await page.evaluate(i => (App.season.blueOverrides || {})[i] || [], id);
    assert.strictEqual(ov.length, 0, 'nothing saved');
    assert(s.msgs.some(m => /date|YYYY|not/i.test(m)), 'a message about the date: ' + s.msgs.join(' | '));
    await s.ctx.close();
  });

  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
