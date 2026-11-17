# R21: "shown date" is the only way to read a no-date pair (item plan)

> **DECISIONS (Mike, 2026-11-13).** **D1: show "no date"** wherever an earned/finished date would come from a no-date sign-off (option (a): `noDate: true`, `date: ''`; screen says "no date", paper keeps the tick mark). **D2: moot.** The photo/progress-patch import was shelved and Mike considers it dropped, so BUG 5 and rows 24-25 are not fixed: the dead patch import is **removed** in R14 (Task 0 there). **D3: remove `givenOf`** (an exported helper that copies the raw "given" record, including tick days, and is called only by `test/awards-lifecycle.test.js`; nothing in the app uses it): the test switches to `givenShown`, and R14 removes the export. Only BUGs 1-4 and D1 remain to implement here.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

STATUS: complete plan, 2026-11-13. Supersedes Task 7 of `2026-11-13-wave2-data-safety.md` (same goal; this adds the full inventory, two sheet bugs Task 7 missed, the derived-date question and a stricter guard). Release 2a (with R16, R18, R20).

**Goal:** nothing on screen, on paper or in a slide shows, copies or counts as a real day the date a no-date pair keeps only as "the day the box was ticked".

**Architecture:** no format change. Two small read helpers in `season.js`; each bug site switches to them; one node test file with a failing test per bug plus a source-scan guard with an allow-list; one browser test for the two Progress-sheet bugs.

**Spec:** BACKLOG R21; `docs/DATA-FORMAT.md` 5.6, 5.13, 5.15, 5.16, 7.5, 15 item 7; review `dev/REVIEW-2026-11-12-whole-project.md`; roadmap R21 line.

## The four pairs (DATA-FORMAT 7.5) and what the code really does

| Pair | Stored | Mark | Read helper today | Notes |
|---|---|---|---|---|
| Award given | `given[id][award]` = tick day | `givenNoDate[id]` | `givenShown`, `isGivenNoDate`; `awardLedger` row `.given` = `'no date'` | routed almost everywhere |
| Sign-off | `progress[id][book][key]` = the award's given day (or today when the award itself is no-date; `sectionGate`, `app-season.js:942-947`) | `progressNoDate[id][book]` | `isSignNoDate` only (no "shown" helper) | **the weak spot** |
| Book received | `received[id][book]` = `"no date"` | the value itself | `receivedShown`, `isReceivedNoDate` | the value is not a date, so a direct truthy read is a presence test; safe |
| Uniform given | `x_Uni_GivenDate` | `x_Uni_GivenFlag = '1'` | `Model.uniGiven` | **not a pair**: ticking the flag writes no date (`app.js:1035`, `app-person.js:238`); a date there is real. 7.5's table row is misleading (doc fix only) |

## Inventory (grep, 2026-11-13, dev tree)

Command used (from `dev/app`): a node scan of every `*.js` except `sw.js` for `\.given\b`, `\.progress\b`, `\.received\b`, `receivedOf\(`, `x_Uni_Given*`/`GIVEN_FLAG`, then callers of the derived-date functions (`completedBlocks`, `finishedBooks`, `earnedList`, `awardLedger`, `givenOf`, `assumedGiven`). Line numbers are today's; the guard test keys on code, not lines. "Prints for a no-date award/sign-off" assumes the sentinel tick day `2026-10-30`.

### A. Outside `season.js` (23 sites)

