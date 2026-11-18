(this.AwanaVersions = this.AwanaVersions || {})['reports-season.js'] = '1.33.1';
// Print reports built from the season file. Added to Reports.LIST; ctx = { master, settings, calendar, season, opts }.
// opts: group ('Sparks' | 'T&T' | 'Cubbies' | 'Puggles'), date ('YYYY-MM-DD'), kid (Unique ID or ''), room.
(function (root) {
  const M = root.Model || require('./model.js');
  const Season = root.Season || require('./season.js');
  const R = root.Reports || require('./reports.js');
  const Pace = root.Pace || require('./pace.js');
  const { esc } = R;

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pretty = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? MONTHS[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1] : ''; };
  const paper = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? m[2] + '/' + m[3] + '/' + m[1].slice(2) : ''; };
  // An earned day that is only the hidden tick day of a no-date sign-off (r.earnedNoDate) prints a check and "no date", never the day (B6).
  const earnedText = (r, fmt) => r.earnedNoDate ? '✓ (no date)' : r.earned ? fmt(r.earned) : '';
  const GROUPS = ['Puggles', 'Cubbies', 'Sparks', 'T&T'];
  const idOf = p => p[M.X.ID];
  const sheet = (title, body, orient, sub) => '<section class="sheet ' + (orient || 'portrait') + '"><h2>' + esc(title) + '</h2>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + body + '</section>';
  const need = '<p class="status">Import or start a data file first (Import&hellip;, or the Attendance tab).</p>';
  const inGroup = (master, g) => R.kids(master).filter(p => M.groupOf(M.room(p)) === g).sort(M.byRoomThenName);

  // ---------- one page per child: awards earned (with when it was announced and given), attendance, jewels ----------
  function awardsByChild(ctx) {
    const { master, season, calendar, opts } = ctx;
    if (!season) return need;
    const g = opts.group || 'Sparks';
    const kids = inGroup(master, g).filter(p => (!opts.room || M.room(p) === opts.room) && (!opts.kid || idOf(p) === opts.kid));
    const blocks = kids.map(p => {
      const id = idOf(p), t = Season.totals(season, id, calendar), a = Season.awardLedger(season, id, g, calendar).filter(r => !r.carried).sort((x, y) => (x.earned || x.announced || '') < (y.earned || y.announced || '') ? -1 : 1);
      const jewels = g === 'Sparks' ? Season.sparkJewels(season, id, calendar) : [];
      const body = '<p><b>Attendance:</b> ' + t.year.a + ' nights' + (t.last ? ' (last ' + esc(pretty(t.last)) + ')' : '') +
        ' &nbsp; <b>Handbook:</b> ' + t.year.h + ' &nbsp; <b>Participation:</b> ' + t.year.p + ' &nbsp; <b>Extra:</b> ' + t.year.x + '</p>' +
        (jewels.length ? '<p><b>Blue Jewels reached:</b> ' + jewels.map(j => j.n + ' (' + esc(paper(j.date)) + ')').join(', ') + '</p>' : '') +
        (a.length ? R.table(['Earned', 'Award', 'Announced', 'Given'], a.map(x => [esc(earnedText(x, pretty)), esc(Season.awardLabel(season, id, x.award)), esc(x.announced ? pretty(x.announced) : ''), esc(x.given === 'no date' ? '\u2713 (no date)' : x.given ? pretty(x.given) : '')])) : '<p class="status">No awards earned yet.</p>');
      return { name: M.fullName(p), sub: esc(M.room(p)) + ' · ' + esc(season.year), body, rows: 5 + (jewels.length ? 1 : 0) + Math.max(a.length, 1) };      // rows: a rough page-space estimate (head, counts, jewels, table head, one per award)
    });
    if (!blocks.length) return '<p class="status">No children in ' + esc(g) + '.</p>';
    // One child alone keeps the one-child page. Several children share pages: filled in order up to PAGE_ROWS estimated rows, a child's block never split (break-inside: avoid),
    // and a child with more awards than a page holds simply gets a page of their own and still prints in full.
    if (blocks.length === 1) return sheet(blocks[0].name + ' — Awards', blocks[0].body, 'portrait', blocks[0].sub);
    const pages = []; let used = 0;
    blocks.forEach(b => { if (!pages.length || (used + b.rows > PAGE_ROWS && used > 0)) { pages.push([]); used = 0; } pages[pages.length - 1].push(b); used += b.rows; });
    return pages.map((pg, i) => sheet('Awards earned — ' + (opts.room || g) + (pages.length > 1 ? ' (page ' + (i + 1) + ' of ' + pages.length + ')' : ''),
      pg.map(b => '<div class="achild"><h3>' + esc(b.name) + ' <span class="status">' + b.sub + '</span></h3>' + b.body + '</div>').join(''), 'portrait', esc(season.year))).join('');
  }
  const PAGE_ROWS = 40;

  // ---------- the printed progress sheet: recordSheet (BACKLOG T6; design in docs/reviews/REVIEW-2026-11-14-colorteams-and-print.md section 5) ----------
  // One page per child per book, plain table markup, no inputs. Used by the Progress Sheets report and by the Achievement Record.
  // Sign-offs and given dates are read only through Season.signsShown / noDateSigns / awardLedger (a no-date finish prints a check, never its hidden day). Initials are never stored: the boxes print blank.
  // The T&T Discovery Award emblems and Extra Credit Silver / Gold emblems are NOT built: which sections earn them is not known (BACKLOG W3). When it is, add entries here; each prints as a row with an award rail and no sign-off boxes.
  // Entry shape: { label: 'Discovery Blue', award: '{book} Discovery Award Blue Emblem', note: 'text for the box area' }. Nothing is invented: the list stays empty until W3 is answered.
  const TNT_PENDING_AWARDS = [];
  const REC_H = { Sparks: 0.30, 'T&T': 0.28, Cubbies: 0.40 };      // row height in inches
  const mdShort = d => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d || ''); return m ? (+m[1]) + '/' + (+m[2]) : ''; };
  const mdyShort = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? (+m[2]) + '/' + (+m[3]) + '/' + m[1].slice(2) : ''; };
  const chunk4 = a => { const o = []; for (let i = 0; i < a.length; i += 4) o.push(a.slice(i, i + 4)); return o; };
  const fillName = (award, code, emblem) => award.replace('{book}', code).replace('{emblem}', emblem || '').replace(/\s+/g, ' ').trim();
  const recName = (name, code, emblem) => awardShownRec(name, code, emblem).replace(/ (Medallion|Sculpture)$/, '');
  const awardShownRec = (name, code, emblem) => name === code + ' Pilot Wing' ? (emblem || code) + ' Pilot Wing' : code && name.startsWith(code + ' ') ? name.slice(code.length + 1) : name;
  const BLANK = '<td class="nb"></td>';
  // The award a child earns by finishing this book (the one earned, else the next one in line): a small helper beside Season.completionAwards, which lists only earned ones.
  function bookAwardFor(s, id, g, book) {
    const tiers = (s.config.completion || {})[g] || []; if (!tiers.length) return '';
    const got = Season.completionAwards(s, id, g).find(x => x.book === book); if (got) return got.award;
    if (Season.finishedBooks(s, id).some(b => b.book === book && b.group === g)) return '';      // finished before, elsewhere: no award to hand out here
    if ((g === 'Sparks' && s.config.sparksBooks !== 'together') || g === 'Cubbies') return tiers[Season.bookOrder(s, g).indexOf(book)] || '';
    return tiers[Season.finishedBooks(s, id).filter(b => b.group === g).length] || '';
  }
  // The five award states: none (not earned), earned (earned, not given: includes held and announced-only), given (date printed), nodate (given, no known date).
  function recState(L, name) {
    const r = L.rows.get(name) || {}, e = L.earned.get(name);
    if (r.given === 'no date') return { state: 'nodate' };
    if (r.given) return { state: 'given', date: r.given };
    if (r.earned || r.earnedNoDate || r.announced || r.annNoDate || e) { const noDate = r.earnedNoDate || (!r.earned && e && e.noDate), date = r.earnedNoDate ? '' : r.earned || (e && e.date) || '';
      return { state: 'earned', tag: noDate ? 'EARNED ✓' : date ? 'EARNED ' + mdShort(date) : 'EARNED' }; }
    return { state: 'none' };
  }
  function awardTds(label, st, span) {
    const rs = span > 1 ? ' rowspan="' + span + '"' : '', cls = st.state === 'earned' ? ' e' : st.state === 'given' || st.state === 'nodate' ? ' g' : '';
    const tag = st.state === 'earned' ? '<em class="tag">' + esc(st.tag) + '</em>' : '', v = st.state === 'given' ? esc(mdyShort(st.date)) : st.state === 'nodate' ? '✓ no date' : '';
    return '<td class="an' + cls + (label.length > 17 ? ' lg' : '') + '"' + rs + '><span>' + esc(label) + '</span>' + tag + '</td><td class="gv gd' + cls + '"' + rs + '><i class="n">date</i><span class="v">' + v + '</span></td><td class="gv gi' + cls + '"' + rs + '><i class="n">init</i></td>';
  }
  const newRow = bk => ({ bk, b1: BLANK, b2: BLANK, name: BLANK, boxes: '<td class="nb" colspan="4"></td>', br: BLANK, rail: '<td class="nb" colspan="3"></td>' });
  const soCell = (n, date, nd, rv) => '<td class="so' + (rv ? ' rv' : '') + '"><i class="n">' + esc(n) + '</i><span class="ini"></span><span class="dt">' + (nd ? '✓' : esc(mdShort(date))) + '</span></td>';
  // opts.common: print the once-only blocks (Flight 3:16, Start Zone, Apple Acres); default = this is the group's first book.
  function recordBody(ctx, p, book, opts) {
    const s = ctx.season, id = idOf(p), g = Season.bookGroup(s, book) || M.groupOf(M.room(p)), t = s.config.progress[g], bk = s.config.books[book] || {}, emblem = bk.emblem || '';
    if (!t) return '<p class="status">There is no progress sheet for this book.</p>';
    const H = REC_H[g] || 0.30, common = opts && opts.common !== undefined ? opts.common : (!book || Season.bookOrder(s, g)[0] === book);
    const ledger = Season.awardLedger(s, id, g, ctx.calendar), L = { rows: new Map(ledger.map(r => [r.award, r])), earned: new Map() };
    Season.completedBlocks(s, id, g).forEach(b => b.awards.forEach(a => L.earned.set(a, { date: b.date, noDate: b.noDate })));
    Season.completionAwards(s, id, g).forEach(x => L.earned.set(x.award, { date: x.date, noDate: false }));
    const jewels = g === 'Sparks' ? Season.sparkJewels(s, id, ctx.calendar).filter(j => j.book === book) : [];
    jewels.forEach(j => L.earned.set(book + ' Blue Jewel ' + j.n, { date: j.date, noDate: false }));
    const rows = [];
    const addBlock = (b, scope) => {
      const shown = Season.signsShown(s, id, scope), nds = Season.noDateSigns(s, id, scope), code = scope === 'common' ? '' : scope, names = b.awards.filter(a => a !== NO_AWARD).map(a => fillName(a, code, emblem));
      const mine = []; [{ keys: b.items, rev: false }].concat((b.review || []).length ? [{ keys: b.review, rev: true }] : []).forEach(sg => chunk4(sg.keys).forEach((ks, ci) => {
        const row = newRow(b.key), n = ks.length; row.boxes = ks.map((i, k) => { const key = b.key + '.' + i; return soCell(b.single ? '' : sg.rev ? ci * 4 + k + 1 : i, shown[key], nds.includes(key), sg.rev); }).join('') + (n < 4 ? '<td class="nb" colspan="' + (4 - n) + '"></td>' : '');
        mine.push({ row, rev: sg.rev }); }));
      const e0 = mine.filter(m => !m.rev).length, r1 = mine.length - e0;
      if (r1) { mine[0].row.name = '<td class="nm" rowspan="' + e0 + '"><b>' + esc(b.label) + '</b></td>'; mine[e0].row.name = '<td class="nm rvn" rowspan="' + r1 + '">review</td>'; mine.forEach((m, i) => { if (i && i !== e0) m.row.name = ''; }); }
      else { mine[0].row.name = '<td class="nm" rowspan="' + mine.length + '"><b>' + esc(b.label) + '</b></td>'; mine.slice(1).forEach(m => { m.row.name = ''; }); }
      if (names.length) { mine[0].row.br = '<td class="br" rowspan="' + e0 + '"></td>'; mine.slice(1, e0).forEach(m => { m.row.br = ''; }); }
      if (names.length === 1) { mine[0].row.rail = awardTds(recName(names[0], code, emblem), recState(L, names[0]), e0); mine.slice(1, e0).forEach(m => { m.row.rail = ''; }); }
      else names.forEach((nm, j) => { if (mine[j]) mine[j].row.rail = awardTds(recName(nm, code, emblem), recState(L, nm), 1); });
      mine.forEach(m => rows.push(m.row));
    };
    const textRow = (key, label, text, award) => { const r = newRow(key); r.name = '<td class="nm"><b>' + esc(label) + '</b></td>'; r.boxes = '<td class="txt" colspan="4">' + esc(text) + '</td>'; if (award) r.rail = awardTds(recName(award, book, emblem), recState(L, award), 1); rows.push(r); };
    if (common) t.common.forEach(b => addBlock(b, 'common'));
    t.perBook.forEach(b => addBlock(b, book));
    if (g === 'Sparks') {      // Blue Jewels: four cells in two rows (earned from nights present; then Given)
      const weeks = s.config.blueJewelWeeks || [], r1 = newRow('BJ'), r2 = newRow('BJ'); r1.name = '<td class="nm"><b>Blue Jewels</b></td>'; r2.name = '<td class="nm rvn">given</td>';
      r1.boxes = r2.boxes = '';
      [1, 2, 3, 4].forEach(n => { const j = jewels.find(x => x.n === n), nm = book + ' Blue Jewel ' + n, st = recState(L, nm);
        r1.boxes += '<td class="bj"><i class="n">' + n + ' · ' + esc(String(weeks[n - 1] || '?')) + ' nights</i><span class="v">' + (j ? esc(mdShort(j.date)) : '') + '</span></td>';
        r2.boxes += '<td class="so bg' + (st.state === 'earned' ? ' e' : '') + '"><i class="n">' + n + '</i><span class="ini"></span><span class="dt">' + (st.state === 'given' ? esc(mdShort(st.date)) : st.state === 'nodate' ? '✓' : '') + '</span></td>'; });
      rows.push(r1, r2);
    }
    if (g === 'Sparks' && t.bookReview) {
      const rb = t.perBook.filter(b => (b.review || []).length), all = [].concat(...rb.map(b => b.items.concat(b.review).map(i => b.key + '.' + i))), shown = Season.signsShown(s, id, book), nds = Season.noDateSigns(s, id, book);
      textRow('BR', 'Review Emblem', all.filter(k => shown[k] || nds.includes(k)).length + ' of ' + all.length + ' signed: every box in the band at left, reviews too', fillName(t.bookReview.awards[0], book, emblem));
    }
    if (g === 'T&T') TNT_PENDING_AWARDS.forEach(x => textRow('PEND', x.label, x.note || '', fillName(x.award, book, emblem)));
    const ba = bookAwardFor(s, id, g, book);
    textRow('BA', 'Book award', g === 'Sparks' ? 'Rank and all 8 jewels signed (reviews not needed)' : g === 'T&T' ? 'All 8 emblem blocks signed (Silver and Gold not needed)' : 'Trail and all 6 units signed', ba);
    // The left bands: what earns what. Outer = Book award; inner (Sparks) = Review Emblem.
    const bands = g === 'Sparks' ? [[1, 'R', 'GJ4', 'BOOK AWARD: every unshaded box'], [2, 'RJ1', 'GJ4', 'REVIEW EMBLEM: every box in this band']]
      : g === 'T&T' ? [[1, 'BE1', 'YE2', 'BOOK AWARD: all 8 emblems']] : [[1, 'TR', 'U6', 'BOOK AWARD: Trail and all 6 units']];
    bands.forEach(([col, from, to, text]) => { const a = rows.findIndex(r => r.bk === from), z = rows.map(r => r.bk).lastIndexOf(to); if (a < 0 || z < a) return;
      rows[a]['b' + col] = '<td class="band" rowspan="' + (z - a + 1) + '"><div class="bt">' + esc(text) + '</div></td>'; for (let i = a + 1; i <= z; i++) rows[i]['b' + col] = ''; });
    const today = /^\d{4}-\d{2}-\d{2}$/.test(ctx.today || '') ? ctx.today : new Date().toLocaleDateString('en-CA'), bname = bk.name || '________';
    const recv = Season.isReceivedNoDate(s, id, book) ? '✓ no date' : mdyShort(Season.receivedShown(s, id, book));
    return '<div class="rhead"><div class="r2"><span>Book: <b>' + esc(bname) + '</b></span><span>Received: <b class="rc">' + (recv ? esc(recv) : '') + '</b></span><span class="pr">Printed ' + esc(mdyShort(today)) + '</span></div>' +
      '<div class="r3">Each box: initials | date. Shaded box = review. Thick award box = earned, hand it out.</div></div>' +
      '<table class="rec"><colgroup><col style="width:0.12in"><col style="width:0.12in"><col style="width:0.80in"><col style="width:0.95in"><col style="width:0.95in"><col style="width:0.95in"><col style="width:0.95in"><col style="width:0.10in"><col style="width:0.96in"><col style="width:0.65in"><col style="width:0.45in"></colgroup><tbody>' +
      rows.map(r => '<tr style="height:' + H + 'in">' + r.b1 + r.b2 + r.name + r.boxes + r.br + r.rail + '</tr>').join('') + '</tbody></table>';
  }
  // One page: the child's name, class and club year as the title, then the record body. The Progress Sheets report prints the current book.
  function recordSheet(ctx, p, book) {
    return '<section class="sheet portrait rec"><h2>' + esc(M.fullName(p) + ' — ' + M.room(p) + ' · ' + ctx.season.year) + '</h2>' + recordBody(ctx, p, book) + '</section>';
  }

  // ---------- the paper Achievement Record, filled in with recorded dates ----------
  // The body is recordBody (above): sign-off boxes, Given boxes, the earned / given states. Given with no known date prints a check and "no date"; announced dates are not printed.
  const NO_AWARD = 'Flight 3:16';      // finished, never handed out: the sheet has no Given box for it (as on the Progress sheet and the child's Awards)
  function achievement(ctx) {
    const { master, season, opts } = ctx;
    if (!season) return need;
    const g = opts.group === 'T&T' ? 'T&T' : opts.group === 'Cubbies' ? 'Cubbies' : 'Sparks';
    const kids = inGroup(master, g).filter(p => (!opts.room || M.room(p) === opts.room) && (!opts.kid || idOf(p) === opts.kid));
    return kids.map(p => {
      const id = idOf(p), prog = season.progress[id] || {}, hb = Season.parseHandbook(season.handbooks[id]);
      const inG = c => ((season.config.books[c] || {}).group || g) === g;      // Sparks: one page per Sparks book started; T&T: one page per T&T book started
      const books = [...new Set([Season.bookKey(season, hb.code)].concat(Object.keys(season.config.books).filter(c => prog[c])).filter(c => c && inG(c)))];
      const pages = (books.length ? books : ['']).map((code, n) => sheet(M.fullName(p) + ' — ' + g + ' Achievement Record', recordBody(ctx, p, code, { common: n === 0 }), 'portrait', esc(M.room(p)) + ' · Club year ' + esc(season.year) + (books.length > 1 ? ' · page ' + (n + 1) : '')));
      return pages.join('');
    }).join('') || '<p class="status">No children in ' + esc(g) + '.</p>';
  }

  // ---------- end-of-year awards: each end-of-year award, with the children it goes to (earned or announced, not yet presented) ----------
  // No group chosen: every child, a sheet per group in the order Sparks, T&T, Cubbies; within a group by class, then last name. A chosen group (the Reports tab always sends one) lists just that group.
  const CEREMONY_GROUPS = ['Sparks', 'T&T', 'Cubbies'], byRoomLast = (a, b) => M.roomRank(M.room(a)) - M.roomRank(M.room(b)) || M.room(a).localeCompare(M.room(b)) || M.eff(a, M.C.LAST).localeCompare(M.eff(b, M.C.LAST)) || M.eff(a, M.C.FIRST).localeCompare(M.eff(b, M.C.FIRST));
  function ceremony(ctx) {
    const { master, season, calendar, opts } = ctx; if (!season) return need;
    return (opts.group ? [opts.group] : CEREMONY_GROUPS).map(g => {
      const kids = inGroup(master, g).filter(p => !opts.room || M.room(p) === opts.room), by = {};
      kids.forEach(p => Season.awardLedger(season, idOf(p), g, calendar).forEach(r => { if (Season.isEndOfYear(season, g, r.award) && !r.given) (by[r.award] = by[r.award] || []).push({ p, r }); }));
      const order = (season.config.endOfYear || {})[g] || [], names = Object.keys(by).sort((a, b) => order.indexOf(a) - order.indexOf(b));
      const body = names.length ? names.map(a => '<h3 class="cerem">' + esc(Season.baseAward(season, a)) + ' <span class="status">(' + by[a].length + ' to have ready)</span></h3>' + R.table(['Given', 'Name', 'Class', 'Earned', 'Announced'],
        by[a].sort((x, y) => byRoomLast(x.p, y.p)).map(({ p, r }) => ['<span class="abox"><i>&nbsp;</i><b>&nbsp;</b></span>', esc(M.fullName(p)), esc(M.room(p)), esc(earnedText(r, paper)), esc(r.announced ? paper(r.announced) : 'not yet')]), 'wrap')).join('') : '<p class="empty">No end-of-year award is waiting' + (opts.room ? ' in ' + esc(opts.room) : '') + '.</p>';
      return sheet('End-of-year awards \u2014 ' + (opts.room || g), body, 'portrait', 'Earned and not yet given.');
    }).join('');
  }

  // ---------- weekly award slips: one sheet per class; a child is listed if an award was earned in the 7 days ending on the chosen night; the cell lists every award earned and not yet given (not end-of-year) ----------
  function weeklySlips(ctx) {
    const { master, season, calendar, opts } = ctx; if (!season) return need;
    const Cal = root.Calendar || require('./calendar.js'), now = new Date(), today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const date = opts.date || ((calendar || []).filter(r => Cal.isNight(r) && /^\d{4}-\d{2}-\d{2}$/.test(r.Date) && r.Date <= today).map(r => r.Date).sort().pop() || today);
    const d0 = new Date(date + 'T00:00:00Z'); d0.setUTCDate(d0.getUTCDate() - 6); const start = d0.toISOString().slice(0, 10), yymmdd = date.replace(/-/g, '').slice(2), by = {};
    R.kids(master).filter(p => ['Cubbies', 'Sparks', 'T&T'].includes(M.groupOf(M.room(p))) && (!opts.room || M.room(p) === opts.room)).forEach(p => {
      const g = M.groupOf(M.room(p)), skip = (season.config.exclude || {})[g] || [];
      const rows = Season.awardLedger(season, idOf(p), g, calendar).filter(r => !r.given && !skip.includes(r.award) && !Season.isEndOfYear(season, g, r.award));
      if (rows.some(r => r.earned && r.earned >= start && r.earned <= date)) (by[M.room(p)] = by[M.room(p)] || []).push({ p, labels: rows.map(r => Season.awardLabel(season, idOf(p), r.award)) });
    });
    const box = '<p><span class="weekbox" style="display:inline-block;border:2px solid #000;padding:4px 12px;font-weight:bold;font-size:14pt;margin:0 0 8px">Week earned ' + esc(yymmdd) + '</span></p>';
    return R.roomsOf(R.kids(master).filter(p => by[M.room(p)])).map(room => sheet(room, box + R.table(['Class', 'Full name', 'Results for Slide'],
      by[room].sort((x, y) => byRoomLast(x.p, y.p)).map(({ p, labels }) => [esc(room), esc(M.fullName(p)), labels.map(esc).join('<br>')]), 'wrap'), 'portrait')).join('') ||
      box + '<p class="empty">No award was earned in the week ending ' + esc(date) + (opts.room ? ' in ' + esc(opts.room) : '') + '.</p>';
  }

  // ---------- hand-out strips: one narrow strip per child (about 4.5 inches wide, for the distribution box), cut apart; two columns on landscape Letter ----------
  // A strip: the child's name and class, then each award earned and not yet given (Season.toHandOut, the same rule as the Awards tab) with a tick box and a box for the leader's initials. Children with nothing to give get no strip.
  // Pages are built here, not by CSS columns: a row of two strips is as tall as the taller one, rows fill a page up to PAGE_IN inches, and each page is one sheet (so one printed page, and "Choose pages" names it).
  const STRIP_FIRST_IN = 6.5, STRIP_NEXT_IN = 7.0;      // inches of strips that fit under the page 1 heading and the tally, and on the pages after it
  // Estimated height of a strip: the name line, each award line (a label about 32 characters or more, with its earned date, wraps to a second line), and padding. A strip never splits, so a child with a long list continues on a second strip when this passes STRIP_MAX_IN.
  const STRIP_MAX_IN = 6.0, awardIn = r => 0.3 + 0.17 * (Math.ceil((r.label.length + (r.earned ? r.earned.length + 1 : 0)) / 32) - 1), stripIn = rows => 0.32 + rows.reduce((h, r) => h + awardIn(r), 0) + 0.1;
  function handOut(ctx) {
    const { master, season, calendar, opts } = ctx; if (!season) return need;
    const groups = opts.group ? [opts.group] : GROUPS, tally = {}, strips = [];
    groups.forEach(g => inGroup(master, g).filter(p => !opts.room || M.room(p) === opts.room).forEach(p => {
      const rows = Season.toHandOut(season, idOf(p), g, calendar).sort((a, b) => Season.awardLabel(season, idOf(p), a.award).localeCompare(Season.awardLabel(season, idOf(p), b.award)));
      rows.forEach(r => { const k = Season.baseAward(season, r.award); tally[k] = (tally[k] || 0) + 1; });
      const lines = rows.map(r => ({ label: Season.awardLabel(season, idOf(p), r.award), earned: r.earned || r.earnedNoDate ? earnedText(r, paper) : 'by hand' }));
      for (let i = 0; i < lines.length;) { const chunk = []; while (i < lines.length && (!chunk.length || stripIn(chunk.concat([lines[i]])) <= STRIP_MAX_IN)) chunk.push(lines[i++]); strips.push({ p, room: M.room(p), more: strips.length > 0 && strips[strips.length - 1].p === p, rows: chunk }); }
    }));
    if (!strips.length) return '<p class="empty">Nothing earned is waiting to be given' + (opts.room ? ' in ' + esc(opts.room) : opts.group ? ' in ' + esc(opts.group) : '') + '.</p>';
    const html = s => '<div class="strip"><div class="stripname"><b>' + esc(M.fullName(s.p)) + (s.more ? ' (continued)' : '') + '</b><span>' + esc(s.room) + '</span></div>' +
      s.rows.map(r => '<div class="stripaward"><span class="stbox"></span><span class="stlabel">' + esc(r.label) + (r.earned ? ' <small>' + esc(r.earned) + '</small>' : '') + '</span><span class="stinit"></span></div>').join('') + '</div>';
    const pages = []; let page = null, used = 0, row = [];
    const flush = () => { if (!row.length) return; const h = Math.max(...row.map(s => stripIn(s.rows))), cap = pages.length > 1 ? STRIP_NEXT_IN : STRIP_FIRST_IN; if (!page || (used + h > cap && page.rows.length)) { page = { rows: [] }; pages.push(page); used = 0; } page.rows.push(row); used += h; row = []; };
    strips.forEach(s => { row.push(s); if (row.length === 2) flush(); }); flush();
    const note = 'To have ready: ' + Object.keys(tally).sort().map(a => tally[a] + ' × ' + esc(a)).join(', ') + '. Cut the strips apart. Mark each award Given on the child’s Person record (Progress sub-tab) when it is handed over.';
    return pages.map((pg, i) => { const all = [].concat(...pg.rows), a = all[0].room, b = all[all.length - 1].room;
      return sheet('Awards to hand out, page ' + (i + 1) + ' of ' + pages.length + ': ' + (a === b ? a : a + ' to ' + b), pg.rows.map(r => '<div class="striprow">' + r.map(html).join('') + '</div>').join(''), 'landscape strips', i === 0 ? note : ''); }).join('');
  }

  // ---------- dates attended, by class: one row per child, the nights they were marked present (attendance mark 'a') ----------
  function attendDates(ctx) {
    const { master, season, calendar, opts } = ctx; if (!season) return need;
    const g = opts.group || 'Sparks', kids = inGroup(master, g).filter(p => !opts.room || M.room(p) === opts.room), nights = Season.heldNights(season, calendar || season.calendar || []);      // club nights only, the same rule as every total (an Event date with a present mark is not a night)
    const rows = kids.map(p => { const id = idOf(p), got = nights.filter(d => ((season.attendance[d] || {})[id] || {}).a);
      return [esc(M.fullName(p)), esc(M.room(p)), String(got.length), got.length ? got.map(d => esc(paper(d))).join(', ') : '<span class="status">none yet</span>']; });
    const body = rows.length ? R.table(['Name', 'Class', 'Nights', 'Dates attended'], rows, 'wrap') : '<p class="empty">No children in ' + esc(g) + '.</p>';
    return sheet('Dates attended — ' + (opts.room || g), body, 'landscape', 'One row per child. Nights are club nights marked on the Attendance tab (events are not counted).');
  }

  // ---------- books finished and end-of-year awards, one page per group: who has finished which book, and which end-of-year awards each child has earned and been given ----------
  function booksYear(ctx) {
    const { master, season, calendar, opts } = ctx; if (!season) return need;
    const g = opts.group || 'Sparks', kids = inGroup(master, g).filter(p => !opts.room || M.room(p) === opts.room), total = { fin: 0, earned: 0, given: 0 };
    const rows = kids.map(p => { const id = idOf(p), fin = Season.finishedBooks(season, id).filter(b => b.group === g && (b.before || !b.date || b.date >= (Season.seasonStart(season) || ''))), aw = Season.awardLedger(season, id, g, calendar).filter(r => !r.carried && Season.isEndOfYear(season, g, r.award) && (r.earned || r.given));
      total.fin += fin.length; total.earned += aw.length; total.given += aw.filter(r => r.given).length;
      return [esc(M.fullName(p)), esc(M.room(p)), fin.length ? fin.map(b => esc(b.book) + (b.before ? ' (before)' : b.noDate ? ' ✓ (no date)' : ' ' + esc(paper(b.date)))).join(', ') : '<span class="status">none yet</span>',
        aw.length ? aw.map(r => esc(Season.awardLabel(season, id, r.award)) + ' \u2014 ' + (r.given === 'no date' ? '\u2713 given' : r.given ? 'given ' + esc(paper(r.given)) : 'not given')).join('<br>') : '<span class="status">none yet</span>']; });
    const body = rows.length ? R.table(['Name', 'Class', 'Books finished', 'End-of-year awards earned'], rows, 'wrap') : '<p class="empty">No children in ' + esc(g) + '.</p>';
    return sheet('Books and end-of-year awards \u2014 ' + (opts.room || g), body, 'portrait', total.fin + ' book' + (total.fin === 1 ? '' : 's') + ' finished; ' + total.earned + ' end-of-year award' + (total.earned === 1 ? '' : 's') + ' earned, ' + total.given + ' given. Books come from Progress (every section dated) or the \u201cfinished before\u201d tick.');
  }

  // ---------- game standings ----------
  function standings(ctx) {
    const { season, calendar, settings } = ctx, q = (settings || {}).quarter || 'Q1';
    if (!season) return need;
    const groups = ctx.opts.group && ['Sparks', 'T&T'].includes(ctx.opts.group) ? [ctx.opts.group] : ['Sparks', 'T&T'];
    return groups.map(g => {
      const st = Season.standings(season, g, q, calendar).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
      const teamCell = t => '<span class="team team-' + esc(t) + '">' + esc(t) + '</span>';
      const dates = Object.keys(season.games).filter(d => season.games[d][g] && Season.counted(calendar)[d] === q).sort();
      const nights = dates.length ? R.table(['Team'].concat(dates.map(paper)), Season.teamOrder(season).map(t => [teamCell(t)].concat(dates.map(d => {
        const r = season.games[d][g][t]; return r ? esc((r.place ? '#' + r.place : '–') + (r.spirit !== undefined ? ' / ' + r.spirit : '')) : '';
      })))) : '';
      // Clubbers moved to another team part way through the quarter: their points follow the team they were on each night they attended, so their totals will not match one team's.
      const moved = (ctx.master ? inGroup(ctx.master, g) : []).map(p => ({ p, s: Season.teamStory(season, idOf(p), q, M.teamOf(p, q)) })).filter(x => x.s);
      const movedHtml = moved.length ? '<h3>Changed team this quarter (' + moved.length + ')</h3>' + R.table(['Name', 'Class', 'Teams'], moved.map(x => [esc(M.fullName(x.p)), esc(M.room(x.p)), esc(x.s)])) + '<p class="status">Each clubber\'s points follow the team they were on each night they attended. A team\'s own results above do not change when someone moves.</p>' : '';
      return sheet(g + ' Game Standings — ' + q, R.table(['Rank', 'Team', 'Nights', 'Avg place', 'Spirit', 'Points'],
        st.map(r => [r.rank || '', teamCell(r.team), r.nights, r.avgPlace === null ? '' : r.avgPlace, r.spirit, r.points])) +
        (nights ? '<h3>Night by night (place / spirit)</h3>' + nights : '') + movedHtml, 'portrait', 'Rank 1 = best average place');
    }).join('');
  }

  // ---------- handbooks ----------
  // Option noBook: under each group, also list the children who have not received a book: no book on record at all, or a book with no day received (a "no date" tick counts as received).
  function handbooks(ctx) {
    const { master, season, opts } = ctx;
    if (!season) return need;
    const bookName = c => ((season.config.books || {})[c] || {}).name || c;
    return sheet('Handbooks by book' + (opts && opts.noBook ? ' (and who has not received one)' : ''), GROUPS.map(g => {
      const kids = inGroup(master, g), c = Season.handbookCounts(season, kids.map(idOf));
      let h = '<h3>' + esc(g) + ' (' + kids.length + ')</h3>' + R.table(['Book', 'Children'], Object.keys(c).sort().map(k => [esc(k), c[k]]));
      if (opts && opts.noBook) {
        const missing = kids.map(p => { const code = Season.childBook(season, idOf(p)); return { p, code, why: !code ? 'No book yet' : !Season.receivedOf(season, idOf(p), code) ? bookName(code) + ': no date received' : '' }; }).filter(x => x.why);
        h += '<h4>Not received a book (' + missing.length + ')</h4>' + (missing.length ? R.table(['Name', 'Class', 'Why'], missing.map(x => [esc(M.fullName(x.p)), esc(M.room(x.p)), esc(x.why)])) : '<p class="status">Everyone in ' + esc(g) + ' has received a book.</p>');
      }
      return h;
    }).join(''), 'portrait');
  }

  // ---------- pace watch list per class: who to encourage, who has slowed, who is steadily slow ----------
  // Sparks and T&T only (they are the ones with section sign-offs). Rules and the first-guess numbers are in pace.js.
  function paceWatch(ctx) {
    const { master, season, calendar, settings, opts } = ctx;
    if (!season) return need;
    const all = Pace.rows({ master, season, calendar }).filter(r => (!opts.group || r.group === opts.group) && (!opts.room || r.room === opts.room));
    const f = Pace.f1, W = Pace.CFG.WINDOW;
    const head = ['Name', 'Attended', 'Overall', 'Recent', 'Trend', 'Last signed', 'Core', 'Extra'];
    return Pace.room(all).map(x => x.room).map(rm => {
      const k = all.filter(r => r.room === rm).sort((a, b) => a.name.localeCompare(b.name)), sub = esc((settings || {}).club || '') + ' \u00b7 For leaders only: do not hand this page to parents \u00b7 pace = core sections signed per night attended; recent = last ' + W + ' nights attended \u00b7 data through ' + (paper(k[0].roomThrough) || 'nothing entered');
      if (!k[0].roomEntered) return sheet(rm + ' \u2014 Pace Watch List', '<p class="status">No sign-off dates are entered for this class yet, so there is nothing to compare.</p>', 'portrait', sub);
      const row = r => [esc(r.name), r.nights + (r.guest ? ' (guest)' : ''), f(r.overall), f(r.recent), esc(Pace.ARROW[r.trend] || ''), esc(paper(r.last) || 'none'), r.core, r.extra + '/' + r.extraTotal];
      const body = Object.keys(Pace.LISTS).map(key => {
        const list = k.filter(r => r.list === key);
        return list.length ? '<h3>' + esc(Pace.LISTS[key]) + ' (' + list.length + ')</h3>' + R.table(head, list.map(row)) : '';
      }).join('');
      const early = k.filter(r => r.nights < Pace.CFG.MIN_NIGHTS).length, ok = k.filter(r => !r.list && r.nights >= Pace.CFG.MIN_NIGHTS).length;
      return sheet(rm + ' \u2014 Pace Watch List', (body || '<p class="status">Nobody to watch right now.</p>') +
        '<p class="status">' + ok + ' on pace' + (early ? ', ' + early + ' with fewer than ' + Pace.CFG.MIN_NIGHTS + ' nights attended (too early to tell)' : '') + '. Capable, slowed = had a stretch of ' + Pace.CFG.GOAL + ' or more a night and is now at ' + Pace.CFG.SLOW +
        ' or less. Steadily slow = under ' + Pace.CFG.SLOW + ' a night overall and never faster. Needs encouragement = recent pace under ' + Pace.CFG.WATCH + ', or nothing signed in the last ' + Pace.CFG.QUIET + ' nights attended. Extra = Sparks reviews or T&T Silver / Gold, not counted in pace.</p>', 'portrait', sub);
    }).join('') || '<p class="status">No Sparks or T&amp;T children.</p>';
  }

  R.LIST.push(
    { id: 'booksYear', title: 'Books and end-of-year awards (by group)', render: booksYear, opts: ['group', 'room'] },
    { id: 'handOut', title: 'Awards to hand out (a strip per child)', render: handOut, opts: ['groupAll', 'room'] },
    { id: 'weeklySlips', title: 'Weekly award slips (one sheet per class)', render: weeklySlips, opts: ['room', 'date'] },
    { id: 'ceremony', title: 'End-of-year awards (list)', render: ceremony, opts: ['group', 'room'] },
    { id: 'awardsByChild', title: 'Awards earned (one page per child)', render: awardsByChild, opts: ['group', 'room', 'kid'] },
    { id: 'achievement', title: 'Achievement records (Cubbies, Sparks, T&T)', render: achievement, opts: ['group', 'room', 'kid'] },
    { id: 'standings', title: 'Game standings', render: standings, opts: ['group', 'quarter'] },
    { id: 'attendDates', title: 'Dates attended, by class', render: attendDates, opts: ['group', 'room'] },
    { id: 'handbooks', title: 'Handbooks by book', render: handbooks, opts: ['noBook'] },
    { id: 'paceWatch', title: 'Pace watch list (Sparks, T&T)', render: paceWatch, opts: ['group', 'room', 'title'] });      // 'title': the club title is typed on the Reports bar; this is the report that prints it now that the master schedule is gone

  R.recordSheet = recordSheet;      // the Progress Sheets report (reports.js) draws its pages with this
  const api = { awardsByChild, achievement, standings, handbooks, paceWatch, pretty, paper, recordSheet, recordBody, bookAwardFor, TNT_PENDING_AWARDS };
  if (typeof module !== 'undefined') module.exports = api; else root.ReportsSeason = api;
})(this);
