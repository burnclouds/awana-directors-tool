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
function comparison(overrides = {}) {
  const season = fixture(), date = '2026-09-09';
  S.setMark(season, date, 'first', 'a', true);
  S.setMark(season, date, 'third', 'a', true);
  const scope = { organizationId: 'test-org', eventId: 'test-event', date };
  const complete = (id, ids) => Object.assign({ id, status: 'complete', rows: ids.map(personId => ({ personId })) }, scope);
  return Object.assign({
    season, ...scope, sessions: [complete('first-time', ['one', 'two']), complete('second-time', ['one'])],
    coveredIds: ['first', 'second', 'third'], verifiedIds: ['first', 'second', 'third'],
    resolvePerson: ({ organizationId, personId }) => {
      const id = { one: 'first', two: 'second', three: 'third' }[personId];
      return organizationId === 'test-org' && id ? { status: 'matched', id } : { status: 'unmatched' };
    }
  }, overrides);
}
test('compares complete sessions, deduplicates repeated scans and reports both mismatch directions', () => {
  const data = comparison(), before = JSON.stringify(data);
  assert.deepEqual(R.checkIns(data), {
    status: 'complete', date: '2026-09-09', agreements: ['first'],
    warnings: [{ id: 'second', reason: 'check-in-without-present' }, { id: 'third', reason: 'present-without-check-in' }],
    unresolved: []
  });
  assert.equal(JSON.stringify(data), before);
});
test('requires exact session scope and complete paginated results; a verified empty session is distinct', () => {
  const data = comparison();
  for (const changes of [{ status: 'unavailable' }, { eventId: 'other' }, { organizationId: 'other' }, { date: '2026-09-10' }]) {
    assert.deepEqual(R.checkIns({ ...data, sessions: [data.sessions[0], { ...data.sessions[1], ...changes }] }),
      { status: 'unavailable', reason: 'session-incomplete' });
  }
  assert.equal(R.checkIns({ ...data, sessions: [] }).status, 'unavailable');
  assert.deepEqual(R.checkIns({ ...data, date: '2026-08-25' }), { status: 'out-of-scope', reason: 'outside' });
  const empty = R.checkIns({ ...data, sessions: [{ ...data.sessions[0], rows: [] }] });
  assert.deepEqual(empty.warnings.map(r => r.id), ['first', 'third']);
});
test('unlinked guests and conflicting identities cannot cause a false missing check-in', () => {
  const data = comparison();
  data.sessions[1].rows.push({ personId: '' }, { personId: 'other' });
  data.verifiedIds = ['first', 'second'];
  const result = R.checkIns(data);
  assert.deepEqual(result.warnings, [{ id: 'second', reason: 'check-in-without-present' }]);
  assert.deepEqual(result.unresolved, [
    { reason: 'unlinked-check-in' }, { reason: 'unlinked-check-in' }, { id: 'third', reason: 'unlinked-local-present' }
  ]);
  data.verifiedIds.push('third');
  assert.deepEqual(R.checkIns(data).unresolved.at(-1), { id: 'third', reason: 'incomplete-identity-coverage' });
});
test('ignores verified people outside the selected local roster', () => {
  const data = comparison({ coveredIds: ['first'], verifiedIds: ['first'] });
  assert.deepEqual(R.checkIns(data), {
    status: 'complete', date: '2026-09-09', agreements: ['first'], warnings: [], unresolved: []
  });
});
const selected = [{ id: '1', eventId: 'test-event', startsAt: '2026-09-10T00:30:00Z' }];
const resource = (id, attrs = {}) => ({
  type: 'CheckIn', attributes: { security_code: 'private-test-code', medical_notes: 'private-test-note', ...attrs },
  relationships: { person: { data: { type: 'Person', id } } }
});
test('reads the selected club-local session and keeps only person identity', async () => {
  const data = comparison(), calls = [];
  const client = { readPages: async (path, opts) => {
    calls.push({ path, version: opts.version });
    return { status: 'complete', rows: [resource('one'), resource('orphan', { one_time_guest: true }),
      resource('other', { kind: 'volunteer' })].map(opts.project) };
  } };
  const result = await R.readCheckIns({ ...data, client, selected, timeZone: 'America/New_York' });
  assert.deepEqual(calls, [{ path: '/check-ins/v2/event_times/1/check_ins?filter=attendee&per_page=100', version: '2025-05-28' }]);
  assert.deepEqual(result.sessions[0].rows, [{ personId: 'one' }, { personId: '' }]);
  assert(!JSON.stringify(result).includes('private-test'));
  assert.deepEqual(await R.readCheckIns({ ...data, client, selected, timeZone: 'UTC' }), { status: 'unavailable', reason: 'scope-unconfirmed' });
  assert.equal(calls.length, 1);
});
test('returns no partial sessions after a failed read or a changed connection', async () => {
  const data = comparison(), sessions = selected.concat({ ...selected[0], id: '2' });
  let calls = 0, current = true;
  const client = { readPages: async () => (++calls === 1
    ? { status: 'complete', rows: [] } : { status: 'unavailable', reason: 'rate-limited', retryAfter: '12' }) };
  const params = { ...data, client, selected: sessions, timeZone: 'America/New_York', isCurrent: () => current };
  assert.deepEqual(await R.readCheckIns(params), { status: 'unavailable', reason: 'rate-limited', retryAfter: '12' });
  assert.equal(calls, 2);
  client.readPages = async () => { calls++; current = false; return { status: 'complete', rows: [] }; };
  assert.deepEqual(await R.readCheckIns(params), { status: 'unavailable', reason: 'canceled' });
  assert.equal(calls, 3);
});
(async () => {
  for (const { name, run } of tests) {
    await run(); console.log('  ok   ' + name);
  }
  console.log(tests.length + ' passed, 0 failed');
})().catch(e => { console.error(e); process.exit(1); });
