# Backlog: the one list (unified 2026-11-14)

This is the only place open work is tracked. The two review files in `docs/reviews/` are records, not lists. Things built, fixed or closed are archived, newest first: `docs/retired/BACKLOG-done-2026-11-20.md` (everything closed up to 2026-11-19, including the old State notes, the volunteer-absences design and the full N37 text), `docs/retired/BACKLOG-done-2026-11-19.md` and `docs/retired/BACKLOG-full-2026-11-14.md`; the version before the 2026-11-14 rewrite is `docs/retired/BACKLOG-2026-11-14-before-unify.md`. What changed in each version is in `CHANGELOG.md`. To find a closed item by its ID (N9, N38, S11, ...), search the archive files.

## How to use it

- Every item has an ID and a checkbox. `[ ]` open, `[x]` done. When an item is done, tick it with the date, version and test; at the next clean-up its whole line moves to a new `docs/retired/BACKLOG-done-<date>.md` and this file keeps only open work.
- **Check** says how the item was last verified. `V 2026-11-14` means verified against the code that day; the test name is the thing that turns red when it is fixed.
- Open items that can be checked without a browser have a check in `dev/app/test/backlog-open-items.test.js`. That file lists them in `OPEN`; the run stays green while they are open and goes RED ("now passes: close it in BACKLOG.md") the day one is fixed. When you fix an item: remove it from `OPEN`, tick it here.
- Priority: **P0** before the next club night; **P1** a leader can be hurt by it (privacy, wrong paper); **P2** wrong or missing content on a printout or screen; **P3** polish and cleanup; **W** waiting on a date or an answer.

## State on 2026-11-20

- **Live: 1.51.19** (released 2026-11-20 on Mike's "commit deploy", **without the full sweep**, at his word: targeted tests only; the GitHub test gate runs the node tests). Before it, 1.51.18 (`eda634f`, 2026-11-19) had the last full sweep: 268 ok, 3 skipped, 0 failed (`docs/superpowers/plans/2026-11-19-release-1-51-18-prep.md`). 1.51.19 holds N47 (only attendance, progress sheets and achievement records are punched), the tighter award slips (N48) and the redesigned version history page. The site is the public repo `burnclouds/awana-directors-tool`, served by GitHub Pages; the Nextcloud copy is no longer updated (README "Changing and deploying").
- **Pushing from this machine:** `gh` is signed in; use `git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin public:main`. The guard `.git/hooks/pre-push` (only `public` may go to `main`) is enabled and tested. Every push is asked for first.
- **Skipped at the 1.51.18 and 1.51.19 releases:** the names check (`node dev/tools/check-docs-for-names.js <real-data.json>`, which needs the real data file, not on this machine) was not run before those pushes; the version history was not republished to the private artifact link (README deploy step 6; the page there is at 1.51.16).
- Every leader presses **Update now** to pick up a new version. Pace thresholds stay on hold until about 2026-11-25 (they need real sign-off history).
- Test status: the full sweep of 2026-11-19 is above; the 3 skips need real data files. Run tests with `NODE_PATH=<dir with playwright> sh dev/tools/run-tests.sh [--node-only] [name-filter]`.

## Open work

- [ ] **N3. Make a club calendar in the app, with no Excel or CSV import.** PAUSED 2026-11-18 by Mike: work the printables first (N8 and anything else on paper), then come back to this. A quick way to create and print the calendar: pick the club day (day of week), the first and last club night, then edit any night by hand (theme, no club, event, end of quarter), with holiday detection. In progress: requirement questions first (Opus agent), then an implementation plan. Example: the club's Excel calendar sheet (Mike's screenshot of 2026-11-18).
- [ ] **N37. Print review of every printed page (what is left).** Mike (2026-11-18). The findings pass and the fixes are done and released in 1.51.18 (`docs/superpowers/plans/2026-11-19-n37-print-review-findings.md`; F8 decided: keep "none reported"; F17 answered: only attendance and progress pages are punched; done in 1.51.19 as N47). **Still open:** F14 and F15 (an empty lesson column and an empty Rank column in the invented data: wait for real data to judge), F16 (small type on Dates attended and the Uniform tracking columns: check on paper). The full original text of N37 is in `docs/retired/BACKLOG-done-2026-11-20.md`.
- [ ] **N46. A blank incident report to print (idea; not built).** Mike (2026-11-19): the blank incident reports are one of only three things that are hole-punched (with attendance sheets and progress reports); they are not in the app yet. A filled-in report can go in a page protector but has to be taken out to be filed. Open questions for Mike before any build: what the club's current incident report asks for (the fields and wording, and whether it is a form already on paper), how many copies or whether it is one blank page, who fills it in and where it is filed, and whether it should be a report in Reports with the 0.85 in punch margin like the attendance and progress pages. Nothing is stored; a blank page needs no data.

## W: waiting on a date or an answer

- **Mike:** N46 (what the club's incident report asks for, one blank page or several, who files it); a path to the real data file so the names check can be run (or his word that it is not needed); whether the version history should keep being republished to the private artifact link; a phone look at the new Debug sections (Records that look wrong, Readable copy) and at the greyed-out Print button on a report with nothing to print.
- **A date:** about 2026-11-25, pace thresholds (offer a review of Stats > Pace against real children).
- **Real data:** N37 F14 and F15.

## Decided not to build / by design

- Taller attendance rows (Mike: not needed).
- **B5. No Photos list prints the Medical Notes field as "Parent note": by design (Mike, 2026-11-14).** Whoever holds the list is cleared for the full PII/PHI set. Pinned by `backlog-open-items` B5-by-design so it is not "fixed" later.

Photo-to-progress agent and the patch import; sibling / household emergency contacts; fill-down; GitHub setup; friend placement and the Visitor tab; the combined Person/Progress view; color-team per-class rules and a separate mid-quarter move; a browser draft for crash safety (R9, covered by the unsaved-edits words and Save bar); splitting `app-season.js` (R14 part B); rewriting git history while there is no remote (rule, updated 2026-11-16: every push comes with the documentation for that release brought up to date (CHANGELOG entry, the How it works text in `dev/app/index.html`, `docs/DATA-FORMAT.md` for any data change, the README test list and this backlog), and `dev/tools/check-docs-for-names.js <real-data.json>` is run first. The public repo holds one snapshot (branch `public`, pushed as `main`); the private history on local `main` is never pushed).

## Sweep

Latest full sweep **2026-11-19** (`sh dev/tools/run-tests.sh`, with Playwright, on the final 1.51.18 source): **268 ok, 3 skipped, 0 failed.** The 3 skips (`anonymized-data`, `browser`, `reports-season`) need real files. The older sweep notes are in the archive.
