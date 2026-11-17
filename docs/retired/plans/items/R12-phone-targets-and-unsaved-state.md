# R12: phone touch targets and a louder unsaved state, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a phone (390px, touch) every name link, To do control, Uniforms date box and the Attendance Move button a leader taps is at least 44px; unsaved work is said in words (not only a coloured dot), and once it has waited too long a Save bar with a 44px button appears at the bottom. This also stands in for R9 (no crash-recovery draft; decision in the roadmap).

**Architecture:** CSS only for the touch sizes (one new block in `dev/app/style.css` under `@media (max-width: 760px), (pointer: coarse)`), pinned by `dev/app/test/touch-targets-browser.test.js`. The unsaved text already exists (`#seasonStatus` text is "N unsaved edits"); the phone CSS hides it today. Showing it is a CSS change. The Save bar is one new element in `index.html`, toggled from `status()` in `app-season.js` with the existing `overdue()` rule. No data-file change, so `docs/DATA-FORMAT.md`, `Season.SECTIONS` and `dev/tools/make-test-data.js` are untouched.

**Tech Stack:** Vanilla JS and CSS. Node 24 and Playwright 1.64 (Chromium, 390 x 844, `hasTouch`, `isMobile`) through the shim. No new dependencies.

**Spec:** BACKLOG.md "Review 2026-11-12" R12; `dev/REVIEW-2026-11-12-whole-project.md` recommendation 12; roadmap `docs/superpowers/plans/2026-11-12-review-fixes-roadmap.md` (R12 row, decision 3 on R9); outline `docs/superpowers/plans/2026-11-13-wave3-phone-usability.md` (this plan replaces it for R12; the differences are listed below).

## Global Constraints
- Use the Edit and Write tools to change files. Scripted rewrites (`sed -i`, `node -e` that writes) are blocked. Tests may run anything.
- Never open real data (`archive/`, `~/Downloads`, `~/Nextcloud`, `dev/*.json`, `dev/*.csv`, `reports/`, `research_notes/`). Tests use `dev/test-data` (the TEST club) only. Any new fixture uses invented ids such as `7000001_Test_Kid`.
- Tests run from `dev/app`. Browser tests: `NODE_PATH=/tmp/claude-1000/shim/node_modules node test/<file>`. Full sweep, from the repo root: `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh`.
- Versions: each changed `.js` bumps its own line 1 (`(this.AwanaVersions = ...)['app-season.js'] = '1.87.1'` today: becomes `1.87.2`; `info.js` is `1.21.0`: becomes `1.21.1`). `index.html`'s version is its `app-version` meta, and `app-version`/`app-build` are bumped once for the release, in the last task. `style.css` has no version line; `make-deploy.sh` refuses changed `.js`/`.html` with an unchanged version, and (since R3) a changed build with an unchanged release.
- Print must not change: every new rule sits inside `@media (max-width: 760px)`, `@media (pointer: coarse)` or both, never in `@media print`, and the Save bar is `display:none` in print.
- A computer (wide screen, fine pointer) must look exactly as now.
- Do not deploy and do not rsync; Mike says "deploy". Commit messages end with the two attribution lines given in the session.

