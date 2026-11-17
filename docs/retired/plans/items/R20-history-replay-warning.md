# R20: the History replay warning (find the causes, make the check true again) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find every way the data in a working file drifts from what its History replays to; prove each with a failing test on TEST data; fix each (log the change, or repair the drift once); give Mike a safe by-hand tool that prints only counts and kinds of differences; after that the replay warning means "edited outside the app" again.

**Status of this plan:** complete as a plan (2026-11-13). It refines Wave 2 Tasks 4 and 5 (`docs/superpowers/plans/2026-11-13-wave2-data-safety.md`) and replaces them when executed: same three suspected causes, plus evidence gathered on the TEST file, two more causes, a shared `Season.replayDiff`, a save-time safety net and a different home for the repair button. Where this file and Wave 2 Tasks 4-5 disagree, this file wins.

**Architecture:** One data-format semantic change (History may hold a `File upgrade` entry written on open, and a `Reconciled` entry written on request); no new section and no format version bump. Code in `season.js` (replay helper, upgrade entry, reconcile), `validate.js` (use the helper, new wording), `app-season.js` (open order, save-time net, Reconcile button, `App.pendingDiff`), `app.js` (`importPc`), a new tool `dev/tools/replay-report.js`, and new tests.

**Tech Stack:** Node 24, Playwright 1.64 shim for the browser tests, plain JS. No new dependencies.

**Spec:** BACKLOG R20 (and R1, which added the six missing sections to `SECTIONS`), `dev/REVIEW-2026-11-12-whole-project.md`, roadmap `2026-11-12-review-fixes-roadmap.md` (Wave 2), `docs/DATA-FORMAT.md` 10.1-10.4, 11.1, 15 item 6.

## Global Constraints
- Use the Edit and Write tools to change files; scripted rewrites (`sed -i`, `node -e` that writes files) are blocked by the auto-mode classifier. Tests may run anything.
- Never read, print or copy a real data file (`archive/`, `~/Downloads`, `~/Nextcloud`, `dev/*.json`, `dev/*.csv`, `reports/`, `research_notes/`). Work on `dev/test-data` and scripted operations. Invented ids only (`7000001_Test_Kid`); tests that use the TEST file pick ids with `Object.keys(...)`, never by name.
- The real file is only ever touched by Mike, by hand, with `replay-report.js`, which prints counts and kinds, never names, ids, dates of records or values.
- Each changed `.js` gets its own line-1 version bumped; `app-version` / `app-build` in `index.html` bumped once, in the last task. CHANGELOG ("Next release"), README (new tests and tool), BACKLOG (R20 "done in dev"), `docs/DATA-FORMAT.md` in the same commit as any semantic change.
- Do not deploy. Mike says "deploy".
- Commit messages end with the two attribution lines given in the session.

## What the check really tests (read before touching anything)
`validate.js:158-163`: `r = Season.at(s, 0)` undoes every entry newest-first **starting from the data**, then every entry is applied forward again, then `Season.diff(snapshot(r), snapshot(s))`. `s` is `Season.fromJson(text)`, so the data compared is the data **after** this open's upgrades.

A reverse pass followed by the same forward pass returns to the data, except where a path History touches was changed later without an entry. Consequences that shape the whole plan:
1. A silent change at a path History never logged (no logged ancestor or descendant) is invisible to the check. Most silent changes are therefore harmless to it; only those under logged paths count.
2. The common bad shape: History logged a whole object (`p = ['given', id]`, `n = {...}`, the first award given to that child; or `['awards', date, id]`, a whole array; or `['roster', 'people', id]`, a whole person on the first import) and something later rewrote a part of it silently. The forward pass writes the logged whole back, so each silently changed leaf is one difference.
3. Wrong `o` values do not matter (the forward pass overwrites them); only "the last logged `n` per path" against the data matters. So an entry recorded against the wrong `before` (cause 4) is a History-quality bug, not a replay-check bug.
4. `x_LastSeen` is skipped by `diffInto`, on both record and compare, so export stamps never count.
5. The anonymized copy shows a similar count (BACKLOG R20), so the anonymizer is not a cause; it carries the History through, which is what makes a TEST reproduction possible.

## Evidence already gathered (read-only, on `dev/test-data`, 2026-11-13)
Run with a scratch script against `awana-2026-27-TEST-20261029-214815.json` (TEST data; output is shapes and counts):
- The TEST file has 2 History entries and replays clean (0 differences) **today**; it is in the pre-1.50.13 form.
- `fromJson` on that file silently changes **176 places outside the roster**: `awards › <date> › <id>` 51 changed; `given › <id> › Blue Emblem 1` 25 removed / `AoG Blue Emblem 1` 25 added; `given › <id> › Blue Jewel 1` 22 removed / `HG|WR|SS Blue Jewel 1` 22 added; Red / Green Jewel renames (8); `config › awardLists › Sparks|T&T`, `config › progress › Sparks|T&T › common|perBook`, `config › progress › Cubbies`, `config › books › AS|DoG|EoG|GiA`, `config › completion`, `config › endOfYear`, `config › saveStyleDrive|saveStyleLocal|autoSave|autoUpdate` (1 each).
- Round trip `Model.toRoster(Model.fromRoster(roster))` plus `Calendar.sort`: 0 differences on the TEST file.
- Re-importing the 20261028 TEST export: no visible change, 0 differences. The 20261103 TEST export: needs review (new people); its silent part is `roster › pcAsOf` and `roster › pcSource`.

