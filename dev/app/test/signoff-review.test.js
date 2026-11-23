// N72 local sign-off review. All children, classes and dates are invented.
const assert = require('node:assert/strict'), S = require('../season.js'), R = require('../signoff-review.js');
const tests = [];
const test = (name, run) => tests.push({ name, run });
const row = (Date, opts = {}) => Object.assign({ Date, Type: 'Club night', Quarter: 'Q1' }, opts);
function fixture() {
  const season = S.blank('2026-27');
  season.roster.people = { first: { v: {} }, second: { v: {} }, third: { v: {} } };
  season.calendar = [row('2026-09-02'), row('2026-09-09'), row('2026-09-16', { 'No Club': '1' }),
    row('2026-09-17', { Type: 'Event' }), row('2026-09-23'), row('2026-09-23', { Type: 'Event' })];
  return season;
}
const add = (s, id, date, key = 'R.1', book = 'HG') => S.setProgress(s, id, book, key, date);
test('uses each child’s Present mark and distinguishes an empty sheet', () => {
  const s = fixture();
  S.setMark(s, '2026-09-09', 'first', 'a', true);
  S.setMark(s, '2026-09-09', 'second', 'h', true);
  add(s, 'first', '2026-09-09');
  add(s, 'second', '2026-09-09');
  add(s, 'second', '2026-09-09', 'R.2');
  add(s, 'third', '2026-09-23', 'FLT.1', 'common');
  const before = JSON.stringify(s), { warnings } = R.local(s);
  assert.deepEqual(warnings.map(r => [r.id, r.book, r.key, r.reason, r.emptyNight]), [
    ['second', 'HG', 'R.1', 'no-present', false], ['second', 'HG', 'R.2', 'no-present', false],
    ['third', 'common', 'FLT.1', 'no-present', true]
  ]);
  assert.equal(JSON.stringify(s), before);
});
test('flags event-only and closed dates and requires coverage for an unlisted date', () => {
  const s = fixture();
  add(s, 'first', '2026-09-16'); add(s, 'first', '2026-09-17', 'R.2'); add(s, 'first', '2026-09-19', 'R.3');
  assert.deepEqual(R.local(s).warnings.map(r => r.reason), ['non-club', 'non-club']);
  assert.deepEqual(R.local(s).unresolved.map(r => r.date), ['2026-09-19']);
  const coverage = { from: '2026-09-02', through: '2026-09-23' };
  assert.deepEqual(R.local(s, { coverage }).warnings.map(r => r.reason), ['non-club', 'non-club', 'non-club']);
});
test('excludes no-known-date placeholders and prior-season dates', () => {
  const s = fixture();
  add(s, 'first', '2026-05-13');
  S.markSignsNoDate(s, 'second', 'HG', ['R.1'], '2026-09-16');
  assert.equal(R.local(s).warnings.length, 0);
  add(s, 'second', '2026-09-16');
  assert.equal(R.local(s).warnings.length, 1);
});
test('does not turn a stale carried calendar, conflicting dates, or an unlinked person into a warning', () => {
  const s = fixture();
  s.config.carriedThrough = '2026-05-13';
  s.calendar = [row('2026-05-13'), row('2026-05-20', { Type: 'Event' })];
  add(s, 'first', '2026-05-12');
  add(s, 'second', '2026-10-07');
  assert.equal(R.local(s).view.status, 'calendar-needed');
  assert.equal(R.local(s).warnings.length, 0);
  s.calendar = fixture().calendar.concat(row('2026-09-09', { 'No Club': '1' }));
  add(s, 'first', '2026-09-09');
  add(s, 'missing', '2026-09-16');
  assert.deepEqual(R.local(s).unresolved.map(r => r.reason), ['calendar', 'person', 'calendar']);
});
test('uses an inclusive season end beyond the final scheduled meeting', () => {
  const s = fixture(), coverage = { from: '2026-09-02', through: '2027-07-31' };
  add(s, 'first', '2026-09-01');
  add(s, 'second', '2027-07-31');
  add(s, 'third', '2027-08-01');
  assert.deepEqual(R.local(s, { coverage }).warnings.map(r => r.id), ['second']);
  s.year = 'Special year';
  assert.equal(R.local(s).view.status, 'season-end-needed');
  assert.deepEqual(R.local(s, { coverage, seasonEnd: '2027-07-31' }).warnings.map(r => r.id), ['second']);
});
for (const { name, run } of tests) {
  run(); console.log('  ok   ' + name);
}
console.log(tests.length + ' passed, 0 failed');