## What was checked against the code (2026-11-13, dev 1.51.06)
Where the review or the Wave 3 outline is wrong or out of date:
1. **"Unsaved state on a phone is a colored dot only (`style.css:292`)"**: the line is now `style.css:326`. Mostly true, with one exception neither document mentions: `#seasonStatus` already holds words (`app-season.js:158`: "1 unsaved edit", "N unsaved edits", "unsaved changes", or "saved HH:MM"); the phone rule sets `font-size:0` and draws a dot, **but** once `overdue()` fires (20 edits or 15 minutes, `app-season.js:149-152`) the `.nudge` class shows the words at 12px, bold and underlined (`style.css:19`, `:326`). So the phone is colour-only from the first edit until the nudge. The Download button's own dot (`#btnSeasonSave.unsaved::after`, `style.css:381`) is also colour only.
2. **The outline's `data-short` attribute is not needed**: the text is already in the element. Task 2 is CSS plus an `aria-label`, not a new attribute.
3. **The outline's selector `input[data-udate]`** does exist (`app.js:997-998`, `App.uniDateHtml`, `data-udate="1"`), and the Uniforms "no date" tick is `label.uov` with `input[data-uflag]` (`app.js:1029`). Uniforms also has plain text boxes (`table.uni input[type=text]`, `style.css:94`, padding 2px) the review did not measure: include them.
4. **Name links are not on Awards or Roster** (the outline listed `#tab-awards`, `#tab-roster`). `a[data-person]` is drawn in: To do (`app-todo.js:80`, card heading; `:118`, `:120`, table rows), Attendance (`app-season.js:308`), Stats (`app-stats.js:10`, `:57`), Store (`app-store.js:63`), Color teams (`app-teamgrid.js:58`, `:88`; `app.js:876` `link()` used in tables at `:932` and in comma-separated prose lists at `:877`, `:896`, `:902`).
5. **The child bar `#prPin` is at the top** (`style.css:521`, `position:fixed; top:45px`), not the bottom; it cannot collide with a bottom bar. What is at the bottom: the `#flash` toast (`style.css:456`, `position:fixed; bottom:18px`), the in-flow Progress footer `.prfoot` (`:503`, 48px buttons) and the Attendance foot `.attfoot` (`:526`, in flow).
6. **On Attendance, rows are already 44px tall** on a phone (`style.css:335`: `table.att td.chk label { min-height:44px; min-width:34px }`), so a 44px name link does not make Attendance rows taller. The outline's worry about fewer children per screen applies to To do, Stats, Store and Color teams lists, not Attendance. Not in the review: the same rule makes the Attendance tick cells **34px wide**, under 44 (open question 2).
7. **The Attendance Move button** phone rule is `style.css:445` (`padding:4px 6px; font-size:14px`), base rule `:441`; correct in the outline.
8. **`App.testGate` exists** (`app.js:53`); the Download button's handler is `app-season.js:244`. TEST data files need two presses (first arms, second saves), as `save-dot-browser.test.js:19-20` does.
9. **No test hook is needed for the thresholds** (the outline proposed `App.nudgeAfter`): a test can make 20 edits in one `evaluate` loop, and the 15-minute rule can be driven with Playwright's `page.clock` (the 30-second `setInterval` at `app-season.js:166` calls `status()`).

## Review Focus
Failure modes the main tests do not cover by themselves; each has its own test or a by-hand check.
1. **Prose name lists break.** `a[data-person]` inside comma-separated lists on Color teams (`app.js:877`) must not become 44px blocks. Scope the rule to table cells and the To do card heading. Test: "a name link inside a sentence keeps its line height" (Task 1).
2. **Adjacent tap areas overlap** (a 44px link next to the Move button or a tick cell). Test: "tap areas in one Attendance row do not overlap" (Task 1).
3. **iOS zooms on focus** when a text box's font is under 16px. Test: every To do and Uniforms text input and select computes `font-size >= 16px` on the phone (Task 1). iOS itself is Mike's check.
4. **The header no longer fits.** "20 unsaved edits" in the phone top row could push Download off screen. Test: with the chip showing, `#btnSeasonSave` is fully inside the 390px viewport and the page has no sideways scroll (Task 2).
5. **The Save bar covers something**: the last row of a list, `.prfoot`, `.attfoot`, the `#flash` toast, an open dialog or the Save menu. Tests in Task 3.
6. **The bar nags during check-in.** 20 Present ticks come fast on club night; on a download-only setup every save is a new file in Downloads. Mitigation: a "Later" button that snoozes the bar until 20 more edits or 15 more minutes. Test in Task 3; Mike decides (open question 1).
7. **A computer changes.** Test in Tasks 1, 2 and 3 with a 1280 x 800, no-touch context.
8. **Print changes.** `print-layout-browser.test.js` in the Task 1 and Task 3 runs.

