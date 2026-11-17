// The Person bar in a real browser: search and its status line, Sort by, Previous / Next, and the Progress foot buttons. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/person-bar-browser.test.js
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
    const ctx = await browser.newContext({ acceptDownloads: true }), page = await ctx.newPage(), msgs = [];
    page.on('dialog', d => { msgs.push(d.message()); d.accept(); }); page.on('pageerror', e => msgs.push('PAGE ERROR ' + e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { page, msgs };
  };
  const opts = page => page.evaluate(() => [...document.querySelectorAll('#pePerson option')].map(o => ({ v: o.value, t: o.textContent, sel: o.selected })));
  const lastOf = t => t.replace(/ \(inactive\)$/, '').replace(/^.* — /, '').trim().split(/\s+/).pop();
  const goPerson = async () => { const r = await open(); await r.page.click('.tabs button[data-tab="person"]'); await r.page.waitForSelector('#pePerson option', { state: 'attached' }); return r; };
  const selected = async page => (await opts(page)).findIndex(o => o.sel);

  await test('search narrows the Person list and the status says how many match', async () => {
    const { page } = await goPerson();
    const all = await opts(page); assert(all.length > 3, 'need several people');
    const word = all[0].t.replace(/^.* — /, '').split(' ')[0];
    await page.fill('#peSearch', word);
    const some = await opts(page), st = await page.textContent('#peStatus');
    assert(some.length >= 1 && some.length <= all.length, 'options ' + some.length);
    assert(some.every(o => o.t.toLowerCase().includes(word.toLowerCase())), 'every option contains the search word');
    const m = /^(\d+) (person matches|people match)/.exec(st); assert(m, st); assert.strictEqual(+m[1], some.length, st);
    await page.fill('#peSearch', ''); assert.strictEqual((await opts(page)).length, all.length);
    await page.close();
  });
  await test('a search nothing matches says no one matches', async () => {
    const { page } = await goPerson();
    await page.fill('#peSearch', 'zzqxjv');
    const st = await page.textContent('#peStatus'); assert(/^No one matches "zzqxjv"/.test(st), st);
    await page.close();
  });
  await test('Sort by last name puts the alphabetically first last name first, and changes the order', async () => {
    const { page } = await goPerson();
    const byFirst = (await opts(page)).map(o => o.v);
    await page.selectOption('#peSort', 'last');
    const o = await opts(page), lasts = await page.evaluate(ids => ids.map(i => App.master.people.find(p => p.x_ClubberID === i)['Last Name']), o.map(x => x.v)), sorted = lasts.slice().sort((a, b) => a.localeCompare(b));
    assert.strictEqual(lasts[0], sorted[0], 'first option ' + o[0].t);
    assert.deepStrictEqual(lasts, sorted, 'whole list in last-name order');
    assert.notDeepStrictEqual(o.map(x => x.v), byFirst, 'order differs from first-name sort');
    assert.strictEqual(o.length, byFirst.length);
    await page.close();
  });
  await test('Next and Previous move the selected person one option along', async () => {
    const { page } = await goPerson();
    const o = await opts(page), i = await selected(page); assert(i >= 0 && o.length > i + 2);
    await page.click('#btnPeNext');
    const now = await opts(page); assert.strictEqual(now.findIndex(x => x.sel), i + 1); assert.strictEqual(now[i + 1].v, o[i + 1].v);
    await page.click('#btnPeNext'); assert.strictEqual(await selected(page), i + 2);
    await page.click('#btnPePrev'); assert.strictEqual(await selected(page), i + 1);
    await page.close();
  });
  await test('Previous at the first person stays put', async () => {
    const { page } = await goPerson();
    await page.selectOption('#pePerson', (await opts(page))[0].v);
    await page.click('#btnPePrev'); assert.strictEqual(await selected(page), 0);
    await page.close();
  });
  await test('the foot buttons on a child’s Progress sheet step to the next and previous person', async () => {
    const { page } = await goPerson();
    await page.selectOption('#peGroup', 'Sparks'); await page.selectOption('#pePerson', (await opts(page))[0].v); await page.waitForSelector('#progressWrap [data-prstep="1"]', { state: 'attached', timeout: 8000 });
    const i = await selected(page), o = await opts(page); assert(o.length > i + 1);
    const press = s => page.$eval('#progressWrap [data-prstep="' + s + '"]', b => b.click());      // at the foot of a long sheet, so click it directly
    await press(1);
    assert.strictEqual(await selected(page), i + 1, 'next child');
    await press(-1);
    assert.strictEqual(await selected(page), i, 'previous child');
    await page.close();
  });

  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
