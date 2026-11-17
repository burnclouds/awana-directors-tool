// .gitignore keeps real data out and lets the files a fresh clone needs in: the manifest, icons, TEST fixtures and the deploy copies.
// Uses `git check-ignore -q <path>` from the repo root; works for paths that do not exist.
const assert = require('assert'), cp = require('child_process'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..', '..');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}
const ignored = p => cp.spawnSync('git', ['check-ignore', '-q', '--no-index', p], { cwd: root }).status === 0;

test('real data paths stay ignored', () => {
  ['dev/awana-2026-27-20261110-115434.json', 'dev/20261104 -- sc-awana-club-2026-27.csv', 'archive/migration-inputs/x.csv',
    'reports/x.pdf', 'dev/working.json', 'x/real.json', 'dev/test-data/real-export.csv', 'deploy/app/try/real.json'
  ].forEach(p => assert(ignored(p), p + ' should be ignored'));
});
test('files a fresh clone needs are not ignored', () => {
  ['dev/app/manifest.json', 'dev/app/icon-192.png', 'dev/app/icon-512.png', 'dev/app/icon.svg',
    'dev/test-data/awana-2026-27-TEST-20261029-214815.json', 'dev/test-data/20261028 -- demo-club-2026-27 TEST.csv',
    'deploy/app/manifest.json', 'deploy/app/icon-192.png', 'deploy/app/try/manifest.json',
    'deploy/app/try/awana-2026-27-TEST-20261029-214815.json'
  ].forEach(p => assert(!ignored(p), p + ' should not be ignored'));
});
test('every data file in dev/test-data and deploy/app/try is marked TEST (or is the manifest or a note)', () => {
  ['dev/test-data', 'deploy/app/try'].forEach(d => {
    const dir = path.join(root, d);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
      if (!/\.(json|csv)$/.test(f) || f === 'manifest.json') return;
      assert(/TEST/.test(f), d + '/' + f + ' is not marked TEST');
    });
  });
});
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
