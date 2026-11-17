# R14: dead code, then save/undo/History out of `app-season.js` (Implementation Plan)

> **ADDED (Mike, 2026-11-13), do as Task 0, before the dead-code list below:** remove the shelved **photo / progress-patch import**: `Season.planProgressPatch` and `Season.applyProgressPlan` (`season.js`, about lines 976-1030), the patch dialog in `app-season.js` (about lines 1050-1080) and its button/menu entry and manual text, `test/progress-patch.test.js`, the patch parts of `awards-lifecycle`/`given-nodate`/other tests that call it, `docs/agents/progress-sheet-photo-agent.md`, and the BACKLOG "Photo-to-progress agent" note (mark REMOVED). Also remove the `Season.givenOf` export (R21 D3). Method: grep for every caller first (code, tests, index.html, docs); full sweep green before and after; bump the version line of each changed `.js`; CHANGELOG "Removed: the photo/progress-patch import (shelved 2026-11-05, dropped 2026-11-13)". If the progress-patch import wrote anything to the data file that a format section describes, update `docs/DATA-FORMAT.md` and `test/data-format-doc.test.js` too.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the leftovers BACKLOG R14 names (where they really are dead), then move the data-file state, drafts, undo/redo, save and the History tab out of `dev/app/app-season.js` into two new files, with **no change in behaviour**.

**Architecture:** Part A (dead code) is tiny and can ship with any release. Part B (the split) is a pure move behind a narrow seam object `App.file`; it starts only after Wave 2 is released (Wave 2 Tasks 5, 8, 9, 11 edit `syncData`, `saveNow`, `markEdit`, `touchSeason` and the restore handler, which are exactly the lines that move) and only after Mike says go. This file refines Part B/C of `2026-11-13-wave4-docs-and-structure.md`; where they differ, this file wins.

**Tech Stack:** vanilla JS IIFE modules on `window.App`, Node 24 tests, Playwright (Chromium) browser tests. No new dependencies.

**Spec:** BACKLOG "Review 2026-11-12" R14; `dev/REVIEW-2026-11-12-whole-project.md` item 14; roadmap `2026-11-12-review-fixes-roadmap.md` decision 4.

All line numbers are from 2026-11-13 (`app-season.js` 1.87.1, 1,205 lines, `app-drive.js` 1.17.0). **They will move in Wave 2**; Task B1 re-derives them.

## Global Constraints
- Edit with the Edit/Write tools; no `sed -i` or file-writing `node -e`. Tests may run anything.
- Never open real data (`archive/`, `~/Downloads`, `~/Nextcloud`, `dev/*.json`, `dev/*.csv`, `reports/`, `research_notes/`). Tests use `dev/test-data` and invented ids.
- Each changed `.js`/`.html` bumps its own line-1 version (`make-deploy.sh` stops with "changed but the version number was not bumped" otherwise). A new file gets a line 1 of the form `(this.AwanaVersions = this.AwanaVersions || {})['app-save.js'] = '1.0.0';`. The release (`app-version`, `app-build` in `index.html`) is bumped once per release, in the release task.
- `make-deploy.sh` finds scripts with the shell glob `dev/app/*.js` (minify loop, bump guard, service-worker SHELL): a new file is picked up with no script change; a file new to `deploy/` counts as "changed".
- Do not deploy. Mike says "deploy".
- Commit messages end with the two attribution lines given in the session.

## Run commands
All from `dev/app` unless noted.
- One node test: `node test/<name>.test.js`
- One browser test: `NODE_PATH=/tmp/claude-1000/shim/node_modules node test/<name>-browser.test.js`
- Full sweep (from repo root): `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh` (4 at a time; prints a summary; non-zero on any FAIL). Known baseline failures are in memory note "App test setup"; record the baseline summary before you start and compare against it, not against "zero".
- Release check (repo root): `sh make-deploy.sh`.

---

