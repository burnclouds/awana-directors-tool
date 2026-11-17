(this.AwanaVersions = this.AwanaVersions || {})['teamplan.js'] = '1.9.3';
// The year plan for color teams: which quarters are locked, ready to lock or projected, which colors are pins, and (later tasks) the projection engine.
//
// What is stored (season.config.teamPlan, left out of the file while empty so older files and older apps are untouched):
//   locked: { Q2: 'YYYY-MM-DD' }   quarters locked by hand, with the day
//   proj:   { <id>: 'RB--' }       the color the engine projected for each quarter (R B G Y, or - for none or locked)
//   prio:   { order, off }         the balancing priorities (Options tab)
// The colors themselves stay in team:Q1..team:Q4 on each person, as before. A color in an unlocked quarter is a PIN when it is not
// the projected one (a hand edit, an import, or an older file with no plan at all); the projection never moves a pin.
(function (root) {
  const Calendar = root.Calendar || (typeof require !== 'undefined' ? require('./calendar.js') : null);
  const Teams = root.Teams || (typeof require !== 'undefined' ? require('./teams.js') : null);
  const Season = root.Season || (typeof require !== 'undefined' ? require('./season.js') : null);
  const M = root.Model || (typeof require !== 'undefined' ? require('./model.js') : null);
  const { X } = M;

  const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
  const LETTER = { Red: 'R', Blue: 'B', Green: 'G', Yellow: 'Y' };
  const READY_DAYS = 21;           // the next quarter turns "ready to lock" this many days before its first night
  const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
  const qIndex = q => { const i = QUARTERS.indexOf(q); if (i < 0) throw new Error('Bad quarter "' + q + '".'); return i; };
  const days = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

  // ---------- the stored plan ----------
  // Reading never writes: the three parts are always there for the caller, but only what was set goes into the file.
  function config(season) {
    const t = (season.config && season.config.teamPlan) || {};
    const c = { locked: isObj(t.locked) ? t.locked : {}, proj: isObj(t.proj) ? t.proj : {}, prio: isObj(t.prio) ? t.prio : {} };
    if (t.blendNights !== undefined) c.blendNights = t.blendNights;      // only when set (see setBlendNights): the three parts are always there, nothing else is invented
    return c;
  }
  const own = (season, key) => {
    const t = season.config.teamPlan = isObj(season.config.teamPlan) ? season.config.teamPlan : {};
    return (t[key] = isObj(t[key]) ? t[key] : {});
  };
  const tidy = season => {
    const t = season.config.teamPlan; if (!isObj(t)) return;
    ['locked', 'proj', 'prio'].forEach(k => { if (!isObj(t[k]) || !Object.keys(t[k]).length) delete t[k]; });
    if (!Object.keys(t).length) delete season.config.teamPlan;
  };
  const withChar = (str, i, ch) => { const a = (str || '----').padEnd(4, '-').split(''); a[i] = ch; return a.join(''); };
  function setProjected(season, id, q, color) {
    const i = qIndex(q); id = String(id);
    if (color && !LETTER[color]) throw new Error('Team is Red, Blue, Green or Yellow.');
    const proj = own(season, 'proj'), next = withChar(proj[id], i, color ? LETTER[color] : '-');
    if (next === '----') delete proj[id]; else proj[id] = next;
    tidy(season);
  }

  // ---------- states ----------
  const firstNight = (calendar, q) => (Calendar.nights(calendar, q) || []).map(r => r.Date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()[0] || '';
  // locked: locked by hand, or its first club night has come. ready: the next unlocked quarter, starting within READY_DAYS. projected: the rest.
  function stateOf(season, calendar, q, today) {
    const i = qIndex(q), c = config(season), first = j => firstNight(calendar, QUARTERS[j]);
    const locked = j => !!c.locked[QUARTERS[j]] || (!!first(j) && first(j) <= today);
    if (locked(i)) return 'locked';
    for (let j = 0; j < i; j++) if (!locked(j)) return 'projected';      // an earlier quarter is still open: this one is not next
    return first(i) && days(today, first(i)) <= READY_DAYS ? 'ready' : 'projected';
  }

  // ---------- locks ----------
  // Locking records the day. The projection marks stay: a locked quarter is never recalculated whatever its marks say, and if it is unlocked
  // again the colors the plan projected are projected again (and can be recalculated), while hand-set ones stay pins.
  function lock(season, q, date) {
    qIndex(q); own(season, 'locked')[q] = date; tidy(season);
  }
  function unlock(season, q, calendar, today) {
    qIndex(q);
    const first = firstNight(calendar, q);
    if (first && first <= today) throw new Error(q + ' has already started: edit its colors by hand.');
    if (season.config.teamPlan && isObj(season.config.teamPlan.locked)) delete season.config.teamPlan.locked[q];
    tidy(season);
  }

  // ---------- pins ----------
  // Only meaningful for an unlocked quarter. A locked quarter keeps its projection marks (see lock()), but it is never recalculated, so whether a color is a pin no longer matters there.
  function isPinned(master, season, person, q) {
    const i = qIndex(q), value = person['team:' + q], want = LETTER[value];
    if (!value) return false;
    const mark = (config(season).proj[String(person[X.ID])] || '')[i];
    return !want || mark !== want;
  }

  // ---------- attendance turnout ----------
  // A child's rate is the share of club nights they came to, counted from their first attended night (a late start is not held against
  // them), up to today. Under MIN_NIGHTS counted nights there is too little to go on, so the group average stands in (and the Why panel says so).
  // A child who never came has no first night to count from and is treated the same way. Where nobody has enough nights, everyone counts as 1.
  const MIN_NIGHTS = 3;
  // HOW HISTORY BLENDS IN (Mike, 2026-11-13: expected attendance must not put all the regulars on one team). Two rates exist for a child:
  //   this season's rate = nights present / nights counted, from their first attended night (Season.turnoutCounts), and
  //   the history rate   = nights present / nights counted over every earlier year kept in season.pastTurnout (all years pooled, so a long record outweighs a short one), used only when those years hold at least MIN_NIGHTS nights.
  // With n nights counted this season and FULL = the "blend nights" knob (default 20, config.teamPlan.blendNights):
  //   n < MIN_NIGHTS            -> the history rate alone (a child who just came back is not an unknown); no history -> the group average of the children who do have a rate (as before)
  //   MIN_NIGHTS <= n < FULL    -> w = (n - MIN_NIGHTS) / (FULL - MIN_NIGHTS) of this season + (1 - w) of the history rate (w = 0 at MIN_NIGHTS, so the rate never jumps; w = 1 at FULL)
  //   n >= FULL or no history   -> this season's rate alone
  const FULL_NIGHTS = 20, MAX_FULL = 60;
  const COLORS = Object.keys(LETTER);
  const kidsOf = (ctx, group) => ctx.master.people.filter(p => M.isActive(p) && M.isClubber(p) && M.groupOf(M.room(p)) === group);
  function fullNights(season) { const v = config(season).blendNights; return Number.isInteger(v) && v > MIN_NIGHTS && v <= MAX_FULL ? v : FULL_NIGHTS; }
  function pastOf(season, id) {
    const l = season.pastTurnout && season.pastTurnout[id]; if (!Array.isArray(l)) return null;
    let nights = 0, came = 0; l.forEach(x => { if (x && x.nights > 0) { nights += x.nights; came += Math.min(x.came, x.nights); } });
    return nights >= MIN_NIGHTS ? { rate: came / nights, nights, years: l.length } : null;
  }
  function ratesFor(ctx, people) {
    const counts = Season.turnoutCounts(ctx.season, ctx.calendar, ctx.today), full = fullNights(ctx.season);
    const base = people.map(p => {
      const id = String(p[X.ID]), c = counts[id] || { nights: 0, came: 0 }, cur = c.nights ? c.came / c.nights : 0, past = pastOf(ctx.season, id), r = { id, nights: c.nights, past };
      if (c.nights >= MIN_NIGHTS && !past) return Object.assign(r, { rate: cur, weight: 1, has: true });
      if (c.nights >= MIN_NIGHTS) { const w = Math.min(1, (c.nights - MIN_NIGHTS) / (full - MIN_NIGHTS)); return Object.assign(r, { rate: w * cur + (1 - w) * past.rate, weight: w, has: true }); }
      if (past) return Object.assign(r, { rate: past.rate, weight: 0, has: true });
      return Object.assign(r, { rate: 0, weight: 1, has: false });
    }), enough = base.filter(x => x.has), avg = enough.length ? enough.reduce((t, x) => t + x.rate, 0) / enough.length : 1;
    return new Map(base.map(x => [x.id, x.has ? { rate: x.rate, nights: x.nights, usedAverage: false, usedHistory: !!x.past, weight: x.weight, pastRate: x.past ? x.past.rate : null, pastNights: x.past ? x.past.nights : 0 } : { rate: avg, nights: x.nights, usedAverage: true, usedHistory: false, weight: 1, pastRate: null, pastNights: 0 }]));
  }
  function rate(ctx, person) {
    const group = M.groupOf(M.room(person)), kids = kidsOf(ctx, group);
    return ratesFor(ctx, kids.includes(person) ? kids : kids.concat(person), group).get(String(person[X.ID]));
  }
  // Every child in a group with the rate used for them (the Why panel shows these).
  function ratesOf(ctx, group) { const kids = kidsOf(ctx, group), r = ratesFor(ctx, kids, group); return kids.map(p => Object.assign({ person: p }, r.get(String(p[X.ID])))); }
  // Expected children present per night for each color: the sum of the members' rates.
  function turnout(ctx, group, colorOf) {
    const kids = kidsOf(ctx, group), r = ratesFor(ctx, kids, group), out = {};
    COLORS.forEach(c => { out[c] = 0; });
    kids.forEach(p => { const c = colorOf(p); if (out[c] !== undefined) out[c] += r.get(String(p[X.ID])).rate; });
    return out;
  }

  // ---------- balance now, and a suggested move ----------
  // A "regular" has an expected rate of at least REGULAR, a child who "rarely comes" is under SELDOM. A group's teams are LOPSIDED when the most and the least expected turnout differ by more than
  // max(1 child, 15% of the average team): the flag the balance panel shows in plain words.
  const REGULAR = 0.75, SELDOM = 0.4, LOPSIDED_SHARE = 0.15;
  const r1 = n => (Math.round(n * 10) / 10).toFixed(1);
  // colorOf(person) -> the color to count for them (the grid passes the played or projected one). Returns { rows: [{ color, kids, expected, gap, regulars, seldom }], mean, spread, lopsided, note }.
  function balance(ctx, group, colorOf) {
    const kids = kidsOf(ctx, group), rates = ratesFor(ctx, kids), rows = COLORS.map(color => ({ color, kids: 0, expected: 0, gap: 0, regulars: 0, seldom: 0 }));
    kids.forEach(p => { const row = rows.find(x => x.color === colorOf(p)); if (!row) return; const t = rates.get(String(p[X.ID])).rate; row.kids++; row.expected += t; if (t >= REGULAR) row.regulars++; if (t < SELDOM) row.seldom++; });
    const placed = rows.reduce((t, x) => t + x.kids, 0), mean = rows.reduce((t, x) => t + x.expected, 0) / COLORS.length;
    rows.forEach(x => { x.gap = x.expected - mean; });
    const hi = rows.reduce((a, b) => b.expected > a.expected ? b : a), lo = rows.reduce((a, b) => b.expected < a.expected ? b : a), spread = hi.expected - lo.expected;
    const lopsided = placed >= COLORS.length * 2 && spread > Math.max(1, LOPSIDED_SHARE * mean);
    // The advice must match the cause: when the high team has no "regulars" the gap comes from many middling children, so do not tell the leader to move one who nearly always comes (Fable review, suspected item 6).
    const lead = hi.regulars > 0 ? hi.color + ' has the regulars' : hi.color + ' is expected to have more children';
    const note = lopsided ? lead + ': about ' + r1(hi.expected) + ' children expected a night against ' + r1(lo.expected) + ' for ' + lo.color + ' (' + hi.color + ' has ' + hi.regulars + ' who nearly always come, ' + lo.color + ' has ' + lo.regulars + '). Moving one child who ' + (hi.regulars > 0 ? 'nearly always' : 'usually') + ' comes from ' + hi.color + ' to ' + lo.color + (hi.regulars > 0 ? ' evens it out.' : ' would even it out.') : '';
    return { rows, mean, spread, lopsided, note, placed };
  }
  // The other quarters' colors for a child: { Red: ['Q1'], ... } (what they played, or have been given for a later quarter). Moving to one of these repeats a color.
  // What counts as "had" (Fable review A9): a color PLAYED in a locked quarter; in a quarter that has not started, only a color the leader decided (a hand-set pin, or a dated move), NOT the plan's own projection,
  // which a recalculation repairs by itself. Counting projections made every color "used" once the year was filled, so the move box never suggested anything and warned on every pick.
  // A caller that gives no master, season, calendar or today counts everything, as before.
  function colorUse(ctx, p, q) {
    const h = ctx.history && ctx.history(p), out = {}, haveCtx = !!(ctx.master && ctx.season && ctx.calendar && ctx.today);
    const add = (c, j) => { if (c && !(out[c] || []).includes(j)) (out[c] = out[c] || []).push(j); };
    QUARTERS.forEach(j => {
      if (j === q) return;
      const own = p['team:' + j], moves = (h && h.moves && h.moves[j]) || [];
      if (haveCtx && stateOf(ctx.season, ctx.calendar, j, ctx.today) !== 'locked') {
        moves.forEach(c => add(c, j));      // a dated move is a decision
        if (own && isPinned(ctx.master, ctx.season, p, j)) add(own, j);      // hand-set, not projected
        return;
      }
      Teams.playedIn(p, j, h).concat(!(h && h.list && h.list[j] && h.list[j].length) && own ? [own] : []).forEach(c => add(c, j));
    });
    return out;
  }
  // The best color to move a child to in quarter q: never one they have had (colorUse), keeping team sizes within one child of each other where it can, then the most even expected turnout.
  // Returns { to, from, why } or { to: '', why } when every other color repeats one. Manual choices are never limited by this: the dialog only warns.
  function suggestMove(ctx, p, q) {
    const h = ctx.history && ctx.history(p), from = Teams.endIn(p, q, h), use = colorUse(ctx, p, q), group = M.groupOf(M.room(p)), kids = kidsOf(ctx, group), rates = ratesFor(ctx, kids.includes(p) ? kids : kids.concat(p));
    const colorOf = x => Teams.endIn(x, q, ctx.history && ctx.history(x)), my = rates.get(String(p[X.ID])).rate;
    const size = COLORS.map(c => kids.filter(x => colorOf(x) === c).length), tot = COLORS.map(c => kids.reduce((t, x) => t + (colorOf(x) === c ? rates.get(String(x[X.ID])).rate : 0), 0));
    const options = COLORS.filter(c => c !== from && !use[c]).map(c => {
      const s = size.slice(), t = tot.slice(), fi = COLORS.indexOf(from), ci = COLORS.indexOf(c);
      if (fi >= 0) { s[fi]--; t[fi] -= my; } s[ci]++; t[ci] += my;
      const mean = t.reduce((a, b) => a + b, 0) / COLORS.length;
      return { color: c, spread: Math.max(...s) - Math.min(...s), dev: t.reduce((a, b) => a + (b - mean) ** 2, 0) };
    }).sort((a, b) => (Math.max(a.spread, 1) - Math.max(b.spread, 1)) || (a.dev - b.dev));
    if (!options.length) return { to: '', from, why: 'Every other color is one this child has had this year.' };
    const best = options[0], i = COLORS.indexOf(best.color);
    return { to: best.color, from, why: best.color + ' has ' + size[i] + ' child' + (size[i] === 1 ? '' : 'ren') + ' and about ' + r1(tot[i]) + ' expected a night (' + (from ? from + ' has ' + size[COLORS.indexOf(from)] + ' and ' + r1(tot[COLORS.indexOf(from)]) : 'no color yet') + '), and this child has not been ' + best.color + ' this year.' };
  }
  // What a hand-picked color would do, in plain words (the move dialog shows these as warnings, never blocks): repeats a color, makes the teams uneven, or loads one team with regulars.
  function checkChoice(ctx, p, q, to) {
    const h = ctx.history && ctx.history(p), from = Teams.endIn(p, q, h), warnings = [], use = colorUse(ctx, p, q), group = M.groupOf(M.room(p));
    if (use[to]) warnings.push('This child has already been ' + to + ' in ' + use[to].join(' and ') + '. Moving them repeats a color.');
    const colorAfter = x => x === p ? to : Teams.endIn(x, q, ctx.history && ctx.history(x)), kids = kidsOf(ctx, group), b = balance(ctx, group, colorAfter), sizes = b.rows.map(x => x.kids);
    // Sizes only mean something once everyone in the group has a color (or is marked No team): while children are still blank, every pick looks "uneven" and the warning would fire each time (A8).
    const blanks = kids.filter(x => !colorAfter(x) && !M.noTeam(x, q)).length;
    if (!blanks && to !== from && Math.max(...sizes) - Math.min(...sizes) > 1) warnings.push('Team sizes would be uneven (' + b.rows.map(x => x.color + ' ' + x.kids).join(', ') + ').');
    if (!blanks && to !== from && b.lopsided) warnings.push(b.note);
    return { warnings, kids: kids.length };
  }
  function setBlendNights(season, n) {
    const t = season.config.teamPlan = isObj(season.config.teamPlan) ? season.config.teamPlan : {};
    if (Number.isInteger(n) && n > MIN_NIGHTS && n <= MAX_FULL && n !== FULL_NIGHTS) t.blendNights = n; else delete t.blendNights;
    tidy(season);
  }

  // ---------- priorities ----------
  // Never repeat a color, a friend placement and even team sizes are built into the solver and always come first. Mike orders and switches
  // the other three (keep teammates apart, even expected turnout, spread each grade); the first of them in his order weighs most.
  const PRIORITIES = [
    { id: 'norepeat', label: 'Never repeat a color in the year', fixed: true },
    { id: 'friend', label: 'A new child joins a friend (placement, part 2)', fixed: true, reserved: true },
    { id: 'headcount', label: 'Even team sizes', fixed: true },
    { id: 'apart', label: 'Keep earlier teammates apart' },
    { id: 'turnout', label: 'Even expected turnout (from past attendance)' },
    { id: 'grade', label: 'Spread each grade across the teams' }];
  const TUNABLE = PRIORITIES.filter(x => !x.fixed).map(x => x.id), W_BY_RANK = [0.3, 0.2, 0.05], STAB = 1;
  // order: all six ids, the three fixed ones first then the tunable ones in Mike's order; off: only a tunable id can be switched off.
  // Stored (config.teamPlan.prio) are only the tunable order and the off list, and only when they differ from the defaults.
  const uniq = (list, allowed) => (Array.isArray(list) ? list : []).filter((id, i, a) => allowed.includes(id) && a.indexOf(id) === i);
  function priorities(season) {
    const pr = config(season).prio, tun = uniq(pr.order, TUNABLE);
    TUNABLE.forEach(id => { if (!tun.includes(id)) tun.push(id); });
    return { order: PRIORITIES.filter(x => x.fixed).map(x => x.id).concat(tun), off: TUNABLE.filter(id => uniq(pr.off, TUNABLE).includes(id)) };
  }
  function setPriorities(season, set) {
    const tun = uniq(set.order, TUNABLE); TUNABLE.forEach(id => { if (!tun.includes(id)) tun.push(id); });
    const off = TUNABLE.filter(id => uniq(set.off, TUNABLE).includes(id)), t = own(season, 'prio');
    delete t.order; delete t.off;
    if (tun.join() !== TUNABLE.join()) t.order = tun;
    if (off.length) t.off = off;
    tidy(season);
  }
  const label = id => PRIORITIES.find(x => x.id === id).label.toLowerCase();

  // ---------- projection and recalculation ----------
  // For each group and each open quarter in order: pins and (for a first projection) existing colors stay; the free children are solved with
  // the flow in teams.js (sizes first, then a cost of 1 for moving a child off the color they already have, so a recalculation changes as few
  // children as it can), then pairs are swapped, sizes unchanged, when that lowers the weighted cost of the soft priorities.
  const COLORS4 = Teams.COLORS, gradeOf = p => String(p[M.C.GRADE] || '').trim();
  function run(ctx, mode, opts) {
    const rng = (opts && opts.rng) || Math.random, pr = priorities(ctx.season), season = ctx.season, calendar = ctx.calendar;
    const weight = { apart: 0, turnout: 0, grade: 0 };
    pr.order.filter(id => TUNABLE.includes(id) && !pr.off.includes(id)).forEach((id, i) => { weight[id] = W_BY_RANK[i]; });
    const st = QUARTERS.map(q => stateOf(season, calendar, q, ctx.today)), colors = {}, changes = [];
    Teams.GROUPS.forEach(g => {
      const kids = kidsOf(ctx, g); if (!kids.length) return;
      const rates = ratesFor(ctx, kids, g), n = kids.length, base = Math.floor(n / COLORS4.length);
      const cur = kids.map(p => QUARTERS.map(q => Teams.endIn(p, q, ctx.history && ctx.history(p))));          // working colors, updated as quarters are decided (a move replaces the roster color: the effective color)
      const idx = c => COLORS4.indexOf(c);
      QUARTERS.forEach((q, qi) => {
        if (st[qi] === 'locked') return;
        const pinned = (p, j) => !!p['team:' + QUARTERS[j]] && isPinned(ctx.master, season, p, QUARTERS[j]);
        const isFree = p => { const v = p['team:' + q]; return !v || (!pinned(p, qi) && mode === 'recalc'); };
        const freeI = [], fixedI = [], noTeamN = kids.filter(p => M.noTeam(p, q)).length;      // a child marked "No team" for this quarter is on no team: not assigned, not counted, and shares no team with anyone (their color stays blank)
        kids.forEach((p, i) => { if (!M.noTeam(p, q)) (isFree(p) ? freeI : fixedI).push(i); });
        const baseQ = Math.floor((n - noTeamN) / COLORS4.length);
        if (!freeI.length) return;
        const prefer = freeI.map(i => mode === 'recalc' && kids[i]['team:' + q] && !pinned(kids[i], qi) ? idx(kids[i]['team:' + q]) : -1);
        const forbid = i => {
          const s = new Set(), h = ctx.history && ctx.history(kids[i]);
          QUARTERS.forEach((_, j) => {
            if (j === qi) return;
            if (!(j < qi || st[j] === 'locked' || pinned(kids[i], j) || mode === 'project')) return;
            const moved = h && h.list && h.list[QUARTERS[j]] && h.list[QUARTERS[j]].length;      // a quarter with moves: the colors actually played (the roster color only when it was not replaced from the first night)
            (moved ? Teams.playedIn(kids[i], QUARTERS[j], h) : [cur[i][j]]).forEach(col => { const c = idx(col); if (c >= 0) s.add(c); });
          });      // filling blanks leaves every other color alone, so none of them may be repeated
          return Teams.forbidFinal(s, ctx.history && ctx.history(kids[i]), q);      // ctx.history(p): Season.colorHistory (mid-quarter moves count as played; with all four used, the least-played color is allowed)
        };
        const forbidden = freeI.map(forbid), fixedCnt = COLORS4.map((_, k) => fixedI.filter(i => idx(cur[i][qi]) === k).length);
        // the color that has had the smallest teams so far gets the extra child first, so big teams rotate
        const hist = COLORS4.map((_, k) => kids.reduce((t, _, i) => t + cur[i].slice(0, qi).filter(c => idx(c) === k).length, 0));
        // a recalculation keeps the extra child where it already is (the largest team ranks first), or it would move children just to rotate the big team
        const now = COLORS4.map((_, k) => fixedCnt[k] + freeI.filter((_, a) => prefer[a] === k).length);
        const order = shuffled(COLORS4.map((_, k) => k), rng).sort((a, b) => mode === 'recalc' && now[a] !== now[b] ? now[b] - now[a] : hist[a] - hist[b]), rankOf = []; order.forEach((k, r) => { rankOf[k] = r; });
        const edge = (i, k) => (prefer[i] >= 0 && k !== prefer[i] ? STAB : 0);
        let pick = Teams.attempt(freeI.length, fixedCnt, baseQ, rankOf, forbidden, rng, edge);
        if (pick.some(k => k < 0)) pick = Teams.attempt(freeI.length, fixedCnt, baseQ, rankOf, forbidden.map((f, i) => pick[i] < 0 ? new Set() : f), rng, edge);
        const colorAt = new Array(n).fill(-1); fixedI.forEach(i => { colorAt[i] = idx(cur[i][qi]); }); pick.forEach((k, a) => { colorAt[freeI[a]] = k; });
        const before = kids.map((p, i) => (isFree(p) ? idx(p['team:' + q] || '') : colorAt[i]));
        // soft priorities: W = how often two children shared a team earlier this year; rate = expected presence; grade counts per team
        const W = kids.map((_, i) => kids.map((_, j) => i === j ? 0 : QUARTERS.slice(0, qi).filter((_, h) => cur[i][h] && cur[i][h] === cur[j][h]).length));
        const rate = kids.map(p => rates.get(String(p[X.ID])).rate), gr = kids.map(gradeOf), grades = [...new Set(gr)];
        const T = COLORS4.map((_, k) => kids.reduce((t, _, i) => t + (colorAt[i] === k ? rate[i] : 0), 0)), mean = T.reduce((a, b) => a + b, 0) / COLORS4.length;
        const N = {}, gm = {}; grades.forEach(x => { N[x] = COLORS4.map((_, k) => kids.filter((_, i) => gr[i] === x && colorAt[i] === k).length); gm[x] = kids.filter((_, i) => gr[i] === x).length / COLORS4.length; });
        const S = kids.map((_, i) => COLORS4.map((_, k) => kids.reduce((t, _, j) => t + (colorAt[j] === k ? W[i][j] : 0), 0)));
        const pf = new Map(freeI.map((i, a) => [i, prefer[a]]));
        for (let pass = 0; pass < 30; pass++) {
          let moved = false;
          for (let ai = 0; ai < freeI.length; ai++) for (let bi = ai + 1; bi < freeI.length; bi++) {
            const a = freeI[ai], b = freeI[bi], Xc = colorAt[a], Yc = colorAt[b];
            if (Xc === Yc || forbidden[ai].has(Yc) || forbidden[bi].has(Xc)) continue;
            let d = weight.apart * (S[a][Yc] + S[b][Xc] - 2 * W[a][b] - S[a][Xc] - S[b][Yc]);
            const tx = T[Xc] - rate[a] + rate[b], ty = T[Yc] + rate[a] - rate[b];
            d += weight.turnout * ((tx - mean) ** 2 + (ty - mean) ** 2 - (T[Xc] - mean) ** 2 - (T[Yc] - mean) ** 2);
            if (gr[a] !== gr[b]) {
              const ga = N[gr[a]], gb = N[gr[b]], m1 = gm[gr[a]], m2 = gm[gr[b]];
              d += weight.grade * ((ga[Xc] - 1 - m1) ** 2 + (ga[Yc] + 1 - m1) ** 2 - (ga[Xc] - m1) ** 2 - (ga[Yc] - m1) ** 2 + (gb[Xc] + 1 - m2) ** 2 + (gb[Yc] - 1 - m2) ** 2 - (gb[Xc] - m2) ** 2 - (gb[Yc] - m2) ** 2);
            }
            const pa = pf.get(a), pb = pf.get(b);
            d += STAB * ((pa >= 0 && Yc !== pa ? 1 : 0) - (pa >= 0 && Xc !== pa ? 1 : 0) + (pb >= 0 && Xc !== pb ? 1 : 0) - (pb >= 0 && Yc !== pb ? 1 : 0));
            if (d < -1e-9) {
              kids.forEach((_, k) => { S[k][Xc] += W[k][b] - W[k][a]; S[k][Yc] += W[k][a] - W[k][b]; });
              T[Xc] = tx; T[Yc] = ty;
              if (gr[a] !== gr[b]) { N[gr[a]][Xc]--; N[gr[a]][Yc]++; N[gr[b]][Xc]++; N[gr[b]][Yc]--; }
              colorAt[a] = Yc; colorAt[b] = Xc; moved = true;
            }
          }
          if (!moved) break;
        }
        const sizesOf = a => COLORS4.map((_, k) => a.filter(c => c === k).length), oldSizes = sizesOf(before.filter(c => c >= 0));
        const oldSpread = oldSizes.length ? Math.max(...oldSizes) - Math.min(...oldSizes) : 0;
        freeI.forEach(i => {
          const p = kids[i], to = COLORS4[colorAt[i]], from = p['team:' + q] || '';
          cur[i][qi] = to; if (to === from) return;
          (colors[p[X.ID]] = colors[p[X.ID]] || {})[q] = to;
          let reason, priority;
          if (!from) { priority = 'headcount'; reason = 'Projected ' + to + ': a color this child has not had, with ' + g + ' team sizes kept even.'; }
          else if (forbidden[freeI.indexOf(i)].has(idx(from))) { priority = 'norepeat'; reason = from + ' to ' + to + ': ' + from + ' is already used or pinned for this child elsewhere in the year (never repeat a color).'; }
          else if (oldSpread > 1) { priority = 'headcount'; reason = from + ' to ' + to + ': a pin made the teams uneven (' + oldSizes.map((c, k) => COLORS4[k] + ' ' + c).join(', ') + '), so team sizes are evened out.'; }
          else {
            const top = pr.order.find(id => TUNABLE.includes(id) && !pr.off.includes(id)) || 'turnout';
            priority = top;
            reason = from + ' to ' + to + ': ' + (top === 'turnout' ? 'expected turnout ' + T[idx(from)].toFixed(1) + ' for ' + from + ' against ' + T[idx(to)].toFixed(1) + ' for ' + to + ' (' + label(top) + ').' : 'it fits ' + label(top) + ' better once the other children moved.');
          }
          changes.push({ id: p[X.ID], q, from, to, reason, priority });
        });
      });
    });
    return { colors, changes, count: new Set(changes.map(c => c.id)).size };
  }
  const project = (ctx, opts) => run(ctx, 'project', opts), recalc = (ctx, opts) => run(ctx, 'recalc', opts);
  // Where the teams would still be uneven (more than one child apart) in an open quarter once a plan is applied. A recalculation solves the quarters in order and
  // never repeats a color, so a late quarter can be too rigid to even out: this is how the grid says so instead of staying silent.
  function balanceNotes(ctx, plan) {
    const notes = [];
    Teams.GROUPS.forEach(g => {
      const kids = kidsOf(ctx, g);
      QUARTERS.forEach(q => {
        if (stateOf(ctx.season, ctx.calendar, q, ctx.today) === 'locked') return;
        const n = COLORS4.map(c => kids.filter(p => ((plan && plan.colors[p[X.ID]] && plan.colors[p[X.ID]][q]) || p['team:' + q]) === c).length), have = n.reduce((a, b) => a + b, 0);
        if (have && Math.max(...n) - Math.min(...n) > 1) notes.push({ group: g, q, spread: Math.max(...n) - Math.min(...n), sizes: COLORS4.map((c, k) => c + ' ' + n[k]).join(' · ') });
      });
    });
    return notes;
  }
  // A new year starts with no locks and no projection (the colors are archived and start over).
  // A new year starts over: the plan's locks and projection, the dated moves (they belong to last year's quarters, and would still apply to Q1 to Q4 of the new year), and the repeats and uneven quarters accepted last year.
  // A seeded shuffle that calls rng exactly length-1 times (Fisher-Yates). The old `sort(() => rng() - 0.5)` made the number of rng calls depend on the browser's sort, so the same seed could give Chrome and Safari
  // different offers for the same file (Fable review, suspected item 1).
  const shuffled = (arr, rng) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const newYear = season => { delete season.config.teamPlan; season.teamMoves = {}; season.config.teamsOk = { repeats: [], uneven: [] }; };
  // Write a plan: the colors into team:Qn and the projection marks. Only the cells in the plan are touched.
  function applyPlan(ctx, plan) {
    const byId = new Map(ctx.master.people.map(p => [String(p[X.ID]), p]));
    Object.keys(plan.colors).forEach(id => Object.keys(plan.colors[id]).forEach(q => {
      const p = byId.get(String(id)); if (!p) return;
      M.addUserCol(ctx.master, 'team:' + q); p['team:' + q] = plan.colors[id][q]; setProjected(ctx.season, id, q, plan.colors[id][q]);
    }));
    return plan.count;
  }

  const api = { shuffled, QUARTERS, READY_DAYS, MIN_NIGHTS, FULL_NIGHTS, MAX_FULL, REGULAR, SELDOM, fullNights, setBlendNights, balance, colorUse, suggestMove, checkChoice, COLORS, ratesOf, PRIORITIES, priorities, setPriorities, project, recalc, balanceNotes, newYear, applyPlan, rate, turnout, config, stateOf, lock, unlock, setProjected, isPinned, firstNight };
  if (typeof module !== 'undefined') module.exports = api; else root.TeamPlan = api;
})(this);
