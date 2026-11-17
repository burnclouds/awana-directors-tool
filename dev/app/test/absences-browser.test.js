// Volunteer absences (S11) in a real browser: entered on a volunteer's Person page (Attendance sub-tab), seen in the Volunteers room of the Attendance tab, cleared by night and by the remaining nights.
// Club nights come from the TEST calendar only. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/absences-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async () => { const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); p.on('dialog', d => d.accept()); await p.clock.setFixedTime(new Date('2026-11-16T12:00:00')); await p.goto(url); await p.setInputFiles('#splashFiles', [DATA]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); return { p, ctx }; };
  const volunteer = p => p.evaluate(() => App.master.people.find(x => Model.isVolunteer(x) && Model.isActive(x))[Model.X.ID]);
  const rowsFor = (p, pid) => p.evaluate(id => App.absenceList().filter(r => r.personId === id).map(r => r.date), pid);

  await test('a volunteer absence is entered on the Person page, one row per club night, stored with the person', async () => {
    const { p, ctx } = await open(); const pid = await volunteer(p);
    await p.evaluate(id => App.showPerson(id, { sub: 'attendance' }), pid); await p.waitForTimeout(300);
    const nights = await p.evaluate(() => App.absenceNightsBetween('2026-09-16', '2026-09-30'));
    assert.strictEqual(nights.length, 3, 'three TEST club nights in the range: ' + nights.join(','));
    await p.fill('#pAbsFrom', '2026-09-16'); await p.fill('#pAbsTo', '2026-09-30'); await p.fill('#pAbsReason', 'Family trip'); await p.click('button[data-absadd]'); await p.waitForTimeout(250);
    assert.deepStrictEqual(await rowsFor(p, pid), nights, 'one row per club night');
    assert(await p.evaluate(id => !!App.season.absences[id], pid), 'stored under the person');
    await ctx.close();
  });
  await test('clearing one night keeps the others; the remaining-nights clear removes the rest', async () => {
    const { p, ctx } = await open(); const pid = await volunteer(p);
    await p.evaluate(id => App.showPerson(id, { sub: 'attendance' }), pid); await p.waitForTimeout(300);
    // "Remaining" means club nights today or later, so this uses the TEST club's nights ahead of today.
    await p.fill('#pAbsFrom', '2026-11-18'); await p.fill('#pAbsTo', '2026-12-09'); await p.click('button[data-absadd]'); await p.waitForTimeout(250);
    const ahead = (await rowsFor(p, pid)).length; assert(ahead >= 3, 'three or more nights ahead: ' + ahead);
    await p.click('button[data-absnight]'); await p.waitForTimeout(200); assert.strictEqual((await rowsFor(p, pid)).length, ahead - 1, 'one night cleared');
    await p.click('button[data-absrem]'); await p.waitForTimeout(200); assert.strictEqual((await rowsFor(p, pid)).length, 0, 'remaining nights cleared');
    await ctx.close();
  });
  await test('the Attendance tab, Volunteers room, shows the absence by club night; All and Upcoming both work', async () => {
    const { p, ctx } = await open(); const pid = await volunteer(p);
    await p.evaluate(id => { App.showPerson(id, { sub: 'attendance' }); }, pid); await p.waitForTimeout(300);
    await p.fill('#pAbsFrom', '2026-09-16'); await p.fill('#pAbsTo', '2026-09-16'); await p.click('button[data-absadd]'); await p.waitForTimeout(250);
    await p.evaluate(() => document.querySelector('.tabs button[data-tab="attend"]').click()); await p.waitForTimeout(300);
    await p.selectOption('#attRoom', 'Volunteers'); await p.waitForTimeout(300);
    assert(await p.isVisible('#attendWrap .absencecard'), 'the absence panel shows in the Volunteers room');
    assert(await p.evaluate(() => /9\/16/.test(document.querySelector('#attendWrap .absencecard').textContent)), 'the night is listed');
    await p.selectOption('#absView', 'upcoming'); await p.waitForTimeout(200);
    assert(!(await p.evaluate(() => /9\/16/.test(document.querySelector('#attendWrap .absencecard').textContent))), 'Upcoming hides past nights');
    await ctx.close();
  });
  await test('the To do page shows the next club nights and their absences, and a night cleared there is removed', async () => {
    const { p, ctx } = await open(); const pid = await volunteer(p);
    const ahead = await p.evaluate(() => App.absenceClubDates().filter(d => d >= App.today()).slice(0, 1)[0]);
    if (!ahead) { await ctx.close(); return; }      // the TEST calendar has no club night ahead of the real date: nothing to show
    await p.evaluate(([id, d]) => App.addAbsence(id, d, d, 'Test cover'), [pid, ahead]);
    await p.evaluate(() => document.querySelector('.tabs button[data-tab="todo"]').click()); await p.waitForTimeout(300);
    assert(await p.isVisible('.absencecard'), 'the absence card shows on To do');
    await p.click('button[data-absnight]'); await p.waitForTimeout(250);
    assert.strictEqual((await rowsFor(p, pid)).length, 0, 'the night is cleared from To do');
    await ctx.close();
  });
  await test('a planned night that is no longer a club night is still shown, with a label, and the record is kept', async () => {
    const { p, ctx } = await open(); const pid = await volunteer(p);
    await p.evaluate(([id, d]) => App.addAbsence(id, d, d, 'Label test'), [pid, '2026-09-16']);
    await p.evaluate(() => { App.calendar.splice(App.calendar.findIndex(r => r.Date === '2026-09-16'), 1); App.refresh(); });
    await p.evaluate(() => document.querySelector('.tabs button[data-tab="attend"]').click()); await p.waitForTimeout(300);
    await p.selectOption('#attRoom', 'Volunteers'); await p.waitForTimeout(300);
    assert(await p.evaluate(() => /no longer a club night/.test(document.querySelector('#attendWrap .absencecard').textContent)), 'Attendance panel labels the night');
    assert.strictEqual((await rowsFor(p, pid)).length, 1, 'the record is kept');
    await ctx.close();
  });
  await test('a volunteer no longer on the volunteer list is labelled on the Attendance panel', async () => {
    const { p, ctx } = await open(); const pid = await volunteer(p);
    await p.evaluate(([id, d]) => App.addAbsence(id, d, d, 'Inactive test'), [pid, '2026-09-16']);
    await p.evaluate(id => { const x = App.master.people.find(y => y[Model.X.ID] === id); x[Model.X.ACTIVE] = '0'; App.refresh(); }, pid);
    await p.evaluate(() => document.querySelector('.tabs button[data-tab="attend"]').click()); await p.waitForTimeout(300);
    await p.selectOption('#attRoom', 'Volunteers'); await p.waitForTimeout(300);
    assert(await p.evaluate(() => /not on the volunteer list/.test(document.querySelector('#attendWrap .absencecard').textContent)), 'label shown');
    await ctx.close();
  });
  await test('Planned out column: planned shows, a Present mark reads "was planned out", and ticking never changes the stored absence', async () => {
    const { p, ctx } = await open(); const pid = await volunteer(p);
    await p.evaluate(([id, d]) => App.addAbsence(id, d, d, 'Column test'), [pid, '2026-11-18']);
    await p.evaluate(() => document.querySelector('.tabs button[data-tab="attend"]').click()); await p.waitForTimeout(300);
    await p.selectOption('#attRoom', 'Volunteers'); await p.waitForTimeout(200);
    await p.selectOption('#attDate', '2026-11-18'); await p.waitForTimeout(250);
    const row = () => p.evaluate(id => { const r = document.querySelector('#attendWrap tr[data-id="' + id + '"]'); return r ? r.querySelector('.plannedcell').textContent.trim() : null; }, pid);
    assert((await row() || '').startsWith('Planned out'), 'planned night shows Planned out: ' + await row());
    const before = await p.evaluate(() => JSON.stringify(App.season.absences));
    await p.evaluate(id => { const r = document.querySelector('#attendWrap tr[data-id="' + id + '"] input[data-m="a"]'); r.click(); }, pid); await p.waitForTimeout(300);
    assert((await row() || '').startsWith('Present (was planned out)'), 'Present on a planned night reads was planned out: ' + await row());
    assert.strictEqual(await p.evaluate(() => JSON.stringify(App.season.absences)), before, 'the absence is unchanged by ticking Present');
    await p.evaluate(id => { const r = document.querySelector('#attendWrap tr[data-id="' + id + '"] input[data-m="a"]'); r.click(); }, pid); await p.waitForTimeout(300);
    assert((await row() || '').startsWith('Planned out'), 'unticking brings back Planned out');
    await ctx.close();
  });
  await test('Person page, volunteer: one row per night with the status; the word Absent never appears', async () => {
    const { p, ctx } = await open(); const pid = await volunteer(p);
    await p.evaluate(([id, d]) => App.addAbsence(id, d, d, 'Person table'), [pid, '2026-11-18']);
    await p.evaluate(id => App.showPerson(id, { sub: 'attendance' }), pid); await p.waitForTimeout(300);
    const txt = await p.evaluate(() => document.getElementById('personWrap').innerText);
    assert(/Planned out/.test(txt), 'a planned night shows Planned out');
    assert(/Not marked/.test(txt) || /Present/.test(txt), 'the per-night table shows other statuses');
    assert(!/\bAbsent\b/.test(txt), 'Absent is never shown');
    await ctx.close();
  });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
