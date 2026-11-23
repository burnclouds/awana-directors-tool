#!/usr/bin/env node
// Builds the version history page from CHANGELOG.md: one entry per "## " heading (lettered sub-versions such as 1.51.15b included), newest first, grouped into series (1.51, 1.50, earlier),
// as a timeline. Writes one standalone HTML file (no external scripts, styles or fonts); make-deploy.sh copies it into the published app.
// The first section of the changelog (its preamble, which carries repository history) is not shown, and any line about repository resets, purges or real data is left out.
// Usage: node dev/tools/changelog-html.js <output.html>      (test/changelog-html.test.js holds the structure and the "nothing is lost" rule)
'use strict';
const fs = require('fs'), path = require('path');

const root = path.join(__dirname, '..', '..');
const out = process.argv[2];
if (!out) { console.error('usage: node dev/tools/changelog-html.js <output.html>'); process.exit(2); }
const md = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const PRIVATE = /public repo|purge|reset to ONE|GitHub Support|real names|real children|09b0567/i;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Inline markdown: `code`, **bold**, *italic*. Code spans are set aside first so their text is never read as markup, and bold may contain italic (and the reverse).
function inline(s) {
  const codes = []; let t = String(s).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
  t = esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^\w*])\*([^\s*][^*]*?[^\s*]|[^\s*])\*(?![\w*])/g, '$1<em>$2</em>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => '<code>' + esc(codes[+i]) + '</code>');
}

// ---- read the changelog: a heading, then its lines ----
const sections = []; let cur = null;
for (const l of md.split('\n')) {
  if (/^## /.test(l)) { cur = { raw: l.replace(/^## /, '').trim(), body: [] }; sections.push(cur); }
  else if (cur) cur.body.push(l);      // lines before the first heading are the preamble: not shown
}

// "1.51.14 (built 2026-11-17 in `deploy/`; live on GitHub Pages, ...)" is a short title and a note. Only the leading words before " (" are the title.
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function parseHeading(raw) {
  const i = raw.indexOf(' ('); let name = i < 0 ? raw : raw.slice(0, i), meta = i < 0 ? '' : raw.slice(i + 2).replace(/\)\s*$/, '').trim();
  if (PRIVATE.test(meta)) meta = '';
  let when = '', sort = 0; const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(raw), md_ = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})\b/.exec(raw);
  if (iso) { when = MONTH[+iso[2] - 1] + ' ' + (+iso[3]); sort = +iso[2] * 100 + +iso[3]; } else if (md_) { when = md_[1] + ' ' + (+md_[2]); sort = (MONTH.indexOf(md_[1]) + 1) * 100 + +md_[2]; }
  return { name, meta, when, sort };
}

// ---- a section's lines as HTML: paragraphs and bullet lists, with one level of nested bullets placed inside their parent item ----
function bodyHtml(lines) {
  const html = []; let items = null;      // items: [{ text, kids: [text] }]
  const flush = () => {
    if (!items) return;
    html.push('<ul>' + items.map(it => '<li>' + inline(it.text) + (it.kids.length ? '<ul>' + it.kids.map(k => '<li>' + inline(k) + '</li>').join('') + '</ul>' : '') + '</li>').join('') + '</ul>'); items = null;
  };
  for (const raw of lines.filter(l => !PRIVATE.test(l))) {
    const l = raw.replace(/\s+$/, ''); if (!l.trim()) { flush(); continue; }
    const hd = /^#{3,4} (.*)$/.exec(l); if (hd) { flush(); html.push('<h3>' + inline(hd[1]) + '</h3>'); continue; }      // a "### ..." line inside a version is a sub-heading
    const m = /^(\s*)- (.*)$/.exec(l);
    if (m) { if (!items) items = []; if (m[1].length >= 2 && items.length) items[items.length - 1].kids.push(m[2]); else items.push({ text: m[2], kids: [] }); }
    else { flush(); html.push('<p>' + inline(l.trim()) + '</p>'); }
  }
  flush(); return html.join('\n');
}

