// The release records agree (CR-07): the top CHANGELOG entry names the page's app-version, and when that entry says it was built into deploy/, deploy/ really is that version
// (page, service worker stamp, and every script's version line). While the top entry says "unreleased" the deploy checks are skipped, so the suite stays green between builds.
// Usage: node test/release-consistency.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
let passed = 0, failed = 0;
function test(name, fn) { try { const r = fn(); passed++; console.log('  ' + (r === 'skip' ? 'skip ' : 'ok   ') + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const root = path.join(__dirname, '..', '..', '..'), dev = path.join(root, 'dev', 'app'), dep = path.join(root, 'deploy', 'app');
const read = f => fs.readFileSync(f, 'utf8'), meta = (html, n) => ((new RegExp('<meta name="' + n + '" content="([^"]*)"').exec(html)) || [])[1];
const log = read(path.join(root, 'CHANGELOG.md')), top = /^## (\S+) (\([^\n]*\))/m.exec(log) || [], topVer = top[1], topNote = top[2] || '';
const devVer = meta(read(path.join(dev, 'index.html')), 'app-version');

test('the top CHANGELOG entry is the page version', () => { assert.strictEqual(topVer, devVer, 'CHANGELOG says ' + topVer + ', index.html says ' + devVer); });
test('the Published line does not call the top version committed or live before it is', () => {
  const pub = (/\*\*Published:\*\*[^\n]*/.exec(log) || [''])[0];
  assert(!new RegExp(topVer.replace(/\./g, '\\.') + '[^.\\n]{0,40}(committed|live on)', 'i').test(pub) || /unreleased/.test(topNote) === false, 'Published line: ' + pub.slice(0, 160));
});
test('when the top entry says it is built in deploy/, deploy/ is that version, with the same script versions as dev', () => {
  // N9 point 1: AWANA_STRICT_DEPLOY (set in pages.yml) makes the check real whatever the CHANGELOG says: dev and deploy/ must match.
  if (!process.env.AWANA_STRICT_DEPLOY && (!/built/.test(topNote) || /unreleased/.test(topNote))) return 'skip';
  assert(fs.existsSync(path.join(dep, 'index.html')), 'deploy/app/index.html is missing');
  assert.strictEqual(meta(read(path.join(dep, 'index.html')), 'app-version'), devVer, 'deploy/ page version');
  const bad = [];
  fs.readdirSync(dev).filter(f => /\.js$/.test(f) && f !== 'sw.js' && f !== 'drive-config.js').forEach(f => {
    const v = s => (/\['[^']+'\] = '([^']+)'/.exec(s.split('\n', 1)[0]) || [])[1];
    if (!fs.existsSync(path.join(dep, f))) return bad.push(f + ' missing from deploy/');
    if (v(read(path.join(dev, f))) !== v(read(path.join(dep, f)))) bad.push(f + ' ' + v(read(path.join(dev, f))) + ' (dev) vs ' + v(read(path.join(dep, f))) + ' (deploy)');
  });
  assert.deepStrictEqual(bad, [], 'out of step with deploy/');
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
