# Color Teams, Part 1: Year Grid, Projection, Locking, Recalculation Implementation Plan

> **Executed 2026-11-03 (app 1.50.3).** All nine tasks done in branch `worktree-color-teams-part1`, followed by a fix pass from the final review. Rulings and results are in `.superpowers/sdd/2026-11-03-color-teams-part1/progress.md`; the as-built description is `COLOR-TEAMS.md`. Differences from this plan: `Teams.attempt` gained an optional cost parameter (instead of a `Teams.solve` refactor); `unlock` takes the calendar and date; the three solver-fixed goals are not orderable; a Fill button and a balance note were added; locking keeps the projection marks.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Color teams view with a year grid (Q1 to Q4) whose quarters are Locked, Ready to lock, or Projected, with minimum-change recalculation, attendance-aware balance, configurable priorities, and a "Why these teams" panel.

**Architecture:** A new pure module `teamplan.js` holds quarter states, locks, pin detection, attendance turnout, and the projection/recalculation engine, built on the existing min-cost-flow solver in `teams.js`. A new `app-teamgrid.js` renders the grid and panel inside the existing Color teams sub-tab. Teams stay in `team:Qn` on each roster person exactly as today; only a small config block is added to the season file.

**Tech Stack:** Vanilla JS (UMD-style modules like `teams.js`), Node assert tests under `dev/app/test/`, Playwright browser tests (NODE_PATH to a playwright 1.63.0 install outside the project).

**Spec:** `database/docs/superpowers/specs/2026-11-03-color-teams-design.md` (approved 2026-11-03). Read it first; sections "What Mike decided" and "My calls" are the requirements. This plan is **part 1 of 3**: parts 2 (mid-quarter move flow, friend placement) and 3 (class rules, Visitor tab) get their own plans.

## Decisions this plan makes (the spec left them to the builder)

- **Storage.** The projection is **stored**, not recomputed from a seed. Reason: minimum-change recalculation depends on the previous projection, which is history, so it cannot be derived. Cost is nil: colors already live in `team:Q1..Q4` on each person. New data is one block, `season.config.teamPlan = { locked: { Q2: 'YYYY-MM-DD' }, proj: { <id>: 'RBG-' }, prio: { order: [...], off: [...] } }`. `proj[id]` is four characters (Q1 to Q4), one of `R B G Y` or `-`, and records the color the engine projected.
- **Pin detection without instrumenting write paths.** A child's color in an unlocked quarter is a **pin** when `team:Qn` is non-blank and differs from `proj[id][n]`. Person tab, Roster column, CSV import and the grid all keep writing `team:Qn` as they do now; no write path changes. A locked quarter's `proj` characters are set to `-`.
- **First-night rule.** A quarter is auto-locked once its first club night (`Calendar.nights(calendar, q)` sorted by `Date`, first one) is on or before today. A quarter with no calendar nights is never auto-locked and reads as Projected.
- **Existing data.** An older file has no `teamPlan`: every non-blank color in an unlocked quarter is then a pin, so nothing already entered is ever moved. Quarters already started read as Locked.
- Part 1 ships as **1.50.2**; every changed `.js` file's line-1 version is bumped (the deploy script refuses otherwise). Do not deploy; Mike asks for deploys.

## Global Constraints

- App versions stay in the **1.50.x** series (third number only). Do not change the data-file format version unless a task says so; new config must be optional so older files open and an app without it ignores it.
- Never store a derivable value; keep the file small (version 5 compact format).
- Balancing is **per group** (Sparks, T&T), never per class. The by-class view is a slice.
- Hard rules, never configurable: locked quarters, pins, hand moves. Soft priorities (default order, most to least important): (1) never repeat a color within the year; (2) friend placement (part 2, reserve the slot); (3) even head count; (4) keep former teammates apart; (5) even expected turnout from past attendance, default **on**; (6) spread each grade across teams, default **on**, lowest priority, a soft tiebreak.
- A recalculation must say how many children it changes and never move a pin or a locked quarter.
- Real children's data must never appear in tests, demo data, screenshots or commits. Test people are invented. Demo data keeps `"fake": true`.
- Every new control keeps the app's accessibility work: a visible focus ring, an accessible name, 44px tap targets under 760px and under `(pointer: coarse)`.
- Match the existing style: dense, commented `//` lines explaining rules, `esc()` on every inserted string, no dependencies.

## Review Focus

