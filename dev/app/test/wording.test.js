// UX-14 / UX-28 (batch 9): one word per concept in the labels people read. Node check on the source text (no browser).
// Glossary: Class (not Room) for a child's class; Clubbers and Volunteers (not Kids, Adults) in controls; one inactive control: Active / Inactive / Everyone; Binders is the Reports group, the button says "Print class binders".
// Usage: node test/wording.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const app = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(app, 'index.html'), 'utf8'), appjs = fs.readFileSync(path.join(app, 'app.js'), 'utf8');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const controls = html.replace(/<div id="tab-help"[\s\S]*$/, '').replace(/<section id="tab-help"[\s\S]*?<\/section>/, '');      /* the labels outside the How it works text */

test('no banned label variants in the controls', () => {
  ['Kids + volunteers', 'Kids only', 'Clubbers and adults', 'Adults only', 'Active only', 'Inactive only', 'Active and inactive', 'show inactive', 'All rooms'].forEach(w => assert(!controls.includes(w) && !appjs.includes('>' + w + '<'), 'still says: ' + w));
});
test('the class label is Class, not Room, on Roster, Attendance and Reports', () => {
  assert(/<label>Class <select id="attRoom">/.test(html), 'Attendance'); assert(/<label id="oRoom">Class <select id="oRoomSel">/.test(html), 'Reports'); assert(/label: 'Class', val: p => Model\.room\(p\)/.test(appjs), 'Roster column');
});
test('one inactive control with the same three words on Roster and Person', () => {
  assert(/<select id="fInactive"[^>]*><option value="active">Active<\/option><option value="inactive">Inactive<\/option><option value="all">Everyone<\/option>/.test(html), 'Roster');
  assert(/<select id="peInactive"><option value="active">Active<\/option><option value="inactive">Inactive<\/option><option value="all">Everyone<\/option>/.test(html), 'Person');
});
test('Binders: the Reports group is Binders and the button says Print class binders', () => {
  assert(/data-rsub="binders"[^>]*>Binders</.test(html) || /data-rsub="bin[a-z]*" role="tab">Binders</.test(html), 'the Reports group'); assert(/<button id="btnBinders">Print class binders&hellip;<\/button>/.test(html), 'the button'); assert(!/<button id="btnBinders">Binders/.test(html));
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