Reading: the real file's History started in September, before the upgrades of 1.50.13 to 1.50.23 (Nov 4). Every award given or announced before then was logged under the old name; the upgrade renamed it on the next open, the file was saved, and from then on every open replays the old name back. That alone gives "a few hundred" (one per child per night in `awards`, two per renamed `given` key). This is now the leading cause, and it is **permanent** in the real file: the file is already upgraded, so a fix to `fromJson` alone will not quiet it; a one-time repair is needed.

## Suspected causes, ranked
| # | Cause | Where | Confidence | Expected shapes | Fix |
|---|---|---|---|---|---|
| 1 | Upgrades on open rewrite data and log nothing (`renameAward`, `upgradeTnt`, `upgradeSparksJewels`, `upgradeStartZone`, `upgradeCubbies`, `upgradeSettings`, `addStandardBooks`, old Sparks template, config defaults merge). Only `renameBooks` also rewrites History. | `season.js` `fromJson` (lines ~125-152) | High (176 silent places on TEST; dates fit) | `awards › <date> › <id>` chg; `given › <id> › <award>` add+del pairs; `givenNoDate › <id>`; `held › <id> › <award>`; `progress › <id> › common|<book> › SZ*/BE*/...`; `config › awardLists|progress|books ›…` | 1a: `fromJson` logs one `File upgrade` entry. 1b: one-time `Reconcile History` for files already drifted. |
| 2 | Planning Center refresh with no visible change is absorbed by `App.rebase()`: money columns (`HIDDEN_COLS`), columns new to the file, `roster.pcCols`, `pcAsOf`, `pcSource`, cleared `ov:` keys, `x_Active` set to `1`. | `app.js` `importPc` (`if (edited) App.changed(); else App.rebase();`) and `planImport` skipping hidden / new columns | High that it happens; medium on count (a handful plus one per child whose balance changed after being logged whole) | `roster › pcAsOf`, `roster › pcSource`, `roster › pcCols`, `roster › people › <id> › pc › <col>`, `roster › people › <id> › v › ov:<col>` | Log any refresh that changes the data (`App.pendingDiff()`), label `Planning Center refresh`. |
| 3 | An export opened earlier in the session is re-applied inside `setSeason` -> `App.loadData` -> `importPc`. When it is "not edited", `App.rebase()` absorbs it (cause 2 again); when it is edited, `App.changed()` records against `snap` of the **previous** file (or throws on `Season.diff(null, …)` when no file was open). | `app-season.js` `setSeason` (snap not reset before `loadData`), `app.js:1116` | Medium | as cause 2; or a bogus entry whose `o` values belong to the other file | Set `snap = Season.snapshot(s)` before `App.loadData`; then cause 2's fix logs it properly. |
| 4 | Open-time tidying absorbed by `rebase()`: `Model.toRoster(Model.fromRoster(roster))` drops `x_ClubberID` from `v`, drops empty values, can reorder `roster.cols`, extend `pcCols`; `Calendar.sort`. | `app-season.js` `setSeason`, `app.js` `App.loadData` | Low (0 on TEST); real files with `x_ClubberID` in `v` (R18) are exposed | `roster › cols`, `roster › people › <id> › v › x_ClubberID` del, `calendar` | Record what the open tidied as one entry when History is non-empty; R18 removes the main source. |
| 5 | Any write to the season outside `touchSeason` (a reader that normalizes in place, e.g. `app-todo.js:10` creating `config.todoIgnored = []`, `teamplan.js` `own()` creating `config.teamPlan`), saved with the next save and never logged. | app-wide | Low (none found under a logged path) | `config › todoIgnored`, `config › teamPlan` | Save-time net: before writing, record any `diff(snap, season)` as `Unlogged changes`; a browser tour test asserts it stays 0. |
| 6 | Restore to a version before an upgrade leaves old-form data in memory (the logged paths get old names back, the rest stays new); the next open upgrades again, silently. | `app-season.js` `hRestore` | Medium once 1a lands (entries before `File upgrade` exist) | as cause 1 | Pass the restored season through `Season.fromJson(Season.toJson(x))`. |

Ruled out by reading (each still gets a guard test, expected to PASS today): `renameAward` from the UI (there is no caller outside `fromJson`); year rollover (`newSeason` starts an empty History, so the check does not run); book renames on open (`renameBooks` rewrites History with `renameInHistory`); undo / redo (logged with `record`); Drive in-place and file merges (`merge3` and `DataMerge.finish` record one entry); photo progress import (`applyProgressPlan` pushes one entry per date); date fixes at open (logged before the open); every `Season.*` mutator called from `app-*.js` (a scripted check found every call followed by `touchSeason` / `App.touch` / `App.changed` within four lines; the two misses are `tidyHandbookCodes(…, false)` (read-only) and `blueJewelAction`, which touches at its end).

