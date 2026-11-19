(this.AwanaVersions = this.AwanaVersions || {})['flagtrail.js'] = '1.1.0';
// Flag anything: the rules for naming a clicked element. A flag does not point at a DOM node (screens are redrawn constantly); it keeps a trail, a breadcrumb of labels:
// the tab name, the nearest section heading, the row name, then the element's own label. The same trail is rebuilt later to find the element again. No DOM here: app-flagmode.js
// reads the page and hands the pieces to these functions, so the rules can be tested without a browser. (docs/superpowers/specs/2026-11-10-flag-anything-design.md)
(function (root) {
  const MAX = 60;
  const clean = t => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
  const short = t => { const s = clean(t); return s.length > MAX ? s.slice(0, MAX - 1).trimEnd() + '…' : s; };
  // The first usable text of several candidates (the visible text, then aria-label, then a label beside it, then a column header).
  const firstText = (...c) => { for (const x of c) { const s = short(x); if (s) return s; } return ''; };
  // parts: { tab, heading, row, label } -> the trail, with empty parts left out and a part that repeats the one before it (a row's first cell is the row name) kept once.
  function build(p) { const out = []; [p.tab, p.heading, p.row, p.label].forEach(x => { const s = short(x); if (s && s !== out[out.length - 1]) out.push(s); }); return out; }
  const readable = trail => (trail || []).join(' › ');
  // The part of a label that stays put: a count in brackets ("Notes and flags (5)") and a status word ("to review") change as the page changes, so they are left out when two trails are compared.
  const stable = s => clean(s).replace(/\s*\(\d[\d,]*\)/g, '').replace(/\s+to review$/i, '').trim();
  const same = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => stable(x) === stable(b[i]));
  // Which element does a stored flag mean? candidates: [{ trail, rowIndex, ref }] rebuilt from the page. The same trail and row position wins; with the same trail only (a shorter list now), the first.
  // Nothing matching returns null: the flag stays listed as "spot not found".
  // N20: a flag that names a child (stored.kid) is only ever that child's element: a candidate that is another child's is not a hit, and the child's own beats a position match (a re-sorted table moves the row, not the flag).
  function find(stored, candidates) {
    const t = (stored && stored.trail) || [], ri = (stored && stored.rowIndex) || 0, kid = (stored && stored.kid) || '';
    const hits = (candidates || []).filter(c => same(c.trail, t) && (!kid || (c.kid || '') === kid));
    return hits.find(c => (c.rowIndex || 0) === ri) || hits[0] || null;
  }
  // The view a flag was made in (N20): kid (the child the page is about), sub (the Person tab part), book (the book tab), date (the night), room (the class), quarter, group. Every part is optional.
  // A stored flag is "here" when each part it HAS equals the same part of the view being looked at; a part it does not have is not compared, so a flag made before this existed matches as it always did.
  const SCOPE_FIELDS = ['kid', 'sub', 'book', 'date', 'room', 'quarter', 'group'];
  const scopeOk = (stored, scope) => SCOPE_FIELDS.every(k => !(stored && stored[k]) || (scope && scope[k]) === stored[k]);
  // The position of a row among the rows that share its name (two rows both called "Green" are told apart by this).
  const rowIndexOf = (rowNames, i) => { const n = rowNames[i]; return rowNames.slice(0, i).filter(x => x === n).length; };
  const api = { clean, short, firstText, build, readable, same, stable, find, rowIndexOf, scopeOk, SCOPE_FIELDS, MAX };
  if (typeof module !== 'undefined') module.exports = api; else root.FlagTrail = api;
})(this);