- A new child with no color in an already locked quarter: shown as "none", never silently assigned, and the projection still gives them the open quarters.
- A child who already had all four colors in earlier quarters: the no-repeat rule must relax for them (as `teams.js` does today), not crash or leave them unassigned.
- A group of fewer than four children, or one team empty: no divide-by-zero, no NaN in turnout, and the grid still renders.
- A season with no calendar nights for a quarter, or no attendance yet: states and turnout fall back (Projected; group average) without errors.
- An old file with colors in `team:Q2..Q4` and no `teamPlan`: opens, nothing moves, those colors show as pinned.
- A recalculation when nothing needs to change says "changes 0 children" and offers nothing to accept.
- An undo of a recalculation or lock restores the previous state (History lines like other edits).

## File Structure

- Create `dev/app/teamplan.js`: states, locks, pins, turnout, projection, recalculation, priorities, reasons. Pure, no DOM.
- Create `dev/app/app-teamgrid.js`: renders the grid, scope switch, panel, buttons; wires events.
- Modify `dev/app/teams.js`: export a generalized solver (Task 3). Modify `dev/app/season.js`: optional `config.teamPlan` (normalize, validate, reset on new year at ~line 261). Modify `dev/app/app.js`: mount the grid in `renderTeams`, lock prompt on print. Modify `dev/app/app-options.js`: priorities section. Modify `dev/app/index.html`: script tags (order matters, see `test/versions.test.js`), grid container, manual text, version. Modify `dev/app/style.css`: state headers, chips, panel.
- Tests: `test/teamplan.test.js`, `test/teamgrid-browser.test.js`; extend `test/teams.test.js`, `test/options-browser.test.js`.
- Docs: README "Tests" list and the manual in `index.html`; update `SHEET-TABS.md` if it lists the Color teams tab.

---

### Task 1: Config, quarter states, locks, pins

**Files:** Create `dev/app/teamplan.js`, `dev/app/test/teamplan.test.js`. Modify `dev/app/season.js` (config default, validate, new-year reset).

**Interfaces:**
- Produces: `TeamPlan.config(season) -> { locked, proj, prio }` (always returns all three, creating nothing in the file until a write); `TeamPlan.stateOf(season, calendar, q, today) -> 'locked' | 'ready' | 'projected'`; `TeamPlan.lock(season, q, date)`, `TeamPlan.unlock(season, q)`; `TeamPlan.isPinned(master, season, person, q) -> boolean`; `TeamPlan.setProjected(season, id, q, color | '')`.
- 'ready' = the next quarter that is not locked and whose first night is within 21 days (a named constant `READY_DAYS`, mine; used only for the orange header and the lock prompt). Everything after is 'projected'. A quarter is 'locked' if it is in `config.teamPlan.locked` or its first night is on or before `today`.

- [ ] **Step 1: Write failing tests** in `teamplan.test.js` (invented people): `stateOf` returns `locked` for a started quarter, `ready` for the next quarter 10 days out, `projected` for one 80 days out and for a quarter with no calendar nights; `lock`/`unlock` round-trip and `unlock` of an auto-locked (started) quarter throws "already started: edit the colors by hand"; `isPinned` true when `team:Q2` is set and `proj` has no matching character, false when they match, true for every non-blank color when `teamPlan` is absent; an old season JSON without `config.teamPlan` passes `Season.validate` and round-trips through `toJson`/`fromJson` byte-identically.
- [ ] **Step 2:** Run `node test/teamplan.test.js`; expected FAIL (module missing).
- [ ] **Step 3: Implement** `teamplan.js` and the `season.js` hooks (follow how `config.teamsOk` is normalized and reset at new year; `config.teamPlan` resets to empty on a new year because colors start over). Omit `teamPlan` from the file while it is empty so older apps and byte-identical round trips keep working.
- [ ] **Step 4:** Run the new test and `node test/season.test.js`, `node test/compact-file.test.js`, `node test/versions.test.js`; expected all pass.

### Task 2: Attendance turnout

**Files:** Modify `dev/app/teamplan.js`; extend `test/teamplan.test.js`.

