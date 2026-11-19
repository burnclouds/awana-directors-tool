// N19 (1.51.16): Hide / Unhide a note or flag. On To do (the card number counts the notes not hidden; Show hidden is remembered in the file), on the child's sheet and in the yellow-flag popup (Mike's D5: yes).
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/flag-hide-browser.test.js
const { open } = require('./lib/app-page'), assert = require('assert');
(async () => {
  const t = await open({ viewport: { width: 1300, height: 800 } }), page = t.page;
  const kid = await page.evaluate(() => { const p = App.master.people.find(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'Sparks'); return p[Model.X.ID]; });
  const goTodo = async () => { await page.evaluate(() => App.showTab('todo')); await page.waitForSelector('#todoWrap .flagcard'); };
  const head = async () => (await page.textContent('#todoWrap .flagcard h3')).match(/\((\d+)\)/)[1];
  const rows = () => page.locator('#todoWrap .flagcard tbody tr').count();
  const badge = () => page.textContent('#todoBadge');
  const ids = await page.evaluate(k => ({ gen: App.addNote('a general note'), child: App.addFlag({ level: 'child', kid: k, note: 'a child flag' }), sheet: App.addFlag({ level: 'sheet', kid: k, note: 'a sheet flag' }) }), kid);
  const all = await page.evaluate(() => Season.noteList(App.season).map(f => f.id)); assert.strictEqual(all.length, 3);
  const childId = await page.evaluate(() => Season.noteList(App.season).find(f => f.level === 'child').id);

  await t.test('N19-1 the card says (3); Hide on one row drops it to (2), the row goes, and the To do badge does not change', async () => {
    await goTodo(); assert.strictEqual(await head(), '3'); const b0 = await badge();
    await page.click('#todoWrap .flagcard tr[data-flag="' + childId + '"] button[data-hideflag]'); await page.waitForSelector('#todoWrap .flagcard');
    assert.strictEqual(await head(), '2'); assert.strictEqual(await rows(), 2); assert.strictEqual(await badge(), b0, 'notes were never in the badge');
    assert.strictEqual(await page.evaluate(i => App.season.flags[i].hidden, childId), 1);
  });
  await t.test('N19-2 Show hidden (1) appears only while something is hidden; ticking it lists the row greyed with Unhide, the number stays (2), and the choice is kept in the file', async () => {
    assert((await page.textContent('#todoWrap .flagcard')).includes('Show hidden (1)'));
    await page.check('#tdShowHidNotes'); await page.waitForSelector('#tdShowHidNotes:checked'); assert.strictEqual(await rows(), 3); assert.strictEqual(await head(), '2');
    assert.strictEqual(await page.evaluate(() => App.season.config.showHiddenNotes), true, 'remembered in the file (like the Bug button setting)');
    assert(await page.locator('#todoWrap .flagcard tr.off button[data-hideflag]').innerText().then(x => /Unhide/.test(x))); assert(/\(hidden\)/.test(await page.textContent('#todoWrap .flagcard tr.off')));
  });
  await t.test('N19-3 the remembered choice survives leaving and coming back, and a file reopened from its saved text', async () => {
    await page.evaluate(() => App.showTab('roster')); await goTodo(); assert.strictEqual(await rows(), 3);
    const back = await page.evaluate(() => { const s = Season.fromJson(Season.toJson(App.season)); return { show: s.config.showHiddenNotes, hidden: Season.todoNotes(s).hidden.length }; }); assert.deepStrictEqual(back, { show: true, hidden: 1 });
  });
  await t.test('N19-4 Unhide: the number is (3), the box is gone, and the stored choice is left alone when nothing is hidden', async () => {
    await page.click('#todoWrap .flagcard tr.off button[data-hideflag]'); await page.waitForSelector('#todoWrap .flagcard'); assert.strictEqual(await head(), '3'); assert.strictEqual(await page.locator('#tdShowHidNotes').count(), 0);
    assert.strictEqual(await page.evaluate(() => App.season.config.showHiddenNotes), true, 'not rewritten just because the list is empty');
    assert(!(await page.evaluate(i => 'hidden' in App.season.flags[i], childId)));
  });
  await t.test('N19-5 the child\'s sheet still lists a hidden note, tagged, with Unhide and Clear; Hide there hides it on To do (D5)', async () => {
    await page.evaluate(k => App.showPerson(k, { sub: 'progress' }), kid); await page.waitForSelector('#progressWrap .flagnote');
    await page.click('#progressWrap .flagnote button[data-hideflag]'); await page.waitForTimeout(250);
    assert((await page.textContent('#progressWrap')).includes('hidden on To do')); assert.strictEqual((await page.locator('#progressWrap .flagnote button[data-hideflag]').first().innerText()), 'Unhide');
    await goTodo(); assert.strictEqual(await head(), '2');
    await page.evaluate(k => App.showPerson(k, { sub: 'progress' }), kid); await page.waitForSelector('#progressWrap .flagnote'); await page.click('#progressWrap .flagnote button[data-hideflag]'); await page.waitForTimeout(250);
    await goTodo(); assert.strictEqual(await head(), '3', 'Unhide on the sheet brings it back');
  });
  await t.test('N19-6 the yellow-flag popup has Hide on To do / Unhide (D5): a hidden note keeps its yellow flag', async () => {
    const sid = await page.evaluate(() => Season.noteList(App.season).find(f => f.level === 'sheet').id);
    await page.evaluate(k => App.showPerson(k, { sub: 'progress' }), kid); await page.waitForSelector('#progressWrap .flagbtn[data-fids="' + sid + '"]');
    await page.click('#progressWrap .flagbtn[data-fids="' + sid + '"]'); await page.waitForSelector('.flagpop'); await page.click('.flagpop button[data-fhide]'); await page.waitForTimeout(250);
    assert.strictEqual(await page.evaluate(i => App.season.flags[i].hidden, sid), 1); assert(/Unhide/.test(await page.textContent('.flagpop')), 'the popup now offers Unhide'); assert(await page.locator('#progressWrap .flagbtn[data-fids="' + sid + '"]').count() > 0, 'the yellow flag stays');
    await page.click('.flagpop button[data-fhide]'); await page.waitForTimeout(200); assert(!(await page.evaluate(i => 'hidden' in App.season.flags[i], sid))); await page.keyboard.press('Escape');
  });
  await t.test('N19-7 Go and Clear work on a hidden row; Undo after Hide brings it back (History reads "hidden from To do")', async () => {
    await goTodo(); await page.click('#todoWrap .flagcard tr[data-flag="' + childId + '"] button[data-hideflag]'); await page.waitForSelector('#todoWrap .flagcard');
    assert.strictEqual(await page.evaluate(() => App.season.history[App.season.history.length - 1].changes.some(c => c.p[2] === 'hidden')), true, 'History has the hide');
    await page.click('#btnUndo'); await page.waitForTimeout(400); await goTodo(); assert.strictEqual(await head(), '3', 'Undo brings it back');
    await page.evaluate(i => App.hideFlag(i, true), childId); await goTodo(); await page.check('#tdShowHidNotes'); await page.waitForSelector('#tdShowHidNotes:checked');
    await page.click('#todoWrap .flagcard tr[data-flag="' + childId + '"] button[data-clearflag2]'); await page.waitForTimeout(250); assert.strictEqual(await page.evaluate(i => !!App.season.flags[i], childId), false);
  });
  await t.test('N19-8 empty states: all hidden with the box off says "Nothing to review. n hidden."; no notes at all still says "No notes yet."', async () => {
    await page.evaluate(() => { Season.noteList(App.season).forEach(f => App.hideFlag(f.id, true)); delete App.season.config.showHiddenNotes; }); await goTodo(); assert(/Nothing to review\. 2 hidden\./.test(await page.textContent('#todoWrap .flagcard')));
    await page.evaluate(() => Season.noteList(App.season).forEach(f => App.clearFlag(f.id))); await goTodo(); assert(/No notes yet\./.test(await page.textContent('#todoWrap .flagcard')));
  });
  await t.test('N19-9 a general note: Hide works (no Go button) and it is found only through the toggle; editing it keeps it hidden', async () => {
    const g = await page.evaluate(() => { App.addNote('another general note'); return Season.noteList(App.season).find(f => f.note === 'another general note').id; }); await goTodo(); await page.click('#todoWrap .flagcard tr[data-flag="' + g + '"] button[data-hideflag]'); await page.waitForSelector('#tdShowHidNotes');
    await page.evaluate(i => App.setFlagNote(i, 'edited text'), g); assert.strictEqual(await page.evaluate(i => App.season.flags[i].hidden, g), 1);
  });
  await t.test('N19-10 at 390px the row (Go, Hide, Clear) does not scroll the page sideways and every button is at least 24px tall', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(k => { App.addFlag({ level: 'child', kid: k, note: 'a long note about the child that should wrap inside its own column on a phone screen' }); }, kid); await goTodo();
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: [...document.querySelectorAll('#todoWrap .flagcard tbody button')].map(b => b.getBoundingClientRect().height) }));
    assert(m.sw <= m.cw + 1, 'page scrolls sideways ' + m.sw + '/' + m.cw); assert(m.h.length && m.h.every(x => x >= 24), 'button heights ' + m.h.join(','));
  });
  await t.done();
})();