## What the review claimed, checked (grep over `dev/app` code, `dev/app/test`, `dev/tools`, `index.html`, `deploy/app`)

| Claim | Verdict | Evidence |
|---|---|---|
| `dueFor` (`app-season.js:420`) "is not called anywhere in the app" | **True for the app, false for the tests.** It is exported as `App.dueFor` (`:1194`, `dueFor: (p, g, d) => dueFor(p, g, d)`) and `test/awards-badge-browser.test.js:42` calls `A.dueFor(p, 'Sparks', '2026-12-31')` to prove Flight 3:16 is "still earned (so still on the give list)". Removing it breaks that test. | `grep -rn dueFor dev` |
| `ui.attHold` (`:9`) "is a try/catch that always returns false" | **Half right.** Only the *initializer* is dead: `attHold: (() => { try { return false;} catch (e) { return false; } })()`. `ui.attHold` itself is live: read by `holdAttendance` (`:35`), the `#attHold` checkbox (`:371-374`), tested by `leftovers-browser.test.js:256` and `info-browser.test.js:36`. | |
| `loadDirs` and `KEY` in `app-drive.js:13-14` are leftovers | **True**, and wider: `st.dirs` (`:20`) is only ever written (`:86`, `:193`), never read. The folders live in `config.driveDirs` via `setShared`. The string `'awana-drive-dirs'` must stay in `app.js:11` (the one-time localStorage cleanup) and in `drive-browser.test.js:125`; the `'KEY'` in `drive.test.js:9` is an unrelated fake API key. | `grep -rn "loadDirs\|st\.dirs\|\bKEY\b" dev` |
| (not in the review) | `App.canUndo` (`:169`) is used by nothing in code or tests. Candidate for removal; listed as an open question rather than removed silently. | `grep -rn canUndo dev` |
| Wave 4 outline Task 3 test "no `localStorage` in any `dev/app/*.js`" | **Would fail today**: `app.js:11` (removal of retired keys) and `app-tools.js` use it on purpose. Narrow it to `app-drive.js`. | `grep -c localStorage dev/app/*.js` |
| Wave 4 outline seam ("`app-season.js` reads `App.file.season`") | **Too many edits for a "move"**: `season` is read 181 times in the tab range and 18 times in History. This plan mirrors it instead (see "The seam"). The outline also misses the **progress-patch import** (`:1075-1078`), which writes `snap`, `undo`, `redo`, `UNDO_MAX` and calls `updateUndo` directly. | counts by regex over the ranges |

---

## Part A: dead code (any time; no gate beyond Mike's normal OK)

### Task A1: Remove what nothing uses

**Files:**
- Modify: `dev/app/app-season.js` (`:9` initializer, `:420-426` `dueFor`, `:1194` its property), `dev/app/app-drive.js` (`:13-14`, `:20`, `:86`, `:193`), `dev/app/test/awards-badge-browser.test.js` (`:42` only, see decision)
- Create: `dev/app/test/dead-code.test.js` (node, reads source text)

**Decision on `dueFor` (recommended):** remove it and rewrite the one assertion in `awards-badge-browser.test.js:42` to ask the same question of the same data through the pure layer, `Season.suggestedAwards(App.season, id, 'Sparks')`, which is what `dueFor` used for non-jewel awards (Flight 3:16 is a suggested award, not a Blue Jewel). Before relying on it, run the old and new expressions side by side once in the test (both must be true on the TEST file), then drop the old one. Alternative if Mike prefers zero test edits: keep `dueFor` and its export, document it as a test hook, and only remove the other leftovers.

