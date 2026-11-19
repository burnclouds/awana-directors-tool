(this.AwanaVersions = this.AwanaVersions || {})['app-person.js'] = '1.26.1';
// Person tab: pick one person and see or edit everything held about them (Planning Center fields, club record, uniform,
// attendance, awards, progress summary, change history). Reuses the edits the other tabs make; nothing here has its own storage.
(function () {
  const { C, X } = Model;
  const App = window.App, esc = App.esc, $ = id => document.getElementById(id);
  const ui = { role: 'all', group: 'All', cls: 'All', id: '', q: '', inactive: 'active', attn: '', sub: 'progress', sort: 'first' };      // sub = progress | attendance | registration; sort = first | last name      // attn = the person we arrived at from the To do tab, whose open items are highlighted
  const idOf = p => p[X.ID];
  // N6: a person with no progress sheet (a volunteer, a Puggle) opens on Registration, not on an empty Progress page. ui.sub keeps the leader's own choice; this only picks what is shown. Clicking the Progress button for that person counts as a choice (ui.subPickedFor), so it still shows the "no progress sheet" message.
  const hasSheet = p => Model.isClubber(p) && ['Cubbies', 'Sparks', 'T&T'].includes(Model.groupOf(Model.room(p)));
  const shownSub = p => ui.sub === 'progress' && p && !hasSheet(p) && ui.subPickedFor !== idOf(p) ? 'registration' : ui.sub;
  const MD = Model.md;      // shared with the reports (model.js)
  const UNI_FIELDS = [['SIZE_VERIFIED', 'Size'], ['ORDERED', 'Ordered'], ['SIZE_ORDERED', 'Size ordered', 1], ['RECEIVED', 'Received'], ['GIVEN', 'Given out'], ['SIZE_GIVEN', 'Size given', 1], ['NOTES', 'Uniform notes']];      // the older size boxes (flag 1) show only where this child has one
  const PC_FIELDS = [C.FIRST, C.LAST, C.ROOM, C.GRADE, C.BDAY, C.SELECTION, C.MED, C.ALLERGY, C.EMERG];
  const LONG = [C.MED, C.ALLERGY, C.EMERG];
  let stale = false;      // roster-side edits made here that the Roster tab has not been told about yet

  // ---------- pickers ----------
  const inGroup = p => ui.group === 'All' || Model.groupOf(Model.room(p)) === ui.group;
  const inRole = p => ui.role === 'all' || (ui.role === 'adult') === Model.isVolunteer(p);
  const visible = p => (ui.inactive === 'all' || (ui.inactive === 'inactive' ? !Model.isActive(p) : Model.isActive(p))) && inRole(p) && inGroup(p);      /* Status: Active / Inactive / Everyone, the same words as on Roster (UX-14) */
  const byFirst = (a, b) => (a[C.FIRST] || '').localeCompare(b[C.FIRST] || '') || (a[C.LAST] || '').localeCompare(b[C.LAST] || '');
  const byLast = (a, b) => (a[C.LAST] || '').localeCompare(b[C.LAST] || '') || (a[C.FIRST] || '').localeCompare(b[C.FIRST] || '');
  const pool = () => App.master.people.filter(p => visible(p) && (!ui.q || Model.fullName(p).toLowerCase().includes(ui.q.toLowerCase()))).sort(ui.sort === 'last' ? byLast : byFirst);
  const list = () => pool().filter(p => ui.cls === 'All' || Model.room(p) === ui.cls);
  const person = () => App.master.people.find(p => idOf(p) === ui.id);
  // The Person list shows names only (the Class and Group pickers filter it). Only when two people in the list have the same name is the class added, so the two can be told apart.
  const label = (p, dup) => Model.fullName(p) + (dup ? ' (' + Model.room(p) + ')' : '') + (Model.isActive(p) ? '' : ' (inactive)');

  // ---------- sections ----------
  const pcMark = (p, col) => p['ov:' + col] ? '<span class="ovmark" title="Pending change in Planning Center. PC value now: ' + esc(p[col]) + '">&#9679; pending PC change</span> <a href="#" data-reset="' + esc(col) + '">cancel</a>' : '';
  function pcField(p, col) {
    const v = Model.eff(p, col);
    let input;
    if (col === C.ROOM) { const rooms = App.knownRooms(); input = '<select data-pc="' + esc(col) + '">' + (rooms.includes(v) ? '' : '<option>' + esc(v) + '</option>') + rooms.map(r => '<option' + (r === v ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select>'; }
    else if (LONG.includes(col)) input = '<textarea rows="2" data-pc="' + esc(col) + '">' + esc(v) + '</textarea>';
    else input = '<input type="text" data-pc="' + esc(col) + '" value="' + esc(v) + '">';
    return '<label class="pf"><span>' + esc(col.length > 40 ? 'Allergies / medical conditions (registration answer)' : col) + ' <span class="ovslot" data-slot="' + esc(col) + '">' + pcMark(p, col) + '</span>' + (App.season && App.flagPlaceBtn ? ' ' + App.flagPlaceBtn({ level: 'field', kid: p[X.ID], field: col }, Model.fullName(p) + ': ' + col) : '') + '</span>' + input + '</label>';
  }
  function secPc(p) {
    return '<section class="pcard"><h3>Planning Center record</h3><p class="status">Planning Center is never edited here: a change becomes a pending change that shows in reports until the next export matches it. ' +
      '<button data-all="1">All fields&hellip;</button></p><div class="pgrid">' + PC_FIELDS.map(c => pcField(p, c)).join('') + '</div></section>';
  }
  // A notes flag beside a club field (plan item 4, stage a). The field name reads as the To do "Where" line: "Club · Active", "Uniform · Size ordered", "Award · 2026-10-28 · Pilot Wing".
  const fieldFlag = (p, field, label) => (App.season && App.flagPlaceBtn ? ' ' + App.flagPlaceBtn({ level: 'field', kid: p[X.ID], field }, Model.fullName(p) + ': ' + label) : '');
  // Volunteer absences (S11): this person's absences, one line per club night, with clear options and an add form. Entering an absence is the acknowledgement. Stored with the person (season.absences[personId]).
  // Volunteer: one row per night with the combined status (display only; a blank is never "Absent").
  function secVolunteerNights(p) {
    const pid = idOf(p), rows = Season.volunteerNights(App.season, pid, App.absenceClubDates(), App.today(), App.calendar);
    const label = { present: 'Present', planned: 'Planned out', came: 'Present (was planned out)', none: 'Not marked' };
    if (!rows.length) return '<p class="status">No club nights or planned nights for this volunteer yet.</p>';
    const ex = Season.volunteerExpected(App.season, pid, App.calendar);
    return '<h4>Club nights</h4><p class="status">Present ' + ex.present + ' of ' + ex.expected + ' expected held club nights (' + ex.plannedOut + ' planned out). Nights not held (no child marked) are listed in grey and not counted.</p><div class="pscroll"><table class="roster att"><thead><tr><th>Night</th><th>Qtr</th><th>Status</th><th>Reason</th></tr></thead><tbody>' +
      rows.map(r => '<tr class="' + r.status + (r.held === false ? ' notheld' : '') + '"><td>' + esc(Model.md(r.date)) + (r.clubNight ? '' : ' <small>(no longer a club night)</small>') + (r.held === false && r.clubNight ? ' <small>(not held)</small>' : '') + '</td><td>' + esc(App.quarterOf(r.date) || '') + '</td><td>' + label[r.status] + '</td><td>' + esc(r.reason || '') + '</td></tr>').join('') +
      '</tbody></table></div>';
  }
  function secAbsences(p) {
    const pid = idOf(p), mine = App.absenceList().filter(r => r.personId === pid), byAbs = {};
    mine.forEach(r => { (byAbs[r.absId] = byAbs[r.absId] || { reason: r.reason, nights: [] }).nights.push(r.date); });
    const body = Object.keys(byAbs).sort().map(aid => { const a = byAbs[aid]; a.nights.sort();
      return '<div class="absblock"><p><b>' + esc(a.reason || 'Absent') + '</b> <span class="status">' + a.nights.map(d => Model.md(d)).join(', ') + '</span> <button type="button" data-absall="' + esc(aid) + '">Clear whole absence</button> <button type="button" data-absrem="' + esc(aid) + '">Clear remaining nights</button></p>' +
        '<ul>' + a.nights.map(d => '<li>' + Model.md(d) + (App.absenceClubDates().includes(d) ? '' : ' (no longer a club night)') + ' <button type="button" data-absnight="' + esc(aid + '|' + d) + '">Clear this night</button></li>').join('') + '</ul></div>'; }).join('');
    return '<section class="pcard absencecard"><h3>Absences</h3><p class="status">Club nights this volunteer is out. Entering an absence is the acknowledgement. Clearing removes the records; History keeps them for Undo.</p>' + (body || '<p class="status">No absences recorded.</p>') +
      '<h4>Add an absence</h4><p class="pf"><label>From <input type="date" id="pAbsFrom"></label> <label>To <input type="date" id="pAbsTo"></label> <label>Reason <input type="text" id="pAbsReason" maxlength="200"></label> <button type="button" data-absadd="1" class="primary">Add absence</button></p><p class="status">Only club nights from the club calendar are recorded.</p></section>';
  }
  // Emergency phone chosen by the club (Model.clubPhone): any number on the record, or one typed in. It is kept in this data file only; Planning Center is never changed.
  const EMERG_CANDIDATES = ['Mobile Phone Number', 'Home Phone Number', 'Work Phone Number', 'Other Phone Number', 'Registration Contact Phone Number', C.PARENT_PHONE];
  function secEmergPhone(p) {
    // Hidden once the Emergency Contact box holds a phone number: the registration's numbers are used then.
    if (Model.emergencyPhone(p)) return '';
    const chosen = Model.clubPhone(p), seen = new Set(), opts = [];
    const add = (label, v) => { v = String(v || '').trim(); if (Model.hasPhoneDigits(v) && !seen.has(v)) { seen.add(v); opts.push([label, v]); } };      // only a real number (7 or more digits) is offered: "N/A" is not a phone (CR-02)
    EMERG_CANDIDATES.forEach(c => add(c, Model.eff(p, c)));
    const raw = String(Model.eff(p, C.EMERG) || ''), i = raw.lastIndexOf(' - '); if (i >= 0) add('Emergency contact', raw.slice(i + 3));
    return '<section class="pcard" data-attnkey="club:emerg"><h3>Emergency phone</h3><p class="status">Printed on the binders only when Planning Center has neither a parent\'s primary phone nor an emergency contact number. Saved in this data file only; Planning Center is never changed.</p>' +
      '<p>' + (chosen ? 'Chosen: <b>' + esc(chosen) + '</b> <button type="button" data-usephone="">Clear</button>' : '<span class="status">None chosen.</span>') + '</p>' +
      (opts.length ? '<div class="pgrid">' + opts.map(([l, v]) => '<div class="pf"><span>' + esc(l) + '</span> ' + esc(v) + ' <button type="button" data-usephone="' + esc(v) + '">Use</button></div>').join('') + '</div>' : '') +
      '<p class="pf wide"><input type="text" id="emergPhoneTyped" size="18" placeholder="or type a number"> <button type="button" data-usetyped="1">Use typed number</button></p></section>';
  }
  function secClub(p, g, season) {
    const teams = Model.hasColorTeams(g), opt = (v, x) => '<option' + (v === x ? ' selected' : '') + '>' + esc(x) + '</option>';
    return '<section class="pcard"><h3>Club record</h3><div class="pgrid">' +
      '<label class="pf chk"><input type="checkbox" data-flag="' + X.ACTIVE + '"' + (Model.isActive(p) ? ' checked' : '') + '> Active' + fieldFlag(p, 'Club · Active', 'Active') + '</label>' +
      '<label class="pf chk"><input type="checkbox" data-flag="' + X.NOPHOTOS + '"' + (Model.noPhotos(p) ? ' checked' : '') + '> No photos' + fieldFlag(p, 'Club · No photos', 'No photos') + '</label>' +
      (teams ? '<div class="pf wide teamblock"><div class="pgrid">' + ['Q1', 'Q2', 'Q3', 'Q4'].map(q => '<label class="pf"><span>' + q + ' color team</span>' + fieldFlag(p, 'Club · ' + q + ' team', q + ' team') + '<select data-team="' + q + '"><option value=""></option><option value="' + Model.NO_TEAM + '"' + (Model.noTeam(p, q) ? ' selected' : '') + '>No team</option>' + App.teamColors().map(t => opt(p['team:' + q], t)).join('') + '</select></label>').join('') + '</div>' +
        '<p class="status teamnote"><b>Q1 to Q4 are the team for the whole quarter</b>, every night of it, including nights already played. To change a child\'s team part-way through a quarter, <b>use Move below</b>: it starts on the night you choose and the points already earned stay with the old team. Change a quarter color here only to correct it (or to set up a quarter that has not started).</p>' +
        (season && Model.isClubber(p) ? movesBlock(p, season) : '') + '</div>' : '') +
      (season && Model.isClubber(p) ? '<div class="pf wide">' + App.handbookBox(idOf(p)) + fieldFlag(p, 'Handbook', 'Handbook') + '</div>' : '') +
      '<label class="pf wide"><span>Notes</span><textarea rows="2" data-u="' + X.NOTES + '">' + esc(p[X.NOTES]) + '</textarea></label></div>' +
      '<p class="status">On the roster since ' + esc(p[X.FIRST_SEEN] || '?') + ' · last in a Planning Center export ' + esc(p[X.LAST_SEEN] || '?') + ' · ID ' + esc(idOf(p)) + '</p></section>';
  }
  // Mid-quarter color changes: the quarter color above is the default, a move applies from its night to the end of that quarter.
  function movesBlock(p, season) {
    const id = idOf(p), moves = Season.movesOf(season, id), nights = App.nightList(), today = App.today(), next = (nights.find(n => n.date >= today) || nights[nights.length - 1] || {}).date;
    return '<div class="moves"><p><b>Moves so far:</b> ' + (moves.length ? moves.map(m => '<span class="chip"><span class="team team-' + esc(m.team) + '">' + esc(m.team) + '</span> from ' + esc(MD(m.from)) + ' (' + esc(m.q) + ') <a href="#" data-rmmove="' + esc(m.from) + '" data-q="' + esc(m.q) + '" title="remove" aria-label="Remove">&times;</a></span>').join('') : '<span class="status">No mid-quarter changes: the quarter color above applies all quarter.</span>') + '</p>' +
      '<p>Move to <select id="peMoveTeam"><option value=""></option>' + App.teamColors().map(t => '<option>' + t + '</option>').join('') + '</select> starting <select id="peMoveFrom">' +
      nights.map(n => '<option value="' + esc(n.date) + '"' + (n.date === next ? ' selected' : '') + '>' + esc(MD(n.date) + ' (' + n.quarter + ')') + '</option>').join('') + '</select> <button id="peMoveAdd">Move</button></p>' +
      '<p class="status">That night and later nights in the quarter count for the new team; points already earned stay with the old one. To undo, remove the move. A one-night exception (a visitor or fill-in) is set in the Attendance table below.</p></div>';
  }
  // A person added by hand who is not in Planning Center (yet).
  function secGuest(p) {
    return '<section class="pcard"><h3>Guest: not in Planning Center</h3><p class="status">Added by hand. When they are registered in Planning Center, tie this record to that entry so their attendance and awards carry over (the next import also offers it when the names match). ' +
      '<button data-linkpc="1">Link to Planning Center&hellip;</button></p></section>';
  }
  function secUniform(p) {
    const U = Model.UNI, items = Model.uniformItems(p);
    return '<section class="pcard"><h3>Uniform</h3><p>' + (items.length ? items.map(i => '<span class="chip">' + esc(i) + '</span>').join('') + ' <span class="status">ordered and paid in Planning Center</span>' : '<span class="status">No uniform ordered in Planning Center.</span>') + '</p>' +
      '<div class="pgrid">' + UNI_FIELDS.filter(x => !x[2] || p[U[x[0]]]).map(([k, l]) => '<div class="pf"><span>' + l + '</span>' + fieldFlag(p, 'Uniform · ' + l, l) + (['ORDERED', 'RECEIVED', 'GIVEN'].includes(k) ? App.uniDateHtml(U[k], p[U[k]]) : '<input type="text" data-u="' + U[k] + '" value="' + esc(p[U[k]]) + '">') + '</div>').join('') + '</div>' +
      '<label class="pf chk" title="Handed over, but I do not have the date. Counts as given out, like a date."><input type="checkbox" data-flag="' + U.GIVEN_FLAG + '"' + (p[U.GIVEN_FLAG] ? ' checked' : '') + '> Given out, but I do not have the date' + fieldFlag(p, 'Uniform · Given out, no date', 'Given out, no date') + '</label></section>';
  }
  function secAttend(p, g, season) {
    const id = idOf(p), cols = App.markCols[g] || App.markCols.Puggles, today = App.today(), teams = Model.hasColorTeams(g);
    const nights = App.nightList().filter(n => n.date <= today || (season.attendance[n.date] || {})[id]).reverse();
    const resolve = Season.teamResolver(season, id, q => Model.teamOf(p, q), App.quarterOf);
    const tot = Season.totals(season, id, App.calendar), gp = teams ? Season.kidGamePoints(season, id, g, resolve, App.calendar).year : null;
    const stories = teams ? ['Q1', 'Q2', 'Q3', 'Q4'].map(q => { const t = Season.teamStory(season, id, q, Model.teamOf(p, q)); return t ? q + ': ' + t : ''; }).filter(Boolean) : [];      // a mid-quarter move: the points follow the team on each night attended
    return '<section class="pcard"><h3>Attendance' + (teams ? ' and games' : '') + '</h3><p class="status">Year so far: ' + tot.year.a + ' present, ' + tot.year.h + ' handbook, ' + tot.year.p + ' participation, ' + tot.year.x + ' extra' +
      (gp ? ' · game points ' + (gp.place + gp.spirit) + ' (place ' + gp.place + ', spirit ' + gp.spirit + ')' : '') + '. Game results are per team, so they are entered on the Games tab.' +
      (stories.length ? '<br><span class="teamstory">Team moves: ' + stories.map(esc).join(' · ') + '. Game points follow the team on each night attended.</span>' : '') + '</p>' +
      '<div class="pscroll"><table class="roster att"><thead><tr><th>Night</th><th>Qtr</th>' + (teams ? '<th>Team</th>' : '') + cols.map(c => '<th>' + c[1] + '</th>').join('') + (teams ? '<th title="Only if they played with a different team that night">Played with</th><th>Game pts</th>' : '') + '</tr></thead><tbody>' +
      nights.map(n => { const m = (season.attendance[n.date] || {})[id] || {}, q = App.quarterOf(n.date), t = teams ? resolve(n.date) : '', pts = teams && m.a && t ? Season.teamPoints(season, n.date, m.g || g, t) : null;
        return '<tr><td>' + esc(MD(n.date)) + '</td><td>' + esc(q) + '</td>' + (teams ? '<td>' + (t ? '<span class="team team-' + esc(t) + '">' + esc(t) + '</span>' : '') + (t && t !== Model.teamOf(p, q) ? '<span title="differs from the ' + esc(q) + ' team (' + esc(Model.teamOf(p, q) || 'none') + ')"> *</span>' : '') + '</td>' : '') +
          cols.map(c => '<td class="chk"><input type="checkbox" data-mark="' + c[0] + '" data-date="' + esc(n.date) + '"' + (m[c[0]] ? ' checked' : '') + '></td>').join('') + (teams ? '<td><select data-nightteam="1" data-date="' + esc(n.date) + '"' + (m.a ? '' : ' disabled') + '><option value=""></option>' + App.teamColors().map(c => '<option' + (m.t === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></td><td class="yr">' + (pts ? pts.place + pts.spirit : '') + '</td>' : '') + '</tr>'; }).join('') +
      '</tbody></table></div></section>';
  }
  function secAwards(p, g, season) {
    const id = idOf(p), have = Season.awardsOf(season, id), nights = App.nightList().filter(n => n.date <= App.today()).map(n => n.date), last = nights[nights.length - 1] || '';      // an award is announced (and corrected) from here; awards are not entered by hand
    return '<section class="pcard"><h3>Awards</h3><p>' + (have.length ? have.map(a => '<span class="chip">Announced ' + esc(MD(a.date)) + ' · ' + esc(a.award) + fieldFlag(p, 'Award · ' + MD(a.date) + ' · ' + a.award, a.award + ' (' + MD(a.date) + ')') + ' <a href="#" data-rmaward="' + esc(a.award) + '" data-date="' + esc(a.date) + '" title="remove" aria-label="Remove">&times;</a></span>').join('') : '<span class="status">None recorded yet.</span>') + '</p>' +
      '</section>';
  }
  // The Awards tab of a child's page: a presentation view for building the slides. Earned is read-only (it comes from the progress sheets and attendance); this tab shows whether each award has been told to the group
  // and lets you announce it on a night, or open the Announce page or the slide for that night. There is no Given tick here: awards are handed over in class and signed off on the paper sheet.
  function awardsTab(p, g, season) {
    const id = idOf(p), rows = Season.awardLedger(season, id, g, App.calendar), skip = (season.config.exclude || {})[g] || [], nights = App.nightList().map(n => n.date);
    const night = nights.includes(ui.awNight) ? ui.awNight : App.nextNight(), waiting = rows.filter(r => r.earned && !r.announced && !r.held && !skip.includes(r.award));
    const given = r => r.given === 'no date' ? 'Given, no date' : r.given ? 'Given ' + MD(r.given) : 'not yet';      // (Flight 3:16 is not an award, so it is never a row here: N23)
    const told = r => r.announced ? MD(r.announced) : r.annNoDate ? '<span class="status">Announced, no date</span>' :skip.includes(r.award) ? '<span class="status">not announced (everyone gets it)</span>' : !r.earned ? '<span class="status">not yet</span>' : r.held ? '<span class="status">Held</span>' :
      '<button type="button" data-peann="' + esc(r.award) + '">Announce on ' + esc(MD(night)) + '</button>';
    return '<section class="pcard peawards"><h3>Awards earned</h3>' +
      '<p class="status">Earned comes from the progress sheets and attendance, so it is changed there. Awards are handed over in class and signed off on the paper sheet, so Given is entered on the Progress sub-tab, under the award’s section.</p>' +
      (rows.length ? '<div class="pscroll"><table class="roster"><thead><tr><th>Award</th><th>Earned</th><th>Announced</th><th>Hold</th><th>Given</th></tr></thead><tbody>' + rows.map(r => '<tr class="' + (r.given ? 'st-given' : r.held ? 'st-held' : '') + '"><td>' + esc(Season.awardLabel(season, id, r.award)) + fieldFlag(p, 'Awards earned · ' + Season.awardLabel(season, id, r.award), Season.awardLabel(season, id, r.award)) + (Season.isEndOfYear(season, g, r.award) ? ' <span class="chip">End of year</span>' : '') + '</td><td class="status">' + esc(r.earned ? MD(r.earned) : 'by hand') + '</td><td>' + told(r) + '</td><td>' + (r.earned && !r.announced && !skip.includes(r.award) ? '<label title="Keep this award off the slides until you release it"><input type="checkbox" data-pehold="' + esc(r.award) + '"' + (r.held ? ' checked' : '') + ' aria-label="Hold ' + esc(Season.awardLabel(season, id, r.award)) + '"></label>' : '') + '</td><td class="status">' + esc(given(r)) + '</td></tr>').join('') + '</tbody></table></div>' :
        '<p class="status">Nothing earned yet this season.</p>') +
      '<p><label>Night <select id="peAwNight" aria-label="Night to announce on">' + nights.map(d => '<option value="' + esc(d) + '"' + (d === night ? ' selected' : '') + '>' + esc(MD(d)) + '</option>').join('') + '</select></label> ' +
      (waiting.length > 1 ? '<button type="button" data-peannall="1">Announce all ' + waiting.length + ' on ' + esc(MD(night)) + '</button> ' : '') +
      '<button type="button" data-peannpage="1">Open the Announce page</button> <button type="button" data-peslide="1">Open the slide</button></p></section>';
  }
  function secHistory(p, season) {
    const id = idOf(p), name = x => x === id ? Model.fullName(p) : x, rows = [];
    (season.history || []).slice().reverse().forEach(e => { const mine = e.changes.filter(c => c.p.includes(id)); if (mine.length) rows.push({ e, mine }); });
    const time = t => { const d = new Date(t); return isNaN(d) ? String(t) : d.toLocaleString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
    return '<details class="pcard"><summary><b>Change history for this person</b> (' + rows.length + ')</summary>' + (rows.length ? rows.slice(0, 15).map(r => '<p><b>' + esc(time(r.e.t)) + '</b> ' + esc(r.e.label || '') + '<br>' +
      r.mine.slice(0, 6).map(c => esc(Season.describe(c, name))).join('<br>') + (r.mine.length > 6 ? '<br>&hellip; and ' + (r.mine.length - 6) + ' more' : '') + '</p>').join('') + (rows.length > 15 ? '<p class="status">Older changes are on the History tab.</p>' : '') : '<p class="status">Nothing logged yet.</p>') + '</details>';
  }

  // ---------- render ----------
  function render() {
    const el = $('personWrap'), season = App.season; $('personBar').hidden = !App.master;
    $('btnPeBack').hidden = ui.back !== 'attend' || !App.backToAttend; if (!$('btnPeBack').hidden) $('btnPeBack').innerHTML = '&larr; ' + esc(App.attendBackLabel());
    if (!App.master) { el.innerHTML = '<p class="status">Load a roster first (Import&hellip;).</p>'; $('peSub').hidden = true; return; }
    const rooms = [...new Set(App.master.people.filter(visible).map(Model.room))].sort((a, b) => Model.roomRank(a) - Model.roomRank(b) || a.localeCompare(b));
    if (ui.cls !== 'All' && !rooms.includes(ui.cls)) ui.cls = 'All';
    const shown = list();
    if (!person()) ui.id = shown[0] ? idOf(shown[0]) : '';
    const p = person(), opts = p && !shown.includes(p) ? [p].concat(shown) : shown;      // the person being edited stays in the list even after a change moves them out of the filter
    $('peRole').value = ui.role; $('peGroup').value = ui.group; $('peInactive').value = ui.inactive; $('peSort').value = ui.sort;
    $('peClass').innerHTML = '<option value="All">All</option>' + rooms.map(r => '<option' + (r === ui.cls ? ' selected' : '') + '>' + esc(r) + '</option>').join('');
    const seen = {}; opts.forEach(x => { const k = Model.fullName(x); seen[k] = (seen[k] || 0) + 1; });
    $('pePerson').innerHTML = opts.map(x => '<option value="' + esc(idOf(x)) + '"' + (idOf(x) === ui.id ? ' selected' : '') + '>' + esc(label(x, seen[Model.fullName(x)] > 1)) + '</option>').join('');
    // The status line says what the search and pickers leave, so a narrowed list is never silent.
    const n = shown.length, q = ui.q.trim();
    $('peStatus').textContent = q ? (n ? n + (n === 1 ? ' person matches' : ' people match') + ' "' + q + '". Choose one in Person.' : 'No one matches "' + q + '" in this view. Clear the search to see everyone.') : n + (n === 1 ? ' person' : ' people') + ' in this view.';
    if (!p) { $('peSub').hidden = true; $('progressWrap').hidden = true; el.hidden = false; el.innerHTML = '<p class="status">Nobody matches those pickers.</p>'; return; }
    const g = Model.groupOf(Model.room(p)), kid = Model.isClubber(p), full = !!season && kid && ['Puggles', 'Cubbies', 'Sparks', 'T&T'].includes(g), PR = ['Cubbies', 'Sparks', 'T&T'];
    if (ui.peFor !== idOf(p)) ui.peFor = idOf(p);
    // Progress sheets: the book tabs and the + Add sheet menu beside them are drawn by the progress renderer (app-season.js).
    if (!['progress', 'attendance', 'awards', 'registration'].includes(ui.sub)) ui.sub = 'progress';
    const sub = shownSub(p);
    const subs = [['progress', 'Progress'], ['attendance', 'Attendance'], ['awards', 'Awards'], ['registration', 'Registration']];
    const head = '<h2 style="margin:0 0 8px">' + esc(Model.fullName(p)) + ' <span class="status">' + esc(Model.room(p)) + ' · ' + (kid ? 'Clubber' : 'Volunteer') + (Model.isActive(p) ? '' : ' · inactive') + '</span></h2>';
    const subNav = '<nav class="awsubs" role="tablist" aria-label="Part of this person\'s record">' + subs.map(([k, l]) => '<button type="button" role="tab" data-sub="' + k + '" aria-selected="' + (sub === k) + '" class="' + (sub === k ? 'on' : '') + '">' + l + '</button>').join('') + '</nav>';
    $('peSub').hidden = false; $('peSub').innerHTML = head + subNav;
    if (sub === 'progress') {
      // The sheet is drawn by the progress renderer (book tabs, pace, the sheet); it reads the child from ui.prKid, which is set here.
      el.hidden = true; $('progressWrap').hidden = false;
      App.sheets.setKid(idOf(p));
      App.sheets.renderProgress();
      return;
    }
    el.hidden = false; $('progressWrap').hidden = true;
    if (sub === 'attendance') {
      el.innerHTML = full ? secAttend(p, g, season) :
        (season && Model.isVolunteer(p) ? secVolunteerNights(p) + secAbsences(p) : kid && !season ? '<p class="status">Open or start a data file to see attendance.</p>' : '<p class="status">Volunteers have no attendance record here.</p>');
    } else if (sub === 'awards') {
      // The ledger above is the award list; the older chips list with its remove and record-due links sits behind "Fix awards" so it cannot be mistaken for a second list.
      if (g === 'Puggles') { el.innerHTML = '<p class="status">Puggles do not earn awards.</p>'; applyAttention(p); return; }      // no Puggles awards
      el.innerHTML = full ? (PR.includes(g) ? awardsTab(p, g, season) : '') + '<details class="pcard"><summary>Fix announced dates (un-announce one)</summary>' + secAwards(p, g, season) + '</details>' :
        (kid && !season ? '<p class="status">Open or start a data file to see awards.</p>' : '<p class="status">Volunteers have no awards here.</p>');
    } else {
      el.innerHTML = (Model.isGuest(p) ? secGuest(p) : '') + secPc(p) + secEmergPhone(p) + secClub(p, g, season) + (kid ? secUniform(p) : '') + (season ? secHistory(p, season) : '');
    }
    applyAttention(p);
  }
  // The sub-tab choices sit above both panes (the Add sheet menu is beside the book tabs: app-season.js).
  $('peSub').addEventListener('click', e => { const b = e.target.closest('button[data-sub]'); if (b) { ui.sub = b.dataset.sub; ui.subPickedFor = ui.id; render(); } });

  // ---------- from the To do tab: what still needs attention for this person ----------
  // The list is worked out again on every draw from the To do rules, so a field stops being highlighted as soon as what was wrong with it is fixed.
  const keyOfEl = e => e.dataset.pc || (e.dataset.team && 'team:' + e.dataset.team) || e.dataset.u || e.dataset.flag || e.dataset.attnkey || (e.classList.contains('hbbox') ? 'handbook' : '');
  function applyAttention(p) {
    const el = $('personWrap'); if (ui.attn && ui.attn !== ui.id) ui.attn = '';
    if (!ui.attn) { el.querySelectorAll('.attnbanner').forEach(b => b.remove()); el.querySelectorAll('.attn').forEach(x => x.classList.remove('attn')); return; }
    const items = App.todoFor ? App.todoFor(ui.attn) : [], fields = new Set(items.flatMap(i => i.fields));
    const shown = [...el.querySelectorAll('[data-pc],[data-team],[data-u],[data-flag],[data-attnkey],.hbbox')], marked = new Set();
    let first = null, hidden = false;
    fields.forEach(f => {
      const hit = shown.find(e => keyOfEl(e) === f);
      if (hit) { const box = hit.closest('label.pf') || hit; marked.add(box); first = first || box; } else hidden = true;
    });
    if (hidden) { const b = el.querySelector('button[data-all]'); if (b) { marked.add(b); first = first || b; } }      // a field that is not on this page lives under All fields…
    // Highlights are switched on and off in place, and the banner's text is replaced but its buttons are not: redrawing a button between a tap's press and release would lose the tap.
    el.querySelectorAll('.attn').forEach(x => { if (!marked.has(x)) x.classList.remove('attn'); }); marked.forEach(x => x.classList.add('attn'));
    const list = items.length ? '<ul>' + items.map(i => '<li><b>' + (i.level === 'action' ? 'To do' : i.level === 'note' ? 'Note' : 'Check') + ':</b> ' + esc(i.title) + ' &mdash; ' + esc(i.text) + '</li>').join('') + '</ul>' + (first ? '<p class="status">The fields that need attention are highlighted below' + (hidden ? ' (some are under <i>All fields&hellip;</i>)' : '') + '.</p>' : '')
      : '<p class="ok">Nothing is left to do for ' + esc(Model.fullName(p)) + '.</p>';
    let b = el.querySelector('.attnbanner');
    if (!b) { el.insertAdjacentHTML('afterbegin', '<section class="pcard attnbanner"><h3></h3><div class="attnlist"></div><button data-backtodo="1">&larr; Back to To do</button> <button data-clearattn="1">Hide this</button></section>'); b = el.querySelector('.attnbanner'); }
    b.querySelector('h3').textContent = 'Needs attention (' + items.length + ')';
    const box = b.querySelector('.attnlist'); if (box.innerHTML !== list) box.innerHTML = list;
    if (first && ui.attnScroll) { ui.attnScroll = false; first.scrollIntoView({ block: 'center' }); }      // once, on arrival; not on every redraw while you fix things
  }

  // ---------- edits ----------
  const changed = rerender => { App.touch(); stale = true; if (rerender) { stale = false; App.refresh(); } else if (ui.attn && person()) applyAttention(person()); };      // a plain field edit does not redraw the page, but the To do list may have changed
  $('btnPeBack').addEventListener('click', () => { if (stale) { stale = false; App.refresh(); } if (App.backToAttend()) { ui.back = ''; } });
  $('personBar').addEventListener('input', e => {
    if (e.target.id === 'peSearch') ui.q = e.target.value; else return;
    render();
  });
  $('personBar').addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'peRole') { ui.role = t.value; ui.cls = 'All'; ui.id = ''; }
    if (t.id === 'peGroup') { ui.group = t.value; ui.cls = 'All'; ui.id = ''; }
    if (t.id === 'peClass') { ui.cls = t.value; ui.id = ''; }
    if (t.id === 'pePerson') { ui.id = t.value; ui.subPickedFor = ''; }
    if (t.id === 'peInactive') ui.inactive = t.value;
    if (t.id === 'peSort') ui.sort = t.value;
    render();
  });
  // Previous / Next person in the list the pickers and search leave (also used by the foot buttons on the Progress sub-tab).
  App.personStep = d => { const k = list(), i = k.findIndex(p => idOf(p) === ui.id); if (k[i + d]) { ui.id = idOf(k[i + d]); ui.subPickedFor = ''; render(); } };
  $('btnPePrev').addEventListener('click', () => App.personStep(-1)); $('btnPeNext').addEventListener('click', () => App.personStep(1));

  // Leaving the Date received box with a half-typed year (0020-09-23): check it now, say so, and put the saved date back.
  $('personWrap').addEventListener('focusout', e => {
    const t = e.target, p = person(); if (!p || !App.season || !t.matches || !t.matches('.hbbox [data-hb="date"]') || !/^0\d{3}-/.test(t.value || '')) return;
    App.saveHandbook(t.closest('.hbbox'), idOf(p), true);
  });
  $('personWrap').addEventListener('change', e => {
    const t = e.target, p = person(), season = App.season; if (!p) return;
    if (t.dataset.pc !== undefined) {
      const chk = Check.field(t.dataset.pc, t.value.trim(), App.today(), Model.isClubber(p));
      if (chk && chk.level === 'error') { t.value = Model.eff(p, t.dataset.pc); App.flash(t.dataset.pc + ': ' + chk.msg, 'error'); return; }       // impossible: refused, the old value stays
      if (chk) App.flash(t.dataset.pc + ': ' + chk.msg + ' (saved as typed; it is on the To do list)', 'warn');
      Model.setField(p, t.dataset.pc, t.value);
      const slot = $('personWrap').querySelector('[data-slot="' + CSS.escape(t.dataset.pc) + '"]'); if (slot) slot.innerHTML = pcMark(p, t.dataset.pc);
      changed(t.dataset.pc === C.ROOM || t.dataset.pc === C.SELECTION);
    } else if (t.dataset.flag) {
      if (t.dataset.flag === X.ACTIVE) Model.setActive(p, t.checked); else p[t.dataset.flag] = t.checked ? '1' : ''; changed(true);
    } else if (t.dataset.team) {
      if (App.checkTeamPick) App.checkTeamPick(p, t.dataset.team, t.value);      // a repeat or uneven teams is said, never blocked (Fable review A8)
      Model.setTeamChoice(App.master, p, t.dataset.team, t.value); changed(true);
    } else if (t.dataset.u) {
      if (App.dateHeld(t) || !App.uniDateOk(t)) return;      // a date being typed over, or a year still being typed: saved when the box is left
      p[t.dataset.u] = t.value; changed(false); if (t.dataset.udate && t.type === 'text' && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) render();      // a typed-over legacy value is a date now: show the picker
    } else if (t.dataset.hb) {
      App.saveHandbook(t.closest('.hbbox'), idOf(p)); stale = true; if (ui.attn) applyAttention(p);
    } else if (t.dataset.mark) {
      Season.setMark(season, t.dataset.date, idOf(p), t.dataset.mark, t.checked ? 1 : 0, Model.isClubber(p) ? Model.groupOf(Model.room(p)) : ''); changed(true);
    } else if (t.dataset.nightteam) {
      try { Season.setNightTeam(season, t.dataset.date, idOf(p), t.value); } catch (err) { App.ask.alert(err.message); }
      changed(true);
    }
  });
  $('personWrap').addEventListener('click', e => {
    const p = person(), season = App.season, t = e.target; if (!p) return;
    if (t.closest('[data-linkpc]')) { App.linkGuest(idOf(p)); return; }
    if (t.closest('[data-backtodo]')) { App.showTab('todo'); return; }
    if (t.closest('[data-clearattn]')) { ui.attn = ''; render(); return; }
    const useBtn = t.closest('button[data-usephone]'); if (useBtn) { const v = useBtn.dataset.usephone; if (v && !Model.hasPhoneDigits(v)) return; p[Model.X.EMERG_PHONE] = v; changed(true); return; }      // a non-empty value must be a real number; Clear (empty) still works
    if (t.closest('button[data-usetyped]')) { const box = document.getElementById('emergPhoneTyped'), v = box ? box.value.trim() : ''; if ((v.match(/\d/g) || []).length < 7) { if (box) box.focus(); return; } p[Model.X.EMERG_PHONE] = v; changed(true); return; }
    const a = t.closest('a[data-reset],a[data-rmaward],a[data-addaward],a[data-rmmove]');
    if (a) {
      e.preventDefault();
      if (a.dataset.reset) { delete p['ov:' + a.dataset.reset]; changed(true); }
      else if (a.dataset.rmmove) { Season.removeTeamMove(season, idOf(p), a.dataset.q, a.dataset.rmmove); changed(true); }
      else if (a.dataset.rmaward) { Season.removeAward(season, a.dataset.date, idOf(p), a.dataset.rmaward); changed(true); }
      else { Season.addAward(season, a.dataset.date, idOf(p), a.dataset.addaward); changed(true); }
      return;
    }
    if (t.closest('[data-all]')) { App.openEdit(p); return; }
    if (t.closest('[data-goprog]')) { App.goProgress(idOf(p)); return; }
    const hold = t.closest('input[data-pehold]');
    if (hold) { Season.setHold(season, idOf(p), hold.dataset.pehold, hold.checked); changed(true); return; }      // Hold: the same flag as on the Awards tab and the Progress sheet
    const ann = t.closest('[data-peann],[data-peannall],[data-peannpage],[data-peslide]');
    if (ann) {      // the Awards tab: announce on the chosen night, or open the Announce page / the slide for it
      const night = $('peAwNight') ? $('peAwNight').value : '', g = Model.groupOf(Model.room(p));
      if (ann.dataset.peann !== undefined) Season.announce(season, night, [[idOf(p), ann.dataset.peann]]);
      else if (ann.dataset.peannall) Season.announce(season, night, Season.pendingAwards(season, idOf(p), g, App.calendar).map(r => [idOf(p), r.award]));      // held awards are skipped by announce
      else { if (stale) { stale = false; App.refresh(); } App.awardsFor(idOf(p), night, !!ann.dataset.peslide); return; }
      changed(true); return;
    }
    if (t.id === 'peMoveAdd') { const to = $('peMoveTeam').value, from = $('peMoveFrom').value; if (to && from) { try { Season.setTeamMove(season, idOf(p), App.quarterOf(from), from, to, App.calendar); } catch (err) { App.flash(err.message, 'error'); return; } changed(true); } return; }  });

  // Edits made here are written straight to the roster; the Roster, Reports and other tabs redraw when you leave.
  document.querySelector('.tabs').addEventListener('click', e => { if (!e.target.closest('[data-tab="person"]')) ui.back = ''; if (stale) { stale = false; App.refresh(); } }, true);
  // The place is the child and the sub-tab (S13): a live update or a Recent places jump returns to the same child on the same sub-tab.
  App.places.person = { get: () => ui.id && person() ? { key: ui.id, label: 'Person \u00b7 ' + Model.fullName(person()), state: { id: ui.id, sub: ui.sub } } : null,
    set: s => { ui.role = 'all'; ui.group = 'All'; ui.cls = 'All'; ui.q = ''; ui.id = s.id; ui.subPickedFor = ''; ui.attn = ''; ui.back = ''; if (s.sub) ui.sub = s.sub; } };      // for the Recent places list (app-trail.js) and the live-update handoff (app-update.js)
  $('personWrap').addEventListener('click', e => { const u = e.target.closest('button[data-utoday]'), pp = person(); if (u && pp) { pp[u.dataset.utoday] = App.today(); changed(false); render(); } });
  // Volunteer absences on the Attendance sub-tab (S11): clear one night, the whole absence, or the remaining nights; add a new one.
  $('personWrap').addEventListener('click', e => {
    const pp = person(); if (!pp) return; const pid = idOf(pp);
    const one = e.target.closest('button[data-absnight]'), all = e.target.closest('button[data-absall]'), rem = e.target.closest('button[data-absrem]'), add = e.target.closest('button[data-absadd]');
    if (one) { const [aid, date] = one.dataset.absnight.split('|'); App.clearAbsenceNights(pid, aid, [date]); render(); return; }
    if (all) { App.clearAbsence(pid, all.dataset.absall); render(); return; }
    if (rem) { const aid = rem.dataset.absrem, today = App.today(), mine = App.absenceList().filter(r => r.personId === pid && r.absId === aid && r.date >= today).map(r => r.date); App.clearAbsenceNights(pid, aid, mine); render(); return; }
    if (add) { const from = (document.getElementById('pAbsFrom') || {}).value || '', to = (document.getElementById('pAbsTo') || {}).value || from, reason = (document.getElementById('pAbsReason') || {}).value || '';
      try { const n = App.absenceNightsBetween(from, to).length; App.addAbsence(pid, from, to, reason); App.flash(n + ' club night' + (n === 1 ? '' : 's') + ' recorded.', 'info'); } catch (err) { App.flash(err.message, 'error'); }
      render(); }
  });
  $('personWrap').addEventListener('focusout', e => { const t = e.target, pp = person(); if (pp && t.dataset && t.dataset.udate && !App.uniDateOk(t)) t.value = pp[t.dataset.u] || ''; });
  $('personWrap').addEventListener('change', e => { const t = e.target; if (t.id === 'peAwNight') { ui.awNight = t.value; render(); } });
  App.tabs.person = render;
  App.onRefresh.push(() => { if (!$('tab-person').hidden) render(); });
  // opts.attention: arrived from a To do item, so highlight what still needs doing for this person.
  // opts.sub: which sub-tab opens. Progress is the default; a To do item (opts.attention) opens Registration, where its field highlights are.
  App.showPerson = (id, opts) => { ui.back = opts && opts.back || ''; ui.role = 'all'; ui.group = 'All'; ui.cls = 'All'; ui.q = ''; ui.id = id; ui.subPickedFor = ''; ui.sub = opts && opts.sub || (opts && opts.attention ? 'registration' : 'progress'); ui.attn = opts && opts.attention ? id : ''; ui.attnScroll = !!ui.attn; App.showTab('person'); };
  App.personSub = () => { const p = ui.id && person(); return p ? shownSub(p) : ui.sub; };
  App.progressShowing = () => !!ui.id && App.personSub() === 'progress' && !$('tab-person').hidden;      // read by the view rules (app.js viewOf): Progress is live, the other sub-tabs are drafts
})();
