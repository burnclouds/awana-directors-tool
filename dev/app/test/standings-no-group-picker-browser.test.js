// N54 (Mike, 2026-11-20): Game standings has no Group picker. Standings exist only for Sparks and T&T, so the report prints both (one page each) and Choose pages picks between them; a group chosen on another report
// (Cubbies, Puggles) no longer leaks into it. Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/standings-no-group-picker-browser.test.js
const { open } = require('./lib/app-page'), assert = require('assert');
(async () => {
  const t = await open(), page = t.page;
  const pickGroup = g => page.evaluate(v => { const s = document.getElementById('oGroupSel'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, g);
  for (const group of ['Cubbies', 'Puggles', 'Sparks']) {
    await t.test('with ' + group + ' chosen on another report, Game standings shows no Group picker and still has a page for Sparks and one for T&T', async () => {
      await t.report('attendance'); await pickGroup(group); await page.waitForTimeout(250);
      await t.report('standings'); await page.waitForTimeout(300);
      await page.click('#btnReportOptions');
      assert.strictEqual(await page.isVisible('#oGroupSel'), false, 'the Group picker is showing on Game standings');
      const titles = await page.evaluate(() => [...document.querySelectorAll('#report .sheet h2')].map(h => h.textContent));
      assert.strictEqual(titles.length, 2, 'pages: ' + titles.join(' | ')); assert(/^Sparks/.test(titles[0]) && /^T&T/.test(titles[1]), titles.join(' | '));
      assert(/all 2/.test(await page.evaluate(() => document.getElementById('pageSum').textContent)), 'Pages to print is offered'); await page.click('#pgDone');
    });
  }
  await t.done();
})();