## File Structure
| File | Change | Responsibility |
|---|---|---|
| `dev/app/test/touch-targets-browser.test.js` | modify | Generic `measureIn` helper; the four areas, overlap, iOS font size, prose links, desktop unchanged. |
| `dev/app/style.css` | modify | One phone/coarse block for the sizes; `#seasonStatus` words on a phone; the Save bar. |
| `dev/app/test/save-dot-browser.test.js` | modify | Words on a phone; the Save button's accessible name; the Save bar. |
| `dev/app/app-season.js` | modify | `status()`: `aria-label` on Download, the Save bar, Later. Line 1 bump. |
| `dev/app/index.html` | modify | The Save bar element; release bump. |
| `dev/app/info.js` | modify | One sentence on the phone's unsaved words and Save bar; then `dev/tools/sync-guide.js`. Line 1 bump. |
| `CHANGELOG.md`, `README.md`, `BACKLOG.md`, `docs/playtest-checklist.md` | modify | Release notes, the phone paragraph, R12/R9 status, the by-hand phone list. |

---

### Task 1: The small targets are 44px on a phone

**Files:** Modify `dev/app/test/touch-targets-browser.test.js`, `dev/app/style.css`.

**Interfaces:**
- Produces, inside the test file: `measureIn(p, rootSel, sel, min) -> Promise<{ n, small, sample }>` where `min = { w?, h? }`. Counts elements under `document.querySelector(rootSel)` that match `sel` and are visible (`offsetParent !== null`), and how many have `getBoundingClientRect()` width under `min.w - 0.5` or height under `min.h - 0.5`; `sample` names the first small one and its size (same form as the existing `measure`). Also `openTab(p, name)`: `p.evaluate(n => document.querySelector('.tabs button[data-tab="' + n + '"]').click(), name)` then a 250ms wait (Uniforms is under More, but the button is in the DOM; check it opens, else open `.moremenu` first). Task 3 reuses both.

- [ ] **Step 1: Failing tests.** In the existing phone context (390 x 844, touch, file loaded with the TEST export). Each size test asserts `n >= 1` first, so it cannot pass on an empty screen.
  - `To do: every text box, picker and button is at least 44px tall`: `openTab('todo')`; root `#tab-todo`; selector `input[type=text], input[type=date], select, button`; `{ h: 44 }`; `small === 0`.
  - `To do and Uniforms: tick boxes sit in a tap area at least 44px tall`: for each `input[type=checkbox]` under `#tab-todo` and `#uniWrap`, its closest `label` (or the input itself if none) is at least 44px tall.
  - `name links in lists are at least 44px tall`: for roots `#tab-todo`, `#attendWrap`, `#tab-stats`, `#tab-store`, `#teamsWrap` (open each tab first), selector `td a[data-person], .todocard h3 a[data-person]`; `{ h: 44 }`; total `n >= 1` across roots (some lists can be empty on TEST data; the To do and Attendance roots must each have `n >= 1`).
  - `a name link inside a sentence keeps its line height`: on Color teams, any `li a[data-person]` or `.bad a[data-person]` is under 30px tall (skip with a logged note if TEST data shows none; say so in the commit).
  - `Uniforms: date boxes, text boxes, Today buttons and the "no date" tick are at least 44px tall`: `openTab('uniforms')`; root `#uniWrap`; selector `input[data-udate], input[type=text], .todaybtn, label.uov`; `{ h: 44 }`.
  - `Attendance: the Move button is at least 44 x 44`: root `#attendWrap`; selector `table.att button.movebtn`; `{ w: 44, h: 44 }`.
  - `tap areas in one Attendance row do not overlap`: for the first 10 `table.att tbody tr`, the rects of `.movebtn`, `a[data-person]` and each `td.chk label` pairwise do not intersect (allow 0.5px).
  - `no text box on To do or Uniforms makes iOS zoom`: every visible `input[type=text], input[type=date], select` under `#tab-todo` and `#uniWrap` has computed `font-size >= 16px`.
  - `on a computer nothing changed`: new context 1280 x 800, no touch; first `#attendWrap a[data-person]` is under 30px tall; `button.movebtn` under 44px wide; first `#uniWrap input[data-udate]` under 44px tall.
  - Log (not assert): Attendance rows in the 844px viewport, and To do cards in the viewport, before the change.
  Run: `cd dev/app && NODE_PATH=/tmp/claude-1000/shim/node_modules node test/touch-targets-browser.test.js`. Expected: the four size tests and the iOS test FAIL with sizes near the review's (To do 24-30, links 15-20, Uniforms 28, Move 26 wide); overlap, prose and computer PASS. Put the measured numbers in the commit message.
