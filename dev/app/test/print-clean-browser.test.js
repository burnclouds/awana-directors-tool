// N37 print review (F1, F6, F9, F10, F11 and the later small ones): what the PAPER says, read back from a real PDF (Chromium's print engine + pdftotext), on invented TEST data only.
//  - screen help and screen-only controls do not print, but are still on the screen;
//  - the "* = changes team" note prints only when a child with a "*" is on the page;
//  - no page of a report ends on a heading whose table starts on the next page.
// Usage: NODE_PATH=<dir with playwright> node test/print-clean-browser.test.js   (needs pdftotext; says so and skips without it)
const assert = require('assert'), fs = require('fs'), http = require('http'), os = require('os'), path = require('path'), cp = require('child_process');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const hasPdftotext = (() => { try { return cp.spawnSync('pdftotext', ['-v']).status !== null; } catch (e) { return false; } })();
if (!hasPdftotext) { console.log('SKIP: pdftotext is not installed'); process.exit(0); }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
setTimeout(() => { console.log('timed out'); process.exit(2); }, 240000).unref();
const pagesOf = buf => { const f = path.join(os.tmpdir(), 'awana-clean-' + process.pid + '.pdf'); fs.writeFileSync(f, buf); const t = cp.spawnSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout; fs.unlinkSync(f); return t.split('\f').filter(x => x.trim()); };
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto('http://localhost:' + server.address().port + '/index.html'); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const show = async (id, opts) => { await page.evaluate(() => document.querySelector('.tabs button[data-tab="reports"]').click()); await page.waitForTimeout(150); await page.evaluate(([r, o]) => { App.reportOptions(o || {}); App.showReport(r); }, [id, opts]); await page.waitForFunction(() => document.querySelectorAll('#report .sheet').length > 0); await page.waitForTimeout(300); };
  const paper = async (id, opts) => {      // the printed text of a report: one string per page, plus the on-screen text and headings
    await show(id, opts);
    const screen = await page.evaluate(() => ({ text: document.getElementById('report').textContent, heads: [...document.querySelectorAll('#report h1, #report h2, #report h3, #report h4')].map(h => h.textContent.trim()).filter(Boolean) }));
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(250);
    const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true }); await page.emulateMedia({ media: 'screen' }); await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    return { pages: pagesOf(buf), screen };
  };
  const flat = x => x.pages.join('\n').replace(/\s+/g, ' ');

  // F1: no page ends on a heading (the Statistics report put "Extra" at the foot of page 2 and its table on page 3)
  await test('F1: no page of the Statistics report ends on a heading', async () => {
    const r = await paper('statistics'); assert(r.pages.length > 1, 'expected a multi-page report');
    r.pages.slice(0, -1).forEach((p, i) => { const last = p.split('\n').map(l => l.trim()).filter(Boolean).pop() || ''; assert(!r.screen.heads.includes(last), 'page ' + (i + 1) + ' ends on the heading "' + last + '"'); });
  });
  // F11: Statistics prints no screen help, no empty "Statistics for:" label, and the year once
  await test('F11: Statistics keeps its explanations and the span picker off the paper, but on the screen', async () => {
    const r = await paper('statistics'), t = flat(r);
    ['Statistics for:', 'treats these nights as the whole set', 'Share = average attendance'].forEach(w => { assert(!t.includes(w), 'printed: ' + w); assert(r.screen.text.replace(/\s+/g, ' ').includes(w.replace(/:$/, '')), 'gone from the screen too: ' + w); });
  });
  await test('F11: the Statistics subtitle shows the year once', async () => {
    const r = await paper('statistics'), sub = (r.pages[0].split('\n').find(l => /AWANA|Club/i.test(l)) || '').trim();
    assert(sub, 'no subtitle line found'); assert(!(/\b26-27\b/.test(sub) && /\b2026-27\b/.test(sub)), 'year twice: ' + sub);
  });
  // F6: the team note only when a "*" is on the page
  const NOTE = '* = changes team';
  await test('F6: with no team moves, no report prints the "* = changes team" note', async () => {
    for (const id of ['teams', 'binderAll', 'binderClass', 'attendance']) { const t = flat(await paper(id)); assert(!t.includes(NOTE), id + ' prints the note with no moves'); }
  });
  await test('F6: a team move brings the note back on that report', async () => {
    const q = await page.evaluate(() => { const M = Model, s = App.season, p = App.master.people.find(x => M.isActive(x) && M.isClubber(x) && ['Sparks', 'T&T'].includes(M.groupOf(M.room(x)))), q = App.settings ? App.settings.quarter : 'Q2'; const cal = s.calendar, qq = (document.getElementById('quarter') || {}).value || 'Q2'; const rows = cal.filter(r => r.Quarter === qq && !r['No Club'] && r.Type !== 'Event'); Season.setTeamMove(s, p[M.X.ID], qq, rows[1].Date, 'Red', cal); return qq; });
    const t = flat(await paper('teams')); assert(t.includes(NOTE), 'a move exists in ' + q + ' but the note is gone');
  });
  // F9, F10: instructions written for the screen stay on the screen
  await test('F9: the No photos report does not print its screen instruction', async () => { const r = await paper('photos'); assert(!flat(r).includes('can be edited on the Roster tab'), 'printed'); assert(r.screen.text.includes('can be edited on the Roster tab'), 'gone from the screen'); });
  await test('F10: Books and end-of-year awards does not print its source note', async () => { const r = await paper('booksYear'); assert(!flat(r).includes('Books come from Progress'), 'printed'); assert(r.screen.text.includes('Books come from Progress'), 'gone from the screen'); });
  // F12: the year is on the page once, not after every child
  await test('F12: Awards earned prints the year once, not after every child', async () => {
    const r = await paper('awardsByChild'), n = (flat(r).match(/2026-27/g) || []).length; assert(n <= r.pages.length, 'the year is printed ' + n + ' times on ' + r.pages.length + ' pages');
  });
  // F13: a report with nothing to show disables Print and puts no blank page in a printout
  await test('F13: an empty report disables Print and prints no page; a full one does not', async () => {
    for (const id of ['pcChanges', 'ceremony']) { const r = await paper(id); assert.strictEqual(await page.evaluate(() => document.getElementById('btnPrint').disabled), true, id + ': Print is still on'); assert.strictEqual(r.pages.length, 0, id + ' printed ' + r.pages.length + ' page(s) with nothing to say'); }
    await paper('attendance'); assert.strictEqual(await page.evaluate(() => document.getElementById('btnPrint').disabled), false, 'Print is off on a report with pages');
  });
  await test('F13: the Pace Watch subtitle never says "data through nothing entered"', async () => { const r = await paper('paceWatch'); assert(!/data through nothing/.test(flat(r) + r.screen.text), 'wording'); });
  // F7: every phone number on the emergency pages is in one style
  await test('F7: phone numbers on the emergency pages are all (ddd) ddd-dddd', async () => {
    for (const id of ['binderClass', 'binderAll']) {
      const t = flat(await paper(id)), found = t.match(/\(?\b\d{3}\)?[ .-]?\d{3}[ .-]\d{4}\b|(?<![\d(])\d{10}(?!\d)/g) || [];
      assert(found.length > 5, id + ': found too few numbers to judge (' + found.length + ')'); const bad = found.filter(x => !/^\(\d{3}\) \d{3}-\d{4}$/.test(x)); assert(!bad.length, id + ': other styles: ' + bad.slice(0, 4).join(' | '));
    }
  });
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