// ---- group into series by version number; an entry with no number (Unreleased: ..., Before 1.40) stays in the series before it, or goes to "earlier" ----
const SERIES = { '1.51': '1.51 series', '1.50': '1.50 series', earlier: 'Earlier versions' };
const slug = t => t.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
const used = new Set(), idOf = name => { let b = 'v-' + (/^\d+\.\d+/.test(name) ? slug(name.split(' ')[0]) : slug(name).slice(0, 36).replace(/-$/, '')), id = b, n = 2; while (used.has(id)) id = b + '-' + n++; used.add(id); return id; };
const entries = []; let lastKey = '1.51';
sections.forEach((s, k) => {
  const h = parseHeading(s.raw), v = /^(\d+)\.(\d+)/.exec(h.name);
  const key = v ? (+v[1] === 1 && +v[2] >= 51 ? '1.51' : +v[1] === 1 && +v[2] === 50 ? '1.50' : 'earlier') : /^Before/i.test(h.name) ? 'earlier' : lastKey;
  lastKey = key; entries.push(Object.assign(h, { key, id: idOf(h.name), body: bodyHtml(s.body), first: k === 0 }));
});
const OPEN_COUNT = 3;
const entryHtml = (e, k) => '<details class="ver" id="' + e.id + '"' + (k < OPEN_COUNT ? ' open' : '') + '><summary><b class="vn">' + esc(e.name) + '</b>' + (e.when ? '<span class="when">' + esc(e.when) + '</span>' : '') + (e.first ? '<span class="tag">Latest</span>' : '') + '</summary>' +
  '<div class="body">' + (e.meta ? '<p class="meta">' + inline(e.meta) + '</p>' : '') + e.body + '</div></details>';
const groups = ['1.51', '1.50', 'earlier'].map(key => ({ key, list: entries.filter(e => e.key === key) })).filter(g => g.list.length);
const range = g => { const ds = g.list.filter(e => e.when); return ds.length > 1 && ds[0].when !== ds[ds.length - 1].when ? ds[ds.length - 1].when + ' to ' + ds[0].when : ds.length ? ds[0].when : ''; };
let n = 0;
const seriesHtml = groups.map(g => '<section class="series" id="s-' + g.key.replace('.', '') + '"><h2>' + esc(SERIES[g.key]) + '</h2><p class="srange">' + g.list.length + (g.list.length === 1 ? ' entry' : ' entries') + (range(g) ? ', ' + esc(range(g)) : '') + '</p>' +
  '<div class="spine">' + g.list.map(e => entryHtml(e, n++)).join('\n') + '</div></section>').join('\n');
const jump = groups.map(g => '<a href="#s-' + g.key.replace('.', '') + '">' + esc(SERIES[g.key]) + ' (' + g.list.length + ')</a>').join('');
const index = '<details class="index"><summary>All versions (' + entries.length + ')</summary>' + groups.map(g => '<h3>' + esc(SERIES[g.key]) + '</h3><p class="idx">' + g.list.map(e => '<a href="#' + e.id + '">' + esc(e.name.length > 34 ? e.name.slice(0, 33) + '…' : e.name) + '</a>').join('') + '</p>').join('') + '</details>';

