# Wave 2: data safety (R16, R20, R18, R21, R11, R7, R10, R17) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The file check looks at every section and setting; the History replay warning can be trusted; no report prints a day nobody entered; a Drive save can no longer drop another leader's work or nag after the sign-in runs out; an older export cannot quietly replace newer data; and everything a Planning Center export holds is kept in the data file and survives every round trip.

**Architecture:** Three releases. **2a** (file check and reads: R16, R20, R18, R21) changes `validate.js`, `season.js` (`fromJson` logs its own upgrades), two report readers and a diagnostic tool. **2b** (Drive and import: R11, R7, R10) changes the save path (`app-season.js`, `app.js`, `drive.js`, `app-drive.js`). **2c** (R17, Planning Center capture) adds `roster.pcExport`, bumps the data-file format to version 6, and teaches the import, merge, validator and anonymizer about it. Every change starts with a failing test.

**Tech Stack:** Vanilla JS (no bundler), Node 24 for unit tests, Playwright 1.64 (Chromium) for browser tests, POSIX `sh`. No new dependencies.

**Spec:** `docs/DATA-FORMAT.md` (the data-file spec; section 15 lists the gaps), `dev/REVIEW-2026-11-12-whole-project.md`, BACKLOG "Review 2026-11-12" (R7, R10, R11, R16 to R21), the roadmap `2026-11-12-review-fixes-roadmap.md`, and for R17 Mike's requirement of 2026-11-13: **record any information that comes from the Planning Center outputs, even if the app does not use it.**

## Global Constraints
- Use the Edit and Write tools to change files; scripted rewrites (`sed -i`, inline `node -e` that writes files) are blocked. Tests may run anything.
- Never open, read, list or print a real data file (`archive/`, `~/Downloads`, `~/Nextcloud`, `dev/*.json`, `dev/*.csv`, `reports/`, `research_notes/`). Tests use `dev/test-data` and invented ids (`7000001_Test_Kid`). Tools that Mike runs on a real file print counts and kinds only, never a name, an id or a value.
- Tests run from `dev/app`: `node test/<name>.test.js`; browser tests need `NODE_PATH=/tmp/claude-1000/shim/node_modules`. The sweep is `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh` from the repo root.
- Each changed `.js` or `.html` file gets its own version line bumped in the task that changes it (`make-deploy.sh` refuses otherwise). `app-version` and `app-build` in `index.html` are bumped once per release, in that release's wrap-up task. `style.css` has no version line.
- A change to the data file: `docs/DATA-FORMAT.md` and `test/data-format-doc.test.js` change in the same task; a new top-level section goes in `Season.SECTIONS`, `AREA`, `describe`, `categoryOf` and the anonymizer's `HANDLED`; `dev/tools/make-test-data.js` must handle any new field and stop (exit 1, nothing written) on one it does not know; CHANGELOG gets its own line; older files must still open.
- Project rule: do not deploy. Each release ends at a committed, swept dev tree; Mike says "deploy".
- Commit messages end with the two attribution lines given in the session.

## What the review got right and wrong (checked against the code on 2026-11-13)
| Item | Verdict | Evidence |
|---|---|---|
| R16 | Holds, with one error | `validate.js` has no check for the eleven sections or the listed config keys. But the packed `pc` length **is** checked (`validate.js:65`); only its message is wrong (it says `missing "pc"`). `docs/DATA-FORMAT.md` section 12 repeats the error. |
| R17 (old meaning) | Holds, and is wider than stated | Unknown top-level keys are dropped by `fromJson`. Unknown keys **inside `roster`** and inside a person's entry are also dropped, at the first `syncData` (`app-season.js:21` rebuilds the roster from the in-memory master). The spec does not say so. |
| R18 | Half holds | `driveDirs`: holds (`catalog.js:86` still defaults `open`/`data`/`slides`). `x_ClubberID`: the app already drops it from `v` at the first sync after opening (`Model.toRoster` skips it), without logging; only the raw file, the validator and old History values still hold it. |
| R20 | Not reproduced here (no real file); three causes are provable from the code | See Task 4. |
| R21 | Holds, two places | `reports-season.js:48` (`blockRow`) prints `progress` dates on the paper Achievement Record without `isSignNoDate`; `pace.js:29` (`signoffs`) counts a no-date mark's day as a sign-off day. `given` and `received` readers all go through the "shown" functions. The uniform pair in spec 7.5 is **not** a tick-day pair (nothing writes a date when the box is ticked), so `reports.js:155` is right and the spec row is misleading. |
| R7 | Holds (by trace) | `app-drive.js:137` advances `c.rev`; in the "you changed something while it was saving" branch (`:151`) neither `c.base` nor the open season gets the merged content; the next save sees `head === c.rev` and uploads without merging. |
| R11 | Holds (by trace); one part is deliberate | `App.download` (`app.js:68`) alerts and downloads on any Drive failure, including an automatic save. `saveNow` (`app-season.js:237`) calls `markSaved()` before the Drive promise settles. A cancelled merge downloads a copy on purpose (pinned by `drive-inplace-browser.test.js`, "cancelling the merge writes nothing to Drive"). Whether a browser blocks the token pop-up cannot be shown in a test: Mike checks by hand. |
| R10 | Holds | `importPc` (`app.js:175`) never compares dates; `App.loadData` (`app.js:1116`) re-applies an export opened earlier in the session to any file opened later, also without a date check. |