**Interfaces:**
- Consumes: the single existing rule for which nights count (see `test/nights.test.js` for the function Statistics and the store use; call that, do not re-implement), `Model.teamOf`, `Season.teamOn`.
- Produces: `TeamPlan.rate(ctx, person) -> { rate: number, nights: number, usedAverage: boolean }`; `TeamPlan.turnout(ctx, group, colorOf) -> { Red, Blue, Green, Yellow }` where `ctx = { master, season, calendar, today }`, `colorOf(person) -> color | ''`, and the value is the sum of the members' rates (expected children present per night).
- `rate` = nights present ÷ club nights counted since the child's first attended night this season (a child is not penalized for nights before they were enrolled); fewer than `MIN_NIGHTS = 3` counted nights uses the group average and sets `usedAverage`.

- [ ] **Step 1: Failing tests:** a child present at 4 of the 8 nights since their first night has rate 0.5, nights 8; a child enrolled at night 6 who attended 2 of 3 gets 0.667 and is not marked down for nights 1 to 5; a child with 2 counted nights uses the group average and `usedAverage` is true; an empty group returns zeros, never NaN; `turnout` sums to the sum of rates.
- [ ] **Step 2:** Run it; expect FAIL. **Step 3:** Implement. **Step 4:** Run `node test/teamplan.test.js` and `node test/nights.test.js`; expect pass.

### Task 3: Engine: projection and minimum-change recalculation

**Files:** Modify `dev/app/teams.js` (export the solver, bump its version), `dev/app/teamplan.js`; extend `test/teams.test.js` and `test/teamplan.test.js`.

**Interfaces:**
- Consumes: `Teams.assign`'s internals: `attempt(n, fixedCnt, base, rankOf, forbidden, rng)` and the swap-improvement loop. Refactor them into an exported `Teams.solve(kids, quarter, opts)` where `opts = { colorOf, forbidden, prefer, weights, rng }` and `prefer(i, k) -> 0..1` is an added cost per kid i and color index k (0 for the color to stay on, 1 otherwise; used only by recalculation). `Teams.assign` keeps its current behavior and tests unchanged by calling `solve`.
- Produces: `TeamPlan.project(ctx, { rng }) -> Plan`; `TeamPlan.recalc(ctx, { rng }) -> Plan`, where `Plan = { colors: { [id]: { Q1..Q4: color } }, changes: Change[], count: number }` and `Change = { id, q, from, to, reason, priority }`. `TeamPlan.applyPlan(ctx, plan)` writes `team:Qn` for unlocked, unpinned cells and updates `proj`. `project` fills blanks only (a first-time projection of unlocked quarters); `recalc` re-solves unlocked unpinned cells with `prefer` set to the current projection so the fewest children change.
- Hard rules: never touch locked quarters or pins; groups solved separately; quarters solved in order Q1 to Q4 so a child never repeats a color (relax for a child who has used all four, as `teams.js` does). Priority order and on/off come from `TeamPlan.priorities(season)` (Task 4); the weights are mine: head count dominates (even within one), then teammates apart, then turnout evenness, then grade spread as the last tiebreak.
- `reason` is one sentence naming the deciding priority, for example "Blue to Green: Blue's expected turnout 3.1 against Green 3.4 (even expected turnout)".

- [ ] **Step 1: Failing tests** (invented: 12 Sparks across two rooms, 8 T&T): `project` gives every unlocked unpinned cell a color with team sizes within 1 and no repeated color per child; pinned and locked cells are byte-identical afterwards; `recalc` after changing one pin changes no more children than the changed pin forces (assert `count <= 3` on the fixture, and that every other child is unchanged); `recalc` with nothing to do returns `count: 0` and no `changes`; a child with all four colors already used still gets a color (relaxed) and the plan says so in `reason`; a group of 3 kids and a group with an empty team do not throw; with turnout on, a team with much lower expected turnout receives more members when head counts tie; with turnout off the same input ignores it; grade spread only breaks ties and never changes a head-count-even result.
- [ ] **Step 2:** Run both test files; expect FAIL. **Step 3:** Implement. Algorithm, since the tests do not determine it: per group and quarter, build costs `prefer` (changes) plus small weighted penalties for the soft priorities, solve with the existing flow, then run the existing swap pass; compute `changes` by diffing against the stored projection. **Step 4:** Run `node test/teams.test.js && node test/teamplan.test.js`; expect all pass.

### Task 4: Priorities (data and Options tab)

**Files:** Modify `dev/app/teamplan.js`, `dev/app/app-options.js`, `dev/app/index.html` (Options guide text), `test/options-browser.test.js`.