| # | Site | Reads | Routed? | Shows for a no-date item | Class |
|---|---|---|---|---|---|
| 1 | `reports-season.js:47-61` `achievement` -> `blockRow(b, prog[scope])` -> `box(i, dates[k])` | `progress` dates | no | **Achievement Record (all three groups) prints `10/30` in every no-date box** | **BUG 1** |
| 2 | `pace.js:29-37` `signoffs` | `progress` dates | no | counts the sign-off on the tick night: per-night bars, "last M/D", nights since, and the `paceWatch` report and Person pace strip (`app-season.js:656-657`) | **BUG 2** |
| 3 | `app-season.js:680-683` `sameBtn` (Progress sheet "Same date") | `dates[...]` walking back to the last dated box | no | button title "last date entered (2026-10-30)" and **pressing it writes the tick day into real boxes** (becomes a real sign-off date) | **BUG 3** |
| 4 | `app-season.js:926` `stored(t)` (sign-off box commit) | raw `progress` value | no | a half-typed or bad entry in a no-date box is "put back" as `2026-10-30`, so the hidden day appears in the box; a later commit of that box makes it real | **BUG 4** |
| 5 | `app-season.js:664-670` `sheetHtml` `cell` | `progress` via `isSignNoDate` | yes | empty box + "no date" | fine |
| 6 | `reports-season.js:58` `awardInfo` | `given` after `isGivenNoDate` | yes | tick, no date | fine |
| 7 | `reports-season.js:32` awardsByChild; `:150` booksYear given column | ledger `.given` | yes | "(no date)" / "given" | fine |
| 8 | `app-person.js:100,105` Person Awards tab | ledger `.given` | yes | "Given, no date" | fine |
| 9 | `app-season.js:470,478,488,501,506` Hand out / Ceremony / badges | ledger `.given` presence | yes | counts as given (right) | fine |
| 10 | `app-season.js:489,726,742` | `given[id][award]` presence | n/a | presence only | fine |
| 11 | `app-season.js:816` Progress tab `currentBook(id, codes, prog)` | `progress` to pick the open book tab | no | may pick the book of a no-date sign-off as "most recent"; nothing printed | fine (note) |
| 12 | `reports-season.js:186`, `todo.js:53` | `receivedOf` truthiness | n/a | `"no date"` counts as received (right) | fine |
| 13 | `reports.js:155` Uniform report | `x_Uni_GivenDate`, flag | n/a | real date, else "✓ (no date)" | fine |
| 14 | `model.js:31`, `app.js:1029-1035`, `app-person.js:72,238` uniform | flag/date | n/a | not a pair | fine |
| 15 | `check.js:97`, `validate.js:100,123` | shape/value checks | n/a | nothing shown | fine |
| 16 | `stats.js:66`, `store.js:52`, `app-options.js:270` | key counts / ids | n/a | nothing shown | fine |
| 17 | `app-tools.js:58` Debug "assumed given" count by day | `assumedGiven` dates | no | groups by the day the bulk tick was made (its purpose) | fine (Debug only) |
| 18 | `app-season.js:707,710,726` sheet "Complete M/D", "earned M/D", "completed M/D" (also printed via `progressSheets`) | `completedBlocks().date` | derived | **the tick day if the block's last sign-off is no-date** | **DECIDE D1** |
| 19 | `app-season.js:735` "finished M/D (every section is dated)" | `finishedBooks().date` | derived | same | **DECIDE D1** |
| 20 | `reports-season.js:72` Achievement "Book Review Earned" box | `completedBlocks` BOOKREVIEW date | derived | same, on paper | **DECIDE D1** |
| 21 | `reports-season.js:149` booksYear "Books finished HG 10/30/26" | `finishedBooks().date` | derived | same, on paper | **DECIDE D1** |
| 22 | `app-season.js:422-428,462,474,481,840` Announce/Hand out "finished M/D", "Earned, not yet announced (M/D)" | `suggestedAwards`/ledger `.earned` | derived | same | **DECIDE D1** |
| 23 | `app-season.js:730-731` "Use Start Zone finished M/D" (T&T date received) | `completedBlocks` SZ date | derived | offers the tick day as a received date | **DECIDE D1** |

### B. Inside `season.js` (non-helper readers)

