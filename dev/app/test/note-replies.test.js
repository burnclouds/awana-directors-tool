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
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
