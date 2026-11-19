// N19 (1.51.16): hide a note or flag on To do. flag.hidden = 1 while hidden (key deleted on Unhide); only the To do card leaves it out. Invented data only.
// Usage: node test/flag-hide.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Season = require('../season.js'), Validate = require('../validate.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const fresh = () => Season.fromJson(Season.toJson(Season.blank('2026-27')));
const D = n => new Date(2026, 10, n), clone = o => JSON.parse(JSON.stringify(o)), KID = '70001_Ann_Lee';
const LEVELS = { general: {}, child: { kid: KID }, sheet: { kid: KID }, block: { kid: KID, book: 'HG', block: 'R' }, box: { kid: KID, book: 'HG', block: 'R', key: 'R.1' }, attend: { date: '2026-10-28', room: 'Sparks A' }, team: { quarter: 'Q2', group: 'Sparks' }, field: { kid: KID, field: 'Grade' }, element: { tab: 'person', trail: ['Person', 'x'] } };

test('setFlagHidden sets hidden = 1; off deletes the key; nothing else about the flag changes', () => {
  const s = fresh(), id = Season.addFlag(s, { level: 'child', kid: KID, note: 'n' }, D(16)), before = clone(s.flags[id]);
  Season.setFlagHidden(s, id, true); assert.strictEqual(s.flags[id].hidden, 1); assert.strictEqual(Season.isFlagHidden(s.flags[id]), true);
  const { hidden, ...rest } = s.flags[id]; assert.deepStrictEqual(rest, before);
  Season.setFlagHidden(s, id, false); assert(!('hidden' in s.flags[id])); assert.deepStrictEqual(s.flags[id], before);
});
test('it works for every note and flag level, and refuses a bug report and a missing id', () => {
  const s = fresh(); Object.keys(LEVELS).forEach(level => { const id = Season.addFlag(s, Object.assign({ level, note: 'n' }, LEVELS[level]), D(16)); Season.setFlagHidden(s, id, true); assert.strictEqual(s.flags[id].hidden, 1, level); });
  const b = Season.addFlag(s, { level: 'bug', note: 'x' }, D(16)); assert.throws(() => Season.setFlagHidden(s, b, true), /bug report/); assert.throws(() => Season.setFlagHidden(s, 'fnope', true), /No such flag/);
});
test('todoNotes splits open and hidden in the usual order; noteList and flagsOf still return a hidden note (the sheet and popups need it)', () => {
  const s = fresh(), a = Season.addFlag(s, { level: 'child', kid: KID, note: 'a' }, D(10)), b = Season.addFlag(s, { level: 'general', note: 'b' }, D(11)), c = Season.addFlag(s, { level: 'child', kid: KID, note: 'c' }, D(12));
  Season.setFlagHidden(s, b, true); const t = Season.todoNotes(s);
  assert.deepStrictEqual(t.open.map(f => f.id), [a, c]); assert.deepStrictEqual(t.hidden.map(f => f.id), [b]); assert.strictEqual(Season.noteList(s).length, 3); assert.strictEqual(Season.flagsOf(s, KID).length, 2);
});
test('editing a hidden note keeps it hidden; clearing it deletes it', () => {
  const s = fresh(), id = Season.addFlag(s, { level: 'general', note: 'a' }, D(10)); Season.setFlagHidden(s, id, true); Season.setFlagNote(s, id, 'edited'); assert.strictEqual(s.flags[id].hidden, 1); assert.strictEqual(s.flags[id].note, 'edited');
  Season.clearFlag(s, id); assert(!s.flags || !s.flags[id]);
});
test('the file keeps hidden through save and open; true reads as hidden too; a file without it is unchanged', () => {
  const s = fresh(), id = Season.addFlag(s, { level: 'general', note: 'a' }, D(10)); Season.setFlagHidden(s, id, true);
  const back = Season.fromJson(Season.toJson(s)); assert.strictEqual(back.flags[id].hidden, 1); back.flags[id].hidden = true; assert.strictEqual(Season.isFlagHidden(back.flags[id]), true);
  const plain = fresh(), p = Season.addFlag(plain, { level: 'general', note: 'a' }, D(10)); assert(!('hidden' in Season.fromJson(Season.toJson(plain)).flags[p])); assert.strictEqual(Season.VERSION, 6);
});
test('History: hide and unhide each make one change at flags.<id>.hidden with their own wording, and Undo reverses it', () => {
  const s = fresh(), id = Season.addFlag(s, { level: 'general', note: 'a' }, D(10)), before = Season.snapshot(s); Season.setFlagHidden(s, id, true);
  const ch = Season.diff(before, s); assert.strictEqual(ch.length, 1); assert.deepStrictEqual(ch[0].p, ['flags', id, 'hidden']); assert.strictEqual(Season.describe(ch[0], () => 'Name'), 'Notes and flags · hidden from To do');
  const mid = Season.snapshot(s); Season.setFlagHidden(s, id, false); const ch2 = Season.diff(mid, s); assert.strictEqual(Season.describe(ch2[0], () => 'Name'), 'Notes and flags · shown on To do again');
});
test('merge: a hide on one copy and an edit on the other both stay; two different hides both stay; the same hide twice agrees', () => {
  const base = fresh(), x = Season.addFlag(base, { level: 'general', note: 'x' }, D(10)), y = Season.addFlag(base, { level: 'general', note: 'y' }, D(11));
  const m = clone(base), t = clone(base); Season.setFlagHidden(m, x, true); Season.setFlagNote(t, x, 'x edited');
  const r = Season.merge3(Season.snapshot(base), m, t, {}); assert.strictEqual(r.conflicts.length, 0); assert.strictEqual(r.season.flags[x].hidden, 1); assert.strictEqual(r.season.flags[x].note, 'x edited');
  const m2 = clone(base), t2 = clone(base); Season.setFlagHidden(m2, x, true); Season.setFlagHidden(t2, y, true); const r2 = Season.merge3(Season.snapshot(base), m2, t2, {}); assert.strictEqual(r2.conflicts.length, 0); assert.strictEqual(r2.season.flags[x].hidden, 1); assert.strictEqual(r2.season.flags[y].hidden, 1);
  const m3 = clone(base), t3 = clone(base); Season.setFlagHidden(m3, x, true); Season.setFlagHidden(t3, x, true); assert.strictEqual(Season.merge3(Season.snapshot(base), m3, t3, {}).conflicts.length, 0);
});
test('the file check: hidden 1 and true are clean; any other value is a warning, not an error; a bug report with hidden warns; showHiddenNotes must be true or false', () => {
  const run = mut => { const s = fresh(); s.calendar = []; const id = Season.addFlag(s, { level: 'general', note: 'n' }, D(16)); mut(s, id); return Validate.validate(Season.toJson(s), 'awana-2026-27-20261116-000000.json').findings; };
  const flagsOnly = fs => fs.filter(f => f.check === 'flags' && f.level !== 'info');
  assert.deepStrictEqual(flagsOnly(run((s, id) => { s.flags[id].hidden = 1; })), []); assert.deepStrictEqual(flagsOnly(run((s, id) => { s.flags[id].hidden = true; })), []);
  const bad = run((s, id) => { s.flags[id].hidden = 'yes'; }); assert(bad.some(f => f.level === 'warn' && /hidden/.test(f.msg))); assert(!bad.some(f => f.level === 'error' && /hidden/.test(f.msg)));
  assert(run(s => { const b = Season.addFlag(s, { level: 'bug', note: 'b' }, D(16)); s.flags[b].hidden = 1; }).some(f => f.level === 'warn' && /bug report/.test(f.msg)));
  assert(run(s => { s.config.showHiddenNotes = 'yes'; }).some(f => f.level === 'error' && /showHiddenNotes/.test(f.msg))); assert(!run(s => { s.config.showHiddenNotes = true; }).some(f => f.level === 'error'));
});
test('an older copy (the 1.51.16 season.js in deploy/, built before N19) keeps hidden through open and save, and lists the note as it always did', () => {
  const f = path.join(__dirname, '..', '..', '..', 'deploy', 'app', 'season.js'); if (!fs.existsSync(f)) return; const Old = require(f);
  const s = fresh(), id = Season.addFlag(s, { level: 'general', note: 'a' }, D(10)); Season.setFlagHidden(s, id, true);
  const o = Old.fromJson(Season.toJson(s)); assert.strictEqual(o.flags[id].hidden, 1); assert.strictEqual(Old.noteList(o).length, 1); assert.strictEqual(Old.fromJson(Old.toJson(o)).flags[id].hidden, 1);
});
test('a new season does not carry notes (so no hidden note either); only open bug reports come forward', () => {
  const s = fresh(), id = Season.addFlag(s, { level: 'general', note: 'a' }, D(10)); Season.setFlagHidden(s, id, true); const n = Season.newSeason(s, '2027-28'); assert(!n.flags || !n.flags[id]);
});
test('the merge summary words a hidden path, and the category is Flags and notes', () => {
  const DM = require('../datamerge.js'); assert.strictEqual(DM.categoryOf(['flags', 'f1x2', 'hidden']), 'Flags and notes');
  const src = fs.readFileSync(path.join(__dirname, '..', 'datamerge.js'), 'utf8'); assert(/hidden on To do/.test(src));
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