## Review Focus
Failure modes no single task's test covers; each line names the task that owns a test for it.
1. **A real file that is fine today fails the new file check.** The stricter checks are written from the spec, not from a real file. Owner: Task 3 step 6 (Mike runs the count-only checker on his file before 2a is released).
2. **A copy of the app that has not updated meets a version 6 file.** It must refuse to open it and must never overwrite it on Drive. Owner: Task 14 (test with a pre-2c build's `Season.VERSION`).
3. **The anonymizer copies a new roster key verbatim.** Today `make-test-data.js` deep-copies `roster` and only rewrites `people`. Owner: Task 12, which lands **before** any task that writes `pcExport`.
4. **Importing the same export twice makes the file "unsaved" or grows History.** Owner: Task 15 (the content hash).
5. **Two leaders import different exports, then one merges or saves to Drive.** The Planning Center data must end as one export's, not a mixture. Owner: Task 16.
6. **An export column named like one of the club's own columns** (`x_Notes`, `team:Q1`, `ov:Grade`). It must not overwrite the club's value. Owner: Task 13.
7. **An edit made while a Drive save is in flight** is marked saved, or lost. Owner: Tasks 8 and 9.

## File Structure
| File | Change | Responsibility |
|---|---|---|
| `dev/app/validate.js` | modify | One named check per section and config key; `CHECKED_SECTIONS`, `CHECKED_CONFIG`; `check` on every finding; `pcExport` and unknown-key info lines. |
| `dev/app/season.js` | modify | `fromJson` logs its upgrades as one History entry; `driveDirs` and `x_ClubberID` migrations; `signShown`; unknown top-level keys kept; `VERSION` 6. |
| `dev/app/catalog.js` | modify | `driveDirs` default `{ club: null, slides: null }`. |
| `dev/app/reports-season.js`, `dev/app/pace.js` | modify | Read sign-off dates through `Season.signShown`. |
| `dev/app/csv.js` | modify | `toTable`: the grid with nothing dropped. |
| `dev/app/model.js` | modify | `normalizePc` keeps header and stored names; `applyPlan` reports attached ids and loose rows; `captureExport`, `exportBack`, `olderExport`; `toRoster`/`fromRoster` carry `pcExport` and unknown roster keys. |
| `dev/app/datamerge.js` | modify | `alignPc`: the Planning Center block moves as one unit. |
| `dev/app/app.js` | modify | `importPc` (older-export question, capture, every refresh logged), `download` (quiet failure for automatic saves). |
| `dev/app/app-season.js` | modify | `syncData` keeps roster keys it does not own; `saveNow` marks saved only on success; `App.editSeq`. |
| `dev/app/drive.js`, `dev/app/app-drive.js` | modify | No token request without a click for automatic saves; re-merge after a save that was edited over; simplified folder readers. |
| `dev/tools/make-test-data.js` | modify | Fail closed on unknown roster keys and unknown columns; anonymize `pcExport`. |
| `dev/tools/check-file.js`, `dev/tools/replay-report.js` | create | Count-only tools Mike runs on a real file. |
| `docs/DATA-FORMAT.md`, `dev/app/test/data-format-doc.test.js` | modify | Kept in step with every format change. |
| Tests | create/modify | Named in each task. |

---

# Release 2a: the file check and what is read (R16, R20, R18, R21)

### Task 1: A named check for each of the eleven unchecked sections (R16, part 1)

**Files:**
- Modify: `dev/app/validate.js` (inside `validateData`), `dev/app/test/validate.test.js`
- Modify: `docs/DATA-FORMAT.md` section 12

**Interfaces:**
- Produces: every finding is `{ level, msg, check }`, `check` being the section name (`'held'`, `'flags'`, ...), `'config.<key>'`, `'roster'`, `'calendar'`, `'rotation'`, `'history'` or `'file'`. Existing findings get the `check` of the block they are in.
- Produces: `Validate.CHECKED_SECTIONS: string[]`, the sections that have a check, built from the same table the checks run from (not typed by hand twice).
- Rule for levels, used by Tasks 1 to 3: wrong type or shape = `error`; a reference to a person, book or award the file does not know = `warn`; something extra the app does not use = `info`.

- [ ] **Step 1: Write the failing tests** in `validate.test.js`, one test per section, each starting from `goodSeason()` and asserting with `has(run(x), level, re)`:

| Test name | Corrupt value | Expected finding |
|---|---|---|
| `held: an award map per child, each mark 1` | `held[id] = ['HG Red Jewel 1']`; `held[id] = { 'HG Red Jewel 1': true }` | `error` `/Held awards for/` (both) |
| `flags: a note, a known level, text fields` | `flags.f1 = { kid: id, level: 'nope', note: 'x', at: '2026-10-28' }`; note `''`; `at: '2026-02-30'` | `error` `/Flag f1/` (each) |
| `doneBooks: a list of book codes` | `doneBooks[id] = 'AoG'`; `doneBooks[id] = ['ZZ']` | `error` `/Books finished before/`; `warn` `/ZZ.*not in the list of books/` |
| `received: a real date, "no date" or empty` | `received[id] = { HG: '2026-02-30' }`; `received[id] = { HG: 'no date' }` | `error` `/Date received/`; no finding for `no date` |
| `givenNoDate: a list of award names that are also in given` | `givenNoDate[id] = { a: 1 }`; `givenNoDate[id] = ['X']` with no `given[id].X` | `error` `/Given, no date/`; `warn` `/has no Given entry/` |
| `progressNoDate: per book, a list of keys that are also in progress` | `progressNoDate[id] = ['RJ1.1']`; `progressNoDate[id] = { HG: ['RJ1.9'] }` with no such progress key | `error` `/No-date sign-offs/`; `warn` `/has no sign-off/` |
| `extraSheets: a list of book codes` | `extraSheets[id] = { WR: 1 }` | `error` `/Added sheets/` |
| `announcedNoDate: a list of award names` | `announcedNoDate[id] = 'X'` | `error` `/Told, no date/` |
| `blueWings: placements with book, slot 1 to 4 and real dates` | `blueWings[id] = [{ book: 'HG', slot: 5, n: 1, threshold: 6, earned: '2025-10-01', date: '2025-11-05', year: '2025-26' }]` | `error` `/Blue Jewel placement/` |
| `blueOverrides: book, slot 1 to 4, a real date, a text note` | `blueOverrides[id] = [{ book: 'HG', n: 2, date: 'soon', note: '' }]` | `error` `/Blue Jewel given by hand/` |
| `blueDrops: "gem|date" text` | `blueDrops[id] = ['1-2026-10-07']` | `error` `/Dropped Blue Jewel/` |
| `every new section check warns about a person who is not on the roster` | each of the eleven keyed by `'9999999_No_One'` with a valid value | the existing ghost `warn` `/not on the roster/` counts 11 |
| `findings say which check made them` | `held[id] = []` | the finding has `check === 'held'` |

Run: `node test/validate.test.js`. Expected: the 13 new tests FAIL (no finding today).
- [ ] **Step 2: Implement.** In `validateData`, a table `const SECTION_CHECKS = { held(o, ctx) {...}, flags(...) {...}, ... }` run for every key of `Season.SECTIONS` that has an entry; `ctx = { err, warn, info, known, books, people }` where `err`, `warn`, `info` are bound to the section's `check`. Move the existing inline blocks (`attendance`, `games`, `awards`, `given`, `adults`, `teamMoves`, `handbooks`, `progress`, `calendar`, `rotation`) into the same table without changing their messages. Export `CHECKED_SECTIONS = Object.keys(SECTION_CHECKS)` plus `'config'` and `'roster'` (their checks are Tasks 2 and 3). Shapes: `docs/DATA-FORMAT.md` 5.7 to 5.11 and 5.16 to 5.21. Flag levels come from `Season.FLAG_LEVELS` (export it from `season.js` if it is not exported; bump `season.js`).
- [ ] **Step 3: Run** `node test/validate.test.js`. Expected: all pass, including `a valid data file has no errors or warnings` (the TEST file must stay clean; if a new check fires on it, the check is wrong or the TEST file is: say which before changing either).
- [ ] **Step 4: Spec.** In `docs/DATA-FORMAT.md` section 12 move the eleven sections from "Not checked" to "Checked". Run `node test/data-format-doc.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `validate.js`, `season.js` (if touched), the test, the spec. Bump `validate.js` to 1.9.0.

### Task 2: Checks for the shape of `config` (R16, part 2)

**Files:**
- Modify: `dev/app/validate.js`, `dev/app/test/validate.test.js`, `docs/DATA-FORMAT.md` section 12

**Interfaces:**
- Consumes: Task 1's level rule and `check` field.
- Produces: `Validate.CHECKED_CONFIG: string[]`: every config key that has a check, including the eleven the validator already checks (`clubDay`, `blueJewelWeeks`, `teamOrder`, `saveStyleDrive`, `saveStyleLocal`, `autoUpdate`, `autoSave`, `drivePinDays`, `sparksBooks`, `yearBook`, `placePoints`).

- [ ] **Step 1: Failing tests** (`validate.test.js`), one per row, from `goodSeason()`:

| Key | Corrupt value | Expected |
|---|---|---|
| `books` | `books.HG = 'Hang Glider'`; `books.TOOLONG = { name: 'x', emblem: '', group: 'Sparks' }`; `books.HG.group = 'Teens'` | `error` `/Book HG/`, `/Book TOOLONG/`, `/Book HG.*group/` |
| `progress` | `progress.Sparks.perBook = 'x'`; a block with no `key`; a block whose `items` is not a list of text | `error` `/progress template for Sparks/` |
| `awardLists`, `exclude`, `completion`, `endOfYear` | `awardLists.Sparks = 'x'` (and the same for each) | `error` `/award list/` naming the key |
| `store` | `store.method = 'guess'`; `store.min = 'a'`; `store.weights.awards = -1` | `error` `/store points/` |
| `teamPlan` | `teamPlan.proj = { [id]: 'RBX-' }`; `teamPlan.locked = { Q9: '2026-10-01' }` | `error` `/team plan/` |
| `teamsOk` | `teamsOk.repeats = 'x'`; `teamsOk.uneven = ['Q7']` | `error` `/accepted team warnings/` |
| `todoIgnored` | `todoIgnored = ['no bars here']` | `error` `/ignored To do item/` |
| `driveDirs` | `driveDirs.club = 'folder'`; `driveDirs.club = { id: 5 }` | `error` `/Drive folder/` |
| `bundles` | `bundles = [{ name: 'x' }]` | `error` `/report bundle/` |
| `bookOrder`, `slideNames`, `medRead`, `medPrinted`, `clubTitle`, `driveKeepName`, `cubbiesDetail` | wrong type for each | `error` naming the key |
| an unknown key | `config.futureThing = 1` | `info` `/1 setting this app does not know is kept as it is \(futureThing\)/`; no error |

Run. Expected: FAIL.
- [ ] **Step 2: Implement** `const CONFIG_CHECKS = { books(v, ctx) {...}, ... }`, the eleven existing checks moved into it unchanged; `CHECKED_CONFIG = Object.keys(CONFIG_CHECKS)`; a key in the file that is in neither `CONFIG_CHECKS` nor `tntBook` is counted for the one info line. Shapes: spec section 6.
- [ ] **Step 3: Run** `node test/validate.test.js` and `node test/options.test.js`. Expected: PASS.
- [ ] **Step 4: Spec** section 12 updated the same way. **Commit.**

### Task 3: Roster checks, the rule that nothing can be added unchecked, and a count-only checker (R16, part 3)

**Files:**
- Modify: `dev/app/validate.js`, `dev/app/test/validate.test.js`, `dev/app/test/season-sections.test.js`, `docs/DATA-FORMAT.md` (5.2 and 12), `dev/tools/make-test-data.js` (one regex)
- Create: `dev/tools/check-file.js`, `dev/app/test/check-file.test.js`

**Interfaces:**
- Produces: `node dev/tools/check-file.js <data.json>` prints one line per `(level, check)` pair with a count, a total line, and nothing else (no message text: messages hold ids). Exit 1 when any `error`.

- [ ] **Step 1: Failing tests.**
  - `validate.test.js`, `the roster's lists and each person's own fields are checked`: `roster.pcCols = ['A', 'A']` gives `error` `/column names.*twice/`; `roster.pcAsOf = '2026-13-01'` gives `warn` `/as of/`; a packed `pc` one value short gives `error` `/has 5 Planning Center values but the file names 6 columns/` (today's message says `missing "pc"`); `v.x_Active = 'yes'` gives `error`; `v['x_Uni_GivenDate'] = 'soon'` gives `error`; `v['x_noteam:Q2'] = '1'` gives no finding; `v.x_Mystery = 'a'` gives `info` `/1 owned field this app does not know/`.
  - `season-sections.test.js`, `every tracked section has a file check, and every default setting has one`: `Season.SECTIONS.filter(k => !Validate.CHECKED_SECTIONS.includes(k))` is `[]`; `Object.keys(Catalog.defaultConfig()).filter(k => !Validate.CHECKED_CONFIG.includes(k))` is `[]`.
  - `check-file.test.js`: write a `goodSeason`-style file with one bad `held` entry for `7000001_Test_Kid` to a temp dir; run the tool; assert exit 1, stdout contains `error held 1`, and stdout does not contain `7000001` or `Test_Kid`.
  Run all three. Expected: FAIL.
- [ ] **Step 2: Implement** the roster check (`SECTION_CHECKS.roster`), the two exports' coverage, and the tool (it calls `Validate.validate(text, name)` and groups by `level` and `check`).
- [ ] **Step 3: `x_noteam:Qn`.** It is written by `Model.setTeamChoice` (`model.js:462`) and is in neither the spec nor the anonymizer's explicit list. Add the row to the spec's 5.2 table (`x_noteam:Q1..Q4`, `'1'` = left without a color on purpose) and `x_noteam:` to the pass-through regex in `anonV` (`make-test-data.js:227`). Add to `data-format-doc.test.js`'s owned-column test: `` doc.includes('`x_noteam:Q1') ``.
- [ ] **Step 4: Run** `node test/validate.test.js && node test/season-sections.test.js && node test/check-file.test.js && node test/data-format-doc.test.js`. Expected: PASS.
- [ ] **Step 5: Commit.**
- [ ] **Step 6 (Mike, by hand, before 2a is released):** `node dev/tools/check-file.js <his current data file>`. Expected: no `error` lines. Any `error` line is reported back as `check` and count only; the check is then loosened to `warn` or the file is repaired, Mike decides which.

### Task 4: The History replay warning: find the causes (R20, investigation)

**Files:**
- Create: `dev/tools/replay-report.js`, `dev/app/test/replay-report.test.js`, `dev/app/test/replay-causes.test.js`
- Create: `docs/superpowers/plans/2026-11-13-r20-replay-findings.md` (the note of causes; written by the implementer in step 5)

**Interfaces:**
- Produces: `node dev/tools/replay-report.js <data.json>` prints the number of places where the data differs from the replayed History, grouped by **path shape**: every path part that is a key of `roster.people` becomes `<id>`, every `YYYY-MM-DD` part becomes `<date>`, the rest is printed (section names, book codes, Planning Center column names, award names). One line per shape with its count and kind (`added`, `removed`, `changed`). No value is ever printed.
- Produces: `replay-causes.test.js`, one test per cause, each asserting **the replay check stays quiet** after a scripted operation on the TEST file. Each fails today if the cause is real.

Why these candidates: the replay (`validate.js:158`) rebuilds the file from History and compares; it can only differ at a path History has logged whose value later changed **without** a log entry. The code has three such routes.

- [ ] **Step 1: The tool and its test.** `replay-report.test.js`: a `goodSeason`-style file where `attendance['2026-10-28']['7000001_Test_Kid'].h` is set without a History entry; assert stdout has `attendance › <date> › <id> › h` with count 1 and does not contain `7000001`.
- [ ] **Step 2: Cause A, a silent export refresh.** `importPc` (`app.js:183-186`) applies the export and calls `App.rebase()` when no visible field changed. `planImport` leaves the money columns (`HIDDEN_COLS`) and columns new to the file out of `changes`, so their new values, `pcAsOf`, `pcSource` and `pcCols` enter the file with no entry. Test `a refresh that changes only a money column is logged` (node, no browser): load the TEST data and the 20261028 TEST export through `Model.fromRoster` / `planImport` / `applyPlan` exactly as `importPc` does, with one `Balance Due` value changed in the export text; then run the steps `importPc` runs (rebase when `edited` is false); assert `Validate.validate(Season.toJson(s), OK_NAME)` has no `/differs from what the history says/`. Expected: FAIL.
- [ ] **Step 3: Cause B, upgrades on open.** `fromJson` (`season.js:125-155`) rewrites data (`upgradeTnt`, `upgradeSparksJewels`, `upgradeStartZone`, the Review Emblem rename, `addStandardBooks`, `upgradeCubbies`, `upgradeSettings`) and only `renameBooks` also rewrites History. Test `a file saved before the Start Zone change opens with a History that still adds up`: build a season whose T&T template has `SZ1`/`SZ2` blocks and a logged `progress[id].common['SZ1.1']`; `toJson`, validate; assert no replay warning. Same shape for `a plain "Red Jewel 1" given before jewels carried the book code`. Expected: FAIL.
- [ ] **Step 4: Cause C, tidying on open.** `setSeason` (`app-season.js:26`) runs `loadData` then `rebase()`: the roster is rebuilt by `Model.toRoster(Model.fromRoster(roster))`, the calendar re-sorted, and an export opened earlier in the session re-applied (`app.js:1116`), none of it logged. Test `opening a file and syncing changes nothing`: for the TEST file, `Season.diff(Season.snapshot(s), Object.assign({}, s, { roster: Model.toRoster(Model.fromRoster(s.roster)), calendar: Calendar.sort(s.calendar.map(r => Object.assign({}, r))) }))` is `[]`. Second test: the same with `v.x_ClubberID` present on one person and a History entry that added that person whole; assert no replay warning after the round trip. Expected: the second FAILS; record whether the first does.
- [ ] **Step 5: Write the findings note** (`2026-11-13-r20-replay-findings.md`): for each cause, the test name, whether it failed, and the path shapes it produces. Invented ids only.
- [ ] **Step 6 (Mike, by hand):** `node dev/tools/replay-report.js <his data file>`; he pastes the output (shapes and counts only). Compare with the note. **If a shape is not explained by causes A to C, stop and add a cause and its failing test before Task 5.**
- [ ] **Step 7: Commit** the tool, the two tests (the cause tests are expected to fail until Task 5: name the file `replay-causes.test.js` and list it in the commit message as "red until Task 5"; do not run the sweep between Tasks 4 and 5).

### Task 5: The History replay warning: make it true again (R20, fixes)

**Files:**
- Modify: `dev/app/season.js` (`fromJson`), `dev/app/app.js` (`importPc`), `dev/app/app-season.js` (restore), `dev/app/validate.js`
- Modify: `dev/app/test/replay-causes.test.js`, `dev/app/test/season.test.js`, `docs/DATA-FORMAT.md` (10.4, 11.1, 15)

**Interfaces:**
- Consumes: Task 4's tests.
- Produces: `fromJson` appends at most one History entry `{ t, label: 'File upgrade', tag: 'File upgrade', changes }` holding everything its upgrades changed in a tracked section. `t` is the last entry's `t` (or `1970-01-01T00:00:00.000Z` for an empty History), so reading the same text twice gives the same entry. A file that needs no upgrade gets no entry.
- Produces: `Season.reconcile(s, now) -> number`: when the data differs from the replayed History, appends one entry `Reconciled: History did not match the data` holding the differences, and returns how many; 0 when they already agree.
- Produces: `importPc` logs every refresh that changed anything (History label prefix `Planning Center refresh`).

- [ ] **Step 1: Failing unit tests** in `season.test.js`: `fromJson logs its own upgrades once` (the Start Zone file from Task 4: after `fromJson`, the last entry's label is `File upgrade`; `Season.toJson(Season.fromJson(Season.toJson(Season.fromJson(text))))` equals `Season.toJson(Season.fromJson(text))`); `a current file gains no entry` (TEST file: `fromJson(text).history.length` equals the raw file's); `reconcile adds one entry and the replay check is then quiet`.
- [ ] **Step 2: Implement `fromJson`.** Move the copy of `roster`, `calendar`, `rotation` and `history` above the upgrade calls; take `const before = snapshot(s)` after the config defaults are merged and the sections copied; run the upgrades; `const changes = diff(before, snapshot(s))`; append the entry when `changes.length`. The entry carries `tag` so `record` never folds a later edit into it. `renameBooks` keeps rewriting History as it does (its changes are then not in `changes`: take `before` after it).
- [ ] **Step 3: Implement `importPc`.** Replace `if (edited) App.changed(); else App.rebase();` with: call `App.changed()` when `Season.diff` of the snapshot against the synced season is non-empty, else `App.rebase()`. Expose what is needed from `app-season.js` as `App.pendingDiff(): number` (the length of `Season.diff(snap, season)` after `syncData`). The same rule for the re-apply in `App.loadData`: `setSeason` must not `rebase()` over an import that changed something; record it as its own entry before the rebase.
- [ ] **Step 4: Restore.** `app-season.js` restore path (`setSeason(Season.restoreTo(season, v).season, ...)`): pass the restored season through `Season.fromJson(Season.toJson(x))` first, so a restore to before a `File upgrade` entry is upgraded again instead of leaving old-form data in memory. Test in `season.test.js`: `restoring to before a file upgrade and reopening gives current-form data`.
- [ ] **Step 5: The warning's wording and the repair.** `validate.js`: the replay warning ends with "Validate tab: Reconcile History records the difference as one entry." Add a `Reconcile History` button beside that finding on the Validate tab (`app-tools.js`; it calls `Season.reconcile`, then `App.touch()`), shown only when the warning is present. Browser test in `info-browser.test.js`'s neighbour `validate-reconcile-browser.test.js`: open a TEST file with one unlogged change, press the button, the warning is gone, History has one more entry, the file is unsaved.
- [ ] **Step 6: Run** `node test/replay-causes.test.js && node test/season.test.js && node test/validate.test.js && node test/datamerge.test.js && node test/merge.test.js`, then the browser files `import-browser`, `import-conflicts-browser`, `drive-inplace-browser`, `fresh-start-browser`. Expected: PASS (the Drive tests matter: `lineage()` compares file text and builds its base with `fromJson`).
- [ ] **Step 7: Spec.** 10.4 (what the replay check means now), 11.1 (the `File upgrade` entry), 15 item 6 marked fixed with the causes. **Commit.** Bump `season.js`, `app.js`, `app-season.js`, `app-tools.js`, `validate.js`.

### Task 6: Legacy spellings are migrated on open (R18)

**Files:**
- Modify: `dev/app/season.js` (`fromJson`), `dev/app/catalog.js:86`, `dev/app/app-drive.js:44-50`, `dev/tools/make-test-data.js`
- Modify: `dev/app/test/season.test.js`, `dev/app/test/drive-inplace-browser.test.js`, `docs/DATA-FORMAT.md` (5.2, 6, 15), `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 5's upgrade entry (the migrations are logged by it; this is why R18 follows R20).
- Produces: after `fromJson`, `config.driveDirs` has exactly the keys `club` and `slides`; `club` is the file's `club`, else `data`, else `open`. No person's `v` holds `x_ClubberID`.

- [ ] **Step 1: Failing tests** (`season.test.js`): `driveDirs: an older file's data folder becomes the club folder` (`{ open: A, data: B, slides: C }` gives `{ club: B, slides: C }`; `{ open: A, data: null, slides: null }` gives `{ club: A, slides: null }`; `{ club: X, open: A, data: B }` gives `{ club: X, slides: null }`); `x_ClubberID is taken out of v on open and the change is in the File upgrade entry`; `a file with neither is unchanged byte for byte` (TEST file: `toJson(fromJson(text)) === text`). Expected: the first two FAIL.
- [ ] **Step 2: Implement** `upgradeDriveDirs(s)` and `upgradeRosterIds(s)` in `season.js`, called with the other upgrades; `catalog.js` default becomes `{ club: null, slides: null }`; `app-drive.js` `dirOf`, `sharedOf` and `setShared` read and write `club` and `slides` only. The anonymizer keeps its `x_ClubberID` handler for old History values (comment says so).
- [ ] **Step 3: Run** `node test/season.test.js`, `node test/catalog` neighbours (`options.test.js`, `data-format-doc.test.js`), and `NODE_PATH=... node test/drive-inplace-browser.test.js` (the test `an older data file that kept separate "open from" and "data files" folders gets one club folder: the data folder` must still pass). Expected: PASS.
- [ ] **Step 4: Spec and CHANGELOG.** Section 6 `driveDirs` row (two keys; older names migrated on open); 5.2 `x_ClubberID` row; section 15 items 3 and 4 marked fixed; CHANGELOG "format" line. **Commit.** Bump `season.js`, `catalog.js`, `app-drive.js`.

### Task 7: No report shows the day a no-date box was ticked (R21)

**Files:**
- Modify: `dev/app/season.js`, `dev/app/reports-season.js:47-61`, `dev/app/pace.js:26-40`
- Create: `dev/app/test/nodate-reads.test.js`
- Modify: `docs/DATA-FORMAT.md` 7.5

**Interfaces:**
- Produces: `Season.signShown(s, id, book, key) -> string`: the sign-off date, or `''` when `isSignNoDate`. Exported.
- Produces: the paper Achievement Record prints a tick with no date (`&#10003;`) in a no-date box; `Pace.signoffs` leaves no-date sign-offs out of `core` and `extra` (they are not evidence of pace) and still counts them in `extraTotal`.

- [ ] **Step 1: Failing tests** (`nodate-reads.test.js`, node, TEST data). Pick one Sparks child of the TEST file; set through the real setters, with the sentinel day `2026-10-30` (a Friday, not a club night): `Season.markSignsNoDate(s, id, book, [key], '2026-10-30')` and `Season.setGiven(s, id, award, '2026-10-30', { noDate: true })` (use the option name `setGiven` really takes; read `season.js:780`).
  - `signShown is empty for a no-date sign-off and the date otherwise`.
  - `no printed report shows the day a no-date box was ticked`: render every report the Reports tab lists for that child's class (the list `reports-season.test.js` iterates) and assert no HTML contains `10/30` or `2026-10-30`.
  - `pace does not count a no-date sign-off as a dated one`: `Pace.signoffs(s, id, 'Sparks').core` does not contain `2026-10-30`.
  - `no report file reads given, received or progress dates directly`: read the source of `reports.js`, `reports-season.js`, `slides.js`, `pace.js`, `app-person.js`, `app-todo.js`, `todo.js`; fail on a match of `/season\.(given|received)\[/` or `/\.progress\[[^\]]+\]\s*\|\|\s*\{\}/` outside this allow-list, each entry with its reason: `reports-season.js` `awardInfo` (checks `isGivenNoDate` first), `reports-season.js` `prog` (dates go through `signShown` in `box`), `pace.js` `kid` (filtered by `isSignNoDate`). `stats.js` and `store.js` are not scanned: they count sections and never show a date.
  Run. Expected: the report test FAILS on the Achievement Record; the pace test FAILS.
- [ ] **Step 2: Implement.** `blockRow` takes a `shown(key)` function instead of the `dates` object; `achievement` builds it from `Season.signShown` and `Season.isSignNoDate` for the child and scope. `pace.js` `take` skips a key when `Season.isSignNoDate(season, id, book, key)`.
- [ ] **Step 3: Run** `node test/nodate-reads.test.js && node test/pace.test.js && node test/reports-season.test.js && node test/sign-nodate.test.js`, then the browser files `progress-onepage-browser`, `print-layout-browser`. Expected: PASS.
- [ ] **Step 4: Spec 7.5.** Name `signShown`; replace the uniform row with: "Uniform given, day unknown: `x_Uni_GivenFlag` = `'1'`, and no date is written for it (a date in `x_Uni_GivenDate` is a real date)." **Commit.** Bump `season.js`, `reports-season.js`, `pace.js`.

### Task 7b: Release 2a wrap-up

- [ ] **Step 1:** Bump `app-version` to the next free `1.51.x` (expected `1.51.07`) and `app-build` to the day.
- [ ] **Step 2:** `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh`. Expected: no failures.
- [ ] **Step 3:** `sh make-deploy.sh` runs clean (no STOP). Do not rsync to production.
- [ ] **Step 4:** CHANGELOG ("Next release"), README (new tests and the two tools), BACKLOG (R16, R18, R20, R21 "done in dev").
- [ ] **Step 5: Commit** and report, including what Mike still has to run by hand (Task 3 step 6, Task 4 step 6).

---

# Release 2b: Drive saves and the import (R11, R7, R10)

No format change. Independent of 2a except that Task 10 edits `importPc`, which Task 5 also edits: do 2a first.

### Task 8: An automatic Drive save that cannot sign in stays quiet, and "saved" means saved (R11)

**Files:**
- Modify: `dev/app/drive.js` (`connect`, `connected`), `dev/app/app-drive.js` (`App.driveSave.go`), `dev/app/app.js` (`download`), `dev/app/app-season.js` (`saveNow`, `markEdit`, `touchSeason`), `dev/app/app-update.js` (`runAuto`)
- Modify: `dev/app/test/drive.test.js`, `dev/app/test/drive-inplace-browser.test.js`

**Interfaces:**
- Produces: `App.editSeq(): number`, a counter that goes up on every edit (logged or held). Task 9 uses it.
- Produces: `d.connected(): boolean` is true only while the token has more than 60 seconds left (the same margin `connect` uses).
- Produces: `App.driveSave.go(name, text, type, { auto: true })` rejects with an error whose `quiet === true` and `signin === true` when `!d.connected()`, **without** calling `requestAccessToken`. `App.download` for a `quiet` error shows no alert, starts no download and returns a rejected promise.
- Produces: `saveNow` resolves `false` and leaves the file unsaved when the Drive save rejects quietly; on success it calls `markSaved()` only if `App.editSeq()` is what it was when the text was taken, otherwise the file stays unsaved and only the "saved at" time is updated.
- Unchanged on purpose: a save **you** pressed that fails still alerts and downloads a copy; a cancelled merge still downloads a copy (existing test).

- [ ] **Step 1: Failing tests.**
  - `drive.test.js`: `connected() is false in the last minute of a token` (fake clock via the `env`).
  - `drive-inplace-browser.test.js`. Extend the fake sign-in: `GSI` counts calls in `window.__tokenAsks` and gives `expires_in: window.__ttl || 3600`. New tests:
    - `an automatic save after the sign-in ran out asks nothing and downloads nothing`: open F1 from Drive with `__ttl = 1`, wait 1.2 s, edit, run the automatic save the way `update-autosave-browser.test.js` line 77 does. Assert `seen.dialogs.length === 0`, `seen.downloads === 0`, `window.__tokenAsks` unchanged, no `PATCH` in `d.calls`, `App.dirty() === true`, and `#autoStatus` reads `/Auto-save is waiting: press Save to sign in to Google again/`.
    - `the next Save you press signs in and saves to Drive`: then `save(p)`; assert one `PATCH`, `App.dirty() === false`, `#autoStatus` no longer says waiting.
    - `an edit made while a Drive save is in flight is still unsaved afterwards`: hold the `PATCH` with `d.beforePatch` (edit inside it via `p.evaluate`), let it finish; assert `App.dirty() === true` and Drive's text does not hold the late edit.
  Run. Expected: FAIL (alert and download today; the late edit is marked saved or not depending on timing).
- [ ] **Step 2: Implement** as in Interfaces. `runAuto` sets the waiting text when `saveNow` resolves `false` and `App.driveSave.active()`; it keeps trying on its timer (each try is silent).
- [ ] **Step 3: Run** `node test/drive.test.js`, then `drive-inplace-browser`, `drive-browser`, `update-autosave-browser`, `save-dot-browser`, `save-style-browser`. Expected: PASS.
- [ ] **Step 4: Commit.** Bump the five files.
- [ ] **Step 5 (Mike, by hand, real Google account):** leave a Drive file open with auto-save on for 70 minutes, make an edit, wait for the next automatic save. Expected: no pop-up, no alert, no download; the waiting line shows; pressing Save signs in and saves. This is the only way to see what a real browser does with the token request.

### Task 9: A Drive save that was edited over merges again before the next upload (R7)

**Files:**
- Modify: `dev/app/app-drive.js` (`saveInPlace`, `driveHandoff`)
- Modify: `dev/app/test/drive-inplace-browser.test.js`

**Interfaces:**
- Consumes: `App.editSeq()` (Task 8).
- Produces: the lineage record `c` gains `remerge: boolean`. After a merged save during which the leader edited, `c.base` is the snapshot of the text this copy sent into the merge, `c.remerge = true`, and the open season is left alone. The next save merges whenever `c.remerge || head !== c.rev`, with `c.base` as the base, so only edits made since are replayed onto what Drive holds. `c.remerge` is cleared when a save ends with the open season equal to what was uploaded.
- Produces: the message for that branch reads "You changed something while it was saving, so this screen was not refreshed. Your changes are safe; the next save brings in the others' changes first."

- [ ] **Step 1: Reproduce (failing test).** `leader B saved, leader A's save merged, A edited during that save: A's next save still holds B's changes`. A opens F1. B's change is written straight into the fake Drive (`d.rev('F1', textWithB)`, a Present mark for a second TEST child). A edits (mark X) and saves; `d.beforePatch` makes A edit again (mark Y) while the upload is in flight; press through the merge screen with `applyMerge`. Then A saves again. Assert Drive's head text holds B's mark, X and Y; assert the second save did a `GET ...alt=media` before its `PATCH`; assert A's screen shows B's mark after the second save. Expected: FAIL (B's mark is missing from the head revision; it survives only in an older revision).
- [ ] **Step 2: Same case for the automatic save** (no merge screen): `...and the same when both saves are automatic`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `saveInPlace`: take `const seq = App.editSeq()` at the start; replace `if (!App.dirty())` with `if (App.editSeq() === seq)`; in the other branch set `c.base = Season.snapshot(Season.fromJson(text)); c.remerge = true;`. The head check becomes `if (c.remerge || now.headRevisionId !== c.rev)`. After the refresh branch (`App.openSeason(body)` and the `c.season` update) set `c.remerge = false`. `driveHandoff.get` adds `remerge`; `set` restores it (the base after an update reload is the reloaded season, so with `remerge` true the next save still reads Drive first).
- [ ] **Step 4: Run** the whole of `drive-inplace-browser.test.js` and `merge-files-browser.test.js`. Expected: PASS, including `someone saves in the gap between the check and the write`.
- [ ] **Step 5: Commit.** Bump `app-drive.js`.

