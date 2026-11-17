# Awards Tab Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Awards tab "earned and not announced → slides → Mark all announced (with Hold)", keep the by-class hand-out report, and move Given and Announced editing to the Progress sheet.

**Architecture:** `awards[date][id]` stays the announced record. One new optional data-file section, `held[id]`, copies how `givenNoDate` is wired through `season.js`. A new pure `Season.pendingAwards` feeds the slides and the Announce page. The Awards tab UI (`app-season.js`) loses the history, move/undo and Given controls.

**Tech Stack:** Plain browser JS (no build except terser in `make-deploy.sh`), Node test scripts in `dev/app/test/`, Playwright (`NODE_PATH=<dir with playwright>`) for browser tests.

**Spec:** `docs/superpowers/specs/2026-11-05-awards-simplify-design.md` (approved by Mike 2026-11-05, including: no Awards status report).

## Global Constraints

- Work in `/home/burnclouds/projects/awana/database/dev/app/`; run tests from there (`node test/<file>`).
- Stay in the 1.50.x series; bump only the third number (1.50.8 → 1.50.9) in the version line (line 1) of every changed `.js` and the `app-version`/`app-build` meta tags in `index.html`. Never change the data-file format version.
- An empty `held` is left out of the saved file (as `givenNoDate` is).
- Given semantics (`given`, `givenNoDate`, `givenShown`) do not change. Given is set on Progress only.
- No children's names in tests, docs or changelog; use invented names.
- Do not commit, push or deploy unless Mike asks. "Checkpoint" steps mean: run the named tests and stop.
- Remaining reports: *Awards to hand out (one page per class)* (`handOut`) and *End-of-year awards (list)* (`ceremony`). Removed: `weeklyAwards`, `awardStatus`.

## Review Focus

- A child absent on announce night: the award stays on the hand-out report (not Given) and is on no later slide once marked announced.
- Holding then regenerating slides repeatedly: held awards never appear; unheld ones keep appearing until Mark all announced.
- Mark all announced with a group/class/type filter on: only the filtered rows are stamped; held rows are never stamped.
- An older data file (no `held`) opens, saves without that key, and Undo/Redo and History describe holds in words.
- Clearing Announced on Progress for an award that has a Given date: Given stays.

---

### Task 1: Storage for `held`

**Files:**
- Modify: `season.js` (empty-season defaults near line 64; `toJson` ~97; `fromJson` ~138; `SECTIONS` ~937; `AREA` ~957; `describe` ~1047; award renaming ~328 and ~418; `merge3` ~981)
- Test: `test/season.test.js`, `test/merge.test.js`

**Interfaces:**
- Produces: `s.held[id] = [award, ...]` (sorted); `Season.setHold(s, id, award, on: boolean)`; `held` exported in the `Season` object.

- [ ] **Step 1: Write failing tests** in `test/season.test.js`: `setHold` adds and removes (list left out when empty); `toJson` of a season with `held` empty has no `held` key; `fromJson(toJson(s))` round-trips it; an old file without it opens with `{}`; renaming an award (the existing rename path that fixes `givenNoDate`) also renames inside `held`; `Season.describe` of a `held` change reads "<name> · held off the slides: <awards>". In `test/merge.test.js`: two people holding different awards for the same child merge to the union.
- [ ] **Step 2: Run** `node test/season.test.js` and `node test/merge.test.js`. Expected: FAIL (functions undefined).
- [ ] **Step 3: Implement** the signatures above, wiring both keys everywhere `givenNoDate` appears in `season.js` (search for it; each hit gets an equivalent). `newSeason` starts both empty.
- [ ] **Step 4: Run** the same two tests, then `node test/compact-file.test.js` and `node test/versions.test.js`. Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 2: Pending list, announce edit, and removal of move/undo

**Files:**
- Modify: `season.js` (`addAward`, `removeAward` ~563-575, `moveAnnouncements`/`unannounce` ~591-612, `awardLedger` ~615, `slideAwards` ~658, `waitingToGive` ~648, exports ~1114)
- Test: `test/awards-ledger.test.js`, `test/awards-lifecycle.test.js`

