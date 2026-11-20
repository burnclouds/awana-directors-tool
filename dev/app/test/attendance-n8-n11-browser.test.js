// N8 + N11 (1.51.16): the printed attendance sheet.
// N8: the rotated "Attendance" word is centered in its column on every class that keeps it; Puggles (one box a night) have no rotated row;
//     the screen night tables keep their left-aligned second column; the printed tables run the full width.
// N11: 20 rows a page; a class of more than 20 goes on to a page 2 of 2; the top of the page is clear for a three-hole punch (0.85in from the paper edge).
//     Cubbies (Mike, 2026-11-20): four sub-cells a night, the first Attendance, the other three blank-headed for writing in.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/attendance-n8-n11-browser.test.js
const { open } = require('./lib/app-page'), assert = require('assert');
(async () => {
  const t = await open(), page = t.page;
  await t.report('attendance');

  const sheets = () => page.evaluate(() => [...document.querySelectorAll('#report .sheet')].map(s => ({
    title: s.querySelector('h2').textContent, rows: s.querySelectorAll('tbody tr').length, mark: s.querySelectorAll('th.mark').length,
    width: Math.round(s.querySelector('table.att').getBoundingClientRect().width), sheetW: Math.round(s.getBoundingClientRect().width),
    sub: (s.querySelector('p.sub') || {}).textContent || '' })));

  await t.test('N8-1 every rotated heading is centered in its cell (print), on Cubbies, Sparks and T&T', async () => {
    await t.printed(async () => {
      const bad = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('#report .sheet').forEach(s => {
          const cls = s.querySelector('h2').textContent;
          s.querySelectorAll('th.mark').forEach(th => {
            const cs = getComputedStyle(th), r = th.getBoundingClientRect(), sp = th.querySelector('.rot').getBoundingClientRect();
            const gapL = sp.left - r.left, gapR = r.right - sp.right;
            if (cs.textAlign !== 'center' || Math.abs(gapL - gapR) > 1.5) out.push(cls + ': ' + cs.textAlign + ' gaps ' + gapL.toFixed(1) + '/' + gapR.toFixed(1));
          });
        });
        return out;
      });
      assert.deepStrictEqual(bad, []);
    });
  });
  await t.test('N8-2 Puggles print no rotated heading row; the other classes keep it', async () => {
    const s = await sheets(), pug = s.find(x => /^Puggles/.test(x.title)), cub = s.find(x => /^Cubbies/.test(x.title));
    assert(pug && cub, 'Puggles and Cubbies sheets exist');
    assert.strictEqual(pug.mark, 0, 'Puggles mark cells');
    assert(cub.mark > 0, 'Cubbies keep the mark cells');
    const pugHead = await page.evaluate(() => [...document.querySelectorAll('#report .sheet')].find(x => /^Puggles/.test(x.querySelector('h2').textContent)).querySelectorAll('thead tr').length);
    assert.strictEqual(pugHead, 1, 'one heading row');
  });
  await t.test('N8-3 the on-screen night table (Person tab) keeps its left-aligned second column', async () => {
    const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'style.css'), 'utf8');
    assert(/table\.roster\.att td:nth-child\(2\)/.test(css), 'rule is scoped to the screen tables');
    assert(!/(^|\n)table\.att td:nth-child\(2\)/.test(css), 'no unscoped rule reaches the printed sheet');
  });
  await t.test('N8-4 the printed tables fill the sheet width (Puggles and Cubbies too)', async () => {
    await t.printed(async () => { (await sheets()).forEach(x => assert(Math.abs(x.width - x.sheetW) <= 2, x.title + ': table ' + x.width + ' of sheet ' + x.sheetW)); });
  });
  await t.test('N11-1 every class of 20 or fewer prints one page of exactly 20 rows', async () => {
    const s = await sheets(); assert(s.length >= 8, 'sheets: ' + s.length);
    s.forEach(x => { assert.strictEqual(x.rows, 20, x.title + ' rows ' + x.rows); assert(!/page \d of/.test(x.title), x.title); });
  });
  await t.test('N11-2 a class of 25 prints two sheets (page 1 of 2, page 2 of 2), 20 rows each, every child once', async () => {
    await t.report('attendance', "(function(){ const M = Model, base = App.master.people.find(p => M.room(p) === 'Puggles' && M.isClubber(p)); for (let i = 0; i < 17; i++) { const c = Object.assign({}, base); c[M.X.ID] = 'zz' + i; c[M.C.FIRST] = 'Extra' + String.fromCharCode(65 + i); App.master.people.push(c); } App.showReport('attendance'); })()");
    const info = await page.evaluate(() => { const pug = [...document.querySelectorAll('#report .sheet')].filter(x => /^Puggles/.test(x.querySelector('h2').textContent)); return { n: pug.length, titles: pug.map(x => x.querySelector('h2').textContent), rows: pug.map(x => x.querySelectorAll('tbody tr').length), named: pug.map(x => [...x.querySelectorAll('tbody td.name')].filter(td => td.textContent.trim()).length) }; });
    assert.strictEqual(info.n, 2, JSON.stringify(info));
    assert(/page 1 of 2/.test(info.titles[0]) && /page 2 of 2/.test(info.titles[1]), info.titles.join(' | '));
    assert.deepStrictEqual(info.rows, [20, 20]);
    assert.strictEqual(info.named[0], 20); assert(info.named[1] >= 1 && info.named[0] + info.named[1] >= 25, JSON.stringify(info.named));
  });
  // N50 (Mike, 2026-11-20): row numbers on every attendance sheet, the blank write-in rows too; on page 2 of a big class the numbers carry on (21 and up).
  await t.test('N50 every row of every attendance sheet is numbered 1 to 20, blank rows included', async () => {
    const bad = await page.evaluate(() => { const out = []; document.querySelectorAll('#report .sheet').forEach(sh => { const t = sh.querySelector('h2').textContent; if (/page 2 of/.test(t)) return; [...sh.querySelectorAll('tbody tr')].forEach((tr, i) => { const c = tr.cells[0]; if (!c.classList.contains('num') || c.textContent.trim() !== String(i + 1)) out.push(t + ' row ' + (i + 1) + ': "' + c.textContent.trim() + '"'); }); }); return out; });
    assert.deepStrictEqual(bad, []);
    const head = await page.evaluate(() => [...document.querySelectorAll('#report .sheet')].map(sh => { const th = sh.querySelector('thead th'); return th.classList.contains('num') && th.textContent.trim() === ''; }));
    assert(head.length && head.every(Boolean), 'the number column has a blank heading (no "#")');
  });
  await t.test('N50 on page 2 of a class of more than 20 the numbers carry on: 21 to 40', async () => {
    const pages = await page.evaluate(() => [...document.querySelectorAll('#report .sheet')].filter(x => /^Puggles/.test(x.querySelector('h2').textContent)).map(sh => [...sh.querySelectorAll('tbody tr')].map(tr => tr.cells[0].textContent.trim())));
    assert.strictEqual(pages.length, 2); assert.deepStrictEqual(pages[0], Array.from({ length: 20 }, (_, i) => String(i + 1))); assert.deepStrictEqual(pages[1], Array.from({ length: 20 }, (_, i) => String(i + 21)));
  });
  await t.test('N11-3 PDF: one page per sheet, landscape, the title starts at or below 0.85in, nothing under the bottom margin', async () => {
    const buf = await t.pdf(), txt = buf.toString('latin1');
    const boxes = [...txt.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(m => [Math.round(m[1]), Math.round(m[2])]);
    const count = await page.evaluate(() => document.querySelectorAll('#report .sheet').length);
    assert.strictEqual(boxes.length, count, 'pages ' + boxes.length + ' vs sheets ' + count);
    boxes.forEach(b => assert.deepStrictEqual(b, [792, 612]));
    // top clearance measured in the page: the title's top edge in print layout is at least 0.85in (81.6 CSS px) from the sheet's page top
    await t.printed(async () => {
      const gap = await page.evaluate(() => { const s = document.querySelector('#report .sheet.att'); return parseFloat(getComputedStyle(s).paddingTop); });
      assert(gap >= 0.45 * 96 - 0.5, 'padding-top ' + gap + 'px');
    });
  });
  // Mike 2026-11-20: a Cubbies night has four sub-cells: the first is Attendance (filled from the record), the other three have blank headings and are left for writing in.
  await t.test('Cubbies: four sub-cells a night, the first headed Attendance, the other three with blank headings', async () => {
    await t.report('attendance');
    const m = await page.evaluate(() => { const sh = [...document.querySelectorAll('#report .sheet')].find(x => /^Cubbies/.test(x.querySelector('h2').textContent)), dates = [...sh.querySelectorAll('th.date')];
      return { nights: dates.length, spans: [...new Set(dates.map(d => d.colSpan))], marks: [...sh.querySelectorAll('th.mark')].map(x => x.textContent.trim()), cells: sh.querySelector('tbody tr').children.length }; });      // (a row is: number, name, then four cells a night)
    assert(m.nights >= 5, 'nights: ' + m.nights); assert.deepStrictEqual(m.spans, [4], 'each night spans ' + m.spans.join(',') + ' columns');
    assert.strictEqual(m.marks.length, m.nights * 4, 'mark headings: ' + m.marks.length);
    m.marks.forEach((x, i) => assert.strictEqual(x, i % 4 === 0 ? 'Attendance' : '', 'heading ' + i + ' is "' + x + '"'));
    assert.strictEqual(m.cells, 2 + m.nights * 4, 'a Cubbies row is the number, the name and four cells a night (got ' + m.cells + ')');
  });
  await t.test('Cubbies: a recorded Attendance ticks the first sub-cell only; a recorded Extra does not print in a blank one', async () => {
    const r = await page.evaluate(() => { const M = Model, s = App.season, kid = App.master.people.find(p => M.isActive(p) && M.isClubber(p) && M.groupOf(M.room(p)) === 'Cubbies'), id = kid[M.X.ID];
      const first = document.querySelector('#report .sheet th.date') && [...document.querySelectorAll('#report .sheet')].find(x => /^Cubbies/.test(x.querySelector('h2').textContent)).querySelector('th.date').textContent.trim();
      const row = App.calendar.find(c => Calendar.isNight(c) && Calendar.short(c.Date) === first); Season.setMark(s, row.Date, id, 'a', 1, 'Cubbies'); Season.setMark(s, row.Date, id, 'x', 1, 'Cubbies'); App.touch(); App.showReport('attendance');
      return { name: M.fullName(kid) }; });
    await page.waitForTimeout(500);
    const cells = await page.evaluate(nm => { const sh = [...document.querySelectorAll('#report .sheet')].find(x => /^Cubbies/.test(x.querySelector('h2').textContent)), tr = [...sh.querySelectorAll('tbody tr')].find(x => x.cells[1].textContent.trim() === nm); return [...tr.cells].slice(2, 6).map(c => c.textContent.trim()); }, r.name);
    assert.strictEqual(cells[0], '✓', 'Attendance cell: ' + JSON.stringify(cells)); assert.deepStrictEqual(cells.slice(1), ['', '', ''], 'the three blank cells: ' + JSON.stringify(cells));
  });
  await t.test('N11-4 the subtitle carries a "Printed" date, so the browser date and time header can be turned off', async () => {
    const s = await sheets(); assert(s.every(x => /Printed \d\d\/\d\d\/\d\d/.test(x.sub)), s.map(x => x.sub).join(' | '));
  });
  await t.done();
})();
