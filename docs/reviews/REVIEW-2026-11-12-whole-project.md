# Whole-project review (2026-11-12, by a Fable agent; read-only)

> **Status (2026-11-14):** every finding R1 to R22 has been fixed, built, or closed by decision, and 1.51.10 is live. The backlog entry for each (with its test and the decision) is in `../retired/BACKLOG-full-2026-11-14.md` under "Review 2026-11-12"; the plan for each fix is in `../retired/plans/`. Kept as a record of the review, not as open work.

Scope: the app source in `dev/app`, the release and update path, the tests, the docs and the backlog, at release 1.51.05. The reviewer was told not to open any real data file and to use only the invented TEST data. Findings below are the reviewer's; they were **not re-checked by hand** when this file was written (marked CONFIRMED = the reviewer traced or ran it; SUSPECTED = code trace only). Each item has a matching entry in `BACKLOG.md` ("Review 2026-11-12").

## Overall assessment
The core is sound: the data model is well commented, privacy is good (nothing in browser storage, Drive scope is `drive.file`, deploy holds only TEST data), and the 55 node tests that take no arguments all pass. The fragile parts are at the edges of the save path: six newer data sections were never added to the list that undo, History, Discard and merge work from, and the release path can leave a browser on old scripts under a new page. Both are confirmed and cheap to fix. Phone sign-off entry lost its 44px touch targets when Progress moved under Person.

## Confirmed bugs

1. **Six data sections are invisible to undo, History, Discard, restore and merge. CONFIRMED (traced and run in node on a blank season).**
   - `season.js:1144` and `datamerge.js:18` list `SECTIONS` without `progressNoDate`, `extraSheets`, `announcedNoDate`, `blueWings`, `blueOverrides`, `blueDrops`. `fromJson` (`season.js:140`) and `toJson` (`season.js:97`) do load and save them.
   - Run result: after `setAnnNoDate` plus `grantBlue`, `Season.diff` returned 0 changes, `record` returned null, and `merge3` dropped both from the merged file.
   - Effects: "Told, no date" (`app-season.js:532`, `:915`), hand-granted or dropped Blue Jewels (`:876`, `:880`), no-date sign-offs (`:947`) and "+ Add sheet" (`app-person.js:174`) get no History entry and no undo. Undo of a Blue Jewel drop restores the awards but not the drop. A Drive in-place merge silently discards this copy's changes in those sections, because both merge paths go through `merge3` (`app-drive.js:114`, `datamerge.js` `plan`). On a held-changes tab, a change only in these sections counts as zero changes, so `discardDraft` resets `dirty` to false with the change still in memory and unsaved.

2. **After a deploy, a cold start runs the new index.html with the old scripts, and the update bar hides itself. CONFIRMED (Playwright run on a temp deploy copy with TEST data).**
   - `sw.js:33-38` serves index.html network-first but scripts cache-first from the old release.
   - Run result: page meta showed the new version while `AwanaVersions['app-help.js']` was still the old one. The bar appeared when the new worker finished installing, then `App.updates.check()` hid it: `app-update.js:38` sets `U.found = null` because the page already reports the new version. A plain reload stayed mixed. It only heals when every tab is closed.
   - Probably explains the backlog's unconfirmed Debug-panel "not registered" row (`app-tools.js:39`).

3. **`make-deploy.sh` accepts a release whose service worker is byte-identical. CONFIRMED (run on a temp copy).** Changing `style.css` and one script (with its own version bumped) but not `app-version` or `app-build` exited 0 and left `sw.js` and `index.html` identical to the previous build. Installed browsers would never fetch the change. The bump check (lines 16-23) covers each .js and .html file's own version only; the release id (line 44) comes from the two metas.

4. **Dead CSS removed the phone touch targets on sign-off boxes. CONFIRMED (grep plus measurement at 390px).** `style.css:337` and `:530` target `#tab-progress`, which no longer exists in `index.html` or any script. Measured on the Person tab's Progress sheet: 84 sign-off date inputs at 153x25px, Given dates at 130x25px. README says touch targets are 44px.

5. **What appear to be real children's names are in a git-tracked doc. CONFIRMED.** `BACKLOG.md` (the "Previous list, for reference" entry, around line 114) lists names with progress details. The file has 24 commits, so they are in history too. The repo has no remote. (The names are deliberately not repeated here.)

6. **A Drive merge-save while editing can overwrite the other leader's changes on the next save. SUSPECTED (code trace only).** `app-drive.js:137` always advances `c.rev` to our upload. If the leader edited during the save (`:148-151`, the "screen was not refreshed" branch), neither the open season nor `c.base` gets the merged content. The next save finds the head revision equal to `c.rev`, skips the merge (`:125`) and uploads our copy without their changes. They survive only as Drive revisions. The message "the next save merges again" is not what the code does.

7. **Auto-save to Drive after the one-hour token expires. SUSPECTED (not run).** `drive.js:47` requests a token with no user gesture, which browsers normally block as a pop-up. `App.download`'s catch (`app.js`, `download()`) then shows an alert and downloads a local file, on every auto-save interval. `saveNow` also calls `markSaved()` before the Drive promise settles (`app-season.js`, the `go` function in `App.saveNow`), so a cancelled merge leaves the file showing "saved".

## Recommendations, ranked

