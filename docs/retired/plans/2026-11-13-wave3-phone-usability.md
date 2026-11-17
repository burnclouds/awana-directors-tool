# Wave 3: phone usability (R12) Implementation Plan

> **R22 (2026-11-13):** the phone splash screen covered by the menu bar has its own plan, `items/R22-phone-splash-header.md`. Do it before Wave 2 (first release after 1.51.06); its phone check joins this wave's phone check (Task 4).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a phone, everything a leader taps on To do, Uniforms, Attendance and the name links is at least 44px, and unsaved work is said in words and gets louder the longer it waits.

**Architecture:** CSS only for the touch sizes (phone and coarse-pointer media rules in `style.css`), pinned by the existing phone test. The unsaved state gets text in the status chip and a bottom bar with a Save button once the existing "overdue" rule fires (`app-season.js` `overdue()`: 20 edits or 15 minutes). No data-file change.

**Tech Stack:** Vanilla JS and CSS, Playwright 1.64 (Chromium, 390 x 844, touch) for the tests.

**Spec:** `dev/REVIEW-2026-11-12-whole-project.md` recommendation 12 and BACKLOG R12 (measured at 390px: To do inline inputs 24 to 30px tall, name links 15 to 20px, Uniforms dates 28px, the Attendance move button 26px wide; unsaved state is a colored dot only, `style.css:326`). Decision on R9 (roadmap): no crash-recovery draft; **make the unsaved state louder here instead**.

## Global Constraints
- Use the Edit and Write tools to change files. Tests may run anything.
- Never open a real data file; tests use `dev/test-data`.
- Browser tests run from `dev/app` with `NODE_PATH=/tmp/claude-1000/shim/node_modules`; the sweep is `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh`.
- Each changed `.js` or `.html` file bumps its own version line; `app-version`/`app-build` are bumped once, in the last task. `style.css` has no version line, so a CSS-only change still needs the release bump before `make-deploy.sh` will build.
- Print layouts must not change: every rule added here sits inside `@media (max-width: 760px)` or `@media (pointer: coarse)`.
- Do not deploy; Mike says "deploy". Commit messages end with the two attribution lines given in the session.

## What the review got right and wrong
- The four size findings are the reviewer's measurements; Task 1 step 1 measures them again before anything changes (they may have moved since 1.51.05).
- "Unsaved state on a phone is a colored dot only" holds: `style.css:326` sets `#seasonStatus { font-size:0 }` and draws a dot, except when `.nudge` is on.
- `test/mobile-audit.js` is **not** the place for these checks: it already fails on 12 print-layout report screens by design and is not in the sweep (BACKLOG R4 note). The checks go in `touch-targets-browser.test.js`, which is.

## Review Focus
1. **Attendance at the door gets slower.** Taller name links make taller rows, so fewer children fit on one screen. Owner: Task 1 measures rows per screen before and after; Mike decides on the phone (Task 4).
2. **A 44px link next to a 44px checkbox causes mis-taps**, the opposite of the aim. Owner: Task 1's test for a gap between tap areas; Mike on the phone.
3. **The bottom Save bar covers something**: the phone's Previous / child / Next bar (`#prPin`), the Attendance foot (`.attfoot`), or an open dialog. Owner: Task 3's overlap test.
4. **iOS Safari draws date inputs at its own height.** Chromium cannot show this. Owner: Task 4 (Mike, real phone).
5. **A tablet with a mouse** (wide screen, fine pointer) must look as it does now. Owner: Task 1's desktop assertion.

## File Structure
| File | Change | Responsibility |
|---|---|---|
| `dev/app/style.css` | modify | Phone and coarse-pointer sizes for To do controls, name links, Uniforms dates and tick boxes, the Attendance move button; the status chip's text; the Save bar. |
| `dev/app/app-season.js` | modify | `status()` writes the short phone text and shows or hides the Save bar. |
| `dev/app/index.html` | modify | The Save bar element. |
| `dev/app/test/touch-targets-browser.test.js` | modify | Measures the four areas. |
| `dev/app/test/save-dot-browser.test.js` | modify | The unsaved state in words; the Save bar. |
| `docs/playtest-checklist.md` | modify | The by-hand phone checks. |

---

### Task 1: The four small targets are 44px on a phone

**Files:**
- Modify: `dev/app/test/touch-targets-browser.test.js`, `dev/app/style.css`

**Interfaces:**
- Produces: in the test file, `measureIn(p, rootSelector, selector, min) -> { n, small, sample }` where `min = { w, h }`: counts visible elements under the root matching the selector whose box is under `min` (0.5px tolerance, as the existing `measure` uses). Task 3 reuses it.

