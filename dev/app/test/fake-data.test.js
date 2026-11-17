// The invented demo club is flagged "fake": true and Try it out moves its dates forward to today (Season.freshenFake), in whole weeks, so it never goes stale.
// Usage: node test/fake-data.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Season = require('../season.js'), M = require('../model.js'), Stats = require('../stats.js'), Pace = require('../pace.js'), Validate = require('../validate.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), text = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find(f => /TEST.*\.json$/.test(f))), 'utf8');
const base = Season.fromJson(text), nights = Object.keys(base.attendance).sort(), last = nights[nights.length - 1];
const plus = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const isoStrings = o => { const out = []; (function w(x) { if (typeof x === 'string') { if (/^\d{4}-\d{2}-\d{2}/.test(x)) out.push(x); } else if (Array.isArray(x)) x.forEach(w); else if (x && typeof x === 'object') Object.keys(x).forEach(k => { if (/^\d{4}-\d{2}-\d{2}$/.test(k)) out.push(k); w(x[k]); }); })(o); return out; };

test('the demo file says it is fake, and the app keeps the flag; a real file has none', () => {
  assert.strictEqual(JSON.parse(text).fake, true); assert.strictEqual(base.fake, true); assert.strictEqual(JSON.parse(Season.toJson(base)).fake, true);
  assert(!('fake' in Season.blank('2026-27')));
});
test('a file that is not fake is returned untouched, and so is a fake one that is already current', () => {
  const real = Season.toJson(Season.blank('2026-27')); assert.strictEqual(Season.freshenFake(real, '2030-01-01'), real);
  assert.strictEqual(Season.freshenFake(text, last), text); assert.strictEqual(Season.freshenFake(text, plus(last, 6)), text);
});
test('the demo shows a color team plan: Q3 and Q4 projected, a few hand-set (pinned) Q3 colors, nothing marked in Q1 or Q2', () => {
  const TeamPlan = require('../teamplan.js'), master = M.fromRoster(base.roster);
  const kids = master.people.filter(p => M.isActive(p) && M.isClubber(p) && ['Sparks', 'T&T'].includes(M.groupOf(M.room(p))) && p['team:Q3'] && p['team:Q4']);
  const pinned = q => kids.filter(p => TeamPlan.isPinned(master, base, p, q)).length;
  assert(kids.length > 20, 'the demo has children with colors');
  assert(pinned('Q3') >= 3 && pinned('Q3') <= Math.ceil(kids.length / 8), 'a few Q3 colors are hand-set: ' + pinned('Q3') + ' of ' + kids.length);
  assert.strictEqual(pinned('Q4'), 0, 'every Q4 color is projected');
  kids.forEach(p => { const m = (base.config.teamPlan.proj[p[M.X.ID]] || '----'); assert(m[0] === '-' && m[1] === '-', 'Q1 and Q2 carry no projection mark'); });
});
test('the demo-plan tool refuses a file that is not flagged fake', () => {
  const tool = require('../../tools/demo-plan.js'), real = Season.toJson(Season.blank('2026-27'));
  assert.throws(() => tool.add(real), /not flagged "fake"/);
});
test('whole weeks are added: the newest night becomes the latest same weekday on or before today', () => {
  const today = plus(last, 7 * 20 + 3), moved = Season.fromJson(Season.freshenFake(text, today)), n2 = Object.keys(moved.attendance).sort(), l2 = n2[n2.length - 1];
  assert.strictEqual(l2, plus(last, 140)); assert(l2 <= today && plus(l2, 7) > today); assert.strictEqual(new Date(l2 + 'T12:00:00Z').getUTCDay(), new Date(last + 'T12:00:00Z').getUTCDay());
  assert.strictEqual(n2.length, nights.length);
});
test('every date moves: calendar, games, awards, given, progress, handbooks, history, first / last seen, as-of date; nothing keeps its old date', () => {
  const moved = Season.fromJson(Season.freshenFake(text, plus(last, 70)));
  const after = isoStrings(moved).sort(), expected = isoStrings(base).map(d => d.length === 10 ? plus(d, 70) : new Date(Date.parse(d) + 70 * 86400000).toISOString()).sort();
  assert(after.length > 200, 'dates found: ' + after.length); assert.deepStrictEqual(after, expected, 'every date is exactly 70 days later');
  assert.strictEqual(moved.calendar[3].Date, plus(base.calendar[3].Date, 70)); assert.strictEqual(moved.calendar[3].Quarter, base.calendar[3].Quarter);
  const id = Object.keys(base.handbooks).find(i => /\d{6}/.test(base.handbooks[i])), m = /(\d{2})(\d{2})(\d{2})/.exec(base.handbooks[id]);
  assert(moved.handbooks[id].includes(plus('20' + m[1] + '-' + m[2] + '-' + m[3], 70).slice(2).replace(/-/g, '')), base.handbooks[id] + ' -> ' + moved.handbooks[id]);
  assert.strictEqual(moved.roster.pcAsOf, plus(base.roster.pcAsOf, 70));
});
test('moving back gives the original season exactly', () => {
  const moved = Season.shiftDates(base, 28), back = Season.shiftDates(moved, -28); assert.deepStrictEqual(back, base);
});
test('the club behaves the same after the move: same nights, attendance, points and pace', () => {
  const moved = Season.fromJson(Season.freshenFake(text, plus(last, 140))), mk = s => ({ season: s, master: M.fromRoster(s.roster), calendar: s.calendar });
  const a = Stats.compute(mk(base)), b = Stats.compute(mk(moved));
  assert.deepStrictEqual(b.classes.map(c => [c.room, c.enrolled, c.average]), a.classes.map(c => [c.room, c.enrolled, c.average])); assert.strictEqual(b.club.nights, a.club.nights);
  assert.deepStrictEqual(Pace.rows(mk(moved)).map(r => [r.id, r.nights, r.core]), Pace.rows(mk(base)).map(r => [r.id, r.nights, r.core]));
  assert.deepStrictEqual(Validate.validate(Season.toJson(moved), 'x.json').findings.filter(f => f.level === 'error'), []);
});
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
