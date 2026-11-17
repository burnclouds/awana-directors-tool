// UX-20: the app uses its own dialog (app-ask.js), not the browser's alert, confirm and prompt. This counts the native calls in every dev/app script and holds each file to the number still allowed in OPEN.
// OPEN only goes DOWN: a file may not gain a native call, and when a file loses some, this test fails until OPEN is lowered to match (so the count cannot drift). At the end of UX-20, OPEN is empty and this test says zero.
// Usage: node test/no-native-dialogs.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const app = path.join(__dirname, '..');
const OPEN = {};      /* UX-20 is complete: no script may call alert, confirm or prompt */
const CALL = /(?<![\w$.])(?:alert|confirm|prompt)\s*\(|window\.(?:alert|confirm|prompt)\s*\(/g;
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => /^\s*\/\//.test(l) ? '' : l.replace(/\s\/\/.*$/, '')).join('\n');      /* comments do not count */
const counts = () => { const out = {}; fs.readdirSync(app).filter(f => /\.js$/.test(f) && f !== 'app-ask.js' && f !== 'sw.js').forEach(f => { const n = (strip(fs.readFileSync(path.join(app, f), 'utf8')).match(CALL) || []).length; if (n) out[f] = n; }); return out; };

test('no script has more native dialog calls than OPEN allows (and no new file gains one)', () => {
  const c = counts(), more = Object.keys(c).filter(f => c[f] > (OPEN[f] || 0)); assert.deepStrictEqual(more.map(f => f + ': ' + c[f] + ' > ' + (OPEN[f] || 0)), [], 'a native alert/confirm/prompt was added: use App.ask (app-ask.js)');
});
test('OPEN is exactly the current count: when a file loses native calls, lower OPEN to match', () => {
  const c = counts(), stale = Object.keys(OPEN).filter(f => (c[f] || 0) < OPEN[f]).map(f => f + ': now ' + (c[f] || 0) + ', OPEN says ' + OPEN[f]); assert.deepStrictEqual(stale, [], 'lower OPEN in test/no-native-dialogs.test.js');
});
test('the helper itself uses none, and says what it offers', () => { const t = fs.readFileSync(path.join(app, 'app-ask.js'), 'utf8'); assert(!(strip(t).match(CALL) || []).length, 'app-ask.js calls a native dialog'); assert(/App\.ask = \{/.test(t)); });
test('UX-20 progress: native calls left in total', () => { const left = Object.values(counts()).reduce((a, b) => a + b, 0); console.log('       native calls left: ' + left + ' (started at 98)'); assert(left <= 98); });

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
