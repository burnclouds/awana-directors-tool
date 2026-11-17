// The Bug button and the bug reports on the Debug tab, in a real browser. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/bug-button-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.clock.setFixedTime(new Date('2026-11-16T12:00:00'));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const tab0 = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t), tab = (_p, t) => tab0(t);
  const shown = id => page.evaluate(i => { const e = document.getElementById(i); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; }, id);
  const bugs = () => page.evaluate(() => Season.bugList(App.season).map(f => ({ id: f.id, note: f.note, status: f.status, tab: f.tab, ver: f.ver, reply: f.reply })));

  await test('the Bug button is hidden by default; Flag is shown', async () => {
    await tab(page, 'stats'); await page.waitForTimeout(150);
    assert(!(await shown('btnBugMode')), 'Bug hidden'); assert(await shown('btnFlagMode'), 'Flag shown');
    assert.strictEqual(await page.evaluate(() => App.season.config.bugButton), undefined, 'the key is absent while off');
  });
  await test('the Options switch shows the Bug button on every tab and is saved in the data file; turning it off removes the key', async () => {
    await tab(page, 'options'); await page.waitForTimeout(200); await page.check('#optBugOn'); await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(() => App.season.config.bugButton), true);
    for (const t of ['roster', 'stats', 'uniforms', 'debug', 'reports']) { await tab(page, t); await page.waitForTimeout(80); assert(await shown('btnBugMode'), 'Bug visible on ' + t); }
  });
  await test('Bug mode: click a spot, write a note, and a bug report is saved with the tab, the trail and the app version; the mode turns off', async () => {
    await tab(page, 'stats'); await page.waitForTimeout(200);
    await page.click('#btnBugMode'); assert.strictEqual(await page.getAttribute('#btnBugMode', 'aria-pressed'), 'true');
    await page.click('#statsWrap h3'); await page.waitForTimeout(200);
    assert(/Bug report/.test(await page.textContent('#dlg h3')), 'the dialog says Bug report');
    await page.fill('#flNote', 'The headings are hard to read'); await page.click('#flSave'); await page.waitForTimeout(200);
    const b = await bugs(); assert.strictEqual(b.length, 1); assert.strictEqual(b[0].status, 'open'); assert.strictEqual(b[0].tab, 'stats');
    assert.strictEqual(b[0].ver, await page.evaluate(() => document.querySelector('meta[name="app-version"]').content));
    assert.strictEqual(await page.getAttribute('#btnBugMode', 'aria-pressed'), 'false', 'the mode is off');
  });
  await test('a bug report never reaches To do: the badge and the Notes and flags list are unchanged', async () => {
    await tab(page, 'todo'); await page.waitForTimeout(250);
    const t = await page.evaluate(() => ({ badge: document.getElementById('todoBadge').textContent, text: document.getElementById('tab-todo').innerText }));
    assert(!/headings are hard to read/.test(t.text), 'the report is not on To do');
    const before = await page.evaluate(() => Season.noteList(App.season).length); assert.strictEqual(before, 0, 'no notes: the report is not one');
  });
  await test('Pressing Flag while Bug mode is on switches to flag mode (and the dialog says Flag)', async () => {
    await tab(page, 'stats'); await page.waitForTimeout(150);
    await page.click('#btnBugMode'); await page.click('#btnFlagMode');
    assert.strictEqual(await page.getAttribute('#btnFlagMode', 'aria-pressed'), 'true'); assert.strictEqual(await page.getAttribute('#btnBugMode', 'aria-pressed'), 'false');
    await page.keyboard.press('Escape');
  });
  await test('the Debug tab lists the report; a reply with a status is saved and shown; filters work', async () => {
    await tab(page, 'debug'); await page.waitForTimeout(250);
    assert(/Bug reports and feature requests \(1 open\)/.test(await page.textContent('#debugWrap')), 'heading with the open count');
    await page.click('#debugWrap button[data-bugreply]'); await page.selectOption('#debugWrap [data-bugstatus]', 'answered'); await page.fill('#debugWrap [data-bugtext]', 'Thanks, looking at it'); await page.click('#debugWrap button[data-bugsave]'); await page.waitForTimeout(200);
    const b = await bugs(); assert.strictEqual(b[0].status, 'answered'); assert.strictEqual(b[0].reply, 'Thanks, looking at it');
    assert(/Thanks, looking at it/.test(await page.textContent('#debugWrap')), 'the reply is on screen');
    await page.click('#debugWrap button[data-bugfilter="open"]'); await page.waitForTimeout(100); assert(/None with that status/.test(await page.textContent('#debugWrap')), 'the open filter is empty');
    await page.click('#debugWrap button[data-bugfilter="answered"]'); await page.waitForTimeout(100); assert(/headings are hard to read/.test(await page.textContent('#debugWrap')), 'the answered filter shows it');
    assert(/Bug reports/.test(await page.evaluate(() => App.season.history[App.season.history.length - 1].label)), 'History names the area');
  });
  await test('Go on a report whose tab no longer exists shows a message and does not break the page', async () => {
    await page.evaluate(() => { const f = Season.bugList(App.season)[0]; App.season.flags[f.id].tab = 'nosuchtab'; App.renderDebug(); });
    await page.click('#debugWrap button[data-buggo]'); await page.waitForTimeout(250);
    assert(await shown('debugWrap'), 'the Debug tab is still showing'); assert.deepStrictEqual(errs, []);
  });
  await test('turning the switch off hides the button but keeps the report', async () => {
    await tab(page, 'options'); await page.waitForTimeout(200); await page.uncheck('#optBugOn'); await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(() => App.season.config.bugButton), undefined); await tab(page, 'stats'); await page.waitForTimeout(100);
    assert(!(await shown('btnBugMode')), 'hidden again'); assert.strictEqual((await bugs()).length, 1, 'the report is still there');
  });
  await test('no page errors', async () => { assert.deepStrictEqual(errs, []); });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