**Interfaces:**
- Consumes: Task 1 (`held`).
- Produces:
  - `Season.pendingAwards(s, id, group, calRows) -> [{ award, earned, held: boolean }]`: ledger rows that are earned (Progress, attendance, Blue Jewels), announced on no night, not on the group's `config.exclude` list, not before the first club night (existing ledger rule). `held` is true when listed in `s.held[id]`.
  - `Season.slidePending(s, group, ids, calRows) -> [{ id, results: [award] }]` (same shape `slideAwards` returned; unheld only; children with nothing omitted).
  - `Season.announce(s, date, picks: [[id, award]])`: skips held, writes `awards[date][id]`, never announces a held award.
  - `Season.setAnnounced(s, id, award, date|'')`: set or clear (clear removes from every night; never touches `given`).
  - `awardLedger` rows now include `held`.

- [ ] **Step 1: Write failing tests** (names): `pending lists earned-not-announced`, `pending excludes held and left-off-the-slide`, `pending excludes before first night`, `announce skips held`, `announce clears hold`, `setAnnounced clears without touching Given`, `slidePending excludes held and announced`. Assert with invented children.
- [ ] **Step 2: Run** `node test/awards-ledger.test.js` and `node test/awards-lifecycle.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** `addAward` is replaced by `announce` (no manual-award entry point remains); delete `moveAnnouncements`, `unannounce`, `slideAwards`, and the Given-clearing line in `removeAward`; remove `waitingToGive` if no caller remains after Task 4 (re-check then). Update exports.
- [ ] **Step 4: Update tests** that exercised move/undo or `slideAwards` (`awards-ledger.test.js`, `awards-lifecycle.test.js`, `slides.test.js`'s model setup) to the new functions; delete the move/undo cases. Run all three. Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 3: Slides and reports

**Files:**
- Modify: `slides.js` (~87), `reports-season.js` (`weeklyAwards` ~21-33, `awardStatus` ~134-147, report list ~225-230), the bundle definitions that name either report (search `weeklyAwards` and `awardStatus` in `reports*.js`, `app*.js`, `catalog.js`)
- Test: `test/slides.test.js`, `test/reports-season.test.js`, `test/bundles.test.js`

**Interfaces:**
- Consumes: `Season.slidePending(s, group, ids, calRows)` from Task 2.
- Produces: slide model built from pending awards; the report list has `handOut` and `ceremony` only for awards.

- [ ] **Step 1: Write failing tests:** slide model for a group lists a pending award and omits a held one and an announced one; report ids `weeklyAwards` and `awardStatus` no longer exist; `handOut` still lists earned-not-Given across all dates, by class, including held and announced awards and excluding left-off and end-of-year awards.
- [ ] **Step 2: Run** `node test/slides.test.js`, `node test/reports-season.test.js <export.csv> <calendar.csv> <season.json>` (paths in README *Tests*), `node test/bundles.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement:** `slides.js` calls `Season.slidePending` (the picked night is only the title); delete the two report functions and list entries; remove them from bundles; the Reports tab's date/status options that only they used go too.
- [ ] **Step 4: Run** the three tests plus `node test/versions.test.js`. Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 4: Awards tab UI

**Files:**
- Modify: `app-season.js` (~389-554: `dueFor`/`announceDue` replaced by `Season.pendingAwards`; `announceSection`; delete `announcedSection`, `fixPanel`, `unbacked`, `fixKids`, `fixFrom`, `givenCell` and their handlers; `handOutSection`, `ceremonySection` read-only; `renderAwards` badge; `btnAwSlide` handler removed), `index.html` (Awards bar: drop `btnAwSlide`; Announce buttons: *Slide images…*, *Award lists…*, *Mark all announced (n)*), `style.css` (dim held rows)
- Test: `test/awards-manager-browser.test.js`, `test/awards-badge-browser.test.js`, `test/awards-fix-browser.test.js` (delete), `test/given-nodate-browser.test.js` (drop the Awards-tab cases), `test/awards-recalc-browser.test.js`, `test/past-years-browser.test.js`, `test/assumed-given-browser.test.js`

**Interfaces:**
- Consumes: Task 2 (`pendingAwards`, `announce`, `setHold`).
- Produces: Announce page rows `<tr data-id data-award>` with a Hold checkbox `input[data-hold]`; button `#btnAnnounce` labelled `Mark all announced (n)` (n = unheld rows shown); Hand out and End-of-year tables with columns Name, Class, Award, Earned, Announced (date or "not yet") and no inputs; the Announce badge counts unheld pending rows, the Hand out badge counts earned-not-Given as before.

