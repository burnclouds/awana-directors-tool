# R10: Warn when an imported Planning Center export is older than the file's Planning Center data. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importing a Planning Center export whose date is earlier than the Planning Center data already in the open file never happens silently. Picked by hand, it asks first (OK imports it, Cancel leaves everything as it was). When an export opened earlier in the session is re-applied automatically to a data file opened later, it is skipped, and a message says why.

**Architecture:** There is one pure helper in `model.js` (`Model.olderExport`), which reuses the existing `Model.exportDate`. There is one guard in `app.js` `importPc`, which runs before anything is touched, plus a `quiet` option that `App.loadData` passes when it re-applies an export. The data file format does not change. This item is part of release 2b in `2026-11-13-wave2-data-safety.md` (Task 10). This file replaces that task's outline.

**Tech Stack:** Vanilla JS (no bundler), Node 24 for unit tests, Playwright 1.64 (Chromium) for browser tests. No new dependencies.

**Spec:** BACKLOG "Review 2026-11-12" R10; `dev/REVIEW-2026-11-12-whole-project.md` item 10; roadmap `2026-11-12-review-fixes-roadmap.md` (R10 outline); `docs/DATA-FORMAT.md` section on `roster.pcAsOf` / `pcSource` (around line 143). The meaning of those fields does not change.

## Global Constraints
- Change files with the Edit and Write tools. Scripted rewrites (`sed -i`, or an inline `node -e` that writes files) are blocked. Tests may run anything.
- Never open, read, list or print a real data file (`archive/`, `~/Downloads`, `~/Nextcloud`, `dev/*.json`, `dev/*.csv`, `reports/`, `research_notes/`). Tests use only `dev/test-data` (the TEST data file and the two TEST exports `20261028 -- demo-club-2026-27 TEST.csv` and `20261103 -- demo-club-2026-27 TEST.csv`) and copies of them in a temp folder.
- Tests run from `dev/app`: `node test/<name>.test.js`. Browser tests need `NODE_PATH=/tmp/claude-1000/shim/node_modules`. The full sweep runs from the repo root: `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh`. It finds every `test/*.test.js` by itself, so a new test file needs no registration.
- Each changed `.js` file bumps its own version line (line 1: `(this.AwanaVersions = ...)['app.js'] = 'x.y.z'`) in the task that changes it. Today the versions are `app.js` `1.59.2` and `model.js` `1.8.1`; take whatever is current and bump the last part. `app-version` and `app-build` in `dev/app/index.html` (lines 6 and 7, today `1.51.06` / `2026-11-13`) are bumped **once per release**, in the release's wrap-up (Wave 2b, Task 10b). `make-deploy.sh` refuses changed files with unbumped versions.
- **No data-format change.** `docs/DATA-FORMAT.md`, `test/data-format-doc.test.js`, `Season.SECTIONS` and the anonymizer `dev/tools/make-test-data.js` stay untouched. If an implementer finds they need to write a new field (for example "declined export"), stop: that is a format change and needs Mike's decision first.
- Project rule: do not deploy. The work ends at a committed, swept dev tree. Mike says "deploy".
- Commit messages end with the two attribution lines given in the session.

