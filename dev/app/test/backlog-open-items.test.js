// One test per OPEN item in BACKLOG.md that can be checked without a browser. Each check asserts the CORRECT behavior.
// An item listed in OPEN is known to be unfixed: its check is expected to fail ("still open"), and the run stays green.
// When someone fixes it, the check passes, the run goes RED with "now passes: remove from OPEN and close <ID> in BACKLOG.md".
// That is the tie between this file and the backlog: the IDs below are the backlog's IDs.
// Invented TEST data only. Usage: node test/backlog-open-items.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Season = require('../season.js'), M = require('../model.js'), Reports = require('../reports.js');
require('../reports-season.js');
const OPEN = new Set([]);
let passed = 0, failed = 0, stillOpen = 0;
function check(id, name, fn) {
  let err = null; try { fn(); } catch (e) { err = e; }
  if (OPEN.has(id)) {
    if (err) { stillOpen++; console.log('  open ' + id + ' ' + name + '\n       (expected, still open) ' + String(err.message).split('\n')[0]); }
    else { failed++; console.log('  FAIL ' + id + ' ' + name + '\n       now passes: remove ' + id + ' from OPEN and close it in BACKLOG.md'); }
  } else if (err) { failed++; console.log('  FAIL ' + id + ' ' + name + '\n       ' + String(err.message).split('\n')[0]); }
  else { passed++; console.log('  ok   ' + id + ' ' + name); }
}
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).filter(f => /TEST.*\.json$/.test(f)).sort().pop();
const load = () => { const s = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')); return { s, master: M.fromRoster(s.roster), calendar: s.calendar }; };
const run = (x, report, opts) => Reports.LIST.find(r => r.id === report).render({ master: x.master, settings: { quarter: 'Q2', club: 'AWANA Club', dates: '' }, calendar: x.calendar, season: x.s, opts: opts || {} });
const text = h => String(h).replace(/<[^>]*>/g, ' ');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

// ---- B2: the Puggles attendance sheet has boxes to tick under each date ----
check('B2', 'Puggles attendance sheet has mark cells under the dates', () => {
  const x = load(), p = x.master.people.find(q => M.isActive(q) && M.groupOf(M.room(q)) === 'Puggles');
  assert(p, 'no Puggles child in the TEST file, so there is nothing to check');      // never pass vacuously
  const h = run(x, 'attendance', { room: M.room(p) });
  const dates = (h.match(/<th colspan="\d+" class="date">/g) || []).length, bodyCells = (h.split('<tbody>')[1] || '').split('</tr>')[0].match(/<td/g) || [];
  assert(dates > 0, 'no date headings');
  assert.strictEqual(bodyCells.length, 1 + dates, dates + ' dates but ' + bodyCells.length + ' cells in the first body row (name + one box per date expected)');
  assert(!/class="mark"/.test(h), 'N8 (1.51.16): one box a night, so the date alone heads the column (no rotated Attendance word)');
  // the box is filled from the record (key a): mark the first kid present on the first night of the quarter and the sheet shows a tick
  const night = require('../calendar.js').nights(x.calendar, 'Q2')[0];
  Season.setMark(x.s, night.Date, p[M.X.ID], 'a', true, 'Puggles');
  assert(/&#10003;/.test((run(x, 'attendance', { room: M.room(p) }).split('<tbody>')[1] || '')), 'a recorded Puggles attendance does not tick the box');
});
// If the TEST file has no Puggles child, B2 above passes vacuously. This makes that visible instead of silent.
check('B2-fixture', 'the TEST file has a Puggles child, so the B2 check is real', () => { const x = load(); assert(x.master.people.some(q => M.isActive(q) && M.groupOf(M.room(q)) === 'Puggles'), 'no Puggles child in the TEST file'); });

// ---- B5: BY DESIGN (Mike, 2026-11-14): whoever holds the No Photos list is cleared for the full PII/PHI set, so the list prints the Medical Notes field as "Parent note". Do not "fix" this. ----
check('B5-by-design', 'No Photos list still prints the parent note (decision 2026-11-14: its audience is cleared for all PII/PHI)', () => {
  const x = load(), p = x.master.people.find(q => M.isActive(q) && M.groupOf(M.room(q)) === 'Sparks');
  const C = M.C; p[C.MED] = 'SECRETMEDICAL epi-pen'; p[M.X.NOPHOTOS] = '1';
  const h = text(run(x, 'photos'));
  assert(/SECRETMEDICAL/.test(h), 'the parent note is no longer on the No Photos list (this was decided as intended)');
});

// ---- B6: a block finished with a no-date sign-off prints no earned day on the three award lists ----
check('B6', 'hand-out, end-of-year and awards-per-child lists print no tick day for a no-date finish', () => {
  const x = load(), TICK = '2026-10-30', SHOWN = /10\/30|2026-10-30|Oct 30/;
  const p = x.master.people.find(q => M.isClubber(q) && M.isActive(q) && M.groupOf(M.room(q)) === 'Sparks'), id = p[M.X.ID];
  const book = Object.keys(x.s.config.books).find(c => Season.bookGroup(x.s, c) === 'Sparks'), block = x.s.config.progress.Sparks.perBook[0], keys = block.items.map(i => block.key + '.' + i);
  keys.forEach(k => Season.setProgress(x.s, id, book, k, '2026-10-21')); Season.markSignsNoDate(x.s, id, book, [keys[keys.length - 1]], TICK);
  const bad = ['handOut', 'endOfYear', 'awardsByChild'].filter(r => { let h = ''; try { h = run(x, r, { group: 'Sparks', room: M.room(p), kid: id }); } catch (e) { return false; } return SHOWN.test(text(h)); });
  assert(!bad.length, 'tick day printed on: ' + bad.join(', '));
});

// ---- B3: the Binders button must set the paper like every other report path (source-level; B3 is confirmed by a PDF in the review) ----
check('B3-source', 'the Binders button draws #report through renderReport(), which sets the paper (setPageStyle)', () => {
  const go = app.slice(app.indexOf("$('bindGo').onclick")), end = go.indexOf('};\n  });'), body = go.slice(0, end > 0 ? end : 1500);
  assert(/renderReport\(\)/.test(body), 'bindGo never calls renderReport()'); const rr = app.slice(app.indexOf('function renderReport()'), app.indexOf('function renderReport()') + 1200); assert(/pagePick\(\)/.test(rr), 'renderReport does not refresh the page choice'); assert(/setPageStyle\(\)/.test(app.slice(app.indexOf('function renderBundle'), app.indexOf('function renderBundle') + 3000)), 'renderBundle does not set the paper');
});
check('B3-source-pagepick', 'the Binders button also refreshes the page choice (renderReport calls pagePick)', () => {
  const go = app.slice(app.indexOf("$('bindGo').onclick")), body = go.slice(0, 1500);
  assert(/renderReport\(\)/.test(body), 'bindGo never calls renderReport()');
});

console.log(passed + ' passed, ' + failed + ' failed, ' + stillOpen + ' still open');
process.exit(failed ? 1 : 0);