| # | Site | Class |
|---|---|---|
| 24 | `:1007` `planProgress` (photo import) `row.existing` | **BUG 5 / DECIDE D2**: a no-date section shows as a conflict "the file already has 2026-10-30" (prints the tick day), and a real date from a photo cannot replace the mark |
| 25 | `:1025` `applyProgressPlan` presence re-check | follows D2 |
| 26 | `:1033-1052` `completedBlocks`, `:1067-1077` `finishedBooks` dates (`latest`), and through them `earnedList` (`:1111`), `awardLedger.earned` (`:757`), `suggestedAwards` (`:1118`), `pastYearAwards` (`:1128`), `blueWingPlan` (`:530`) | **DECIDE D1** (source of A18-A23) |
| 27 | `:786` `givenOf` (exported; raw copy incl. tick days; only `test/awards-lifecycle.test.js` calls it) | **DECIDE D3** |
| 28 | `:717` `assumedGiven` (returns raw dates for the Debug tab) | fine (see 17) |
| 29 | `:760` `awardLedger` given column | routed (fine) |
| 30 | `:772-773` `isGivenNoDate`/`givenShown`, `:367-375` `receivedOf`/`receivedShown`, `:895` `isSignNoDate` | the helpers |
| 31 | `:829` `waitingToGive`, `:903` `unsignedIn`, `:1084-1090` `bookStatus`, `:387,418,535,583` | presence only, fine |
| 32 | `:97,109,144-145,196-198,264-348,447,470,910-916` save, migrations, repairs, renames, setters | write/repair paths, fine |

**Totals:** 32 inventory rows (23 outside `season.js`, 9 inside; roughly 60 grep hits). **5 bugs** (1-4 and 24), **3 decisions** (D1 covering 7 rows, D2, D3), the rest fine. Task 7 had BUG 1 and BUG 2; BUG 3, BUG 4, BUG 5 and D1 are new.

## Helper API (season.js)

- `Season.signShown(s, id, book, key) -> 'YYYY-MM-DD' | ''`: the sign-off date, `''` when not signed or `isSignNoDate`. Mirror of `givenShown`.
- `Season.signsShown(s, id, book) -> { key: date }`: a copy of `progress[id][book]` without the no-date keys. For loops that need the whole book (pace, `sameBtn`, `blockRow`). Presence-only code keeps reading `progress` (a no-date sign-off **is** signed) and goes on the allow-list.
- Unchanged: `givenShown`, `isGivenNoDate`, `receivedShown`, `isReceivedNoDate`, `isSignNoDate`.
- If D1 = (a): `completedBlocks`/`finishedBooks` rows gain `noDate: true` and `date: ''` when any sign-off they depend on is no-date; consumers print the existing tick text (`&#10003;` on paper, "no date" on screen).
- If D3 = remove: drop `givenOf` from the exports and change the lifecycle test to `givenShown`; else make it return `givenShown` values.

## Decisions for Mike (ask before Task 2)

- **D1. What is the "earned/finished" date of a block or book whose sign-offs include a no-date one?** Today it is the tick day, which is the award's given day (or the day "no date" was ticked). Options: (a) **unknown**: blank date with a tick, "earned, no date" (recommended: it is the honest reading of "finished, day unknown"; it does not change which awards are earned); (b) keep the tick day: it is a real upper bound ("by 10/30"), so print it as "by 10/30"; (c) the latest real sign-off date (rejected: earlier than the true finish). Side effects of (a) to check in tests: `suggestedAwards` filters `b.date < cut` (blank sorts before the cut, so the award drops off "Earned, not yet announced"; it is usually already given, but confirm); `pastYearAwards` (already given, skipped); `blueWingPlan` orders finished books by date (a blank date must not move a book's wings); "Use Start Zone finished" button hidden when blank.
- **D2. Photo import over a no-date sign-off.** Recommended: a photo date replaces the mark (status `add`, reason "replaces a no-date sign-off"), consistent with "a real date typed later removes the mark". Alternative: keep it a conflict but word it "the file has it signed with no date". Either way the tick day is never printed.
- **D3. `givenOf`.** Recommended: remove from the exports (no app caller); otherwise route it.
- **D4 (doc only).** Confirm the uniform is not a pair (flag and date are independent; a date is always real) and fix DATA-FORMAT 7.5's table row.

## Tasks

### Task 1: Failing tests (node) and the guard

**Files:** create `dev/app/test/nodate-reads.test.js` (node, TEST data only).

