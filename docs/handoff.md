# N3 release fixes

The worktree is on `n-backlog-integration` at `13c1cfb`. The changes for the [release brief](superpowers/plans/2026-11-24-n3-release-fixes.md) are uncommitted.

- In-place Drive saves use a file ETag from Drive v2, verify the revision of downloaded content and retry a conditional write against a fresh head. The in-memory Drive test exercises a competing save, calendar review and the first accepted upload.
- Drive and file merges share a per-date calendar review. The leader can export the open file while reviewing. Autosave waits for a decision, and the reviewed calendar enters the merge history.
- Protected corrections preview affected dates, quarters and records. Confirmation records one history entry and undo step. The maker offers an explicit cutoff adjustment with a reason when it can extend the closed season without hiding active rows or records.

The closest Node tests passed. `drive.test.js` passed 15 cases, `drive-calendar-review.test.js` passed 2, `calendar-maker.test.js` passed 22 and `datamerge.test.js` passed 30. The sandbox refused the browser harness's HTTP listener and Chromium startup. Browser verification remains pending for `drive-inplace-browser.test.js`, `drive-autosave-browser.test.js`, `calendar-maker-browser.test.js` and `calendar-correction-browser.test.js`. The Drive transport was simulated. An authenticated provider write remains unverified.

Follow-ups from the brief are maker weekday and range changes, full archived rows after rollover, N72 event-only labels and broader undo/redo coverage. Rollover initially copies the full calendar. Applying the new calendar leaves the selected archive fields in `config.lastYearCalendar`. N71 stays outside this work.

The next check is to run the four browser files in an environment that permits Playwright. Session usage figures were unavailable on 2026-11-24.

## N3 round 2, 2026-11-24

Implemented parts A–D of the round-2 brief in the same worktree at 13c1cfb. In-place Drive writes verify their predecessor, retain a displaced revision for recovery, and bind manual approval to the remote revision and merge plan. Protected calendar edits use the three confirmations and recheck the open file before recording the correction. The calendar maker previews earlier sign-offs, accepts off-weekday dates, and keeps the cutoff adjustment optional.

The closest Node files passed with 50 total cases (drive.test.js 17, drive-calendar-review.test.js 8, calendar-maker.test.js 25). Syntax checks and git diff --check passed. The browser suite was excluded by request. The typed confirmations, Undo, and visibility of the earlier-sign-off and temporary off-weekday notices still need browser verification. Drive used a simulated transport. A live provider save remains unverified.

Maker changes to the existing weekday or range, full archived rollover rows, the N72 event-only label, and broader Undo coverage remain follow-ups. No open owner decisions. The next verification is the four affected browser files when authorized. No commit or push. Session usage figures were unavailable.

## N3 round 4, 2026-11-24

Implemented sections 1–6 of the [round 4 brief](superpowers/plans/2026-11-24-n3-fix-round-4.md) on the uncommitted integration worktree. A recorded closure leaves the classification boundary in place while the first counted night, totals, and attendance award thresholds use the corrected schedule. Reopening checks the pending revision chain and names any displaced revision it retained. Pending storage updates preserve entries for other file IDs.

Pending entries store SHA-256 when available. When a reload cannot verify an unidentified write because SHA-256 is unavailable, the app keeps the pending entry and explains the problem. Ordinary saves and recovery using the live tab's in-memory content still work. Club file content stays out of pending storage.

The focused Node tests recorded 93 passes and 0 failures. Browser, live Drive, and names checks remain pending. The owner still needs to confirm the round 3 approval rule before bundling. Session usage figures were unavailable.

## N3 round 5, 2026-11-24

Implemented sections 1–6 of the [round 5 brief](superpowers/plans/2026-11-24-n3-fix-round-5.md) on `n-backlog-integration` at `13c1cfb`. Blue Jewel grace applies after each qualifying closure and preserves earned dates and drop records. Calendar closures use activity on the row's date for grace, the season start, and automatic quarter locks. Protected State and Type changes again require review, and season-start notices name reclassified sign-offs. Drive keeps pending save checks in memory when browser storage is blocked and warns once.

The focused Node tests recorded 120 passes and 0 failures. The printed jewel cases use invented data in the calendar-maker tests. The standalone season-report test requires migration inputs. Browser, live Drive, and names checks remain pending. The next check is the calendar correction UI, followed by the live Drive checks identified in section 7. No commit or push. Session usage figures were unavailable.

