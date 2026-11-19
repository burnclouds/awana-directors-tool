// N2 (1.51.16): lessons by week, the data side. One lesson column per group (Puggles Lesson replaces Puggles # and Puggles Title), the upgrade of an older file,
// config.lessons (which groups have a lesson each week), its file check, and the corrected report. Invented data only.
// Usage: node test/calendar-lessons.test.js
const assert = require('assert');
const Calendar = require('../calendar.js'), Season = require('../season.js'), Reports = require('../reports.js'), Validate = require('../validate.js'), M = require('../model.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const clone = o => JSON.parse(JSON.stringify(o));
const row = (date, extra) => Object.assign({ Date: date, Type: 'Club night', Quarter: 'Q1', Theme: '', Notes: '', 'No Club': '', 'Puggles Lesson': '', 'Cubbies Lesson': '', 'Sparks Lesson': '', 'T&T Lesson': '' }, extra || {});
const OLD = (date, extra) => { const r = row(date, extra); delete r['Puggles Lesson']; return Object.assign(r, { 'Puggles #': '', 'Puggles Title': '' }, extra || {}); };
const render = (cal, config) => Reports.LIST.find(r => r.id === 'lessons').render({ master: M.emptyMaster(), settings: { quarter: 'Q1' }, calendar: cal, season: { config: config || {} }, opts: {} });

test('the columns: one lesson column per group, named after the group, in the order Puggles, Cubbies, Sparks, T&T', () => {
  assert.deepStrictEqual(Calendar.COLS, ['Date', 'Type', 'Quarter', 'Theme', 'Notes', 'No Club', 'Puggles Lesson', 'Cubbies Lesson', 'Sparks Lesson', 'T&T Lesson']);
  assert.deepStrictEqual(Calendar.GROUPS.map(Calendar.lessonCol), ['Puggles Lesson', 'Cubbies Lesson', 'Sparks Lesson', 'T&T Lesson']);
});
test('a CSV with the new column round-trips; an older CSV with Puggles # and Puggles Title joins them (a space between, an empty part dropped)', () => {
  const rows = [row('2026-09-09', { 'Puggles Lesson': '1.1 God Made the Light', 'Sparks Lesson': 'x' })], back = Calendar.load(Calendar.toCsv(rows)); assert.deepStrictEqual(back, rows);
  const old = 'Date,Type,Quarter,Theme,Notes,No Club,Cubbies Lesson,Puggles #,Puggles Title,Sparks Lesson,T&T Lesson\n2026-09-09,Club night,Q1,,,,Bear Hug 1,1.1,God Made the Light,,\n2026-09-16,Club night,Q1,,,,,1.2,,,\n';
  const r = Calendar.load(old); assert.strictEqual(r[0]['Puggles Lesson'], '1.1 God Made the Light'); assert.strictEqual(r[1]['Puggles Lesson'], '1.2'); assert.strictEqual(r[0]['Cubbies Lesson'], 'Bear Hug 1'); assert(!('Puggles #' in r[0]));
});
test('tidy: an old row joins the two Puggles keys and drops them; a current row is the same object; Puggles Lesson already typed wins and the old pair goes to Notes', () => {
  const cur = row('2026-09-09'); assert.strictEqual(Calendar.tidy(cur), cur, 'the same object, untouched');
  const o = Calendar.tidy(OLD('2026-09-09', { 'Puggles #': '2.3', 'Puggles Title': 'Noah', 'Sparks Lesson': '9.9' })); assert.strictEqual(o['Puggles Lesson'], '2.3 Noah'); assert(!('Puggles #' in o) && !('Puggles Title' in o)); assert.strictEqual(o['Sparks Lesson'], '9.9', 'other old lesson values stay in their own columns');
  const both = Calendar.tidy(Object.assign(row('2026-09-09', { 'Puggles Lesson': 'typed', Notes: 'n' }), { 'Puggles #': '1.1', 'Puggles Title': 'Old' })); assert.strictEqual(both['Puggles Lesson'], 'typed'); assert.strictEqual(both.Notes, 'n · Puggles: 1.1 Old');
  assert.strictEqual(Calendar.tidy(OLD('2026-09-09'))['Puggles Lesson'], '');
});
test('opening an older file upgrades the calendar and logs nothing (no bulky History entry); a current file is left as it is', () => {
  const s0 = Season.blank('2026-27'); s0.calendar = [OLD('2026-09-09', { 'Puggles #': '1.1', 'Puggles Title': 'God Made the Light' }), OLD('2026-09-16')]; s0.history = [{ t: '2026-10-01T00:00:00.000Z', label: 'start', changes: [] }];
  const s = Season.fromJson(Season.toJson(s0)); assert.strictEqual(s.calendar[0]['Puggles Lesson'], '1.1 God Made the Light'); assert(!('Puggles #' in s.calendar[0]) && !('Puggles Title' in s.calendar[1]));
  assert.strictEqual(s.history.length, 1, 'the upgrade is not logged');
  const again = Season.fromJson(Season.toJson(s)); assert.strictEqual(again.history.length, 1); assert.deepStrictEqual(again.calendar, s.calendar);
});
test('lessonSettings: missing reads as on only when a lesson is typed; every group on unless switched off; bad shapes read as the default', () => {
  const empty = [row('2026-09-09')], typed = [row('2026-09-09', { 'Sparks Lesson': '1.1' })];
  assert.strictEqual(Calendar.lessonSettings({}, empty).on, false); assert.strictEqual(Calendar.lessonSettings({}, typed).on, true);
  assert.deepStrictEqual(Calendar.GROUPS.filter(g => Calendar.lessonSettings({}, empty).groups[g].on), Calendar.GROUPS);
  const L = Calendar.lessonSettings({ lessons: { on: true, groups: { Sparks: { on: false } } } }, empty); assert.strictEqual(L.on, true); assert.strictEqual(L.groups.Sparks.on, false); assert.strictEqual(L.groups.Puggles.on, true);
  assert.strictEqual(Calendar.lessonSettings({ lessons: 'nope' }, typed).on, true);
});
test('the report: Date, Theme, then the groups that are on; NO CLUB across the row; events left out; off or empty says so', () => {
  const cal = [row('2026-09-09', { Theme: 'Kickoff', 'Puggles Lesson': '1.1 Light', 'Cubbies Lesson': 'Bear Hug 1', 'Sparks Lesson': 'junk' }), row('2026-09-16', { 'No Club': '1', Theme: 'Break' }), row('2026-09-23', { Type: 'Event', Theme: 'Outing' })];
  const on = render(cal, { lessons: { on: true, groups: { Sparks: { on: false }, 'T&T': { on: false } } } });
  assert(/<th>Date<\/th><th>Theme<\/th><th>Puggles<\/th><th>Cubbies<\/th><\/tr>/.test(on), 'columns'); assert(!/Sparks|junk/.test(on), 'Sparks is switched off'); assert(/1\.1 Light/.test(on) && /Bear Hug 1/.test(on));
  assert(/<td colspan="3"><span class="none">NO CLUB<\/span>/.test(on), 'NO CLUB spans the row'); assert(!/Outing/.test(on), 'events are left out');
  assert(/not turned on/.test(render(cal, { lessons: { on: false } }))); assert(/Every group is switched off/.test(render(cal, { lessons: { on: true, groups: Object.fromEntries(Calendar.GROUPS.map(g => [g, { on: false }])) } })));
  assert(/Load a calendar/.test(render([], {})));
});
test('validator: config.lessons is checked (a bad shape is an error, an unknown group a warning); a good one is clean', () => {
  const run = mut => { const s = Season.blank('2026-27'); s.calendar = []; mut(s); return Validate.validate(Season.toJson(s), 'awana-2026-27-20261116-000000.json').findings; };
  assert.deepStrictEqual(run(s => { s.config.lessons = { on: true, groups: { Puggles: { on: true }, Sparks: { on: false } } }; }).filter(f => f.level !== 'info' && /lessons/.test(f.msg)), []);
  assert(run(s => { s.config.lessons = 'yes'; }).some(f => f.level === 'error' && /lessons/.test(f.msg)));
  assert(run(s => { s.config.lessons = { on: 'yes' }; }).some(f => f.level === 'error' && /lessons\.on/.test(f.msg)));
  assert(run(s => { s.config.lessons = { groups: { Puggles: { on: 1 } } }; }).some(f => f.level === 'error' && /Puggles/.test(f.msg)));
  assert(run(s => { s.config.lessons = { groups: { Wombats: { on: true } } }; }).some(f => f.level === 'warn' && /Wombats/.test(f.msg)));
  assert(!Validate.CHECKED_CONFIG.every(k => k !== 'lessons'), 'lessons is a checked config key');
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
