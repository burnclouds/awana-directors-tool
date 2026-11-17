// Bug reports and feature requests (a flag level "bug"): kept in the flags section, with a status and a reply, never in the notes lists. Invented data only.
// Usage: node test/bug-reports.test.js
const assert = require('assert');
const Season = require('../season.js'), DataMerge = require('../datamerge.js'), Validate = require('../validate.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const fresh = () => Season.fromJson(Season.toJson(Season.blank('2026-27')));
const D = n => new Date(2026, 10, n);

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
test('setBugReply: status and reply; an empty reply removes both; a status change keeps the reply date; a bad status or a non-bug id throws', () => {
  const s = fresh(), id = Season.addFlag(s, { level: 'bug', note: 'x' }, D(16)), note = Season.addFlag(s, { level: 'general', note: 'club note' }, D(16));
  Season.setBugReply(s, id, { status: 'answered', reply: 'Looking at it' }, D(17)); assert.strictEqual(s.flags[id].status, 'answered'); assert.strictEqual(s.flags[id].reply, 'Looking at it'); assert.strictEqual(s.flags[id].replyAt, '2026-11-17');
  Season.setBugReply(s, id, { status: 'fixed' }, D(20)); assert.strictEqual(s.flags[id].status, 'fixed'); assert.strictEqual(s.flags[id].replyAt, '2026-11-17', 'a status change keeps the reply date');
  Season.setBugReply(s, id, { reply: '' }, D(21)); assert(!('reply' in s.flags[id]) && !('replyAt' in s.flags[id]), 'an empty reply removes both');
  assert.throws(() => Season.setBugReply(s, id, { status: 'closed' }), /Unknown status/); assert.throws(() => Season.setBugReply(s, note, { status: 'fixed' }), /No such bug report/);
});
test('noteList and flagsOf leave bug reports out; bugList is open first, then answered, then fixed', () => {
  const s = fresh(); const a = Season.addFlag(s, { level: 'bug', note: 'a' }, D(10)), b = Season.addFlag(s, { level: 'bug', note: 'b' }, D(11)), c = Season.addFlag(s, { level: 'bug', note: 'c', kid: '70001_Ann_Lee' }, D(12)), g = Season.addFlag(s, { level: 'general', note: 'g' }, D(13));
  Season.setBugReply(s, a, { status: 'fixed' }, D(14)); Season.setBugReply(s, b, { status: 'answered', reply: 'ok' }, D(14));
  assert.deepStrictEqual(Season.noteList(s).map(f => f.id), [g]); assert.deepStrictEqual(Season.flagsOf(s, '70001_Ann_Lee'), [], 'a linked bug report is not on the child sheet');
  assert.deepStrictEqual(Season.bugList(s).map(f => f.id), [c, b, a]);
});
test('the file round-trips every field; an empty flags section is still left out', () => {
  const s = fresh(), id = Season.addFlag(s, { level: 'bug', note: 'x', ver: '1.51.13' }, D(16)); Season.setBugReply(s, id, { status: 'answered', reply: 'r' }, D(17));
  const back = Season.fromJson(Season.toJson(s)); assert.deepStrictEqual(back.flags[id], s.flags[id]); assert(!/"flags"/.test(Season.toJson(fresh())));
});
test('History names a bug report by its own area and wording; ordinary flags read as before', () => {
  const base = fresh(), s = fresh(); const id = Season.addFlag(s, { level: 'bug', note: 'Stepper' }, D(16)); const g = Season.addFlag(s, { level: 'general', note: 'club' }, D(16));
  const ch = Season.diff(Season.snapshot(base), s);
  assert(/Bug reports/.test(Season.labelOf(ch.filter(c => c.p[1] === id)))); assert(/Notes and flags/.test(Season.labelOf(ch.filter(c => c.p[1] === g))));
  const d = c => Season.describe ? Season.describe(c, () => 'Name') : null;
  if (Season.describe) { assert(/Bug report · added: Stepper/.test(d(ch.find(c => c.p[1] === id)))); assert(/Note · added: club/.test(d(ch.find(c => c.p[1] === g)))); }
});
test('merge: a status set on one copy and a reply on the other are both kept; two different replies are one conflict', () => {
  const base = fresh(); const id = Season.addFlag(base, { level: 'bug', note: 'x' }, D(16));
  const mine = JSON.parse(JSON.stringify(base)), theirs = JSON.parse(JSON.stringify(base));
  Season.setBugReply(mine, id, { status: 'answered' }, D(17)); Season.setBugReply(theirs, id, { reply: 'On it' }, D(17));
  const r = Season.merge3(Season.snapshot(base), mine, theirs, {}); assert.strictEqual(r.conflicts.length, 0); assert.strictEqual(r.season.flags[id].status, 'answered'); assert.strictEqual(r.season.flags[id].reply, 'On it');
  const m2 = JSON.parse(JSON.stringify(base)), t2 = JSON.parse(JSON.stringify(base)); Season.setBugReply(m2, id, { reply: 'A' }, D(17)); Season.setBugReply(t2, id, { reply: 'B' }, D(17));
  assert.strictEqual(Season.merge3(Season.snapshot(base), m2, t2, {}).conflicts.length >= 1, true);
});
test('the merge summary lists bug reports under their own category', () => {
  assert(DataMerge.CATEGORIES.includes('Bug reports')); assert.strictEqual(DataMerge.categoryOf(['flags', 'b1x2', 'note']), 'Bug reports'); assert.strictEqual(DataMerge.categoryOf(['flags', 'f1x2', 'note']), 'Flags and notes');
});
test('the validator: a good report is clean; a bad status, reply date or button setting is an error; stray status on a note is a warning', () => {
  const run = mut => { const s = fresh(); s.calendar = []; const id = Season.addFlag(s, { level: 'bug', note: 'x', ver: '1.51.13' }, D(16)); Season.setBugReply(s, id, { status: 'answered', reply: 'r' }, D(17)); mut(s, id); return Validate.validate(Season.toJson(s), 'awana-2026-27-20261116-000000.json').findings; };
  const errs = fs => fs.filter(f => f.level === 'error' && /^(flags|config)$/.test(f.check || 'flags'));
  assert.deepStrictEqual(run(() => {}).filter(f => f.check === 'flags' && f.level !== 'info'), []);
  assert(run((s, id) => { s.flags[id].status = 'closed'; }).some(f => f.level === 'error' && /status/.test(f.msg)));
  assert(run((s, id) => { s.flags[id].replyAt = 'x'; }).some(f => f.level === 'error' && /reply date/.test(f.msg)));
  assert(run((s, id) => { s.config.bugButton = 'yes'; }).some(f => f.level === 'error' && /bugButton/.test(f.msg)));
  assert(run((s, id) => { const g = Season.addFlag(s, { level: 'general', note: 'n' }, D(16)); s.flags[g].status = 'open'; }).some(f => f.level === 'warn' && /bug report/.test(f.msg)));
});
test('a new season keeps the bug reports that are not fixed, and leaves fixed ones with the closed year', () => {
  const s = fresh(), a = Season.addFlag(s, { level: 'bug', note: 'open one' }, D(10)), b = Season.addFlag(s, { level: 'bug', note: 'fixed one' }, D(11)), c = Season.addFlag(s, { level: 'general', note: 'club note' }, D(12));
  Season.setBugReply(s, b, { status: 'fixed' }, D(13));
  const n = Season.newSeason(s, '2027-28'); assert(n.flags && n.flags[a], 'the open report comes forward'); assert(!n.flags[b], 'the fixed one stays'); assert(!n.flags[c], 'club notes stay with the closed year (as before)');
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
