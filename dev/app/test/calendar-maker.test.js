// N3 calendar maker, using invented schedules only.
const assert = require('node:assert/strict');
const test = require('node:test');
const Calendar = require('../calendar.js');

test('generate recommends editable closures and flags Easter without closing the meeting', () => {
  const first = '2026-09-09', last = '2027-05-12';
  const breaks = Calendar.recommendBreaks(first, last);
  const rows = Calendar.generate({ day: 3, first, last, breaks });
  assert.equal(rows.length, 36);
  assert.deepEqual(rows.filter(r => !Calendar.isNight(r)).map(r => r.Date), ['2026-11-25', '2026-12-23', '2026-12-30']);
  assert.deepEqual(rows.filter(r => r.Holiday === 'Easter week').map(r => r.Date), ['2027-03-24']);
  assert.equal(Calendar.recommendBreaks('2027-01-01', '2027-01-01')[0].name, 'Christmas break');
  const withoutBreaks = Calendar.generate({ day: 3, first, last, easterFlag: false });
  assert(withoutBreaks.every(r => Calendar.isNight(r) && !r.Holiday));
  assert.deepEqual(Calendar.suggestQuarters(rows), { Q2: '2026-11-04', Q3: '2027-01-06', Q4: '2027-03-03' });
});

test('generate uses UTC civil dates and rejects invalid input', () => {
  assert.deepEqual(Calendar.generate({ day: 4, first: '2027-03-10', last: '2027-03-19' }).map(r => r.Date), ['2027-03-11', '2027-03-18']);
  assert.throws(() => Calendar.generate({ day: 3, first: '2027-02-29', last: '2027-03-01' }), /valid first/);
  assert.throws(() => Calendar.generate({ day: 3, first: '2027-03-01', last: '2027-03-31', breaks: [{ name: 'Late', from: '2027-03-08', to: '2027-03-02' }] }), /valid date range/);
});

test('quarter starts split open nights and closures and events pick the next club night', () => {
  const first = '2026-09-09', last = '2026-09-30';
  const rows = Calendar.generate({ day: 3, first, last, breaks: [{ name: 'Break', from: '2026-09-16', to: '2026-09-16' }] });
  rows.push({ Date: '2026-09-20', Type: 'Event', Theme: 'Community day' });
  const starts = Calendar.suggestQuarters(rows);
  assert.deepEqual(starts, { Q2: '2026-09-23', Q3: '2026-09-30', Q4: '' });
  assert.deepEqual(Calendar.applyQuarters(rows, starts).map(r => r.Quarter), ['Q1', 'Q2', 'Q2', 'Q2', 'Q3']);
  assert.equal(rows[4].Quarter, undefined);
  assert.throws(() => Calendar.applyQuarters(rows, { Q2: '2026-09-16' }), /on separate club nights/);
});

const Safety = require('../calendar-safety.js');
const Season = require('../season.js');
const night = (Date, Quarter = 'Q1', fields = {}) => Object.assign(Calendar.blank(), { Date, Quarter }, fields);
const october = { day: 3, first: '2026-10-07', last: '2026-10-28' };
const later = '2026-10-22';

test('preserves recorded and empty historical nights with same-date events and lesson links', () => {
  const s = Season.blank('2026-27');
  s.attendance = { '2026-10-07': { child: { h: 1 } } };
  s.games = { '2026-10-21': { Red: 3 } };
  const rows = [
    night('2026-10-07', 'Q1', { 'Sparks Coloring PDF': 'https://example.org/one.pdf' }),
    night('2026-10-07', 'Q1', { Type: 'Event', Theme: 'First event' }),
    night('2026-10-07', 'Q1', { Type: 'Event', Theme: 'Second event' }),
    night('2026-10-14'),
    night('2026-10-21')
  ];
  const original = JSON.parse(JSON.stringify(rows));
  const proposal = Safety.propose(s, rows, { day: 4, first: '2026-10-22', last: '2026-10-29' }, later);
  assert.deepEqual(proposal.rows.slice(0, 5), original);
  assert.deepEqual(proposal.blocks, []);
  assert.deepEqual(proposal.kept.find(r => r.date === '2026-10-14').reasons, { 'previous schedule': 1, 'locked quarter': 1 });
  assert.deepEqual(rows, original);
});

test('reports orphan or closed activity without silently opening a meeting', () => {
  const s = Season.blank('2026-27');
  s.awards = { '2026-10-07': { child: ['Award'] } };
  s.adults = { '2026-10-14': [{ n: 'Test Leader', a: 'Award' }] };
  const closed = night('2026-10-14', 'Q1', { 'No Club': '1' });
  const proposal = Safety.propose(s, [closed], october, '2026-10-13');
  assert(!proposal.rows.some(r => r.Date === '2026-10-07'));
  assert.deepEqual(proposal.rows[0], closed);
  assert.deepEqual(proposal.existing, [
    { date: '2026-10-07', reason: 'activity missing from calendar' },
    { date: '2026-10-14', reason: 'activity on a closed night' }
  ]);
});

