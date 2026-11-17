# Flag markers: yellow flags only where flagged — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The small flag button beside boxes, blocks, fields, quarters and classes is not drawn unless something is flagged there; a flagged place shows a yellow flag, and clicking it opens a popup where the note can be read, edited and cleared. Flag anything (the top-bar Flag button) is how new flags are made.

**Architecture:** One shared popup (`App.flagPop`, new `app-flagpop.js`) replaces the "existing notes" half of the three old flag dialogs for the small buttons. The existing small buttons keep their data attributes (goFlag and the tests find them) but are drawn only when a flag exists, carrying `data-fids`. Flags made with Flag anything (`level: 'element'`) have no on-page mark today, so a second new file (`app-flagmarks.js`) draws their yellow flags in an overlay layer outside the tabs, positioned from the located element, so no tab's DOM or layout is touched.

**Tech Stack:** Vanilla JS IIFE modules on `App`, Playwright browser tests (`NODE_PATH=/tmp/claude-1000/shim/node_modules node test/<name>.test.js` from `dev/app`), node unit tests, `make-deploy.sh`.

**Spec:** BACKLOG.md "Little flag buttons: show only when flagged (added 2026-11-12, Mike)" and the Design section below; `docs/superpowers/specs/2026-11-10-flag-anything-design.md` for the flag model.

## Design (decisions this plan makes; the first four are Mike's words)

1. The little flag does not appear generally.
2. A flagged element shows a yellow flag (`#e0a030`, the colour the `.on` flag and `.pcell.flagged` outline already use).
3. Clicking a yellow flag opens a popup with the note: editable, with the flag clearable.
4. New flags are made with Flag anything; the little button is no longer how a flag is started.
5. **Mike's decision (2026-11-12): a flag or note is created only two ways: the top-bar Flag button (flag mode) and the generic "Add a note" box on the To do tab.** The labelled "Flag this sheet" (Progress), "Note" (Attendance, Color teams) buttons and every other add-a-flag control are removed; the add-a-flag dialogs (`flagDialog`, `placeDialog`) go with them. Flags already in a file at the `sheet`, `child`, `attend` and `team` levels still exist, so each is drawn as a yellow flag (same popup) in the place its old button stood: the sheet's `flagrow`, `#attFlagWrap`, the Color teams header. Nothing is drawn there when there is no flag. The release is **1.51.04**.
6. Several flags on one place: the popup lists each with its own textarea, Save and Clear.
7. Saving an empty note is refused with the existing message ("Write a note for the flag."); clearing is the way to remove one.
8. The popup follows `app-info.js`: a fixed `.infobox`-style box appended to `body`, clamped inside the window, closed by x, Esc, a click elsewhere, a tab change or a redraw, one at a time. It never prints.
9. Element flags whose spot cannot be found draw no flag (To do already says "spot not found").
10. Edits go through `touchSeason()` so they are saved, undoable and merged like every other change.

## Global Constraints

- Each changed JS file's line 1 version is bumped; `make-deploy.sh` refuses unbumped changes. New files register `AwanaVersions` on line 1 and are added to `index.html` script tags and the README load order.
- No data in tests except invented TEST clubs (`dev/test-data`). Test files follow the existing harness (see `given-early-warning-browser.test.js`: static server, `#splashFiles`, `page.on('dialog')`).
- No pop-up (`alert`/`confirm`) for ordinary entry; errors use `App.flash(msg, 'error')`.
- The release is not deployed by this plan; version bump and CHANGELOG go in Task 4.

## Review Focus

- A flag on a place that is later removed from the page (a block hidden by a tab change): no marker, no error, flag still listed on To do.
- Two flags on the same box: both listed in the popup; clearing one leaves the other and the yellow flag.
- Clearing the last flag on a place: the small button disappears from that place (no empty yellow flag).
- Popup near the window edge or in a scrolled page: stays fully inside the window.
- Editing a note and clicking elsewhere without Save: the edit is discarded, the saved note unchanged (no silent save, no pop-up).
- Overlay flags after the page scrolls, the window resizes, or a tab redraws: still on their elements, none left behind.
- Printing: no flags or popup on any printed page.
- A flag whose note contains markup (`<b>x</b>`, `&`): shown as text, never as HTML.

---

### Task 1: The shared flag popup

