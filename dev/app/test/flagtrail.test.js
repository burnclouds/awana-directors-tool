// Flag anything: the rules for naming a clicked element (flagtrail.js) and the stored "element" flag (season.js). No browser needed. Usage: node test/flagtrail.test.js
const assert = require('assert'), FT = require('../flagtrail.js'), S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

test('the own label is the first usable text: visible text, then aria-label, then a label beside it, then a column header', () => {
  assert.strictEqual(FT.firstText('', '  ', 'Count'), 'Count'); assert.strictEqual(FT.firstText(null, undefined, '\n Given out \n'), 'Given out'); assert.strictEqual(FT.firstText('', '', ''), '');
});
test('long text is cut at 60 characters with an ellipsis, and white space is collapsed', () => {
  const s = FT.short('word '.repeat(40)); assert(s.length <= FT.MAX, String(s.length)); assert(s.endsWith('…')); assert.strictEqual(FT.short('a \n\t b'), 'a b');
});
test('the trail runs tab, heading, row, label; empty parts are left out', () => {
  assert.deepStrictEqual(FT.build({ tab: 'Statistics', heading: 'Club nights', row: '10/14', label: 'Count' }), ['Statistics', 'Club nights', '10/14', 'Count']);
  assert.deepStrictEqual(FT.build({ tab: 'Uniforms', heading: '', row: '', label: 'Size' }), ['Uniforms', 'Size']);
});
test('a part that repeats the one before it is kept once (a row\'s first cell is the row name)', () => {
  assert.deepStrictEqual(FT.build({ tab: 'Roster', heading: '', row: 'Ava Test', label: 'Ava Test' }), ['Roster', 'Ava Test']);
});
test('the readable form is the trail joined with a chevron', () => { assert.strictEqual(FT.readable(['Statistics', 'Club nights', '10/14', 'Count']), 'Statistics › Club nights › 10/14 › Count'); assert.strictEqual(FT.readable([]), ''); });
test('rows that share a name are told apart by position among rows of that name', () => {
  const names = ['Green', 'Blue', 'Green', 'Green']; assert.deepStrictEqual(names.map((_, i) => FT.rowIndexOf(names, i)), [0, 0, 1, 2]);
});
test('find: the same trail and row position wins; the same trail alone falls back to the first; a changed trail is not found', () => {
  const c = [{ trail: ['T', 'A'], rowIndex: 0, ref: 1 }, { trail: ['T', 'Green', 'Size'], rowIndex: 0, ref: 2 }, { trail: ['T', 'Green', 'Size'], rowIndex: 1, ref: 3 }];
  assert.strictEqual(FT.find({ trail: ['T', 'Green', 'Size'], rowIndex: 1 }, c).ref, 3); assert.strictEqual(FT.find({ trail: ['T', 'Green', 'Size'], rowIndex: 0 }, c).ref, 2);
  assert.strictEqual(FT.find({ trail: ['T', 'Green', 'Size'], rowIndex: 5 }, c).ref, 2, 'the list is shorter now'); assert.strictEqual(FT.find({ trail: ['T', 'Renamed'], rowIndex: 0 }, c), null); assert.strictEqual(FT.find(null, c), null);
});
test('an element flag is stored with the tab, the trail, the label and the row position, and not about a child', () => {
  const s = S.blank('2026-27'), id = S.addFlag(s, { level: 'element', tab: 'stats', trail: ['Statistics', 'Club nights', '10/14', 'Count'], label: 'Count', rowIndex: 2, note: 'Looks high' }), f = s.flags[id];
  assert.deepStrictEqual({ level: f.level, kid: f.kid, tab: f.tab, trail: f.trail, label: f.label, rowIndex: f.rowIndex, note: f.note }, { level: 'element', kid: '', tab: 'stats', trail: ['Statistics', 'Club nights', '10/14', 'Count'], label: 'Count', rowIndex: 2, note: 'Looks high' });
});
test('an element flag needs a tab, a trail and a note', () => {
  const s = S.blank('2026-27'); assert.throws(() => S.addFlag(s, { level: 'element', trail: ['x'], note: 'n' }), /tab/); assert.throws(() => S.addFlag(s, { level: 'element', tab: 'stats', trail: [], note: 'n' }), /trail/);
  assert.throws(() => S.addFlag(s, { level: 'element', tab: 'stats', trail: ['x'], note: ' ' }), /note/i);
});
test('the flag survives a save and reopen of the data file, and is listed with the others', () => {
  const s = S.blank('2026-27'); S.addFlag(s, { level: 'general', note: 'general' }); const id = S.addFlag(s, { level: 'element', tab: 'uniforms', trail: ['Uniforms', 'Ava', 'Size'], rowIndex: 1, note: 'check' });
  const back = S.fromJson(S.toJson(s)); assert.deepStrictEqual(back.flags[id].trail, ['Uniforms', 'Ava', 'Size']); assert.strictEqual(back.flags[id].rowIndex, 1); assert.strictEqual(S.flagList(back).length, 2);
});
test('an element flag change is one History entry that undoes cleanly', () => {
  const s = S.blank('2026-27'), before = S.snapshot(s); S.addFlag(s, { level: 'element', tab: 'debug', trail: ['Debug', 'Scripts'], note: 'n' }); const e = S.record(s, before, { separate: true, now: '2026-10-28T20:00:00Z' });
  assert(e && /Notes and flags/.test(e.label), e && e.label); assert.deepStrictEqual(Object.keys(S.at(s, 0).flags), []);
});
test('a count in brackets and "to review" do not stop a flag from matching: "Notes and flags (4) to review" finds "Notes and flags (5)"', () => {
  const stored = { trail: ['To do', 'Notes and flags (4)', '—', 'Flag. When I click'], rowIndex: 0 };
  const now = [{ trail: ['To do', 'Notes and flags (5) to review', '—', 'Flag. When I click'], rowIndex: 0, ref: 'row' }];
  assert.strictEqual(FT.find(stored, now) && FT.find(stored, now).ref, 'row');
  assert(FT.same(['Sparks A (12)'], ['Sparks A']), 'a count is not part of the place');
  assert(!FT.same(['Notes and flags'], ['Awards']), 'different places still differ');
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
