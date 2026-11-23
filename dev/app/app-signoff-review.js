(this.AwanaVersions = this.AwanaVersions || {})['app-signoff-review.js'] = '1.0.0';
// N72: a local, read-only review of the committed season.
(function () {
  const App = window.App, esc = App.esc, button = '<button type="button" data-sign-review>Review sign-off dates</button>';
  const dialog = document.createElement('dialog');
  dialog.id = 'signoffReview';
  dialog.className = 'noprint';
  dialog.setAttribute('aria-labelledby', 'signoffReviewTitle');
  document.body.appendChild(dialog);
  let source, options, rows;

  function sectionLabel(season, person, item) {
    const books = season.config.books || {}, group = person && Model.groupOf(Model.room(person));
    const book = books[item.book], template = (season.config.progress || {})[(book || {}).group || group];
    const [block, ...parts] = item.key.split('.');
    const blocks = template && (item.book === 'common' ? template.common : template.perBook);
    const part = (blocks || []).find(b => b.key === block);
    const label = part ? part.label + ' · ' + parts.join('.') : item.key;
    return item.book === 'common' ? label : ((book || {}).name || item.book) + ' · ' + label;
  }

  function message(item) {
    if (item.reason === 'non-club') return 'Signed on a non-club date.';
    if (item.reason === 'no-present') return 'Signed on a club night with no Present mark.' + (item.emptyNight ? ' No attendance entered for this night.' : '');
    return item.reason === 'person' ? 'No matching person in this file.' : 'Club calendar coverage needs review.';
  }

  function list(title, items, season, people, view) {
    if (!items.length) return '';
    let date = '', html = '<h3>' + title + ' (' + items.length + ')</h3>';
    items.forEach(item => {
      if (item.date !== date) {
        html += (date ? '</ul>' : '') + '<h4>' + esc(item.date) + '</h4><ul>';
        date = item.date;
      }
      const person = people.get(item.id), i = rows.push(item) - 1;
      html += '<li><strong>' + esc(person ? Model.fullName(person) : 'Unknown person') + '</strong> · ' + esc(sectionLabel(season, person, item)) +
        '<p>' + esc(message(item)) + '</p>' +
        (person ? '<div class="bar">' + (Model.isClubber(person) && ['Cubbies', 'Sparks', 'T&T'].includes(Model.groupOf(Model.room(person))) ? '<button type="button" data-review-progress="' + i + '">Open Progress</button>' : '') +
          (SignoffReview.dateStatus(view, date) === 'club' && Model.isActive(person) ? '<button type="button" data-review-attend="' + i + '">Open Attendance</button>' : '') +
          '</div>' : '') + '</li>';
    });
    return html + '</ul>';
  }

  function refresh() {
    if (!dialog.open) return;
    if (source !== App.season) { dialog.close(); return; }
    const data = App.signoffReviewData();
    if (!data) return;
    const { season, pending } = data, out = SignoffReview.local(season, options);
    const { view, warnings, unresolved } = out;
    const controls = dialog.querySelector('fieldset'), from = controls.elements.coverageFrom, through = controls.elements.coverageThrough;
    controls.disabled = view.status !== 'ready';
    from.min = through.min = view.from;
    from.max = through.max = view.through;
    if (!from.value) from.value = view.from;
    if (!through.value) through.value = view.last;
    rows = [];
    const people = new Map(Model.fromRoster(season.roster).people.map(p => [p[Model.X.ID], p]));
    const status = view.status === 'season-end-needed' ? 'Enter a season end to review this file.' :
      view.status === 'calendar-needed' ? 'Calendar needs review. Add current-season club nights before comparing sign-offs.' :
        'Review period ' + view.from + ' through ' + view.through + '.';
    dialog.querySelector('#signoffReviewStatus').textContent = status +
      (pending ? ' Unapplied edits are excluded.' : '') +
      (options.coverage && !view.confirmed ? ' Enter a date range within the review period.' : '');
    dialog.querySelector('#signoffReviewRows').innerHTML = list('Check these sign-offs', warnings, season, people, view) +
      list('Needs more information', unresolved, season, people, view) +
      (view.status === 'ready' && !warnings.length && !unresolved.length ? '<p>No dated sign-offs to review.</p>' : '');
  }

  function open() {
    const data = App.signoffReviewData();
    if (!data || dialog.open) return;
    source = App.season;
    options = {};
    const initial = SignoffReview.schedule(data.season);
    dialog.innerHTML = '<h2 id="signoffReviewTitle">Review sign-off dates</h2>' +
      '<p>Check when a sign-off was recorded. Children can complete sections between meetings, and attendance may still need to be entered.</p>' +
      '<p class="status" id="signoffReviewStatus" role="status"></p>' +
      '<form id="signoffReviewFilters">' +
        (initial.status !== 'season-end-needed' ? '' : '<p><label>Season end <input type="date" name="seasonEnd"></label> <button type="submit" name="reviewEnd">Set end</button></p>') +
        '<fieldset><legend>Calendar coverage</legend><p>Confirm a range where dates missing from the calendar were days without club.</p>' +
        '<div class="bar"><label>From <input type="date" name="coverageFrom"></label> <label>Through <input type="date" name="coverageThrough"></label> ' +
        '<button type="submit" name="confirmCoverage">Confirm coverage</button></div></fieldset>' +
      '</form><div id="signoffReviewRows"></div><div class="dlgbtns"><button type="button" data-review-close>Close</button></div>';
    dialog.showModal();
    refresh();
  }

  dialog.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.elements;
    if (e.submitter && e.submitter.name === 'reviewEnd') {
      options.seasonEnd = f.seasonEnd.value;
      delete options.coverage;
    } else {
      options.coverage = { from: f.coverageFrom.value, through: f.coverageThrough.value };
    }
    refresh();
  });
  dialog.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-review-close')) { dialog.close(); return; }
    const item = rows[+(b.dataset.reviewProgress ?? b.dataset.reviewAttend)];
    if (!item) return;
    const p = App.master && App.master.people.find(p => p[Model.X.ID] === item.id);
    if (!p) return;
    dialog.close();
    const go = () => {
      if (b.hasAttribute('data-review-progress')) {
        if (item.book !== 'common') App.sheets.focus(item.id, item.book);
        App.showPerson(item.id, { sub: 'progress' });
      } else {
        App.places.attend.set({ date: item.date, room: Model.room(p) });
        App.showTab('attend');
      }
    };
    if (!App.resolveDraft || App.resolveDraft(go)) go();
  });
  dialog.addEventListener('close', () => { source = options = rows = null; });
  document.addEventListener('click', e => { if (e.target.closest('[data-sign-review]')) open(); });
  App.signoffReviewButton = button;
  App.onRefresh.push(refresh);
})();
