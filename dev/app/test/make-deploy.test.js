// make-deploy.sh on a temporary copy of the project: a changed build must carry a new release id (app-version + app-build),
// a first deploy and an unchanged rebuild are fine, and every privacy check runs before deploy/ is touched.
// Usage: node test/make-deploy.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}
const root = path.join(__dirname, '..', '..', '..');
const tmps = [];
// A temp copy of the project that has been deployed once. The first call builds it (about 15 s); later calls clone it.
let template = null;
function deployCopy() {
  if (!template) {
    template = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-md-')); tmps.push(template);
    const sh = c => cp.execSync(c, { cwd: template, stdio: 'pipe' });
    sh('mkdir -p dev/tools deploy');
    fs.copyFileSync(path.join(root, 'make-deploy.sh'), path.join(template, 'make-deploy.sh'));
    sh('cp -r "' + root + '/dev/app" dev/app && rm -rf dev/app/test');
    sh('cp -r "' + root + '/dev/test-data" dev/test-data');
    sh('cp "' + root + '/dev/tools/minify.js" dev/tools/');
    sh('cp "' + root + '/dev/tools/backlog-html.js" dev/tools/');
    sh('cp "' + root + '/BACKLOG.md" "' + root + '/version-history.html" .');
    sh('cp "' + root + '/dev/tools/stamp-source.sh" dev/tools/');      // N9 point 7: the deploy stamps the source commit with this script
    sh('ln -s "' + root + '/node_modules" node_modules');
    const r = run(template); assert.strictEqual(r.code, 0, 'first deploy of the copy: ' + r.out.slice(0, 300));
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-md-')); tmps.push(tmp);
  cp.execFileSync('cp', ['-a', template + '/.', tmp + '/']);
  return tmp;
}
function run(tmp) {
  const r = cp.spawnSync('sh', ['make-deploy.sh'], { cwd: tmp, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const read = (tmp, ...p) => fs.readFileSync(path.join(tmp, ...p), 'utf8');
const write = (tmp, rel, s) => fs.writeFileSync(path.join(tmp, rel), s);
const release = tmp => (read(tmp, 'deploy', 'app', 'sw.js').match(/const RELEASE = '([^']*)'/) || [])[1];
const sum = tmp => cp.execSync('find deploy -type f -print0 | sort -z | xargs -0 cat | md5sum; find deploy -type f | sort | md5sum', { cwd: tmp }).toString();
const bumpApp = (tmp, v) => write(tmp, 'dev/app/index.html', read(tmp, 'dev/app/index.html').replace(/(name="app-version" content=")[^"]*/, '$1' + v));
const STOP = /STOP: files changed but app-version and app-build are unchanged/;

test('an unchanged rebuild passes', () => {
  const tmp = deployCopy(), r = run(tmp); assert.strictEqual(r.code, 0, r.out.slice(0, 300)); assert(!/STOP/.test(r.out));
});
test('a first deploy (no deploy folder) passes', () => {
  const tmp = deployCopy(); fs.rmSync(path.join(tmp, 'deploy'), { recursive: true, force: true });
  const r = run(tmp); assert.strictEqual(r.code, 0, r.out.slice(0, 300)); assert(release(tmp));
  assert.match(read(tmp, 'deploy/app/version-history.html'), /href="backlog.html"/);
  assert.match(read(tmp, 'deploy/app/backlog.html'), /href="version-history.html"/);
  assert.match(read(tmp, 'deploy/app/sw.js'), /"backlog.html"/);
});
test('changing style.css without bumping the release is refused and deploy/ keeps the old file', () => {
  const tmp = deployCopy(), before = read(tmp, 'deploy', 'app', 'style.css');
  write(tmp, 'dev/app/style.css', read(tmp, 'dev/app/style.css') + '\n/* edited */\n');
  const r = run(tmp); assert.strictEqual(r.code, 1, 'exit ' + r.code); assert(STOP.test(r.out), r.out.slice(0, 300));
  assert.strictEqual(read(tmp, 'deploy', 'app', 'style.css'), before);
});
test('changing style.css and bumping the release passes, and the service worker carries the new release', () => {
  const tmp = deployCopy(), old = release(tmp);
  write(tmp, 'dev/app/style.css', read(tmp, 'dev/app/style.css') + '\n/* edited */\n'); bumpApp(tmp, '9.9.9');
  const r = run(tmp); assert.strictEqual(r.code, 0, r.out.slice(0, 300));
  assert.notStrictEqual(release(tmp), old); assert(/^9\.9\.9\+/.test(release(tmp)));
});
test('a script changed with its own version bumped but the release not bumped is refused', () => {
  const tmp = deployCopy(), f = 'dev/app/pace.js', s = read(tmp, f), m = s.split('\n')[0].match(/'(\d+\.\d+\.)(\d+)'/);
  assert(m, 'line 1 of pace.js holds its version');
  write(tmp, f, s.replace(m[0], "'" + m[1] + (Number(m[2]) + 1) + "'") + '\n;this.__edited = 1;\n');
  const r = run(tmp); assert.strictEqual(r.code, 1, 'exit ' + r.code + ': ' + r.out.slice(0, 200)); assert(STOP.test(r.out), r.out.slice(0, 300));
});
test('a changed manifest or icon is also a change that needs a new release', () => {
  const tmp = deployCopy(); write(tmp, 'dev/app/manifest.json', read(tmp, 'dev/app/manifest.json').replace(/\s*$/, '\n\n'));
  const r = run(tmp); assert.strictEqual(r.code, 1, 'exit ' + r.code); assert(STOP.test(r.out), r.out.slice(0, 300));
});
test('a file removed from dev/app is also a change that needs a new release', () => {
  const tmp = deployCopy(); fs.rmSync(path.join(tmp, 'dev/app/icon.svg'));
  const r = run(tmp); assert.strictEqual(r.code, 1, 'exit ' + r.code); assert(STOP.test(r.out), r.out.slice(0, 300));
});

// ---- Task 4: the checks run before deploy/ is touched ----
test('a stray data file in dev/app is refused and deploy/ is byte-identical afterwards', () => {
  const tmp = deployCopy(), before = sum(tmp);
  write(tmp, 'dev/app/real.csv', 'a,b\n1,2\n'); bumpApp(tmp, '9.9.9');
  const r = run(tmp); assert.strictEqual(r.code, 1, 'exit ' + r.code); assert(/STOP: non-code files/.test(r.out), r.out.slice(0, 300));
  assert.strictEqual(sum(tmp), before, 'deploy/ changed even though the build was refused');
});
test('a try data file that is not marked "fake": true is refused and deploy/ is unchanged', () => {
  const tmp = deployCopy(), before = sum(tmp), d = path.join(tmp, 'dev/test-data');
  const f = fs.readdirSync(d).filter(n => /TEST.*\.json$/.test(n)).sort().pop(), o = JSON.parse(read(tmp, 'dev/test-data/' + f));
  delete o.fake; write(tmp, 'dev/test-data/' + f, JSON.stringify(o)); bumpApp(tmp, '9.9.9');
  const r = run(tmp); assert.strictEqual(r.code, 1, 'exit ' + r.code); assert(/not marked "fake": true/.test(r.out), r.out.slice(0, 300));
  assert.strictEqual(sum(tmp), before, 'deploy/ changed even though the build was refused');
});
test('a data file without TEST in its name in dev/test-data is refused and deploy/ is unchanged', () => {
  const tmp = deployCopy(), before = sum(tmp);
  write(tmp, 'dev/test-data/zz-real-export.csv', 'a,b\n1,2\n'); bumpApp(tmp, '9.9.9');
  const r = run(tmp); assert.strictEqual(r.code, 1, 'exit ' + r.code); assert(/not marked TEST/.test(r.out), r.out.slice(0, 300));
  assert.strictEqual(sum(tmp), before, 'deploy/ changed even though the build was refused');
});

tmps.forEach(t => fs.rmSync(t, { recursive: true, force: true }));
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