const CSS = `
:root { color-scheme: light; --bg:#f3f5f8; --panel:#fff; --ink:#17202a; --mute:#596574; --line:#d6dce4; --accent:#1b5fa7; --accent-soft:#e4edf8; --dot:#fff; --hover:#eef2f7;
  padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark; --bg:#12171e; --panel:#1a212b; --ink:#e6ebf2; --mute:#9aa6b6; --line:#2f3947; --accent:#7ab0ea; --accent-soft:#1f3047; --dot:#1a212b; --hover:#212a36; } }
:root[data-theme="dark"] { color-scheme: dark; --bg:#12171e; --panel:#1a212b; --ink:#e6ebf2; --mute:#9aa6b6; --line:#2f3947; --accent:#7ab0ea; --accent-soft:#1f3047; --dot:#1a212b; --hover:#212a36; }
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--bg); color: var(--ink); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding-block: 28px 64px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
main { max-width: 50rem; margin: 0 auto; }
h1 { font-size: 1.75rem; line-height: 1.2; margin: 0 0 8px; text-wrap: balance; }
.lede { margin: 0 0 18px; color: var(--mute); max-width: 60ch; }
.bar { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; margin: 0 0 14px; }
.bar a, .bar button { font: inherit; font-size: .875rem; color: var(--accent); background: var(--accent-soft); border: 0; border-radius: 999px; padding: 4px 12px; text-decoration: none; cursor: pointer; }
.bar button { color: var(--ink); background: var(--panel); border: 1px solid var(--line); }
.bar .sp { flex: 1; } nav.jump { display: flex; flex-wrap: wrap; gap: 8px 10px; }
.bar a, .bar button { line-height: 1.5; }
a:focus-visible, button:focus-visible, summary:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; border-radius: 6px; }
details.index { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 0 14px; margin: 0 0 6px; }
details.index > summary { padding: 10px 0; }
details.index h3 { font-size: .8125rem; font-weight: 600; color: var(--mute); margin: 10px 0 4px; }
details.index p.idx { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0 0 12px; font-size: .875rem; }
details.index p.idx a { color: var(--accent); text-decoration: none; font-variant-numeric: tabular-nums; } details.index p.idx a:hover { text-decoration: underline; }
summary { cursor: pointer; list-style: none; } summary::-webkit-details-marker { display: none; }
section.series { margin-top: 34px; }
section.series > h2 { font-size: 1.25rem; margin: 0; } p.srange { margin: 0 0 14px; color: var(--mute); font-size: .875rem; }
.spine { border-left: 2px solid var(--line); margin-left: 6px; }
details.ver { position: relative; margin-left: 20px; border-radius: 8px; }
details.ver::before { content: ""; position: absolute; left: -28px; top: 15px; width: 12px; height: 12px; border-radius: 50%; background: var(--dot); border: 2px solid var(--mute); }
details.ver[open]::before { border-color: var(--accent); background: var(--accent); }
details.ver > summary { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; padding: 8px 34px 8px 10px; border-radius: 8px; position: relative; }
details.ver > summary:hover { background: var(--hover); }
details.ver > summary::after { content: ""; position: absolute; right: 14px; top: 15px; width: 7px; height: 7px; border-right: 2px solid var(--mute); border-bottom: 2px solid var(--mute); transform: rotate(-45deg); transition: transform .15s; }
details.ver[open] > summary::after { transform: rotate(45deg); }
@media (prefers-reduced-motion: reduce) { details.ver > summary::after { transition: none; } }
.vn { font-size: 1.0625rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.when { color: var(--mute); font-size: .875rem; }
.tag { font-size: .75rem; font-weight: 600; color: var(--accent); background: var(--accent-soft); border-radius: 999px; padding: 0 9px; }
.body { padding: 2px 10px 18px; max-width: 72ch; }
.body h3 { font-size: .9375rem; margin: 16px 0 4px; color: var(--mute); }
.body p { margin: 8px 0; } .body p.meta { color: var(--mute); font-size: .875rem; }
.body ul { margin: 8px 0; padding-left: 1.15em; } .body li { margin: 10px 0; padding-left: 2px; } .body li::marker { color: var(--mute); }
.body ul ul { margin: 6px 0 2px; padding-left: 1.05em; border-left: 2px solid var(--line); list-style: none; } .body ul ul > li { margin: 8px 0; padding-left: 10px; font-size: .9375rem; }
code { font: .85em ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--accent-soft); padding: 1px 3px; border-radius: 4px; overflow-wrap: anywhere; }
@media (max-width: 560px) { body { font-size: 15.5px; padding-top: 20px; } h1 { font-size: 1.4rem; } details.ver { margin-left: 16px; } details.ver::before { left: -24px; } .body { padding-left: 4px; padding-right: 4px; } }
@media print { body { background: #fff; color: #000; padding: 0; } .bar, details.index { display: none; } details.ver > summary::after { display: none; } .spine { border-color: #999; } .body { max-width: none; } details.ver { break-inside: auto; } details.ver > summary { break-after: avoid; } }
`;
const JS = `
(function () {
  var all = function () { return [].slice.call(document.querySelectorAll('details.ver')); }, bar = document.getElementById('tools');
  if (bar) bar.hidden = false;
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button[data-all]'); if (b) all().forEach(function (d) { d.open = b.getAttribute('data-all') === 'open'; }); });
  function show() { var id = decodeURIComponent(location.hash.slice(1)), el = id && document.getElementById(id); if (el) { if (el.tagName === 'DETAILS') el.open = true; var up = el.closest && el.closest('details.ver'); if (up) up.open = true; el.scrollIntoView(); } }
  window.addEventListener('hashchange', show); show();
  var was = []; window.addEventListener('beforeprint', function () { was = all().map(function (d) { return d.open; }); all().forEach(function (d) { d.open = true; }); });
  window.addEventListener('afterprint', function () { all().forEach(function (d, i) { d.open = was[i]; }); });
})();
`;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="claude:viewport-fit-sides" content="cover">
<title>AWANA version history</title>
<style>${CSS}</style></head>
<body><main>
<h1>AWANA Roster &amp; Reports: version history</h1>
<p class="lede">What changed in each version, newest first. The latest three are open; open any other to read it. Lettered versions (such as 1.51.15b) are small releases between two numbered ones.</p>
<div class="bar"><nav class="jump" aria-label="Series">${jump}</nav><a href="backlog.html">Backlog</a><span class="sp"></span><span id="tools" hidden><button type="button" data-all="open">Expand all</button> <button type="button" data-all="close">Collapse all</button></span></div>
${index}
${seriesHtml}
</main><script>${JS}</script></body></html>
`;
fs.writeFileSync(out, html);
console.log('wrote ' + out + ' (' + entries.length + ' versions, ' + Math.round(html.length / 1024) + ' KB)');
