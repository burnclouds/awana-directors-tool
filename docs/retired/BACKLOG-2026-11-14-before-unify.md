# Backlog (cleaned 2026-11-14)

Only what is still open. Everything built, fixed or closed was moved, word for word, to `docs/retired/BACKLOG-full-2026-11-14.md` (search it for the R-number, the date or the feature). The review notes, UX review and mobile feedback are in `docs/retired/` too. Specs and plans stay in `docs/superpowers/`. What changed in each version is in `CHANGELOG.md`.

## State on 2026-11-14

- **Live: 1.51.10 (deployed 2026-11-14)**, including everything that was 1.51.09b, the color-team fixes and warnings, and **data file version 6** (an older copy refuses a version 6 file, so every phone needs Update now). Dev equals live.
- Last full test sweep before deploy (`sh dev/tools/run-tests.sh`, 2026-11-14): 171 ok, 3 skipped (need real files), 0 failed. Name check against the real data file: clean as of 2026-11-14 morning (not re-run after the later edits).
- Not committed: the work since the last commit, including the rebuilt `deploy/`, is uncommitted on branch `settings-in-file`.

## After the 1.51.10 deploy

1. Hard-refresh the live page; the splash and header should say 1.51.10, and the Debug tab shows every file's version.
2. By hand: Options › Color team balancing (set the history option); run `dev/tools/check-file.js` count-only on the real file (R16). (History › Reconcile History on the working file: already done, per Mike 2026-11-14.)
3. Before the next club night, replace the calendar after New season (it still carries last year's), and check a returning child's store points after the first import.
4. Real-device checks that cannot be tested here: phone check R12 (`docs/playtest-checklist.md`, "Phone: R12"); a real Google sign-in for R11 (after an hour, on a phone, after Update now); PWA install prompt in Chrome; the Debug panel's "S old or not registered" row on the live page (see which script it names).

## Small open items

Closed 2026-11-14 (in dev, see CHANGELOG "Small leftovers closed"): `renameAward` and `announcedNoDate` (the `blueDrops` half was a false alarm: they hold a gem number and day, not a name); `currentBook` and hidden no-date days; `App.canUndo` removed; the Import help sentence about an older export; Drive tests H (a further edit after a save that was edited over) and I (cancelled merge screen); the README and CHANGELOG 1.51.x versioning line. Closed as fine as it is: awards "Ignore" has an undo (the "no date" tick on the Progress sheet, `told-no-date-browser`); the To do and Validate "no emergency contact" checks stay (the binders print the parent's phone, the contact's name stays the Planning Center emergency contact).

- R20, not built (no evidence they happen in the real file): Planning Center refresh logging, the re-apply at open, open-time tidying, the save-time net.
- Drive tests G, L, D and 3.5 are written (`drive-autosave-browser.test.js`, 20 pass; breaking the "ask once" rule turns G, H, L and A red). Not covered: the Drive folder-refused case in the in-place style (only the dated style is tested).
- Real-file tests (`weekly-slips`, `attendance-fill-print`, `cubbies-record`, `coaches-binder`) now read `dev/test-inputs-REAL-DATA-do-not-commit/` (four copied files, git-ignored by folder name, with a README) and skip if it is missing. They are the only reason real children's data sits in the repo tree: move them onto the TEST data in `dev/test-data` over time, then delete that folder. `reports-season.test.js` still takes its inputs as arguments.
- To do inline entry: handbook code box, color team Best choice and printing updated medical sheets look built (`todo-book-medical-browser.test.js`); confirm and strike.
- Many older items are marked "built, not checked by eye in a browser" in the archive (Dates attended report, page checkboxes, Book completed row, Restore typed phrase, Blue Jewel screens). Tests pass; do one eyeball pass when convenient.

## Fable review of color teams and printed layouts (2026-11-14; full text and file:line in `docs/reviews/REVIEW-2026-11-14-colorteams-and-print.md`)

Findings were confirmed by the reviewer (node, browser, real PDFs on TEST data) but not re-checked by hand. The planner itself is sound (all 11 color-team test files pass); the problems are the layers around it and the printed pages. Ranked, do soon:

1. **DONE in dev 2026-11-14 (A1, A3, A4, A5; `teams-effective-fixes.test.js`).** Printed color lists, the coaches list, binders printed in the quarter, To do, the Lock count, Assign blanks and the grid counts now use the color each child plays now. Left: the attendance sheet with a night from another quarter, and a one-night fill-in on a quarter-long binder sheet (the reviewer's A1 side note) are unchanged.
2. **DONE in dev 2026-11-14 (A2).** Assign blanks, Re-draw and the To do dry run leave No team children alone.
3. **New printed progress sheet (B1; design in section 5 of the review).** Today's print is the entry form with empty boxes hidden: nothing to write in, no initials, no tie from sections to awards. Needs Mike's five decisions below. Medium.
4. **Binders button prints attendance on portrait paper (B3).** Small.
5. **Puggles attendance sheet has no boxes (B2).** Small.
6. **No Photos list prints medical notes (B5).** Privacy; small.
7. **DONE in dev 2026-11-14 (A8, A9; `teamplan-warnings.test.js`, `teamgrid-browser`, `team-balance-browser`).** Every hand pick warns, a repeating cell is marked, "already had" ignores the plan's projection, size warnings wait until everyone has a color, and the two vacuous assertions now test real behavior.
8. **DONE in dev 2026-11-14 (A6, A7; `teams-new-year-browser.test.js`).** Start new year clears No team marks, moves and accepted repeats; New season archives last year's colors and says the calendar must be replaced. Open: nothing replaces the calendar for the leader; New season still carries last year's calendar until they do.

Color team "later" items DONE in dev 2026-11-14: deterministic shuffle; the calendar quarter instead of a leftover Reports choice; the phone grid (150px quarter columns); stale text and `COLOR-TEAMS.md`; validator check for a move outside its quarter; the year label check (A11); the lopsided note; test gaps (No team with Assign blanks, Start new year, New season, a printed list after a move, a move in an open quarter, blend at 20+ nights, merge of two moves). Still open on color teams: Recalculate after a child leaves (no test, no known bug); two leaders each placing a new child on the smallest team (sizes are not re-checked after a merge); a color typed in other capitals in an old file (the planner and the grid ignore it, the old audit counts it); New season still carries last year's calendar until it is replaced by hand; Fill and Assign blanks pick at random with no preview, by design.

Print (not color teams), still open: no-date day printed as Earned date on three award lists (B6); Statistics print cut off at the right (B4); the Binders button on portrait paper (B3); the Puggles sheet (B2); No Photos prints medical notes (B5); emergency pages at 12px, names left-aligned, a "Printed" date on binder pages.

**New printed progress sheet: TABLED 2026-11-14 (Mike).** Decisions already made, for when it resumes: (1) initials on paper only, not a field in the app; (2) a held award prints as plain earned, no `HOLD`; (3) announced dates are not on the sheet; (4) add the T&T Discovery Award emblems (Blue, Red, Green, Yellow) and the Extra Credit Silver and Gold emblems to the T&T template; (5) Cubbies stay one box per unit. Still open before building: which sections earn those T&T emblems (the project does not say; they are in the award list and in no template, so adding blocks also needs an upgrade path for older files), and whether the new sheet replaces the Achievement Record body. The internet awards guide Mike uploaded was cross-checked against awana.org and the Awana store on 2026-11-14 (memory `awana-awards-guide-validation`): it is wrong on Pilot Wings, Blue Jewels and the Cubbies lesson count, and does not settle the Discovery emblems, which the store describes only as "earned for finishing handbook sections". Ask the T&T director or check the current T&T leader guide.

## Waiting on a date or an answer

- Pace thresholds: on hold until about 2026-11-25.
- Cubbies record layout and pace windows (needs Mike).
- Reopen with a screenshot or sketch if wanted: flag 2 (cell borders), flag 14 (handwriting layout), flags 12 and 13 (PDF to Drive).

## Decided not to build

Photo-to-progress agent and the patch import; sibling / household emergency contacts; fill-down; GitHub setup; friend placement and the Visitor tab; the combined Person/Progress view; color-team per-class rules and a separate mid-quarter move; a browser draft for crash safety (R9, covered by the unsaved-edits words and Save bar); splitting `app-season.js` (R14 part B); rewriting git history while there is no remote (rule: never add a remote or push without first rewriting history to drop the names and running `dev/tools/check-docs-for-names.js <real-data.json>`).
