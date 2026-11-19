// R13: the documents say what the code does. Pins the parts that drift: the README's test list, script order and tab groups, the words "Progress tab" and "nothing is uploaded",
// where settings are kept, and release numbers in headers. Reads source text only (README, BACKLOG, index.html, dev/app/*.js).
// Usage: node test/docs-in-step.test.js     (no arguments)
const assert = require('assert'), fs = require('fs'), path = require('path');
const appDir = path.join(__dirname, '..'), root = path.join(appDir, '..', '..'), testDir = __dirname;
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const stripJsComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const stripHtmlComments = html => html.replace(/<!--[\s\S]*?-->/g, '');
const lineOf = (text, i) => text.slice(0, i).split('\n').length;
const readme = read('README.md'), backlog = read('BACKLOG.md'), html = read('dev/app/index.html');
const appJs = fs.readdirSync(appDir).filter(f => f.endsWith('.js') && f !== 'sw.js');

test('every test file is named in the README', () => {
  assert(!'test/person-flags.test.js'.includes('test/flags.test.js'), 'the prefix rule would hide a substring match');      // self-check: "test/<file>" cannot match inside another name
  const missing = fs.readdirSync(testDir).filter(f => /\.test\.js$/.test(f)).filter(f => !readme.includes('test/' + f));
  assert.deepStrictEqual(missing, [], missing.length + ' tests not in the README: ' + missing.join(', '));
});
test("the README's script order is the page's script order", () => {
  const m = /Script load order matters[^:]*:\s*`([^`]+)`/.exec(readme); assert(m, 'the README sentence about script load order was not found');
  const doc = m[1].split(/,\s*/).map(s => s.trim() + '.js'), tags = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(x => x[1]).filter(f => !['drive-config.js', 'drive.js', 'app-drive.js'].includes(f));
  assert.deepStrictEqual(doc, tags, 'README order differs from index.html');
  const after = readme.slice(m.index); ['drive-config', 'drive', 'app-drive'].forEach(n => assert(after.includes(n), 'the README does not name ' + n + ' after the script list'));
});
test("the README's tab groups are the tab strip", () => {
  const strip = html.slice(html.indexOf('<nav class="tabs"'), html.indexOf('</nav>', html.indexOf('<nav class="tabs"')));
  const groups = [...strip.matchAll(/<div class="tabgrp"[^>]*>([\s\S]*?)\n<\/div>/g)].map(g => ({ name: /grphead[^>]*>\s*([^<]*?)\s*</.exec(g[1])[1], tabs: [...g[1].matchAll(/<button data-tab="[^"]+"[^>]*>([\s\S]*?)<\/button>/g)].map(b => b[1].replace(/<[^>]*>/g, '').trim()) }));
  assert(groups.length >= 4, 'could not read the tab strip (found ' + groups.length + ' groups)');
  const line = readme.split('\n').find(l => /^Tabs, in four groups/.test(l)); assert(line, 'the README line "Tabs, in four groups" was not found');
  const doc = [...line.matchAll(/\*\*([^*]+)\*\* \(([^)]*)\)/g)].map(g => ({ name: g[1], tabs: g[2].split(/,\s*/) }));
  groups.forEach(g => { const d = doc.find(x => x.name === g.name); assert(d, 'README has no group ' + g.name); assert.deepStrictEqual(d.tabs, g.tabs, g.name + ': README ' + d.tabs.join(', ') + ' vs page ' + g.tabs.join(', ')); });
});
test('no user-visible text sends people to a "Progress tab"', () => {
  const hits = [], scan = (label, text) => { for (const m of text.matchAll(/\bProgress tabs?\b/g)) hits.push(label + ':' + lineOf(text, m.index)); };
  appJs.forEach(f => scan(f, stripJsComments(fs.readFileSync(path.join(appDir, f), 'utf8')))); scan('index.html', stripHtmlComments(html)); scan('README.md', readme);
  assert.deepStrictEqual(hits, [], '"Progress tab" at ' + hits.join(', '));
});
test('nothing promises "nothing is uploaded"', () => {
  const hits = []; [['index.html', html], ['README.md', readme]].forEach(([n, t]) => { for (const m of t.matchAll(/nothing is uploaded/gi)) hits.push(n + ':' + lineOf(t, m.index)); });
  assert.deepStrictEqual(hits, [], 'found at ' + hits.join(', '));
  const sp = html.slice(html.indexOf('<section id="splash"')), p = /<p>([\s\S]*?)<\/p>/.exec(sp); assert(p, 'the splash paragraph was not found');
  assert(/this computer/.test(p[1]), 'the splash line does not say where the file goes (this computer)'); assert(!/Google Drive/.test(p[1]) || /\b(if|when|only)\b/.test(p[1]), 'the splash line names Google Drive without a condition');
});
test('the README says settings are in the data file, not the browser', () => {
  assert(!/localStorage/.test(readme), 'README mentions localStorage');
  const bad = readme.split(/(?<=\.)\s/).filter(s => /per browser|per machine|kept in the browser/i.test(s) && !/\bnothing\b|\bnot\b/i.test(s)); assert.deepStrictEqual(bad.map(s => s.slice(0, 60)), [], 'README says something is kept in the browser');
  // The only browser write allowed is the remembered Drive file (N41): a per-browser convenience, never a setting. Any other write fails.
  const writes = appJs.filter(f => (fs.readFileSync(path.join(appDir, f), 'utf8').match(/localStorage\.setItem\([^,]*/g) || []).some(c => !/LAST_KEY|awana-drive-last/.test(c))); assert.deepStrictEqual(writes, [], 'code writes localStorage: ' + writes.join(', '));
});
test('README and BACKLOG headers carry no release number', () => {
  const head = readme.split('\n').slice(0, 5).join('\n'); assert(!/\bapp \d+\.\d+/.test(head), 'README header has a release number'); assert(!/\bapp \d+\.\d+/.test(backlog.split('\n')[0]), 'BACKLOG line 1 has a release number');
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