## What the review and the earlier plan got right and wrong (checked against the code on 2026-11-13)
| Claim | Verdict | Evidence |
|---|---|---|
| "`importPc` (`app.js:175-188`) has no date comparison" | **Holds.** The line numbers are still right. | `importPc` is `app.js:175-188`. `stampExport` (`:189`) writes `master.pcAsOf = Model.exportDate(name, today())` with no comparison against the value it replaces. |
| "non-important field changes apply with no review" | **Holds, but it is deliberate.** It is not part of this fix. | `Model.needsReview` (`model.js:386-389`) skips the review on purpose when only phone, email and other minor fields changed. Wave 2 Task 5 makes every such refresh a History entry, which can then be undone. R10 does not change the review rule. |
| Earlier plan: "`App.loadData` (`app.js:1116`) re-applies an export opened earlier ... without a date check" | **Holds, and it is reached from more places than the plan says.** | `loadData` runs from `setSeason` (`app-season.js:26`), which runs for every `App.openSeason`. That includes the **Drive merge-save refresh** (`app-drive.js:149`, `App.openSeason(body)` after a merged save). A `confirm()` there would pop up in the middle of a save. So the re-apply path **must** be quiet. It can never ask. |
| Earlier plan: new date parsing in `Model.olderExport` | **Partly redundant.** | `Model.exportDate(name, today)` already exists (`model.js:383-387`, tested in `roster.test.js:51-53`). It does not check that the date is real (`20261399` gives `2026-13-99`). `validate.js:177-179` warns about that in the file check but does not stop the import. `olderExport` reuses `exportDate` and adds the real-date check. |
| Earlier plan's browser test: "open the TEST data file with the 20261103 TEST export, then import the 20261028 one" | **Wrong premise.** | The TEST data file's `roster.pcAsOf` is `2026-10-28` (its `pcSource` is the 1028 TEST export). Opening it with the 1103 export opens the **review** (new people; see `import-browser.test.js` third test), so `pcAsOf` only becomes `2026-11-03` after Apply. Use a temp copy of the TEST data file with `roster.pcAsOf` set to `2026-11-03` (see Task 2). |
| Earlier plan: the check goes "after the looks-like-an-export check and before `planImport`" | **Needs a correction.** | At that point `lastPc` and `colReport` have already been replaced (`app.js:178-179`). A Cancel would then leave the columns bar showing the old export's columns, and the Link-to-Planning-Center dialog (`app.js:687-700`) would offer that export's records. Put the guard **before** `lastPc = ...`. |

## Decisions (proposed; open questions for Mike are at the end)
1. **Older** means: the export's name starts with a real `yyyymmdd`, the file has a `pcAsOf` of the form `YYYY-MM-DD`, and the export date is strictly earlier. The same day does not count as older. An export with no date in its name is never "older", because it is stamped as today, as it is now.
2. **No master or an empty roster** (first import, fresh start): no check. There is nothing to compare against.
3. **Picked by hand** (`openFilesNow`, `app.js:1148`, and every route through the File menu or splash that ends there): show a `confirm`. OK goes on exactly as today, and `pcAsOf` then goes back to the export's date. That is honest, because the Planning Center data now comes from that export. Cancel returns before anything changes: no `lastPc`, no `colReport`, no `stampExport`, no `App.changed()`, no `recordImport`, and the tab does not switch to To do.
4. **Re-applied automatically** (`App.loadData`, `app.js:1116`): never asks. An older export is skipped. `lastPc.declined = true`, so it is not tried again on the next open. `App.flash(..., 'warn')` gives the reason.