- [ ] **Step 1: Prove it again.** From repo root: `grep -rn "dueFor" dev --include=*.js --include=*.html` (expect `app-season.js:420`, `:1194`, `awards-badge-browser.test.js:42`); `grep -rn "loadDirs\|st\.dirs\|\bKEY\b" dev/app/*.js` (expect only `app-drive.js:13,14,20,86,193`); `grep -rn "attHold" dev/app` (expect `app-season.js:9,35,371,372,374`, `index.html`, two tests). Anything else: stop and report.
- [ ] **Step 2: Failing test** `dead-code.test.js`: `app-season.js defines no dueFor and exports none`; `attHold starts as a plain false` (source matches `attHold: false` and not `attHold: (()`); `app-drive.js has no KEY, loadDirs or st.dirs` (no `/\bKEY\b|loadDirs|\bdirs:|st\.dirs/`); `app-drive.js does not touch localStorage`. Run: first three FAIL, fourth PASS.
- [ ] **Step 3: Remove.** `dueFor` and its `App` property; the IIFE initializer becomes `attHold: false`; in `app-drive.js` the `KEY` name (keep `KINDS` on that line), `loadDirs`, `dirs: loadDirs(),` in `st`, and the two `st.dirs[...] = ...;` statements (keep the `setShared(...)` calls on the same lines). Edit the one test assertion per the decision.
- [ ] **Step 4: Run** `node test/dead-code.test.js`, then the browser tests `awards-badge`, `drive-inplace`, `drive`, `attend-steps`, `attend-person`, `leftovers`, `info`. Expected PASS.
- [ ] **Step 5: Commit.** Bump `app-season.js` and `app-drive.js` (patch). Release with the next Wave 4 release (`app-version`/`app-build` once, CHANGELOG "no behaviour change: unused code removed", BACKLOG R14 "dead code removed; split planned").

---

## Part B: the split (gated)

**Gate (all must hold):** Wave 2 releases 2a, 2b and 2c committed and deployed; Part A done; the sweep green against the recorded baseline; Mike has said "go" to the split.

### Target shape

| File | Holds | Loads |
|---|---|---|
| `app-save.js` (new) | today's `app-season.js:16-246`: data-file state (`copy`, `syncData`, `rebase`, `setSeason`, `App.mergeIn`, `adopt`), drafts (`DRAFT_TABS`, `forced`, `draftTab`, `draftBaseDirty`, `stagedTab`, `staging`, `draftChanges`, `App.commitScope`, `applyDraft`, `discardDraft`, `resolveDraft`), the changes bar (`pcHidden`, `pcCount`, `App.pcNeedHidden`, `pcNeed`, `drawDraftBar`, `App.drawDraftBar`, `App.isDraftView`, the document click handler `:92-98`), `touchSeason`, undo/redo (`undo`, `redo`, `UNDO_MAX`, `nameOf`, `say`, `updateUndo`, `undoStep`, the two button handlers, the Ctrl+Z/Y keydown), the status line and nudge (`NUDGE_*`, `savedAt`, `unsavedSince`, `edits`, `hhmm`, `overdue`, `status`, `markEdit`, `markSaved`, the 30 s interval), the public `App.dirty/changed/canUndo/rebase/season`, `dateFixDialog`, `openingText`, `App.openSeason`, `openParsed`, `App.saveNow`, the `#btnSeasonSave` handler, `App.snapshotJson`, `App.draftPending`, plus whatever Wave 2 added beside them (`App.editSeq`, the R11 saved-only-on-success logic). | right after `app.js`, before `app-season.js` |
| `app-history.js` (new) | today's `:1085-1189`: `fmtTime`, `AREAS`, `MARK`, `dayOf`, `dayLabel`, `clock`, `timeLabel`, `versionLabel`, `nightCounts`, `renderHistory`, `hTag` + handlers, `RESTORE_PHRASE`, `askRestorePhrase`, the `#hRestore` handler (as Wave 2 Task 5 left it), `hStep` + handlers; sets `App.tabs.history`. | right after `app-season.js` |
| `app-season.js` (stays) | header consts, `startPanel`/`ready` (`:247-253`, tab UI, stays), shared pickers, Attendance (incl. the `#attHold` checkbox and the **New season** handler `:379-385`, which stays to keep document-listener order), Games, Awards, handbook box, Progress/sheet, progress-patch import, the `Object.assign(App, {...})` block, `App.tabs` for attend/games/awards, `App.onRefresh`, the final `status()` call (now `F.status()`). | unchanged position |

