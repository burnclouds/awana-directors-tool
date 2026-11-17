# R18: Legacy spellings nothing migrates (`config.driveDirs` open/data, `x_ClubberID` in roster `v`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every file the app reads comes out of `Season.fromJson` in one spelling: `config.driveDirs` has exactly `club` and `slides`, and no person's roster `v` holds `x_ClubberID`. The migration is silent (no History entry, no unsaved file), idempotent, keeps History consistent with the data, and adds nothing to a three-way merge. Then the readers and writers drop the fallbacks.

**Architecture:** Two pure normalizers in `season.js`, run by `fromJson` beside `renameBooks` / `renameInHistory` (the existing precedent for "a spelling change on open that also rewrites History so it still adds up"). Format version stays 5. `catalog.js` default changes; `app-drive.js` reads and writes `club`/`slides` only. The anonymizer already goes through `fromJson`, so it gets the migration for free.

**Refines:** `2026-11-13-wave2-data-safety.md` Task 6. Differences, with reasons, under "Decisions" below (main one: silent normalization of data **and History**, not a logged `File upgrade` entry).

**Spec:** BACKLOG R18; `dev/REVIEW-2026-11-12-whole-project.md`; `docs/DATA-FORMAT.md` 5.2 (`x_ClubberID` row), 6 (`driveDirs` row), 11.1 (opening order), 15 items 3 and 4.

## Global Constraints
- Use Edit/Write to change files (no `sed -i`, no node one-liners that write).
- Never open real data (`archive/`, `~/Downloads`, `~/Nextcloud`, `dev/*.json`, `dev/*.csv`, `reports/`, `research_notes/`). Tests use `dev/test-data` and invented ids (`7000001_Test_Kid`). Diagnostics print counts and kinds only.
- Each changed `.js` bumps its own line-1 version (`make-deploy.sh` refuses otherwise). `app-version`/`app-build` in `index.html` bump **once** for the release (if R18 ships inside Wave 2a, the 2a wrap-up task does it, not this item).
- CHANGELOG notes the format change (project rule: any change to what the file holds). `docs/DATA-FORMAT.md` and `test/data-format-doc.test.js` change in the same commit.
- Do not deploy. Mike says "deploy".

## What the code does today (verified 2026-11-13)

