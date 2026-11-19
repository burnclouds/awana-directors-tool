// N23 (1.51.16): with legacy records of Flight 3:16, Start Zone and Apple Acres in the data (an older file or copy), none of the three appears on the Awards tab (announce, hand out), the hand-out strips,
// the child's Awards list or Awards earned; the Progress sheet still shows the boxes. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/not-awards-browser.test.js
const { open } = require('./lib/app-page'), assert = require('assert');
(async () => {
  const t = await open({ viewport: { width: 1300, height: 900 } }), page = t.page;
  const ids = await page.evaluate(() => {
    const X = Model.X, act = App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p)), by = g => act.find(p => Model.groupOf(Model.room(p)) === g);
    const sp = by('Sparks'), tt = by('T&T'), cu = by('Cubbies'), night = Calendar.nights(App.season.calendar, 'Q2')[0].Date, s = App.season;
    // legacy records: announced that night, given, left held, and a no-date mark, for the three
    s.awards[night] = s.awards[night] || {};
    [[sp, 'Flight 3:16'], [tt, 'Start Zone 1'], [tt, 'Start Zone 2'], [cu, 'Apple Acres']].forEach(([p, a]) => { const id = p[X.ID]; (s.awards[night][id] = s.awards[night][id] || []).push(a); (s.given[id] = s.given[id] || {})[a] = night; });
    App.touch(); return { sp: sp[X.ID], tt: tt[X.ID], cu: cu[X.ID], night };
  });
  const text = sel => page.evaluate(s => (document.querySelector(s) || document.body).innerText, sel);
  const NAMES = /Flight 3:16|Start Zone 1|Start Zone 2|Apple Acres/;

  await t.test('N23-1 the Awards tab (announce and hand out) lists none of the three', async () => {
    await page.evaluate(n => { App.places.awards.set({ date: n, group: 'All', room: '' }); App.showTab('awards'); }, ids.night); await page.waitForTimeout(500);
    for (const sub of ['announce', 'hand']) { await page.click('#awSubs button[data-awsub="' + sub + '"]'); await page.waitForTimeout(300); assert(!NAMES.test(await text('#awardsWrap')) , sub + ' lists one: ' + (await text('#awardsWrap')).match(NAMES)); }
    const counts = await page.evaluate(() => ({ ann: App.awardsToAnnounce(), give: App.awardsToGive().length })); assert(counts.ann >= 0 && counts.give >= 0);
  });
  await t.test('N23-2 the hand-out strips list none of the three', async () => {
    await page.evaluate(() => App.showReport('handOut')); await page.waitForFunction(() => document.querySelectorAll('#report .sheet, #report p').length > 0); assert(!NAMES.test(await text('#report')), 'a strip lists one');
  });
  await t.test('N23-3 the child\'s Awards list and Awards earned list none of the three', async () => {
    for (const id of [ids.sp, ids.tt, ids.cu]) { await page.evaluate(i => App.showPerson(i, { sub: 'awards' }), id); await page.waitForTimeout(300); assert(!NAMES.test(await text('#personWrap')), 'Person Awards lists one for ' + id); }
    await page.evaluate(() => App.showReport('awardsByChild')); await page.waitForTimeout(500); assert(!NAMES.test(await text('#report')), 'Awards earned lists one');
  });
  await t.test('N23-4 the Progress sheet still shows the Flight 3:16 booklet, Start Zone and Apple Acres boxes', async () => {
    const first = async id => { await page.evaluate(i => App.showPerson(i, { sub: 'progress' }), id); await page.waitForSelector('#progressWrap .pblock'); const b = await page.$$eval('#progressWrap button[data-book]', x => x.map(y => y.dataset.book)), g = await page.evaluate(i => Model.groupOf(Model.room(App.master.people.find(p => p[Model.X.ID] === i))), id), want = await page.evaluate(([g, bs]) => Season.bookOrder(App.season, g).find(c => bs.includes(c)), [g, b]); if (want) { await page.click('#progressWrap button[data-book="' + want + '"]'); await page.waitForTimeout(250); } };      // the once-only blocks are on the group's first book
    await first(ids.sp); assert(/Flight 3:16/.test(await text('#progressWrap')), 'Flight 3:16 booklet block');
    await first(ids.tt); assert(/Start Zone/.test(await text('#progressWrap')), 'Start Zone block');
    await first(ids.cu); assert(/Apple Acres/.test(await text('#progressWrap')), 'Apple Acres block');
  });
  await t.test('N23-5 the printed sheet still has the boxes', async () => {
    const h = await page.evaluate(i => { const p = App.master.people.find(x => x[Model.X.ID] === i); return '<div>' + ReportsSeason.recordBody({ master: App.master, settings: { quarter: 'Q2' }, calendar: App.season.calendar, season: App.season, today: '2026-11-18', opts: {} }, p, Season.bookOrder(App.season, 'Sparks')[0], { common: true }) + '</div>'; }, ids.sp);
    assert(/Flight 3:16/.test(h), 'the booklet row is on the printed sheet');
  });
  await t.done();
})();
