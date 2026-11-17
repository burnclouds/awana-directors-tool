(this.AwanaVersions = this.AwanaVersions || {})['app-store.js'] = '1.5.3';
// Awana store points tab: weights, minimum and maximum are kept in the data file (season.config.store); everything else is worked out by store.js.
(function () {
  const App = window.App, esc = App.esc, $ = id => document.getElementById(id);
  const ui = { view: 'projected', group: 'All', sort: 'points' };
  const bar = (n, max) => '<span class="sbar" style="width:' + (max ? Math.round(n / max * 120) : 0) + 'px"></span>';
  const tile = (big, small) => '<div class="stat"><b>' + big + '</b><span>' + small + '</span></div>';
  const th = (h, i) => '<th' + (i ? ' class="num"' : '') + '>' + h + '</th>';
  const table = (head, rows) => '<div class="scroll" style="max-height:none"><table class="roster"><thead><tr>' + head.map(th).join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  // The settings to edit: normalized, except that a minimum and maximum the person typed are kept as typed (a minimum above the maximum shows a warning; it must not quietly move the maximum).
  const cfgOf = () => { const raw = App.season.config.store || {}, c = Store.normalize(raw); if (Number.isFinite(+raw.min) && raw.min !== '') c.min = Math.max(0, +raw.min); if (Number.isFinite(+raw.max) && raw.max !== '') c.max = +raw.max; delete c.warning; return c; };
  const save = c => { const o = Object.assign({}, c); delete o.warning; App.season.config.store = o; App.touch(); };
  // Only the Direct method has a projection: with Proportional and Range the pace factor cancels out, so "projected" would always equal "so far".
  const view = () => ui.view === 'now' || !(App.season && cfgOf().method === 'direct') ? 'now' : 'projected';
  const compute = () => Store.compute({ master: App.master, season: App.season, calendar: App.calendar, today: App.today() });

  // The settings fields (minimum, maximum, method, programs, weights). Shared with the Options tab, which shows the same fields and uses the same change handler (storeSettingChange).
  function settingsFields(c, typed) {
    return '<div class="pgrid">' +
      '<label class="pf">Minimum points per child<input type="text" inputmode="numeric" data-k="min" value="' + typed.min + '"></label>' +
      '<label class="pf">Maximum points per child<input type="text" inputmode="numeric" data-k="max" value="' + typed.max + '"></label>' +
      '<label class="pf wide">How earnings become store points' + Info.html('store.method') + '<select data-k="method">' + Store.METHODS.map(m => '<option value="' + m[0] + '"' + (c.method === m[0] ? ' selected' : '') + '>' + esc(m[1]) + '</option>').join('') + '</select></label></div>' +
      (c.warning ? '<p class="status dirty">' + esc(c.warning) + '</p>' : '') +
      '<p><b>Programs in the store</b>' + Info.html('store.programs') + ' <span class="status">(children in an unticked program are left out of every number below)</span></p><p>' + Store.PROGRAMS.map(g => '<label style="margin-right:16px"><input type="checkbox" data-p="' + esc(g) + '"' + (c.programs.includes(g) ? ' checked' : '') + '> ' + esc(g) + '</label>').join('') + '</p>' +
      '<p><b>Weights</b>' + Info.html('store.weights') + ' <span class="status">(points per earning; 0 leaves it out)</span></p><div class="pgrid">' + Store.CATS.map(([k, label]) => '<label class="pf">' + esc(label) + '<input type="text" inputmode="decimal" data-w="' + k + '" value="' + c.weights[k] + '"></label>').join('') + '</div>';
  }

  function render() {
    const el = $('storeWrap');
    if (!App.master || !App.season) { el.innerHTML = '<p class="status">Import a data file first (Import&hellip;).</p>'; return; }
    const r = compute(), c = r.cfg, typed = cfgOf(), v = view(), s = r[v], pk = v === 'now' ? 'now' : 'projected';
    const noData = !r.nightsSoFar;
    let h = '<p class="status">What each child can spend at the Awana store at the end of the year. Points are built from the earnings already kept in this file, each multiplied by a weight you choose, then held between the minimum and maximum. Change a weight and press Tab or Enter: the numbers below update at once. Weights are saved in the data file.</p>';

    h += '<section class="pcard"><h3>Settings</h3>' + settingsFields(c, typed) +
      '<p>' + (c.method === 'direct' ? '<button id="stFit" title="Multiplies every weight so the best child lands exactly on the maximum">Scale weights so the top child reaches ' + c.max + '</button> ' : '') + '<button id="stReset">Reset weights to 1</button> <button id="stCsv">Download as CSV</button></p></section>';

    const direct = c.method === 'direct';
    h += (direct ? '<p>Show: <label><input type="radio" name="stView" value="projected"' + (v === 'projected' ? ' checked' : '') + '> projected to the end of the year</label> &nbsp; <label><input type="radio" name="stView" value="now"' + (v === 'now' ? ' checked' : '') + '> so far</label></p>' : '<p class="status">With this method the points depend on how the children compare, so waiting for more nights does not change them: there is no separate projection. Choose Direct to see one.</p>') +
     (direct ? 
      '<p class="status">' + (noData ? 'No attendance has been entered on a club night yet, so there is nothing to project.' : r.nightsSoFar + ' of ' + r.nightsTotal + ' club nights are in. Projected = each child keeps earning at the pace so far for the other ' + (r.nightsTotal - r.nightsSoFar) + ' nights (x' + r.factor + '). Awards and book work often come in bursts at the end, so treat that part as a rough guide.') + '</p>' : '');

    h += '<div class="stgrid">' + tile(s.kids, 'children counted') + tile(s.total.toLocaleString(), 'store points in all') + tile(s.average, 'average per child') + tile(s.median, 'median') +
      tile(s.atMin, 'at the minimum (' + c.min + ')') + tile(s.atMax, 'at the maximum (' + c.max + ')') + '</div>';

    const maxShare = Math.max(1, ...r.categories.map(x => x.share));
    h += '<h3>Where the points come from</h3>' + table(['Earning', 'Weight', 'Club total', 'Weighted', 'Share', '', 'Avg per child', 'Best child'], r.categories.map(x =>
      '<tr><td>' + esc(x.label) + '</td><td class="num">' + x.weight + '</td><td class="num">' + x.total + '</td><td class="num">' + x.weightedTotal + '</td><td class="num">' + x.share + '%</td><td>' + bar(x.share, maxShare) + '</td><td class="num">' + x.average + '</td><td class="num">' + x.best + '</td></tr>').join('')) +
      '<p class="status">Share = that earning\'s part of everything given out, counting what has been earned so far. A large share is a lever: a small change to its weight moves everyone.</p>';

    h += '<h3>Participation and Extra by class</h3><p class="status">Use this to decide whether to count these two marks and how much. Where a class gives a mark to nearly every child, it mostly repeats attendance; where classes differ a lot, the same mark is worth different amounts depending on the teacher.</p>' +
      App.markUseHtml(Stats.markUse({ master: App.master, season: App.season, calendar: App.calendar }), r.markShare);
    h += '<h3>How the points are spread</h3>' + (() => { const hist = r.hist[pk], mx = Math.max(1, ...hist.map(b => b.count)); return table(['Points', 'Children', ''], hist.map(b => '<tr><td>' + b.from + ' to ' + b.to + '</td><td class="num">' + b.count + '</td><td>' + bar(b.count, mx) + '</td></tr>').join('')); })();

    h += '<h3>By program</h3>' + table(['Program', 'Children', 'Average', 'Median', 'Lowest', 'Highest', 'At minimum', 'At maximum'], r.groups.map(g => { const x = g[pk];
      return '<tr><td>' + esc(g.group) + '</td><td class="num">' + g.kids + '</td><td class="num">' + x.average + '</td><td class="num">' + x.median + '</td><td class="num">' + x.min + '</td><td class="num">' + x.max + '</td><td class="num">' + x.atMin + '</td><td class="num">' + x.atMax + '</td></tr>'; }).join('')) +
      '<p class="status">Average earnings so far by program (to see who earns what): ' + r.groups.map(g => esc(g.group) + ' &mdash; ' + Store.CATS.filter(([k]) => g.avg[k]).map(([k, l]) => l.split(' (')[0].toLowerCase() + ' ' + g.avg[k]).join(', ')).join(' &nbsp;|&nbsp; ') + '</p>';

    const list = r.kids.filter(k => ui.group === 'All' || k.group === ui.group).sort((a, b) => ui.sort === 'name' ? a.name.localeCompare(b.name) : b[pk] - a[pk] || a.name.localeCompare(b.name));
    h += '<h3>Every child</h3><p>Program <select id="stGroup" aria-label="Program">' + ['All'].concat(c.programs).map(g => '<option' + (g === ui.group ? ' selected' : '') + '>' + g + '</option>').join('') + '</select> ' +
      'Order <select id="stSort" aria-label="Sort order"><option value="points"' + (ui.sort === 'points' ? ' selected' : '') + '>Most points first (' + (pk === 'now' ? 'points now' : 'projected') + ')</option><option value="name"' + (ui.sort === 'name' ? ' selected' : '') + '>Name</option></select></p>' +
      table(['Name', 'Class', 'Att.', 'Hbk', 'Part.', 'Extra', 'Place', 'Spirit', 'Awards', 'Sect.', 'Weighted', direct ? 'Points now' : 'Store points'].concat(direct ? ['Projected'] : []), list.map(k => { const n = k.counts, mark = k[pk] === c.min ? ' <small>min</small>' : k[pk] === c.max ? ' <small>max</small>' : '';
        return '<tr><td><a href="#" data-person="' + esc(k.id) + '">' + esc(k.name) + '</a></td><td>' + esc(k.room) + '</td><td class="num">' + n.attendance + '</td><td class="num">' + n.handbook + '</td><td class="num">' + n.participation + '</td><td class="num">' + n.extra + '</td><td class="num">' + n.place + '</td><td class="num">' + n.spirit + '</td><td class="num">' + n.awards + '</td><td class="num">' + (n.sections || '') + '</td><td class="num">' + (v === 'now' ? k.rawNow : k.rawProjected) + '</td><td class="num">' + (v === 'now' ? '<b>' + k.now + '</b>' + mark : k.now) + '</td>' + (direct ? '<td class="num">' + (v === 'projected' ? '<b>' + k.projected + '</b>' + mark : k.projected) + '</td>' : '') + '</tr>'; }).join(''));
    el.innerHTML = h;
  }

  const csv = r => Csv.serialize([['Name', 'Class', 'Program', 'Attendance', 'Handbook', 'Participation', 'Extra', 'Game place points', 'Game spirit points', 'Awards', 'Sections', 'Weighted so far', 'Store points so far', 'Weighted projected', 'Store points projected']]
    .concat(r.kids.map(k => [k.name, k.room, k.group, k.counts.attendance, k.counts.handbook, k.counts.participation, k.counts.extra, k.counts.place, k.counts.spirit, k.counts.awards, k.counts.sections, k.rawNow, k.now, k.rawProjected, k.projected])));

  // An edit of one store setting (a min/max box, the method, a program tick or a weight). Returns true if t was one of them (and the setting was saved).
  function storeSettingChange(t) {
    if (!App.season || !t.dataset || !(t.dataset.p || t.dataset.w || t.dataset.k)) return false;
    // the programs always stay in the club's usual order
    if (t.dataset.p) { const c = cfgOf(); c.programs = Store.PROGRAMS.filter(g => g === t.dataset.p ? t.checked : c.programs.includes(g)); if (!c.programs.includes(ui.group)) ui.group = 'All'; save(c); return true; }
    const c = cfgOf(), val = String(t.value).trim().replace(',', '.');
    if (t.dataset.w) { const n = parseFloat(val); if (!(n >= 0)) return true; c.weights[t.dataset.w] = n; }
    else if (t.dataset.k === 'method') c.method = t.value;
    else { const n = parseInt(val, 10); if (!(n >= 0)) return true; c[t.dataset.k] = n; }      // min / max are kept as typed, so a minimum above the maximum keeps showing its warning
    save(c); return true;
  }
  App.storeSettings = { html: () => App.season ? settingsFields(Store.normalize(App.season.config.store || {}), cfgOf()) : '', change: storeSettingChange };

  $('storeWrap').addEventListener('change', e => {
    const t = e.target;
    if (t.name === 'stView') { ui.view = t.value; render(); return; }
    if (t.id === 'stGroup') { ui.group = t.value; render(); return; }
    if (t.id === 'stSort') { ui.sort = t.value; render(); return; }
    if (storeSettingChange(t)) render();
  });
  $('storeWrap').addEventListener('click', e => {
    const a = e.target.closest('a[data-person]'); if (a) { e.preventDefault(); App.showPerson(a.dataset.person); return; }
    if (!App.season) return;
    if (e.target.id === 'stReset') { const c = cfgOf(); Object.keys(c.weights).forEach(k => { c.weights[k] = k === 'sections' ? 0 : 1; }); save(c); render(); }
    if (e.target.id === 'stFit') {
      const r = compute(), f = r.fitFactor[view()], c = cfgOf();
      if (!f) return alert('Nothing has been earned yet, so there is nothing to scale.');
      Object.keys(c.weights).forEach(k => { c.weights[k] = Math.round(c.weights[k] * f * 100) / 100; }); save(c); render();
    }
    if (e.target.id === 'stCsv') { const r = compute(); App.testGate(e.target, () => App.download('Awana store points ' + App.today() + '.csv', csv(r), 'text/csv;charset=utf-8')); }
  });
  App.tabs.store = render;
  App.onRefresh.push(() => { if (!$('tab-store').hidden) render(); });
})();
