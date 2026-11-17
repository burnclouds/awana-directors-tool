// Color teams: the balance panel, the move box with history and warnings, the (i) note, and Options > Add an earlier year / the blend knob (Chromium). Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/team-balance-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
const TODAY = '2026-12-20';      // Q1 and Q2 are locked (started), Q3 ready, Q4 projected
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const open = async viewport => {
    const page = await (await browser.newContext(viewport ? { viewport, hasTouch: true } : {})).newPage(), errs = []; page.setDefaultTimeout(12000); page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    await page.evaluate(t => { App.today = () => t; }, TODAY); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('#teamsWrap .tg', { timeout: 4000 });
    return { page, errs };
  };
  await test('the balance panel shows each color for a group and quarter, and follows the quarter pills', async () => {
    const { page, errs } = await open(); await page.waitForSelector('.tgbaltbl');
    assert.strictEqual(await page.$$eval('.tgbaltbl tbody tr', r => r.length) % 4, 0, 'four colors per group');
    const head = await page.$$eval('.tgbaltbl thead th', e => e.map(x => x.textContent)); assert(head.includes('Expected a night') && head.includes('Against the average') && head.includes('Children'), head.join('|'));
    const gridQ = await page.inputValue('#tQuarter'); assert.strictEqual(await page.getAttribute('[data-tgbq="' + gridQ + '"]', 'aria-pressed'), 'true', 'starts on the quarter the grid shows (UX-15), ' + gridQ);
    await page.click('[data-tgbq="Q1"]'); await page.waitForTimeout(150); assert.strictEqual(await page.getAttribute('[data-tgbq="Q1"]', 'aria-pressed'), 'true'); assert(/Sparks|T&T/.test(await page.textContent('.tgbaltbl caption')));
    assert.deepStrictEqual(errs, []); await page.close();
  });
  await test('moving a child changes the panel live, and a lopsided team is said in plain words', async () => {
    const { page } = await open(); await page.click('[data-tgbq="Q4"]');
    // put every Sparks child with a color in Q4 on Red: the regulars (and everyone else) pile up on one team
    await page.evaluate(() => { App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'Sparks').forEach(p => { Model.setTeamChoice(App.master, p, 'Q4', 'Red'); }); App.touch(); App.refresh(); });
    await page.waitForSelector('[data-lopsided="Sparks"]'); const msg = await page.textContent('[data-lopsided="Sparks"]'); assert(/Red has the regulars|Red has/.test(msg), msg);
    await page.close();
  });
  await test('the move box shows turnout and the colors the child has had, suggests a color, only warns on a repeat, and records the move', async () => {
    const { page } = await open();
    const kid = await page.evaluate(() => { const b = document.querySelector('#teamsWrap .tg tbody tr[data-kid] button[data-tgmove="Q1"]'); return { id: b.dataset.kid, q1: Teams.effective(App.master.people.find(p => String(p[Model.X.ID]) === b.dataset.kid), 'Q1').color }; });
    await page.click('#teamsWrap button[data-tgmove="Q1"][data-kid="' + kid.id + '"]'); await page.waitForSelector('#dlg[open] #tgMvDate');
    assert(/Expected turnout/.test(await page.textContent('#dlg'))); assert(await page.$('#dlg .tgmvhist'));
    // This used to be wrapped in "if (sug)", so it passed with no suggestion at all. With only played colors counted as "had" (review A9) a child in a filled year always has an unused color to suggest.
    const sug = await page.$('#tgMvUse'); assert(sug, 'the move box suggests a color'); await sug.click(); assert(await page.$('#dlg input[name="tgMvTeam"]:checked'), 'the suggestion picks a color');
    const other = ['Red', 'Blue', 'Green', 'Yellow'].find(c => c !== kid.q1);
    // choosing the child's own other-quarter color is a warning, not a block
    const q2 = await page.evaluate(i => App.master.people.find(p => String(p[Model.X.ID]) === i)['team:Q2'], kid.id);
    if (q2 && q2 !== kid.q1) { await page.check('#dlg input[name="tgMvTeam"][value="' + q2 + '"]'); await page.waitForTimeout(100); assert(/already been/.test(await page.textContent('#tgMvWarn')), await page.textContent('#tgMvWarn')); }
    await page.check('#dlg input[name="tgMvTeam"][value="' + other + '"]'); await page.fill('#tgMvDate', '2026-10-14'); await page.click('#tgMvSave'); await page.waitForTimeout(250);
    assert.strictEqual(await page.$('#dlg[open]'), null, 'the box closes'); assert.strictEqual(await page.evaluate(i => ((App.season.teamMoves || {})[i] || []).length, kid.id), 1);
    await page.close();
  });
  await test('the (i) on the year grid explains how teams are decided and balanced', async () => {
    const { page } = await open(); const i = await page.$('#teamsWrap .info[data-info="games.balance"]'); assert(i, 'the (i) is there'); await i.click(); await page.waitForTimeout(200);
    const text = await page.evaluate(() => document.body.innerText); ['never repeats a color', 'Expected attendance', 'earlier years', 'pin', 'warns'].forEach(w => assert(new RegExp(w, 'i').test(text), 'the note says ' + w));
    await page.close();
  });
  await test('Options: Add an earlier year keeps counts only and never twice; the blend knob is stored only when changed', async () => {
    const { page } = await open();
    const old = await page.evaluate(() => { const s = Season.blank('2024-25'); s.calendar = [{ Date: '2024-09-11', Type: 'Club', Quarter: 'Q1', 'No Club': '' }, { Date: '2024-09-18', Type: 'Club', Quarter: 'Q1', 'No Club': '' }, { Date: '2024-09-25', Type: 'Club', Quarter: 'Q1', 'No Club': '' }];
      /* two CHILDREN (a night held only by volunteers does not count); the test club already carries earlier-year counts, so remember what is there now */
      const ids = Object.keys(App.season.roster.people).filter(id => { const x = App.master.people.find(y => y[Model.X.ID] === id); return x && Model.isClubber(x); }).slice(0, 2); window.__ids = ids; window.__before = JSON.parse(JSON.stringify(App.season.pastTurnout || {})); s.roster = { cols: [], people: {} }; ids.forEach(id => { s.roster.people[id] = { pc: {}, v: {} }; ['2024-09-11', '2024-09-18', '2024-09-25'].forEach(d => Season.setMark(s, d, id, 'a', 1, 'Sparks')); }); return Season.toJson(s); });
    await page.evaluate(() => App.showTab('options')); await page.waitForSelector('#fileEarlierYear', { state: 'attached' });
    await page.setInputFiles('#fileEarlierYear', { name: 'awana-2024-25-20250601-120000.json', mimeType: 'application/json', buffer: Buffer.from(old) }); await page.waitForTimeout(400);
    const after1 = await page.evaluate(() => ({ ids: window.__ids, before: window.__before, now: JSON.parse(JSON.stringify(App.season.pastTurnout || {})) }));
    assert.strictEqual(after1.ids.length, 2, 'two children in the earlier-year file');
    after1.ids.forEach(id => { const b = after1.before[id] || [], n = after1.now[id] || []; assert.strictEqual(n.length, b.length + 1, 'one year added for a child'); assert.deepStrictEqual(n.find(x => x.year === '2024-25'), { year: '2024-25', nights: 3, came: 3 }, 'counts only: the year, nights and came'); });
    Object.keys(after1.now).filter(id => !after1.ids.includes(id)).forEach(id => assert.deepStrictEqual(after1.now[id], after1.before[id], 'everyone else is unchanged'));
    await page.setInputFiles('#fileEarlierYear', { name: 'again.json', mimeType: 'application/json', buffer: Buffer.from(old) }); await page.waitForTimeout(400);
    assert.deepStrictEqual(await page.evaluate(() => JSON.parse(JSON.stringify(App.season.pastTurnout || {}))), after1.now, 'the same year is not added twice');
    assert.strictEqual(await page.evaluate(() => (App.season.config.teamPlan || {}).blendNights), undefined);
    await page.fill('#optBlend', '12'); await page.dispatchEvent('#optBlend', 'change'); await page.waitForTimeout(200); assert.strictEqual(await page.evaluate(() => App.season.config.teamPlan.blendNights), 12);
    await page.fill('#optBlend', '20'); await page.dispatchEvent('#optBlend', 'change'); await page.waitForTimeout(200); assert.strictEqual(await page.evaluate(() => (App.season.config.teamPlan || {}).blendNights), undefined, 'the default is not stored');
    await page.close();
  });
  await test('on a phone the move box choices are 44px tall', async () => {
    const { page } = await open({ width: 375, height: 667 }); await page.click('#teamsWrap button[data-tgmove="Q1"] >> nth=0'); await page.waitForSelector('#dlg[open] #tgMvDate');
    const h = await page.$$eval('#dlg .tgmvopts label', e => e.map(x => x.getBoundingClientRect().height)); assert(h.length === 4 && h.every(x => x >= 43.5), h.join()); await page.close();
  });
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