Expected sizes: `app-season.js` about 860 lines, `app-save.js` about 235, `app-history.js` about 110.

### The seam (one object, `App.file`, published by `app-save.js`)

Principle: **moved text is byte-identical except at the seam**. Each seam crossing is listed; anything not listed found during the move is a stop-and-amend.

| Today (closure name) | Who uses it across the boundary | After |
|---|---|---|
| `season` (read 181x in tabs, 18x in History, 6x in tail) | season, history | Each of the two files keeps `let season = null;` and registers `App.file.onSeason(s => { season = s; })`. `app-save.js` calls the listeners **at the same point** it sets `App.season = s` inside `setSeason` and `adopt` (before `App.loadData`/`App.refresh`, so tab renderers see the new season exactly as today). Zero edits to the 205 read sites. |
| `touchSeason` (34x tabs, 1x History, 4x tail) | season, history | one line in each file: `const touchSeason = () => App.changed();` (`App.changed` is already `touchSeason`). |
| `dirty` (`:382`) | season | `App.dirty()` (exists). |
| `setSeason`, `markEdit`, `status` (`:384`, `:1078`, `:1184`, `:1204`) | season, history | `F.setSeason`, `F.markEdit`, `F.status` with `const F = App.file`. |
| `syncData` (`:1053`, `:1075`) | season | `F.sync()` |
| `snap`, `undo`, `redo`, `UNDO_MAX`, `updateUndo` (progress-patch import `:1077-1078`) | season | `F.pushUndo(changes)` = the exact statement sequence of `:1077` (`snap = Season.snapshot(season); undo.push(...); if (undo.length > UNDO_MAX) undo.shift(); redo.length = 0;`) and `F.updateUndo()`. The rest of `:1078` stays inline. |
| `resolveDraft`, `drawDraftBar` (`:373`, `:375`) | season | `App.resolveDraft()`, `App.drawDraftBar()` (exist). |
| `ui.attHold` read by `holdAttendance` (`:35`) | save reads season's `ui` | `app-save.js`: `const holdAttendance = () => App.holdAttendance() && !(...matchMedia...)`; `App.holdAttendance` defaults to `() => false` in `app-save.js`, and `app-season.js` sets `App.holdAttendance = () => ui.attHold;` next to its `ui` declaration. |
| `ui.givenWarn` + `redrawSheet` in `markSaved` (`:164`) | save reaches into season | `app-save.js` keeps an `onSaved` list and `markSaved` runs it at the same point; `app-season.js` registers `F.onSaved(() => { if (ui.givenWarn && Object.keys(ui.givenWarn).length) { ui.givenWarn = {}; redrawSheet(); } })`. The `typeof redrawSheet` guard becomes unnecessary (it is defined by then). |
| `ready` (`:1111`), `nameOf` (`:1127`, `:1139`) | history | `ready` stays in `app-season.js` (tab UI), which publishes it as `App.seasonReady = ready`; History calls `App.seasonReady(el)`. `nameOf` comes from `app-save.js` as `F.nameOf`. (`App.file` is owned by `app-save.js` only; tab files never add members to it.) |
| `ui.hFrom/hTo/hLatest` | history only | a local `const ui = { hFrom: null, hTo: 0, hLatest: true };` in `app-history.js`; removed from season's `ui`. Verify by grep that no other line reads `ui.h`. |
| `MD`, `idOf`, `esc`, `$`, `X` | history, save | each file declares its own copies in its header (they are pure one-liners). |
| `lastEntered`, `pcHidden` | one side only | no seam. |

