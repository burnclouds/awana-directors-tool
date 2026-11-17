# Review log (for adjudication)

Findings and recommendations from the review agents. Nothing here is fixed yet. Each item gets a decision: **accept**, **defer**, or **reject**, with the reason. Status column is updated after the decision.

Sources:
- **Code review** (Fable agent, read-only), 2026-11-16: history `e45ccd4..09b0567` on `public`, plus the uncommitted 1.51.13 to 1.51.15 work.
- **UI and UX review** (Fable agent, read-only): pending. Its items will be added here when it reports.
- **Screenshot comment** (Mike, Reports > Binders, live 1.51.12q): two quarter controls, the lower one does nothing. Covered by CR-06 and UX-01/UX-02.

## Code review findings

| ID | Severity | Where | Finding | Suggested fix | Status |
|---|---|---|---|---|---|
| CR-01 | high (privacy) | dev/tools/make-test-data.js:113, :235; app-person.js:294 | Anonymizer replaces only 9 and 10 digit phone numbers. Emergency phone accepts 7 digits or more, so a 7 or 8 digit number passes into the public test data. | Replace every digit run in phone fields; fail the build if any 7+ digit string survives. | **Fixed in 1.51.13 (unreleased).** `anon-pc.js` pattern and leak check; tests `anon-phones`, widened `anonymized-data`. **Run on the real files 2026-11-16 (Mike gave permission): 0 real phone numbers survive, and none of the 101 real 7-9 digit runs are in the published files (only dates matched), so nothing needed purging.** The run also found three other tool faults, now fixed (see CHANGELOG 1.51.13): real person IDs in `config.teamPlan.proj`, History entries dropped whole, and real addresses in History address changes (not in the published data). Still open: the tool ends in PROBLEMS only because the export on hand (Oct 29) is older than the data file (Nov 13): it needs the Nov 13 Planning Center export. |
| CR-02 | high | reports.js:109, :113, :110; app-person.js:293; todo.js:63 | Binder prints any text as the parent phone (e.g. "N/A") and it overrides the real emergency number. To do requires 7 digits; binder does not. | One shared `Model.parentPhone` (7+ digits) used by reports and To do; add a test. | **Fixed in 1.51.13 (unreleased).** `Model.parentPhone`, `regContactPhone`, `clubPhone` and the Person tab Use buttons need 7 digits; "N/A" is skipped silently on paper (test `emergency-phone`). |
| CR-03 | high | season.js:50, :126; merge3 season.js:1251 | `absences` is not in `blank()`, so a file without absences opens as undefined. Merge raises a whole-section conflict when a leader adds the first absence. | Default `absences: {}` on open, or treat undefined as `{}` in merge. Check `blueWings` and `extraSheets` too. | **Fixed in 1.51.13 (unreleased)** in `merge3` (eight sections were affected; tested in `season-sections`). |
| CR-04 | medium | datamerge.js:20, :30, :160 | `Volunteer absences` is missing from `CATEGORIES`, so merge summaries count the rows but do not list them. | Add the category; test every `categoryOf` result is in `CATEGORIES`. | **Fixed in 1.51.13 (unreleased)**; also a guard lists any unknown category under Other (`datamerge.test`). |
| CR-05 | medium | app-stats.js:18, :22, :27 | Night-by-night table passes an array to `table()` without `.join('')`, which can insert commas between rows. Read from code; not seen in a browser. | `.join('')`; add a browser check for stray text outside the table. | **Fixed in 1.51.13 (unreleased)**; `table()` joins a list of rows; checked on screen and in print (`stats-nights-browser`). |
| CR-06 | medium (real bug, matches Mike's screenshot) | style.css:25, :450; app.js:777, :818, :888-889, :897; reports.js:256 | With a bundle selected, `dateBar.hidden` is overridden by `.bar {display:flex}`, so the lower Q1-Q4 bar stays visible. Pressing it changes the app-wide quarter (Roster, Color teams) but not the printout. The top select is what prints. | Add `[hidden]{display:none!important}`. Hide the lower bar in bundle mode. Test with computed style. | **Fixed in 1.51.13 (unreleased)**: global `[hidden]` rule; bundle mode keeps only List order and Title in the lower bar (`hidden-attr-browser`). |
| CR-07 | medium | CHANGELOG.md:5, :7; deploy/app/*; dev/app/index.html:6 | Changelog says 1.51.13 is committed (it is not) and 1.51.15 is built in `deploy/` (deploy is at 1.51.14 with older file versions). Pushing now would publish 1.51.14 while the changelog describes 1.51.15. | Re-run `make-deploy.sh` before commit; correct the Published line; add a test that deploy and dev versions match. | open |
| CR-08 | medium | todo.js:63, :70, :77-79 | A child with no emergency phone is reported twice in To do, and an inline copy of `Model.emergencyPhone` can drift. `noName` is dead code. | Keep one To do entry; use `Model.emergencyPhone`; remove `noName`. | open |
| CR-09 | medium | season.js:560-565; app-season.js:1223; model.js:488 | Held-night rule depends on a global child test set only by the Attendance app. Node tools count volunteer-only nights as held. Someone off the roster counts as a child for old-year imports. | Pass the child test as an argument to `heldNights`; add a test that Stats, store, pace and Attendance Summary agree on a volunteer-only night. | open |
| CR-10 | low | calendar.js:20; season.js:540; validate.js:229; app-season.js:1224 | Three copies of the "club night" rule. | Use `Calendar.isNight` everywhere. | open |
| CR-11 | low | app-season.js:335, :402-404; app-todo.js:181; app-person.js:328 | Absence buttons pack `personId|absId|date` and split on `|`. An ID containing `|` makes Clear do nothing or the wrong thing. | Separate data attributes. | open |
| CR-12 | low | season.js:936-957; app-person.js:45-52 | Person table lists calendar club nights; "Present X of Y expected" uses held nights. The two can disagree. | Label the line "held nights", or mark non-held rows. | open |
| CR-13 | low (privacy, pre-existing) | app-update.js:46-51 | Update-now puts the whole data file in sessionStorage; the key is removed only on a successful restore path. | Remove the handoff key at first read, before parsing. | open |
| CR-14 | low | README.md:23, :26; git config | Local `main` holds private history and tracks nothing public; a forced `git push origin main` would publish it. README still mentions an `archive/` folder. | Rename local `main` to `private`, or set `pushRemote` to a dead remote; fix README. | open |

## Test gaps reported
- No merge test for absences (CR-03, CR-04).
- No anonymizer test for `x_EmergencyPhone` or short phone numbers (CR-01).
- No binder test for a non-numeric parent phone (CR-02).
- No visibility test by computed style (CR-06).
- No deploy-versus-dev version test (CR-07).

## UX items (UI and UX review, v1.51.15, desktop 1280 and phone 390)
Checked in headless Chromium on test data only. Screenshots are in the review scratchpad (`ux/`). **UX-01, UX-02 and UX-03 are reproduced layout defects**, not matters of taste.

| ID | Area | Where | Finding | Suggestion | Status |
|---|---|---|---|---|---|
| UX-01 | 4, 2 | Reports, phone | Seven `hidden` controls still show on phone (`.bar label {display:flex}` at style.css:326 beats `[hidden]`), including a stray second Quarter that reads Q1 beside Q2 pills. | `[hidden]{display:none!important}` or scope the phone rule to `label:not([hidden])`. | **Fixed in 1.51.13 (unreleased)** with the same global rule as CR-06. |
| UX-02 | 4 | Reports, both sizes | Toolbar uses class `rhead`, the same as the printed header (style.css:147). Desktop toolbar wraps to 3 rows; phone page scrolls sideways to 680px. | Rename one class, or scope the print rule to `#report .rhead`. | **Fixed in 1.51.13 (unreleased)**: scoped to `#report .rhead`; long page names wrap on a phone (`hidden-attr-browser`). |
| UX-03 | 2 | Attendance, phone | Night and Room steppers: the "next" button covers the select, leaving a few px of select visible at 390, 430 and 600 wide. | Fixed 44px button, flexible select, fixed 44px button; add a geometry check. | **Fixed in 1.51.13 (unreleased)** with Mike's decision: 44px-wide, 38px-tall stepper buttons (note in `style.css`; `attend-steps-browser`). |
| UX-04 | 3 | Attendance | Room and night are not remembered between sessions. | Remember last room per device; "Next room" at the foot of the table. Show the room name prominently (shared laptops). | open |
| UX-05 | 3 | App start | Lands on Roster after opening; club-night tabs are one step further. | On club night (or the day after), land on Attendance or To do; make it an option. | open |
| UX-06 | 2 | Phone menu | Accordion shows only the current group: Roster to Attendance is 3 taps. | Keep the Tonight group always open, or a 4-button bottom bar. | open |
| UX-07 | 1 | Phone header and filters | "Recent places" row on every tab; Person filter bar has nine controls, pushing the name to about y=507. | Move Recent places into the menu; collapse filters behind one "Filter" disclosure with a summary. | open |
| UX-08 | 2 | Help, phone | All (i) icons and info boxes hidden at phone width (style.css:423); long intro paragraphs always shown. | One "?" per tab opening the same text as a sheet; fold long intros into it. | open |
| UX-09 | 2 | Person search | Quick search opens only with "/"; no button on phone. "bo" ranks Rixdale and Shailie above Bodhi and Boone. | Magnifier button in top bar; rank name-start matches first. | open |
| UX-10 | 2 | Phone top bar | Bar scrolls sideways; Flag is off screen (x=386 of 390); "1 unsaved edit" pushes Undo off screen. | Unsaved state on the Download button; Flag and Redo into an overflow menu. | open (defect) |
| UX-11 | 3 | Color team games | 16 dropdowns per night. | Tap-to-set buttons; fill fourth place when three are set. Ties need handling. | open |
| UX-12 | 3 | To do | No per-night summary: rooms entered n of 11, games entered, awards to announce. | "Tonight" strip at top of To do with jump links. | open |
| UX-13 | 3 | New club year | Rollover is four steps across four tabs, in a fixed order. | "New season…" opens a checklist linking each step. Needs tests. | open |
| UX-14 | 4 | Wording | Room vs Class; "Kids + volunteers" / "Clubbers and adults" / "Kids" / "children"; "Active only" select vs "show inactive" checkbox. | Pick one term per concept and one control per filter; update manual and tests. | open |
| UX-15 | 4 | Quarter pickers | Quarter chosen five ways. Color teams showed Q2 in the bar and Q3 in the balance pills on one page. | One pill component; label second pickers with different scope ("Balance for:"). | open |
| UX-16 | 4 | Night pickers | Monday 11/16: Attendance and Games opened on 11/11, Awards on 11/18, unlabelled. Reports shows "2026-11-11", elsewhere "Wed 11/11 (Q2)". | One date format; tag "(last)" and "(next)". | open |
| UX-17 | 1 | Roster | Two filter layers (bar selects and column row); a child's class can be changed five ways. | Keep the column row; keep "Move…"; make in-row Room read-only text. | open |
| UX-18 | 1 | Color teams | "Assign blanks" and "Fill N blank colors" overlap; six buttons in the bar. | One fill button with scope; Import, Save CSV, Re-draw, Start new year under "More ▾". | open |
| UX-19 | 1 | File menu | Import only under the caret of "Download data file". | Separate "File ▾" menu, or rename the caret "Open / Import". | open |
| UX-20 | 2 | Dialogs | 97 native alert/confirm/prompt calls; "Add column" prompt needs a prefix syntax. | Move frequent ones to the app dialog; "Kind" pick-list; do-then-Undo instead of confirm where undoable. Start with the weekly five or six. | open |
| UX-21 | 2 | Keyboard | Tab stops on two invisible file inputs (`#fileMerge`, `#fileAny`); no skip link; 989 focus stops on Roster. | `tabindex="-1"` on the two inputs; "Skip to content" link. | open |
| UX-22 | 2 | Phone cards | Column headings vanish; some controls unlabelled (Hold checkbox, emblem colour box, children number). | Visible caption on each control in card layout. | open |
| UX-23 | 1 | To do | 86 items, 23,389px tall on phone; name link and "Open Person page" go to the same place. | Collapse by class with counts; "to check" collapsed by default; drop one opener. | open |
| UX-24 | 1 | Roster Edit vs Person Registration | Two editors for one record; Edit shows about 35 raw fields. | Edit opens Person Registration, or group the dialog. | open |
| UX-25 | 3 | Uniforms | Three date boxes per row, each with Today; no bulk action. | "Mark filtered rows ordered / received today", with Undo. | open |
| UX-26 | 4 | Statistics, Attendance | Stray ",,,,,,," above the "Night by night" table. Seen in screenshot only; not traced. | Find the join and drop empties. Note: same cause as CR-05 (array passed to `table()`), so likely fixed by CR-05. | **Fixed in 1.51.13 (unreleased)** by CR-05. |
| UX-27 | 4 | Small text | "Announce on11/18" (app-season.js:526); Undo tooltip "g: marked"; "Person · Adeline Ariana" listed twice; phone badge 40 vs To do count. | Fix each. | open |
| UX-28 | 1 | Reports terms | "Binders" is a sub-tab, a button, a bundle label and an Options section. | One word; one entry point. | open |
| UX-29 | 1 | Options | 16 sections on one page; Options/Validate/Debug sub-nav repeated in three sections. | Sticky section index or collapsible sections; Debug behind the version link. | open |
| UX-30 | 2 | Targets and contrast | Row checkboxes 22px on phone; (i) icons 15px on desktop; "—" placeholder #999 at 2.85:1; ⇄ at 12px, opacity .7; two link colours. | Pad to 44px on phone; (i) 24px; darken placeholder; one link colour. | open |

**Kept, per the review:** Tab order across rows; every control named; focus rings; Undo always present; unsaved and Hold indicators; no script errors on any tab.

**Not checked by the review:** real devices, tablet widths, screen readers, dark mode, 200% zoom, printed output, import/merge/Drive/update flows, several dialogs and Statistics sub-tabs 2 and 3.

### From Mike's comment (Reports > Binders)
| ID | Finding | Suggestion | Status |
|---|---|---|---|
| MC-01 | Two quarter controls in bundle mode; the lower one does nothing to the printout. | In bundle mode show only the top Quarter select; move List order up beside it. | **Fixed in 1.51.13 (unreleased)** (List order and Title stay in the lower bar in bundle mode). |
| MC-02 | Top bundle quarter (next quarter by default) and app-wide quarter (current) can differ, with no label explaining why. | Label the top one "Quarter to print". | **Fixed in 1.51.13 (unreleased).** |
