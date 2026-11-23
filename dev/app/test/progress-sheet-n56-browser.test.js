// N56 (Mike, 2026-11-20): the printed Sparks progress sheet. Left labels are Section 1 to Section 8 (top to bottom) and Review 1 to Review 8; the award cells at the right drop the word "Jewel"; the Pilot Wing and Red Jewel 1 are ONE
// cell, "Wings/Red 1", on the Section 1 row; the two bands at the left (Book award, Review emblem) share one column; every box carries 6pt grey "init" and "date" labels; every date prints in full as mm/dd/yy.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/progress-sheet-n56-browser.test.js
const { open } = require('./lib/app-page'), assert = require('assert');
(async () => {
  const t = await open(), page = t.page;
  // a Sparks child on Hangglider: Section 1 complete (so the Wing and Red Jewel 1 are earned together), one box of Section 2 signed
  const id = await page.evaluate(() => { const M = Model, s = App.season, kid = App.master.people.find(x => M.isActive(x) && M.isClubber(x) && M.groupOf(M.room(x)) === 'Sparks'), id = kid[M.X.ID];
    s.handbooks[id] = 'HG 260916'; s.progress[id] = { HG: { 'RJ1.1': '2026-09-23', 'RJ1.2': '2026-09-30', 'RJ1.3': '2026-10-07', 'RJ1.4': '2026-10-14', 'GJ1.1': '2026-10-21' } }; return id; });
  await page.evaluate(i => {
    const report = Reports.LIST.find(x => x.id === 'progressSheets');
    document.getElementById('report').innerHTML = report.render({ master: App.master, season: App.season, calendar: App.calendar, today: App.today(), opts: { books: 'all', _group: 'Sparks', kid: i } });
  }, id);
  const sheet = () => page.evaluate(() => { const sh = document.querySelector('#report .sheet.rec, #report .sheet:has(table.rec)'); const names = [...sh.querySelectorAll('td.nm')].map(x => x.textContent.trim()), rail = [...sh.querySelectorAll('td.an')].map(x => x.querySelector('span').textContent.trim()), bands = [...sh.querySelectorAll('td.band')].map(x => Math.round(x.getBoundingClientRect().left)), bandText = [...sh.querySelectorAll('td.band .bt')].map(x => x.textContent), so = sh.querySelectorAll('td.so'), dt = [...sh.querySelectorAll('td.so .dt')].map(x => x.textContent.trim()).filter(Boolean);
    const lab = c => { const e = c.querySelector(c), x = 0; return x; };
    const lbl = [...so].map(td => ({ init: (td.querySelector('.lbi') || {}).textContent || '', date: (td.querySelector('.lbd') || {}).textContent || '', size: td.querySelector('.lbi') ? parseFloat(getComputedStyle(td.querySelector('.lbi')).fontSize) * 0.75 : 0, color: td.querySelector('.lbi') ? getComputedStyle(td.querySelector('.lbi')).color : '' }));
    const wing = sh.querySelector('td.an'); return { names, rail, bands, bandText, dt, lbl, n: so.length, text: sh.textContent }; });
  let m = await t.printed(sheet);
  await t.test('the left labels are Section 1 to Section 8 and Review 1 to Review 8, with no jewel names on the left', async () => {
    const sec = m.names.filter(x => /^Section \d$/.test(x)), rev = m.names.filter(x => /^Review \d$/.test(x));
    assert.deepStrictEqual(sec, Array.from({ length: 8 }, (_, i) => 'Section ' + (i + 1))); assert.deepStrictEqual(rev, Array.from({ length: 8 }, (_, i) => 'Review ' + (i + 1)));
    assert(!m.names.some(x => /Jewel \d|^[RG]J\d review/.test(x)), 'a jewel name is still on the left: ' + m.names.join(' | ')); assert(m.names.includes('Rank') && m.names.includes('Review Emblem'), 'Rank and Review Emblem stay');
  });
  await t.test('the award cells drop the word Jewel, and the Pilot Wing and Red Jewel 1 are one cell, Wings/Red 1', async () => {
    assert(!m.rail.some(x => /Jewel/.test(x)), 'rail: ' + m.rail.join(' | ')); assert.strictEqual(m.rail.filter(x => x === 'Wings/Red 1').length, 1, 'rail: ' + m.rail.join(' | '));
    assert(!m.rail.some(x => /Pilot Wing$/.test(x)) , 'a separate Wing cell is still there'); ['Green 1', 'Red 2', 'Green 2', 'Red 3', 'Green 3', 'Red 4', 'Green 4'].forEach(x => assert(m.rail.includes(x), x + ' is missing: ' + m.rail.join(' | ')));
  });
  await t.test('Wings/Red 1 shows as earned when Section 1 is complete (the two are earned together)', async () => {
    const e = await t.printed(() => page.evaluate(() => { const td = [...document.querySelectorAll('#report td.an')].find(x => x.querySelector('span').textContent.trim() === 'Wings/Red 1'); return td ? td.className : 'missing'; })); assert(/\be\b/.test(e), 'class: ' + e);
  });
  await t.test('the two bands at the left share ONE column', async () => { assert(m.bands.length >= 2, 'bands: ' + m.bands.length); assert.strictEqual(new Set(m.bands).size, 1, 'the bands start at ' + [...new Set(m.bands)].join(', ')); assert(m.bandText.some(x => /BOOK AWARD/.test(x)) && m.bandText.some(x => /REVIEW EMBLEM/.test(x))); });
  await t.test('every box has a 6pt medium-grey "init" and "date" label', async () => {
    assert(m.n >= 40, 'boxes: ' + m.n); const bad = m.lbl.filter(x => x.init !== 'init' || x.date !== 'date' || Math.abs(x.size - 6) > 0.05 || !/rgb\((10\d|11\d|12\d|9\d),/.test(x.color)); assert.strictEqual(bad.length, 0, bad.length + ' boxes without the labels, first: ' + JSON.stringify(bad[0]));
  });
  await t.test('every date prints in full as mm/dd/yy', async () => { assert(m.dt.length >= 5, 'dates: ' + m.dt.join(',')); const bad = m.dt.filter(x => !/^\d\d\/\d\d\/\d\d$/.test(x)); assert.deepStrictEqual(bad, [], 'not mm/dd/yy: ' + bad.join(',')); assert(m.dt.includes('09/23/26')); });
  await t.test('the sheet is still one printed page', async () => { const buf = await t.pdf(); assert.strictEqual((buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length, await page.$$eval('#report .sheet', s => s.length)); });
  await t.done();
})();
