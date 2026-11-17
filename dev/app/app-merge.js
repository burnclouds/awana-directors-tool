(this.AwanaVersions = this.AwanaVersions || {})['app-merge.js'] = '1.0.0';
// Merge a data file (File menu > Merge a data file): the screen for datamerge.js. Three steps, nothing is saved until Apply on the last one:
//   1. Summary of everything the merge would do, as a categorized diff (counts, filters, a download).
//   2. The real conflicts, if there are any: each one needs a choice (Keep mine, Take theirs, or Edit).
//   3. The summary again with the decisions in it, and Apply.
(function () {
  const App = window.App, esc = App.esc, $ = id => document.getElementById(id), DM = window.DataMerge, Season = window.Season;
  let dlg = null, P = null, choices = {}, step = 'summary', fname = '', fCat = '', fTag = '', cfg = {}, done = null;
  const L = () => ({ mine: cfg.mineLabel || 'Keep mine', other: cfg.otherLabel || 'Take theirs', apply: cfg.applyLabel || 'Apply merge', title: cfg.title || 'Merge ' + fname + ' into this file', allOther: cfg.allOtherLabel || 'Take all theirs' });
  const people = () => { const m = {}; (App.master ? App.master.people : []).forEach(p => { m[p[Model.X.ID]] = Model.fullName(p); }); return m; };
  const show = v => v === undefined || v === null || v === '' ? '(blank)' : typeof v === 'object' ? (Array.isArray(v) ? v.length + ' items' : Object.keys(v).length + ' entries') : String(v);
  function ensure() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog'); dlg.id = 'mergeDlg'; dlg.className = 'mergedlg'; dlg.setAttribute('aria-label', 'Merge a data file');
    dlg.addEventListener('click', onClick); dlg.addEventListener('change', onChange); dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
    document.body.appendChild(dlg); return dlg;
  }
  function close(result) { const d = done; done = null; if (dlg && dlg.open) dlg.close(); P = null; choices = {}; if (d) d(result || null); }
  function counts(c) {
    return '<p class="mgcounts"><b>Added ' + c.Added + '</b> &middot; <b>Changed ' + c.Changed + '</b> &middot; <b>Review ' + c.Review + '</b> &middot; Agreed ' + c.Agreed + (c.Conflicts ? ' &middot; <b>' + c.Conflicts + ' to decide</b>' : '') + '</p>';
  }
  function table(S) {
    const cats = S.categories.filter(k => !fCat || k.name === fCat);
    return cats.map(k => {
      const rows = k.rows.filter(r => !fTag || r.tag === fTag); if (!rows.length) return '';
      return '<details class="mgcat" open><summary>' + esc(k.name) + ' (' + rows.length + ')</summary><table class="roster mgtable"><thead><tr><th>Where</th><th>Now here</th><th>After the merge</th><th>Tag</th><th>From</th></tr></thead><tbody>' +
        rows.map(r => '<tr class="mg-' + r.tag.toLowerCase() + '"><td>' + esc(r.where) + '</td><td>' + esc(r.now) + '</td><td>' + esc(r.after) + '</td><td><span class="mgtag mgtag-' + r.tag.toLowerCase() + '">' + r.tag + '</span></td><td>' + esc(r.from) + '</td></tr>').join('') + '</tbody></table></details>';
    }).join('') || '<p class="status">Nothing in the other file changes anything here.</p>';
  }
  function filters(S) {
    return '<p class="mgfilters"><label>Category <select id="mgCat"><option value="">All</option>' + S.categories.map(k => '<option' + (k.name === fCat ? ' selected' : '') + '>' + esc(k.name) + '</option>').join('') + '</select></label> ' +
      '<label>Tag <select id="mgTag"><option value="">All</option>' + DM.TAGS.map(t => '<option' + (t === fTag ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label> ' +
      '<button type="button" data-mg="dl-text">Download summary (text)</button> <button type="button" data-mg="dl-csv">Download summary (CSV)</button></p>';
  }
  function conflictRow(c, i) {
    const ch = choices[c.id] || {}, isDate = /^\d{4}-\d{2}-\d{2}$/.test(String(c.mine || c.other || '')), name = 'mgc' + i;
    return '<tr data-cid="' + esc(c.id) + '"><td>' + esc(DM.words(P, c.p)) + '<br><span class="status">' + esc(DM.categoryOf(c.p)) + '</span></td>' +
      '<td><label><input type="radio" name="' + name + '" value="mine"' + (ch.pick === 'mine' ? ' checked' : '') + '> ' + esc(L().mine) + ': <b>' + esc(show(c.mine)) + '</b></label></td>' +
      '<td><label><input type="radio" name="' + name + '" value="other"' + (ch.pick === 'other' ? ' checked' : '') + '> ' + esc(L().other) + ': <b>' + esc(show(c.other)) + '</b></label></td>' +
      (typeof c.mine === 'object' || typeof c.other === 'object' ? '<td></td>' : '<td><label><input type="radio" name="' + name + '" value="edit"' + (ch.pick === 'edit' ? ' checked' : '') + '> Edit: <input type="' + (isDate ? 'date' : 'text') + '" data-edit value="' + esc(ch.value || '') + '"></label></td>') + '</tr>';
  }
  function render() {
    const d = ensure(), S = DM.summary(P, step === 'summary' ? undefined : choices), left = S.counts.Undecided;
    let body = '<h2>' + esc(L().title) + '</h2>' + (cfg.intro ? '<p class="status">' + esc(cfg.intro) + '</p>' : '');
    if (step === 'summary') {
      body += '<p class="status">Step 1: everything this merge would do. Nothing is changed until you press ' + esc(L().apply) + ' at the end.' + (P.shared ? '' : ' These two files do not share a history, so every difference is compared directly.') + '</p>' + counts(S.counts) + filters(S) + table(S);
    } else if (step === 'conflicts') {
      body += '<p class="status">Step 2: ' + P.conflicts.length + ' place' + (P.conflicts.length === 1 ? '' : 's') + ' where both files have a different value. Choose one for each. Roster and club-record ones come first.</p>' +
        '<p><button type="button" data-mg="all-mine">' + esc(cfg.allMineLabel || 'Keep all mine') + '</button> <button type="button" data-mg="all-theirs">' + esc(L().allOther) + '</button> <span class="status" id="mgLeft">' + (left ? left + ' still to decide' : 'All decided') + '</span></p>' +
        '<table class="roster mgtable"><thead><tr><th>Where</th><th colspan="3">Choose</th></tr></thead><tbody>' + P.conflicts.map(conflictRow).join('') + '</tbody></table>';
    } else {
      body += '<p class="status">' + (P.conflicts.length ? 'Step 3: the summary with your decisions. ' : '') + 'Read it, then ' + esc(L().apply) + '. The merge is one entry in History, so it can be undone.</p>' + counts(S.counts) + filters(S) + table(S);
    }
    const b = [];
    b.push('<button type="button" data-mg="cancel">Cancel</button>');
    if (step !== 'summary') b.push('<button type="button" data-mg="back">Back</button>');
    if (step === 'summary') b.push(P.conflicts.length ? '<button type="button" class="primary" data-mg="next">Next: decide ' + P.conflicts.length + ' conflict' + (P.conflicts.length === 1 ? '' : 's') + '</button>' : '<button type="button" class="primary" data-mg="apply">' + esc(L().apply) + '</button>');
    else if (step === 'conflicts') b.push('<button type="button" class="primary" id="mgNext" data-mg="final"' + (left ? ' disabled' : '') + '>Next: review the final summary</button>');
    else b.push('<button type="button" class="primary" data-mg="apply">' + esc(L().apply) + '</button>');
    d.innerHTML = body + '<div class="mgbtns">' + b.join(' ') + '</div>';
    if (!d.open) d.showModal();
  }
  function download(kind) {
    const S = DM.summary(P, step === 'summary' ? undefined : choices), text = kind === 'csv' ? DM.toCsv(S) : DM.toText(P, S);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: kind === 'csv' ? 'text/csv' : 'text/plain' })); a.download = 'merge-summary.' + (kind === 'csv' ? 'csv' : 'txt');
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function onClick(e) {
    const b = e.target.closest('[data-mg]'); if (!b) return; const k = b.dataset.mg;
    if (k === 'cancel') close();
    else if (k === 'next') { step = 'conflicts'; render(); }
    else if (k === 'back') { step = step === 'final' ? 'conflicts' : 'summary'; if (step === 'summary' && P.conflicts.length === 0) step = 'summary'; render(); }
    else if (k === 'final') { if (DM.summary(P, choices).counts.Undecided) return; step = 'final'; render(); }
    else if (k === 'all-mine') { P.conflicts.forEach(c => { choices[c.id] = { pick: 'mine' }; }); render(); }
    else if (k === 'all-theirs') { if (!confirm('Take the other file’s value for all ' + P.conflicts.length + ' conflicts?')) return; P.conflicts.forEach(c => { choices[c.id] = { pick: 'other' }; }); render(); }
    else if (k === 'dl-text') download('text'); else if (k === 'dl-csv') download('csv');
    else if (k === 'apply') {
      const first = P.conflicts.length ? DM.summary(P, choices).counts.Undecided : 0; if (first) return;
      const S = DM.summary(P, P.conflicts.length ? choices : undefined); close({ choices: Object.assign({}, choices), counts: S.counts });
    }
  }
  function onChange(e) {
    if (e.target.id === 'mgCat') { fCat = e.target.value; render(); return; } if (e.target.id === 'mgTag') { fTag = e.target.value; render(); return; }
    const tr = e.target.closest('tr[data-cid]'); if (!tr) return; const id = tr.dataset.cid;
    if (e.target.type === 'radio') { const pick = e.target.value, cur = choices[id] || {}; choices[id] = pick === 'edit' ? { pick, value: cur.value || (tr.querySelector('[data-edit]') || {}).value || '' } : { pick }; }
    else if (e.target.matches('[data-edit]')) { choices[id] = { pick: 'edit', value: e.target.value }; tr.querySelector('input[value="edit"]').checked = true; }
    if (choices[id] && choices[id].pick === 'edit' && !choices[id].value) delete choices[id];      // an Edit with nothing typed is not a decision
    const left = DM.summary(P, choices).counts.Undecided; $('mgLeft').textContent = left ? left + ' still to decide' : 'All decided'; $('mgNext').disabled = !!left;
  }
  // The other file's text in, the dialog out. Roster and calendar of the open file are brought up to date first, so the merge starts from exactly what is on screen.
  App.mergeFile = (text, name) => {
    if (!App.season) return alert('Open or start a data file first: a merge adds another file’s changes to the one that is open.');
    let other; try { other = Season.fromJson(text); } catch (err) { return alert('That file is not a data file this app can read.\n\n' + err.message); }
    const mine = App.mergeIn.current();
    if (other.year && mine.year && other.year !== mine.year && !confirm('That file is for club year ' + other.year + ' and this one is ' + mine.year + '. Merge anyway?')) return;
    const plan = DM.plan(mine, other, Object.assign({ from: name }, App.mergeNames(mine)));
    return App.mergeScreen(plan, { name }).then(r => {
      if (!r) return; const out = DM.finish(plan, r.choices), n = r.counts; App.mergeIn.apply(out);
      App.flash('Merged ' + name + ': added ' + n.Added + ', changed ' + n.Changed + ', ' + n.Review + ' to review. Not saved yet: save the data file when you are ready.', 'info');
    });
  };
  // Names for the summary rows: children by name, books by their title.
  App.mergeNames = season => { const names = people(); return { names: id => names[id] || id, bookName: c => ((season.config.books || {})[c] || {}).name || c }; };
  // Show the screen for a plan and resolve with { choices, counts } when the leader applies, or null when they cancel. cfg: name, title, intro, applyLabel, mineLabel, otherLabel, allMineLabel, allOtherLabel, choices (carried over).
  App.mergeScreen = (plan, o) => new Promise(resolve => {
    if (done) { const d = done; done = null; d(null); }
    P = plan; cfg = o || {}; choices = Object.assign({}, cfg.choices); step = 'summary'; fname = cfg.name || ''; fCat = ''; fTag = ''; done = resolve; render();
  });
  $('fileMerge').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; f.text().then(t => (App.commitScope ? App.commitScope(() => App.mergeFile(t, f.name)) : App.mergeFile(t, f.name))); });
  App.pickMerge = () => $('fileMerge').click();
})();
