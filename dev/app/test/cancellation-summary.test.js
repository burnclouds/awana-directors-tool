// BEGIN PLAYTEST
const assert = require('node:assert/strict');
const test = require('node:test');
const Calendar = require('../calendar.js');
const Safety = require('../calendar-safety.js');
const Season = require('../season.js');
const TeamPlan = require('../teamplan.js');
const Model = require('../model.js');
const Reports = require('../reports.js');
require('../reports-season.js');

const dates = ['2040-09-05', '2040-09-12', '2040-09-19', '2040-09-26'];
const today = '2040-09-20';
function fixture() {
  const s = Season.blank('2040-41');
  s.fake = true;
  s.calendar = dates.map(Date => ({ ...Calendar.blank(), Date, Theme: 'Test meeting', Quarter: 'Q1' }));
  s.config.blueJewelWeeks = [2, 4];
  return s;
}
function edit(s, index, state = 'cancelled', day = today, nameOf) {
  const before = s.calendar, row = before[index];
  const next = Calendar.markRecordedClosure(row, Calendar.setState(row, state, row.Cancelled),
    Safety.noteImpact(s, row.Date).recorded);
  const after = before.slice();
  after[index] = next;
  return { after, row: next, summary: Safety.cancellationSummary(s, before, after, index, day, nameOf) };
}

for (const recorded of [false, true]) {
  test('the season start moves and is undoable when the first night is ' + (recorded ? 'recorded' : 'empty'), () => {
    const s = fixture();
    if (recorded) {
      Season.setMark(s, dates[0], 'kid-a', 'a', true);
      s.progress = { 'kid-a': { HG: { 'R.1': dates[0] } } };
    }
    const before = Season.snapshot(s);
    const { after, row, summary } = edit(s, 0);
    assert.equal(row.Cancelled, 'Cancelled');
    assert.equal(row['Recorded Night'], recorded ? '0' : undefined);
    assert(summary.needsDialog);
    assert(summary.lines.includes('Season start moves from ' + dates[0] + ' to ' + dates[1] + '.'));
    assert(summary.lines.includes(recorded ? 'Recorded activity: 1 child' : 'No recorded activity on this night.'));
    assert.equal(summary.list.includes('kid-a'), recorded);
    if (recorded) {
      assert(summary.lines.includes('1 record dated before ' + dates[1] + ' will belong to an earlier year.'));
      assert(summary.list.includes('sign-offs · kid-a · HG · R.1'));
    }
    s.calendar = after;
    assert.equal(Season.seasonStart(s), dates[1]);
    assert.equal(Season.firstNight(s), dates[1]);
    const diff = Season.diff(before, s);
    assert.deepEqual(s.attendance, before.attendance);
    assert.deepEqual(s.progress, before.progress);
    Season.applyChanges(s, diff, true);
    assert.deepEqual(Season.snapshot(s), before);
    Season.applyChanges(s, diff, false);
    assert.deepEqual(s.calendar, after);
  });
}

test('a recorded night grants grace for later attendance and preserves previously earned jewels', () => {
  const s = fixture();
  for (const date of dates) Season.setMark(s, date, 'kid-a', 'a', true);
  Season.setMark(s, dates[3], 'kid-b', 'a', true);
  const snapshot = Season.snapshot(s);
  const { summary, after } = edit(s, 2, 'cancelled', today, id => 'fixture-' + id);
  assert.equal(summary.label, 'Calendar note · ' + dates[2]);
  assert.equal(summary.danger, true);
  assert(summary.lines.includes('Attendance totals: 1 child loses this night.'));
  assert(summary.lines.includes('Blue Jewel requirements for attendance after ' + dates[2] + ': 1st 2 → 1, 2nd 4 → 3.'));
  assert(summary.lines.includes('Newly reached: 1 child.'));
  assert(summary.list.includes('Blue Jewel: fixture-kid-b'));
  assert(!summary.lines.join(' ').includes('fixture-'));
  assert.deepEqual(Season.snapshot(s), snapshot);
  assert.deepEqual(Season.graceDates(s, after), [dates[2]]);
  const original = Season.blueJewels(s, 'kid-a', s.calendar);
  const cancelled = Season.blueJewels(s, 'kid-a', after);
  assert.deepEqual(cancelled, [original[0], { n: 2, threshold: 3, date: dates[3] }]);
});

test('games alone grant grace and adult awards alone leave grace unchanged', () => {
  const games = fixture();
  games.games[dates[1]] = { Sparks: {} };
  const g = edit(games, 1);
  assert.equal(g.summary.lines[1], 'Recorded activity: games (1)');
  assert.deepEqual(Season.graceDates(games, g.after), [dates[1]]);
  const adults = fixture();
  adults.adults[dates[1]] = { 'adult-v': {} };
  const a = edit(adults, 1);
  assert.equal(a.summary.lines[1], 'Recorded activity: adult awards (1)');
  assert(a.summary.lines.includes('Blue Jewel requirements: unchanged.'));
  assert.deepEqual(Season.graceDates(adults, a.after), []);
});