- [ ] **Step 2: Implement** one block in `style.css`, placed after the R4 rule at `:337` (end of the `@media (max-width: 760px)` block that starts at `:287`) or as its own block right after that block:
  Use `@media (max-width: 760px)` for everything below (not `(pointer: coarse)`): the coarse-pointer tablet layout was not measured (open question 3).
  - `#tab-todo input[type=text], #tab-todo input[type=date], #tab-todo select, #tab-todo button, #uniWrap input[type=text], #uniWrap input[type=date], #uniWrap .todaybtn { min-height:44px; font-size:16px; }`
  - `#tab-todo label:has(> input[type=checkbox]), #uniWrap label.uov { display:inline-flex; align-items:center; gap:6px; min-height:44px; }` plus the tick at 22px (the phone rule at `:318` already sets checkboxes 22px).
  - `td a[data-person], .todocard h3 a[data-person] { display:inline-flex; align-items:center; min-height:44px; }` (text size unchanged; only the tap area grows).
  - Replace the Move button part of `:445` with `table.att td.mvcell .movebtn { margin:0; min-width:44px; min-height:44px; padding:0 6px; font-size:14px; opacity:.8; }` (keep `.rn { display:none }`).
  If the To do `size="60"` note box (`app-todo.js`, `#tdNoteText`) overflows 390px at 16px, add `#tdNoteText { width:100%; }` in the same block (`no-nested-scroll` and `table-wrap` tests will show it).
- [ ] **Step 3: Run** the file again (expected: all PASS; log the rows and cards per screen after), then the tests the CSS can disturb: `phone-attendance.test.js`, `attendance-landscape-browser.test.js`, `attend-steps-browser.test.js`, `attend-person-browser.test.js`, `uniform-order-browser.test.js`, `uniform-given-browser.test.js`, `todo-date-entry-browser.test.js`, `todo-book-medical-browser.test.js`, `book-todo-browser.test.js`, `table-wrap-browser.test.js`, `no-nested-scroll-browser.test.js`, `print-layout-browser.test.js`. Expected: PASS. If `phone-attendance` pins the old Move size, update its number with a comment citing R12.
- [ ] **Step 4: Commit** `style.css` and the test ("R12: 44px phone targets on To do, Uniforms, name links, Attendance Move"), with before/after sizes and rows per screen. No version bump (CSS and tests only).

### Task 2: Unsaved work in words on a phone

**Files:** Modify `dev/app/test/save-dot-browser.test.js`, `dev/app/style.css:326`, `dev/app/app-season.js` (`status()`, line 160).

**Interfaces:**
- Consumes: `#seasonStatus` text from `status()` (`app-season.js:158`), classes `dirty` and `nudge` (`:159`).
- Produces: on a phone, `#seasonStatus` shows its own text whenever it has class `dirty` (no dot); a clean file shows nothing there (as on a computer, `style.css:390`). `#btnSeasonSave` gets `aria-label` = its visible text + `", N unsaved edits"` (or `", unsaved changes"`) while dirty, and no `aria-label` when clean (its `title` stays as now).

- [ ] **Step 1: Failing tests.** Add a phone `open` variant (390 x 844, `hasTouch`, `isMobile`, `acceptDownloads`), reusing the file's edit snippet (`Season.setMark(...)`, `App.commitScope(() => App.changed())`).
  - `on a phone a clean file shows no unsaved words`: `#seasonStatus` is not displayed, or its computed `font-size` is 0 and it has no `::before` content (`getComputedStyle(el, '::before').content` is `none` or `normal`).
  - `on a phone one edit says "1 unsaved edit" in readable words`: after one edit, `#seasonStatus` is visible, `innerText` matches `/^1 unsaved edit$/`, computed `font-size >= 12px`, `::before` content is `none`, and its rect is inside the viewport.
  - `Download stays fully on screen with the words showing, and nothing scrolls sideways`: with 20 edits made (loop), `#btnSeasonSave` rect is within `0..390`, and `document.documentElement.scrollWidth <= 390`.
  - `saving clears the words`: two presses of `#btnSeasonSave` (TEST file), then as the clean test.
  - `the Download button's name says unsaved while dirty`: `aria-label` matches `/unsaved/` after an edit, attribute absent after save.
  - `on a computer the chip is unchanged`: 1280 x 800: after an edit, text `1 unsaved edit` and background `rgb(255, 243, 224)` (as `header-browser.test.js:28` checks).
  Run: `NODE_PATH=/tmp/claude-1000/shim/node_modules node test/save-dot-browser.test.js`. Expected: the phone words and `aria-label` tests FAIL (font-size 0 today; no `aria-label`).
