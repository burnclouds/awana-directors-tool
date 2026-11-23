(this.AwanaVersions = this.AwanaVersions || {})['calendar-safety.js'] = '1.1.0';
// N3: inspect calendar dependencies and build a detached proposal before changing the open file.
(function (root) {
  const Calendar = root.Calendar || require('./calendar.js');
  const Season = root.Season || require('./season.js');
  const TeamPlan = root.TeamPlan || require('./teamplan.js');

  const activities = { attendance: 'attendance', games: 'games', awards: 'awards', adults: 'adult awards' };
  const values = record => Object.values(record || {});
  const valid = r => r && Season.isRealDate(r.Date);
  const activeRows = (season, rows) => {
    const cutoff = (season.config || {}).carriedThrough;
    return rows.filter(row => valid(row) && (!Season.isRealDate(cutoff) || row.Date > cutoff));
  };
  const meetingIndex = rows => {
    const indexed = new Map();
    rows.filter(r => r.Type !== 'Event').forEach(r => {
      if (!indexed.has(r.Date)) indexed.set(r.Date, []);
      indexed.get(r.Date).push(r);
    });
    return indexed;
  };

  function inspect(season, rows, today) {
    const dates = new Map(), cutoff = (season.config || {}).carriedThrough;
    let latest = '';
    const add = (date, reason, complete = false, count = 1) => {
      if (!Season.isRealDate(date) || (Season.isRealDate(cutoff) && date <= cutoff)) return;
      if (!dates.has(date)) dates.set(date, {});
      const reasons = dates.get(date);
      reasons[reason] = (reasons[reason] || 0) + count;
      if (complete && date > latest) latest = date;
    };
    Object.entries(activities).forEach(([section, reason]) => {
      Object.entries(season[section] || {}).forEach(([date, at]) => {
        const count = Object.keys(at || {}).length;
        if (count) add(date, reason, true, count);
      });
    });
    values(season.absences).forEach(person => values(person).forEach(absence => {
      Object.keys((absence || {}).nights || {}).forEach(date => add(date, 'volunteer absence'));
    }));
    values(season.teamMoves).forEach(moves => {
      if (Array.isArray(moves)) moves.forEach(move => { if (move) add(move.from, 'team move'); });
    });
    const teamNoteQuarters = new Set();
    values(season.flags).forEach(flag => {
      if (!flag) return;
      add(flag.date, 'dated note');
      if (flag.level === 'team' && Calendar.QUARTERS.includes(flag.quarter)) teamNoteQuarters.add(flag.quarter);
    });

    const calendar = activeRows(season, rows), meetings = meetingIndex(calendar);
    const locked = new Set(Calendar.QUARTERS.filter(q => TeamPlan.stateOf(season, calendar, q, today) === 'locked'));
    calendar.forEach(r => {
      if (r.Date <= latest && r.Type !== 'Event') add(r.Date, 'previous schedule');
      if (locked.has(r.Quarter) && r.Type !== 'Event') add(r.Date, 'locked quarter');
      if (teamNoteQuarters.has(r.Quarter) && r.Type !== 'Event') add(r.Date, 'quarter team note');
    });
    return { dates, latest, locked, meetings };
  }

  function classificationDates(season) {
    const dates = new Set();
    const add = date => { if (Season.isRealDate(date)) dates.add(date); };
    Object.entries(season.progress || {}).forEach(([id, books]) => {
      Object.keys(books || {}).forEach(book => values(Season.signsShown(season, id, book)).forEach(add));
    });
    Object.entries(season.given || {}).forEach(([id, given]) => {
      Object.entries(given || {}).forEach(([award, date]) => { if (!Season.isGivenNoDate(season, id, award)) add(date); });
    });
    values(season.received).forEach(received => values(received).forEach(add));
    values(season.handbooks).forEach(text => add(Season.parseHandbook(text).date));
    for (const section of ['blueOverrides', 'blueWings']) {
      values(season[section]).forEach(list => { if (Array.isArray(list)) list.forEach(x => { if (x) { add(x.date); add(x.earned); } }); });
    }
    values(season.blueDrops).forEach(list => { if (Array.isArray(list)) list.forEach(x => { if (typeof x === 'string') add(x.split('|')[1]); }); });
    return [...dates].sort();
  }

  // Used by regeneration and by other routes that would replace or roll the existing schedule.
  function compare(season, previous, candidate, today, evidence = inspect(season, previous, today)) {
    const next = meetingIndex(activeRows(season, candidate)), blocks = [], existing = [];
    const state = rows => (rows || []).map(r => [r.Type, Calendar.isNight(r), r.Quarter]);
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    for (const [date, reasons] of evidence.dates) {
      const before = evidence.meetings.get(date) || [];
      if (!equal(state(before), state(next.get(date)))) blocks.push({ date, reasons });
      if (Object.keys(reasons).some(reason => !['previous schedule', 'locked quarter', 'quarter team note', 'dated note'].includes(reason)) &&
          !before.some(Calendar.isNight)) existing.push({ date, reason: before.length ? 'activity on a closed night' : 'activity missing from calendar' });
    }
    for (const [date, meetings] of evidence.meetings) {
      if (meetings.length > 1) existing.push({ date, reason: 'multiple club night rows' });
    }
    for (const [date, rows] of next) {
      const before = evidence.meetings.get(date) || [], reasons = {};
      if (date <= evidence.latest && rows.some(Calendar.isNight) && !before.some(Calendar.isNight)) reasons['previous schedule'] = 1;
      if (rows.some(r => Calendar.isNight(r) && evidence.locked.has(r.Quarter) &&
          !before.some(old => Calendar.isNight(old) && old.Quarter === r.Quarter))) reasons['locked quarter'] = 1;
      if (Object.keys(reasons).length) blocks.push({ date, reasons });
    }
    const beforeStart = Season.seasonStart(Object.assign({}, season, { calendar: previous.filter(valid) }));
    const afterStart = Season.seasonStart(Object.assign({}, season, { calendar: candidate.filter(valid) }));
    if (beforeStart && afterStart && beforeStart !== afterStart) {
      classificationDates(season).filter(date => (date < beforeStart) !== (date < afterStart))
        .forEach(date => blocks.push({ date, reasons: { 'season classification would change': 1 } }));
    } else if (beforeStart && !afterStart && classificationDates(season).length) {
      blocks.push({ date: beforeStart, reasons: { 'effective season start would be lost': 1 } });
    }
    return { blocks, existing };
  }

  function propose(season, rows, inputs, today) {
    if (rows.some(r => !valid(r))) throw new Error('Correct invalid calendar dates before generating a schedule.');
    const cutoff = (season.config || {}).carriedThrough;
    if (Season.isRealDate(cutoff) && inputs.first <= cutoff) throw new Error('Choose a first night after the previous season ended.');
    const generated = Calendar.generate(inputs), evidence = inspect(season, rows, today);
    if (!generated.length) throw new Error('Choose a range containing at least one matching club weekday.');
    const previous = activeRows(season, rows);
    const archived = rows.filter(r => !previous.includes(r));
    const byDate = new Map(generated.map(row => [row.Date, row]));
    const added = new Set(), kept = [];
    const candidate = previous.map(row => {
      const generatedRow = byDate.get(row.Date);
      if (row.Type === 'Event') { kept.push({ date: row.Date, reasons: { event: 1 } }); return row; }
      byDate.delete(row.Date);
      const protections = evidence.dates.get(row.Date);
      if (!generatedRow || protections || evidence.meetings.get(row.Date).length > 1) {
        kept.push({ date: row.Date, reasons: protections || { 'existing calendar row': 1 } });
        return row;
      }
      const handmade = row['No Club By Hand'] === '1' || row.Cancelled || (row['No Club'] === '1' && row['Generated Break'] !== '1');
      if (handmade) return row;
      const next = Object.assign({}, row, { 'No Club': generatedRow['No Club'], Holiday: generatedRow.Holiday });
      if (generatedRow['Generated Break']) next['Generated Break'] = generatedRow['Generated Break'];
      else delete next['Generated Break'];
      return next;
    });
    for (const [date, row] of byDate) {
      if (evidence.dates.has(date)) continue;      // Do not invent a meeting to cover orphaned activity.
      candidate.push(row);
      added.add(date);
    }

    const starts = inputs.starts || Calendar.suggestQuarters(candidate);
    const assigned = Calendar.applyQuarters(candidate, starts);
    const sorted = Calendar.sort(candidate.slice());
    const proposed = assigned.map((row, i) => {
      const original = sorted[i];
      if (row.Type === 'Event' || evidence.dates.has(row.Date) ||
          (evidence.meetings.get(row.Date) || []).length > 1 || (!added.has(row.Date) && !inputs.starts)) return Object.assign({}, original);
      return row;
    });
    const impact = compare(season, rows, proposed, today, evidence);
    return Object.assign(impact, { rows: proposed, starts, added: [...added], kept, archived });
  }

  function summary(blocks) {
    return blocks.slice(0, 8).map(({ date, reasons }) => date + ' (' + Object.keys(reasons).join(', ') + ')').join('; ') +
      (blocks.length > 8 ? ' and ' + (blocks.length - 8) + ' more' : '');
  }

  const api = { inspect, compare, propose, summary };
  if (typeof module !== 'undefined') module.exports = api; else root.CalendarSafety = api;
})(this);