### Task 10: An export older than the file's Planning Center data is not applied without a yes (R10)

**Files:**
- Modify: `dev/app/model.js`, `dev/app/app.js` (`importPc`, `App.loadData`)
- Modify: `dev/app/test/roster.test.js` (or `pc-columns.test.js`), `dev/app/test/import-browser.test.js`

**Interfaces:**
- Produces: `Model.olderExport(master, name) -> { older: boolean, exportDate: string, fileDate: string }`: `exportDate` is the leading `yyyymmdd` of the name as `YYYY-MM-DD` or `''`; `older` is true only when both dates exist and `exportDate < fileDate` (`fileDate` is `master.pcAsOf`).
- Produces: `importPc(text, name, opts)`; `opts.quiet` (the re-apply in `App.loadData`) never asks: an older export is skipped, `lastPc.declined = true`, and `App.flash` says "The export opened earlier (as of X) is older than this file's Planning Center data (as of Y), so it was not applied."
- Not changed, on purpose: a refresh of people already known still applies without a review. After Task 5 it is always in History and can be undone, which answers the review's second sentence.

- [ ] **Step 1: Failing tests.**
  - Unit: `olderExport: older, same day, newer, and a name with no date` (`'20261028 -- x TEST.csv'` against `pcAsOf` `2026-11-03` is older; `20261103` is not; `20261104` is not; `'export.csv'` is not, with `exportDate === ''`).
  - Browser (`import-browser.test.js`): `an older export asks first; Cancel leaves the file as it was`: open the TEST data file with the 20261103 TEST export, then import the 20261028 one with the dialog handler set to dismiss; assert the confirm text matches `/older than the Planning Center data already in this file/`, `App.master.pcAsOf === '2026-11-03'`, and the file is not marked unsaved by it. `...and OK applies it`: accept; `pcAsOf === '2026-10-28'`. `an older export opened before the data file is not applied to it`: open the 1028 export first (no file), then a data file whose `pcAsOf` is `2026-11-03`; assert `pcAsOf` stays, and the flash text.
  Run. Expected: FAIL.
