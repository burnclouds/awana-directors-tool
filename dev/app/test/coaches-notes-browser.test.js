// N1 in the browser: the Coaches binder notes sheets are in the Binders group, in the standard Coaches binder, print on portrait paper with every block whole, and fit a phone. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/coaches-notes-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), os = require('os'), path = require('path'), cp = require('child_process');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
setTimeout(() => { console.log('timed out'); process.exit(2); }, 200000).unref();
const boxes = buf => [...buf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(m => [Math.round(m[1]), Math.round(m[2])]);
function lowest(buf) {
  const f = path.join(os.tmpdir(), 'awana-notes-' + process.pid + '.pdf'); fs.writeFileSync(f, buf);
  let out; try { out = cp.spawnSync('pdftotext', ['-bbox', f, '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }); } catch (e) { return null; } finally { fs.unlinkSync(f); }
  if (out.status !== 0) return null;
  return out.stdout.split('<page ').slice(1).map(pg => Math.max(0, ...[...pg.matchAll(/yMax="([\d.]+)"/g)].map(m => +m[1])));
}
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto('http://localhost:' + server.address().port + '/index.html'); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => document.querySelector('.tabs button[data-tab="reports"]').click()); await page.waitForTimeout(200);
  const toPdf = async () => { await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(250); const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true }); await page.emulateMedia({ media: 'screen' }); await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); return buf; };
  const showQ = async q => { await page.evaluate(() => App.showReport('noteSheets')); await page.click('#btnReportOptions'); await page.click('#qWrap button:text-is("' + q + '")'); await page.click('#pgDone'); await page.waitForTimeout(300); };
  const info = q => page.evaluate(([q]) => ({ n: Calendar.nights(Season.current ? Season.current().calendar : App.calendar ? App.calendar() : [], q).length }), [q]).catch(() => null);

  await test('B1/B2: in the Binders group, with the Quarter pills; the blocks follow the quarter', async () => {
    await page.evaluate(() => App.showReport('noteSheets')); await page.waitForTimeout(300);
    assert.strictEqual((await page.textContent('#rSubs button.on')).trim(), 'Binders'); await page.click('#btnReportOptions'); assert(await page.isVisible('#qWrap'), 'quarter pills'); await page.click('#pgDone');
    await showQ('Q2'); const q2 = await page.locator('#report .nblock').count(); await showQ('Q4'); const q4 = await page.locator('#report .nblock').count();
    assert(q2 > 0 && q4 > q2, 'Q2 ' + q2 + ' Q4 ' + q4); assert.strictEqual(await page.locator('#report .sheet').count(), Math.ceil(q4 / (await page.evaluate(() => Reports.NIGHTS_PER_PAGE))));
  });
  await test('B3: the Print class binders pop-up offers it, ticked for the Coaches binder only', async () => {
    await page.click('#btnReportOptions'); await page.click('#btnBinders'); await page.waitForTimeout(200); await page.selectOption('#bindQuick', { label: 'Coaches binder' });
    assert(await page.isChecked('#dlg input[data-part="noteSheets"]')); await page.selectOption('#bindQuick', { label: 'Class binder' }); assert(!(await page.isChecked('#dlg input[data-part="noteSheets"]')));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  });
  await test('B6/B8: on paper every page is portrait letter, none blank, every page ends above the bottom margin, and blocks are whole', async () => {
    await showQ('Q4'); const want = await page.locator('#report .sheet').count(), buf = await toPdf();
    assert.strictEqual(boxes(buf).length, want, 'page count ' + boxes(buf).length + ' vs ' + want); boxes(buf).forEach(b => assert.deepStrictEqual(b, [612, 792]));
    const low = lowest(buf); if (low) low.forEach((y, i) => { assert(y > 20, 'page ' + (i + 1) + ' is not blank'); assert(y <= 760, 'page ' + (i + 1) + ' text ends at ' + y + 'pt of 774'); });
  });
  await test('a whole quarter fits ONE sheet of letter and of A4 (every quarter of the TEST club, the longest has 11 nights)', async () => {
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
      await showQ(q); assert.strictEqual(await page.locator('#report .sheet').count(), 1, q + ' is one sheet'); assert.strictEqual(boxes(await toPdf()).length, 1, q + ' prints on one letter page');
    }
    await showQ('Q4'); await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(250);
    const a4 = await page.pdf({ format: 'A4', printBackground: true }); await page.emulateMedia({ media: 'screen' }); await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    assert.strictEqual(boxes(a4).length, 1, 'Q4 prints on one A4 page'); const low = lowest(a4); if (low) assert(low[0] <= 820, 'A4 text ends at ' + low[0] + 'pt of 842');
  });
  await test('B7: the whole Coaches binder stays portrait', async () => {
    await page.click('#btnReportOptions'); await page.click('#btnBinders'); await page.waitForTimeout(200); await page.selectOption('#bindQuick', { label: 'Coaches binder' }); await page.click('#bindNone'); await page.click('#bindGo'); await page.waitForTimeout(600);
    assert(/Coaches notes/.test(await page.textContent('#report'))); const buf = await toPdf(); boxes(buf).forEach(b => assert.deepStrictEqual(b, [612, 792]));
  });
  await test('B9: on a phone nothing scrolls sideways and the supply table keeps its five columns', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => App.showReport('noteSheets')); await page.waitForTimeout(400);
    const r = await page.evaluate(() => { const rp = document.getElementById('report'), t = document.querySelector('#report table.nsheet'); return { sw: rp.scrollWidth, cw: rp.clientWidth, th: t.querySelectorAll('thead th').length, tsw: t.scrollWidth, tcw: t.clientWidth }; });
    assert(r.sw <= r.cw + 1, 'report scrolls sideways ' + r.sw + '/' + r.cw); assert.strictEqual(r.th, 9, 'Night, Workers (spans 2), gap, Item / Size, Group, Name, Paid, gap, Notes'); assert(r.tsw <= r.tcw + 1, 'table clipped');
  });
  await test('print at a narrow window shows no app chrome (the phone tab menu "Reports" bar leaked into the print preview)', async () => {
    await page.setViewportSize({ width: 600, height: 900 }); await page.evaluate(() => App.showReport('noteSheets')); await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(250);
    const vis = await page.evaluate(() => ['#tabMenu', '.tabs', '.top', '#rSubs', '#pageSum', '#report .sheet.notes > h2'].map(s => [s, [...document.querySelectorAll(s)].some(e => e.offsetParent !== null || getComputedStyle(e).display !== 'none' && getComputedStyle(e).position === 'fixed')]).filter(x => x[1] && x[0] !== '#rSubs').map(x => x[0]));
    await page.emulateMedia({ media: 'screen' }); await page.setViewportSize({ width: 1366, height: 900 }); await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    assert.deepStrictEqual(vis, [], 'visible in print: ' + vis.join(', '));
  });
  await test('no script errors', async () => assert.deepStrictEqual(errs, []));
  console.log('\n' + passed + ' passed, ' + failed + ' failed'); await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})();
