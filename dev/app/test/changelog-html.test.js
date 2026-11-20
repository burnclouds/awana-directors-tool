// The version history page (dev/tools/changelog-html.js builds it from CHANGELOG.md) renders cleanly and loses nothing:
// lists nest properly (the old page staircased 21 levels deep), no markdown shows as text, headings are short, the versions are grouped into series with the newest open, every bullet of the changelog is on the page,
// nothing private is on it, and it is one self-contained file. Reads the real CHANGELOG.md (public text, no personal data). Usage: node test/changelog-html.test.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..', '..', '..'), md = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const out = path.join(os.tmpdir(), 'awana-vh-' + process.pid + '.html'), r = cp.spawnSync('node', [path.join(root, 'dev', 'tools', 'changelog-html.js'), out], { encoding: 'utf8' });
const html = r.status === 0 && fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : ''; try { fs.unlinkSync(out); } catch (e) { /* not written */ }
const PRIVATE = /public repo|purge|reset to ONE|GitHub Support|real names|real children|09b0567/i;
const ent = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const text = h => ent(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<\/?(b|em|code|i|strong)>/g, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');      // inline tags leave no gap ("(`x`)" stays "(x)"); block tags are a space
// Every "## " heading and every bullet line of the changelog, except the lines the public page leaves out on purpose.
const lines = md.split('\n'), headings = lines.filter(l => /^## /.test(l)), bullets = lines.filter(l => /^\s*- /.test(l) && !PRIVATE.test(l));
const plain = s => s.replace(/^\s*- /, '').replace(/\*\*/g, '').replace(/`/g, '').replace(/(^|[^\w*])\*([^\s*][^*]*?[^\s*]|[^\s*])\*/g, '$1$2').replace(/\s+/g, ' ').trim();

test('the generator runs and writes a page', () => { assert.strictEqual(r.status, 0, r.stderr); assert(html.length > 20000, 'page is ' + html.length + ' bytes'); });

// ---- structure ----
test('tags are balanced and lists nest properly: a ul holds only li, an li may hold a ul, depth at most 2', () => {
  const stack = [], VOID = new Set(['meta', 'br', 'hr', 'img', 'input', 'link']); let depth = 0, maxDepth = 0;
  for (const m of html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)) {
    const close = m[1] === '/', tag = m[2].toLowerCase(); if (VOID.has(tag) || /\/$/.test(m[3])) continue;
    if (!close) { const top = stack[stack.length - 1]; if (top === 'ul' && tag !== 'li') throw new Error('<' + tag + '> directly inside <ul>'); if (tag === 'li' && top !== 'ul') throw new Error('<li> outside a <ul> (inside <' + top + '>)'); stack.push(tag); if (tag === 'ul') { depth++; maxDepth = Math.max(maxDepth, depth); } }
    else { const top = stack.pop(); if (top !== tag) throw new Error('</' + tag + '> closes <' + top + '>'); if (tag === 'ul') depth--; }
  }
  assert.strictEqual(stack.length, 0, 'unclosed: ' + stack.join(',')); assert(maxDepth >= 1 && maxDepth <= 2, 'list depth ' + maxDepth);
});
test('every changelog heading is a version entry on the page, and each is a details element with a short title', () => {
  const vers = [...html.matchAll(/<details class="ver"[^>]*>\s*<summary>([\s\S]*?)<\/summary>/g)];
  assert.strictEqual(vers.length, headings.length, vers.length + ' entries for ' + headings.length + ' headings');
  vers.forEach(m => { const t = text(m[1].match(/<b class="vn">([\s\S]*?)<\/b>/) ? m[1].match(/<b class="vn">([\s\S]*?)<\/b>/)[1] : ''); assert(t && t.length <= 60, 'version title "' + t + '" (' + t.length + ' characters)'); });
});
test('anchors are short and unique, and every in-page link has a target', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]); assert.strictEqual(new Set(ids).size, ids.length, 'duplicate ids'); ids.forEach(i => assert(i.length <= 48, 'long id ' + i));
  [...html.matchAll(/href="#([^"]+)"/g)].forEach(m => assert(ids.includes(m[1]), 'link to missing #' + m[1]));
});
test('the newest versions are grouped into series, newest series first, with the three latest entries open', () => {
  const series = [...html.matchAll(/<section class="series"[^>]*>\s*<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(m => text(m[1]));
  assert(series.length >= 3, 'series: ' + series.join(' | ')); assert(/1\.51/.test(series[0]), 'first series is ' + series[0]); assert(/earlier|before/i.test(series[series.length - 1]), 'last series is ' + series[series.length - 1]);
  assert.strictEqual((html.match(/<details class="ver"[^>]*\sopen/g) || []).length, 3, 'open entries');
  assert(html.indexOf('1.51.18') < html.indexOf('1.50.41'), 'newest first');
});
test('the index of all versions lists every version once, and is collapsed', () => {
  const idx = html.match(/<details class="index"[^>]*>([\s\S]*?)<\/details>/); assert(idx, 'no index'); assert(!/<details class="index"[^>]*\sopen/.test(html), 'index is open');
  assert.strictEqual((idx[1].match(/<a /g) || []).length, headings.length, 'index links');
});

// ---- content ----
test('nothing is lost: every bullet of the changelog is on the page', () => {
  const t = text(html), missing = bullets.filter(b => { const p = plain(b); return p && !t.includes(p); });
  assert.strictEqual(missing.length, 0, missing.length + ' bullet(s) missing, first: ' + (missing[0] || '').slice(0, 90));
});
test('the page has one list item for every bullet', () => { assert.strictEqual((html.match(/<li[ >]/g) || []).length, bullets.length); });
test('no markdown shows as text: no ** or backticks, no *italic* markers, no heading hashes', () => {
  const t = text(html); assert(!/\*\*/.test(t), 'a ** is showing'); assert(!/`/.test(t), 'a backtick is showing'); assert(!/(^|\s)\*[A-Za-z][^*]{0,120}\*/.test(t), 'a *word* is showing: ' + (t.match(/(^|\s)\*[A-Za-z][^*]{0,120}\*/) || [''])[0]); assert(!/<(p|li|h\d|summary)[^>]*>\s*#{1,3}\s/.test(html), 'a markdown heading marker starts a block');
});
test('italics and code are real elements', () => { assert(/<em>/.test(html), 'no <em>'); assert(/<code>/.test(html), 'no <code>'); });
test('what the public page leaves out stays out (repository history, real data) and the changelog preamble is not shown', () => {
  assert(!PRIVATE.test(text(html)), 'private text is on the page: ' + (text(html).match(PRIVATE) || [''])[0]); assert(!/Published:/.test(text(html)), 'the Published line is showing');
});
test('one h1, a short intro, and the page is one self-contained file (no external scripts, styles, fonts or images)', () => {
  assert.strictEqual((html.match(/<h1[ >]/g) || []).length, 1); assert(!/<link\b|\ssrc=|@import|url\(/i.test(html.replace(/<style[\s\S]*?<\/style>/g, m => m.replace(/url\(\s*['"]?data:/g, ''))), 'external resource'); assert(!/<script[^>]*\ssrc=/i.test(html));
});
test('dark mode, phone width, keyboard focus and printing are handled', () => {
  assert(/prefers-color-scheme:\s*dark/.test(html)); assert(/name="viewport"/.test(html)); assert(/:focus-visible/.test(html)); assert(/@media print/.test(html)); assert(/beforeprint/.test(html), 'printing must open every entry');
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
