(this.AwanaVersions = this.AwanaVersions || {})['calendar.js'] = '1.7.2';
// Club calendar: one row per club night or event. Stored as its own CSV so it can be rolled forward each year.
(function (root) {
  const Csv = root.Csv || (typeof require !== 'undefined' ? require('./csv.js') : null);

  // One lesson column per group, named after the group, in the order Puggles, Cubbies, Sparks, T&T (N2: the old layout had Puggles in two columns, Puggles # and Puggles Title, and the lessons were filed two columns off).
  const COLS = ['Date', 'Type', 'Quarter', 'Theme', 'Notes', 'No Club', 'Puggles Lesson', 'Cubbies Lesson', 'Sparks Lesson', 'T&T Lesson'];
  const GROUPS = ['Puggles', 'Cubbies', 'Sparks', 'T&T'], lessonCol = g => g + ' Lesson';
  const coloringCol = group => group + ' Coloring PDF';
  const coloringCols = GROUPS.map(coloringCol);
  const extraCols = coloringCols.concat(['Start Time', 'End Time', 'Cancelled', 'No Club By Hand', 'Generated Break', 'Holiday', 'Recorded Night']);
  const TYPES = ['Club night', 'Event'];
  const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

  function load(text) {
    const { cols, records } = Csv.toRecords(Csv.parse(text));
    if (!cols.includes('Date') || !cols.includes('Quarter')) throw new Error('Not a calendar CSV: needs Date and Quarter columns.');
    const fields = COLS.concat(extraCols.filter(c => cols.includes(c)));
    const rows = records.map(r => { const o = {}; fields.forEach(c => { o[c] = r[c] || ''; }); if (!o['Puggles Lesson']) o['Puggles Lesson'] = [r['Puggles #'], r['Puggles Title']].filter(Boolean).join(' '); return o; });      // an older CSV with Puggles # and Puggles Title joins them
    rows.forEach(r => { if (!/^\d{4}-\d{2}-\d{2}$/.test(r.Date)) throw new Error('Bad date "' + r.Date + '" (use YYYY-MM-DD).'); });
    return sort(rows);
  }
  const sort = rows => rows.sort((a, b) => a.Date.localeCompare(b.Date));
  function toCsv(rows) {
    const fields = COLS.concat(extraCols.filter(c => rows.some(r => r[c])));
    return Csv.serialize([fields].concat(sort(rows.slice()).map(r => fields.map(c => r[c]))), true);
  }

  const isNight = r => r.Type !== 'Event' && r['No Club'] !== '1';
  // A closed row with recorded activity preserves the season boundary and grants attendance grace.
  const isExcused = r => r['Recorded Night'] === '0' && !isNight(r);
  const countsNight = r => isNight(r) || r['Recorded Night'] === '1';
  function markRecordedClosure(previous, next, recorded) {
    if (!isNight(next) && recorded && (countsNight(previous) || isExcused(previous))) next['Recorded Night'] = '0';
    else if (isNight(next) || isExcused(next)) delete next['Recorded Night'];
    return next;
  }
  const stateOf = r => r.Type === 'Event' ? 'event' : isNight(r) ? 'meets' : r.Cancelled ? 'cancelled' : 'planned';
  function setState(row, state, reason) {
    if (row.Type === 'Event' || !['meets', 'planned', 'cancelled'].includes(state)) throw new Error('Choose Meets, No club or Cancelled for a club night.');
    const next = Object.assign({}, row, { 'No Club': state === 'meets' ? '' : '1', 'No Club By Hand': '1' });
    // BEGIN PLAYTEST
    if (state === 'cancelled' && next['Recorded Night'] === '1') delete next['Recorded Night'];
    // END PLAYTEST
    if (state === 'cancelled') next.Cancelled = String(reason || '').trim() || 'Cancelled';
    else delete next.Cancelled;
    delete next['Generated Break'];
    return next;
  }
  const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  function timeText(start, end) {
    const fmt = time => {
      const [hours, minutes] = time.split(':').map(Number);
      return (hours % 12 || 12) + (minutes ? ':' + String(minutes).padStart(2, '0') : '') + (hours < 12 ? 'am' : 'pm');
    };
    return validTime(start) ? fmt(start) + (validTime(end) ? '–' + fmt(end) : '') : '';
  }
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
  function lessonSeries(config, group) {
    const raw = (((config || {}).lessons || {}).groups || {})[group] || {};
    return {
      from: validDate(raw.from) ? raw.from : '',
      items: Array.isArray(raw.items) ? raw.items.filter(item => typeof item === 'string' && item.trim()) : [],
      planned: raw.planned === 'skip' ? 'skip' : 'move',
      unplanned: raw.unplanned === 'move' ? 'move' : 'skip'
    };
  }
  function numberItems(units, perUnit, start = '1.1') {
    if (!Number.isInteger(units) || units < 1 || units > 50 || !Number.isInteger(perUnit) || perUnit < 1 || perUnit > 50) return [];
    const items = Array.from({ length: units * perUnit }, (_, i) => (Math.floor(i / perUnit) + 1) + '.' + (i % perUnit + 1));
    const from = items.indexOf(start);
    return from === -1 ? [] : items.slice(from);
  }
  function lessonsFor(rows, group, config) {
    const series = lessonSeries(config, group), field = lessonCol(group);
    const ordered = sort(rows.filter(row => row && validDate(row.Date) && row.Type !== 'Event'));
    const from = series.from || ordered.find(isNight)?.Date, out = new Map();
    let index = 0;
    for (const row of ordered) {
      if (out.has(row.Date)) continue;
      const manual = String(row[field] || '').trim(), state = stateOf(row);
      if (manual) { out.set(row.Date, { text: manual === '-' ? '' : manual, kind: 'hand' }); continue; }
      if (!from || row.Date < from) { out.set(row.Date, { text: '', kind: 'none' }); continue; }
      const policy = state === 'planned' ? series.planned : series.unplanned;
      if (state !== 'meets' && policy === 'move') { out.set(row.Date, { text: '', kind: 'off' }); continue; }
      const text = series.items[index++] || '';
      if (state === 'meets') out.set(row.Date, { text, kind: text ? 'series' : 'none' });
      else out.set(row.Date, { text, kind: text ? 'missed' : 'off', reason: row.Cancelled || row.Holiday || 'No club' });
    }
    return out;
  }
  function lessonChanges(before, after, config) {
    const settings = lessonSettings(config, after);
    if (!settings.on) return [];
    return GROUPS.filter(group => settings.groups[group].on && lessonSeries(config, group).items.length).flatMap(group => {
      const old = lessonsFor(before, group, config), next = lessonsFor(after, group, config);
      return [...new Set([...old.keys(), ...next.keys()])].sort().flatMap(date => {
        const previous = old.get(date), current = next.get(date);
        if ((!previous?.text && !current?.text) || (previous?.kind === 'hand' && current?.kind === 'hand') ||
            (previous?.text === current?.text && previous?.kind === current?.kind)) return [];
        return [{ group, date, before: previous, after: current }];
      });
    });
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
      return url && settings.groups[group].on ? [{ group, lesson: lessonsFor(rows, group, config).get(date)?.text || '', url }] : [];
    });
  }
  const ymd = (year, month, day) => String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  const civil = iso => new Date(iso + 'T12:00:00Z');
  const dateOnly = date => date.toISOString().slice(0, 10);
  const validDate = iso => typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(+civil(iso)) && dateOnly(civil(iso)) === iso;
  function addDays(iso, days) {
    const date = civil(iso);
    date.setUTCDate(date.getUTCDate() + days);
    return dateOnly(date);
  }
  function easter(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const k = c % 4, l = (32 + 2 * e + 2 * Math.floor(c / 4) - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451), day = h + l - 7 * m + 114;
    return ymd(year, Math.floor(day / 31), day % 31 + 1);
  }
  function recommendBreaks(first, last) {
    if (!validDate(first) || !validDate(last) || first > last) return [];
    const breaks = [];
    for (let year = +first.slice(0, 4) - 1; year <= +last.slice(0, 4); year++) {
      const nov = ymd(year, 11, 1), thanks = addDays(nov, (4 - weekday(nov) + 7) % 7 + 21);
      breaks.push({ name: 'Thanksgiving week', from: addDays(thanks, -4), to: addDays(thanks, 2) });
      breaks.push({ name: 'Christmas break', from: ymd(year, 12, 21), to: ymd(year + 1, 1, 1) });
    }
    return breaks.filter(b => validDate(b.from) && validDate(b.to) && b.from <= last && b.to >= first);
  }
  function generate({ day, first, last, breaks = [], easterFlag = true }) {
    if (!Number.isInteger(day) || day < 0 || day > 6 || !validDate(first) || !validDate(last) || first > last) {
      throw new Error('Choose a club weekday and a valid first and last date.');
    }
    if (breaks.some(b => !b || typeof b.name !== 'string' || !b.name.trim() || !validDate(b.from) || !validDate(b.to) || b.from > b.to)) {
      throw new Error('Give each break a name and a valid date range.');
    }
    const rows = [];
    const advance = (day - weekday(first) + 7) % 7;
    const date = civil(first), end = civil(last);
    date.setUTCDate(date.getUTCDate() + advance);
    for (; date <= end; date.setUTCDate(date.getUTCDate() + 7)) {
      const iso = dateOnly(date), closure = breaks.find(b => b.from <= iso && b.to >= iso);
      const sunday = easter(date.getUTCFullYear());
      const holiday = closure ? closure.name.trim() : easterFlag && addDays(sunday, -6) <= iso && iso <= sunday ? 'Easter week' : '';
      rows.push(Object.assign(blank(), { Date: iso, 'No Club': closure ? '1' : '', Holiday: holiday }, closure ? { 'Generated Break': '1' } : {}));
    }
    return rows;
  }

  function suggestQuarters(rows) {
    const inOrder = sort(rows.slice()).filter(row => row.Type !== 'Event');
    const open = inOrder.map((row, i) => ({ row, afterBreak: i > 0 && !isNight(inOrder[i - 1]) })).filter(x => isNight(x.row));
    const n = open.length, window = Math.min(3, Math.floor((n - 1) / 8));
    const starts = { Q2: '', Q3: '', Q4: '' };
    let previous = 0;
    for (let k = 1; k <= 3 && k < n; k++) {
      const target = k * (n - 1) / 4;
      const max = n - 1 - Math.min(3 - k, n - k - 1);
      const options = open.map((x, i) => ({
        i, afterBreak: x.afterBreak, natural: x.afterBreak || i === 0 || x.row.Date.slice(0, 7) !== open[i - 1].row.Date.slice(0, 7)
      })).filter(x => x.natural && x.i > previous && x.i <= max && Math.abs(x.i - target) <= window);
      options.sort((a, b) => Math.abs(a.i - target) - Math.abs(b.i - target) || Number(b.afterBreak) - Number(a.afterBreak) || a.i - b.i);
      previous = options.length ? options[0].i : Math.min(max, Math.max(previous + 1, Math.round(target)));
      starts[QUARTERS[k]] = open[previous].row.Date;
    }
    return starts;
  }
  function applyQuarters(rows, starts) {
    const open = nights(sort(rows.slice())).map(r => r.Date), openDates = new Set(open);
    const boundaries = QUARTERS.slice(1).map(q => ({ q, date: starts[q] })).filter(x => x.date);
    if (boundaries.some((b, i) => !openDates.has(b.date) || b.date === open[0] || b.q !== QUARTERS[i + 1] || (i && b.date <= boundaries[i - 1].date))) {
      throw new Error('Choose quarter starts in order on separate club nights after the first night.');
    }
    const sorted = sort(rows.slice());
    let next = open[open.length - 1];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const row = sorted[i];
      if (openDates.has(row.Date)) next = row.Date;
      const boundary = boundaries.findLast(b => b.date <= next);
      sorted[i] = Object.assign({}, row, { Quarter: boundary ? boundary.q : 'Q1' });
    }
    return sorted;
  }
  // Carry the information useful when building the next calendar. Keep roster links out.
  const archiveFields = ['Date', 'Type', 'Theme', 'Start Time', 'End Time', 'Notes', 'No Club', 'Cancelled'];
  function archive(rows) {
    return rows.filter(row => row && validDate(row.Date)).map(row => Object.assign(
      Object.fromEntries(archiveFields.filter(field => typeof row[field] === 'string').map(field => [field, row[field]])),
      { Type: row.Type === 'Event' ? 'Event' : 'Club night' }));
  }
  function copyThemes(rows, older, how, withEvents, first, last, protectedDates = new Set()) {
    const result = sort(rows.map(row => Object.assign({}, row))), previous = sort(archive(older));
    const open = nights(result).filter(row => (!first || row.Date >= first) && (!last || row.Date <= last));
    const old = nights(previous), filled = [], events = [];
    const fill = (destination, source) => {
      if (destination && !protectedDates.has(destination.Date) && !String(destination.Theme || '').trim() && source && source.Theme) {
        destination.Theme = source.Theme;
        filled.push(destination.Date);
      }
    };
    if (how === 'order' && open.length && old.length) {
      for (let i = 0; i < Math.min(open.length, old.length) - 1; i++) fill(open[i], old[i]);
      fill(open.at(-1), old.at(-1));
    } else if (how === 'month') {
      const counts = {};
      open.forEach(row => {
        const month = row.Date.slice(5, 7), index = counts[month] || 0;
        fill(row, old.filter(source => source.Date.slice(5, 7) === month)[index]);
        counts[month] = index + 1;
      });
    }
    if (withEvents && validDate(first) && validDate(last)) {
      const year = +first.slice(0, 4), lastYear = +last.slice(0, 4);
      const asDate = (event, y) => {
        const sameDay = String(y).padStart(4, '0') + event.Date.slice(4);
        const base = validDate(sameDay) ? sameDay : ymd(y, 2, 28);
        const daysAway = (weekday(event.Date) - weekday(base) + 7) % 7;
        return addDays(base, daysAway > 3 ? daysAway - 7 : daysAway);
      };
      previous.filter(row => row.Type === 'Event').forEach(event => {
        const candidates = Array.from({ length: lastYear - year + 1 }, (_, i) => asDate(event, year + i));
        const date = candidates.find(day => first <= day && day <= last);
        if (!date || result.some(row => row.Type === 'Event' && (row.Theme || '') === (event.Theme || '') &&
          Math.abs(civil(row.Date) - civil(date)) <= 7 * 86400000)) return;
        const meeting = open.find(row => row.Date >= date) || open.at(-1);
        result.push(Object.assign(blank(), event, { Date: date, Quarter: meeting?.Quarter || 'Q1' }));
        events.push(date);
      });
    }
    return { rows: sort(result), filled, events };
  }
  const api = { COLS, GROUPS, lessonCol, coloringCol, coloringUrl, coloringSheets, tidy, lessonSettings, lessonSeries, numberItems, lessonsFor, lessonChanges, hasLessons, TYPES, QUARTERS, load, toCsv, nights, short, currentQuarter, shiftWeeks, blank, sort, isNight, isExcused, countsNight, markRecordedClosure, stateOf, setState, validTime, timeText, quartersIn, DAYS, weekday, dayName, offDay, offDays, recommendBreaks, generate, suggestQuarters, applyQuarters, archive, copyThemes };
  if (typeof module !== 'undefined') module.exports = api; else root.Calendar = api;
})(this);
