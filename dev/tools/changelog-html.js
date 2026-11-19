#!/usr/bin/env node
// Builds the version history page from CHANGELOG.md: one section per version heading (lettered sub-versions such as 1.51.15b included),
// bullets kept as lists, bold and code kept. Writes one standalone HTML file. Nothing is published here: the page is published with the Artifact tool after each deploy.
// Usage: node dev/tools/changelog-html.js <output.html>
'use strict';
const fs = require('fs'), path = require('path');

const root = path.join(__dirname, '..', '..');
const out = process.argv[2];
if (!out) { console.error('usage: node dev/tools/changelog-html.js <output.html>'); process.exit(2); }
const md = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');

// Split into sections at "## " headings. The first section (before the first heading) is the changelog's intro.
const lines = md.split('\n');
const sections = [];
let cur = { title: '', body: [] };
for (const l of lines) {
  if (/^## /.test(l)) { sections.push(cur); cur = { title: l.replace(/^## /, ''), body: [] }; }
  else cur.body.push(l);
}
sections.push(cur);

// Turn a section's lines into HTML: paragraphs, bullet lists (with one level of nesting), and sub-headings as plain bold lines.
function bodyHtml(body) {
  const html = []; let list = null, sub = null;
  body = body.filter(l => !PRIVATE.test(l));
  const closeList = () => { if (sub) { list.push('</ul>'); sub = null; } if (list) { html.push(list.join('')); list = null; } };
  for (const raw of body) {
    const l = raw.replace(/\s+$/, '');
    if (!l.trim()) { closeList(); continue; }
    const top = /^- /.test(l), nested = /^ {2,}- /.test(l);
    if (top) { closeList(); list = ['<ul>', '<li>' + inline(l.replace(/^- /, '')) + '</li>']; }
    else if (nested && list) { if (!sub) { list.push('<ul>'); sub = true; } list.push('<li>' + inline(l.replace(/^\s*- /, '')) + '</li>'); }
    else { closeList(); html.push('<p>' + inline(l.trim()) + '</p>'); }
  }
  closeList();
  return html.join('\n');
}

// The page: the intro, the version list, then one section per heading. Ids are the heading text, made URL-safe.
const id = t => 'v-' + t.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
const headed = sections.filter(s => s.title);
const toc = headed.map(s => '<a href="#' + id(s.title) + '">' + esc(s.title.split(' (')[0]) + '</a>').join('');
// Public page: the changelog preamble (its Published line is repository history) is not shown, and any entry about repository resets, purges or real data is left out.
const PRIVATE = /public repo|purge|reset to ONE|GitHub Support|real names|real children|09b0567/i;
const intro = 'The version history of the AWANA Roster & Reports app. Built from the changelog; each version and its lettered sub-versions are listed below.';
const body = headed.map(s => '<section class="ver" id="' + id(s.title) + '"><h2>' + esc(s.title) + '</h2>\n' + bodyHtml(s.body) + '</section>').join('\n');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="claude:viewport-fit-sides" content="cover">
<title>AWANA version history</title>
<style>
:root { color-scheme: light; --bg:#f6f5f1; --panel:#fff; --ink:#1d2430; --mute:#5b6470; --line:#d9dde3; --accent:#1f5fa8; --accent-soft:#e6eef9;
  padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark; --bg:#14181f; --panel:#1c222c; --ink:#e8ecf2; --mute:#9aa5b4; --line:#323a47; --accent:#7fb2ea; --accent-soft:#223347; } }
:root[data-theme="dark"] { color-scheme: dark; --bg:#14181f; --panel:#1c222c; --ink:#e8ecf2; --mute:#9aa5b4; --line:#323a47; --accent:#7fb2ea; --accent-soft:#223347; }
html, body { margin: 0; }
body { background: var(--bg); color: var(--ink); font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding-block: 24px 48px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
main { max-width: 860px; margin: 0 auto; }
h1 { font-size: 26px; margin: 0 0 6px; text-wrap: balance; }
h2 { font-size: 18px; margin: 0 0 6px; color: var(--accent); text-wrap: balance; }
nav.toc { display: flex; flex-wrap: wrap; gap: 6px; margin: 16px 0 22px; }
nav.toc a { color: var(--accent); text-decoration: none; background: var(--accent-soft); padding: 2px 9px; border-radius: 999px; font-size: 13px; }
section.ver { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; margin: 0 0 12px; scroll-margin-top: 12px; }
ul { padding-left: 20px; margin: 6px 0; } li { margin: 4px 0; } ul ul { margin: 2px 0; }
code { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--accent-soft); padding: 0 4px; border-radius: 4px; overflow-wrap: anywhere; }
.intro { color: var(--mute); }
</style></head>
<body><main>
<h1>AWANA Roster &amp; Reports: version history</h1>
<div class="intro">${intro}</div>
<nav class="toc" aria-label="Versions">${toc}</nav>
${body}
</main></body></html>
`;
fs.writeFileSync(out, html);
console.log('wrote ' + out + ' (' + headed.length + ' versions, ' + Math.round(html.length / 1024) + ' KB)');
