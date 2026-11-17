// dev/tools/check-docs-for-names.js reports file and line for a tracked file that holds a full name from a data file, never the name, and exits 1.
// Uses the invented TEST data file as the "real" one and a temporary git repository.
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const Season = require('../season.js'), M = require('../model.js');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}
const td = path.join(__dirname, '..', '..', 'test-data'), tool = path.join(__dirname, '..', '..', 'tools', 'check-docs-for-names.js');
const dataFile = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.json$/.test(f)).sort().pop());
const data = Season.fromJson(fs.readFileSync(dataFile, 'utf8'));
// one invented person whose first and last names are both 5+ plain letters
const p = Object.values(data.roster.people).map(e => e.pc).find(pc => /^[A-Za-z]{5,}$/.test(pc[M.C.FIRST]) && /^[A-Za-z]{5,}$/.test(pc[M.C.LAST]));
const first = p[M.C.FIRST], last = p[M.C.LAST];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-names-'));
const git = (...a) => cp.execFileSync('git', a, { cwd: tmp, stdio: 'pipe' });
const commit = (file, text) => { fs.writeFileSync(path.join(tmp, file), text); git('add', '.'); git('commit', '-q', '-m', 'x'); };
git('init', '-q'); git('config', 'user.email', 't@example.com'); git('config', 'user.name', 't');
fs.mkdirSync(path.join(tmp, 'dev', 'test-data'), { recursive: true }); fs.writeFileSync(path.join(tmp, 'dev', 'test-data', 'invented.md'), first + ' ' + last + ' is invented\n');
fs.writeFileSync(path.join(tmp, 'clean.md'), 'nothing here\n');
commit('notes.md', 'line one\nthe list: ' + first + ' ' + last + ' came late\nline three\n');
const run = (...extra) => cp.spawnSync('node', [tool, dataFile, '--root', tmp].concat(extra), { encoding: 'utf8' });
const printed = (r, w) => (r.stdout + r.stderr).toLowerCase().includes(w.toLowerCase());

test('a tracked file with a full name from the data file is reported by file and line, and the name is not printed', () => {
  const r = run(), out = r.stdout + r.stderr;
  assert.strictEqual(r.status, 1, 'exit ' + r.status);
  assert(/notes\.md:2\b/.test(out), 'file and line printed: ' + out.slice(0, 200));
  assert(!printed(r, first) && !printed(r, last), 'a name was printed');
  assert(!/clean\.md/.test(out) && !/dev\/test-data/.test(out), 'clean and invented files are not listed');
});
test('"Last, First" is a full name too, and --show masks it', () => {
  commit('notes.md', 'the list: ' + last + ', ' + first + '\n');
  const r = run('--show'); assert.strictEqual(r.status, 1);
  assert(/\[NAME\]/.test(r.stdout), 'masked line shown'); assert(!printed(r, first) && !printed(r, last), 'a name was printed with --show');
});
test('a first name alone is not a hit by default, and is with --strict', () => {
  commit('notes.md', 'only ' + first + ' came\n');
  assert.strictEqual(run().status, 0, 'default run passes'); const r = run('--strict'); assert.strictEqual(r.status, 1, 'strict run fails'); assert(!printed(r, first), 'name printed');
});
test('after the name is taken out the check passes, and a name inside a longer word is not a match', () => {
  commit('notes.md', 'x' + first.toLowerCase() + ' ' + last.toLowerCase() + 'y and ' + first.toLowerCase() + 'ing ' + last.toLowerCase() + 's\n');
  const r = run('--strict'); assert.strictEqual(r.status, 0, 'exit ' + r.status + ': ' + (r.stdout + r.stderr).slice(0, 200));
});
fs.rmSync(tmp, { recursive: true, force: true });
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
