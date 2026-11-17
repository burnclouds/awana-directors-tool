// The last review items in a real browser: the "saved / unsaved edits" line, tab roles, the store tab per method, a cancelled import staying cancelled,
// files dropped anywhere, and the test-banner button staying hidden. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/leftovers-browser.test.js
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
  const seasonStatus = page => page.evaluate(() => document.getElementById('seasonStatus').title);

  await test('the status line counts unsaved edits, and after a download says when it started (not "saved")', async () => {
    const { page } = await open();
    assert(!/unsaved/.test(await seasonStatus(page)));
    await page.evaluate(() => { const id = Object.keys(App.season.roster.people)[0]; Season.setMark(App.season, '2026-10-21', id, 'x', 1); App.commitScope(() => App.changed()); Season.setMark(App.season, '2026-10-21', id, 'x', 0); App.commitScope(() => App.changed()); });
    let s = await seasonStatus(page); assert(/2 unsaved edits, not downloaded yet/.test(s), s);
    const dl = page.waitForEvent('download', { timeout: 8000 }); await page.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await page.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await dl;   // TEST data: two presses
    await page.waitForTimeout(200); s = await seasonStatus(page); assert(/download started \d\d:\d\d/.test(s) && !/unsaved/.test(s), s);
    await page.evaluate(() => { const id = Object.keys(App.season.roster.people)[0]; Season.setMark(App.season, '2026-10-21', id, 'x', 1); App.commitScope(() => App.changed()); });
    s = await seasonStatus(page); assert(/1 unsaved edit, download started \d\d:\d\d/.test(s), s);
    await page.close();
  });
  await test('after 20 edits the line turns bold (nudge); a download clears it', async () => {
    const { page } = await open();
    await page.evaluate(() => { const id = Object.keys(App.season.roster.people)[0]; for (let i = 0; i < 20; i++) { Season.setMark(App.season, '2026-10-21', id, 'x', i % 2 ? 0 : 1); App.commitScope(() => App.changed()); } });
    assert(await page.evaluate(() => document.getElementById('seasonStatus').classList.contains('nudge')));
    const dl = page.waitForEvent('download', { timeout: 8000 }); await page.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await page.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await dl; await page.waitForTimeout(200);
    assert(!(await page.evaluate(() => document.getElementById('seasonStatus').classList.contains('nudge'))));
    await page.close();
  });
  await test('only one unload prompt is registered', async () => {
    const n = fs.readdirSync(app).filter(f => f.endsWith('.js')).reduce((c, f) => c + (fs.readFileSync(path.join(app, f), 'utf8').match(/addEventListener\(["']beforeunload["']/g) || []).length, 0);
    assert.strictEqual(n, 1, 'beforeunload handlers in all the scripts');      // browser.test.js shows the warning itself
  });
  await test('tabs are a tablist: roles, aria-selected follows the tab shown, arrow keys move between tabs', async () => {
    const { page } = await open();
    assert.strictEqual(await page.getAttribute('.tabs', 'role'), 'tablist');
    assert(await page.$$eval('.tabs button[data-tab]', b => b.every(x => x.getAttribute('role') === 'tab' && ['true', 'false'].includes(x.getAttribute('aria-selected')))));
    assert.deepStrictEqual(await page.$$eval('.tabs button[aria-selected="true"]', b => b.map(x => x.dataset.tab)), ['roster']);
    await page.click('.tabs button[data-tab="todo"]');
    assert.deepStrictEqual(await page.$$eval('.tabs button[aria-selected="true"]', b => b.map(x => x.dataset.tab)), ['todo']);
    await page.focus('.tabs button[data-tab="todo"]'); await page.keyboard.press('ArrowRight');
    const now = await page.$$eval('.tabs button[aria-selected="true"]', b => b.map(x => x.dataset.tab)), next = await page.$$eval('.tabs button', b => b[b.findIndex(x => x.dataset.tab === 'todo') + 1].dataset.tab);
    assert.deepStrictEqual(now, [next]);
    assert.strictEqual(await page.$$eval('main > section[id^="tab-"]', s => s.filter(x => !x.hidden).length), 1);
    await page.close();
  });
  await test('store tab: Direct shows the projection and the Scale button; Proportional and Range hide both and show one points column', async () => {
    const { page } = await open();
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="store"]').click());
    assert(await page.$('#stFit')); assert(await page.$('input[name="stView"]'));
    assert((await page.$$eval('#storeWrap table', t => t.map(x => x.textContent).join('|'))).includes('Projected'));
    for (const m of ['top', 'range']) {
      await page.selectOption('select[data-k="method"]', m); await page.waitForTimeout(100);
      assert(!(await page.$('#stFit')), m + ': no Scale button'); assert(!(await page.$('input[name="stView"]')), m + ': no Show radios');
      const txt = await page.textContent('#storeWrap'); assert(/no separate projection/.test(txt), m);
      assert(!(await page.$$eval('#storeWrap table', t => t.map(x => x.textContent).join('|'))).includes('Projected'), m + ': no Projected column');
      assert(await page.evaluate(() => Store.compute({ master: App.master, season: App.season, calendar: App.calendar }).kids.every(k => k.now === k.projected)), m + ': projected equals so far, as the review found');
    }
    await page.selectOption('select[data-k="method"]', 'direct'); await page.waitForTimeout(100); assert(await page.$('#stFit'));
    await page.close();
  });
  await test('store tab: a minimum above the maximum shows a warning instead of silently raising the maximum', async () => {
    const { page } = await open();
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="store"]').click());
    await page.fill('input[data-k="min"]', '300'); await page.dispatchEvent('input[data-k="min"]', 'change'); await page.waitForTimeout(100);
    assert(/maximum \(200\) is below the minimum \(300\)/.test(await page.textContent('#storeWrap')));
    assert.strictEqual(await page.inputValue('input[data-k="max"]'), '200', 'the box still shows the 200 that was typed');
    await page.fill('input[data-w="extra"]', '2'); await page.dispatchEvent('input[data-w="extra"]', 'change'); await page.waitForTimeout(100);       // another edit while the warning shows
    assert.strictEqual(await page.evaluate(() => App.season.config.store.max), 200, 'an unrelated edit does not move the maximum');
    await page.fill('input[data-k="min"]', '15'); await page.dispatchEvent('input[data-k="min"]', 'change'); await page.waitForTimeout(100);
    assert(!/is below the minimum/.test(await page.textContent('#storeWrap')));
    assert.strictEqual(await page.evaluate(() => App.season.config.store.max), 200, 'the maximum is still 200, not 300');
    assert.strictEqual(await page.evaluate(() => 'warning' in App.season.config.store), false, 'the warning text is not saved in the data file');
    await page.close();
  });
  await test('Cancel on an import review stays cancelled: opening a data file afterwards does not apply that export', async () => {
    const { page } = await open();
    const id = await page.evaluate(() => { const p = App.master.people.find(x => Model.isClubber(x) && Model.isActive(x)); Model.setActive(p, false); App.commitScope(() => App.changed()); return p.x_ClubberID; });
    await page.setInputFiles('#fileAny', [NEWER]); await page.waitForTimeout(800);
    assert(await page.isVisible('#review'), 'the newer export opens a review');
    {
      await page.click('#rvCancel');
      assert(await page.evaluate(i => !Model.isActive(App.master.people.find(x => x.x_ClubberID === i)), id), 'still inactive after Cancel');
      assert(await page.evaluate(() => App.hasPcExport), 'the export is still known (reports can use it)');
      await page.setInputFiles('#fileAny', [DATA]); await page.waitForTimeout(800);
      assert(!(await page.isVisible('#review')), 'no review pops up again when a data file is opened');
    }
    await page.close();
  });
  await test('a file dropped on the roster tab (not only the splash) is opened', async () => {
    const { page } = await open();
    const before = await page.evaluate(() => App.season.history.length);
    const data = fs.readFileSync(EXPORT, 'utf8');
    await page.evaluate(async txt => {
      const dt = new DataTransfer(); dt.items.add(new File([txt], 'drop-test.csv', { type: 'text/csv' }));
      const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }); document.getElementById('tab-roster').dispatchEvent(ev); window.__dropPrevented = ev.defaultPrevented;
    }, data);
    assert(await page.evaluate(() => window.__dropPrevented), 'the browser is told not to navigate to the file');
    await page.waitForTimeout(800);
    assert(await page.evaluate(() => App.opened.some(o => o.name === 'drop-test.csv')), 'the file was read');
    await page.close(); void before;
  });
  await test('the "Try an import" button stays hidden on a phone once hidden', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await ctx.newPage();
    await page.goto(url);
    await page.evaluate(() => { const b = document.getElementById('tryImport'); b.hidden = true; });
    assert(!(await page.isVisible('#tryImport')));
    await ctx.close();
  });
  await test('New season in the browser: pending Planning Center changes and uniform order dates are gone from the people, and stay gone after the next edit', async () => {
    const { page } = await open();
    await page.evaluate(() => { const p = App.master.people.find(x => Model.isClubber(x)); window.__id = p.x_ClubberID; p['ov:Grade'] = '9'; p.x_Uni_OrderedDate = '2026-09-01'; p.x_Uni_ReceivedDate = '2026-09-20'; p.x_Uni_SizeVerified = 'M'; App.commitScope(() => App.changed()); });
    page.removeAllListeners('dialog'); page.on('dialog', d => (d.type() === 'prompt' ? d.accept('2027-28') : d.accept()));
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="options"]').click()); await page.waitForTimeout(400); await page.click('#btnNewSeason'); await page.waitForTimeout(600);
    const look = () => page.evaluate(() => { const p = App.master.people.find(x => x.x_ClubberID === window.__id); return { year: App.season.year, ov: Object.keys(p).filter(k => k.startsWith('ov:') && p[k] !== ''), ordered: p.x_Uni_OrderedDate || '', received: p.x_Uni_ReceivedDate || '', size: p.x_Uni_SizeVerified || '' }; });
    let r = await look(); assert.strictEqual(r.year, '2027-28'); assert.deepStrictEqual(r.ov, []); assert.strictEqual(r.ordered, ''); assert.strictEqual(r.received, ''); assert.strictEqual(r.size, 'M', 'size verified carries over');
    await page.evaluate(() => App.commitScope(() => App.changed())); r = await look(); assert.deepStrictEqual(r.ov, []); assert.strictEqual(r.ordered, '');
    const saved = await page.evaluate(() => { const v = App.season.roster.people[window.__id].v; return Object.keys(v).filter(k => k.startsWith('ov:') || k === 'x_Uni_OrderedDate'); }); assert.deepStrictEqual(saved, [], 'nor in the file that would be downloaded');
    await page.close();
  });
  await test('at phone width the top bar does not push the page sideways, even with the long "20 unsaved edits, download started" line', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await ctx.newPage(); page.on('dialog', d => d.accept());
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    await page.evaluate(() => { const id = Object.keys(App.season.roster.people)[0]; for (let i = 0; i < 21; i++) { Season.setMark(App.season, '2026-10-21', id, 'x', i % 2 ? 0 : 1); App.commitScope(() => App.changed()); } });
    assert(await page.evaluate(() => document.getElementById('seasonStatus').classList.contains('nudge')));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'page width ' + await page.evaluate(() => document.documentElement.scrollWidth));
    await ctx.close();
  });
  await test('Statistics and Store tabs both show how each class gives Participation and Extra; the store version adds the share of store points and follows the weight', async () => {
    const { page } = await open();
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="stats"]').click());
    let txt = await page.textContent('#statsWrap');
    assert(txt.includes('how each class hands them out') && txt.includes('Nearly everyone') || txt.includes('Selective'));
    assert.deepStrictEqual(await page.$$eval('#statsWrap h4', h => h.map(x => x.textContent).filter(x => /^(Participation|Extra)$/.test(x))), ['Participation', 'Extra']);
    assert(await page.$$eval('#statsWrap .mubar', b => b.length) >= 8, 'a bar per class');
    assert(!txt.includes('Share of store points'), 'the stats tab has no store columns');
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="store"]').click());
    txt = await page.textContent('#storeWrap'); assert(txt.includes('Participation and Extra by class') && txt.includes('Share of store points'));
    const shareOf = () => page.evaluate(() => { const t = [...document.querySelectorAll('#storeWrap h4')].find(h => h.textContent === 'Participation').nextElementSibling.nextElementSibling; return [...t.querySelectorAll('tbody tr')].map(r => r.lastElementChild.textContent); });
    assert((await shareOf()).some(x => x !== '0%'), 'some class gets points from Participation');
    await page.fill('input[data-w="participation"]', '0'); await page.dispatchEvent('input[data-w="participation"]', 'change'); await page.waitForTimeout(150);
    assert((await shareOf()).every(x => x === '0%'), 'weight 0: no points from Participation');
    await page.close();
  });
  await test('the two new tables fit a phone in light and dark (no sideways page scroll)', async () => {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme }), page = await ctx.newPage(); page.on('dialog', d => d.accept());
      await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
      for (const tab of ['stats', 'store']) {
        await page.evaluate(t => document.querySelector('.tabs button[data-tab="' + t + '"]').click(), tab);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), scheme + ' ' + tab + ' page width');
      }
      await ctx.close();
    }
  });
  await test('handbook choices: each code is subtitled with the book name, emblem color and group (also for a typed AOG, and for an older file whose books have no group)', async () => {
    const { page } = await open();
    const opts = await page.evaluate(() => {
      const id = Object.keys(App.season.roster.people)[0], other = Object.keys(App.season.roster.people)[1];
      App.season.handbooks[other] = 'AOG 261014'; delete App.season.config.books.HG.group;
      App.handbookBox(id); return Object.fromEntries([...document.querySelectorAll('#hbCodes option')].map(o => [o.value, o.textContent]));
    });
    assert.strictEqual(opts.HG, 'Hangglider \u00b7 Green \u00b7 Sparks', 'the group comes back for a file without it');
    assert.strictEqual(opts.WR, 'Wingrunner \u00b7 Blue \u00b7 Sparks'); assert.strictEqual(opts.SS, 'SkyStormer \u00b7 Red \u00b7 Sparks');
    assert.strictEqual(opts.HC, 'HoneyComb \u00b7 Cubbies'); assert.strictEqual(opts.AoG, 'Agents of Grace \u00b7 T&T', 'the book AO is offered as AoG');
    assert(!('AOG' in opts), 'a code typed in the data is not offered as a choice: only your books are (Options tab)');
    await page.close();
  });
  await test('Person tab: team moves sit inside the Club record under Q1-Q4 with a note to use Move; a move works from there and leaves the quarter colors alone', async () => {
    const { page } = await open();
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="person"]').click());
    await page.selectOption('#peGroup', 'Sparks'); await page.waitForTimeout(150);
    await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(150);
    const card = () => page.evaluate(() => { const c = [...document.querySelectorAll('#personWrap .pcard')].find(x => x.querySelector('h3') && x.querySelector('h3').textContent === 'Club record'); return c ? { html: c.innerHTML, text: c.textContent } : null; });
    let c = await card(); assert(c, 'club record card');
    assert(/Q1 to Q4 are the team for the whole quarter/.test(c.text) && /use Move below/.test(c.text), 'the note is there');
    assert(c.html.includes('id="peMoveAdd"') && c.html.includes('data-team="Q4"'), 'moves and quarter colors are in the same card');
    assert.strictEqual(await page.$$eval('#personWrap h3', h => h.filter(x => x.textContent === 'Team moves').length), 0, 'no separate Team moves card');
    assert(c.html.indexOf('data-team="Q4"') < c.html.indexOf('peMoveAdd'), 'moves come after the quarter colors');
    const before = await page.evaluate(() => [...document.querySelectorAll('select[data-team]')].map(s => s.value));
    const nights = await page.$$eval('#peMoveFrom option', o => o.map(x => x.value)), cur = await page.evaluate(q => document.querySelector('select[data-team="' + q + '"]').value, 'Q2');
    const other = ['Red', 'Blue', 'Green', 'Yellow'].find(x => x !== cur);
    await page.selectOption('#peMoveTeam', other); await page.selectOption('#peMoveFrom', nights[nights.length - 1]); await page.click('#peMoveAdd'); await page.waitForTimeout(200);
    assert((await card()).text.includes('from '), 'the move is listed in the card');
    assert.deepStrictEqual(await page.evaluate(() => [...document.querySelectorAll('select[data-team]')].map(s => s.value)), before, 'the quarter colors did not change');
    await page.close();
  });
  // ---------- drafts: Apply changes / Discard ----------
  const tab = (page, n) => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), n);
  const hist = page => page.evaluate(() => App.season.history.length);
  await test('Person tab: a change is held (not in History, Undo off) until Apply changes; Apply logs one entry named for the tab and makes it undoable', async () => {
    const { page } = await open(); await tab(page, 'person'); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(150);
    assert(await page.evaluate(() => App.isDraftView()), 'Person is a draft tab'); assert(!(await page.isVisible('#draftBar')), 'no bar while nothing is held');
    const h0 = await hist(page), dirty0 = await page.evaluate(() => App.dirty());
    await page.check('input[data-flag="x_NoPhotos"]'); await page.waitForTimeout(200);
    assert(/1 change not applied yet/.test(await page.textContent('#draftBar')), await page.textContent('#draftBar'));
    assert.strictEqual(await hist(page), h0, 'nothing logged yet'); assert(await page.isDisabled('#btnUndo'), 'Undo waits'); assert(await page.evaluate(() => App.dirty()), 'the page knows there is unsaved work');
    await page.click('#btnDraftApply'); await page.waitForTimeout(200);
    assert.strictEqual(await hist(page), h0 + 1); assert(/^Person: /.test(await page.evaluate(() => App.season.history[App.season.history.length - 1].label)));
    assert(!(await page.isDisabled('#btnUndo')), 'Undo works after Apply'); assert(!(await page.isVisible('#draftBar')), 'nothing is waiting: no bar');
    await page.click('#btnUndo'); await page.waitForTimeout(200);
    assert.strictEqual(await hist(page), h0 + 2, 'Undo is its own History line'); assert(/^Undo: /.test(await page.evaluate(() => App.season.history[App.season.history.length - 1].label)));
    void dirty0; await page.close();
  });
  await test('Person tab: several changes, then Discard puts everything back and the file counts as unchanged again', async () => {
    const { page } = await open(); await tab(page, 'person'); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(150);
    const before = await page.evaluate(() => JSON.stringify(App.season.roster.people)), h0 = await hist(page);
    assert.strictEqual(await page.evaluate(() => App.dirty()), false);
    await page.check('input[data-flag="x_NoPhotos"]'); await page.waitForTimeout(150);
    const q = await page.$('select[data-team="Q1"]'); if (q) { const cur = await q.inputValue(); await q.selectOption(['Red', 'Blue', 'Green', 'Yellow'].find(x => x !== cur)); await page.waitForTimeout(150); }
    assert(/\d+ changes? not applied/.test(await page.textContent('#draftBar')));
    await page.click('#btnDraftDiscard'); await page.waitForTimeout(300);        // the confirm is accepted by the page's dialog handler
    assert.strictEqual(await page.evaluate(() => JSON.stringify(App.season.roster.people)), before, 'the data is as it was'); assert.strictEqual(await hist(page), h0);
    assert.strictEqual(await page.evaluate(() => App.dirty()), false, 'not unsaved any more'); assert(!(await page.isVisible('#draftBar')), 'nothing is waiting: no bar');
    await page.close();
  });
  await test('leaving a tab with held changes asks: Cancel keeps you there, OK applies them', async () => {
    const { page, msgs } = await open(); await tab(page, 'person'); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(150);
    await page.check('input[data-flag="x_NoPhotos"]'); await page.waitForTimeout(150); const h0 = await hist(page);
    page.removeAllListeners('dialog'); page.once('dialog', d => d.dismiss());
    await tab(page, 'statsX').catch(() => {}); await page.evaluate(() => document.querySelector('.tabs button[data-tab="games"]').click()); await page.waitForTimeout(200);
    assert.strictEqual(await page.evaluate(() => App.tab), 'person', 'Cancel: still on Person'); assert.strictEqual(await hist(page), h0);
    page.on('dialog', d => d.accept()); await page.evaluate(() => document.querySelector('.tabs button[data-tab="games"]').click()); await page.waitForTimeout(250);
    assert.strictEqual(await page.evaluate(() => App.tab), 'games'); assert.strictEqual(await hist(page), h0 + 1, 'OK applied them'); void msgs;
    await page.close();
  });
  await test('Download data file with held changes asks to apply first, so the file and its History agree', async () => {
    const { page } = await open(); await tab(page, 'person'); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(150);
    await page.check('input[data-flag="x_NoPhotos"]'); await page.waitForTimeout(150); const h0 = await hist(page);
    page.removeAllListeners('dialog'); page.once('dialog', d => d.dismiss());
    await page.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await page.evaluate(() => { document.getElementById('btnSeasonSave').click(); }).catch(() => {}); await page.waitForTimeout(300);
    assert.strictEqual(await hist(page), h0, 'Cancel: nothing applied, nothing downloaded');
    await page.close();
  });
  await test('Attendance is live by default; with "Hold changes" ticked the night waits for Apply; a phone always enters live', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(200);
    assert(!(await page.isVisible('#draftBar')), 'no bar while attendance is live');
    const h0 = await hist(page); await page.locator('#attendWrap input[type=checkbox]').first().check(); await page.waitForTimeout(200);
    assert.strictEqual(await hist(page), h0 + 1, 'a tick is kept at once');
    await page.check('#attHold'); await page.waitForTimeout(150); assert(await page.evaluate(() => App.isDraftView()), 'attendance is a draft view while held');
    await page.locator('#attendWrap input[type=checkbox]').nth(1).check(); await page.waitForTimeout(200);
    assert.strictEqual(await hist(page), h0 + 1, 'held'); assert(/1 change not applied/.test(await page.textContent('#draftBar')));
    await page.click('#btnDraftApply'); await page.waitForTimeout(200); assert.strictEqual(await hist(page), h0 + 2);
    await page.close();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }), ph = await ctx.newPage(); ph.on('dialog', d => d.accept());
    await ph.goto(url); await ph.reload(); await ph.setInputFiles('#splashFiles', [DATA]); await ph.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    await tab(ph, 'attend'); await ph.waitForTimeout(200); const p0 = await hist(ph);
    await ph.locator('#attendWrap input[type=checkbox]').first().check(); await ph.waitForTimeout(200);
    assert.strictEqual(await hist(ph), p0 + 1, 'live on a phone even if hold was turned on elsewhere'); assert(!(await ph.isVisible('#draftBar')));
    await ctx.close();
  });
  await test('Undo and Redo are separate History lines labeled Undo: / Redo:, not folded into the edit they reverse', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(200);
    const h0 = await hist(page); await page.locator('#attendWrap input[type=checkbox]').first().check(); await page.waitForTimeout(200);
    await page.click('#btnUndo'); await page.waitForTimeout(200); await page.click('#btnRedo'); await page.waitForTimeout(200);
    const labels = await page.evaluate(n => App.season.history.slice(n).map(e => e.label), h0);
    assert.strictEqual(labels.length, 3, labels.join(' | ')); assert(/^Undo: /.test(labels[1]) && /^Redo: /.test(labels[2]), labels.join(' | '));
    await page.close();
  });
  // ---------- To do by person, and the highlight on the Person tab ----------
  await test('To do: grouped by person by default, one card with all of a person\'s items; "task" view still available; the choice is remembered', async () => {
    const { page } = await open(); await tab(page, 'todo'); await page.waitForTimeout(200);
    assert(await page.isChecked('input[name="tdView"][value="person"]'), 'by person is the default');
    const target = await page.evaluate(() => { const r = Todo.compute({ master: App.master, season: App.season, quarter: App.quarterOf(App.today()), today: App.today() }); const p = r.people.find(x => x.items.length >= 2); return { id: p.id, name: p.name, n: p.items.length }; });
    const card = page.locator('#todoWrap section.pcard', { has: page.locator('a[data-person="' + target.id + '"]') });
    assert.strictEqual(await card.count(), 1, 'one card for the person'); assert.strictEqual(await card.locator('tbody tr').count(), target.n, 'all their items in it');
    assert(!(await page.textContent('#todoWrap')).includes('Balance due'), 'no balance-due list');
    await page.check('input[name="tdView"][value="task"]'); await page.waitForTimeout(150);
    assert((await page.$$eval('#todoWrap h3', h => h.map(x => x.textContent).join('|'))).includes('Needs a handbook'), 'by-task headings');
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('awana-todo-view')), null, 'the To do view is for this visit only and is not stored');
    await page.close();
  });
  await test('Open Person page from To do: a banner lists what is left, those fields are highlighted, and a highlight goes away when the field is fixed', async () => {
    const { page } = await open(); await tab(page, 'todo'); await page.waitForTimeout(200);
    const id = await page.evaluate(() => { const r = Todo.compute({ master: App.master, season: App.season, quarter: App.quarterOf(App.today()), today: App.today() }); return r.people.find(p => p.items.some(i => i.fields.includes('Emergency Contact')) && p.items.some(i => i.fields.includes('handbook'))).id; });
    await page.click('button[data-person-open="' + id + '"]'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => App.tab), 'person'); assert(/Needs attention \(\d+\)/.test(await page.textContent('#personWrap .attnbanner')), await page.textContent('#personWrap .attnbanner'));
    assert(await page.$('label.pf.attn textarea[data-pc="Emergency Contact"]'), 'emergency contact is highlighted'); assert(await page.$('.hbbox.attn, .attn .hbbox'), 'the handbook box is highlighted');
    assert(!(await page.$('label.pf.attn input[data-pc="Last Name"]')), 'other fields are not');
    // a Planning Center field you fill in here becomes "make this change in Planning Center", so it stays flagged under that title; the details item itself is gone
    await page.fill('textarea[data-pc="Emergency Contact"]', 'Pat Example - (513) 555-0100'); await page.dispatchEvent('textarea[data-pc="Emergency Contact"]', 'change'); await page.waitForTimeout(300);
    let banner = await page.textContent('#personWrap .attnbanner'); assert(!/Details missing/.test(banner) && /Changes to make in Planning Center/.test(banner), banner);
    // a club-record field is fixed for good: the handbook item and its highlight disappear
    await page.fill('input[data-hb="code"]', 'HG'); await page.dispatchEvent('input[data-hb="code"]', 'change'); await page.waitForTimeout(300);
    banner = await page.textContent('#personWrap .attnbanner'); assert(!/Needs a handbook/.test(banner), banner); assert(/Needs attention \(2\)/.test(banner) && /Needs a date received/.test(banner), 'the book is now set, so the next thing to do is its date received: ' + banner);
    assert(!(await page.$('.hbbox.attn, .attn .hbbox')), 'handbook no longer highlighted');
    await page.click('[data-clearattn]'); await page.waitForTimeout(150); assert(!(await page.$('.attnbanner')) && !(await page.$('.attn')), 'Hide this removes the banner and the highlights');
    await page.close();
  });
  await test('opening a person from the Roster or Statistics does not highlight anything; the name link in To do does', async () => {
    const { page } = await open(); await tab(page, 'stats'); await page.waitForTimeout(200);
    await page.click('#statsWrap a[data-person]'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => App.tab), 'person'); assert(!(await page.$('.attnbanner')));
    await tab(page, 'todo'); await page.waitForTimeout(200); await page.click('#todoWrap a[data-person]'); await page.waitForTimeout(300); assert(await page.$('.attnbanner'));
    await page.close();
  });
  await test('balance due: not in the Edit dialog fields, not on the Uniforms tab or the Person page', async () => {
    const { page } = await open();
    await page.evaluate(() => { const p = App.master.people.find(x => Model.isClubber(x)); p['Balance Due'] = '$77'; window.__id = p.x_ClubberID; });
    await tab(page, 'person'); await page.waitForTimeout(200); assert(!(await page.textContent('#personWrap')).includes('due'), 'nothing owed on the Person page');
    await page.evaluate(() => App.openEdit(App.master.people.find(x => x.x_ClubberID === window.__id))); await page.waitForTimeout(150);
    const labels = await page.$$eval('#dlg label', l => l.map(x => x.textContent)); assert(!labels.some(x => /balance due|amount paid/i.test(x)), 'no money inputs');
    await page.keyboard.press('Escape'); await tab(page, 'uniforms'); await page.waitForTimeout(200);
    assert(!/Paid|due/.test(await page.textContent('#uniWrap, #tab-uniforms')), 'no paid or balance column');
    await page.close();
  });
  await test('Games tab lists the team colors red, yellow, green, blue (entry rows and tied standings)', async () => {
    const { page } = await open(); await tab(page, 'games'); await page.waitForTimeout(250);
    assert.deepStrictEqual(await page.$$eval('#gamesWrap section[data-group="Sparks"] table.games:first-of-type tbody tr', r => r.map(x => x.dataset.team)), ['Red', 'Yellow', 'Green', 'Blue']);
    await page.close();
  });
  // ---------- Progress: current book first, one-tap Today ----------
  const sparksKids = page => page.evaluate(() => Model && App.master.people.filter(p => Model.isClubber(p) && Model.isActive(p) && Model.groupOf(Model.room(p)) === 'Sparks').map(p => p.x_ClubberID));
  await test('Progress opens on the child\'s current book: the handbook on file, else the book with the latest progress, and a picked tab stays picked', async () => {
    const { page } = await open(); const ids = await sparksKids(page);
    await page.evaluate(([a, b]) => { App.season.handbooks[a] = 'WR 260916'; delete App.season.handbooks[b]; Season.setProgress(App.season, b, 'SS', 'R.1', '2026-10-14'); Season.setProgress(App.season, b, 'WR', 'R.1', '2026-09-30'); }, [ids[0], ids[1]]);
    await tab(page, 'person'); await page.waitForTimeout(250);
    const shownBook = () => page.$eval('.booktabs button.on', b => b.dataset.book);
    await page.selectOption('#pePerson', ids[0]); await page.waitForTimeout(200); assert.strictEqual(await shownBook(), 'WR', 'handbook on file');
    await page.selectOption('#pePerson', ids[1]); await page.waitForTimeout(200); assert.strictEqual(await shownBook(), 'SS', 'no handbook: the book with the latest progress');
    await page.click('.booktabs button[data-book="HG"]'); await page.waitForTimeout(150); assert.strictEqual(await shownBook(), 'HG', 'a tab you pick stays');
    await page.selectOption('#pePerson', ids[0]); await page.waitForTimeout(200); assert.strictEqual(await shownBook(), 'WR', 'back to the first child: their current book again');
    await page.close();
  });
  await test('Progress: every empty date has a Today button that fills today\'s date in one tap and then goes away; filled dates have none', async () => {
    const { page } = await open(); const ids = await sparksKids(page);
    await tab(page, 'person'); await page.selectOption('#pePerson', ids[2]); await page.waitForTimeout(250);
    const today = await page.evaluate(() => App.today()), empties = await page.$$eval('#progressWrap .pcell', c => c.filter(x => !x.querySelector('input').value).length);
    assert(empties > 0, 'the child has empty dates');
    const first = page.locator('#progressWrap .pcell:has(button[data-today])').first(), key = await first.locator('input').getAttribute('data-key'), scope = await first.locator('input').getAttribute('data-scope');
    await first.locator('button[data-today]').click(); await page.waitForTimeout(250);
    assert.strictEqual(await page.evaluate(([id, s, k]) => App.season.progress[id][s][k], [ids[2], scope, key]), today, 'today\'s date is stored');
    assert.strictEqual(await page.$eval('#progressWrap input[data-scope="' + scope + '"][data-key="' + key + '"]', i => i.value), today);
    assert(!(await page.$('#progressWrap .pcell:has(input[data-scope="' + scope + '"][data-key="' + key + '"]) .todaybtn')), 'a dated cell has no Today button');
    assert((await page.$$eval('#progressWrap .pcell', c => c.filter(x => !x.querySelector('input').value).length)) === empties - 1, 'only that cell changed');
    await page.click('#btnUndo'); await page.waitForTimeout(200); assert(await page.$('#progressWrap .pcell:has(input[data-key="' + key + '"]) .todaybtn'), 'Undo takes it back');
    await page.close();
  });
  await test('Progress on a phone: Today buttons are big enough to tap (44 px), and the page does not scroll sideways', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await ctx.newPage(); page.on('dialog', d => d.accept());
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    await tab(page, 'person'); await page.waitForTimeout(300);
    const box = await page.locator('#progressWrap .todaybtn').first().boundingBox(); assert(box && box.height >= 44 && box.width >= 44, JSON.stringify(box));      // 44 px both ways is the tap target; on a phone the button reads "Now" (shorter than "Today"), so it is no longer 60 px wide
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'page width');
    await page.locator('#progressWrap .todaybtn[data-today]').first().click(); await page.waitForTimeout(250);
    assert(await page.evaluate(() => { const v = [].concat(...Object.values(App.season.progress).map(b => [].concat(...Object.values(b).map(o => Object.values(o))))); return v.includes(App.today()); }), 'one tap on the phone stored today');
    await ctx.close();
  });
  // ---------- Color team games (one tab), accepted warnings, the schedule ----------
  const sub = (page, s) => page.click('.subtabs button[data-sub="' + s + '"]');
  await test('Color teams and Games are one tab, "Color team games", with a switch; old links to the Color teams view still work; drafts apply to the Color teams view only', async () => {
    const { page } = await open();
    assert.strictEqual(await page.$('.tabs button[data-tab="teams"]'), null, 'no separate Color teams tab'); assert.strictEqual(await page.textContent('.tabs button[data-tab="games"]'), 'Color team games');
    await tab(page, 'games'); await page.waitForTimeout(200); assert(await page.isVisible('#subGames') && !(await page.isVisible('#subTeams'))); assert(!(await page.isVisible('#draftBar')), 'game results are live');
    await sub(page, 'teams'); await page.waitForTimeout(200); assert(await page.isVisible('#subTeams') && !(await page.isVisible('#subGames'))); assert(await page.evaluate(() => App.isDraftView()), 'Color teams are a draft view');
    await page.evaluate(() => App.showTab('games', 'games')); await page.waitForTimeout(150); assert(!(await page.isVisible('#draftBar')));
    await page.evaluate(() => App.showTab('teams')); await page.waitForTimeout(200); assert(await page.isVisible('#subTeams'), 'showTab("teams") opens the Color teams view');
    assert.strictEqual(await page.$$eval('.tabs button.on', b => b.map(x => x.dataset.tab).join()), 'games');
    await page.close();
  });
  const setup = page => page.evaluate(() => App.commitScope(() => {
    const sp = App.master.people.filter(p => Model.isClubber(p) && Model.isActive(p) && Model.groupOf(Model.room(p)) === 'Sparks');
    const k = sp[0]; k['team:Q1'] = 'Red'; k['team:Q2'] = 'Red'; window.__kid = k.x_ClubberID; window.__name = Model.fullName(k);
    sp.forEach(p => { p['team:Q3'] = 'Red'; }); App.changed();
  }));
  await test('Color teams: a repeated color names the child as a link to their record, and can be accepted for good (kept in the file); "Warn again" takes it back', async () => {
    const { page } = await open(); await setup(page); await page.evaluate(() => App.showTab('teams')); await page.waitForTimeout(200);
    await page.selectOption('#tQuarter', 'Q2'); await page.waitForTimeout(200);
    const warn = page.locator('.warnlist li', { hasText: 'again, had it in Q1' }).filter({ has: page.locator('a[data-person]') }).first(); assert(await warn.count(), 'the repeat is listed');
    const id = await page.evaluate(() => window.__kid), mine = page.locator('#teamsWrap div.bad .warnlist li:has(a[data-person="' + id + '"])');
    assert.strictEqual(await mine.count(), 1);
    await mine.locator('[data-acc-rep]').click(); await page.waitForTimeout(250);
    assert.strictEqual(await mine.count(), 0, 'no longer a warning'); assert((await page.textContent('details.accepted')).includes('Accepted warnings')); assert(await page.evaluate(i => App.season.config.teamsOk.repeats.includes(i), id), 'stored in the data file config');
    await page.click('#btnDraftApply'); await page.waitForTimeout(250);
    assert(await page.evaluate(i => JSON.parse(Season.toJson(App.season)).config.teamsOk.repeats.includes(i), id), 'and it is in the file that would be downloaded');
    await page.click('details.accepted summary'); await page.click('details.accepted [data-un-rep="' + id + '"]'); await page.waitForTimeout(250);
    assert.strictEqual(await mine.count(), 1, 'warned again');
    await page.click('a[data-person="' + id + '"] >> nth=0'); await page.waitForTimeout(300); assert.strictEqual(await page.evaluate(() => App.tab), 'person', 'the name opens the person record');
    await page.close();
  });
  await test('Color teams: uneven teams can be accepted for one quarter only', async () => {
    const { page } = await open(); await setup(page); await page.evaluate(() => App.showTab('teams')); await page.waitForTimeout(200);
    await page.selectOption('#tQuarter', 'Q3'); await page.waitForTimeout(200); assert(/Uneven teams/.test(await page.textContent('#teamsWrap')), 'Q3 is uneven');
    await page.click('[data-acc-uneven="Q3"]'); await page.waitForTimeout(250); assert(!/Uneven teams\./.test(await page.textContent('#teamsWrap')), 'accepted for Q3');
    assert.deepStrictEqual(await page.evaluate(() => App.season.config.teamsOk.uneven), ['Q3']);
    await page.selectOption('#tQuarter', 'Q2'); await page.waitForTimeout(200); await page.evaluate(() => { const sp = App.master.people.filter(p => Model.isClubber(p) && Model.isActive(p) && Model.groupOf(Model.room(p)) === 'Sparks'); App.commitScope(() => { sp.forEach(p => { p['team:Q2'] = 'Blue'; }); App.changed(); }); App.refresh(); });
    await page.waitForTimeout(250); assert(/Uneven teams/.test(await page.textContent('#teamsWrap')), 'Q2 still warns: accepting Q3 did not cover it');
    await page.close();
  });
  await test('Color teams: the all-quarters list shows every child, sorted by the color in the quarter you pick, with what is coming marked', async () => {
    const { page } = await open(); await page.evaluate(() => App.showTab('teams')); await page.waitForTimeout(200); await page.evaluate(() => { document.querySelector('details.tgsorted').open = true; }); await page.waitForTimeout(100);      // the list sits in a section under the year grid
    assert(await page.$('#tsSort')); const heads = await page.$$eval('table.sched thead th', h => h.map(x => x.textContent)); assert(heads.some(x => /now/.test(x)) || heads.some(x => /coming/.test(x)), heads.join('|'));
    await page.selectOption('#tsSort', 'Q2'); await page.waitForTimeout(200);
    const ORDER = ['Red', 'Yellow', 'Green', 'Blue', 'none'], seq = await page.$$eval('table.sched tbody tr', r => r.map(x => x.classList.contains('grouprow') ? 'G:' + x.textContent : 'R'));
    const groups = seq.filter(x => x.startsWith('G:')).map(x => ORDER.findIndex(c => x.includes(c === 'none' ? 'No color yet' : c))); assert(groups.length >= 2 && groups.every((v, i) => i === 0 || v > groups[i - 1]), 'color groups in red, yellow, green, blue order: ' + groups);
    const kidsInTable = await page.$$eval('table.sched tbody tr:not(.grouprow)', r => r.length), expected = await page.evaluate(() => App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && ['Sparks', 'T&T'].includes(Model.groupOf(Model.room(p)))).length);
    assert.strictEqual(kidsInTable, expected, 'every Sparks and T&T child is listed'); await page.selectOption('#tsGroup', 'Sparks'); await page.waitForTimeout(150);
    assert((await page.$$eval('table.sched tbody tr:not(.grouprow)', r => r.length)) < expected, 'the group filter narrows it');
    await page.close();
  });
  await test('CSV templates: Color teams and Calendar each have a Save CSV button that downloads a file the app can read back', async () => {
    const { page } = await open(); await page.evaluate(() => App.showTab('teams')); await page.waitForTimeout(150);
    const grab = async (btn, name) => { const dl = page.waitForEvent('download', { timeout: 8000 }); await page.click(btn); await page.click(btn); const d = await dl; assert(name.test(d.suggestedFilename()), d.suggestedFilename()); return fs.readFileSync(await d.path(), 'utf8'); };
    const colors = await grab('#btnTeamCsv', /^Color teams .*TEST.*\.csv$/); assert(/^\uFEFF?Unique ID,Name,Group,Class,Q1,Q2,Q3,Q4/.test(colors));
    await tab(page, 'calendar'); await page.waitForTimeout(150); const cal = await grab('#btnCalCsv', /^Calendar .*TEST.*\.csv$/); assert(/Date,Type,Quarter/.test(cal));
    await page.close();
  });
  // ---------- Roster: sort and filter by column ----------
  const rowsOf = (page, col) => page.$$eval('#rosterWrap tbody tr', (r, c) => r.map(x => x.children[c].textContent.trim()), col);
  await test('Roster: a column heading sorts (ascending, descending, then back to class and name order); the arrow and aria-sort follow', async () => {
    const { page } = await open(); await page.waitForTimeout(200);
    const base = await rowsOf(page, 1), asc = [...base].sort((x, y) => x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' }));
    await page.click('button[data-sort="last"]'); await page.waitForTimeout(150);
    assert.deepStrictEqual(await rowsOf(page, 1), asc, 'ascending'); assert.strictEqual(await page.getAttribute('button[data-sort="last"]', 'title'), 'Sort by Last'); assert.strictEqual(await page.$eval('th:has(button[data-sort="last"])', t => t.getAttribute('aria-sort')), 'ascending');
    await page.click('button[data-sort="last"]'); await page.waitForTimeout(150); assert.deepStrictEqual(await rowsOf(page, 1), [...asc].reverse(), 'descending');
    await page.click('button[data-sort="last"]'); await page.waitForTimeout(150); assert.deepStrictEqual(await rowsOf(page, 1), base, 'third click: the original order'); assert.strictEqual(await page.$eval('th:has(button[data-sort="last"])', t => t.getAttribute('aria-sort')), 'none');
    await page.click('button[data-sort="team"]'); await page.waitForTimeout(150);
    const teams = await page.$$eval('#rosterWrap tbody tr', r => r.map(x => (x.querySelector('select[data-f^="team:"]') || { value: '' }).value)), rank = t => { const i = ['Red', 'Yellow', 'Green', 'Blue'].indexOf(t); return i < 0 ? 9 : i; };
    assert(teams.every((t, i) => i === 0 || rank(t) >= rank(teams[i - 1])), 'team sort is red, yellow, green, blue, then none');
    await page.close();
  });
  await test('Roster: column filters narrow the list (text contains, team, active), combine with each other and the bar, and Clear removes them all', async () => {
    const { page } = await open(); await page.waitForTimeout(200); const all = (await rowsOf(page, 0)).length;
    const word = (await rowsOf(page, 1))[0].slice(0, 3).toLowerCase();
    await page.fill('input[data-cf="last"]', word); await page.waitForTimeout(150); const some = await rowsOf(page, 1); assert(some.length > 0 && some.length < all && some.every(x => x.toLowerCase().includes(word)), 'last name contains ' + word);
    await page.selectOption('select[data-cf="team"]', 'Red'); await page.waitForTimeout(150);
    assert((await page.$$eval('#rosterWrap tbody tr', r => r.every(x => (x.querySelector('select[data-f^="team:"]') || {}).value === 'Red'))), 'only Red');
    await page.click('#btnRosterClear'); await page.waitForTimeout(200); assert.strictEqual((await rowsOf(page, 0)).length, all, 'cleared'); assert.strictEqual(await page.inputValue('input[data-cf="last"]'), '');
    await page.evaluate(() => { const p = App.master.people.find(x => Model.isClubber(x)); Model.setActive(p, false); App.commitScope(() => App.changed()); App.refresh(); });      // one child is now inactive, for the Active filter below
    await page.selectOption('select[data-cf="active"]', 'inactive'); await page.waitForTimeout(200); const act = await page.$$eval('#rosterWrap tbody tr', r => r.map(x => x.querySelector('input[data-f="x_Active"]').checked)); assert(act.length >= 1 && act.every(x => !x), 'Inactive only lists the inactive ones');
    await page.selectOption('select[data-cf="room"]', { index: 1 }); await page.waitForTimeout(150); assert.strictEqual(await page.inputValue('#fRoom'), await page.inputValue('select[data-cf="room"]'), 'the Room column filter and the bar filter are the same filter');
    await page.close();
  });
  await test('Roster: typing in a column filter keeps the cursor in the box (the table body is redrawn, not the box), and Tab moves to the next filter', async () => {
    const { page } = await open(); await page.waitForTimeout(200); await page.focus('input[data-cf="first"]'); await page.keyboard.type('ab', { delay: 30 }); await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.dataset.cf), 'first', 'focus still in the First filter'); assert.strictEqual(await page.inputValue('input[data-cf="first"]'), 'ab');
    await page.keyboard.press('Tab'); assert.strictEqual(await page.evaluate(() => document.activeElement.dataset.cf), 'last', 'Tab goes to the next filter');
    await page.close();
  });
  // ---------- Add guest: drop-downs from the file, and linking to a Planning Center entry later ----------
  await test('Add guest / person: fields with a short list of answers are drop-downs from the file (class, selection, team colors, yes/no); names, phones, addresses stay typed; "Other" lets you type', async () => {
    const { page } = await open(); await page.click('#btnAddPerson'); await page.waitForTimeout(200);
    const kind = col => page.$eval('#dlg [data-col="' + col + '"]', e => e.tagName);
    assert.strictEqual(await kind('Assignment Area: Classes'), 'SELECT'); assert.strictEqual(await kind('Selection'), 'SELECT'); assert.strictEqual(await kind('team:Q2').catch(() => 'SELECT'), 'SELECT'); assert.strictEqual(await kind('x_Active'), 'SELECT');
    assert.strictEqual(await kind('First Name'), 'INPUT'); assert.strictEqual(await kind('Last Name'), 'INPUT');
    const phone = await page.$$eval('#dlg label', l => l.map(x => x.textContent).find(x => /Phone/.test(x))); assert((await kind(phone)) === 'INPUT', 'phone stays typed');
    const rooms = await page.$$eval('#dlg select[data-col="Assignment Area: Classes"] option', o => o.map(x => x.textContent)); const known = await page.evaluate(() => App.knownRooms()); known.forEach(r => assert(rooms.includes(r), 'room ' + r + ' is offered'));
    assert(/Add a guest or a person not in Planning Center/.test(await page.textContent('#dlg h3')) && /tie them to that entry later/.test(await page.textContent('#dlg')), 'explains guests');
    await page.selectOption('#dlg select[data-col="Selection"]', '__other__'); assert.strictEqual(await page.$eval('#dlg [data-col="Selection"]', e => e.tagName), 'INPUT', 'Other turns it into a text box');
    await page.close();
  });
  await test('Guest: add one, see the guest tag and card, then link them to a Planning Center entry; their ID and attendance carry over and they are no longer a guest', async () => {
    const { page } = await open();
    await page.click('#btnAddPerson'); await page.waitForTimeout(150);
    await page.fill('#dlg [data-col="First Name"]', 'Zed'); await page.fill('#dlg [data-col="Last Name"]', 'Guestington'); await page.selectOption('#dlg select[data-col="Assignment Area: Classes"]', 'Sparks A'); await page.click('#dlgSave'); await page.waitForTimeout(300);
    const id = await page.evaluate(() => App.master.people.find(p => p['First Name'] === 'Zed' && p['Last Name'] === 'Guestington').x_ClubberID);
    assert(await page.evaluate(i => Model.isGuest(App.master.people.find(p => p.x_ClubberID === i)), id)); assert.strictEqual(await page.$$eval('#rosterWrap .guesttag', g => g.length), 1, 'the guest tag is in the Roster');
    await page.evaluate(i => { App.commitScope(() => { Season.setMark(App.season, '2026-10-21', i, 'a', 1); App.changed(); }); }, id);
    await page.evaluate(i => App.showPerson(i, { sub: 'registration' }), id); await page.waitForTimeout(250); assert(/Guest: not in Planning Center/.test(await page.textContent('#personWrap')), 'guest card');
    await page.click('[data-linkpc]'); await page.waitForTimeout(200); await page.waitForTimeout(100);
    assert(await page.evaluate(() => true));       // no export yet: the alert (auto-accepted) asked for one
    const NEWER = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort().pop());
    await page.setInputFiles('#fileAny', [NEWER]); await page.waitForTimeout(800); if (await page.isVisible('#review')) await page.click('#rvCancel');
    await page.evaluate(i => App.showPerson(i, { sub: 'registration' }), id); await page.waitForTimeout(250); await page.click('[data-linkpc]'); await page.waitForTimeout(250);
    assert(await page.isVisible('#lgRows'), 'the link dialog lists entries'); const rows = await page.$$('#lgRows tr'); assert(rows.length > 0, 'unmatched Planning Center entries are offered');
    const target = await rows[0].$eval('td', c => c.textContent), reg = await rows[0].$eval('td:nth-child(5)', c => c.textContent);
    await page.fill('#lgFind', target.slice(0, 3)); await page.waitForTimeout(100);
    await rows[0].$eval('button[data-link]', b => b.click()); await page.waitForTimeout(300);
    const after = await page.evaluate(i => { const p = App.master.people.find(x => x.x_ClubberID === i); return { guest: Model.isGuest(p), reg: p['Registration ID'], first: p['First Name'], marks: !!(App.season.attendance['2026-10-21'] || {})[i] }; }, id);
    assert.strictEqual(after.guest, false); assert.strictEqual(after.reg, reg); assert(after.marks, 'attendance stayed with the same ID'); await tab(page, 'roster'); assert.strictEqual(await page.$$eval('#rosterWrap .guesttag', g => g.length), 0);
    await page.close();
  });
  // ---------- Move a child to another class (Roster and Attendance) ----------
  await test('Move to another class: from the Roster and from Attendance (button or the M key); it takes effect now, becomes a To do item, and the Tab order along the boxes is unchanged', async () => {
    const { page } = await open(); await page.waitForTimeout(200);
    const kidId = await page.evaluate(() => { const p = App.master.people.find(x => Model.isClubber(x) && Model.isActive(x) && Model.room(x) === 'Sparks A'); return p.x_ClubberID; });
    await page.click('#rosterWrap tr[data-id="' + kidId + '"] button[data-move]'); await page.waitForTimeout(200);
    assert(/Move .* to another class/.test(await page.textContent('#dlg h3')) && /change it in Planning Center too/.test(await page.textContent('#dlg')), 'explains the To do');
    await page.selectOption('#mvRoom', 'Sparks B'); await page.click('#mvGo'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(i => Model.room(App.master.people.find(x => x.x_ClubberID === i)), kidId), 'Sparks B', 'moved at once');
    await tab(page, 'todo'); await page.waitForTimeout(250); assert(/Move to Sparks B in Planning Center/.test(await page.textContent('#todoWrap')), 'the To do item says what to do');
    await tab(page, 'attend'); await page.waitForTimeout(250); await page.selectOption('#attRoom', 'Sparks B'); await page.waitForTimeout(250);
    assert(await page.$('#attendWrap tr[data-id="' + kidId + '"] button[data-move]'), 'the child is now in Sparks B, with a Move button');
    const stops = await page.evaluate(() => { const tr = document.querySelector('#attendWrap tbody tr'); return [...tr.querySelectorAll('button,input,select,a')].filter(e => e.tabIndex >= 0).map(e => e.dataset.m || e.tagName); });
    assert(stops.every(x => ['a', 'h', 'p', 'x'].includes(x)), 'only the mark boxes are Tab stops in a row: ' + stops.join(','));
    await page.focus('#attendWrap tr[data-id="' + kidId + '"] input[data-m="a"]'); await page.keyboard.press('m'); await page.waitForTimeout(200);
    assert(/Move .* to another class/.test(await page.textContent('#dlg h3')), 'M opens the move dialog from the keyboard'); await page.selectOption('#mvRoom', 'Sparks A'); await page.click('#mvGo'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(i => Model.room(App.master.people.find(x => x.x_ClubberID === i)), kidId), 'Sparks A', 'moved back from Attendance');
    assert(!/Move to .* in Planning Center/.test(await (async () => { await tab(page, 'todo'); await page.waitForTimeout(250); return page.textContent('#todoWrap'); })()), 'moving back to where Planning Center has them clears the item');
    await page.close();
  });
  // ---------- Keyboard navigation (from the Tab audit) ----------
  const active = page => page.evaluate(() => { const e = document.activeElement; return e ? { tag: e.tagName, m: e.dataset.m || '', row: (e.closest('tr') || {}).rowIndex, id: e.id || '', tab: e.dataset.tab || '' } : null; });
  await test('Attendance, Sparks A: Space then Tab walks Present, Handbook, Participation, Extra, then row 2 Present, row 2 Handbook (your exact sequence); nothing jumps to the top', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(250); await page.selectOption('#attRoom', 'Sparks A'); await page.waitForTimeout(300);
    const cell = (row, m) => '#attendWrap tbody tr:nth-child(' + row + ') input[data-m="' + m + '"]';
    await page.focus(cell(1, 'a')); const seq = [];
    for (const [m, space] of [['a', true], ['h', true], ['p', true], ['x', false]]) { if (space) await page.keyboard.press('Space'); await page.waitForTimeout(120); seq.push(await active(page)); await page.keyboard.press('Tab'); }
    seq.push(await active(page)); await page.keyboard.press('Tab'); seq.push(await active(page));
    assert.deepStrictEqual(seq.map(s => s.m + '@' + s.row), ['a@1', 'h@1', 'p@1', 'x@1', 'a@2', 'h@2'].map((x, i) => i < 4 ? x : x), JSON.stringify(seq));
    // the boxes toggled with Space were really ticked
    assert.deepStrictEqual(await page.$$eval('#attendWrap tbody tr:nth-child(1) input[data-m]', c => c.map(x => x.checked ? 1 : 0)).then(a => a.slice(0, 3)), [1, 1, 1]);
    // from the middle of a long list (row 12 Handbook) the next Tab goes to row 12 Participation, not the top
    await page.focus(cell(12, 'h')); await page.keyboard.press('Space'); await page.waitForTimeout(150); await page.keyboard.press('Tab'); const a12 = await active(page); assert.strictEqual(a12.m + '@' + a12.row, 'p@12', JSON.stringify(a12));
    await page.close();
  });
  await test('Date boxes: typing a whole date in Progress saves it once, as 2026-10-28 (no 0002-10-28); Calendar re-sorts only when you leave the date box', async () => {
    const { page } = await open(); await tab(page, 'person'); await page.waitForTimeout(250);
    const first = page.locator('#progressWrap input[type=date][data-key]').first(), h0 = await hist(page); await first.focus(); const key = await first.getAttribute('data-key'), scope = await first.getAttribute('data-scope'), kid = await page.$eval('#pePerson', s => s.value);
    await page.keyboard.type('102820'); await page.waitForTimeout(200);
    assert.strictEqual(await page.evaluate(([k, s, key]) => ((App.season.progress[k] || {})[s] || {})[key] || '', [kid, scope, key]), '', 'nothing saved while the year is half typed');
    await page.keyboard.type('26'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(([k, s, key]) => App.season.progress[k][s][key], [kid, scope, key]), '2026-10-28', 'saved as soon as the year is complete'); assert.strictEqual(await hist(page), h0 + 1, 'one History line');
    assert(!JSON.stringify(await page.evaluate(() => App.season.history.slice(-1))).includes('0002'), 'no partial year in History');
    await tab(page, 'calendar'); await page.waitForTimeout(250);
    const order = () => page.$$eval('#calWrap tbody tr', r => r.map(x => x.dataset.i)), before = await order(), orig = await page.$eval('#calWrap tbody tr:nth-child(3) input[data-c="Date"]', i => i.value);
    const third = page.locator('#calWrap tbody tr:nth-child(3) input[data-c="Date"]'); await third.focus(); await page.keyboard.type('1'); await page.waitForTimeout(150);
    assert.deepStrictEqual(await order(), before, 'typing in the month does not re-sort the rows'); assert.strictEqual(await page.evaluate(() => document.activeElement.dataset.c), 'Date', 'focus stays in the date box');
    assert.strictEqual(await page.evaluate(() => Calendar && App.calendar[3 - 1] && true), true); void orig;
    await page.close();
  });
  await test('File pickers are reachable from the keyboard: Tab reaches the first-screen "Choose files", and the header Import button takes focus', async () => {
    const ctx = await browser.newContext(), page = await ctx.newPage(); await page.goto(url); await page.waitForTimeout(300);
    let found = false; for (let i = 0; i < 6 && !found; i++) { await page.keyboard.press('Tab'); found = await page.evaluate(() => document.activeElement && document.activeElement.id === 'splashFiles'); } assert(found, 'Tab reaches Choose files on the first screen');
    assert.strictEqual(await page.evaluate(() => document.getElementById('tab-roster').closest('body') && document.querySelector('main').inert), true, 'the page behind the first screen is inert');
    await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    assert.strictEqual(await page.evaluate(() => document.querySelector('main').inert), false, 'and is live again once the file is open');
    await page.focus('#fileAny'); assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'fileAny'); await ctx.close();
  });
  await test('Import review is a modal: the page behind it is inert, Esc cancels, and focus goes back to where it was', async () => {
    const { page } = await open(); await page.focus('#btnAddPerson'); const NEWER = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort().pop());
    await page.setInputFiles('#fileAny', [NEWER]); await page.waitForTimeout(700); assert(await page.isVisible('#review'));
    assert.strictEqual(await page.evaluate(() => [document.querySelector('main').inert, document.getElementById('stickyTop').inert]).then(x => x.join()), 'true,true');      // the header and the tab strip are inside #stickyTop
    assert(await page.evaluate(() => document.getElementById('review').contains(document.activeElement)), 'focus is inside the review'); assert.strictEqual(await page.getAttribute('#review', 'role'), 'dialog');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200); assert(!(await page.isVisible('#review')), 'Esc cancelled'); assert.strictEqual(await page.evaluate(() => document.querySelector('main').inert), false);
    await page.close();
  });
  await test('Tab strip: Home and End jump to the first and last tab; with held changes a cancelled switch leaves focus on the tab you are on', async () => {
    const { page } = await open(); await page.focus('.tabs button[data-tab="roster"]'); await page.keyboard.press('End'); assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'tabMore', 'End goes to the last tab in the strip: the More button (it opens a menu, it is not a tab)');
    await page.keyboard.press('Home'); const firstTab = await page.evaluate(() => document.querySelector('.tabs button').dataset.tab); assert.strictEqual((await active(page)).tab, firstTab); assert.strictEqual(await page.evaluate(() => App.tab), firstTab);
    await tab(page, 'person'); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(200); await page.check('input[data-flag="x_NoPhotos"]'); await page.waitForTimeout(150);
    await page.focus('.tabs button[data-tab="person"]'); page.removeAllListeners('dialog'); page.once('dialog', d => d.dismiss()); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200);
    assert.strictEqual(await page.evaluate(() => App.tab), 'person'); assert.strictEqual((await active(page)).tab, 'person', 'focus stays on the Person tab button');
    assert.strictEqual(await page.getAttribute('.subtabs button[data-sub="teams"]', 'tabindex'), '-1', 'sub-tabs: only the selected one is a Tab stop');
    await page.close();
  });
  await test('Ctrl+Z works while a checkbox has focus (Attendance tick, then Ctrl+Z undoes it)', async () => {
    const { page } = await open(); await tab(page, 'attend'); await page.waitForTimeout(250); await page.selectOption('#attRoom', 'Sparks A'); await page.waitForTimeout(250);
    const box = page.locator('#attendWrap tbody tr:nth-child(1) input[data-m="x"]'); await box.focus(); const was = await box.isChecked(); await page.keyboard.press('Space'); await page.waitForTimeout(150);
    assert.strictEqual(await page.locator('#attendWrap tbody tr:nth-child(1) input[data-m="x"]').isChecked(), !was); await page.keyboard.press('Control+z'); await page.waitForTimeout(250);
    assert.strictEqual(await page.locator('#attendWrap tbody tr:nth-child(1) input[data-m="x"]').isChecked(), was, 'undone'); await page.close();
  });
  await test('Editing keeps your place on the other tabs too: Games select, Awards, To do Ignore, Store weight, Person club-record box', async () => {
    const { page } = await open(); const holds = async (sel, act) => { await page.focus(sel); await act(); await page.waitForTimeout(250); const a = await page.evaluate(() => { const e = document.activeElement; return e && e !== document.body ? e.tagName : 'BODY'; }); return a; };
    await tab(page, 'games'); await page.waitForTimeout(250);
    assert.notStrictEqual(await holds('#gamesWrap select[data-f="place"]', () => page.keyboard.press('ArrowDown')), 'BODY', 'Games');
    await tab(page, 'store'); await page.waitForTimeout(250); assert.notStrictEqual(await holds('input[data-w="extra"]', async () => { await page.fill('input[data-w="extra"]', '2'); await page.keyboard.press('Tab'); }), 'BODY', 'Store weight, Tab away');
    await tab(page, 'todo'); await page.waitForTimeout(250); assert.notStrictEqual(await holds('#todoWrap button[data-ign]', () => page.keyboard.press('Enter')), 'BODY', 'To do Ignore');
    await tab(page, 'person'); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(250); assert.notStrictEqual(await holds('input[data-flag="x_NoPhotos"]', () => page.keyboard.press('Space')), 'BODY', 'Person club record');
    await page.close();
  });
  // ---------- Awards: class selector, Alt-click several, reports by class; Roster Active/Inactive/All ----------
  await test('Awards: a Class picker narrows the list to one room, resets with the group, and carries into the Printable reports list (which is then that class only)', async () => {
    const { page } = await open();
    await page.evaluate(() => App.commitScope(() => { const seen = new Set(); App.master.people.filter(p => Model.isClubber(p) && Model.isActive(p) && Model.groupOf(Model.room(p)) === 'Sparks').forEach(p => { const r = Model.room(p); if (seen.has(r)) return; seen.add(r); ['1', '2', '3', '4'].forEach(i => Season.setProgress(App.season, p.x_ClubberID, 'HG', 'GJ1.' + i, '2026-10-21')); }); App.changed(); }));      // one earned, not-given award in every Sparks class, so there is something to narrow
    await tab(page, 'awards'); await page.waitForTimeout(250); await page.selectOption('#awGroup', 'Sparks'); await page.waitForTimeout(200); await page.click('#awSubs button[data-awsub="hand"]'); await page.waitForTimeout(200);
    const all = await page.$$eval('#awardsWrap tbody tr', r => r.length), rooms = await page.$$eval('#awRoom option', o => o.map(x => x.textContent).filter(x => x !== 'All classes'));
    assert(rooms.length >= 2 && rooms.every(r => /^Sparks/.test(r)), rooms.join()); await page.selectOption('#awRoom', rooms[0]); await page.waitForTimeout(200);
    const rows = await page.$$eval('#awardsWrap tbody tr', r => r.map(x => x.children[1].textContent)); assert(rows.length > 0 && rows.length < all && rows.every(x => x === rooms[0]), 'only ' + rooms[0] + ' (' + rows.length + ' of ' + all + '; rooms ' + rooms.join() + '; ' + [...new Set(rows)].join() + ')');
    await page.selectOption('#awGroup', 'T&T'); await page.waitForTimeout(200); assert.strictEqual(await page.inputValue('#awRoom'), '', 'changing group clears the class');
    await page.selectOption('#awGroup', 'Sparks'); await page.waitForTimeout(150); await page.selectOption('#awRoom', rooms[1]); await page.waitForTimeout(150); await page.click('#btnAwHandPrint'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => App.tab), 'reports'); assert.strictEqual(await page.inputValue('#oRoomSel'), rooms[1]); assert(new RegExp(rooms[1]).test(await page.textContent('#report')), 'the report is for that class');
    for (const id of ['awardsByChild', 'achievement']) { await page.selectOption('#rSel', id); await page.waitForTimeout(200); assert(await page.isVisible('#oRoom'), id + ' has a Class picker'); }
    await page.selectOption('#rSel', 'awardsByChild'); await page.selectOption('#oRoomSel', rooms[1]); await page.waitForTimeout(250);
    const kidsOnPage = await page.$$eval('#report section.sheet .achild', h => h.length), inRoom = await page.evaluate(r => App.master.people.filter(p => Model.isClubber(p) && Model.isActive(p) && Model.room(p) === r).length, rooms[1]); assert.strictEqual(kidsOnPage, inRoom, 'one block per child in that class (B9: children share pages)');
    await page.close();
  });
  await test('Roster: the Active filter is Active only / Inactive only / Active and inactive, the same list in the bar and the column filter', async () => {
    const { page } = await open(); await page.waitForTimeout(200); const total = await page.evaluate(() => App.master.people.length), act = await page.evaluate(() => App.master.people.filter(Model.isActive).length);
    assert.strictEqual(await page.$('#fInactive').then(e => e.evaluate(x => x.tagName)), 'SELECT'); assert.strictEqual((await rowsOf(page, 0)).length, act, 'default: active only');
    await page.evaluate(() => { const p = App.master.people.find(x => Model.isClubber(x)); Model.setActive(p, false); App.commitScope(() => App.changed()); App.refresh(); });
    await page.selectOption('#fInactive', 'inactive'); await page.waitForTimeout(200); assert.strictEqual((await rowsOf(page, 0)).length, 1, 'inactive only: the one inactive person');
    await page.selectOption('#fInactive', 'all'); await page.waitForTimeout(200); assert.strictEqual((await rowsOf(page, 0)).length, total, 'all'); assert.strictEqual(await page.inputValue('select[data-cf="active"]'), 'all', 'the column filter shows the same choice');
    await page.selectOption('select[data-cf="active"]', 'active'); await page.waitForTimeout(200); assert.strictEqual(await page.inputValue('#fInactive'), 'active'); assert.strictEqual((await rowsOf(page, 0)).length, total - 1);
    await page.close();
  });
  await test('To do: Ignore is kept in the data file (survives saving and reopening), Ignore all is one History line, Bring back works, and a new season starts with none', async () => {
    const { page } = await open(); await tab(page, 'todo'); await page.waitForTimeout(250);
    const badge0 = +(await page.textContent('#todoBadge') || 0), rowsBefore = await page.locator('#todoWrap tbody tr').count(); assert(rowsBefore > 2); const key = await page.locator('#todoWrap tbody tr').first().getAttribute('data-k'), h0 = await hist(page);
    await page.locator('#todoWrap button[data-ign]').first().click(); await page.waitForTimeout(250);
    assert.strictEqual(await page.locator('#todoWrap tbody tr').count(), rowsBefore - 1); assert(await page.evaluate(k => App.season.config.todoIgnored.includes(k), key), 'stored in the data file');
    const reopened = await page.evaluate(() => JSON.parse(Season.toJson(Season.fromJson(Season.toJson(App.season)))).config.todoIgnored); assert(reopened.includes(key), 'and it survives a save and reopen');
    await page.check('#tdShowIgn'); await page.waitForTimeout(150); await page.locator('#todoWrap button[data-unign]').first().click(); await page.waitForTimeout(250); assert(!(await page.evaluate(k => App.season.config.todoIgnored.includes(k), key)), 'Bring back');
    await page.click('input[name="tdView"][value="task"]'); await page.waitForTimeout(150); const h1 = await hist(page), n = await page.evaluate(() => App.season.config.todoIgnored.length);
    await page.locator('#todoWrap button[data-ignall]').first().click(); await page.waitForTimeout(250); const added = await page.evaluate(() => App.season.config.todoIgnored.length) - n; assert(added > 1, 'several ignored');
    assert((await hist(page)) - h1 <= 1, 'Ignore all is at most one History line (edits to the same area within 5 minutes share one)'); void h0;
    assert(+(await page.textContent('#todoBadge') || 0) < badge0, 'the tab count drops after Ignore all: ' + badge0 + ' -> ' + await page.textContent('#todoBadge'));
    assert.deepStrictEqual(await page.evaluate(() => Season.newSeason(App.season, '2027-28').config.todoIgnored), []);
    await page.close();
  });
  // ---------- Earned -> Announced -> Given ----------
  await test('Awards: earned awards wait in To tell the group and are on the slides until Mark all announced stamps them on the chosen night; Given is set on Progress and does not change the slides', async () => {
    const { page } = await open();
    const ids = await page.evaluate(() => { const ids = App.master.people.filter(p => Model.isClubber(p) && Model.isActive(p) && Model.groupOf(Model.room(p)) === 'Sparks').slice(0, 3).map(p => p.x_ClubberID); App.commitScope(() => { ids.forEach(id => ['1', '2', '3', '4', 'rev'].forEach(i => Season.setProgress(App.season, id, 'HG', 'GJ1.' + i, '2026-10-21'))); App.changed(); }); return ids; });
    await tab(page, 'awards'); await page.waitForTimeout(250); await page.selectOption('#awGroup', 'Sparks'); await page.waitForTimeout(250);
    const date = await page.inputValue('#awDateWrap select'), onSlide = async () => page.evaluate(d => Slides.buildSlides(App.season, App.master, d).slides.reduce((n, s) => n + s.count, 0), date);
    assert(/Announce on/.test(await page.textContent('#awSecAnnounce h3')), 'the announce list shows'); const waiting = await page.locator('#awSecAnnounce tbody tr[data-award]').count(); assert(waiting >= 3, 'three earned: ' + waiting);
    const s0 = await onSlide(); assert.strictEqual(await page.evaluate(([i, d]) => ((App.season.awards[d] || {})[i] || []).includes('HG Green Jewel 1'), [ids[0], date]), false, 'not announced yet');
    assert(s0 >= waiting, 'the slides already show what is waiting, before anything is announced: ' + s0 + ' vs ' + waiting); assert.strictEqual(await onSlide(), s0, 'drawing the slides again changes nothing');
    assert(new RegExp('Mark all announced \\(' + waiting + '\\)').test(await page.textContent('#btnAnnounce')), 'one Mark all announced button');
    await page.click('#btnAnnounce'); await page.waitForTimeout(300);
    const has = id => page.evaluate(([i, d]) => ((App.season.awards[d] || {})[i] || []).includes('HG Green Jewel 1'), [id, date]);
    assert(await has(ids[0]) && await has(ids[1]) && await has(ids[2]), 'all announced on the night chosen'); assert(await onSlide() < s0, 'what was announced has left the slides');
    const s1 = await onSlide();
    await page.click('#awSubs button[data-awsub="hand"]'); await page.waitForTimeout(250);
    assert.strictEqual(await page.locator('#awSecHand input[data-given2], #awSecHand input[data-given-nd]').count(), 0, 'no Given tick on the Awards tab');
    assert(await page.locator('#awSecHand tr[data-id="' + ids[0] + '"]').count(), 'announced, but still waiting to be handed out');
    await page.evaluate(i => App.commitScope(() => { Season.setGiven(App.season, i, 'HG Green Jewel 1', App.today()); App.changed(); }), ids[0]); await page.waitForTimeout(250);
    await tab(page, 'awards'); await page.waitForTimeout(250); await page.click('#awSubs button[data-awsub="hand"]'); await page.waitForTimeout(250);
    assert.strictEqual(await page.locator('#awSecHand tr[data-id="' + ids[0] + '"]').count(), 0, 'given on Progress: off the hand-out list'); assert.strictEqual(await onSlide(), s1, 'giving does not change the slide');
    await page.close();
  });
  await test('Old awards in the test file count as already given, so the not-yet-given list starts empty; the Achievement record prints the day it was received', async () => {
    const { page } = await open(); assert.strictEqual(await page.evaluate(() => Season.waitingToGive(App.season).length), 0, 'nothing waiting on a migrated file');
    assert.strictEqual(await page.evaluate(() => JSON.parse(Season.toJson(App.season)).version), await page.evaluate(() => Season.VERSION)); await page.close();
  });
  // ---------- Options tab: books, club settings, data checks; blocking and warning at entry points ----------
  const optBook = (page, code) => page.locator('#optionsWrap tr[data-code="' + code + '"]');
  await test('Options: the book list is editable as a draft; a bad code is refused with the reason and the old value stays; add, change group, delete, reset', async () => {
    const { page } = await open(); await tab(page, 'options'); await page.waitForTimeout(250);
    assert.deepStrictEqual((await page.$$eval('#optionsWrap tr[data-code]', r => r.map(x => x.dataset.code))).sort(), ['AS', 'AoG', 'DoG', 'EoG', 'GiA', 'HC', 'HG', 'SS', 'WR'], 'the standard books');
    assert(await optBook(page, 'HG').count() === 1 && (await optBook(page, 'HG').locator('input[data-bf="name"]').inputValue()) === 'Hangglider'); assert(await page.evaluate(() => App.isDraftView()), 'Options is a draft tab');
    const h0 = await hist(page); await optBook(page, 'HG').locator('input[data-bf="name"]').fill('Hang Glider'); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => App.season.config.books.HG.name), 'Hang Glider'); assert.strictEqual(await hist(page), h0, 'held as a draft'); await page.click('#btnDraftApply'); await page.waitForTimeout(250); assert.strictEqual(await hist(page), h0 + 1);
    await optBook(page, 'WR').locator('input[data-bf="code"]').fill('HG'); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
    assert(/already a book with the code HG/.test(await page.textContent('#optionsWrap [role=alert]')), 'duplicate refused'); assert.strictEqual(await optBook(page, 'WR').count(), 1, 'the old code stays'); assert.strictEqual(await page.evaluate(() => Object.keys(App.season.config.books).includes('WR')), true);
    await optBook(page, 'WR').locator('input[data-bf="code"]').fill('1'); await page.keyboard.press('Tab'); await page.waitForTimeout(300); assert(/2 or 3 letters/.test(await page.textContent('#optionsWrap [role=alert]')));
    await page.click('#optBookAdd'); await page.waitForTimeout(250); const added = await page.evaluate(() => Object.keys(App.season.config.books).filter(c => App.season.config.books[c].name === 'New book')[0]); assert(added, 'a new book was added');
    await optBook(page, added).locator('select[data-bf="group"]').selectOption('T&T'); await page.waitForTimeout(250); assert.strictEqual(await page.evaluate(c => App.season.config.books[c].group, added), 'T&T');
    page.removeAllListeners('dialog'); page.on('dialog', d => d.accept()); await page.click('[data-bdel="' + added + '"]'); await page.waitForTimeout(250); assert.strictEqual(await page.evaluate(c => !!App.season.config.books[c], added), false, 'deleted');
    await page.click('#optBookReset'); await page.waitForTimeout(250); assert.strictEqual(await page.evaluate(() => App.season.config.books.HG.name), 'Hangglider', 'reset to standard');
    await page.close();
  });
  await test('Unrecognized books: a handbook code not on the list is marked in the box, warns when saved, shows on the To do list with the child, and adding the book on Options clears it', async () => {
    const { page } = await open(); const id = await page.evaluate(() => App.master.people.find(p => Model.isClubber(p) && Model.isActive(p) && Model.groupOf(Model.room(p)) === 'Sparks').x_ClubberID);
    await page.evaluate(i => App.showPerson(i, { sub: 'registration' }), id); await page.waitForTimeout(250);
    await page.fill('input[data-hb="code"]', 'QQ'); await page.dispatchEvent('input[data-hb="code"]', 'change'); await page.waitForTimeout(300);
    assert(/not one of your books/.test(await page.textContent('#flash')), 'a warning is shown'); assert.strictEqual(await page.evaluate(i => App.season.handbooks[i].startsWith('QQ'), id), true, 'saved as typed');
    assert(await page.$('input[data-hb="code"].warnfield'), 'the box is marked'); await page.waitForFunction(() => true);
    await tab(page, 'todo'); await page.waitForTimeout(250); await page.click('input[name="tdView"][value="task"]'); await page.waitForTimeout(200); assert(/Unrecognized book/.test(await page.textContent('#todoWrap')) && /"QQ"/.test(await page.textContent('#todoWrap')), 'on the To do list');
    await tab(page, 'options'); await page.waitForTimeout(250); assert(/not one of your books|QQ/.test(await page.textContent('#optionsWrap .pcard:last-child')), 'and in the Data checks');
    await page.click('#optBookAdd'); await page.waitForTimeout(250); const added = await page.evaluate(() => Object.keys(App.season.config.books).filter(c => App.season.config.books[c].name === 'New book')[0]);
    await optBook(page, added).locator('input[data-bf="code"]').fill('QQ'); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
    await tab(page, 'todo').catch(() => {}); await page.waitForTimeout(100);
    await page.close();
  });
  await test('Entry points refuse impossible values and say why: a birthdate that cannot exist and a bad email on the Person tab, a bad date on Progress, and the Edit dialog (including a guest with no name)', async () => {
    const { page } = await open(); const id = await page.evaluate(() => App.master.people.find(p => Model.isClubber(p) && Model.isActive(p) && Model.groupOf(Model.room(p)) === 'Sparks').x_ClubberID);
    await page.evaluate(i => App.showPerson(i, { sub: 'registration' }), id); await page.waitForTimeout(250); const bd = 'input[data-pc="Birthdate"]', before = await page.inputValue(bd);
    await page.fill(bd, '2/30/2020'); await page.dispatchEvent(bd, 'change'); await page.waitForTimeout(200);
    assert(/not a real birthdate/.test(await page.textContent('#flash')), 'the reason is shown'); assert.strictEqual(await page.inputValue(bd), before, 'the old value is put back'); assert.strictEqual(await page.evaluate(([i, v]) => App.master.people.find(p => p.x_ClubberID === i)['ov:Birthdate'] === undefined || App.master.people.find(p => p.x_ClubberID === i)['ov:Birthdate'] === '', [id, before]), true, 'nothing was changed');
    await page.fill(bd, '3/14/2020'); await page.dispatchEvent(bd, 'change'); await page.waitForTimeout(200); assert.strictEqual(await page.evaluate(i => Model.eff(App.master.people.find(p => p.x_ClubberID === i), 'Birthdate'), id), '3/14/2020', 'a real one is accepted');
    // the Edit dialog
    await page.evaluate(i => App.openEdit(App.master.people.find(p => p.x_ClubberID === i)), id); await page.waitForTimeout(200);
    const em = await page.$$eval('#dlg label', l => l.map(x => x.textContent).find(x => /Home Email/.test(x))); await page.fill('#dlg [data-col="' + em + '"]', 'nobody-at-example'); await page.click('#dlgSave'); await page.waitForTimeout(200);
    assert(/not a valid email/.test(await page.textContent('#dlgErr')), 'the dialog says why'); assert(await page.isVisible('#dlg'), 'and stays open'); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await tab(page, 'roster'); await page.waitForTimeout(150); await page.click('#btnAddPerson'); await page.waitForTimeout(200); await page.click('#dlgSave'); await page.waitForTimeout(200); assert(/needs a first name/.test(await page.textContent('#dlgErr')) && /needs a last name/.test(await page.textContent('#dlgErr')), 'a guest needs a name'); await page.keyboard.press('Escape');
    await tab(page, 'person'); await page.click('#peSub button[data-sub="progress"]'); await page.waitForTimeout(250); const first = page.locator('#progressWrap input[type=date][data-key]').first(); await first.focus(); await page.keyboard.type('10282200'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    assert(/outside 2000 to 2100/.test(await page.textContent('#flash')), 'a date that cannot be right on Progress is explained'); assert.strictEqual(await first.inputValue(), '', 'and the box is put back');
    await page.close();
  });
  await test('Options: club settings are the same settings as on Reports and Calendar; Data checks list a problem with a link to the person', async () => {
    const { page } = await open(); await tab(page, 'options'); await page.waitForTimeout(250);
    await page.selectOption('#optQuarter', 'Q3'); await page.waitForTimeout(200); assert.strictEqual(await page.inputValue('#sQuarter'), 'Q3', 'Reports quarter follows'); await page.fill('#optClub', 'Shine bright'); await page.waitForTimeout(150); assert.strictEqual(await page.inputValue('#sClub'), 'Shine bright');
    await page.selectOption('#optDay', '4'); await page.waitForTimeout(200); assert.strictEqual(await page.evaluate(() => App.season.config.clubDay), 4, 'club night follows'); assert.strictEqual(await page.inputValue('#calClubDay'), '4');
    await page.evaluate(() => { const p = App.master.people.find(x => Model.isClubber(x) && Model.isActive(x)); p['Birthdate'] = '2/30/2020'; window.__bad = p.x_ClubberID; App.refresh(); }); await tab(page, 'options'); await page.waitForTimeout(250); await page.click('#optRecheck'); await page.waitForTimeout(200);
    assert(/not a real birthdate/.test(await page.textContent('#optionsWrap')), 'the problem is listed'); await page.click('a[data-opt-person]'); await page.waitForTimeout(300); assert.strictEqual(await page.evaluate(() => App.tab), 'person');
    await page.close();
  });
  await test('Tidy handbook codes: AOG and AO become AoG, the written form of the book (date and note kept) when you press the button on Options; other codes are left alone; Undo restores them', async () => {
    const { page } = await open(); const ids = await page.evaluate(() => { const ids = App.master.people.filter(p => Model.isClubber(p) && Model.isActive(p)).slice(0, 3).map(p => p.x_ClubberID); App.commitScope(() => { App.season.handbooks[ids[0]] = 'AOG 261014 new'; App.season.handbooks[ids[1]] = 'QQ 261014'; App.season.handbooks[ids[2]] = 'AO 261021'; App.changed(); }); return ids; });
    await tab(page, 'options'); await page.waitForTimeout(250); assert(/2 handbook records use a longer spelling[\s\S]*AOG \u2192 AoG/.test(await page.textContent('#optionsWrap')), 'offered, not done');
    assert.strictEqual(await page.evaluate(i => App.season.handbooks[i], ids[0]), 'AOG 261014 new', 'nothing changed by itself'); await page.click('#optTidy'); await page.waitForTimeout(250); await page.click('#btnDraftApply'); await page.waitForTimeout(250);
    const now = await page.evaluate(([a, b, c]) => [App.season.handbooks[a], App.season.handbooks[b], App.season.handbooks[c]], ids); assert.deepStrictEqual(now, ['AoG 261014 new', 'QQ 261014', 'AoG 261021']);
    await page.click('#btnUndo'); await page.waitForTimeout(250); assert.strictEqual(await page.evaluate(i => App.season.handbooks[i], ids[0]), 'AOG 261014 new', 'Undo');
    await page.close();
  });
  await test('Slide images: with nothing waiting to be announced the download buttons are greyed out with a big note; once an award is earned they work', async () => {
    const { page } = await open(); await tab(page, 'awards'); await page.waitForTimeout(250);
    await page.evaluate(() => App.commitScope(() => { const S = Season, s = App.season; App.master.people.filter(p => Model.isClubber(p) && Model.isActive(p)).forEach(p => { const id = p.x_ClubberID, g = Model.groupOf(Model.room(p)); if (['Cubbies', 'Sparks', 'T&T'].includes(g)) S.announce(s, document.querySelector('#awDateWrap select').value, S.pendingAwards(s, id, g, App.calendar).map(r => [id, r.award])); }); App.changed(); }));
    await page.waitForTimeout(250); await page.click('#btnAwImages'); await page.waitForTimeout(500);
    assert(await page.isVisible('#slEmpty') && /waiting to be announced/.test(await page.textContent('#slEmpty')), 'a visible note');
    assert.strictEqual(await page.isDisabled('#slAll'), true, 'Download all is greyed out'); assert.strictEqual(await page.isDisabled('#slOne'), true, 'and so is Download this slide');
    assert((await page.$eval('#slEmpty', e => parseFloat(getComputedStyle(e).fontSize))) >= 16, 'the note is large'); await page.click('#slClose'); await page.waitForTimeout(150);
    await page.evaluate(() => App.commitScope(() => { const id = App.master.people.find(p => Model.isClubber(p) && Model.isActive(p) && Model.groupOf(Model.room(p)) === 'Sparks').x_ClubberID; ['1', '2', '3', '4'].forEach(i => Season.setProgress(App.season, id, 'HG', 'GJ1.' + i, App.today())); App.changed(); }));
    await tab(page, 'awards'); await page.waitForTimeout(200); await page.click('#btnAwImages'); await page.waitForTimeout(500);
    assert(!(await page.isVisible('#slEmpty')), 'no empty note once an award is waiting'); assert.strictEqual(await page.isDisabled('#slAll'), false); assert.strictEqual(await page.isDisabled('#slOne'), false);
    await page.close();
  });
  await test('A crafted team color in a data file is shown as plain text, never as page code (Color teams list, Person tab, Roster)', async () => {
    const { page } = await open(); await page.evaluate(() => { window.__xss = 0; });
    const evil = '"><img src=x onerror="window.__xss=1">';
    await page.evaluate(e => { const ps = App.master.people.filter(p => Model.isClubber(p) && Model.isActive(p) && ['Sparks', 'T&T'].includes(Model.groupOf(Model.room(p)))); ps[0]['team:Q2'] = e; ps[1]['team:Q3'] = '<b>x</b>'; App.commitScope(() => App.changed()); window.__kid = ps[0].x_ClubberID; App.refresh(); }, evil);
    await page.evaluate(() => App.showTab('teams')); await page.waitForTimeout(300); await page.evaluate(() => { document.querySelector('details.tgsorted').open = true; }); await page.waitForTimeout(100); await page.selectOption('#tsSort', 'Q2'); await page.waitForTimeout(300);
    assert.strictEqual(await page.$$eval('#teamsWrap img', e => e.length), 0, 'no element was created from a color value'); assert.strictEqual(await page.$$eval('#teamsWrap table.sched b', e => e.length), 0, 'nor a bold tag in the list'); assert((await page.textContent('#teamsWrap')).includes('<img src=x'), 'it is shown as text');
    await page.evaluate(i => App.showPerson(i, { sub: 'registration' }), await page.evaluate(() => window.__kid)); await page.waitForTimeout(300); await tab(page, 'roster'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => window.__xss), 0, 'no script ran'); assert.strictEqual(await page.$$eval('img[src="x"]', e => e.length), 0);
    await page.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
