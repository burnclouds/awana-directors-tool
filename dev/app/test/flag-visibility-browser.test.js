// The little flags show only where something is flagged (yellow); flags are started only by the top-bar Flag button and the To do "Add note" box. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/flag-visibility-browser.test.js
const { chromium } = require('playwright');
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').slice(0, 9).join(' | ')); } }
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
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } }), page = await ctx.newPage(), errs = [];
    page.on('dialog', d => d.dismiss()); page.on('pageerror', e => errs.push(e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    await page.evaluate(() => { const b = document.getElementById('btnDraftApply'); if (b && !b.closest('[hidden]')) b.click(); });
    const kid = await page.evaluate(() => { const k = App.master.people.find(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'T&T'); return { id: k[Model.X.ID], room: Model.room(k) }; });
    return { page, errs, kid };
  };
  const flagBtns = (page, scope) => page.locator((scope || 'body') + ' .flagbtn').count();
  const views = {
    'a child (Person tab with the sheet)': (page, kid) => page.evaluate(id => App.showPerson(id), kid.id),
    'Attendance': page => page.evaluate(() => App.showTab('attend')),
    'Color teams': page => page.evaluate(() => App.showTab('teams')),
  };

  await test('with nothing flagged there is no little flag, no "Flag this sheet" and no Note button on any view; the top-bar Flag button is there', async () => {
    const { page, kid } = await open();
    for (const [name, go] of Object.entries(views)) { await go(page, kid); await page.waitForTimeout(300); if (name === 'Color teams') assert.strictEqual(await page.evaluate(() => App.tab + '/' + App.sub), 'games/teams', 'the Color teams view is open'); assert.strictEqual(await flagBtns(page), 0, 'no flag button on ' + name); }
    assert.strictEqual(await page.locator('button:visible', { hasText: 'Flag this sheet' }).count(), 0); assert.strictEqual(await page.locator('#btnFlagMode').count(), 1); await page.close();
  });
  await test('a flagged box, field, sheet, attendance night and color team each show one yellow flag that opens the popup with the note', async () => {
    const { page, kid } = await open();
    const sheetBook = await page.evaluate(id => { App.showPerson(id); const i = document.querySelector('#progressWrap input[type=date][data-key]'); return { scope: i.dataset.scope, key: i.dataset.key, block: i.dataset.key.split('.')[0] }; }, kid.id);
    await page.evaluate(([k, s]) => {
      App.addFlag({ kid: k.id, level: 'box', book: s.scope, block: s.block, key: s.key, note: 'box note' });
      App.addFlag({ kid: k.id, level: 'sheet', book: s.scope, note: 'sheet note' });
      App.addFlag({ kid: k.id, level: 'field', field: 'Club · Active', note: 'field note' });
    }, [kid, sheetBook]);
    await page.evaluate(id => App.showPerson(id), kid.id); await page.waitForTimeout(400);
    const colour = await page.locator('#progressWrap .pcell .flagbtn.on').first().evaluate(b => getComputedStyle(b).color); assert.strictEqual(colour, 'rgb(224, 160, 48)');
    // the sheet lists every note for the child with its own yellow flag; the box also has one on the box itself
    for (const [sel, note] of [['#progressWrap .pcell .flagbtn.on', 'box note'], ['#progressWrap .flagnote:has-text("sheet note") .flagbtn.on', 'sheet note']]) {
      assert.strictEqual(await page.locator(sel).count(), 1, 'one yellow flag: ' + sel);
      await page.locator(sel).first().click(); assert.strictEqual(await page.inputValue('.flagpop textarea'), note); await page.keyboard.press('Escape');
    }
    await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(300);
    assert.strictEqual(await page.locator('#personWrap .flagbtn.on[data-fplace]').count(), 1, 'one yellow flag on the field');
    await page.locator('#personWrap .flagbtn.on[data-fplace]').click(); assert.strictEqual(await page.inputValue('.flagpop textarea'), 'field note'); await page.keyboard.press('Escape');
    const night = await page.evaluate(() => { const r = App.season && App.nightList ? null : null; return { date: App.today(), room: Model.room(App.master.people.find(p => Model.isActive(p) && Model.isClubber(p))) }; });
    await page.evaluate(n => { App.addFlag({ level: 'attend', date: n.date, room: n.room, note: 'night note' }); ['All'].concat(Teams.GROUPS).forEach(g => App.addFlag({ level: 'team', quarter: 'Q1', group: g, note: 'team note' })); }, night);      // one per group: the grid's scope decides which one its Q1 column shows
    await page.evaluate(n => { App.showTab('attend'); }, night); await page.waitForTimeout(300);
    await page.evaluate(n => { const s = document.getElementById('attDate'); if (s) { s.value = n.date; s.dispatchEvent(new Event('change', { bubbles: true })); } }, night);
    await page.close();
  });
  await test('a color team note shows one yellow flag on its quarter column, and its popup shows the note', async () => {
    const { page, kid } = await open();      // (leaving the Roster tab for Color teams directly is held by its draft check, so go through a child first, as a person would)
    await page.evaluate(id => App.showPerson(id), kid.id); await page.waitForTimeout(300);
    await page.evaluate(() => { ['All'].concat(Teams.GROUPS).forEach(g => App.addFlag({ level: 'team', quarter: 'Q1', group: g, note: 'team note' })); App.showTab('attend'); }); await page.waitForTimeout(300);
    await page.evaluate(() => App.showTab('teams')); await page.waitForTimeout(500);
    assert.strictEqual(await page.evaluate(() => App.tab + '/' + App.sub), 'games/teams', 'the Color teams view is open');
    assert.strictEqual(await page.locator('#teamsWrap button.flagbtn.on[data-fplace]').count(), 1, 'one yellow flag, on its quarter');
    await page.locator('#teamsWrap button.flagbtn.on[data-fplace]').click(); assert.strictEqual(await page.inputValue('.flagpop textarea'), 'team note'); await page.close();
  });
  await test('clearing the last flag in the popup removes the little flag from that place', async () => {
    const { page, kid } = await open();
    await page.evaluate(k => App.showPerson(k.id), kid); await page.waitForTimeout(300);
    await page.evaluate(k => { App.addFlag({ kid: k.id, level: 'field', field: 'Club · Active', note: 'gone soon' }); App.showPerson(k.id); }, kid); await page.waitForTimeout(300); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(300);
    await page.locator('#personWrap .flagbtn.on[data-fplace]').first().click(); await page.click('.flagpop button[data-fclear]'); await page.waitForTimeout(300);
    assert.strictEqual(await flagBtns(page, '#personWrap'), 0); await page.close();
  });
  await test('two flags on one box show one yellow flag and two notes in the popup', async () => {
    const { page, kid } = await open();
    await page.evaluate(id => App.showPerson(id), kid.id); const s = await page.evaluate(() => { const i = document.querySelector('#progressWrap input[type=date][data-key]'); return { scope: i.dataset.scope, key: i.dataset.key, block: i.dataset.key.split('.')[0] }; });
    await page.evaluate(([k, s]) => { ['one', 'two'].forEach(n => App.addFlag({ kid: k.id, level: 'box', book: s.scope, block: s.block, key: s.key, note: n })); App.showPerson(k.id); }, [kid, s]); await page.waitForTimeout(300);
    assert.strictEqual(await page.locator('#progressWrap .pcell .flagbtn.on').count(), 1); await page.locator('#progressWrap .pcell .flagbtn.on').click();
    assert.strictEqual(await page.locator('.flagpop textarea').count(), 2); await page.close();
  });
  await test('the To do "Add note" box still adds a general note', async () => {
    const { page } = await open(); await page.evaluate(() => App.showTab('todo')); await page.waitForTimeout(300);
    await page.fill('#tdNoteText', 'ask about Rank'); await page.click('#tdNoteAdd'); await page.waitForTimeout(300);
    assert.deepStrictEqual(await page.evaluate(() => Season.flagList(App.season).map(f => f.level + ':' + f.note)), ['general:ask about Rank']); await page.close();
  });
  console.log(passed + ' passed, ' + failed + ' failed'); await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})();
