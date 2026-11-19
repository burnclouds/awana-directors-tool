// N9 point 7: dev/tools/stamp-source.sh writes the source commit into a published index.html: "unknown" with no git, the short commit, and +changes when dev/app is not committed. Runs in temporary folders only.
// Usage: node test/deploy-stamp.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const script = path.join(__dirname, '..', '..', 'tools', 'stamp-source.sh');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const INDEX = '<html><head>\n<meta name="app-version" content="1.51.16">\n<meta name="app-build" content="2026-11-18">\n</head></html>\n';
const git = (dir, args) => execFileSync('git', ['-C', dir, '-c', 'user.email=test@example.invalid', '-c', 'user.name=test', ...args], { stdio: 'pipe' }).toString();
const stamp = (dir, file, repo) => { execFileSync('sh', [script, file, repo], { stdio: 'pipe' }); return fs.readFileSync(file, 'utf8'); };
const value = html => (html.match(/<meta name="app-source" content="([^"]*)"/) || [])[1];

const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-nogit-'));
test('with no git checkout the page says unknown, straight after the build tag', () => {
  const f = path.join(plain, 'index.html'); fs.writeFileSync(f, INDEX);
  const out = stamp(plain, f, plain); assert.strictEqual(value(out), 'unknown'); assert(/app-build[^\n]*\n<meta name="app-source"/.test(out), 'not after app-build');
});

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-git-'));
git(repo, ['init', '-q']);
fs.mkdirSync(path.join(repo, 'dev', 'app'), { recursive: true }); fs.writeFileSync(path.join(repo, 'dev', 'app', 'app.js'), 'x = 1;\n');
git(repo, ['add', '-A']); git(repo, ['commit', '-q', '-m', 'test']);
const short = git(repo, ['rev-parse', '--short', 'HEAD']).trim();
test('in a committed checkout the page names the short commit', () => {
  const f = path.join(repo, 'page.html'); fs.writeFileSync(f, INDEX);
  assert.strictEqual(value(stamp(repo, f, repo)), short);
});
test('uncommitted changes under dev/app add +changes', () => {
  fs.writeFileSync(path.join(repo, 'dev', 'app', 'app.js'), 'x = 2;\n');
  const f = path.join(repo, 'page2.html'); fs.writeFileSync(f, INDEX);
  assert.strictEqual(value(stamp(repo, f, repo)), short + '+changes');
});
test('the stamp is one line, and the rest of the page is unchanged', () => {
  const f = path.join(repo, 'page3.html'); fs.writeFileSync(f, INDEX);
  const out = stamp(repo, f, repo); assert.strictEqual(out.split('app-source').length, 2, 'more than one app-source tag'); assert(out.includes('<meta name="app-version" content="1.51.16">'));
});
fs.rmSync(plain, { recursive: true, force: true }); fs.rmSync(repo, { recursive: true, force: true });
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