- [ ] **Step 2: Implement.** In `importPc`, after the "looks like an export" check and before `planImport`: when `master` has people and `Model.olderExport(master, name).older`, either skip (`opts.quiet`) or `confirm('This export is as of ' + exportDate + ', which is older than the Planning Center data already in this file (as of ' + fileDate + ').\n\nOK imports it anyway. Cancel leaves the file as it is.')`.
- [ ] **Step 3: Run** the unit file and `import-browser`, `import-button-browser`, `import-conflicts-browser`, `fresh-start-browser`. Expected: PASS.
- [ ] **Step 4: Commit.** Bump `model.js`, `app.js`.

### Task 10b: Release 2b wrap-up
Same five steps as Task 7b (expected `1.51.08`). BACKLOG: R7, R10, R11 "done in dev"; R11 notes the by-hand check (Task 8 step 5).

---

# Release 2c: everything Planning Center gives us is kept (R17)

**R17 has changed.** The old item was "unknown top-level keys vanish on open". Mike's requirement (2026-11-13) is wider: every column and value of a Planning Center export, including columns the app has never heard of, columns added later, and extra, blank or odd rows, is kept in the data file, survives open, edit, save, merge, History and undo, a second import and a Drive round trip, and is shown or counted somewhere.

## What is kept and what is lost today (from the code)
**Kept already:** every column of the export becomes a name in `roster.pcCols`, and every non-blank value is stored with its person (`applyPlan` copies all of `plan.pcCols`; `toRoster` writes them; `packRoster` is lossless). Columns the app does not use show on the Roster's All fields. Money columns are kept and hidden.

