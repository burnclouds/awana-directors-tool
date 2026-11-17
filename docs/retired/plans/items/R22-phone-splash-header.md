# R22: the phone splash screen is covered by the tab-menu bar (item plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (or subagent-driven-development). Steps use checkbox syntax.

**Goal:** On a phone, the opening screen's card (title, intro, the numbered steps) is fully readable: nothing from the page behind it is drawn on top of it.

**Source:** Mike's phone screenshot, 2026-11-13 (production 1.51.05, dark mode, Brave): the sticky "Roster" menu bar sits across the splash card, cutting off the title "AWANA Roster & Reports" and hiding the intro text.

**Likely cause (found by reading the CSS, not yet reproduced):** `style.css:224` gives `#splash` `position:fixed; inset:0; z-index:20`, but on a phone `style.css:297` gives `.tabwrap` `position:sticky; top:0; z-index:31`. The tab bar therefore paints above the splash. On a phone the splash also uses `align-items:flex-start` (`style.css:346`), so the card starts at the top, exactly where the bar sits. On a desktop the same stacking exists but the bar is not sticky over the card, so it was never seen.

**Review Focus**
1. Every other overlay must still be above or below the right things: the test banner (z 30), dialogs, the update bar, the info pop-ups (check each `z-index` in `style.css` before choosing a value).
2. The splash must not hide the controls of other states: after a file is open the splash is hidden (`#splash[hidden]`), nothing else changes.
3. Landscape phone and a small 320px-wide phone: the card scrolls inside the splash (`overflow:auto`), its top is reachable.
4. Light and dark, desktop width unchanged.

### Task 1: Reproduce, then fix
**Files:** Create `dev/app/test/splash-covered-browser.test.js`; modify `dev/app/style.css`.
- [ ] **Step 1: failing test.** At 390x844 (`hasTouch`, `isMobile`), light and dark, load `index.html` with no file. Assert, using `document.elementFromPoint` at the centre of `.splash-card h2` and at the centre of the first `.splash-need` list item, that the returned element is inside `#splash` (not `.tabwrap` or anything in `#stickyTop`). Also assert the title's bounding box is fully inside the viewport. Run: `cd dev/app && NODE_PATH=/tmp/claude-1000/shim/node_modules node test/splash-covered-browser.test.js`. Expected: FAIL (the tab bar is returned).
- [ ] **Step 2: fix.** Smallest change: raise `#splash`'s `z-index` above `.tabwrap`'s 31 and below anything that must stay on top of the splash (decide from Review Focus 1; the test banner at 30 should sit above or below on purpose: choose and say which). If raising it hides something that must stay visible over the splash (the update bar, a dialog), instead hide `#stickyTop`'s tab bar while the splash is showing (`body:has(#splash:not([hidden])) .tabwrap { visibility:hidden }`): a tab menu does nothing before a file is open. Do not change desktop rules.
- [ ] **Step 3: run** the new test, then `test/mobile-audit.js` is NOT used (it already fails on print-layout reports); run `a11y-browser`, `update-autosave-browser`, `service-worker-browser` and `splash`-related tests (`ls test | grep -i splash`), then the full `sh dev/tools/run-tests.sh`. Expected: no failures.
- [ ] **Step 4: add the check to the visual pass.** Extend `test/touch-targets-browser.test.js`'s header comment or the Wave 3 phone check (Mike on a real phone) with "the opening screen is fully visible".
- [ ] **Step 5: release.** `style.css` has no version line; bump `app-version`/`app-build` in `dev/app/index.html` (the release this ships in). CHANGELOG "Fix: on a phone, the opening screen is no longer covered by the menu bar (R22)"; mark R22 FIXED in BACKLOG. Commit.

**When:** first task of the next release after 1.51.06, **before Wave 2**: it is visible on the first screen every club night on every phone, tiny, independent of the data format and of Waves 2-4, and it can ride in the same deploy as 1.51.06 if Mike has not deployed yet (then bump nothing extra: the release is already new). It is listed as Task 0 of Wave 3 in the roadmap so it is not forgotten, but it should not wait for Wave 3.

**Needs Mike:** a glance at the real phone after deploy (the cause above is a reading of the CSS, not a reproduction on the phone).
