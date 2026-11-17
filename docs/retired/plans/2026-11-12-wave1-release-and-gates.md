# Wave 1: release path and gates (R8, R15, R3, R6, R2, R4, R5 names) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sure a fix always reaches installed phones as one consistent release, that the privacy gates fail before anything is written, that a fresh clone has every file it needs, that phone sign-off boxes are tappable again, and that one command runs every test that can run on TEST data.

**Architecture:** No data-format change. Changes are in `make-deploy.sh` (release guard, gate order, TEST-file check), the service worker template `dev/app/sw.js` (serve navigations from the release cache), `style.css` (two dead selectors), `.gitignore` plus `git add -f` of files that were never tracked, `dev/tools/make-test-data.js` (write on success only), and two new tools: a test runner and a tracked-docs name check. Each change has a failing test first.

**Tech Stack:** POSIX `sh` (make-deploy.sh), Node 24, Playwright (Chromium) for browser tests, git. No new dependencies.

**Spec:** `dev/REVIEW-2026-11-12-whole-project.md` (findings R2, R3, R4, R5, R6, R8, R15), BACKLOG "Review 2026-11-12", the roadmap `2026-11-12-review-fixes-roadmap.md`, and for the service worker `docs/superpowers/specs/2026-11-10-service-worker-design.md`.

## Global Constraints
- Use the Edit and Write tools to change files; scripted rewrites (`sed -i`, inline `node -e` that writes files) are blocked by the auto-mode classifier. Tests may run anything.
- Never read, print or copy a real data file. Tests use `dev/test-data` (invented TEST data) and invented ids (`7000001_Test_Kid`). Diagnostics print counts and kinds only.
- Each changed `.js` or `.html` file gets its own version line bumped (`make-deploy.sh` refuses otherwise); the release (`app-version`, `app-build` in `index.html`) is bumped once, in the last task.
- Browser tests run from `dev/app` with `NODE_PATH=/tmp/claude-1000/shim/node_modules` (Playwright 1.64 shim); node tests need nothing.
- Project rule: do not deploy; the last task ends at a committed, swept dev tree. Mike says "deploy".
- Commit messages end with the two attribution lines given in the session.

## Review Focus
Failure modes the tests below do not cover by themselves; check each deliberately in the final review.
1. **First-ever deploy** (no `deploy/app/sw.js` yet) must not trip the release guard.
2. **An unchanged rebuild** must exit 0 (running `make-deploy.sh` twice in a row is normal).
3. **Offline start and first visit** still work after the service worker change: first visit has no cache (must fall back to the network), offline reload must still start the app.
4. **A phone on an old release** whose server has a newer one: the update bar must appear, and Update now must reach the new release.
5. **`.gitignore` exceptions must not un-ignore real data** (`dev/*.json`, `dev/*.csv`, `archive/`, `*.pdf`, downloads).

## File Structure
| File | Change | Responsibility |
|---|---|---|
| `dev/tools/run-tests.sh` | create | Run every `dev/app/test/*.test.js`, 4 at a time, summarize, exit non-zero on a real failure. |
| `dev/app/test/roster.test.js`, `import-test-file.test.js`, `reports-season.test.js` | modify | Default to `dev/test-data` (or print `SKIP: needs real files` and exit 0). |
| `.gitignore` | modify | Exceptions for the app manifest, icons, TEST fixtures and `deploy/`. |
| `dev/app/test/gitignore.test.js` | create | Real-data paths stay ignored; needed files are not. |
| `make-deploy.sh` | modify | Refuse a changed build whose release id is unchanged; run the non-code and TEST checks before touching `deploy/`; require `"fake":true` in the try data file. |
| `dev/app/test/make-deploy.test.js` | create | Runs `make-deploy.sh` on a temp copy through the scenarios above. |
| `dev/tools/make-test-data.js` | modify | Build the output in a temp dir; move it into place only when every check passes. |
| `dev/app/sw.js` (template) | modify | Page navigations are answered from the release cache; the update check's own fetch of `index.html` goes to the network. |
| `dev/app/test/service-worker-browser.test.js` | modify | Cold start after a deploy never mixes releases. |
| `dev/app/style.css` | modify | Re-point two `#tab-progress` rules at the sheet's real container. |
| `dev/app/test/mobile-audit.js` | modify | Add a touch-size check for sign-off boxes on the Person tab's Progress sheet. |
| `dev/tools/check-docs-for-names.js` | create | Report (file and line, never the name) tracked docs that contain a name from a real data file given as an argument. |
| `BACKLOG.md` | modify | Remove the names (R5) and mark Wave 1 items done. |

