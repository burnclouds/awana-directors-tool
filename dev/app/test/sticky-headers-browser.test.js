// N25 (1.51.16): a sticky table header must stay readable above the rows when the list scrolls. Reported on the Uniforms tab: the date boxes and Today buttons in the Ordered, Received and Given out
// columns painted over those headers. For each table below: scroll its scroller by 400px, then the element at the centre of every header cell must be the cell or inside it. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/sticky-headers-browser.test.js
const { open } = require('./lib/app-page'), assert = require('assert');
(async () => {
  const t = await open({ viewport: { width: 1600, height: 700 } }), page = t.page;
  // Scroll the table's own scroller (or the window), then report every header cell whose centre point is covered by something else.
  const covered = (tabId, sel, scroll) => page.evaluate(([tab, sel, scroll]) => {
    App.showTab(tab);
    const table = document.querySelector(sel); if (!table) return { missing: true };
    let sc = table.parentElement; while (sc && sc !== document.body && !(/(auto|scroll)/.test(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight + 5)) sc = sc.parentElement;
    if (sc && sc !== document.body) sc.scrollTop = scroll; else window.scrollTo(0, scroll);
    const out = []; table.querySelectorAll('thead th').forEach(th => {
      const r = th.getBoundingClientRect(); if (r.width < 2 || r.bottom < 0 || r.top > innerHeight) return;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 14)); if (hit && !th.contains(hit)) out.push((th.textContent || '').trim().slice(0, 20) + ' <- ' + hit.tagName + (hit.className ? '.' + String(hit.className).split(' ')[0] : ''));
    });
    return { covered: out, rows: table.querySelectorAll('tbody tr').length };
  }, [tabId, sel, scroll]);
  const run = async (theme) => {
    await page.evaluate(th => { document.documentElement.setAttribute('data-theme', th); }, theme); await page.waitForTimeout(100);
    for (const [name, tab, sel] of [['Uniforms', 'uniforms', '#uniWrap table.uni'], ['Roster', 'roster', '#rosterWrap table.roster'], ['Attendance', 'attend', '#attendWrap table.roster']]) {
      await t.test('N25 (' + theme + ') ' + name + ': after scrolling, every header cell is on top', async () => {
        const r = await covered(tab, sel, 400); if (r.missing) return;      // a tab with no table in this club is skipped, not passed silently below
        assert(r.rows > 0, name + ' has rows to scroll under the header'); assert.deepStrictEqual(r.covered, [], name + ' headers covered');
      });
    }
  };
  await run('light'); await run('dark');
  await t.test('N25 Calendar dates grid and Lessons by week grid: headers stay on top', async () => {
    for (const sub of ['dates', 'lessons']) {
      await page.evaluate(() => App.showTab('calendar')); await page.click('#calSubs button[data-calsub="' + sub + '"]'); await page.waitForTimeout(150);
      const r = await covered('calendar', '#calWrap table', 400); assert(!r.missing, sub); assert.deepStrictEqual(r.covered, [], sub + ' headers covered');
    }
  });
  await t.test('N25 at 390px the Uniforms header is not drawn (cards), and nothing scrolls the page sideways', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => App.showTab('uniforms')); await page.waitForTimeout(200);
    const m = await page.evaluate(() => ({ head: getComputedStyle(document.querySelector('#uniWrap table.uni thead')).display, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.strictEqual(m.head, 'none'); assert(m.sw <= m.cw + 1, 'page scrolls sideways');
  });
  await t.done();
})();
