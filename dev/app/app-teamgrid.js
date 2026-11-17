(this.AwanaVersions = this.AwanaVersions || {})['app-teamgrid.js'] = '1.11.2';
// Color teams: the year grid. One row per child, one column per quarter. A quarter reads as locked (played or locked by hand), ready to lock
// (the next one, printed shortly before it starts) or projected (a guess that can still change). A color Mike set by hand is a pin.
// Under the grid: team sizes and expected turnout for the whole group (the group plays together, so a class shows only its part of each team).
// The rules and the numbers are in teamplan.js; this file only draws them.
(function () {
  const A = window.App, { X } = Model, esc = A.esc, Q = TeamPlan.QUARTERS, GROUPS = Teams.GROUPS;
  const ui = { scope: 'class', cls: '', group: 'Sparks', preview: false, bq: '' }, focusAfter = { sel: '' };
  // The color counted for a child in a quarter: a played or locked quarter counts the effective color (the latest move), an open one the roster color.
  // 2026-11-14 (Fable review A1/A5): a move counts in an open quarter too (a move dated in a quarter that has not started is that quarter's color), so every count uses the effective color.
  const colorIn = (ctx, states, p, q) => Teams.endIn(p, q, ctx.history && ctx.history(p));
  const plus = n => (n >= 0.05 ? '+' : n <= -0.05 ? '−' : '') + Math.abs(Math.round(n * 10) / 10).toFixed(1);
  let lastCtx = null, lastPlan = { colors: {}, changes: [], count: 0 };      // the plan shown on the button and in the preview is the one Accept applies
  const md = Model.md;      // shared (model.js); an empty date gives empty text here too
  const kidsAll = () => A.master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && GROUPS.includes(Model.groupOf(Model.room(p))));

  // A quarter that is not locked can be locked; one locked by hand (not one whose first night has passed) can be unlocked.
  function lockButton(ctx, q, state) {
    if (state !== 'locked') return '<br><button type="button" class="tglockbtn" data-tglock="' + q + '">Lock ' + q + '</button>';
    const first = TeamPlan.firstNight(ctx.calendar, q);
    return TeamPlan.config(ctx.season).locked[q] && !(first && first <= ctx.today) ? '<br><button type="button" class="tglockbtn" data-tgunlock="' + q + '">Unlock ' + q + '</button>' : '';
  }
  function lock(q) {
    const hx = A.teamHistory && A.teamHistory(), blanks = kidsAll().filter(p => !Teams.endIn(p, q, hx && hx(p)) && !Model.noTeam(p, q)).length;      // a child whose color came from a move is not blank
    if (blanks && !confirm(blanks + ' child' + (blanks === 1 ? ' has' : 'ren have') + ' no color in ' + q + ' yet. Lock it anyway?')) return false;
    TeamPlan.lock(A.season, q, A.today()); A.touch(); A.refresh(); focusAfter.sel = '[data-tgunlock="' + q + '"]'; return true;
  }
  function unlock(q) {
    if (!confirm('Unlock ' + q + '? Its colors stay as they are. The ones the plan projected can move again when you recalculate; the ones you set by hand stay.')) return false;
    try { TeamPlan.unlock(A.season, q, A.calendar, A.today()); } catch (err) { alert(err.message); return false; }
    A.touch(); A.refresh(); focusAfter.sel = '[data-tglock="' + q + '"]'; return true;
  }

  function html() {
    const season = A.season; if (!season || !A.master) return '';
    const ctx = { master: A.master, season, calendar: A.calendar, today: A.today(), history: A.teamHistory() }, all = kidsAll();
    const rooms = [...new Set(all.map(Model.room))].sort();
    if (!rooms.includes(ui.cls)) ui.cls = rooms[0] || '';
    const inView = p => ui.scope === 'club' || (ui.scope === 'group' ? Model.groupOf(Model.room(p)) === ui.group : Model.room(p) === ui.cls);
    const kids = all.filter(inView).sort(Model.byRoomThenName), colors = A.teamColors ? A.teamColors() : Teams.COLORS;
    const states = Q.map(q => TeamPlan.stateOf(season, ctx.calendar, q, ctx.today));
    const groups = ui.scope === 'club' ? GROUPS : [ui.scope === 'group' ? ui.group : Model.groupOf(ui.cls)];
    const word = { locked: 'locked', ready: 'ready to lock', projected: 'projected' };
    // The open quarters: blank cells are filled first (a projection); once none are blank, a recalculation can offer the smallest set of changes.
    // The recalculation uses a fixed seed, so the same colors always give the same offer.
    const open = Q.filter((_, i) => states[i] !== 'locked'), blanks = open.reduce((t, q) => t + all.filter(p => !Teams.endIn(p, q, ctx.history && ctx.history(p)) && !Model.noTeam(p, q)).length, 0);
    lastCtx = ctx; lastPlan = open.length && !blanks ? TeamPlan.recalc(ctx, { rng: Teams.mulberry32(20261) }) : { colors: {}, changes: [], count: 0 };
    if (!lastPlan.count) ui.preview = false;
    const notes = open.length && !blanks ? TeamPlan.balanceNotes(ctx, lastPlan) : [];      // where even a recalculation leaves the teams uneven
    const range = open.length > 1 ? open[0] + ' to ' + open[open.length - 1] : open[0] || '';
    const action = !open.length ? '' : blanks ? '<button type="button" class="primary" data-tgfill>Fill ' + blanks + ' blank color' + (blanks === 1 ? '' : 's') + '</button>' :
      lastPlan.count ? '<button type="button" data-tgrecalc aria-expanded="' + ui.preview + '">Recalculate ' + range + ' (changes ' + lastPlan.count + ' child' + (lastPlan.count === 1 ? '' : 'ren') + ')</button>' : '<button type="button" data-tgrecalc disabled>Nothing to recalculate</button>';
    let h = '<h3>The year' + Info.html('games.year') + Info.html('games.balance') + '</h3><p class="status">A <b>locked</b> quarter is played or locked by hand. The <b>ready to lock</b> quarter is the next one: lock it, then print its sheets. A <b>projected</b> quarter is a guess that can still change. &#128204; marks a color set by hand, which no recalculation moves.</p>';
    const scopeGroup = ui.scope === 'group' ? ui.group : ui.scope === 'class' ? (Model.groupOf(ui.cls) || 'All') : 'All';      // the group a note on a quarter's column is about
    const btn = (s, text) => '<button type="button" data-tgscope="' + s + '" aria-pressed="' + (ui.scope === s) + '"' + (ui.scope === s ? ' class="on"' : '') + '>' + text + '</button>';
    h += '<div class="tgscope"><span class="status" id="tgShow">Show</span> <span role="group" aria-labelledby="tgShow">' + btn('class', 'By class') + btn('group', 'By group') + btn('club', 'Whole club') + '</span>';
    if (ui.scope === 'class') h += ' <label>Class <select id="tgClass">' + rooms.map(r => '<option' + (r === ui.cls ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select></label>';
    if (ui.scope === 'group') h += ' <label>Group <select id="tgGroup">' + GROUPS.map(g => '<option' + (g === ui.group ? ' selected' : '') + '>' + esc(g) + '</option>').join('') + '</select></label>';
    h += '</div>' + (action ? '<div class="tgbar">' + action + '</div>' : '') + (notes.length ? '<div class="tgbalance bad" role="status">' + notes.map(n => '<p><b>' + esc(n.q) + ', ' + esc(n.group) + ':</b> the teams are uneven (' + esc(n.sizes) + '). A recalculation cannot even them without repeating a color or moving a color you set by hand; change a cell yourself, or accept the warning above.</p>').join('') + '</div>' : '') + balanceHtml(ctx, groups, states) + '<div class="tglayout"><div class="tgmain"><div class="tgscroll scroll" tabindex="0" role="region" aria-label="The year grid: scrolls sideways and down"><table class="roster tg"><thead><tr><th scope="col">Name</th><th scope="col">Class</th>' +
      Q.map((q, i) => '<th scope="col" data-q="' + q + '" class="tgh tgh-' + states[i] + '">' + q + ' &middot; ' + word[states[i]] + (states[i] !== 'locked' && TeamPlan.firstNight(ctx.calendar, q) ? '<br><small>starts ' + esc(md(TeamPlan.firstNight(ctx.calendar, q))) + '</small>' : '') + lockButton(ctx, q, states[i]) + (A.flagPlaceBtn ? ' ' + A.flagPlaceBtn({ level: 'team', quarter: q, group: scopeGroup }, 'color teams ' + q + (scopeGroup === 'All' ? '' : ' (' + scopeGroup + ')')) : '') + '</th>').join('') + '</tr></thead><tbody>';
    kids.forEach(p => {
      h += '<tr data-kid="' + esc(p[X.ID]) + '"><td><a href="#" data-person="' + esc(p[X.ID]) + '">' + esc(Model.eff(p, Model.C.FIRST)) + ' <span class="tgln">' + esc(Model.eff(p, Model.C.LAST)) + '</span></a></td><td>' + esc(Model.room(p)) + '</td>' + Q.map((q, i) => {
        const eff = Teams.effective(p, q, ctx.history && ctx.history(p)), v = states[i] === 'locked' ? eff.color : p['team:' + q] || '', pinned = states[i] !== 'locked' && !!v && TeamPlan.isPinned(ctx.master, season, p, q), who = esc(Model.fullName(p)), kid = esc(p[X.ID]);
        if (states[i] === 'locked') {      // a played or locked quarter is not edited in place: a change is a dated move from a day on. The cell shows the EFFECTIVE color (the latest move), with "moved from <date>" for a move after the quarter began.
          const last = eff.moved[eff.moved.length - 1], mark = last ? '<small class="tgmoved">moved from ' + esc(md(last.from)) + '</small>' : '', roster = p['team:' + q] || '';
          const why = last ? ' title="' + esc('Moved to ' + last.team + ' from ' + md(last.from)) + '"' : eff.replaced ? ' title="' + esc('Moved to ' + eff.color + ' from the first club night' + (roster && roster !== eff.color ? '; the roster color ' + roster + ' was never played' : '')) + '"' : '';
          return '<td data-q="' + q + '"><button type="button" class="team ' + (v ? 'team-' + esc(v) + ' tgchip' : 'tgnone') + ' tgmovebtn" data-tgmove="' + q + '" data-kid="' + kid + '"' + why + ' aria-label="Change ' + q + ' color for ' + who + ' from a date' + (last ? ' (now ' + esc(eff.color) + ', moved from ' + esc(md(last.from)) + ')' : '') + '">' + (v ? esc(v) : Model.noTeam(p, q) ? 'No team' : '&mdash;') + '</button>' + mark + '</td>';
        }
        const nt = Model.noTeam(p, q);      // "No team": on purpose, no color, no points, outside the team sizes and the planner
        const opts = ['<option value=""' + (v || nt ? '' : ' selected') + '>to assign</option>', '<option value="' + Model.NO_TEAM + '"' + (nt ? ' selected' : '') + '>No team</option>'].concat(colors.map(c => '<option' + (c === v ? ' selected' : '') + '>' + esc(c) + '</option>'));
        if (v && !colors.includes(v)) opts.push('<option selected>' + esc(v) + '</option>');      // a value from a file that is not one of the four colors stays visible, as text
        return '<td data-q="' + q + '"><select class="team ' + (v ? 'team-' + esc(v) + ' ' : '') + 'tgchip tgsel' + (v ? ' tgproj' : '') + '" data-tgcell="' + q + '" data-kid="' + kid + '" aria-label="' + q + ' color, ' + who + '">' + opts.join('') + '</select>' +
          (pinned ? ' <span class="tgpin" role="img" aria-label="set by hand">&#128204;</span>' : '') +
          (eff.color && eff.color !== (p['team:' + q] || '') ? '<br><small class="tgmoved">moves to ' + esc(eff.color) + ' (dated move)</small>' : '') +
          (v && TeamPlan.colorUse(ctx, p, q)[v] ? '<br><small class="tgwarn">repeats ' + esc(TeamPlan.colorUse(ctx, p, q)[v].join(' and ')) + '</small>' : '') + '</td>';      // a repeated color is marked in the cell itself, not only when it is picked (A8)      // a move dated in a quarter that has not been played: the counts use it, so the cell says so (A5)
      }).join('') + '</tr>';
    });
    if (!kids.length) h += '<tr><td colspan="' + (2 + Q.length) + '" class="status">No Sparks or T&amp;T children in this view.</td></tr>';
    h += '</tbody><tfoot>';
    groups.forEach(g => {
      const members = all.filter(p => Model.groupOf(Model.room(p)) === g), cIn = (p, q) => colorIn(ctx, states, p, q);      // the effective color (the latest move) in every quarter
      h += '<tr data-sizes="' + esc(g) + '"><th scope="row" colspan="2">Team sizes, all of ' + esc(g) + '</th>' + Q.map(q => '<td data-q="' + q + '">' + colors.map(c => esc(c) + ' ' + members.filter(p => cIn(p, q) === c).length).join(' &middot; ') + '</td>').join('') + '</tr>' +
        '<tr data-turnout="' + esc(g) + '"><th scope="row" colspan="2">Expected turnout, all of ' + esc(g) + '</th>' + Q.map(q => { const t = TeamPlan.turnout(ctx, g, p => cIn(p, q)); return '<td data-q="' + q + '">' + colors.map(c => esc(c) + ' ' + (t[c] || 0).toFixed(1)).join(' &middot; ') + '</td>'; }).join('') + '</tr>';
    });
    h += '</tfoot></table></div><p class="status tgnote">' + (ui.scope === 'class' ? 'Team sizes and expected turnout are for all of ' + esc(groups[0]) + ': the group plays its games together, so a class shows only its part of each team. ' : 'Teams are balanced for each group as a whole. ') +
      'Expected turnout is each child&rsquo;s share of past club nights attended, added up per team.</p></div>' + panel(ctx, groups) + '</div>';
    return h;
  }

  // Team balance now: for one quarter, each color's children, expected attendance a night (teamplan.js: this season's attendance blended with earlier years) and the gap to the average team,
  // with a plain-words flag when the regulars are on one team. It is drawn from the same colors as the grid, so it moves as you move children. The group plays together, so a class shows its own part of each team too.
  function balanceHtml(ctx, groups, states) {
    if (!Q.includes(ui.bq)) ui.bq = Q.find((_, i) => states[i] !== 'locked') || 'Q4';
    const pill = q => '<button type="button" data-tgbq="' + q + '" aria-pressed="' + (ui.bq === q) + '"' + (ui.bq === q ? ' class="on"' : '') + '>' + q + '</button>';
    let h = '<section class="tgbal" aria-label="Team balance now"><h4>Team balance now' + Info.html('games.balance') + '</h4><div class="tgscope"><span class="status" id="tgBqLbl">Quarter</span> <span role="group" aria-labelledby="tgBqLbl">' + Q.map(pill).join('') + '</span></div>';
    groups.forEach(g => {
      const b = TeamPlan.balance(ctx, g, p => colorIn(ctx, states, p, ui.bq)), mine = ui.scope === 'class' && ui.cls && Model.groupOf(ui.cls) === g;
      const inClass = c => kidsAll().filter(p => Model.room(p) === ui.cls && colorIn(ctx, states, p, ui.bq) === c).length;
      h += '<table class="roster tgbaltbl" data-balance="' + esc(g) + '"><caption>' + esc(g) + ', ' + ui.bq + '</caption><thead><tr><th scope="col">Team</th><th scope="col">Children</th>' + (mine ? '<th scope="col">In ' + esc(ui.cls) + '</th>' : '') + '<th scope="col">Expected a night</th><th scope="col">Against the average</th></tr></thead><tbody>' +
        b.rows.map(r => '<tr data-color="' + esc(r.color) + '"><th scope="row"><span class="team team-' + esc(r.color) + '">' + esc(r.color) + '</span></th><td>' + r.kids + '</td>' + (mine ? '<td>' + inClass(r.color) + '</td>' : '') + '<td>' + (Math.round(r.expected * 10) / 10).toFixed(1) + '</td><td>' + plus(r.gap) + '</td></tr>').join('') + '</tbody></table>';
      h += b.lopsided ? '<p class="tgbalance bad" role="status" data-lopsided="' + esc(g) + '">' + esc(b.note) + '</p>' : b.placed ? '<p class="status" data-balanced="' + esc(g) + '">Expected attendance is even across the four teams (the most and fewest expected differ by ' + (Math.round(b.spread * 10) / 10).toFixed(1) + ' children).</p>' : '<p class="status">No colors are assigned for ' + ui.bq + ' yet.</p>';
    });
    return h + '</section>';
  }

  // The panel beside the grid: the preview of a recalculation (when open), then why the teams come out as they do: the goals in force and the attendance behind the turnout.
  function panel(ctx, groups) {
    const pr = TeamPlan.priorities(ctx.season), info = id => TeamPlan.PRIORITIES.find(x => x.id === id), name = id => { const p = byId(id); return p ? Model.fullName(p) : String(id); };
    let h = '<aside class="tgwhy" role="region" aria-label="Why these teams" tabindex="-1">';
    if (ui.preview && lastPlan.count) {
      h += '<div class="tgpreview" tabindex="-1"><h4>Recalculating would change ' + lastPlan.count + ' child' + (lastPlan.count === 1 ? '' : 'ren') + '</h4><ul>' +
        lastPlan.changes.map(c => '<li data-kid="' + esc(c.id) + '"><a href="#" data-person="' + esc(c.id) + '">' + esc(name(c.id)) + '</a> ' + esc(c.q) + ': ' + esc(c.reason) + '</li>').join('') + '</ul>' +
        '<p><button type="button" class="primary" data-tgaccept>Accept</button> <button type="button" data-tgcancel>Cancel</button></p></div>';
    }
    h += '<h4>Why these teams</h4><p class="status">The goals in force, most important first. Reorder or switch them off on the Options tab.</p><ol>' +
      pr.order.map(id => '<li>' + esc(info(id).label) + (info(id).fixed ? ' <span class="status">(always on)</span>' : pr.off.includes(id) ? ' <span class="status">(off)</span>' : '') + '</li>').join('') + '</ol>';
    groups.forEach(g => {
      const rs = TeamPlan.ratesOf(ctx, g), avg = rs.filter(r => r.usedAverage), real = rs.filter(r => !r.usedAverage), mean = real.length ? real.reduce((t, r) => t + r.rate, 0) / real.length : 1;
      h += '<p>' + esc(g) + ': ' + (avg.length ? avg.length + ' of ' + rs.length + ' children have fewer than ' + TeamPlan.MIN_NIGHTS + ' counted nights, so the group average (' + Math.round(mean * 100) + '%) stands in for them.' : 'every child has ' + TeamPlan.MIN_NIGHTS + ' or more counted nights, so no one uses the group average.') + '</p>' +
        '<details><summary>Attendance behind the turnout (' + esc(g) + ')</summary><table class="roster"><thead><tr><th scope="col">Child</th><th scope="col">Nights</th><th scope="col">Rate</th></tr></thead><tbody>' +
        rs.slice().sort((a, b) => Model.byRoomThenName(a.person, b.person)).map(r => '<tr><td>' + esc(Model.fullName(r.person)) + '</td><td>' + r.nights + '</td><td>' + Math.round(r.rate * 100) + '%' + (r.usedAverage ? ' (group average)' : r.usedHistory ? ' (with earlier years)' : '') + '</td></tr>').join('') + '</tbody></table></details>';
    });
    return h + '</aside>';
  }

  // An event on the grid's own controls. Returns true when the view changed and needs drawing again; the control that was used is focused afterwards.
  const byId = id => A.master.people.find(x => String(x[X.ID]) === String(id));
  const sel = (kind, q, id) => kind + '[data-' + (kind === 'select' ? 'tgcell' : 'tgmove') + '="' + q + '"][data-kid="' + String(id).replace(/"/g, '\\"') + '"]';
  // Every way of choosing a color by hand (this grid, the Person tab, the Roster, To do) asks this BEFORE writing the choice (Fable review A8): a repeated color is said in plain words, and so is uneven sizes
  // once everyone has a color. It never blocks: the leader decides. Returns the warnings.
  A.checkTeamPick = (p, q, color) => {
    if (!A.season || !color || color === Model.NO_TEAM || !Teams.QUARTERS.includes(q)) return [];
    let w = []; try { w = TeamPlan.checkChoice({ master: A.master, season: A.season, calendar: A.calendar, today: A.today(), history: A.teamHistory() }, p, q, color).warnings; } catch (e) { w = []; }
    if (w.length) A.flash(Model.fullName(p) + ', ' + q + ' ' + color + ': ' + w.join(' '));
    return w;
  };
  // A hand-set color: written to team:Qn exactly as the Person tab does. If it is not the projected color it reads as a pin (teamplan.js decides).
  function setColor(el) {
    const p = byId(el.dataset.kid); if (!p) return false;
    A.checkTeamPick(p, el.dataset.tgcell, el.value);
    Model.setTeamChoice(A.master, p, el.dataset.tgcell, el.value); A.touch(); A.refresh();
    focusAfter.sel = sel('select', el.dataset.tgcell, el.dataset.kid); return true;
  }
  // A change to a played or locked quarter: a dated move, made in one box. The box shows what the planner knows about the child (turnout, the colors they have had, the balance now), suggests a color
  // (never one they have had, evening expected attendance) with one button, and accepts ANY color: a pick that repeats a color or unbalances the teams only warns. The quarter's own color is never edited.
  function historyHtml(ctx, p) {
    const h = ctx.history && ctx.history(p), rows = Q.map(q => {
      const roster = p['team:' + q] || '', e = Teams.effective(p, q, h), list = (h && h.list && h.list[q]) || [];
      const moves = list.map(m => esc(m.team) + ' from ' + esc(md(m.from))).join(', then ');
      return '<tr><th scope="row">' + q + '</th><td>' + (roster ? '<span class="team team-' + esc(roster) + '">' + esc(roster) + '</span>' : '<span class="none">&mdash;</span>') + (e.replaced ? ' <small>(replaced from the first night)</small>' : '') + '</td><td>' + (moves || '<span class="status">no moves</span>') + '</td></tr>';
    });
    const years = [...new Set(Object.keys(p).map(k => (/^team:(\d{4}-\d{2}):Q[1-4]$/.exec(k) || [])[1]).filter(Boolean))].sort();
    const past = years.map(y => '<li>' + esc(y) + ': ' + Q.map(q => q + ' ' + esc(p['team:' + y + ':' + q] || '—')).join(', ') + '</li>').join('');
    return '<table class="roster tgmvhist"><caption>Colors this year</caption><thead><tr><th scope="col">Quarter</th><th scope="col">Color</th><th scope="col">Moves</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>' + (past ? '<p class="status">Earlier years</p><ul class="tgmvpast">' + past + '</ul>' : '');
  }
  function rateText(ctx, p) {
    const r = TeamPlan.ratesOf(ctx, Model.groupOf(Model.room(p))).find(x => String(x.person[X.ID]) === String(p[X.ID])); if (!r) return 'No turnout is known for this child yet.';
    const pct = Math.round(r.rate * 100) + '%';
    if (r.usedAverage) return 'Expected turnout ' + pct + ' (the group average: fewer than ' + TeamPlan.MIN_NIGHTS + ' counted nights this season and no earlier years).';
    if (r.usedHistory) return 'Expected turnout ' + pct + ' (' + r.nights + ' counted night' + (r.nights === 1 ? '' : 's') + ' this season, ' + Math.round(r.weight * 100) + '% of the weight; earlier years ' + Math.round(r.pastRate * 100) + '% over ' + r.pastNights + ' nights).';
    return 'Expected turnout ' + pct + ' (' + r.nights + ' counted nights this season).';
  }
  function move(btn) {
    const p = byId(btn.dataset.kid), q = btn.dataset.tgmove, dlg = document.getElementById('dlg'); if (!p || !dlg) return false;
    const ctx = { master: A.master, season: A.season, calendar: A.calendar, today: A.today(), history: A.teamHistory() }, id = String(p[X.ID]), now = Teams.endIn(p, q, ctx.history(p)), sug = TeamPlan.suggestMove(ctx, p, q);
    const today = A.today(), dflt = A.quarterNow() === q ? today : TeamPlan.firstNight(A.calendar, q) || today, who = esc(Model.fullName(p));
    dlg.innerHTML = '<h3 style="margin-top:0">Change ' + q + ' team for ' + who + '</h3><p>' + esc(rateText(ctx, p)) + '</p>' + historyHtml(ctx, p) +
      '<p><b>Now:</b> ' + (now ? '<span class="team team-' + esc(now) + '">' + esc(now) + '</span>' : 'no color') + '</p>' +
      '<p id="tgMvSug">' + (sug.to ? '<b>Suggested:</b> <span class="team team-' + esc(sug.to) + '">' + esc(sug.to) + '</span> <button type="button" id="tgMvUse">Use the suggestion</button><br><span class="status">' + esc(sug.why) + '</span>' : '<span class="status">' + esc(sug.why) + ' Pick any color below; you will be warned, not stopped.</span>') + '</p>' +
      '<fieldset class="tgmvopts"><legend>Move to</legend>' + Teams.COLORS.map(c => '<label><input type="radio" name="tgMvTeam" value="' + esc(c) + '"> <span class="team team-' + esc(c) + '">' + esc(c) + '</span></label>').join(' ') + '</fieldset>' +
      '<p id="tgMvWarn" class="tgbalance" role="status" aria-live="polite"></p>' +
      '<label>From this date <input type="date" id="tgMvDate" value="' + esc(dflt) + '"></label><p id="tgMvErr" class="status bad" role="alert"></p>' +
      '<div class="dlgbtns"><button type="button" id="tgMvCancel">Cancel</button><button type="button" id="tgMvSave" class="primary">Record the move</button></div>';
    const $ = x => document.getElementById(x), pick = () => (dlg.querySelector('input[name="tgMvTeam"]:checked') || {}).value || '';
    const warn = () => { const t = pick(); if (!t) { $('tgMvWarn').innerHTML = ''; return; } const w = t === now ? ['They are already ' + t + '.'] : TeamPlan.checkChoice(ctx, p, q, t).warnings; $('tgMvWarn').className = 'tgbalance' + (w.length ? ' bad' : ''); $('tgMvWarn').innerHTML = w.length ? w.map(x => '<span>' + esc(x) + '</span>').join('<br>') + (t === now ? '' : '<br><span class="status">You can still record it.</span>') : 'No warnings: this keeps the teams even and repeats no color.'; };
    dlg.querySelectorAll('input[name="tgMvTeam"]').forEach(r => { r.onchange = warn; });
    if ($('tgMvUse')) $('tgMvUse').onclick = () => { const r = dlg.querySelector('input[name="tgMvTeam"][value="' + sug.to + '"]'); if (r) { r.checked = true; warn(); r.focus(); } };
    $('tgMvCancel').onclick = () => { dlg.close(); const b = document.querySelector(sel('button', q, id)); if (b) b.focus(); };
    $('tgMvSave').onclick = () => {
      const d = ($('tgMvDate').value || '').trim(), t = pick(), err = m => { $('tgMvErr').textContent = m; };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return err('Pick the date the change starts.');
      // A date that is not a club night belongs to the quarter of the night before it, not to whatever quarter Reports is showing (A10).
      const dq = (A.calendar.find(r => r.Date === d) || {}).Quarter || Calendar.currentQuarter(A.calendar, d) || A.settings.quarter;
      if (dq !== q) return err(d + ' is in ' + (dq || 'no quarter') + ', not ' + q + '. Pick a date in ' + q + '.');
      if (!Teams.COLORS.includes(t)) return err('Pick Red, Blue, Green or Yellow.');
      try { Season.setTeamMove(A.season, p[X.ID], q, d, t, A.calendar); } catch (e) { return err(e.message); }
      dlg.close(); A.touch(); A.refresh(); focusAfter.sel = sel('button', q, id); restoreFocus(document.getElementById('teamsWrap') || document);
    };
    dlg.showModal(); const first = dlg.querySelector('input[name="tgMvTeam"]'); if (first) first.focus();
    return false;
  }
  // ---------- preview before Fill / Assign blanks write anything ----------
  // Both actions draw colors at random. They now draw into a PROPOSAL first (nothing in the data changes), show every child who would get a color, and write only when Confirm is pressed.
  // The proposal is held as an object ({ rows, plan }) and Confirm applies exactly that object, never a second draw. Draw again makes a new proposal from a new seed (Teams.mulberry32); Cancel drops it.
  const newSeed = () => Math.floor(Math.random() * 4294967296);
  // Warnings about a proposal, in plain words: a color the child already had in another quarter, and uneven teams once everyone has a color. rows: [{ p, q, color }]. Never blocks.
  function proposalWarnings(rows) {
    const hx = A.teamHistory(), key = (p, q) => String(p[X.ID]) + '|' + q, ov = new Map(rows.map(r => [key(r.p, r.q), r.color])), out = [];
    const eff = (p, q) => ov.get(key(p, q)) || Teams.endIn(p, q, hx && hx(p));
    rows.forEach(r => {
      const others = Q.filter(q => q !== r.q).map(q => ({ q, c: eff(r.p, q) })).filter(x => x.c), had = others.find(x => x.c === r.color);
      if (had && new Set(others.map(x => x.c)).size < Teams.COLORS.length) out.push(Model.fullName(r.p) + ' gets ' + r.color + ' in ' + r.q + ' but had ' + r.color + ' in ' + had.q + '.');
    });
    GROUPS.forEach(g => [...new Set(rows.map(r => r.q))].forEach(q => {
      const kids = kidsAll().filter(p => Model.groupOf(Model.room(p)) === g && !Model.noTeam(p, q)), cs = kids.map(p => eff(p, q));
      if (!kids.length || cs.some(c => !c)) return;
      const n = Teams.COLORS.map(c => cs.filter(x => x === c).length);
      if (Math.max(...n) - Math.min(...n) > 1) out.push(g + ' ' + q + ': the teams would be uneven (' + Teams.COLORS.map((c, k) => c + ' ' + n[k]).join(', ') + ').');
    }));
    return out;
  }
  // spec: { title, intro, draw(rng) -> { rows, ...whatever apply needs }, apply(res), done() }
  function preview(spec) {
    const dlg = document.getElementById('dlg'); if (!dlg) return;
    let res = null;
    const paint = () => {
      const warn = proposalWarnings(res.rows), n = res.rows.length;
      const rows = res.rows.slice().sort((a, b) => Model.byRoomThenName(a.p, b.p) || a.q.localeCompare(b.q));
      dlg.innerHTML = '<h3 style="margin-top:0">' + esc(spec.title) + '</h3><p class="status">' + esc(spec.intro) + ' Nothing is saved until you press Confirm.</p>' +
        '<p id="tgPrevCount"><b>' + n + ' color' + (n === 1 ? '' : 's') + ' would be set.</b></p>' +
        '<div id="tgPrevWarn" class="tgbalance' + (warn.length ? ' bad' : '') + '" role="status" aria-live="polite">' + (warn.length ? warn.map(w => '<p>' + esc(w) + '</p>').join('') : '<span class="status">No warnings: no color is repeated and the teams stay even.</span>') + '</div>' +
        '<table class="roster tgprev"><thead><tr><th scope="col">Child</th><th scope="col">Class</th><th scope="col">Quarter</th><th scope="col">Color</th></tr></thead><tbody>' +
        rows.map(r => '<tr data-kid="' + esc(r.p[X.ID]) + '" data-q="' + r.q + '"><td>' + esc(Model.fullName(r.p)) + '</td><td>' + esc(Model.room(r.p)) + '</td><td>' + r.q + '</td><td><span class="team team-' + esc(r.color) + '">' + esc(r.color) + '</span></td></tr>').join('') + '</tbody></table>' +
        '<div class="dlgbtns tgprevbtns"><button type="button" id="tgPrevCancel">Cancel</button><button type="button" id="tgPrevAgain">Draw again</button><button type="button" id="tgPrevOk" class="primary"' + (n ? '' : ' disabled') + '>Confirm</button></div>';
      const $ = x => document.getElementById(x);
      $('tgPrevCancel').onclick = () => { dlg.close(); if (spec.cancel) spec.cancel(); };
      $('tgPrevAgain').onclick = () => { res = spec.draw(Teams.mulberry32(newSeed())); paint(); $('tgPrevAgain').focus(); };
      $('tgPrevOk').onclick = () => { dlg.close(); spec.apply(res); };
    };
    res = spec.draw(Teams.mulberry32(newSeed())); paint(); dlg.showModal(); const ok = dlg.querySelector('#tgPrevOk'); if (ok && !ok.disabled) ok.focus();
  }
  // Fill: the year plan's projection for every open quarter, shown first.
  function previewFill() {
    const mk = () => ({ master: A.master, season: A.season, calendar: A.calendar, today: A.today(), history: A.teamHistory() });
    preview({
      title: 'Fill the blank colors', intro: 'This is the plan for every open quarter. Locked quarters, pins and No team children are not touched.',
      draw: rng => { const plan = TeamPlan.project(mk(), { rng }); return { plan, rows: plan.changes.map(c => ({ p: byId(c.id), q: c.q, color: c.to })).filter(r => r.p) }; },
      apply: res => { TeamPlan.applyPlan(mk(), res.plan); A.touch(); A.refresh(); focusAfter.sel = '.tgwhy'; restoreFocus(document.getElementById('teamsWrap') || document); },
      cancel: () => { const b = document.querySelector('[data-tgfill]'); if (b) b.focus(); },
    });
    return false;
  }
  function handle(e) {
    if (e.type === 'click' && e.target.closest) {
      const lk = e.target.closest('[data-tglock]'), ul = e.target.closest('[data-tgunlock]');
      if (lk) return lock(lk.dataset.tglock); if (ul) return unlock(ul.dataset.tgunlock);
      if (e.target.closest('[data-tgrecalc]')) { ui.preview = !ui.preview; focusAfter.sel = ui.preview ? '.tgpreview' : '[data-tgrecalc]'; return true; }
      if (e.target.closest('[data-tgcancel]')) { ui.preview = false; focusAfter.sel = '[data-tgrecalc]'; return true; }
      if (e.target.closest('[data-tgaccept]')) { TeamPlan.applyPlan(lastCtx, lastPlan); ui.preview = false; A.touch(); A.refresh(); focusAfter.sel = '.tgwhy'; return true; }      // the button may now read "Nothing to recalculate" (disabled), so focus goes to the panel
      if (e.target.closest('[data-tgfill]')) return previewFill();      // a preview first; Confirm writes (see preview())
    }
    if (e.type === 'change' && e.target.dataset && e.target.dataset.tgcell) return setColor(e.target);
    const mv = e.type === 'click' && e.target.closest && e.target.closest('[data-tgmove]'); if (mv) return move(mv);
    const bq = e.type === 'click' && e.target.closest && e.target.closest('[data-tgbq]'); if (bq) { ui.bq = bq.dataset.tgbq; focusAfter.sel = '[data-tgbq="' + ui.bq + '"]'; return true; }
    const b = e.target.closest && e.target.closest('[data-tgscope]');
    if (b && e.type === 'click') { ui.scope = b.dataset.tgscope; focusAfter.sel = '[data-tgscope="' + ui.scope + '"]'; return true; }
    if (e.type === 'change' && e.target.id === 'tgClass') { ui.cls = e.target.value; focusAfter.sel = '#tgClass'; return true; }
    if (e.type === 'change' && e.target.id === 'tgGroup') { ui.group = e.target.value; focusAfter.sel = '#tgGroup'; return true; }
    return false;
  }
  function restoreFocus(root) { const el = focusAfter.sel && root.querySelector(focusAfter.sel); focusAfter.sel = ''; if (el) el.focus(); }

  window.TeamGrid = { html, handle, restoreFocus, ui, preview, proposalWarnings };
})();