---

### Task 1: One command to run every test (R8)

**Files:**
- Create: `dev/tools/run-tests.sh`
- Modify: `dev/app/test/roster.test.js`, `dev/app/test/import-test-file.test.js`, `dev/app/test/reports-season.test.js` (argument defaults)
- Test: the runner itself is verified against the sweep already done this session (143 test files; 5 need real files)

**Interfaces:**
- Produces: `sh dev/tools/run-tests.sh [--node-only] [name-filter]` prints one line per file (`ok`, `FAIL`, `SKIP`) and a summary; exit 0 only if no file failed. Environment: honours `NODE_PATH`; when `require('playwright')` does not resolve, browser tests are `SKIP (no playwright)` and `--node-only` is implied.
- Consumes: nothing.

- [ ] **Step 1: Find out which of the three argument tests can run on TEST data.** Run each with `dev/test-data` inputs: `node test/roster.test.js "../test-data/20261028 -- demo-club-2026-27 TEST.csv"`, `node test/import-test-file.test.js "../test-data/20261103 -- demo-club-2026-27 TEST.csv"`, and read what `reports-season.test.js` needs. Expected: record for each "passes on TEST data" or "needs real data because <reason>".
- [ ] **Step 2: Write the failing check.** Create `dev/app/test/no-args.test.js` (node) that runs each of the three tests with no arguments via `child_process` and asserts the exit code is 0 and the output contains either `passed` or `SKIP: needs real files`. Run it. Expected: FAIL (they crash with a TypeError today).
- [ ] **Step 3: Give each test a default.** In each file, when `process.argv[2]` is missing use the TEST file from step 1 (path built from `__dirname`), else print `SKIP: needs real files (<what>)` and `process.exit(0)`. Keep the real-file usage line in the header.
- [ ] **Step 4: Run the no-args test.** Expected: PASS.
- [ ] **Step 5: Write `dev/tools/run-tests.sh`.** POSIX sh: lists `dev/app/test/*.test.js`, runs 4 at a time with a 600 s timeout each from `dev/app`, collects exit code and last `N passed, M failed` line, prints the summary, exits non-zero if any file exited non-zero other than a `SKIP`.
- [ ] **Step 6: Run it.** Run: `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh`. Expected: every file `ok` or `SKIP`, exit 0 (the same result as the sweep earlier: nothing failing).
- [ ] **Step 7: Document and commit.** README test section: one line for the runner and its two flags. Commit `git add dev/tools/run-tests.sh dev/app/test README.md`.

### Task 2: A fresh clone has every file it needs (R15)

**Files:**
- Modify: `.gitignore`
- Create: `dev/app/test/gitignore.test.js`
- Track (with `git add -f` once): `dev/app/manifest.json`, `dev/app/icon-192.png`, `dev/app/icon-512.png`, `dev/test-data/*.json`, `dev/test-data/*.csv`, `deploy/app/manifest.json`, `deploy/app/icon-*.png`, `deploy/app/try/*`

**Interfaces:**
- Produces: `git check-ignore` answers used by the test; nothing else.

- [ ] **Step 1: Write the failing test.** `gitignore.test.js` uses `git check-ignore -q <path>` (run in the repo root; works for paths that do not exist). Assert ignored: `dev/awana-2026-27-20261110-115434.json`, `dev/20261104 -- sc-awana-club-2026-27.csv`, `archive/migration-inputs/x.csv`, `reports/x.pdf`, `dev/working.json`, `x/real.json`. Assert NOT ignored: `dev/app/manifest.json`, `dev/app/icon-192.png`, `dev/app/icon-512.png`, `dev/app/icon.svg`, `dev/test-data/awana-2026-27-TEST-20261029-214815.json`, `dev/test-data/20261028 -- demo-club-2026-27 TEST.csv`, `deploy/app/manifest.json`, `deploy/app/try/manifest.json`, `deploy/app/try/awana-2026-27-TEST-20261029-214815.json`. Also assert that every file under `dev/test-data` and `deploy/app/try` has `TEST` in its name or is `manifest.json` or a `.md`. Run: `node test/gitignore.test.js`. Expected: FAIL on the "not ignored" group.
- [ ] **Step 2: Add the exceptions** to `.gitignore` after the ignore lines, narrow: `!dev/app/manifest.json`, `!dev/app/icon-*.png`, `!dev/test-data/*TEST*.json`, `!dev/test-data/*TEST*.csv`, `!deploy/app/manifest.json`, `!deploy/app/icon-*.png`, `!deploy/app/try/manifest.json`, `!deploy/app/try/*TEST*.json`, `!deploy/app/try/*TEST*.csv`. Keep every existing ignore line.
- [ ] **Step 3: Run the test.** Expected: PASS.
- [ ] **Step 4: Track the files.** Run `git add -f` for the paths in Files (only what `git status` then lists as new and matches the TEST rule), then `git status --short` and confirm nothing else (no real data) is staged: the list must contain only the manifest, icons, TEST fixtures and deploy copies.
- [ ] **Step 5: Commit** `.gitignore`, the test, and the newly tracked files.

