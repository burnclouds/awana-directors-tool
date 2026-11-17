(this.AwanaVersions = this.AwanaVersions || {})['stats.js'] = '1.4.1';
// Season statistics: attendance by class and for the whole club, who attended most, who earned most, how fast Sparks are moving through their books.
// Pure: roster, season and calendar in, plain numbers out; the Statistics tab draws it. Nothing here is stored.
//   compute({ master, season, calendar }) -> { nights, club, classes, kids, adults, adultsTracked, achievers, points, pace, teams }
// Rules: a night counts when it is a club night (not an event, not "no club") and at least one child is marked present (volunteers do not count; Season.heldNights, the same rule the store, Pace,
// the printed dates attended and the color-team turnout use; who is a child comes from the data file's own roster, CR-09). A class is the person's class today (a child who moved rooms is counted in the new room for every night). "Present" is the attendance mark only; the handbook,
// participation and extra marks are not attendance. Children marked inactive stay in the night headcounts (those nights happened) but are not ranked, and the awards listed in
// config.exclude (the ones everyone gets) are not counted, so the rankings agree with the store.
(function (root) {
  const M = root.Model || require('./model.js'), Season = root.Season || require('./season.js');
  const { X } = M;
  const MIN_NIGHTS = 3;        // pace needs a few nights to mean anything
  const round = (n, d) => { const f = Math.pow(10, d == null ? 1 : d); return Math.round(n * f) / f; };
  const sum = a => a.reduce((s, x) => s + x, 0);
  const byCount = (a, b) => b.count - a.count || a.name.localeCompare(b.name);

  // Spread of a list of numbers (S15). Unrounded; the screen rounds. Modes: every value with the top frequency, [] when every value occurs once.
  // sampleSd is null for fewer than two values. Population SD divides by n; sample SD divides by n - 1.
  function spread(v) {
    const n = v.length;
    if (!n) return { n: 0, max: null, min: null, mean: null, median: null, modes: null, popSd: null, sampleSd: null };
    const mean = sum(v) / n, s = v.slice().sort((a, b) => a - b), mid = Math.floor(n / 2);
    const median = n % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    const freq = new Map(); v.forEach(x => freq.set(x, (freq.get(x) || 0) + 1));
    const top = Math.max(...freq.values()), modes = top > 1 ? [...freq.keys()].filter(x => freq.get(x) === top).sort((a, b) => a - b) : [];
    const ss = sum(v.map(x => (x - mean) * (x - mean)));
    return { n, max: s[n - 1], min: s[0], mean, median, modes, popSd: Math.sqrt(ss / n), sampleSd: n > 1 ? Math.sqrt(ss / (n - 1)) : null };
  }
  // Night-by-night figures for children and adults (S15). span is 'season' or 'Q1'..'Q4'. Adults leave out nights with no adults marked (they were not counted, not zero).
  // Takes the held nights from compute, so the held rule is not repeated here.
  function nightFigures(nights, span) {
    const f = nights.filter(n => span === 'season' || n.quarter === span);
    const part = (rows, key) => {
      const sp = spread(rows.map(n => n[key])), top = sp.max, bottom = sp.min;
      return Object.assign(sp, { nights: rows.map(n => ({ date: n.date, count: n[key] })),
        maxDates: rows.filter(n => n[key] === top).map(n => n.date), minDates: rows.filter(n => n[key] === bottom).map(n => n.date) });
    };
    return { span, children: part(f, 'kids'), adults: part(f.filter(n => n.adults > 0), 'adults') };
  }

  function compute(ctx) {
    const { master, season, calendar } = ctx, q = Season.counted(calendar || []);
    const people = master.people, byId = new Map(people.map(p => [p[X.ID], p])), isKid = p => M.isClubber(p), name = p => M.fullName(p);
    const present = (d, id) => !!(season.attendance[d] && season.attendance[d][id] && season.attendance[d][id].a);

    // ----- nights -----
    const dates = Season.heldNights(season, calendar || []);
    const nights = dates.map(d => {
      const ids = Object.keys(season.attendance[d]).filter(id => season.attendance[d][id].a), byClass = {}, byClassActive = {};
      let kids = 0, adults = 0;
      ids.forEach(id => { const p = byId.get(id); if (!p) return; if (isKid(p)) { kids++; byClass[M.room(p)] = (byClass[M.room(p)] || 0) + 1; if (M.isActive(p)) byClassActive[M.room(p)] = (byClassActive[M.room(p)] || 0) + 1; } else adults++; });
      return { date: d, quarter: q[d], kids, adults, byClass, byClassActive };
    }).filter(n => n.kids + n.adults > 0);

    // ----- whole club -----
    const k = nights.map(n => n.kids), hi = nights.reduce((b, n) => (!b || n.kids > b.kids ? n : b), null), lo = nights.reduce((b, n) => (!b || n.kids < b.kids ? n : b), null);
    const last = nights[nights.length - 1] || null, avg = nights.length ? sum(k) / nights.length : 0;
    const club = { nights: nights.length, average: round(avg), high: hi && { date: hi.date, count: hi.kids }, low: lo && { date: lo.date, count: lo.kids },
      last: last && { date: last.date, count: last.kids, vsAverage: round(last.kids - avg) }, enrolled: people.filter(p => M.isActive(p) && isKid(p)).length };

    // ----- by class -----
    const rooms = [...new Set(people.filter(p => isKid(p) && (M.isActive(p) || nights.some(n => n.byClass[M.room(p)]))).map(M.room))]
      .sort((a, b) => (M.ROOM_ORDER.indexOf(a) + 1 || 99) - (M.ROOM_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
    const classes = rooms.map(room => {
      const counts = nights.map(n => ({ date: n.date, count: n.byClass[room] || 0 })), enrolled = people.filter(p => M.isActive(p) && isKid(p) && M.room(p) === room).length;
      const h = counts.reduce((b, c) => (!b || c.count > b.count ? c : b), null), l = counts.reduce((b, c) => (!b || c.count < b.count ? c : b), null), av = counts.length ? sum(counts.map(c => c.count)) / counts.length : 0, avActive = nights.length ? sum(nights.map(n => n.byClassActive[room] || 0)) / nights.length : 0;
      return { room, group: M.groupOf(room), enrolled, average: round(av), rate: enrolled ? Math.round(avActive / enrolled * 100) : null, high: h, low: l, last: counts[counts.length - 1] || null };
    });

    // ----- who attended most -----
    const tally = list => list.map(p => ({ id: p[X.ID], name: name(p), room: M.room(p), count: dates.filter(d => present(d, p[X.ID])).length })).filter(r => r.count > 0).sort(byCount);
    const kidsRows = tally(people.filter(p => isKid(p) && M.isActive(p))), adultRows = tally(people.filter(p => !isKid(p)));
    // the first ten, and how many more are tied with the tenth
    const top = rows => { const out = rows.slice(0, 10), edge = out.length ? out[out.length - 1].count : 0; return { top: out, tied: rows.slice(10).filter(r => r.count === edge).length, best: rows.length ? rows[0].count : 0, bestCount: rows.filter(r => r.count === rows[0].count).length }; };
    const kids = Object.assign(top(kidsRows), { perfect: nights.length ? kidsRows.filter(r => r.count === nights.length).length : 0 });
    const adults = Object.assign(top(adultRows), { perfect: nights.length ? adultRows.filter(r => r.count === nights.length).length : 0 });

    // ----- achievement: awards earned, and points as the store adds them up -----
    // Awards earned this season (from Progress and attendance, plus any recorded by hand), not counting the ones everybody gets (config.exclude).
    const earnedBy = p => { const g = M.groupOf(M.room(p)), skip = new Set(((season.config || {}).exclude || {})[g] || []); return Season.earnedAwards(season, p[X.ID], g, calendar || []).filter(r => !skip.has(r.award)).length; };
    const achievers = people.filter(p => isKid(p) && M.isActive(p)).map(p => ({ id: p[X.ID], name: name(p), room: M.room(p), group: M.groupOf(M.room(p)), count: earnedBy(p) })).filter(r => r.count > 0).sort(byCount);
    const leaderOf = g => achievers.find(r => r.group === g) || null;
    const points = people.filter(p => isKid(p) && M.isActive(p)).map(p => {
      const id = p[X.ID], t = Season.totals(season, id, calendar || []), grp = M.groupOf(M.room(p)), games = grp === 'Sparks' || grp === 'T&T';
      const g = games ? Season.kidGamePoints(season, id, grp, Season.teamResolver(season, id, qq => M.teamOf(p, qq), d => q[d]), calendar || []).year : { place: 0, spirit: 0 };
      return { id, name: name(p), room: M.room(p), count: t.year.a + t.year.h + t.year.p + t.year.x + g.place + g.spirit };
    }).filter(r => r.count > 0).sort(byCount);

    // ----- Sparks pace: awards earned per night attended (sections entered on the Progress tab are shown beside it) -----
    const sections = id => sum(Object.values(season.progress[id] || {}).map(b => Object.keys(b).length));
    const pace = people.filter(p => isKid(p) && M.isActive(p) && M.groupOf(M.room(p)) === 'Sparks').map(p => {
      const id = p[X.ID], n = dates.filter(d => present(d, id)).length, a = earnedBy(p);
      return { id, name: name(p), room: M.room(p), nights: n, awards: a, sections: sections(id), pace: n >= MIN_NIGHTS ? a / n : null };
    }).filter(r => r.pace !== null).sort((a, b) => b.pace - a.pace || b.awards - a.awards || a.name.localeCompare(b.name)).map(r => Object.assign(r, { pace: round(r.pace, 2) }));
    const paceAvg = pace.length ? round(sum(pace.map(r => r.pace)) / pace.length, 2) : null;

    // ----- color teams, year so far -----
    const teams = ['Sparks', 'T&T'].map(g => ({ group: g, rows: Season.teamOrder(season).map(team => ({ team, points: sum(Season.QUARTERS.map(qq => Season.standings(season, g, qq, calendar || []).find(r => r.team === team).points)) })).sort((a, b) => b.points - a.points) }))
      .filter(t => t.rows.some(r => r.points));

    return { markUse: markUse(ctx), nights, nightFigures: nightFigures(nights, 'season'), club, classes, kids, adults, adultsTracked: adultRows.length > 0, achievers, leaders: { Cubbies: leaderOf('Cubbies'), Sparks: leaderOf('Sparks'), 'T&T': leaderOf('T&T') }, points, pace, paceAvg, minNights: MIN_NIGHTS, teams };
  }

  // ---------- how freely each class gives Participation and Extra ----------
  // For each class and each of those two marks, every club night is put in a band by the share of the children present who got the mark:
  //   all = every child present, most = 75% or more (not all), some = under 75%, none = nobody. Nights with fewer than MIN_KIDS_NIGHT children present are left out (one child is 100% or 0% by definition).
  // A class's pattern: "everyone" if (all + most) is at least 75% of its nights, "rarely" if none is at least 75%, otherwise "selective". Fewer than MIN_USE_NIGHTS usable nights: "too few nights".
  // A "teacher" here is the class (room): the file records who was in which room, not which adult led it. Classes are the child's class today, as elsewhere on this tab.
  // Which marks a class has follows its sheet: Puggles none, Cubbies Extra only, Sparks and T&T both.
  const MIN_KIDS_NIGHT = 3, MIN_USE_NIGHTS = 3, MOST = 0.75, PATTERN_SHARE = 0.75;
  const USES = { Puggles: [], Cubbies: ['x'], Sparks: ['p', 'x'], 'T&T': ['p', 'x'] };
  const MARK_NAME = { p: 'Participation', x: 'Extra' };
  const bandOf = (marked, n) => marked === n ? 'all' : marked === 0 ? 'none' : marked / n >= MOST ? 'most' : 'some';
  const patternOf = b => { const n = b.all + b.most + b.some + b.none; if (n < MIN_USE_NIGHTS) return 'few'; return (b.all + b.most) / n >= PATTERN_SHARE ? 'everyone' : b.none / n >= PATTERN_SHARE ? 'rarely' : 'selective'; };
  function markUse(ctx) {
    const { master, season, calendar } = ctx, byId = new Map(master.people.map(p => [p[X.ID], p])), dates = Season.heldNights(season, calendar || []);
    const nightsOf = {};                                                  // room -> [{ date, n, p, x }]
    dates.forEach(d => {
      const per = {};
      Object.keys(season.attendance[d]).forEach(id => {
        const mk = season.attendance[d][id], p = byId.get(id); if (!mk.a || !p || !M.isClubber(p)) return;
        const o = per[M.room(p)] || (per[M.room(p)] = { n: 0, p: 0, x: 0 }); o.n++; if (mk.p) o.p++; if (mk.x) o.x++;
      });
      Object.keys(per).forEach(r => (nightsOf[r] = nightsOf[r] || []).push(Object.assign({ date: d }, per[r])));
    });
    const rooms = Object.keys(nightsOf).sort((a, b) => (M.ROOM_ORDER.indexOf(a) + 1 || 99) - (M.ROOM_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));
    const marks = ['p', 'x'].map(k => {
      const classes = rooms.filter(r => (USES[M.groupOf(r)] || []).includes(k)).map(room => {
        const all = nightsOf[room], used = all.filter(n => n.n >= MIN_KIDS_NIGHT), bands = { all: 0, most: 0, some: 0, none: 0 };
        used.forEach(n => { bands[bandOf(n[k], n.n)]++; });
        const kidNights = sum(all.map(n => n.n)), marked = sum(all.map(n => n[k]));
        return { room, group: M.groupOf(room), nights: all.length, usedNights: used.length, bands, kidNights, marked, rate: kidNights ? Math.round(marked / kidNights * 100) : null, pattern: patternOf(bands) };
      });
      const total = { all: 0, most: 0, some: 0, none: 0 }; classes.forEach(c => Object.keys(total).forEach(b => { total[b] += c.bands[b]; }));
      const patterns = { everyone: 0, selective: 0, rarely: 0, few: 0 }; classes.forEach(c => { patterns[c.pattern]++; });
      return { mark: k, name: MARK_NAME[k], classes, total, patterns, classNights: sum(Object.values(total)) };
    }).filter(m => m.classes.length);
    return { marks, minKids: MIN_KIDS_NIGHT, minNights: MIN_USE_NIGHTS, most: MOST, patternShare: PATTERN_SHARE };
  }

  const api = { compute, markUse, MIN_NIGHTS, spread, nightFigures };
  if (typeof module !== 'undefined') module.exports = api; else root.Stats = api;
})(this);