**Lost or blurred today:**
| # | What | Where |
|---|---|---|
| L1 | The header's exact spelling (it is trimmed) | `csv.js:44` |
| L2 | Blank rows, and how many there were | `csv.js:49` |
| L3 | Cells beyond the header's width | `csv.js:51` |
| L4 | A renamed column's original name (reported once, not stored) | `model.js` `normalizePc` |
| L5 | An export column named like a club column (`x_`, `ov:`, `team:`, `att:`, `prog:`, `award:`) is filed as the club's and can overwrite the club's value | `model.js` `isUserCol`, `applyPlan` `refresh` |
| L6 | A value that is only spaces | `model.js` `toRoster` (`trim(p[c]) !== ''`) |
| L7 | A row the leader chose not to add, and any row attached to nobody | `applyPlan` (nothing keeps it) |
| L8 | Which columns are in the latest export (a column Planning Center dropped keeps its old values with no sign that they are old) | `pcCols` only grows |
| L9 | File facts other than the name and its date: row count, when it was imported | `stampExport` |
| L10 | Unknown top-level keys; unknown keys inside `roster` and inside a person's entry | `fromJson`; `app-season.js:21` |
| L11 | The old values of a silent refresh (not in History) | fixed by Task 5 |
| L12 | On a file merge, `pcAsOf`, `pcSource` and `pcCols` can come from the other file while each person's values stay this file's; two changed `pcCols` lists show as a conflict to decide | `datamerge.js` `prepare` covers only `people[id].pc` |
| L13 | Any Planning Center output that is not the registrations export is refused, or (if it has First Name and Last Name columns) is taken for the roster | `app.js` `kindOf`, `validate.js` `detect` |
| L14 | The anonymizer scrubs an unknown column's text word by word instead of dropping it, and copies any new key of `roster` verbatim | `make-test-data.js:207`, `:242-245` |

## Design
**Storage.** Each person's values stay where they are (`roster.people[id].pc`, by column name). One new object records what the per-person records cannot:
```
roster.pcExport = {
  at:     "2026-11-03T19:02:11.000Z",       // when this export was imported (its own date stays in pcAsOf, its file name in pcSource)
  hash:   "9f3a1c07",                       // FNV-1a (32 bit, hex) of the export's text: tells "the same export again" from a different one
  header: ["Registration ID", " First Name", "Notes", "Notes", ""],     // every header cell exactly as exported, in order
  names:  ["Registration ID", "First Name", "Notes", "Notes (2)", "(no header 5)", "(no header 6)"],
                                            // the name each column's values are stored under in pc; longer than header when rows had cells past it
  rows: 152, blankRows: 2,                  // data rows in the file, and how many of them were blank
  ids:   ["7000001_Test_Kid", ...],         // sorted: the people whose pc holds a row of THIS export
  loose: [ ["7000009", "", "", ...], ... ]  // rows of this export that belong to nobody on the roster, cell for cell in names order, file order
}
```
- A stored name that would look like a club column, or that repeats, is made distinct and the pair `header[i]` / `names[i]` records it: a duplicate gets ` (2)`; a blank header or a cell past the header gets `(no header N)` (N = position from 1); a name matching `Model.isUserCol` is stored as `pc:` + name. A renamed column the app recognises is stored under the app's name (as today); `header[i]` keeps what the export said.
- **The test of "nothing lost"** is one function: `Model.exportBack(roster) -> { header, rows }` rebuilds the export's grid from the data file (people in `ids`, then `loose`, then `blankRows` blank rows). For any export, the rebuilt rows equal the parsed original's rows as a multiset, cell for cell, and the header is identical. Row order among people is not kept (open question 4).
- Columns that left the export stay in `pcCols` with their last values. They are the names in `pcCols` that are not in `pcExport.names`, and the file check says how many.
- Only the latest export's `pcExport` is kept; earlier ones are in History like any change.

**Format version.** `roster.pcExport` is dropped by any copy of the app from before this release (it rebuilds `roster` on every sync). To make that impossible, the file format goes to **version 6**: an older copy refuses a version 6 file ("from a newer version of the app") and cannot save over it. A version 5 file opens as before and is written as 6 at the next save; it has no `pcExport` until the next import, and the file check says "no export has been captured yet". The alternative (stay on 5) would let an un-updated phone silently delete the capture record; it does not meet the requirement. See open question 1.

