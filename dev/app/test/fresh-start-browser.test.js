// Starting fresh from one Planning Center export (no data file), and an export whose columns have changed: what is read, what is warned, what still works. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/fresh-start-browser.test.js
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
  const TABS = ['todo', 'attend', 'games', 'awards','roster', 'person', 'uniforms', 'calendar', 'stats', 'store', 'reports', 'history', 'options', 'validate', 'debug'];

  await test('fresh start: one export alone builds the roster; Download data file asks for the club year (suggesting the current one) and creates the file; that file opens on its own', async () => {
    const { page, ctx, msgs, prompts } = await fresh(EXPORT);
    assert.strictEqual(await page.evaluate(() => [!!App.season, App.master.people.length]).then(x => x.join()), 'false,140'); assert(await page.evaluate(() => document.getElementById('seasonStatus').textContent).then(t => /No data file/.test(t)));
    const dl = page.waitForEvent('download', { timeout: 8000 }); await page.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await page.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); const d = await dl;
    assert.strictEqual(prompts.length, 1); assert.strictEqual(prompts[0], await page.evaluate(() => Season.defaultYear(App.today())), 'the suggested year is the current club year'); assert(/^\d{4}-\d{2}$/.test(prompts[0]));
    const file = path.join(TMP, d.suggestedFilename()); await d.saveAs(file); const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(j.format, 'awana-season'); assert.strictEqual(j.year, prompts[0]); assert.strictEqual(Object.keys(j.roster.people).length, 140); assert(j.config.books && j.config.awardLists, 'the standard settings came with it');
    for (const t of TABS) { await tab(page, t); await page.waitForTimeout(120); } assert(!msgs.some(m => /PAGE ERROR/.test(m)), msgs.join(' | '));
    await ctx.close();
    const two = await fresh(file); assert.strictEqual(await two.page.evaluate(() => [App.season.year, App.master.people.length].join()), prompts[0] + ',140', 'the new data file opens by itself'); assert(!two.msgs.some(m => /PAGE ERROR/.test(m))); await two.ctx.close();
  });
  await test('fresh start, then the calendar: a calendar CSV is brought in with Import, and Attendance has its club nights', async () => {
    const { page, ctx } = await fresh(EXPORT); const cal = path.join(TMP, 'calendar.csv'); fs.writeFileSync(cal, 'Date,Type,Quarter,Theme\n2026-10-28,Club night,Q2,Crazy Hair\n2026-11-04,Club night,Q2,Pajama\n');
    await page.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await page.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await page.waitForTimeout(500); await page.setInputFiles('#fileAny', [cal]); await page.waitForTimeout(500);
    assert.strictEqual(await page.evaluate(() => App.calendar.length), 2); await tab(page, 'attend'); await page.waitForTimeout(250); assert((await page.$$eval('#attDate option', o => o.length)) >= 2, 'the nights are on the Attendance tab'); await ctx.close();
  });
  await test('an export in the usual form: no columns window and no bar', async () => {
    const { page, ctx } = await fresh(EXPORT); assert(!(await page.evaluate(() => document.getElementById('dlg').open))); assert(!(await page.isVisible('#pcColsBar')));
    await tab(page, 'debug'); await page.waitForTimeout(150); assert(/Every column the app reads is in the export/.test(await page.textContent('#debugWrap'))); await ctx.close();
  });
  await test('an export with changes (class column renamed, no uniform column at all, a new hoodie-size column): the people and classes still import, a window lists each change, a bar stays, Hide hides it, Details reopens it, Debug and Validate list it', async () => {
    const f = variant({ rename: { 'Assignment Area: Classes': 'Class Assignment' }, drop: ['Cubbies Vest', 'Sparks Vest', 'T&T shirt', 'If you are purchasing a Awana shirt, please provide size.'], add: ['Hoodie Size'] }, '20261028 -- demo-club-2026-27 TEST changed.csv'); const { page, ctx, msgs } = await fresh(f);
    assert.strictEqual(await page.evaluate(() => App.master.people.length), 140); assert.strictEqual(await page.evaluate(() => App.master.people.filter(p => Model.room(p) === 'Unassigned').length), 0, 'every child kept their class');
    assert(await page.evaluate(() => document.getElementById('dlg').open), 'the window opens on import'); const dtext = await page.textContent('#dlg');
    assert(/Class Assignment.*read as.*Assignment Area: Classes/s.test(dtext) && /There is no .Uniform. column/.test(dtext) && /New column .Hoodie Size. looks like a uniform item/.test(dtext), dtext.slice(0, 400));
    await page.click('#colsClose'); assert(await page.isVisible('#pcColsBar')); assert(/2 things to check/.test(await page.textContent('#pcColsText')), await page.textContent('#pcColsText'));
    await page.click('#pcColsHide'); assert(!(await page.isVisible('#pcColsBar'))); await tab(page, 'todo'); await page.waitForTimeout(200); assert(!(await page.isVisible('#pcColsBar')), 'stays hidden as you move around');
    await page.evaluate(() => { document.getElementById('pcColsMore').click(); }); assert(await page.evaluate(() => document.getElementById('dlg').open)); await page.click('#colsClose');
    await tab(page, 'debug'); await page.waitForTimeout(150); assert(/Hoodie Size/.test(await page.textContent('#debugWrap')) && /There is no .Uniform. column/.test(await page.textContent('#debugWrap')));
    await page.setInputFiles('#vFiles', [f]); await page.waitForTimeout(500); await tab(page, 'validate'); assert(/Columns: There is no .Uniform. column/.test(await page.textContent('#validateWrap')), 'the file check lists it too');
    assert(!msgs.some(m => /PAGE ERROR/.test(m)), msgs.join(' | ')); await ctx.close();
  });
  await test('a changed export imported on top of an open data file shows the bar (no window), and a clean one afterwards takes it away', async () => {
    const { page, ctx } = await fresh(EXPORT); await page.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await page.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await page.waitForTimeout(500); assert(!(await page.evaluate(() => document.getElementById('dlg').open)));
    const f = variant({ drop: ['Cubbies Vest', 'Sparks Vest', 'T&T shirt', 'If you are purchasing a Awana shirt, please provide size.'] }, '20261104 -- demo-club-2026-27 TEST dropped.csv'); await page.setInputFiles('#fileAny', [f]); await page.waitForTimeout(800);
    assert(await page.isVisible('#pcColsBar'), 'the bar shows'); assert(!(await page.evaluate(() => document.getElementById('dlg').open)), 'no window over an import that has its own review');
    await page.setInputFiles('#fileAny', [EXPORT]); await page.waitForTimeout(800); assert(!(await page.isVisible('#pcColsBar')), 'a normal export clears it'); await ctx.close();
  });
  await test('a data file that holds only the identity columns of the roster (an older file) shows no columns warning, and Debug says no export was imported', async () => {
    const dataDir = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f))), j = JSON.parse(fs.readFileSync(dataDir, 'utf8')); delete j.roster.pcCols; delete j.roster.cols; Object.values(j.roster.people).forEach(e => { const keep = {}; ['Registration ID', 'First Name', 'Last Name', 'Assignment Area: Classes', 'Grade', 'Selection'].forEach(k => { if (e.pc[k] !== undefined) keep[k] = e.pc[k]; }); e.pc = keep; }); const f = path.join(TMP, 'awana-2026-27-TEST-20261029-214815.json'); fs.writeFileSync(f, JSON.stringify(j));
    const { page, ctx } = await fresh(f); assert(!(await page.isVisible('#pcColsBar')), 'no bar'); assert(!(await page.evaluate(() => document.getElementById('dlg').open)));
    await tab(page, 'debug'); await page.waitForTimeout(150); assert(/No Planning Center export has been imported into this file yet/.test(await page.textContent('#debugWrap'))); await ctx.close();
  });
  await test('on a phone the bar fits the screen', async () => {
    const f = variant({ drop: ['Cubbies Vest', 'Sparks Vest', 'T&T shirt', 'If you are purchasing a Awana shirt, please provide size.'] }, '20261028 -- demo-club-2026-27 TEST p.csv'); const { page, ctx } = await fresh(f); await page.click('#colsClose').catch(() => {}); await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200);
    assert(await page.isVisible('#pcColsBar')); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll'); await ctx.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