test('guards omissions, quarter reassignment, extending locked quarters and changing an earlier-years boundary', () => {
  const s = Season.blank('2026-27');
  const rows = [night('2026-10-07'), night('2026-10-14', 'Q2')];
  s.absences = { leader: { trip: { nights: { '2026-10-14': 1 } } } };
  s.teamMoves = { child: [{ from: '2026-10-14', q: 'Q2', color: 'Red' }] };
  s.flags = { note: { date: '2026-10-14', note: 'private content' } };
  s.progress = { child: { HG: { 'Rank.1': '2026-10-05' } } };
  const result = Safety.compare(s, rows, [night('2026-10-01', 'Q1'), night('2026-10-14', 'Q3')], '2026-10-10');
  assert.deepEqual(result.blocks.find(r => r.date === '2026-10-14').reasons, { 'volunteer absence': 1, 'team move': 1, 'dated note': 1 });
  assert(result.blocks.some(r => r.date === '2026-10-01' && r.reasons['locked quarter']));
  assert(result.blocks.some(r => r.date === '2026-10-05' && r.reasons['season classification would change']));
  assert(!JSON.stringify(result).includes('private content'));
});

test('rollover archives dates through the cutoff and keeps ambiguous later events', () => {
  const s = Season.blank('2026-27');
  s.config.carriedThrough = '2026-05-13';
  const rows = [night('2026-05-13'), night('2026-05-14', 'Q1', { Type: 'Event', Theme: 'Later event' })];
  const proposal = Safety.propose(s, rows, october, '2026-08-10');
  assert.deepEqual(proposal.archived, [rows[0]]);
  assert.deepEqual(proposal.rows[0], rows[1]);
  assert.deepEqual(proposal.blocks, []);
  assert.throws(() => Safety.propose(s, rows, { day: 3, first: '2026-05-13', last: '2026-05-20' }, '2026-08-10'), /previous season/);
});

test('repeating a generated schedule preserves the stored rows', () => {
  const s = Season.blank('2026-27');
  const before = Safety.propose(s, [], october, '2026-09-01');
  assert.deepEqual(Safety.propose(s, before.rows, october, '2026-09-01').rows, before.rows);
});

test('regeneration can reopen a generated future closure but preserves legacy or manually overridden breaks', () => {
  const s = Season.blank('2026-27');
  const without = { day: 3, first: '2026-10-07', last: '2026-10-21' };
  const config = { ...without, breaks: [{ name: 'Off', from: '2026-10-07', to: '2026-10-21' }] };
  const first = Calendar.generate(config);
  first[1]['No Club By Hand'] = '1';
  delete first[2]['Generated Break'];
  const next = Safety.propose(s, first, without, '2026-09-01');
  assert.deepEqual(next.rows.map(Calendar.isNight), [true, false, false]);
  assert(!Object.hasOwn(next.rows[0], 'Generated Break'));
});

test('merge detects new recorded activity suppressed by a calendar from another copy', () => {
  const local = Season.blank('2026-27'), remote = Season.blank('2026-27');
  local.calendar = [night('2026-10-07'), night('2026-10-14')];
  remote.calendar = [night('2026-10-07')];
  local.attendance = { '2026-10-14': { child: { a: 1 } } };
  const merged = Object.assign({}, local, { calendar: remote.calendar });
  const conflicts = Safety.mergeConflicts(local, remote, merged, '2026-10-15');
  assert(conflicts.some(r => r.date === '2026-10-14' && r.reasons.attendance));
  assert.deepEqual(Safety.mergeConflicts(local, remote, local, '2026-10-15'), []);
});

test('merge preserves accepted same-record corrections while rejecting new absence conflicts', () => {
  const local = Season.blank('2026-27'), remote = Season.blank('2026-27');
  local.calendar = [night('2026-10-07'), night('2026-10-14')];
  remote.calendar = [night('2026-10-07'), night('2026-10-14', 'Q1', { 'No Club': '1' })];
  local.attendance = remote.attendance = { '2026-10-14': { child: { a: 1 } } };
  assert.deepEqual(Safety.mergeConflicts(local, remote, remote, '2026-10-15'), []);
  local.absences = { leader: { trip: { nights: { '2026-10-14': 1 } } } };
  const merged = Object.assign({}, remote, { absences: local.absences });
  assert.deepEqual(Safety.mergeConflicts(local, remote, merged, '2026-10-15'), [
    { date: '2026-10-14', reasons: { 'volunteer absence': 1 } }
  ]);
});