Setup, shared by all tests: load the TEST file the way `test/review-leftovers.test.js:8-9` does (`season`, `master = M.fromRoster(s.roster)`, `calendar = s.calendar`). Pick, by query (not by name), one active Sparks child and one T&T child who each have a book with a block that is fully dated; mutate in memory only: `Season.markSignsNoDate(s, id, book, [lastKeyOfThatBlock], '2026-10-30')` after deleting that key, and for awards `Season.setGiven(s, id, award, '2026-10-30', { noDate: true })` (option name confirmed at `season.js:780-784`). `2026-10-30` is a Friday and not a club night, so it can appear nowhere else. Assert on both `10/30` (any year format: `10/30`, `10/30/26`) and `2026-10-30`.

- [ ] `signShown is '' for a no-date sign-off and the date otherwise; signsShown leaves the key out` (FAILS: functions missing).
- [ ] `BUG 1: the Achievement Record prints no tick day` for Sparks, T&T and Cubbies (render `Reports.LIST` `achievement` with `opts.group` and `opts.kid`). Expected FAIL today.
- [ ] `every season report that shows given dates prints no tick day`: render `awardsByChild`, `achievement`, `booksYear`, `handOut`, `weeklySlips`, `ceremony`, `paceWatch` for the child's group and room. Passes today except `achievement` and, per D1, `booksYear`; keeps them honest.
- [ ] `BUG 2: pace ignores no-date sign-offs`: `Pace.signoffs(s, id, 'Sparks').core` does not contain `2026-10-30`; `extraTotal` unchanged. Also `Pace.kid(...)` `last` is not `2026-10-30`. FAIL today.
- [ ] `BUG 5 / D2: photo import over a no-date sign-off` per the decision (row status and that `reason` does not contain the tick day). FAIL today.
- [ ] `D1: completedBlocks / finishedBooks give no tick day` per the decision. FAIL today (if D1 = a or b).
- [ ] **Guard: no new direct read of a no-date pair.** Read every `dev/app/*.js` except `sw.js` and the test folder. Patterns: `/\b(?:season|s|o|App\.season)\.(?:given|progress|received)\b(?!NoDate)/` (so `config.progress`, `givenNoDate` do not match), `/\bprog\s*\[/`, `/receivedOf\(/`, `/GIVEN_FLAG|UNI\.GIVEN\b|x_Uni_GivenDate/`. Each hit is matched to an allow-list entry `{ file, fn, pattern, reason }`, where `fn` is the enclosing function found by scanning back to the nearest `function name(` or `const name =` (so moving code inside a function does not break it). Fails on: a hit with no entry ("new direct read in reports.js `foo`: use givenShown / signShown / receivedShown, or add an allow-list entry with a reason"), and an entry with no hit (stale). The allow-list is the "fine" rows above (5-17, 25, 28-32) with one-line reasons: presence test, validation, write path, helper, routed via `isGivenNoDate`/`isSignNoDate`. After Task 2 the bug sites read `signsShown` and need no entry. Today it FAILS on rows 1-4, 24, 27 (not allowed) by design.

Run: `cd dev/app && node test/nodate-reads.test.js`. Expected: the listed FAILs, nothing else.

### Task 2: Fix the five bugs and apply the decisions

- [ ] `season.js`: add `signShown`, `signsShown`; D1 and D2 and D3 per Mike; export.
- [ ] `reports-season.js` `achievement`: build rows from `Season.signsShown`; `blockRow`/`box` print `&#10003;` (no date) where `isSignNoDate`, the same tick the paper uses for received and given.
- [ ] `pace.js` `signoffs`: read `signsShown`; a no-date item still counts toward `extraTotal` but not as a dated sign-off. (Decision inside Task: does a no-date core sign-off count toward "core sections signed" in the pace strip? Recommended: count it in the total, not on any night.)
- [ ] `app-season.js` `sameBtn`: walk back over `signsShown` (a no-date box is skipped, not copied); `stored(t)`: `Season.signShown`.
- [ ] D1 consumers (rows 18-23) print the tick text when `noDate`.

