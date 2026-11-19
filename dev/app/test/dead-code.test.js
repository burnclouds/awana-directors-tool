// R14 part 0 and A: code that was removed because nothing uses it must stay removed (the photo / progress-patch import, Season.givenOf, App.dueFor, the Drive folder leftovers).
// Reads source text only. Usage: node test/dead-code.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(dir, f), 'utf8');
const scripts = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'sw.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

test('the progress-patch import is gone: no planProgressPatch, applyProgressPlan, importProgressPatch or patch report anywhere in the app', () => {
  const hits = []; scripts.forEach(f => { const s = read(f); ['planProgressPatch', 'applyProgressPlan', 'importProgressPatch', 'patchReport', 'PATCH_FORMAT'].forEach(w => { if (s.includes(w)) hits.push(f + ' ' + w); }); });
  assert.deepStrictEqual(hits, []);
});
test('a dropped progress-patch file is named and left out, never opened as a season', () => {
  const s = read('app.js'); assert(/progresspatch/.test(s) && /was removed, so this file was left out/.test(s), 'app.js should say why the file was left out');
});
test('Season.givenOf is gone (read season.given[id] directly; the shown date is givenShown)', () => {
  const S = require('../season.js'); assert.strictEqual(typeof S.givenOf, 'undefined'); assert(!/\bgivenOf\b/.test(read('season.js')));
});
test('app-season.js defines no dueFor and exports none', () => { const s = read('app-season.js'); assert(!/\bdueFor\b/.test(s)); });
test('attHold starts as a plain false', () => { const s = read('app-season.js'); assert(/attHold: false\b/.test(s) && !/attHold: \(\(\)/.test(s)); });
test('app-drive.js has no KEY, loadDirs or st.dirs, and does not touch localStorage', () => {
  const s = read('app-drive.js'); assert(!/\bKEY\b|loadDirs|\bdirs:|st\.dirs/.test(s), 'a Drive folder leftover came back'); assert(!/localStorage\.setItem\([^,]*/.exec(s) || /localStorage\.setItem\([^,]*(LAST_KEY|awana-drive-last)/.test(s) && !/localStorage\.setItem\([^,]*(?!LAST_KEY)/.test(s.replace(/localStorage\.setItem\(LAST_KEY/g, '')), 'app-drive.js writes browser storage other than the remembered Drive file');
});
test('no README, doc or agent file still describes the photo agent as part of the app', () => {
  const root = path.join(dir, '..', '..'); assert(!fs.existsSync(path.join(root, 'docs', 'agents', 'progress-sheet-photo-agent.md')));
  assert(!/node test\/progress-patch/.test(fs.readFileSync(path.join(root, 'README.md'), 'utf8')));
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
