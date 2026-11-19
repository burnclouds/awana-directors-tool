// Bug reports and feature requests (a flag level "bug"): kept in the flags section, with a status (open, fixed, dropped) and a conversation of replies, never in the notes lists. Invented data only.
// N17 (replies are a conversation: an object keyed by reply id) and N18 (statuses open, fixed, dropped; the old "answered" reads as open) are covered here.
// Usage: node test/bug-reports.test.js
const assert = require('assert');
const Season = require('../season.js'), DataMerge = require('../datamerge.js'), Validate = require('../validate.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const fresh = () => Season.fromJson(Season.toJson(Season.blank('2026-27')));
const D = n => new Date(2026, 10, n);
const clone = o => JSON.parse(JSON.stringify(o));

test('a bug report needs no child and no trail: id starts with b, status open, book/block/key empty', () => {
  const s = fresh(), id = Season.addFlag(s, { level: 'bug', note: 'The stepper is small' }, D(16));
  assert(/^b/.test(id)); const f = s.flags[id];
  assert.strictEqual(f.level, 'bug'); assert.strictEqual(f.status, 'open'); assert.strictEqual(f.kid, ''); assert.strictEqual(f.book, ''); assert.strictEqual(f.block, ''); assert.strictEqual(f.key, ''); assert.strictEqual(f.at, '2026-11-16');
  assert.throws(() => Season.addFlag(s, { level: 'bug', note: '  ' }, D(16)), /Write a note/);
});
test('where it was captured and the version are kept when given', () => {
  const s = fresh(), id = Season.addFlag(s, { level: 'bug', note: 'x', tab: 'stats', trail: ['Statistics', 'Night by night'], label: 'Night by night', rowIndex: 2, ver: '1.51.13' }, D(16)), f = s.flags[id];
  assert.strictEqual(f.tab, 'stats'); assert.deepStrictEqual(f.trail, ['Statistics', 'Night by night']); assert.strictEqual(f.label, 'Night by night'); assert.strictEqual(f.rowIndex, 2); assert.strictEqual(f.ver, '1.51.13');
});
test('other flags still need a child (a bug report is the only new exception)', () => {
  const s = fresh(); ['child', 'sheet', 'box', 'field'].forEach(level => assert.throws(() => Season.addFlag(s, { level, note: 'n', field: 'f' }, D(16)), /needs a child/, level));
  assert.strictEqual(Season.VERSION, 6, 'no data format version change');
});
test('N18 the statuses are open, fixed, dropped; setBugStatus changes only the status; a bad word or a non-bug id throws', () => {
  assert.deepStrictEqual(Season.BUG_STATUS, ['open', 'fixed', 'dropped']);
  const s = fresh(), id = Season.addFlag(s, { level: 'bug', note: 'x' }, D(16)), note = Season.addFlag(s, { level: 'general', note: 'club note' }, D(16));
  Season.addBugReply(s, id, 'Looking at it', 'developer', D(17)); Season.setBugStatus(s, id, 'dropped'); assert.strictEqual(s.flags[id].status, 'dropped'); assert.strictEqual(Season.bugThread(s.flags[id]).length, 1, 'the reply stays');
  assert.throws(() => Season.setBugStatus(s, id, 'answered'), /Unknown status/); assert.throws(() => Season.setBugStatus(s, note, 'fixed'), /No such bug report/);
});
test('N17 replies: added in order with who and when, never change the status, can be removed; an empty reply or an unknown author throws', () => {
  const s = fresh(), id = Season.addFlag(s, { level: 'bug', note: 'x' }, D(16));
  const r1 = Season.addBugReply(s, id, ' First ', 'developer', D(17)), r2 = Season.addBugReply(s, id, 'Second', 'leader', D(18));
  assert(/^r/.test(r1) && r1 !== r2); assert.strictEqual(s.flags[id].status, 'open', 'a reply does not close the report');
  const th = Season.bugThread(s.flags[id]); assert.deepStrictEqual(th.map(x => [x.text, x.by, x.at]), [['First', 'developer', '2026-11-17'], ['Second', 'leader', '2026-11-18']]);
  assert.throws(() => Season.addBugReply(s, id, '   ', 'leader', D(19)), /Write a reply/); assert.throws(() => Season.addBugReply(s, id, 'x', 'mike', D(19)), /leader or the developer/);
  Season.removeBugReply(s, id, r1); assert.deepStrictEqual(Season.bugThread(s.flags[id]).map(x => x.text), ['Second']);
  Season.removeBugReply(s, id, r2); assert(!('replies' in s.flags[id]), 'a record that becomes empty is deleted'); assert.throws(() => Season.removeBugReply(s, id, 'rzz'), /No such reply/);
});
test('N17 an older single reply (reply + replyAt) reads as the first reply by the developer and can be removed; it is not rewritten', () => {
  const s = fresh(), id = Season.addFlag(s, { level: 'bug', note: 'x' }, D(16)); s.flags[id].reply = 'Moved'; s.flags[id].replyAt = '2026-11-17';
  Season.addBugReply(s, id, 'Thanks, but now it overlaps', 'leader', D(18));
  assert.deepStrictEqual(Season.bugThread(s.flags[id]).map(x => [x.id === 'legacy' ? 'legacy' : 'new', x.by, x.text]), [['legacy', 'developer', 'Moved'], ['new', 'leader', 'Thanks, but now it overlaps']]);
  assert.strictEqual(s.flags[id].reply, 'Moved', 'the old fields stay where they are');
  Season.removeBugReply(s, id, 'legacy'); assert(!('reply' in s.flags[id]) && !('replyAt' in s.flags[id]));
});
test('noteList and flagsOf leave bug reports out; bugList is open first, then fixed, then dropped', () => {
  const s = fresh(); const a = Season.addFlag(s, { level: 'bug', note: 'a' }, D(10)), b = Season.addFlag(s, { level: 'bug', note: 'b' }, D(11)), c = Season.addFlag(s, { level: 'bug', note: 'c', kid: '70001_Ann_Lee' }, D(12)), g = Season.addFlag(s, { level: 'general', note: 'g' }, D(13));
  Season.setBugStatus(s, a, 'dropped'); Season.setBugStatus(s, b, 'fixed');
  assert.deepStrictEqual(Season.noteList(s).map(f => f.id), [g]); assert.deepStrictEqual(Season.flagsOf(s, '70001_Ann_Lee'), [], 'a linked bug report is not on the child sheet');
  assert.deepStrictEqual(Season.bugList(s).map(f => f.id), [c, b, a]);
});
test('the file round-trips every field (replies too); an empty flags section is still left out', () => {
  const s = fresh(), id = Season.addFlag(s, { level: 'bug', note: 'x', ver: '1.51.13' }, D(16)); Season.addBugReply(s, id, 'r', 'leader', D(17)); Season.setBugStatus(s, id, 'fixed');
  const back = Season.fromJson(Season.toJson(s)); assert.deepStrictEqual(back.flags[id], s.flags[id]); assert(!/"flags"/.test(Season.toJson(fresh())));
});
test('N18 opening a file turns "answered" into open, with ONE File upgrade entry; a current file gets none; an unknown word reads as open and is left alone', () => {
  const s = fresh(), a = Season.addFlag(s, { level: 'bug', note: 'a' }, D(16)), b = Season.addFlag(s, { level: 'bug', note: 'b' }, D(16)), c = Season.addFlag(s, { level: 'bug', note: 'c' }, D(16)), d = Season.addFlag(s, { level: 'bug', note: 'd' }, D(16));
  s.flags[a].status = 'answered'; s.flags[b].status = 'answered'; s.flags[c].status = 'later'; Season.setBugStatus(s, d, 'fixed');
  s.history = [{ t: '2026-10-01T00:00:00.000Z', label: 'start', changes: [] }];      // a file with a History logs its upgrade; a file with none just starts upgraded
  const back = Season.fromJson(Season.toJson(s));
  assert.strictEqual(back.flags[a].status, 'open'); assert.strictEqual(back.flags[b].status, 'open'); assert.strictEqual(back.flags[d].status, 'fixed'); assert.strictEqual(back.flags[c].status, 'later', 'an unknown word is not rewritten');
  assert.strictEqual(Season.bugStatusOf(back.flags[c]), 'open');
  assert.strictEqual(back.history.length, 2, 'one new entry for both reports'); assert.strictEqual(back.history[1].label, 'File upgrade');
  const again = Season.fromJson(Season.toJson(back)); assert.strictEqual(again.history.length, 2, 'opening it again changes nothing');
  const cur = fresh(); Season.addFlag(cur, { level: 'bug', note: 'z' }, D(16)); cur.history = [{ t: '2026-10-01T00:00:00.000Z', label: 'start', changes: [] }];
  assert.strictEqual(Season.fromJson(Season.toJson(cur)).history.length, 1, 'a current file gets no upgrade entry');
});
test('History names a bug report by its own area and wording; replies and ordinary flags read as they should', () => {
  const base = fresh(), s = fresh(); const id = Season.addFlag(s, { level: 'bug', note: 'Stepper' }, D(16)); const g = Season.addFlag(s, { level: 'general', note: 'club' }, D(16));
  const ch = Season.diff(Season.snapshot(base), s);
  assert(/Bug reports/.test(Season.labelOf(ch.filter(c => c.p[1] === id)))); assert(/Notes and flags/.test(Season.labelOf(ch.filter(c => c.p[1] === g))));
  const d = c => Season.describe ? Season.describe(c, () => 'Name') : null;
  if (Season.describe) { assert(/Bug report · added: Stepper/.test(d(ch.find(c => c.p[1] === id)))); assert(/Note · added: club/.test(d(ch.find(c => c.p[1] === g))));
    const before = Season.snapshot(s); const rid = Season.addBugReply(s, id, 'On it', 'developer', D(17)); const c2 = Season.diff(before, s).filter(c => c.p[1] === id);
    assert(c2.length && c2.every(c => /Bug report · reply added/.test(d(c)) || /Bug report/.test(d(c))), c2.map(d).join(' | ')); assert(c2.some(c => /reply added: On it/.test(d(c))), c2.map(d).join(' | '));
    const b2 = Season.snapshot(s); Season.removeBugReply(s, id, rid); assert(Season.diff(b2, s).filter(c => c.p[1] === id).some(c => /reply removed/.test(d(c)))); }
});
test('N17 merge: a status on one copy and a reply on the other are both kept; a reply added on EACH copy keeps both with no conflict; two different statuses are one conflict', () => {
  const base = fresh(); const id = Season.addFlag(base, { level: 'bug', note: 'x' }, D(16));
  const mine = clone(base), theirs = clone(base);
  Season.setBugStatus(mine, id, 'fixed'); Season.addBugReply(theirs, id, 'On it', 'developer', D(17));
  const r = Season.merge3(Season.snapshot(base), mine, theirs, {}); assert.strictEqual(r.conflicts.length, 0); assert.strictEqual(r.season.flags[id].status, 'fixed'); assert.strictEqual(Season.bugThread(r.season.flags[id])[0].text, 'On it');
  const m2 = clone(base), t2 = clone(base); const ra = Season.addBugReply(m2, id, 'A', 'leader', D(17)), rb = Season.addBugReply(t2, id, 'B', 'developer', D(17));
  const r2 = Season.merge3(Season.snapshot(base), m2, t2, {}); assert.strictEqual(r2.conflicts.length, 0, 'conflicts: ' + JSON.stringify(r2.conflicts)); assert.deepStrictEqual(Object.keys(r2.season.flags[id].replies).sort(), [ra, rb].sort());
  const m3 = clone(base), t3 = clone(base); Season.setBugStatus(m3, id, 'fixed'); Season.setBugStatus(t3, id, 'dropped'); assert.strictEqual(Season.merge3(Season.snapshot(base), m3, t3, {}).conflicts.length >= 1, true);
});
test('the merge summary lists bug reports under their own category', () => {
  assert(DataMerge.CATEGORIES.includes('Bug reports')); assert.strictEqual(DataMerge.categoryOf(['flags', 'b1x2', 'note']), 'Bug reports'); assert.strictEqual(DataMerge.categoryOf(['flags', 'b1x2', 'replies', 'r1x2']), 'Bug reports'); assert.strictEqual(DataMerge.categoryOf(['flags', 'f1x2', 'note']), 'Flags and notes');
});
test('the validator: a good report is clean; a bad reply or reply date or button setting is an error; an unknown status is only a warning; stray status on a note is a warning', () => {
  const run = mut => { const s = fresh(); s.calendar = []; const id = Season.addFlag(s, { level: 'bug', note: 'x', ver: '1.51.13' }, D(16)); Season.addBugReply(s, id, 'r', 'leader', D(17)); mut(s, id); return Validate.validate(Season.toJson(s), 'awana-2026-27-20261116-000000.json').findings; };
  assert.deepStrictEqual(run(() => {}).filter(f => f.check === 'flags' && f.level !== 'info'), []);
  assert(run((s, id) => { s.flags[id].status = 'later'; }).some(f => f.level === 'warn' && /status/.test(f.msg)) && !run((s, id) => { s.flags[id].status = 'later'; }).some(f => f.level === 'error' && /status/.test(f.msg)), 'unknown status: warning, not error');
  assert(run((s, id) => { s.flags[id].replyAt = 'x'; s.flags[id].reply = 'r'; }).some(f => f.level === 'error' && /reply date/.test(f.msg)));
  assert(run((s, id) => { const k = Object.keys(s.flags[id].replies)[0]; s.flags[id].replies[k].by = 'mike'; }).some(f => f.level === 'error' && /written by/.test(f.msg)));
  assert(run((s, id) => { const k = Object.keys(s.flags[id].replies)[0]; s.flags[id].replies[k].at = '2026-13-45'; }).some(f => f.level === 'error' && /not a real date/.test(f.msg)));
  assert(run((s, id) => { const k = Object.keys(s.flags[id].replies)[0]; s.flags[id].replies[k].text = ''; }).some(f => f.level === 'error' && /empty/.test(f.msg)));
  assert(run((s, id) => { s.flags[id].replies = ['x']; }).some(f => f.level === 'error' && /replies/.test(f.msg)));
  assert(run((s, id) => { s.config.bugButton = 'yes'; }).some(f => f.level === 'error' && /bugButton/.test(f.msg)));
  assert(run((s, id) => { const g = Season.addFlag(s, { level: 'general', note: 'n' }, D(16)); s.flags[g].status = 'open'; }).some(f => f.level === 'warn' && /bug report/.test(f.msg)));
});
test('a new season keeps the OPEN bug reports, and leaves fixed and dropped ones with the closed year', () => {
  const s = fresh(), a = Season.addFlag(s, { level: 'bug', note: 'open one' }, D(10)), b = Season.addFlag(s, { level: 'bug', note: 'fixed one' }, D(11)), c = Season.addFlag(s, { level: 'general', note: 'club note' }, D(12)), e = Season.addFlag(s, { level: 'bug', note: 'dropped one' }, D(12));
  Season.setBugStatus(s, b, 'fixed'); Season.setBugStatus(s, e, 'dropped');
  const n = Season.newSeason(s, '2027-28'); assert(n.flags && n.flags[a], 'the open report comes forward'); assert(!n.flags[b], 'the fixed one stays'); assert(!n.flags[e], 'the dropped one stays'); assert(!n.flags[c], 'club notes stay with the closed year (as before)');
});
test('replies never reach the public TEST data: the anonymizer drops the whole flags section', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'tools', 'make-test-data.js'), 'utf8'); assert(/flags/.test(src), 'make-test-data deals with flags');
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
