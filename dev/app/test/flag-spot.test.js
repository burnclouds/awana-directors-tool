// N20 (1.51.16), the rules without a browser: FlagTrail.scopeOk and find, the flag's scope fields through addFlag and the file, and the file check for sub. Invented data only.
// Usage: node test/flag-spot.test.js
const assert = require('assert');
const FT = require('../flagtrail.js'), Season = require('../season.js'), Validate = require('../validate.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const fresh = () => Season.fromJson(Season.toJson(Season.blank('2026-27')));
const D = n => new Date(2026, 10, n);

test('scopeOk: a part the flag has must equal the view; a part it lacks is not compared; no parts always match', () => {
  assert.strictEqual(FT.scopeOk({}, { kid: 'a', sub: 'progress' }), true); assert.strictEqual(FT.scopeOk(null, {}), true);
  assert.strictEqual(FT.scopeOk({ sub: 'progress' }, { sub: 'progress', book: 'HG' }), true); assert.strictEqual(FT.scopeOk({ sub: 'progress' }, { sub: 'registration' }), false);
  FT.SCOPE_FIELDS.forEach(k => { assert.strictEqual(FT.scopeOk({ [k]: 'x' }, { [k]: 'x' }), true, k); assert.strictEqual(FT.scopeOk({ [k]: 'x' }, { [k]: 'y' }), false, k); assert.strictEqual(FT.scopeOk({ [k]: 'x' }, {}), false, k + ' missing from the view'); });
});
test('find: a flag with a child only ever finds that child\'s element, and it beats a position match; a flag without one behaves as before', () => {
  const trail = ['Uniforms', 'Size'], cands = [{ trail, rowIndex: 0, kid: 'b', ref: 1 }, { trail, rowIndex: 1, kid: 'a', ref: 2 }];
  assert.strictEqual(FT.find({ trail, rowIndex: 0, kid: 'a' }, cands).ref, 2, 'the child, not the position');
  assert.strictEqual(FT.find({ trail, rowIndex: 0, kid: 'z' }, cands), null, 'a child who is not here');
  assert.strictEqual(FT.find({ trail, rowIndex: 0 }, cands).ref, 1, 'no child: the position, as before'); assert.strictEqual(FT.find({ trail, rowIndex: 5 }, cands).ref, 1, 'no child: the first, as before');
});
test('addFlag keeps kid, book, date, room, sub for an element flag and a bug report, writes nothing extra when they are not given, and the file round-trips them', () => {
  const s = fresh(), scope = { kid: '70001_Ann_Lee', sub: 'progress', book: 'HG' };
  const e = Season.addFlag(s, Object.assign({ level: 'element', tab: 'person', trail: ['Person', 'Date received'], note: 'n' }, scope), D(16)), b = Season.addFlag(s, Object.assign({ level: 'bug', tab: 'person', trail: ['Person', 'x'], note: 'n' }, scope), D(16));
  const at = Season.addFlag(s, { level: 'element', tab: 'attend', trail: ['Attendance', 'Present'], note: 'n', date: '2026-10-28', room: 'Sparks A' }, D(16)), loose = Season.addFlag(s, { level: 'element', tab: 'person', trail: ['Person', 'x'], note: 'n' }, D(16));
  assert.deepStrictEqual([s.flags[e].kid, s.flags[e].sub, s.flags[e].book], ['70001_Ann_Lee', 'progress', 'HG']); assert.strictEqual(s.flags[b].sub, 'progress'); assert.deepStrictEqual([s.flags[at].date, s.flags[at].room], ['2026-10-28', 'Sparks A']);
  assert(!('sub' in s.flags[loose]) && !('date' in s.flags[loose]), 'nothing extra'); assert.strictEqual(s.flags[loose].kid, '');
  const back = Season.fromJson(Season.toJson(s)); assert.deepStrictEqual(back.flags[e], s.flags[e]); assert.strictEqual(Season.VERSION, 6, 'no format version change');
  assert(Season.flagsOf(s, '70001_Ann_Lee').some(f => f.id === e), 'an element flag with a child is on that child\'s sheet list (E3)');
});
test('the file check: a Person tab part it does not know is a warning, never an error; a file without scope fields is unchanged', () => {
  const run = mut => { const s = fresh(); s.calendar = []; const id = Season.addFlag(s, { level: 'element', tab: 'person', trail: ['Person', 'x'], note: 'n', sub: 'progress' }, D(16)); mut(s, id); return Validate.validate(Season.toJson(s), 'awana-2026-27-20261116-000000.json').findings.filter(f => f.check === 'flags' && f.level !== 'info'); };
  assert.deepStrictEqual(run(() => {}), []);
  const bad = run((s, id) => { s.flags[id].sub = 'elsewhere'; }); assert(bad.some(f => f.level === 'warn' && /Person tab part/.test(f.msg))); assert(!bad.some(f => f.level === 'error'));
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