Run: `node test/nodate-reads.test.js && node test/sign-nodate.test.js && node test/given-nodate.test.js && node test/received-nodate.test.js && node test/pace.test.js && node test/awards-lifecycle.test.js`. Expected: PASS.

### Task 3: Browser test for the Progress sheet (BUG 3, BUG 4)

**Files:** create `dev/app/test/nodate-sheet-browser.test.js`, copying the server and open-file setup of `test/clear-nodate-browser.test.js`.

- [ ] `Same date never copies a no-date day`: on a child's Progress sheet, make the last dated box of a row no-date (Given before finished, as the existing clear-nodate test does), then the next empty box's Same date button has no `2026-…` tick day in `data-date`/`title` (or is absent); pressing it does not write the tick day.
- [ ] `a half-typed date in a no-date box goes back to empty, not the hidden day`: type `0002` into the no-date box and leave it; the box is empty and the "no date" label is still there.

Run: `cd dev/app && NODE_PATH=/tmp/claude-1000/shim/node_modules node test/nodate-sheet-browser.test.js`, plus `clear-nodate-browser`, `given-nodate-browser`, `told-no-date-browser`, `progress-onepage-browser`, `print-layout-browser`. Expected: PASS (new file FAILS before Task 2).

### Task 4: Docs and release

- [ ] `docs/DATA-FORMAT.md`: 5.15/5.16 and 7.5 name `signShown`/`signsShown`; 7.5 uniform row replaced ("not a pair: `x_Uni_GivenFlag = '1'` means given, day unknown, and writes no date; a date in `x_Uni_GivenDate` is real"); section 15 item 7 marked fixed, pointing to the guard. `test/data-format-doc.test.js` must still pass.
- [ ] Version lines: bump line 1 of each changed file (`season.js` 1.59.1 -> 1.60.0, `reports-season.js` 1.30.0 -> 1.31.0, `pace.js` 1.0.0 -> 1.1.0, `app-season.js` 1.87.1 -> 1.87.2 or 1.88.0 with D1 text); `app-version`/`app-build` in `index.html` once for release 2a (currently `1.51.06`; the 2a wrap-up task owns it, not this item).
- [ ] `CHANGELOG.md` "Next release" (user words: "printed records and the pace strip no longer show a day for a sign-off marked no date; Same date skips no-date boxes"); `README.md` lists the two new tests; `BACKLOG.md` R21 "done in dev" with the decisions.
- [ ] Full run: `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh`. Expected: no new failures (known baselines per the app-test-setup notes). Commit per project rules; do not deploy.

## Risks

- **D1 moves award logic.** Blank earned dates touch `suggestedAwards`, `blueWingPlan` and the Announce lists. Keep D1 to display only if Mike prefers (add `noDate`, keep `date` for sorting/cut logic, print only through a `shownDate` field); that is the low-risk variant and is what Task 2 should do unless Mike says otherwise.
- **Allow-list rot.** Keyed on enclosing function plus pattern, so renames trip it; that is intended (a reviewer looks again). Keep reasons to one line.
- **Regex blind spots.** A read through a new alias (`const g = season.given`) is caught at the alias; reads through ledger objects (`r.given`) are not scanned (already routed). A read in `index.html` inline script is not scanned (none today).
- **Pace numbers change** for children with no-date sign-offs (fewer sections on the tick night). Expected and correct; mention in CHANGELOG.
- **TEST data may lack a fully dated block** for one group; the test builds one with `setProgress` on invented dates if so, and says so in a comment.
- Real data is never opened; tests mutate the TEST file in memory only.

## Open questions for Mike

1. D1: earned/finished date for a block or book that includes a no-date sign-off: blank with a tick (recommended), "by M/D", or leave as is?
2. D2: should a photo-import date replace a no-date sign-off (recommended), or stay a conflict?
3. Pace: does a no-date core sign-off count in "core sections signed" (recommended yes) while counting on no night?
4. D3: remove `givenOf` (recommended)?
5. D4: confirm the uniform "no date" box is meant to be independent of the date (today a date and the flag can both be set; the report then shows the date).