`App.file` members: `onSeason(fn)`, `setSeason(s, opts)`, `markEdit()`, `status()`, `sync()`, `pushUndo(changes)`, `updateUndo()`, `onSaved(fn)`, `nameOf(id)`; plus whatever Wave 2 forces (re-derived in B1). New globals: `App.file`, `App.holdAttendance`, `App.seasonReady`. All existing public names keep their names and meaning (`App.season`, `App.dirty`, `App.changed`, `App.canUndo`, `App.rebase`, `App.commitScope`, `App.resolveDraft`, `App.mergeIn`, `App.openSeason`, `App.saveNow`, `App.snapshotJson`, `App.draftPending`, `App.drawDraftBar`, `App.isDraftView`, `App.pcNeedHidden`, `App.seasonSource`).

**Go/no-go on the seam:** if B1 finds more than **15** seam rows (today: 13) or any seam crossing that would need a statement reordered, stop and offer Mike the narrow option: History only (Task B3 without B2).

### Load-order and listener rules (why "no behaviour change" holds)
- `app-save.js` loads immediately before `app-season.js` and contains only code that was **above** line 247 in `app-season.js`, so every `document` listener it registers keeps its order relative to every other listener on the page. Same for `app-history.js` loading immediately after (its listeners are on `#h...` elements only).
- The New season handler stays in `app-season.js` for the same reason.
- At load, `app-save.js` must not call `status()`: today the first `status()` runs at the end of `app-season.js` (`:1204`); keep it there as `F.status()`. Nothing else in `:16-246` runs DOM work at load except `addEventListener` on elements that exist in `index.html` and `setInterval`.
- `App.tabs.history` is assigned later than today (in the next file), but before any user action; `App.onRefresh` (`:1203`) looks it up at call time.

### Task B1: Re-inventory and baseline (no code change)

**Files:** Create `dev/app/test/app-surface-browser.test.js`.
- [ ] **Step 1:** Re-find the ranges after Wave 2 (`grep -n "// ----------" dev/app/app-season.js`). Re-run the cross-boundary scan: for every name in the seam table and every function defined in the two moving ranges, list the lines that use it outside its range (a short throwaway script in the scratchpad, not committed). Amend the seam table in this file if it differs.
- [ ] **Step 2:** Record outside-user counts: `grep -o "App\.\(season\|dirty\|changed\|rebase\|commitScope\|resolveDraft\|saveNow\|openSeason\|mergeIn\|snapshotJson\|draftPending\|canUndo\|drawDraftBar\|isDraftView\|pcNeedHidden\|seasonSource\|editSeq\)\b" dev/app/*.js dev/app/test/*.js | sort | uniq -c` (2026-11-13, outside `app-season.js`: `season` 239 app/412 test, `dirty` 12/16, `changed` 12/30, `commitScope` 14/29, `isDraftView` 0/4, `drawDraftBar` 2/1, the rest app-only). These counts must be identical after the split.
- [ ] **Step 3:** Write `app-surface-browser.test.js`: open the TEST data file, then assert the sorted `Object.keys(window.App)` and `Object.keys(App.tabs)` equal a saved list. It PASSes today; after B2/B3 the only allowed diff is the added `file`, `holdAttendance`, `seasonReady`.
- [ ] **Step 4:** Run the full sweep; paste its summary lines into the commit message as the baseline.
- [ ] **Step 5:** Commit (test only).

### Task B2: Move save, drafts and undo into `app-save.js`

**Files:** Create `dev/app/app-save.js`; modify `dev/app/app-season.js`, `dev/app/index.html` (one `<script src="app-save.js"></script>` after `app.js`), `dev/app/test/versions.test.js` (add load-order pairs `['app-save.js', 'app.js']`, `['app-season.js', 'app-save.js']`, `['app-merge.js', 'app-save.js']`, `['app-drive.js', 'app-save.js']`), `dev/app/test/app-surface-browser.test.js` (add `file`, `holdAttendance`), `README.md` (the `drawDraftBar in app-season.js` sentence and the file list); create `dev/app/test/app-split.test.js`.

