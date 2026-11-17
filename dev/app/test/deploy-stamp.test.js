// make-deploy.sh stamps the published index.html so a new version is fetched fresh (src="app.js?v=<version>"), and still refuses a changed file whose version was not bumped. Runs the real script on a copy.
// Usage: node test/deploy-stamp.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const root = path.join(__dirname, '..', '..', '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-deploy-'));
cp.execSync('mkdir -p "' + tmp + '/dev" "' + tmp + '/deploy" && cp "' + root + '/make-deploy.sh" "' + tmp + '/" && cp -r "' + root + '/dev/app" "' + tmp + '/dev/app" && cp -r "' + root + '/dev/test-data" "' + tmp + '/dev/test-data" && rm -rf "' + tmp + '/dev/app/test" && mkdir -p "' + tmp + '/dev/tools" && cp "' + root + '/dev/tools/minify.js" "' + tmp + '/dev/tools/" && ln -s "' + root + '/node_modules" "' + tmp + '/node_modules"');
const run = () => { try { return { out: cp.execSync('sh make-deploy.sh 2>&1', { cwd: tmp }).toString(), ok: true }; } catch (e) { return { out: String(e.stdout || e.message), ok: false }; } };
const html = () => fs.readFileSync(path.join(tmp, 'deploy', 'app', 'index.html'), 'utf8'), dev = fs.readFileSync(path.join(tmp, 'dev', 'app', 'index.html'), 'utf8'), ver = /name="app-version" content="([^"]+)"/.exec(dev)[1];

test('the published index.html names every script and style with ?v=<app version>; the development one is left alone', () => {
  const r = run(); assert(r.ok, r.out); const h = html(), scripts = [...dev.matchAll(/<script src="([^"]+)">/g)].map(m => m[1]), links = [...dev.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
  assert(scripts.length > 20 && links.length === 2); scripts.concat(links).forEach(f => assert(h.includes('"' + f + '?v=' + ver + '"'), f + ' is not stamped')); assert(!/(src|href)="[A-Za-z0-9_.-]+\.(js|css)"/.test(h), 'an unstamped file is left');
  assert(!/\?v=/.test(dev), 'dev/app/index.html has no stamps'); assert.strictEqual(h.replace(/\?v=[^"]+/g, ''), dev, 'nothing else about the page changed');
});
test('scripts are minified with line 1 (the version) kept as written and still parse; the other files are copied as they are; a second run with nothing changed is clean', () => {
  ['app.js', 'season.js', 'pace.js'].forEach(f => {
    const d = fs.readFileSync(path.join(tmp, 'deploy', 'app', f), 'utf8'), v = fs.readFileSync(path.join(tmp, 'dev', 'app', f), 'utf8');
    assert.strictEqual(d.split('\n')[0], v.split('\n')[0], f + ' line 1'); assert(d.length < v.length * 0.8, f + ' is not smaller: ' + d.length + ' vs ' + v.length); new (require('vm').Script)(d, { filename: f });
  });
  ['style.css', 'fonts.css'].forEach(f => assert.strictEqual(fs.readFileSync(path.join(tmp, 'deploy', 'app', f), 'utf8'), fs.readFileSync(path.join(tmp, 'dev', 'app', f), 'utf8'), f + ' is copied as it is'));
  const r = run(); assert(r.ok && !/STOP/.test(r.out), r.out.slice(0, 200));
});
test('a deploy copy made before minifying (the dev file itself) is not mistaken for a change', () => {
  fs.copyFileSync(path.join(tmp, 'dev', 'app', 'csv.js'), path.join(tmp, 'deploy', 'app', 'csv.js')); const r = run(); assert(r.ok && !/STOP/.test(r.out), r.out.slice(0, 200));
});
test('a changed script that kept its version number is still refused, and so is a changed page', () => {
  fs.appendFileSync(path.join(tmp, 'dev', 'app', 'app.js'), '\n;this.__edited = 1;\n');      // a comment-only edit does not change the minified file, so it is not a change let r = run(); assert(!r.ok && /STOP: changed but the version number was not bumped: app\.js/.test(r.out), r.out.slice(0, 200));
  fs.writeFileSync(path.join(tmp, 'dev', 'app', 'app.js'), fs.readFileSync(path.join(root, 'dev', 'app', 'app.js'), 'utf8')); fs.appendFileSync(path.join(tmp, 'dev', 'app', 'index.html'), '\n<!-- edited -->\n'); r = run(); assert(!r.ok && /index\.html/.test(r.out), r.out.slice(0, 200));
});
fs.rmSync(tmp, { recursive: true, force: true });
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
