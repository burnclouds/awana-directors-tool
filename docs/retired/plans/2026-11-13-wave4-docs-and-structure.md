# Wave 4: docs and structure (R13, R19, R14; R9 skipped) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The documents say what the code does, dead code is gone, and save, undo and History live in their own files instead of inside the 1,205-line `app-season.js`.

**Architecture:** Part A (docs, R13 and R19) and Part B (dead code, R14 first half) change no behavior and can ship at any time. Part C (the split, R14 second half) is a move of code with no behavior change; it starts **only after Wave 2 is released**, because Wave 2 Tasks 5, 8 and 9 edit the very functions that move.

**Tech Stack:** Vanilla JS (plain `<script>` files in a fixed order, shared through `window.App`), Node 24 and Playwright 1.64 for tests.

**Spec:** BACKLOG R13, R14, R19; `dev/REVIEW-2026-11-12-whole-project.md` recommendations 13 and 14; roadmap decisions 3 (R9) and 4 (R14).

**R9 (crash safety) is skipped by decision.** No browser-storage draft is built. The unsaved state is made louder in Wave 3 (Tasks 2 and 3 there). Nothing in this plan implements R9.

## Global Constraints
- Use the Edit and Write tools to change files. Tests may run anything.
- Never open a real data file; no real name in any document. After editing documents by hand, Mike runs `node dev/tools/check-docs-for-names.js <real data file kept outside the repo>` (BACKLOG R5 rule).
- Tests run from `dev/app`; browser tests need `NODE_PATH=/tmp/claude-1000/shim/node_modules`; the sweep is `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh`.
- Every changed `.js` or `.html` file bumps its own version line, **including a comment-only change** (`make-deploy.sh` compares the files). `app-version`/`app-build` are bumped once per release.
- The manual's "Which option when" part of `index.html` (between `guide:start` and `guide:end`) is generated: edit `info.js`, then run `node dev/tools/sync-guide.js`; `test/info.test.js` fails when they differ.
- Do not deploy; Mike says "deploy". Commit messages end with the two attribution lines given in the session.

## What the review got right and wrong (checked 2026-11-13)
| Claim | Verdict |
|---|---|
| README header says 1.50.28 | **No longer true.** The README has no version in its header and `1.50.28` appears nowhere in it. Nothing to do. |
| README line 18 says update settings live in `localStorage` | Holds (`README.md:18`). |
| 29 test files are unlisted in the README | Number is stale: there are 150 `*.test.js` files and 137 README lines that name one. Task 1 counts again. |
| BACKLOG header says 1.50.36; the `versions.test.js` note is stale | Holds (`BACKLOG.md:1`, and the "Known baseline failures" entry). |
| "Progress tab" wording in `todo.js:45`, `:51` and the manual | Holds (`todo.js:45`, `:51`; `index.html:427`, `:544`; check each in context: Progress is now a sub-tab of Person). |
| Splash "Nothing is uploaded" beside Open from Google Drive | Holds, at `index.html:717` (the review said 717; also `index.html:699` and `README.md:3`). |
| `season.js` header omits nine sections | Holds (it lists `received` and `doneBooks`; it omits `givenNoDate`, `held`, `flags` and the six newer). |
| `dueFor` is not called anywhere | Holds, with one more line to remove: it is also exposed as a property (`dueFor: (p, g, d) => dueFor(p, g, d)`, `app-season.js:1194`) that nothing reads. |
| `ui.attHold` is a try/catch that always returns false | **Half right.** Only its initial value is a pointless try/catch (`app-season.js:9`). The property is live: the Attendance "Hold changes" box sets it (`:372`) and `holdAttendance` reads it (`:35`). Only the initializer is simplified. |
| `loadDirs` and `KEY` in `app-drive.js` are leftovers | Holds, and so is `st.dirs`: it is written (`:86`, `:193`) and never read. |
| Found while planning (not in the review) | `docs/DATA-FORMAT.md` section 12 says the packed `pc` length is not checked (it is, `validate.js:65`); section 2.5 does not say that unknown keys inside `roster` are dropped; 7.5 lists the uniform pair as a tick-day pair (it is not). Wave 2 rewrites all three (its Tasks 3, 11 and 7); if Wave 4 Part A ships first, fix them here. |