test('a jewel earned on the cancelled night keeps its original requirement and date', () => {
  const s = fixture();
  for (const date of dates.slice(0, 3)) Season.setMark(s, date, 'kid-a', 'a', true);
  const original = Season.blueJewels(s, 'kid-a', s.calendar);
  const { after } = edit(s, 1);
  assert.deepEqual(original, [{ n: 1, threshold: 2, date: dates[1] }]);
  assert.deepEqual(Season.blueJewels(s, 'kid-a', after), original);
});

test('a recorded closure keeps its quarter anchor while an empty closure can release the date lock', () => {
  const s = fixture();
  for (const row of s.calendar.slice(2)) row.Quarter = 'Q2';
  const day = dates[2];
  const empty = edit(s, 2, 'cancelled', day);
  assert(empty.summary.lines.includes('Q2: locked → ready (first night ' + dates[2] + ' → ' + dates[3] + ').'));
  assert(empty.summary.lines.includes('Current quarter: Q2 → Q1.'));
  TeamPlan.lock(s, 'Q2', day);
  assert(edit(s, 2, 'cancelled', day).summary.lines.some(line => line.endsWith('Hand locks stay as set.')));
  Season.setMark(s, day, 'kid-a', 'a', true);
  const recorded = edit(s, 2, 'cancelled', day);
  assert.equal(TeamPlan.firstNight(recorded.after, 'Q2', s), day);
  assert(recorded.summary.lines.includes('Quarter locks: unchanged.'));
  assert(recorded.summary.lines.includes('Current quarter: Q2 → Q1.'));
});

test('restore returns to Meets and describes exact Undo', () => {
  const s = fixture();
  Season.setMark(s, dates[0], 'kid-a', 'a', true);
  const before = s.calendar;
  s.calendar = edit(s, 0).after;
  const { summary, after, row } = edit(s, 0, 'meets');
  assert.equal(summary.title, 'Restore club night');
  assert.equal(summary.label, summary.title + ' · ' + dates[0]);
  assert(summary.needsDialog);
  assert(summary.lines.includes('Only Undo restores the row exactly.'));
  assert.equal(Calendar.stateOf(row), 'meets');
  assert.equal(row['No Club By Hand'], '1');
  assert.equal(row['Recorded Night'], undefined);
  assert.equal(Season.seasonStart({ ...s, calendar: after }), Season.seasonStart({ ...s, calendar: before }));
  assert.deepEqual(Season.heldNights(s, after), Season.heldNights(s, before));
  assert.deepEqual(Season.blueJewelRequirements(s, after), Season.blueJewelRequirements(s, before));
});

test('an empty future meeting without other effects needs only a notice', () => {
  const s = fixture();
  const { summary } = edit(s, 3, 'cancelled', '2040-09-04');
  assert.equal(summary.needsDialog, false);
  assert.equal(summary.danger, false);
  assert.equal(summary.list.length, 0);
  assert.equal(summary.label, 'Cancel club night · ' + dates[3]);
});

test('an empty night inside the recorded schedule still needs review', () => {
  const s = fixture();
  Season.setMark(s, dates[2], 'kid-a', 'a', true);
  const { summary } = edit(s, 1, 'cancelled', '2040-09-04');
  assert(summary.needsDialog);
  assert(summary.danger);
  assert.equal(summary.lines[1], 'No recorded activity on this night.');
});

test('cancelling the opening night skips a planned break even if it has recorded activity', () => {
  const s = fixture();
  const row = s.calendar[1];
  Season.setMark(s, row.Date, 'kid-a', 'a', true);
  s.calendar[1] = Calendar.markRecordedClosure(row, Calendar.setState(row, 'planned'), true);
  const { after } = edit(s, 0);
  assert.equal(Season.seasonStart({ ...s, calendar: after }), dates[2]);
});

test('cancelling an empty row clears a legacy counted marker', () => {
  const s = fixture();
  s.calendar[0]['Recorded Night'] = '1';
  const { after, row } = edit(s, 0);
  assert.equal(Calendar.stateOf(row), 'cancelled');
  assert.equal(Calendar.countsNight(row), false);
  assert.equal(Season.seasonStart({ ...s, calendar: after }), dates[1]);
});

test('reports retain attendance marks and progress dates on a cancelled night', () => {
  const s = fixture();
  const id = 'kid-a';
  const person = { [Model.X.ID]: id, [Model.C.ROOM]: 'Sparks' };
  Season.setMark(s, dates[1], id, 'a', true);
  s.progress = { [id]: { HG: { 'R.1': dates[1] } } };
  s.calendar = edit(s, 1).after;
  const ctx = { season: s, calendar: s.calendar, master: { people: [person] }, settings: { quarter: 'Q1' }, opts: {} };
  const render = report => Reports.LIST.find(r => r.id === report).render(ctx);
  const attendance = render('attendance');
  assert.match(attendance, /9\/12 \(Cancelled\)/);
  assert.match(attendance, /&#10003;/);
  assert.match(render('attendDates'), /<td>0<\/td><td>09\/12\/40 \(Cancelled\)<\/td>/);
  assert.match(Reports.recordSheet(ctx, person, 'HG'), /Cancelled club nights: 09\/12\/40/);
  assert.match(Reports.recordSheet(ctx, person, 'HG'), /class="dt">09\/12\/40/);
});
// END PLAYTEST
