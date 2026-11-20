// N53 (Mike, 2026-11-20): the coaches color teams report (Color teams by group and color). Both groups use the same layout (the Sparks name column was wider than T&T's), each group fits one page (T&T flowed to a blank page),
// the printed date is on the title line (right-justified), the column headers are gone (they are obvious), and the list follows the List order picker (first name or last name first). Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/coaches-teams-layout-browser.test.js
const { open } = require('./lib/app-page'), assert = require('assert');
(async () => {
  const t = await open(), page = t.page;
  await t.report('binderTeams');
  await t.test('both groups have the same geometry: the name column starts, and the class column ends, at the same place on every sheet', async () => {
    const g = await t.printed(() => page.evaluate(() => [...document.querySelectorAll('#report .sheet')].map(sh => { const r = sh.getBoundingClientRect(), row = sh.querySelector('.teamrow'); if (!row) return null; const cls = row.children[row.children.length - 1].getBoundingClientRect(), nm = row.children[0].getBoundingClientRect(); return { classRight: Math.round(cls.right - r.left), nameLeft: Math.round(nm.left - r.left), title: sh.querySelector('h2').textContent }; })));
    assert.strictEqual(g.length, 2, 'sheets: ' + g.length); assert(g.every(Boolean), 'every sheet has color blocks (.teamrow)'); assert.strictEqual(g[0].classRight, g[1].classRight, 'class column (its right edge): ' + JSON.stringify(g)); assert.strictEqual(g[0].nameLeft, g[1].nameLeft, 'name column: ' + JSON.stringify(g));
  });
  await t.test('each group fits one printed page, even with twice the names (a bigger club)', async () => {
    const sheets = await page.$$eval('#report .sheet', s => s.length); assert.strictEqual(await t.pdf().then(b => (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length), sheets, 'the report as it is');
    await page.evaluate(() => document.querySelectorAll('#report .teamblock').forEach(b => { [...b.querySelectorAll('.teamrow')].forEach(r => b.appendChild(r.cloneNode(true))); }));
    const pages = await t.pdf().then(b => (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length); assert.strictEqual(pages, sheets, 'with twice the names the report needs ' + pages + ' pages for ' + sheets + ' sheets');
  });
  await t.report('binderTeams');
  await t.test('the printed date is on the title line, right-justified, and there is no line under the title', async () => {
    const m = await page.evaluate(() => [...document.querySelectorAll('#report .sheet')].map(sh => ({ right: sh.querySelector('h2').getAttribute('data-right') || '', sub: !!sh.querySelector('p.sub'), text: sh.querySelector('h2').textContent })));
    m.forEach(x => { assert(/^Printed \d\d\/\d\d\/\d\d$/.test(x.right), 'title date: "' + x.right + '"'); assert(!x.sub, 'a line under the title'); assert(!/Printed/.test(x.text), 'the date is in the title text (it would appear in Choose pages)'); });
    const flex = await t.printed(() => page.evaluate(() => { const h = document.querySelector('#report .sheet h2'), cs = getComputedStyle(h); return cs.display + '/' + cs.justifyContent; })); assert.strictEqual(flex, 'flex/space-between');
  });
  await t.test('no column header row: the list is color blocks of names with the class at the right', async () => {
    const m = await page.evaluate(() => ({ thead: document.querySelectorAll('#report .sheet thead').length, text: document.getElementById('report').textContent })); assert.strictEqual(m.thead, 0); assert(!/Last, first name/.test(m.text), 'a column heading shows');
  });
  await t.test('the list follows the List order picker: first name first, or last name first', async () => {
    const def = await page.evaluate(() => Reports.LIST.find(r => r.id === 'binderTeams').opts); assert(def.includes('order'), 'opts: ' + def.join());
    const names = async order => { await page.evaluate(o => { const s = document.getElementById('oOrderSel'); s.value = o; s.dispatchEvent(new Event('change', { bubbles: true })); }, order); await page.waitForTimeout(400); return page.evaluate(() => [...document.querySelectorAll('#report .sheet')[0].querySelectorAll('.teamblock')[0].querySelectorAll('.teamrow > :first-child')].map(x => x.textContent.trim())); };
    const first = await names('color'), last = await names('colorLast'); assert(first.length > 3 && !first.some(n => n.includes(',')), 'first-name order shows "First Last": ' + first.slice(0, 3)); assert(last.every(n => n.includes(',')), 'last-name order shows "Last, First": ' + last.slice(0, 3));
    const key = (a, f) => a.map(f); const sorted = (a, f) => JSON.stringify(a.map(f)) === JSON.stringify(a.map(f).slice().sort((x, y) => x.localeCompare(y))); assert(sorted(first, n => n), 'first-name list is in order'); assert(sorted(last, n => n), 'last-name list is in order');
  });
  await t.done();
})();