test('planned closures and unplanned cancellations both exclude the night and keep their distinction through CSV', () => {
  const row = night('2026-10-07');
  const planned = Calendar.setState(row, 'planned');
  const cancelled = Calendar.setState(row, 'cancelled', 'Weather');
  assert.equal(Calendar.stateOf(row), 'meets');
  assert.equal(Calendar.stateOf(planned), 'planned');
  assert.equal(Calendar.stateOf(cancelled), 'cancelled');
  assert.equal(Calendar.isNight(planned), false);
  assert.equal(Calendar.isNight(cancelled), false);
  assert.equal(Calendar.load(Calendar.toCsv([cancelled]))[0].Cancelled, 'Weather');
  assert.equal(Calendar.stateOf(Calendar.setState(cancelled, 'meets')), 'meets');
  assert.equal(Calendar.timeText('10:00', '17:30'), '10am–5:30pm');
  assert.equal(Calendar.timeText('', '17:30'), '');
});

test('family calendar prints quarter endings, breaks, timed events and optional lessons in the Coaches binder', () => {
  const Reports = require('../reports.js');
  const s = Season.blank('2026-27');
  const template = night('2026-10-07', 'Q1', { Theme: 'Hello', 'Sparks Lesson': 'S1' });
  s.calendar = [
    template,
    Calendar.setState(night('2026-10-14', 'Q2', { Holiday: 'Fall break' }), 'planned'),
    Calendar.setState(night('2026-10-21', 'Q2'), 'cancelled', 'Snow'),
    night('2026-10-24', 'Q2', { Type: 'Event', Theme: 'Race', 'Start Time': '10:00', 'End Time': '17:00' })
  ];
  const report = Reports.LIST.find(def => def.id === 'clubCalendar');
  const context = { season: s, calendar: s.calendar, settings: { club: 'TEST Club' }, today: '2026-10-01' };
  s.config.lessons = { on: true, groups: { Sparks: { items: ['S2'], from: '2026-10-07' } } };
  const without = report.render(context);
  assert.match(without, /10\/7\/2026[\s\S]*End of First Quarter[\s\S]*NO CLUB[\s\S]*CANCELLED \(Snow\)[\s\S]*Saturday, October 24[\s\S]*10am–5pm/);
  assert.doesNotMatch(without, /Sparks S1/);
  const withLessons = report.render(Object.assign({}, context, { opts: { lessons: true } }));
  assert.match(withLessons, /Sparks S1/);
  assert.match(withLessons, /<s>Sparks S2<\/s>/);
  assert(Reports.DEFAULT_BUNDLES().find(b => b.name === 'Coaches binder').items.some(item => item.report === 'clubCalendar'));
});

test('series move over planned closures, skip unplanned cancellations and keep manual overrides', () => {
  const rows = [
    night('2026-10-07'),
    Calendar.setState(night('2026-10-14'), 'planned'),
    Calendar.setState(night('2026-10-21'), 'cancelled', 'Weather'),
    night('2026-10-28', 'Q2', { 'Sparks Lesson': 'Manual' }),
    night('2026-11-04', 'Q2', { 'Sparks Lesson': '-' }),
    night('2026-11-11', 'Q2')
  ];
  const series = { items: Calendar.numberItems(2, 3, '1.2') };
  const config = { lessons: { groups: { Sparks: series } } };
  const result = Calendar.lessonsFor(rows, 'Sparks', config);
  assert.deepEqual([...result.values()], [
    { text: '1.2', kind: 'series' }, { text: '', kind: 'off' },
    { text: '1.3', kind: 'missed', reason: 'Weather' }, { text: 'Manual', kind: 'hand' },
    { text: '', kind: 'hand' }, { text: '2.1', kind: 'series' }
  ]);
  series.unplanned = 'move';
  assert.equal(Calendar.lessonsFor(rows, 'Sparks', config).get('2026-11-11').text, '1.3');
  assert.equal(rows[0]['Sparks Lesson'], '');
});

test('rolling to a new season removes the old series and breaks but keeps lesson policies', () => {
  const s = Season.blank('2026-27');
  s.config.lessons = { on: true, groups: { Sparks: { on: false, from: '2026-10-07', items: ['A'], planned: 'skip' } } };
  s.config.breaks = [{ name: 'Fall break', from: '2026-10-14', to: '2026-10-14' }];
  const next = Season.newSeason(s, '2027-28');
  assert.equal(next.config.breaks, undefined);
  assert.deepEqual(next.config.lessons, { on: true, groups: { Sparks: { on: false, planned: 'skip' } } });
  assert.deepEqual(s.config.lessons.groups.Sparks.items, ['A']);
});

