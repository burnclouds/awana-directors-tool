// The by-hand replay report (dev/tools/replay-report.js) prints counts and shapes of History-replay differences, never an id, a name, a value or a record date (R20).
// Usage: node test/replay-report.test.js     (invented ids only)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const S = require('../season.js'), Mdl = require('../model.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const tool = path.join(__dirname, '..', '..', 'tools', 'replay-report.js');
const A = '7000001_Test_Kid', B = '7000002_Test_Kid';

function goodSeason() {
  const m = Mdl.emptyMaster(); m.pcCols = Mdl.TRACKED.slice();
  [['Ann', A.split('_')[0]], ['Bo', B.split('_')[0]]].forEach(([f, reg]) => Mdl.addManualPerson(m, { 'First Name': f, 'Last Name': 'Test', 'Assignment Area: Classes': 'Sparks A', 'Selection': 'Clubber', 'Registration ID': reg }, '2026-10-01'));
  const s = S.blank('2026-27'); s.roster = Mdl.toRoster(m);
  s.calendar = [{ Date: '2026-10-28', Type: 'Club night', Quarter: 'Q2', Theme: '', Notes: '', 'No Club': '', 'Cubbies Lesson': '', 'Puggles #': '', 'Puggles Title': '', 'Sparks Lesson': '', 'T&T Lesson': '' }];
  const id = Object.keys(s.roster.people)[0];
  const before = S.snapshot(s); S.setMark(s, '2026-10-28', id, 'a', 1); S.record(s, before, { now: '2026-10-28T23:00:00.000Z' });
  return { s, id };
}
const runTool = s => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-')), f = path.join(dir, 'secret-file-name.json'); fs.writeFileSync(f, S.toJson(s));
  try { return cp.spawnSync('node', [tool, f], { encoding: 'utf8' }).stdout; } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

test('S.replayDiff is [] for a file whose history explains it, and names an unlogged change', () => {
  const { s, id } = goodSeason(); assert.deepStrictEqual(S.replayDiff(s), []);
  s.attendance['2026-10-28'][id].h = 1; const d = S.replayDiff(s); assert(d.length === 1 && d[0].p.join('>') === 'attendance>2026-10-28>' + id + '>h', JSON.stringify(d));
  assert.deepStrictEqual(S.replayDiff(S.blank('x')), [], 'empty history');
});
test('the report prints a count and a shape, with no id, no name, no value and no record date', () => {
  const { s, id } = goodSeason(); s.attendance['2026-10-28'][id].h = 1;
  const out = runTool(s);
  assert(/Differences: 1/.test(out), out);
  assert(/1\s+(changed|data\+)\s+attendance › <date> › <id> › h/.test(out), out);
  ['7000001', 'Test_Kid', 'secret-file-name', 'Ann', '2026-10-28'].forEach(x => { const shapeLines = out.split('\n').filter(l => /›/.test(l)).map(l => l.replace(/\s+\d{4}-\d{2}-\d{2}\s*$/, '')); assert(!shapeLines.join('\n').includes(x), x + ' leaked into a shape: ' + out); });
  assert(/History entries: 1/.test(out));
});
test('a custom award name prints as <award>, a standard one by name', () => {
  const { s, id } = goodSeason();
  const before = S.snapshot(s); s.given[id] = { 'HG Blue Jewel 1': '2026-10-28' }; S.record(s, before, { now: '2026-10-29T12:00:00.000Z' });
  s.given[id]['Zany Trophy'] = '2026-10-28'; s.given[id]['HG Blue Jewel 1'] = '2026-10-29';      // changed outside the app
  const out = runTool(s);
  assert(/given › <id> › <award>/.test(out), out); assert(!/Zany/.test(out), out); assert(/given › <id> › HG Blue Jewel 1/.test(out), out);
});
test('no argument prints usage; a file that is not JSON prints no contents', () => {
  assert.throws(() => cp.execFileSync('node', [tool], { stdio: 'pipe' }), /usage|status 2/i);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-')), f = path.join(dir, 'x.json'); fs.writeFileSync(f, 'SECRETWORD {');
  try { cp.execFileSync('node', [tool, f], { stdio: 'pipe' }); assert.fail('should exit nonzero'); } catch (e) { assert(!String(e.stdout) .includes('SECRETWORD') && !String(e.stderr).includes('SECRETWORD'), 'contents leaked'); assert(/not valid JSON/.test(String(e.stderr) + String(e.stdout))); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