### Task 3: A changed build must change the release id (R3)

**Files:**
- Modify: `make-deploy.sh`
- Create: `dev/app/test/make-deploy.test.js`

**Interfaces:**
- Produces: `make-deploy.sh` exits 1 with `STOP: files changed but app-version and app-build are unchanged (release <rel>)` when any shipped file (including `style.css` and anything else that is not a versioned `.js`/`.html`) differs from `deploy/app` and the new release id equals the one in `deploy/app/sw.js`.
- Produces for Task 4: the test file's helper `deployCopy()` (copies `make-deploy.sh`, `dev/app`, `dev/tools`, `dev/test-data`, a symlink to `node_modules`, an initial `deploy/` made by one run) and `run(tmp)` returning `{ code, out }`.

- [ ] **Step 1: Write the failing test** `make-deploy.test.js`. Scenarios on a temp copy, each starting from a fresh `deployCopy()` that has run `make-deploy.sh` once:
  - `an unchanged rebuild passes` (exit 0).
  - `a first deploy (no deploy folder) passes` (remove `deploy/`, exit 0).
  - `changing style.css without bumping the release is refused` (append a CSS comment to `dev/app/style.css`; expect exit 1 and `STOP: files changed but app-version and app-build are unchanged`; and `deploy/app/style.css` is still the old file).
  - `changing style.css and bumping app-build passes` and `deploy/app/sw.js` holds a different `RELEASE`.
  - `a script changed with its own version bumped but the release not bumped is refused` (the review's exact case).
  Run: `node test/make-deploy.test.js`. Expected: the two "refused" cases FAIL (exit 0 today).
- [ ] **Step 2: Implement.** In `make-deploy.sh`, move the release computation (`rel`) above the `rsync ... deploy/app/` line; read the deployed release from `deploy/app/sw.js` (`const RELEASE = '...'`); set `changed` when `diff -rq` between `$build/app` (excluding `sw.js`, `try`) and `deploy/app` reports a difference or the stamped `index.html` differs; if `changed` and the deployed release exists and equals `rel`, print the STOP message and exit 1 before any copy to `deploy/`.
- [ ] **Step 3: Run the test.** Expected: PASS.
- [ ] **Step 4: Commit** `make-deploy.sh` and the test.

### Task 4: Gates fail before anything is written to deploy/ (R6, deploy side)

**Files:**
- Modify: `make-deploy.sh`, `dev/app/test/make-deploy.test.js`

**Interfaces:**
- Consumes: Task 3's `deployCopy()` and `run(tmp)`.
- Produces: `make-deploy.sh` refuses, with `deploy/` byte-identical afterwards, (a) any non-code file in the build, (b) a try file not named `TEST`, (c) a try data JSON whose top-level `fake` is not `true`.

- [ ] **Step 1: Failing tests.** Add scenarios: `a real-looking json renamed with TEST in a dev/test-data folder is refused if it is not marked fake` (copy a TEST file, set `"fake"` to absent, expect exit 1 and message `not marked "fake": true`); `a stray data file in dev/app is refused and deploy/ is unchanged` (add `dev/app/real.csv`; expect exit 1; compare a recursive checksum of `deploy/` before and after). Expected: FAIL today (the stray-file check runs after the sync; the fake check does not exist).
- [ ] **Step 2: Implement.** Move the non-code `find` check onto `$build` (before the `rsync --delete` into `deploy/`); add a check of each `dev/test-data/*.json` used for the try folder (parse with node: `fake === true`) before copying it.
- [ ] **Step 3: Run the tests.** Expected: PASS, including Task 3's.
- [ ] **Step 4: Commit.**

### Task 5: The anonymizer writes only when every check passes (R6, anonymizer side)

**Files:**
- Modify: `dev/tools/make-test-data.js`, `dev/app/test/anonymized-data.test.js`

**Interfaces:**
- Produces: on exit code 1 the `<out-dir>` contains no files from this run; on success the same two files as today.

- [ ] **Step 1: Failing test** (add to `anonymized-data.test.js`, runs only with the real-file arguments like its siblings, plus a TEST-data variant that always runs): run the tool on `dev/test-data` data and export with a forced problem and assert exit code 1 and an empty out dir. Force the problem without a code hook by passing a copy of the data file with one added top-level section the tool does not know (that throws before writing today, so use a free-text note the leak check will flag instead: a `--extra` word list naming a word that is guaranteed to survive, such as a book name that is not in the calendar or config). Expected today: the out dir holds files after the failure, test FAILS.
- [ ] **Step 2: Implement.** Write to `fs.mkdtempSync(path.join(outDir, '.tmp-'))` (or a sibling temp dir), and after the checks `renameSync` the two files into `outDir`; on `process.exit(1)` remove the temp dir.
- [ ] **Step 3: Run** `node test/anonymized-data.test.js` with the real-file arguments you already use and the TEST variant. Expected: PASS (the one known pending item aside).
- [ ] **Step 4: Commit.**

### Task 6: One release per page load (R2)

**Files:**
- Modify: `dev/app/sw.js` (the template), `dev/app/test/service-worker-browser.test.js`, version lines of `sw.js` is not applicable (it is a template; its release is the build)

**Interfaces:**
- Consumes: the existing test's `deploy`, `base`, `setRelease(name)`, `keysOf(p)`, `waitControl(p)` helpers.
- Produces: in `sw.js`, `req.mode === 'navigate'` requests for `index.html` (or the scope root) are answered from this release's cache (network only when the cache has no copy); any other request for `index.html` (the update check uses `index.html?_=<time>` with `cache: 'no-store'`) still goes to the network, falling back to the cache when offline.

- [ ] **Step 1: Failing test.** Add `cold start after a deploy keeps one release`: first visit installs release A. Then change the served deploy copy to release B: new `app-version` meta in `index.html` (`9.9.9`), new `RELEASE` in `sw.js`, and a marker change in one script (an extra global `window.__B = true` appended to a copy of `app-help.js`). Reload the page (a navigation) **without** pressing Update now. Assert: the page's `app-version` meta equals release A's, `window.__B` is undefined, `App.updates.check()` then finds B (`#updateBar` visible), and after `App.swApply()` the page reports `9.9.9` and `window.__B === true`. Run: `NODE_PATH=... node test/service-worker-browser.test.js`. Expected: FAIL (today the reload shows `9.9.9` with A's scripts).
- [ ] **Step 2: Implement** in `sw.js`: in the fetch handler, for `file === '' || file === 'index.html'`: if `req.mode === 'navigate'`, respond from `caches.match(base + 'index.html', { ignoreSearch: true, cacheName: CACHE })` falling back to `fetch(req)`; otherwise keep the network-first branch. First visit (no cache entry) falls back to the network.
- [ ] **Step 3: Run the whole file.** Expected: all existing 6 tests plus the new one PASS (offline start, update bar, Update now, no-release-ready).
- [ ] **Step 4: Commit.**

### Task 7: Phone sign-off boxes are tappable again (R4)

**Files:**
- Modify: `dev/app/style.css` (the two rules at `#tab-progress` near lines 337 and 530), `dev/app/test/mobile-audit.js`

**Interfaces:**
- Produces: `mobile-audit.js` also reports, on the Person tab's Progress sheet at 390 px wide, any sign-off date input shorter than 44 px; exits non-zero when it finds any.

- [ ] **Step 1: Failing check.** In `mobile-audit.js`, after the existing tab walk, open a child's Progress sheet (`App.showPerson(id)`), then measure every `#progressWrap input[type=date]` and `#progressWrap select`; add them to `problems` when `getBoundingClientRect().height < 44`. Run: `NODE_PATH=... node test/mobile-audit.js`. Expected: FAIL, listing about 84 inputs at about 25 px.
- [ ] **Step 2: Fix the CSS.** In the phone media rule replace `#tab-progress select, #tab-progress input[type=date], #tab-progress .bar button` with `#progressWrap select, #progressWrap input[type=date], #progressWrap .bar button`; make the same change in the `(pointer: coarse) and (min-width: 761px)` rule (also `.todaybtn`). Check the sheet's real container is `#progressWrap` (and the Person tab's `#personWrap .sheetarea`); include both if the second also holds sign-off boxes.
- [ ] **Step 3: Run the audit again and the layout tests** (`flags-browser`, `person-sheets-browser`, `progress-onepage-browser`). Expected: audit PASS; the others unchanged. Print layout is not touched (the rules are inside screen media queries; confirm with `grep` that no print rule uses the changed selectors).
- [ ] **Step 4: Commit** (bump `style.css`'s own nothing: CSS has no version line; the release bump in Task 9 covers it).

### Task 8: Names out of tracked docs, and a check that keeps them out (R5)

**Files:**
- Modify: `BACKLOG.md` (the "Previous list, for reference" entry, around line 114)
- Create: `dev/tools/check-docs-for-names.js`

**Interfaces:**
- Produces: `node dev/tools/check-docs-for-names.js <real-data.json>` loads the roster's first and last name words (4 or more letters, not ordinary English if `/usr/share/dict/words` exists) into memory only, scans every file from `git ls-files` with extension `.md`, `.txt`, `.js`, `.html`, `.json`, `.csv` (skipping `dev/test-data` and `deploy/app/try`, which are invented), and prints `file:line` plus the count, **never the word**; exit 1 if any are found. Mike (or the session, with his say-so) runs it with a real file kept outside the repo.

- [ ] **Step 1: Failing check.** Run the tool against the real data file Mike names (a copy kept outside the repo). Expected: exit 1 listing `BACKLOG.md:<line>` (and any others). If it lists other files, each is handled the same way.
- [ ] **Step 2: Remove the names.** Edit the listed lines: replace the list with a one-line summary ("the earlier per-child list was removed 2026-11-12 because it held real names; it is in git history only"). Keep any count or statement that is not a name.
- [ ] **Step 3: Re-run the tool.** Expected: exit 0.
- [ ] **Step 4: Add a node test** `check-docs-for-names.test.js` using a tiny invented data file (two invented people) and a temp git repo with one tracked file that contains an invented name: assert exit 1 and that stdout contains the file and line but not the name; remove the name and assert exit 0.
- [ ] **Step 5: Record the decision** in BACKLOG R5: history rewrite deferred (no remote); rule: never push without rewriting history first.
- [ ] **Step 6: Commit.**

### Task 9: Wave 1 wrap-up

**Files:**
- Modify: `dev/app/index.html` (`app-version` 1.51.06, `app-build`), `CHANGELOG.md`, `README.md`, `BACKLOG.md`, version lines of every changed `.js` file

- [ ] **Step 1:** Bump `app-version` to `1.51.06` and `app-build` to the day, and each changed `.js` file's own version.
- [ ] **Step 2:** `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh`. Expected: no failures.
- [ ] **Step 3:** `sh make-deploy.sh` on the real tree runs clean (no STOP); `git status` shows `deploy/` changes only for the release. Do **not** rsync to production.
- [ ] **Step 4:** CHANGELOG ("Next release"), README (runner, new tests, `.gitignore` note), BACKLOG (R2, R3, R4, R5 names, R6, R8, R15 marked done in dev).
- [ ] **Step 5: Commit** and report: what changed, the sweep result, and "ready to deploy 1.51.06 when you say".

## Self-review
- **Spec coverage:** R8 task 1; R15 task 2; R3 task 3; R6 tasks 4 and 5; R2 task 6; R4 task 7; R5 task 8 (names now, history decision recorded); wrap-up task 9. Nothing from the review's "do soon" 1 to 8 is dropped except R1 (done), R7 (Wave 2).
- **Types and names:** `deployCopy()` and `run(tmp)` are defined in task 3 and consumed in task 4; the runner's flags are named once (task 1).
- **Proportion:** each task is a failing test, the smallest change, and a check; the only code shown is what a decision depends on.