- [ ] **Step 1: Write failing browser tests** (extend `awards-manager-browser.test.js`): Announce rows show a Hold box; ticking it dims the row, drops the Announce badge by one and persists in the saved file; `#btnAnnounce` stamps only unheld rows under the current group/class filter on the chosen night; held row stays listed; no `[data-given2]`, `[data-given-nd]`, `#btnAwFix`, `#awSecAnnounced` or *Read-off list…* in the DOM; Hand out lists an announced-not-Given award and an absent child's carried-over award; *Printable list by class…* still opens `handOut`; End-of-year list has no Given inputs; no *Add award by hand* control and no `#awHandKid` in the DOM.
- [ ] **Step 2: Run** `NODE_PATH=<dir> node test/awards-manager-browser.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the UI per the Produces block; delete dead code and the tests for removed features.
- [ ] **Step 4: Run** all test files listed under Test (delete `awards-fix-browser.test.js`), then `test/trail-browser.test.js` and `test/tab-scroll-browser.test.js`. Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 5: Progress sheet and Person tab

**Files:**
- Modify: `app-season.js` (Progress record: Given row ~689-690 and handlers ~777-815), `app-person.js` (awards table ~92-99 and announce buttons ~242)
- Test: `test/progress-reviews-browser.test.js`, `test/received-browser.test.js`, new `test/announce-progress-browser.test.js`

**Interfaces:**
- Consumes: `Season.setAnnounced`, `Season.setHold`, `Season.announce`, `Season.awardLedger` rows (`announced`, `held`).
- Produces: next to each earned award's Given date on Progress, `input[type=date][data-aaward]` (Announced; empty clears it) and `input[type=checkbox][data-hold]`; both commit through the existing sheet draw/`touchSeason` path.

- [ ] **Step 1: Write failing browser test** `announce-progress-browser.test.js`: finish a section so an award is earned; Progress shows Announced blank and Hold unchecked; tick Hold → Awards tab row is dimmed (same flag, both ways); set Announced to a date → the award leaves the Announce list; clear Announced on an award that has a Given date → Given still shows; Hand out page follows Given only.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement** the two fields on the Progress record (use the same commit/redraw pattern as `commitGiven`). In `app-person.js` show Hold in the awards table and make its announce buttons use `Season.announce`.
- [ ] **Step 4: Run** the new test, `progress-reviews-browser`, `received-browser`, `person-sheets-browser`, `attend-person-browser`. Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 6: Manual, notes, README, changelog, versions, full run

**Files:**
- Modify: `index.html` (manual Awards section ~496-505 and Progress bullets ~509-513; `app-version`/`app-build`), `info.js` (`awards.states`, `awards.slides` notes; run `node dev/tools/sync-guide.js` from `database/`), `README.md` (data-file table rows for `awards`, `given`, `givenNoDate`; add `held`, `handEarned`; Using it; the stale `last updated` line; tab text), `CHANGELOG.md`, `WEEKLY-AWARDS-TABS.md` (one line), every changed `.js` version line
- Test: `test/info.test.js`, `test/versions.test.js`, `test/doc-examples.test.js`

- [ ] **Step 1:** Rewrite the manual and notes to say: slides = earned and not announced and not held; *Mark all announced*; Hold; Hand out report by class; Given and Announced on Progress; removed Weekly awards and Awards status reports; note that an app older than 1.50.9 drops `held` and `handEarned` when it saves.
- [ ] **Step 2:** Bump versions to 1.50.9; add the CHANGELOG entry.
- [ ] **Step 3: Run** the full list in README *Tests* that needs no real files (`season`, `pace`, `check`, `awards-*`, `given-*`, `slides`, `reports-*`, `info`, `versions`, `doc-examples`, `merge`, `store`, `stats`, `compact-file`), then the Playwright ones touched, then `node test/mobile-audit.js`. Expected: all PASS, nothing scrolling sideways on a phone-size screen.
- [ ] **Step 4:** Report to Mike what passed and what could not run (tests needing the real export). Do not run `make-deploy.sh` or commit until he asks.

---

**Self-review notes:** Spec coverage: pending slides (T2/T3), Mark all announced (T2/T4), Hold stored once and on both screens (T1/T4/T5), hand-out kept (T4), reports removed/kept (T3), Given on Progress only (T4/T5), manual awards dropped (T2/T4), manual/README/versions (T6). The spec's two builder calls are fixed here: the Announce badge excludes held; the Person tab shows Hold and uses `Season.announce`.