**Interfaces:**
- Produces: `TeamPlan.PRIORITIES = [{ id: 'norepeat', label }, { id: 'friend', label, reserved: true }, { id: 'headcount' }, { id: 'apart' }, { id: 'turnout' }, { id: 'grade' }]` in default order; `TeamPlan.priorities(season) -> { order: string[], off: string[] }` (defaults: order as listed, `off` empty; spec 14a); `TeamPlan.setPriorities(season, { order, off })`.
- The Options section lists the soft priorities in order with a switch each and Move up/Move down buttons (keyboard operable, labeled with the priority name), a note that locked quarters, pins and hand moves always win, and Reset to defaults. `friend` shows "used when a new child is placed (part 2)" and cannot be switched off.

- [ ] **Step 1: Failing browser test** (in the existing options browser test style): the section lists six priorities in default order with turnout and grade on; moving "even head count" up changes the order and survives Apply; switching off turnout changes the engine's plan on a fixture; Reset returns the defaults. **Step 2:** run, expect FAIL. **Step 3:** implement. **Step 4:** run `node test/options-browser.test.js` (with NODE_PATH); expect pass.

### Task 5: The year grid (read-only view)

**Files:** Create `dev/app/app-teamgrid.js`. Modify `dev/app/app.js` (`renderTeams`: replace `scheduleHtml()` with `TeamGrid.html()` and keep the existing audit block above it), `dev/app/index.html`, `dev/app/style.css`. Test: `test/teamgrid-browser.test.js`.

**Interfaces:**
- Consumes: `TeamPlan.stateOf`, `TeamPlan.isPinned`, `TeamPlan.turnout`, `Teams.COLORS`, `App.quarterOf`.
- Produces: `TeamGrid.html(ctx, ui) -> string` and `TeamGrid.bind(rootEl, ctx, hooks)`; `ui = { scope: 'class' | 'group' | 'club', cls, group }`.
- Layout is the approved mockup A: one row per child, Q1 to Q4 columns; header per quarter shows the state ("locked" solid dark, "ready to lock" orange with the start date, "projected" dashed); cells are color chips (solid when locked, dashed outline when projected, a pin mark when pinned, "none" when blank); scope switch (By class, By group, Whole club) with a class picker for By class; below the rows, head-count and expected-turnout rows per quarter, computed for the **whole group**, with a note when the view is only a slice. Every chip is color-plus-text (never color alone).

- [ ] **Step 1: Failing browser test** (demo club, Chromium): the grid renders for Sparks A with four quarter headers; a started quarter shows "locked", the next shows "ready to lock" (calendar fixture within 21 days), later ones "projected"; By group shows every Sparks child; head-count row equals the audit counts; no console errors; at 375px the table scrolls inside its box with no page-level horizontal scroll.
- [ ] **Step 2:** run, expect FAIL. **Step 3:** implement and style. **Step 4:** run the new test plus `node test/teams.test.js` and `node test/versions.test.js` (script order); expect pass.

### Task 6: Editing in the grid

**Files:** Modify `dev/app/app-teamgrid.js`, `dev/app/app.js`; extend `test/teamgrid-browser.test.js`.

**Interfaces:** each chip in an unlocked quarter is a `<select>` (accessible name "Q2 color, <child name>") writing `team:Qn` through the same path the Person tab uses (`Model.addUserCol` then assign, `touch()`); picking a color that equals the projection leaves the cell projected, anything else makes it a pin (Task 1 detection). A chip in a **locked** quarter is a button "Change from tonight…" that asks for a date (default today) and calls `Season.setTeamMove(season, id, q, date, team)`; it never edits `team:Qn`.

- [ ] **Step 1: Failing tests:** choosing a different color for a projected child in Q2 shows a pin, updates the head-count row, and shows a repeat warning in the existing audit block if it repeats; choosing the projected color again removes the pin mark; editing a locked cell creates a dated move (visible in the existing "Mid-quarter moves" line) and leaves `team:Qn` unchanged; Undo restores each of these (History line); the selects have names and 44px tap targets at 375px.
- [ ] **Step 2:** run, expect FAIL. **Step 3:** implement. **Step 4:** run it; expect pass.

### Task 7: Recalculate, preview, and the "Why these teams" panel

**Files:** Modify `dev/app/app-teamgrid.js`, `dev/app/style.css`; extend `test/teamgrid-browser.test.js`.

