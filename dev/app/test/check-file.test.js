// dev/tools/check-file.js prints counts only (no file name, message text, id or name) and uses exit codes 0 / 1 / 2.
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}
const td = path.join(__dirname, '..', '..', 'test-data'), tool = path.join(__dirname, '..', '..', 'tools', 'check-file.js');
const testFile = fs.readdirSync(td).filter(f => /TEST.*\.json$/.test(f)).sort().pop();
const o = JSON.parse(fs.readFileSync(path.join(td, testFile), 'utf8')), ids = Object.keys(o.roster.people), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-cf-'));
const GHOST = '7000001_Test_Kid', run = (...a) => cp.spawnSync('node', [tool].concat(a), { encoding: 'utf8' });
test('a file with an error and a ghost record: exit 1, counts per level and check, nothing identifying', () => {
  const bad = JSON.parse(JSON.stringify(o)); bad.held = { [ids[0]]: [] }; bad.doneBooks = { [GHOST]: ['AoG'] };
  const f = path.join(tmp, 'secret-file-name.json'); fs.writeFileSync(f, JSON.stringify(bad));
  const r = run(f), out = r.stdout + r.stderr;
  assert.strictEqual(r.status, 1, 'exit ' + r.status);
  assert(/^error held 1$/m.test(out) && /^warn ghosts 1$/m.test(out) && /^warn file 1$/m.test(out) && /^total: 1 errors, 2 warnings, \d+ info$/m.test(out), out);      // (the second warning: the file name has no date tag)
  assert(!out.includes('secret-file-name') && !out.includes(GHOST) && !out.includes(ids[0]), 'a file name or id was printed');
  ids.forEach(id => { const name = id.split('_').slice(1).join('_'); assert(name.length < 3 || !out.includes(name), 'a name from the roster was printed'); });
});
test('the unmodified TEST file: exit 0 and only info lines', () => {
  const r = run(path.join(td, testFile)); assert.strictEqual(r.status, 0); assert(/^total: 0 errors, 0 warnings, \d+ info$/m.test(r.stdout), r.stdout);
});
test('no argument or an unreadable file: exit 2, and the message does not repeat the path', () => {
  assert.strictEqual(run().status, 2); const r = run(path.join(tmp, 'does-not-exist-xyz.json')); assert.strictEqual(r.status, 2); assert(!(r.stdout + r.stderr).includes('does-not-exist-xyz'), 'the path was printed');
});
fs.rmSync(tmp, { recursive: true, force: true });
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