test('theme and event reuse leaves protected or named dates intact and proposes events once', () => {
  const old = [
    night('2025-10-01', 'Q1', { Theme: 'Old opening' }),
    night('2025-10-08', 'Q1', { Theme: 'Guest night' }),
    night('2025-10-15', 'Q1', { Theme: 'Old close' }),
    night('2025-10-18', 'Q1', { Type: 'Event', Theme: 'Race', 'Start Time': '10:00', 'Sparks Lesson': 'Skip copying' })
  ];
  const first = '2026-10-07', last = '2026-10-28', proposed = Calendar.generate({ day: 3, first, last });
  proposed[1].Theme = 'My theme';
  const result = Calendar.copyThemes(proposed, old, 'order', true, first, last, new Set([first]));
  assert.deepEqual(result.filled, [last]);
  assert.equal(result.rows.find(row => row.Date === last).Theme, 'Old close');
  assert.equal(result.rows.find(row => row.Date === '2026-10-14').Theme, 'My theme');
  assert.deepEqual(result.events, ['2026-10-17']);
  const event = result.rows.find(row => row.Type === 'Event');
  assert.equal(event['Start Time'], '10:00');
  assert.equal(event['Sparks Lesson'], '');
  assert.deepEqual(Calendar.copyThemes(result.rows, old, 'order', true, first, last, new Set([first])).events, []);
  assert.equal(proposed.at(-1).Theme, '');
  const s = Season.blank('2025-26');
  s.calendar = old;
  const next = Season.newSeason(s, '2026-27');
  assert.deepEqual(next.config.lastYearCalendar, Calendar.archive(old));
});

test('preview reports which series lessons would move or be skipped', () => {
  const rows = [night('2026-10-07'), night('2026-10-14'), night('2026-10-21')];
  const config = { lessons: { on: true, groups: { Puggles: { items: ['A', 'B', 'C'] } } } };
  const planned = rows.slice(), cancelled = rows.slice();
  planned[1] = Calendar.setState(rows[1], 'planned');
  cancelled[1] = Calendar.setState(rows[1], 'cancelled', 'Weather');
  const moved = Calendar.lessonChanges(rows, planned, config);
  assert.deepEqual(moved.map(x => [x.date, x.after.text]), [['2026-10-14', ''], ['2026-10-21', 'B']]);
  const skipped = Calendar.lessonChanges(rows, cancelled, config);
  assert.deepEqual(skipped.map(x => [x.date, x.after.kind, x.after.text]), [['2026-10-14', 'missed', 'B']]);
});

test('merge catches changed season classification for an imported sign-off', () => {
  const mine = Season.blank('2026-27'), other = Season.blank('2026-27');
  mine.calendar = [night('2026-10-07'), night('2026-10-14')];
  other.calendar = [night('2026-10-14')];
  mine.progress = { child: { HG: { 'Rank.1': '2026-10-07' } } };
  const combined = Object.assign({}, mine, { calendar: other.calendar });
  assert.deepEqual(Safety.mergeConflicts(mine, other, combined, '2026-10-20'), [
    { date: '2026-10-07', reasons: { 'season classification would change': 1 } }
  ]);
});

test('calendar comparison flags newly out-of-order quarters without duplicating old issues', () => {
  const s = Season.blank('2026-27');
  const before = [night('2026-10-07', 'Q1'), night('2026-10-21', 'Q2')];
  const invalid = [before[0], night('2026-10-14', 'Q3'), before[1]];
  const impacts = Safety.compare(s, before, invalid, '2026-09-01');
  assert(impacts.blocks.some(row => row.date === '2026-10-21' && row.reasons['quarter would go backward']));
  assert.deepEqual(Safety.compare(s, invalid, invalid, '2026-09-01').blocks, []);
});

test('a missing night previews its records and quarter without touching either', () => {
  const file = Season.blank('2040-41'), date = '2040-09-05';
  file.attendance[date] = { a: { a: 1 }, b: { a: 1 } };
  const preview = Safety.correctionImpact(file, [], [night(date, 'Q2')], date);
  assert.equal(preview.length, 1);
  assert.match(preview[0], /2040-09-05 · no row → Q2 · attendance \(2\)/);
  assert.equal(file.calendar.length, 0);
});

