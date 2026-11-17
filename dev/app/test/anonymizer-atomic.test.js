// make-test-data.js writes its output only when every check passes: a run that finds a problem leaves the out folder without
// any file from that run, and does not touch files an earlier run left there. Runs on the invented TEST data in dev/test-data,
// so it always runs (the real-file test is anonymized-data.test.js, which covers a clean run; invented data cannot be re-anonymized
// cleanly because the invented names come from the same pool the tool draws from, so every run on it ends in "PROBLEMS").
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}
const td = path.join(__dirname, '..', '..', 'test-data'), tool = path.join(__dirname, '..', '..', 'tools', 'make-test-data.js');
const data = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.json$/.test(f)).sort().pop());
const csv = path.join(td, '20261028 -- demo-club-2026-27 TEST.csv');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-atomic-'));
const go = (out, extra) => cp.spawnSync('node', [tool, data, csv, out].concat(extra || []), { encoding: 'utf8' });
const words = path.join(tmp, 'words.json');
fs.writeFileSync(words, JSON.stringify(['Registration']));      // a word only in the export's header row: named as a real name but never replaced there, so the leak check must fire

test('a run that finds a problem exits 1 and leaves a new out folder without any file', () => {
  const out = path.join(tmp, 'bad'), r = go(out, ['--extra', words]);
  assert.strictEqual(r.status, 1, 'exit ' + r.status + ' (a forced leak must fail the run)');
  assert(/PROBLEMS/.test(r.stdout), 'PROBLEMS section printed');
  const left = fs.existsSync(out) ? fs.readdirSync(out) : [];
  assert.strictEqual(left.length, 0, left.length + ' file(s) left in the out folder after a failed run');
});
test('a failed run does not touch the files an earlier run left in the out folder', () => {
  const out = path.join(tmp, 'earlier'); fs.mkdirSync(out);
  const dn = 'awana-' + '2026-27-TEST-' + path.basename(data).replace(/^.*-(\d{8}-\d{6})\.json$/, '$1') + '.json';
  fs.writeFileSync(path.join(out, dn), 'earlier good run'); fs.writeFileSync(path.join(out, 'x.csv'), 'earlier good run');
  const r = go(out, ['--extra', words]); assert.strictEqual(r.status, 1);
  assert.deepStrictEqual(fs.readdirSync(out).sort(), [dn, 'x.csv'].sort(), 'no file added or removed');
  fs.readdirSync(out).forEach(f => assert.strictEqual(fs.readFileSync(path.join(out, f), 'utf8'), 'earlier good run', f + ' was overwritten'));
});
// ---- R17: the tool stops on anything it does not know (the keys Planning Center capture adds, and any future one) ----
const variant = (name, mut) => { const dir = path.join(tmp, name); fs.mkdirSync(dir); const o = JSON.parse(fs.readFileSync(data, 'utf8')); mut(o); const f = path.join(dir, path.basename(data)); fs.writeFileSync(f, JSON.stringify(o)); return f; };
const stops = (name, mut, msg) => {
  const f = variant(name, mut), out = path.join(tmp, name + '-out'), r = cp.spawnSync('node', [tool, f, csv, out], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1, 'exit ' + r.status + ': ' + String(r.stderr).split('\n').find(l => /Error/.test(l)));
  assert(msg.test(r.stdout + r.stderr), 'message not found: ' + (r.stderr || r.stdout).split('\n').filter(l => /Error|does not know/.test(l)).slice(0, 2).join(' | '));
  assert(!fs.existsSync(out) || fs.readdirSync(out).length === 0, 'files were written');
};
const firstId = o => Object.keys(o.roster.people)[0];
test('an unknown key in roster stops the run and writes nothing', () => stops('rk', o => { o.roster.somethingNew = { a: firstId(o) }; }, /make-test-data does not know the roster key "somethingNew"/));
test('an unknown key in a person\'s entry stops the run', () => stops('pk', o => { o.roster.people[firstId(o)].extraBit = 'x'; }, /the person key "extraBit"/));
test('an unknown top-level key that is not an object stops the run', () => stops('tk', o => { o.futureNote = 'Zyxwv'; }, /futureNote/));
test('an unknown key inside pcExport stops the run', () => stops('ck', o => { o.roster.pcExport = { at: 'x', hash: '', header: [], names: [], rows: 0, blankRows: 0, ids: {}, loose: [], extra: 'Zyxwv' }; }, /pcExport/));
test('a History change under roster that the tool does not know stops the run', () => stops('hp', o => { o.history = (o.history || []).concat([{ t: '2026-11-04T00:00:00.000Z', label: 'x', changes: [{ p: ['roster', 'mystery'], n: 'Zyxwv' }] }]); }, /roster › mystery|History change.*roster/));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
