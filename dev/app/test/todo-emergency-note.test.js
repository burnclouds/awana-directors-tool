// To do (backlog S12): a child needs an emergency PHONE NUMBER: the parent's primary phone (7 or more digits), a number in the Emergency Contact box
// ("Name - phone"), or a number the club chose. A name alone is not enough, and no emergency note is shown. Invented TEST club only.
// Usage: node test/todo-emergency-note.test.js     (the file is chosen by name, never "the first .json")
const assert = require('assert'), fs = require('fs'), path = require('path');
const Season = require('../season.js'), M = require('../model.js'), Todo = require('../todo.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).filter(f => /TEST.*\.json$/.test(f)).sort().pop(), { C } = M;
const load = () => { const s = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')); return { season: s, master: M.fromRoster(s.roster) }; };
const run = ({ season, master }) => Todo.compute({ master, season, quarter: 'Q2', today: '2026-10-29' });
const pick = master => master.people.filter(p => M.isActive(p) && M.isClubber(p) && M.eff(p, C.BDAY) && M.eff(p, C.EMERG))[0];
const detail = (res, id) => (res.groups.find(g => g.id === 'details') || { items: [] }).items.find(i => i.id === id);
const phoneItem = (res, id) => (res.groups.find(g => g.id === 'nophone') || { items: [] }).items.find(i => i.id === id);
const noteFor = (res, id) => (res.groups.find(g => g.id === 'emergnote') || { items: [] }).items.find(i => i.id === id);
const clean = p => { p[C.EMERG] = ''; p[C.PARENT_PHONE] = ''; p[C.BDAY] = p[C.BDAY] || '2019-01-01'; };

const noEmergency = x => !x || !/emergency/.test(x.text);
test('no emergency phone of any kind: ONE item, in its own group (an action), not in Details missing, and there is no note (CR-08)', () => {
  const d = load(), p = pick(d.master); clean(p); const r = run(d), id = p[M.X.ID], g = r.groups.find(x => x.id === 'nophone');
  assert(phoneItem(r, id), 'in the No emergency phone group'); assert.strictEqual(g.level, 'action', 'an action: it counts'); assert(noEmergency(detail(r, id)), 'not repeated under Details missing: ' + (detail(r, id) || {}).text); assert(!noteFor(r, id), 'no note');
  assert(/stays on this list until/.test(g.hint), 'the hint says how it clears');
});
test('the child is counted once: the total moves by one when the phone goes missing', () => {
  const d = load(), p = pick(d.master); p[C.PARENT_PHONE] = '(937) 555-0142'; const before = run(d).total; clean(p); const after = run(d).total;
  assert.strictEqual(after - before, 1, 'the total went from ' + before + ' to ' + after);
});
test('a child missing a birthdate AND a phone has one Details missing item (birthdate only) and one phone item', () => {
  const d = load(), p = pick(d.master); clean(p); p[C.BDAY] = ''; const r = run(d), id = p[M.X.ID];
  assert(detail(r, id) && /birthdate/.test(detail(r, id).text) && noEmergency(detail(r, id)), (detail(r, id) || {}).text); assert(phoneItem(r, id));
});
test('a parent primary phone of 7 or more digits satisfies it: no check, no note', () => {
  const d = load(), p = pick(d.master); clean(p); p[C.PARENT_PHONE] = '(937) 555-0142'; const r = run(d);
  assert(!detail(r, p[M.X.ID]) || !/emergency/.test(detail(r, p[M.X.ID]).text), 'no emergency check'); assert(!noteFor(r, p[M.X.ID]), 'no note');
});
test('a parent phone that is not a number (N/A, a few digits) does not count', () => {
  for (const v of ['N/A', 'none', '555', '']) { const d = load(), p = pick(d.master); clean(p); p[C.PARENT_PHONE] = v; assert(phoneItem(run(d), p[M.X.ID]), 'still listed for ' + JSON.stringify(v)); }
});
test('a name alone in the Emergency Contact box does not satisfy it', () => {
  const d = load(), p = pick(d.master); clean(p); p[C.EMERG] = 'Pat Example'; assert(phoneItem(run(d), p[M.X.ID]), 'still listed: a name is not a number');
});
test('a name with a phone in the Emergency Contact box satisfies it', () => {
  const d = load(), p = pick(d.master); clean(p); p[C.EMERG] = 'Pat Example - (513) 555-0100'; const r = run(d); assert(!detail(r, p[M.X.ID]) || !/emergency/.test(detail(r, p[M.X.ID]).text), 'no emergency check');
});
test('a club-chosen number satisfies it, and the child is not in the no-phone list', () => {
  const d = load(), p = pick(d.master); clean(p); p[M.X.EMERG_PHONE] = '(513) 555-0111'; const r = run(d);
  assert(!detail(r, p[M.X.ID]) || !/emergency/.test(detail(r, p[M.X.ID]).text), 'no emergency check'); assert(!phoneItem(r, p[M.X.ID]), 'not in the no-phone list');
});
test('another missing detail still shows its check, without the emergency part', () => {
  const d = load(), p = pick(d.master); clean(p); p[C.PARENT_PHONE] = '937-555-0142'; p[C.BDAY] = '';
  const x = detail(run(d), p[M.X.ID]); assert(x && /birthdate/.test(x.text) && !/emergency/.test(x.text), x && x.text);
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
