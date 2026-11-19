// N9 point 1 (point 5 folded in): what is in the committed deploy/ folder is checked, not just dev. Only app files go out; the try/ folder holds only invented TEST club files; no secret reaches the public site.
// The Drive client ID and API key in drive-config.js are public by design (browser keys, restricted by referrer in Google's console): they are not secrets.
// Planted problems are only ever written to temporary copies, never to the repo. Invented data only. Usage: node test/deploy-contents.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const TEXT = /\.(js|html|css|json|csv|svg|md|txt)$/i;
const walk = (dir, rel = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name), path.join(rel, e.name)) : [path.join(rel, e.name)]);
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[a-z]{2,})/gi, PHONE = /(?<!\d)(\d{3})[-. ](\d{3})[-. ](\d{4})(?!\d)/g;
const SAFE_DOMAIN = /(^|\.)(example\.(com|org|net)|invalid)$/i;

// Returns a list of problems in a deploy/app folder. Empty list = clean.
function problems(app) {
  const out = [], files = walk(app);
  files.forEach(f => {
    const inTry = f.startsWith('try' + path.sep), base = path.basename(f);
    if (!inTry) {
      if (!/\.(js|html|css)$/.test(base) && base !== 'manifest.json' && !/^icon.*\.(png|svg)$/.test(base)) out.push('not an app file outside try/: ' + f);
    } else if (!(/TEST.*\.(json|csv)$/.test(base) || base === 'manifest.json')) out.push('not a TEST file in try/: ' + f);
    if (inTry && /\.json$/.test(base) && base !== 'manifest.json') {
      let j = null; try { j = JSON.parse(fs.readFileSync(path.join(app, f), 'utf8')); } catch (e) { out.push('try/ json does not parse: ' + f); }
      if (j && j.fake !== true) out.push('try/ json is not marked fake: ' + f);
    }
    if (inTry && TEXT.test(base)) {
      const text = fs.readFileSync(path.join(app, f), 'utf8');
      for (const m of text.matchAll(EMAIL)) if (!SAFE_DOMAIN.test(m[1])) { out.push('e-mail outside the invented domains in ' + f); break; }
      for (const m of text.matchAll(PHONE)) if (!(m[2] === '555' && /^01\d\d$/.test(m[3]))) { out.push('phone-shaped number outside 555-01xx in ' + f); break; }
    }
  });
  const cfg = path.join(app, 'drive-config.js');
  if (fs.existsSync(cfg) && /client_secret|refresh_token|-----BEGIN/.test(fs.readFileSync(cfg, 'utf8'))) out.push('drive-config.js holds a secret (client secret, refresh token or a key block)');
  const sw = path.join(app, 'sw.js');
  if (fs.existsSync(sw) && /__RELEASE__|__SHELL__/.test(fs.readFileSync(sw, 'utf8'))) out.push('sw.js has an unstamped placeholder (__RELEASE__ or __SHELL__)');
  return out;
}
const real = path.join(__dirname, '..', '..', '..', 'deploy', 'app');
test('the committed deploy/ folder is clean', () => { assert(fs.existsSync(real), 'no deploy/app folder'); assert.deepStrictEqual(problems(real), []); });

// Invented phone shape: NNN-555-01xx (the exchange is 555, the last four digits 01xx).
// Each planted case copies deploy/app to a temporary folder and adds one problem; the check must name it.
const copyTo = dir => { fs.cpSync(real, dir, { recursive: true }); return dir; };
const planted = (label, plant, expect) => test('a planted ' + label + ' is caught', () => {
  const tmp = copyTo(fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-contents-')));
  try { plant(tmp); const p = problems(tmp); assert(p.some(x => x.includes(expect)), 'not reported; got: ' + (p.join(' | ') || 'nothing')); }
  finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
planted('stray file in the app folder', d => fs.writeFileSync(path.join(d, 'notes.txt'), 'x'), 'not an app file outside try/: notes.txt');
planted('json in try/ without TEST in its name', d => { fs.mkdirSync(path.join(d, 'try'), { recursive: true }); fs.writeFileSync(path.join(d, 'try', 'club.json'), JSON.stringify({ fake: true })); }, 'not a TEST file in try/');
planted('TEST json without the fake flag', d => { fs.mkdirSync(path.join(d, 'try'), { recursive: true }); fs.writeFileSync(path.join(d, 'try', 'x-TEST.json'), JSON.stringify({ people: [] })); }, 'not marked fake');
planted('e-mail outside the invented domains', d => { fs.mkdirSync(path.join(d, 'try'), { recursive: true }); fs.writeFileSync(path.join(d, 'try', 'x-TEST.csv'), 'Email\nsomeone@realmail.test\n'); }, 'e-mail outside the invented domains');
planted('phone number outside 555-01xx', d => { fs.mkdirSync(path.join(d, 'try'), { recursive: true }); fs.writeFileSync(path.join(d, 'try', 'x-TEST.csv'), 'Phone\n614-867-5309\n'); }, 'phone-shaped number outside 555-01xx');
planted('secret in drive-config.js', d => fs.appendFileSync(path.join(d, 'drive-config.js'), '\n// client_secret: placeholder\n'), 'holds a secret');
planted('unstamped service worker', d => fs.writeFileSync(path.join(d, 'sw.js'), "const RELEASE = '__RELEASE__';\n"), 'unstamped placeholder');
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
