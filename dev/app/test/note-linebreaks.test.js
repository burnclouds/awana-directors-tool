// N45: notes, flags and bug reports keep their line breaks. CRLF and a lone CR are saved as LF; the text is otherwise as typed. Invented text only.
// Usage: node test/note-linebreaks.test.js
const assert = require('assert'), S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const TEXT = 'first line\r\nsecond line\rthird line\nfourth';
const LF = 'first line\nsecond line\nthird line\nfourth';
test('a flag note keeps its line breaks and is saved with LF endings', () => {
  const s = S.blank('2026-27'); const id = S.addFlag(s, { kid: 'k1', level: 'child', note: TEXT }, new Date());
  assert.strictEqual(s.flags[id].note, LF);
});
test('an edited flag note keeps its line breaks', () => {
  const s = S.blank('2026-27'); const id = S.addFlag(s, { kid: 'k1', level: 'child', note: 'one' }, new Date());
  S.setFlagNote(s, id, TEXT); assert.strictEqual(s.flags[id].note, LF);
});
test('a bug reply keeps its line breaks', () => {
  const s = S.blank('2026-27'); const id = S.addFlag(s, { kid: 'k1', level: 'bug', note: 'report' }, new Date());
  const rid = S.addBugReply(s, id, TEXT, 'leader', new Date());
  assert.strictEqual(s.flags[id].replies[rid].text, LF);
});
test('text with no line breaks is unchanged, and surrounding space is still trimmed', () => {
  const s = S.blank('2026-27'); const id = S.addFlag(s, { kid: 'k1', level: 'child', note: '  just one line  ' }, new Date());
  assert.strictEqual(s.flags[id].note, 'just one line');
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
