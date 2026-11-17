// Notes and flags in the real app: flag a box and a whole sheet, see them on the sheet and the To do tab, jump to one, clear from either place, Undo. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/flags-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); page.on('dialog', d => d.accept()); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => { const b = document.getElementById('btnDraftApply'); if (b && !b.closest('[hidden]')) b.click(); });
  const kid = await page.evaluate(() => { const p = App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'Sparks'); const id = p[Model.X.ID]; App.season.progress = {}; App.season.flags = {}; App.season.handbooks[id] = 'HG 260916'; App.touch(); return id; });
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  const setSel = (sel, v) => page.evaluate(([s, v]) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
  const openSheet = async () => { await tab('person'); await page.waitForTimeout(300); await setSel('#peGroup', 'Sparks'); await page.waitForTimeout(300); await setSel('#pePerson', kid); await page.waitForTimeout(400); await page.evaluate(() => { const b = document.querySelector('.booktabs button[data-book="HG"]'); if (b) b.click(); }); await page.waitForTimeout(300); };
  const flagCount = () => page.evaluate(() => Object.keys(App.season.flags).length);
  const add = f => page.evaluate(f => App.addFlag(f), f);      // flags are started from the top-bar Flag button and the To do box; the little buttons only show an existing one
  await openSheet();

  await test('flagging one box: the note is saved against the child, book, block and box, and the box is outlined with a lit flag', async () => {
    assert.strictEqual(await page.locator('#progressWrap button.flagbtn').count(), 0, 'no little flag until something is flagged');
    await add({ kid, level: 'box', book: 'HG', block: 'GJ1', key: 'GJ1.2', note: 'check this sign-off date' }); await openSheet();
    const f = await page.evaluate(() => Object.values(App.season.flags)[0]); assert.deepStrictEqual([f.kid, f.level, f.book, f.block, f.key, f.note], [kid, 'box', 'HG', 'GJ1', 'GJ1.2', 'check this sign-off date']);
    assert.strictEqual(await page.locator('#progressWrap .pcell.flagged').count(), 1); assert.strictEqual(await page.locator('#progressWrap .pcell.flagged button.flagbtn.on').count(), 1);
    assert(/Green Jewel 1 · box 2/.test(await page.textContent('#progressWrap .flagnote')), 'the note says where: ' + await page.textContent('#progressWrap .flagnote'));
  });
  await test('flagging a whole sheet and a whole section; there is no separate "flag this child" button', async () => {
    assert.strictEqual(await page.locator('#progressWrap button[data-flag="child"]').count(), 0);
    await add({ kid, level: 'sheet', book: 'HG', note: 'look at this entire sheet' }); await add({ kid, level: 'block', book: 'HG', block: 'GJ1', note: 'block note' }); await openSheet();
    assert.strictEqual(await page.locator('#progressWrap button[data-flag="sheet"]').count(), 0, 'no "Flag this sheet" button');
    assert.strictEqual(await flagCount(), 3); assert.strictEqual(await page.locator('#progressWrap .flagnote').count(), 3);
    assert.strictEqual(await page.locator('#progressWrap button.flagbtn[data-flag="block"]').count(), 1, 'the flagged section shows its yellow flag');
  });
  await test('an empty note is refused (in the popup)', async () => {
    await page.locator('#progressWrap .flagnote .flagbtn').first().click(); await page.fill('.flagpop textarea', ''); await page.click('.flagpop button[data-fsave]'); await page.waitForTimeout(200);
    assert.strictEqual(await flagCount(), 3, 'nothing changed'); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  });
  await test('the To do tab lists every flag with where it points, the child and the note', async () => {
    await tab('todo'); await page.waitForTimeout(400); const t = await page.textContent('#todoWrap .flagcard');
    assert(/Notes and flags \(3\)/.test(t) && /check this sign-off date/.test(t) && /Green Jewel 1 · box 2/.test(t) && /block note/.test(t) && /Hangglider sheet/.test(t), t.slice(0, 400));
  });
  await test('Go opens the child’s sheet at the flagged box', async () => {
    await page.locator('#todoWrap .flagcard tr', { hasText: 'check this sign-off date' }).locator('button[data-goflag]').click(); await page.waitForTimeout(600);
    assert.strictEqual(await page.evaluate(() => App.tab), 'person'); assert.strictEqual(await page.evaluate(() => App.personSub()), 'progress', 'opens the Progress sub-tab'); assert.strictEqual(await page.inputValue('#pePerson'), kid); assert(await page.locator('#progressWrap input[data-key="GJ1.2"]').isVisible());
  });
  await test('Clear on the To do tab removes the flag; Undo brings it back', async () => {
    await tab('todo'); await page.waitForTimeout(300); await page.locator('#todoWrap .flagcard tr', { hasText: 'block note' }).locator('button[data-clearflag2]').click(); await page.waitForTimeout(300);
    assert.strictEqual(await flagCount(), 2); assert(!/block note/.test(await page.textContent('#todoWrap .flagcard')));
    await page.click('#btnUndo'); await page.waitForTimeout(300); assert.strictEqual(await flagCount(), 3, 'Undo restores it');
  });
  await test('Clear on the sheet removes a flag, the outline goes with it, and the To do card says there are no notes when none are left', async () => {
    await openSheet();
    while (await page.locator('#progressWrap button[data-clearflag]').count()) { await page.locator('#progressWrap button[data-clearflag]').first().click(); await page.waitForTimeout(250); }
    assert.strictEqual(await flagCount(), 0); assert.strictEqual(await page.locator('#progressWrap .pcell.flagged').count(), 0);
    await tab('todo'); await page.waitForTimeout(300); assert(/No notes yet/.test(await page.textContent('#todoWrap .flagcard')), 'the card stays (it is where notes are typed) and says there are none');
  });
  await test('To do: a general note is typed into the card (Enter or the button), listed with no child and no Go button, and cleared', async () => {
    await tab('todo'); await page.waitForTimeout(400); assert.strictEqual(await page.locator('#todoWrap .flagcard').count(), 1, 'the card is there even with no flags');
    await page.fill('#tdNoteText', 'ask the leaders about Rank sign-offs'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    const row = page.locator('#todoWrap .flagcard tr', { hasText: 'ask the leaders' }); assert.strictEqual(await row.count(), 1); assert(/General note/.test(await row.textContent())); assert.strictEqual(await row.locator('button[data-goflag]').count(), 0, 'nothing to jump to');
    assert.strictEqual(await page.inputValue('#tdNoteText'), '', 'the box is emptied for the next note'); await page.click('#tdNoteAdd'); await page.waitForTimeout(200); assert.strictEqual(await page.locator('#todoWrap .flagcard tr', { hasText: 'ask the leaders' }).count(), 1, 'an empty note adds nothing');
    await row.locator('button[data-clearflag2]').click(); await page.waitForTimeout(300); assert.strictEqual(await flagCount(), 0); assert(/No notes yet/.test(await page.textContent('#todoWrap .flagcard')));
  });
  await test('To do: a child with a book but no date received is listed under "Needs a date received" until a date, or "no date", is entered', async () => {
    const ids = () => page.evaluate(kidId => { const r = Todo.compute({ master: App.master, season: App.season, quarter: App.quarterOf(App.today()), today: App.today() }); const g = r.groups.find(x => x.id === 'received'); return g ? g.items.map(i => i.id) : []; }, kid);
    await page.evaluate(id => { App.season.received = {}; App.season.handbooks[id] = 'HG'; App.touch(); App.refresh(); }, kid); assert((await ids()).includes(kid), 'listed');
    await page.evaluate(id => Season.setReceived(App.season, id, 'HG', '', { noDate: true }), kid); assert(!(await ids()).includes(kid), 'a no-date tick counts as received');
    await page.evaluate(id => { Season.setReceived(App.season, id, 'HG', ''); Season.setReceived(App.season, id, 'HG', '2026-09-16'); }, kid); assert(!(await ids()).includes(kid), 'a date counts');
  });
  const todoRow = async text => page.evaluate(t => { const r = [...document.querySelectorAll('.flagcard tbody tr')].find(x => x.children[1].textContent.includes(t)); return r ? { where: r.children[1].textContent, go: !!r.querySelector('[data-goflag]'), clear: !!r.querySelector('[data-clearflag2]'), id: (r.querySelector('[data-clearflag2]') || {}).dataset && r.querySelector('[data-clearflag2]').dataset.clearflag2 } : null; }, text);
  await test('To do: a long note wraps inside the card, so Added, Go and Clear stay on the card', async () => {
    await page.evaluate(() => App.addNote('A long suggestion that goes on and on about how the Progress pages should keep the line with Group, Class and Child on the screen all the time so that nobody has to scroll back up to pick the next child.'));
    await tab('todo'); await page.waitForTimeout(400);
    const r = await page.evaluate(() => { const card = document.querySelector('.flagcard').getBoundingClientRect(), btn = [...document.querySelectorAll('.flagcard [data-clearflag2]')].pop().getBoundingClientRect(); return { cardRight: card.right, btnRight: btn.right }; });
    assert(r.btnRight <= r.cardRight, 'the Clear button is inside the card');
    await page.evaluate(() => Season.flagList(App.season).filter(f => f.level === 'general').forEach(f => Season.clearFlag(App.season, f.id)));
  });
  await test('Attendance: a note about a class on a night is listed on To do with Where, Go and Clear; Go opens that night and class', async () => {
    await tab('attend'); await page.waitForTimeout(400);
    const was = await page.evaluate(() => ({ room: document.getElementById('attRoom').value, date: document.getElementById('attDate').value }));
    assert.strictEqual(await page.locator('#attFlagWrap button').count(), 0, 'no flag button until there is a note');
    await add({ level: 'attend', date: was.date, room: was.room, note: 'check the count' }); await tab('attend'); await page.waitForTimeout(300);
    assert.strictEqual(await page.locator('#attFlagWrap button.flagbtn.on').count(), 1, 'the night shows its yellow flag');
    await tab('todo'); await page.waitForTimeout(400);
    const row = await todoRow('Attendance'); assert(row && row.go && row.clear, 'listed with Go and Clear'); assert(row.where.includes(was.room), 'Where names the class: ' + row.where);
    await tab('attend'); await page.waitForTimeout(200); await page.evaluate(() => { const r = document.getElementById('attRoom'), o = [...r.options].find(x => x.value !== r.value); if (o) { r.value = o.value; r.dispatchEvent(new Event('change', { bubbles: true })); } });
    await tab('todo'); await page.waitForTimeout(300); await page.click('[data-goflag="' + row.id + '"]'); await page.waitForTimeout(500);
    assert.deepStrictEqual(await page.evaluate(() => ({ tab: App.tab, room: document.getElementById('attRoom').value, date: document.getElementById('attDate').value })), { tab: 'attend', room: was.room, date: was.date }, 'Go opens the night and class');
    await tab('todo'); await page.waitForTimeout(300); await page.click('[data-clearflag2="' + row.id + '"]'); assert.strictEqual(await todoRow('Attendance'), null, 'Clear removes it');
  });
  await test('Color teams: a note on a quarter and group, optionally one color, is listed with Where, Go and Clear', async () => {
    await page.evaluate(() => App.showTab('teams')); await page.waitForTimeout(500);
    assert.strictEqual(await page.locator('#teamsWrap button[data-fplace]').count(), 0, 'no flag button until there is a note');
    const colors = await page.evaluate(() => ['The whole group'].concat(Season.teamOrder(App.season))); assert(colors.length > 1, 'a color can be chosen');
    await add({ level: 'team', quarter: 'Q1', group: 'All', color: colors[1], note: 'rebalance' }); await page.evaluate(() => App.showTab('teams')); await page.waitForTimeout(400);
    await tab('todo'); await page.waitForTimeout(400); const row = await todoRow('Color teams'); assert(row && row.go && row.clear, 'listed with Go and Clear'); assert(row.where.includes(colors[1]), 'Where names the color: ' + row.where);
    await page.click('[data-goflag="' + row.id + '"]'); await page.waitForTimeout(500); assert.strictEqual(await page.evaluate(() => App.tab + '/' + App.sub), 'games/teams', 'Go opens the color teams view');
    await tab('todo'); await page.waitForTimeout(300); await page.click('[data-clearflag2="' + row.id + '"]'); assert.strictEqual(await todoRow('Color teams'), null);
  });
  await test('Person tab: a note on one field is listed with Where, Go and Clear; Go opens that child', async () => {
    await page.evaluate(id => App.showPerson(id, { sub: 'registration' }), kid); await page.waitForTimeout(500);
    assert.strictEqual(await page.locator('#personWrap button.flagbtn').count(), 0, 'no flag button until there is a note');
    await add({ kid, level: 'field', field: 'Club · Active', note: 'ask the family' });
    await tab('todo'); await page.waitForTimeout(400); const row = await todoRow('Person'); assert(row && row.go && row.clear, 'listed with Go and Clear');
    await page.click('[data-goflag="' + row.id + '"]'); await page.waitForTimeout(600); assert.strictEqual(await page.evaluate(() => App.tab), 'person');
    await tab('todo'); await page.waitForTimeout(300); await page.click('[data-clearflag2="' + row.id + '"]'); assert.strictEqual(await todoRow('Person'), null);
  });
  await test('Season: a flag needs the parts its kind uses', () => page.evaluate(() => { const s = App.season, bad = f => { try { Season.addFlag(s, Object.assign({ note: 'x' }, f)); return false; } catch (e) { return true; } }; return [bad({ level: 'attend', room: 'A' }), bad({ level: 'team', quarter: 'Q1' }), bad({ level: 'field', kid: 'x' }), bad({ level: 'field', field: 'y' })]; }).then(r => assert.deepStrictEqual(r, [true, true, true, true])));
  await test('Same date: the last date entered can be pasted into the first box of another row', async () => {
    await openSheet();
    const r = await page.evaluate(async () => {
      const wait = ms => new Promise(x => setTimeout(x, ms)), empties = () => [...document.querySelectorAll('#progressWrap input[type=date][data-key$=".1"]')].filter(i => !i.value);
      const a = empties()[0], aKey = a.dataset.key; a.focus(); a.value = '2026-10-21'; a.dispatchEvent(new Event('input', { bubbles: true })); a.dispatchEvent(new Event('change', { bubbles: true })); await wait(300);
      const target = empties().find(i => { const c = i.closest('.pcell'); return i.dataset.key !== aKey && c && c.querySelector('button[data-copylast]'); }); if (!target) return { err: 'no Same date button on another row' };
      const k = target.dataset.key, sc = target.dataset.scope; target.closest('.pcell').querySelector('button[data-copylast]').click(); await wait(300);
      return { value: (((App.season.progress[document.getElementById('pePerson').value] || {})[sc]) || {})[k] };
    });
    assert.strictEqual(r.err, undefined, r.err); assert.strictEqual(r.value, '2026-10-21', 'the first box of another row took the last date entered');
  });
  await test('Phone: a one-line Previous / child / Next bar appears once the pickers have scrolled away, and is not there on a wide screen', async () => {
    await page.setViewportSize({ width: 393, height: 851 }); await openSheet(); await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => document.getElementById('prPin').hidden), true, 'hidden while the pickers are in view');
    assert.deepStrictEqual(await page.evaluate(() => { const t = document.querySelector('#progressWrap .todaybtn[data-today]'), c = document.querySelector('#progressWrap .todaybtn[data-copylast]'); return [t && getComputedStyle(t, '::after').content, t && t.textContent, c && getComputedStyle(c, '::after').content]; }), ['"Now"', 'Today', '"Same"'], 'phone: Now and Same on screen, Today and Same date still in the page');
    await page.evaluate(() => window.scrollTo(0, 1200)); await page.waitForTimeout(500);
    const was = await page.inputValue('#pePerson'); assert.strictEqual(await page.evaluate(() => getComputedStyle(document.getElementById('prPin')).display), 'flex', 'shown once scrolled');
    await page.click('#prPin button[data-prstep="1"]'); await page.waitForTimeout(500); assert.notStrictEqual(await page.inputValue('#pePerson'), was, 'Next moves to the next child');
    await page.setViewportSize({ width: 1366, height: 900 }); await page.waitForTimeout(300); await page.evaluate(() => window.scrollTo(0, 1200)); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.getElementById('prPin')).display), 'none', 'not shown on a wide screen');
  });
  await test('Date boxes: month and day then one Tab saves this year and moves to the next box', async () => {
    await openSheet();
    const first = await page.evaluate(() => { const b = [...document.querySelectorAll('#progressWrap input[type=date][data-key]')].find(i => !i.value); b.focus(); return b.dataset.key; });
    await page.keyboard.type('1028'); await page.keyboard.press('Tab'); await page.waitForTimeout(400);
    const r = await page.evaluate(k => ({ active: document.activeElement.dataset && document.activeElement.dataset.key, val: document.querySelector('#progressWrap input[data-key="' + k + '"]').value }), first);
    assert.notStrictEqual(r.active, first, 'focus moved off the box'); assert(/^\d{4}-10-28$/.test(r.val), 'the year was filled in: ' + r.val);
  });
  await test('No team: the To do button takes a child off "Needs a color team"; the Person tab and the grid show No team', async () => {
    const q = await page.evaluate(() => { const q = App.quarterOf(App.today()), p = App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'Sparks'); window.__ntKid = p[Model.X.ID]; Model.setTeamChoice(App.master, p, q, ''); App.touch(); App.refresh(); return q; });
    await tab('todo'); await page.waitForTimeout(500);
    const row = page.locator('section.pcard', { hasText: 'Needs a ' + q + ' color team' }).locator('tr[data-id="' + await page.evaluate(() => window.__ntKid) + '"]');
    assert.strictEqual(await row.count(), 1, 'asked for a color while blank'); await row.locator('button[data-noteam]').click(); await page.waitForTimeout(400);
    assert.strictEqual(await page.locator('section.pcard', { hasText: 'Needs a ' + q + ' color team' }).locator('tr[data-id="' + await page.evaluate(() => window.__ntKid) + '"]').count(), 0, 'no longer asked');
    assert.strictEqual(await page.evaluate(([id, q]) => Model.noTeam(App.master.people.find(p => p[Model.X.ID] === id), q), [await page.evaluate(() => window.__ntKid), q]), true, 'marked No team');
    await page.evaluate(id => App.showPerson(id, { sub: 'registration' }), await page.evaluate(() => window.__ntKid)); await page.waitForTimeout(500);
    assert.strictEqual(await page.inputValue('#personWrap select[data-team="' + q + '"]'), '__none__', 'the Person tab shows No team');
    await page.evaluate(() => App.showTab('teams')); await page.waitForTimeout(500);
    const shown = await page.evaluate(([id, q]) => { const s = document.querySelector('#teamsWrap select[data-tgcell="' + q + '"][data-kid="' + id + '"]'); return s ? s.value : 'locked-or-hidden'; }, [await page.evaluate(() => window.__ntKid), q]);
    assert(shown === '__none__' || shown === 'locked-or-hidden', 'the grid shows No team (or the quarter is locked and shows it on its button): ' + shown);
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
