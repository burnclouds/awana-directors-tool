// UX-10, UX-19, UX-06, UX-07, UX-09 (batch 8): the phone top bar keeps Undo and Download on screen and puts Redo, Flag, Bug and Search in a "..." menu; File is a labelled menu;
// the Tonight group is always open in the phone menu; the Person filters sit behind one Filter line on a phone; the "/" search has a button and ranks names that start with the text first. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/topbar-phone-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async (w, h) => { const ctx = await browser.newContext({ viewport: { width: w, height: h || 844 } }), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); return { page, ctx, errs }; };
  const edits = (page, n) => page.evaluate(n => { const id = Object.keys(App.season.roster.people)[0]; for (let i = 0; i < n; i++) { Season.setMark(App.season, '2026-10-28', id, 'h', i % 2); App.commitScope(() => App.changed()); } }, n);

  for (const w of [390, 430, 600]) {
    await test('UX-10 at ' + w + ': the bar does not scroll sideways, Undo and Download are fully on screen after 25 edits, Redo/Flag/Search are behind "..."', async () => {
      const { page, ctx, errs } = await open(w); await edits(page, 25); await page.waitForTimeout(200);
      const r = await page.evaluate(() => { const g = id => { const e = document.getElementById(id), b = e.getBoundingClientRect(); return { l: b.left, r: b.right, w: b.width, vis: getComputedStyle(e).display !== 'none' }; }; const h = document.querySelector('header.top'), a = document.querySelector('.actions'); return { hs: h.scrollWidth <= h.clientWidth, as: a.scrollWidth <= a.clientWidth, page: document.documentElement.scrollWidth <= innerWidth, dl: g('btnSeasonSave'), undo: g('btnUndo'), ov: g('btnOverflow'), redo: g('btnRedo'), flag: g('btnFlagMode'), search: g('btnSearch') }; });
      assert(r.hs && r.as && r.page, 'no sideways scroll: ' + JSON.stringify(r)); assert(r.dl.vis && r.dl.l >= 0 && r.dl.r <= w, 'Download on screen ' + JSON.stringify(r.dl)); assert(r.undo.vis && r.undo.l >= 0 && r.undo.r <= w, 'Undo on screen'); assert(r.ov.vis && r.ov.r <= w && r.ov.w >= 44, '"..." on screen and 44px: ' + JSON.stringify(r.ov));
      assert(!r.redo.vis && !r.flag.vis && !r.search.vis, 'Redo, Flag and Search are not in the bar'); assert.deepStrictEqual(errs, []); await ctx.close();
    });
  }
  await test('the "..." menu holds Redo, Flag and Search; Flag turns flag mode on (a dot on "..."), Esc leaves it; Redo mirrors the real button; keyboard: Enter opens, arrows move, Esc closes and returns focus', async () => {
    const { page, ctx } = await open(390); await page.focus('#btnOverflow'); await page.keyboard.press('Enter'); await page.waitForSelector('#overflowMenu:not([hidden])');
    assert.deepStrictEqual(await page.$$eval('#overflowMenu [data-ov]', b => b.map(x => x.dataset.ov)), ['redo', 'flag', 'search', 'help'], 'Bug is not there while the Bug switch is off'); assert.strictEqual(await page.$eval('#overflowMenu [data-ov="redo"]', b => b.disabled), true, 'Redo is disabled with nothing to redo');
    assert.strictEqual(await page.evaluate(() => document.activeElement.dataset.ov), 'flag', 'focus lands on the first enabled item'); await page.keyboard.press('ArrowDown'); assert.strictEqual(await page.evaluate(() => document.activeElement.dataset.ov), 'search'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Escape');
    assert(await page.$eval('#overflowMenu', m => m.hidden), 'Esc closes'); assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'btnOverflow', 'focus returns');
    await page.click('#btnOverflow'); await page.click('#overflowMenu [data-ov="flag"]'); await page.waitForTimeout(150); assert.strictEqual(await page.getAttribute('#btnFlagMode', 'aria-pressed'), 'true', 'flag mode on'); assert(await page.$eval('#btnOverflow', b => b.classList.contains('on')), 'the "..." button shows the mode is on');
    await page.keyboard.press('Escape'); await page.waitForTimeout(100); assert.strictEqual(await page.getAttribute('#btnFlagMode', 'aria-pressed'), 'false', 'Esc leaves flag mode'); assert(!(await page.$eval('#btnOverflow', b => b.classList.contains('on'))), 'the dot is gone');
    await page.evaluate(() => { App.season.config.bugButton = true; App.syncBugButton(); }); await page.click('#btnOverflow'); assert(await page.isVisible('#overflowMenu [data-ov="bug"]'), 'Bug shows when the switch is on'); await page.keyboard.press('Escape');
    await ctx.close();
  });
  await test('Redo from the menu redoes an undone edit', async () => {
    const { page, ctx } = await open(390); await page.evaluate(() => { const id = Object.keys(App.season.roster.people)[0]; Season.setMark(App.season, '2026-10-28', id, 'h', 1); App.commitScope(() => App.changed()); }); const before = await page.evaluate(() => JSON.stringify(App.season.attendance)); await page.click('#btnUndo'); await page.waitForTimeout(150); assert.notStrictEqual(await page.evaluate(() => JSON.stringify(App.season.attendance)), before, 'undone');
    await page.click('#btnOverflow'); await page.click('#overflowMenu [data-ov="redo"]'); await page.waitForTimeout(200); assert.strictEqual(await page.evaluate(() => JSON.stringify(App.season.attendance)), before, 'redone'); await ctx.close();
  });
  await test('at 1280 every button is in the bar as before and "..." is hidden', async () => {
    const { page, ctx } = await open(1280, 900); const r = await page.evaluate(() => ['btnRedo', 'btnFlagMode', 'btnSearch', 'btnUndo', 'btnSeasonSave', 'btnFile'].map(id => getComputedStyle(document.getElementById(id)).display !== 'none').concat([getComputedStyle(document.getElementById('btnOverflow')).display === 'none']));
    assert(r.every(Boolean), JSON.stringify(r)); assert(/File/.test(await page.textContent('#btnFile')), 'the caret says File (UX-19)'); await ctx.close();
  });
  await test('UX-19: the File menu has Import and Merge, on a phone and on a computer', async () => {
    for (const w of [390, 1280]) { const { page, ctx } = await open(w, 900); await page.click('#btnFile'); await page.waitForSelector('#fileMenu:not([hidden])'); const t = await page.textContent('#fileMenu'); assert(/Import/.test(t) && /Merge/.test(t), w + ': ' + t.slice(0, 120)); assert(await page.getAttribute('#btnFile', 'aria-label').then(x => /import/i.test(x)), 'the name says import'); await ctx.close(); }
  });
  await test('UX-06: from Roster, Attendance is two taps (menu, then Attendance) at 390, 430 and 600, and the Tonight head has no caret', async () => {
    for (const w of [390, 430, 600]) { const { page, ctx } = await open(w); await page.click('#tabMenu'); assert(await page.isVisible('.tabs button[data-tab="attend"]'), w + ': Attendance is visible with the menu open'); assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.tabgrp:first-child .tmcaret')).display), 'none', 'no caret on Tonight'); await page.click('.tabs button[data-tab="attend"]'); await page.waitForTimeout(200); assert.strictEqual(await page.evaluate(() => App.tab), 'attend'); await ctx.close(); }
  });
  await test('UX-07: on a phone the Person bar keeps Search, Person, Previous and Next; the filters are behind one Filter line that says what is set; on a computer all are in the bar', async () => {
    const { page, ctx } = await open(390); await page.evaluate(() => App.showTab('person')); await page.waitForSelector('#pePerson option', { state: 'attached' });
    assert(await page.isVisible('#peSearch') && await page.isVisible('#pePerson') && await page.isVisible('#btnPePrev') && await page.isVisible('#btnPeNext')); assert(!(await page.isVisible('#peGroup')), 'Group is behind Filter'); assert(/^Filter: first name$/.test(await page.textContent('#peFilterSum')), await page.textContent('#peFilterSum'));
    assert((await page.$eval('#personWrap h2, #personWrap h3, #personWrap', e => e.getBoundingClientRect().top)) < 330, 'the name heading is near the top');
    await page.click('#peFilterSum'); await page.waitForTimeout(100); assert(await page.isVisible('#peGroup')); await page.selectOption('#peGroup', 'Sparks'); await page.selectOption('#peSort', 'last'); await page.waitForTimeout(150); assert(/Sparks/.test(await page.textContent('#peFilterSum')) && /last name/.test(await page.textContent('#peFilterSum')), await page.textContent('#peFilterSum')); await ctx.close();
    const w = await open(1280, 900); await w.page.evaluate(() => App.showTab('person')); await w.page.waitForSelector('#pePerson option', { state: 'attached' }); for (const id of ['peRole', 'peGroup', 'peClass', 'peSort', 'peInactive']) assert(await w.page.isVisible('#' + id), id + ' visible at 1280'); assert(!(await w.page.isVisible('#peFilterSum')), 'no summary on a computer'); await w.ctx.close();
  });
  await test('UX-09: the search button opens the box (44px at 390); names that start with the text rank first, then last-name starts, then contains', async () => {
    const { page, ctx } = await open(1280, 900); assert(await page.isVisible('#btnSearch'), 'a button at 1280'); await page.click('#btnSearch'); assert(await page.isVisible('#gSearchQ'), 'the box opens'); await page.keyboard.press('Escape');
    const order = await page.evaluate(() => { const people = App.master.people, ids = people.map(p => p[Model.X.ID]), norm = Model.norm; const names = people.map(p => Model.fullName(p)); const w = names.map(n => norm(n).split(/\s+/)); const q = (() => { const c = {}; w.forEach(a => a.forEach(x => { for (let k = 2; k <= 2; k++) { const s = x.slice(0, k); if (s.length === k) c[s] = (c[s] || 0) + 1; } })); return Object.keys(c).sort((a, b) => c[b] - c[a])[0]; })();
      const rank = n => { const a = norm(n).split(/\s+/); if (a[0].startsWith(q)) return 0; if (a.length > 1 && a[a.length - 1].startsWith(q)) return 1; return a.some(x => x.startsWith(q)) ? 2 : 3; };
      return { q, expected: names.filter(n => norm(n).includes(q)).map((n, i) => ({ n, i, r: rank(n) })).sort((a, b) => a.r - b.r || a.i - b.i).slice(0, 12).map(x => x.n) }; });
    await page.evaluate(() => App.openSearch()); await page.fill('#gSearchQ', order.q); await page.waitForTimeout(200);
    const got = await page.$$eval('#gSearchList li[data-id]', l => l.map(x => x.firstChild.textContent.trim())); assert.deepStrictEqual(got.slice(0, 12), order.expected.slice(0, got.length), 'ranked order for "' + order.q + '"'); await ctx.close();
    const ph = await open(390); const bb = await ph.page.evaluate(() => { document.getElementById('btnOverflow').click(); const b = document.querySelector('#overflowMenu [data-ov="search"]').getBoundingClientRect(); return b.height; }); assert(bb >= 44, 'the Search item is a 44px target on a phone: ' + bb); await ph.page.click('#overflowMenu [data-ov="search"]'); assert(await ph.page.isVisible('#gSearchQ'), 'opens from the menu'); await ph.ctx.close();
  });
  for (const w of [390, 430]) {
    await test('UX-08 trial (' + w + '): Help for this tab is two taps from any tab, shows the tab\'s notes, closes with Esc, the backdrop and Close, returns focus, and the page does not scroll sideways', async () => {
      const { page, ctx, errs } = await open(w); for (const tab of ['attend', 'todo', 'roster', 'options']) {
        await page.evaluate(t => App.showTab(t), tab); await page.waitForTimeout(150); await page.click('#btnOverflow'); await page.click('#overflowMenu [data-ov="help"]'); await page.waitForSelector('#helpSheet[open]');
        const r = await page.evaluate(() => ({ h: document.querySelector('#helpSheet h3').textContent, notes: document.querySelectorAll('#helpSheet .helpnote').length, sw: document.documentElement.scrollWidth <= innerWidth })); assert(/^Help: /.test(r.h) && r.sw, tab + ' ' + JSON.stringify(r)); if (tab === 'attend' || tab === 'todo') assert(r.notes >= 1, tab + ': the (i) notes are reachable (' + r.notes + ')');
        await page.keyboard.press('Escape'); assert(!(await page.isVisible('#helpSheet')), 'Esc closes'); await page.waitForTimeout(80); assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'btnOverflow', 'focus returns');
      }
      await page.click('#btnOverflow'); await page.click('#overflowMenu [data-ov="help"]'); await page.click('#helpClose'); assert(!(await page.isVisible('#helpSheet')), 'Close closes');
      await page.click('#btnOverflow'); await page.click('#overflowMenu [data-ov="help"]'); await page.mouse.click(2, 2); await page.waitForTimeout(100); assert(!(await page.isVisible('#helpSheet')), 'the backdrop closes'); assert.deepStrictEqual(errs, []); await ctx.close();
    });
  }
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
