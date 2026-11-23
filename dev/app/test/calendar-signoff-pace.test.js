const assert = require('node:assert/strict');
const Calendar = require('../calendar.js');
const Safety = require('../calendar-safety.js');
const Model = require('../model.js');
const Pace = require('../pace.js');
const Season = require('../season.js');
const Review = require('../signoff-review.js');

const season = Season.blank('2026-27');
const first = '2026-09-02', second = '2026-09-09', last = '2026-09-16';
const future = '2026-10-07', closure = '2026-10-14';
season.roster.people.kid = { pc: { [Model.C.FIRST]: 'Test', [Model.C.LAST]: 'Reader', [Model.C.ROOM]: 'Sparks A' }, v: {} };
season.calendar = [first, second, last].map(Date => Object.assign(Calendar.blank(), { Date }));
for (const date of [first, second, last]) Season.setMark(season, date, 'kid', 'a', true, 'Sparks');
Season.setProgress(season, 'kid', 'HG', 'R.1', '2026-08-31');
Season.setProgress(season, 'kid', 'HG', 'R.2', second);
Season.setProgress(season, 'kid', 'HG', 'R.3', closure);

const before = Season.snapshot(season);
const master = Model.fromRoster(season.roster);
const pace = () => Pace.rows({ season, master, calendar: season.calendar });
const initialPace = pace();
assert.equal(initialPace[0].nights, 3);
assert.deepEqual(Review.local(season).unresolved.map(row => row.date), [closure]);

const proposal = Safety.propose(season, season.calendar, {
  day: 3, first: future, last: '2026-10-21',
  starts: { Q2: future },
  breaks: [{ name: 'Test break', from: closure, to: closure }]
}, last);
assert.deepEqual(proposal.blocks, []);
assert.deepEqual(proposal.rows.slice(0, 3), before.calendar);
assert.deepEqual(Season.snapshot(season), before);

season.calendar = proposal.rows;
const changes = Season.diff(before, season);
assert.deepEqual(Review.local(season).warnings.map(row => [row.date, row.reason]), [[closure, 'non-club']]);
assert.deepEqual(pace(), initialPace);

Season.applyChanges(season, changes, true);
assert.deepEqual(Season.snapshot(season), before);
assert.deepEqual(Review.local(season).unresolved.map(row => row.date), [closure]);
assert.deepEqual(pace(), initialPace);
console.log('Calendar generation, sign-off review and Pace agree after Apply and Undo.');
