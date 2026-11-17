(this.AwanaVersions = this.AwanaVersions || {})['store.js'] = '1.4.1';
// Awana store points: what each child will have to spend at the end of the year, and how the weights behind it add up.
// Pure: roster, season and calendar in, numbers out; the "Awana store points" tab draws and edits it. Settings live in season.config.store.
//   compute({ master, season, calendar, today }) -> { cfg, nightsSoFar, nightsTotal, factor, categories, kids, now, projected, groups, markShare }
// Earnings per child (all from records already kept): attendance nights, handbook, participation, extra, game place points, game spirit points,
// awards earned (not counting the ones listed in config.exclude, which everybody gets), and Progress-tab sections signed off.
// Only the programs ticked in the settings take part (Sparks and T&T unless changed): the others are not counted, listed or scaled.
// raw = sum of weight x count. Methods turn raw into store points between min and max:
//   direct  points = raw, then kept between min and max   (the weights are store points per earning)
//   top     points = raw scaled so the best child gets max, then at least min   (weights only matter relative to each other)
//   range   lowest raw gets min and highest raw gets max, the rest in proportion
// "projected" assumes each child keeps earning at the pace so far for the nights still to come (nights in the calendar not yet entered).
(function (root) {
  const M = root.Model || require('./model.js'), Season = root.Season || require('./season.js');
  const { X } = M;
  const CATS = [['attendance', 'Attendance (nights present)'], ['handbook', 'Brought handbook'], ['participation', 'Participation'], ['extra', 'Extra'], ['place', 'Game place points'], ['spirit', 'Game spirit points'], ['awards', 'Awards earned'], ['sections', 'Handbook sections signed off']];
  const PROGRAMS = ['Puggles', 'Cubbies', 'Sparks', 'T&T'];
  const DEFAULTS = { min: 15, max: 200, method: 'direct', programs: ['Sparks', 'T&T'], weights: { attendance: 1, handbook: 1, participation: 1, extra: 1, place: 1, spirit: 1, awards: 1, sections: 0 } };
  const METHODS = [['direct', 'Direct: the weighted total is the points'], ['top', 'Proportional: the best child gets the maximum'], ['range', 'Range: lowest gets the minimum, highest the maximum']];
  const num = (v, d) => { const n = +v; return Number.isFinite(n) ? n : d; };
  const round = (n, d) => { const f = Math.pow(10, d || 0); return Math.round(n * f) / f; };
  const sum = a => a.reduce((s, x) => s + x, 0);
  const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  function normalize(c) {
    c = c || {}; const w = Object.assign({}, DEFAULTS.weights, c.weights || {});
    CATS.forEach(([k]) => { w[k] = Math.max(0, num(w[k], DEFAULTS.weights[k])); });
    let min = Math.max(0, num(c.min, DEFAULTS.min)), max = num(c.max, DEFAULTS.max), warning = '';
    if (max < min) { warning = 'The maximum (' + max + ') is below the minimum (' + min + '), so the maximum is being treated as ' + min + '. Change one of them.'; max = min; }
    const programs = Array.isArray(c.programs) ? PROGRAMS.filter(g => c.programs.includes(g)) : DEFAULTS.programs.slice();
    return { min, max, method: METHODS.some(m => m[0] === c.method) ? c.method : DEFAULTS.method, programs, weights: w, ...(warning ? { warning } : {}) };
  }

  // raws -> store points, whole numbers
  function award(raws, cfg) {
    const { min, max, method } = cfg, hi = Math.max(0, ...raws), lo = raws.length ? Math.min(...raws) : 0, clamp = x => Math.min(max, Math.max(min, x));
    return raws.map(r => {
      if (method === 'top') return Math.round(clamp(hi > 0 ? r * max / hi : 0));
      if (method === 'range') return Math.round(hi > lo ? min + (r - lo) / (hi - lo) * (max - min) : (hi > 0 ? max : min));
      return Math.round(clamp(r));
    });
  }

  function compute(ctx) {
    const { master, season, calendar } = ctx, cfg = normalize(season.config && season.config.store), q = Season.counted(calendar || []);
    const held = Season.heldNights(season, calendar || []);
    // Nights still to come = counted nights on the calendar that are not entered and are not behind us (after the latest entered night, and not before ctx.today when it is given).
    // A past night nobody entered is not a future night: it is not going to be held.
    const heldSet = new Set(held), last = held.length ? held[held.length - 1] : '', from = ctx.today && ctx.today > last ? ctx.today : null;
    const ahead = Object.keys(q).filter(d => !heldSet.has(d) && (from ? d >= from : d > last)).length;
    const nightsSoFar = held.length, nightsTotal = nightsSoFar + ahead, factor = nightsSoFar ? nightsTotal / nightsSoFar : 0;
    const sectionsOf = id => Season.sectionsThisSeason(season, id);      // only sign-offs from this season: a new season carries last year's forward (newSeason) and they earn nothing again

    const people = master.people.filter(p => M.isActive(p) && M.isClubber(p) && cfg.programs.includes(M.groupOf(M.room(p)))).sort(M.byRoomThenName);
    const kids = people.map(p => {
      const id = p[X.ID], room = M.room(p), group = M.groupOf(room), t = Season.totals(season, id, calendar || []).year;
      const games = group === 'Sparks' || group === 'T&T';
      const g = games ? Season.kidGamePoints(season, id, group, Season.teamResolver(season, id, qq => M.teamOf(p, qq), d => q[d]), calendar || []).year : { place: 0, spirit: 0 };
      const skip = new Set((season.config.exclude || {})[group] || []);
      const counts = { attendance: t.a, handbook: t.h, participation: t.p, extra: t.x, place: g.place, spirit: g.spirit, awards: Season.earnedAwards(season, id, group, calendar || []).filter(r => !skip.has(r.award)).length, sections: sectionsOf(id) };
      return { id, name: M.fullName(p), room, group, counts };
    });
    const rawOf = (counts, f) => sum(CATS.map(([k]) => cfg.weights[k] * counts[k] * f));
    const rawNow = kids.map(k => rawOf(k.counts, 1)), rawProj = kids.map(k => rawOf(k.counts, factor || 1));
    const ptsNow = award(rawNow, cfg), ptsProj = award(rawProj, cfg);
    kids.forEach((k, i) => { k.rawNow = round(rawNow[i], 1); k.rawProjected = round(rawProj[i], 1); k.now = ptsNow[i]; k.projected = ptsProj[i]; });

    // How much of each class's raw score comes from the Participation and Extra marks (weighted, so far). Where those marks go to everyone present they add about the same to every child who came;
    // where a class gives them out selectively they separate children, so this is the number to look at when deciding their weights.
    const markShare = [...new Set(kids.map(k => k.room))].map(room => {
      const ks = kids.filter(k => k.room === room), part = sum(ks.map(k => cfg.weights.participation * k.counts.participation)), extra = sum(ks.map(k => cfg.weights.extra * k.counts.extra)), raw = sum(ks.map(k => k.rawNow));
      return { room, group: ks[0].group, kids: ks.length, perKidParticipation: round(sum(ks.map(k => k.counts.participation)) / ks.length, 1), perKidExtra: round(sum(ks.map(k => k.counts.extra)) / ks.length, 1),
        participationPoints: round(part, 1), extraPoints: round(extra, 1), raw: round(raw, 1), participationShare: raw ? Math.round(part / raw * 100) : 0, extraShare: raw ? Math.round(extra / raw * 100) : 0 };
    });
    const summary = list => ({ kids: list.length, total: sum(list), average: list.length ? round(sum(list) / list.length, 1) : 0, median: round(median(list), 1), min: list.length ? Math.min(...list) : 0, max: list.length ? Math.max(...list) : 0,
      atMin: list.filter(x => x === cfg.min).length, atMax: list.filter(x => x === cfg.max).length });
    const groups = PROGRAMS.map(g => {
      const ks = kids.filter(k => k.group === g);
      return ks.length ? { group: g, kids: ks.length, now: summary(ks.map(k => k.now)), projected: summary(ks.map(k => k.projected)), avg: Object.fromEntries(CATS.map(([c]) => [c, round(sum(ks.map(k => k.counts[c])) / ks.length, 1)])) } : null;
    }).filter(Boolean);

    // where the points come from: weighted share of each earning, using the counts so far
    const weighted = CATS.map(([k, label]) => ({ key: k, label, weight: cfg.weights[k], total: round(sum(kids.map(x => x.counts[k])), 1), average: kids.length ? round(sum(kids.map(x => x.counts[k])) / kids.length, 1) : 0, best: kids.length ? Math.max(...kids.map(x => x.counts[k])) : 0 }));
    const wTotal = sum(weighted.map(c => c.weight * c.total));
    const categories = weighted.map(c => Object.assign(c, { weightedTotal: round(c.weight * c.total, 1), share: wTotal ? Math.round(c.weight * c.total / wTotal * 100) : 0 }));

    // how many children fall in each band of the min-max range
    const bins = 10, width = (cfg.max - cfg.min) / bins || 1;
    const hist = which => Array.from({ length: bins }, (_, i) => { const from = cfg.min + i * width, to = from + width; return { from: Math.round(from), to: Math.round(to), count: kids.filter(k => (i === bins - 1 ? k[which] >= from : k[which] >= from && k[which] < to)).length }; });
    // the factor that would put the best child exactly at max (for the direct method, in the chosen view)
    const topRaw = which => Math.max(0, ...kids.map(k => which === 'now' ? k.rawNow : k.rawProjected));
    return { cfg, nightsSoFar, nightsTotal, factor: round(factor, 2), categories, kids, groups, markShare, now: summary(ptsNow), projected: summary(ptsProj), hist: { now: hist('now'), projected: hist('projected') },
      fitFactor: { now: topRaw('now') ? cfg.max / topRaw('now') : 0, projected: topRaw('projected') ? cfg.max / topRaw('projected') : 0 } };
  }

  const api = { compute, normalize, award, CATS, METHODS, DEFAULTS, PROGRAMS };
  if (typeof module !== 'undefined') module.exports = api; else root.Store = api;
})(this);
