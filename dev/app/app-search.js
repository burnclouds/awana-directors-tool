(this.AwanaVersions = this.AwanaVersions || {})['app-search.js'] = '1.0.0';
// Search for a person, as Planning Center does: press "/" anywhere except while typing in a box (the Help tab keeps its own "/" search).
// Three tabs: People (opens the Person page on Progress), To do (only people with a To do item; opens the Person page with its To do notes),
// Awards (opens the Awards part of the Person page). Up and Down choose, Enter opens, Esc closes; clicking a tab or a name works too.
// Names only: no phone numbers or emails are shown or searched. Nothing here changes any data.
(function () {
  const App = window.App, $ = id => document.getElementById(id), esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TABS = [['people', 'People'], ['todo', 'To do'], ['awards', 'Awards']];
  const LIMIT = 50;
  let tab = 'people', results = [], sel = 0, wrap = null;

  const style = document.createElement('style');
  style.textContent = '.gsearch{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:50;display:flex;align-items:flex-start;justify-content:center;padding:10vh 12px 12px}' +
    '.gsearch[hidden]{display:none}' +
    '.gsearch .gbox{background:var(--panel);color:inherit;border:1px solid var(--line);border-radius:8px;width:min(520px,100%);max-height:70vh;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.4)}' +
    '.gsearch input{font:inherit;padding:10px 12px;border:0;border-bottom:1px solid var(--line);background:transparent;color:inherit;border-radius:8px 8px 0 0}' +
    '.gsearch .gtabs{display:flex;gap:4px;padding:6px 8px;border-bottom:1px solid var(--line)}' +
    '.gsearch .gtabs button[aria-selected=true]{font-weight:700;text-decoration:underline}' +
    '.gsearch ul{list-style:none;margin:0;padding:4px 0;overflow:auto}' +
    '.gsearch li{padding:8px 14px;cursor:pointer}' +
    '.gsearch li[aria-selected=true]{background:var(--head)}' +
    '.gsearch .ghint{padding:6px 14px;font-size:12px;opacity:.7;border-top:1px solid var(--line)}';
  document.head.appendChild(style);

  function build() {
    wrap = document.createElement('div'); wrap.className = 'gsearch'; wrap.id = 'gSearch'; wrap.hidden = true;
    wrap.innerHTML = '<div class="gbox" role="dialog" aria-modal="true" aria-label="Search people">' +
      '<input type="text" id="gSearchQ" placeholder="Search people by name" aria-label="Search people by name" autocomplete="off">' +
      '<div class="gtabs" role="tablist">' + TABS.map(([k, l]) => '<button type="button" role="tab" data-gtab="' + k + '">' + l + '</button>').join('') + '</div>' +
      '<ul id="gSearchList" role="listbox"></ul>' +
      '<div class="ghint">Up and Down choose · Enter opens · Esc closes</div></div>';
    document.body.appendChild(wrap);
    $('gSearchQ').addEventListener('input', refresh);
    wrap.addEventListener('click', e => {
      const t = e.target.closest('button[data-gtab]'); if (t) { tab = t.dataset.gtab; refresh(); $('gSearchQ').focus(); return; }
      const li = e.target.closest('li[data-id]'); if (li) { sel = +li.dataset.i; open(); return; }
      if (e.target === wrap) close();
    });
  }

  const people = () => (App.master && App.master.people) || [];
  function refresh() {
    const q = $('gSearchQ').value.trim(), nq = Model.norm(q);
    let list = nq ? people().filter(p => Model.norm(Model.fullName(p)).includes(nq)) : [];
    if (tab === 'todo') list = list.filter(p => App.todoFor && App.todoFor(p[Model.X.ID]).length);
    results = list.slice(0, LIMIT).map(p => ({ id: p[Model.X.ID], name: Model.fullName(p), room: Model.room(p), active: Model.isActive(p) }));
    sel = 0; draw(q);
  }
  function draw(q) {
    document.querySelectorAll('#gSearch [data-gtab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.gtab === tab)));
    $('gSearchList').innerHTML = !q ? '<li>Type a name.</li>' : !results.length ? '<li>No one matches' + (tab === 'todo' ? ' with a To do item' : '') + '.</li>' :
      results.map((r, i) => '<li role="option" data-id="' + esc(r.id) + '" data-i="' + i + '" aria-selected="' + (i === sel) + '">' + esc(r.name) +
        ' <span class="status">' + esc(r.room) + (r.active ? '' : ' · inactive') + '</span></li>').join('');
  }
  function move(d) {
    if (!results.length) return;
    sel = (sel + d + results.length) % results.length; draw($('gSearchQ').value.trim());
    const li = $('gSearchList').querySelector('li[aria-selected=true]'); if (li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
  }
  function open() {
    const r = results[sel]; if (!r) return;
    close();
    if (tab === 'awards') App.showPerson(r.id, { sub: 'awards' });
    else if (tab === 'todo') App.showPerson(r.id, { attention: true });
    else App.showPerson(r.id, { sub: 'progress' });
  }
  function openSearch() {
    if (!wrap) build();
    wrap.hidden = false; $('gSearchQ').value = ''; results = []; sel = 0; draw('');
    $('gSearchQ').focus();
  }
  function close() { if (wrap) wrap.hidden = true; }
  const isOpen = () => !!wrap && !wrap.hidden;

  // Capture phase, so that while the search is open its Escape, arrows and Enter are taken before any other handler sees them.
  document.addEventListener('keydown', e => {
    if (isOpen()) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); open(); }
      return;
    }
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target || {};
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
    if ($('tab-help') && !$('tab-help').hidden) return;      // the Help tab has its own "/" search
    if (document.querySelector('dialog[open], .modal-wrap:not([hidden]), #splash:not([hidden])')) return;
    if (!people().length) return;
    e.preventDefault(); openSearch();
  }, true);
})();