test('a rollover sign-off notice permits Apply and the optional cutoff needs a reason', () => {
  const s = Season.blank('2026-27');
  const rows = [night('2026-05-13')], date = '2026-08-12';
  s.config.carriedThrough = rows[0].Date;
  s.progress = { child: { HG: { 'Rank.1': date } } };
  const propose = choice => Safety.propose(s, rows, { ...october, ...choice }, '2026-08-10');
  const pending = propose({});
  assert.deepEqual(pending.cutoffChoice.dates, [date]);
  assert.deepEqual(pending.blocks, []);
  assert.equal(propose({ cutoffThrough: date, cutoffReason: '  ' }).cutoffReason, undefined);
  const accepted = propose({ cutoffThrough: date, cutoffReason: 'Completed in the prior season' });
  assert.deepEqual(accepted.blocks, []);
  assert.equal(accepted.cutoffReason, 'Completed in the prior season');
  assert.equal(s.config.carriedThrough, rows[0].Date);
  s.attendance[date] = { child: { a: 1 } };
  assert.equal(propose({ cutoffThrough: date, cutoffReason: 'Reviewed' }).cutoffChoice, undefined);
});

test('calendar review requires every date and preserves other merge decisions', () => {
  const a = '2040-09-05', b = '2040-09-12', c = '2040-09-19';
  const mine = { calendar: [night(a), night(b)] }, other = { calendar: [night(a, 'Q2'), night(c)] };
  const merged = { calendar: other.calendar, config: { clubTitle: 'Reviewed title' } };
  const dates = Safety.reviewDates(mine, other, [a, b].map(date => ({ date, reasons: { attendance: 1 } })));
  assert.equal(Safety.reviewedCalendar(merged, dates, { [a]: 'mine' }), null);
  assert.deepEqual(Safety.reviewedCalendar(merged, dates, { [a]: 'other', [b]: 'mine' }), [other.calendar[0], mine.calendar[1], other.calendar[1]]);
  assert.deepEqual(Safety.reviewedCalendar(merged, dates, { [a]: 'mine', [b]: 'other' }), [mine.calendar[0], other.calendar[1]]);
  assert.deepEqual(merged, { calendar: other.calendar, config: { clubTitle: 'Reviewed title' } });
});

const noteDate = '2040-09-05';
test('calendar note counts individual children and games', () => {
  const s = Season.blank('2040-41');
  s.attendance[noteDate] = { 'kid-a': { a: 1 }, 'kid-b': { a: 1 } };
  s.games[noteDate] = { Q1: { red: 1 } };
  assert.deepEqual(Safety.noteImpact(s, noteDate), { recorded: true, children: ['kid-a', 'kid-b'], other: { games: 1 } });
});

test('an empty night has no note impact', () => {
  assert.deepEqual(Safety.noteImpact(Season.blank('2040-41'), noteDate), { recorded: false, children: [], other: {} });
});

test('a sign-off alone counts as child activity', () => {
  const s = Season.blank('2040-41');
  s.progress = { 'kid-c': { HG: { 'Rank.1': noteDate } } };
  assert.deepEqual(Safety.noteImpact(s, noteDate), { recorded: true, children: ['kid-c'], other: {} });
});

test('an adult award counts as other activity', () => {
  const s = Season.blank('2040-41');
  s.adults[noteDate] = { 'vol-a': { award: 1 } };
  assert.deepEqual(Safety.noteImpact(s, noteDate), { recorded: true, children: [], other: { 'adult awards': 1 } });
});

test('a previous schedule flag alone has no note impact', () => {
  const s = Season.blank('2040-41'), later = '2040-09-12';
  s.calendar = [night(noteDate), night(later, 'Q2')];
  s.attendance[later] = { 'kid-a': { a: 1 } };
  assert.deepEqual(Safety.inspect(s, s.calendar, '2040-09-04').dates.get(noteDate), { 'previous schedule': 1 });
  assert.equal(Safety.noteImpact(s, noteDate).recorded, false);
});

test('first calendar lists earlier sign-offs and allows Apply, while duplicate meetings block it', () => {
  const s = Season.blank('2026-27');
  s.progress = { child: { HG: { 'Rank.1': '2026-09-30' } } };
  const proposal = Safety.propose(s, [], october, '2026-08-10');
  assert.deepEqual(proposal.blocks, []);
  assert.deepEqual(proposal.notices, [{ date: '2026-09-30', first: proposal.rows[0].Date, records: [{ kind: 'sign-offs', id: 'child', item: 'HG · Rank.1' }] }]);
  const duplicate = Safety.propose(s, [proposal.rows[0], proposal.rows[0]], october, '2026-08-10');
  assert(duplicate.blocks.some(b => b.reasons['multiple club night rows']));
});

for (const [section, kind, item] of [
  ['given', 'award receipts', 'Award'],
  ['received', 'book receipts', 'HG']
]) {
  test('first calendar allows Apply and lists earlier ' + kind, () => {
    const s = Season.blank('2026-27'), date = '2026-09-30';
    s[section] = { child: { [item]: date } };
    const proposal = Safety.propose(s, [], october, '2026-08-10');
    assert.deepEqual(proposal.blocks, []);
    assert.deepEqual(proposal.notices, [{ date, first: october.first, records: [{ kind, id: 'child', item }] }]);
    assert.equal(proposal.cutoffChoice, undefined);
  });
}

