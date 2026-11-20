// N44: a reply can go on any note (not only a bug report); a flag on a filter keeps the filter's id and value so Go can set it back. Invented text only.
// Usage: node test/note-replies.test.js
const assert = require('assert'), S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
test('a reply can be added to a general note, and is kept with its text and author', () => {
  const s = S.blank('2026-27'); const id = S.addFlag(s, { kid: '', level: 'general', note: 'ask about the rank' }, new Date());
  const rid = S.addFlagReply(s, id, 'done on Tuesday', 'developer', new Date());
  assert.deepStrictEqual(Object.keys(s.flags[id].replies), [rid]); assert.strictEqual(s.flags[id].replies[rid].by, 'developer'); assert.strictEqual(s.flags[id].replies[rid].text, 'done on Tuesday');
});
test('two replies on one note both survive (keyed by reply id)', () => {
  const s = S.blank('2026-27'); const id = S.addFlag(s, { kid: '', level: 'general', note: 'x' }, new Date());
  S.addFlagReply(s, id, 'one', 'leader', new Date(2026, 10, 19, 9, 0)); S.addFlagReply(s, id, 'two', 'leader', new Date(2026, 10, 19, 9, 1));
  assert.strictEqual(Object.keys(s.flags[id].replies).length, 2);
});
test('an empty reply and an unknown note are refused', () => {
  const s = S.blank('2026-27'); const id = S.addFlag(s, { kid: '', level: 'general', note: 'x' }, new Date());
  assert.throws(() => S.addFlagReply(s, id, '   ', 'leader'), /Write a reply/); assert.throws(() => S.addFlagReply(s, 'nope', 'hi', 'leader'), /No such note/);
});
test('a flag made on a filter keeps the filter id and value', () => {
  const s = S.blank('2026-27'); const id = S.addFlag(s, { kid: '', level: 'element', note: 'wrong night', tab: 'attend', trail: ['Attendance', 'Night'], filter: { id: 'attNight', value: '2026-11-11' } }, new Date());
  assert.deepStrictEqual(s.flags[id].filter, { id: 'attNight', value: '2026-11-11' });
});
test('a flag made on something other than a filter has no filter field', () => {
  const s = S.blank('2026-27'); const id = S.addFlag(s, { kid: '', level: 'general', note: 'x' }, new Date());
  assert.strictEqual(s.flags[id].filter, undefined);
});
// Review finding: History said "reply added: text" only for bug reports; a reply on an ordinary note was a generic change.
test('History names a reply on an ordinary note', () => {
  const s = S.blank('2026-27'), id = S.addFlag(s, { kid: '', level: 'general', note: 'ask about the rank' }, new Date()), before = S.snapshot(s);
  S.addFlagReply(s, id, 'done on Tuesday', 'leader', new Date()); const ch = S.diff(before, s).find(c => c.p[2] === 'replies'), label = ch ? S.describe(ch, x => x) : '(no change under replies)';
  assert(/reply added/.test(label) && /done on Tuesday/.test(label), 'label: ' + label);
});
// N49: a note and its replies are separate messages: each reply can be edited or removed on its own, and a note that already holds its reply's text is listed.
test('one reply can be edited on its own: its text changes, the note and the other reply do not', () => {
  const s = S.blank('2026-27'), id = S.addFlag(s, { kid: '', level: 'general', note: 'ask about the rank' }, new Date()), r1 = S.addFlagReply(s, id, 'first', 'leader', new Date(2026, 10, 19, 9, 0)), r2 = S.addFlagReply(s, id, 'second', 'leader', new Date(2026, 10, 19, 9, 1));
  S.setFlagReply(s, id, r1, 'first, changed\r\nnext line'); assert.strictEqual(s.flags[id].replies[r1].text, 'first, changed\nnext line'); assert.strictEqual(s.flags[id].replies[r2].text, 'second'); assert.strictEqual(s.flags[id].note, 'ask about the rank'); assert.strictEqual(s.flags[id].replies[r1].by, 'leader');
  assert.throws(() => S.setFlagReply(s, id, r1, '   '), /Write a reply/); assert.throws(() => S.setFlagReply(s, id, 'nope', 'x'), /No such reply/); assert.throws(() => S.setFlagReply(s, 'nope', r1, 'x'), /No such note/);
});
test('one reply can be removed on its own; removing the last one leaves no replies key; History says so', () => {
  const s = S.blank('2026-27'), id = S.addFlag(s, { kid: '', level: 'general', note: 'n' }, new Date()), r1 = S.addFlagReply(s, id, 'first', 'leader', new Date(2026, 10, 19, 9, 0)), r2 = S.addFlagReply(s, id, 'second', 'leader', new Date(2026, 10, 19, 9, 1));
  const before = S.snapshot(s); S.removeFlagReply(s, id, r1); assert.deepStrictEqual(Object.keys(s.flags[id].replies), [r2]); const ch = S.diff(before, s).find(c => c.p[2] === 'replies'); assert(/reply removed/.test(S.describe(ch, x => x)), S.describe(ch, x => x));
  S.removeFlagReply(s, id, r2); assert(!('replies' in s.flags[id]), 'a record that becomes empty is deleted'); assert.throws(() => S.removeFlagReply(s, id, r2), /No such reply/);
});
test('Debug lists a note that already holds the text of its reply (the old Edit copied replies into the note); it never changes it', () => {
  const s = S.blank('2026-27'), id = S.addFlag(s, { kid: '', level: 'general', note: 'ask about the rank' }, new Date()); S.addFlagReply(s, id, 'done on Tuesday', 'leader', new Date());
  assert.deepStrictEqual(S.oddballs(s, () => '').filter(r => r.check === 'note-with-reply-text'), [], 'a clean note is not listed');
  s.flags[id].note = 'ask about the rankdone on TuesdayLeader, 2026-11-19'; s.flags[id].note = s.flags[id].note.replace('on Tuesday', 'on Tuesday');      // the damaged form: the reply text is inside the note
  const before = JSON.stringify(s), rows = S.oddballs(s, () => '').filter(r => r.check === 'note-with-reply-text'); assert.strictEqual(rows.length, 1, JSON.stringify(rows)); assert.strictEqual(rows[0].fix, '', 'listed only: a person decides'); assert.strictEqual(JSON.stringify(s), before);
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
