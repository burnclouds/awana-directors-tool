(this.AwanaVersions = this.AwanaVersions || {})['calendar-safety.js'] = '1.2.3';
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

  const { classificationRecords } = Season;
  const classificationDates = season => [...classificationRecords(season).keys()].sort();

  function quarterRegressions(rows) {
    const out = [];
    let last = -1;
    Calendar.nights(Calendar.sort(rows.slice())).forEach(row => {
      const quarter = Calendar.QUARTERS.indexOf(row.Quarter);
      if (quarter < 0) return;
      if (quarter < last) out.push(row.Date);
      last = Math.max(last, quarter);
    });
    return out;
  }

  // Used by regeneration and by other routes that would replace or roll the existing schedule.
  function compare(season, previous, candidate, today, evidence = inspect(season, previous, today)) {
    const next = meetingIndex(activeRows(season, candidate)), blocks = [], existing = [], notices = [];
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
      if (rows.length > 1) blocks.push({ date, reasons: { 'multiple club night rows': rows.length } });
      if (date <= evidence.latest && rows.some(Calendar.isNight) && !before.some(Calendar.isNight)) reasons['previous schedule'] = 1;
      if (rows.some(r => Calendar.isNight(r) && evidence.locked.has(r.Quarter) &&
          !before.some(old => Calendar.isNight(old) && old.Quarter === r.Quarter))) reasons['locked quarter'] = 1;
      if (Object.keys(reasons).length) blocks.push({ date, reasons });
    }
    const priorOrder = new Set(quarterRegressions(activeRows(season, previous)));
    quarterRegressions(activeRows(season, candidate)).filter(date => !priorOrder.has(date))
      .forEach(date => blocks.push({ date, reasons: { 'quarter would go backward': 1 } }));
    const beforeStart = Season.seasonStart(Object.assign({}, season, { calendar: previous.filter(valid) }));
    const afterStart = Season.seasonStart(Object.assign({}, season, { calendar: candidate.filter(valid) }));
    const movesLater = afterStart && afterStart > beforeStart;
    if (afterStart && beforeStart !== afterStart) {
      const details = new Map();
      classificationRecords(season, details);
      for (const [date, records] of details) {
        if (movesLater && date < afterStart && date >= beforeStart) {
          notices.push({ date, first: afterStart, records });
        } else if (date >= afterStart && date < beforeStart) {
          blocks.push({ date, reasons: { 'season classification would change': 1 } });
        }
      }
      if (movesLater && beforeStart && !notices.length) notices.push({ date: beforeStart, first: afterStart, records: [] });
    } else if (beforeStart && !afterStart && classificationDates(season).length) {
      blocks.push({ date: beforeStart, reasons: { 'effective season start would be lost': 1 } });
    }
    return { blocks, existing, notices };
  }

  function correctionImpact(season, before, after, today, comparison = compare(season, before, after, today)) {
    const { blocks, notices } = comparison;
    const dates = new Map();
    for (const { date, reasons } of blocks) {
      dates.set(date, Object.assign(dates.get(date) || {}, reasons));
    }
    const records = classificationRecords(season);
    const prior = meetingIndex(before), next = meetingIndex(after);
    for (const date of new Set([...prior.keys(), ...next.keys()])) {
      if (JSON.stringify(prior.get(date)) === JSON.stringify(next.get(date))) continue;
      const counts = Object.assign({}, records.get(date));
      for (const [reason, entries] of Object.entries(linksAt(season, date))) {
        const count = Object.keys(entries || {}).length;
        if (count) counts[reason] = count;
      }
      if (Object.keys(counts).length) dates.set(date, Object.assign(dates.get(date) || {}, counts));
    }
    if (dates.size) notices.filter(n => n.records.length).forEach(n =>
      dates.set(n.date, Object.assign(dates.get(n.date) || {}, { 'season classification would change': 1 })));
    if (notices.length || blocks.some(b => b.reasons['season classification would change'] || b.reasons['effective season start would be lost'])) {
      const lost = blocks.some(b => b.reasons['effective season start would be lost']);
      for (const [date, counts] of records) {
        if (lost || dates.get(date)?.['season classification would change']) {
          dates.set(date, Object.assign(dates.get(date) || {}, counts));
        }
      }
    }
    const quarters = (rows, date) => rows.filter(row => row.Date === date).map(row => row.Quarter || 'unassigned').join(', ') || 'no row';
    const flags = new Set(['previous schedule', 'locked quarter', 'quarter team note', 'season classification would change',
      'effective season start would be lost', 'quarter would go backward']);
    return [...dates].map(([date, reasons]) =>
      date + ' · ' + quarters(before, date) + ' → ' + quarters(after, date) + ' · ' +
      Object.entries(reasons).map(([reason, count]) => flags.has(reason) ? reason : reason + ' (' + count + ')').join(', '));
  }

  function propose(season, rows, inputs, today) {
    if (rows.some(r => !valid(r))) throw new Error('Correct invalid calendar dates before generating a schedule.');
    const cutoff = (season.config || {}).carriedThrough;
    if (Season.isRealDate(cutoff) && inputs.first <= cutoff) throw new Error('Choose a first night after the previous season ended.');
    const generated = Calendar.generate(inputs), evidence = inspect(season, rows, today);
    for (const date of new Set([inputs.first, inputs.last])) {
      const day = Calendar.weekday(date);
      if (day !== inputs.day) generated.push(...Calendar.generate({ ...inputs, first: date, last: date, day }));
    }
    for (const [date, counts] of classificationRecords(season)) {
      if (evidence.meetings.has(date)) evidence.dates.set(date, Object.assign(evidence.dates.get(date) || {}, counts));
    }
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

    const uniqueMeetings = [...meetingIndex(candidate).values()].map(meetings => meetings[0]);
    const starts = inputs.starts || Calendar.suggestQuarters(uniqueMeetings);
    const assigned = Calendar.applyQuarters(candidate, starts);
    const sorted = Calendar.sort(candidate.slice());
    const proposed = assigned.map((row, i) => {
      const original = sorted[i];
      if (row.Type === 'Event' || evidence.dates.has(row.Date) ||
          (evidence.meetings.get(row.Date) || []).length > 1 || (!added.has(row.Date) && !inputs.starts)) return Object.assign({}, original);
      return row;
    });
    const impact = compare(season, rows, proposed, today, evidence);
    const classification = impact.blocks.filter(b => b.reasons['season classification would change']);
    for (const date of quarterRegressions(proposed)) {
      if (!impact.blocks.some(b => b.date === date && b.reasons['quarter would go backward'])) impact.blocks.push({ date, reasons: { 'quarter would go backward': 1 } });
    }
    const earlier = [...new Set([...impact.notices.filter(n => n.records.length), ...classification].map(b => b.date))].sort();
    if (Season.isRealDate(cutoff) && earlier.length) {
      const through = earlier.at(-1);
      // Extending the old season may never archive an active row or hide dated activity.
      if (through > cutoff && !proposed.some(r => r.Date <= through) &&
          ![...evidence.dates.keys()].some(date => date <= through)) {
        impact.cutoffChoice = { before: cutoff, through, dates: earlier };
        if (inputs.cutoffThrough === through && inputs.cutoffReason?.trim()) {
          impact.blocks = impact.blocks.filter(b => !classification.includes(b));
          impact.cutoffReason = inputs.cutoffReason.trim();
        }
      }
    }
    return Object.assign(impact, { rows: proposed, starts, added: [...added], kept, archived });
  }

  function activityAt(season, date) {
    const details = new Map();
    classificationRecords(season, details);
    const ids = new Set([...(details.get(date) || []).map(r => r.id),
      ...Object.keys(season.attendance?.[date] || {}), ...Object.keys(season.awards?.[date] || {})]);
    for (const [id, moves] of Object.entries(season.teamMoves || {})) {
      if (Array.isArray(moves) && moves.some(m => m?.from === date)) ids.add(id);
    }
    const recorded = ids.size > 0 || Object.values(linksAt(season, date)).some(entries => Object.keys(entries || {}).length);
    return { recorded, ids: [...ids] };
  }
  function noticeText(n, name = id => id) {
    if (!n.records.length) return 'The season start moves from ' + n.date + ' to ' + n.first;
    return 'The season now starts on ' + n.first + '. These records from ' + n.date + ' belong to an earlier year. ' +
      n.records.map(r => [r.kind, name(r.id), r.item].filter(Boolean).join(' · ')).join(', ');
  }

  function linksAt(season, date) {
    const out = {};
    Object.entries(activities).forEach(([section, label]) => { out[label] = (season[section] || {})[date]; });
    out['volunteer absence'] = Object.entries(season.absences || {}).flatMap(([id, entries]) =>
      Object.entries(entries || {}).filter(([, a]) => a && (a.nights || {})[date]).map(([key]) => id + ':' + key)).sort();
    out['team move'] = Object.entries(season.teamMoves || {}).flatMap(([id, moves]) =>
      (Array.isArray(moves) ? moves : []).filter(m => m && m.from === date).map(m => [id, m.q, m.color])).sort();
    out['dated note'] = Object.entries(season.flags || {}).filter(([, f]) => f && f.date === date).map(([id]) => id).sort();
    return out;
  }


  // Calendars merge as whole arrays. Look for records from the other copy that would
  // lose the date or quarter they had there, even with no ordinary merge conflict.
  function mergeConflicts(mine, other, merged, today) {
    const stable = o => JSON.stringify(o, (k, v) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
      return Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]]));
    });
    const calendar = season => season.calendar || [];
    const next = calendar(merged), result = new Map();
    for (const [origin, alternative] of [[mine, other], [other, mine]]) {
      if (stable(calendar(origin)) === stable(next)) continue;
      const adoptedAlternative = stable(calendar(alternative)) === stable(next);
      const evidence = inspect(origin, calendar(origin), today);
      const changed = new Map();
      for (const [date, reasons] of evidence.dates) {
        const before = linksAt(origin, date), against = adoptedAlternative ? linksAt(alternative, date) : {};
        const retained = linksAt(merged, date);
        const relevant = Object.keys(reasons).filter(r => Object.hasOwn(before, r) && stable(before[r]) !== stable(against[r]) &&
          retained[r] && Object.keys(retained[r]).length);
        if (relevant.length) changed.set(date, relevant);
      }
      const beforeStart = Season.seasonStart(origin), afterStart = Season.seasonStart(merged);
      if (beforeStart && afterStart && beforeStart !== afterStart) {
        const previous = new Set(adoptedAlternative ? classificationDates(alternative) : []);
        const current = new Set(classificationDates(merged));
        classificationDates(origin).filter(date => current.has(date) && !previous.has(date) &&
          (date < beforeStart) !== (date < afterStart)).forEach(date =>
          result.set(date, Object.assign(result.get(date) || {}, { 'season classification would change': 1 })));
      }
      if (!changed.size) continue;
      const changesCompletedActivity = [...changed.values()].some(reasons => reasons.some(r => Object.values(activities).includes(r)));
      const impacts = compare(origin, calendar(origin), next, today, evidence);
      impacts.blocks.forEach(({ date, reasons }) => {
        const exact = changed.get(date) || [];
        const applicable = Object.fromEntries(Object.entries(reasons).filter(([r]) => exact.includes(r) ||
          (changesCompletedActivity && (r === 'previous schedule' || r === 'locked quarter'))));
        if (Object.keys(applicable).length) result.set(date, Object.assign(result.get(date) || {}, applicable));
      });
    }
    return [...result].sort(([a], [b]) => a.localeCompare(b)).map(([date, reasons]) => ({ date, reasons }));
  }

  // A classification conflict can be on a sign-off date with no meeting row.
  // Review the differing rows that determine whether that date precedes the first night.
  function reviewDates(mine, other, impacts) {
    const rowsAt = (s, date) => (s.calendar || []).filter(r => r.Date === date);
    return impacts.map(({ date, reasons }) => {
      const affected = new Set([date]);
      if (reasons['season classification would change']) {
        for (const row of [...mine.calendar, ...other.calendar]) {
          if (Calendar.isNight(row) && row.Date <= date &&
              JSON.stringify(rowsAt(mine, row.Date)) !== JSON.stringify(rowsAt(other, row.Date))) affected.add(row.Date);
        }
      }
      const days = [...affected].sort();
      return { date, days, reasons: Object.keys(reasons), mine: days.flatMap(day => rowsAt(mine, day)),
        other: days.flatMap(day => rowsAt(other, day)) };
    });
  }

  function reviewedCalendar(merged, dates, choices) {
    const replacements = new Map();
    for (const item of dates) {
      const pick = choices[item.date];
      if (pick !== 'mine' && pick !== 'other') return null;
      for (const day of item.days) {
        const rows = item[pick].filter(row => row.Date === day);
        if (replacements.has(day) && JSON.stringify(replacements.get(day)) !== JSON.stringify(rows)) return null;
        replacements.set(day, rows);
      }
    }
    return Calendar.sort(merged.calendar.filter(row => !replacements.has(row.Date)).concat(...replacements.values()));
  }

  function summary(blocks) {
    return blocks.slice(0, 8).map(({ date, reasons }) => date + ' (' + Object.keys(reasons).join(', ') + ')').join('; ') +
      (blocks.length > 8 ? ' and ' + (blocks.length - 8) + ' more' : '');
  }

  // BEGIN PLAYTEST
  function cancellationSummary(season, before, after, index, today, nameOf = id => id) {
    const row = before[index], date = row.Date;
    const cancelling = Calendar.stateOf(after[index]) === 'cancelled';
    const activity = Season.recordedNightActivity(season, date);
    const games = activity.other.games || 0;
    const { blocks, notices } = compare(season, before, after, today);
    const previous = { ...season, calendar: before }, next = { ...season, calendar: after };
    const childTest = (root.Model || require('./model.js')).childTestOf(season.roster);
    const children = n => n + (n === 1 ? ' child' : ' children');
    const number = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
    const other = Object.entries(activity.other).map(([kind, count]) => kind + ' (' + count + ')');
    const counts = [...(activity.children.length ? [children(activity.children.length)] : []), ...other];
    const list = activity.children.map(nameOf).concat(other);
    const lines = [
      [date, row.Theme, row.Quarter].filter(Boolean).join(' · '),
      counts.length ? 'Recorded activity: ' + counts.join('; ') : 'No recorded activity on this night.'
    ];
    const heldBefore = Season.heldNights(previous, before), heldAfter = Season.heldNights(next, after);
    lines.push('Club nights held: ' + heldBefore.length + ' → ' + heldAfter.length + '.');
    if ((cancelling ? heldBefore : heldAfter).includes(date)) {
      const marks = Object.entries(season.attendance[date] || {})
        .filter(([id, mark]) => childTest(id) && Season.MARKS.some(key => mark[key])).length;
      const verb = cancelling ? 'lose' : 'regain';
      lines.push('Attendance totals: ' + children(marks) + ' ' + verb + (marks === 1 ? 's' : '') + ' this night.');
    }
    if (games) lines.push('Game points: games on this night ' + (cancelling ? 'leave' : 'return to') + ' the totals.');

    const startBefore = Season.seasonStart(previous), startAfter = Season.seasonStart(next);
    const startChanged = startBefore !== startAfter;
    if (startBefore && !startAfter) lines.push('Season start would be lost (no counted night left).');
    else if (startChanged) lines.push('Season start moves from ' + (startBefore || '—') + ' to ' + startAfter + '.');
    else lines.push('Season start: unchanged (' + (startBefore || '—') + ').');
    const earlier = notices.flatMap(n => n.records);
    if (earlier.length) lines.push(number(earlier.length, 'record') + ' dated before ' + startAfter + ' will belong to an earlier year.');

    const graceChanged = Season.graceDates(previous, before).length !== Season.graceDates(next, after).length;
    if (graceChanged) {
      const from = Season.blueJewelRequirements(previous, before), to = Season.blueJewelRequirements(next, after);
      const ordinals = ['1st', '2nd', '3rd'];
      lines.push('Blue Jewel requirements for attendance after ' + date + ': ' +
        from.map((weeks, i) => (ordinals[i] || (i + 1) + 'th') + ' ' + weeks + ' → ' + to[i]).join(', ') + '.');
      lines.push('Jewels already earned keep their requirement and date.');
      const ids = new Set(Object.values(season.attendance).flatMap(night => Object.keys(night)));
      const reached = [...ids].filter(id => childTest(id) &&
        Season.blueJewels(next, id, after).length > Season.blueJewels(previous, id, before).length);
      if (reached.length) lines.push('Newly reached: ' + children(reached.length) + '.');
      list.push(...reached.map(id => 'Blue Jewel: ' + nameOf(id)));
    } else lines.push('Blue Jewel requirements: unchanged.');

    let lockChanged = false, anchorChanged = false;
    const handLocks = TeamPlan.config(season).locked;
    for (const q of Calendar.QUARTERS) {
      const from = TeamPlan.stateOf(previous, before, q, today), to = TeamPlan.stateOf(next, after, q, today);
      const first = TeamPlan.firstNight(before, q, previous), last = TeamPlan.firstNight(after, q, next);
      if (from === to && first === last) continue;
      lockChanged ||= from !== to;
      anchorChanged ||= first !== last;
      lines.push(q + ': ' + from + ' → ' + to + ' (first night ' + (first || '—') + ' → ' + (last || '—') + ').' +
        (handLocks[q] ? ' Hand locks stay as set.' : ''));
    }
    if (!lockChanged && !anchorChanged) lines.push('Quarter locks: unchanged.');
    const qBefore = Calendar.currentQuarter(before, today), qAfter = Calendar.currentQuarter(after, today);
    if (qBefore !== qAfter) lines.push('Current quarter: ' + qBefore + ' → ' + qAfter + '.');

    if (graceChanged) {
      const later = new Set(after.filter(r => r.Date > date && Calendar.countsNight(r)).map(r => r.Date)).size;
      lines.push(number(later, 'later club night') + ' this season ' + (later === 1 ? 'uses' : 'use') + ' the new requirement.');
    }
    const lessons = Calendar.lessonChanges(before, after, season.config).length;
    if (lessons) lines.push(number(lessons, 'weekly lesson') + ' affected.');
    if (!cancelling) lines.push('Only Undo restores the row exactly.');
    lines.push('Every record stays on its original date. Undo reverses this change.');
    list.push(...earlier.map(r => [r.kind, nameOf(r.id), r.item].filter(Boolean).join(' · ')));

    const title = cancelling ? 'Cancel club night' : 'Restore club night';
    const danger = activity.recorded || blocks.length > 0;
    return {
      needsDialog: !cancelling || danger || startChanged || lockChanged || qBefore !== qAfter,
      danger, title, ok: cancelling ? 'Cancel this night' : 'Restore this night', lines, list,
      label: (cancelling && activity.recorded ? 'Calendar note' : title) + ' · ' + date
    };
  }
  // END PLAYTEST
  const api = { activityAt, noteImpact: Season.recordedNightActivity, noticeText, inspect, compare, correctionImpact, propose, mergeConflicts, reviewDates, reviewedCalendar, summary };
  // BEGIN PLAYTEST
  api.cancellationSummary = cancellationSummary;
  // END PLAYTEST
  if (typeof module !== 'undefined') module.exports = api; else root.CalendarSafety = api;
})(this);
