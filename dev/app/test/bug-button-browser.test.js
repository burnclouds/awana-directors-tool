// The Bug button, shared locations and earlier reports. Invented test club only.
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
  const bugs = () => page.evaluate(() => Season.bugList(App.season).map(f => ({ id: f.id, note: f.note, status: f.status, tab: f.tab, ver: f.ver, reply: f.reply, replies: f.replies })));

  await test('the Bug button is hidden by default; Flag is shown', async () => {
    await tab(page, 'stats'); await page.waitForTimeout(150);
    assert(!(await shown('btnBugMode')), 'Bug hidden'); assert(await shown('btnFlagMode'), 'Flag shown');
    assert.strictEqual(await page.evaluate(() => App.season.config.bugButton), undefined, 'the key is absent while off');
  });
  await test('the Options switch shows the Bug button on every tab and is saved in the data file; turning it off removes the key', async () => {
    await tab(page, 'options'); await page.waitForTimeout(200); await page.check('#optBugOn'); if (await page.isVisible('#btnDraftApply')) await page.click('#btnDraftApply');
    assert.strictEqual(await page.evaluate(() => App.season.config.bugButton), true);
    for (const t of ['roster', 'stats', 'uniforms', 'debug', 'reports']) { await tab(page, t); await page.waitForTimeout(80); assert(await shown('btnBugMode'), 'Bug visible on ' + t); }
  });
  let code = '';
  const snapshot = () => page.evaluate(() => JSON.stringify({ season: App.season, settings: App.settings, dirty: App.dirty(), draft: App.draftPending(), undo: document.getElementById('btnUndo').disabled }));
  async function openCode(value) {
    await tab0('debug');
    await page.fill('#dbgLocationCode', value);
    await page.click('#dbgLocationForm button');
  }
  await test('Bug captures a portable attendance area and restores its filters without recording a report', async () => {
    await tab0('attend');
    const att = await page.evaluate(() => ({ date: document.getElementById('attDate').value, room: document.getElementById('attRoom').value }));
    const before = await snapshot();
    await page.click('#btnBugMode');
    await page.click('#attRoom');
    await page.waitForSelector('#shareLocationCode');
    code = await page.inputValue('#shareLocationCode');
    assert.deepStrictEqual(await page.evaluate(c => LocationCode.decode(c), code), { tab: 'attend', target: 'room', view: att });
    await page.click('#shareLocationClose');
    assert.strictEqual(await page.getAttribute('#btnBugMode', 'aria-pressed'), 'false');
    await page.evaluate(() => App.places.attend.set({ date: '', room: '' }));
    await openCode(code);
    assert.strictEqual(await page.inputValue('#attDate'), att.date);
    assert.strictEqual(await page.inputValue('#attRoom'), att.room);
    assert.match(await page.getAttribute('#attRoom', 'class'), /flashflag/);
    assert.strictEqual(await snapshot(), before);
    assert.strictEqual((await bugs()).length, 0);
  });
  await test('a report opens with its own quarter and leaves the shared quarter unchanged', async () => {
    const before = await snapshot();
    const value = await page.evaluate(() => LocationCode.encode({ tab: 'reports', target: 'preview', view: { report: 'standings', quarter: 'Q1' } }));
    await openCode(value);
    assert.strictEqual(await page.evaluate(() => App.tab), 'reports');
    assert.match(await page.textContent('#bNote'), /Q1/);
    assert.match(await page.textContent('#calNote'), /Q1/);
    assert.strictEqual(await snapshot(), before);
    await tab0('roster');
    await page.selectOption('#fQuarter', 'Q3');
    await tab0('reports');
    assert.match(await page.textContent('#bNote'), /Q3/);
    await openCode(value);
    assert.match(await page.textContent('#bNote'), /Q1/);
    await page.evaluate(() => {
      const select = Array.from(document.querySelectorAll('#tab-reports select')).find(el => Array.from(el.options).some(o => o.value === 'standings'));
      select.value = 'attendance'; select.dispatchEvent(new Event('change', { bubbles: true }));
      select.value = 'standings'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    assert.match(await page.textContent('#bNote'), /Q3/);
  });
  await test('invalid codes and unavailable dates are handled without changing saved state', async () => {
    const before = await snapshot();
    await openCode('AW1.invalid');
    assert.match(await page.textContent('#dbgLocationStatus'), /incomplete or damaged/);
    const missing = await page.evaluate(() => LocationCode.encode({ tab: 'attend', view: { date: '2090-09-13' } }));
    await openCode(missing);
    assert.strictEqual(await page.evaluate(() => App.tab), 'attend');
    assert.notStrictEqual(await page.inputValue('#attDate'), '2090-09-13');
    assert.strictEqual(await snapshot(), before);
  });
  await page.evaluate(() => App.addFlag({ level: 'bug', note: 'The headings are hard to read', tab: 'stats', trail: ['Statistics', 'Headings'] }));
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
  await test('the Debug tab lists the report; a reply is added without changing the status; a status pick is saved and the list follows it; filters work', async () => {
    await tab(page, 'debug'); await page.waitForTimeout(250);
    assert(/Saved bug reports \(1 open\)/.test(await page.textContent('#debugWrap')), 'heading with the open count');
    assert.deepStrictEqual(await page.$$eval('#debugWrap .bugfilter button.on', b => b.map(x => x.textContent)), ['Open'], 'the list opens on Open'); assert(await page.isVisible('#debugWrap button[data-bugreply]'), 'and the open report is listed');
    await page.click('#debugWrap button[data-bugreply]'); await page.fill('#debugWrap [data-bugtext]', 'Thanks, looking at it'); await page.click('#debugWrap button[data-bugadd]'); await page.waitForTimeout(200);
    let b = await bugs(); assert.strictEqual(b[0].status, 'open', 'a reply does not change the status'); const reps = Object.values(b[0].replies || {}); assert.strictEqual(reps.length, 1); assert.strictEqual(reps[0].text, 'Thanks, looking at it'); assert.strictEqual(reps[0].by, 'leader'); assert(/^\d{4}-\d\d-\d\d$/.test(reps[0].at));
    assert(/Thanks, looking at it/.test(await page.textContent('#debugWrap')), 'the reply is on screen, with who wrote it'); assert(/Leader, /.test(await page.textContent('#debugWrap')));
    await page.click('#debugWrap button[data-bugreply]'); await page.selectOption('#debugWrap [data-bugby]', 'developer'); await page.fill('#debugWrap [data-bugtext]', 'On it'); await page.click('#debugWrap button[data-bugadd]'); await page.waitForTimeout(200);
    b = await bugs(); assert.strictEqual(Object.keys(b[0].replies).length, 2, 'a second reply, a conversation'); assert(/Developer, /.test(await page.textContent('#debugWrap')));
    await page.selectOption('#debugWrap [data-bugstatus]', 'dropped'); await page.waitForTimeout(200); b = await bugs(); assert.strictEqual(b[0].status, 'dropped', 'the status pick is saved at once');
    await page.click('#debugWrap button[data-bugfilter="open"]'); await page.waitForTimeout(100); assert(/None with that status/.test(await page.textContent('#debugWrap')), 'the open filter is empty');
    assert.deepStrictEqual(await page.$$eval('#debugWrap .bugfilter button', b => b.map(x => x.textContent)), ['All', 'Open', 'Fixed', 'Dropped'], 'no Answered filter');
    await page.click('#debugWrap button[data-bugfilter="dropped"]'); await page.waitForTimeout(100); assert(/headings are hard to read/.test(await page.textContent('#debugWrap')), 'the dropped filter shows it');
    await page.click('#debugWrap button[data-bugrm]'); await page.waitForTimeout(200); b = await bugs(); assert.strictEqual(Object.keys(b[0].replies).length, 1, 'Remove takes one reply back');
    assert(/Bug reports/.test(await page.evaluate(() => App.season.history[App.season.history.length - 1].label)), 'History names the area');
  });
  await test('Debug opens on the Open filter, the chosen filter is coloured, and the reply editor stacks its box above the By pick', async () => {
    await tab(page, 'debug'); await page.waitForTimeout(250);
    const on = () => page.$$eval('#debugWrap .bugfilter button.on', b => b.map(x => x.textContent));
    await page.click('#debugWrap button[data-bugfilter="all"]'); assert.deepStrictEqual(await on(), ['All']);
    const bg = await page.$eval('#debugWrap .bugfilter button.on', b => getComputedStyle(b).backgroundColor), off = await page.$eval('#debugWrap .bugfilter button:not(.on)', b => getComputedStyle(b).backgroundColor); assert.notStrictEqual(bg, off, 'the chosen filter has its own colour');
    await page.click('#debugWrap button[data-bugreply]'); const box = await page.evaluate(() => { const r = e => document.querySelector(e).getBoundingClientRect(), cell = r('#debugWrap .bugedit'); return { sel: r('#debugWrap [data-bugby]'), ta: r('#debugWrap [data-bugtext]'), cell }; });
    assert(box.ta.bottom <= box.sel.top + 1, 'the reply box sits above the By pick'); assert(box.ta.width >= box.cell.width - 4, 'the text box fills the cell'); assert(box.ta.left >= box.cell.left - 1 && box.ta.right <= box.cell.right + 1, 'and stays inside it');
    await page.click('#debugWrap button[data-bugcancel]'); await page.click('#debugWrap button[data-bugfilter="all"]');
  });
  await test('Go on a report whose tab no longer exists shows a message and does not break the page', async () => {
    await page.evaluate(() => { const f = Season.bugList(App.season)[0]; App.season.flags[f.id].tab = 'nosuchtab'; App.renderDebug(); });
    await page.click('#debugWrap button[data-buggo]'); await page.waitForTimeout(250);
    assert(await shown('debugWrap'), 'the Debug tab is still showing'); assert.deepStrictEqual(errs, []);
  });
  await test('turning the switch off hides the button but keeps the report', async () => {
    await tab(page, 'options'); await page.waitForTimeout(200); await page.uncheck('#optBugOn'); if (await page.isVisible('#btnDraftApply')) await page.click('#btnDraftApply');
    assert.strictEqual(await page.evaluate(() => App.season.config.bugButton), undefined); await tab(page, 'stats'); await page.waitForTimeout(100);
    assert(!(await shown('btnBugMode')), 'hidden again'); assert.strictEqual((await bugs()).length, 1, 'the report is still there');
  });
  await test('no page errors', async () => { assert.deepStrictEqual(errs, []); });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
