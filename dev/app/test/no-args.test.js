// The tests that take real-file arguments must still run with none: they use the invented TEST data in dev/test-data,
// or say "SKIP: needs real files" and exit 0, so one command (dev/tools/run-tests.sh) can run every test.
const assert = require('assert'), cp = require('child_process'), path = require('path');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}
['roster', 'import-test-file', 'reports-season'].forEach(name => {
  test(name + '.test.js runs with no arguments and passes or skips', () => {
    const r = cp.spawnSync('node', [path.join(__dirname, name + '.test.js')], { encoding: 'utf8', timeout: 120000 });
    const out = (r.stdout || '') + (r.stderr || '');
    assert.strictEqual(r.status, 0, 'exit code ' + r.status + ': ' + out.split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 200));
    assert(/\d+ passed, 0 failed/.test(out) || /SKIP: needs real files/.test(out), 'neither "passed" nor SKIP in the output');
  });
});
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
