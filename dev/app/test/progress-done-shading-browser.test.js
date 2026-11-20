// N58 (Mike, 2026-11-20): a completed section on the Progress sheet is visibly shaded in LIGHT mode as well as in dark mode, and its date boxes (the cells) are shaded too.
// Measured as the contrast between a completed section's background and the page behind it, in both colour schemes. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/progress-done-shading-browser.test.js
const { open } = require('./lib/app-page'), assert = require('assert');
(async () => {
  const t = await open(), page = t.page;
  await page.evaluate(() => App.showTab('person')); await page.waitForTimeout(300);
  await page.evaluate(() => { const w = document.getElementById('progressWrap'); w.insertAdjacentHTML('beforeend', '<div id="shadeProbe"><div class="pblock done" id="pbDone"><span class="plabel">Done</span><span class="pitem"><input type="date" value="2026-10-21" id="inDone"></span></div><div class="pblock" id="pbOpen"><span class="plabel">Open</span><span class="pitem"><input type="date" id="inOpen"></span></div></div>'); });
  const measure = scheme => page.emulateMedia({ colorScheme: scheme }).then(() => page.evaluate(() => {
    const rgb = s => s.match(/[\d.]+/g).map(Number), alpha = s => (rgb(s)[3] === undefined ? 1 : rgb(s)[3]);
    const eff = el => { let e = el; while (e) { const c = getComputedStyle(e).backgroundColor; if (alpha(c) > 0) return rgb(c).slice(0, 3); e = e.parentElement; } return [255, 255, 255]; };
    const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const page = eff(document.getElementById('shadeProbe').parentElement), done = eff(document.getElementById('pbDone')), open = eff(document.getElementById('pbOpen')), cellD = eff(document.getElementById('inDone')), cellO = eff(document.getElementById('inOpen'));
    return { doneVsPage: +ratio(done, page).toFixed(3), openVsPage: +ratio(open, page).toFixed(3), cellDoneVsOpen: +ratio(cellD, cellO).toFixed(3), cellDone: cellD.join(','), done: done.join(','), page: page.join(',') };
  }));
  for (const scheme of ['light', 'dark']) {
    await t.test('a completed section is visibly shaded in ' + scheme + ' mode (at least 1.11:1 against the page)', async () => { const m = await measure(scheme); assert(m.doneVsPage >= 1.11, scheme + ': completed ' + m.done + ' on ' + m.page + ' is only ' + m.doneVsPage + ':1'); assert(m.openVsPage < 1.02, 'an open section is not shaded (' + m.openVsPage + ')'); });
  }
  await t.test('in light mode the date boxes of a completed section are shaded too (not plain white)', async () => { const m = await measure('light'); assert(m.cellDone !== '255,255,255', 'the date box of a completed section is ' + m.cellDone); });
  await page.emulateMedia({ colorScheme: null });
  await t.done();
})();