**Unknown keys (the old R17).** `fromJson` keeps top-level keys it does not know in `s.unknownKeys` and `toJson` writes them back; `syncData` keeps keys of `roster` and of a person's entry that the model does not own. None of these are tracked by History. The file check lists them.

**Import.** A new column: stored and listed as new (as today). A removed column: last values kept, counted as "from an earlier export". A renamed column the app recognises: values under the app's name, original spelling in `header`. A renamed column it does not recognise: one removed plus one new; nothing is guessed. The same export imported twice (same `hash`): nothing changes, nothing is logged. Every import that changes anything is one History entry (Task 5) and one undo step.

**History, undo.** `roster` is a tracked section, so `pcExport` is diffed, logged, undone and restored with no new code. Its lists (`header`, `names`, `ids`, `loose`) are logged whole when they change; `ids` is sorted so a routine refresh with the same people logs none of it.

**Merge.** The Planning Center block (`roster.pcCols`, `pcAsOf`, `pcSource`, `pcExport`, and `pc` of every person both files have) moves as one unit and is never mixed:
- File > Merge a data file (Mike's rule of 2026-11-12: the import owns these fields): this file's block stays whole. When the other file's is newer, one Review row says so and names its date.
- A Drive save: when only one side imported since the base, that side's block is carried whole. When both imported different exports, the newer (`pcAsOf`, then `pcExport.at`) wins whole, with one Review row.

**Privacy.** Keeping more means the file holds more about children and families:
- `loose` rows are whole registrations of people the leader decided **not** to add (a cancelled registration, a family that left). Open question 2.
- History now also keeps the old values of money and unused columns each week.
- The anonymizer (Task 12) stops on any key of `roster` or of a person's entry it has not been taught; anonymizes `pcExport` (ids renamed and re-sorted, `loose` rows through the same per-column rules as people, `hash` emptied); and **empties** the value of any column it does not know instead of scrubbing it (the column name is kept). The existing leak check still runs over everything.
- The spec gains a table of the export's columns by kind: identity, contact, money, free text (`Medical Notes`, the allergy question, the pick-up names, the parent phone question, `Emergency Contact`, `Registration Contact Address`), and "any column not listed is treated as free text".

**Size.** For the 144-person TEST club: `header` and `names` about 1.6 KB each, `ids` about 3.5 KB, `loose` about 0.45 KB a row; about 7 KB on a 155 KB file. History per weekly import: under 1 KB plus the changed fields; `ids` (3.5 KB, twice) only when someone joins or leaves. Task 15 pins "under 15 KB added by the first capture".

## Open questions for Mike (answer before Task 13)
1. **Version 6.** Yes to bumping the format, so that a phone still on the old app is told to update instead of quietly deleting the capture? (Recommended. Cost: every leader updates once; the update bar does it.)
2. **Rows that belong to nobody.** Keep the whole row of a registration you chose not to add (recommended, it is what "record everything" says), or keep only a count? Keeping them means the file holds details of families who are not in the club.
3. **"Anything else Planning Center produces."** Which other files do you get from it (a People list, check-ins, payments, a PDF)? Today only the registrations export is read. If there are others, Task 18 keeps each one whole as a named table; say which, and whether one of them has First Name and Last Name columns (the app would take it for the roster).
4. **Row order.** Is the order of rows in the export information you want kept? (Recommended: no. It would add the whole id list to History on every import.)
5. **A column Planning Center drops.** Keep the last values and mark them "from an earlier export" (recommended), or clear them?
6. **Earlier exports.** Is "the latest export whole, earlier ones through History" enough, or do you want each imported export kept whole? (Each is about 60 KB.)
7. **Money columns.** They are kept and hidden today. Still wanted, now that their weekly changes will also be in History?

### Task 11: Unknown keys are kept (the old R17)

**Files:**
- Modify: `dev/app/season.js` (`fromJson`, `toJson`), `dev/app/model.js` (`toRoster`, `fromRoster`), `dev/app/app-season.js:19-23` (`syncData`), `dev/app/validate.js`
- Modify: `dev/app/test/season.test.js`, `dev/app/test/roster.test.js`, `dev/app/test/validate.test.js`, `docs/DATA-FORMAT.md` 2.5

**Interfaces:**
- Produces: `Season.KNOWN_TOP: string[]` (`format`, `version`, `year`, `fake`, `history`, and `Season.SECTIONS`). `fromJson` puts every other top-level key in `s.unknownKeys = { key: value }` (absent when there are none). `toJson` writes them back at the top level and never writes a key named `unknownKeys`; a known key always wins.
- Produces: `master.rosterExtra = { key: value }` (keys of `roster` other than `cols`, `pcCols`, `pcKeys`, `pcAsOf`, `pcSource`, `pcExport`, `people`) and a non-enumerable-free plain map `master.personExtra = { id: { key: value } }` (keys of a person's entry other than `pc`, `v`); `toRoster` writes both back.

- [ ] **Step 1: Failing tests.** `season.test.js`: `a top-level key this app does not know survives open and save` (`o.futureThing = { a: 1 }` in the TEST file's JSON; `JSON.parse(Season.toJson(Season.fromJson(text))).futureThing` deep-equals it; `Season.diff` ignores it; a `__proto__` key is still dropped). `roster.test.js`: `keys of the roster and of a person that the model does not own survive fromRoster and toRoster`. `validate.test.js`: `unknown keys are listed, not errors` (`info` `/1 part of this file is not known to this app and is kept as it is \(futureThing\)/`). Expected: FAIL.
- [ ] **Step 2: Implement.** `syncData` needs no change beyond `Model.toRoster` once the master carries the extras; check that `App.loadData` passes them through `setMaster(Model.fromRoster(s.roster))`.
- [ ] **Step 3: Run** the three files plus `season-sections.test.js`, `datamerge.test.js`, `anonymizer-atomic.test.js`. Expected: PASS (the anonymizer still stops on an unknown top-level section: it reads the raw file).
- [ ] **Step 4: Spec 2.5** rewritten: what is kept, what is not tracked, that a new season does not carry `unknownKeys`. **Commit.** Bump the four files.

### Task 12: The anonymizer fails closed on roster keys and unknown columns

This task lands **before** anything writes `pcExport`.

**Files:**
- Modify: `dev/tools/make-test-data.js`, `dev/test-data/ANONYMIZATION.md`
- Modify: `dev/app/test/anonymizer-atomic.test.js` (TEST-data variant; it runs with no arguments)

**Interfaces:**
- Produces: exit 1 with `make-test-data does not know the roster key "<key>"` (or `the person key "<key>"`) and nothing written, for any key outside `ROSTER_HANDLED = ['cols', 'pcCols', 'pcKeys', 'pcAsOf', 'pcSource', 'pcExport', 'people']` and `PERSON_HANDLED = ['pc', 'v']`.
- Produces: `COLUMN_RULES`: the existing per-column handling as one table (`keep`, `name`, `regid`, `address`, `birthdate`, `medical`, `namelist`, `freetext`); a column in no rule gives `''` for a blank value and `'TEST'` otherwise.
- Produces: `anonCapture(pcExport)`: `header` and `names` kept (the church-initials replacement applied), `ids` mapped through `idMap` and sorted, each `loose` row turned into a record by `names`, passed through `anonRecord`, and back to a row; `hash` becomes `''`; `at`, `rows`, `blankRows` kept. A History change under `roster.pcExport` goes through the same function per key; any other History path under `roster` that is not `people`, `cols`, `pcCols`, `pcAsOf` or `pcSource` stops the run.

- [ ] **Step 1: Failing tests** (run the tool on copies of the TEST data and TEST export in a temp dir):
  - `an unknown key in roster stops the run and writes nothing` (`roster.somethingNew = { a: '7000001_Test_Kid' }`): exit 1, the message, empty out dir.
  - `an unknown key in a person's entry stops the run`.
  - `a column the tool does not know is emptied, not scrubbed`: add a column `Favourite Snack TEST` with the value `Zebracakes 4455` to the export and to each person's `pc`; the output's export and data file hold `TEST` there and the word `Zebracakes` nowhere.
  - `pcExport is anonymized: ids renamed and sorted, loose rows through the column rules, hash emptied`: give the data file a `pcExport` with one loose row holding an invented name `Zyxwv Qponm` and a phone number; the output holds neither, `ids` are all keys of the output's `people`, `hash === ''`.
  Run `node test/anonymizer-atomic.test.js`. Expected: FAIL (the unknown roster key is copied today; the snack is scrubbed word by word; `pcExport` is copied verbatim).
- [ ] **Step 2: Implement.** Read the raw roster keys from `rawData` (as the top-level check does).
- [ ] **Step 3: Run** `node test/anonymizer-atomic.test.js && node test/fake-data.test.js && node test/no-args.test.js`. Expected: PASS.
- [ ] **Step 4:** `ANONYMIZATION.md`: the column table and the "unknown column is emptied" rule. **Commit.**
- [ ] **Step 5 (Mike, by hand, after 2c):** regenerate the TEST data from a real file with `anonymized-data.test.js`'s real-file arguments; confirm the leak check passes.

### Task 13: Read the export without dropping anything

**Files:**
- Modify: `dev/app/csv.js`, `dev/app/model.js` (`normalizePc`, `columnReport`, `loadMaster`, `toRoster`)
- Create: `dev/app/test/pc-capture.test.js`

**Interfaces:**
- Produces: `Csv.toTable(rows) -> { header: string[], names: string[], records: object[], rowCells: string[][], blankRows: number, rows: number }`. `header` is row 0 untouched. `names` is the storage name per column (trimmed; a repeat gets ` (n)`; a blank gets `(no header N)`), extended with `(no header N)` for the widest row. `records[i]` is keyed by `names` (a missing cell is `''`); `rowCells[i]` is the same row as a list in `names` order. A row whose every cell is `''` is counted in `blankRows` and has no record. `rows` is `records.length + blankRows`. `Csv.toRecords` is unchanged (the calendar and colors readers use it).
- Produces: `Model.normalizePc(table) -> { cols, records, renamed, header, names, blankRows, rows }`: `names` after the alias and role renames, and with `pc:` put in front of any name for which `isUserCol` is true (reported in `renamed` as `{ from, to }`). It still accepts the old `{ cols, records }` shape (then `header` and `names` are `cols`).
- Produces: `Model.toRoster` writes every value that is not `''` (a value of only spaces is kept).
- Produces: `PcFixture.build(text) -> text` in the test file (exported for Tasks 14 to 17): the 20261103 TEST export plus: a column `Favourite Snack TEST` (values on three rows), a second column named `Selection` (duplicate header), a column with a blank header holding `x` on one row, the header ` Grade` given a leading space, a column named `x_Notes` holding `from the export` on one row, one fully blank row in the middle, one row with two extra cells past the header (`extra1`, `extra2`), one row with no First Name and no Last Name (Registration ID `7999001`), one existing row's `Home Phone Number` set to three spaces.

- [ ] **Step 1: Failing tests** (`pc-capture.test.js`):
  - `toTable keeps the header as written, names every column, counts blank rows and keeps cells past the header`: for `PcFixture.build`, `header.includes(' Grade')`, `names.includes('Grade')`, `names.includes('Selection (2)')`, one name matches `/^\(no header \d+\)$/` for the blank header and two more for the extra cells, `blankRows === 1`, and the record of the long row has `extra1` and `extra2`.
  - `an export column named like a club column is stored under pc: and never touches the club's value`: import the fixture over a master where that child's `x_Notes` is `leader note`; afterwards `p.x_Notes === 'leader note'` and `p['pc:x_Notes'] === 'from the export'`; `Model.isUserCol('pc:x_Notes') === false`.
  - `a value of only spaces is kept`: after `toRoster`, that person's `pc['Home Phone Number'] === '   '`.
  - `the standard export still reads exactly as before`: for the unmodified TEST export, `normalizePc(Csv.toTable(rows)).cols` deep-equals `normalizePc(Csv.toRecords(rows)).cols` and so do the records.
  Run `node test/pc-capture.test.js`. Expected: FAIL (`Csv.toTable` is not a function).
- [ ] **Step 2: Implement.** `loadMaster`, `validatePc` and `importPc` call `Csv.toTable` (the `importPc` change is one line here; the rest of it is Task 15). `columnReport` reports a `pc:` rename as `info`: "The export has a column named “x_Notes”, which is a name this app uses for its own data; it is kept as “pc:x_Notes”."
- [ ] **Step 3: Run** `node test/pc-capture.test.js && node test/pc-columns.test.js && node test/roster.test.js && node test/import-test-file.test.js && node test/validate.test.js && node test/intake.test.js`. Expected: PASS.
- [ ] **Step 4: Commit.** Bump `csv.js`, `model.js`, `validate.js`, `app.js`.

### Task 14: `roster.pcExport`, format version 6, and the rebuild that proves nothing is lost

**Files:**
- Modify: `dev/app/model.js` (`applyPlan`, `toRoster`, `fromRoster`), `dev/app/season.js` (`VERSION`, `describe`), `dev/app/validate.js`
- Modify: `dev/app/test/pc-capture.test.js`, `dev/app/test/season.test.js`, `dev/app/test/validate.test.js`, `dev/app/test/compact-file.test.js`
- Modify: `docs/DATA-FORMAT.md` (4.2, 5.2, 7.2, 12, 14, 15), `dev/app/test/data-format-doc.test.js`, `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 13's `normalizePc` result (`header`, `names`, `blankRows`, `rows`).
- Produces: `Model.applyPlan(...)` result gains `ids: string[]` (every person refreshed, renamed onto or added from this export) and `loose: object[]` (every record of the export attached to nobody: an unticked new row, the row of a rename that was neither accepted nor added).
- Produces: `Model.hashText(text) -> string` (FNV-1a 32 bit, 8 hex digits).
- Produces: `Model.captureExport(master, pc, result, info) -> void`, `info = { text, at }`: sets `master.pcExport = { at, hash, header, names, rows, blankRows, ids (sorted), loose (rows in names order) }`. For a first load (`loadMaster`) `result` is `{ ids: every person's id, loose: [] }`.
- Produces: `Model.exportBack(roster) -> { header: string[], rows: string[][] } | null` (null when there is no `pcExport`).
- Produces: `Model.CAPTURE_KEYS = ['at', 'hash', 'header', 'names', 'rows', 'blankRows', 'ids', 'loose']`.
- Produces: `Season.VERSION === 6`. `toJson` writes 6; `fromJson` reads 1 to 6. `describe` words changes under `roster › pcExport` as "Planning Center export kept: ..." (never `undefined` or `[object`).

- [ ] **Step 1: Failing tests.**
  - `pc-capture.test.js`, `nothing is lost: the export can be rebuilt from the data file`: import `PcFixture.build` over the TEST data (all new rows added except the no-name row, which is left unticked); `s.roster = Model.toRoster(master)`; `const back = Model.exportBack(Season.fromJson(Season.toJson(s)).roster)`; assert `back.header` deep-equals the fixture's row 0, and `sorted(back.rows.map(JSON.stringify))` deep-equals `sorted(originalRows padded to names.length .map(JSON.stringify))`. Also `pcExport.loose.length === 1`, `blankRows === 1`, `rows === ids.length + loose.length + blankRows`.
  - `...and it survives edit, History, undo and restore`: after the import is recorded, set a mark, record, then `Season.at(s, s.history.length - 1)` and `Season.restoreTo`: `exportBack` of each equals the grid; `Season.at(s, <before the import>)` has the earlier `pcExport` (or none).
  - `...and a second, different export replaces it; a column the new export lacks keeps its values and is not in names`.
  - `season.test.js`: `the format is version 6; a version 5 file opens and is written as 6; a version 7 file is refused`; `a copy of the app that reads up to 5 refuses a version 6 file` (call `fromJson` on text whose `version` is 6 with a stubbed limit the way `validate.test.js` "a newer version" does, asserting the message `/from a newer version of the app/`).
  - `validate.test.js`: `pcExport is checked`: `names` shorter than `header`, a repeated name, an id in `ids` that is not in `people`, a `loose` row that is not a list of text, `rows` not equal to the sum, each give the finding in the table below; a clean capture gives the two info lines.

  | Corrupt | Finding |
  |---|---|
  | `names.length < header.length` | `error` `/export record: fewer names than header cells/` |
  | repeated name | `error` `/export record: the name .* twice/` |
  | unknown id in `ids` | `warn` `/export record: 1 person .* not on the roster/` |
  | `loose` row not text | `error` `/export record: a kept row is not a list of text/` |
  | `rows` mismatch | `warn` `/export record: .* rows .* do not add up/` |
  | clean | `info` `/Planning Center export kept: .* 59 columns \(\d+ not used by this app: “Favourite Snack TEST”.*\), 1\d\d rows \(1 belongs to nobody, 1 blank\)\./` and `info` `/\d+ columns? hold values from an earlier export/` when there are any |
  | version 6, people but no `pcExport` | `info` `/No Planning Center export has been captured in this file yet/` |
  Run. Expected: FAIL.
- [ ] **Step 2: Implement.** `fromRoster` reads `pcExport` into `master.pcExport`; `toRoster` writes it. `exportBack` builds each person's row as `names.map(n => pc[n] === undefined ? '' : pc[n])`.
- [ ] **Step 3: Size.** `compact-file.test.js`: `the first capture adds under 15 KB to the test club's file` (TEST data plus the 20261103 TEST export: `toJson` length after minus before is below 15000).
- [ ] **Step 4: Run** `node test/pc-capture.test.js && node test/season.test.js && node test/validate.test.js && node test/compact-file.test.js && node test/season-sections.test.js && node test/datamerge.test.js && node test/versions.test.js`. Expected: PASS.
- [ ] **Step 5: Spec.** 4.2: the version 6 row ("`roster.pcExport`; a version 5 reader would drop it, so it must refuse the file") and the sentence that `VERSION` does move when an older reader would lose data. 5.2: `pcExport` with every key of `Model.CAPTURE_KEYS`, the stored-name rules, the column-kind table (identity, contact, money, free text, "any other column is treated as free text"). 7.2 unchanged apart from a pointer. 12 and 15 updated; the worked example in 14 becomes version 6 with a small `pcExport`. `data-format-doc.test.js`: `every key of the export record is documented` (each of `Model.CAPTURE_KEYS` appears as `` `key` `` under the 5.2 heading) and the version test expects 6. Run `node test/data-format-doc.test.js && node test/doc-examples.test.js`. Expected: PASS.
- [ ] **Step 6: CHANGELOG** format line: version 6, what it adds, that every leader's copy must be updated. **Commit.** Bump `model.js`, `season.js`, `validate.js`.

### Task 15: The import writes the record, once per different export

**Files:**
- Modify: `dev/app/app.js` (`importPc`, `applyDecided`, `stampExport`, `recordImport`), `dev/app/app-todo.js` (the import summary line)
- Create: `dev/app/test/pc-capture-browser.test.js`

**Interfaces:**
- Consumes: `Model.captureExport`, `Model.hashText`, `Model.exportBack` (Task 14); Task 5's "every refresh that changed anything is logged"; Task 10's `opts.quiet`.
- Produces: `stampExport(name, pc, result, text)` also calls `Model.captureExport`. `importPc` returns early, changing nothing, when `master.pcExport && master.pcExport.hash === Model.hashText(text) && master.pcSource === name` (flash: "This export is already in the file.").
- Produces: `App.lastImport.counts` gains `cols`, `unusedCols`, `loose`, `blankRows`; the To do import summary shows "Kept from the export: 59 columns (6 not used by the app), 1 row that belongs to nobody, 1 blank row."

- [ ] **Step 1: Failing browser tests** (`pc-capture-browser.test.js`; write `PcFixture.build`'s text to `os.tmpdir()` as `20261110 -- demo-club-2026-27 TEST extra.csv`):
  - `importing an export with extra columns and odd rows keeps all of it through save and reopen`: open the TEST data file, import the fixture (untick the no-name row in the review, Apply), read `App.snapshotJson()`, open that text in a fresh page; `Model.exportBack(App.season.roster)` equals the fixture grid (multiset, as in Task 14); the Validate tab shows the `Planning Center export kept` line.
  - `Undo takes the whole import back, and Redo brings it back`: after Undo, `App.season.roster.pcExport` is what it was before (absent for the TEST file); after Redo, `exportBack` equals the grid again.
  - `the same export a second time changes nothing`: import the same file again; `App.dirty()` is unchanged, `App.season.history.length` is unchanged, the flash text.
  - `a different export with the same name is a new import` (one cell changed): a new History entry, `pcExport.hash` differs.
  - `the To do page says what was kept`.
  Run. Expected: FAIL.
- [ ] **Step 2: Implement.** The first-load path (`loadMaster`) and both apply paths (`importPc` silent, `applyDecided`) call `stampExport` with the plan's result.
- [ ] **Step 3: Run** the new file and `import-browser`, `import-button-browser`, `import-conflicts-browser`, `import-fixes.test.js`, `fresh-start-browser`, `todo-book-medical-browser`. Expected: PASS.
- [ ] **Step 4: Commit.** Bump `app.js`, `app-todo.js`.

### Task 16: Merge and Drive carry the Planning Center block whole

**Files:**
- Modify: `dev/app/datamerge.js` (`prepare`, `plan`, `categoryOf`, `words`), `dev/app/app-drive.js` (the non-interactive branch of `merge`)
- Modify: `dev/app/test/datamerge.test.js`, `dev/app/test/drive-inplace-browser.test.js`, `docs/DATA-FORMAT.md` 10.5

**Interfaces:**
- Produces: `DataMerge.alignPc(base, ours, theirs, opts) -> { ours, theirs, took: 'ours' | 'theirs' | '', newer: { asOf, at } | null }`. The block is `roster.pcCols`, `roster.pcAsOf`, `roster.pcSource`, `roster.pcExport`, and `roster.people[id].pc` for every id both sides have. `changed(x)` = x's block differs from base's. With `opts.keepOurs` (a file merge) theirs' block is replaced by ours' (`took: 'ours'`; `newer` set when theirs' `pcAsOf`/`at` is later). Otherwise: only one side changed, the other side's block is set to base's (so the three-way merge carries the change whole); both changed, the later (`pcAsOf`, then `pcExport.at`) wins and the loser's block is set to base's. Inputs are not modified.
- Produces: `plan()` calls `alignPc` first and adds one row to `P.blanks`-style Review output: category `Roster and Planning Center fields`, where `Planning Center data`, from `kept: this file's (as of X); the other file's is as of Y` or `took the newer export (as of Y)`.

- [ ] **Step 1: Failing tests** (`datamerge.test.js`; build two forks of `start()` and import different in-memory exports into each with `Model.planImport` / `applyPlan` / `captureExport`):
  - `a file merge keeps this file's Planning Center block whole, and says when the other file's is newer`: after `finish`, `roster.pcAsOf`, `pcSource`, `pcCols`, `pcExport` and every shared person's `pc` deep-equal mine's; `Model.exportBack(merged.roster)` equals my export's grid; the summary has exactly one Review row matching `/Planning Center data/`; `P.conflicts` has none under `roster`.
  - `Drive: only this copy imported since the base: its block is carried whole` (`opts.pc`, `opts.base`).
  - `Drive: both imported different exports: the newer wins whole, one Review row, no conflicts`: `exportBack` equals the newer export's grid.
  - `a child only the other file has still comes in whole, and is not listed in this file's export record`.
  Run. Expected: FAIL (today `pcAsOf` and `pcCols` follow the generic rules and can disagree with the values).
- [ ] **Step 2: Implement.** `app-drive.js` non-interactive branch: `const al = DataMerge.alignPc(c.base, ours, Season.fromJson(remote)); merged = Season.merge3(c.base, al.ours, al.theirs, ...)`.
- [ ] **Step 3: Browser test** in `drive-inplace-browser.test.js`: `a Drive save after an import here, while someone else saved attendance: the file on Drive holds their marks and this copy's whole export record`.
- [ ] **Step 4: Run** `node test/datamerge.test.js && node test/merge.test.js && node test/season-sections.test.js`, then `drive-inplace-browser`, `merge-files-browser`. Expected: PASS, including `Planning Center fields are never merged, club fields are` and `Drive options: an explicit base...`.
- [ ] **Step 5: Spec 10.5** gains the block rule. **Commit.** Bump `datamerge.js`, `app-drive.js`.

### Task 17: Year rollover, the demo file and the docs for people

**Files:**
- Modify: `dev/app/season.js` (`newSeason`, `shiftDates`), `dev/app/info.js` and `dev/app/index.html` (manual text; run `node dev/tools/sync-guide.js` after editing `info.js`), `README.md`
- Modify: `dev/app/test/season.test.js`, `dev/app/test/fake-data.test.js`

- [ ] **Step 1: Failing tests.** `a new season carries the export record with the roster` (`newSeason(s, '2027-28').roster.pcExport` deep-equals the old one; `exportBack` works). `freshening the demo file does not shift anything inside pcExport except at` (a cell in `loose` that looks like a date, `2026-10-01`, is unchanged after `shiftDates`; `pcExport.at` moves with the History timestamps). Expected: the second FAILS (`moveDeep` shifts every date-shaped string).
- [ ] **Step 2: Implement** the `shiftDates` exception (leave `roster.pcExport.loose`, `header`, `names`, `ids` alone, and people's `pc` values as today).
- [ ] **Step 3: Words.** Manual and (i) note for Import: what is kept, where it shows (Roster All fields, Validate), that a phone on an older copy must update. README data-file table: `pcExport`. Run `node test/info.test.js`. Expected: PASS.
- [ ] **Step 4: Commit.**

### Task 18 (only if Mike's answer to question 3 names other files): keep other Planning Center files whole
Outline, to be written as steps once the files are named: a new tracked section `pcFiles` (`{ "<name>": { at, hash, header: [...], rows: [[...]] } }`), added to `SECTIONS`, `AREA`, `describe`, `categoryOf`, `SECTION_CHECKS`, the spec and `HANDLED`; the anonymizer **drops** it entirely; `kindOf`/`detect` recognise a file as "other Planning Center file" only by a rule Mike confirms (never by guessing), and a file with First Name and Last Name but no `Registration ID` asks before it is taken for the roster.

### Task 19: Release 2c wrap-up
- [ ] **Step 1:** `app-version` to the next free `1.51.x` (expected `1.51.09`), `app-build` to the day.
- [ ] **Step 2:** The sweep. Expected: no failures.
- [ ] **Step 3:** `sh make-deploy.sh` runs clean. The try-it data file in `dev/test-data` stays version 5 on purpose (it must keep opening and upgrading); note this in `dev/test-data/TEST-CASES.md`.
- [ ] **Step 4:** CHANGELOG, README, BACKLOG (R17 with its new meaning, "done in dev").
- [ ] **Step 5: Commit** and report. **By hand, Mike:** (a) import this week's real export into a copy of the real file and read the Validate line (columns, unused columns, rows that belong to nobody); (b) save, reopen, check the line is the same; (c) open the saved file on a phone that has **not** updated and confirm it refuses with the update message; (d) regenerate the TEST data (Task 12 step 5).

## Self-review
- **Spec coverage:** R16 Tasks 1 to 3; R20 Tasks 4 and 5; R18 Task 6; R21 Task 7; R11 Task 8; R7 Task 9; R10 Task 10; R17 Tasks 11 to 19 (L1 to L4 and L6 Task 13; L5 Task 13; L7 to L9 Tasks 14 and 15; L10 Task 11; L11 Task 5; L12 Task 16; L13 open question 3 and Task 18; L14 Task 12). Spec section 15 gaps 1 to 7 each have a task.
- **Order:** R16 first (its checks guard the rest); R20's upgrade entry before R18's migrations (they are logged by it); R11's `editSeq` before R7; R10 before the R17 import work; the anonymizer (Task 12) before anything writes `pcExport`.
- **Names:** `check`, `CHECKED_SECTIONS`, `CHECKED_CONFIG` (Tasks 1 to 3); `signShown` (7); `editSeq` (8, 9); `olderExport`, `opts.quiet` (10, 15); `unknownKeys`, `rosterExtra`, `personExtra` (11); `toTable`, `PcFixture.build` (13 to 16); `captureExport`, `exportBack`, `hashText`, `CAPTURE_KEYS` (14 to 16); `alignPc` (16).
- **Not decided here:** the seven open questions. Tasks 13 to 17 assume the recommended answers; a different answer to 1, 2 or 4 changes Task 14's interfaces and must be settled first.