- [ ] **Step 2: Implement.** In the phone block at `style.css:326` replace the dot rules with: `#seasonStatus:not(.dirty) { display:none; } #seasonStatus.dirty { font-size:13px; font-weight:600; color:var(--warn); background:#fff3e0; border:1px solid #ef6c00; border-radius:12px; padding:1px 8px; white-space:nowrap; }` (the same chip the computer has at `:499`; check the dark theme's `--warn` contrast on `#fff3e0`, `style.css:5` block, and use a dark-theme pair if under 4.5:1). Keep `.nudge` (bold, underlined, `style.css:19`) so the overdue state still differs in shape, not only colour. Update the comment at `:320` ("a dot for unsaved changes") to say "the unsaved words". In `status()` (`app-season.js:160`) set or remove `aria-label` on `dl` next to the existing `title`. Bump `app-season.js` line 1 to `1.87.2`.
- [ ] **Step 3: Run** `save-dot-browser`, `header-browser`, `save-style-browser`, `tab-scroll-browser`, `a11y-browser`. Expected: PASS. If Download is pushed off screen at 20+ edits, shorten the phone text with CSS only is impossible (it is text content): instead cap the chip at `max-width:9em; overflow:hidden; text-overflow:ellipsis` and re-run; record the choice.
- [ ] **Step 4: Commit** ("R12: unsaved edits in words on a phone").

### Task 3: A Save bar when unsaved work has waited too long

**Files:** Modify `dev/app/index.html`, `dev/app/app-season.js` (`status()`, near `:149-166`), `dev/app/style.css`, `dev/app/test/save-dot-browser.test.js`.

**Interfaces:**
- Consumes: `overdue()` (`app-season.js:152`), `App.testGate` (`app.js:53`), the `#btnSeasonSave` click path (`app-season.js:244`), Task 1's `measureIn`/`openTab` (copy them into `save-dot-browser.test.js`; the test files do not share modules today).
- Produces: in `index.html`, directly after `#draftBar` (`index.html:73`): `<div id="saveNudge" class="savenudge" role="status" hidden><span id="saveNudgeText"></span><button type="button" id="saveNudgeLater">Later</button><button type="button" id="saveNudgeBtn" class="primary">Save now</button></div>`.
- Produces in `app-season.js`: a snooze baseline `nudgeFrom = { edits: 0, at: null }`; `overdue()` becomes `dirty && (edits - nudgeFrom.edits >= NUDGE_EDITS || since >= NUDGE_MINUTES)` where `since` counts from `nudgeFrom.at || unsavedSince`. `markEdit` from clean and `markSaved` reset `nudgeFrom`. Later sets `nudgeFrom = { edits, at: Date.now() }`. `status()` sets `$('saveNudge').hidden = !(overdue() && phone() && !modalOpen())` with `phone = () => matchMedia('(max-width: 760px)').matches` and `modalOpen = () => !!document.querySelector('dialog[open], .modal-wrap:not([hidden]), .savemenu:not([hidden])')`; toggles `document.body.classList` `nudging`. Text: `N edits are not saved yet.` (edits rule) or `Changes from the last M minutes are not saved yet.` (time rule; M = whole minutes since `unsavedSince`). `#saveNudgeBtn` click: `$('btnSeasonSave').click()` (so Drive mode, the TEST two-press gate and the save menu behave exactly as the top button). Also call `status()` on `toggle`/`close` of dialogs is not needed: the 30-second interval and every edit re-run it; a dialog opening mid-nudge hides the bar on the next `status()` (accept, or add a `close` listener on `#dlg` if the test shows a stale bar).
- Desktop: unchanged. The bar is phone only; a computer keeps the bold underlined chip (`.nudge`).

- [ ] **Step 1: Failing tests** (phone context unless stated):
  - `after 20 unsaved edits a Save bar appears with 44px buttons`: 20 edits in one `evaluate` loop; guard: `#seasonStatus` reads `20 unsaved edits`; `#saveNudge` visible; text matches `/20 edits are not saved yet/`; `measureIn(p, '#saveNudge', 'button', { w: 44, h: 44 }).small === 0` with `n === 2`.
  - `19 edits show no bar`.
  - `after 15 minutes the bar appears with one edit`: `await p.clock.install()` before `goto`; one edit; `p.clock.fastForward('15:30')`; bar visible; text matches `/last 15 minutes/`.
  - `Save now saves and the bar goes away`: press `#saveNudgeBtn` twice (TEST file gate); a download event fires; bar hidden; `#seasonStatus` not displayed.
  - `Later hides the bar until 20 more edits`: Later; bar hidden; 19 more edits: hidden; 1 more: visible with `/40 edits/`.
  - `the bar covers nothing at the bottom`: with the bar showing, on Attendance scroll to the end: the rects of `.attfoot` and the last `table.att tbody tr` are above the bar's top; same on a child's Progress sheet for `.prfoot`; `body` has `padding-bottom` at least the bar's height.
  - `a toast sits above the bar`: call `App.flash('x')` (`app.js:519`); `#flash` rect bottom is above the bar's top.
  - `no bar while a dialog or the Save menu is open`: open the Save menu (`#saveMenuBtn`, shown only when Drive is on: skip that half with a logged note if hidden on TEST data) and a dialog (`#dlg`); bar hidden; close: bar back after the next `status()`.
  - `no bar on a computer`: 1280 x 800, 20 edits: `#saveNudge` hidden; the chip still has class `nudge`.
  - `the bar does not print`: `p.emulateMedia({ media: 'print' })`; bar not displayed.
  Run: `NODE_PATH=/tmp/claude-1000/shim/node_modules node test/save-dot-browser.test.js`. Expected: the bar tests FAIL (no element).
- [ ] **Step 2: Implement.** Element, `status()` changes and two click listeners as above. CSS: `.savenudge { display:none; }` globally; in `@media (max-width: 760px)`: `.savenudge:not([hidden]) { display:flex; position:fixed; left:0; right:0; bottom:0; z-index:35; gap:8px; align-items:center; padding:6px 8px calc(6px + env(safe-area-inset-bottom)); background:#fff3e0; border-top:2px solid #ef6c00; font-weight:600; } .savenudge span { flex:1 1 auto; } .savenudge button { min-height:44px; min-width:44px; } body.nudging { padding-bottom:72px; } body.nudging #flash { bottom:84px; }`; `@media print { .savenudge { display:none !important; } }` (add `#saveNudge` to the list at `style.css:257`). z-index 35: above `.prpin` (30), below `.moremenu` (40), the Save menu and info boxes (60, 65) and the splash (20 is lower: hide the bar while `#splash` shows, by the "no file" case: `overdue()` is false with no season). Bump `app-season.js` (`1.87.3` if Task 2 was committed separately, else one bump for both).
- [ ] **Step 3: Run** `save-dot-browser`, `touch-targets-browser`, `header-browser`, `person-bar-browser`, `pinned-person-bar-browser`, `update-autosave-browser`, `a11y-browser`, `print-layout-browser`, and `versions.test.js` (node). Expected: PASS.
- [ ] **Step 4: Manual and (i).** `info.js`: in the saving entry (the `files.bar` area near line 14) add one sentence: "On a phone the top bar says how many edits are unsaved, and after 20 edits or 15 minutes a Save bar appears at the bottom (Later hides it for another 20 edits or 15 minutes)." Bump `info.js` to `1.21.1`. Run `node dev/tools/sync-guide.js` (from the repo root), then `cd dev/app && node test/info.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** ("R12: Save bar on a phone when unsaved work waits; replaces R9").

### Task 4: Release, docs and the phone check

**Files:** Modify `dev/app/index.html` (`app-version` line 6, `app-build` line 7), `CHANGELOG.md`, `README.md`, `BACKLOG.md`, `docs/playtest-checklist.md`.

- [ ] **Step 1: Release bump.** Compare `dev/app/index.html` `app-version` with `deploy/app/index.html`. If dev is already ahead (1.51.06 was "in dev, not deployed" on 2026-11-13), R12 rides in that release: bump only `app-build` to the day if it changed. Otherwise bump `app-version` to the next free `1.51.x` and `app-build` to the day.
- [ ] **Step 2: Sweep.** `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh`. Expected: no failures beyond the known baseline (see the memory note on app tests; name any failure and show it also fails without these commits).
- [ ] **Step 3:** `sh make-deploy.sh` runs clean (it refuses unbumped changes). Do not rsync.
- [ ] **Step 4: Docs.** CHANGELOG "Next release" section: the sizes, the words, the Save bar and Later. README phone paragraph: name links, To do, Uniforms and Move are 44px; unsaved edits are shown in words; the Save bar. BACKLOG: R12 "done in dev (version), phone check open"; R9 "skipped by decision: the unsaved state is made louder under R12 instead"; add the open questions below that Mike has not answered. `docs/playtest-checklist.md`: a "Phone: R12" list (Step 6).
- [ ] **Step 5: Commit** and report rows/cards per screen before and after.
- [ ] **Step 6 (Mike, on his own phone with the TEST club from Try it out; no script can do this):**
  1. Attendance for one class: tick ten children with a thumb. Any mis-tap on a name, a tick or Move?
  2. To do: type a handbook code, pick a color, tick "read". Does an iPhone zoom when a box is tapped?
  3. Uniforms: tap a date box, Today and "no date". Are the date boxes the size the phone draws them (iOS and Android draw date inputs their own way)?
  4. Make one edit: does the top bar say "1 unsaved edit" readably? Make 20: does the Save bar appear, does it hide anything you need, does Save now save, does Later behave?
  5. Turn the phone sideways on Attendance and on a Progress sheet with the bar showing.
  6. On club night: was the bar a help or a nuisance during check-in? (answers open question 1)

## Open questions for Mike
1. **Save bar during check-in.** 20 Present ticks arrive in a few minutes, so the bar will appear mid check-in. Is that wanted (a save point), or should Attendance ticks count less (for example, the bar waits for 15 minutes on the Attendance tab)? On a download-only phone every save is another file in Downloads; with Drive it is in place.
2. **Attendance tick cells are 34px wide on a phone** (`style.css:335`), under 44, found while checking R12. Widening them may not fit 390px with all columns. Leave as is (they are 44 tall and the whole cell is the target), or test 44 wide and accept a sideways scroll?
3. **Coarse-pointer tablets** (wide screen, touch): this plan changes phones only (max-width 760). Should To do, Uniforms and links get 44px on a touch tablet too, like the existing Progress rule at `style.css:530`?
4. **Clean state on a phone**: show nothing (this plan, like the computer) or "saved HH:MM"?

## Risks
- Taller links make To do, Stats, Store and Color teams lists longer on a phone (not Attendance; see check 6). Measured and reported, not asserted.
- `:has()` in the To do tick rule needs Safari 15.4+ and Chrome 105+; acceptable for the club's phones, but if Mike reports an old iPhone, replace it with a class on the label in `app-todo.js` (and bump it).
- The 15-minute test depends on Playwright's clock driving `setInterval`; if it is flaky, test the time rule by setting the clock before the edit instead.
- Behaviour of `overdue()` changes (snooze baseline); the computer's `.nudge` chip follows it too, so Later on a phone also quiets the computer-style nudge in that tab. Intended.

## Self-review
- Spec coverage: the four measured targets plus Uniforms text boxes (Task 1); words, not colour (Task 2); louder in place of R9 (Task 3); phone check, docs, release (Task 4).
- Names: `measureIn`, `openTab` (Tasks 1, 3); `#saveNudge`, `#saveNudgeText`, `#saveNudgeBtn`, `#saveNudgeLater`, `body.nudging`, `nudgeFrom` (Task 3).
- No data-format change: `DATA-FORMAT.md`, `data-format-doc.test.js`, `Season.SECTIONS` and the anonymizer are not touched (Later's snooze is in memory only, not in the file).
