// N9 point 6: every section in Season.SECTIONS has a rule in dev/tools/section-rules.js, no rule is stale, and the sections marked "drop" hold nothing in the public TEST data. Invented data only.
// Usage: node test/section-rules.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const S = require('../season.js'), { RULES, RULE_KINDS } = require('../../tools/section-rules.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

test('every section in Season.SECTIONS has a rule', () => { const missing = S.SECTIONS.filter(k => !RULES[k]); assert.deepStrictEqual(missing, [], 'no rule for: ' + missing.join(', ')); });
test('no rule names a section that does not exist', () => { const stale = Object.keys(RULES).filter(k => !S.SECTIONS.includes(k)); assert.deepStrictEqual(stale, [], 'stale rules: ' + stale.join(', ')); });
test('every rule is one of the known kinds', () => { const bad = Object.entries(RULES).filter(([, v]) => !RULE_KINDS.includes(v)); assert.deepStrictEqual(bad, []); });
test('the sections marked drop hold nothing in the public TEST data', () => {
  const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).find(f => /TEST.*\.json$/.test(f));
  assert(file, 'no TEST json in dev/test-data');
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const leaked = Object.keys(RULES).filter(k => RULES[k] === 'drop' && data[k] !== undefined && !(Array.isArray(data[k]) ? data[k].length === 0 : Object.keys(data[k] || {}).length === 0));
  assert.deepStrictEqual(leaked, [], 'dropped sections present in TEST data: ' + leaked.join(', '));
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
