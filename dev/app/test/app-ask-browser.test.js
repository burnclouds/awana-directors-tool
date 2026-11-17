// The app's own pop-up (app-ask.js, UX-20): alert, confirm, choose, form, typed phrase, queueing, nesting over another dialog, focus, Esc, the Undo message, the phone layout, and the test helper.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/app-ask-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright'), { onAppDialog } = require('./lib/app-dialogs');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async (w, h) => { const ctx = await browser.newContext({ viewport: { width: w || 1280, height: h || 900 } }), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); return { page, ctx, errs }; };
  const shown = page => page.evaluate(() => { const d = document.getElementById('ask'); return d.open ? d.dataset.kind : ''; });
  const press = (page, id) => page.click('#ask [data-ask="' + id + '"]');

  await test('alert: opens as an alertdialog with its message (line breaks kept), OK closes it and the answer arrives; focus goes back to where it was', async () => {
    const { page, ctx } = await open(); await page.focus('#btnSeasonSave'); const p = page.evaluate(() => App.ask.alert('First line\n\nSecond line', { title: 'Heads up' }).then(() => 'done'));
    await page.waitForSelector('#ask[open]'); assert.strictEqual(await page.getAttribute('#ask', 'role'), 'alertdialog'); assert.strictEqual(await page.textContent('#askTitle'), 'Heads up');
    assert(/First line\s+Second line/.test(await page.textContent('#askMsg')) && (await page.$eval('#askMsg', e => getComputedStyle(e).whiteSpace)) === 'pre-line', 'line breaks kept');
    assert.strictEqual(await page.evaluate(() => document.activeElement.dataset.ask), 'ok', 'OK has the focus'); await press(page, 'ok'); assert.strictEqual(await p, 'done'); assert.strictEqual(await shown(page), '');
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'btnSeasonSave', 'focus went back'); await ctx.close();
  });
  await test('confirm: OK gives true, Cancel false, Esc false; the dialog is always answered exactly once', async () => {
    const { page, ctx } = await open();
    let p = page.evaluate(() => App.ask.confirm('Go ahead?')); await page.waitForSelector('#ask[open]'); await press(page, 'ok'); assert.strictEqual(await p, true);
    p = page.evaluate(() => App.ask.confirm('Go ahead?')); await page.waitForSelector('#ask[open]'); await press(page, 'cancel'); assert.strictEqual(await p, false);
    p = page.evaluate(() => App.ask.confirm('Go ahead?')); await page.waitForSelector('#ask[open]'); await page.keyboard.press('Escape'); assert.strictEqual(await p, false); assert.strictEqual(await shown(page), ''); await ctx.close();
  });
  await test('a danger confirm puts the focus on Cancel and the OK button is red and says what it does', async () => {
    const { page, ctx } = await open(); const p = page.evaluate(() => App.ask.confirm('This removes the book.', { danger: true, ok: 'Delete book' })); await page.waitForSelector('#ask[open]');
    assert.strictEqual(await page.evaluate(() => document.activeElement.dataset.ask), 'cancel'); assert.strictEqual(await page.textContent('#ask [data-ask="ok"]'), 'Delete book'); assert(await page.$eval('#ask [data-ask="ok"]', b => b.classList.contains('danger')));
    await press(page, 'cancel'); assert.strictEqual(await p, false); await ctx.close();
  });
  await test('choose: returns the id of the button pressed; Esc returns the cancel id', async () => {
    const { page, ctx } = await open(); const opts = { buttons: [{ id: 'apply', label: 'Apply', primary: true }, { id: 'discard', label: 'Discard', danger: true }, { id: 'stay', label: 'Stay here' }], cancel: 'stay' };
    let p = page.evaluate(o => App.ask.choose('You have a draft.', o), opts); await page.waitForSelector('#ask[open]'); await press(page, 'discard'); assert.strictEqual(await p, 'discard');
    p = page.evaluate(o => App.ask.choose('You have a draft.', o), opts); await page.waitForSelector('#ask[open]'); await page.keyboard.press('Escape'); assert.strictEqual(await p, 'stay'); await ctx.close();
  });
  await test('form: a required date is checked (the error shows, the dialog stays open, the field is marked invalid); a valid answer comes back as an object; Cancel gives null', async () => {
    const { page, ctx } = await open(); const form = { title: 'Blue Jewel', fields: [{ name: 'day', label: 'Day earned', type: 'date', required: true }, { name: 'why', label: 'Why', type: 'text' }, { name: 'n', label: 'How many', type: 'number', min: 1, max: 5, value: 2 }, { name: 'kind', label: 'Kind', type: 'select', options: [['a', 'Alpha'], ['b', 'Beta']], value: 'b' }] };
    let p = page.evaluate(f => App.ask.form(f), form); await page.waitForSelector('#ask[open]'); assert.strictEqual(await page.evaluate(() => document.activeElement.name), 'day', 'first field focused');
    await press(page, 'ok'); assert.strictEqual(await shown(page), 'form', 'still open'); assert(/needed/.test(await page.textContent('#askErr0')), await page.textContent('#askErr0')); assert.strictEqual(await page.getAttribute('#askF0', 'aria-invalid'), 'true');
    await page.fill('#askF0', '2026-11-18'); await page.fill('#askF2', '9'); await press(page, 'ok'); assert(/from 1 to 5/.test(await page.textContent('#askErr2')), await page.textContent('#askErr2'));
    await page.fill('#askF2', '3'); await page.fill('#askF1', 'by hand'); await press(page, 'ok'); assert.deepStrictEqual(await p, { day: '2026-11-18', why: 'by hand', n: 3, kind: 'b' });
    p = page.evaluate(f => App.ask.form(f), form); await page.waitForSelector('#ask[open]'); await press(page, 'cancel'); assert.strictEqual(await p, null); await ctx.close();
  });
  await test('form: Enter in a field submits it; a custom validate() message is shown', async () => {
    const { page, ctx } = await open(); const p = page.evaluate(() => App.ask.form({ fields: [{ name: 'year', label: 'Club year', value: '2026-27', pattern: '\\d{4}-\\d{2}', hint: 'Like 2027-28.', validate: v => v === '2099-00' ? 'Not that one.' : '' }] }));
    await page.waitForSelector('#ask[open]'); await page.fill('#askF0', '2099-00'); await page.keyboard.press('Enter'); assert(/Not that one/.test(await page.textContent('#askErr0')));
    await page.fill('#askF0', '27'); await page.keyboard.press('Enter'); assert(/Like 2027-28/.test(await page.textContent('#askErr0')), 'the pattern hint');
    await page.fill('#askF0', '2027-28'); await page.keyboard.press('Enter'); assert.deepStrictEqual(await p, { year: '2027-28' }); await ctx.close();
  });
  await test('typed phrase: OK stays disabled until the text matches exactly', async () => {
    const { page, ctx } = await open(); const p = page.evaluate(() => App.ask.typed('RESTORE', { message: 'This replaces your data.' })); await page.waitForSelector('#ask[open]');
    assert.strictEqual(await page.$eval('#ask [data-ask="ok"]', b => b.disabled), true); await page.fill('#askTyped', 'restore'); assert.strictEqual(await page.$eval('#ask [data-ask="ok"]', b => b.disabled), true, 'case matters');
    await page.fill('#askTyped', 'RESTORE'); assert.strictEqual(await page.$eval('#ask [data-ask="ok"]', b => b.disabled), false); await press(page, 'ok'); assert.strictEqual(await p, true); await ctx.close();
  });
  await test('two questions at once are asked one after the other, in order', async () => {
    const { page, ctx } = await open(); const both = page.evaluate(async () => { const a = App.ask.confirm('First?'), b = App.ask.confirm('Second?'); return [await a, await b]; });
    await page.waitForSelector('#ask[open]'); assert.strictEqual(await page.textContent('#askMsg'), 'First?'); await press(page, 'ok');
    await page.waitForFunction(() => document.getElementById('askMsg') && document.getElementById('askMsg').textContent === 'Second?'); await press(page, 'cancel'); assert.deepStrictEqual(await both, [true, false]); await ctx.close();
  });
  await test('asked while another dialog is open: it comes on top, the first stays open when it closes, and focus returns into the first', async () => {
    const { page, ctx } = await open(); await page.evaluate(() => { const d = document.getElementById('dlg'); d.innerHTML = '<h3>Under</h3><button id="underBtn">Go</button>'; d.showModal(); document.getElementById('underBtn').focus(); });
    const p = page.evaluate(() => App.ask.confirm('Sure?')); await page.waitForSelector('#ask[open]'); await press(page, 'ok'); assert.strictEqual(await p, true);
    assert.strictEqual(await page.evaluate(() => document.getElementById('dlg').open), true, 'the first dialog is still open'); assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'underBtn', 'focus is back in it'); await ctx.close();
  });
  await test('the test helper answers the app\'s dialogs like native ones (type, message, defaultValue, accept with a value, dismiss)', async () => {
    const ctx = await browser.newContext(), page = await ctx.newPage(), seen = []; onAppDialog(page, async d => { seen.push(d.type() + ':' + d.message()); if (d.type() === 'prompt') await d.accept('typed here'); else if (d.type() === 'confirm') await d.dismiss(); else await d.accept(); });
    await page.goto(url);
    const r = await page.evaluate(async () => { const a = await App.ask.form({ message: 'Name?', fields: [{ name: 'x', label: 'Name', value: 'dflt' }] }), c = await App.ask.confirm('Sure?'); await App.ask.alert('Fyi'); return [a, c]; });
    assert.deepStrictEqual(r, [{ x: 'typed here' }, false]); assert.deepStrictEqual(seen, ['prompt:Name?', 'confirm:Sure?', 'alert:Fyi']); await ctx.close();
  });
  await test('App.done: a message with Undo; Undo reverses the change; the Undo button goes away once something else is changed', async () => {
    const { page, ctx } = await open(); await page.evaluate(() => document.querySelector('.tabs button[data-tab="attend"]').click()); await page.waitForTimeout(400);
    const marks = () => page.evaluate(() => Object.values(App.season.attendance).reduce((n, night) => n + Object.keys(night).length, 0)), tick = i => page.click('#attendWrap tr[data-id] input[data-m="a"] >> nth=' + i);
    const before = await marks(); await tick(0); await page.waitForTimeout(300); assert.strictEqual(await marks(), before + 1, 'a mark was made');
    await page.evaluate(() => App.done('Mark added.')); assert.strictEqual(await page.getAttribute('#doneFlash', 'role'), 'status'); assert(await page.isVisible('#doneUndo'));
    await page.click('#doneUndo'); await page.waitForTimeout(300); assert.strictEqual(await marks(), before, 'the change was undone'); assert(!(await page.isVisible('#doneFlash')));
    await tick(0); await page.waitForTimeout(300); await page.evaluate(() => App.done('Mark added again.')); await tick(1); await page.waitForTimeout(800);
    assert(!(await page.$('#doneUndo')), 'Undo is gone after another change'); await ctx.close();
  });
  for (const [w, h] of [[390, 844], [430, 932], [600, 960], [1280, 900]]) {
    await test('layout at ' + w + ' wide: the dialog fits the screen, buttons are 44px on a phone, and the page does not scroll sideways', async () => {
      const { page, ctx } = await open(w, h); const p = page.evaluate(() => App.ask.form({ title: 'A long title for a small screen', message: 'Some words that explain the question, long enough to wrap onto more than one line on a phone.', fields: [{ name: 'a', label: 'First', value: 'x' }, { name: 'b', label: 'Second', type: 'date' }] }));
      await page.waitForSelector('#ask[open]'); const g = await page.evaluate(() => { const d = document.getElementById('ask').getBoundingClientRect(), bs = [...document.querySelectorAll('#ask .dlgbtns button')].map(b => b.getBoundingClientRect().height), ins = [...document.querySelectorAll('#ask input')].map(i => parseFloat(getComputedStyle(i).fontSize)); return { l: d.left, r: d.right, iw: window.innerWidth, sw: document.documentElement.scrollWidth, bs, ins }; });
      assert(g.l >= 0 && g.r <= g.iw + 0.5, 'dialog ' + Math.round(g.l) + '-' + Math.round(g.r) + ' in ' + g.iw); assert(g.sw <= g.iw, 'no sideways scroll');
      if (w < 761) { assert(g.bs.every(x => x >= 43.5), 'buttons ' + g.bs.join()); assert(g.ins.every(x => x >= 16), 'input text is 16px so a phone does not zoom'); }
      await press(page, 'cancel'); await p; await ctx.close();
    });
  }
  await test('no page errors (and Enter answers an alert)', async () => { const { page, ctx, errs } = await open(); const p = page.evaluate(() => App.ask.alert('x').then(() => 'ok')); await page.waitForSelector('#ask[open]'); await page.keyboard.press('Enter'); assert.strictEqual(await p, 'ok'); assert.deepStrictEqual(errs, []); await ctx.close(); });
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