- [ ] **Step 1: Failing test** `app-split.test.js` (node, source text): `app-save.js` exists, has a version line, loads after `app.js` and before `app-season.js`; `app-season.js` no longer defines `syncData`, `touchSeason(` as a function, `undoStep`, `markSaved`, `saveNow`, `openSeason`, `dateFixDialog`; the only assignments `season =` in `app-season.js` are inside the `onSeason` callback; `App.season =` is assigned only in `app-save.js`. Run: FAIL.
- [ ] **Step 2: Move** the range by cut and paste into `(function () { ... })();` with its own header (`const App = window.App, esc = App.esc, $ = id => ...; const { X } = Model;` as the original). Apply only the seam rows above. Do not reorder statements. Do not reformat lines (the diff of moved lines, after the seam edits, must be pure deletions/additions: check with `git diff --stat` plus `git diff -M --color-moved=plain` and read only the non-moved hunks).
- [ ] **Step 3: Run** `node test/app-split.test.js && node test/versions.test.js`, then the tests most likely to catch a slip (below), then the full sweep. Expected: baseline summary exactly; `app-surface` diff only the new names.
- [ ] **Step 4: Commit.** Bump `app-season.js` (minor); `app-save.js` starts at `1.0.0`. `index.html`'s version is `app-version`, which `make-deploy.sh` checks; it is bumped once in B4, not here (tests are not versioned).

### Task B3: Move History into `app-history.js`

**Files:** Create `dev/app/app-history.js`; modify `dev/app/app-season.js`, `index.html` (script line right after `app-season.js`), `versions.test.js` (`['app-history.js', 'app-season.js']`), `app-split.test.js`, `app-surface-browser.test.js` (add `seasonReady`), `README.md`; `test/browser.test.js:13` comment names `app-season.js, RESTORE_PHRASE` (update the comment only).
- [ ] **Step 1: Failing tests** in `app-split.test.js`: `app-history.js` exists, versioned, loads after `app-season.js`, sets `App.tabs.history`; `app-season.js` has no `renderHistory`, `RESTORE_PHRASE`, `ui.h`. FAIL.
- [ ] **Step 2: Move** with the same rules; `onSeason` mirror, local `ui`, `F.setSeason/markEdit/status`, `App.seasonReady`, `F.nameOf`.
- [ ] **Step 3: Run** as B2 step 3. Expected: baseline.
- [ ] **Step 4: Commit.** Bump `app-season.js`; `app-history.js` at `1.0.0`.

### Task B4: Release
- [ ] Bump `app-version`/`app-build` once.
- [ ] Full sweep, then on their own: `NODE_PATH=/tmp/claude-1000/shim/node_modules node test/service-worker-browser.test.js`, `node test/make-deploy.test.js`, `node test/deploy-stamp.test.js`.
- [ ] `sh make-deploy.sh` (repo root) runs clean; check `deploy/app/sw.js` SHELL lists `app-save.js` and `app-history.js` and `deploy/app/` has both minified.
- [ ] CHANGELOG ("no behaviour change: save, undo and History moved to their own files"), BACKLOG R14 done, report line counts before/after.
- [ ] **Mike, by hand, before "deploy":** on the TEST club in a real browser: open a file (one with a bad date, to see the date-fix dialog), take attendance live and held (Apply, Discard), undo and redo with buttons and Ctrl+Z/Y, save (dot clears, status line), import a progress patch then undo it, name a version and restore one in History, start a new season. Then update a phone running the previous release and confirm Update now reaches the new one.