**Interfaces:** button **Recalculate Q2 to Q4 (changes N children)** where N is `TeamPlan.recalc(ctx).count`, recomputed after every edit; disabled and reading "Nothing to recalculate" at 0. Clicking opens the preview in the panel listing each `Change` with its `reason`; **Accept** calls `TeamPlan.applyPlan` inside one History step ("Recalculated Q2 to Q4: N children"); **Cancel** changes nothing. The panel (a region labeled "Why these teams", beside the grid at widths over 760px, below it on phones) also shows per child the rate and nights used ("uses the group average" when `usedAverage`), per team head count next to expected turnout, and the priority list currently in force with off ones marked.

- [ ] **Step 1: Failing tests:** after one pin change the button text matches `/changes \d+ child/`; the preview lists exactly that many children with a reason each; Cancel leaves `team:Qn` byte-identical; Accept changes only the listed cells, no pin or locked quarter moves, and a single Undo restores all of it; at 0 changes the button is disabled; the panel shows a "group average" note for a child with under 3 nights; the panel is reachable by keyboard and labeled.
- [ ] **Step 2:** run, expect FAIL. **Step 3:** implement. **Step 4:** run it; expect pass.

### Task 8: Lock, unlock, and the print prompt

**Files:** Modify `dev/app/app-teamgrid.js`, `dev/app/app.js` (print path at `btnPrint`), `dev/app/reports-season.js` only if the print flow lives there; extend `test/teamgrid-browser.test.js`.

**Interfaces:** a **Lock Q2** button on a ready or projected quarter (it writes any remaining projected colors into `team:Qn`, sets `proj` characters to `-` for that quarter, records `locked[q] = today`; one History line); **Unlock** on a manually locked quarter asks for confirmation and logs; an auto-locked (started) quarter has no Unlock. Printing the attendance sheets or the Color teams list for a quarter that is not locked asks "Lock Q2 now?" with **Lock and print**, **Print without locking**, **Cancel**; it never locks silently.

- [ ] **Step 1: Failing tests:** Lock writes colors and the header turns solid; the grid cells become buttons; Unlock after confirm restores the select cells; the print prompt appears for an unlocked quarter and not for a locked one, and each of its three buttons does what it says; Undo of a lock restores the previous state.
- [ ] **Step 2:** run, expect FAIL. **Step 3:** implement. **Step 4:** run it; expect pass.

### Task 9: Demo data, manual, docs, versions

**Files:** Modify `dev/tools/make-test-data.js` (and regenerate `dev/test-data/*` and `deploy/app/try/*` only through the script's documented flow, keeping `fake: true`), `dev/app/index.html` (manual text for the Color teams tab, Options guide), `README.md` (Tests list: add `teamplan.test.js`, `teamgrid-browser.test.js`), every changed `.js` line-1 version, `app-version` to 1.50.2.

- [ ] **Step 1:** make the demo show one locked, one ready and two projected quarters with one pin (dates are moved forward by `Season.freshenFake`, so check the states hold on any day; add the assertion to `test/fake-data.test.js`). **Step 2:** run the whole suite: every `node test/*.test.js` that needs no arguments (see README "Tests"), plus the browser tests with NODE_PATH; expected 0 failures. Tests that take real files stay as they are and need not run here. **Step 3:** run the real-data safety check from the README: `node test/anonymized-data.test.js <real-data.json> <export.csv>` against the demo files (it fails if any real name, phone, email or ID is left), and confirm every new fixture uses invented names only. **Step 4:** run `./make-deploy.sh` to confirm it passes its checks, and do **not** rsync; report to Mike that 1.50.2 is built and waiting for his "deploy".

## Self-review notes (spec coverage)

- Year grid, states, pins, scope switch, counts, expected turnout: Tasks 1, 5. Editing by class/group/club and on the Person tab (already writes `team:Qn`, so pin detection covers it): Tasks 1, 6.
- Recalculation count, preview, never moves pins or locked: Tasks 3, 7. Attendance assist and the "why" panel: Tasks 2, 3, 7. Priorities on Options with the approved defaults (turnout and grade on): Tasks 3, 4.
- Lock auto at first night plus manual plus print prompt; unlock with confirmation; History lines: Tasks 1, 8. Past nights keep their team: preserved because only `team:Qn` for unlocked quarters and dated moves change.
- Not in part 1 (by design): mid-quarter move flow beyond the grid's locked-cell shortcut, friend placement (the `friend` priority slot is reserved), class rules, the Visitor tab, grade-based class placement.
