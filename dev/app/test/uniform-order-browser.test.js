// The Uniforms tab and Person tab for next year's form: one Uniform column (ordered and paid), size and the dates recorded here. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/uniform-order-browser.test.js
// Usage: NODE_PATH=<dir with playwright> node test/info-browser.test.js
// Usage: NODE_PATH=<dir with playwright> node test/options-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f))), EXPORT = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort()[0]), NEWER = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort().pop());   // NEWER adds 15 registrations, so it needs a review
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
  const tab = (page, n) => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), n);
  const os = require('os'), Csv = require('../csv.js'), TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-fresh-'));
  const raw = fs.readFileSync(EXPORT, 'utf8');
  const variant = (o, name) => { const rows = Csv.parse(raw), h = rows[0].map(x => x.replace(/^\uFEFF/, '')), keep = h.map((c, i) => (o.drop || []).includes(c) ? -1 : i).filter(i => i >= 0);
    const head = keep.map(i => (o.rename || {})[h[i]] || h[i]).concat(o.add || []), f = path.join(TMP, name); fs.writeFileSync(f, Csv.serialize([head].concat(rows.slice(1).filter(r => r.some(v => v !== '')).map(r => keep.map(i => r[i] || '').concat((o.add || []).map(() => '')))), true)); return f; };
  const fresh = async (file, opts) => { const ctx = await browser.newContext({ acceptDownloads: true }), page = await ctx.newPage(), msgs = [], prompts = [];
    page.on('dialog', d => { msgs.push(d.type() + ': ' + d.message().slice(0, 120)); if (d.type() === 'prompt') { prompts.push(d.defaultValue()); d.accept(d.defaultValue()); } else d.accept(); }); page.on('pageerror', e => msgs.push('PAGE ERROR ' + e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [file]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent), null, { timeout: 8000 }); return { page, ctx, msgs, prompts }; };
  const cols = page => page.$$eval('#uniWrap thead th', e => e.map(x => x.textContent));
  const asNext = (name) => { const rows = Csv.parse(raw), h = rows[0].map(x => x.replace(/^\uFEFF/, '')), drop = new Set(['Cubbies Vest', 'Sparks Vest', 'T&T shirt', 'If you are purchasing a Awana shirt, please provide size.']), keep = h.map((c, i) => drop.has(c) ? -1 : i).filter(i => i >= 0);
    const f = path.join(TMP, name); fs.writeFileSync(f, Csv.serialize([keep.map(i => h[i]).concat(['Uniform'])].concat(rows.slice(1).filter(r => r.some(v => v !== '')).map((r, n) => keep.map(i => r[i] || '').concat([n % 4 === 0 ? 'Yes' : n % 4 === 1 ? 'No' : '']))), true)); return f; };

  await test('next year\'s form: Uniforms lists who ordered and paid without an Item or older size column', async () => {
    const { page, ctx, msgs } = await fresh(asNext('20261028 -- demo-club-2027-28 TEST uniform.csv')); assert(!(await page.isVisible('#pcColsBar')), 'a Uniform column is all the app needs: no warning bar');
    await tab(page, 'uniforms'); await page.waitForTimeout(300); assert.deepStrictEqual(await cols(page), ['Name', 'Class', 'Size', 'Ordered', 'Received', 'Given out', 'Notes']);
    const rows = await page.locator('#uniWrap tbody tr').evaluateAll(r => r.map(x => x.dataset.id).sort());
    const ordered = await page.evaluate(() => App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && Model.wantsUniform(p[Model.C.UNIFORM])).map(p => String(p[Model.X.ID])).sort());
    assert(rows.length > 10, rows.length + ' rows');
    assert.deepStrictEqual(rows, ordered);
    assert(!msgs.some(m => /PAGE ERROR/.test(m)), msgs.join(' | ')); await ctx.close();
  });
  await test('recording the size and dates here: Size, Ordered, Received, Given out (and the no-date box) all stay with the child, and the filter and To do follow', async () => {
    const { page, ctx } = await fresh(asNext('20261028 -- demo-club-2027-28 TEST uniform2.csv')); await tab(page, 'uniforms'); await page.waitForTimeout(300);
    const id = await page.$eval('#uniWrap tbody tr', e => e.dataset.id), row = '#uniWrap tr[data-id="' + id + '"] ';
    await page.fill(row + 'input[data-u="x_Uni_SizeVerified"]', 'Youth M'); await page.press(row + 'input[data-u="x_Uni_SizeVerified"]', 'Tab'); await page.fill(row + 'input[data-u="x_Uni_OrderedDate"]', '2026-11-02'); await page.press(row + 'input[data-u="x_Uni_OrderedDate"]', 'Tab'); await page.waitForTimeout(200);
    const get = k => page.evaluate(([i, c]) => App.master.people.find(x => x[Model.X.ID] === i)[c], [id, k]); assert.strictEqual(await get('x_Uni_SizeVerified'), 'Youth M'); assert.strictEqual(await get('x_Uni_OrderedDate'), '2026-11-02');
    await page.selectOption('#uFilter', 'receive'); await page.waitForTimeout(200); assert(await page.locator(row).count() === 1, 'ordered, not received');
    await page.selectOption('#uFilter', ''); await page.locator(row + 'input[data-uflag]').check(); await page.waitForTimeout(250); await page.selectOption('#uFilter', 'receive'); await page.waitForTimeout(200); assert.strictEqual(await page.locator(row).count(), 0, 'given out (the no-date box) needs no receive date, so it leaves ordered-not-received');
    await page.evaluate(i => App.showPerson(i), id); await page.waitForTimeout(300); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(200); assert(/ordered and paid in Planning Center/.test(await page.textContent('#personWrap')) && !/parent size/.test(await page.textContent('#personWrap')) && !(await page.locator('#personWrap input[data-u="x_Uni_SizeOrdered"]').count()));
    assert.strictEqual(await page.inputValue('#personWrap input[data-u="x_Uni_SizeVerified"]'), 'Youth M'); await ctx.close();
  });
  await test('a child who did not order has a Person card that says so, and an export with no uniform column at all gives an empty Uniforms tab that explains why (and the bar warns)', async () => {
    const { page, ctx } = await fresh(asNext('20261028 -- demo-club-2027-28 TEST uniform3.csv')); const no = await page.evaluate(() => App.master.people.find(x => Model.isClubber(x) && !Model.uniformItems(x).length)[Model.X.ID]);
    await page.evaluate(i => App.showPerson(i), no); await page.waitForTimeout(300); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(200); assert(/No uniform ordered in Planning Center/.test(await page.textContent('#personWrap'))); await ctx.close();
    const noCol = path.join(TMP, '20261028 -- demo-club-2027-28 TEST none.csv'); const rows = Csv.parse(raw), h = rows[0].map(x => x.replace(/^\uFEFF/, '')), drop = new Set(['Cubbies Vest', 'Sparks Vest', 'T&T shirt']), keep = h.map((c, i) => drop.has(c) ? -1 : i).filter(i => i >= 0);
    fs.writeFileSync(noCol, Csv.serialize([keep.map(i => h[i])].concat(rows.slice(1).filter(r => r.some(v => v !== '')).map(r => keep.map(i => r[i] || ''))), true));
    const b = await fresh(noCol); await b.page.click('#colsClose').catch(() => {}); assert(await b.page.isVisible('#pcColsBar')); await tab(b.page, 'uniforms'); await b.page.waitForTimeout(250);
    assert(/Nobody has a uniform to track/.test(await b.page.textContent('#uniWrap'))); await b.ctx.close();
  });
  await test('this year\'s form (per-program columns) shows its columns without a parent size, and the data in the older boxes keeps showing', async () => {
    const { page, ctx } = await fresh(EXPORT); await tab(page, 'uniforms'); await page.waitForTimeout(300); const c = await cols(page); assert(!c.some(x => /parent/i.test(x)) && c.includes('Size') && !c.includes('Size ordered') && !c.includes('Item'), c.join('|'));
    await page.evaluate(() => { Model.uniformItems; const p = App.master.people.find(x => Model.uniformItems(x).length); p.x_Uni_SizeOrdered = 'M'; App.touch(); App.refresh(); }); await tab(page, 'roster'); await tab(page, 'uniforms'); await page.waitForTimeout(250);
    assert((await cols(page)).includes('Size ordered') && (await cols(page)).includes('Size given'), 'data in the older boxes brings them back'); await ctx.close();
  });
  await test('Ordered, Received and Given out are date pickers with a Today button (Uniforms tab and Person tab); a text value typed before is marked until replaced; a year still being typed is not saved', async () => {
    const { page, ctx } = await fresh(asNext('20261028 -- demo-club-2027-28 TEST uniform2.csv')); await tab(page, 'uniforms'); await page.waitForTimeout(300);
    const id = await page.$eval('#uniWrap tbody tr', e => e.dataset.id), row = '#uniWrap tr[data-id="' + id + '"] ', get = k => page.evaluate(([i, c]) => App.master.people.find(x => x[Model.X.ID] === i)[c] || '', [id, k]), today = await page.evaluate(() => App.today());
    for (const c of ['x_Uni_OrderedDate', 'x_Uni_ReceivedDate', 'x_Uni_GivenDate']) assert.strictEqual(await page.getAttribute(row + 'input[data-u="' + c + '"]', 'type'), 'date', c + ' is a date picker');
    assert.strictEqual(await page.getAttribute(row + 'input[data-u="x_Uni_SizeVerified"]', 'type'), 'text', 'sizes stay text');
    await page.click(row + 'button[data-utoday="x_Uni_OrderedDate"]'); await page.waitForTimeout(250); assert.strictEqual(await get('x_Uni_OrderedDate'), today); assert.strictEqual(await page.locator(row + 'button[data-utoday="x_Uni_OrderedDate"]').count(), 0, 'Today goes once there is a date');
    await page.evaluate(i => App.showPerson(i), id); await page.waitForTimeout(300); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(200); assert.strictEqual(await page.getAttribute('#personWrap input[data-u="x_Uni_ReceivedDate"]', 'type'), 'date');
    await page.click('#personWrap button[data-utoday="x_Uni_ReceivedDate"]'); await page.waitForTimeout(250); assert.strictEqual(await get('x_Uni_ReceivedDate'), today); assert.strictEqual(await page.inputValue('#personWrap input[data-u="x_Uni_ReceivedDate"]'), today);
    await page.evaluate(i => { App.master.people.find(x => x[Model.X.ID] === i).x_Uni_GivenDate = 'XL'; App.refresh(); }, id); await page.waitForTimeout(250);
    assert.strictEqual(await page.getAttribute('#personWrap input[data-u="x_Uni_GivenDate"]', 'type'), 'text', 'a value that is not a date stays visible'); assert(await page.locator('#personWrap input.baddate[data-u="x_Uni_GivenDate"]').count() === 1, 'and is marked');
    await page.fill('#personWrap input[data-u="x_Uni_GivenDate"]', '2026-11-04'); await page.press('#personWrap input[data-u="x_Uni_GivenDate"]', 'Tab'); await page.waitForTimeout(300); assert.strictEqual(await get('x_Uni_GivenDate'), '2026-11-04'); assert.strictEqual(await page.getAttribute('#personWrap input[data-u="x_Uni_GivenDate"]', 'type'), 'date', 'typed over: now a date picker');
    await page.evaluate(() => { const i = document.querySelector('#personWrap input[data-u="x_Uni_ReceivedDate"]'); i.value = '0002-11-04'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForTimeout(150); assert.strictEqual(await get('x_Uni_ReceivedDate'), today, 'a year still being typed is not saved'); await ctx.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
