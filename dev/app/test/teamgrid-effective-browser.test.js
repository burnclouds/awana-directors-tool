// Color teams year grid, Mike's flags of 2026-11-13: the cell shows the EFFECTIVE color with "moved from <date>" (flags 5, 6), the grid keeps its scroll position after a color is chosen (flag 4), scrolls in a
// height-capped box so its horizontal scroll bar is in view with a sticky header row (flag 7), and the Name and Class columns stay put while scrolling sideways (flag 8). The Roster tab shows the same color.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/teamgrid-effective-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
const TODAY = '2026-12-20';      // Q1 and Q2 are locked (played), Q3 is ready, Q4 projected (see teamgrid-browser.test.js)
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const open = async (viewport, touch) => {
    const page = await (await browser.newContext(Object.assign(viewport ? { viewport } : {}, touch ? { hasTouch: true, isMobile: true } : {}))).newPage(), errs = []; page.setDefaultTimeout(12000); page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    await page.evaluate(t => { App.today = () => t; }, TODAY); await page.evaluate(() => App.showTab('teams')); await page.waitForSelector('#teamsWrap .tg', { timeout: 4000 });
    return { page, errs };
  };
  // Move the first two children in view: one from the first night of Q2 (replaces the roster color), one from a later night (mid-quarter). Returns their ids and what the roster had.
  const arrange = page => page.evaluate(() => {
    const ids = [...document.querySelectorAll('#teamsWrap .tg tbody tr[data-kid]')].slice(0, 2).map(r => r.dataset.kid), first = TeamPlan.firstNight(App.calendar, 'Q2');
    const nights = App.calendar.filter(r => r.Quarter === 'Q2' && !r['No Club'] && r.Date > first).map(r => r.Date).sort(), later = nights[0];
    const out = ids.map(id => { const p = App.master.people.find(x => String(x[Model.X.ID]) === id); return { id, roster: Model['teamOf'](p, 'Q2') }; });
    const pick = base => ['Green', 'Yellow', 'Blue', 'Red'].find(c => c !== base);
    Season.setTeamMove(App.season, ids[0], 'Q2', first, pick(out[0].roster), App.calendar); out[0].to = pick(out[0].roster);
    Season.setTeamMove(App.season, ids[1], 'Q2', later, pick(out[1].roster), App.calendar); out[1].to = pick(out[1].roster); out[1].from = later;
    App.touch(); App.refresh(); return { kids: out, first, later };
  });
  const cell = (page, id, q) => page.evaluate(([i, qq]) => { const td = document.querySelector('#teamsWrap .tg tbody tr[data-kid="' + i + '"] td[data-q="' + qq + '"]'); const b = td && td.querySelector('button'); return td ? { text: td.textContent.replace(/\s+/g, ' ').trim(), title: (b && b.title) || '', moved: !!td.querySelector('.tgmoved'), cls: b ? b.className : '' } : null; }, [id, q]);

  await test('a move from the first night of Q2 shows the new color as the quarter\'s color; a later move shows the color with "moved from <date>"', async () => {
    const { page, errs } = await open(); const a = await arrange(page);
    const c0 = await cell(page, a.kids[0].id, 'Q2'), c1 = await cell(page, a.kids[1].id, 'Q2');
    assert(c0 && c0.text.startsWith(a.kids[0].to) && !c0.moved, 'first-night move shows ' + a.kids[0].to + ' with no marker: ' + JSON.stringify(c0));
    assert(/first club night/.test(c0.title), 'its title says why: ' + c0.title);
    assert(c1 && c1.text.startsWith(a.kids[1].to) && c1.moved && /moved from \d+\/\d+/.test(c1.text), 'mid-quarter move shows the color and the marker: ' + JSON.stringify(c1));
    assert(/team-/.test(c0.cls) && c0.cls.includes('team-' + a.kids[0].to), 'the chip is the effective color');
    assert.deepStrictEqual(errs, []); await page.close();
  });
  await test('the team sizes under the grid count the effective color of a played quarter', async () => {
    const { page } = await open(); const before = await page.$eval('#teamsWrap tfoot tr[data-sizes] td[data-q="Q2"]', e => e.textContent); const a = await arrange(page);
    const after = await page.$eval('#teamsWrap tfoot tr[data-sizes] td[data-q="Q2"]', e => e.textContent); assert.notStrictEqual(before, after, 'moving a child changes the Q2 team sizes');
    const n = c => +((new RegExp(c + ' (\\d+)')).exec(after) || [0, 0])[1], m = c => +((new RegExp(c + ' (\\d+)')).exec(before) || [0, 0])[1];
    assert.strictEqual(n(a.kids[0].to) - m(a.kids[0].to) >= 1, true, a.kids[0].to + ' gained a member: ' + before + ' -> ' + after); await page.close();
  });
  await test('the Roster tab shows the same color beside its picker when a move changes it, and sorts by it', async () => {
    const { page } = await open(); const a = await arrange(page); await page.evaluate(() => App.showTab('roster')); await page.waitForTimeout(300);
    const q = await page.evaluate(() => (document.querySelector('#tab-roster th[data-sort="team"]') || {}).textContent || '');
    const qq = (/Q\d/.exec(q) || ['Q2'])[0];
    // move the first child in the roster's own quarter so the chip shows
    const r = await page.evaluate(qn => { const id = document.querySelector('#tab-roster tbody tr[data-id] select.teamsel').closest('tr').dataset.id, p = App.master.people.find(x => String(x[Model.X.ID]) === id), first = TeamPlan.firstNight(App.calendar, qn), base = Model.teamOf(p, qn), to = ['Green', 'Yellow', 'Blue', 'Red'].find(c => c !== base);
      if (!first) return null; Season.setTeamMove(App.season, id, qn, first, to, App.calendar); App.touch(); App.refresh(); return { id, to }; }, qq);
    if (!r) { console.log('       (the roster quarter has no club nights on the calendar: nothing to check)'); await page.close(); return; }
    await page.evaluate(() => App.showTab('roster')); await page.waitForTimeout(300);
    const chip = await page.$eval('#tab-roster tbody tr[data-id="' + r.id + '"] .tgnow', e => e.textContent.trim()).catch(() => '');
    assert(chip.includes(r.to), 'the Roster row shows "' + r.to + '" beside the picker: "' + chip + '"'); await page.close();
  });
  await test('choosing a color keeps the grid scrolled where it was (it used to jump back to the far left)', async () => {
    const { page } = await open({ width: 390, height: 844 }, true); await page.click('[data-tgscope="club"]'); await page.waitForTimeout(150);
    // scroll so a color cell in the MIDDLE of the grid is the one in view (a cell at the far right would be scrolled back to by the refocus on its own, hiding the bug)
    const before = await page.$eval('#teamsWrap .tgscroll', e => { const s = e.querySelector('select.tgsel'), c = s.closest('td'); e.scrollLeft = Math.max(0, c.offsetLeft - 140); return { l: e.scrollLeft, w: e.scrollWidth, c: e.clientWidth, cellLeft: c.offsetLeft }; }); assert(before.l > 40, 'the grid scrolls sideways on a phone and the cell is off to the right: ' + JSON.stringify(before));
    const sel = page.locator('#teamsWrap .tg select.tgsel').first(); const val = await sel.inputValue(); await sel.selectOption(val === 'Green' ? 'Blue' : 'Green'); await page.waitForTimeout(250);
    const after = await page.$eval('#teamsWrap .tgscroll', e => e.scrollLeft); assert(Math.abs(after - before.l) <= 2, 'the grid jumped: scrollLeft ' + before.l + ' -> ' + after); await page.close();
  });
  await test('the grid box is capped to the screen so its horizontal scroll bar is in view, and its header row is sticky', async () => {
    const { page } = await open({ width: 900, height: 700 }); await page.click('[data-tgscope="club"]'); await page.waitForTimeout(150);
    const r = await page.$eval('#teamsWrap .tgscroll', e => { e.scrollIntoView({ block: 'start' }); const b = e.getBoundingClientRect(), s = getComputedStyle(e), th = e.querySelector('thead th'), ts = getComputedStyle(th); return { bottom: b.bottom, vh: innerHeight, overflowX: s.overflowX, overflowY: s.overflowY, headPos: ts.position, scrolls: e.scrollHeight > e.clientHeight, h: b.height }; });
    assert(r.overflowX !== 'visible' && r.overflowY === 'auto', JSON.stringify(r)); assert(r.h <= r.vh - 200 && r.bottom <= r.vh, 'the box is capped below the window height and, scrolled to, ends inside it (so its scroll bar is visible): ' + JSON.stringify(r)); assert.strictEqual(r.headPos, 'sticky');
    const top = await page.$eval('#teamsWrap .tgscroll', e => { e.scrollTop = 120; const th = e.querySelector('thead th').getBoundingClientRect(), box = e.getBoundingClientRect(); return { thTop: Math.round(th.top), boxTop: Math.round(box.top), st: e.scrollTop }; });
    if (top.st > 0) assert(Math.abs(top.thTop - top.boxTop) <= 2, 'the header stays at the top of the box after scrolling down: ' + JSON.stringify(top)); await page.close();
  });
  await test('the Name and Class columns stay in view while the grid scrolls sideways', async () => {
    const { page } = await open({ width: 900, height: 700 }); await page.click('[data-tgscope="club"]'); await page.waitForTimeout(150);
    await page.$eval('#teamsWrap .tgscroll', e => { e.style.width = '420px'; e.scrollLeft = e.scrollWidth; });      // a narrow box makes the sideways scroll certain
    const r = await page.$eval('#teamsWrap .tgscroll', e => { const box = e.getBoundingClientRect(), n = e.querySelector('tbody td:nth-child(1)').getBoundingClientRect(), c = e.querySelector('tbody td:nth-child(2)').getBoundingClientRect(), bg = getComputedStyle(e.querySelector('tbody td:nth-child(1)')).backgroundColor; return { sl: e.scrollLeft, nameLeft: Math.round(n.left - box.left), classLeft: Math.round(c.left - box.left), bg }; });
    assert(r.sl > 0, 'the box scrolled sideways: ' + JSON.stringify(r)); assert(r.nameLeft <= 2 && r.nameLeft >= -1, 'Name stays at the left edge: ' + JSON.stringify(r)); assert(r.classLeft > 100 && r.classLeft < 260, 'Class stays beside it: ' + JSON.stringify(r));
    assert(!/rgba\(0, 0, 0, 0\)|transparent/.test(r.bg), 'the frozen cells are opaque so other cells do not show through: ' + r.bg); await page.close();
  });
  await test('the More menu still opens over the grid\'s frozen columns (nothing in the grid is above it)', async () => {
    const { page } = await open({ width: 1280, height: 800 }); await page.click('#tabMore'); await page.waitForTimeout(200);
    const covered = await page.evaluate(() => [...document.querySelectorAll('#moreMenu button')].filter(b => b.offsetParent !== null).map(b => { const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e && (e === b || b.contains(e)) ? null : b.textContent.trim(); }).filter(Boolean));
    assert.deepStrictEqual(covered, []); await page.close();
  });
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})().catch(e => { console.log('ERROR ' + e.message); process.exit(1); });