test('invalid calendar rows still prevent a first calendar proposal', () => {
  const s = Season.blank('2026-27');
  assert.throws(() => Safety.propose(s, [night('2026-09-31')], october, '2026-08-10'), /invalid calendar dates/);
});

test('comparison blocks a date move onto another meeting and allows a same-date event', () => {
  const s = Season.blank('2026-27'), date = '2026-10-07', today = '2026-08-10';
  const rows = [night(date), night('2026-10-14')];
  assert.deepEqual(Safety.compare(s, rows, [rows[0], night(date)], today).blocks, [
    { date, reasons: { 'multiple club night rows': 2 } }
  ]);
  assert.deepEqual(Safety.compare(s, rows, [rows[0], night(date, 'Q1', { Type: 'Event' })], today).blocks, []);
});

test('calendar corrections list only reports whose output changes', () => {
  const Reports = require('../reports.js');
  require('../reports-season.js');
  const s = Season.blank('2026-27'), event = { Date: '2026-10-07', Type: 'Event', Theme: 'Special event' };
  const ctx = { master: { people: [] }, season: s, calendar: [night('2026-09-30'), event], settings: { quarter: 'Q1' }, today: '2026-08-10' };
  assert.deepEqual(Reports.calendarChanges(ctx, ctx.calendar), []);
  assert.deepEqual(Reports.calendarChanges(ctx, [ctx.calendar[0], { ...event, Date: '2026-10-08' }]), [
    Reports.LIST.find(r => r.id === 'clubCalendar').title
  ]);
});

test('a one-date calendar outside the usual weekday keeps the selected date', () => {
  const date = '2026-10-01';
  const proposal = Safety.propose(Season.blank('2026-27'), [], { ...october, first: date, last: date }, date);
  assert.deepEqual(proposal.rows.map(row => row.Date), [date]);
  assert.deepEqual(proposal.blocks, []);
});

test('correction preview lists activity and same-night sign-offs, and omits counts on schedule flags', () => {
  const s = Season.blank('2026-27'), date = '2026-10-07';
  s.attendance[date] = { child: { a: 1 } };
  s.progress = { child: { HG: { 'Rank.1': date } } };
  const [line] = Safety.correctionImpact(s, [night(date), night('2026-10-14')], [night('2026-10-14')], date);
  assert.match(line, /attendance \(1\)/);
  assert.match(line, /sign-offs \(1\)/);
  assert.match(line, /previous schedule/);
  assert.doesNotMatch(line, /(?:previous schedule|locked quarter) \(1\)/);
});

test('removing an existing first night lists the affected awards and allows Apply', () => {
  const s = Season.blank('2026-27');
  const first = '2026-10-07', next = '2026-10-14';
  s.calendar = [night(first), night(next)];
  s.given = { child: { Award: first } };
  const before = Season.snapshot(s);
  const result = Safety.compare(s, s.calendar, s.calendar.slice(1), '2026-10-01');
  assert.deepEqual(result.blocks, []);
  assert.deepEqual(result.notices, [{
    date: first, first: next, records: [{ kind: 'award receipts', id: 'child', item: 'Award' }]
  }]);
  assert.deepEqual(Season.snapshot(s), before);
});

test('recorded closures preserve records and the season boundary while excluding attendance and granting grace', () => {
  const s = Season.blank('2026-27');
  const first = '2026-10-07', next = '2026-10-14', empty = '2026-10-21';
  s.calendar = [night(first), night(next), night(empty)];
  s.config.blueJewelWeeks = [2];
  s.attendance = { [first]: { child: { a: 1 } }, [next]: { child: { a: 1 }, other: { a: 1 } } };
  s.progress = { child: { HG: { 'Rank.1': first } } };
  const before = Season.snapshot(s);
  s.calendar = s.calendar.map(row => row.Date === next ? row : Calendar.markRecordedClosure(
    row, Calendar.setState(row, 'cancelled'), Safety.noteImpact(s, row.Date).recorded
  ));
  const reloaded = Season.fromJson(Season.toJson(s));
  assert.equal(Season.seasonStart(reloaded), first);
  assert.equal(Season.firstNight(reloaded), next);
  assert.equal(Season.totals(reloaded, 'child', reloaded.calendar).year.a, 1);
  assert.equal(Season.totals(reloaded, 'other', reloaded.calendar).year.a, 1);
  assert.deepEqual(Season.signsShown(reloaded, 'child', 'HG'), { 'Rank.1': first });
  assert.deepEqual(reloaded.attendance, before.attendance);
  assert.equal(reloaded.calendar[2]['Recorded Night'], undefined);
  assert.deepEqual(Season.blueJewelRequirements(reloaded, reloaded.calendar), [1]);
  assert.deepEqual(Season.blueJewels(reloaded, 'other', reloaded.calendar), [{ n: 1, threshold: 1, date: next }]);
  const changes = Season.diff(before, s);
  Season.applyChanges(s, changes, true);
  assert.equal(Season.totals(s, 'child', s.calendar).year.a, 2);
  assert.equal(s.calendar[0]['Recorded Night'], undefined);
});

