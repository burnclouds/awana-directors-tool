const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });

// One place says "changes": the bar under the tabs. Changes Planning Center still needs (edits made here to a Planning Center field) sit under the Apply line on a tab with held changes, alone on any other tab, with a link to the list. The top line no longer repeats them, and "unsaved" is said once.
// Usage: NODE_PATH=<dir with playwright> node test/pcneed-bar-browser.test.js
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 700 } })).newPage(); page.on('dialog', d => d.accept()); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  const need = () => page.evaluate(() => { const b = document.getElementById('draftBar'); return b.hidden ? '' : b.textContent.replace(/\s+/g, ' '); });
  const pend = async n => { await page.evaluate(k => { const ps = App.master.people.filter(x => Model.isActive(x)); ps.forEach((p, i) => { if (i < k) p['ov:Home Email Address'] = 'changed' + i + '@example.org'; else delete p['ov:Home Email Address']; }); App.touch(); App.refresh(); }, n); await page.waitForTimeout(400); };

  await test('nothing pending: no bar on Attendance, and the top line has no "pending PC changes"', async () => {
    await tab('attend'); await page.waitForTimeout(300); assert.strictEqual(await need(), '', 'no bar'); assert(!/pending PC changes/.test(await page.textContent('#status')));
  });
  await test('one change needed: it is not in the top line (and "UNSAVED CHANGES" is not repeated there), and the bar under the tabs says it alone on Attendance', async () => {
    await pend(1); const top = await page.textContent('#status'); assert(!/pending PC changes/.test(top) && !/UNSAVED CHANGES/.test(top), top);
    assert(/1 change is needed in Planning Center/.test(await need()), await need()); assert(!/Apply changes/.test(await need()), 'no Apply buttons on a tab with no held changes');
    assert(await page.isVisible('#lnkPcNeed'), 'the link is shown');
  });
  await test('on a tab with held changes the line sits under the Apply line, and "changes" is counted separately', async () => {
    await tab('roster'); await page.waitForTimeout(400); const box = await page.$('#rosterWrap input[type=checkbox][data-f]'); await box.click(); await page.waitForTimeout(400);
    const t = await need(); assert(/\d+ changes? not applied yet/.test(t) && /Apply changes/.test(t), t); assert(/1 change is needed in Planning Center/.test(t), t);
    // with an edit held, "unsaved" is said once (the Data file line), not again in the top line, and the top line is not orange
    assert(!/UNSAVED CHANGES/.test(await page.textContent('#status')), 'not repeated in the top line'); assert(/unsaved/.test(await page.textContent('#seasonStatus')), 'still said on the Data file line'); assert(!(await page.getAttribute('#status', 'class')).includes('dirty'), 'the top line is not orange');
    await page.click('#btnDraftDiscard'); await page.waitForTimeout(300);
  });
  await test('several: the wording is plural, and the link opens the "Changes needed in Planning Center" report', async () => {
    await pend(3); await tab('attend'); await page.waitForTimeout(300); assert(/3 changes are needed in Planning Center/.test(await need()), await need());
    await page.click('#lnkPcNeed'); await page.waitForTimeout(500); assert.strictEqual(await page.inputValue('#rSel'), 'pcChanges'); assert(await page.isVisible('#tab-reports'), 'the Reports tab is open');
  });
  await test('a phone: the bar does not make the page scroll sideways', async () => {
    await page.setViewportSize({ width: 375, height: 667 }); await tab('attend'); await page.waitForTimeout(400);
    const r = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); assert(r[0] <= r[1], 'scrollWidth ' + r[0] + ' > ' + r[1]);
  });
  await test('clearing the pending changes hides the bar again', async () => { await page.setViewportSize({ width: 1100, height: 700 }); await pend(0); await tab('attend'); await page.waitForTimeout(300); assert.strictEqual(await need(), '', 'bar text: ' + await need()); });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
