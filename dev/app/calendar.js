(this.AwanaVersions = this.AwanaVersions || {})['calendar.js'] = '1.3.1';
// Club calendar: one row per club night or event. Stored as its own CSV so it can be rolled forward each year.
(function (root) {
  const Csv = root.Csv || (typeof require !== 'undefined' ? require('./csv.js') : null);

  // One lesson column per group, named after the group, in the order Puggles, Cubbies, Sparks, T&T (N2: the old layout had Puggles in two columns, Puggles # and Puggles Title, and the lessons were filed two columns off).
  const COLS = ['Date', 'Type', 'Quarter', 'Theme', 'Notes', 'No Club', 'Puggles Lesson', 'Cubbies Lesson', 'Sparks Lesson', 'T&T Lesson'];
  const GROUPS = ['Puggles', 'Cubbies', 'Sparks', 'T&T'], lessonCol = g => g + ' Lesson';
  const coloringCol = group => group + ' Coloring PDF';
  const coloringCols = GROUPS.map(coloringCol);
  const TYPES = ['Club night', 'Event'];
  const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

  function load(text) {
    const { cols, records } = Csv.toRecords(Csv.parse(text));
    if (!cols.includes('Date') || !cols.includes('Quarter')) throw new Error('Not a calendar CSV: needs Date and Quarter columns.');
    const fields = COLS.concat(coloringCols.filter(c => cols.includes(c)));
    const rows = records.map(r => { const o = {}; fields.forEach(c => { o[c] = r[c] || ''; }); if (!o['Puggles Lesson']) o['Puggles Lesson'] = [r['Puggles #'], r['Puggles Title']].filter(Boolean).join(' '); return o; });      // an older CSV with Puggles # and Puggles Title joins them
    rows.forEach(r => { if (!/^\d{4}-\d{2}-\d{2}$/.test(r.Date)) throw new Error('Bad date "' + r.Date + '" (use YYYY-MM-DD).'); });
    return sort(rows);
  }
  const sort = rows => rows.sort((a, b) => a.Date.localeCompare(b.Date));
  function toCsv(rows) {
    const fields = COLS.concat(coloringCols.filter(c => rows.some(r => r[c])));
    return Csv.serialize([fields].concat(sort(rows.slice()).map(r => fields.map(c => r[c]))), true);
  }

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

  // An old row (1.51.15 and earlier) has Puggles # and Puggles Title: they join into Puggles Lesson (a space between, empty parts dropped) and both keys go. A row that has neither key is returned as it is (the same object), so a current file is not changed.
  // If Puggles Lesson already has text (typed in a newer copy), it wins and the old pair is added to Notes as "Puggles: ...", so nothing is lost. The other old lesson values stay where they are, as typed lessons.
  function tidy(row) {
    if (!row || typeof row !== 'object' || (!('Puggles #' in row) && !('Puggles Title' in row))) return row;
    const out = {}; Object.keys(row).forEach(k => { if (k !== 'Puggles #' && k !== 'Puggles Title') out[k] = row[k]; });
    const joined = [row['Puggles #'], row['Puggles Title']].filter(x => typeof x === 'string' && x !== '').join(' ');
    if (!out['Puggles Lesson']) out['Puggles Lesson'] = joined; else if (joined) out.Notes = (out.Notes ? out.Notes + ' \u00b7 ' : '') + 'Puggles: ' + joined;
    return out;
  }
  // Lessons by week: config.lessons = { on: bool, groups: { Puggles: { on }, ... } }. A missing key reads as: on when any lesson cell is filled in, else off; every group on. The key is written when a setting is changed.
  const hasLessons = rows => (rows || []).some(r => r && GROUPS.some(g => r[lessonCol(g)] || r[coloringCol(g)]));
  function lessonSettings(config, rows) {
    const L = config && config.lessons && typeof config.lessons === 'object' && !Array.isArray(config.lessons) ? config.lessons : null, out = { on: L && typeof L.on === 'boolean' ? L.on : hasLessons(rows), groups: {} };
    GROUPS.forEach(g => { const o = L && L.groups && L.groups[g]; out.groups[g] = { on: !(o && o.on === false) }; }); return out;
  }
  function coloringUrl(value) {
    if (typeof value !== 'string' || !/^https:\/\//i.test(value.trim())) return '';
    try {
      const url = new URL(value.trim());
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch {
      return '';
    }
  }
  function coloringSheets(config, rows, date) {
    const row = rows.find(r => r.Date === date && isNight(r));
    const settings = lessonSettings(config, rows);
    if (!row || !settings.on) return [];
    return GROUPS.flatMap(group => {
      const url = coloringUrl(row[coloringCol(group)]);
      return url && settings.groups[group].on ? [{ group, lesson: row[lessonCol(group)] || '', url }] : [];
    });
  }
  const api = { COLS, GROUPS, lessonCol, coloringCol, coloringUrl, coloringSheets, tidy, lessonSettings, hasLessons, TYPES, QUARTERS, load, toCsv, nights, short, currentQuarter, shiftWeeks, blank, sort, isNight, quartersIn, DAYS, weekday, dayName, offDay, offDays };
  if (typeof module !== 'undefined') module.exports = api; else root.Calendar = api;
})(this);