Side finding (not R20; note in BACKLOG): `renameAward` renames `awardLists`, `awards`, `given`, `givenNoDate`, `held`, `slideNames`, but not `announcedNoDate` or `blueDrops`; an upgraded name there stays old. Verify with a unit test in Task 2 and report; do not fix here.

## Who writes each section, and is it logged
"Logged" = the change reaches History through `touchSeason` (`App.touch` / `App.changed`), `Season.record`, or an entry pushed directly. Step 1 of Task 2 re-checks this table with grep and corrects it in the findings note.

| Section | Logged writers | Unlogged writers (candidates) |
|---|---|---|
| `config` | Options tab (books add/reset/delete, bundles, year books `setYearBook`, `setSparksBooks`, `setTeamOrder`, `setCubbiesDetail`, `setBookOrder`, store settings, past-year count, local save style); `clubTitle` (`app.js:25`); `clubDay` (`calTouch`); Drive save style / keep name / dirs (`app-drive.js`); `autoUpdate` / `autoSave` (`app-update.js`); `todoIgnored` / `medPrinted` (To do); `teamPlan` / `teamsOk` (Teams) | `fromJson`: defaults merged over the file's config; `blueJewelWeeks` repair; `yearBook` defaults; `tntBook` fold; `renameBooks` (History rewritten: OK); old Sparks template; `awardLists` and `slideNames` renames; `addStandardBooks`; T&T, Sparks, Start Zone, Cubbies templates; `completion` / `endOfYear` Cubbies; `upgradeSettings`. Readers: `config.todoIgnored = []` (`app-todo.js:10`), `config.teamPlan = {}` (`teamplan.js` `own`) |
| `handbooks` | `setHandbook` (Person, To do), `tidyHandbookCodes(…, true)` | none found |
| `attendance` | `setMark` (Attendance, Person); `fixDates` at open (logged) | `freshenFake` (demo files only; moves History too) |
| `awards` | `announce`, `addAward`, `removeAward`, `dropBlue` | `fromJson`: `renameAward` (SS Review Emblem, T&T emblems), `renameAwardFor` (Sparks jewels) |
| `given` | `setGiven`, `clearGiven`, `markPastYearsGiven`, `clearAssumedGiven`, `dropBlue` | `fromJson` renames (as `awards`) |
| `givenNoDate` | `setGiven` (no date), `setNoDateMark` via it | `fromJson` renames |
| `held` | `setHold` | `fromJson` renames |
| `flags` | `addFlag`, `clearFlag`, `setFlagNote`, `addNote` | none found |
| `doneBooks` | `setBookDone` | none found |
| `received` | `setReceived` | none found |
| `adults` | adult awards on the Awards tab (to verify in Task 2 step 1) | none found |
| `teamMoves` | `setTeamMove`, `removeTeamMove` | none found |
| `games` | `setGame` | none found |
| `progress` | `setProgress`, `markSignsNoDate`, `setCubbiesDetail`, `applyProgressPlan` (own entries) | `fromJson`: `upgradeTnt` (common -> book), `upgradeStartZone` (`SZ1.1` -> `SZ.1`), `renameBooks` (History rewritten: OK) |
| `progressNoDate` | `setSignNoDate` | none found |
| `extraSheets` | `addExtraSheet` | none found |
| `announcedNoDate` | `setAnnNoDate` | none found (and not renamed by upgrades: side finding) |
| `blueWings` | `grantBlue`; `newSeason` carries (new file, empty History) | none found |
| `blueOverrides` | `grantBlue`, `dropBlue` | none found |
| `blueDrops` | `dropBlue` | none found |
| `roster` | Roster / Person / Uniforms / Teams edits (master + `touchSeason` -> `syncData`); Planning Center first load, visible-change refresh, reviewed import; old master import | `importPc` -> `App.rebase()` (cause 2); re-apply at open (cause 3); `setSeason` / `adopt` -> `rebase()` round trip (cause 4) |
| `calendar` | Calendar tab (`calTouch`), calendar CSV import, shift weeks | `Calendar.sort` at open absorbed by `rebase()` (cause 4) |
| `rotation` | rotation CSV import (to verify in Task 2 step 1) | none found |

---

## File Structure
| File | Change | Responsibility |
|---|---|---|
| `dev/app/season.js` | modify | `replayDiff(s)`; `fromJson` logs a `File upgrade` entry; `reconcile(s, now)`. |
| `dev/app/validate.js` | modify | Use `Season.replayDiff`; wording points to History › Reconcile. |
| `dev/app/app-season.js` | modify | `setSeason` takes `snap` before `loadData` and logs open-time tidying; save-time net; restore through `fromJson`; `App.pendingDiff()`; Reconcile button on History. |
| `dev/app/app.js` | modify | `importPc` logs any refresh that changed the data. |
| `dev/tools/replay-report.js` | create | By-hand diagnostic: counts and kinds only. |
| `dev/app/test/replay-report.test.js` | create | The tool prints shapes, never ids or values. |
| `dev/app/test/replay-causes.test.js` | create | One node test per cause plus guards. |
| `dev/app/test/replay-open-browser.test.js` | create | Causes 3, 4, 5 and the Reconcile button, in the browser. |
| `dev/app/test/season.test.js`, `validate.test.js` | modify | Unit tests for the new functions and wording. |
| `docs/DATA-FORMAT.md` | modify | 10.1, 10.4, 11.1, 15 item 6. |
| `docs/superpowers/plans/items/R20-findings.md` | create (Task 3) | Short note: per cause, test name, failed or not, shapes. |

