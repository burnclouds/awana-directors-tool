// Notes and flags: a note pinned to a child, one book's sheet, one section block or one box, kept until it is cleared. Invented ids only.
// Usage: node test/flags.test.js
const assert = require('assert');
const S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const NOW = new Date('2026-11-05T12:00:00');

test('a flag pins a note to a child, a book sheet, a block or one box, and is listed per child', () => {
  const s = S.blank('2026-27');
  const a = S.addFlag(s, { kid: 'k1', level: 'sheet', book: 'HG', note: 'look at the whole sheet' }, NOW);
  const b = S.addFlag(s, { kid: 'k2', level: 'box', book: 'HG', block: 'GJ1', key: 'GJ1.2', note: 'check this sign-off' }, NOW);
  assert.deepStrictEqual(S.flagsOf(s, 'k1').map(f => f.id), [a]); assert.strictEqual(s.flags[b].key, 'GJ1.2'); assert.strictEqual(s.flags[b].at, '2026-11-05');
  assert.deepStrictEqual(S.flagsAt(s, 'k2', 'HG', 'GJ1.2').map(f => f.id), [b]); assert.deepStrictEqual(S.flagsAt(s, 'k2', 'HG', 'GJ1.3'), []);
});
test('a note is required and a bad level is refused', () => {
  const s = S.blank('2026-27');
  assert.throws(() => S.addFlag(s, { kid: 'k1', level: 'sheet', book: 'HG', note: '   ' }, NOW), /note/i); assert.throws(() => S.addFlag(s, { kid: 'k1', level: 'galaxy', note: 'x' }, NOW), /level/i);
  assert.throws(() => S.addFlag(s, { level: 'child', note: 'x' }, NOW), /child/i); assert.deepStrictEqual(s.flags, {});
});
test('clearing a flag removes it; the note can be edited', () => {
  const s = S.blank('2026-27'), a = S.addFlag(s, { kid: 'k1', level: 'child', note: 'one' }, NOW);
  S.setFlagNote(s, a, 'two'); assert.strictEqual(s.flags[a].note, 'two'); S.clearFlag(s, a); assert.deepStrictEqual(s.flags, {});
});
test('flags are left out of the file while empty and round-trip when not; an older file opens with none', () => {
  const s = S.blank('2026-27'); assert(!('flags' in JSON.parse(S.toJson(s))));
  const a = S.addFlag(s, { kid: 'k1', level: 'box', book: 'HG', block: 'RJ1', key: 'RJ1.1', note: 'n' }, NOW); assert.deepStrictEqual(S.fromJson(S.toJson(s)).flags[a], s.flags[a]);
  const o = JSON.parse(S.toJson(S.blank('2026-27'))); delete o.flags; assert.deepStrictEqual(S.fromJson(JSON.stringify(o)).flags, {});
});
test('adding and clearing are History lines in words, and Undo takes them back', () => {
  const s = S.blank('2026-27'), before = S.snapshot(s); const a = S.addFlag(s, { kid: 'k1', level: 'child', note: 'check the roster' }, NOW);
  const ch = S.diff(before, S.snapshot(s)); assert(ch.some(c => c.p[0] === 'flags')); assert(/flag/i.test(S.describe(ch.find(c => c.p[0] === 'flags'), id => id)), S.describe(ch[0], id => id));
  S.applyChanges(s, ch, true); assert.deepStrictEqual(s.flags, {}); void a;
});
test('two people adding different flags merge without a clash', () => {
  const base = S.blank('2026-27'), ours = JSON.parse(JSON.stringify(base)), theirs = JSON.parse(JSON.stringify(base));
  S.addFlag(ours, { kid: 'k1', level: 'child', note: 'a' }, NOW); S.addFlag(theirs, { kid: 'k1', level: 'child', note: 'b' }, new Date('2026-11-05T12:00:01'));
  const m = S.merge3(S.snapshot(base), ours, theirs); assert.deepStrictEqual(m.conflicts, []); assert.strictEqual(Object.keys(m.season.flags).length, 2);
});
test('a general note needs no child, is listed with the others, and is cleared the same way', () => {
  const s = S.blank('2026-27'), g = S.addFlag(s, { level: 'general', note: ' ask the leaders about Rank ' }, NOW);
  assert.strictEqual(s.flags[g].kid, ''); assert.strictEqual(s.flags[g].note, 'ask the leaders about Rank'); assert.deepStrictEqual(S.flagList(s).map(f => f.id), [g]); assert.deepStrictEqual(S.flagsOf(s, 'k1'), []);
  assert.throws(() => S.addFlag(s, { level: 'general', note: '  ' }, NOW), /note/i); assert.throws(() => S.addFlag(s, { level: 'sheet', note: 'x' }, NOW), /child/i, 'every other kind still needs a child');
  const before = S.snapshot(s); S.clearFlag(s, g); assert(/Note/.test(S.describe(S.diff(before, S.snapshot(s))[0], id => id)), 'History says it was a note'); assert.deepStrictEqual(s.flags, {});
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
