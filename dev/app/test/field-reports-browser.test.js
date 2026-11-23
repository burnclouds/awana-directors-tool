// Field reports of 2026-11-17: #5 + Add sheet beside the book tabs (and only books without a tab), #7 the Color teams report group, #10 the Uniforms tab fits at 1280 wide and has no Parent size.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/field-reports-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
setTimeout(() => { console.log('timed out'); process.exit(2); }, 170000).unref();
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async (w, h = 900) => { const ctx = await browser.newContext({ viewport: { width: w, height: h } }), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(url); await page.evaluate(() => { App.today = () => '2026-11-18'; }); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); return { page, ctx, errs }; };
  await test('#5: + Add sheet is the last item of the book tabs, and offers only books that have no tab yet (Cubbies, Sparks, T&T)', async () => {
    const { page, ctx, errs } = await open(1366);
    const kid = g => page.evaluate(g => App.master.people.find(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === g)[Model.X.ID], g);
    for (const g of ['Sparks', 'T&T', 'Cubbies']) {
      const id = await kid(g); await page.evaluate(i => App.showPerson(i, { sub: 'progress' }), id); await page.waitForTimeout(350);
      assert(await page.locator('#progressWrap .booktabs #peAddSheet').count() === 1, g + ': the menu is inside the book tabs'); assert.strictEqual(await page.locator('#peSub #peAddSheet').count(), 0, g + ': and not in the sub-tab row');
      const tabs = await page.$$eval('#progressWrap .booktabs button[data-book]', b => b.map(x => x.dataset.book)), opts = await page.$$eval('#peAddSheet option', o => o.map(x => x.value).filter(Boolean));
      assert(tabs.length >= 1, g + ': tabs'); assert(!opts.some(v => tabs.includes(v)), g + ': no option repeats a tab: ' + opts.filter(v => tabs.includes(v)).join(','));
    }
    const id = await kid('Sparks'); await page.evaluate(i => App.showPerson(i, { sub: 'progress' }), id); await page.waitForTimeout(300);
    const before = await page.$$eval('#progressWrap .booktabs button[data-book]', b => b.length), pick = await page.$eval('#peAddSheet option:not([value=""])', o => o.value);
    await page.selectOption('#peAddSheet', pick); await page.waitForTimeout(350);
    assert.strictEqual(await page.locator('#progressWrap .booktabs button[data-book]').count(), before + 1, 'a new tab'); assert(!(await page.$$eval('#peAddSheet option', o => o.map(x => x.value))).includes(pick), 'it leaves the menu'); assert(await page.locator('#progressWrap .booktabs button.on[data-book="' + pick + '"]').count() === 1, 'and is the open tab');
    assert.deepStrictEqual(errs, []); await ctx.close();
  });
  await test('#7: five report groups; Game standings and both color team lists are in Color teams; Pace watch stays in Progress & awards; slips stay with Attendance', async () => {
    const { page, ctx } = await open(1366); await page.evaluate(() => App.showTab('reports')); await page.waitForTimeout(250);
    assert.deepStrictEqual(await page.$$eval('#rSubs button', b => b.map(x => x.textContent)), ['Attendance', 'Color teams', 'Binders', 'Progress & awards', 'Other']);
    const where = async id => { await page.evaluate(x => App.showReport(x), id); await page.waitForTimeout(150); return page.evaluate(() => document.querySelector('#rSubs button.on').dataset.rsub); };
    const errs7 = []; page.on('pageerror', e => errs7.push(e.message));
    for (const [id, g] of [['standings', 'teams'], ['teams', 'teams'], ['binderTeams', 'teams'], ['paceWatch', 'progress'], ['attendance', 'attend'], ['attendDates', 'attend'], ['binderClass', 'binders'], ['uniforms', 'other']]) assert.strictEqual(await where(id), g, id);
    assert.deepStrictEqual(errs7, [], 'no page errors'); await ctx.close();
  });
  await test('#10: the Uniforms tab fits at 1280 and 1366 wide with no sideways scroll, has no Parent size column, and lists the sizes before the dates', async () => {
    for (const w of [1280, 1366]) {
      const { page, ctx } = await open(w); await page.evaluate(() => App.showTab('uniforms')); await page.waitForSelector('#uniWrap table.uni tbody tr');
      const m = await page.evaluate(() => { const e = document.getElementById('uniWrap'); return { sw: e.scrollWidth, cw: e.clientWidth, heads: [...document.querySelectorAll('#uniWrap thead th')].map(t => t.textContent.trim()) }; });
      assert(m.sw <= m.cw + 1, w + ': scrollWidth ' + m.sw + ' > ' + m.cw); assert(!m.heads.some(h => /parent/i.test(h)), m.heads.join('|')); assert.deepStrictEqual(m.heads.slice(0, 2), ['Name', 'Class']); assert(m.heads.indexOf('Size') < m.heads.indexOf('Ordered') && m.heads.indexOf('Size ordered') < m.heads.indexOf('Ordered') && m.heads.indexOf('Size given') < m.heads.indexOf('Ordered') && m.heads.indexOf('Ordered') < m.heads.indexOf('Received') && m.heads.indexOf('Received') < m.heads.indexOf('Given out') && m.heads[m.heads.length - 1] === 'Notes', m.heads.join('|'));
      await ctx.close();
    }
  });
  await test('#6: the year grid has a legend (Solid = set by hand, Dashed = suggested), no pin icon, and a solid hand-set color is named "set by hand"', async () => {
    const { page, ctx } = await open(1366); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('#teamsWrap table.tg select.tgsel'); await page.waitForTimeout(300);
    const t = await page.textContent('#teamsWrap .tglegend'); assert(/Solid/.test(t) && /Dashed/.test(t) && /set by hand/.test(t) && /suggested/.test(t), t); assert.strictEqual(await page.locator('#teamsWrap .tgpin').count(), 0, 'no pin icon'); assert(!/\u{1F4CC}/u.test(await page.textContent('#teamsWrap')), 'no pin character on the tab');
    const sel = '#teamsWrap select.tgproj'; assert(await page.locator(sel).count() >= 1, 'the test club has a suggested (projected) cell to change'); { const now = await page.$eval(sel, s => s.value); await page.selectOption(sel, now === 'Yellow' ? 'Red' : 'Yellow'); await page.waitForTimeout(300); assert(await page.locator('#teamsWrap select.tgset[aria-label*="set by hand"]').count() >= 1, 'a hand-set color is solid and named'); }
    await ctx.close();
  });
  await test('#8: progress sheets say "Drawing ..." while they are made, are lazily laid out on screen, and the sheets all arrive', async () => {
    const { page, ctx } = await open(1366); await page.evaluate(() => App.showTab('reports'));
    await page.evaluate(() => App.showReport('progressSheets')); await page.waitForSelector('#report .onepage'); await page.waitForFunction(() => !document.getElementById('busy').open);      // N4: it opens on one class; the whole club is drawn behind a pop-up
    const at = await page.evaluate(() => { const s = document.getElementById('oRoomSel'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); const b = document.getElementById('busy'); return b.open ? b.textContent : 'no pop-up'; }); assert(/Drawing \d+ progress sheets/.test(at), 'the drawing pop-up shows first: ' + at.slice(0, 60));
    await page.waitForFunction(() => !document.getElementById('busy').open); await page.waitForFunction(() => document.getElementById('pageSum'));
    assert.strictEqual(await page.$eval('#report .onepage', e => getComputedStyle(e).contentVisibility), 'auto', 'sheets off screen are skipped until near'); assert((await page.locator('#report .onepage').count()) >= 30, 'many sheets');
    await page.evaluate(() => App.showReport('progressSheets')); await ctx.close();
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
