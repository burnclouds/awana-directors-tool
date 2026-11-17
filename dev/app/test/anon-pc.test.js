// The anonymizer's rules for Planning Center data (dev/tools/anon-pc.js): every column the app knows has a rule, an unknown column is recognised as unknown,
// unknown keys are listed (paths only, never values), and the export record is scrubbed by column. Invented data only. (R17 task 1)
// Usage: node test/anon-pc.test.js
const assert = require('assert');
const A = require('../../tools/anon-pc.js'), M = require('../model.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

test('every column the app knows has a rule', () => {
  const cols = M.PC_KNOWN.concat(M.PC_ROLES.map(r => r.col)).concat(['TnT shirt']);
  const none = cols.filter(c => A.ruleOf(c) === 'unknown'); assert.deepStrictEqual(none, [], 'no rule for: ' + none.join(' | '));
});
test('an unknown column, a pc: column and a numbered duplicate are recognised or unknown as expected', () => {
  assert.strictEqual(A.ruleOf('Favourite Snack TEST'), 'unknown'); assert.strictEqual(A.ruleOf('Medical Notes (2)'), 'medical'); assert.strictEqual(A.ruleOf('pc:x_Notes'), 'unknown');
  assert.strictEqual(A.ruleOf('pc:Medical Notes'), 'medical'); assert.strictEqual(A.ruleOf('(no header 7)'), 'unknown'); assert.strictEqual(A.ruleOf('First Name'), 'name');
});
test('unknownKeys lists every key the tool does not know, at every level, and no value', () => {
  const id = '7000001_Test_Kid', raw = { format: 'awana-season', version: 6, year: 'x', config: {}, futureThing: 'Zyxwv secret', roster: { cols: [], pcCols: [], futureKey: ['Zyxwv'], pcExport: { at: 'x', hash: '', header: [], names: [], rows: 0, blankRows: 0, ids: {}, loose: [], extra: 'Zyxwv' }, people: { [id]: { pc: {}, v: {}, extraBit: 'Zyxwv' } } }, history: [] };
  const u = A.unknownKeys(raw); assert.strictEqual(u.length, 4, u.join(' | ')); assert(u.every(x => !/Zyxwv|secret/.test(x)), 'a value leaked: ' + u.join(' | '));
  ['futureThing', 'futureKey', 'extraBit', 'extra'].forEach(k => assert(u.some(x => x.includes(k)), 'missing ' + k)); assert.deepStrictEqual(A.unknownKeys({ format: 'awana-season', roster: { people: {} } }), []);
});
test('the capture keys are the eight the design names', () => { assert.deepStrictEqual(A.CAPTURE_KEYS.slice().sort(), ['at', 'blankRows', 'hash', 'header', 'ids', 'loose', 'names', 'rows']); });
test('anonCapture renames ids, scrubs loose rows by column and empties the hash', () => {
  const cap = { at: '2026-11-03T19:00:00.000Z', hash: 'abc-1', header: ['First Name', 'Favourite Snack FBK'], names: ['First Name', 'Favourite Snack FBK'], rows: 3, blankRows: 1, ids: { '7000001_Test_Kid': 1 }, loose: [['Zyxwv', 'Zebracakes 4455']] };
  const anonRecord = rec => { const o = {}; Object.keys(rec).forEach(c => { o[c] = A.ruleOf(c) === 'name' ? 'N' : A.ruleOf(c) === 'unknown' ? (rec[c] === '' ? '' : 'TEST') : rec[c]; }); return o; };
  const out = A.anonCapture(cap, { anonRecord, idOf: id => id === '7000001_Test_Kid' ? '7777777_New_Name' : (() => { throw new Error('unknown'); })() });
  assert.deepStrictEqual(Object.keys(out.ids), ['7777777_New_Name']); assert(!/Zyxwv|Zebracakes/.test(JSON.stringify(out.loose)), JSON.stringify(out.loose)); assert.strictEqual(out.hash, '');
  assert.deepStrictEqual(out.header, ['First Name', 'Favourite Snack AWANA']); assert.strictEqual(out.rows, 3); assert.strictEqual(out.blankRows, 1); assert.strictEqual(out.at, cap.at);
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
