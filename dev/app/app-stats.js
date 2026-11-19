(this.AwanaVersions = this.AwanaVersions || {})['app-stats.js'] = '1.8.2';
// Statistics tab: draws what stats.js works out. Read-only; changes nothing.
(function () {
  const App = window.App, esc = App.esc, $ = id => document.getElementById(id);
  let sub = 'attendance';      // which Statistics group is showing; kept while the page redraws
  let span = 'season';         // the night-by-night figures: the whole season or one quarter (S15). Its own picker; the app-wide quarter is not used.
  const r1 = x => x === null || x === undefined ? '—' : String(Math.round(x * 10) / 10);
  // S15: children and adults per held night, each on its own. Adults leave out nights with no adults marked.
  function nightBlock(s) {
    const spans = ['season', 'Q1', 'Q2', 'Q3', 'Q4'], have = new Set(s.nights.map(n => n.quarter));
    const f = Stats.nightFigures(s.nights, span), label = span === 'season' ? 'the whole season' : span;
    const dates = list => list.length ? list.map(md).join(', ') : '—';
    const col = x => x.n === 0 ? [['Nights counted', '0'], ['Highest', '—'], ['Lowest', '—'], ['Average', '—'], ['Median', '—'], ['Mode', '—'], ['Standard deviation (population, σ)', '—'], ['Standard deviation (sample, s)', '—']]
      : [['Nights counted', x.n], ['Highest', x.max + ' <small>' + dates(x.maxDates) + '</small>'], ['Lowest', x.min + ' <small>' + dates(x.minDates) + '</small>'],
         ['Average (mean)', r1(x.mean)], ['Median', r1(x.median)], ['Mode', x.modes.length ? x.modes.map(r1).join(' and ') : (x.n > 1 ? 'none, every night different' : r1(x.mean))],
         ['Standard deviation (population, σ)', r1(x.popSd)], ['Standard deviation (sample, s)', x.sampleSd === null ? 'needs 2 nights' : r1(x.sampleSd)]];
    const c = col(f.children), a = f.adults.n ? col(f.adults) : null;
    const body = c.map((row, i) => '<tr><td>' + row[0] + '</td><td class="num">' + row[1] + '</td><td class="num">' + (a ? a[i][1] : (i === 0 ? 'No adults marked on these nights' : '—')) + '</td></tr>');
    return '<h3>Night by night: children and adults' + (span === 'season' ? '' : ', ' + esc(span)) + '</h3>' +
      '<div class="statspan noprint" role="group" aria-label="Which nights"><span class="status">Statistics for:</span> ' + spans.map(x => '<button type="button" data-span="' + x + '" aria-pressed="' + (x === span ? 'true' : 'false') + '"' + (x === span ? ' class="on"' : '') +
        (x !== 'season' && !have.has(x) ? ' disabled title="No club nights held in ' + x + ' yet"' : '') + '>' + (x === 'season' ? 'Whole season' : x) + '</button>').join('') + '</div>' +
      (f.children.n ? table(['Figure', 'Children', 'Adults'], body) : '<p class="status">No club nights held in ' + esc(label) + ' yet.</p>') +
      '<p class="status noprint">Only nights with at least one child present are counted. Adult figures leave out nights where no adult was marked: that means adults were not counted, not that none came. Standard deviation is shown two ways: population (σ) treats these nights as the whole set; sample (s) treats them as a sample of a longer run, so it is a little larger.</p>';
  }
  const md = Model.md;      // shared (model.js): an empty date gives empty text instead of NaN
  const bar = (n, max) => '<span class="sbar" style="width:' + (max ? Math.round(n / max * 100) : 0) + 'px"></span>';
  const table = (head, rows) => '<div class="scroll" style="max-height:none"><table class="roster"><thead><tr>' + head.map((h, i) => '<th' + (i ? ' class="num"' : '') + '>' + h + '</th>').join('') + '</tr></thead><tbody>' + (Array.isArray(rows) ? rows.join('') : rows) + '</tbody></table></div>';      // rows may be a list or one string (CR-05: a list used to print commas between rows)
  const tile = (big, small) => '<div class="stat"><b>' + big + '</b><span>' + small + '</span></div>';
  const person = (r, i) => '<tr><td class="num">' + (i + 1) + '</td><td><a href="#" data-person="' + esc(r.id) + '">' + esc(r.name) + '</a></td><td>' + esc(r.room) + '</td>';

  function ranked(title, rows, unit, extra, max) {
    if (!rows.length) return '';
    return '<h4>' + title + '</h4>' + table(['#', 'Name', 'Class', unit, ''], rows.map((r, i) => person(r, i) + '<td class="num">' + r.count + '</td><td>' + bar(r.count, max || rows[0].count) + '</td></tr>').join('')) + (extra || '');
  }

  // How freely each class gives Participation and Extra: one table per mark, nights in four bands (every child / 75%+ / some / nobody) with a stacked bar. Shared with the store tab.
  // shares (optional) = Store.compute(...).markShare: adds the columns for how much of the class's store points those marks make up.
  const PATTERN = { everyone: 'Nearly everyone', selective: 'Selective', rarely: 'Rarely (or not recorded)', few: 'Too few nights' };
  function markUseHtml(mu, shares) {
    if (!mu || !mu.marks.length) return '<p class="status">No Participation or Extra marks can be compared yet: a class needs club nights with at least ' + (mu ? mu.minKids : 3) + ' children present.</p>';
    const seg = (cls, n, tot) => n ? '<span class="mu mu-' + cls + '" style="width:' + (n / tot * 100) + '%" title="' + n + '"></span>' : '';
    let h = '<p class="status">Each club night is put in a band by how many of the children present got the mark: <b>every child</b>, <b>most</b> (75% or more), <b>some</b>, or <b>nobody</b>. ' +
      'Nights with fewer than ' + mu.minKids + ' children in the class are left out. A class that gives it to nearly everyone on at least 75% of its nights is <i>Nearly everyone</i>; one that gives it to nobody on 75% of its nights is <i>Rarely</i> (or the teacher does not record it); the rest are <i>Selective</i>. ' +
      'A class here is the room the children are in today; the file does not record which adult led it.</p>' +
      '<p class="mulegend"><span class="mu mu-all"></span> every child &nbsp; <span class="mu mu-most"></span> most (75%+) &nbsp; <span class="mu mu-some"></span> some &nbsp; <span class="mu mu-none"></span> nobody</p>';
    mu.marks.forEach(m => {
      const t = m.total, tot = Math.max(1, m.classNights), pc = k => Math.round(t[k] / tot * 100);
      h += '<h4>' + m.name + '</h4><p>Across the ' + m.classes.length + ' classes and ' + m.classNights + ' class-nights: every child <b>' + pc('all') + '%</b>, most <b>' + pc('most') + '%</b>, some <b>' + pc('some') + '%</b>, nobody <b>' + pc('none') + '%</b>. ' +
        'Classes: ' + ['everyone', 'selective', 'rarely', 'few'].filter(k => m.patterns[k]).map(k => m.patterns[k] + ' ' + PATTERN[k].toLowerCase()).join(', ') + '.</p>';
      const share = room => (shares || []).find(x => x.room === room);
      h += table(['Class', 'Nights', 'Every child', 'Most', 'Some', 'Nobody', 'Given to', 'Pattern', 'How the nights split'].concat(shares ? ['Per child', 'Share of store points'] : []),
        m.classes.map(c => {
          const b = c.bands, n = Math.max(1, c.usedNights), sh = share(c.room);
          return '<tr><td>' + esc(c.room) + '</td><td class="num">' + c.usedNights + '</td><td class="num">' + b.all + '</td><td class="num">' + b.most + '</td><td class="num">' + b.some + '</td><td class="num">' + b.none + '</td>' +
            '<td class="num">' + (c.rate === null ? '' : c.rate + '%') + '</td><td>' + PATTERN[c.pattern] + '</td><td><span class="mubar">' + seg('all', b.all, n) + seg('most', b.most, n) + seg('some', b.some, n) + seg('none', b.none, n) + '</span></td>' +
            (shares ? '<td class="num">' + (sh ? (m.mark === 'p' ? sh.perKidParticipation : sh.perKidExtra) : '') + '</td><td class="num">' + (sh ? (m.mark === 'p' ? sh.participationShare : sh.extraShare) + '%' : '') + '</td>' : '') + '</tr>';
        }).join('')) + '<p class="status">Given to = the share of all children present (in these classes) who got the mark.' + (shares ? ' Per child = average number of nights each child has it. Share of store points = how much of the class\'s weighted total comes from this mark at the current weight.' : '') + '</p>';
    });
    return h;
  }
  App.markUseHtml = markUseHtml;

  // Section sign-offs: room beside room, and children whose first night here already holds several core sections. Rules are in pace.js.
  function paceRoomsHtml() {
    const rows = Pace.rows({ master: App.master, season: App.season, calendar: App.calendar }), rooms = Pace.room(rows), f = Pace.f1;
    if (!rooms.length) return '';
    const first = Pace.firstNight(rows);
    return '<h3>Section pace by class</h3><p class="status">Core sections signed per night attended (Flight 3:16, Start Zones, Rank, emblems and jewel sections; not Sparks reviews or T&amp;T Silver / Gold). ' +
      'This shows how fast children move through the same material in each class. It cannot show why: a class that is much faster or slower is a reason to go and watch, not proof of a looser or a tighter standard.</p>' +
      table(['Class', 'Children', 'Median', 'Slowest&ndash;fastest', 'Under ' + Pace.CFG.SLOW, 'Signed', 'Newest sign-off'],
        rooms.map(r => '<tr><td>' + esc(r.room) + '</td><td class="num">' + r.kids + '</td>' + (r.entered && r.rated ?
          '<td class="num">' + f(r.median) + '</td><td class="num">' + f(r.min) + '&ndash;' + f(r.max) + '</td><td class="num">' + r.slow + ' of ' + r.rated + '</td><td class="num">' + r.signed + '</td><td class="num">' + md(r.through) + '</td></tr>'
          : '<td colspan="5" class="status">' + (r.entered ? 'too few nights attended yet' : 'no sign-offs entered yet') + '</td></tr>')).join('')) +
      (first.length ? '<h4>First night with several sections</h4><p class="status">' + first.length + ' child' + (first.length === 1 ? '' : 'ren') + ' with ' + Pace.CFG.FIRST_NIGHT + ' or more core sections dated on or before their first night here: ' +
        'earlier work being entered, or a fast start. Only the dates are known.</p>' + table(['Name', 'Class', 'Sections on night 1', 'Nights attended'],
        first.map(r => '<tr><td><a href="#" data-person="' + esc(r.id) + '">' + esc(r.name) + '</a>' + (r.guest ? ' <small>(guest)</small>' : '') + '</td><td>' + esc(r.room) + '</td><td class="num">' + r.firstNight + '</td><td class="num">' + r.nights + '</td></tr>').join('')) : '');
  }

  // The three groups of Statistics as { SUBS: [[key, title, html]...] }, or { msg } when there is nothing to show. The tab shows one group; the printable report shows all three.
  function build() {
    if (!App.master || !App.season) return { msg: 'Import a data file first (Import&hellip;).' };
    const s = Stats.compute({ master: App.master, season: App.season, calendar: App.calendar });
    if (!s.club.nights) return { msg: 'No attendance has been marked on a club night yet, so there is nothing to total.' };
    const c = s.club, maxAvg = Math.max(...s.classes.map(x => x.average), 1), vs = c.last.vsAverage;
    let att = '<h3 style="margin-top:0">Whole club</h3><div class="stgrid">' +
      tile(c.average, 'average attendance over ' + c.nights + ' night' + (c.nights === 1 ? '' : 's')) +
      tile(c.last.count, 'last night (' + md(c.last.date) + '), ' + (vs === 0 ? 'right on the average' : Math.abs(vs) + (vs > 0 ? ' above' : ' below') + ' the average')) +
      tile(c.high.count, 'highest night (' + md(c.high.date) + ')') + tile(c.low.count, 'lowest night (' + md(c.low.date) + ')') +
      tile(c.enrolled, 'children enrolled now') + '</div>' +
      '<p class="status">Children marked present with the attendance mark. Nights: ' + s.nights.map(n => md(n.date) + ' ' + n.kids).join(' &middot; ') + (s.adultsTracked ? '' : '') + '</p>';

    att += nightBlock(s);
    att += '<h3>Attendance by class</h3>' + table(['Class', 'Enrolled', 'Average', 'Share', 'Highest night', 'Lowest night', 'Last night', ''],
      s.classes.map(x => '<tr><td>' + esc(x.room) + '</td><td class="num">' + x.enrolled + '</td><td class="num">' + x.average + '</td><td class="num">' + (x.rate === null ? '' : x.rate + '%') + '</td>' +
        '<td class="num">' + x.high.count + ' <small>' + md(x.high.date) + '</small></td><td class="num">' + x.low.count + ' <small>' + md(x.low.date) + '</small></td><td class="num">' + (x.last ? x.last.count : '') + '</td><td>' + bar(x.average, maxAvg) + '</td></tr>').join('')) +
      '<p class="status noprint">Share = average attendance as a percentage of the children enrolled in that class today.</p>';

    const more = r => r.tied ? '<p class="status">and ' + r.tied + ' more tied with ' + r.top[r.top.length - 1].count + ' nights.</p>' : '';
    att += '<h3>Most nights present</h3>' +
      '<p>' + (s.kids.perfect ? '<b>' + s.kids.perfect + '</b> child' + (s.kids.perfect === 1 ? ' has' : 'ren have') + ' been here every night (' + c.nights + ').' : 'Nobody has been here every night yet.') + '</p>' +
      ranked('Children', s.kids.top, 'Nights', more(s.kids), c.nights) +
      (s.adultsTracked ? '<p>' + (s.adults.perfect ? '<b>' + s.adults.perfect + '</b> adult' + (s.adults.perfect === 1 ? ' has' : 's have') + ' been here every night.' : '') + '</p>' + ranked('Adults', s.adults.top, 'Nights', more(s.adults), c.nights)
        : '<h4>Adults</h4><p class="status">No adult has been marked present yet. Mark adults on the Attendance tab (room <i>Volunteers</i>) and they will be totalled here.</p>');

    att += '<h3>Participation and Extra: how each class hands them out</h3>' + markUseHtml(s.markUse, null) + '<p class="status">The Awana store tab shows the same table next to the weights.</p>';

    let ach = '<h3>Achievement</h3>';
    const lead = Object.keys(s.leaders).filter(g => s.leaders[g]).map(g => tile(esc(s.leaders[g].name), 'most awards earned in ' + g + ' (' + s.leaders[g].count + ')')).join('');
    ach += (lead ? '<div class="stgrid">' + lead + '</div>' : '') + ranked('Most awards earned', s.achievers.slice(0, 10), 'Awards', '', null) + ranked('Points leaders', s.points.slice(0, 10), 'Points', '<p class="status">Points = attendance + handbook + participation + extra + game points, as in the Attendance Summary report.</p>', null);

    let pace = paceRoomsHtml();

    pace += '<h3>Sparks pace</h3>' + (s.pace.length ? '<p class="status">Awards earned per night attended, for Sparks with at least ' + s.minNights + ' nights. The Sparks average is <b>' + s.paceAvg + '</b>.</p>' +
      table(['#', 'Name', 'Class', 'Awards per night', 'Awards', 'Nights', 'Sections entered'], s.pace.slice(0, 10).map((r, i) => person(r, i) + '<td class="num">' + r.pace + '</td><td class="num">' + r.awards + '</td><td class="num">' + r.nights + '</td><td class="num">' + (r.sections || '') + '</td></tr>').join(''))
      : '<p class="status">No Sparks has been here ' + s.minNights + ' nights yet.</p>');

    let tm = ''; if (s.teams.length) tm += '<h3>Color team points, year so far</h3><div class="stgrid">' + s.teams.map(t => '<div class="stat"><b>' + esc(t.group) + '</b>' + t.rows.map(r => '<span style="display:block">' + esc(r.team) + ': <b style="display:inline;font-size:14px">' + r.points + '</b></span>').join('') + '</div>').join('') + '</div>';
    // Three groups, one at a time. Progress, awards and pace are one group on purpose: finished sections lead to awards, and both are counted per night attended.
    const SUBS = [['attendance', 'Attendance', att], ['progress', 'Progress, awards and pace', pace + ach], ['teams', 'Color teams', tm || '<p class="status">No color team points have been recorded yet.</p>']];
    return { SUBS };
  }
  function render() {
    const el = $('statsWrap'), b = build();
    if (b.msg) { el.innerHTML = '<p class="status">' + b.msg + '</p>'; return; }
    const SUBS = b.SUBS;
    if (!SUBS.some(x => x[0] === sub)) sub = 'attendance';
    el.innerHTML = '<div class="statsubs" role="group" aria-label="Statistics sections">' + SUBS.map(x => '<button type="button" data-sub="' + x[0] + '" aria-pressed="' + (x[0] === sub ? 'true' : 'false') + '"' + (x[0] === sub ? ' class="on"' : '') + '>' + x[1] + '</button>').join('') + '</div>' + SUBS.find(x => x[0] === sub)[2];
  }
  $('statsWrap').addEventListener('click', e => {
    const sp = e.target.closest('button[data-span]');
    if (sp) { span = sp.dataset.span; render(); const again = $('statsWrap').querySelector('button[data-span="' + span + '"]'); if (again) again.focus(); return; }
    const b = e.target.closest('button[data-sub]');
    if (b) { sub = b.dataset.sub; render(); const again = $('statsWrap').querySelector('button[data-sub="' + sub + '"]'); if (again) again.focus(); return; }      // the redraw replaced the button: keep the keyboard on it
    const a = e.target.closest('a[data-person]'); if (a) { e.preventDefault(); App.showPerson(a.dataset.person); }
  });
  $('btnStatsPrint').addEventListener('click', () => App.showReport('statistics'));
  App.tabs.stats = render;
  // Printable: every group one after the other, names as plain text (a link means nothing on paper).
  if (window.Reports && Reports.LIST) Reports.LIST.push({ id: 'statistics', title: 'Statistics (all sections)', opts: [], render: ctx => {
    const b = build(); if (b.msg) return '<p class="status">' + b.msg + '</p>';
    // N37 F11: the club name usually holds the season already ("AWANA Club 26-27"): the year is added only when it is not there, so the subtitle never says it twice.
    const yearLine = (club, year) => !year || (club && club.includes(String(year).replace(/^\d\d/, ''))) ? club : club + (club ? ' \u00b7 ' : '') + year;
    return b.SUBS.map(x => '<section class="sheet portrait stats"><h2>' + esc(x[1]) + (x[0] === 'attendance' ? ' \u2014 Statistics' : '') + '</h2><p class="sub">' + esc(yearLine((ctx.settings || {}).club || '', App.season && App.season.year)) + '</p>' + x[2].replace(/<a href="#" data-person="[^"]*">([^<]*)<\/a>/g, '$1') + '</section>').join('');
  } }); if (App.fillReportSel) App.fillReportSel();      // the report list was built before this script ran
  App.onRefresh.push(() => { if (!$('tab-stats').hidden) render(); });
})();
