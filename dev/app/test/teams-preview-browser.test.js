// Fill (year grid) and Assign blanks (Color teams tab) show a preview first (BACKLOG T5): every child who would get a color, any warning, and Confirm / Draw again / Cancel.
// Cancel changes nothing; Confirm writes exactly the rows shown; locked quarters, pins and No team children are untouched; at 390px the buttons are 44px and nothing scrolls sideways.
// Also BACKLOG T1: the "calendar still has last season's dates" notice on Color teams and To do. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/teams-preview-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
const TODAY = '2026-12-20';      // Q1 and Q2 are locked (started), Q3 ready to lock, Q4 projected
const STALE = 'The calendar still has last season\'s dates. Replace it before planning teams.';
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const open = async (viewport, today) => {
    const page = await (await browser.newContext(viewport ? { viewport, hasTouch: true } : {})).newPage(), errs = []; page.setDefaultTimeout(12000); page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    await page.evaluate(t => { App.today = () => t; }, today || TODAY); return { page, errs };
  };
  // Q3 and Q4 blank for every Sparks/T&T child; one child has "No team" in Q3, one has a hand-set Q4 pin. Returns their ids.
  const blankOut = page => page.evaluate(() => {
    const kids = App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && ['Sparks', 'T&T'].includes(Model.groupOf(Model.room(p))));
    kids.forEach(p => { p['team:Q3'] = ''; p['team:Q4'] = ''; });
    const noTeam = kids[0], pin = kids[1]; Model.setTeamChoice(App.master, noTeam, 'Q3', Model.NO_TEAM); Model.setTeamChoice(App.master, pin, 'Q4', 'Blue');
    App.touch(); App.refresh(); App.showTab('teams'); return { noTeam: String(noTeam[Model.X.ID]), pin: String(pin[Model.X.ID]), n: kids.length };
  });
  const snap = page => page.evaluate(() => JSON.stringify([App.master.people, App.master.userCols, App.season.config, App.season.teamMoves]));
  const cells = page => page.evaluate(() => Object.fromEntries(App.master.people.map(p => [String(p[Model.X.ID]), ['Q1', 'Q2', 'Q3', 'Q4'].map(q => p['team:' + q] || '')])));
  const rowsOf = page => page.$$eval('#dlg table.tgprev tbody tr', trs => trs.map(t => [t.dataset.kid, t.dataset.q, t.querySelector('.team').textContent.trim()]));
  const fillOpen = async page => { await page.waitForSelector('[data-tgfill]'); await page.click('[data-tgfill]'); await page.waitForSelector('#dlg[open] #tgPrevOk'); };
  const assignOpen = async page => { await page.selectOption('#tQuarter', 'Q3'); await page.click('#btnTeamFill'); await page.waitForSelector('#dlg[open] #tgPrevOk'); };
  const drawAgain = async (page, before) => {      // press Draw again until the proposal differs (a new seed can, rarely, give the same colors)
    for (let i = 0; i < 12; i++) { await page.click('#tgPrevAgain'); const r = await rowsOf(page); if (JSON.stringify(r) !== JSON.stringify(before)) return r; }
    throw new Error('Draw again never changed the proposal');
  };
  const sortRows = r => r.map(x => x.join('|')).sort();

  for (const kind of ['Fill', 'Assign blanks']) {
    const start = async (viewport) => { const o = await open(viewport); const ids = await blankOut(o.page); await o.page.waitForSelector('#teamsWrap .tg'); if (kind === 'Fill') await fillOpen(o.page); else await assignOpen(o.page); return Object.assign(o, { ids }); };
    const quarters = kind === 'Fill' ? ['Q3', 'Q4'] : ['Q3'];

    await test(kind + ': the preview lists each child with class, quarter and color, and the warning area is there', async () => {
      const { page, errs, ids } = await start(); const rows = await rowsOf(page);
      assert(rows.length > 20, 'rows: ' + rows.length); assert(rows.every(r => quarters.includes(r[1]) && ['Red', 'Blue', 'Green', 'Yellow'].includes(r[2])), 'quarter and color on every row');
      const th = await page.$$eval('#dlg table.tgprev thead th', e => e.map(x => x.textContent)); assert.deepStrictEqual(th, ['Child', 'Class', 'Quarter', 'Color']);
      assert(await page.$('#tgPrevWarn'), 'warning area'); assert(!rows.some(r => r[0] === ids.noTeam && r[1] === 'Q3'), 'No team child is not listed');
      assert(!rows.some(r => r[0] === ids.pin && r[1] === 'Q4'), 'the pinned Q4 is not listed'); assert(rows.every(r => r[1] !== 'Q1' && r[1] !== 'Q2'), 'locked quarters are not listed');
      assert.deepStrictEqual(errs, []); await page.close();
    });
    await test(kind + ': Cancel leaves every child\'s colors byte-identical', async () => {
      const { page, errs } = await start(); const before = await snap(page);
      await page.click('#tgPrevCancel'); await page.waitForTimeout(200);
      assert.strictEqual(await page.$('#dlg[open]'), null, 'the dialog closes'); assert.strictEqual(await snap(page), before, 'the data changed after Cancel');
      assert.deepStrictEqual(errs, []); await page.close();
    });
    await test(kind + ': Draw again alone changes nothing in the data', async () => {
      const { page } = await start(); const before = await snap(page), r0 = await rowsOf(page); await drawAgain(page, r0);
      assert.strictEqual(await snap(page), before, 'the data changed after Draw again'); await page.close();
    });
    await test(kind + ': Confirm applies exactly the rows shown; the locked quarters, the pin and the No team child stay', async () => {
      const { page, errs, ids } = await start(); const before = await cells(page), rows = await rowsOf(page);
      await page.click('#tgPrevOk'); await page.waitForTimeout(300); assert.strictEqual(await page.$('#dlg[open]'), null);
      const after = await cells(page); let changed = [];
      Object.keys(after).forEach(id => after[id].forEach((c, i) => { if (c !== before[id][i]) changed.push(id + '|Q' + (i + 1) + '|' + c); }));
      assert.deepStrictEqual(changed.sort(), sortRows(rows), 'what changed is exactly what the preview listed');
      Object.keys(after).forEach(id => { assert.deepStrictEqual(after[id].slice(0, 2), before[id].slice(0, 2), 'a locked quarter changed'); });
      assert.strictEqual(after[ids.pin][3], before[ids.pin][3], 'the pin'); assert.strictEqual(after[ids.noTeam][2], before[ids.noTeam][2], 'the No team mark');
      assert.strictEqual(await page.evaluate(id => Model.noTeam(App.master.people.find(p => String(p[Model.X.ID]) === id), 'Q3'), ids.noTeam), true, 'still marked No team');
      assert.deepStrictEqual(errs, []); await page.close();
    });
    await test(kind + ': Draw again changes the proposal, and Confirm then applies the new one, not the first', async () => {
      const { page, errs } = await start(); const first = await rowsOf(page), second = await drawAgain(page, first), before = await cells(page);
      await page.click('#tgPrevOk'); await page.waitForTimeout(300);
      const after = await cells(page), changed = []; Object.keys(after).forEach(id => after[id].forEach((c, i) => { if (c !== before[id][i]) changed.push(id + '|Q' + (i + 1) + '|' + c); }));
      assert.deepStrictEqual(changed.sort(), sortRows(second), 'applied the redrawn list'); assert.notDeepStrictEqual(changed.sort(), sortRows(first), 'not the first list');
      assert.deepStrictEqual(errs, []); await page.close();
    });
    await test(kind + ' at 390px: the buttons are at least 44px high, the dialog scrolls and the page does not scroll sideways', async () => {
      const { page, errs } = await start({ width: 390, height: 700 });
      const m = await page.evaluate(() => { const d = document.getElementById('dlg'), bs = [...d.querySelectorAll('.dlgbtns button')]; return { h: bs.map(b => b.getBoundingClientRect().height), n: bs.length, dw: d.scrollWidth - d.clientWidth, pw: document.documentElement.scrollWidth - window.innerWidth, dlgH: d.getBoundingClientRect().height, tall: d.scrollHeight > d.clientHeight, ov: getComputedStyle(d).overflowY, right: Math.max(...bs.map(b => b.getBoundingClientRect().right)) }; });
      assert.strictEqual(m.n, 3, 'Cancel, Draw again, Confirm'); assert(m.h.every(h => h >= 44), 'button heights ' + m.h.join(','));
      assert(m.dw <= 1, 'the dialog scrolls sideways by ' + m.dw); assert(m.pw <= 1, 'the page scrolls sideways by ' + m.pw); assert(m.right <= 390, 'a button runs off the screen');
      assert(m.dlgH <= 700 && /auto|scroll/.test(m.ov), 'the dialog fits the screen and scrolls: ' + m.dlgH + ' ' + m.ov);
      assert.deepStrictEqual(errs, []); await page.close();
    });
  }

  // ---------- T1: the stale calendar notice ----------
  const lastNight = page => page.evaluate(() => Calendar.nights(App.calendar).map(r => r.Date).sort().pop());
  await test('calendar notice: shown on Color teams and To do when every club night is in the past', async () => {
    const { page, errs } = await open(null, '2031-01-01');
    await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('#teamsWrap .stalecal'); assert.strictEqual((await page.textContent('#teamsWrap .stalecal b')).trim(), STALE);
    await page.evaluate(() => App.showTab('todo')); await page.waitForSelector('#todoWrap .stalecal'); assert.strictEqual((await page.textContent('#todoWrap .stalecal b')).trim(), STALE);
    assert.deepStrictEqual(errs, []); await page.close();
  });
  await test('calendar notice: shown for an empty calendar', async () => {
    const { page } = await open(); await page.evaluate(() => { App.calendar.splice(0); App.showTab('teams'); App.refresh(); }); await page.waitForSelector('#teamsWrap .stalecal'); await page.close();
  });
  await test('calendar notice: hidden when a club night is today or later, including exactly today', async () => {
    const { page, errs } = await open(); const last = await lastNight(page);
    for (const day of [TODAY, last]) {
      await page.evaluate(d => { App.today = () => d; App.showTab('teams'); App.refresh(); }, day); await page.waitForSelector('#teamsWrap .tg');
      assert.strictEqual(await page.$('#teamsWrap .stalecal'), null, 'teams, today ' + day);
      await page.evaluate(() => App.showTab('todo')); await page.waitForTimeout(150); assert.strictEqual(await page.$('#todoWrap .stalecal'), null, 'todo, today ' + day);
    }
    const next = await page.evaluate(d => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); }, last);
    await page.evaluate(d => { App.today = () => d; App.showTab('teams'); App.refresh(); }, next); await page.waitForSelector('#teamsWrap .stalecal');
    assert.deepStrictEqual(errs, []); await page.close();
  });
  await test('calendar notice: the button opens the Calendar tab (from Color teams and from To do)', async () => {
    const { page, errs } = await open(null, '2031-01-01');
    for (const tab of ['teams', 'todo']) {
      await page.evaluate(t => App.showTab(t), tab); await page.waitForSelector('.stalecal button[data-stalecal]'); await page.click((tab === 'teams' ? '#teamsWrap' : '#todoWrap') + ' .stalecal button');
      await page.waitForTimeout(150); assert.strictEqual(await page.evaluate(() => App.tab), 'calendar', 'from ' + tab); assert(await page.isVisible('#tab-calendar'), 'the Calendar is showing');
    }
    assert.deepStrictEqual(errs, []); await page.close();
  });

  await browser.close(); server.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
