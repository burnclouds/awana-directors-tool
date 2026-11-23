(this.AwanaVersions = this.AwanaVersions || {})['location-code.js'] = '1.0.0';
// Portable view state. Share only the values enumerated here, never a DOM label or a record ID.
(function (root) {
  const Model = root.Model || require('./model.js');
  const PREFIX = 'AW1.', MAX = 420;
  const tabIds = ['todo', 'attend', 'games', 'awards', 'roster', 'person', 'reports', 'uniforms', 'calendar', 'stats', 'history', 'options', 'validate', 'debug', 'store', 'help'];
  const reports = ['booksYear', 'handOut', 'announceList', 'ceremony', 'awardsByChild', 'standings', 'attendDates', 'handbooks', 'paceWatch', 'attendance', 'teams', 'binderClass', 'binderAll', 'binderTeams', 'noteSheets', 'progressSheets', 'photos', 'uniforms', 'lessons', 'volunteers', 'pcChanges', 'incidentReport'];
  // Format keys are stable even if a control is renamed or moved. Selector values come from code only.
  const targets = {
    attend: { night: '#attDateWrap', room: '#attRoom', marks: '#attendWrap', count: '#attCount' },
    reports: { options: '#btnReportOptions', print: '#btnPrint', preview: '#report' },
    person: { picker: '#pePerson', record: '#personWrap', sheet: '#progressWrap' },
    options: { books: '#optBooksTop', bug: '#optBugOn' },
    calendar: { dates: '#calWrap', weekday: '#calClubDay' },
    debug: { code: '#dbgLocationCode' }
  };
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const oneOf = (...xs) => x => xs.includes(x);
  const isDate = x => {
    if (!/^\d{4}-\d\d-\d\d$/.test(x)) return false;
    const d = new Date(x + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === x;
  };
  const fields = {
    attend: { date: isDate, room: oneOf(...Model.ROOM_ORDER, 'Unassigned'), absences: oneOf('all', 'upcoming') },
    reports: { report: oneOf(...reports), quarter: oneOf('Q1', 'Q2', 'Q3', 'Q4'),
      group: oneOf('all', 'Puggles', 'Cubbies', 'Sparks', 'T&T'), room: oneOf('all', ...Model.ROOM_ORDER, 'Unassigned'),
      order: oneOf('color', 'colorLast'), books: oneOf('current', 'all', 'blank'), blanks: n => /^(?:[1-9]|1\d|20)$/.test(n), noBook: oneOf('yes', 'no') }
  };
  function validate(x) {
    if (!x || !tabIds.includes(x.tab) || Object.keys(x).some(k => !['tab', 'target', 'view'].includes(k))) return false;
    if (has(x, 'target') && (typeof x.target !== 'string' || !has(targets[x.tab] || {}, x.target))) return false;
    if (!has(x, 'view')) return true;
    const allowed = fields[x.tab] || {};
    return !!x.view && typeof x.view === 'object' && !Array.isArray(x.view) &&
      Object.entries(x.view).every(([k, v]) => has(allowed, k) && typeof v === 'string' && allowed[k](v));
  }
  // Project capture through the same allowlist that validates incoming codes. Omitted filters are reported locally.
  function capture(tab, target, view) {
    const value = { tab }, omitted = [], allowed = fields[tab] || {};
    if (target) value.target = target;
    Object.entries(view || {}).forEach(([k, v]) => {
      if (!v) return;
      if (has(allowed, k) && typeof v === 'string' && allowed[k](v)) (value.view || (value.view = {}))[k] = v;
      else omitted.push(k);
    });
    return { code: encode(value), omitted };
  }
  function encode(x) {
    if (!validate(x)) throw new Error('Unsupported location.');
    return PREFIX + btoa(JSON.stringify(x)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  }
  function decode(input) {
    const code = String(input || '').trim();
    if (code.length > MAX || !/^AW1\.[A-Za-z0-9_-]+$/.test(code)) throw new Error('Enter a valid AW1 location code.');
    let value;
    try { value = JSON.parse(atob(code.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/'))); }
    catch (err) { throw new Error('This location code is incomplete or damaged.'); }
    if (!validate(value)) throw new Error('This location code contains an unsupported screen, target, or filter.');
    return value;
  }
  const api = { encode, decode, capture, targets, MAX };
  if (typeof module === 'undefined') root.LocationCode = api; else module.exports = api;
})(this);
