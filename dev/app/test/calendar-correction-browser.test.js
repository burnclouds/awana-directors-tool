const assert = require('node:assert/strict');
const { open } = require('./lib/app-page.js');
const { makeDialog } = require('./lib/app-dialogs.js');

(async () => {
  const t = await open(), date = '2040-09-05';
  const test = (name, today, run) => t.test(name, async () => {
    const page = await t.browser.newPage();
    try {
      page.on('dialog', dialog => dialog.accept());
      await page.goto(t.url);
      await page.setInputFiles('#splashFiles', [t.TEST_FILE]);
      await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
      await page.evaluate(day => { App.today = () => day; }, today);
      await run(page);
    } finally {
      await page.context().close();
    }
  });
  const openDialog = (page, title) => page.locator('#ask[open]').filter({
    has: page.getByRole('heading', { name: title, exact: true })
  });
  await test('adding a missing activity date needs confirmation and creates one undoable history entry', '2040-09-12', async page => {
    await page.evaluate(day => {
      const s = Season.fromJson(App.snapshotJson());
      s.calendar = [];
      s.attendance = { [day]: { child: { a: 1 } } };
      App.openSeason(Season.toJson(s), { refresh: true });
      App.showTab('calendar');
    }, date);
    const state = () => page.evaluate(() => ({
      rows: App.calendar, history: App.season.history.length, attendance: App.season.attendance
    }));
    const before = await state();
    await page.click('#btnCalAdd');
    await page.locator('#ask[open] [name="date"]').waitFor();
    const form = makeDialog(page, { kind: 'form', fields: [{ name: 'date' }, { name: 'quarter' }] });
    await form.fill('date', date);
    await form.fill('quarter', 'Q2');
    await form.accept();
    const dialog = openDialog(page, 'Review calendar correction');
    const confirm = dialog.getByRole('button', { name: 'Confirm correction', exact: true });
    await confirm.waitFor();
    assert.match(await dialog.textContent(), /2040-09-05 · no row → Q2 · attendance \(1\)/);
    assert.deepEqual(await state(), before);
    await confirm.click();
    const after = await state();
    assert.equal(after.history, before.history + 1);
    assert.deepEqual(after.rows.map(r => [r.Date, r.Quarter]), [[date, 'Q2']]);
    assert.deepEqual(after.attendance, before.attendance);
    await page.click('#btnUndo');
    assert.deepEqual((await state()).rows, before.rows);
    assert.deepEqual((await state()).attendance, before.attendance);
  });
  for (const [action, excused] of [['DELETE NIGHT'], ['MOVE NIGHT'], ['MOVE NIGHT', true], ['DELETE PLANNED NIGHT']]) {
    const label = excused ? action + ' on an excused night' : action;
    await test(label + ' needs three confirmations and one Undo restores the prior schedule and records', '2040-09-12', async page => {
      const planned = action === 'DELETE PLANNED NIGHT', target = planned ? '2040-09-19' : date;
      await page.evaluate(({ date, target, excused }) => {
        const s = Season.blank('2040-41');
        s.fake = true;
        s.calendar = [...new Set([date, target])].map(day =>
          Object.assign(Calendar.blank(), { Date: day, Quarter: 'Q1', Theme: 'Test meeting' }));
        s.attendance[date] = { child: { a: 1 } };
        if (excused) {
          const row = s.calendar[0];
          s.calendar[0] = Calendar.markRecordedClosure(row, Calendar.setState(row, 'cancelled'), true);
          s.attendance['2040-09-06'] = { 'other-child': { a: 1 } };
        }
        App.openSeason(Season.toJson(s), { refresh: true });
        App.showTab('calendar');
      }, { date, target, excused });
      const state = () => page.evaluate(() => ({ rows: App.calendar, history: App.season.history.length, attendance: App.season.attendance }));
      const before = await state();
      if (action === 'MOVE NIGHT') {
        const input = page.locator('#calWrap [data-c="Date"]').first();
        await input.fill('2040-09-06');
        await input.press('Enter');
      } else await page.locator('#calWrap [data-del]').last().click();
      const dialog = openDialog(page, 'Review calendar correction');
      const confirm = dialog.getByRole('button', { name: 'Confirm correction', exact: true });
      await confirm.waitFor();
      if (excused) {
        assert.match(await dialog.textContent(), /Correct the calendar row.*Marking it «Cancelled» excludes the night from totals/s);
        assert.equal(await dialog.getByRole('button', { name: 'Keep records and mark' }).count(), 0);
      }
      if (planned) assert.match(await dialog.textContent(), /unusual.*2040-09-19.*Test meeting/);
      else assert.match(await dialog.textContent(), /attendance/);
      await confirm.click();
      const reports = openDialog(page, 'Review affected reports');
      assert.match(await reports.textContent(), /Review affected reports.*Club calendar/s);
      await reports.getByRole('button', { name: 'Continue', exact: true }).click();
      const typed = openDialog(page, 'Confirm calendar correction');
      const ok = typed.getByRole('button', { name: 'Apply correction', exact: true });
      assert(await ok.isDisabled());
      await typed.locator('#askTyped').fill(action.toLowerCase());
      await typed.locator('#askTyped').press('Enter');
      assert(await ok.isDisabled());
      assert.deepEqual(await state(), before);
      await typed.locator('#askTyped').fill(action);
      await ok.click();
      const after = await state();
      assert.equal(after.history, before.history + 1);
      assert(!after.rows.some(row => row.Date === target));
      assert.deepEqual(after.attendance, before.attendance);
      await page.click('#btnUndo');
      assert.deepEqual((await state()).rows, before.rows);
      assert.deepEqual((await state()).attendance, before.attendance);
    });
  }
  // BEGIN PLAYTEST
  const cancelDates = ['2040-09-05', '2040-09-12', '2040-09-19', '2040-09-26'];
  const openCancellation = (page, options = {}) => page.evaluate(({ dates, recorded, planned, event }) => {
    const s = Season.blank('2040-41');
    s.fake = true;
    s.calendar = dates.map(Date => Object.assign(Calendar.blank(), { Date, Quarter: 'Q1', Theme: 'Test meeting' }));
    s.config.blueJewelWeeks = [2, 4];
    if (recorded != null) {
      s.attendance[dates[recorded]] = { 'kid-a': { a: 1 } };
      s.progress = { 'kid-a': { HG: { 'R.1': dates[recorded] } } };
    }
    if (planned) s.calendar[2] = Calendar.setState(s.calendar[2], 'planned');
    if (event) s.calendar[3].Type = 'Event';
    App.openSeason(Season.toJson(s), { refresh: true });
    App.showTab('calendar');
  }, { dates: cancelDates, ...options });
  const cancelBox = (page, index) => page.locator('#calWrap tr[data-i="' + index + '"] [data-cancel-box]');
  const notices = page => page.locator('#calEditNotices p');
  const cancellationState = page => page.evaluate(() => {
    const s = App.season, calendar = App.calendar;
    const snapshot = Season.snapshot(s);
    const records = Object.fromEntries(['attendance', 'awards', 'progress', 'given', 'games', 'adults', 'teamMoves',
      'absences', 'flags'].map(key => [key, snapshot[key]]));
    return {
      calendar, records, start: Season.seasonStart(s), first: Season.firstNight(s),
      held: Season.heldNights(s, calendar), weeks: Season.blueJewelRequirements(s, calendar),
      jewels: Season.blueJewels(s, 'kid-a', calendar),
      locks: Calendar.QUARTERS.map(q => TeamPlan.stateOf(s, calendar, q, App.today())),
      quarter: Calendar.currentQuarter(calendar, App.today()), badge: document.getElementById('todoBadge').textContent
    };
  });
  const historyLength = page => page.evaluate(() => App.season.history.length);
  const cancelDialog = page => openDialog(page, 'Cancel club night');
  const confirmCancellation = page => cancelDialog(page).getByRole('button', { name: 'Cancel this night', exact: true }).click();

  for (const recorded of [false, true]) {
    await test('the cancelled checkbox moves the season start and Undo restores a ' +
      (recorded ? 'recorded' : 'empty') + ' first night', '2040-09-20', async page => {
      await openCancellation(page, recorded ? { recorded: 0 } : {});
      const before = await cancellationState(page), history = await historyLength(page);
      await cancelBox(page, 0).click();
      await cancelDialog(page).waitFor();
      const message = await cancelDialog(page).textContent();
      assert.match(message, /Season start moves from 2040-09-05 to 2040-09-12/);
      assert.match(message, recorded ? /Recorded activity: 1 child/ : /No recorded activity on this night/);
      await confirmCancellation(page);
      await page.waitForFunction(() => Calendar.stateOf(App.calendar[0]) === 'cancelled');
      assert.equal(await page.locator('#ask[open]').count(), 0);
      const after = await cancellationState(page);
      assert.equal(after.start, cancelDates[1]);
      assert.equal(after.first, cancelDates[1]);
      assert.equal(after.calendar[0].Cancelled, 'Cancelled');
      assert.equal(after.calendar[0]['Recorded Night'], recorded ? '0' : undefined);
      assert.deepEqual(after.records, before.records);
      assert.equal(await notices(page).count(), 1);
      assert.equal(await historyLength(page), history + 1);
      await page.click('#btnUndo');
      assert.deepEqual(await cancellationState(page), before);
      assert.equal(await historyLength(page), history + 2);
      assert.equal(await cancelBox(page, 0).isChecked(), false);
      assert.equal(await page.locator('#calWrap tr[data-i="0"] [data-c="State"]').inputValue(), 'meets');
      assert.equal(await notices(page).count(), 0);
      await page.click('#btnRedo');
      assert.deepEqual(await cancellationState(page), after);
    });
  }

  await test('recorded checkbox cancellation confirms once and restore describes exact Undo', '2040-09-20', async page => {
    await openCancellation(page, { recorded: 1 });
    const before = await cancellationState(page), history = await historyLength(page);
    await cancelBox(page, 1).click();
    await cancelDialog(page).waitFor();
    assert.match(await cancelDialog(page).textContent(), /Recorded activity: 1 child/);
    assert.deepEqual(await cancellationState(page), before);
    await confirmCancellation(page);
    await page.waitForFunction(() => Calendar.stateOf(App.calendar[1]) === 'cancelled');
    assert.equal(await page.locator('#ask[open]').count(), 0);
    assert.equal(await historyLength(page), history + 1);
    assert.deepEqual((await cancellationState(page)).records, before.records);
    await page.click('#btnUndo');
    assert.deepEqual(await cancellationState(page), before);
    await page.click('#btnRedo');
    await cancelBox(page, 1).click();
    const restore = openDialog(page, 'Restore club night');
    await restore.waitFor();
    assert.match(await restore.textContent(), /Only Undo restores the row exactly\./);
    await restore.getByRole('button', { name: 'Restore this night', exact: true }).click();
    await page.waitForFunction(() => Calendar.stateOf(App.calendar[1]) === 'meets');
    assert.equal(await page.locator('#calWrap tr[data-i="1"] [data-c="State"]').inputValue(), 'meets');
  });

  await test('an empty future cancellation shows one notice and planned and event rows protect their state', '2040-09-04', async page => {
    await openCancellation(page, { planned: true, event: true });
    assert.equal(await cancelBox(page, 2).isDisabled(), true);
    assert.equal(await cancelBox(page, 3).count(), 0);
    const history = await historyLength(page);
    await cancelBox(page, 1).click();
    await page.waitForFunction(() => Calendar.stateOf(App.calendar[1]) === 'cancelled');
    assert.equal(await page.locator('#ask[open]').count(), 0);
    assert.equal(await notices(page).count(), 1);
    assert.match(await notices(page).textContent(), /No recorded activity.*Undo reverses/);
    assert.equal(await historyLength(page), history + 1);
    await page.click('#btnUndo');
    assert.equal(await notices(page).count(), 0);
    await page.locator('#calWrap tr[data-i="1"] [data-c="State"]').selectOption('cancelled');
    assert.equal(await cancelBox(page, 1).isChecked(), true);
  });

  await test('a stale checkbox review asks for a fresh review and leaves the meeting open', '2040-09-20', async page => {
    await openCancellation(page, { recorded: 1 });
    await cancelBox(page, 1).click();
    await cancelDialog(page).waitFor();
    await page.evaluate(day => Season.setMark(App.season, day, 'kid-b', 'a', true), cancelDates[1]);
    await confirmCancellation(page);
    await page.waitForFunction(() => document.getElementById('flash').textContent.includes('Review the correction again'));
    assert.equal(await cancelBox(page, 1).isChecked(), false);
    assert.equal(await page.locator('#calWrap tr[data-i="1"] [data-c="State"]').inputValue(), 'meets');
  });
  // END PLAYTEST

  for (const recorded of [true, false]) {
    await test(recorded ? 'cancelling a recorded night confirms once and is undoable' :
      'cancelling an empty night applies without confirmation', recorded ? '2040-09-12' : '2040-09-04', async page => {
      await page.evaluate(({ date, recorded }) => {
        const s = Season.blank('2040-41');
        s.fake = true;
        s.calendar = [Object.assign(Calendar.blank(), { Date: date, Quarter: 'Q1', Theme: 'Test meeting' })];
        s.config.lessons = { on: true, groups: { Puggles: { items: ['First lesson'] } } };
        if (recorded) s.attendance[date] = { 'kid-a': { a: 1 } };
        App.openSeason(Season.toJson(s), { refresh: true });
        App.showTab('calendar');
      }, { date, recorded });
      const state = () => page.evaluate(() => ({
        rows: App.calendar, history: App.season.history.length, attendance: App.season.attendance
      }));
      const before = await state();
      const select = page.locator('#calWrap [data-c="State"]');
      const dialog = page.locator('#ask[open]');
      await select.selectOption('cancelled');
      if (recorded) {
        const ok = openDialog(page, 'Mark night as a note')
          .getByRole('button', { name: 'Keep records and mark', exact: true });
        await ok.waitFor();
        assert.match(await dialog.textContent(), /1 child.*kid-a/s);
        assert.deepEqual(await state(), before);
        await ok.click();
      }
      await page.waitForFunction(() => Calendar.stateOf(App.calendar[0]) === 'cancelled');
      assert.equal(await page.locator('#flash').textContent(), '1 weekly lesson is affected. Review Lessons by week.');
      assert.equal(await dialog.count(), 0);
      const after = await state();
      assert.equal(after.rows[0].Date, date);
      assert.deepEqual(after.attendance, before.attendance);
      if (recorded) {
        assert.equal(after.history, before.history + 1);
        await page.click('#btnUndo');
        assert.deepEqual((await state()).rows, before.rows);
        assert.deepEqual((await state()).attendance, before.attendance);
      }
    });
  }
  for (const event of [false, true]) {
    await test(event ? 'changing a recorded club night to Event warns about grace' :
      'excusing a recorded night in a locked quarter warns about recalculation', '2040-09-12', async page => {
      await page.evaluate(async date => {
        const s = Season.blank('2040-41');
        s.fake = true;
        s.calendar = [Object.assign(Calendar.blank(), { Date: date, Quarter: 'Q1' })];
        s.attendance[date] = { child: { a: 1 } };
        TeamPlan.lock(s, 'Q1', date);
        await App.openSeason(Season.toJson(s), { refresh: true });
        App.showTab('calendar');
      }, date);
      const field = page.locator(event ? '#calWrap [data-c="Type"]' : '#calWrap [data-c="State"]');
      await field.selectOption(event ? 'Event' : 'cancelled');
      const dialog = page.locator('#ask[open]');
      const accept = openDialog(page, 'Mark night as a note')
        .getByRole('button', { name: 'Keep records and mark', exact: true });
      await accept.waitFor();
      assert.match(await dialog.textContent(), /quarter lock will recalculate/);
      if (event) assert.match(await dialog.textContent(), /counts as a cancellation and gives grace to everyone/);
      assert.equal(await page.evaluate(() => Calendar.isNight(App.calendar[0])), true);
      await accept.click();
      await page.waitForFunction(() => Calendar.isExcused(App.calendar[0]));
      assert.equal(await dialog.count(), 0);
      assert.equal(await page.evaluate(() => Calendar.stateOf(App.calendar[0])), event ? 'event' : 'cancelled');
    });
  }
  for (const event of [false, true]) {
    await test(event ? 'turning a past event with attendance into a club night needs confirmation' :
      'reopening a night in a hand-locked quarter needs confirmation', '2040-09-12', async page => {
      await page.evaluate(async ({ date, event }) => {
        const s = Season.blank('2040-41');
        s.fake = true;
        const row = Object.assign(Calendar.blank(), { Date: date, Quarter: 'Q1' });
        s.calendar = [event ? { ...row, Type: 'Event' } : Calendar.setState(row, 'planned')];
        if (event) s.attendance[date] = { child: { a: 1 } };
        else TeamPlan.lock(s, 'Q1', date);
        await App.openSeason(Season.toJson(s), { refresh: true });
        App.showTab('calendar');
      }, { date, event });
      const field = page.locator(event ? '#calWrap [data-c="Type"]' : '#calWrap [data-c="State"]');
      await field.selectOption(event ? 'Club night' : 'meets');
      const dialog = openDialog(page, 'Review this calendar edit');
      const accept = dialog.getByRole('button', { name: 'Apply to this row', exact: true });
      await accept.waitFor();
      assert.equal(await page.evaluate(() => Calendar.isNight(App.calendar[0])), false);
      await accept.click();
      await page.waitForFunction(() => Calendar.isNight(App.calendar[0]));
    });
  }
  await t.done();
})();
