// The (i) notes (info.js): well formed, every one is on the page somewhere, every (i) on the page has a note, and the manual's "Which option when" part is the same text.
// Usage: node test/info.test.js
const assert = require('assert'), fs = require('fs'), path = require('path'), Info = require('../info.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..'), html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const code = fs.readdirSync(dir).filter(f => /\.js$/.test(f) && f !== 'info.js').map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n') + html;
test('every note has an area from the list, a title, a one-line tip and a body; keys are unique and written area.name', () => {
  const areas = new Set(Info.AREAS.map(a => a[0])); assert.strictEqual(new Set(Info.keys()).size, Info.keys().length);
  Info.keys().forEach(k => { const n = Info.NOTES[k]; assert(areas.has(n.area), k + ': unknown area ' + n.area); assert(/^[a-z]+\.[a-z]+$/.test(k), k + ': key form'); assert(n.title && n.tip && n.html, k + ': missing a part'); assert(n.tip.length <= 90, k + ': the tip is ' + n.tip.length + ' characters (keep it to a line)'); assert(Info.plain(n.html).length > 60, k + ': body too short to help'); });
  Info.AREAS.forEach(([a]) => assert(Info.keys().some(k => Info.NOTES[k].area === a), 'area ' + a + ' has no note'));
});
test('every note is placed on the page somewhere (an (i) in index.html or in a string a tab builds)', () => {
  Info.keys().forEach(k => assert(new RegExp('data-info="' + k.replace('.', '\\.') + '"|Info\\.html\\(\'' + k.replace('.', '\\.') + '\'\\)').test(code), k + ' is never shown'));
});
test('every (i) on the page names a note that exists', () => {
  const used = [...code.matchAll(/data-info="([a-z]+\.[a-z]+)"|Info\.html\('([a-z]+\.[a-z]+)'\)/g)].map(m => m[1] || m[2]); assert(used.length >= Info.keys().length);
  used.forEach(k => assert(Info.get(k), '(i) for "' + k + '" has no note'));
});
test('the manual\'s "Which option when" section is exactly the notes in info.js (run node dev/tools/sync-guide.js to refresh it)', () => {
  const a = html.indexOf('<!-- guide:start -->') + '<!-- guide:start -->'.length, b = html.indexOf('<!-- guide:end -->');
  assert(a > 30 && b > a, 'markers'); assert.strictEqual(html.slice(a, b), Info.guideHtml());
});
test('the contents lists every tab, every area of the notes and the sections inside the files section, and each link has its target', () => {
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1])), toc = html.slice(html.indexOf('<nav class="toc"'), html.indexOf('</nav>', html.indexOf('<nav class="toc"')));
  ['todo', 'attend', 'games', 'awards', 'progress', 'roster', 'person', 'uniforms', 'calendar', 'stats', 'store', 'reports', 'history', 'options', 'help', 'validate', 'debug'].forEach(t => assert(toc.includes('href="#m-t-' + t + '"') && ids.has('m-t-' + t), 'tab ' + t));
  Info.AREAS.forEach(([a]) => assert(toc.includes('href="#m-opt-' + a + '"') && ids.has('m-opt-' + a), 'area ' + a));
  ['m-f-0', 'm-f-1', 'm-f-2', 'm-f-test', 'm-f-drive'].forEach(t => assert(toc.includes('href="#' + t + '"') && ids.has(t), t));
  assert(html.includes('id="helpQ"') && html.includes('app-help.js'), 'the search box and script');
});
test('the manual does not tell you to "see section N" for a section that moved: every such mention is a link to its place', () => {
  const manual = html.slice(html.indexOf('id="tab-help"'), html.indexOf('</main>')); const bare = [...manual.matchAll(/section \d+/g)].filter(m => !/<a href="#m-[a-z-]+">section \d+<\/a>/.test(manual.slice(Math.max(0, m.index - 30), m.index + 20)) && !/\(Google Drive\)|below/.test(manual.slice(m.index, m.index + 24)));
  assert.strictEqual(bare.length, 0, bare.map(m => manual.slice(m.index - 20, m.index + 14)).join(' | '));
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
