// N12 (1.51.16): on the printed Sparks sheet the review rows come after the last jewel box and before the Review Emblem row; the Book award band no longer
// stretches over them; T&T and Cubbies sheets have no review rows and keep their one band. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/progress-reviews-bottom-browser.test.js
const { open } = require('./lib/app-page'), assert = require('assert');
(async () => {
  const t = await open({ viewport: { width: 1280, height: 900 } }), page = t.page;
  const sheetOf = (g, book) => page.evaluate(([g, book]) => {
    const p = App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === g);
    const html = Reports.recordSheet({ master: App.master, settings: App.settings || { quarter: 'Q2' }, calendar: Calendar.sort(App.season.calendar), season: App.season, today: '2026-11-18', opts: {} }, p, book);
    const d = document.createElement('div'); d.innerHTML = html;
    const rows = [...d.querySelectorAll('table.rec tr')].map(tr => ({ rv: !!tr.querySelector('td.rvn') || tr.querySelector('td.so.rv') !== null, text: tr.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), bands: [...tr.querySelectorAll('td.band')].map(b => ({ span: +b.getAttribute('rowspan'), text: b.textContent.trim() })), nm: (tr.querySelector('td.nm') || {}).textContent || '', isReviewRow: !!tr.querySelector('td.so.rv') }));
    return { rows, count: rows.length };
  }, [g, book]);

  await t.test('N12-1 Sparks: every review row follows the last jewel item row; the Review Emblem row follows the reviews; Blue Jewels and Book award come last', async () => {
    const { rows } = await sheetOf('Sparks', 'HG');
    const rv = rows.map((r, i) => r.isReviewRow ? i : -1).filter(i => i >= 0), items = rows.map((r, i) => /^(R|G)J|Jewel/.test(r.nm) && !r.isReviewRow ? i : -1).filter(i => i >= 0);
    assert(rv.length >= 8, 'review rows: ' + rv.length);
    assert.strictEqual(rv[rv.length - 1] - rv[0], rv.length - 1, 'review rows are contiguous: ' + rv.join(','));
    const emblem = rows.findIndex(r => /^Review Emblem/.test(r.nm)); assert(emblem === rv[rv.length - 1] + 1, 'Review Emblem row right after the reviews: ' + emblem + ' vs ' + rv.join(','));
    const bj = rows.findIndex(r => /^Blue Jewels/.test(r.nm)), ba = rows.findIndex(r => /^Book award/.test(r.nm));
    assert(bj > emblem && ba > bj, 'Blue Jewels ' + bj + ' Book award ' + ba);
    // no jewel item row after the first review row
    const lastItem = Math.max(...rows.map((r, i) => !r.isReviewRow && i < rv[0] ? i : -1)); assert(lastItem < rv[0]);
  });
  await t.test('N12-2 Sparks: each review row is numbered ("Review 1" to "Review 8"), and the bands do not cover the wrong rows', async () => {
    const { rows } = await sheetOf('Sparks', 'HG');
    const labels = rows.filter(r => /^Review \d$/.test(r.nm)).map(r => r.nm); assert.deepStrictEqual(labels, Array.from({ length: 8 }, (_, i) => 'Review ' + (i + 1)), labels.join('|'));      // N56: Review 1 to Review 8
    const first = rows.findIndex(r => r.bands.some(b => /BOOK AWARD/.test(b.text))), b1 = rows[first].bands.find(b => /BOOK AWARD/.test(b.text));
    const firstRv = rows.findIndex(r => r.isReviewRow); assert(first + b1.span <= firstRv, 'Book award band (' + first + '+' + b1.span + ') ends before the reviews at ' + firstRv);
    const a = rows.findIndex(r => r.bands.some(b => /REVIEW EMBLEM/.test(b.text))), b2 = rows[a].bands.find(b => /REVIEW EMBLEM/.test(b.text)), emblem = rows.findIndex(r => /^Review Emblem/.test(r.nm));
    assert.strictEqual(a, firstRv, 'Review Emblem band starts at the first review'); assert.strictEqual(a + b2.span - 1, emblem, 'and ends on the Review Emblem row');
  });
  await t.test('N12-3 T&T and Cubbies sheets have no review rows, and keep one Book award band', async () => {
    for (const [g, b] of [['T&T', 'AoG'], ['Cubbies', 'AS']]) {
      const { rows } = await sheetOf(g, b); assert(!rows.some(r => r.isReviewRow || /review$/.test(r.nm)), g + ' review rows');
      const bands = rows.flatMap(r => r.bands); assert.strictEqual(bands.length, 1, g + ' bands ' + bands.length); assert(/BOOK AWARD/.test(bands[0].text));
    }
  });
  await t.test('N12-4 the printed Sparks sheet is still one portrait letter page', async () => {
    await t.report('progressSheets', "App.settings && 0");
    const buf = await t.pdf(), boxes = [...buf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(m => [Math.round(m[1]), Math.round(m[2])]);
    assert(boxes.length > 0); boxes.forEach(b => assert.deepStrictEqual(b, [612, 792]));
    const count = await page.evaluate(() => document.querySelectorAll('#report .sheet').length); assert.strictEqual(boxes.length, count, 'pages ' + boxes.length + ' vs sheets ' + count);
  });
  await t.done();
})();
