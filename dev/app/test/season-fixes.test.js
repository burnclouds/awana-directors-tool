// A child who changes group mid-season keeps the game points earned in the old group; handbook text is read back the way it was typed.
// Usage: node test/season-fixes.test.js
const assert = require('assert'), S = require('../season.js'), V = require('../validate.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const night = (Date, Quarter) => ({ Date, Type: 'Club night', Quarter, 'No Club': '' });
const cal = ['2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30'].map(d => night(d, 'Q1'));
const red = () => 'Red', pts = (s, group) => { const y = S.kidGamePoints(s, 'k1', group, red, cal).year; return [y.place, y.spirit]; };

// ---------- B5: game points follow the group the child was in that night ----------
function season() {
  const s = S.blank('2026-27');
  ['2026-09-09', '2026-09-16'].forEach(d => { S.setGame(s, d, 'Sparks', 'Red', { place: 1, spirit: 3 }); S.setGame(s, d, 'T&T', 'Red', { place: 4, spirit: 0 }); });
  return s;
}
test('B5: nights ticked while in Sparks keep their Sparks game points after the child moves to T&T', () => {
  const s = season();
  S.setMark(s, '2026-09-09', 'k1', 'a', 1, 'Sparks'); S.setMark(s, '2026-09-16', 'k1', 'a', 1, 'Sparks');
  const before = pts(s, 'Sparks');
  assert.deepStrictEqual(pts(s, 'T&T'), before);                                  // asked as a T&T child: the stamped nights still use Sparks results
  assert(before[0] > 0 && before[1] > 0);
});
test('B5: nights ticked after the move count in the new group; each night uses its own', () => {
  const s = season(); S.setGame(s, '2026-09-23', 'Sparks', 'Red', { place: 1, spirit: 3 }); S.setGame(s, '2026-09-23', 'T&T', 'Red', { place: 2, spirit: 1 });
  S.setMark(s, '2026-09-09', 'k1', 'a', 1, 'Sparks'); S.setMark(s, '2026-09-23', 'k1', 'a', 1, 'T&T');
  const sp = S.teamPoints(s, '2026-09-09', 'Sparks', 'Red'), tt = S.teamPoints(s, '2026-09-23', 'T&T', 'Red');
  assert.deepStrictEqual(pts(s, 'T&T'), [sp.place + tt.place, sp.spirit + tt.spirit]);
});
test('B5: nights from before the stamp existed use the child\'s current group, as before', () => {
  const s = season(); S.setMark(s, '2026-09-09', 'k1', 'a', 1);
  assert.deepStrictEqual(pts(s, 'T&T'), [S.teamPoints(s, '2026-09-09', 'T&T', 'Red').place, 0]);
  assert.strictEqual(s.attendance['2026-09-09'].k1.g, undefined);
});
test('B5: the stamp is made when Present is ticked, kept if it is ticked again, and goes when Present is cleared', () => {
  const s = season();
  S.setMark(s, '2026-09-09', 'k1', 'h', 1, 'Sparks'); assert.strictEqual(s.attendance['2026-09-09'].k1.g, undefined);    // only Present is attendance
  S.setMark(s, '2026-09-09', 'k1', 'a', 1, 'Sparks'); assert.strictEqual(s.attendance['2026-09-09'].k1.g, 'Sparks');
  S.setMark(s, '2026-09-09', 'k1', 'a', 1, 'T&T'); assert.strictEqual(s.attendance['2026-09-09'].k1.g, 'Sparks');
  S.setMark(s, '2026-09-09', 'k1', 'a', 0); assert.strictEqual(s.attendance['2026-09-09'].k1.g, undefined);
  S.setMark(s, '2026-09-09', 'k1', 'h', 0); assert.strictEqual(s.attendance['2026-09-09'], undefined);
});
test('B5: a room that is not a group (Unassigned, Volunteers) is not stamped', () => {
  const s = season(); S.setMark(s, '2026-09-09', 'k1', 'a', 1, 'Unassigned'); S.setMark(s, '2026-09-09', 'k2', 'a', 1, 'Volunteers'); S.setMark(s, '2026-09-09', 'k3', 'a', 1, '');
  assert.deepStrictEqual(Object.values(s.attendance['2026-09-09']).map(m => m.g), [undefined, undefined, undefined]);
});
test('B5: Validate accepts the group stamp and rejects one that is not a group', () => {
  const s = season(); S.setMark(s, '2026-09-09', 'k1', 'a', 1, 'Sparks');
  const bad = f => V.validate(S.toJson(f), 'awana-2026-27-20261030-090000.json').findings.filter(x => x.level === 'error' && /Attendance/.test(x.msg));
  assert.deepStrictEqual(bad(s), []);
  s.attendance['2026-09-09'].k1.g = 'Wizards'; assert(bad(s).some(x => /group/.test(x.msg)), 'a bad group is an error');
});

// ---------- B7: handbook text ----------
test('B7: a word that is not a book code stays a note instead of being cut into a code and a note', () => {
  assert.deepStrictEqual(S.parseHandbook('Returned'), { code: '', date: '', note: 'Returned' });
  assert.deepStrictEqual(S.parseHandbook('Ordered 260916'), { code: '', date: '', note: 'Ordered 260916' });
});
test('B7: real codes still read the way they did', () => {
  assert.deepStrictEqual(S.parseHandbook('HG260916'), { code: 'HG', date: '2026-09-16', note: '' });
  assert.deepStrictEqual(S.parseHandbook('AoG 260916 lost it'), { code: 'AoG', date: '2026-09-16', note: 'lost it' });
});
test('B7: a book name typed in the code box is refused, not saved as "Hang" with the date lost', () => {
  assert.throws(() => S.formatHandbook({ code: 'Hang Glider', date: '2026-09-16', note: '' }), /code/i);
  assert.throws(() => S.formatHandbook({ code: 'Hangglider', date: '', note: '' }), /code/i);
});
test('B7: a book name typed in the code box is turned into its code when the season knows that book', () => {
  const s = S.blank('2026-27'); s.config.books = { HG: { name: 'Hangglider', group: 'Sparks' }, WR: { name: 'Wingrunner', group: 'Sparks' } };
  assert.strictEqual(S.bookCode(s, 'Hang Glider'), 'HG'); assert.strictEqual(S.bookCode(s, ' wingrunner '), 'WR');
  assert.strictEqual(S.bookCode(s, 'HG'), 'HG'); assert.strictEqual(S.bookCode(s, 'Mystery Book'), 'Mystery Book');      // unknown: left alone, formatHandbook refuses it
});
test('B7: a note that starts with six digits comes back as a note, not as a date', () => {
  const parts = { code: 'HG', date: '', note: '260916 reissued' };
  assert.deepStrictEqual(S.handbookParts(S.formatHandbook(parts)), parts);
  const both = { code: 'HG', date: '2026-09-16', note: '260923 was the second one' };
  assert.deepStrictEqual(S.handbookParts(S.formatHandbook(both)), both);
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
