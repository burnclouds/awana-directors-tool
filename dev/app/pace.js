(this.AwanaVersions = this.AwanaVersions || {})['pace.js'] = '1.0.1';
// Progress pace: how fast each Sparks and T&T child is signing off sections, set against the nights they were here.
// Pure: roster, season and calendar in, plain numbers out; the Progress sheet, the Reports watch list and the Statistics tab draw it. Nothing here is stored.
//   rows(ctx) -> one row per active Sparks / T&T child; room(rows) -> one summary per class; kid(ctx, person) -> one row
// What counts: a "core" section is a dated item of the child's Achievement Record that earns the book or emblem (Sparks: Flight 3:16, Rank and the jewel sections;
// T&T: Start Zones and the emblem sections). Sparks reviews (items after the jewel sections) and T&T Silver / Gold extra credit are NOT core: they can happen long after
// the section (Gold catch-up comes at the end of the year), so they are counted on their own and never move the pace.
// Per attended night: a section is put on the first night the child was present on or after its sign-off date, so a month of work signed off in one visit by a child who comes
// every other week is one big night, not a gap. Pace is therefore sections per night ATTENDED, never per calendar week.
//   overall = all core sections / all nights attended; recent = the last WINDOW attended nights; prior = the WINDOW before those; peak = the best WINDOW so far.
// Lists (a child is in at most one, checked in this order; each needs the child to have enough nights, and the class to have sign-offs entered at all):
//   stalled   = had a stretch at or above GOAL, and now recent is at or under SLOW        (needs 2 x WINDOW nights)
//   steady    = overall under SLOW and never a stretch at or above GOAL                   (needs WINDOW nights)
//   encourage = recent under WATCH, or no core section in the last QUIET attended nights  (needs MIN_NIGHTS)
// Trend: down when recent is at most DROP of overall and no higher than prior; up when recent is at least RISE times overall and above prior (needs 2 x WINDOW nights).
// All the numbers below are first guesses to be tuned on the real sign-off dates.
(function (root) {
  const M = root.Model || require('./model.js'), Season = root.Season || require('./season.js');
  const { X } = M;
  const CFG = { GOAL: 1, SLOW: 0.5, WATCH: 0.75, WINDOW: 4, MIN_NIGHTS: 3, QUIET: 3, DROP: 0.6, RISE: 1.4, FIRST_NIGHT: 3 };
  const round = (n, d) => { const f = Math.pow(10, d == null ? 1 : d); return Math.round(n * f) / f; };
  const sum = a => a.reduce((s, x) => s + x, 0);
  const avg = a => a.length ? sum(a) / a.length : 0;
  const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

  // Which blocks are core and which are extra for a group; every date of every item of the child, with its kind.
  const isExtraBlock = (group, b) => group === 'T&T' && /^(SV|GD)\d/.test(b.key);
  function signoffs(season, id, group) {
    const t = season.config.progress[group], kid = season.progress[id] || {}, out = { core: [], extra: [], extraTotal: 0 };
    if (!t) return out;
    const take = (b, book) => {
      const dates = Season.signsShown(season, id, book);      // a sign-off marked "no date" has no day: it is not signed off on its hidden tick night
      if (isExtraBlock(group, b)) {
        out.extraTotal += b.items.length;
        b.items.forEach(i => { const d = dates[b.key + '.' + i]; if (d) out.extra.push(d); });
      } else b.items.forEach(i => { const d = dates[b.key + '.' + i]; if (d) out.core.push(d); });
      (b.review || []).forEach(i => { out.extraTotal++; const d = dates[b.key + '.' + i]; if (d) out.extra.push(d); });
    };
    (t.common || []).forEach(b => take(b, 'common'));
    Object.keys(kid).filter(c => c !== 'common').forEach(c => (t.perBook || []).forEach(b => take(b, c)));
    // The review total is per book; count it for the books the child has begun (at least one).
    const books = Object.keys(kid).filter(c => c !== 'common').length;
    if (group === 'Sparks' && books > 1) out.extraTotal += (books - 1) * sum((t.perBook || []).map(b => (b.review || []).length));
    if (group === 'Sparks' && !books) out.extraTotal = sum((t.perBook || []).map(b => (b.review || []).length));
    return out;
  }

  const BARS = '▁▂▃▄▅▆▇█';
  const spark = counts => counts.map(n => n <= 0 ? '·' : BARS[Math.min(n, BARS.length) - 1]).join('');
  const windows = (per, w) => { const out = []; for (let i = 0; i + w <= per.length; i++) out.push(avg(per.slice(i, i + w))); return out; };

  function kidRow(ctx, p, held) {
    const { season } = ctx, id = p[X.ID], group = M.groupOf(M.room(p));
    if (group !== 'Sparks' && group !== 'T&T') return null;
    const attended = held.filter(d => season.attendance[d][id] && season.attendance[d][id].a);
    const s = signoffs(season, id, group), W = CFG.WINDOW, n = attended.length;
    const per = attended.map(() => 0);
    let offNight = 0;
    s.core.forEach(d => {
      if (!per.length) return;
      let i = attended.findIndex(a => a >= d);
      if (i < 0) i = per.length - 1;
      if (attended[i] !== d) offNight++;
      per[i]++;
    });
    const last = s.core.slice().sort().pop() || '', lastExtra = s.extra.slice().sort().pop() || '';
    const overall = n >= CFG.MIN_NIGHTS ? s.core.length / n : null;
    const recent = n >= CFG.MIN_NIGHTS ? avg(per.slice(-W)) : null;
    const prior = n >= 2 * W ? avg(per.slice(-2 * W, -W)) : null;
    const peak = n >= 2 * W ? Math.max(...windows(per, W)) : null;
    const quiet = n >= CFG.MIN_NIGHTS && !per.slice(-CFG.QUIET).some(x => x > 0);
    let trend = '';
    if (prior !== null && overall > 0) {
      if (recent <= CFG.DROP * overall && recent <= prior) trend = 'down';
      else if (recent >= CFG.RISE * overall && recent > prior) trend = 'up';
    }
    const first = per.length ? per[0] : 0;
    return { id, name: M.fullName(p), room: M.room(p), group, guest: M.isGuest(p), nights: n, core: s.core.length, extra: s.extra.length, extraTotal: s.extraTotal, per, dates: attended,
      overall, recent, prior, peak, trend, last, lastExtra, nightsSince: last ? attended.filter(d => d > last).length : n, quiet, offNight, firstNight: first,
      list: '' };
  }

  function rows(ctx) {
    const { master, season, calendar } = ctx, held = Season.heldNights(season, calendar || []);
    const out = master.people.filter(p => M.isActive(p) && M.isClubber(p)).map(p => kidRow(ctx, p, held)).filter(Boolean);
    // A class with no sign-off entered at all is "not entered yet", not stalled.
    const entered = {};
    out.forEach(r => { const d = r.last || r.lastExtra || ''; if (d > (entered[r.room] || '')) entered[r.room] = d; });
    out.forEach(r => {
      r.roomEntered = !!entered[r.room]; r.roomThrough = entered[r.room] || '';
      if (!r.roomEntered || r.nights < CFG.MIN_NIGHTS) return;
      const W = CFG.WINDOW;
      if (r.peak !== null && r.peak >= CFG.GOAL && r.recent <= CFG.SLOW) r.list = 'stalled';
      else if (r.nights >= W && r.overall < CFG.SLOW && (r.peak === null || r.peak < CFG.GOAL)) r.list = 'steady';
      else if (r.recent < CFG.WATCH || r.quiet) r.list = 'encourage';
    });
    return out;
  }
  const kid = (ctx, p) => { const held = Season.heldNights(ctx.season, ctx.calendar || []), r = kidRow(ctx, p, held); if (!r) return null; const all = rows(ctx).find(x => x.id === r.id); return all || r; };

  // One summary per class: how the children are moving, so one room can be set beside another.
  function room(list) {
    const rooms = [...new Set(list.map(r => r.room))].sort((a, b) => M.roomRank(a) - M.roomRank(b) || a.localeCompare(b));
    return rooms.map(rm => {
      const k = list.filter(r => r.room === rm), p = k.filter(r => r.overall !== null).map(r => r.overall);
      return { room: rm, group: k[0].group, kids: k.length, rated: p.length, median: p.length ? round(median(p), 2) : null, min: p.length ? round(Math.min(...p), 2) : null, max: p.length ? round(Math.max(...p), 2) : null,
        slow: p.filter(x => x < CFG.SLOW).length, fast: p.filter(x => x >= 1.5).length, signed: sum(k.map(r => r.core)), through: k[0].roomThrough, entered: k[0].roomEntered };
    });
  }
  // Children whose first night here already holds several core sections: earlier work being entered, or a quick start. Only the file's dates are known, so it is a flag, not a verdict.
  const firstNight = list => list.filter(r => r.nights && r.firstNight >= CFG.FIRST_NIGHT).sort((a, b) => b.firstNight - a.firstNight || a.name.localeCompare(b.name));

  const f1 = n => n === null || n === undefined ? '—' : String(round(n, 1));
  const ARROW = { down: '▼ slowing', up: '▲ speeding up', '': '' };
  const LISTS = { stalled: 'Capable, slowed', steady: 'Steadily slow', encourage: 'Needs encouragement' };
  const api = { CFG, LISTS, ARROW, rows, kid, room, firstNight, signoffs, spark, f1, round };
  if (typeof module !== 'undefined') module.exports = api; else root.Pace = api;
})(this);