## N3 round 6, 2026-11-24

Implemented sections 1–3 of the [round 6 brief](superpowers/plans/2026-11-24-n3-fix-round-6.md) on the uncommitted integration worktree at `13c1cfb`. Leader drops match by jewel number and retain the original stored date. Recorded closures warn about locked quarters and Event conversions in the existing confirmation. Drive retries pending storage changes, including deletions, and prompts for a reopen when earlier save checks are unreadable.

The closest Node files recorded 93 passes and 0 failures. The new calendar confirmation cases still need browser verification. Live Drive and names checks remain pending. Session usage figures were unavailable. No commit or push.

## N3 round 7, 2026-11-24

Implemented sections 1–4 of the [round 7 brief](superpowers/plans/2026-11-24-n3-fix-round-7.md) on `n-backlog-integration` at `13c1cfb`. Drive preserves the unreadable save-check text before replacing the primary value and warns again after reload until the affected files pass their reopen checks. Tests cover failed storage adds and updates. Recorded closures now use the same weekly lessons notice as other calendar changes. Recorded date moves keep all three confirmation steps, with the excusing warning in the correction review.

The four closest Node files recorded 102 passes and 0 failures. The browser suite, live Drive, and names checks were excluded. The new lesson notice and excused move browser cases remain to be verified when authorized. Session usage figures were unavailable. No commit or push.

## Playtest channel, 2026-11-24

Implemented the [playtest channel brief](superpowers/plans/2026-11-24-playtest-channel.md) on `playtest` at `4edcca2`, with work uncommitted. `make-deploy.sh` generated `deploy/playtest/`. Local imports obtain the parent directory from a folder picker. Drive imports retain the selected file’s parent ID. Saves write the playtest sibling and display its name. Playtest caches and remembered Drive selections use separate keys. Drive access still uses the existing per-file authorization.

Focused Node totals were 62 passed and 1 failed. The release-consistency failure reproduced on the baseline checkout and concerns the tracked live deploy. Clean public rebuilds with and without the playtest changes were byte-identical. The generated playtest channel and Drive lookup passed Node smoke assertions with invented data. No browser suite, real Drive, commit, push, or publication. Session usage figures were unavailable. The remaining verification is browser and provider behavior when authorized.

## Playtest fixes, 2026-11-24

Applied the [playtest fixes brief](superpowers/plans/2026-11-24-playtest-fixes.md) on `playtest` at `4edcca2`. Debug shows a short message when READABLE export is selected in playtest. Season saves still write the playtest sibling. Playtest browser storage uses the `playtest:` prefix for pending writes and recovery, retired settings cleanup, the remembered Drive file, and the reload handoff. Regenerated `deploy/playtest/` locally as `-playtest.2`.

Focused Node checks recorded 94 passes and 0 failures. Clean live deploy output matched the build from `4edcca2` byte for byte. The browser suite and real-provider checks were skipped. The next step is review of the uncommitted changes. Session usage figures were unavailable.

## Playtest merge export, 2026-11-24

Implemented option (a) from the [merge export brief](superpowers/plans/2026-11-24-playtest-merge-export.md) on `playtest` at `4edcca2`, with work uncommitted. The calendar review dialog disables Export local copy in playtest and shows a short message. The browser controls the destination of a plain download, so it could place the export in the playtest folder.

`playtest-channel.test.js` passed 10 cases and `datamerge.test.js` passed 32, with zero failures. The changed module's minified live output matched the previous output byte for byte. The browser suite was skipped and generated playtest files still reflect the previous build. The next step is to regenerate the local playtest build when needed. Session usage figures were unavailable.

## Playtest cancellation checkbox, 2026-11-25

Implemented the [cancellation checkbox brief](superpowers/plans/2026-11-25-cancellation-checkbox-brief.md) on `playtest` at `4edcca2`. The checkbox uses the existing structural calendar edit and one Undo step. An opening cancellation moves the season start to the next counted night even when records exist. Recorded closures still earn attendance grace when there is child or game activity. Attendance and progress reports mark cancelled dates and retain recorded marks and sign-offs. The playtest source suffix is `-playtest.3`.

The two focused Node files recorded 57 passes and 0 failures. All 55 live JS and HTML sources matched their HEAD versions after the live source transform. Five browser cases were added and await an authorized run. The next step is to review those cases in the browser and generate the local playtest build when authorized. Session usage figures were unavailable.
