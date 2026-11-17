// Privacy guard: a test or tool that picks a data file out of dev/test-data must pick only files with TEST in the name, so a real file dropped in that folder can never feed a test.
// Reads source text only: dev/app/test/*.js and dev/tools/*.js. Fails when a file reads a test-data folder (readdirSync) and selects a .json or .csv without TEST in the selector.
// Usage: node test/test-data-only-test-files.test.js     (no arguments)
const assert = require('assert'), fs = require('fs'), path = require('path');
const dirs = [__dirname, path.join(__dirname, '..', '..', 'tools')];
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
// A selector that takes a .json or .csv by extension alone: /\.json$/, /\.csv$/, or endsWith('.json') / endsWith('.csv'). A selector with TEST before the extension (/TEST.*\.json$/) is fine.
const BARE = [/(^|[^*A-Za-z])\/\\\.(json|csv)\$\//, /\.endsWith\(\s*['"]\.(json|csv)['"]\s*\)/];
const scan = text => {
  if (!/readdirSync/.test(text) || !/test-data/.test(text)) return [];
  const bad = [];
  text.split('\n').forEach((line, i) => { if (/readdirSync|\bfiles\b\.(find|filter)/.test(line) && BARE.some(re => re.test(line))) bad.push(i + 1); });
  return bad;
};
test('the checker itself: it flags a bare selector and passes a TEST one', () => {
  const head = "const td = path.join(a, 'test-data');\n";
  assert.deepStrictEqual(scan(head + 'fs.readdirSync(td).find(f => /\\.json$/.test(f))'), [2]);
  assert.deepStrictEqual(scan(head + "fs.readdirSync(td).filter(f => /\\.csv$/.test(f))"), [2]);
  assert.deepStrictEqual(scan(head + "fs.readdirSync(td).find(f => f.endsWith('.json'))"), [2]);
  assert.deepStrictEqual(scan(head + 'fs.readdirSync(td).filter(f => /TEST.*\\.json$/.test(f))'), []);
  assert.deepStrictEqual(scan(head + 'fs.readdirSync(td).filter(f => /TEST.*\\.csv$/.test(f))'), []);
});
dirs.forEach(dir => {
  test('no file in ' + path.basename(path.dirname(dir)) + '/' + path.basename(dir) + ' picks a test-data .json or .csv without TEST in the name', () => {
    const problems = [];
    fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== path.basename(__filename) && f !== 'anonymized-data.test.js' /* it reads the anonymizer's own temp output folder, not dev/test-data */).forEach(f => {
      const bad = scan(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (bad.length) problems.push(f + ' (line ' + bad.join(', ') + ')');
    });
    assert.deepStrictEqual(problems, [], 'these files select a .json/.csv from dev/test-data without requiring TEST in the name (use /TEST.*\\.json$/ or /TEST.*\\.csv$/): ' + problems.join('; '));
  });
});
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