## Review Focus
1. **A document edit puts a real name back.** Owner: Task 1's last step (the name check, by Mike).
2. **The split changes the order things run at page load** (listeners attached in a different order, a function used before its file has loaded). Owner: Task 5's load-order test and the whole browser sweep.
3. **A test or another file reaches into something the split renames.** Owner: Task 4's inventory, before any code moves.
4. **A phone holds old scripts and a new page during the release that adds files.** Fixed by Wave 1 (R2); Task 6 re-runs `service-worker-browser.test.js` with the new file list.
5. **The split hides a behavior change inside a "move".** Owner: Task 5's rule that the moved text is identical apart from the listed renames, and its no-new-failures gate.

## File Structure
| File | Change | Responsibility |
|---|---|---|
| `README.md`, `BACKLOG.md`, `dev/app/index.html`, `dev/app/todo.js`, `dev/app/info.js` | modify | Wording brought up to date (R13). |
| `dev/app/test/readme-tests-listed.test.js` | create | Every test file is named in the README. |
| `dev/app/season.js` | modify | Header comment points at the spec (R19). |
| `dev/app/app-season.js` | modify | Dead code out (Part B); then only the tabs: Attendance, Games, Awards, Progress (Part C). |
| `dev/app/app-drive.js` | modify | `KEY`, `loadDirs`, `st.dirs` removed. |
| `dev/app/app-save.js` | create (Part C) | The open data file: state, drafts, edits and undo, the status line, opening, saving. |
| `dev/app/app-history.js` | create (Part C) | The History tab: list, compare, name a version, restore. |

---

## Part A: documents (R13, R19)

### Task 1: The documents say what the code does (R13)

**Files:**
- Modify: `README.md`, `BACKLOG.md`, `dev/app/todo.js:45,51`, `dev/app/index.html:427,544,699,717`, `dev/app/info.js` (only if a generated note says "Progress tab")
- Create: `dev/app/test/readme-tests-listed.test.js`

**Interfaces:**
- Produces: `readme-tests-listed.test.js` (node): every file matching `dev/app/test/*.test.js` is named in `README.md`; fails listing the missing names.

