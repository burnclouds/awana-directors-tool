(this.AwanaVersions = this.AwanaVersions || {})['calendar.js'] = '1.2.0';
// Club calendar: one row per club night or event. Stored as its own CSV so it can be rolled forward each year.
(function (root) {
  const Csv = root.Csv || (typeof require !== 'undefined' ? require('./csv.js') : null);

  const COLS = ['Date', 'Type', 'Quarter', 'Theme', 'Notes', 'No Club', 'Cubbies Lesson', 'Puggles #', 'Puggles Title', 'Sparks Lesson', 'T&T Lesson'];
  const TYPES = ['Club night', 'Event'];
  const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

  function load(text) {
    const { cols, records } = Csv.toRecords(Csv.parse(text));
    if (!cols.includes('Date') || !cols.includes('Quarter')) throw new Error('Not a calendar CSV: needs Date and Quarter columns.');
    const rows = records.map(r => { const o = {}; COLS.forEach(c => { o[c] = r[c] || ''; }); return o; });
    rows.forEach(r => { if (!/^\d{4}-\d{2}-\d{2}$/.test(r.Date)) throw new Error('Bad date "' + r.Date + '" (use YYYY-MM-DD).'); });
    return sort(rows);
  }
  const sort = rows => rows.sort((a, b) => a.Date.localeCompare(b.Date));
  const toCsv = rows => Csv.serialize([COLS].concat(sort(rows.slice()).map(r => COLS.map(c => r[c]))), true);

  const isNight = r => r.Type !== 'Event' && r['No Club'] !== '1';
  const nights = (rows, quarter) => rows.filter(r => isNight(r) && (!quarter || r.Quarter === quarter));
  const short = root.Model ? root.Model.md : (iso => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso); return m ? (+m[1]) + '/' + (+m[2]) : iso; });      // the shared formatter (model.js) when it is loaded

  // The quarter we are in: that of the latest club night on or before the given day; before the first night, the first night's quarter ('' with no calendar).
  function currentQuarter(rows, today) {
    const list = sort(rows.filter(r => isNight(r) && QUARTERS.includes(r.Quarter) && /^\d{4}-\d{2}-\d{2}$/.test(r.Date)));
    if (!list.length) return '';
    const past = list.filter(r => r.Date <= today);
    return (past.length ? past[past.length - 1] : list[0]).Quarter;
  }

  // Move every date forward by N weeks (keeps weekday), for rolling the calendar into a new season.
  function shiftWeeks(rows, weeks) {
    rows.forEach(r => {
      const d = new Date(r.Date + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + weeks * 7);
      r.Date = d.toISOString().slice(0, 10);
    });
    return sort(rows);
  }
  // Day-of-week check: other clubs meet on other days, so the club day is a setting (config.clubDay, 0 = Sunday).
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekday = iso => new Date(iso + 'T12:00:00Z').getUTCDay();
  const dayName = n => DAYS[n].slice(0, 3);
  // Only club nights are checked: events (Grand Prix, a Saturday outing) may fall anywhere, and a cancelled night is harmless.
  const offDay = (r, day) => isNight(r) && /^\d{4}-\d{2}-\d{2}$/.test(r.Date) && weekday(r.Date) !== day;
  const offDays = (rows, day) => rows.filter(r => offDay(r, day));
  const blank = () => { const o = {}; COLS.forEach(c => { o[c] = ''; }); o.Type = 'Club night'; o.Quarter = 'Q1'; return o; };
  const quartersIn = rows => QUARTERS.filter(q => rows.some(r => r.Quarter === q));

  const api = { COLS, TYPES, QUARTERS, load, toCsv, nights, short, currentQuarter, shiftWeeks, blank, sort, isNight, quartersIn, DAYS, weekday, dayName, offDay, offDays };
  if (typeof module !== 'undefined') module.exports = api; else root.Calendar = api;
})(this);
