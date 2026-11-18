// Awards to hand out: one narrow strip per child (4.5in, two columns on landscape Letter), all groups in one run, the same "earned and not given" rule as the Awards tab.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/award-strips-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
setTimeout(() => { console.log('timed out'); process.exit(2); }, 170000).unref();
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(url); await page.evaluate(() => { App.today = () => '2026-11-18'; }); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  // Seed waiting awards: 2 Cubbies, 3 Sparks, 3 T&T children with 1 to 3 each, and one child with 30 (a continued strip).
  const seeded = await page.evaluate(() => { const s = App.season, M = Model, out = { ids: [], long: '' };
    const pick = (g, n) => App.master.people.filter(p => M.isActive(p) && M.isClubber(p) && M.groupOf(M.room(p)) === g).slice(0, n);
    [['Cubbies', 2], ['Sparks', 3], ['T&T', 3]].forEach(([g, n]) => pick(g, n).forEach((p, i) => { const id = p[M.X.ID]; out.ids.push(id); for (let k = 0; k <= i; k++) Season.addAward(s, '2026-10-21', id, 'Test Award ' + (k + 1)); }));
    const big = pick('T&T', 4)[3]; if (big) { out.long = big[M.X.ID]; for (let k = 1; k <= 30; k++) Season.addAward(s, '2026-10-21', out.long, 'Big Award ' + String(k).padStart(2, '0')); }
    App.touch(); return out; });
  const toReport = async (group = '') => { await page.evaluate(() => App.showTab('reports')); await page.evaluate(g => { App.showReport('handOut'); App.reportOptions({ group: g, room: '' }); }, group); await page.waitForTimeout(500); };
  await test('one strip per child with something to give, none for the others, ordered by class then name, all groups in one run', async () => {
    await toReport(''); assert.strictEqual(await page.inputValue('#oGroupSel'), '', 'Group is All groups'); assert((await page.$$eval('#oGroupSel option', o => o.map(x => x.textContent)))[0] === 'All groups');
    const strips = await page.$$eval('#report .strip', s => s.map(x => ({ name: x.querySelector('.stripname b').textContent, cls: x.querySelector('.stripname span').textContent, n: x.querySelectorAll('.stripaward').length })));
    const want = await page.evaluate(() => { const rows = App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p)).map(p => ({ p, n: Season.toHandOut(App.season, p[Model.X.ID], Model.groupOf(Model.room(p)), App.calendar).length })).filter(x => x.n); return { kids: rows.length, awards: rows.reduce((a, x) => a + x.n, 0) }; });
    assert(strips.length >= want.kids && want.kids >= 9, 'strips ' + strips.length + ' for ' + want.kids + ' children'); assert.strictEqual(strips.reduce((a, s) => a + s.n, 0), want.awards, 'every award line is there once');
    const classes = strips.map(s => s.cls); assert(classes.length > 1 && new Set(classes).size > 2, 'several classes: ' + [...new Set(classes)].join(','));
    const bad = await page.evaluate(st => { const people = new Map(App.master.people.map(p => [Model.fullName(p) + '|' + Model.room(p), p])), out = []; for (let i = 1; i < st.length; i++) { const a = people.get(st[i - 1].name.replace(' (continued)', '') + '|' + st[i - 1].cls), b = people.get(st[i].name.replace(' (continued)', '') + '|' + st[i].cls); if (a && b && Model.byRoomThenName(a, b) > 0) out.push(i); } return out; }, strips);
    assert.deepStrictEqual(bad, [], 'class then name order is broken at strips ' + bad.join(','));
  });
  await test('it agrees with the Awards tab: the same children and the same count as To hand out and its badge', async () => {
    const strips = await page.$$eval('#report .stripaward', a => a.length) ; await page.evaluate(() => App.showTab('awards')); await page.waitForTimeout(300);
    const subs = await page.$$eval('#awSubs button', b => b.map(x => x.dataset.awsub)), hand = subs.find(x => /hand/i.test(x)); await page.click('#awSubs button[data-awsub="' + hand + '"]'); await page.waitForTimeout(300);
    const badge = +(await page.$eval('#awSubs button[data-awsub="' + hand + '"] .badge', e => e.textContent)) || 0, rows = await page.$$eval('#awSecHand tbody tr[data-id]', r => r.length);
    assert.strictEqual(badge, rows, 'the badge and the list agree'); assert.strictEqual(strips, rows, 'the strips carry the same ' + rows + ' awards as the tab');
  });
  await test('the Awards tab button prints all groups when Group is All: no message, Group on the report is All groups', async () => {
    await page.evaluate(() => App.showTab('awards')); await page.waitForTimeout(200); await page.click('#btnAwHandPrint').catch(async () => { await page.evaluate(() => document.getElementById('btnAwHandPrint').click()); }); await page.waitForTimeout(500);
    assert(await page.isVisible('#tab-reports')); assert.strictEqual(await page.inputValue('#oGroupSel'), ''); assert(!(await page.isVisible('#flash:has-text("one group at a time")').catch(() => false)), 'no Sparks-only message');
  });
  await test('a child with 30 awards gets continued strips; every sheet is landscape; a strip is 4.5in wide (432px) and rows hold two', async () => {
    await toReport(''); const m = await page.evaluate(id => { const s = [...document.querySelectorAll('#report .strip')], w = s.map(x => Math.round(x.getBoundingClientRect().width)); return { cont: s.filter(x => /continued/.test(x.textContent)).length, widths: [...new Set(w)], rowMax: Math.max(...[...document.querySelectorAll('#report .striprow')].map(r => r.children.length)), land: [...document.querySelectorAll('#report .sheet')].every(x => x.classList.contains('landscape')) }; }, seeded.long);
    assert(m.cont >= 1, 'continued strips: ' + m.cont); assert(m.land, 'landscape'); assert.strictEqual(m.rowMax, 2, 'two across'); assert(m.widths.length === 1 && Math.abs(m.widths[0] - 432) <= 2, 'widths ' + m.widths.join(','));
  });
  await test('print: the PDF has one page per sheet, and Choose pages names every page by class (no child names)', async () => {
    await toReport(''); const sheets = await page.locator('#report .sheet').count(); await page.emulateMedia({ media: 'print' }); const buf = await page.pdf({ format: 'Letter', preferCSSPageSize: true }); await page.emulateMedia({ media: 'screen' });
    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length; assert.strictEqual(pages, sheets, pages + ' pages for ' + sheets + ' sheets');
    if (sheets > 1) { await page.click('#btnChoosePages'); const names = await page.$$eval('#dlg .pglist label', l => l.map(x => x.textContent.trim())); assert.strictEqual(names.length, sheets); assert(names.every(n => /^Awards to hand out, page \d+ of \d+: /.test(n)), names[0]); await page.click('#pgDone'); }
  });
  await test('Group and Class pickers narrow it; a group with nothing says so; a different report has no All groups choice', async () => {
    await toReport('Cubbies'); const only = await page.$$eval('#report .stripname span', s => [...new Set(s.map(x => x.textContent))]); assert(only.every(c => /Cubbies/i.test(c)), only.join(','));
    await toReport('Puggles'); assert(/Nothing earned is waiting/.test(await page.textContent('#report')), 'empty message');
    await page.evaluate(() => App.showReport('attendDates')); await page.waitForTimeout(250); assert(!(await page.$$eval('#oGroupSel option', o => o.some(x => x.textContent === 'All groups'))), 'no All groups on other reports');
  });
  await test('the Awards tab button carries the Class picker: only that class prints (and the report says so)', async () => {
    const room = await page.evaluate(() => { const s = App.season, c = App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'Sparks'); const rooms = [...new Set(c.map(Model.room))]; return rooms.find(r => c.some(p => Model.room(p) === r && Season.toHandOut(s, p[Model.X.ID], 'Sparks', App.calendar).length)) || rooms[0]; });
    await page.evaluate(() => App.showTab('awards')); await page.waitForTimeout(250); await page.selectOption('#awGroup', 'Sparks').catch(() => {}); await page.selectOption('#awRoom', room); await page.waitForTimeout(250);
    await page.evaluate(() => document.getElementById('btnAwHandPrint').click()); await page.waitForTimeout(600);
    assert.strictEqual(await page.inputValue('#oRoomSel'), room, 'the Class picker shows the class'); const cls = await page.$$eval('#report .stripname span', s => [...new Set(s.map(x => x.textContent))]); assert(cls.length >= 1 && cls.every(c => c === room), 'only ' + room + ': ' + cls.join(','));
  });
  await test('long award names: strips still never overflow a page (one PDF page per sheet)', async () => {
    await page.evaluate(() => { const s = App.season, tt = App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'T&T').slice(0, 4); tt.forEach(p => { for (let k = 1; k <= 20; k++) Season.addAward(s, '2026-10-21', p[Model.X.ID], 'Honor Roll Medal of Distinguished Service ' + k); }); App.touch(); });
    await toReport(''); const sheets = await page.locator('#report .sheet').count(); await page.emulateMedia({ media: 'print' }); const buf = await page.pdf({ format: 'Letter', preferCSSPageSize: true }); await page.emulateMedia({ media: 'screen' });
    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length; assert.strictEqual(pages, sheets, pages + ' pages for ' + sheets + ' sheets');
    assert(await page.evaluate(() => [...document.querySelectorAll('#report .strip')].every(s => s.getBoundingClientRect().height < 6.3 * 96)), 'no strip is taller than the page allows');
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