- [ ] **Step 1: Failing test.** Write `readme-tests-listed.test.js`: test `every test file is named in the README` (`fs.readdirSync(testDir).filter(f => /\.test\.js$/.test(f)).filter(f => !readme.includes(f))` is `[]`). Run: `node test/readme-tests-listed.test.js`. Expected: FAIL, listing the unlisted files (about 13 to 30; the list is the work for step 2).
- [ ] **Step 2: README.** Add one line per missing test in the test section, in the style of its neighbors (what it pins, one clause). Line 18: replace "settings of the browser in `localStorage`" with "its settings are in the data file (`config.autoUpdate`, `config.autoSave`); nothing is kept in the browser". Line 3 and the test section stay otherwise.
- [ ] **Step 3: Failing wording test.** In `dev/app/test/todo.test.js` (or `test/test.js`'s To do block, whichever holds the hint texts; grep `Needs a handbook`): `the To do hints say where the box is now`: the `handbook` and `received` group hints match `/Person tab, Progress/` and do not match `/^Progress tab/`. Run. Expected: FAIL.
- [ ] **Step 4: Wording.** `todo.js:45`: "Person tab, Progress: under the book's tab, enter the date received (the handbook box is on the Person tab too). Sparks need HG, WR or SS to land in the right slide column." `todo.js:51`: "Person tab, Progress: under the book's tab, type the date received, or tick no date when nobody knows the day." `index.html:427` and `:544`: "Progress tab" becomes "Progress (on the Person tab)" where the sentence means the place; leave it where it names the report. `index.html:717`: "Open your data file to get started. Nothing leaves this browser unless you choose Google Drive; then the file is saved to your own Drive." `index.html:699`: the same idea in the manual sentence ("Everything runs in this browser tab. Nothing is uploaded unless you turn on saving to Google Drive, and the page stores nothing in this browser...").
- [ ] **Step 5: BACKLOG.** Header line: the current release and date. In "Known baseline failures" strike the `versions.test.js` line (it passes) with the date. Do not touch any entry that describes people.
- [ ] **Step 6: Run** `node test/readme-tests-listed.test.js && node test/info.test.js && node test/versions.test.js && node test/doc-examples.test.js && node test/check-docs-for-names.test.js`, and the browser files that read these texts: `fresh-start-browser`, `info-browser`, `todo-book-medical-browser`. Expected: PASS.
- [ ] **Step 7: Commit.** Bump `todo.js`, `index.html` (its own version line), `info.js` if touched.
- [ ] **Step 8 (Mike, by hand):** `node dev/tools/check-docs-for-names.js <real data file>`. Expected: exit 0.

### Task 2: The `season.js` header points at the spec (R19)

**Files:**
- Modify: `dev/app/season.js:1-25`, `dev/app/test/data-format-doc.test.js`

- [ ] **Step 1: Failing test** in `data-format-doc.test.js`: `the season.js header does not keep its own list of sections`: the first 30 lines of `season.js` contain `docs/DATA-FORMAT.md` and contain no line matching `/^\/\/\s+(attendance|games|awards|given|received|doneBooks|adults|teamMoves|handbooks|progress)\[/`. Run. Expected: FAIL.
- [ ] **Step 2: Replace the header comment** (lines 2 to 23) with: what the file is (one sentence), "The format of the data file, every section and every encoded value: `docs/DATA-FORMAT.md` (kept in step by `test/data-format-doc.test.js`)", the three rules a reader of this file needs (ids are the join key; nothing derived is stored; a section added here must be added to `SECTIONS`), and the existing privacy line. Do not move or change code.
- [ ] **Step 3: Run** `node test/data-format-doc.test.js && node test/season.test.js`. Expected: PASS.
- [ ] **Step 4: Commit.** Bump `season.js` (comment-only changes still need it).

## Part B: dead code (R14, first half)

### Task 3: Remove what nothing uses

**Files:**
- Modify: `dev/app/app-season.js:9`, `:420` (the `dueFor` function) and `:1194` (its property), `dev/app/app-drive.js:13-14,20,86,193`
- Create: `dev/app/test/dead-code.test.js`

**Interfaces:**
- Produces: nothing new. `ui.attHold` keeps its name and meaning; its initial value is `false`.

- [ ] **Step 1: Prove they are unused.** From the repo root: `grep -rn "dueFor" dev/app deploy/app --include=*.js --include=*.html` (expect only the two `app-season.js` places and their minified deploy copies); `grep -rn "awana-drive-dirs\|loadDirs\|st\.dirs\|\.dirs\[" dev/app` (expect only `app-drive.js:13,14,20,86,193`). If anything else appears, stop and report it.
- [ ] **Step 2: Failing test** `dead-code.test.js` (node, reads source text): `app-season.js has no dueFor`; `the attHold start value is a plain false` (the source has `attHold: false` and no `attHold: (()`); `app-drive.js has no KEY, loadDirs or st.dirs` (no match of `/\bKEY\b|loadDirs|\bdirs:/`); `nothing about Drive folders is read from or written to browser storage` (no `localStorage` in any `dev/app/*.js`). Run. Expected: the first three FAIL.
- [ ] **Step 3: Remove.** `dueFor` and its property; the try/catch initializer; in `app-drive.js` the `KEY` constant (keep `KINDS`), `loadDirs`, `dirs: loadDirs()` in `st`, and the two `st.dirs[...] = ...` assignments (keep the `setShared` calls beside them).
- [ ] **Step 4: Run** `node test/dead-code.test.js`, then `drive-inplace-browser`, `drive-browser`, `attend-steps-browser`, `attend-person-browser`, `awards-manager-browser`, `flags-browser`. Expected: PASS.
- [ ] **Step 5: Commit.** Bump `app-season.js`, `app-drive.js`.

### Task 3b: Release for Parts A and B
Bump `app-version`/`app-build`, run the sweep, `sh make-deploy.sh` clean, CHANGELOG, BACKLOG (R13, R19 done; R14 "dead code removed; split planned"), commit, report. No by-hand check beyond Task 1 step 8.

## Part C: save, undo and History out of `app-season.js` (R14, second half)

**Gate:** start only when Wave 2 (all three releases) is deployed and Mike has said to go ahead (roadmap decision 4). Line numbers below are from 2026-11-13 and **will have moved**; Task 4 finds them again.

**Target shape.**
- `app-save.js` (loads right after `app.js`, before `app-season.js`): what is now `app-season.js` lines 16 to 253 ("data file state", "drafts", `touchSeason`, undo and redo, the status line and nudge, `markEdit`/`markSaved`, the date-fix dialog, `App.openSeason`, `openParsed`, `App.saveNow`, `App.snapshotJson`, `App.draftPending`) plus the year rollover handler near `:384` and everything Wave 2 added beside them (`App.editSeq`, `App.pendingDiff`).
- `app-history.js` (loads after `app-season.js`): lines 1085 to about 1192 ("history": `renderHistory`, compare, name a version, restore, the before-restore download).
- `app-season.js` keeps the tabs: shared pickers, Attendance, Games, Awards, Progress, the progress-patch import.

**The seam.** Today these parts share closure variables (`season`, `dirty`, `snap`, `ui`, `undo`, `redo`, `draftTab`) and inner functions. After the split:
- `app-save.js` owns the state. It publishes, on `App.file`: `get season()`, `get dirty()`, `setSeason(s, opts)`, `adopt(s)`, `rebase()`, `markEdit()`, `status()`, `sync()` (today's `syncData`), `nameOf(id)`, `say(changes)`. The existing public names stay exactly as they are: `App.season`, `App.dirty()`, `App.changed`, `App.rebase`, `App.commitScope`, `App.resolveDraft`, `App.saveNow`, `App.openSeason`, `App.mergeIn`, `App.snapshotJson`, `App.draftPending`, `App.canUndo`, `App.drawDraftBar`, `App.isDraftView`, `App.pcNeedHidden`.
- `app-season.js` and `app-history.js` read `App.file.season` where they read the closure `season` today (a local `const F = App.file` and `F.season`), and call `F.setSeason`, `F.markEdit`, `F.status`.
- `ui` splits: the history fields (`hFrom`, `hTo`, `hLatest`) move to `app-history.js`; `attHold` and the tab fields stay in `app-season.js`; `app-save.js` needs `holdAttendance()`, which it gets as `App.holdAttendance = () => ...` set by `app-season.js` (default `() => false` until that file loads). `ui.givenWarn` is cleared by `markSaved` today: `app-season.js` registers `App.file.onSaved(fn)` instead.

### Task 4: Inventory before anything moves

**Files:**
- Create: `docs/superpowers/plans/2026-11-13-r14-split-inventory.md` (a working note; invented ids only)
- Create: `dev/app/test/app-surface.test.js`

**Interfaces:**
- Produces: `app-surface.test.js` (browser): the sorted list of `Object.keys(window.App)` and of `Object.keys(App.tabs)` after opening the TEST file equals a list saved in the test. It passes before the split and must pass, unchanged, after it (with `file` and `holdAttendance` added in Task 5, in that task).

- [ ] **Step 1: List the shared names.** For each of `season`, `dirty`, `snap`, `ui`, `undo`, `redo`, `draftTab`, `edits`, `savedAt`, `unsavedSince`, `lastEntered` and each inner function defined in the three ranges, record in the note: where it is defined, every line that reads or writes it, and which of the three files each of those lines will be in. A name used on both sides of a boundary is a **seam name**; every seam name must appear in "The seam" above or be added to it in the note.
- [ ] **Step 2: List outside users.** `grep -n "App\.\(season\|dirty\|changed\|rebase\|saveNow\|openSeason\|mergeIn\|commitScope\|resolveDraft\|snapshotJson\|draftPending\|canUndo\)" dev/app/*.js dev/app/test/*.js | wc -l` and the same per name; record the counts (they must be the same after the split).
- [ ] **Step 3: Write and run `app-surface.test.js`.** Expected: PASS (it records today's surface).
- [ ] **Step 4: Baseline.** Run the sweep and save its summary lines in the note. Expected: no failures.
- [ ] **Step 5: Commit** the note and the test. **Stop and show Mike the seam list if it has more than 15 names**: that means the parts are more tangled than this plan assumes, and the split should be narrowed to History only (Task 5b alone).

### Task 5: Move save and undo to `app-save.js`

**Files:**
- Create: `dev/app/app-save.js`
- Modify: `dev/app/app-season.js`, `dev/app/index.html` (one `<script src="app-save.js">` line after `app.js`), `README.md` (file list), `dev/app/test/versions.test.js` only if it lists files by hand, `dev/app/test/app-surface.test.js`

**Interfaces:**
- Consumes: Task 4's inventory.
- Produces: `App.file` as in "The seam"; `App.holdAttendance`. `app-save.js` starts at version `1.0.0`.

- [ ] **Step 1: Failing test** `dev/app/test/app-split.test.js` (node, source text): `app-save.js exists, has a version line, and is loaded after app.js and before app-season.js` (order of `<script>` tags in `index.html`); `app-season.js no longer defines touchSeason, saveNow, openSeason, markSaved or undoStep`; `app-season.js is under 1,000 lines`. Run. Expected: FAIL.
- [ ] **Step 2: Move.** Cut the ranges named in "Target shape" into `app-save.js` inside the same `(function () { ... })();` wrapper and the same first lines (`const App = window.App, esc = App.esc, $ = ...`). The moved text is unchanged except: (a) reads of a seam name owned by the other file become `App.file.x` / `App.holdAttendance()`; (b) the `ui.givenWarn` clearing in `markSaved` becomes a call to the registered `onSaved` functions. No statement is reordered within a file; listeners keep their relative order.
- [ ] **Step 3: Load order.** Anything `app-save.js` runs at load that touches an element or `App` property set up by `app-season.js` must wait: wrap only those lines in the existing end-of-load hook (`App.onRefresh` or the `DOMContentLoaded` the file already uses); list each in the commit message.
- [ ] **Step 4: Run** `node test/app-split.test.js && node test/versions.test.js`, then **every** browser test (the sweep). Expected: the same summary as Task 4's baseline, with `app-surface` updated by exactly `file` and `holdAttendance`.
- [ ] **Step 5: Commit.** Bump `app-season.js`, `index.html`.

### Task 5b: Move the History tab to `app-history.js`

**Files:**
- Create: `dev/app/app-history.js`
- Modify: `dev/app/app-season.js` (remove the range; `App.tabs.history` is now set by the new file), `dev/app/index.html` (script line after `app-season.js`), `README.md`, `dev/app/test/app-split.test.js`

- [ ] **Step 1: Failing test** (add to `app-split.test.js`): `app-history.js exists, is loaded after app-season.js, and sets App.tabs.history`; `app-season.js has no renderHistory`. Expected: FAIL.
- [ ] **Step 2: Move** the "history" range with the same rules as Task 5 step 2; `hFrom`, `hTo`, `hLatest` become a local `ui` in the new file. The restore handler calls `App.file.setSeason(...)` and `App.file.markEdit()`.
- [ ] **Step 3: Run** the sweep. Expected: the baseline summary. Look in particular at `past-years-browser`, `merge-files-browser`, `date-fixes-browser`, `browser.test.js` (History restore) and `validate-reconcile-browser` (Wave 2).
- [ ] **Step 4: Commit.** Bump `app-season.js`, `index.html`; `app-history.js` starts at `1.0.0`.

### Task 6: Release for Part C

- [ ] **Step 1:** Bump `app-version`/`app-build`.
- [ ] **Step 2:** The sweep, then `NODE_PATH=/tmp/claude-1000/shim/node_modules node test/service-worker-browser.test.js` and `node test/make-deploy.test.js` on their own (two new files join the release's file list). Expected: PASS.
- [ ] **Step 3:** `sh make-deploy.sh` runs clean; check `deploy/app/sw.js` lists `app-save.js` and `app-history.js`.
- [ ] **Step 4:** CHANGELOG ("no behavior change: save, undo and History moved to their own files"), README file list, BACKLOG R14 done.
- [ ] **Step 5: Commit** and report line counts before and after.
- [ ] **Step 6 (Mike, by hand, before saying "deploy"):** one club night's worth on the TEST club in a real browser: open, take attendance, undo and redo, hold and apply a draft on Roster, save, restore a version from History, start a new season. Then update a phone that has the previous release open and confirm the update bar brings it to the new one.

## Self-review
- **Spec coverage:** R13 Task 1 (each sub-claim checked in the table; the README version claim needs no work); R19 Task 2; R14 dead code Task 3; R14 split Tasks 4 to 6 (gated on Wave 2 and on Mike); R9 skipped, stated at the top.
- **Names:** `App.file` and its members, `App.holdAttendance`, `onSaved` are defined in "The seam" and used in Tasks 5 and 5b; `app-surface.test.js` (Task 4) is updated in Task 5.
- **Known limit:** Part C's line ranges and seam list are from today's file. Wave 2 changes that file, so Task 4 re-derives both; if its list differs from "The seam", the note wins and this plan is amended before Task 5.