---

### Task 1: The replay helper and the by-hand tool

**Files:**
- Modify: `dev/app/season.js`, `dev/app/validate.js`
- Create: `dev/tools/replay-report.js`, `dev/app/test/replay-report.test.js`

**Interfaces:**
- Produces: `Season.replayDiff(s) -> [{ p, o, n }]` where `o` is what the replay gives and `n` is the data (same orientation as `diff(snapshot(replayed), snapshot(s))`). Throws only what `at` / `applyChanges` throw. Empty History gives `[]`.
- Produces: `node dev/tools/replay-report.js <data.json>`. Output (stdout, nothing else):
  ```
  History entries: N   Differences: D   Changed by this open's upgrades: U
  count  kind      shape                                         last logged (day)
     51  changed   awards › <date> › <id>                        2026-10-08
     25  replay+   given › <id> › Blue Emblem 1                  2026-10-01
  ```
  `kind`: `replay+` (the replay has it, the data does not), `data+` (the data has it, the replay does not), `changed`. Shape rules: a path part that is a key of `roster.people` or looks like an id (`/^\d+_/`) -> `<id>`; `YYYY-MM-DD` -> `<date>`; a part that is an award name is printed only when it is a standard award (in `Catalog.defaultConfig().awardLists`, or matches the known old forms `/^(Red|Green|Blue) Jewel [1-4]$/`, the T&T old names, `SS Review Emblem - Yellow`), else `<award>`; Planning Center column names and section names are printed; anything else longer than 24 characters or containing a space that is not in those lists -> `<key>`. "last logged (day)" is the day (`t.slice(0,10)`) of the newest entry with a change at or above that path: a day, never a label (labels and tags can hold typed text). `U` = `Season.diff` between a season built from the raw JSON sections and `fromJson`'s result, outside `roster` (a count only).
- Consumes: nothing.

- [ ] **Step 1: Failing test** `replay-report.test.js`: build `goodSeason()` (copy the helper from `validate.test.js`, ids `7000001_Test_Kid`, `7000002_Test_Kid`), log one mark, then set `attendance['2026-10-28']['7000001_Test_Kid'].h = 1` without an entry; write to a temp file; run the tool with `child_process.execFileSync('node', [tool, tmp])`. Assert: stdout contains `Differences: 1`, a line matching `/1\s+(changed|data\+)\s+attendance › <date> › <id>/`; stdout does not contain `7000001`, `Test_Kid`, `2026-10-28` outside the "last logged" column (assert the shape column only), or any value. Second test: a custom award name `Zany Trophy` in a differing `given` path prints `<award>`. Run `node test/replay-report.test.js` from `dev/app`. Expected: FAIL (no tool).
- [ ] **Step 2: Implement** `replayDiff` in `season.js` next to `at` (5 lines: `const r = at(s, 0); s.history.forEach(e => applyChanges(r, e.changes, false)); return diff(snapshot(r), snapshot(s));`), export it. `validate.js:159-161` calls it instead of the inline replay (same findings). Write the tool (pure node, requires `../app/season.js` and `../app/catalog.js`; refuses with a usage line when no argument; never prints file contents on a parse error, only "not valid JSON").
- [ ] **Step 3: Run** `node test/replay-report.test.js && node test/validate.test.js && node test/season.test.js`. Expected: PASS.
- [ ] **Step 4: Commit** (bump `season.js`, `validate.js`).

### Task 2: One failing test per cause, and the guards

**Files:**
- Create: `dev/app/test/replay-causes.test.js` (node), `dev/app/test/replay-open-browser.test.js` (Playwright)

**Interfaces:**
- Consumes: `Season.replayDiff`. Each cause test ends with `assert.deepStrictEqual(Season.replayDiff(Season.fromJson(text)), [])` **and** `!/differs from what the history says/.test(msgs(Validate.validate(text, OK_NAME)))`, where `text` is what the app would save.
- Produces: tests that fail today for causes 1-4 and 6; guards that pass today.