- [ ] **Step 1: Failing tests** (phone context already set up in the file: 390 x 844, touch). Add, each with a "there is something to measure" guard (`n >= 1`) so it cannot pass on an empty screen:
  - `To do: every box, picker and button in a row is at least 44px tall`: open the To do tab; root `#tab-todo`; selector `input:not([type=checkbox]):not([type=radio]), select, button`; `min { h: 44 }`. Also every `input[type=checkbox]` there sits in a label or cell at least 44 x 44.
  - `name links are at least 44px tall wherever a list is tapped`: roots `#tab-todo`, `#attendWrap`, `#tab-awards`, `#tab-roster`; selector `a[data-person]`; `min { h: 44 }`.
  - `Uniforms: the date boxes and the "no date" tick are at least 44px tall`: open the Uniforms tab; selector `input[data-udate], label.uov`; `min { h: 44 }`.
  - `Attendance: the move button is at least 44px wide and tall`: selector `table.att button.movebtn`; `min { w: 44, h: 44 }`.
  - `two tap areas in one Attendance row do not overlap`: for the first 10 rows, the boxes of `a[data-person]`, `.movebtn` and each `td.chk label` do not intersect.
  - `on a computer nothing changed`: a second context (1280 x 800, no touch): the first `a[data-person]` on Attendance is under 30px tall and `button.movebtn` under 44px wide.
  Record the measured sizes that fail in the commit message. Run: `NODE_PATH=/tmp/claude-1000/shim/node_modules node test/touch-targets-browser.test.js`. Expected: the first four FAIL with sizes near the review's (24 to 30, 15 to 20, 28, 26).
- [ ] **Step 2: Record rows per screen.** In the same run, log (not assert) how many Attendance rows fit in the 844px viewport before the change.
- [ ] **Step 3: Implement** in `style.css`, in one block near the other phone rules, under `@media (max-width: 760px), (pointer: coarse)`:
  - `#tab-todo` inputs, selects and buttons: `min-height:44px`; text inputs `font-size:16px` (below 16px iOS zooms the page on focus).
  - `a[data-person]`: `display:inline-flex; align-items:center; min-height:44px;` (the link keeps its text size; only its tap area grows).
  - `input[data-udate]`, `label.uov`: `min-height:44px`; the tick inside `label.uov` at least 22px.
  - `table.att td.mvcell .movebtn`: `min-width:44px; min-height:44px;` (replace the phone rule at `style.css:445` that sets `padding:4px 6px`).
- [ ] **Step 4: Run** the file again, and the layout tests the change can disturb: `phone-attendance.test.js`, `attendance-landscape-browser`, `attend-steps-browser`, `uniform-order-browser`, `uniform-given-browser`, `todo-date-entry-browser`, `todo-book-medical-browser`, `table-wrap-browser`, `no-nested-scroll-browser`, `print-layout-browser`. Expected: PASS. Log rows per screen after; put both numbers in the commit message for Mike.
- [ ] **Step 5: Commit.**

### Task 2: Unsaved work is said in words on a phone

**Files:**
- Modify: `dev/app/app-season.js` (`status()`), `dev/app/style.css:326`, `dev/app/test/save-dot-browser.test.js`

**Interfaces:**
- Produces: `#seasonStatus` carries `data-short`: `''` when the file is clean, `'Not saved'` when there are unsaved changes with no count, `'Not saved: N'` with the count of unsaved edits. On a phone the chip shows that text (not a dot) whenever it is not empty; a clean file shows nothing there.

- [ ] **Step 1: Failing tests** (`save-dot-browser.test.js`, add a phone context 390 x 844):
  - `on a phone a clean file shows no unsaved text`: `#seasonStatus` has `data-short === ''`.
  - `on a phone an edit says "Not saved: 1" in words, readable without color`: after one Present tick, the chip's rendered text (`getComputedStyle(el, '::before').content` or its text, whichever carries it) matches `/Not saved: 1/`, its font size is at least 12px, and its box is wider than 60px.
  - `saving clears it`.
  - `the Save button's accessible name says it too`: `#btnSeasonSave` has `aria-label` matching `/unsaved/i` while dirty and none when clean.
  Run. Expected: FAIL (a dot with `font-size:0` today).
- [ ] **Step 2: Implement.** `status()` sets `el.dataset.short` and the button's `aria-label`. CSS, phone rule: `#seasonStatus { font-size:0 }` stays for the clean state; `#seasonStatus[data-short]:not([data-short=""])::before { content: attr(data-short); font-size:13px; font-weight:600; color:var(--warn); }` and the orange chip border the desktop rule (`style.css:499`) already uses. The dot rule is removed.
- [ ] **Step 3: Run** `save-dot-browser`, `header-browser`, `save-style-browser`, `tab-scroll-browser`, `a11y-browser`. Expected: PASS (the header must still fit 390px with no sideways scroll: `header-browser` checks it; if the chip pushes Download off screen, shorten to `Not saved` with the count in the bar of Task 3).
- [ ] **Step 4: Commit.** Bump `app-season.js`.

### Task 3: A Save bar when unsaved work has waited too long

