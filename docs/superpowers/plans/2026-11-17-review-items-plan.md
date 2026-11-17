# Plan: the open review items (CR-08 to CR-14, UX-05 to UX-30)

Written 2026-11-16/17 (plan only; nothing built). Source: `REVIEW-LOG.md` (Mike's blanket decision of 2026-11-17), `BACKLOG.md`, `README.md`, `CHANGELOG.md` 1.51.13 (live), `docs/DATA-FORMAT.md` 4.2. Every file:line below was checked against `dev/app` as it stands after 1.51.13 (paths are relative to `dev/app/` unless they start with `dev/`, `docs/` or a top-level file name).

Status: COMPLETE (plan only, 2026-11-17). Every item is drafted or verified; see Progress.

## Progress

| Item | State |
|---|---|
| Standing rules | drafted |
| UX-20 shared dialog helper (design) | verified (against code) |
| CR-08 | verified |
| CR-09 | verified |
| CR-10 | verified (review's app-season.js:1224 is not a copy) |
| CR-11 | verified (one extra site found) |
| CR-12 | verified |
| CR-13 | verified (claim out of date: already fixed) |
| CR-14 | verified |
| UX-05 | verified |
| UX-06 | verified |
| UX-07 | verified |
| UX-08 (conditional) | drafted (option and its test only) |
| UX-09 | verified |
| UX-10 | drafted (markup checked; widths not measured in a browser) |
| UX-11 | verified |
| UX-12 | verified |
| UX-13 | verified |
| UX-14 | verified |
| UX-15 | verified |
| UX-16 | verified |
| UX-17 | verified |
| UX-18 | verified |
| UX-19 | verified |
| UX-20 call-site inventory | verified (98 sites counted by grep) |
| UX-21 | verified |
| UX-22 | verified |
| UX-23 | verified |
| UX-24 | verified |
| UX-25 | verified |
| UX-27 | verified (a, b, d); (c) needs a browser |
| UX-28 | verified |
| UX-29 | verified |
| UX-30 | verified |
| Build order | drafted |
| Open decisions, unverified, summary | drafted |

## 0. Standing rules for every batch
- **Where.** Edit only in `dev/app/` (and `dev/tools/`, docs). Never edit `deploy/` by hand; `sh make-deploy.sh` rebuilds it and refuses a changed script whose version line was not bumped (README "Changing and deploying" 1, 3).
- **Versions.** Bump the version line (line 1) of every `.js` file changed, and `app-version`/`app-build` in `dev/app/index.html`. Stay in the 1.51.x series, third number only (CHANGELOG header). Never change `Season.VERSION` (6) for these items: none of them changes the data format in a way an older reader would lose (DATA-FORMAT 4.2 rule; a new top-level section left out while empty needs no bump, and new `config` keys are kept by older copies, DATA-FORMAT 2.5). The only new stored values in this plan are `config.startTab` (UX-05) and possibly per-tab ui state (not stored). Each gets a DATA-FORMAT section 6 row and a CHANGELOG mention.
- **Tests.** `NODE_PATH=<dir with playwright> sh dev/tools/run-tests.sh` (all), or with a name filter. Known baseline: `club-title` and `phone-attendance` need the extra package; `anonymized-data`, `browser`, `reports-season` skip without real files (BACKLOG State, Sweep). Every new browser test runs at 390x844 and 1280x900 at least; layout items add 430x932 and 600x960. Tests use only `dev/test-data` files chosen by name (TEST), never the real data folder or `~/Downloads` (`test-data-only-test-files.test.js` pins it). Never write a real child's name, phone or address into a test.
- **Docs per batch (the push rule, BACKLOG "Decided not to build", updated 2026-11-16).** CHANGELOG entry under the next 1.51.x; How it works text in `dev/app/index.html` (and `info.js` notes, then `node dev/tools/sync-guide.js` for the Options guide); the README test list (one line per new test file; `docs-in-step` fails on a test file the README does not name); DATA-FORMAT when data changes (`data-format-doc.test.js`); REVIEW-LOG Status column ("Fixed in 1.51.x" with the test); BACKLOG State block and an entry in the Done log.
- **Before any commit or push (Mike runs it):** `node dev/tools/check-docs-for-names.js <real-data.json>` with the real data file kept OUTSIDE the repository; it prints file:line and counts only. Never commit real names or phone numbers.
- **Deploy only when Mike asks:** `sh make-deploy.sh`, commit `deploy/` with the code on branch `public`, push `public` to `origin main`. The public repo is ONE commit (reset 2026-11-16); a normal later push simply adds commits on top of it. Never push local `main` (see CR-14) or `public-old-do-not-push`.
- **No commit, push or deploy is part of building a batch.** Each batch ends at "tests green, docs updated, ready for Mike".

## 1. Code review items
### CR-08 One To do entry for a missing emergency phone (option A)
1. **Verified.** The review is right on all three points.
   - `todo.js:70` (Details missing) adds "emergency phone" when `!parentPhone(p) && !M.emergencyPhone(p) && !M.clubPhone(p)`; `todo.js:79` (group `nophone`, level `action`) tests `!parentPhone(p) && !emergPhone(p) && !M.clubPhone(p)`. Same child, two entries (one `check`, one `action`), so the To do total counts the child twice.
   - `todo.js:77` `emergPhone` is a character-for-character copy of `Model.emergencyPhone` (`model.js:138-141`). It agrees today; it can drift.
   - `todo.js:63` `noName = []` is never read (dead since S12).
   - Stale manual text found while checking: `index.html:461` still describes the "note †" for a child with no emergency contact name, which S12 removed (`todo.js` header comment `:6` says the same). Fix both here.
2. **Change** (`todo.js` only):
   - Delete the emergency line at `:69-70` from the Details missing block (keep birthdate, grade, "any phone number or email").
   - Delete `emergPhone` (`:77`); the `nophone` filter at `:79` becomes `kids.filter(p => !M.parentPhone(p) && !M.emergencyPhone(p) && !M.clubPhone(p))`.
   - Delete `noName` and the local `parentPhone` alias (`:63`), using `M.parentPhone` directly.
   - Reword the `nophone` hint (`:78`) so it says how it clears: "It stays on To do until Planning Center has a parent's phone or an emergency number (next import), or until you choose a number on the Person tab (Emergency phone card)." Keep level `action` (counted in the total and the badge).
   - Update the header comment `:6` (no "note" level is produced by `compute` any more; keep `level 'note'` support in `app-todo.js` because the code there is generic).
3. **Data and version.** No data format change. Bump `todo.js` 1.11.5 to 1.11.6; `index.html` `app-version`/`app-build` (manual text changes).
4. **Tests.** `test/todo-emergency-note.test.js`: change tests 1, 3 and 4 (`:17-30`) to assert the child is in `nophone` and that Details missing for that child either does not exist or does not mention "emergency"; add "a child missing both a birthdate and an emergency phone has one Details missing item (birthdate) and one nophone item"; add "the total counts that child's missing phone once" (compare `res.total` before and after clearing the phone: +1, not +2). Node only, no widths. `test/todo-emergency-note-browser.test.js` (1100 wide today): add a case that the Details missing card text never contains "emergency phone", and run the badge-equals-header check at 390 too.
5. **Docs.** CHANGELOG ("To do lists a missing emergency phone once, as an action"); `index.html:461` rewrite (drop the note † sentence, say the missing phone is one orange item that clears as above); README test list line for `todo-emergency-note` (wording); REVIEW-LOG CR-08 status "Fixed in 1.51.x"; BACKLOG State.
6. **Risks.** A leader who used to see the phone under Details missing now finds it only in its own group; the person view (`app-todo.js` "Group by: person") shows both groups' items per child, so nothing disappears there. `Check.scan` (`check.js`) has its own short-phone check (Values that look wrong); unaffected.
7. **Effort:** S.
### CR-09 Held nights: the child test goes with the data, not a global
1. **Verified, with line numbers moved.**
   - The global is at `season.js:562-563` (`let childTest = () => true; setChildTest(fn)`), used by `heldNights` at `:564-567`. The only production caller of `setChildTest` is `app-season.js:1223`, which builds the test from `App.master` and treats an id that is not on the roster as a child (`!p || Model.isClubber(p)`).
   - So any code that runs without the Attendance app (every node test and tool, and `app-season.js` not yet loaded) gets "any mark counts", and a volunteer-only night counts as held there. Confirmed: no `dev/tools/*.js` script calls `heldNights` directly (grep), so in practice the exposure is the node tests and anything that requires `stats.js`, `store.js`, `pace.js` or `reports-season.js` in node.
   - Old-year imports: `addEarlierYear` (`season.js:500-511`) runs `turnoutCounts(o, ...)` (`:503`) on the OLD file, but the child test still looks the id up in the CURRENT `App.master`; a volunteer of that old year who is no longer on this year's roster is "not on the roster", so counts as a child. The review's claim is right.
   - Callers of `heldNights` (all must agree after the change): `store.js:46`; `pace.js:84`, `:99`; `stats.js:47`, `:116`; `reports-season.js:208` (Dates attended); inside `season.js`: `turnoutCounts` `:478` (used by `teamplan.js:106`, `newSeason` `:517`, `addEarlierYear` `:503`), `blueJewels` `:581` (so `blueWingPlan`, `sparkJewels`, `heldGems` and the award suggestions), `volunteerExpected` `:971` (Person page, `app-person.js:49`).
   - "Attendance Summary": that report no longer exists (`reports.js:241-242`, `REPORT_GONE`); `stats.js:6-8` and `index.html:551` still name it. The "must agree" set is therefore Statistics, store points, Pace, Dates attended (the printed per-child attendance), Blue Jewels, color-team turnout and a volunteer's expected nights. The two stale mentions are reworded in this batch.
   - `season.roster` is refreshed from `App.master` on every edit (`syncData`, `app-season.js:20-24`, called by `touchSeason` `:107`, `:113`), so the file's own roster is a correct source for the child test inside the app as well.
2. **Change.**
   - `model.js`: add `Model.childTestOf(roster)`: returns `id => boolean`, built lazily from `roster.people[id]` as `Object.assign({}, e.pc, e.v)` then `isClubber` (so pending `ov:` room and selection changes count, the same as `eff`). An id with no roster entry: see decision D1 (recommended: still a child, the current rule). Cache the result in a `WeakMap` keyed by the roster object; `syncData` replaces `season.roster` with a new object on every edit, so the cache invalidates itself.
   - `season.js`: take Model the way it takes Catalog (`root.Model || (typeof require !== 'undefined' ? require('./model.js') : null)`; `model.js` loads before `season.js` in `index.html:750-755` and does not require `season.js`, so there is no cycle). `heldNights(s, calRows, isChild)`: `isChild` defaults to `Model.childTestOf(s.roster)`. Delete `childTest` and `setChildTest` (`:562-563`) and remove `setChildTest` from `api` (`:1441`). Update the comment at `:559-561`.
   - Thread the optional `isChild` through `turnoutCounts(s, calRows, today, isChild)` and `volunteerExpected` only for tests; every production caller uses the default, so they all agree by construction. `addEarlierYear` then judges the old file by the old file's roster (`o.roster`), which fixes the old-year bug.
   - `app-season.js:1222-1223`: delete the `setChildTest` call and its comment.
   - Reword `stats.js:5-8` and `index.html:551` ("as the store adds them up", not the retired Attendance Summary report).
3. **Data and version.** No data format change. Bumps: `model.js` (1.10.x), `season.js` 1.66.0 to 1.66.1, `app-season.js`, `stats.js` (comment-only edits do not change the minified file, README "Changing and deploying" 3, but bump anyway since `season.js` behaviour changes), `index.html` app-version/app-build.
4. **Tests.**
   - New `test/held-nights-agree.test.js` (node): from the TEST data file, add a calendar club night on which only one volunteer (a real volunteer on the TEST roster, chosen by `Model.isVolunteer`) is marked present. Assert, with no setup call: `Season.heldNights` leaves it out; `Stats.compute` nights count and `Store.compute` held count and `Pace.rows` per-child `nights` are unchanged from the file without that mark; Dates attended (`reports-season.js` `datesAttended` or its exported name) does not list it; `Season.turnoutCounts` gives the same counts; `Season.volunteerExpected(...).held` equals `heldNights(...).length`; then add a child mark on that night and assert every one of them moves by exactly one night.
   - Old-year case: an old file whose roster has volunteer X, the current roster has no X; a night with only X marked is not held in `addEarlierYear`'s counts (`notOnRoster` unchanged).
   - A pending `ov:` room change to Volunteers makes that person's marks stop counting.
   - `test/absences.test.js:49-55`, `:83-93`: replace `setChildTest` with a roster entry for `70002_Vol` as a volunteer (or the explicit third argument); the expected values stay.
   - A guard: `assert(!('setChildTest' in Season))`.
   - Browser: extend `stats-nights-browser.test.js` (or add a case to `absences-browser`) to mark a volunteer present on an otherwise empty club night in the app at 1280 and check Statistics' "nights counted" did not change; run at 390 too (same numbers, layout untouched).
   - Rerun `stats`, `stats-nights`, `store`, `pace`, `held`, `season`, `absences`, `print-b9-items` (Dates attended), `teamplan-warnings`, `teams-gaps` (turnout).
5. **Docs.** CHANGELOG (fix: "a volunteer-only night is no longer counted as held anywhere, including old-year imports"); README Tests list (new file); README conventions note on held nights if it mentions the app setting the test; DATA-FORMAT section 8 or 9.1 only if it describes `setChildTest` (grep "child test" there); How it works `index.html:550-551`; REVIEW-LOG; BACKLOG.
6. **Risks.** The biggest risk is a silent number change on Statistics, Pace or store points for the real file. Before shipping, Mike runs the new agree-check (or `check-file.js` count-only) on the real file outside the repo and compares Statistics before and after; a difference means the real file has volunteer-only nights the app was already excluding in the browser, so numbers in the browser should NOT move (the browser already used a roster test); only node output moves. Performance: `blueWingPlan` calls `heldNights` per child; the WeakMap cache keeps the roster test to one build per edit.
7. **Effort:** M (own batch).

### CR-10 One "club night" rule
1. **Verified.** `calendar.js:20` `isNight`; `season.js:542` `counted` repeats the test inline (`r.Type !== 'Event' && r['No Club'] !== '1'`); `validate.js:230` repeats it again for absences. `app-season.js:1224` already uses `Calendar.isNight` (the review listed it as a copy; it is not). `reports.js:192-194` filters Events and handles No Club rows on purpose (the calendar printout lists No Club nights), so it is not a copy and stays.
2. **Change.** `season.js:542`: `counted = rows => { const m = {}; rows.filter(Calendar.isNight).forEach(r => { m[r.Date] = r.Quarter; }); return m; }`, with Calendar taken like Catalog (`root.Calendar || require('./calendar.js')`; `calendar.js` loads before `season.js`, `index.html:751`). `validate.js:230`: `.filter(r => r && Calendar.isNight(r))` (Calendar is already required at `validate.js:7`). Keep `isObj` guards where rows can be junk (validate reads untrusted files).
3. **Data and version.** None to the format. Bump `season.js`, `validate.js`, `index.html`.
4. **Tests.** Add to `test/season.test.js` (or a new `club-night-rule.test.js`): for rows Event, No Club '1', Club night, and a row with Type missing, `Object.keys(Season.counted(rows))`, `Calendar.nights(rows)` and the validator's club set give the same dates. A source guard: grep `season.js` and `validate.js` for `'No Club'] !== '1'` and fail if found. Node only.
5. **Docs.** CHANGELOG (internal, one line); REVIEW-LOG; BACKLOG. No manual change.
6. **Risks.** None beyond load order (pinned by `versions.test.js`). Do it before CR-09 so CR-09's `heldNights` uses the one rule.
7. **Effort:** S.
### CR-11 Absence buttons: separate data attributes
1. **Verified, and one more site than the review listed.** Packing with `|`: `app-season.js:335` (`data-absnight` = `personId|absId|date`, and the `data-absall`/`data-absrem` buttons beside it), split at `app-season.js:402-404`; `app-todo.js:115` builds `personId|absId|date`, split at `app-todo.js:181`; `app-person.js:59` builds `absId|date`, split at `app-person.js:328`. A person id is `RegID_First_Last` (`model.js:187-192`), so a name with `|` in it breaks Clear (the split shifts every part). Absence ids are `a` + base 36 (`season.js:933`) and dates are ISO, so only the person id can carry a `|`. Related, not an absence: `app-todo.js:220` takes the person id from a To do row key (`group|id|text`, built at `:76`, `:131`) with `k.split('|')[1]`; the same name breaks Set book on that row. The key itself is stored in `config.todoIgnored`, so its format must NOT change; read the id from `tr.dataset.id` instead (already on the row, `:131`).
2. **Change.** Each Clear button carries `data-pid`, `data-aid` and `data-date` (escaped with `esc`), plus the action as `data-abs="night|all|rem"`. One shared reader, `App.absenceTarget(btn) -> { pid, aid, date }` (in `app-season.js` next to `App.clearAbsence`, `:1225-1229`), used by the three click handlers. On the Person page the pid stays the page's person. `app-todo.js:220`: `rows` returns the rows' `tr` elements (or a parallel list of `dataset.id`) and the id comes from `tr.dataset.id`.
3. **Data and version.** None. Bump `app-season.js`, `app-todo.js`, `app-person.js`, `index.html`.
4. **Tests.** `absences-browser.test.js`: a TEST volunteer is renamed in the page (`App.master`, before the absence is added) so the id contains `|` (`ID|x_A|B`), then each of Clear this night, Clear remaining nights and Clear whole absence on the Attendance tab (Volunteers), on the volunteer's Person page and on To do removes exactly the right nights. Widths 1280 and 390 (the buttons are the same; 390 checks they are still reachable in card layout). `book-todo-browser`: Set book on a row whose id has `|`.
5. **Docs.** CHANGELOG (fix line); REVIEW-LOG; BACKLOG. No manual change.
6. **Risks.** Low. Keep the old attribute names out of the DOM so no stale handler matches.
7. **Effort:** S.

### CR-12 Person page: "Present X of Y expected" against a table of calendar nights
1. **Verified.** The table (`app-person.js:45-53`, `secVolunteerNights`) lists `Season.volunteerNights` (`season.js:961-968`): every club night on the calendar up to today, plus every marked night and every planned night. The line above it uses `Season.volunteerExpected` (`season.js:970-975`), which counts **held** nights only (`heldNights`, children present). A past calendar night that was not held (not yet entered, or only volunteers marked) is a row but not in Y, so the rows and the sentence disagree. The review's line numbers (`season.js:936-957`) are stale; the behaviour is as described.
2. **Change** (display only; Mike's S11 rule for Y stays). In `volunteerNights` add `held: heldSet.has(date)` to each row (one `heldNights` call per page, not per row). In `secVolunteerNights`: rows that are not held get class `notheld` and the Qtr cell keeps the quarter while a small note "(not counted: not held)" follows the date; reword the line to "Present X of Y expected held club nights (N planned out). Nights not held are listed but not counted." Keep "(no longer a club night)" as is.
3. **Data and version.** None. Bump `season.js`, `app-person.js` and `index.html`; add `.notheld td { color: var(--mute) }` to `style.css` (no version line; the page build covers it).
4. **Tests.** `absences.test.js`: a calendar night with no child marks gives a row with `held: false` and is not in `volunteerExpected().held`; a held night gives `held: true`; the number of rows with `held: true` and a status other than `planned` (or `came`) equals `expected` minus the planned-out-not-present rows. `absences-browser`: on the volunteer's Person page (Attendance) the count of rows without `.notheld` equals Y in the line; at 1280 and 390.
5. **Docs.** How it works: the volunteer Person page paragraph (search `index.html` for "expected club nights"); CHANGELOG; REVIEW-LOG; BACKLOG.
6. **Depends on** CR-09 (the held rule must be the final one). **Risk:** none.
7. **Effort:** S.

### CR-13 Update now: the carried data file in sessionStorage
1. **Claim is out of date: already done in the code.** `restore()` reads the key and removes it in the same statement, before parsing (`app-update.js:65`: `raw = sessionStorage.getItem(HANDOFF); sessionStorage.removeItem(HANDOFF);`), and a file that cannot be put back is downloaded as `awana-session-recovered-….json` (`:77-80`). Both are pinned: `update-autosave-browser.test.js:49` (key gone after a good restore) and `:74-75` (key gone after a corrupt carry). What is left: the copy lives from `stash()` (`:46-52`) until `restore()` runs on the next page's `load` (`:109`). If the new page never runs `restore()` (a script error before `app-update.js` loads), the copy stays until the tab is closed (sessionStorage is per tab, so it never reaches another tab or the disk beyond the browser profile).
2. **Change (small hardening, optional):** in `restore()`, also drop a carried copy older than 10 minutes without opening it (`h.t`), after downloading it as the recovered file (so nothing is lost). Nothing else.
3. **Data and version.** None. Bump `app-update.js` if the hardening is built.
4. **Tests.** `update-autosave-browser`: a carried copy with `t` 11 minutes old is downloaded as recovered, not opened, and the key is gone. 1280 only (no layout).
5. **Docs.** REVIEW-LOG: "Already fixed before the review (app-update.js:65); hardening for a stale copy added in 1.51.x" or "closed, no change" if Mike declines the hardening (decision D2). CHANGELOG only if built.
6. **Risks.** None.
7. **Effort:** S.

### CR-14 Local `main` and the README `archive/` lines
1. **Verified.** `git branch -a`: `main` (172 commits, private history), `public` (tracks `origin/main`, the single public commit `a7a2844`), `public-old-do-not-push` (12 commits, the leaked history), `settings-in-file`, a worktree branch. `main` has no upstream and there is no `remote.origin.push` or `push.default` setting, so `git push origin main` pushes the private history to the public repo's `main`. README: `:23` describes an `archive/` folder (migration inputs and old Sheets exports) and `:79` names `archive/migration-inputs/`; there is no `archive/` folder in `database/` (checked), and `.gitignore:2` ignores `archive/` (pinned by `test/gitignore.test.js:13`). Memory note: never name a folder `archive/`.
2. **Change** (git config and docs only; Mike runs or approves each git command, nothing is pushed):
   - `git branch -m main private` (rename, nothing lost); `git config branch.private.pushRemote no-push` (a remote name that does not exist, so any push of it fails); same for `public-old-do-not-push`, then delete that branch once Mike confirms GitHub Support has purged the old commit (decision D3; deleting it locally does not affect GitHub).
   - Optional belt: a `pre-push` hook in `.git/hooks/` that refuses any ref other than `public` going to `origin` (local only, not tracked).
   - README `:23`: replace the `archive/` line with where the migration inputs and old Sheets exports are now (moved out of the repo with the real data, `docs/README.md` and S3; Mike to confirm the path, decision D4); README `:79`: drop the `archive/migration-inputs/` sentence or point to that place; README `:26` (Git): say "the private history is on local branch `private`, which cannot be pushed".
   - Keep `archive/` in `.gitignore` (a guard).
3. **Data and version.** None. No app files change, so no app version bump.
4. **Tests.** `test/gitignore.test.js` unchanged. A new node check is not useful (git config is local). Manual check: `git push --dry-run origin private` fails with "no-push does not appear to be a git repository".
5. **Docs.** README (above); BACKLOG State block (branch names); REVIEW-LOG.
6. **Risks.** Scripts or habits that `git checkout main`: grep `dev/tools/*.sh` and `make-deploy.sh` for `main` before renaming (the push to `origin main` comes from `public`, `branch.public.merge refs/heads/main`, which is unchanged).
7. **Effort:** S.

## 2. UX-20 and the shared dialog helper
### 2.0 What is there today (verified)
- `<dialog id="dlg"></dialog>` (`index.html:745`) is a bare native `<dialog>` that each caller fills with `innerHTML` and opens with `showModal()`: the Flag note box (`app-flagmode.js:48-68`), Edit person (`app.js:670-697`), Move (`app.js:710-719`), Link (`app.js:727-741`), the column chooser (`app.js:182-185`), Binders (`app.js:1287-1299`), Fix dates (`app-season.js:204-231`), the slide list (`app-season.js:609-652`), the team move and the Fill preview (`app-teamgrid.js:164-189`, `:214-230`). Styling: `style.css:57-58` (`dialog`, `::backdrop`), `:64` (`.dlgbtns`), phone `:349`, `:362`. Its accessible name comes from its `h3` (`app.js:553-554`). The merge screen makes its own `<dialog id="mergeDlg">` (`app-merge.js:12-16`).
- A second, older modal system for non-dialog panels (`#warn`, `#review`, `#conflicts`, `#lockAsk`, `#splash`): `app.js:329-345` makes every other body child `inert` and returns focus. It already skips `#dlg` (`:332`).
- Native calls: **98 call sites** (one per line; `grep -noE "\b(alert|confirm|prompt)\s*\(" dev/app/*.js dev/app/index.html | wc -l`): 55 `alert`, 33 `confirm`, 10 `prompt`. None in `index.html`. By file: `app-season.js` 46 (30 alert, 9 confirm, 7 prompt), `app.js` 26 (18, 5, 3), `app-options.js` 7 (2, 5, 0), `app-drive.js` 4 (4, 0, 0), `app-merge.js` 4 (2, 2, 0), `app-teamgrid.js` 3 (1, 2, 0), `app-todo.js` 3 (3, 0, 0), `app-tools.js` 2 (0, 2, 0), `app-person.js` 1, `app-store.js` 1, `app-update.js` 1 (all alert). The review's "97" is off by one.

### 2.1 The helper: `App.ask` (new file `app-ask.js`)
**Where.** A new script `app-ask.js`, loaded right after `app.js` (it needs `App.esc`), so every later script can use it. Add it to the load order in `versions.test.js` and in README "Changing and deploying" (the order list), and to `make-deploy.sh` if that lists files (it minifies every script, so probably not). A second, dedicated element `<dialog id="ask" class="askdlg"></dialog>` after `#dlg` in `index.html:745`, styled with the same `dialog` rules so it looks the same as the Flag note box. It is a separate element (not `#dlg` itself) because about six call sites ask while `#dlg` or the merge dialog is already open (`app.js:738` inside Link, `app.js:1296` inside Binders, `app-season.js:228` inside Fix dates, `app-merge.js:75` inside Merge, `app-teamgrid.js:30` after the move box): `showModal()` on a second dialog puts it on top of the first in the top layer, and closing it leaves the first open. Add `#ask` to the skip list at `app.js:332` so a modal panel never makes it inert.

**API** (every call returns a Promise; nothing blocks):
```
App.ask.alert(message, { title, ok = 'OK' })                      -> Promise<void>
App.ask.confirm(message, { title, ok = 'OK', cancel = 'Cancel', danger = false }) -> Promise<boolean>
App.ask.choose(message, { title, buttons: [{ id, label, primary?, danger? }], cancel = id }) -> Promise<id>   // e.g. Apply / Discard / Stay
App.ask.form({ title, message, fields: [{ name, label, type: 'text'|'date'|'number'|'select'|'textarea',
               value, options: [[value, label]], required, min, max, step, pattern, placeholder,
               validate: (v, all) => '' | 'message', hint }], ok = 'OK', cancel = 'Cancel' }) -> Promise<{ name: value } | null>
App.ask.typed(phrase, { title, message, step: 'i of 3' })        -> Promise<boolean>   // OK enabled only when the text matches exactly
App.done(message, { undo = true })                                  -> void              // "do, then offer Undo" (below)
```
- `message` is plain text (escaped; `\n` kept with `white-space: pre-line`, because many current messages use `\n\n`). A caller that needs a list passes `{ list: [...] }` and gets a scrolling `<ul>`.
- One dialog at a time: a call made while `#ask` is open waits in a FIFO queue.
- Sync callers keep working with a continuation: the pattern is `if (!ok) { App.ask.confirm(...).then(y => y && again()); return false; }`, so functions that return a boolean today (`resolveDraft` `app-season.js:68-74`, `lock`/`unlock` `app-teamgrid.js:23-31`) do not become async and their callers (`app.js:380` `showTab`, `app-trail.js:42`, `app-update.js:55`, `app-season.js:45`, `:258`, `:440`, `:1175`) are unchanged: they get `false` ("stay"), and the dialog's answer re-runs the original action. `resolveDraft(again)` takes the action to re-run.

**Do, then offer Undo** (`App.done`). For a confirm whose action Undo can reverse (it goes through `touchSeason`, `app-season.js:105-119`, so it is one Undo step): do it at once, then show the existing flash (`app.js:556-561`) extended with an **Undo** button that calls the same function as the top-bar Undo (`undoStep`, `app-season.js:134`). The flash stays 12 s when it has an Undo button, the button is 44px on a phone, and it is in a `role="status"` region (not `alert`), so it does not steal focus. If the top bar's Undo has moved on (another edit since), the flash's Undo button is removed (compare the undo stack length when the flash was shown).

**Keyboard and focus.**
- Opens with `showModal()`; the page behind is inert (native). Focus goes to: the first field for a form; the **Cancel** button for `danger` confirms (deletes, discards, restores); OK otherwise. The element focused before opening is remembered and focus returns to it on close if it is still in the page; otherwise to the tab's first heading (`#tab-<name> h2`, made focusable with `tabindex="-1"`).
- Esc = Cancel (resolves `false`/`null`/the `cancel` id; an alert resolves). Uses the `cancel` event with `preventDefault()` and its own close, like `app-merge.js:13`, so the result is always resolved exactly once.
- Enter submits a form (it is a `<form method="dialog">`) except inside a textarea; for a confirm, Enter presses the focused button (native).
- Tab cycles inside the dialog (native for modal dialogs).
- Validation: on OK, each field's `required`, `pattern`, `min`/`max` and `validate()` run; the first error is shown under its field (`aria-invalid="true"`, `aria-describedby` to the message), focus goes to it, and the dialog stays open.

**Phone layout (under 760px, the app's breakpoint).** Full width minus 8px (`width: calc(100vw - 16px)`), at the bottom of the screen (`margin: auto 8px 8px`), max height 90vh with the body scrolling and the button row sticky at the foot; buttons are full-width rows of 44px, primary on top, Cancel last; date fields use `<input type="date">` (native picker), number fields `inputmode="numeric"`; text 16px so iOS does not zoom. Nothing wider than the screen (no sideways scroll at 390).

**Accessibility.** `role="alertdialog"` for alert and confirm, plain `dialog` for forms; `aria-labelledby` the title (`h3`; a default title per kind: "Please note", "Are you sure?", the form's title) and `aria-describedby` the message. Danger buttons say what they do ("Delete book", "Discard 3 changes", "Restore"), never just OK. The Undo flash is `role="status"`.

**How tests drive it.**
- The helper announces every opening: `document.dispatchEvent(new CustomEvent('app-ask', { detail: { kind, title, message, fields, defaultValue } }))`, and marks the dialog `data-kind="alert|confirm|choose|form|typed"`.
- New shared test module `test/lib/app-dialogs.js`: `onAppDialog(page, handler)` installs (with `page.exposeBinding` and `page.addInitScript`) a listener that calls `handler(d)` with an object shaped like Playwright's `Dialog`: `d.type()` (`'alert'`, `'confirm'`, `'prompt'` for a one-field form, plus `'form'`, `'choose'`), `d.message()`, `d.defaultValue()`, `d.accept(value?)`, `d.dismiss()`, and `d.fill(name, value)`, `d.press(buttonId)` for the new kinds. `accept` and `dismiss` work through the real DOM (fill the field, click the button), so the test exercises the same path as a person. This makes the migration mechanical: `page.on('dialog', fn)` becomes `onAppDialog(page, fn)` with `fn` unchanged.
- Native-dialog tripwire: while UX-20 is being built, `onAppDialog` also forwards native dialogs (`page.on('dialog')`) to the same handler, so tests pass during the migration. When the `no-native-dialogs` count reaches zero (last step), the forwarding is replaced by a tripwire: `page.on('dialog', d => { nativeSeen.push(d.message()); d.dismiss(); })`, and the helper's `done()` asserts `nativeSeen` is empty. Both live in one `openApp(page)` helper in `test/lib/app-dialogs.js`.
- `browser.test.js:112` replaces `window.prompt` with a function for the Restore phrase: change it to `onAppDialog` answering the `typed` dialogs.
- A node guard, `test/no-native-dialogs.test.js`: counts `alert(`, `confirm(` and `prompt(` per file in `dev/app/*.js`; while UX-20 is being built it carries an `OPEN` map of the counts still allowed per file (the `backlog-open-items` pattern), shrinking each step, and it ends at zero with the map deleted.
- New `test/app-ask-browser.test.js`: alert, confirm (OK, Cancel, Esc), danger focus on Cancel, form with a date field (valid and invalid), number field min/max, select, typed phrase (OK disabled until it matches), queueing two calls, nesting over an open `#dlg` (the first stays open, focus returns into it), focus return to the opener, the Undo flash (Undo reverts the change; button disappears after another edit), no horizontal scroll and 44px buttons at 390, 430 and 600, and a layout check at 1280; axe-style checks as in `a11y-browser.test.js` (name, role, `aria-describedby`).
### 2.2 Call-site inventory (98), by build step
Key: **A** = `App.ask.alert`; **C** = stays a confirmation, in `App.ask.confirm` (cannot be undone); **U** = do it, then `App.done(..., { undo: true })` (Undo reverses it); **F** = a form (`App.ask.form`), with the field named; **Ch** = `App.ask.choose`. "In #dlg" = asked while another dialog is open (nesting).

**Step 1: club-night tabs (34 sites).**
| File:line | Now | Becomes |
|---|---|---|
| `app-season.js:433` | confirm "Clear every mark for room on date?" | **U** "Cleared N marks for Sparks A on 11/18. Undo" |
| `app-season.js:487` | alert(err) on a game result | A |
| `app-season.js:592`, `:594`, `:598` | alert(err) on Awards Given today / no date / Ignore | A (3) |
| `app-season.js:681` | alert(err) on a handbook code | A |
| `app-season.js:942`, `:943` | prompt "Day the Blue Jewel was earned (YYYY-MM-DD)", prompt "Why it is granted by hand" | **F** one form: Day (`date`, default today, required, must be a real date in this club year), Reason (`text`, optional, maxlength 200) |
| `app-season.js:946` | confirm "Drop this Blue Jewel?" | **U** |
| `app-season.js:950` | alert(err) | A |
| `app-season.js:979`, `:980`, `:983`, `:988`, `:1003`, `:1030`, `:1039`, `:1049`, `:1063`, `:1065`, `:1067`, `:1069`, `:1071`, `:1073`, `:1075`, `:1078`, `:1084`, `:1090` | alert(err) after a refused Progress-sheet edit (the field is put back first) | A (18); the field is restored before the dialog opens, exactly as now |
| `app-season.js:1096` | confirm "Mark N awards from earlier years as given, with no date?" + list | **U** with the count; the list is shown in the flash's "Show" disclosure |
| `app-season.js:1097` | alert(err) | A |
| `app-person.js:284` | alert(err) on a night-team change | A |
| `app-todo.js:162` | alert(err) on a date received | A |
| `app-todo.js:216` | alert "Pick a book first." | A (better: disable Set until a book is picked; still A for keyboard paths) |
| `app-todo.js:227` | alert "No one without a book in this list" | A |

**Step 2: Roster, Color teams, Calendar (21 sites).**
| File:line | Now | Becomes |
|---|---|---|
| `app.js:700`, `:745`, `:1004`, `:1026`, `:1042` | alert "Load a roster first." | A (5) |
| `app.js:726` | alert "Import a Planning Center export first" | A |
| `app.js:738` (in #dlg) | confirm "Link X to Y?" | **U** |
| `app.js:746` | prompt "New column name. It must start with x_, team:, att:, prog: or award:" | **F**: Kind (`select`: Club field `x_` (default), Award date `award:`, Attendance date `att:`, Progress `prog:`, Color team `team:`), then Name (`text`, for `x_` and `prog:`), or Date (`date`, for `award:` and `att:`), or Quarter (`select` Q1-Q4, for `team:`); a live preview "Column: award:2026-11-04"; `validate` refuses a duplicate (`master.pcCols.concat(master.userCols)`) and an empty name. No prefix typing. See decision D5 |
| `app.js:748` | alert "Invalid or duplicate column name." | folded into the form's validation (no separate dialog) |
| `app.js:749` | alert "Column added…" | `App.done` (U: adding a column is an edit; Undo removes it) |
| `app.js:1007` | alert "Qn has started or is locked, so it cannot be re-drawn" | A |
| `app.js:1029` | confirm "Clear every Qn color … and draw them again?" | **U** (T5 kept a plain confirm here; with Undo it is one step back). Alternative: route it through the Fill preview (`app-teamgrid.js:214-230`), decision D6 |
| `app.js:1039`, `:1048` | alert(err) | A (2) |
| `app.js:1043` | prompt "Archive this year's colors under what label?" | **F**: Year label (`text`, default `Season.defaultYear(today)` minus one, `validate` with the `newSeason` rule: YYYY-YY, 2027-2028 shortened) |
| `app.js:1159` | confirm "Delete 2026-11-18 Theme?" (calendar row) | **U** |
| `app.js:1167` | alert "Load a calendar first." | A |
| `app.js:1168` | prompt "Move every date forward by how many weeks?" | **F**: Weeks (`number`, default 52, min 1, max 104, step 1), with the Easter and holiday note as the field hint; the move itself becomes **U** |
| `app-teamgrid.js:25` | confirm "N children have no color in Qn. Lock it anyway?" | **U** "Q2 locked. 3 children have no color in Q2. Undo" |
| `app-teamgrid.js:29` | confirm "Unlock Qn?" | **U** |
| `app-teamgrid.js:30` | alert(err) | A |

**Step 3: files, import, merge, Drive, update, new season, History restore, Binders (33 sites).**
| File:line | Now | Becomes |
|---|---|---|
| `app.js:71` | alert "Could not save to Google Drive … downloaded instead" | A |
| `app.js:199` | confirm "This export is older than the Planning Center data already in this file" | C (the import goes on into the review panel; Cancel imports nothing). Buttons "Import the older export" / "Cancel" |
| `app.js:293` | alert "Import applied: N refreshed…" | A (keep; it is the import's receipt). Could be a flash; Mike's rule says dialog |
| `app.js:1213` | confirm "Discard unsaved changes and import the old master?" | C (danger) |
| `app.js:1227` | alert(problems) after opening files | A with `list` |
| `app.js:1250`, `:1254` | alert on Try it out | A (2) |
| `app.js:1296` (in #dlg) | alert "Tick at least one binder." | inline: disable Go until one is ticked, plus A for safety |
| `app-season.js:72` | confirm "The X tab has N changes you have not applied. OK applies them" | **Ch**: "Apply and continue" (primary) / "Discard and continue" (danger) / "Stay here" (cancel, Esc); re-runs the action via `resolveDraft(again)` |
| `app-season.js:101` | confirm "Throw away N changes on this tab?" | C (danger; a draft is not on the Undo stack until Apply) |
| `app-season.js:228` (in #dlg) | alert(err) on Fix dates | A |
| `app-season.js:235` | confirm "Discard unsaved changes?" (opening a file) | C (danger) |
| `app-season.js:250` | alert "This is an older season-only data file" | A |
| `app-season.js:256` | prompt "Club year for this data file?" | **F**: Year (`text`, default `Season.defaultYear(today)`, YYYY-YY validation) |
| `app-season.js:287` | prompt "Club year?" (default '2026-27' hard-coded) | **F** as `:256` (and the default becomes `Season.defaultYear`, not a fixed year) |
| `app-season.js:449` | confirm "You have unsaved changes. Download first … Continue anyway?" | **Ch**: "Download, then continue" (primary) / "Continue without saving" (danger) / "Cancel" |
| `app-season.js:450` | prompt "Year for the new season?" | **F**: Year (`text`, default next year from `Season.defaultYear`, YYYY-YY validation, the carry-over explanation as the hint) |
| `app-season.js:452` | alert(err) | folded into the form's validation |
| `app-season.js:1187` | prompt "Name for version i" | **F**: Name (`text`, empty removes it); the rename itself is **U** if History tags are undoable (check `Season.record` on a tag change), else plain |
| `app-season.js:1195` | prompt "Restore confirmation i of 3. Type this sentence exactly" (x3) | `App.ask.typed(RESTORE_PHRASE, { step })`, three times, as designed (H10) |
| `app-season.js:1197` | alert "That does not match, so nothing was restored." | not needed (OK stays disabled until it matches); Cancel says nothing was restored in a flash |
| `app-season.js:1204` | alert "That is already the latest version" | A |
| `app-season.js:1205` | confirm "Restore to version …? This deletes N later versions" | C (danger, "Restore") |
| `app-season.js:1210` | confirm "The backup was downloaded. Check that it saved, then press OK" | C ("It saved, restore" / "Cancel") |
| `app-merge.js:75` (in mergeDlg) | confirm "Take the other file's value for all N conflicts?" | no confirm: do it, and show "Put my choices back" in the merge dialog (choices are not applied until Apply, so this is the merge screen's own undo) |
| `app-merge.js:92`, `:93` | alert "Open or start a data file first", "That file is not a data file" | A (2) |
| `app-merge.js:95` | confirm "That file is for club year X and this one is Y. Merge anyway?" | C (a merge replaces the session through `setSeason`, which clears Undo, `app-season.js:27`) |
| `app-drive.js:83`, `:217`, `:275` | alert "Google Drive: …" | A (3) |
| `app-drive.js:169` | alert(said) after a merged Drive save with conflicts (also from an automatic save) | A (auto-save already waits while a dialog is open, `app-update.js:86`) |
| `app-update.js:79` | alert "The update finished, but your open session could not be put back" | A (runs after load, when `App.ask` exists) |

**Step 4: Options, Debug tools, Store (10 sites).**
| File:line | Now | Becomes |
|---|---|---|
| `app-options.js:237` | alert(err) on the Cubbies detail | A |
| `app-options.js:276` | confirm "Put the standard list of books back?" | **U** |
| `app-options.js:278` | confirm "Delete the book X? N children have this book" | **U** (the count goes in the flash) |
| `app-options.js:285` | confirm "Delete the bundle X?" | **U** |
| `app-options.js:289` | confirm "Put the standard Quarterly Printables bundle back?" | **U** |
| `app-options.js:295` | confirm "Mark N awards for M children as given, with no date?" | **U** |
| `app-options.js:296` | alert(err) | A |
| `app-tools.js:103` | confirm "Delete this bug report? Undo brings it back." | **U** |
| `app-tools.js:109` | confirm "Clear N Given dates that nobody entered? … Undo takes" | **U** |
| `app-store.js:96` | alert "Nothing has been earned yet, so there is nothing to scale." | A |

Totals: 34 + 21 + 33 + 10 = 98. Before each U is built, check that the action really is one Undo step (it calls `touchSeason` once, directly or through `App.touch`/`App.changed`, `app-season.js:187`); where it is not (a staged draft tab), it stays C.
### 2.3 Tests that depend on native dialogs
Found with `grep -lE "(on|once|waitForEvent)\('dialog'" dev/app/test/*.js`: **100 files** (99 `*.test.js` plus the helper `mobile-audit.js`). One more stubs `window.prompt` directly: `browser.test.js:112` (Restore phrase).

**Read the dialog (message, type or a typed answer): 32 files.** These break unless the shim gives the same `message()`/`type()`/`accept(value)`; check each one's expected text against the new wording (the message text should stay word for word where a test matches it, or the test is updated in the same step):
attend-person-browser, awards-recalc-browser, blue-hand-browser (Blue Jewel prompts: becomes the form; the test fills Day and Reason), browser (13 handlers; prompt for club year and Restore), date-fixes-browser, date-overtype-browser, drive-autosave-browser, drive-browser, drive-inplace-browser, flag-anything-browser, fresh-start-browser (club year prompt), given-early-warning-browser, import-browser, import-button-browser, import-conflicts-browser, info-browser, leftovers-browser (11 handlers), merge-files-browser, mid-quarter-moves-browser, no-nested-scroll-browser, options-browser, past-years-browser, pc-capture-browser, person-bar-browser, progress-reviews-browser, table-wrap-browser, teamgrid-browser (4; lock confirm becomes U), teams-new-year-browser (archive label prompt), trail-browser, uniform-given-browser, uniform-order-browser, update-autosave-browser.

**Blanket accept or dismiss only: 68 files.** Most install `page.on('dialog', d => d.accept())` (or `dismiss()`) as a safety net. They keep working through the shim, but a blanket **accept** is load-bearing wherever the test presses a button that asks first; once that confirm becomes U, the action happens with no dialog and the test is unchanged. A blanket **dismiss** is load-bearing where the test expects Cancel; once the confirm becomes U the action now HAPPENS, so those tests must be read one by one in the step that converts their call site:
absences-browser, announce-progress-browser, assumed-given-browser (Clear assumed Given: `app-tools.js:109` becomes U), attend-steps-browser, attendance-landscape-browser, awards-count-browser (dismiss), awards-manager-browser, binders-dialog-browser (Tick at least one binder), binders-paper-browser, book-tabs-browser, book-todo-browser, books-browser (book delete and reset: U), bug-button-browser (delete report: U), bundles-browser (bundle delete and reset: U), clear-nodate-browser (dismiss), club-title (dismiss), color-teams-widths-browser, cubbies-browser, date-year-default-browser, debug-scripts-browser, flag-marks-browser (dismiss), flag-visibility-browser (dismiss), flagpop-browser (dismiss), flags-browser, games-both-browser, general-note-edit-browser, given-nodate-browser, hand-out-given-browser, header-browser, hidden-attr-browser, mobile-audit.js (dismiss), more-menu-browser (dismiss), nodate-sheet-browser (dismiss), pcneed-bar-browser, person-flags-browser, person-list-names-browser, person-sheets-browser, phone-attendance, pinned-person-bar-browser (dismiss), print-blank-dates-browser, print-pdf-n1-browser, progress-onepage-browser, progress-pdf-browser, progress-record-sheet-browser, quarter-browser, received-browser, replay-open-browser (dismiss), reports-new-browser, reports-subtabs-browser, roster-quarter-browser (dismiss), save-bar-rotation-browser, save-dot-browser (3), save-style-browser (dismiss), service-worker-browser (dismiss, 2), stats-nights-browser, store-browser (dismiss: Scale with nothing earned), tab-sheet-browser (dismiss), team-balance-browser, teamgrid-effective-browser, teams-gaps-browser, teams-preview-browser (Re-draw confirm `app.js:1029`), todo-badge-browser, todo-book-medical-browser, todo-date-entry-browser, todo-emergency-note-browser (dismiss), told-no-date-browser, touch-targets-browser (dismiss, 2), unchecked-features-browser.

**Migration rule per step:** (1) in every test file that the step touches, replace `page.on('dialog', fn)` with `onAppDialog(page, fn)` and add the native tripwire; (2) run the whole browser set, not only the touched files, because a blanket handler in an untouched file may have been answering a converted call; (3) the `no-native-dialogs` OPEN counts drop by the step's sites. A first, no-behaviour-change step can switch ALL 100 files to `openApp`/`onAppDialog` while the app still uses native dialogs: the shim forwards native dialogs to the same handler (it listens to both `page.on('dialog')` and `app-ask`), so each later step only changes the app.

### 2.4 UX-20: data, docs, risks, effort
- **Data and version.** No data format change (Undo uses the existing History). Each step bumps the scripts it changes, plus the new `app-ask.js` 1.0.0, `style.css` (no version line; the page build changes), and `index.html` app-version/app-build.
- **Docs.** CHANGELOG per step ("Messages and questions now open in the app's own box…"); How it works: a short "Messages and questions" paragraph in the general section (Esc cancels, the Undo flash), and rewrite every place that says "type …" or "press OK" (search `index.html` for `press OK`, `type this`, `prompt`, `OK applies`), notably Restore, New season, Add column and Shift calendar; README test list (`app-ask-browser`, `no-native-dialogs`, `test/lib/app-dialogs.js` described under Tests); REVIEW-LOG UX-20 status per step; BACKLOG.
- **Risks.** (1) Sync-to-async control flow: every converted confirm in a sync function must use the continuation pattern, or the action runs before the answer. Review each U/C site for code after the call. (2) Focus: inline edits on the Progress sheet put the old value back and then alert; with a non-blocking dialog, the re-render must not steal focus from the dialog (open the dialog after `redrawSheet()`). (3) Phone: the app dialog sits above the Save bar and the on-screen keyboard; check at 390 with a date field. (4) Auto-save and the update check already pause while any `dialog[open]` is showing (`app-update.js:86`), so a long-open question pauses auto-save; acceptable, note it in the manual. (5) The tests: 100 files; the step-0 shim keeps the risk to one mechanical change.
- **Effort:** L overall (helper M; step 1 M; step 2 M; step 3 L; step 4 S).

## 3. Other UX items
Each item: (1) verified behaviour, (2) change, (3) data and version, (4) tests, (5) docs, (6) dependencies and risks, (7) effort. "Widths" means Playwright viewports 390x844, 430x932, 600x960 and 1280x900 unless stated. Every UX change also bumps the scripts it touches and `index.html` app-version/app-build, gets a CHANGELOG line, a REVIEW-LOG status and a BACKLOG line; only extra docs are listed.

### UX-05 Start tab after opening a file
1. Verified: `App.tab` starts as `'roster'` (`app.js:49`) and the Roster button is `class="on"` in the markup (`index.html:40`); `App.loadData` (`app.js:1174-1184`) never changes the tab. The club-night tabs are in the Tonight group (`index.html:33-38`).
2. Change: a setting **Start on** in Options › Club settings: *Roster* (today's behaviour), *Tonight's tab on a club night* (default for new files: on a club night or the day after (`Calendar.isNight` rows, `App.today()`), open Attendance on that night; any other day open To do), *To do*. Applied once after a file opens (end of `setSeason`, `app-season.js:27-30`, after `App.loadData`), never after an Update now restore (`app-update.js:73` sets the tab itself) and never when a Go from a flag or the search already chose a tab.
3. Data: new key `config.startTab` (`'roster'|'tonight'|'todo'`; absent = `'tonight'`? see D7). Unknown config keys are kept by older copies (DATA-FORMAT 2.5, third bullet), so **no version bump**; add a row to DATA-FORMAT section 6.
4. Tests: new `start-tab-browser.test.js` with `App.today` stubbed: a club night opens Attendance on that night; the day after opens Attendance on the night before; a Monday opens To do; setting Roster opens Roster; Update now restore keeps the tab it carried (extend `update-autosave-browser`). Widths 390 and 1280. `data-format-doc.test.js` passes with the new row.
5. Docs: How it works (Options and "Opening a file"), DATA-FORMAT 6, README Tests list.
6. Risk: many browser tests assume Roster after open (`page.textContent('#tab-roster')`-style waits). Default the TEST file path to Roster: the tests load `dev/test-data` files that lack `startTab`, so if the default for an absent key is `'tonight'`, every such test changes. Recommendation: absent = Roster (old behaviour); the Options choice sets `'tonight'` (D7).
7. Effort: S.

### UX-06 Phone menu: three taps from Roster to Attendance
1. Verified: on a phone the tab strip is an accordion (`style.css:311-313`); `setTabMenu` opens only the current tab's group (`app.js:405-408`, `openGroup` `:399`), so from Roster (People group) Attendance is menu, Tonight, Attendance = 3 taps.
2. Change: the Tonight group is always open in the phone menu (CSS `.tabgrp:first-child > button { display:block }` and its header shows no caret), and the current tab's group opens too, so any Tonight tab is 2 taps from anywhere. No bottom bar (it would compete with the Save bar, BACKLOG S9).
3. Data: none.
4. Tests: extend `more-menu-browser` or `header-browser`: at 390 and 430, from Roster, menu then Attendance reaches the tab in 2 clicks; the group heads still toggle; at 600 too (still under 760). At 1280 the tab strip is unchanged.
5. Docs: How it works, phone paragraph (README "Phones, tablets and keyboards" line in Folder layout too).
6. Risk: the menu gets taller; check it still fits 844px without scrolling the page under it.
7. Effort: S.

### UX-07 Recent places row on every phone tab; nine Person filters
1. Verified: the Recent places bar (`index.html:69-73`) shows under the tabs on a phone (`style.css:441`; hidden only on a wide fine-pointer screen, `:437`). The Person bar has nine controls: Show, Search, Group, Class, Sort by, Person, Previous, Next, show inactive (`index.html:109-119`).
2. Change: (a) On a phone, move Recent places into the tab menu as its last group ("Recent", listing the same chips; `app-trail.js` already renders a menu, `trailMenu`); hide `#trailBar` under 760px. (b) Person bar on a phone: keep Search, Person, Previous, Next visible; put Show, Group, Class, Sort by and show inactive under one **Filter** disclosure (`<details>`) whose summary says what is set ("Filter: Sparks, last name"). Desktop unchanged.
3. Data: none.
4. Tests: at 390, 430 and 600: `#trailBar` not visible, the menu holds a Recent group whose entries open the place (extend `trail-browser`); the Person name heading's top is above 300px (was about 507) (extend `person-bar-browser`); the Filter summary text updates when Group changes; at 1280 every control is still in the bar.
5. Docs: How it works (Recent places, Person tab), README Folder layout "Recent places" line.
6. Depends on UX-14 (one "show inactive" control) if both touch the Person bar: do UX-14's wording first. Risk: `pinned-person-bar-browser` and `person-list-names-browser` measure the bar.
7. Effort: M.

### UX-08 (conditional) One "?" per tab on a phone
1. Verified: `i.info` and `.infobox` are hidden on a phone (`style.css:424`, `@media (max-width: 760px) { i.info, .infobox:not(.flagpop), #infoTip, .deskonly { display:none !important; } }`); intro paragraphs (`p.status` at the top of each tab) always show.
2. Option, only if it passes the test below: one "?" button in each tab's first bar on a phone, opening a bottom sheet (the `App.ask` dialog with a close button) with that tab's intro text and its (i) notes (`info.js` texts by tab prefix); the long intros fold into it on a phone only.
3. Data: none.
4. **The test for "does not impede flow and usability"** (all must hold, measured at 390 and 430 on the TEST file, before and after): (a) the taps for the five weekly flows are unchanged or fewer: mark a room present on Attendance, enter a game result, announce and give an award, add a flag, open a child's Progress; (b) the first control of each Tonight tab moves UP the screen (its `getBoundingClientRect().top` is smaller); (c) every intro text and (i) note reachable today is reachable in at most two taps (the "?" and, if needed, one section); (d) the sheet closes with Esc, a tap on the backdrop and the close button, and focus returns to "?"; (e) no tab gains horizontal scroll; (f) Mike uses it on his phone for one club night and says it is not slower. If any of (a) to (f) fails, it is not shipped.
5. Docs: How it works, phone paragraph.
6. Depends on the `App.ask` helper (UX-20 step 0). Risk: hiding text that leaders rely on; (c) guards it.
7. Effort: M (only if Mike says go after a prototype).

### UX-09 Person search: no phone button; ranking
1. Verified: the search opens only on "/" (`app-search.js:84`); there is no button. Matching is a plain substring of the full name (`app-search.js:44`) in roster order (`people()` `:41`), so a later-sorted name that starts with the query can sit below one that only contains it.
2. Change: (a) a magnifier button in the top bar (`index.html:25`, after Flag; `aria-label="Search people"`), shown at every width (on a phone it is the first item of the overflow menu if UX-10 moves things); (b) rank: 0 = first name starts with the query, 1 = last name starts with it, 2 = any word starts with it, 3 = contains; then by the current order.
3. Data: none.
4. Tests: there is NO browser test of the "/" search yet (no test file mentions `gSearch` or `openSearch`; S6 was checked by hand). New `search-browser.test.js`: "bo" on the TEST roster lists names whose first word starts "Bo" before others (assert by computed rank, not by real-looking names); the button opens the box at 390 and 1280 and has a 44px target on 390.
5. Docs: How it works (search), README Tests line.
6. Risk: none.
7. Effort: S.

### UX-10 Phone top bar scrolls sideways (defect)
1. Verified from markup: the bar holds Download + caret, Undo, Redo, Flag, Bug (when on), and the status spans (`index.html:23-27`); `#status` carries "N unsaved edits". The review's measurement (Flag at x=386 of 390) is not re-measured here (needs a browser).
2. Change: under 760px: (a) the unsaved count moves onto the Download button (a dot and the number; `app-season.js:171` already toggles `.unsaved` and the aria-label), and `#status` is hidden in the bar (the (i) still says it); (b) Redo, Flag, Bug and the search button go into a "⋯" overflow menu (`role="menu"`, the same pattern as `#moreMenu`, `index.html:60`); Undo stays visible. Flag mode's state (`aria-pressed`) shows on the "⋯" button as a dot while on.
3. Data: none.
4. Tests: new `topbar-phone-browser.test.js`: at 390, 430 and 600 the header's `scrollWidth <= clientWidth`, Undo and Download are fully inside the viewport after 25 edits, the "⋯" menu holds Redo, Flag and Bug and each works (Flag enters flag mode; Esc leaves it), keyboard: Enter opens the menu, arrows move, Esc closes and returns focus. At 1280 every button is in the bar as now. Update `header-browser`, `save-dot-browser`, `flag-anything-browser` (they press `#btnFlagMode` directly: on a phone width they must open "⋯" first).
5. Docs: How it works (top bar), the `o-files-bar` note (`index.html:617`, generated by `sync-guide.js`: change the source in `info.js` and rerun).
6. Risk: Flag tests at phone width. Medium.
7. Effort: M.

### UX-11 Color team games: 16 dropdowns a night
1. Verified: each team row has a Place select and a Spirit select (`app-season.js:475-476`), four teams per group, Sparks and T&T both shown, so 16 selects.
2. Change: Place becomes four tap buttons per team row (1, 2, 3, 4, `aria-pressed`), Spirit four buttons (0 to 3). When three places are set and the fourth team has none, the fourth gets the remaining place automatically (one edit, one Undo step) unless that would duplicate a place. Ties: allowed (two teams may both be 1st), so the auto-fill happens only when the three set places are distinct and one place is left (see D8). A "Clear" button per row. `Season.setGame` unchanged.
3. Data: none (same `games` values).
4. Tests: extend `games-both-browser`: tapping 1, 2, 3 on three teams sets the fourth to 4 and saves one History entry; a tie (1, 1, 2) leaves the fourth blank; Clear removes the row's place; keyboard: buttons are a group with arrow keys or plain Tab; 44px at 390 and 430; 1280 layout. `reports-season` game points unchanged (node).
5. Docs: How it works (Color team games).
6. Risk: users used to selects; low.
7. Effort: M.

### UX-12 To do: a "Tonight" strip
1. Verified: To do has no per-night summary (`app-todo.js:96-140`); the pieces exist: rooms entered per night (`entered()` in `app-season.js`), games per night (`season.games[date]`), the awards badge (`#awardsBadge`, `App.awardsToGive`, `app-season.js:1232`).
2. Change: at the top of To do on a club night or the day after (the same rule as UX-05), a strip: "Wed 11/18: rooms entered 7 of 11 (Go), games entered 1 of 2 (Go), awards to announce 12 (Go)". Each Go opens the tab on that night and the first missing room. Not counted in the To do number.
3. Data: none.
4. Tests: new cases in `todo-badge-browser` (the strip does not change the badge) and a new `todo-tonight-browser.test.js` with `App.today` stubbed: counts match the TEST data, each Go lands on the right tab, night and room; absent on a non-club day; at 390 and 1280.
5. Docs: How it works (To do).
6. Depends on UX-16 (night label format). Risk: "rooms" must exclude Volunteers and rooms with no active children.
7. Effort: M.

### UX-13 New club year as one checklist
1. Verified: the steps live in four places: New season (Options, `app-options.js:165`), replace the calendar (Calendar tab; the stale-calendar banner, BACKLOG T1), Start new year for colors (Color teams bar, `index.html:158`), this year's books (Options › Books, `config.yearBook`). `newSeason` clears `yearBook` and the team plan (`season.js:518`).
2. Change: "New season…" opens a checklist (in the `App.ask` form style, or a pcard on Options) with four steps, each with its own state worked out from the file, not stored: (1) New season made (the file's `year` is the current `Season.defaultYear`), (2) calendar replaced (a club night today or later, the T1 rule), (3) colors started (`config.teamPlan` has no locked quarter from last year and Q1 is open), (4) this year's books chosen (`config.yearBook` has a book per group). Each step has a Go button to where it is done. Order is free (the checklist only suggests one).
3. Data: none (each step's state is worked out from the file, nothing is stored).
4. Tests: new `new-season-checklist-browser.test.js`: on a fresh `newSeason` of the TEST file every step shows "to do"; doing each (calendar replaced via `App.calendar`, books chosen, colors started) ticks it; Go buttons land on the right tab; 390 and 1280.
5. Docs: How it works (New season), `docs/reference/COLOR-TEAMS.md` if it describes the order.
6. Depends on UX-20 step 3 (the New season prompt becomes a form). Risk: the state rules must match T1 and A6/A7.
7. Effort: M.

### UX-14 One word per concept, one control per filter
1. Verified: Roster says "Kids + volunteers" / "Kids only" / "Volunteers only" (`index.html:83`) and "Active only" / "Inactive only" / "Active and inactive" (`:84`); Person says "Clubbers and adults" / "Clubbers only" / "Adults only" (`:111`) and has a "show inactive" checkbox (`:118`); Roster's column filter says "Clubber" / "Volunteer" (`app.js:567`). Room vs Class: the Roster column is "Room" (`app.js:493`, filter `data-cf="room"` `:566`), Person uses "Class" (`:114`), reports use "class".
2. Change: one glossary, applied to labels only (no data keys): **Class** (never Room) for a child's class; **Clubbers** and **Volunteers** (never kids, children, adults in labels; "children" stays in sentences); one inactive control everywhere: a select "Active / Inactive / Everyone". Add the glossary to How it works.
3. Data: none (keys like `C.ROOM`, `'Volunteers'` stay).
4. Tests: a node check `wording.test.js` that greps `index.html` and `app*.js` label strings for the banned variants ("Kids + volunteers", "Clubbers and adults", ">Room<" in labels, "show inactive"); update tests that click by text: grep `test/*.js` for `Kids only`, `Clubbers only`, `show inactive`, `peInactive`, `fRole`, `'Room'` before changing (the Person checkbox `#peInactive` becomes a select, so tests that `.check('#peInactive')` change). Widths: 390 and 1280 for the Person bar.
5. Docs: How it works throughout (search "Room", "kids"), the manual's Roster and Person sections, README if it quotes labels.
6. Risk: broad text churn in tests; do it in its own batch. "Room" is also the Attendance stepper's name (`attRoom`): label it Class there too.
7. Effort: M.

### UX-15 Quarter pickers
1. Verified: Roster `#fQuarter` (`index.html:85`), Color teams `#tQuarter` (`:152`), Reports `#bQuarter` "Quarter to print" (`:226`) and `#sQuarter` (`:231`), the team balance pills (`app-teamgrid.js:95`), Statistics' own Whole season/Q1-Q4 buttons (`app-stats.js:21`). The app-wide quarter is `App.settings.quarter`; `#tQuarter` and the balance pills are separate states, which is how Q2 and Q3 showed on one page.
2. Change: one pill component `App.quarterPills({ id, value, scope, label, disabled })` (buttons with `aria-pressed`, like Statistics') used by all six; every picker that is NOT the app-wide quarter carries a scope label: "Balance for:", "Quarter to print:", "Statistics for:". The balance pills follow `#tQuarter` by default and say so when they differ ("Balance for: Q3 (the grid shows Q2)").
3. Data: none.
4. Tests: `quarter-browser` and `roster-quarter-browser` updated (selects become pills); new cases: on Color teams, changing the grid quarter moves the balance pills too unless the user picked one; every pill group has a visible label; 44px at 390; 1280.
5. Docs: How it works (Quarter).
6. Risk: many tests `selectOption('#tQuarter', ...)`; grep `test/*.js` for `Quarter'` and give the component a hidden-compatible API (`value` property, `change` event) so most tests keep working.
7. Effort: M.

### UX-16 Night pickers: one format, "(last)" and "(next)"
1. Verified: Attendance and Games default to the last club night on or before today (`defaultNight`, `app-season.js:300-304`, used at `:343` and `:464`); Awards defaults to the next one (`nextNight` `:515`, used at `:562`). Labels: `nightSelect` gives "Wed 11/11 (Q2) ✓" (`:309-312`); Reports' Night select shows ISO "2026-11-11" (`app.js:831`).
2. Change: one formatter `App.nightLabel(date)` = "Wed 11/11 (Q2)" plus " · last" for the latest night on or before today and " · next" for the first after today, plus " ✓" when entered; used by `nightSelect` and by Reports' `oDateSel` (`app.js:829-831`). Defaults unchanged (they are deliberate: Awards announces next week), but now visible.
3. Data: none.
4. Tests: `reports-subtabs-browser` or `attendance-quarter-night` (node) for the label; a browser case with `App.today` on a Monday: Attendance shows "· last", Awards "· next", Reports uses the same text; 390 (the select is not wider than the stepper box, UX-03 geometry still holds: rerun `attend-steps-browser`) and 1280.
5. Docs: How it works (Attendance, Awards, Reports).
6. Risk: `attend-steps-browser` measures the select; longer labels may truncate at 390. Keep "· last" short.
7. Effort: S.

### UX-17 Roster: two filter layers, five ways to change a class
1. Verified: the bar selects (`index.html:83-85`: role, active, quarter) and the column filter row (`app.js:563-575`, `rosterHead`) both filter; a class can be changed by the in-row Room select, Move… (`app.js:710-719`), the Edit dialog, the Person page Planning Center record (`app-person.js:31`), and To do's Assign a class.
2. Change: keep the column filter row as the one filter layer on Roster (move Role and Active into it as its first two columns' filters; keep Quarter in the bar, since it chooses which color column shows); the in-row Room cell becomes read-only text with the ⇄ Move button beside it (Move is the one place a class changes on Roster; Person page and To do keep theirs).
3. Data: none.
4. Tests: `roster-quarter-browser`, `table-wrap-browser`, `browser.test.js` (needs real files) and any test that sets `#fRole`/`#fInactive` (grep): update; new case: no `select[data-pc="Room"]` in a Roster row; Move changes the class and Undo reverts; widths 390 and 1280.
5. Docs: How it works (Roster).
6. Depends on UX-14 (labels). Risk: leaders who change classes in the row; Move is one tap more.
7. Effort: M.

### UX-18 Color teams: overlapping fill buttons, six buttons in the bar
1. Verified: the bar has Quarter, Assign blanks, Re-draw whole quarter…, Import current colors, Save colors CSV, Start new year… (`index.html:151-159`); the grid adds "Fill N blank colors" (`app-teamgrid.js:51`), which previews every open quarter (`:236`), while Assign blanks works on the chosen quarter (`app.js:1028`).
2. Change: one **Fill blanks** button with a scope choice in its preview dialog ("This quarter (Q2)" / "Every open quarter"), replacing both; Import current colors, Save colors CSV, Re-draw whole quarter and Start new year go under a **More ▾** menu (the `#moreMenu` pattern).
3. Data: none.
4. Tests: `teams-preview-browser` (16 cases) and `teamgrid-browser`: the scope choice; byte-identical data after Cancel stays; More menu keyboard; 390 (no bar wrap beyond two lines) and 1280.
5. Docs: How it works (Color teams), `docs/reference/COLOR-TEAMS.md`.
6. Depends on UX-20 step 2 (Re-draw's confirm). Risk: the T5 preview code paths (`app-teamgrid.js:192-240`, `app.js:1004-1029`) merge; keep one preview function.
7. Effort: M.

### UX-19 Import only under the caret
1. Verified: Import is reached only from the caret of "Download data file" (`index.html:24`, `btnFile`, menu `#fileMenu` `:65`); the older Import button is hidden in `#fileLegacy` (`:66`).
2. Change: the split button becomes a **File ▾** menu button with Import…, Merge a data file…, Download data file (or Save to Drive), and the save style; the Download button itself stays as the primary one-tap save beside it. On a phone File is the first button (it already is).
3. Data: none.
4. Tests: `import-button-browser`, `drive-browser`, `save-style-browser`, `header-browser`: open File, choose Import (opens `#fileAny`), keyboard; 390 and 1280.
5. Docs: How it works and the `o-files-bar` (i) note (`info.js` then `sync-guide.js`).
6. Depends on UX-10 (same bar). Do them together.
7. Effort: S.

### UX-21 Keyboard: hidden file inputs, no skip link
1. Verified: `#fileMerge` and `#fileAny` are visually hidden (`.vh`, `style.css:484`) but focusable (`index.html:24`, no `tabindex`); `#fileTeams` too (`index.html:155`, inside a label, which is fine because the label is the visible control). There is no skip link (`grep -ci "skip to" index.html` = 0). `<main>` is at `index.html:78`.
2. Change: `tabindex="-1"` on `#fileMerge` and `#fileAny` (they are opened by script, `app-merge.js:110`, `app-drive.js:269`, `app.js:1231`); a "Skip to content" link as the first element of `<body>`, visible on focus, targeting `<main id="main" tabindex="-1">`. The 989 focus stops on Roster are left as they are (the review's "Kept" list says tab order across rows is fine); the skip link is the fix for getting past them.
3. Data: none.
4. Tests: `a11y-browser`: the two inputs are not in the tab order; the first Tab from the top focuses the skip link and Enter moves focus to `main`; 1280 and 390.
5. Docs: How it works (keyboard), README Known open items (accessibility line) if it lists this.
6. Risk: none.
7. Effort: S.

### UX-22 Phone cards: no column captions
1. Verified: in a `.pcard table.roster` on a phone the `thead` is hidden and rows wrap as flex (`style.css:319-323`); cells have no caption, so a checkbox or a number box has no visible label (the review names Hold, the emblem colour box and the children number).
2. Change: each `td` in these tables gets `data-label` from its column heading (one helper `App.cardLabels(table)` run after render, reading `thead th` text), and the phone CSS shows `td[data-label]::before { content: attr(data-label) }` as a small caption; controls with no visible text also get `aria-label` (most already do). Skip cells whose content already starts with the same word.
3. Data: none.
4. Tests: `touch-targets-browser` or a new `card-captions-browser.test.js`: at 390 and 430 every visible input in a card row has a visible caption or label text; at 600 too; at 1280 no captions (table head shows).
5. Docs: none beyond CHANGELOG.
6. Risk: captions lengthen cards (UX-23 wants them shorter); keep captions one line, 12px.
7. Effort: S.

### UX-23 To do is 86 items long
1. Verified: To do draws every group with every item (`app-todo.js:96-140`); a person card has both a name link and an "Open Person page" button that do the same thing (`app-todo.js:81-82`, handlers `:176-177`).
2. Change: within each group, rows are grouped by class in `<details>` with a count ("Sparks A (6)"); groups of level `check` are collapsed by default, `action` open; the open/closed state is kept in the tab's ui state (not in the file). Drop the "Open Person page" button and keep the name link (it does the same, with the attention highlight).
3. Data: none.
4. Tests: `todo-badge-browser` (counts unchanged), `todo-book-medical-browser` and `todo-date-entry-browser` (they act on rows; open the right `<details>` first), new case: page height at 390 drops (measure `#todoWrap.scrollHeight` before and after with the TEST data; expect less than half), the "to check" groups start closed; 390, 430, 1280.
5. Docs: How it works (To do).
6. Depends on CR-08 (group contents). Risk: Flag trails that include a To do heading (S8 normalised counts); a `<summary>` with a count is the same pattern, check `flagtrail.test.js`.
7. Effort: M.

### UX-24 Roster Edit vs Person Registration
1. Verified: Edit (`app.js:669-697`, `openEdit`) lists every Planning Center and user column (`cols` at `:670`) as raw fields; the Person page has a curated Planning Center record (`app-person.js:37-40`, `PC_FIELDS`) with an "All fields…" button.
2. Change: Roster's Edit opens the Person page on that person (Registration part) with the field focused; the full raw dialog stays reachable as "All fields…" on the Person page (it already exists, `app-person.js:39`). Add person (`openEdit(p, true)`) keeps the dialog but grouped in `<fieldset>`s (Name, Class and grade, Contact, Medical, Club fields).
3. Data: none.
4. Tests: `browser.test.js` (needs real files: change and note it was not run), `pc-capture-browser`, `leftovers-browser` (Edit dialog use): Edit lands on the Person page; All fields still edits a raw column; 390 and 1280.
5. Docs: How it works (Roster, Person).
6. Risk: Edit's "Reset to Planning Center" buttons (`app.js:675`) must exist on the Person page (they do, as pending-change marks; check).
7. Effort: M.

### UX-25 Uniforms: bulk "ordered / received today"
1. Verified: each Uniforms row has date boxes with a Today button (`App.uniDateHtml`, `app.js:1063`; `renderUniforms` `:1083`); there is no bulk action.
2. Change: two buttons above the table: "Mark the N shown as ordered today" and "…received today", acting only on visible rows that have no date in that column; one edit (one Undo step), then the `App.done` Undo flash.
3. Data: none (same fields).
4. Tests: `uniform-order-browser`: filter to a few rows, press the bulk button, only those rows get today, one Undo restores all; rows with a date are untouched; 390 and 1280.
5. Docs: How it works (Uniforms).
6. Depends on the `App.done` flash (UX-20 step 0).
7. Effort: S.

### UX-27 Small text faults
1. Verified each: (a) "Announce on11/18": missing space at `app-season.js:526` (`'Announce on' + esc(MD(...))`). (b) Undo tooltip "g: marked": `Season.describe` (`season.js:1323-1324`) names marks from `MARK_NAMES` (`:1315`), which has no `g` (the group stamp `setMark` writes, `:552`), so it prints the raw key. (c) "Person · Adeline Ariana" listed twice: Recent places (`app-trail.js`) can hold the same person twice when two places differ only by sub-tab; not reproduced from code alone (browser check). (d) Phone badge 40 vs To do count: the menu badge is To do plus Awards (`app.js:417`), by design but unlabelled.
2. Change: (a) add the space; (b) leave `g` out of the description (it is bookkeeping) and add `g: 'Group'` to `MARK_NAMES` as a fallback; (c) `app-trail.js`: a place for the same tab and person replaces the older one (dedupe by tab + person id); (d) the menu badge gets `title`/`aria-label` "N to do, M awards to announce", and the Tonight group header shows both counts separately.
3. Data: none.
4. Tests: node: `season.test.js` describe of a `g` change has no "g:"; browser: Awards heading text contains "Announce on 11/18"; `trail-browser` visiting the same person on two sub-tabs leaves one chip; `todo-badge-browser` the menu badge label names both counts; 390 for the badge.
5. Docs: none beyond CHANGELOG.
6. Risk: none.
7. Effort: S.

### UX-28 "Binders" means four things
1. Verified: Reports sub-tab Binders (`index.html:219`), the Binders… button (`:227`), the bundle name (Options bundles), and How it works "Four groups" (`:570`).
2. Change: keep **Binders** as the Reports sub-tab only; the button becomes "Print class binders…" inside that sub-tab only; the bundle is renamed "Quarterly printables" where it says Binders; the Options section is "Report bundles" (it already is, `app-options.js:153`).
3. Data: the default bundle's name is in `config.bundles` only when a club changed it; renaming the DEFAULT label is code. A stored custom bundle keeps its name. No format change.
4. Tests: `binders-dialog-browser`, `binders-paper-browser`, `bundles-browser`, `reports-subtabs-browser` (text matches); 390 and 1280.
5. Docs: How it works (Reports), README if it names the button.
6. Risk: text-matching tests.
7. Effort: S.

### UX-29 Options: index and clear separation between sections
1. Verified: the Options page renders about a dozen `pcard` sections in one column (`app-options.js:168-200`: Books with T&T order, Club settings, Awana store points, Report bundles, Earlier years, New season, Updates and auto-save, Bug reports, Google Drive, Data checks, with more `h4` parts inside Club settings); the Options/Validate/Debug sub-nav is repeated at the top of three sections (`index.html:242`, `:247`, `:256`). Cards are separated only by a 12px margin and a thin border (`style.css:252`).
2. Change: (a) a sticky index at the top of Options (a `nav` with one link per section, wrapping on a phone, a `<select>` "Go to section" under 600px), and each section gets an `id` and a `tabindex="-1"` heading so the link moves focus; (b) clear separation: each section a full card with a heading bar (`--head` background, 16px bold, an icon-free rule under it), 24px between cards, and the section number in the index; (c) Validate and Debug move behind the version link (`#verLink`) and stay reachable from the index's last entry "Validate and Debug"; the repeated sub-nav goes. Collapsing sections: not by default (search with "/" and the Help links target sections by id).
3. Data: none.
4. Tests: `options-browser`: every index link moves focus to its section; the index stays visible while scrolling (sticky) at 1280; at 390 the select jumps; computed style: each section card has the heading background and at least 24px margin; no horizontal scroll at 390, 430, 600. `debug-scripts-browser` reaches Debug via the version link.
5. Docs: How it works (Options, Debug), README Folder layout Options line.
6. Risk: links into Options from (i) notes and Help (`#m-opt-*` ids are in the manual, not Options; check `App.showTab('options')` callers that scroll to a section).
7. Effort: M.

### UX-30 Targets and contrast
1. Verified: phone checkboxes are 22px (`style.css:326`; To do and Uniforms labels already 44px, `:477`); (i) is 15px (`style.css:413`); placeholders use `--offtxt:#999` (`style.css:2`) and `.none { color:#999 }` (`:76`), 2.85:1 on white; the move button ⇄ is 12px at opacity .7 (`style.css:461`); links use `--link` (`:2`) but several rules set their own colour (`:180`, `:181`, `:224`).
2. Change: on a phone, every row checkbox sits in a 44px label (the `:477` pattern extended to `table.roster td label`); (i) 24px on desktop (font 13px); `--offtxt` to `#6b6b6b` (5.3:1 on white; check dark theme `#7b8594` on `#1c2128`, about 4.6:1) and `.none` to `var(--offtxt)`; ⇄ 16px, opacity 1, 44px target on a phone; one link colour (`var(--link)`) except `.chip` and `a.ver`, which are not links in the reading sense (state it in a CSS comment).
3. Data: none.
4. Tests: `touch-targets-browser`: row checkboxes' clickable box is at least 44px at 390 and 430; (i) is 24px at 1280; contrast of `.none` and placeholders at least 4.5:1 in light and dark (the existing contrast helper in that file); ⇄ size.
5. Docs: none beyond CHANGELOG.
6. Risk: denser tables on desktop get taller; only the phone rule changes row height.
7. Effort: S.

## 4. Build order
Each batch ends with its gate green, its docs updated (section 0) and a short note for Mike. Nothing is committed or deployed by the batch itself. "Full sweep" = `NODE_PATH=<playwright dir> sh dev/tools/run-tests.sh`, expected: everything passes except the known baseline (section 0).

| Batch | Items | Why here | Gate (must pass before the next batch) |
|---|---|---|---|
| **1. Small safe fixes** | CR-10, CR-08, CR-11, CR-13 (hardening or close), CR-14 (git rename, README), UX-27, UX-21, UX-30, UX-16 | No new UI system, no data change; CR-10 first so later code uses one club-night rule | node: `season`, `validate`, `absences`, `todo-emergency-note`, `versions`, `docs-in-step`, `data-format-doc`, `gitignore`, the new club-night rule test; browser: `todo-emergency-note-browser`, `absences-browser` (with the `\|` id), `book-todo-browser`, `a11y-browser`, `touch-targets-browser`, `attend-steps-browser` (UX-16 labels at 390), `trail-browser`, `todo-badge-browser`, `update-autosave-browser`; full sweep |
| **2. CR-09, then CR-12** (own careful run) | CR-09; CR-12 on top | Changes numbers on Statistics, Pace, store points, Blue Jewels and turnout in node; must be alone so any number change is traceable | new `held-nights-agree.test.js`; `stats`, `stats-nights`, `store`, `pace`, `held`, `season`, `absences`, `print-b9-items`, `teamplan-warnings`, `teams-gaps`, `reports-season` (Mike, real files), `stats-nights-browser`, `absences-browser`; full sweep; Mike opens the real file (outside the repo) and checks Statistics nights counted, a Sparks child's Blue Jewels and store points are unchanged in the browser |
| **3. UX-20 step 0: the helper** | `app-ask.js`, `#ask`, `App.done` Undo flash, `test/lib/app-dialogs.js`, all 100 dialog-handling test files switched to `onAppDialog` (forwarding native dialogs), `no-native-dialogs.test.js` with OPEN = 98 | Everything after it uses the helper; the test switch is mechanical and proven before any app call site moves | `app-ask-browser` (all cases, 390/430/600/1280), `no-native-dialogs`, `versions` (load order), full sweep with no change in results |
| **4. UX-20 step 1: club-night tabs** | 34 sites (section 2.2) | The weekly flows first | the touched tests in 2.3 (`blue-hand-browser`, `date-fixes-browser`, `date-overtype-browser`, `given-early-warning-browser`, `awards-recalc-browser`, `attend-person-browser`, `progress-reviews-browser`, `book-todo-browser`, `todo-date-entry-browser`, `assumed-given-browser`, `told-no-date-browser`, `hand-out-given-browser`, `clear-nodate-browser`), `no-native-dialogs` (OPEN 64), full sweep |
| **5. UX-20 step 2: Roster, Color teams, Calendar** | 21 sites, incl. the Add column form | | `teamgrid-browser`, `teams-preview-browser`, `teams-new-year-browser`, `table-wrap-browser`, `leftovers-browser`, `uniform-order-browser`, `mid-quarter-moves-browser`, `no-native-dialogs` (OPEN 43), full sweep |
| **6. UX-20 step 3: files, import, merge, Drive, update, new season, Restore, Binders** | 33 sites | The riskiest flows (sync `resolveDraft`, Restore x3) after the pattern is proven | `browser.test.js` (Mike, real files) or at least its Restore and New season parts run on TEST data, `fresh-start-browser`, `import-browser`, `import-button-browser`, `import-conflicts-browser`, `merge-files-browser`, `drive-browser`, `drive-inplace-browser`, `drive-autosave-browser`, `update-autosave-browser`, `binders-dialog-browser`, `save-dot-browser`, `past-years-browser`, `no-native-dialogs` (OPEN 10), full sweep |
| **7. UX-20 step 4: Options, Debug, Store** | 10 sites; OPEN map deleted; tripwire on in every browser test | Closes UX-20 | `books-browser`, `bundles-browser`, `bug-button-browser`, `assumed-given-browser`, `store-browser`, `options-browser`, `no-native-dialogs` = 0, full sweep with the tripwire (no native dialog anywhere) |
| **8. Phone header and navigation** | UX-10, UX-19, UX-09, UX-06, UX-07 | Same bar and menu; after UX-20 so the overflow menu and search exist once | new `topbar-phone-browser`, new `search-browser`, `header-browser`, `more-menu-browser`, `trail-browser`, `person-bar-browser`, `pinned-person-bar-browser`, `flag-anything-browser`, `save-dot-browser`, `import-button-browser`; all at 390/430/600/1280; full sweep |
| **9. Words and pickers** | UX-14, UX-28, UX-15, UX-17 | Text churn in tests; one batch so each test is edited once | `wording.test.js`, `quarter-browser`, `roster-quarter-browser`, `bundles-browser`, `binders-dialog-browser`, `reports-subtabs-browser`, `table-wrap-browser`; full sweep |
| **10. Club night workflow** | UX-05, UX-12, UX-11, UX-25, UX-23, UX-22 | Built on the helper (Undo flash) and the night labels (UX-16) | new `start-tab-browser`, `todo-tonight-browser`, `card-captions-browser`; `games-both-browser`, `uniform-order-browser`, `todo-badge-browser`, `todo-book-medical-browser`, `data-format-doc` (startTab row); full sweep |
| **11. Larger restructures** | UX-18, UX-24, UX-13, UX-29 | Each touches a whole tab | `teams-preview-browser`, `teamgrid-browser`, `pc-capture-browser`, `leftovers-browser`, new `new-season-checklist-browser`, `options-browser`, `debug-scripts-browser`; full sweep |
| **12. UX-08 prototype (only if Mike says go)** | UX-08 | Conditional | the test in UX-08 (4), then Mike's club-night trial |

**Release after any batch Mike wants to ship** (standing steps): bring CHANGELOG, How it works, the README test list and BACKLOG up to date (and DATA-FORMAT for UX-05); `sh make-deploy.sh`; full sweep on dev; Mike runs `node dev/tools/check-docs-for-names.js <real-data.json>` with the real file outside the repo; commit on `public` (never real names or phone numbers); push only when Mike asks (`public` to `origin main`; a normal push adds commits on top of the single public commit); hard-refresh the live page and check the version (H2).



## 5. Decisions Mike must still make
| # | Question | Recommendation |
|---|---|---|
| D1 | CR-09: a person id with marks but no roster entry (removed from the roster): does their mark make a night held? | **Yes, keep today's rule** (counts as a child). It changes no current number; the old-year fault is fixed anyway because each file is judged by its own roster. |
| D2 | CR-13: build the small hardening (drop a carried copy older than 10 minutes, after downloading it) or close as already fixed? | **Build it** (S, one test). Otherwise mark CR-13 "already fixed (app-update.js:65)". |
| D3 | CR-14: delete local branch `public-old-do-not-push` now, or after GitHub Support confirms the old commit is purged? | **After the purge**, and set its `pushRemote` to `no-push` today. |
| D4 | CR-14: where are the migration inputs and old Sheets exports now (README `:23`, `:79` say `archive/`, which does not exist)? | Tell me the place (it is outside the repo, with the real data, if it holds real data); README then says "moved out of the repository" without a path if the path is private. |
| D5 | UX-20 Add column: offer all five kinds (`x_`, `award:`, `att:`, `prog:`, `team:`) or only the ones still used? No code reads `att:`, `prog:` or `award:` columns except as plain columns. | **All five**, Club field first and default, so nothing is lost. |
| D6 | UX-20 `app.js:1029` Re-draw whole quarter: do-then-Undo, or the Fill preview (Confirm / Draw again / Cancel) like T5? | **The preview**, then Undo after Confirm; it matches Fill and Assign blanks and UX-18 merges them anyway. |
| D7 | UX-05: what does a file with no `startTab` open on? | **Roster** (today's behaviour; the TEST files and ~100 browser tests assume it). Options offers "Tonight's tab on a club night". |
| D8 | UX-11: fill the fourth place automatically when three are set? And ties? | **Auto-fill only when the three set places are distinct** (1, 2, 3 gives the fourth 4); ties allowed and never auto-filled. |
| D9 | UX-14 glossary: Class (not Room), Clubbers and Volunteers (not kids/adults) in labels. | **Yes**, and "children" stays in sentences. |
| D10 | UX-29: Validate and Debug only behind the version link and the index's last entry (the sub-nav goes)? | **Yes.** |
| D11 | CR-07 (REVIEW-LOG still says "open"; not in this plan's list): close it (1.51.13 was rebuilt and is live) or add the deploy-versus-dev version test it asked for? | **Add the small test** in batch 1 (`make-deploy.test.js` already exists: extend it to compare `deploy/app/index.html` app-version with dev after a build), then close CR-07. |

## 6. Not verified
- No browser was run for this plan. Measurements quoted from the review (UX-07 name at y=507, UX-10 Flag at x=386, UX-21 989 focus stops, UX-23 23,389px, UX-30 2.85:1) were not re-measured; the markup and CSS that cause them were checked.
- UX-27 (c), "Person · Adeline Ariana" listed twice in Recent places, was not reproduced from the code.
- Whether every **U** site in 2.2 is exactly one Undo step (one `touchSeason` call, not on a staged draft tab) was checked by reading the call path for the main ones, not each of them; the plan says to check each before converting.
- `browser.test.js`, `anonymized-data.test.js` and `reports-season.test.js` need real files; their dialog handlers (13 in `browser.test.js`) can only be checked by Mike.
- CR-09's effect on the REAL file (whether any volunteer-only nights exist in it) is unknown; the browser already used a roster-based test, so browser numbers should not move. Mike's check in batch 2 confirms it.
- Whether History tag renames (`app-season.js:1187`) are undoable was not checked.
- Phones (real devices), tablets, screen readers, dark mode beyond the contrast numbers, and print were not checked.
- The tests were not run for this plan (plan only).

## 7. Summary
Seven code items and 25 UX items remain (CR-08 to CR-14; UX-05 to UX-30 except UX-26, which is fixed; UX-08 is conditional; UX-04 is rejected and UX-01 to UX-03 are fixed). Checked against the code: CR-08, CR-10, CR-11, CR-12 and CR-14 are as reported (CR-10's fourth "copy" in `app-season.js:1224` already uses `Calendar.isNight`; CR-11 has a fifth `|` split at `app-todo.js:220`); CR-09 is real (a module-level child test set only by `app-season.js:1223`), and the fix is to derive the test from the file's own roster inside `Season.heldNights`, so Statistics, store, Pace, Dates attended, Blue Jewels, turnout and volunteer expected nights agree by construction; CR-13 is already fixed in the code (`app-update.js:65`, tested), leaving only an optional stale-copy guard. UX-20 has 98 native call sites (55 alert, 33 confirm, 10 prompt), not 97; the plan adds one `App.ask` helper on a second `<dialog id="ask">` (so it can sit above `#dlg`), a do-then-Undo flash, and a test shim that keeps the existing `page.on('dialog')` handlers working unchanged, then converts the sites in four area steps with a shrinking guard test. No item changes the data format in a way that needs `Season.VERSION` to move; UX-05 adds one `config` key (kept by older copies). Build in twelve batches: small fixes, CR-09 alone, the helper, the four UX-20 steps, then the phone header, wording, club-night workflow and the larger restructures, with UX-08 only after a prototype passes the stated test; release steps and the names check stay as in section 0.
