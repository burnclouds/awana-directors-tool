// Version-number guards: every script and the page carry a version, and the page loads exactly the scripts that exist.
// Usage: node test/versions.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}
const scripts = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'sw.js').sort();      // sw.js is the service worker: the page registers it, it is not a script tag and its version is stamped at deploy
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const SEMVER = /^\d+\.\d+\.\d+$/;

test('every script registers its own file name and a version on its first line', () => {
  assert(scripts.length >= 13, 'found ' + scripts.length + ' scripts');
  scripts.forEach(f => {
    const m = /^\(this\.AwanaVersions = this\.AwanaVersions \|\| \{\}\)\['([^']+)'\] = '([^']+)';/.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert(m, f + ': no version line on line 1'); assert.strictEqual(m[1], f, f + ' registers itself as ' + m[1]); assert(SEMVER.test(m[2]), f + ': version "' + m[2] + '" is not x.y.z');
  });
});
test('the page has a version and a build date', () => {
  const v = /<meta name="app-version" content="([^"]*)">/.exec(html), b = /<meta name="app-build" content="([^"]*)">/.exec(html);
  assert(v && /^\d+\.\d+\.\d+[a-z]?$/.test(v[1]), 'app-version meta');      // a release may carry a letter (1.50.45d) assert(b && /^\d{4}-\d{2}-\d{2}$/.test(b[1]), 'app-build meta');
});
test('the page loads every script that exists, once, and nothing that does not', () => {
  const tags = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  assert.deepStrictEqual([...tags].sort(), scripts, 'script tags vs files');
  assert.strictEqual(new Set(tags).size, tags.length, 'a script is loaded twice');
});
test('a script is loaded after the scripts it uses', () => {
  const tags = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]), at = f => tags.indexOf(f);
  [['model.js', 'csv.js'], ['season.js', 'catalog.js'], ['datamerge.js', 'season.js'], ['app-flagmode.js', 'flagtrail.js'], ['app-flagmode.js', 'app-season.js'], ['app-merge.js', 'datamerge.js'], ['app-merge.js', 'app-season.js'], ['validate.js', 'season.js'], ['validate.js', 'intake.js'], ['todo.js', 'intake.js'], ['check.js', 'intake.js'], ['check.js', 'model.js'], ['todo.js', 'check.js'], ['app-options.js', 'check.js'], ['app-options.js', 'app.js'], ['todo.js', 'season.js'], ['app-todo.js', 'app-person.js'], ['app-todo.js', 'todo.js'], ['app.js', 'validate.js'], ['app-stats.js', 'stats.js'], ['app-store.js', 'store.js'], ['app-drive.js', 'drive.js'], ['app-drive.js', 'drive-config.js'], ['app-drive.js', 'app.js'], ['validate.js', 'calendar.js'], ['reports-season.js', 'reports.js'], ['reports.js', 'season.js'], ['slides.js', 'reports-season.js'], ['app-season.js', 'slides.js'], ['app-person.js', 'app-season.js'], ['app.js', 'reports-season.js'], ['app-season.js', 'app.js'], ['app-tools.js', 'app-season.js'], ['app-tools.js', 'validate.js']]
    .forEach(([a, b]) => assert(at(a) > at(b), a + ' must come after ' + b));
});

test('the manual\'s contents links all point at a section, and every tab is covered by a heading', () => {
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1])), links = [...html.matchAll(/href="#(m-[^"]+)"/g)].map(m => m[1]);
  assert(links.length >= 10, 'contents links: ' + links.length);
  links.forEach(l => assert(ids.has(l), 'contents link #' + l + ' has no section'));
  const manual = html.slice(html.indexOf('id="tab-help"'));
  ['Roster', 'To do', 'Person', 'Attendance', 'Color team games', 'Awards', 'Progress', 'Statistics', 'Awana store points', 'History', 'Uniforms', 'Calendar', 'Reports', 'Options', 'Validate', 'Debug']
    .forEach(t => assert(new RegExp('<h3[^>]*>' + t + '( and \\w+)?</h3>').test(manual), 'the manual has no section for the ' + t + ' tab'));
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
