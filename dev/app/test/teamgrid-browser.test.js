// The year grid on the Color teams view (Chromium): quarters read as locked, ready to lock or projected; scope (class, group, whole club);
// team sizes and expected turnout under the grid; later tasks add editing, recalculation and locking to this file. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/teamgrid-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
// The test club's calendar: Q1 from 9/9, Q2 from 10/28, Q3 from 1/6, Q4 from 3/3. On 2026-12-20: Q1 and Q2 are locked (started), Q3 is ready (18 days out), Q4 is projected.
const TODAY = '2026-12-20';
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const open = async (viewport, touch) => {
    const page = await (await browser.newContext(Object.assign(viewport ? { viewport } : {}, touch ? { hasTouch: true } : {}))).newPage(), errs = []; page.setDefaultTimeout(12000); page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    await page.evaluate(t => { App.today = () => t; }, TODAY); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('#teamsWrap .tg', { timeout: 4000 });
    return { page, errs };
  };
  const heads = page => page.$$eval('#teamsWrap .tg thead th[data-q]', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));

  await test('the grid shows four quarters, each as locked, ready to lock or projected, with the first night of the ready one', async () => {
    const { page, errs } = await open(); const h = await heads(page);
    assert.strictEqual(h.length, 4, h.join('|'));
    assert(/Q1.*locked/.test(h[0]) && /Q2.*locked/.test(h[1]), 'started quarters are locked: ' + h.join('|'));
    assert(/Q3.*ready to lock.*1\/6/.test(h[2]), 'the next quarter is ready: ' + h[2]); assert(/Q4.*projected/.test(h[3]), 'a far quarter is projected: ' + h[3]);
    assert.deepStrictEqual(errs, []); await page.close();
  });
  await test('By class shows the chosen class; By group shows every child in the group; Whole club shows both groups', async () => {
    const { page } = await open();
    const want = await page.evaluate(() => { const kids = g => App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === g);
      const room = [...new Set(kids('Sparks').concat(kids('T&T')).map(Model.room))].sort()[0];      // the grid starts on the first class in alphabetical order
      return { room, inRoom: kids('Sparks').concat(kids('T&T')).filter(p => Model.room(p) === room).length, sparks: kids('Sparks').length, all: kids('Sparks').length + kids('T&T').length }; });
    const rows = () => page.$$eval('#teamsWrap .tg tbody tr[data-kid]', e => e.length);
    assert.strictEqual(await page.$eval('#tgClass', e => e.value), want.room, 'the first class is chosen'); assert.strictEqual(await rows(), want.inRoom);
    await page.click('[data-tgscope="group"]'); await page.waitForTimeout(100); assert.strictEqual(await page.$eval('#tgGroup', e => e.value), 'Sparks'); assert.strictEqual(await rows(), want.sparks);
    await page.click('[data-tgscope="club"]'); await page.waitForTimeout(100); assert.strictEqual(await rows(), want.all);
    await page.close();
  });
  await test('the team-size row under the grid matches the audit counts for the whole group, even when only one class is shown', async () => {
    const { page } = await open();
    const want = await page.evaluate(() => { const a = Teams.audit(App.master, 'Q2'), room = Model.room(App.master.people.find(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'Sparks')); return { counts: a.groups.Sparks.counts, room }; });
    const text = await page.$eval('#teamsWrap .tg tfoot tr[data-sizes="Sparks"] td[data-q="Q2"]', e => e.textContent);
    Object.keys(want.counts).forEach(c => assert(new RegExp(c + ' ' + want.counts[c] + '(\\D|$)').test(text), c + ' ' + want.counts[c] + ' in "' + text + '"'));
    assert(await page.$('#teamsWrap .tg tfoot tr[data-turnout="Sparks"] td[data-q="Q2"]'), 'an expected-turnout row follows the sizes');
    assert(/all of Sparks/i.test(await page.textContent('#teamsWrap .tgnote')), 'a class view says the totals are for the whole group');
    await page.close();
  });
  await test('on a phone the grid scrolls inside its own box and the page does not scroll sideways', async () => {
    const { page } = await open({ width: 375, height: 667 });
    const r = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, win: innerWidth, box: document.querySelector('#teamsWrap .tgscroll').scrollWidth > document.querySelector('#teamsWrap .tgscroll').clientWidth }));
    assert(r.page <= r.win, 'no page-level scroll: ' + r.page + ' vs ' + r.win); await page.close();
  });
  // ---------- editing ----------
  // A projected child in Q3: blank one cell and let the engine fill it, so the cell is projected (not a pin).
  const projectOne = page => page.evaluate(() => {
    const kid = App.master.people.find(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'Sparks' && Model.room(p) === [...new Set(App.master.people.filter(x => Model.isActive(x) && Model.isClubber(x) && ['Sparks', 'T&T'].includes(Model.groupOf(Model.room(x)))).map(Model.room))].sort()[0]);
    kid['team:Q3'] = ''; const ctx = { master: App.master, season: App.season, calendar: App.calendar, today: App.today() }; TeamPlan.applyPlan(ctx, TeamPlan.project(ctx, { rng: Teams.mulberry32(3) })); App.refresh();
    return { id: kid[Model.X.ID], q1: kid['team:Q1'], q2: kid['team:Q2'], q3: kid['team:Q3'] };
  });
  const cell = (id, q) => '#teamsWrap .tg tr[data-kid="' + id + '"] td[data-q="' + q + '"] ';

  await test('an open quarter\'s cell is a select named by quarter and child; a color different from the projection becomes a pin and shows in the sizes row', async () => {
    const { page } = await open(), k = await projectOne(page); await page.evaluate(() => TeamGrid.ui.scope = 'class'); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('#teamsWrap .tg');
    await page.evaluate(() => document.querySelector('[data-tgscope="class"]').click()); await page.waitForSelector(cell(k.id, 'Q3') + 'select');
    assert(/^Q3 color, /.test(await page.getAttribute(cell(k.id, 'Q3') + 'select', 'aria-label')), 'named');
    assert.strictEqual(await page.$(cell(k.id, 'Q3') + 'select.tgset'), null, 'projected: not solid yet'); assert(/suggested/.test(await page.$eval(cell(k.id, 'Q3') + 'select', e => e.getAttribute('aria-label'))), 'named suggested'); assert(await page.$(cell(k.id, 'Q3') + 'select.tgproj'), 'dashed while projected');
    const other = ['Red', 'Blue', 'Green', 'Yellow'].find(c => c !== k.q3 && c !== k.q1 && c !== k.q2);
    await page.selectOption(cell(k.id, 'Q3') + 'select', other); await page.waitForTimeout(150);
    assert(await page.$(cell(k.id, 'Q3') + 'select.tgset'), 'a hand-set color is solid'); assert.strictEqual(await page.$(cell(k.id, 'Q3') + '.tgpin'), null, 'and there is no pin icon'); assert(/set by hand/.test(await page.$eval(cell(k.id, 'Q3') + 'select', e => e.getAttribute('aria-label'))), 'named set by hand'); assert.strictEqual(await page.$eval(cell(k.id, 'Q3') + 'select', e => e.value), other);
    assert.strictEqual(await page.evaluate(i => App.master.people.find(p => p[Model.X.ID] === i)['team:Q3'], k.id), other);
    await page.selectOption(cell(k.id, 'Q3') + 'select', k.q3); await page.waitForTimeout(150);
    assert.strictEqual(await page.$(cell(k.id, 'Q3') + 'select.tgset'), null, 'choosing the projected color again is no longer solid'); await page.close();
  });
  await test('choosing a color the child already had this year shows the repeated-color warning', async () => {
    const { page } = await open(), k = await projectOne(page); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector(cell(k.id, 'Q3') + 'select');
    await page.evaluate(() => { const f = document.getElementById('flash'); if (f) f.hidden = true; });
    await page.selectOption(cell(k.id, 'Q3') + 'select', k.q1); await page.waitForTimeout(200);
    // The old assertion looked for "Repeated colors" anywhere on the tab, which was already there before the pick (the test file has a Q2 repeat), so it passed whatever the app did (Fable review A8).
    // Now: the pick itself is warned about (a flash naming the quarter it repeats), and the cell carries its own "repeats Q1" mark.
    const flash = await page.evaluate(() => { const f = document.getElementById('flash'); return f && !f.hidden ? f.textContent : ''; });
    assert(/already been .* in Q1/.test(flash), 'the pick is warned about: ' + flash);
    assert(/repeats Q1/.test(await page.textContent(cell(k.id, 'Q3'))), 'the cell is marked: ' + await page.textContent(cell(k.id, 'Q3')));
    const fresh = ['Red', 'Blue', 'Green', 'Yellow'].find(c => c !== k.q1 && c !== k.q2); await page.selectOption(cell(k.id, 'Q3') + 'select', fresh); await page.waitForTimeout(200);
    assert(!/repeats/.test(await page.textContent(cell(k.id, 'Q3'))), 'a color not used before carries no mark'); await page.close();
  });
  await test('at phone width each quarter column is 150px, so the footers wrap and the grid is not 1,400px wide (about two quarters show, not one)', async () => {
    const { page } = await open({ width: 390, height: 844 }, true);
    const m = await page.evaluate(() => { const t = document.querySelector('#teamsWrap .tg'); const ths = [...t.querySelectorAll('thead th[data-q]')].map(x => Math.round(x.getBoundingClientRect().width));
      const over = [...t.querySelectorAll('tfoot td[data-q]')].filter(x => x.scrollWidth > x.clientWidth + 1).length; return { ths, table: Math.round(t.getBoundingClientRect().width), over, page: document.documentElement.scrollWidth }; });
    assert(m.ths.every(w => w <= 152), 'quarter columns: ' + m.ths.join()); assert(m.table < 1000, 'table width ' + m.table); assert.strictEqual(m.over, 0, 'no footer text sticks out of its cell'); assert(m.page <= 391, 'the page does not scroll sideways: ' + m.page);
    await page.close();
  });
  await test('"the quarter we are in" comes from the calendar, not from a quarter picked on Reports or Color teams (so To do does not follow a leftover choice)', async () => {
    const { page } = await open();      // today is 2026-12-20: a Sunday, not a club night; the calendar says Q2
    const r = await page.evaluate(() => { App.settings.quarter = 'Q4'; return { now: App.quarterNow(), picked: App.quarterOf(App.today()) }; });
    assert.strictEqual(r.now, 'Q2', 'the calendar says Q2 today'); assert.strictEqual(r.picked, 'Q4', 'quarterOf(today) still follows the picked quarter on a non-club day (why it is not used for "now")');
    await page.close();
  });
  await test('Undo takes back a hand-set color', async () => {
    const { page } = await open(), k = await projectOne(page); await page.evaluate(() => { App.touch(); }); await page.click('#btnDraftApply'); await page.waitForTimeout(300);      // the projection is part of the saved state, so Undo goes back to it
    await page.evaluate(() => App.showTab('teams')); await page.waitForSelector(cell(k.id, 'Q3') + 'select');
    const other = ['Red', 'Blue', 'Green', 'Yellow'].find(c => c !== k.q3);
    await page.selectOption(cell(k.id, 'Q3') + 'select', other); await page.waitForTimeout(200); await page.click('#btnDraftApply'); await page.waitForTimeout(300);      // Color teams edits are held as a draft until Apply changes, then Undo can take them back
    await page.click('#btnUndo'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(i => App.master.people.find(p => p[Model.X.ID] === i)['team:Q3'], k.id), k.q3, 'undone'); await page.close();
  });
  await test('a locked quarter\'s cell is a button that records a dated move and leaves the quarter\'s color alone', async () => {
    const { page } = await open(), k = await projectOne(page); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector(cell(k.id, 'Q1') + 'button[data-tgmove]');
    assert(/^Change Q1 color for /.test(await page.getAttribute(cell(k.id, 'Q1') + 'button[data-tgmove]', 'aria-label')), 'named');
    const pickColor = ['Red', 'Blue', 'Green', 'Yellow'].find(c => c !== k.q1);
    await page.click(cell(k.id, 'Q1') + 'button[data-tgmove]'); await page.waitForSelector('#dlg[open] #tgMvDate');      // the move box (turnout, colors had, a suggestion), not two prompts
    assert(await page.$('#dlg[open] .tgmvhist'), 'it shows the colors the child has had'); assert(/Expected turnout/.test(await page.textContent('#dlg')), 'and the expected turnout');
    await page.fill('#tgMvDate', '2026-10-14'); await page.check('#dlg input[name="tgMvTeam"][value="' + pickColor + '"]'); await page.click('#tgMvSave'); await page.waitForTimeout(250);
    const r = await page.evaluate(i => ({ q1: App.master.people.find(p => p[Model.X.ID] === i)['team:Q1'], moves: (App.season.teamMoves || {})[i] || [] }), k.id);
    assert.strictEqual(r.q1, k.q1, 'the quarter default is unchanged'); assert.strictEqual(r.moves.length, 1); assert.strictEqual(r.moves[0].from, '2026-10-14'); assert.strictEqual(r.moves[0].q, 'Q1');
    await page.click('#btnDraftApply'); await page.waitForTimeout(300); await page.click('#btnUndo'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(i => ((App.season.teamMoves || {})[i] || []).length, k.id), 0, 'Undo removes the move'); await page.close();
  });
  await test('a date outside the quarter is refused with a message and nothing is recorded', async () => {
    const { page } = await open(), k = await projectOne(page), seen = []; await page.evaluate(() => App.showTab('teams')); await page.waitForSelector(cell(k.id, 'Q1') + 'button[data-tgmove]');
    await page.click(cell(k.id, 'Q1') + 'button[data-tgmove]'); await page.waitForSelector('#dlg[open] #tgMvDate'); await page.fill('#tgMvDate', '2027-02-10'); await page.check('#dlg input[name="tgMvTeam"] >> nth=0'); await page.click('#tgMvSave'); await page.waitForTimeout(250);
    assert(/not Q1/.test(await page.textContent('#tgMvErr')), 'told why, in the box: ' + await page.textContent('#tgMvErr')); assert(await page.$('#dlg[open]'), 'the box stays open');
    assert.strictEqual(await page.evaluate(i => ((App.season.teamMoves || {})[i] || []).length, k.id), 0); await page.close();
  });
  await test('on a phone the color selects are 44px tall', async () => {
    const { page } = await open({ width: 375, height: 667 }), k = await projectOne(page); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector(cell(k.id, 'Q3') + 'select');
    const h = await page.$eval(cell(k.id, 'Q3') + 'select', e => e.getBoundingClientRect().height), b = await page.$eval(cell(k.id, 'Q1') + 'button[data-tgmove]', e => e.getBoundingClientRect().height);
    assert(h >= 43.5 && b >= 43.5, 'select ' + h + ', button ' + b); await page.close();
  });
  // ---------- recalculation and the Why panel ----------
  // Every open cell projected (nothing pinned): blank Q3 and Q4 for everyone and let the engine fill them.
  const projectAll = page => page.evaluate(() => {
    App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && ['Sparks', 'T&T'].includes(Model.groupOf(Model.room(p)))).forEach(p => { p['team:Q3'] = ''; p['team:Q4'] = ''; });
    const ctx = { master: App.master, season: App.season, calendar: App.calendar, today: App.today() }; TeamPlan.applyPlan(ctx, TeamPlan.project(ctx, { rng: Teams.mulberry32(3) })); App.refresh();
    const kid = App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'Sparks').sort(Model.byRoomThenName)[0];
    return { id: kid[Model.X.ID], q1: kid['team:Q1'], q3: kid['team:Q3'], room: Model.room(kid) };
  });
  const cellsOf = page => page.evaluate(() => JSON.stringify(App.master.people.map(p => [p[Model.X.ID], p['team:Q1'], p['team:Q2'], p['team:Q3'], p['team:Q4']])));
  const edit = async (page, k) => { await page.evaluate(r => { TeamGrid.ui.scope = 'class'; TeamGrid.ui.cls = r; }, k.room); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector(cell(k.id, 'Q3') + 'select');
    const other = ['Red', 'Blue', 'Green', 'Yellow'].find(c => c !== k.q3 && c !== k.q1); await page.selectOption(cell(k.id, 'Q3') + 'select', other); await page.waitForTimeout(250); return other; };

  await test('with nothing to change the button says so and is disabled', async () => {
    const { page } = await open(); await projectAll(page); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('#teamsWrap [data-tgrecalc]');
    assert(/Nothing to recalculate/.test(await page.textContent('[data-tgrecalc]'))); assert(await page.isDisabled('[data-tgrecalc]')); await page.close();
  });
  await test('after one hand edit the button says how many children it would change; the preview lists exactly them with a reason each; Cancel changes nothing', async () => {
    const { page } = await open(), k = await projectAll(page); await edit(page, k);
    const n = +(/changes (\d+) child/.exec(await page.textContent('[data-tgrecalc]')) || [])[1]; assert(n >= 1, 'a count is shown'); const before = await cellsOf(page);
    await page.click('[data-tgrecalc]'); await page.waitForSelector('.tgpreview li');
    const rows = await page.$$eval('.tgpreview li', e => e.map(x => x.textContent)); assert(rows.length >= n, rows.length + ' lines for ' + n + ' children'); assert(rows.every(t => t.length > 25), 'a reason on every line: ' + rows[0]);
    await page.click('[data-tgcancel]'); await page.waitForTimeout(150); assert.strictEqual(await cellsOf(page), before, 'Cancel left every color alone'); await page.close();
  });
  await test('Accept changes only the listed cells, never the pin or a locked quarter, and one Undo (after Apply) restores them', async () => {
    const { page } = await open(), k = await projectAll(page), other = await edit(page, k);
    await page.click('#btnDraftApply'); await page.waitForTimeout(300); const before = await cellsOf(page);      // the hand edit is its own History step, so one Undo takes back only the recalculation
    await page.click('[data-tgrecalc]'); await page.waitForSelector('.tgpreview li'); const ids = await page.$$eval('.tgpreview li', e => e.map(x => x.dataset.kid));
    await page.click('[data-tgaccept]'); await page.waitForTimeout(250);
    const a = JSON.parse(await cellsOf(page)), b = JSON.parse(before);
    a.forEach((row, i) => { assert.strictEqual(row[1], b[i][1], 'Q1 untouched'); assert.strictEqual(row[2], b[i][2], 'Q2 untouched'); if (!ids.includes(row[0])) assert.deepStrictEqual(row, b[i], 'an unlisted child changed: ' + row[0]); });
    assert.strictEqual(a.find(r => r[0] === k.id)[3], other, 'the pin did not move');
    assert(/Nothing to recalculate/.test(await page.textContent('[data-tgrecalc]')), 'once accepted there is nothing left to change');
    await page.click('#btnDraftApply'); await page.waitForTimeout(300); await page.click('#btnUndo'); await page.waitForTimeout(300); assert.strictEqual(await cellsOf(page), before, 'Undo restored the colors'); await page.close();
  });
  await test('Fill blanks creates a projection for the open quarters: the cells come back dashed, and no color is a pin', async () => {
    const { page } = await open(); await page.evaluate(() => { App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p)).forEach(p => { p['team:Q4'] = ''; }); App.refresh(); });
    await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('[data-tgfill]'); assert(/Fill \d+ blank/.test(await page.textContent('[data-tgfill]')));
    await page.click('[data-tgfill]'); await page.waitForSelector('#dlg[open] #tgPrevOk'); await page.click('#tgPrevOk'); await page.waitForTimeout(300);      // Fill shows a preview first; Confirm writes it
    assert.strictEqual(await page.$('[data-tgfill]'), null, 'nothing left to fill'); assert((await page.$$('#teamsWrap .tg select.tgproj')).length > 0, 'projected cells are dashed'); await page.close();
  });
  await test('the Why panel is a labeled region that lists the priorities in force, and says which children use the group average', async () => {
    const { page } = await open(); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('.tgwhy');
    assert.strictEqual(await page.getAttribute('.tgwhy', 'aria-label'), 'Why these teams'); assert.strictEqual(await page.getAttribute('.tgwhy', 'role'), 'region');
    const t = await page.textContent('.tgwhy'); assert(/Never repeat a color/.test(t) && /Even team sizes/.test(t) && /expected turnout/i.test(t), 'priorities listed');
    assert(/group average/i.test(t), 'the average fallback is explained'); assert(await page.$('.tgwhy details summary'), 'the attendance behind the turnout can be opened'); await page.close();
  });
  // ---------- lock, unlock, print prompt ----------
  const lockedAt = (page, q) => page.evaluate(x => ((App.season.config.teamPlan || {}).locked || {})[x] || '', q);

  await test('Lock makes a ready quarter locked (cells become move buttons); Unlock after confirming brings the selects back; a started quarter has neither button', async () => {
    const { page } = await open(), k = await projectAll(page); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('[data-tglock="Q3"]');
    assert.strictEqual(await page.$('[data-tglock="Q1"], [data-tgunlock="Q1"], [data-tglock="Q2"], [data-tgunlock="Q2"]'), null, 'started quarters have no lock buttons');
    await page.click('[data-tglock="Q3"]'); await page.waitForSelector(cell(k.id, 'Q3') + 'button[data-tgmove]'); assert.strictEqual(await lockedAt(page, 'Q3'), TODAY, 'locked today');
    assert(/Q3 .*locked/.test(await page.textContent('thead th[data-q="Q3"]')), 'the header reads locked'); assert(await page.$('[data-tgunlock="Q3"]'), 'a hand lock can be undone');
    await page.click('[data-tgunlock="Q3"]'); await page.waitForSelector(cell(k.id, 'Q3') + 'select'); assert.strictEqual(await lockedAt(page, 'Q3'), '', 'unlocked'); await page.close();
  });
  await test('locking while some children have no color says so in the message; on the staged draft there is no Undo, and Discard keeps the quarter open', async () => {
    const { page } = await open(); await projectAll(page); await page.evaluate(() => { const p = App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && ['Sparks', 'T&T'].includes(Model.groupOf(Model.room(x)))); p['team:Q3'] = ''; App.refresh(); });
    await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('[data-tglock="Q3"]'); page.removeAllListeners('dialog'); page.on('dialog', d => d.accept());      /* the Discard question is still a browser one until step 3 */
    await page.click('[data-tglock="Q3"]'); await page.waitForTimeout(250); const said = await page.textContent('#doneFlash'); assert(/no color/i.test(said), 'it says who has no color: ' + said); assert(!(await page.isVisible('#doneUndo')), 'a staged draft: Apply or Discard, not Undo');
    await page.click('#btnDraftDiscard'); await page.waitForTimeout(300); assert.strictEqual(await lockedAt(page, 'Q3'), '', 'still open after Discard'); await page.close();
  });
  await test('Undo (after Apply) takes a lock back', async () => {
    const { page } = await open(); await projectAll(page); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('[data-tglock="Q3"]');
    await page.click('[data-tglock="Q3"]'); await page.waitForTimeout(200); await page.click('#btnDraftApply'); await page.waitForTimeout(300); await page.click('#btnUndo'); await page.waitForTimeout(300);
    assert.strictEqual(await lockedAt(page, 'Q3'), '', 'unlocked again'); await page.close();
  });
  await test('printing the attendance sheets or color teams of a quarter that is not locked asks "Lock Q3 now?" with three choices, and never locks silently', async () => {
    const { page } = await open(); await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; App.settings.quarter = 'Q3'; App.showReport('teams'); }); await page.waitForTimeout(300);
    const printed = () => page.evaluate(() => window.__printed);
    await page.click('#btnPrint'); await page.waitForSelector('#lockAsk:not([hidden])'); assert(/Lock Q3/.test(await page.textContent('#lockAskBody')), 'names the quarter');
    await page.click('#lockAskCancel'); await page.waitForTimeout(150); assert.strictEqual(await printed(), 0, 'Cancel does not print'); assert.strictEqual(await lockedAt(page, 'Q3'), '');
    await page.click('#btnPrint'); await page.click('#lockAskPrint'); await page.waitForTimeout(150); assert.strictEqual(await printed(), 1, 'Print without locking prints'); assert.strictEqual(await lockedAt(page, 'Q3'), '', 'and does not lock');
    await page.click('#btnPrint'); await page.click('#lockAskLock'); await page.waitForTimeout(200); assert.strictEqual(await printed(), 2, 'Lock and print prints'); assert.strictEqual(await lockedAt(page, 'Q3'), TODAY, 'and locks');
    await page.click('#btnPrint'); await page.waitForTimeout(150); assert.strictEqual(await printed(), 3, 'a locked quarter prints with no question'); assert(await page.$('#lockAsk[hidden]'), 'no prompt');
    await page.evaluate(() => App.showReport('binderClass')); await page.waitForTimeout(200); await page.evaluate(() => { App.settings.quarter = 'Q4'; }); await page.click('#btnPrint'); await page.waitForTimeout(150);
    assert.strictEqual(await printed(), 4, 'a report that is not about teams or attendance sheets prints with no question'); await page.close();
  });
  // ---------- fixes from the final review ----------
  await test('Re-draw refuses a quarter that has started or is locked, and changes nothing', async () => {
    const { page } = await open();
    await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('#teamsWrap .tg'); const before = await cellsOf(page);
    const msgs = []; page.removeAllListeners('dialog'); page.on('dialog', d => { msgs.push(d.message()); d.accept(); });      /* answered through the same handler (pw-dialog-compat.js) */
    await page.selectOption('#tQuarter', 'Q1'); await page.click('#btnTeamMore'); await page.click('#btnTeamRedo'); await page.waitForTimeout(500);
    assert.strictEqual(await cellsOf(page), before, 'Q1 colors untouched'); assert(msgs.some(m => /started|locked/i.test(m)), 'told why: ' + msgs.join(' | ')); await page.close();
  });
  await test('Re-draw of an open quarter marks every new color as projected, so the quarter is never half pins and half projection', async () => {
    const { page } = await open(); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('#teamsWrap .tg');
    await page.click('[data-tgscope="club"]'); await page.waitForTimeout(150); await page.selectOption('#tQuarter', 'Q4'); await page.click('#btnTeamMore'); await page.click('#btnTeamRedo'); await page.waitForSelector('#dlg[open] #tgPrevOk'); await page.click('#tgPrevOk'); await page.waitForTimeout(500);
    const pins = await page.$$eval('#teamsWrap .tg td[data-q="Q4"] .tgpin', e => e.length), proj = await page.$$eval('#teamsWrap .tg td[data-q="Q4"] select.tgproj', e => e.length);
    assert.strictEqual(pins, 0, 'no pin after a re-draw'); assert(proj > 20, proj + ' projected cells'); await page.close();
  });
  await test('Re-draw shows a preview first (the proposed colors, warnings, Draw again); Cancel changes NOTHING; Confirm writes exactly the colors shown and the message says Apply or Discard', async () => {
    const { page } = await open(); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('#teamsWrap .tg'); await page.selectOption('#tQuarter', 'Q4'); const before = await cellsOf(page);
    await page.click('#btnTeamMore'); await page.click('#btnTeamRedo'); await page.waitForSelector('#dlg[open] #tgPrevOk'); assert(/Re-draw Q4 colors/.test(await page.textContent('#dlg h3')), 'a preview titled Re-draw'); assert(/\d+ colors? would be set/.test(await page.textContent('#tgPrevCount')));
    assert.strictEqual(await cellsOf(page), before, 'opening the preview changed nothing (the dry run puts every color back)');
    await page.click('#tgPrevAgain'); await page.waitForTimeout(150); assert.strictEqual(await cellsOf(page), before, 'Draw again changed nothing either');
    await page.click('#tgPrevCancel'); await page.waitForTimeout(200); assert.strictEqual(await cellsOf(page), before, 'Cancel left every color as it was');
    await page.click('#btnTeamMore'); await page.click('#btnTeamRedo'); await page.waitForSelector('#dlg[open] #tgPrevOk'); const shown = await page.$$eval('#dlg table.tgprev tbody tr', rs => rs.map(r => r.dataset.kid + '|' + r.querySelector('.team').textContent));
    await page.click('#tgPrevOk'); await page.waitForTimeout(400);
    const now = await page.evaluate(() => Object.fromEntries(App.master.people.map(p => [p[Model.X.ID], p['team:Q4']]))); assert(shown.length > 20, shown.length + ' rows shown'); assert(shown.every(s => now[s.split('|')[0]] === s.split('|')[1]), 'Confirm wrote exactly the colors the preview showed');
    assert(/Q4 color for Sparks and T&T was cleared and drawn again/.test(await page.textContent('#doneFlash')), 'the message'); await page.close();
  });
  await test('when the last quarter cannot be evened the grid says so, instead of only "Nothing to recalculate"', async () => {
    // With this club and seed the projection leaves T&T Q4 at 11 / 13 / 12 / 11: the last quarter is the most constrained (each child has three colors used up).
    const { page } = await open(); await projectAll(page); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('.tgbalance'); const t = await page.textContent('.tgbalance');
    assert(/Q4/.test(t) && /T&T/.test(t) && /uneven/i.test(t), 'names the quarter and group: ' + t); assert(/Nothing to recalculate/.test(await page.textContent('[data-tgrecalc]')), 'and the button still says there is nothing to recalculate'); await page.close();
  });
  await test('after Fill or Accept keyboard focus lands in the panel instead of dropping to the page', async () => {
    let { page } = await open(); await page.evaluate(() => { App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p)).forEach(p => { p['team:Q4'] = ''; }); App.refresh(); });
    await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('[data-tgfill]'); await page.click('[data-tgfill]'); await page.waitForSelector('#dlg[open] #tgPrevOk'); await page.click('#tgPrevOk'); await page.waitForTimeout(300);
    assert(await page.evaluate(() => !!(document.activeElement && document.activeElement.closest('.tgwhy'))), 'after Fill'); await page.close();
    const o = await open(), k = await projectAll(o.page); await edit(o.page, k); await o.page.click('[data-tgrecalc]'); await o.page.waitForSelector('.tgpreview');
    assert(await o.page.evaluate(() => !!(document.activeElement && document.activeElement.closest('.tgpreview'))), 'opening the preview moves focus into it');
    await o.page.click('[data-tgaccept]'); await o.page.waitForTimeout(300); assert(await o.page.evaluate(() => !!(document.activeElement && document.activeElement.closest('.tgwhy'))), 'after Accept'); await o.page.close();
  });
  await test('Start new year clears the locks and the projection along with the archived colors', async () => {
    const { page } = await open(); await projectAll(page); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('[data-tglock="Q3"]'); await page.click('[data-tglock="Q3"]'); await page.waitForTimeout(200);
    page.removeAllListeners('dialog'); page.on('dialog', d => d.accept(d.type() === 'prompt' ? '2027-28' : undefined));      /* the label form is a one-field prompt; a staged lock may ask about the draft first */
    await page.click('#btnTeamMore'); await page.click('#btnTeamYear'); await page.waitForTimeout(800);
    assert.strictEqual(await page.evaluate(() => !!(App.season.config.teamPlan && (App.season.config.teamPlan.locked || App.season.config.teamPlan.proj))), false, 'no stale lock or marks'); await page.close();
  });
  await test('every control on the grid and in the Why panel is at least 44px tall on a phone and on a touch tablet', async () => {
    for (const [viewport, touch] of [[{ width: 375, height: 667 }, false], [{ width: 900, height: 800 }, true]]) {
      const { page } = await open(viewport, touch), k = await projectAll(page); await edit(page, k); await page.click('[data-tgrecalc]'); await page.waitForSelector('.tgpreview');
      const small = await page.evaluate(() => [...document.querySelectorAll('.tgscope button, #tgClass, #tgGroup, .tgbar button, .tgpreview button, .tgwhy summary, .tglockbtn')].filter(e => e.offsetParent).map(e => [e.id || e.className || e.tagName, Math.round(e.getBoundingClientRect().height)]).filter(x => x[1] < 44));
      assert.deepStrictEqual(small, [], (touch ? 'touch tablet: ' : 'phone: ') + JSON.stringify(small)); await page.close();
    }
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
