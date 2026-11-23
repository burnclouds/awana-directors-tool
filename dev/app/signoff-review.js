(this.AwanaVersions = this.AwanaVersions || {})['signoff-review.js'] = '1.2.0';
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
    const progress = season.progress || {};
    for (const [id, books] of Object.entries(progress)) {
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

  // Each normalized session carries its confirmed scope and only projected person IDs.
  // coveredIds is the relevant local roster for those sessions, verifiedIds the trusted identity subset.
  function checkIns({ season, options, organizationId, eventId, date, sessions, coveredIds, verifiedIds, resolvePerson }) {
    const state = dateStatus(schedule(season, options), date);
    if (state !== 'club') return { status: 'out-of-scope', reason: state };
    if (!organizationId || !eventId || !Array.isArray(coveredIds) || !Array.isArray(verifiedIds) || !Array.isArray(sessions) ||
        !sessions.length || typeof resolvePerson !== 'function') return { status: 'unavailable', reason: 'scope-unconfirmed' };
    const unique = new Set(sessions.map(s => s && s.id));
    if (unique.size !== sessions.length || sessions.some(s => !s || !s.id || s.organizationId !== organizationId ||
        s.eventId !== eventId || s.date !== date || s.status !== 'complete' || !Array.isArray(s.rows))) {
      return { status: 'unavailable', reason: 'session-incomplete' };
    }

    const people = (season.roster && season.roster.people) || {};
    const covered = new Set(coveredIds.filter(id => Object.hasOwn(people, id)));
    const verified = new Set(verifiedIds.filter(id => covered.has(id)));
    const night = (season.attendance || {})[date] || {};
    const checkedIn = new Set(), unresolved = [], agreements = [], warnings = [];
    let remoteUnknown = false;

    for (const session of sessions) {
      for (const row of session.rows) {
        const personId = row && row.personId;
        const result = personId && resolvePerson({ organizationId, personId });
        if (!result || result.status !== 'matched' || (covered.has(result.id) && !verified.has(result.id))) {
          remoteUnknown = true;
          unresolved.push({ reason: result && result.status === 'ambiguous' ? 'ambiguous-check-in' : 'unlinked-check-in' });
        } else if (!Object.hasOwn(people, result.id)) {
          remoteUnknown = true;
          unresolved.push({ reason: 'unlinked-check-in' });
        } else if (verified.has(result.id)) checkedIn.add(result.id);
      }
    }
    const present = id => !!(night[id] && night[id].a);
    for (const id of covered) {
      if (checkedIn.has(id)) {
        if (present(id)) agreements.push(id);
        else warnings.push({ id, reason: 'check-in-without-present' });
      } else if (present(id)) {
        if (!verified.has(id)) unresolved.push({ id, reason: 'unlinked-local-present' });
        else if (remoteUnknown) unresolved.push({ id, reason: 'incomplete-identity-coverage' });
        else warnings.push({ id, reason: 'present-without-check-in' });
      }
    }
    return { status: 'complete', date, agreements, warnings, unresolved };
  }

  function localDate(timestamp, timeZone) {
    if (typeof timestamp !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) || !timeZone) return '';
    try {
      const date = new Date(timestamp);
      const fields = new Intl.DateTimeFormat('en-US', {
        timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(date);
      const parts = Object.fromEntries(fields.map(p => [p.type, p.value]));
      return parts.year.padStart(4, '0') + '-' + parts.month + '-' + parts.day;
    } catch { return ''; }
  }

  function checkInPerson(resource) {
    if (!resource || resource.type !== 'CheckIn') throw new Error('Expected a Check-In record.');
    const person = ((resource.relationships || {}).person || {}).data;
    const attrs = resource.attributes || {};
    const personId = !attrs.one_time_guest && person && person.type === 'Person' && typeof person.id === 'string' ? person.id : '';
    return { personId, volunteer: attrs.kind === 'volunteer' };
  }

  // Read only after the selected event times and local night have been confirmed.
  // The connection owner supplies cancellation/current-context checks; no credentials reach this module.
  async function readCheckIns({ client, season, options, organizationId, eventId, date, timeZone, selected, signal, isCurrent }) {
    const unavailable = reason => ({ status: 'unavailable', reason });
    const canceled = () => (signal && signal.aborted) || (isCurrent && !isCurrent());
    const state = dateStatus(schedule(season, options), date);
    if (state !== 'club') return { status: 'out-of-scope', reason: state };
    if (!organizationId || !eventId || !Array.isArray(selected) || !selected.length ||
        selected.some(s => !s || !/^\d+$/.test(s.id || '') || s.eventId !== eventId || localDate(s.startsAt, timeZone) !== date) ||
        new Set(selected.map(s => s.id)).size !== selected.length) return unavailable('scope-unconfirmed');
    if (!client || typeof client.readPages !== 'function') return unavailable('authorization-required');
    const sessions = [];
    for (const time of selected) {
      if (canceled()) return unavailable('canceled');
      const path = '/check-ins/v2/event_times/' + time.id + '/check_ins?filter=attendee&per_page=100';
      let result;
      try { result = await client.readPages(path, { version: '2025-05-28', signal, project: checkInPerson }); }
      catch { return unavailable(canceled() ? 'canceled' : 'request-failed'); }
      if (canceled()) return unavailable('canceled');
      if (!result || result.status !== 'complete' || !Array.isArray(result.rows)) {
        if (result && result.status === 'unavailable') return { status: 'unavailable', reason: result.reason, retryAfter: result.retryAfter };
        return unavailable('invalid-response');
      }
      const rows = result.rows.filter(r => !r.volunteer).map(r => ({ personId: r.personId }));
      sessions.push({ id: time.id, organizationId, eventId, date, status: 'complete', rows });
    }
    return { status: 'complete', sessions };
  }

  const api = { schedule, dateStatus, local, checkIns, readCheckIns };
  if (typeof module !== 'undefined') module.exports = api; else root.SignoffReview = api;
})(this);
