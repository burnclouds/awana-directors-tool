// Held nights (CR-09): a club night is held when a CHILD is marked present on it. Who is a child comes from the data file's own roster, so every caller agrees with NO setup call:
// Statistics, store points, Pace, color-team turnout, Blue Jewels, a volunteer's expected nights. Invented TEST club only.
// Usage: node test/held-nights-agree.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Season = require('../season.js'), M = require('../model.js'), Stats = require('../stats.js'), Store = require('../store.js'), Pace = require('../pace.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).filter(f => /TEST.*\.json$/.test(f)).sort().pop(), { C, X } = M;
const load = () => { const s = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')); return { season: s, master: M.fromRoster(s.roster), calendar: s.calendar, today: '2026-12-20' }; };
const emptyNight = (s, cal) => Object.keys(Season.counted(cal)).sort().find(d => !s.attendance[d]);
const volunteer = m => m.people.find(p => M.isVolunteer(p) && M.isActive(p))[X.ID], child = m => m.people.find(p => M.isClubber(p) && M.isActive(p))[X.ID];
const numbers = ctx => { const st = Stats.compute(ctx); return JSON.stringify([Season.heldNights(ctx.season, ctx.calendar), st.nights, st.club, Store.compute(ctx), Pace.rows(ctx), Season.turnoutCounts(ctx.season, ctx.calendar, '')]); };

test('the global setter is gone', () => { assert(!('setChildTest' in Season)); });
test('a night only a volunteer is marked on changes NO number anywhere (Statistics, store, Pace, held list, turnout)', () => {
  const ctx = load(), night = emptyNight(ctx.season, ctx.calendar), v = volunteer(ctx.master); assert(night && v, 'a free club night and a volunteer exist');
  const before = numbers(ctx); ctx.season.attendance[night] = { [v]: { a: 1 } };
  assert.strictEqual(numbers(ctx), before, 'a volunteer-only night moved a number');
  assert.strictEqual(Season.volunteerExpected(ctx.season, v, ctx.calendar).held, Season.heldNights(ctx.season, ctx.calendar).length, 'expected nights use the same held list');
});
test('add one child to that night and every number moves by exactly that one night', () => {
  const ctx = load(), night = emptyNight(ctx.season, ctx.calendar), v = volunteer(ctx.master), k = child(ctx.master), held = Season.heldNights(ctx.season, ctx.calendar).length, nights = Stats.compute(ctx).club.nights;
  ctx.season.attendance[night] = { [v]: { a: 1 }, [k]: { a: 1 } };
  assert.strictEqual(Season.heldNights(ctx.season, ctx.calendar).length, held + 1); assert.strictEqual(Stats.compute(ctx).club.nights, nights + 1);
  assert.strictEqual(Season.volunteerExpected(ctx.season, v, ctx.calendar).held, held + 1);
});
test('a pending room change to Volunteers (an ov: field) makes that person stop counting as a child', () => {
  const ctx = load(), night = emptyNight(ctx.season, ctx.calendar), k = child(ctx.master);
  ctx.season.attendance[night] = { [k]: { a: 1 } }; assert(Season.heldNights(ctx.season, ctx.calendar).includes(night), 'held while a child');
  ctx.season.roster.people[k].v['ov:' + C.ROOM] = 'Volunteers'; assert(!Season.heldNights(ctx.season, ctx.calendar).includes(night), 'not held once the pending change makes them a volunteer');
});
test('a mark by an id that is not on the roster still counts as a child (an earlier year\'s person who has left)', () => {
  const ctx = load(), night = emptyNight(ctx.season, ctx.calendar); ctx.season.attendance[night] = { '99_Gone_Kid': { a: 1 } };
  assert(Season.heldNights(ctx.season, ctx.calendar).includes(night));
});
test('an earlier year\'s file is judged by ITS OWN roster: a night only that year\'s volunteer attended gives no counts', () => {
  const old = Season.blank('2024-25'); old.calendar = [{ Date: '2024-09-11', Type: 'Club', Quarter: 'Q1', 'No Club': '' }, { Date: '2024-09-18', Type: 'Club', Quarter: 'Q1', 'No Club': '' }];
  old.roster = { cols: [], people: { '5_Vol_Old': { pc: {}, v: { Selection: 'Volunteer' } }, '6_Kid_Old': { pc: {}, v: {} } } };
  Season.setMark(old, '2024-09-11', '5_Vol_Old', 'a', 1, 'Sparks'); Season.setMark(old, '2024-09-18', '5_Vol_Old', 'a', 1, 'Sparks'); Season.setMark(old, '2024-09-18', '6_Kid_Old', 'a', 1, 'Sparks');
  assert.deepStrictEqual(Season.heldNights(old, old.calendar), ['2024-09-18']);
  const tc = Season.turnoutCounts(old, old.calendar, ''); assert.deepStrictEqual(tc['6_Kid_Old'], { nights: 1, came: 1 }); assert.strictEqual(tc['5_Vol_Old'].nights, 1, 'the volunteer-only night (9/11) did not count: 1 held night, not 2');
});
test('Model.childTestOf: a volunteer by Selection or by room is not a child; everyone else is; unknown ids are', () => {
  const t = M.childTestOf({ people: { a: { pc: {}, v: { Selection: 'Volunteer' } }, b: { pc: {}, v: {} }, c: { pc: { [C.ROOM]: 'Volunteers' }, v: {} } } });
  assert.strictEqual(t('a'), false); assert.strictEqual(t('b'), true); assert.strictEqual(t('c'), false); assert.strictEqual(t('zzz'), true);
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
