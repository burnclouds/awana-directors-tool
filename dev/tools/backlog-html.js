#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const escapeHtml = text => text.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

function renderBacklog(markdown, { forRelease = false } = {}) {
  const heading = /^## Open work\s*$/m.exec(markdown);
  if (!heading) throw new Error('BACKLOG.md is missing its Open work section.');
  const lines = markdown.slice(heading.index + heading[0].length).split(/^## /m)[0].split(/\r?\n/);
  const ids = new Set();
  const open = [];
  const built = [];
  const completed = [];
  for (const [index, line] of lines.entries()) {
    if (!/^- \[/.test(line)) continue;
    const entry = /^- \[([ x])\] \*\*([A-Z]+\d+)\./.exec(line);
    if (!entry) throw new Error('Invalid checklist item in the Open work section of BACKLOG.md.');
    const [, done, id] = entry;
    if (ids.has(id)) throw new Error('Duplicate backlog ID ' + id + '.');
    ids.add(id);
    if (done === 'x') completed.push(id);

    const note = /^  <!-- publish: (.+) -->$/.exec(lines[index + 1] || '');
    if (note?.[1] === 'private') continue;
    const fields = note?.[1].split(' | ').map(text => text.trim());
    if (fields?.length !== 2 || !fields.every(Boolean)) {
      throw new Error('Backlog item ' + id + ' needs a public title and scope or a private marker.');
    }
    const [title, scope] = fields;
    const items = done === 'x' ? built : open;
    items.push(`<li id="${id}"><h3>${id} · ${escapeHtml(title)}</h3><p>${escapeHtml(scope)}</p></li>`);
  }
  if (forRelease && completed.length) {
    throw new Error('Document completed backlog items in version history and archive them before publishing: ' + completed.join(', '));
  }

  const section = (title, items) => `<section><h2>${title}</h2>${items.length ? '<ul>\n' + items.join('\n') + '\n</ul>' : '<p>No items.</p>'}</section>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AWANA backlog</title>
<style>
:root { color-scheme: light dark; }
body { max-width: 46rem; margin: 2rem auto; padding: 0 1rem; background: Canvas; color: CanvasText; font: 1rem/1.55 system-ui, sans-serif; }
nav { display: flex; flex-wrap: wrap; gap: 1rem; }
h1 { margin-bottom: .4rem; }
h2 { margin-top: 2rem; }
ul { list-style: none; padding: 0; }
li { padding: .75rem 0; border-top: 1px solid GrayText; }
h3, li p { margin: 0; }
h3 { font-size: 1rem; }
</style>
</head>
<body>
<nav aria-label="Related pages"><a href="index.html">App</a><a href="version-history.html">Version history</a></nav>
<main>
<h1>AWANA backlog</h1>
<p>Scope estimates cover implementation and targeted checks. They exclude time spent waiting for decisions or records.</p>
${section('Open work', open)}
${built.length ? section('Completed in development', built) + '\n' : ''}</main>
</body>
</html>
`;
}

if (require.main === module) {
  try {
    const output = process.argv[2];
    if (!output) throw new Error('Usage: node dev/tools/backlog-html.js <output.html>');
    const markdown = fs.readFileSync(path.join(__dirname, '..', '..', 'BACKLOG.md'), 'utf8');
    fs.writeFileSync(output, renderBacklog(markdown));
  } catch (error) {
    console.error('STOP: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { renderBacklog };
