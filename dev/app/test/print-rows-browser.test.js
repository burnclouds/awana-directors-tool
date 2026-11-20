// N37 done-when: no table row is split across a printed page. Read back from a real PDF (Chromium print engine + pdftotext), on invented TEST data only.
// How a split is seen: every word that occurs exactly once in the whole printout belongs to one row; a row whose unique words are on different pages was cut by a page break.
// To keep the check from passing only because no row happens to sit on a page edge, the row heights are nudged by several amounts (so the page edges move across the rows). A CONTROL run makes one row taller
// than a whole page, which cannot avoid being split: the detector must flag it, otherwise it is blind and the test fails. (Observation: with the no-split rule switched off this Chromium still kept every row whole at
// eight row heights, so the rule in style.css is a safeguard rather than the only thing holding rows together; this test guards the result either way.)
// Usage: NODE_PATH=<dir with playwright> node test/print-rows-browser.test.js   (needs pdftotext; says so and skips without it)
const assert = require('assert'), fs = require('fs'), http = require('http'), os = require('os'), path = require('path'), cp = require('child_process');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
if (!(() => { try { return cp.spawnSync('pdftotext', ['-v']).status !== null; } catch (e) { return false; } })()) { console.log('SKIP: pdftotext is not installed'); process.exit(0); }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
setTimeout(() => { console.log('timed out'); process.exit(2); }, 560000).unref();
const pagesOf = buf => { const f = path.join(os.tmpdir(), 'awana-rows-' + process.pid + '.pdf'); fs.writeFileSync(f, buf); const t = cp.spawnSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout; fs.unlinkSync(f); return t.split('\f').filter(x => x.trim()); };
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto('http://localhost:' + server.address().port + '/index.html'); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const show = async id => { await page.evaluate(() => document.querySelector('.tabs button[data-tab="reports"]').click()); await page.waitForTimeout(150); await page.evaluate(r => { App.reportOptions({}); App.showReport(r); }, id); await page.waitForFunction(() => document.querySelectorAll('#report .sheet').length > 0); await page.waitForTimeout(300); };
  // Print the report with every cell nudged by `pad` px (and, for the control, the no-split rule off); return the number of split rows, the rows judged and the pages.
  const run = async (id, pad, control) => {
    await show(id); await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(200);
    const style = await page.addStyleTag({ content: '#report .sheet td, #report .sheet th { padding-top:' + pad + 'px !important; padding-bottom:' + pad + 'px !important }' });
    if (control) await page.evaluate(() => { const td = document.querySelector('#report .sheet tbody tr td:last-child'); td.insertAdjacentHTML('beforeend', '<br>' + Array.from({ length: 700 }, (_, i) => 'zqx' + String(i).padStart(4, '0')).join(' ')); });      // one row taller than a page
    const rows = await page.evaluate(() => [...document.querySelectorAll('#report .sheet tbody tr')].map(tr => tr.innerText.split(/\s+/).filter(w => w.replace(/\W/g, '').length >= 4)));
    const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    await style.evaluate(n => n.remove()); await page.emulateMedia({ media: 'screen' }); await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    const pages = pagesOf(buf), all = pages.join('\n'), count = w => all.split(w).length - 1;
    let split = 0, judged = 0;
    rows.forEach(words => { const uniq = [...new Set(words)].filter(w => count(w) === 1); if (uniq.length < 2) return; judged++; const at = new Set(uniq.map(w => pages.findIndex(p => p.includes(w)))); if (at.size > 1) split++; });
    return { split, judged, pages: pages.length };
  };
  const REPORTS = [['binderAll', [0, 2, 4, 6, 8, 10, 12, 14]], ['volunteers', [0, 3, 6, 9]], ['lessons', [0, 3, 6, 9]], ['uniforms', [0, 3, 6, 9]], ['booksYear', [0, 3, 6, 9]], ['attendDates', [0, 3, 6, 9]]];
  for (const [id, pads] of REPORTS) {
    await test(id + ': no row is split across a page, at ' + pads.length + ' row heights', async () => {
      let judged = 0, multi = 0; for (const pad of pads) { const r = await run(id, pad, false); judged += r.judged; if (r.pages > 1) multi++; assert.strictEqual(r.split, 0, 'at padding ' + pad + 'px ' + r.split + ' row(s) were cut by a page break (' + r.pages + ' pages)'); }
      assert(multi > 0, 'the report never ran past one page, so no break was tested'); assert(judged >= 20, 'too few rows could be judged (' + judged + ')');
    });
  }
  await test('control: a row taller than a page is reported as split (the detector can see a split)', async () => {
    const r = await run('binderAll', 0, true); assert(r.pages > 1, 'the report did not run past one page'); assert(r.split >= 1, 'a row taller than a page was not reported as cut: the detector cannot see a split');
  });
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