test('a late recorded closure preserves earned jewel dates and dropped jewels', () => {
  const s = Season.blank('2026-27');
  const dates = ['02', '09', '16', '23', '30'].map(day => '2026-09-' + day);
  s.calendar = dates.map(date => night(date));
  s.config.blueJewelWeeks = [2, 4];
  for (const row of s.calendar) Season.setMark(s, row.Date, 'child', 'a', true);
  const last = s.calendar.at(-1);
  s.calendar[s.calendar.length - 1] = Calendar.markRecordedClosure(last, Calendar.setState(last, 'cancelled'), true);
  assert.deepEqual(Season.blueJewels(s, 'child', s.calendar), [
    { n: 1, threshold: 2, date: '2026-09-09' },
    { n: 2, threshold: 4, date: '2026-09-23' }
  ]);
  assert.deepEqual(Season.blueJewelRequirements(s, s.calendar, 'child'), [2, 4]);
  const Model = require('../model.js'), Reports = require('../reports.js');
  require('../reports-season.js');
  const person = { [Model.X.ID]: 'child', [Model.C.ROOM]: 'Sparks', [Model.C.FIRST]: 'Test' };
  Season.setProgress(s, 'child', 'HG', 'Rank.1', '2026-09-02');
  const report = Reports.LIST.find(r => r.id === 'achievement').render({
    master: { people: [person] }, calendar: s.calendar, season: s, opts: { group: 'Sparks', kid: 'child' }
  });
  assert.match(report, /1 · 2 nights<\/i><span class="v">09\/09\/26/);
  assert.match(report, /2 · 4 nights<\/i><span class="v">09\/23\/26/);
  s.blueDrops = { child: ['1|2026-09-09'] };
  assert.deepEqual(Season.blueWingPlan(s, 'child', s.calendar).placed.map(j => j.n), [2]);
});

test('a leader drop survives earlier and later closures without changing its stored date', () => {
  const s = Season.blank('2026-27');
  const dates = ['2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30', '2026-10-07'];
  s.calendar = dates.map(date => night(date));
  s.config.blueJewelWeeks = [2, 4];
  for (const date of dates.slice(1, 5)) Season.setMark(s, date, 'child', 'a', true);
  const close = index => {
    const row = s.calendar[index];
    Season.setMark(s, row.Date, 'other', 'a', true);
    s.calendar[index] = Calendar.markRecordedClosure(row, Calendar.setState(row, 'cancelled'),
      Safety.noteImpact(s, row.Date).recorded);
  };
  const dropped = Season.sparkJewels(s, 'child', s.calendar)[1];
  assert.equal(dropped.date, dates[4]);
  Season.dropBlue(s, 'child', { ...dropped, kind: 'earned', slot: dropped.n });
  close(5);
  assert.equal(Season.blueJewels(s, 'child', s.calendar)[1].date, dates[4]);
  assert.deepEqual(Season.sparkJewels(s, 'child', s.calendar).map(j => [j.gem, j.date]), [[1, dates[2]]]);
  close(0);
  assert.equal(Season.blueJewels(s, 'child', s.calendar)[1].date, dates[3]);
  const reloaded = Season.fromJson(Season.toJson(s));
  assert.deepEqual(reloaded.blueDrops.child, ['2|2026-09-30']);
  assert.deepEqual(Season.sparkJewels(reloaded, 'child', reloaded.calendar).map(j => [j.gem, j.date]), [[1, dates[1]]]);
});

test('grace begins after the closure and follows activity on the row date', () => {
  const s = Season.blank('2026-27');
  const [first, second, third] = ['2026-09-02', '2026-09-09', '2026-09-16'];
  const original = night(first);
  const closed = Calendar.markRecordedClosure(original, Calendar.setState(original, 'cancelled'), true);
  s.calendar = [closed, night(second), night(third)];
  s.config.blueJewelWeeks = [2];
  Season.setMark(s, first, 'other', 'a', true);
  Season.setMark(s, second, 'child', 'a', true);
  Season.setMark(s, third, 'child', 'a', true);
  assert.deepEqual(Season.blueJewels(s, 'child', s.calendar), [{ n: 1, threshold: 1, date: second }]);
  const moved = { ...closed, Date: '2026-09-03' };
  const movedCalendar = [moved, ...s.calendar.slice(1)];
  const withoutMark = [{ ...moved, 'Recorded Night': '' }, ...s.calendar.slice(1)];
  assert.deepEqual(Season.blueJewelRequirements(s, movedCalendar), Season.blueJewelRequirements(s, withoutMark));
  assert.equal(Season.seasonStart({ ...s, calendar: movedCalendar }), Season.seasonStart({ ...s, calendar: withoutMark }));
  assert.equal(Season.fromJson(Season.toJson(s)).calendar[0]['Recorded Night'], '0');
  assert.equal(Calendar.load(Calendar.toCsv(s.calendar))[0]['Recorded Night'], '0');
  Season.setMark(s, first, 'other', 'a', false);
  assert.equal(Season.seasonStart(s), second);
  assert.deepEqual(Season.blueJewels(s, 'child', s.calendar), [{ n: 1, threshold: 2, date: third }]);
});