**Files:**
- Modify: `dev/app/index.html` (one element before `</body>`'s scripts), `dev/app/app-season.js` (`status()`), `dev/app/style.css`, `dev/app/test/save-dot-browser.test.js`

**Interfaces:**
- Consumes: `overdue()` (`app-season.js:152`: `dirty` and 20 edits or 15 minutes), `App.saveNow()`, Task 1's `measureIn`.
- Produces: `<div id="saveNudge" role="status" hidden><span id="saveNudgeText"></span><button id="saveNudgeBtn" class="primary">Save now</button></div>`, fixed to the bottom of the screen on a phone only, shown while `overdue()` is true and no dialog is open, hidden as soon as the file is saved. Text: `N edits are not saved yet.` (or `Changes from the last 15 minutes are not saved yet.` when the time rule fired first).
- Produces for tests: `App.nudgeAfter(edits, minutes)` sets the two thresholds (defaults 20 and 15), the way `App.driveSavedMs` exists for the save flash.

- [ ] **Step 1: Failing tests** (phone context):
  - `after 20 unsaved edits a Save bar appears at the bottom, with a button at least 44px tall`: `App.nudgeAfter(3, 15)`; three Present ticks; `#saveNudge` is visible, its text matches `/3 edits are not saved yet/`, `measureIn(p, '#saveNudge', 'button', { h: 44 }).small === 0`.
  - `pressing it saves and the bar goes away`: one download (TEST files need the second press: use the file's existing two-press helper), `#saveNudge` hidden, `data-short === ''`.
  - `the bar never covers the child bar, the Attendance foot or the last row`: with the bar showing on Attendance and on a child's Progress sheet, the bar's box does not intersect `#prPin` or `.attfoot`, and after scrolling to the bottom the last row's box is above the bar (the page gets bottom padding equal to the bar's height while it shows).
  - `no bar on a computer`: desktop context, same edits, `#saveNudge` is not displayed.
  - `no bar while a dialog is open`.
  Run. Expected: FAIL (no such element).
- [ ] **Step 2: Implement.** `status()` toggles the bar; `#saveNudgeBtn` calls the same handler as `#btnSeasonSave` (through `App.testGate`). CSS: `#saveNudge { display:none }` by default; in the phone rule `position:fixed; left:0; right:0; bottom:0;` with `padding-bottom: env(safe-area-inset-bottom)`; `body.nudging { padding-bottom: <bar height> }`.
- [ ] **Step 3: Run** `save-dot-browser`, `touch-targets-browser`, `person-bar-browser`, `pinned-person-bar-browser`, `flags-browser`, `update-autosave-browser`, `a11y-browser`, `versions.test.js`. Expected: PASS.
- [ ] **Step 4: Manual and (i) note.** `info.js`: one sentence under saving ("On a phone the top bar says Not saved, and after 20 edits or 15 minutes a Save bar appears at the bottom."), then `node dev/tools/sync-guide.js`; `node test/info.test.js`. Expected: PASS.
- [ ] **Step 5: Commit.** Bump `app-season.js`, `index.html`, `info.js`.

### Task 4: Wave 3 wrap-up and the phone check

**Files:**
- Modify: `dev/app/index.html` (`app-version`, `app-build`), `CHANGELOG.md`, `README.md`, `BACKLOG.md`, `docs/playtest-checklist.md`

- [ ] **Step 1:** Bump `app-version` to the next free `1.51.x` and `app-build` to the day.
- [ ] **Step 2:** The sweep. Expected: no failures.
- [ ] **Step 3:** `sh make-deploy.sh` runs clean. Do not rsync.
- [ ] **Step 4:** `docs/playtest-checklist.md` gains "Phone, Wave 3" (below). CHANGELOG, README (the phone paragraph: sizes and the Save bar), BACKLOG R12 "done in dev, phone check open"; R9 "skipped by decision: unsaved state made louder under R12".
- [ ] **Step 5: Commit** and report, with rows per screen before and after.
- [ ] **Step 6 (Mike, on his own phone, with the TEST club from Try it out; nothing here can be tested by a script):**
  1. Attendance for one class: tick ten children with your thumb. Any mis-taps on the name or the move button? Are enough children on one screen?
  2. To do: type a handbook code and pick a color team without zooming. Does the page zoom when a box is tapped (iPhone)?
  3. Uniforms: tap a date box and the "no date" tick.
  4. Make 20 edits without saving: does "Not saved: N" show at the top, does the Save bar appear, does it cover anything you need, does Save now work?
  5. Turn the phone sideways on Attendance and on a Progress sheet: is the Save bar still out of the way?
  6. An iPhone and an Android phone if both are in the club: the date boxes are drawn by the phone, and only a real one shows their height.
  Anything wrong goes back as a follow-up task with the screen and what was tapped.

## Self-review
- **Spec coverage:** the four measured targets, Task 1; the unsaved state in words, Task 2; "louder" in place of R9, Task 3; the phone check, Task 4.
- **Names:** `measureIn` (Tasks 1 and 3); `data-short` (Tasks 2 and 3); `App.nudgeAfter`, `#saveNudge`, `#saveNudgeBtn`, `#saveNudgeText` (Task 3).
- **Proportion:** three small tasks and a by-hand list; the only code shown is the element and the CSS the tests pin.
