// N16 (1.51.16): a long theme must never make a night's block taller than its rows, so a whole quarter still prints on ONE page.
// Reproduced before the fix: ~35 characters added to every theme pushed Q1 onto two letter pages (the theme wrapped one word per line in the narrow date column).
// Invented test club only (the themes below are invented too). Usage: NODE_PATH=<dir with playwright> node test/coaches-notes-long-themes-browser.test.js
const { open } = require('./lib/app-page'), assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const boxes = buf => [...buf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(m => [Math.round(m[1]), Math.round(m[2])]);
function lowest(buf) {
  const f = path.join(os.tmpdir(), 'awana-long-' + process.pid + '.pdf'); fs.writeFileSync(f, buf);
  let out; try { out = cp.spawnSync('pdftotext', ['-bbox', f, '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }); } catch (e) { return null; } finally { fs.unlinkSync(f); }
  if (out.status !== 0) return null;
  return out.stdout.split('<page ').slice(1).map(pg => Math.max(0, ...[...pg.matchAll(/yMax="([\d.]+)"/g)].map(m => +m[1])));
}
const LONG = ['Crazy Hair Night and Bring a Friend, Wear Your Team Colors Tonight', 'Pajama Night with the Whole Family and a Very Long Extra Description', 'Short', 'Mismatch Night Followed by the Big Game Night Celebration Finale'];
(async () => {
  const t = await open({ viewport: { width: 1366, height: 900 } }), page = t.page;
  await page.evaluate(() => document.querySelector('.tabs button[data-tab="reports"]').click());
  await t.report('noteSheets');
  // Draw each quarter with invented long themes on every night, through the report's own renderer.
  const draw = (q, themes) => page.evaluate(([q, themes]) => {
    const cal = App.season.calendar.map((r, i) => Object.assign({}, r, { Theme: themes[i % themes.length] }));
    const html = Reports.LIST.find(r => r.id === 'noteSheets').render({ master: App.master, settings: { quarter: q }, calendar: cal, season: App.season, today: '2026-11-18', opts: {} });
    document.getElementById('report').innerHTML = html;
    return document.querySelectorAll('#report .sheet').length;
  }, [q, themes]);
  const pdf = async format => { await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await page.emulateMedia({ media: 'print' }); try { await page.waitForTimeout(250); return await page.pdf(format ? { format, printBackground: true } : { preferCSSPageSize: true, printBackground: true }); } finally { await page.emulateMedia({ media: null }); await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); } };

  for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
    await t.test(q + ': long themes on every night still print on one letter page and one A4 page, nothing under the bottom margin', async () => {
      assert.strictEqual(await draw(q, LONG), 1, 'one sheet');
      const let_ = await pdf(), a4 = await pdf('A4');
      assert.strictEqual(boxes(let_).length, 1, 'letter pages ' + boxes(let_).length); assert.strictEqual(boxes(a4).length, 1, 'A4 pages ' + boxes(a4).length);
      const l = lowest(let_), a = lowest(a4); if (l) assert(l[0] <= 760, 'letter text ends at ' + l[0]); if (a) assert(a[0] <= 820, 'A4 text ends at ' + a[0]);
    });
  }
  await t.test('no night block is taller than the sum of its rows, and a long theme is smaller type than a short one', async () => {
    await draw('Q2', LONG);
    await t.printed(async () => {
      const r = await page.evaluate(() => [...document.querySelectorAll('#report .nblock')].map(b => {
        const th = b.querySelector('th.nhead'), rows = [...b.querySelectorAll('tr')], sum = rows.reduce((s, tr) => s + tr.getBoundingClientRect().height, 0);
        return { th: th.getBoundingClientRect().height, sum, fs: parseFloat(getComputedStyle(b.querySelector('i') || b.querySelector('b')).fontSize) };
      }));
      r.forEach(x => assert(x.th <= x.sum + 1, 'head ' + x.th + ' vs rows ' + x.sum));
      assert(Math.min(...r.map(x => x.fs)) < Math.max(...r.map(x => x.fs)), 'long themes use a smaller size');
    });
  });
  await t.test('the phone rule no longer applies on paper: A4 prints with the same date column as letter', async () => {
    await draw('Q2', LONG);
    const w = async format => { await page.emulateMedia({ media: 'print' }); try { return await page.evaluate(() => { const th = document.querySelector('#report th.nhead'), t = document.querySelector('#report table.nsheet'); return th.getBoundingClientRect().width / t.getBoundingClientRect().width; }); } finally { await page.emulateMedia({ media: null }); } };
    const letter = await w(); await page.setViewportSize({ width: 746, height: 900 }); const a4 = await w(); await page.setViewportSize({ width: 1366, height: 900 });
    assert(Math.abs(letter - a4) < 0.01, 'date column share letter ' + letter.toFixed(3) + ' vs narrow ' + a4.toFixed(3));
  });
  await t.done();
})();