## Review Focus
These are failure modes that a quick reading of the change would miss. Each has a test, named here and written in the tasks.
1. **A confirm in the middle of a Drive save.** The merge refresh goes through `openSeason`, then `loadData`, then `importPc`. Covered because the quiet decision is made in `loadData` itself, not by its callers: test `an older export opened before the data file is not applied to it, and a message says why` (Task 2) exercises `loadData`. Optional extra: Task 2 step 5.
2. **Cancel leaves no trace.** The file is not marked unsaved, `pcAsOf`/`pcSource` are unchanged, the earlier `lastPc` is kept, and no review opens. Test: `... Cancel leaves the file as it was` asserts `App.dirty() === false`, both fields unchanged, `App.hasPcExport === false` (nothing had been imported before), and `#review` hidden.
3. **Same day is not older.** Otherwise the weekly re-import of the same export (the most common case) would nag. Test: the unit test `same day and newer are not older`, plus a new assertion in the existing browser test `a child marked inactive by hand is still inactive after the same export is imported again` (data `pcAsOf` 2026-10-28 with the 1028 export) that no dialog says "older than".
4. **A name with a date that is not real, a name with no date, or a file `pcAsOf` that is missing or malformed** never triggers the question, and never throws. Test: unit `olderExport: no date, a date that is not real, or no file date is never older`.
5. **The skipped export is not retried on every later open** (no repeated flash). Test: the second half of the `loadData` browser test.
6. **Existing tests that import exports in date order** must still pass with no new dialog. Tests that have no dialog handler would quietly dismiss the confirm (Playwright's default). Covered by the sweep (Task 3). If a test breaks, it was importing an older export over newer data: fix that test's order or dialog handler, not the rule.

## File Structure
| File | Change | Responsibility |
|---|---|---|
| `dev/app/model.js` | modify | `olderExport(fileAsOf, name)`, exported next to `exportDate` (export list at `model.js:471`). |
| `dev/app/app.js` | modify | `importPc(text, name, opts)` guard. `App.loadData` passes `{ quiet: true }`. |
| `dev/app/info.js` | modify (small, optional, see open question 4) | One sentence in the Import help: "An export older than the file's Planning Center data asks before it is applied." |
| `dev/app/test/roster.test.js` | modify | Unit tests for `olderExport`. The file already runs on the TEST export with no argument. |
| `dev/app/test/import-browser.test.js` | modify | Browser tests: ask, Cancel, OK, quiet skip. One extra assertion on an existing test. |
| `CHANGELOG.md`, `BACKLOG.md`, `README.md`, roadmap | modify | Release notes and status (Task 3). |

---

### Task 1: `Model.olderExport` (pure, unit-tested)

**Files:**
- Modify: `dev/app/model.js` (after `exportDate`, `:383-387`; export list `:471`)
- Modify: `dev/app/test/roster.test.js` (next to the export-date test at `:51`)

**Interfaces:**
- Produces: `Model.olderExport(fileAsOf: string|undefined, name: string) -> { older: boolean, exportDate: string, fileDate: string }`
  - `exportDate`: the export name's leading `yyyymmdd` as `YYYY-MM-DD`, only when it is a real calendar date; else `''`. Reuse `exportDate(name, '')` and then check that the date is real: round-trip it through `Date.UTC` and compare year, month and day. `model.js` does not load `season.js`, so do not call `Season.isRealDate`.
  - `fileDate`: `fileAsOf` when it matches `/^\d{4}-\d{2}-\d{2}$/`, else `''`.
  - `older`: `!!exportDate && !!fileDate && exportDate < fileDate`. A string comparison is correct for zero-padded ISO dates.
- Unchanged: `exportDate`'s behaviour and its tests.

- [ ] **Step 1: Failing tests** in `roster.test.js`:
  - `olderExport: an export dated before the file's Planning Center data is older`: `M.olderExport('2026-11-03', '20261028 -- demo-club-2026-27 TEST.csv')` deep-equals `{ older: true, exportDate: '2026-10-28', fileDate: '2026-11-03' }`.
  - `olderExport: same day and newer are not older`: `'20261103 -- x TEST.csv'` and `'20261104 -- x TEST.csv'` against `'2026-11-03'` give `older === false`, with `exportDate` `'2026-11-03'` and `'2026-11-04'`.
  - `olderExport: no date, a date that is not real, or no file date is never older`: `'export.csv'` gives `{ older: false, exportDate: '' }`; `'20261399 -- x.csv'` gives `older: false, exportDate: ''`; `fileAsOf` `undefined`, `''` and `'Oct 28'` each give `older: false, fileDate: ''`.
- [ ] **Step 2: Run** `cd dev/app && node test/roster.test.js`. Expected: the three new tests FAIL (`M.olderExport is not a function`) and the rest pass.
- [ ] **Step 3: Implement** in about 6 lines, with a one-line comment above, in the file's style.
- [ ] **Step 4: Run** `node test/roster.test.js && node test/pc-columns.test.js && node test/doc-examples.test.js`. Expected: PASS.
- [ ] **Step 5: Commit.** Bump `model.js` (e.g. `1.8.1` to `1.8.2`). Message: `R10: Model.olderExport compares an export's date with the file's Planning Center data`.

### Task 2: `importPc` asks before an older export, and the automatic re-apply skips it

**Files:**
- Modify: `dev/app/app.js` (`importPc` `:175-188`; `App.loadData` `:1116`)
- Modify: `dev/app/test/import-browser.test.js`

**Interfaces:**
- Consumes: `Model.olderExport` (Task 1).
- Produces: `importPc(text, name, opts)`. `opts` is optional; `opts.quiet === true` means "never ask". Its only caller with `quiet` is `App.loadData`. `openFilesNow` (`:1148`) keeps calling `importPc(it.text, it.name)`.
- Guard placement: right after the `throw` for "That does not look like a Planning Center export" (`:177`) and **before** `lastPc = { pc, name, text }` (`:178`). It runs only when `master && master.people.length`.
- Prompt text (interactive): `'This export is as of ' + exportDate + ', which is older than the Planning Center data already in this file (as of ' + fileDate + ').\n\nOK imports it anyway. Cancel leaves the file as it is.'` On Cancel: `return` (nothing changed).
- Quiet skip: `if (lastPc && lastPc.name === name) lastPc.declined = true;` (in `loadData` it always is), then `App.flash('The export opened earlier (' + name + ', as of ' + exportDate + ') is older than this file’s Planning Center data (as of ' + fileDate + '), so it was not applied. Import it again if you want it anyway.', 'warn')`, then `return`.
- `App.loadData` line `:1116` becomes `importPc(lastPc.text, lastPc.name, { quiet: true })`. Nothing else in `loadData` changes.

- [ ] **Step 1: Fixture.** In `import-browser.test.js`'s setup (next to `older`/`newer`, around `:19-20`), write `newerPc = path.join(tmp, 'awana-2026-27-TEST-20261104-100000.json')` from `base` with `roster.pcAsOf = '2026-11-03'` and `roster.pcSource = '20261103 -- demo-club-2026-27 TEST.csv'`. Deep-copy `roster`, so `base` stays unchanged for the other tests. `EXPORT` (`sort()[0]`) is already the 1028 TEST export. Add a helper `openAnswering(ok)` like `open()`, but where a `confirm` dialog is accepted only when `ok` and other dialogs are accepted as now. It records every message in `msgs`.
- [ ] **Step 2: Failing tests** (append before `browser.close()`):
  - `an export older than the file's Planning Center data asks first; Cancel leaves the file as it was`: `openAnswering(false)`; set `#splashFiles` to `[newerPc]` and wait 600 ms; then set `#fileAny` to `[exportPath]` and wait 800 ms. Assert:
    - exactly one message matches `/older than the Planning Center data already in this file/` and it contains `2026-10-28` and `2026-11-03`
    - `App.master.pcAsOf === '2026-11-03'` and `App.master.pcSource` starts with `20261103`
    - `App.dirty() === false`, `#review` hidden, `App.hasPcExport === false`
    - no `PAGE ERROR`
  - `...and OK imports it anyway`: the same with `openAnswering(true)`. Assert `App.master.pcAsOf === '2026-10-28'` and that `pcSource` starts with `20261028`. Whatever the import does afterwards (review or silent refresh) is today's behaviour: if `#review` is visible, press `#rvApply` before asserting.
  - `an older export opened before the data file is not applied to it, and a message says why`: `open()`; set `#splashFiles` to `[exportPath]` alone (this loads it as the roster, with no question) and wait 800 ms; then set `#fileAny` to `[newerPc]` and wait 800 ms. If a "Discard unsaved changes?" confirm appears, the helper accepts it. Assert:
    - `App.master.pcAsOf === '2026-11-03'`
    - no message matches `/older than the Planning Center data already in this file/` (it did not ask)
    - `#flash` is visible and its text matches `/is older than this file.s Planning Center data \(as of 2026-11-03\), so it was not applied/`
    Then hide `#flash` from the page, open `newerPc` again, and assert `#flash` stays hidden (the declined export is not retried).
  - Extend the existing `a child marked inactive by hand is still inactive after the same export is imported again` with `assert(!msgs.some(m => /older than/.test(m)))`. That case is the same date, so it must not ask.
- [ ] **Step 3: Run** `cd dev/app && NODE_PATH=/tmp/claude-1000/shim/node_modules node test/import-browser.test.js`. Expected: the three new tests FAIL (no question today; `pcAsOf` becomes `2026-10-28`), and the extended one passes.
- [ ] **Step 4: Implement** as in Interfaces. Keep it to about 8 lines in `importPc` and change one call in `loadData`. Do not touch `stampExport`, `needsReview` or the review dialogs.
- [ ] **Step 5 (optional, only if cheap):** a case in `drive-inplace-browser.test.js`: an older export opened first, then a Drive merge-save. Assert no "older than" confirm and that the save completes. Skip it if the fake Drive needs new plumbing. Review Focus 1 is already covered by the `loadData` test.
- [ ] **Step 6: Run** `import-browser`, `import-button-browser`, `import-conflicts-browser`, `fresh-start-browser` and `roster-color-browser`, each with `NODE_PATH=/tmp/claude-1000/shim/node_modules node test/<name>.test.js`. Expected: PASS.
- [ ] **Step 7: Commit.** Bump `app.js` (e.g. `1.59.2` to `1.59.3`). Message: `R10: an export older than the file's Planning Center data asks first; the automatic re-apply skips it`.

### Task 3: Help text, sweep and records (one commit; the release itself is the Wave 2b wrap-up)

- [ ] **Step 1 (if Mike agrees, open question 4):** `info.js` Import help (`:14`, in the Planning Center export bullet). Add: "An export dated earlier than the Planning Center data already in the file asks before it is applied." Bump `info.js`. Run `node test/info.test.js`, then `info-browser`.
- [ ] **Step 2: Sweep:** `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh`. Expected: no FAIL. Real-data tests show SKIP. If a test now fails with a dismissed confirm, see Review Focus 6.
- [ ] **Step 3: Records.**
  - `CHANGELOG.md` "Next release": one line: "**Older Planning Center export** (R10): importing an export dated before the file's Planning Center data now asks first; an export opened earlier in the session is no longer re-applied to a newer file (a message says so). `model.js`, `app.js`; tests in `roster.test.js` and `import-browser.test.js`."
  - `README.md`: update the `import-browser.test.js` comment line (`:167`) so it mentions the older-export question.
  - `BACKLOG.md` R10 heading: add "-- FIXED in dev <date>, not deployed", in the R8 style.
  - Roadmap status table: R10 is "done in dev".
- [ ] **Step 4: Commit.** If R10 ships alone instead of inside Wave 2b, also bump `app-version` to the next free `1.51.x` and `app-build` to the day, then run `sh make-deploy.sh` (it must run clean: no STOP; do not rsync).

## Needs Mike (by hand)
- **Phone check (2 minutes):** on the phone, open the current data file, then Import an older export from Downloads. The native confirm should be readable and Cancel should change nothing (no unsaved dot). Then import the current export. It should not ask.
- **Real-file sanity (no data shown):** the app's (i) file info shows "Planning Center data as of". Check that it is a real date on his file. If it is the day he first opened an undated export, see open question 2.

## Open questions for Mike
1. **Automatic re-apply:** skip with a message (proposed), or ask? Asking is unsafe because the same path runs inside a Drive merge-save.
2. **Undated export names:** today an undated name is stamped with the day it was opened. A later, correctly dated export from a few days earlier would then be reported as "older". Proposed: leave it. The file check already warns about undated names, and the question can be answered OK.
3. **Ask or refuse?** Proposed: ask. An older export is sometimes intended (redoing an import after a mistake).
4. **Help text line** in `info.js` (Task 3 step 1): yes or no.

## Risks
- **Wave 2 Task 5 also edits `importPc`** (the `App.changed()`/`App.rebase()` lines `:185-186`). The two edits touch different lines. Whichever lands second merges by hand. R10's guard sits above both.
- **Pre-existing, not fixed here:** a newer export opened earlier in the session is still re-applied after a Drive merge refresh (`app-drive.js:149`), and that can open the review dialog after a save. Note it in BACKLOG as a follow-up if Mike wants. R10 only removes the older-export case.
- **Tests that import out of order:** see Review Focus 6. The sweep finds them.
- **Size:** about 15 lines of code and 5 tests. One short session.
