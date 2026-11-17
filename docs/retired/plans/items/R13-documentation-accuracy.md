# R13: Documentation accuracy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** README, BACKLOG, the in-app manual, the To do hints, one slide warning and the splash say what the code does today, and one node test keeps the parts that drift (the test list, the script order, the tab list, "Progress tab", "nothing is uploaded", browser-storage wording) in step from now on.

**Architecture:** Text only: no behavior change, no data-format change. One new node test, `dev/app/test/docs-in-step.test.js`, reads source text (README, `index.html`, `dev/app/*.js`) and fails on each kind of drift listed below; the wording fixes make it pass. This plan **replaces Wave 4 Part A Task 1** in `2026-11-13-wave4-docs-and-structure.md` (that outline has errors, listed below). It can ship in any release; it does not depend on Waves 2 or 3, and it touches no function that R14 moves.

**Tech Stack:** Node 24 (`fs`, `path`, `assert`; the repo's own `test(name, fn)` pattern from `test/versions.test.js:5-9`). No browser needed for the new test. Browser tests that read the changed texts are re-run with Playwright 1.64.

**Spec:** BACKLOG "R13. Documentation accuracy" (`BACKLOG.md:137-138`); `dev/REVIEW-2026-11-12-whole-project.md` recommendation 13; roadmap outline "R13 docs"; Wave 4 plan Part A Task 1.

## Global Constraints
- Use the Edit and Write tools for every file change (scripted rewrites such as `sed -i` are blocked by auto mode). Tests may run anything.
- Never open a real data file (`archive/`, `dev/*.json`, `dev/*.csv`, `reports/`, `research_notes/`, `~/Downloads`, `~/Nextcloud`). Use only `dev/test-data`, docs and code. No real name in any document; examples use invented ids such as `7000001_Test_Kid`.
- Tests run from `dev/app`. Browser tests need `NODE_PATH=/tmp/claude-1000/shim/node_modules`. Full check, from the repo root: `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh`.
- The manual's "Which option when" part of `index.html` (between `<!-- guide:start -->` and `<!-- guide:end -->`, starts at `index.html:607`) is **generated** from `info.js`: edit `info.js`, then run `node dev/tools/sync-guide.js` (from the repo root); `test/info.test.js` fails when they differ. Never hand-edit inside the guide markers.
- Versions (verified in `make-deploy.sh`):
  - Each changed `.js` bumps its own line-1 version (`(this.AwanaVersions ...)['x.js'] = 'a.b.c';`). `make-deploy.sh:20-22` compares the **minified** build, so a comment-only `.js` change needs no bump, but every change in this plan is inside a string, so every touched `.js` needs one.
  - `index.html` has **no version line of its own**: `make-deploy.sh:6` reads `app-version` as its version, and `:20` compares the whole stamped page. Any `index.html` change therefore needs a new `app-version` (and `app-build`) unless the release in dev has not been built into `deploy/` yet (see Task 5).
- Do not deploy, do not run `make-deploy.sh` except as Task 5 says; Mike says "deploy". Commit messages end with the two attribution lines given in the session.

## What the review and the earlier plans got right and wrong (checked 2026-11-13 against the code)
| Claim | Verdict |
|---|---|
| README header says 1.50.28 (review, BACKLOG R13) | **Holds.** `README.md:3` ends "Last updated 2026-11-05 (app 1.50.28)". The Wave 4 plan's verdict ("the README has no version in its header and `1.50.28` appears nowhere in it") is **wrong**: it looked at line 1 only. |
| README line 18 says update settings live in `localStorage` | Holds (`README.md:18`, "settings of the browser in `localStorage`"). The settings are `config.autoUpdate` / `config.autoSave` in the data file (`app-update.js:16-20`, `DATA-FORMAT.md:264-265`). |
| 29 test files are unlisted in the README | Number is stale. Today: 150 `*.test.js` files in `dev/app/test`, **28** not named in README (the Wave 4 plan's "137 lines" is a line count, not a file count). The 28: attendance-fill-print, attendance-landscape-browser, attend-steps-browser, binders-dialog-browser, blue-hand-browser, blue-wings, coaches-binder, cubbies-record, date-year-default-browser, extra-sheets, flags-browser, flags, handbooks-nobook, hand-out-given-browser, import-conflicts-browser, person-flags-browser, person-sheets-browser, print-blank-dates-browser, received-nodate, save-dot-browser, save-style-browser, service-worker-browser, sign-nodate, teams-report-order, todo-date-entry-browser, told-no-date-browser, unchecked-features-browser, weekly-slips (each `.test.js`). The test in Task 1 recounts; trust it over this list. |
| BACKLOG header says 1.50.36; the `versions.test.js` note is stale | Holds, and there are **two** stale notes, not one: `BACKLOG.md:9` (the Debug "S old or not registered" bullet: "versions.test.js still expects one and fails") and `BACKLOG.md:225` ("H. Known baseline failures"). `versions.test.js:10` excludes `sw.js`, so neither is true. `:9`'s other half (the Debug row itself) was R2's probable cause and R2 is fixed in dev; leave that half to Mike (open question 3). |
| "Progress tab" in `todo.js:45`, `:51` and the manual | Holds, and the review **missed five more user-visible places**: `slides.js:92` (a warning shown when making slides: "Set the handbook on the Progress tab"), `app-options.js:22` and `info.js:84` ("Person and Progress tabs"; `info.js:84` is also copied into the generated guide at `index.html:607`), and `index.html:550` and `:586`. Full list in `index.html`: `:427`, `:544`, `:550`, `:586`, `:607` (generated). The other hits (`app-season.js:321`, `:599`, `:662`, `:1200`, `app-options.js:234`, `stats.js:65`) are code comments: leave them (R14 moves `app-season.js`; a comment change there is churn). |
| Splash "Nothing is uploaded" (`index.html:717`) beside Open from Google Drive | Holds (the Drive button is `#splashDrive`, `index.html:725`, shown by `app-drive.js:43` when Drive is set up). The same promise is also at `index.html:259` (manual intro, "nothing is uploaded, there is no server"), `index.html:699` and `README.md:3`. |
| Wave 4 Task 1 step 3: put the wording test in `test/todo.test.js` "or `test/test.js`" | **Wrong file.** There is no `todo.test.js`, and `test/test.js` needs a real Planning Center export argument. The check goes in the new node test (source text), which runs in the sweep with no arguments. |
| Wave 4 Global Constraints: "a comment-only change still needs a bump" | Wrong for `.js` (minified compare, `make-deploy.sh:20`; README `:212` says so). True for `index.html`. |
| Found while planning (not in the review) | README is stale in four more places: `:17` "save style per browser, *dated files* (default)" (it is `config.saveStyleDrive` in the data file, default *in place*: `app-drive.js:16-23`, `DATA-FORMAT.md:262`); `:58` and `:220` "report settings ... kept in the browser, per machine ... club name, motto, hand-chosen quarter" (nothing is kept: `app.js:8-11` removes every old `awana*` key on load; the title is `config.clubTitle`, `DATA-FORMAT.md:283`; a typed quarter is kept in memory for a week, `quarter-browser.test.js:32-42`; there is no motto in the code); `:64` lists **Progress** under Tonight and **Rotation** under Season, but the tab strip (`index.html:33-56`) has neither; `:216` script order omits `app-sw.js` (loaded between `app-update.js` and `app-info.js`). `:210` says "stay in the 1.50.x series", but the release is 1.51.06 (Mike's rule: open question 2). |

## Review Focus
Failure modes to check deliberately; each has an owner test.
1. **A test name matches as a substring** (e.g. `flags.test.js` inside another name) and hides a missing entry. Owner: Task 1 test A matches `test/<file>` (with the folder prefix), and its self-check case.
2. **The comment stripper eats a real string** (a URL `https://` inside a string) or **misses a comment**, so the "Progress tab" check gives a false pass or a false fail. Owner: test D's stripper only drops `//` at line start or after whitespace, and `/* */` blocks; Task 1 step 1 prints the hits so the engineer sees them.
3. **The generated guide is hand-edited** and the next `sync-guide.js` puts "Progress tabs" back. Owner: test D scans `info.js` itself, and `test/info.test.js` (guide equals `info.js`).
4. **Renaming the manual's Progress heading breaks `versions.test.js`** (`:41-42` require `<h3 ...>Progress</h3>`). Owner: the plan keeps the heading text; Task 3 step 4 runs `versions.test.js`.
5. **New wording is false when Drive is not set up** (most installs: `drive-config.js` empty, `#splashDriveRow` hidden). Owner: test E checks the new splash sentence names "this computer" and makes Drive conditional; Mike reads it (Task 6).
6. **A document edit puts a real name back.** Owner: Mike runs `check-docs-for-names.js` (Task 6).
7. **The release is refused or, worse, accepted with an unchanged `app-version`.** Owner: Task 5 step 2 (`make-deploy.sh` must exit 0 with the bump, and `make-deploy.test.js` already pins the refusal).

## File Structure
| File | Change | Responsibility |
|---|---|---|
| `dev/app/test/docs-in-step.test.js` | create | Pins: every test named in README; README script order and tab groups equal `index.html`; no user-visible "Progress tab"; no "nothing is uploaded"; no claim that settings are kept in the browser; no code writes `localStorage`. |
| `README.md` | modify | Lines 3, 17, 18, 58, 64, 157, 210 (after Mike), 216, 220; 28 test lines; one line for the new test. |
| `BACKLOG.md` | modify | Header (line 1), `:9` and `:225` stale notes, R13 marked fixed. |
| `CHANGELOG.md` | modify | One bullet under "Next release". |
| `dev/app/index.html` | modify | Lines 259, 427, 486-488 (lead sentence), 544, 550, 586, 699, 717; guide region regenerated; `app-version`/`app-build` per Task 5. |
| `dev/app/todo.js` | modify | Hints at `:45`, `:51`; version 1.10.0 to 1.10.1. |
| `dev/app/slides.js` | modify | Warning at `:92`; version 1.4.0 to 1.4.1. |
| `dev/app/app-options.js` | modify | `:22`; version 1.18.0 to 1.18.1. |
| `dev/app/info.js` | modify | `:84`; version 1.21.0 to 1.21.1; then `sync-guide.js`. |

---

### Task 1: The failing test (`docs-in-step.test.js`)

**Files:** Create `dev/app/test/docs-in-step.test.js`.

**Interfaces:**
- Produces: `node test/docs-in-step.test.js` (no arguments; prints `ok`/`FAIL` per test and `N passed, M failed`; exit 1 on any failure), picked up by `run-tests.sh` automatically (it runs every `*.test.js`).
- Helpers inside the file (not exported): `read(rel)` (from the repo root, `path.join(__dirname, '..', '..', '..')`); `stripJsComments(src)` returns the source with `/* ... */` blocks and every `//` comment that starts a line or follows whitespace removed (`/(^|\s)\/\/.*$/gm`, then `/\/\*[\s\S]*?\*\//g`); `stripHtmlComments(html)` removes `<!-- ... -->`; `lineOf(text, index)` for messages. Every failure message names file and line, and the offending phrase only (these files hold no names).

Tests (names exactly; assertions):
- **A. `every test file is named in the README`**: `fs.readdirSync(testDir).filter(f => /\.test\.js$/.test(f)).filter(f => !readme.includes('test/' + f))` deep-equals `[]`; the message lists the missing names. Expected now: FAIL with 28.
- **B. `the README's script order is the page's script order`**: take the backticked list after "Script load order matters" in README (`README.md:216`), split on `, `, add `.js`; take `index.html`'s `<script src="...">` list (same regex as `versions.test.js:31`) without `drive-config.js`, `drive.js`, `app-drive.js` (README names those separately; also assert that sentence names all three). Deep-equal. Expected now: FAIL (README lacks `app-sw`).
- **C. `the README's tab groups are the tab strip`**: from `index.html`, each `<div class="tabgrp"...>` block up to its `</div>` at the start of a line: the group name (text of `.grphead` before its first `<span`) and the button texts (`<button data-tab=...>` inner text with tags removed and trimmed; hidden buttons included). From README, the line starting `Tabs, in four groups`: each `**Name** (a, b, c)`. Deep-equal per group. Expected now: FAIL (README has Progress in Tonight, Rotation in Season).
- **D. `no user-visible text sends people to a "Progress tab"`**: in `stripJsComments` of every `dev/app/*.js` except `sw.js`, in `stripHtmlComments(index.html)` and in README, no match of `/\bProgress tabs?\b/`. The word "Progress" alone, "Progress sheet", "Progress sub-tab" and "Person > Progress" are fine. Expected now: FAIL at `todo.js:45`, `:51`, `slides.js:92`, `app-options.js:22`, `info.js:84`, `index.html:427`, `:544`, `:550`, `:586`, `:607`, `README.md:157`. (If more show up, they are part of the work.)
- **E. `nothing promises "nothing is uploaded"`**: no `/nothing is uploaded/i` in `index.html` or README; and the splash card's first `<p>` (inside `<section id="splash"`) contains `this computer` and contains `Google Drive` only together with a condition word (`/if|when|only/`). Expected now: FAIL (`index.html:259`, `:699`, `:717`, `README.md:3`).
- **F. `the README says settings are in the data file, not the browser`**: README has no `localStorage` and no `/per browser|per machine|kept in the browser/i` unless the same sentence contains `nothing` or `not` (split README on `. `); and no `dev/app/*.js` source contains `localStorage.setItem(` (the code-side truth; `app.js:11` only removes, `app-tools.js:45` only lists). Expected now: FAIL on README `:17`, `:18`, `:58` (code half passes).
- **G. `README and BACKLOG headers carry no release number`**: `README.md` lines 1 to 5 and `BACKLOG.md` line 1 have no `/\bapp \d+\.\d+/`. (Decision behind it: a release number in a header goes stale every release; CHANGELOG is the place for it. If Mike prefers the number kept, change G to "equals `app-version` in `index.html`" instead; open question 1.) Expected now: FAIL on both.

- [ ] **Step 1: Write the test.** Run from `dev/app`: `node test/docs-in-step.test.js`. Expected: 7 tests, A to G all FAIL, with the hits above (a short self-check inside A: `'test/flags.test.js'` must not be found in the string `'test/person-flags.test.js'`, to prove the prefix rule; asserted, so it passes).
- [ ] **Step 2: Commit** the failing test alone (`git add dev/app/test/docs-in-step.test.js`), message "R13: failing test for docs that drift".

### Task 2: README

**Files:** Modify `README.md`.

- [ ] **Step 1 (A):** Add one line per missing test to the block at `README.md:80-206`, beside the nearest related test, in the neighbors' style (`node test/x.test.js` or `NODE_PATH=<dir with playwright> node test/x-browser.test.js`, then `# what it pins`, one clause). Write each comment from the test file's own line-1 comment and its `test('...')` names (read the test files, not data). Also add `node test/docs-in-step.test.js   # README test list, script order and tab groups match the code; no "Progress tab", no "nothing is uploaded", no settings in the browser`. While there, fix `:125` (`NODE_PATH=` is written twice) and `:157` ("Cubbies on the Progress sheet (Person tab)").
- [ ] **Step 2 (B, C):** `:216` add `app-sw` after `app-update`. `:64`: "**Tonight** (To do, Attendance, Color team games, Awards), **People** (Roster, Person, Uniforms), **Season** (Calendar, Statistics, Awana store points, Reports), **Admin** (History, Options, How it works, Validate, Debug); a child's Progress sheet is a sub-tab of Person, and Validate and Debug show only when needed." Also `:62` "Progress and Person for one child" becomes "Person (with its Progress sheet) for one child".
- [ ] **Step 3 (E, G):** `:3`: "... as one browser app plus one data file. The app runs in the browser tab with no server of its own; the data file goes only where you save it: this computer, or your own Google Drive when saving there is turned on. What changed in each version is in `CHANGELOG.md`." (no date, no version).
- [ ] **Step 4 (F):** `:17` "save style per browser, *dated files* (default) or *one file updated in place*" becomes "save style in the data file (`config.saveStyleDrive`): *one file updated in place* (default) or *dated files*". `:18` "(`app-update.js`; settings of the browser in `localStorage`)" becomes "(`app-update.js`; both settings are in the data file, `config.autoUpdate` and `config.autoSave`; nothing is kept in the browser except the moment of an Update now, below)". `:58` becomes "**Nothing is kept in the browser.** The report title is in the data file (`config.clubTitle`); a quarter picked by hand on Reports is kept in memory for this page and lapses after 7 days, then the quarter follows the calendar (the latest club night on or before today). Older copies kept some settings in the browser; `app.js` removes those keys on load." `:220` delete the bullet (or, if Mike wants it kept, "A hand-picked report quarter is not saved").
- [ ] **Step 5:** `:210` only after Mike answers open question 2.
- [ ] **Step 6: Run** `node test/docs-in-step.test.js`. Expected: A, B, C, E (README part), F, G (README part) pass; D still fails on the app files; E and G still fail on `index.html` / BACKLOG.

### Task 3: The app's own words (manual, To do hints, slide warning, Options)

**Files:** Modify `dev/app/todo.js`, `dev/app/slides.js`, `dev/app/app-options.js`, `dev/app/info.js`, `dev/app/index.html`.

- [ ] **Step 1: Hints and warnings.** Use "Person tab, Progress" for the place (the sub-tab is named Progress on the Person tab):
  - `todo.js:45`: "Person tab, Progress: under the book's tab, enter the date received (the handbook box is on the Person tab too). Sparks need HG, WR or SS to land in the right slide column."
  - `todo.js:51`: "Person tab, Progress: under the book's tab, type the date received, or tick no date when nobody knows the day."
  - `slides.js:92`: "... Set the handbook on the child's Person tab."
  - `app-options.js:22` and `info.js:84`: "(Person and Progress tabs)" becomes "(on the Person tab and its Progress sheet)".
  - Bump: `todo.js` 1.10.1, `slides.js` 1.4.1, `app-options.js` 1.18.1, `info.js` 1.21.1.
- [ ] **Step 2: Manual.** `index.html:427` "<b>Progress tab.</b>" becomes "<b>Person tab, Progress.</b>"; `:544`, `:550` "on the Progress tab" becomes "on Progress (Person tab)"; `:586` as step 1's Options wording. At `:486-488` keep the heading `<h3 id="m-t-progress">Progress</h3>` (pinned by `versions.test.js:41-42` and the contents link) and add as its first `<li>`: "Progress is not a tab of its own: open a child on the **Person** tab and choose **Progress**, or click a child's name anywhere." (Whether to move the section under People is open question 4.)
- [ ] **Step 3: Uploads and storage.** `index.html:717`: "Open your data file to get started. The app runs in this browser tab; your file goes only where you save it: this computer, or your own Google Drive if saving there is turned on." `:259`: "nothing is uploaded, there is no server" becomes "there is no server of its own: your file goes only where you save it (this computer, or your Google Drive if you turn that on)". `:699`: "Nothing is uploaded, and the page stores nothing in this browser" becomes "Your file goes only where you save it, and the page keeps nothing in this browser (Update now carries the open file across its reload in this tab's session storage and removes it at once)". The parenthesis is accurate (`app-update.js:49`, `:62`); drop it if Mike prefers the short form (open question 5).
- [ ] **Step 4: Regenerate and run.** From the repo root: `node dev/tools/sync-guide.js`. Then from `dev/app`: `node test/docs-in-step.test.js && node test/info.test.js && node test/versions.test.js && node test/slides.test.js && node test/doc-examples.test.js`. Expected: all PASS except docs-in-step G (BACKLOG, Task 4).
- [ ] **Step 5: Browser tests that read these texts or this markup:** `NODE_PATH=/tmp/claude-1000/shim/node_modules node test/<f>` for `fresh-start-browser`, `info-browser`, `todo-book-medical-browser`, `todo-date-entry-browser`, `leftovers-browser`, `flags-browser`, `header-browser`. Expected: PASS (none asserts the changed sentences; checked: they match "Needs a handbook" / "Needs a date received" headings, which do not change).
- [ ] **Step 6: Commit** (`git add dev/app README.md`), "R13: say where Progress is, and where the file goes".

### Task 4: BACKLOG

**Files:** Modify `BACKLOG.md` only in the places named. Do not touch any entry that describes people.

- [ ] **Step 1:** Line 1: "# Backlog (updated 2026-11-13)" (no app number; test G).
- [ ] **Step 2:** `:9`: replace "sw.js has no version line by design (make-deploy.sh skips it), so versions.test.js still expects one and fails." with "(The versions.test.js failure noted here earlier is gone: the test skips sw.js, 2026-11-13.)". `:225` (H): strike "versions.test.js expects a version line in sw.js (by design it has none);" the same way, and "import-test-file.test.js needs its CSV argument to run" (fixed by R8: it defaults to `dev/test-data`, `README.md:76`).
- [ ] **Step 3:** `:137` heading: "### R13. Documentation accuracy (small) -- FIXED in dev 2026-11-13 (`test/docs-in-step.test.js`), not deployed", and one line under the existing text: what was found beyond the review (the table above, one sentence).
- [ ] **Step 4: Run** `node test/docs-in-step.test.js`. Expected: 7 passed. Commit "R13: BACKLOG header and stale notes".

### Task 5: Release

- [ ] **Step 1: Decide the version.** Compare `app-version` in `dev/app/index.html` (now 1.51.06) with `deploy/app/index.html`. If they are equal (1.51.06 already built into `deploy/`), bump to 1.51.07 and `app-build` to today; if `deploy/` is older, R13 rides in 1.51.06 and only `app-build` is set to today. Either way the CHANGELOG bullet goes under "Next release".
- [ ] **Step 2: Sweep, then build.** From the repo root: `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh`. Expected: no `FAIL` (SKIPs for the real-file tests are normal). Then `sh make-deploy.sh`: exit 0, no "STOP". (If it says "changed but the version number was not bumped", a `.js` from Task 3 was missed.)
- [ ] **Step 3: CHANGELOG** under "Next release": "**Docs and wording** (R13): the To do hints, the manual, a slide warning and the Options note say Progress is on the Person tab; the splash and manual no longer say 'Nothing is uploaded' beside Open from Google Drive; README's test list, tab list, script order and storage notes match the code, and `test/docs-in-step.test.js` keeps them so." README already has the new test line (Task 2).
- [ ] **Step 4: Commit** (`git add -A dev/app deploy README.md BACKLOG.md CHANGELOG.md`), "R13: release". Do not rsync or deploy.

### Task 6: Mike, by hand
- [ ] `node dev/tools/check-docs-for-names.js <real data file kept outside the repo>` from the repo root. Expected: exit 0 (the 28 new README lines are written from test names, but this is the rule after any hand-written doc edit).
- [ ] Read the new splash line and the manual's Progress lead line on a phone and a desktop; say if the wording is right for leaders.

## Open questions for Mike
1. **Release numbers in headers.** Plan: drop them from README line 3 and BACKLOG line 1 (CHANGELOG is the record), pinned by test G. Alternative: keep them and have G require the current `app-version` (then every release must touch both files).
2. **README `:210`, "stay in the 1.50.x series".** The release is 1.51.06. Is the rule now "stay in 1.51.x, bump only the third number"? The plan rewrites the line to whatever you say.
3. **BACKLOG `:9`, the Debug "S old or not registered" row.** R2 (fixed in dev) is its probable cause. Close it after the next deploy if the row is gone, or keep it open until then? The plan only removes the stale `versions.test.js` half.
4. **Manual layout.** Keep the Progress section under Tonight with a lead line saying it lives on the Person tab (plan), or move it under People after Person (bigger edit; contents and heading order change, `versions.test.js` still passes)?
5. **"Keeps nothing in this browser" and the update handoff.** Say it exactly (with the session-storage parenthesis) or keep the short form?

## Risks
- **Low.** Text only. The worst realistic outcome is a browser test that matched an old sentence (none found by grep) or a missed version bump, which `make-deploy.sh` refuses.
- Test C parses HTML with regexes; a later markup change to the tab strip (for example a new wrapper) can break the parser rather than reveal drift. Keep its parsing to the `tabgrp` / `grphead` / `data-tab` markers and fail with a clear "could not read the tab strip" message when it finds no groups.
- Test D can flag future honest uses ("the old Progress tab"); the fix is to reword, not to add exceptions.
- Wave 4 Part A Task 1 still describes this work with the errors above; whoever runs Wave 4 should follow this file instead (this plan does not edit the Wave 4 plan).

## Self-review
- **Spec coverage:** README header version (Task 2 step 3, test G), localStorage sentence (step 4, test F), unlisted tests (step 1, test A), BACKLOG header and stale `versions.test.js` notes (Task 4, test G), "Progress tab" in manual, `todo.js` and three more files (Task 3, test D), splash and two more "nothing is uploaded" lines (Task 3 step 3, test E), plus the found-while-planning README lines (test B, C, F).
- **Not in scope:** `season.js` header (R19), dead code and the split (R14), `DATA-FORMAT.md` (no format change here; its sections 12, 2.5 and 7.5 belong to Wave 2 per the Wave 4 plan), code comments that say "Progress tab".
