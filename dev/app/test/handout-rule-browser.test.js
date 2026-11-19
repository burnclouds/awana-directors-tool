// The hand-out rule ("earned or recorded by hand, and not Given; not ignored; not end-of-year") is the same on the Award strips, the Awards tab To hand out list and its badges; the Awards tab shows "no date" for a no-date award; the weekly slips are retired; the strips fit a phone and print is unchanged.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/handout-rule-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
setTimeout(() => { console.log('timed out'); process.exit(2); }, 170000).unref();
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async (w, h, mobile) => { const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: !!mobile, hasTouch: !!mobile }), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
    await page.goto(url); await page.evaluate(() => { App.today = () => '2026-11-18'; }); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); return { page, ctx, errs }; };
  const { page, ctx, errs } = await open(1366, 900);
  // One Sparks child per case, each with nothing open to start with.
  const cases = await page.evaluate(() => { const s = App.season, M = Model, kids = App.master.people.filter(p => M.isActive(p) && M.isClubber(p) && M.groupOf(M.room(p)) === 'Sparks');
    const clean = kids.filter(p => Season.toHandOut(s, p[M.X.ID], 'Sparks', App.calendar).length === 0 && Season.pendingAwards(s, p[M.X.ID], 'Sparks', App.calendar).length === 0);
    const sign = (id, d, nd) => { const keys = ['GJ1.1', 'GJ1.2', 'GJ1.3', 'GJ1.4']; if (nd) Season.markSignsNoDate(s, id, 'HG', keys, d); else keys.forEach(k => Season.setProgress(s, id, 'HG', k, d)); };
    const C = [], use = (name, want, fn) => { const p = clean[C.length]; fn(p[M.X.ID]); C.push({ name, want, id: p[M.X.ID], child: M.fullName(p) }); };
    use('A earned with a date', true, id => sign(id, '2026-10-21'));
    use('B earned, no-date sign-off', true, id => sign(id, '2026-10-21', true));
    use('C announced by hand only', true, id => Season.addAward(s, '2026-10-21', id, 'Test Hand Award'));
    use('D ignored award earned', false, id => ['1', '2', '3', '4', '5', '6'].forEach(i => Season.setProgress(s, id, 'common', 'FLT.' + i, '2026-10-21')));
    use('E end-of-year award', false, id => Season.addAward(s, '2026-10-21', id, '1st Book Award Medallion'));
    use('F given with a date', false, id => { sign(id, '2026-10-21'); Season.setGiven(s, id, 'HG Green Jewel 1', '2026-10-28'); });
    use('G given with the no-date tick', false, id => { sign(id, '2026-10-21'); Season.setGiven(s, id, 'HG Green Jewel 1', '2026-10-28', { noDate: true }); });
    use('H earlier year, never announced or given', false, id => sign(id, '2026-05-06'));
    use('I earlier year, announced, not given', true, id => { sign(id, '2026-05-06'); Season.addAward(s, '2026-05-13', id, 'HG Green Jewel 1'); });
    use('J earned and held', true, id => { sign(id, '2026-10-21'); Season.setHold(s, id, 'HG Green Jewel 1', true); });
    use('K earned and announced', true, id => { sign(id, '2026-10-21'); Season.addAward(s, '2026-10-28', id, 'HG Green Jewel 1'); });
    use('L ignored award announced by hand', false, id => Season.addAward(s, '2026-10-21', id, 'Flight 3:16'));
    use('M earned three weeks ago', true, id => sign(id, '2026-10-01'));
    App.touch(); return C; });
  assert(cases.length === 13, 'seeded ' + cases.length);
  await page.evaluate(() => App.showTab('reports')); await page.evaluate(() => { App.showReport('handOut'); App.reportOptions({ group: '', room: '' }); }); await page.waitForTimeout(700);
  const strips = await page.$$eval('#report .strip', s => s.map(x => ({ name: x.querySelector('.stripname b').textContent.replace(' (continued)', ''), lines: [...x.querySelectorAll('.stlabel')].map(l => l.textContent.replace(/\s+/g, ' ').trim()) })));
  const note = await page.$eval('#report .sheet .sub', e => e.textContent).catch(() => '');
  await page.evaluate(() => App.showTab('awards')); await page.waitForTimeout(300); const hand = await page.$$eval('#awSubs button[data-awsub]', b => b.map(x => x.dataset.awsub).find(x => /hand/i.test(x))); await page.click('#awSubs button[data-awsub="' + hand + '"]'); await page.waitForTimeout(300);
  const tab = await page.$$eval('#awSecHand tbody tr[data-id]', r => r.map(x => ({ id: x.dataset.id, award: x.children[2].textContent, earned: x.children[3].textContent, announced: x.children[4].textContent })));
  const badge = +(await page.$eval('#awSubs button[data-awsub="' + hand + '"] .badge', e => e.textContent)) || 0;
  await test('every seeded case agrees: the strips, the Awards tab list and Season.toHandOut hold the same awards (A to M)', async () => {
    for (const c of cases) {
      const onStrip = strips.filter(s => s.name === c.child).reduce((n, s) => n + s.lines.length, 0), onTab = tab.filter(t => t.id === c.id).length, rule = await page.evaluate(id => Season.toHandOut(App.season, id, 'Sparks', App.calendar).length, c.id);
      assert.strictEqual(onStrip > 0, c.want, c.name + ': strip ' + onStrip); assert.strictEqual(onTab > 0, c.want, c.name + ': Awards tab ' + onTab); assert.strictEqual(rule > 0, c.want, c.name + ': rule ' + rule); assert.strictEqual(onStrip, onTab, c.name + ': strip and tab count the same');
    }
  });
  await test('the Awards tab badge, its list and the strip award lines are the same number, and the top Awards badge holds every one of them', async () => {
    const lines = strips.reduce((n, s) => n + s.lines.length, 0); assert.strictEqual(badge, tab.length, 'badge ' + badge + ' vs list ' + tab.length); assert.strictEqual(lines, tab.length, 'strips ' + lines + ' vs list ' + tab.length);
    const give = await page.evaluate(() => App.awardsToGive ? App.awardsToGive().length : -1); assert(give >= tab.length, 'the top badge counts at least the hand-out rows: ' + give);
  });
  await test('B: an award earned with the no-date sign-off reads "no date" on the Awards tab (never the made-up day) and "no date" on the strip', async () => {
    const b = cases.find(c => /^B /.test(c.name)), row = tab.find(t => t.id === b.id); assert(row && /no date/i.test(row.earned) && !/10\/21|10\/20/.test(row.earned), 'Awards tab Earned: ' + (row && row.earned));
    const strip = strips.find(s => s.name === b.child); assert(strip && /no date/.test(strip.lines.join(' ')), 'strip: ' + (strip && strip.lines.join('|')));
  });
  await test('E (N27): the strips print no grey note (no tally, no end-of-year count); the ignored awards are on no strip', async () => {
    assert(!note.trim(), 'a note is still printed: ' + note.slice(0, 120)); const tally = await page.$eval('#awSecHand p.status', e => e.textContent).catch(() => ''); assert(!/Flight 3:16/.test(tally), 'ignored awards in the tally');
  });
  await test('the weekly award slips are retired: no report of that name, no Night picker, showReport of it is harmless, a bundle naming it skips it', async () => {
    const before = errs.length; await page.evaluate(() => { App.showTab('reports'); App.showReport('weeklySlips'); }); await page.waitForTimeout(300);
    assert.strictEqual(await page.locator('#oDateSel').count(), 0); assert(!(await page.evaluate(() => Reports.LIST.some(r => r.id === 'weeklySlips')))); assert.strictEqual(errs.length, before, 'no page error: ' + errs.slice(before).join(' | '));
    const items = await page.evaluate(() => Reports.bundlesOf({ config: { bundles: [{ name: 'Old', items: [{ report: 'weeklySlips' }, { report: 'attendance' }] }] } })[0].items.map(i => i.report)); assert.deepStrictEqual(items, ['attendance']);
  });
  await test('a bundled Awards to hand out prints every group (the hidden Group picker does not narrow it)', async () => {
    const n = await page.evaluate(() => { const ctx = { master: App.master, settings: { quarter: 'Q2' }, calendar: App.calendar, rotation: [], season: App.season, today: '2026-11-18', opts: { group: 'Cubbies' } }; const html = Reports.runBundle(ctx, { name: 'x', items: [{ report: 'handOut' }] }, 'Q2'); return (html.match(/class="strip"/g) || []).length; });
    assert(n >= strips.length, 'bundle strips ' + n + ' vs report strips ' + strips.length);
  });
  await ctx.close();
  await test('phone 390: one strip per row at the screen width (up to 4.5in), lined up, no sideways scroll, a long name keeps its class on its own line; on paper (a paper-wide window) it is unchanged: two across at 4.5in', async () => {
    const { page: p, ctx: c2, errs: e2 } = await open(390, 844, true);
    await p.evaluate(() => { const s = App.season, M = Model; const k = App.master.people.filter(x => M.isActive(x) && M.isClubber(x) && M.groupOf(M.room(x)) === 'T&T').slice(0, 3); k.forEach((x, i) => { for (let j = 0; j <= i; j++) Season.addAward(s, '2026-10-21', x[M.X.ID], 'Test Award ' + (j + 1)); }); App.touch(); App.showTab('reports'); App.showReport('handOut'); App.reportOptions({ group: '', room: '' }); }); await p.waitForTimeout(700);
    const g = await p.evaluate(() => { const s = [...document.querySelectorAll('#report .strip')].map(x => x.getBoundingClientRect()), rows = [...document.querySelectorAll('#report .striprow')].map(r => r.children.length), sheet = document.querySelector('#report .sheet'); return { n: s.length, widths: s.map(r => Math.round(r.width)), lefts: [...new Set(s.map(r => Math.round(r.left)))], maxRow: Math.max(...rows), docOk: document.documentElement.scrollWidth <= innerWidth, sheetOk: sheet.scrollWidth <= sheet.clientWidth + 1 }; });
    assert(g.n >= 3, 'strips: ' + g.n); assert(g.widths.every(w => w >= 280 && w <= 432), 'widths ' + g.widths.join(',')); assert.strictEqual(g.lefts.length, 1, 'lined up: ' + g.lefts.join(',')); assert.strictEqual(g.maxRow, 2, 'markup still pairs them (print)'); assert(g.docOk && g.sheetOk, 'no sideways scroll');
    const stacked = await p.evaluate(() => [...document.querySelectorAll('#report .striprow')].every(r => { const k = [...r.children].map(x => x.getBoundingClientRect().top); return k.length === 1 || Math.abs(k[1] - k[0]) > 2; })); assert(stacked, 'no two strips side by side on a phone');
    await p.setViewportSize({ width: 1100, height: 900 }); await p.waitForTimeout(200); await p.emulateMedia({ media: 'print' }); const pr = await p.evaluate(() => ({ w: [...new Set([...document.querySelectorAll('#report .strip')].map(x => Math.round(x.getBoundingClientRect().width)))], two: [...document.querySelectorAll('#report .striprow')].some(r => r.children.length === 2 && Math.abs(r.children[0].getBoundingClientRect().top - r.children[1].getBoundingClientRect().top) < 2) })); await p.emulateMedia({ media: 'screen' });
    assert.deepStrictEqual(pr.w, [432], 'print width ' + pr.w.join(',')); assert(pr.two, 'two across when printed'); assert.deepStrictEqual(e2, []); await c2.close();
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