- [ ] **Step 1: Re-check the writers table.** `grep -n "Season\.\w*(" dev/app/app*.js` for each mutator and confirm a `touchSeason` / `App.touch` / `App.changed` follows; grep `rebase(` and direct `season.<section>` / `config.<key> =` writes. Confirm `adults` and `rotation` writers. Record corrections for the findings note (Task 3).
- [ ] **Step 2: Cause 1a, an old file with History logged before the upgrades.** Load the TEST file **as raw JSON** (it is in the pre-1.50.13 form) and act as an older app would: pick a Sparks child `id` from `Object.keys(raw.roster.people)` that has a `given` entry; `before = Season.snapshot(raw)`; set `raw.given[id]['Blue Jewel 2'] = '2026-10-29'` and `raw.awards['2026-10-29'] = { [id]: ['Blue Jewel 2'] }` (add the date to the calendar copy if the validator needs it); `Season.record(raw, before, { now: '2026-10-29T23:00:00.000Z' })`; `text = JSON.stringify(raw)`. Test `an old file whose History names awards the upgrade renames replays clean`: `Season.replayDiff(Season.fromJson(text))` is `[]`. Expected: FAIL (`given › <id> › Blue Jewel 2` and `awards › <date> › <id>`).
- [ ] **Step 3: Cause 1b, the file was already upgraded and saved** (the real file's state). `text2 = Season.toJson(Season.fromJson(text))`. Test `a file upgraded and saved by an older release can be reconciled`: today assert only that `replayDiff(fromJson(text2)).length > 0` and record the count (this is the state no `fromJson` change can fix); after Task 5 the test becomes `reconcile(s) > 0` then `replayDiff(s)` is `[]` and stays `[]` after `toJson`/`fromJson`.
- [ ] **Step 4: Cause 1, one small test per upgrade** (table-driven, synthetic seasons from `Season.blank` + `Catalog`, invented ids): `SS Review Emblem - Yellow` logged then opened; T&T `Blue Emblem 1` logged plus `progress[id].common['BE1.1']` logged; Start Zone `common['SZ1.1']` logged; plain `Red Jewel 1` logged with WR progress complete; old Cubbies-less config with a logged `config.progress` change; a logged `config.awardLists.Sparks`. Each: build with the old template, log the edit with `record`, `toJson`, then assert `replayDiff(fromJson(text))` is `[]`. Expected: each FAILS. Add the side-finding check: a logged `announcedNoDate[id]` holding `Red Jewel 1` is still `Red Jewel 1` after `fromJson` (report, do not assert a fix).
- [ ] **Step 5: Cause 2, silent refresh** (node; mirror `importPc` exactly: `Model.fromRoster`, `Csv.toRecords(Csv.parse(text))`, `planImport`, `needsReview` must be false, `applyPlan`, stamp `pcAsOf`/`pcSource`, then when `edited` is false do what `rebase` does: nothing is recorded, `s.roster = Model.toRoster(master)`). Setup: TEST file, then a first logged import of the 20261028 TEST export (record the roster change so people are logged whole). Three tests, each with an edited copy of the 20261028 export text (edit in memory, never on disk): `a refresh that changes only a money column is logged` (one `Balance Due` value; skip with a note if the TEST export has no such column, and instead add the column in memory), `a refresh that adds a new column is logged`, `the same export under a later date is logged` (rename to `20261104 -- …`). Expected: each FAILS (`roster › people › <id> › pc › Balance Due`, `roster › pcCols`, `roster › pcAsOf` / `pcSource`).
- [ ] **Step 6: Cause 4, open-time tidying** (node): (a) `opening the TEST file tidies nothing`: `Season.diff(Season.snapshot(s), Object.assign({}, s, { roster: Model.toRoster(Model.fromRoster(s.roster)), calendar: Calendar.sort(s.calendar.map(r => Object.assign({}, r))) }))` is `[]` (expected PASS; evidence says 0). (b) `a person logged whole with x_ClubberID in v replays clean after the open`: add `7000001_Test_Kid` with `v.x_ClubberID` via a logged `record`, then apply the round trip as `setSeason` + save would, `toJson`, assert `replayDiff` is `[]`. Expected: FAIL.
- [ ] **Step 7: Cause 6, restore** (node; written now, meaningful after Task 4): restore to the version before a `File upgrade` entry, `toJson`, reopen; assert the data is in the current form (`given[id]` has `HG Blue Jewel 1`, not `Blue Jewel 1`) and `replayDiff` is `[]`. Today: record the result (no `File upgrade` entry exists yet, so it passes trivially; mark it `// meaningful after Task 4`).
- [ ] **Step 8: Guards, expected PASS today:** undo then redo of an attendance edit; `merge3` of two copies with different nights; `DataMerge.plan` + `finish` with one conflict decided `other`; `applyProgressPlan` with two rows; `fixDates` at open then `record`; `newSeason` (History empty, no warning); `renameBooks` with a `spell` book and logged progress under the old key; a table over every `Season` mutator in the writers table (call it on the TEST season with invented ids, `record`, `toJson`, assert `replayDiff` is `[]`).
- [ ] **Step 9: Browser test** `replay-open-browser.test.js` (TEST file only, test mode): (a) cause 3: open the 20261028 TEST export first, then the TEST data file; assert no exception on the page, and History holds no new entry whose changes span sections other than `roster`; then edit the export in memory (date in the name) and open both together again; save via `App.snapshotJson()`; `Validate.validate` on it has no replay warning. Expected: FAIL. (b) cause 5, tour: open the TEST file, visit every tab and sub-tab and every report in the Reports list, then `App.pendingDiff()` is `0`. Expected: record the result (PASS likely; a failure names the section). Run with `NODE_PATH=/tmp/claude-1000/shim/node_modules node test/replay-open-browser.test.js`.
- [ ] **Step 10: Commit** the two test files with the message saying "red until Tasks 4-7" and listing which tests fail. Do not run the full sweep between Task 2 and Task 7 (it would fail by design); run only the named files.

### Task 3: Findings note and the by-hand check on the real file

**Files:**
- Create: `docs/superpowers/plans/items/R20-findings.md`

- [ ] **Step 1:** Write the note: per cause, the test name, FAIL or PASS, the shapes it produced (from running `replay-report.js` on the temp files the tests write; add an env switch `R20_KEEP=dir` to the causes test to keep them), and the corrected writers table rows. Invented ids only.
- [ ] **Step 2 (Mike, by hand, on the real file).** From the repo root: `node dev/tools/replay-report.js <path to the newest working data file>`. It reads the file, prints shapes and counts, writes nothing. Before pasting, glance at the output: there must be no names, ids or values; if a line shows something personal, do not paste it, say which shape line it was. Paste the output into the session.
- [ ] **Step 3: Compare** the pasted shapes with the note. Expected from the evidence: most lines are cause 1 (`awards › <date> › <id>`, `given › <id> › <award>` pairs, `config › awardLists|progress ›…`), "last logged" days before 2026-11-04, `Changed by this open's upgrades: 0`. **Stop rule:** a shape not explained by causes 1-6 gets its own cause row, a failing test in `replay-causes.test.js`, and a fix task before Task 8.
- [ ] **Step 4: Commit** the note.

### Task 4: `fromJson` logs its own upgrades (cause 1a)

**Files:**
- Modify: `dev/app/season.js` (`fromJson`), `dev/app/test/season.test.js`, `dev/app/test/replay-causes.test.js`

**Interfaces:**
- Produces: after the upgrades, when the season's History is **non-empty** and the upgrades changed anything in a `SECTIONS` section, `fromJson` appends `{ t: <last entry's t>, label: 'File upgrade', tag: 'File upgrade', changes }`. `t` repeats the last entry's time so two copies opening the same file write the same entry (Drive lineage and the merge base still match) and the validator's time-order check stays quiet. An empty History gets no entry (the check does not run; the upgraded data is simply the start). A current file gets no entry.
- Note on the refinement from Wave 2: no `1970-01-01` entry for an empty History.

- [ ] **Step 1: Failing unit tests** in `season.test.js`: `fromJson logs its own upgrades once` (the Step 4 Start Zone file: last entry label `File upgrade`; `Season.toJson(Season.fromJson(Season.toJson(Season.fromJson(text))))` equals `Season.toJson(Season.fromJson(text))`); `a current file gains no entry` (a file saved by today's code: `fromJson(text).history.length` equals the raw length); `an old file with no History gains no entry`. Expected: first FAILS.
- [ ] **Step 2: Implement.** Move the copying of `roster` (unpack), `calendar`, `rotation`, `history` above the upgrade block (none of the upgrades reads them; confirm by reading each). Take `const before = snapshot(s)` right after the sections are copied (after `renameBooks`, whose moves are already in History via `renameInHistory`, and after the config defaults merge: a default key added at a path History never logged is invisible to the check). Run the old-Sparks-template line, the `SS Review Emblem` rename and the six upgrade calls; then `const changes = diff(before, snapshot(s))`; push the entry when `changes.length && s.history.length`. Keep `renameInHistory` where it is.
- [ ] **Step 3: Run** `node test/season.test.js && node test/replay-causes.test.js && node test/validate.test.js && node test/datamerge.test.js && node test/merge.test.js`. Expected: Task 2 steps 2 and 4 now PASS; step 3 still shows drift (needs Task 5).
- [ ] **Step 4: Drive and merge check.** Run `drive-inplace-browser`, `merge-files-browser`, `import-browser`, `fresh-start-browser` (Playwright). `lineage()` compares file text and builds its base with `fromJson`: an old file now parses with one more entry on both sides. Expected: PASS; if `lineage` compares History lengths of raw text against parsed seasons, fix it to compare like with like and add the case to `drive-inplace-browser`.
- [ ] **Step 5: Commit** (bump `season.js`).

### Task 5: Reconcile History once (cause 1b and any residue)

**Files:**
- Modify: `dev/app/season.js`, `dev/app/validate.js`, `dev/app/app-season.js` (History tab), `dev/app/index.html` (button), `dev/app/test/season.test.js`, `dev/app/test/replay-causes.test.js`, `dev/app/test/replay-open-browser.test.js`

**Interfaces:**
- Produces: `Season.reconcile(s, now) -> number`: `d = replayDiff(s)`; when non-empty, push `{ t: now, label: 'Reconciled: History did not match the data (' + d.length + ' places)', changes: d.map(c => ({ p: c.p, o: c.o, n: c.n })) }` (drop `o`/`n` keys that are `undefined`), return `d.length`; else return 0 and push nothing. After it, `replayDiff(s)` is `[]` (proof: the entry's forward pass sets each differing path to the data's value).
- Produces: History tab shows, only when `Season.replayDiff(season).length > 0`, a line "History does not add up to the data in N places (usually left over from older versions). **Reconcile History** records the difference as one version." The button calls `App.resolveDraft()`, then `Season.reconcile(season, new Date().toISOString())`, `snap = Season.snapshot(season)`, `markEdit()`, redraws. Undo is not offered for it (Restore to the previous version is the way back).
- Produces: validator wording: "... in N places (first: …). If the file was not edited outside the app, open it and use History › Reconcile History."
- Refinement from Wave 2: the button lives on the History tab (it acts on the open season; the Validate tab checks files chosen from disk).

- [ ] **Step 1: Failing tests:** `reconcile adds one entry and the replay check is then quiet` (the Task 2 step 3 file: `reconcile` returns the recorded count, `replayDiff` is `[]`, `validate(toJson(s))` has no replay warning, a second `reconcile` returns 0); `reconcile on a clean file adds nothing`; browser: open a TEST file with one unlogged change (made in memory before `openSeason`), the line shows `1 place`, press the button, the line is gone, History has one more entry, the file is unsaved. Expected: FAIL.
- [ ] **Step 2: Implement** as specified. `reconcile` must run `replayDiff` once and must not change data (only `history`).
- [ ] **Step 3: Run** `node test/season.test.js && node test/replay-causes.test.js && node test/validate.test.js` and `NODE_PATH=/tmp/claude-1000/shim/node_modules node test/replay-open-browser.test.js`. Expected: PASS for cause 1b.
- [ ] **Step 4: Commit** (bump `season.js`, `validate.js`, `app-season.js`, `index.html` if it has its own version line).

### Task 6: Planning Center refresh and the re-apply at open (causes 2 and 3)

**Files:**
- Modify: `dev/app/app.js` (`importPc`), `dev/app/app-season.js` (`setSeason`, `App.pendingDiff`)

**Interfaces:**
- Produces: `App.pendingDiff() -> number`: `syncData()`, then `Season.diff(snap, season).length` (0 when no season or no `snap`).
- Produces: `importPc` decides with the data, not the visible columns: `if (edited || App.pendingDiff()) App.changed(); else App.rebase();`. The entry's label is the usual `Roster` (no new label API; the History line reads "Roster").
- Produces: `setSeason` sets `season`, then `snap = Season.snapshot(s)` **before** `App.loadData`, so a re-applied export records against this file; the final `rebase()` stays.

- [ ] **Step 1:** Make the Task 2 step 5 node tests call a shared helper that follows the new rule (`edited || diff non-empty` -> record) so they describe the fixed behaviour; confirm they still FAIL against a copy of the old rule kept in the test as `oldRule` (one assertion) and PASS with the new rule.
- [ ] **Step 2: Implement** both changes. Check `importPc`'s first-load branch and the review path (`applyDecided`) are unchanged.
- [ ] **Step 3: Run** `node test/replay-causes.test.js`, then `import-browser`, `import-conflicts-browser`, `replay-open-browser`, `drive-inplace-browser` with the shim. Expected: PASS. Watch for tests that assumed "an unchanged export leaves the file saved": an export that only moves `pcAsOf` now marks the file unsaved (see open question 1); update those assertions only after Mike answers.
- [ ] **Step 4: Commit** (bump `app.js`, `app-season.js`).

### Task 7: Open-time tidying, the save-time net, restore (causes 4, 5, 6)

**Files:**
- Modify: `dev/app/app-season.js` (`setSeason`, `App.saveNow`, `hRestore`)

**Interfaces:**
- Produces: in `setSeason`, after `App.loadData(s, opts)`: `syncData(); const tidy = Season.diff(snap, season);` when `tidy.length && season.history.length`, `Season.record(season, snap, { separate: true, prefix: 'Tidied on open' })` and mark unsaved; then `rebase()`. (With Task 6, an import re-applied at open is already recorded by then; `tidy` holds only the round trip.)
- Produces: in `App.saveNow`'s `go()`, after `syncData()` and before `Season.toJson`: `if (snap && Season.diff(snap, season).length) { Season.record(season, snap, { separate: true, prefix: 'Unlogged changes' }); snap = Season.snapshot(season); App.unloggedSaves = (App.unloggedSaves || 0) + 1; console.warn('R20: unlogged changes recorded at save'); }`. The tour test (Task 2 step 9b) also asserts `App.unloggedSaves` is falsy after a save.
- Produces: restore uses `setSeason(Season.fromJson(Season.toJson(Season.restoreTo(season, v).season)), { noImport: true })`.

- [ ] **Step 1:** Run Task 2 step 6b and step 7 and step 9b. Expected: 6b FAILS, 7 FAILS now that `File upgrade` entries exist (write a variant that restores to before one), 9b as recorded.
- [ ] **Step 2: Implement** the three changes.
- [ ] **Step 3: Run** `node test/replay-causes.test.js && node test/season.test.js`, then `replay-open-browser`, `fresh-start-browser`, `history-browser` (or whichever browser tests drive History restore: `grep -l hRestore dev/app/test/*.js`). Expected: PASS.
- [ ] **Step 4: Commit** (bump `app-season.js`).

### Task 8: Docs, sweep, release bookkeeping

**Files:**
- Modify: `docs/DATA-FORMAT.md`, `CHANGELOG.md`, `README.md`, `BACKLOG.md`, `dev/app/index.html` (`app-version`, `app-build`)

- [ ] **Step 1: DATA-FORMAT.md.** 10.1: History can hold a `File upgrade` entry (time repeats the previous entry), a `Reconciled` entry, `Tidied on open`, `Unlogged changes`. 10.4: what the check tests (the "read first" section above, short), what Reconcile does, that a warning after this release means a change outside the app or a new bug. 11.1: new order (sections, roster, calendar, rotation, history copied before the upgrades; then the `File upgrade` entry). 15 item 6: fixed, with the causes. Mention the side finding on `announcedNoDate` / `blueDrops` only if Task 2 confirmed it.
- [ ] **Step 2: Full sweep:** `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh` from the repo root. Expected: no FAIL beyond the known baseline (see memory "App test setup").
- [ ] **Step 3: Bookkeeping.** Every changed `.js` has its own version bumped (check with `git diff --stat` and line 1 of each); bump `app-version` and `app-build` once. CHANGELOG "Next release": Reconcile History; upgrades and export refreshes now logged; what Mike should do once (open the working file, History › Reconcile History, save). README: the new tests and `dev/tools/replay-report.js`. BACKLOG: R20 "FIXED in dev <date>, not deployed"; add the side finding as a new item if confirmed.
- [ ] **Step 4: Commit.** Do not deploy.

## Run commands
- One node test, from `dev/app`: `node test/replay-causes.test.js` (likewise `season`, `validate`, `datamerge`, `merge`, `replay-report`).
- One browser test, from `dev/app`: `NODE_PATH=/tmp/claude-1000/shim/node_modules node test/replay-open-browser.test.js`.
- Everything: `sh dev/tools/run-tests.sh` (add `--node-only` without Playwright; a name filter as the last argument, e.g. `sh dev/tools/run-tests.sh replay`).
- By hand (Mike only, real file): `node dev/tools/replay-report.js <file>`.

## Release rules
- Each changed `.js` bumps its own line-1 version (`make-deploy.sh` refuses otherwise): expected `season.js`, `validate.js`, `app-season.js`, `app.js`; `index.html` if the button markup lives there.
- `app-version` and `app-build` in `index.html` bump once, in Task 8.
- CHANGELOG, README, BACKLOG in Task 8; DATA-FORMAT.md in the same commit as each semantic change (Tasks 4, 5, 7 touch History's meaning; Task 8 tidies the wording).
- No data-format version bump: old apps read the new entries as ordinary History entries.

## Open questions for Mike
1. **Export refreshes now mark the file unsaved** when only a balance, a new column or the export date changed (cause 2 fix). OK? The alternative is to treat `pcAsOf`, `pcSource`, `pcCols` and the money columns like `x_LastSeen` (never logged, never compared); simpler, but then History cannot show or undo them.
2. **Reconcile once on the working file**: after the release, open the newest file, History › Reconcile History, save. One version with a few hundred changes. Fine, or would you rather keep the warning and live with it?
3. **`File upgrade` as a named version** (a tag, so it shows like a named version and nothing folds into it), or a plain entry with a separate "never fold" flag?
4. **"Tidied on open" marks a file unsaved on open** when the roster round trip changed something (expected once per old file, then never). Acceptable?
5. After this, should the replay warning become louder (a red line on History, or on the Debug tab), since it should now only fire for real problems?

## Risks
- **Drive lineage and merge base.** `fromJson` now appends an entry to old files. Both sides of a Drive save go through `fromJson`, and the entry is deterministic (same `t`, same changes), so the shared-entry base still matches; Task 4 step 4 proves it. Two copies on different app versions write different upgrade entries: the base falls back one entry, which the merge handles.
- **Reconcile hides real damage.** It records whatever differs, including a genuine outside edit. Mitigation: the button says how many places, the tool lets Mike see shapes first (Task 3), and Restore to the previous version undoes it.
- **Restore across an upgrade** now re-runs `fromJson`; a restore to an old version re-upgrades and logs it again (correct, but one more entry).
- **More unsaved prompts** (open questions 1 and 4) could annoy at the door on club night; an auto-save covers it if on.
- **Performance:** `fromJson` takes two snapshots and a diff on every open (and in the validator, Drive lineage, merge). Measure on the TEST file in Task 4; expect milliseconds.
- **Privacy:** the tool's shape rules decide what is printed. Its test asserts that no id, no custom award name and no value appears; Mike still reads the output before pasting.
- **Wave 2 overlap:** R18 (Task 6 of Wave 2) migrates `x_ClubberID` and `driveDirs` on open; it must land after Task 4 so its migrations are logged by the `File upgrade` entry. Do not execute Wave 2 Tasks 4-5 as well as this plan.

## Self-review
- Coverage: every cause in the table has a failing test (Task 2) and a fix (Tasks 4-7); the already-drifted real file has Reconcile (Task 5); the by-hand tool is Task 1 and its use Task 3; the writers table is re-checked in Task 2 step 1.
- Order: tool -> tests (red) -> findings and Mike's check (stop rule) -> fixes in cause order -> docs and sweep.