### Do soon
1. **Shared SECTIONS list (bug 1).** Put the six sections in one shared `SECTIONS` constant (`season.js`, `datamerge.js`) and in the anonymizer's `HANDLED` list (`make-test-data.js`). Test that every key `toJson` can write is in `SECTIONS`, plus merge and undo cases. Effort small. Risk: lost "told, no date", Blue Jewel grants and no-date sign-offs; hidden dates reappearing on printed sheets.
2. **One release per page load (bug 2).** Serve navigations from the release cache when a worker controls the page (keep the `?_=` version check on the network), and do not clear `U.found` while `reg.waiting` exists. Add a cold-start-after-deploy test to `service-worker-browser.test.js`. Effort small to medium. Risk: a new index.html that drops or renames an element breaks old scripts with no prompt.
3. **Release id from the files (bug 3).** Derive the service worker release from a hash of the shipped files, or refuse a build where any file differs from `deploy/` while version and build are unchanged. Effort small. Risk: a fix that never reaches installed phones.
4. **Touch targets (bug 4).** Re-point the two `#tab-progress` rules at the sheet's real container. Add a touch-size check to `test/mobile-audit.js`, which today checks only sideways overflow. Effort small. Risk: mis-taps on dates.
5. **Names in tracked docs (bug 5).** Remove the names from `BACKLOG.md`, sweep the other tracked docs, and decide whether to rewrite history before the repo ever gets a remote. Effort small. Risk: exposure if the repo is ever pushed or shared.
6. **Harden the two privacy gates.** `make-test-data.js` writes its output before its leak checks run, so a failed run leaves files in the out dir. `make-deploy.sh:25` syncs to `deploy/` before the non-code check at `:48`, and its TEST guard trusts the filename only. Write to a temp dir and move on success; also require `"fake":true` in the try file. Effort small. Risk: a real file renamed with TEST could ship, PII in `deploy/`.
7. **Drive merge-then-dirty (bug 6).** Advance `c.rev` only when `c.base` and the open season hold the merged content. Add a case to the drive-inplace test. Effort small to medium. Risk: one leader's night overwritten.
8. **One "run everything on TEST data" script.** Have `make-deploy.sh` or the release checklist call it. `roster.test.js`, `reports-season.test.js` and `import-test-file.test.js` crash with a TypeError without real-data arguments; default them to `dev/test-data`. 144 test files, no runner, no `npm test`. Effort small to medium. Risk: regressions shipped untested.

### Later
9. **Crash safety on a phone** (medium; needs a decision). No recovery if the browser discards the tab, and auto-save defaults to off (`app-update.js`, `DEF_A`). Option: a sessionStorage draft cleared on save, the same mechanism the update handoff already uses. Trade-off: children's data stays in the tab's storage until the tab closes.
10. **Warn when an imported export is older than the current data** (small). `importPc` (`app.js:175-188`) has no date comparison, and non-important field changes apply with no review.
11. **Auto-save with Drive** (small, bug 7). For `opts.auto` failures, show a quiet status and retry on the next click instead of an alert plus download. Call `markSaved` after the Drive save resolves.
12. **Other small phone targets, measured at 390px** (medium). To do inline inputs are 24-30px tall, name links 15-20px, Uniforms dates 28px, the Attendance move button 26px wide. Unsaved state on a phone is a colored dot only (`#seasonStatus`, `style.css:292`).
13. **Documentation accuracy** (small). README header says 1.50.28; line 18 says update settings live in localStorage; 29 test files are unlisted. BACKLOG header says 1.50.36, and its note that `versions.test.js` fails is stale (it passes). The manual and To do hints (`todo.js:45`, `:51`) still say "Progress tab". The splash line "Nothing is uploaded" (`index.html:717`) sits beside Open from Google Drive.
14. **Maintainability** (medium). `app-season.js` (1,205 very long lines) holds state, undo, save, Attendance, Awards, the sheet and History; split save/undo from the tabs first. `dueFor` (`app-season.js:420`) is not called anywhere in the app. `ui.attHold` (`app-season.js:9`) is a try/catch that always returns false. `loadDirs` and `KEY` in `app-drive.js:13-14` are leftovers.
15. **`manifest.json`, icons and TEST fixtures are git-ignored** (`*.json`, `*.png`) (small). A fresh clone cannot build the PWA or run tests. Add explicit `!` exceptions.

### Backlog items by value for club night (reviewer's view)
- Highest: the Emergency contact phone preference (a safety item on printed binders); Games with both groups on one screen (D); little flags shown only when flagged (done in 1.51.04).
- Next: Reports sub-tabs (B).
- Verify by eye: the many "BUILT, not checked in a browser" entries need a pass on a real phone more than new features do.

### Leave alone
- Save speed (C): snapshot plus two diffs took about 10 ms on the 140-person TEST file.
- Vanilla JS with no bundler: a framework rewrite would not help this user.
- History growth: fine at this scale.

## Looked at and found fine
No localStorage use (sessionStorage only for the update handoff, removed on read). No console logging of data. `.gitignore` covers data types, and no data file types appear in git history. `deploy/app/try` holds only TEST files. The anonymizer fails closed on unknown sections and unknown History shapes. `fromJson` guards `__proto__`; `merge3` logic is sound for the tracked sections. The Awards badge (`toGive`) agrees with the Announce, Hand out and Ceremony lists. The test-session download gating works as written. `make-deploy.sh` does refuse an unbumped changed script.

## Not read or not run
- Not read: `reports.js`, `reports-season.js`, `slides.js`, `teams.js`, `teamplan.js`, `app-teamgrid.js`, `app-options.js`, `stats.js`, `pace.js`, `check.js`, `catalog.js`, `app-merge.js`, the specs and plans.
- Skimmed only: `validate.js`, `app-person.js`, the flag modules, `app-todo.js`, and the manual (grep spot-checks).
- Not checked: print layouts, contrast, screen readers, the rest of the tracked docs for names.
- Not run: the 81 browser tests (only two scratch Playwright checks). Bugs 6 and 7 are traced, not reproduced.
- No repo file was edited and no real data file was opened.