**Files:**
- Create: `dev/app/app-flagpop.js` (version 1.0.0)
- Modify: `dev/app/app-info.js` (1.2.0 → 1.3.0): export the clamping used by `place(btn, b)` as `App.info.placeBox(anchorEl, box)`; `place` calls it.
- Modify: `dev/app/app-season.js` (1.86.2 → 1.87.0): add `App.setFlagNote(id, note)` beside `App.clearFlag` (line ~1205): calls `Season.setFlagNote(season, id, note)` then `touchSeason()`.
- Modify: `dev/app/style.css` (`.flagpop` rules next to `.infobox`), `dev/app/index.html` (script tag after `app-info.js`).
- Test: `dev/app/test/flagpop-browser.test.js`

**Interfaces:**
- Consumes: `Season.flagList(season)`, `Season.setFlagNote`, `Season.clearFlag`, `App.clearFlag(id)`, `App.updateTodoBadge()`, `App.onRefresh`.
- Produces: `App.flagPop.show(ids: string[], anchor: Element) -> void` (opens, or toggles closed if already open for the same anchor); `App.flagPop.close() -> void`; `App.setFlagNote(id: string, note: string) -> void` (throws the Season error on an empty note). Popup markup: `div.flagpop[role=dialog]` containing, per flag, `textarea[data-fnote=<id>]`, `button[data-fsave=<id>]`, `button[data-fclear=<id>]`, and a close button `button.fpclose`.

- [ ] **Step 1: Write the failing test** `flagpop-browser.test.js` (invented club; flags added with `Season.addFlag` through `App.addFlag`): opens the popup on a flagged anchor with `App.flagPop.show`; asserts the textarea holds the saved note; edits and presses Save → `Season.flagList(App.season)[0].note` equals the new text and `App.dirty()` is true; empty Save → flash error and note unchanged; Clear → flag gone and popup closed; two flags → two textareas; a note `<b>x</b> & y` is shown as text (`textContent` equals it, no `<b>` element in the popup); Esc, outside click, tab change each close it; unsaved edit then outside click → saved note unchanged; popup rect inside `window.innerWidth/innerHeight` for anchors at all four corners.
- [ ] **Step 2: Run it** `node test/flagpop-browser.test.js` — Expected: FAIL (`App.flagPop` undefined).
- [ ] **Step 3: Implement** `app-flagpop.js` as above, with `App.setFlagNote` in `app-season.js` and `placeBox` extracted in `app-info.js`; run `node test/info-browser.test.js` after the extraction (13 tests must still pass).
- [ ] **Step 4: Run** `flagpop-browser` and `info-browser` — Expected: all pass.
- [ ] **Step 5: Commit** `git add dev/app/app-flagpop.js dev/app/app-info.js dev/app/app-season.js dev/app/style.css dev/app/index.html dev/app/test/flagpop-browser.test.js && git commit -m "Flag popup: read, edit and clear a flag's note"`

### Task 2: The little flags appear only when flagged

**Files:**
- Modify: `dev/app/app-season.js`: `flagBtn` (line ~669) returns `''` when `flagsAtPlace(...)` is empty, otherwise a yellow `button.flagbtn.on` with `data-fids="<id,id>"` and the existing `data-flag/data-fbook/data-fblock/data-fkey` attributes kept; `App.flagPlaceBtn(place, what, standalone)` (line ~809) returns `''` for a non-standalone place with no flags, otherwise the same button with `data-fids` (and `data-fplace` kept); the click handlers at lines ~912 (`button[data-flag]`) and ~827 (`button[data-fplace]`) call `App.flagPop.show(btn.dataset.fids.split(','), btn)` when the button has `data-fids` and is not `.inline`, and nothing else: delete `flagDialog` (line ~779), `placeDialog` (~814) and their `[data-fplace]`/`data-flag` add paths. The `flagbar` "Flag this sheet" button (line ~749) is drawn only when a `sheet` or `child` flag exists for the book/child, as a yellow flag with `data-fids`; `#attFlagWrap` (line ~298) and the Color teams header (`app.js` ~925) likewise, passing no `standalone` argument (the `standalone` parameter and `.flagbtn.inline` CSS are removed).
- Modify: `dev/app/app-person.js` (1.21.1 → 1.21.2) only if `fieldFlag` needs no change (it calls `App.flagPlaceBtn`, so it should not); `dev/app/app.js` line ~925 (Color teams header) likewise unchanged.
- Modify: `dev/app/style.css` lines 472-476: `.flagbtn.on` is always full opacity and `#e0a030`; remove the dim `opacity:.35` rest state for non-`.on` (no longer drawn).
- Test: update `test/flags-browser.test.js`, `test/person-flags-browser.test.js`, `test/leftovers-browser.test.js`, `test/uniform-given-browser.test.js`, `test/update-autosave-browser.test.js` (each creates or clicks a little flag): create the flag with `App.addFlag`/`Season.addFlag`, then click the yellow flag. New file `test/flag-visibility-browser.test.js`.

