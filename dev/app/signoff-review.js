(this.AwanaVersions = this.AwanaVersions || {})['signoff-review.js'] = '1.0.0';
// N72: classify original sign-off dates against a committed season and its attendance.
(function (root) {
  const S = root.Season || require('./season.js'), Calendar = root.Calendar || require('./calendar.js');
  const marks = night => Object.values(night).some(mark => mark && S.MARKS.some(key => mark[key]));

  function standardWindow(year) {
    const match = /^(\d{4})-(\d{2})$/.exec(year || '');
    if (!match || +match[2] !== (+match[1] + 1) % 100) return null;
    const from = match[1] + '-08-01', through = String(+match[1] + 1).padStart(4, '0') + '-07-31';
    return S.isRealDate(from) && S.isRealDate(through) ? { from, through } : null;
  }

  function schedule(season, options = {}) {
    const standard = standardWindow(season.year);
    const through = options.seasonEnd || (standard && standard.through) || '';
    const cutoff = (season.config || {}).carriedThrough;
    const dates = new Map();
    const calendar = Array.isArray(season.calendar) ? season.calendar : [];
    const current = calendar.filter(row => row && S.isRealDate(row.Date) && (!standard || row.Date >= standard.from) &&
      (!S.isRealDate(cutoff) || row.Date > cutoff) && (!S.isRealDate(through) || row.Date <= through));
    current.forEach(row => {
      const day = dates.get(row.Date) || { meetings: 0, closures: 0 };
      if (Calendar.isNight(row)) day.meetings++;
      else if (row.Type !== 'Event') day.closures++;
      dates.set(row.Date, day);
    });
    const start = S.seasonStart(Object.assign({}, season, { calendar: current }));
    const from = standard && start < standard.from ? standard.from : start;
    const hasMeeting = current.some(Calendar.isNight);
    const status = !S.isRealDate(through) || (from && through < from) ? 'season-end-needed' : !hasMeeting ? 'calendar-needed' : 'ready';
    const coverage = options.coverage;
    const confirmed = !!(status === 'ready' && coverage && S.isRealDate(coverage.from) && S.isRealDate(coverage.through) &&
      coverage.from >= from && coverage.through <= through && coverage.from <= coverage.through);
    const availableDates = dates.size ? [...dates.keys()].sort() : [];
    return { status, from, through, dates, confirmed, coverage, first: availableDates[0] || '', last: availableDates.at(-1) || '' };
  }

  function dateStatus(view, date) {
    if (!S.isRealDate(date)) return 'invalid';
    if ((view.from && date < view.from) || (view.through && date > view.through)) return 'outside';
    if (view.status !== 'ready') return 'unknown';
    const day = view.dates.get(date);
    if (day && (day.meetings > 1 || (day.meetings && day.closures))) return 'unknown';
    if (day && day.meetings) return 'club';
    if (day || (view.confirmed && date >= view.coverage.from && date <= view.coverage.through)) return 'off';
    return 'unknown';
  }

  function local(season, options) {
    const view = schedule(season, options), warnings = [], unresolved = [];
    const people = (season.roster && season.roster.people) || {};
    for (const [id, books] of Object.entries(season.progress || {})) {
      for (const book of Object.keys(books || {})) {
        for (const [key, date] of Object.entries(S.signsShown(season, id, book))) {
          const state = dateStatus(view, date);
          if (state === 'invalid' || state === 'outside') continue;
          const row = { id, book, key, date };
          if (!Object.hasOwn(people, id)) unresolved.push(Object.assign(row, { reason: 'person' }));
          else if (state === 'unknown') unresolved.push(Object.assign(row, { reason: 'calendar' }));
          else if (state === 'off') warnings.push(Object.assign(row, { reason: 'non-club' }));
          else {
            const night = (season.attendance || {})[date] || {};
            if (!(night[id] || {}).a) warnings.push(Object.assign(row, { reason: 'no-present', emptyNight: !marks(night) }));
          }
        }
      }
    }
    const order = (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id) || a.book.localeCompare(b.book) || a.key.localeCompare(b.key);
    return { view, warnings: warnings.sort(order), unresolved: unresolved.sort(order) };
  }

  const api = { schedule, dateStatus, local };
  if (typeof module !== 'undefined') module.exports = api; else root.SignoffReview = api;
})(this);
