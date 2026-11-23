const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderBacklog } = require('../../tools/backlog-html.js');

const input = `## Open work
- [ ] **N1. Private title.** Private description and data.
  <!-- publish: Public & safe <title> | 2 hours -->
- [ ] **N2. Security issue.** Sensitive details.
  <!-- publish: private -->
- [x] **N3. Working notes.**
  <!-- publish: Shipped layout ready | Updated the layout. -->
## Other work
- [ ] **N4. Outside the active list.**
`;
const html = renderBacklog(input);
assert.match(html, /Open work<\/h2>[\s\S]*id="N1"[^\n]*Public &amp; safe &lt;title&gt;[^\n]*2 hours/);
assert.match(html, /Completed in development<\/h2>[\s\S]*id="N3"/);
assert.doesNotMatch(html, /Private title|Private description|Security issue|Sensitive details|id="N2"|Working notes|id="N4"/);
assert.throws(() => renderBacklog(input.replace('  <!-- publish: private -->\n', '')), /N2 needs a public title and scope or a private marker/);
assert.throws(() => renderBacklog(input.replace('Public & safe <title> | 2 hours', 'Public title without scope')), /N1 needs a public title and scope or a private marker/);
assert.throws(() => renderBacklog(input, { forRelease: true }), /archive them before publishing: N3/);
assert.throws(() => renderBacklog(input.replace('- [ ] **N2.', '- [x] **N2.'), { forRelease: true }), /archive them before publishing: N2, N3/);
const afterArchive = input.replace(/^- \[x\].*\n  <!-- publish: .* -->\n/m, '');
assert.doesNotMatch(renderBacklog(afterArchive, { forRelease: true }), /Completed in development|id="N3"/);

const root = path.resolve(__dirname, '..', '..', '..');
const markdown = fs.readFileSync(path.join(root, 'BACKLOG.md'), 'utf8');
const current = renderBacklog(markdown);
if (process.env.AWANA_STRICT_DEPLOY === '1') {
  renderBacklog(markdown, { forRelease: true });
  assert.equal(fs.readFileSync(path.join(root, 'deploy/app/backlog.html'), 'utf8'), current, 'Rebuild the published backlog with make-deploy.sh.');
}
console.log('Public backlog rendering and publication checks passed.');
