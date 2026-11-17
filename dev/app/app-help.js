(this.AwanaVersions = this.AwanaVersions || {})['app-help.js'] = '1.1.0';
// How it works: search. Every heading, paragraph, list item and option note of the manual is an entry; a search needs every word you type (anywhere in the entry, in any order, any capitals),
// lists the best matches under the section they are in, and a click scrolls to that exact line and marks the words. The index is built from the page the first time it is needed, so it can never go out of date.
(function () {
  const App = window.App, $ = id => document.getElementById(id), esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let index = null, marked = [];
  const clean = t => t.replace(/\s+/g, ' ').trim();
  const has = (low, t) => new RegExp('(^|[^a-z0-9])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(low);      // a word that starts with what was typed: "merge" finds merged, not emergency
  function build() {
    const root = document.querySelector('#tab-help .manual'), out = []; let h2 = null, h3 = null;
    const crumb = () => [h2 && h2.title, h3 && h3.title].filter(Boolean).join(' › ');
    const add = (el, anchor, kind) => { const text = clean(el.textContent); if (text.length > 1) out.push({ el, anchor, kind, text, low: text.toLowerCase(), crumb: crumb() }); };
    root.querySelectorAll('h2, h3, h4, p, li, pre, summary, .optnote').forEach(el => {
      if (el.closest('nav.toc, .helpsearch, #helpResults')) return;
      if (el.matches('h2')) { h2 = { title: clean(el.textContent).replace(/^\d+\.\s*/, ''), el }; h3 = null; add(el, el, 'h'); }
      else if (el.matches('h3')) { h3 = { title: clean(el.textContent), el }; add(el, el, 'h'); }
      else if (el.matches('h4')) { if (!el.closest('.optnote')) add(el, el, 'h'); }
      else if (el.matches('.optnote')) { const t = clean(el.querySelector('h4').textContent); out.push({ el, anchor: el, kind: 'note', text: clean(el.textContent), low: clean(el.textContent).toLowerCase(), title: t, crumb: crumb() + ' › ' + t }); }
      else if (!el.closest('.optnote')) add(el, el, el.matches('summary') ? 'h' : 'p');      // an option note is one entry, not one per line
    });
    return out;
  }
  const clearMarks = () => { marked.forEach(m => { const p = m.parentNode; if (p) { p.replaceChild(document.createTextNode(m.textContent), m); p.normalize(); } }); marked = []; };
  function markIn(el, terms) {
    const re = new RegExp('(?<![A-Za-z0-9])(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi'), walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [];
    while (walker.nextNode()) if (re.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode); re.lastIndex = 0;
    nodes.forEach(n => { const frag = document.createDocumentFragment(); n.nodeValue.split(re).forEach((part, i) => { if (i % 2) { const m = document.createElement('mark'); m.className = 'hit'; m.textContent = part; frag.appendChild(m); marked.push(m); } else if (part) frag.appendChild(document.createTextNode(part)); }); n.parentNode.replaceChild(frag, n); });
  }
  function snippet(e, terms) {
    const i = Math.min(...terms.map(t => { const k = e.low.search(new RegExp('(^|[^a-z0-9])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); return k < 0 ? 1e9 : k; })), from = Math.max(0, i - 50), t = (from ? '…' : '') + e.text.slice(from, from + 170) + (from + 170 < e.text.length ? '…' : '');
    return esc(t).replace(new RegExp('(?<![A-Za-z0-9])(' + terms.map(x => esc(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi'), '<mark>$1</mark>');
  }
  function search(q) {
    const terms = [...new Set(clean(q).toLowerCase().split(' ').filter(Boolean))], res = $('helpResults'), count = $('helpCount');
    clearMarks();
    if (!terms.length) { res.hidden = true; res.innerHTML = ''; count.textContent = ''; return; }
    index = index || build();
    const hits = index.filter(e => terms.every(t => has(e.low, t))).map(e => ({ e, score: (e.kind === 'h' || e.kind === 'note' ? 6 : 0) + terms.reduce((n, t) => n + (has((e.title || (e.kind === 'h' ? e.text : '')).toLowerCase(), t) ? 4 : 0), 0) + (e.kind === 'note' ? 2 : 0) }))
      .sort((a, b) => b.score - a.score || index.indexOf(a.e) - index.indexOf(b.e));
    count.textContent = hits.length ? hits.length + (hits.length === 1 ? ' match' : ' matches') + (hits.length > 20 ? ' (showing the best 20: add a word to narrow it)' : '') : 'no match';
    res.hidden = false;
    res.innerHTML = hits.length ? '<ol>' + hits.slice(0, 20).map((h, i) => '<li><a href="#" data-hit="' + index.indexOf(h.e) + '"><span class="hcrumb">' + esc(h.e.crumb) + '</span><span class="hsnip">' + snippet(h.e, terms) + '</span></a></li>').join('') + '</ol>'
      : '<p class="status">Nothing in the manual has all of those words. Try fewer words, or part of a word (&ldquo;attend&rdquo; finds Attendance and attended).</p>';
    res._terms = terms;
  }
  function go(i, terms) {
    const e = index[i]; if (!e) return; clearMarks(); openAround(e.el);
    if (e.kind !== 'h') markIn(e.el, terms);
    e.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); e.el.classList.add('found'); setTimeout(() => e.el.classList.remove('found'), 2500);
  }
  const openAround = el => { const d = el.closest && el.closest('details'); if (d) d.open = true; };      // an example is folded until opened; a result or a link inside one opens it
  // Each example file in the manual gets Copy and Download buttons (a plain download of the example text, not the app's own save).
  document.querySelectorAll('#tab-help pre[data-example]').forEach(pre => {
    const bar = document.createElement('p'); bar.className = 'exbtns'; bar.innerHTML = '<button type="button" data-excopy>Copy</button><button type="button" data-exdl>Download this example</button><span class="status" role="status"></span>'; pre.insertAdjacentElement('afterend', bar);
    bar.addEventListener('click', e => {
      const say = t => { bar.querySelector('.status').textContent = t; setTimeout(() => { bar.querySelector('.status').textContent = ''; }, 2500); };
      if (e.target.closest('[data-excopy]')) { (navigator.clipboard ? navigator.clipboard.writeText(pre.textContent) : Promise.reject()).then(() => say('Copied'), () => { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); say('Selected: press Ctrl+C'); }); }
      if (e.target.closest('[data-exdl]')) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([pre.textContent], { type: /\.json$/.test(pre.dataset.file) ? 'application/json' : 'text/csv' })); a.download = pre.dataset.file; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); say('Downloaded ' + pre.dataset.file); }
    });
  });
  const q = $('helpQ'); if (!q) return;
  q.addEventListener('input', () => search(q.value));
  q.addEventListener('keydown', e => {
    if (e.key === 'Escape') { q.value = ''; search(''); }
    if (e.key === 'Enter') { const a = $('helpResults').querySelector('a[data-hit]'); if (a) { e.preventDefault(); go(+a.dataset.hit, $('helpResults')._terms); } }
  });
  $('helpResults').addEventListener('click', e => { const a = e.target.closest('a[data-hit]'); if (a) { e.preventDefault(); go(+a.dataset.hit, $('helpResults')._terms); } });
  document.addEventListener('keydown', e => { if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !$('tab-help').hidden && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName)) { e.preventDefault(); q.focus(); q.select(); } });
  // The contents links and the (i) "How it works" links land on a heading: show where it is.
  $('tab-help').addEventListener('click', e => { const a = e.target.closest('nav.toc a, .manual a[href^="#m-"], .manual a[href^="#o-"]'); if (!a) return; const t = document.getElementById(a.getAttribute('href').slice(1)); if (t) { e.preventDefault(); openAround(t); t.scrollIntoView({ block: 'start', behavior: 'smooth' }); t.classList.add('found'); setTimeout(() => t.classList.remove('found'), 2500); } });
  App.helpSearch = search;
})();
