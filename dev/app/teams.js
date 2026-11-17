(this.AwanaVersions = this.AwanaVersions || {})['teams.js'] = '1.5.2';
// Color teams for Sparks and T&T (the two groups play separately).
//
// Rules
//   Q1          random, but as even as the head count allows.
//   Q2 onward   nobody gets a color they have had in an earlier quarter this year, and teams are mixed up:
//               kids who were teammates before are kept apart as much as possible.
//   Always      colors already in team:<Qn> are kept (typed in, imported, or from an earlier run); only blanks are filled.
//               "Never repeat a color" wins over "even sizes" when the two collide, and audit() says so.
//
// Stored as team:Q1..team:Q4 on each person. A new year archives them as team:<year>:Qn and starts clean.
(function (root) {
  const Csv = root.Csv || (typeof require !== 'undefined' ? require('./csv.js') : null);
  const M = root.Model || (typeof require !== 'undefined' ? require('./model.js') : null);

  const COLORS = ['Red', 'Blue', 'Green', 'Yellow'];
  const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
  const GROUPS = ['Sparks', 'T&T'];
  const RESTARTS = 24;
  const col = q => 'team:' + q;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const shuffle = (arr, rng) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

  // Canonical color for whatever is typed in a team cell ('' when it is blank or not one of the four).
  const colorOf = (p, q) => { const v = String(p[col(q)] || '').trim().toLowerCase(); return COLORS.find(c => c.toLowerCase() === v) || ''; };
  const members = (master, g) => master.people.filter(p => M.isActive(p) && M.isClubber(p) && M.groupOf(M.room(p)) === g);
  const priorOf = q => QUARTERS.slice(0, Math.max(0, QUARTERS.indexOf(q)));

  // ---------- the effective color (a move can replace the roster color) ----------
  // hist (optional) is Season.colorHistory(...) for the child. The roster's team:Qn is the quarter's default; a move on or before the quarter's first club night REPLACES it (the child never played it),
  // and a later move changes it from that night on. Without a history everything is the roster color.
  //   playedIn  the colors the child actually played in q, for the no-repeat rule
  //   endIn     the color the child has now / ended q with (the latest move, else the roster color)
  //   effective { color, played, replaced, moved }: moved = the moves that are NOT the quarter's own color (what the grid marks "moved from <date>")
  function playedIn(p, q, hist) {
    const out = [], base = colorOf(p, q); if (base && !(hist && hist.replaced && hist.replaced[q])) out.push(base);
    ((hist && hist.moves && hist.moves[q]) || []).forEach(c => { if (!out.includes(c)) out.push(c); });
    return out;
  }
  const endIn = (p, q, hist) => (hist && hist.end && hist.end[q]) || colorOf(p, q);
  function effective(p, q, hist) {
    const list = (hist && hist.list && hist.list[q]) || [], replaced = !!(hist && hist.replaced && hist.replaced[q]);
    return { color: endIn(p, q, hist), played: playedIn(p, q, hist), replaced, moved: (replaced ? list.slice(1) : list).map(m => ({ from: m.from, team: m.team })) };
  }
  // The colors (as numbers into COLORS) a child may not be given in `quarter`: everything played in their other quarters.
  function forbiddenFor(p, quarter, hist) {
    const s = new Set(); priorOf(quarter).forEach(q => playedIn(p, q, hist).forEach(c => s.add(COLORS.indexOf(c))));
    return forbidFinal(s, hist, quarter);
  }

  // ---------- min-cost flow (kids -> colors), small graphs only ----------
  function flow(nodes, edges, src, sink) {
    const g = Array.from({ length: nodes }, () => []);
    const E = [];
    edges.forEach(([u, v, cap, cost]) => { g[u].push(E.length); E.push({ v, cap, cost }); g[v].push(E.length); E.push({ v: u, cap: 0, cost: -cost }); });
    for (;;) {
      const dist = new Array(nodes).fill(Infinity), prev = new Array(nodes).fill(-1), inq = new Array(nodes).fill(false);
      dist[src] = 0; const q = [src];
      while (q.length) {
        const u = q.shift(); inq[u] = false;
        g[u].forEach(id => { const e = E[id]; if (e.cap > 0 && dist[u] + e.cost < dist[e.v] - 1e-12) { dist[e.v] = dist[u] + e.cost; prev[e.v] = id; if (!inq[e.v]) { inq[e.v] = true; q.push(e.v); } } });
      }
      if (dist[sink] === Infinity) break;
      for (let v = sink; v !== src; v = E[prev[v] ^ 1].v) { E[prev[v]].cap -= 1; E[prev[v] ^ 1].cap += 1; }
    }
    return E;
  }

  // One randomized attempt: sizes as even as possible, no forbidden colors, then swap kids to split up old teammates.
  // edgeCost(i, k) is an optional extra cost for putting kid i on color k (the year plan uses it to prefer where a kid already is).
  function attempt(n, fixedCnt, base, rankOf, forbidden, rng, edgeCost) {
    const src = 0, sink = n + COLORS.length + 1, edges = [], kidEdge = [];
    for (let i = 0; i < n; i++) {
      edges.push([src, 1 + i, 1, 0]);
      COLORS.forEach((_, k) => { if (!forbidden[i].has(k)) { kidEdge.push([i, k, edges.length]); edges.push([1 + i, 1 + n + k, 1, rng() * 0.001 + (edgeCost ? edgeCost(i, k) : 0)]); } });
    }
    COLORS.forEach((_, k) => {
      for (let s = fixedCnt[k] + 1; s <= fixedCnt[k] + n; s++) {
        const cost = s <= base ? 0 : s === base + 1 ? 10 + rankOf[k] : 1000 * (s - base - 1);
        edges.push([1 + n + k, sink, 1, cost]);
      }
    });
    const E = flow(sink + 1, edges, src, sink);
    const pick = new Array(n).fill(-1);
    kidEdge.forEach(([i, k, id]) => { if (E[id * 2].cap === 0) pick[i] = k; });
    return pick;
  }

  // The colors a child may not be given in `quarter` (as color numbers). `s` holds the colors already in their other quarters. hist (optional, from Season.colorHistory) adds what mid-quarter moves
  // brought: a color the child was moved to in another quarter counts as played, the same as a color on the roster. When all four colors are used up (a Quarter 1 move leaves nothing new for Quarter 4),
  // the child may have the color they spent the fewest nights on; with equal time on all four, anything goes.
  function forbidFinal(s, hist, quarter) {
    if (hist) QUARTERS.forEach(q => { if (q !== quarter) (hist.moves[q] || []).forEach(c => { const k = COLORS.indexOf(c); if (k >= 0) s.add(k); }); });
    if (s.size < COLORS.length) return s;
    const time = COLORS.map(c => (hist && hist.time && hist.time[c]) || 0), min = Math.min(...time);
    return new Set(COLORS.map((_, k) => k).filter(k => time[k] > min));
  }
  function assign(master, quarter, opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random, c = col(quarter);
    if (!opts.dry) M.addUserCol(master, c);      // opts.dry: work out the colors Assign blanks would give, without writing any (the To do page's "best choice")
    const result = { assigned: [], kept: 0 };
    GROUPS.forEach(g => {
      const kids = members(master, g).filter(p => !M.noTeam(p, quarter));      // a child marked "No team" is on no team: not given a color, not counted, and the mark stays (R: Fable review A2)
      if (opts.redo) kids.forEach(p => { p[c] = ''; });
      // The color a child plays now: the roster color, or the latest move in this quarter. A child whose only color came from a move is not blank, and teams are sized by what they play, not by the roster (A3, A4).
      const hx = p => opts.history && opts.history(p), eff = p => endIn(p, quarter, hx(p));
      const fixedKids = kids.filter(p => eff(p)), free = kids.filter(p => !eff(p));
      result.kept += fixedKids.length;
      if (!free.length) return;

      const idx = new Map(kids.map((p, i) => [p, i]));
      const prior = priorOf(quarter);
      // W[i][j]: how many earlier quarters kids i and j were on the same team.
      const W = kids.map(() => new Array(kids.length).fill(0));
      const histLoad = [0, 0, 0, 0];      // hx(p) (above): Season.colorHistory, so a move counts as the team a child was on
      prior.forEach(q => {
        COLORS.forEach((color, k) => {
          const team = kids.filter(p => endIn(p, q, hx(p)) === color);
          histLoad[k] += team.length;
          team.forEach(a => team.forEach(b => { if (a !== b) W[idx.get(a)][idx.get(b)]++; }));
        });
      });
      const forbidden = free.map(p => forbiddenFor(p, quarter, hx(p)));      // opts.history(p): Season.colorHistory for the child (moves and time on each color)
      const fixedCnt = COLORS.map(color => fixedKids.filter(p => eff(p) === color).length);
      const base = Math.floor(kids.length / COLORS.length);
      const freeIdx = free.map(p => idx.get(p));

      let best = null;
      const tries = prior.length ? RESTARTS : 1;
      for (let t = 0; t < tries; t++) {
        // The color that has had the smallest teams so far gets the extra kid first, so the big teams rotate.
        const order = shuffle(COLORS.map((_, k) => k), rng).sort((a, b) => histLoad[a] - histLoad[b]);
        const rankOf = []; order.forEach((k, r) => { rankOf[k] = r; });
        const pick = attempt(free.length, fixedCnt, base, rankOf, forbidden, rng);
        // team sums S[i][k] = sum of W[i][j] over j currently on color k
        const colorAt = new Array(kids.length).fill(-1);
        fixedKids.forEach(p => { colorAt[idx.get(p)] = COLORS.indexOf(eff(p)); });
        pick.forEach((k, i) => { colorAt[freeIdx[i]] = k; });
        const S = kids.map((_, i) => COLORS.map((_, k) => kids.reduce((s, _, j) => s + (colorAt[j] === k ? W[i][j] : 0), 0)));
        for (let pass = 0; pass < 50; pass++) {
          let moved = false;
          for (let ai = 0; ai < freeIdx.length; ai++) for (let bi = ai + 1; bi < freeIdx.length; bi++) {
            const a = freeIdx[ai], b = freeIdx[bi], X = colorAt[a], Y = colorAt[b];
            if (X === Y || forbidden[ai].has(Y) || forbidden[bi].has(X)) continue;
            const delta = S[a][Y] + S[b][X] - 2 * W[a][b] - S[a][X] - S[b][Y];
            if (delta < -1e-9) {
              kids.forEach((_, k) => { S[k][X] += W[k][b] - W[k][a]; S[k][Y] += W[k][a] - W[k][b]; });
              colorAt[a] = Y; colorAt[b] = X; moved = true;
            }
          }
          if (!moved) break;
        }
        const cost = kids.reduce((s, _, i) => s + S[i][colorAt[i]], 0) / 2;
        if (!best || cost < best.cost) best = { cost, colorAt: colorAt.slice() };
      }
      free.forEach((p, i) => {
        const color = COLORS[best.colorAt[freeIdx[i]]];
        if (!opts.dry) p[c] = color;
        result.assigned.push({ person: p, color, group: g });
      });
    });
    return result;
  }

  // ---------- checks ----------
  function audit(master, quarter, opts) {
    const prior = priorOf(quarter), out = { groups: {}, unassigned: [], repeats: [], ok: true }, history = opts && opts.history;
    GROUPS.forEach(g => {
      const kids = members(master, g).filter(p => !M.noTeam(p, quarter)), counts = {};      // a child marked "No team" for this quarter is not a team member, so is neither unassigned nor part of the sizes
      COLORS.forEach(color => { counts[color] = 0; });
      kids.forEach(p => {
        const hist = history && history(p), color = endIn(p, quarter, hist);      // the color they have now: a move replaces the roster color (R12 flags 5, 6, 9)
        if (!color) { out.unassigned.push(p); return; }
        counts[color]++;
        const k = COLORS.indexOf(color);
        const q = prior.find(q => playedIn(p, q, hist).includes(color)) || (hist ? QUARTERS.find(q2 => q2 !== quarter && (hist.moves[q2] || []).includes(color)) : '');      // played in another quarter, on the roster or by a move
        if (q) {
          if (forbiddenFor(p, quarter, hist).has(k)) out.repeats.push({ person: p, color, quarter: q });      // not a repeat when all four are used and this is a color they played least
        }
      });
      const v = Object.values(counts);
      out.groups[g] = { counts, total: kids.length, spread: kids.length ? Math.max(...v) - Math.min(...v) : 0 };
    });
    out.ok = !out.unassigned.length && !out.repeats.length && GROUPS.every(g => out.groups[g].spread <= 1);
    return out;
  }

  // ---------- save the colors as a CSV: a template to fill in and import back ----------
  // One row per active Sparks and T&T child (Unique ID, Name, Group, Class, Q1..Q4). importList reads it back: it matches on Unique ID and fills the Q1..Q4 columns that have a color.
  function exportList(master) {
    const rows = [['Unique ID', 'Name', 'Group', 'Class', 'Q1', 'Q2', 'Q3', 'Q4']];
    GROUPS.forEach(g => members(master, g).sort(M.byRoomThenName).forEach(p => rows.push([p[M.X.ID], M.fullName(p), g, M.room(p)].concat(QUARTERS.map(q => colorOf(p, q))))));
    return Csv.serialize(rows, true);
  }

  // ---------- bring in assignments made elsewhere (e.g. last quarter's sheet) ----------
  // A file with Q1..Q4 columns fills every quarter at once; otherwise a Color column fills `quarter`.
  // Rows match on Unique ID when there is one, else on the name.
  function importList(master, quarter, text) {
    const { cols, records } = Csv.toRecords(Csv.parse(text));
    const find = names => cols.find(h => names.includes(h.trim().toLowerCase()));
    const idCol = find(['unique id', 'uniqueid', 'x_clubberid', 'clubberid', 'id']);
    const nameCol = find(['name', 'full name', 'fullname', 'clubber']);
    const first = find(['first', 'first name']), last = find(['last', 'last name']);
    const hasName = nameCol || (first && last);
    const qCols = cols.map(h => ({ h, m: /^(q[1-4])( color team)?$/i.exec(h.trim()) })).filter(x => x.m).map(x => ({ h: x.h, q: x.m[1].toUpperCase() }));
    const colorCol = find(['color', 'colour', 'team', 'color team']);
    const targets = qCols.length ? qCols : (colorCol && quarter ? [{ h: colorCol, q: quarter }] : []);
    if (!targets.length || !(idCol || hasName)) throw new Error('Need a Unique ID or Name (or First and Last) column, and either a Color column or Q1..Q4 columns.');
    targets.forEach(t => M.addUserCol(master, col(t.q)));
    const out = { set: 0, unmatched: [], invalid: [], ambiguous: [], skipped: [] };
    const key = p => M.norm(M.eff(p, M.C.FIRST) + M.eff(p, M.C.LAST));
    const people = master.people.filter(M.isActive);
    const byId = new Map(people.map(p => [p[M.X.ID], p]));
    records.forEach(r => {
      const name = hasName ? (nameCol ? r[nameCol] : r[first] + ' ' + r[last]).trim() : '';
      const id = idCol ? String(r[idCol] || '').trim() : '';
      const label = name || id;
      if (!label) return;
      let p = id ? byId.get(id) : null;
      if (!p) {
        if (!name) { out.unmatched.push(label); return; }
        const hits = people.filter(x => key(x) === M.norm(name));
        if (!hits.length) { out.unmatched.push(label); return; }
        if (hits.length > 1) { out.ambiguous.push(label); return; }
        p = hits[0];
      }
      if (!M.isClubber(p) || !GROUPS.includes(M.groupOf(M.room(p)))) { out.skipped.push(label); return; }
      let bad = false;
      targets.forEach(t => {
        const v = String(r[t.h] || '').trim().toLowerCase();
        if (!v) return;
        const color = COLORS.find(x => x.toLowerCase() === v);
        if (!color) { bad = true; return; }
        p[col(t.q)] = color; out.set++;
      });
      if (bad) out.invalid.push(label);
    });
    return out;
  }

  // ---------- new year ----------
  // team:Q1..Q4 become team:<year>:Q1..Q4 (kept, but no longer count as history); Q1 starts blank.
  function startNewYear(master, label) {
    label = String(label || '').trim();
    if (!/^[\w-]+$/.test(label)) throw new Error('Year label like 2027-28, please.');
    const present = QUARTERS.filter(q => master.userCols.includes(col(q)) || master.people.some(p => p[col(q)]));
    const clash = present.map(q => 'team:' + label + ':' + q).filter(n => master.userCols.includes(n));
    if (clash.length) throw new Error('Already archived as ' + label + ' (' + clash.join(', ') + ').');
    const archived = [];
    present.forEach(q => {
      const to = 'team:' + label + ':' + q, i = master.userCols.indexOf(col(q));
      if (i >= 0) master.userCols[i] = to; else master.userCols.push(to);
      master.people.forEach(p => { p[to] = p[col(q)] || ''; delete p[col(q)]; });
      archived.push(to);
    });
    // "No team" marks belong to last year's quarters: left in place they silently kept a child off Q1 of the new year (Fable review A6).
    let cleared = 0; master.people.forEach(p => QUARTERS.forEach(q => { if (p['x_noteam:' + q]) { p['x_noteam:' + q] = ''; cleared++; } }));
    return { archived, clearedNoTeam: cleared };
  }

  const api = { COLORS, QUARTERS, GROUPS, mulberry32, colorOf, playedIn, endIn, effective, forbiddenFor, attempt, forbidFinal, assign, audit, importList, exportList, startNewYear };
  if (typeof module !== 'undefined') module.exports = api; else root.Teams = api;
})(this);