test('volunteer attendance and dated notes alone do not qualify for grace', () => {
  const s = Season.blank('2040-41'), Model = require('../model.js');
  s.roster.people.adult = { v: { [Model.C.ROOM]: 'Volunteers' } };
  Season.setMark(s, noteDate, 'adult', 'a', true);
  s.flags.note = { date: noteDate };
  assert.equal(Safety.noteImpact(s, noteDate).recorded, false);
});

test('protected reopenings still have blocks for the edit confirmation', () => {
  const s = Season.blank('2040-41'), today = '2040-09-13';
  const closed = Calendar.setState(night(noteDate), 'planned');
  const future = night('2040-09-19');
  s.config.teamPlan = { locked: { Q1: noteDate } };
  const reopening = Safety.compare(s, [closed, future], [night(noteDate), future], today);
  assert(reopening.blocks.some(b => b.date === noteDate && b.reasons['locked quarter']));
  s.attendance[noteDate] = { child: { a: 1 } };
  const event = { ...night(noteDate), Type: 'Event' };
  const conversion = Safety.compare(s, [event, future], [night(noteDate), future], today);
  assert(conversion.blocks.some(b => b.date === noteDate && b.reasons.attendance));
});

test('season start notice identifies each sign-off moved to an earlier year', () => {
  const s = Season.blank('2040-41');
  const rows = [night(noteDate), night('2040-09-12')];
  s.progress = { child: { HG: { 'Rank.1': noteDate, 'Rank.2': noteDate } } };
  const change = Safety.compare(s, rows, rows.slice(1), noteDate);
  assert.match(Safety.noticeText(change.notices[0], () => 'Test Child'),
    /starts on 2040-09-12.*earlier year.*Test Child · HG · Rank\.1.*Test Child · HG · Rank\.2/);
});

test('quarter dates follow recorded closures and preserve hand locks', () => {
  const TeamPlan = require('../teamplan.js'), Reports = require('../reports.js');
  const s = Season.blank('2040-41');
  const past = night(noteDate), future = night('2040-09-19');
  s.attendance[noteDate] = { child: { a: 1 } };
  const closed = Calendar.markRecordedClosure(past, Calendar.setState(past, 'cancelled'), true);
  const rows = [closed, future], today = '2040-09-12';
  assert.equal(TeamPlan.stateOf(s, rows, 'Q1', today), 'locked');
  assert.equal(Reports.firstNightOf(rows, 'Q1', s), noteDate);
  assert.equal(Reports.nextQuarter(rows, today, 'Q1', s), 'Q2');
  delete s.attendance[noteDate];
  assert.equal(TeamPlan.stateOf(s, rows, 'Q1', today), 'ready');
  assert.equal(Reports.firstNightOf(rows, 'Q1', s), future.Date);
  TeamPlan.lock(s, 'Q1', today);
  assert.equal(TeamPlan.stateOf(s, rows, 'Q1', today), 'locked');
  assert.equal(TeamPlan.config(s).locked.Q1, today);
});

test('a jewel earned on the closure date keeps its original requirement and date', () => {
  const s = Season.blank('2026-27');
  const [first, second, third] = ['2026-09-02', '2026-09-09', '2026-09-16'];
  const row = night(second);
  s.calendar = [night(first), Calendar.markRecordedClosure(row, Calendar.setState(row, 'cancelled'), true), night(third)];
  s.config.blueJewelWeeks = [2, 3];
  for (const date of [first, second, third]) Season.setMark(s, date, 'child', 'a', true);
  assert.deepEqual(Season.blueJewels(s, 'child', s.calendar), [
    { n: 1, threshold: 2, date: second }, { n: 2, threshold: 2, date: third }
  ]);
  assert.deepEqual(Season.blueJewelRequirements(s, s.calendar, 'child'), [2, 2]);
  assert.equal(Season.totals(s, 'child', s.calendar).year.a, 2);
});
