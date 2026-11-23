// N72 review reads applied records from both entry points and leaves drafts untouched.
const { open } = require('./lib/app-page');

(async () => {
  const t = await open(), { page, assert } = t;
  const state = () => page.evaluate(() => ({
    file: Season.toJson(App.season),
    edit: App.editSeq(),
    pending: App.signoffReviewData().pending,
    dirty: App.dirty(),
    undo: document.querySelector('#btnUndo').title
  }));
  const child = await page.evaluate(() => {
    const p = App.master.people.find(p => Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'Sparks');
    const id = p[Model.X.ID];
    App.commitScope(() => {
      App.calendar.splice(0, App.calendar.length,
        { Date: '2026-09-02', Type: 'Club night', Quarter: 'Q1' },
        { Date: '2026-09-09', Type: 'Club night', Quarter: 'Q1' });
      App.season.progress = {};
      App.season.attendance = {};
      Season.setProgress(App.season, id, 'HG', 'R.1', '2026-09-09');
      Season.setProgress(App.season, id, 'HG', 'R.2', '2026-09-05');
      App.importChanged('TEST sign-offs');
    });
    App.showTab('attend');
    return id;
  });
  const review = page.locator('#signoffReview');
  await t.test('Attendance opens the local review and unlisted dates require coverage', async () => {
    const before = await state();
    await page.locator('#attendBar [data-sign-review]').click();
    assert.match(await review.textContent(), /club night with no Present mark/);
    assert.match(await review.textContent(), /Calendar coverage needs review|Club calendar coverage needs review/);
    await review.getByRole('button', { name: 'Confirm coverage' }).click();
    assert.match(await review.textContent(), /non-club date/);
    await review.getByRole('button', { name: 'Close', exact: true }).click();
    assert.deepEqual(await state(), before);
  });
  await t.test('Progress review excludes unapplied edits and leaves the draft intact', async () => {
    await page.evaluate(id => {
      App.showPerson(id, { sub: 'progress' });
      Season.setProgress(App.season, id, 'HG', 'R.1', '');
      App.changed();
    }, child);
    const before = await state();
    assert.equal(before.pending, true);
    await page.locator('#progressWrap [data-sign-review]').click();
    assert.match(await review.textContent(), /Unapplied edits are excluded/);
    assert.match(await review.textContent(), /club night with no Present mark/);
    await review.getByRole('button', { name: 'Close', exact: true }).click();
    assert.deepEqual(await state(), before);
  });
  await t.done();
})().catch(e => { console.error(e); process.exit(1); });