### Tests most likely to catch a slip
- Undo/redo and the stack: `browser.test.js`, `held.test.js`/`leftovers-browser.test.js` (drafts, `isDraftView`, held attendance), `progress-patch-browser.test.js` (the `pushUndo` seam), `awards-recalc-browser`, `flags-browser`.
- Drafts and the changes bar: `pcneed-bar-browser`, `attend-steps-browser`, `attend-person-browser`, `teamgrid-browser`, `book-todo-browser`.
- Save and status: `save-dot-browser`, `header-browser`, `given-early-warning-browser` (the `onSaved` seam), `update-autosave-browser` (`snapshotJson`, `draftPending`, auto-save), `drive-inplace-browser`, `drive-browser`, `import-button-browser`, `fresh-start-browser` (`ready`/`startPanel`, `adopt`).
- Open/merge/History: `merge-files-browser`, `past-years-browser`, `date-fixes-browser`/`date-year-default-browser`, `more-tabs-browser`, `trail-browser`, and any browser test Wave 2 adds for restore/replay (e.g. a `validate-reconcile-browser`, which does not exist yet on 2026-11-13).
- Structure: `versions.test.js`, `app-split.test.js`, `app-surface-browser.test.js`, `service-worker-browser.test.js`, `make-deploy.test.js`.

### Refactor method: proving "no behaviour change"
1. Full sweep green (against the recorded baseline) **before** each move commit and **after** it; same pass counts per file.
2. No existing test is edited except: load-order pairs in `versions.test.js`, the added names in the new surface test, and one comment in `browser.test.js`. A test that fails after the move means the move is wrong, never the test.
3. Moved lines differ only at seam rows (checked with `git diff --color-moved`).
4. Outside-user counts (B1 step 2) identical.
5. The by-hand pass in B4.

### Go / no-go
- **Go to B2** only when the Gate holds and B1's seam has at most 15 rows with no reordering.
- **Stop B2/B3** (revert the working tree, report) if any test outside the structure tests changes result, or a seam crossing appears that is not in the table.
- **No-go to release** unless the sweep matches the baseline, `make-deploy.sh` is clean, and Mike's by-hand pass is done.
- If B2 is no-go but B3 is clean, ship History alone (it has the fewest seam rows).

## Risks
- **Mirror drift:** a future edit that assigns `season` in one file without going through `setSeason`/`adopt`. Mitigation: the `app-split.test.js` assignment check.
- **Wave 2 adds new cross-boundary reads** (e.g. `editSeq` read from the progress-patch import or from tabs). B1 catches them; they become seam rows.
- **Timing of the `onSeason` callbacks:** if fired after `App.loadData` instead of at the `App.season = s` line, `App.refresh()` would render with the old season. The browser sweep catches this (every tab test opens a file).
- **Listener order** if someone moves the New season handler or `:92-98` click handler out of order. Rule above.
- **Minifier:** `dev/tools/minify.js` sees two new files; `make-deploy.test.js` and the B4 check of `deploy/app` cover it.
- **Phones on the previous release:** new files must be in SHELL or an offline start breaks; B4's sw check covers it.

## Open questions for Mike
1. `dueFor`: remove it and change one assertion in `awards-badge-browser.test.js` (recommended), or keep it as a test hook?
2. `App.canUndo` is unused by code and tests: remove in Part A too?
3. File names: `app-save.js` and `app-history.js` OK, or `app-file.js` for the first?
4. Is the split worth doing at all once Wave 2 is in? It buys a smaller file for future save/undo fixes (R1, R7 territory) at the cost of one seam object and two more scripts; the narrow alternative is History only.
5. Ship Part A with the Wave 4 docs release (as the Wave 4 outline says), or on its own?

## Self-review
- Dead-code claims re-checked by grep: `dueFor` (test use found), `ui.attHold` (initializer only), `loadDirs`/`KEY`/`st.dirs` (true), outline's localStorage test (wrong, narrowed), `canUndo` (new).
- Every seam row names its replacement; `App.file` members are listed once and used in B2/B3.
- Line numbers are pre-Wave-2; B1 re-derives them and this file is amended before B2.