**Interfaces:**
- Consumes: `App.flagPop.show` (Task 1); `Season.flagsOf`, `Season.flagsAtPlace`, `Season.flagList`.
- Produces: `flagBtn(level, book, block, key, what) -> string` and `App.flagPlaceBtn(place, what, standalone) -> string`, both `''` when nothing is flagged and not standalone.

- [ ] **Step 1: Write the failing test** `flag-visibility-browser.test.js`: on a fresh club with no flags, `document.querySelectorAll('.flagbtn:not(.inline)')` has length 0 on Progress (a T&T child), the Person tab, Attendance and Color teams; after `App.addFlag` for a box (`level: 'box'`), a field (`level: 'field'`), an attendance night and a team group, each place shows exactly one `.flagbtn.on` whose computed colour is `rgb(224, 160, 48)`; clicking it opens `.flagpop` with the note; clearing in the popup removes the button; two flags on one box show one button and two textareas; no "Flag this sheet", "Note" or any other add-a-flag button exists on any tab with no flags (`document.querySelectorAll('.flagbtn, #tab-todo [data-flag]')` is empty except the To do page's own "Add note" form and the top-bar `#btnFlagMode`); a `sheet`, `attend` and `team` flag made with `Season.addFlag` each show one yellow flag in the old button's place; the To do "Add note" box still adds a general note.
- [ ] **Step 2: Run it** — Expected: FAIL (little flags present with no flags).
- [ ] **Step 3: Implement** the changes above. Then update the five older tests so they start by making the flag through `App.addFlag` instead of clicking the (now absent) little button, keeping every assertion they make about To do, Go and Clear.
- [ ] **Step 4: Run** the new test and the five updated tests plus `person-fields`-related ones that passed before (`for f in test/*flag*.test.js test/leftovers-browser.test.js test/uniform-given-browser.test.js test/update-autosave-browser.test.js; do node $f | tail -1; done`) — Expected: 0 failed each.
- [ ] **Step 5: Commit** `git commit -am "Little flags show only where something is flagged, in yellow"` (add the new test file).

### Task 3: Yellow flags for Flag-anything (element) flags

**Files:**
- Create: `dev/app/app-flagmarks.js` (1.0.0)
- Modify: `dev/app/app-flagmode.js` (1.0.0 → 1.1.0): expose `App.flagLocateAll(tab) -> Map<flagId, Element>` — builds the candidate list once (the loop in `locate`, lines ~66-70) and matches every element flag of that tab with `FT.find`; `locate` uses it for one flag.
- Modify: `dev/app/style.css` (`#flagLayer`, `#flagLayer .flagbtn.on` fixed-size marker, `@media print { #flagLayer, .flagpop { display:none !important } }`), `dev/app/index.html` (script tag after `app-flagmode.js`).
- Test: `dev/app/test/flag-marks-browser.test.js`

**Interfaces:**
- Consumes: `App.flagLocateAll`, `Season.flagList`, `App.flagPop.show`, `App.tab`, `App.onRefresh`.
- Produces: `App.flagMarks.refresh() -> void` (rebuilds the overlay for the open tab); `#flagLayer` (`div` appended to `body`, `position:absolute; top:0; left:0; pointer-events:none`) holding one `button.flagbtn.on[data-fids=<id>]` per located element flag, `pointer-events:auto`, placed at the element's top-right corner from `getBoundingClientRect()` plus `scrollX/scrollY`.

- [ ] **Step 1: Write the failing test** `flag-marks-browser.test.js`: with Flag anything create an element flag on a labelled control on the Options tab and one on a Debug-tab element; leave and return to each tab → exactly one yellow marker per flag, centred within 24 px of its element's top-right; scroll the page 300 px and resize the window → still within 24 px; click a marker → `.flagpop` with the note, edit and Save → To do shows the new text; Clear → marker gone, flag gone; a flag whose element is not on the tab (relabel the trail via `App.season.flags[id].trail[0] += 'x'`) → no marker, no error (`pageerror` list empty) and To do shows "(spot not found)"; `matchMedia('print')` emulation → `#flagLayer` computed `display` is `none`; after 20 tab switches `#flagLayer` has no more markers than flags (no leaks).
- [ ] **Step 2: Run it** — Expected: FAIL (no `#flagLayer`).
- [ ] **Step 3: Implement** `app-flagmarks.js`: `refresh` is called on `App.showTab`, on each `App.onRefresh` callback, after any flag add/clear/save (wrap `App.addFlag`, `App.clearFlag`, `App.setFlagNote`), on `scroll` and `resize` (one `requestAnimationFrame` repositioning pass, no re-locating), and from a `MutationObserver` on `main` (`childList, subtree`, debounced 150 ms; the overlay lives outside `main` so it cannot trigger itself). Markers for elements with `offsetParent === null` are omitted.
- [ ] **Step 4: Run** `flag-marks-browser`, `flag-anything-browser` (8 tests must still pass) and `flagtrail.test.js` — Expected: all pass.
- [ ] **Step 5: Commit** `git add dev/app/app-flagmarks.js dev/app/app-flagmode.js dev/app/style.css dev/app/index.html dev/app/test/flag-marks-browser.test.js && git commit -m "Yellow flags on elements flagged with Flag anything"`

### Task 4: Manual, notes, version, release notes

**Files:**
- Modify: `dev/app/index.html` (manual text for flags: "a yellow flag appears where something is flagged; click it to read, edit or clear the note; start a flag with the Flag button"; version `1.51.04`), `dev/app/info.js` ((i) note for the flag button and the To do flags; then `node dev/tools/sync-guide.js` from the project root), `README.md` (test list: three new tests; load order: `app-flagpop.js`, `app-flagmarks.js`), `CHANGELOG.md` (new `## 1.51.04` section on top), `BACKLOG.md` (move the item to Done recently), `docs/superpowers/specs/2026-11-10-flag-anything-design.md` (Status line: markers added).
- Test: the existing manual/guide tests (`node test/guide.test.js` or the names `ls test | grep -i guide\|manual\|info`).

**Interfaces:**
- Consumes: Tasks 1-3 file versions (each already bumped).
- Produces: a release-ready tree; no deploy.

- [ ] **Step 1: Edit the files above**; keep the manual and (i) wording in the style of the neighbouring flag text.
- [ ] **Step 2: Run the guide/manual tests and the full sweep** `for f in test/*.test.js; do timeout 150 node $f >/dev/null 2>&1 || echo "FAIL $f"; done` from `dev/app` — Expected: only the six file-argument tests (`anonymized-data`, `browser`, `import-test-file`, `migrate-db`, `reports-season`, `roster`) listed.
- [ ] **Step 3: Commit** `git commit -am "1.51.04: manual, notes and release notes for flag markers"`; deploy only when Mike says "deploy" with a version.

---

## Self-review

- **Spec coverage:** (1) hidden unless flagged → Task 2 (small buttons) and Task 3 (element flags have none until flagged); (2) yellow → Tasks 2-3 CSS and tests assert `rgb(224, 160, 48)`; (3) popup with note, edit, clear → Task 1, wired in Tasks 2-3; (4) new flags through Flag anything → Task 2 removes the add path from the small buttons, standalone buttons kept (Decision 5).
- **Step scan:** every code step names the file, function and signature; test steps list the assertions. No bodies are transcribed.
- **Type consistency:** `App.flagPop.show(ids, anchor)`, `data-fids` (comma-joined ids), `App.setFlagNote`, `App.flagLocateAll`, `App.flagMarks.refresh` are named identically in every task.
- **Review Focus:** each of the eight lines has a named test: removed block / spot-not-found (T3), two flags and last-flag clearing (T2), window edge (T1), unsaved edit (T1), overlay after scroll/resize/redraw (T3), print (T3), markup as text (T1).
- **Proportion:** the plan is about the size of the spec it implements; code is described by signatures and assertions.

## Decisions (Mike, 2026-11-12)

1. Flags and notes are created only with the top-bar Flag button and the To do "Add note" box; no "Flag this sheet" or other buttons.
2. The release is 1.51.04.