**`config.driveDirs`**
- Default (`catalog.js:86`): `{ open: null, data: null, slides: null }`.
- `fromJson` (`season.js:133`) does a shallow `Object.assign(defaults, o.config)`: a file's `driveDirs` object replaces the default wholesale, so whatever keys the file had survive.
- Only reader and writer: `app-drive.js:44-51`. `dirOf('club')` and `sharedOf('club')` read `club || data || open`; `setShared('club', x)` writes `{ club: x, open: null, data: null }` merged over the old object (so a chosen club folder still saves `open: null, data: null`); `setShared('slides', x)` keeps old `open`/`data` as they were. `app-options.js` only reads `App.driveInfo()` (club/slides): no change there. `drive.js` never touches `driveDirs`: no change.
- The TEST file `dev/test-data/awana-2026-27-TEST-20261029-214815.json` holds the old default `{"data":null,"open":null,"slides":null}`. So does almost every saved file: the default is written on every save.
- Anonymizer (`make-test-data.js:268-269`): deletes `config.driveDirs` and drops History changes under `config.driveDirs` (privacy: folder ids are the church's). Stays.

**`x_ClubberID` in `v`**
- `Model.toRoster` (`model.js:357`) never writes it; `Model.fromRoster` (`model.js:378`) overwrites `p.x_ClubberID` with the key after copying `v`. So a stored value was already ignored: **an old file loses nothing** when it goes (if it ever differed from the key, the key always won).
- In the app it already disappears silently: `setSeason` -> `loadData` (`fromRoster`) -> `rebase()` -> `syncData()` (`Model.toRoster`) rebuilds `season.roster` without it before the snapshot (`app-season.js:19-26`). It is only still visible to code that uses `Season.fromJson` alone: Drive `lineage()` base and the remote copy (`app-drive.js:101,114-115`), File > Merge (`app-merge.js:93`), `DataMerge` `norm`, `validate.js`, the tools.
- Old History values hold it (a whole person added: `p = ['roster','people',id]`, `n.v.x_ClubberID`; and the removal the first edit after the writer changed logged at `['roster','people',id,'v','x_ClubberID']`). The replay check (`validate.js:158-162`, `Season.at` then forward) therefore reports a difference for files whose data no longer has it. That is one of the R20 Cause C shapes (wave 2 Task 4 step 4, second test).
- Unrelated and out of scope: `x_ClubberID` as the in-memory id field (`Model.X.ID`) and as the old master-CSV header (`app.js` `kindOf`, `validate.js` "old master"). Only the stored `v` copy is legacy.

**Consequence today (a claim the first test checks):** a Drive in-place save of a file whose `v` still holds `x_ClubberID` runs `DataMerge.plan(remote, this copy, { base })` where base and remote (raw `fromJson`) hold it and this copy (synced) does not; under "a blank never beats a value" that is a Review row per person. After R18 all three sides lack it and there is nothing to review.

## Decisions

1. **Where:** in `Season.fromJson`, after the config defaults are merged (`driveDirs`) and after the roster is unpacked and History copied (`x_ClubberID` and the History rewrite), next to `renameInHistory`. Every path that reads a file (open, Drive base, remote, File > Merge, `DataMerge` `norm`, validate, anonymizer, tools) goes through `fromJson`, so all sides of any merge are in the same spelling. Nothing in `app-*.js` migrates.
2. **Silent, not logged.** No History entry, no `dirty`. Both changes are respellings with no meaning change, so a "File upgrade" line in the History tab (three `null` changes on nearly every existing file, plus one change per person for `x_ClubberID`) would be noise for leaders. Wave 2 Task 6 planned to log them in Task 5's `File upgrade` entry; that also breaks Task 5's own test `a current file gains no entry (TEST file)`, because the TEST file has the old `driveDirs` spelling. If Task 5 lands first, its `before` snapshot is taken **after** these normalizers (as it already is for `renameBooks`), so they never appear in `File upgrade`.
3. **History is rewritten in step, so the replay check stays true** (it can only differ at a path History touched):
   - `driveDirs`: drop every History change whose path is under `config.driveDirs.open` or `config.driveDirs.data`; normalize `o`/`n` values of a change at `['config','driveDirs']` or `['config']` with the same function. Folder choices are not club records; the anonymizer already drops all of them.
   - `x_ClubberID`: drop a change at `['roster','people',id,'v','x_ClubberID']`; strip the key from any `v` inside `o`/`n` of a change at `['roster']`, `['roster','people']`, `['roster','people',id]` or `['roster','people',id,'v']`.
   - **Entries are never removed**, even if emptied (version numbers and `tag` names are by index). An emptied entry keeps its label; `describe` of an empty list must not throw (check the History tab).
4. **Rule for `driveDirs`:** `{ club: d.club || d.data || d.open || null, slides: d.slides || null }`, the same priority the reader uses today, so no folder moves. Anything that is not an object becomes `{ club: null, slides: null }`. Extra unknown keys are dropped (only Drive code reads this object). Exported as `Season.normDriveDirs` for the tests; nothing else calls it.
5. **Idempotent:** both normalizers are no-ops on their own output; `toJson(fromJson(x))` is a fixed point after one pass.
6. **Undo, restore:** session undo only holds this session's changes (already new spelling). `Season.restoreTo` / `at` reverse-apply History, which after the rewrite never re-adds `open`, `data` or `x_ClubberID`, so a restored season is new spelling without needing Task 5 step 4. Cost: restoring to before an old-release folder choice no longer reverts that folder. Acceptable (setting, not a record); say so in DATA-FORMAT 10.
7. **Readers and writers:** `app-drive.js` `dirOf`, `sharedOf` read `club`/`slides` only; `setShared` writes `Object.assign({ club: null, slides: null }, { club: cur.club, slides: cur.slides }, { [kind]: entry })` (no `open`/`data`). Fix the stale comment at `app-drive.js:9-13` (the browser no longer remembers folders; `KEY 'awana-drive-dirs'` is unused: remove it if nothing references it). `catalog.js:86` default `{ club: null, slides: null }`.
8. **Anonymizer:** no logic change needed (its input is `Season.fromJson`, line 38). Keep `delete out.config.driveDirs` and the History filter (privacy). The `x_ClubberID` branch in `anonV` (`make-test-data.js:224`) becomes dead: keep it with a one-line comment ("fromJson strips it since R18; kept for a hand-built input"), no behaviour change. No version line in that file to bump.
9. **Older installed releases** reading a new file: any release with the one-folder change (`club` first) reads it fully; a release older than that would show "not chosen" for the folder (no data lost; the leader picks it again). Older releases never relied on `v.x_ClubberID` (`fromRoster` overwrote it). Format `VERSION` stays 5. If an older release saves again it may write `open: null, data: null` back; the next open strips them silently.
10. **TEST fixtures:** not regenerated (regeneration needs a real file and Mike). The committed TEST file is the old-spelling fixture for `driveDirs` (null case); tests build the other variants in memory.

## File Structure
| File | Change |
|---|---|
| `dev/app/season.js` | `normDriveDirs`, `upgradeLegacyKeys(s)` (data), `legacyInHistory(history)` (History); called from `fromJson`; `normDriveDirs` exported; header comment. |
| `dev/app/catalog.js` | default `driveDirs: { club: null, slides: null }` and its comment. |
| `dev/app/app-drive.js` | `dirOf`, `sharedOf`, `setShared` club/slides only; comment; unused `KEY`. |
| `dev/tools/make-test-data.js` | comment only at `anonV` (and line 266 comment if it mentions open/data). |
| `dev/app/test/legacy-spellings.test.js` | create (node). |
| `dev/app/test/drive-browser.test.js` | line 139: `assert(!('open' in dirs) && !('data' in dirs))` instead of `dirs.open === null`. |
| `dev/app/test/drive-inplace-browser.test.js` | existing test at line 172 must still pass; add the merge test (Task 2). |
| `docs/DATA-FORMAT.md` | 5.2 `x_ClubberID` row; 6 `driveDirs` row and default; 10 (restore note); 11.1 (opening order); 15 items 3 and 4 marked fixed. |
| `CHANGELOG.md` | "Next release", format line. |

---

### Task 1: Normalize on open (node)

**Files:** Create `dev/app/test/legacy-spellings.test.js`; modify `dev/app/season.js`, `dev/app/catalog.js`.

**Interfaces:**
- Produces: `Season.normDriveDirs(d) -> { club, slides }`.
- Produces: after `fromJson`, `config.driveDirs` has exactly the keys `club`, `slides`; no `roster.people[id].v` has `x_ClubberID`; no History change path is under `config.driveDirs.open|data` or ends `v.x_ClubberID`; no History `v` value holds `x_ClubberID`; `history.length` is unchanged.

- [ ] **Step 1: Failing tests** (`legacy-spellings.test.js`; TEST file loaded from `dev/test-data`, mutated in memory as a JSON object, invented ids `7000001_Test_Kid` style only; never print names):
  - `normDriveDirs`: `{open:A,data:B,slides:C}` -> `{club:B,slides:C}`; `{open:A,data:null,slides:null}` -> `{club:A,slides:null}`; `{club:X,open:A,data:B}` -> `{club:X,slides:null}`; `{data:null,open:null,slides:null}` -> `{club:null,slides:null}`; `null`, `'x'`, `[]` -> both null; applied twice equals once.
  - `the TEST file opens with one spelling`: `Object.keys(fromJson(text).config.driveDirs).sort()` is `['club','slides']`.
  - `x_ClubberID leaves v on open and nothing else changes`: copy the TEST file, put `v.x_ClubberID = id` on two people (one with a value that differs from the key); after `fromJson`, no `v` has it and `Season.diff(snapshot(fromJson(original)), snapshot(fromJson(mutated)))` is `[]`.
  - `History is rewritten in step and keeps its length`: append to the mutated file three hand-built entries (a whole person added with `n.v.x_ClubberID`; a lone `['roster','people',id,'v','x_ClubberID']` removal; a `['config','driveDirs','data']` change to `{id:'PD',...}` with `config.driveDirs` set to match). After `fromJson`: same `history.length`, the lone-change entry has `changes: []`, `Validate.validate(Season.toJson(s), <TEST name>)` has no `/differs from what the history says/`.
  - `idempotent`: `t1 = toJson(fromJson(text))`, `toJson(fromJson(t1)) === t1`, for the TEST file and the mutated one.
  - `opening adds no History entry`: `fromJson(mutated).history.length === raw history length`.
  - `restore lands in the new spelling`: `Season.restoreTo(fromJson(mutated), 1).season` has a two-key `driveDirs` and no `v.x_ClubberID`.
  Run `node test/legacy-spellings.test.js`. Expected: FAIL, except `idempotent` and `opening adds no History entry`, which pass today and are guards (guard each `Season.normDriveDirs` call so a missing export is a FAIL, not a crash).
- [ ] **Step 2: Implement** per Decisions 1 to 5 in `season.js`; `catalog.js` default. Keep it next to `renameBooks`/`renameInHistory`; short comments that say why (one spelling for every reader and every merge side; History rewritten so the replay check stays true).
- [ ] **Step 3: Run** from `dev/app`: `node test/legacy-spellings.test.js && node test/season.test.js && node test/datamerge.test.js && node test/merge.test.js && node test/validate.test.js && node test/options.test.js && node test/anonymized-data.test.js && node test/anonymizer-atomic.test.js`. Expected: PASS. If `season.test.js` or a merge test compared raw text with `toJson(fromJson(text))` for the TEST file, it now differs once (the `driveDirs` respelling): fix the test's expectation, not the code, and say so in the commit.
- [ ] **Step 4: Commit.** Bump `season.js`, `catalog.js`.

### Task 2: Readers, writers and the merge (browser)

**Files:** Modify `dev/app/app-drive.js`, `dev/app/test/drive-browser.test.js`, `dev/app/test/drive-inplace-browser.test.js`.

- [ ] **Step 1: Failing tests** in `drive-inplace-browser.test.js` (reuse `fresh`, `session`, `ORIG`, `openF`, `save`):
  - `an older file on Drive (old folder names, x_ClubberID in v) saved in place after another device saved it merges with nothing to review`: F1 = `ORIG` with `driveDirs {open:PO,data:PD,slides:null}` and `v.x_ClubberID` on two people. Open F1, make one attendance edit; put a second revision on Drive built from the same old-spelling text with a different attendance edit (as an older release would save it); press Save. Assert: the merge screen, if shown, lists no row whose path contains `driveDirs` or `x_ClubberID` and no conflicts; Drive's final text has `driveDirs` keys `club,slides` with `club.id === 'PD'`, no `x_ClubberID` in any `v`, both attendance edits.
  - Same with the automatic save (`merge3` path): no entry in the "clashed" list.
  Run. Expected: the first FAILS today (Review rows for `x_ClubberID`; record the count, not names). If it passes, record why in the commit and keep it as a guard.
- [ ] **Step 2: Implement** Decision 7. `drive-browser.test.js:139`: the old keys are absent, not null.
- [ ] **Step 3: Run** from `dev/app`: `NODE_PATH=/tmp/claude-1000/shim/node_modules node test/drive-inplace-browser.test.js`, then `drive-browser`, `merge-files-browser`, `save-style-browser`. The existing `an older data file that kept separate "open from" and "data files" folders gets one club folder: the data folder` must still pass unchanged. Expected: PASS.
- [ ] **Step 4: Commit.** Bump `app-drive.js`.

### Task 3: Docs, anonymizer comment, CHANGELOG, sweep

- [ ] **Step 1:** `make-test-data.js` comment (Decision 8). Run `node test/anonymized-data.test.js` (it asserts `v.x_ClubberID` is absent or equals the id: still true). Add one assertion there: the anonymized output's `config` has no `driveDirs` and no `v` holds `x_ClubberID`.
- [ ] **Step 2: DATA-FORMAT.** 5.2: `x_ClubberID` row "not stored; an older file's copy is removed on open (with its History values)". 6: `driveDirs` row: object `{ club, slides }`, default both `null`, "older `open`/`data` are folded into `club` on open (`club`, else `data`, else `open`)". 10: restore does not bring back old folder keys. 11.1: the two normalizers in the opening order. 15: items 3 and 4 marked "fixed (R18)". Run `node test/data-format-doc.test.js` (it collects every `config.<key>` used in the code: confirm no `driveDirs` sub-key is needed in the config table). Expected: PASS.
- [ ] **Step 3: CHANGELOG** "Next release": "Data file: Drive folder settings are saved as `club`/`slides` only (older `open`/`data` are folded in on open); a person's record no longer carries a copy of its own id. Older files open unchanged in meaning; nothing to do."
- [ ] **Step 4: Full sweep** from the repo root: `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh`. Expected: no failures beyond the known baseline (see the app-test-setup memory note).
- [ ] **Step 5:** Release bump only if R18 ships alone: `app-version` next free `1.51.x`, `app-build` the day. `sh make-deploy.sh` runs clean (no STOP); do not rsync. **Commit.** BACKLOG R18 "done in dev".

## Review Focus
1. A file opened, not edited, is not marked unsaved and auto-save does not fire (the migration is in `fromJson`, before `setSeason`'s snapshot).
2. Drive `lineage()` still matches: it compares raw texts (`src.text === k.text`), which R18 does not touch.
3. `DataMerge` finds the same shared History entry on both sides (both rewritten the same way; entries kept, not dropped).
4. An emptied History entry renders in the History tab and in Compare without errors.
5. Nothing outside `season.js` still names `driveDirs.open`/`.data` (`grep -n "driveDirs" dev/app/*.js`).

## Open questions for Mike
1. **Silent or visible?** Recommended: silent (respelling only, no meaning change). Alternative: one visible `File upgrade` entry, as wave 2 Task 6 planned; costs a History line on nearly every existing file and conflicts with Task 5's "current file gains no entry" test.
2. **Restore and old folder choices:** after R18, restoring to a version before a folder was chosen by an old release keeps the current folder. OK?
3. **Order in Wave 2a:** this plan no longer depends on Task 5 (R20). Ship R18 before it (smaller, removes one R20 Cause C shape) or keep the roadmap order?
4. **Regenerate the TEST file** next time the anonymizer is run on a real file, so the fixture is new-spelling too? (Then `legacy-spellings.test.js` builds the old-spelling `driveDirs` case in memory instead of relying on the fixture.)

## Risks
- **History rewrite on open** changes History text at the next save. It follows the `renameInHistory` precedent, keeps entry count and order, and only touches the two legacy paths; tests pin both.
- **Emptied entries** (an old History entry that only touched `x_ClubberID` or `driveDirs.open/data`) appear as an entry with no changes. Low count expected; Review Focus 4.
- **Mixed releases:** a phone still on an older release saving the same Drive file may write `open: null, data: null` back. Harmless: stripped on the next open, never a merge conflict because every reader of the file in the new release strips first.
- **Wave 2 Task 6 test "a file with neither is unchanged byte for byte (TEST file)" was wrong:** the TEST file has the old `driveDirs` spelling, so its first round trip changes. Replaced by the idempotence test.
