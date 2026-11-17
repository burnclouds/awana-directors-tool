// App updates and auto-save in a real browser: the version check (with a pretend newer site), the bar, Later, the automatic timer, Update now carrying the session through the reload (saved first, restored after),
// the cases where it must not go ahead, and auto-save. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/update-autosave-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
let fake = null, checks = 0;      // fake = the version the pretend site now offers (null: the same as the running one)
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html', f = path.join(app, u);
  if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); let body = fs.readFileSync(f);
  if (u === 'index.html') { if (/_=/.test(req.url)) checks++; if (fake) body = Buffer.from(String(body).replace(/(name="app-version" content=")[^"]*/, '$1' + fake).replace(/(name="app-build" content=")[^"]*/, '$1' + fake + '-build')); }
  res.end(body);
});
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const open = async (file) => { const ctx = await browser.newContext({ acceptDownloads: true }), page = await ctx.newPage(), msgs = [];
    page.on('dialog', d => { msgs.push(d.type() + ': ' + d.message().slice(0, 140)); d.accept(); }); page.on('pageerror', e => msgs.push('PAGE ERROR ' + e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [file || DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); return { page, ctx, msgs }; };
  const tab = (page, n) => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), n);
  const mark = (page, d, k) => page.evaluate(([a, b]) => { const id = Object.keys(App.season.roster.people)[0]; Season.setMark(App.season, a, id, b, 1); App.commitScope(() => App.changed()); return id; }, [d, k]);

  await test('no bar while the site is on the same version; a newer one shows the bar; Later hides it for that version; Options says so', async () => {
    fake = null; const { page, ctx } = await open(); await page.evaluate(() => App.updates.check()); assert(!(await page.isVisible('#updateBar'))); await tab(page, 'options'); await page.waitForTimeout(250); assert(/up to date/.test(await page.textContent('#optUpdates')), 'Options says up to date');
    fake = '9.9.9'; await page.click('#optUpdNow'); await page.waitForSelector('#updateBar:not([hidden])'); assert(/9\.9\.9/.test(await page.textContent('#updateText'))); assert(/Version 9\.9\.9 is available/.test(await page.textContent('#optUpdates')));
    await page.click('#updateLater'); assert(!(await page.isVisible('#updateBar'))); assert(/Version 9\.9\.9 is available/.test(await page.textContent('#optUpdates')), 'still listed on Options'); await ctx.close(); fake = null;
  });
  await test('the check runs by itself on its schedule and can be turned off; with no file open the choice is not kept in the browser', async () => {
    fake = null; const ctx = await browser.newContext(), page = await ctx.newPage(); await page.goto(url); await page.click('#splashSkip'); await tab(page, 'options'); await page.waitForTimeout(250); fake = '9.9.9';      // the page is loaded on the old version, then the site moves on
    assert.strictEqual(await page.$eval('#optUpdOn', e => e.checked), true, 'on by default'); assert.strictEqual(await page.$eval('#optUpdMin', e => e.value), '10', 'every 10 minutes by default');
    assert.deepStrictEqual(await page.$$eval('#optUpdMin option', o => o.map(x => x.value)), ['5', '10', '15', '30', '60']);
    await page.evaluate(() => App.updates.set(true, 0.05)); const before = checks; await page.waitForSelector('#updateBar:not([hidden])', { timeout: 8000 }); assert(checks > before, 'it asked the site by itself');
    await page.uncheck('#optUpdOn'); const c2 = checks; await page.waitForTimeout(3800); assert.strictEqual(checks, c2, 'off: no more checks');
    await page.selectOption('#optUpdMin', '30'); await page.reload(); await page.click('#splashSkip'); await tab(page, 'options'); await page.waitForTimeout(250); assert.strictEqual(await page.$eval('#optUpdMin', e => e.value), '10', 'with no file open the choice is not kept in the browser'); assert.strictEqual(await page.$eval('#optUpdOn', e => e.checked), true, 'the default is back');
    await ctx.close(); fake = null;
  });
  await test('Update now with unsaved work: it is saved first (a download), the page reloads, and the session comes back: data, tab, no unsaved mark, test mode, and the handoff is gone', async () => {
    fake = null; const { page, ctx, msgs } = await open(); await tab(page, 'attend'); await page.waitForTimeout(200); const id = await mark(page, '2026-10-28', 'h'); assert(await page.evaluate(() => App.dirty()));
    fake = '9.9.9'; await page.evaluate(() => App.updates.check()); await page.waitForSelector('#updateBar:not([hidden])');
    const dl = page.waitForEvent('download', { timeout: 8000 }), nav = page.waitForNavigation({ timeout: 8000 }); await page.click('#updateNow'); const d = await dl; await nav;
    const saved = JSON.parse(fs.readFileSync(await d.path(), 'utf8')); assert.strictEqual(saved.attendance['2026-10-28'][id].h, 1, 'the download holds the unsaved mark'); assert(/TEST/.test(d.suggestedFilename()), d.suggestedFilename());
    await page.waitForFunction(() => App.season && /^9\.9\.9$/.test(document.querySelector('meta[name="app-version"]').content), null, { timeout: 8000 }); await page.waitForTimeout(500);
    assert.strictEqual(await page.evaluate(i => App.season.attendance['2026-10-28'][i].h, id), 1, 'the mark is there after the reload'); assert.strictEqual(await page.evaluate(() => App.tab), 'attend', 'on the same tab'); assert.strictEqual(await page.evaluate(() => App.dirty()), false, 'nothing is unsaved');
    assert.strictEqual(await page.evaluate(() => sessionStorage.getItem('awana-handoff')), null, 'the carried copy is removed as soon as it is read'); assert(!(await page.evaluate(() => location.search)), 'the address is clean again');
    assert(await page.isVisible('#testBanner'), 'a test session stays a test session'); assert(!(await page.isVisible('#updateBar')), 'on the new version there is nothing more to update'); assert(/Updated to version 9\.9\.9/.test(await page.textContent('#flash')));
    assert(!msgs.some(m => /PAGE ERROR/.test(m)), msgs.join(' | ')); await ctx.close(); fake = null;
  });
  await test('Update now carries Recent places through the reload (and the carried copy is gone again)', async () => {
    fake = null; const { page, ctx } = await open(); await tab(page, 'roster'); await tab(page, 'todo'); await tab(page, 'person'); await page.waitForTimeout(300);
    const before = await page.evaluate(() => App.trail.places().map(p => p.label)); assert(before.length >= 3, 'several places: ' + before);
    fake = '9.9.9'; await page.evaluate(() => App.updates.check()); await page.waitForSelector('#updateBar:not([hidden])');
    const nav = page.waitForNavigation({ timeout: 8000 }); await page.click('#updateNow'); await nav; await page.waitForFunction(() => App.season && App.trail, null, { timeout: 8000 }); await page.waitForTimeout(600);
    const after = await page.evaluate(() => App.trail.places().map(p => p.label)); assert.deepStrictEqual(after, before, 'same places, same order');
    assert(await page.isVisible('#trailTop'), 'the Recent button shows (wide screen: the chip bar is hidden)'); assert.strictEqual(await page.evaluate(() => sessionStorage.getItem('awana-handoff')), null); await ctx.close(); fake = null;
  });
  await test('Update now with nothing unsaved does not download anything, and still brings everything back', async () => {
    fake = null; const { page, ctx } = await open(); await tab(page, 'roster'); const year = await page.evaluate(() => App.season.year); fake = '9.9.9'; await page.evaluate(() => App.updates.check()); await page.waitForSelector('#updateBar:not([hidden])');
    let downloaded = 0; page.on('download', () => downloaded++); const nav = page.waitForNavigation({ timeout: 8000 }); await page.click('#updateNow'); await nav; await page.waitForFunction(() => App.season, null, { timeout: 8000 }); await page.waitForTimeout(400);
    assert.strictEqual(downloaded, 0); assert.strictEqual(await page.evaluate(() => App.season.year), year); assert.strictEqual(await page.evaluate(() => App.master.people.length), 140); await ctx.close(); fake = null;
  });
  await test('it does not go ahead when the save is cancelled: still the same page and data, and the person is told', async () => {
    fake = null; const { page, ctx } = await open(); await page.evaluate(() => { const p = App.master.people[0]; p['ov:Grade'] = '9'; App.touch(); }); fake = '9.9.9'; await page.evaluate(() => App.updates.check()); await page.waitForSelector('#updateBar:not([hidden])');
    page.removeAllListeners('dialog'); page.on('dialog', d => d.accept()); await page.click('#updateNow'); await page.waitForSelector('#warn:not([hidden])'); await page.click('#warnCancel'); await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(() => location.search), '', 'no reload'); assert.strictEqual(await page.evaluate(() => App.dirty()), true, 'the unsaved change is still there'); assert(/not applied/.test(await page.textContent('#flash'))); assert.strictEqual(await page.evaluate(() => sessionStorage.getItem('awana-handoff')), null, 'nothing was left in the browser');
    await ctx.close(); fake = null;
  });
  await test('if the carried session cannot be put back it is downloaded as a file instead of lost', async () => {
    const ctx = await browser.newContext({ acceptDownloads: true }), page = await ctx.newPage(), msgs = []; page.on('dialog', d => { msgs.push(d.message()); d.accept(); });
    await page.goto(url); await page.evaluate(() => sessionStorage.setItem('awana-handoff', JSON.stringify({ t: Date.now(), tab: 'roster', season: '{ this is not a data file' })));
    const dl = page.waitForEvent('download', { timeout: 8000 }); await page.reload(); const d = await dl; assert(/^awana-session-recovered-\d+\.json$/.test(d.suggestedFilename()), d.suggestedFilename()); assert(msgs.some(m => /could not be put back/.test(m)), msgs.join()); assert.strictEqual(await page.evaluate(() => sessionStorage.getItem('awana-handoff')), null); await ctx.close();
  });
  await test('auto-save: off by default; on, it saves only when something is unsaved (a download), says when, skips while a window is open, and stops when turned off', async () => {
    const { page, ctx } = await open(); await tab(page, 'options'); await page.waitForTimeout(250); assert.strictEqual(await page.$eval('#optAutoOn', e => e.checked), false); assert.deepStrictEqual(await page.$$eval('#optAutoMin option', o => o.map(x => x.value)), ['1', '2', '5', '10', '15', '30']); assert.strictEqual(await page.$eval('#optAutoMin', e => e.value), '5');
    assert(/this computer \(a download\)/.test(await page.textContent('#optUpdates')), 'says where it saves');
    let n = 0; page.on('download', () => n++); await page.evaluate(() => App.autosave.set(true, 0.02)); await page.waitForTimeout(3000); assert.strictEqual(n, 1, 'turning it on is a change to the file, so it is saved once');
    await mark(page, '2026-10-28', 'h'); await page.waitForFunction(() => /Auto-saved \d\d:\d\d/.test(document.getElementById('autoStatus').textContent), null, { timeout: 6000 }); for (let i = 0; i < 40 && n < 2; i++) await page.waitForTimeout(150); assert.strictEqual(n, 2, 'one more automatic save'); assert.strictEqual(await page.evaluate(() => App.dirty()), false);
    await page.waitForTimeout(2800); assert.strictEqual(n, 2, 'and no more while nothing changes');
    await page.evaluate(() => document.getElementById('dlg').showModal()); await mark(page, '2026-10-28', 'p'); await page.waitForTimeout(2800); assert.strictEqual(n, 2, 'a window is open: it waits'); await page.evaluate(() => document.getElementById('dlg').close()); await page.waitForTimeout(2800); assert.strictEqual(n, 3, 'then it saves');
    await page.evaluate(() => App.autosave.set(false)); await mark(page, '2026-10-28', 'x'); await page.waitForTimeout(3000); assert.strictEqual(n, 3, 'off: nothing automatic'); await ctx.close();
  });
  await test('auto-save never asks a question: a file with no year yet is left for you to save once, and held changes wait for Apply changes', async () => {
    const ctx = await browser.newContext({ acceptDownloads: true }), page = await ctx.newPage(), prompts = []; page.on('dialog', d => { prompts.push(d.type()); d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined); });
    await page.goto(url); await page.setInputFiles('#splashFiles', [path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort()[0])]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    let n = 0; page.on('download', () => n++); await page.evaluate(() => App.autosave.set(true, 0.02)); await page.waitForTimeout(3000); assert.strictEqual(n, 0); assert.deepStrictEqual(prompts, [], 'no club-year question');
    await page.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await page.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await page.waitForTimeout(600); assert.deepStrictEqual(prompts, ['prompt'], 'saving it yourself asks once'); assert(n >= 1);
    await tab(page, 'person'); await page.waitForTimeout(250); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(150); await page.evaluate(() => { const b = document.querySelector('#personWrap input[data-flag="x_NoPhotos"]'); b.click(); }); await page.waitForTimeout(2800); assert.strictEqual(n, 1, 'a held change on the Person tab is not saved behind your back');
    await ctx.close();
  });
  await test('the settings are on Options with an (i) each, with no data open, and the bar has its (i) too', async () => {
    const ctx = await browser.newContext(), page = await ctx.newPage(); await page.goto(url); await page.click('#splashSkip'); await tab(page, 'options'); await page.waitForTimeout(250);
    assert.strictEqual(await page.locator('#optUpdates i.info').count(), 2, 'a note for the updates (card heading) and one for auto-save'); assert.strictEqual(await page.locator('#updateBar i.info[data-info="options.updates"]').count(), 1); await ctx.close();
  });
  await test('S13: a live update returns to the same child and sub-tab (not the first person on Progress)', async () => {
    fake = null; const { page, ctx } = await open();
    const id = await page.evaluate(() => { const p = App.master.people.find(x => Model.isClubber(x) && Model.isActive(x)); App.showPerson(p[Model.X.ID], { sub: 'attendance' }); return p[Model.X.ID]; });
    await page.waitForTimeout(300); assert.strictEqual(await page.evaluate(() => App.places.person.get().state.sub), 'attendance', 'the Person place is on Attendance before the update');
    fake = '9.9.9'; await page.evaluate(() => App.updates.check()); await page.waitForSelector('#updateBar:not([hidden])');
    const nav = page.waitForNavigation({ timeout: 8000 }); await page.click('#updateNow'); await nav;
    await page.waitForFunction(() => App.season && App.tab, null, { timeout: 8000 }); await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({ tab: App.tab, place: App.places.person.get() && App.places.person.get().state }));
    assert.strictEqual(after.tab, 'person', 'still on the Person tab'); assert.strictEqual(after.place && after.place.id, id, 'the same child'); assert.strictEqual(after.place && after.place.sub, 'attendance', 'the same sub-tab');
    await ctx.close(); fake = null;
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
