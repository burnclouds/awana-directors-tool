# Plan: N4, progress sheets one class at a time, with a loading pop-up for the full list (2026-11-18)

**Status update, 2026-11-18: built (1.51.15f), as planned, with one addition.** Test `progress-class-popup-browser.test.js` (12). Added after the first run: a class that Progress sheets picks by itself (`psAuto`) is not carried to other reports, because the shared Class picker made Attendance open on one class (caught by `reports-cleanup-browser` RP2); a class the user chooses still carries over. The Class picker is 44px on a phone (`#oRoomSel`, `max-width: 760px`). Open from the plan: the "warn on Print when only one class is drawn" question (left at "no, the note under the bar only"), and the existing tests listed in (f) that were not re-run (`bundles-browser`).

Original status: plan only, nothing built. Every claim marked *(run)* was checked on the invented TEST club (`dev/test-data/awana-2026-27-TEST-20261029-214815.json`) in node on 2026-11-18; *(read)* means read in the code. No real data is used.

## (a) What is true today

BACKLOG N4: the report felt slow on Mike's phone. The goal: the default view draws only one class; **All classes** draws everyone behind a modal "Drawing N progress sheets..." pop-up; printing everyone must still work (Choose pages, class binders, bundles).

Facts *(read unless marked)*:
- The report is `progressSheets` (`reports.js` 149-159; one `<div class="onepage">` per Cubbies, Sparks or T&T child, filtered by `opts.room`). It is drawn in `app.js` `renderReport` (829-839) and `renderReportCore` (860-889).
- `renderReport` already counts the sheets, `n`, but only for a **single** `progressSheets` (not a bundle): `sel.value === 'progressSheets' && master && !bundleOf()`. If `n > 30` it shows an **inline** line `<p class="status" id="drawing">Drawing N progress sheets...</p>`, then draws after `requestAnimationFrame` + `setTimeout(0)`; `drawingBig` makes later calls return (the drawing in progress "picks up the pickers as they are now").
- The Class picker `#oRoomSel` always starts on **All classes** (`value ''`): `renderReportCore` 877-880 rebuilds it with `<option value="">All classes</option>` and keeps the old choice if it is still listed. So the default view is everyone, which is the slow case. Puggles are already left out (RP3).
- TEST club *(run)*: 98 progress sheets in total (Cubbies 14, Sparks A 14, B 10, C 5, D 8, T&T Boys A 12, B 7, Girls A 11, B 17). Drawing the HTML string in node takes 38 ms for all 98 *(run, without the browser's layout, which is the real cost: about 51,000 DOM nodes for 100 sheets, memory `awana-pdf-builder-decision`)*. First class in the list is **Cubbies** (14 sheets).
- Other paths that draw many progress sheets, and the pop-up must cover them too: a **bundle** that holds `progressSheets` with no class (the **Class binder** with **All classes** in the Class picker) and **Print class binders** with several classes ticked. Neither shows any "Drawing" line today *(read: the `n` count is skipped for bundles)*, so on a phone they freeze the page with no message.
- Memory `awana-pdf-builder-decision` (Mike, 2026-11-17): a PDF builder is **dropped**. Do not plan one. If the page is still slow the next steps are a Debug-tab timing readout, then drawing in batches, then a time-boxed prototype. This plan builds the first (step 7, small) and not the others.

What must not break:
- **Choose pages**, **Pages to print: all N**, `Select all`, `Select none` (`pagePickPopup`, `app.js` 842-862) work on whatever is drawn: with one class they list that class's children; with All classes they list everyone.
- The paper: one page per child (`progress-pdf-browser`, `progress-record-sheet-browser`).
- Callers that rely on the Class picker: `App.reportOptions({ room })` (`app.js` 925-935; used by the To do class-binder link and tests) and the Person tab's print buttons (which use `achievement`, not this report, so unaffected).

## (b) Design

**One helper decides the class, before anything is counted or drawn.** `renderReport` counts the sheets (`n`) from the Class picker's *current* value, before `renderReportCore` rebuilds the picker. Coming from another report the picker may still read All classes, so the count would be 98, the pop-up would open, and Cubbies (14) would be drawn behind it: a flash of "Drawing 98" for a 14-sheet view. So add `effectiveRoom()` in `app.js`: the picker value if it is a class this report lists, else `''` when `psAll`, else the first class of the list (`Reports.roomsOf(Reports.kids(master))` without Puggles). `renderReport` uses it for `n`, and `renderReportCore` sets the picker to it, so both agree.

**Default: one class.** For `progressSheets` (single report), when the user has not asked for everyone, `renderReportCore` picks the **first class in the list** (Cubbies on the TEST club) and draws only it. A visit-long variable remembers the last choice (below).

**State:** `let psAll = false;` in `app.js`, near `drawingBig`.
- In `renderReportCore`, after the Class options are rebuilt for `def.id === 'progressSheets'`: `rs.value = rl.includes(cur) ? cur : (psAll ? '' : (rl[0] || ''))`, where `cur` is the select's value before it was rebuilt. So a class chosen on another report (for example Attendance, Sparks A) carries over, an empty `cur` becomes the first class unless `psAll`, and the choice "All classes" survives a redraw.
- The `change` handler on `#oRoomSel` (the shared listener at `app.js` 899 draws the report) sets `psAll = sel.value === 'progressSheets' && $('oRoomSel').value === ''` first, so picking **All classes** is a deliberate choice and picking a class clears it.
- `App.reportOptions(o)` (925; it does `rs.value = o.room || ''`, so an absent `room` means everyone, the same as `''`): when `o` has `room === ''` and the report is `progressSheets`, set `psAll = true` before redrawing (a caller asking for no class means everyone); a class sets `psAll = false`. This keeps `reportOptions({ room: '' })` meaning everyone, as it does today.
- `psAll` is for the visit only (not saved), like `binderSel` and `lastIn`.

**Make the choice visible.** `#bNote` (already used for bundle notes; it is empty on a single report) says what is on screen and what Print does:
- one class: `Showing Cubbies: 14 sheets. Print / Save as PDF prints this class. Choose All classes in Class for everyone (98 sheets).`
- all classes: `Showing everyone: 98 sheets.`
The wording stays short and plain; it replaces nothing else. `#bNote` is also cleared at the top of `renderReportCore` (`$('bNote').textContent = ''`, 864), so set it after the class is known. The option text stays **All classes** (existing tests read it).

**Printing everyone still works** in three ways, all already there: (1) pick **All classes**, wait for the pop-up, then Print; (2) the **Class binder** bundle with **All classes**; (3) **Print class binders** with the classes ticked, or none ticked. The Print button prints exactly what is drawn, so the note under the bar is what tells a leader which of the two it is.

**Loading pop-up, replacing the inline line.** A new `<dialog id="busy" role="alertdialog" aria-live="polite" aria-labelledby="busyTxt">` in `index.html` (next to `#dlg`, line 759) with one paragraph `#busyTxt` and no buttons. Why not reuse `#dlg`: its content and handlers are shared by every other pop-up (the pop-up change handler bug fixed in 1.51.15d), and the Choose pages pop-up opens right after the draw.
- Show: `busy.showModal()` after setting `#busyTxt` to `Drawing 98 progress sheets...` (the existing words, with the count). Background is inert while it is open, so a pick cannot arrive mid-draw (the `drawingBig` guard stays for programmatic calls).
- It must paint before the heavy work: `showModal()`, then `requestAnimationFrame(() => setTimeout(draw, 0))` (the existing pattern).
- **Esc must not close it:** `busy.addEventListener('cancel', e => e.preventDefault())` (the draw is synchronous and cannot be cancelled).
- **Always closes:** wrap the draw in `try { ... } finally { drawingBig = false; busy.close(); }`. (Today `drawingBig = false` is the first statement in the timeout, so a throw does not wedge that flag *(read, `app.js` 834)*; the new hazard is the modal: with Esc blocked, a throw in the draw would leave an uncloseable pop-up on screen. N4-12 pins this.)
- The dialog replaces `#report` content as it does now? **No**: show the pop-up over the page and leave the old report in place until the new one is drawn, so there is no flash of an empty page. (The current inline line emptied `#report` first.) Set `#pagePick` hidden until done, as now.
- Shared style: `style.css` next to the `dialog` rules (62-63): `#busy { width:min(360px, calc(100vw - 32px)); text-align:center; } #busy p { margin:0; font-size:16px; }`. It must not use `@media print` visibility: `dialog { display:none !important }` is already in the print rules (136).

**Threshold stays 30 sheets.** One class (5 to 17 sheets on the TEST club) never shows the pop-up, so the common case is instant. Keep `n > 30` as today: a leader who picks a big class on a slow phone still sees nothing but is fast anyway. Question 3 asks if a lower threshold is wanted.

**Bundles and the binders pop-up get the same pop-up.** Add a helper `progressCount(items)` that counts, for each `progressSheets` item, the active Cubbies/Sparks/T&T children in its room (all rooms when it names none), using the same filter as `renderReport`. `renderReport` calls it for a bundle (`bundleOf()` with `items` after the per-class filter at line 811, which `renderBundle` computes) and uses the pop-up text `Drawing 98 progress sheets for the binders...` when the count is over 30. To avoid computing the room filter twice, move the bundle's item filtering at 811 into a small function `bundleItems(b)` used by both `renderBundle` and `progressCount`.

**Debug-tab timing (optional step 7).** `App.drawStats = { what: 'Progress sheets', n, ms, at: Date.now() }`, set in the draw, shown in the Debug tab "Open now" table as `Last big draw` -> `98 progress sheets in 0.31 s` (or `none yet`). It answers "is it slow on my phone?" without a developer. Recorded only for draws over the threshold. It is the first of the steps the memory note lists, and it needs `app-tools.js` 1.6.1 to **1.7.0** (one row).

Not planned: batches, a PDF builder, a progress bar (the draw is one synchronous block, so a bar cannot move; a count and a spinner-free message is honest).

## (c) Ordered build steps, each red then green

Run from `dev/app`. Browser tests need the Playwright shim (memory `awana-app-test-setup`); a local `http.createServer` as in `reports-cleanup-browser.test.js` for the file serving.

1. **Red: write `dev/app/test/progress-class-popup-browser.test.js`** with cases N4-1 to N4-12 (below). They fail first because the default is everyone and there is no `#busy`.
2. **Green: the default class.** Add `psAll`, `effectiveRoom()`, the `rs.value` rule in `renderReportCore`, the `change` and `reportOptions` handlers. **The `psAll` change handler must be registered before the shared `[sel, ..., $('oRoomSel'), ...].forEach(el => el.addEventListener('change', renderReport))` line (`app.js` ~899)**, or it runs after the redraw and the redraw reads the old `psAll`. N4-1, N4-2, N4-5 go green.
3. **Green: the note** in `#bNote`. N4-3 goes green.
4. **Green: the pop-up.** `index.html` `#busy`, the `renderReport` rewrite with try/finally, the CSS. N4-4, N4-6 to N4-9 go green.
5. **Green: bundles.** `progressCount`, `bundleItems`; N4-10 goes green.
6. **Update the existing tests** whose default changed (list in (f)); run each.
7. **Debug timing** (optional): `App.drawStats`, one row; N4-12.
8. **Docs, versions, sweep** (g).

## (d) Phone and print checks

- **Phone (Mike's phone, the real test)**: open Reports > Progress & awards > Progress sheets: one class appears at once. Pick All classes: the pop-up shows while it draws and goes away. Compare with how it felt before. Open the Debug tab and read `Last big draw` (if step 7 is built) and tell me the time.
- **390x844 emulation (in the test)**: the pop-up fits the screen with a 16px gutter; the Class picker is at least 44px tall (check the existing `touch-targets-browser` rule includes `#oRoomSel`; if it does not, N4-9 measures it).
- **Print**: print one class and then All classes to PDF; page counts equal the sheet counts (the existing `progress-pdf-browser` rule), and the pop-up does not appear in the PDF (`dialog` is `display:none` in print; N4-8 prints with the dialog open to prove it).

## (e) Named test cases (`progress-class-popup-browser.test.js`, TEST club, viewport 1366x900 unless stated, `App.today = () => '2026-11-18'`)

| # | Name | Steps | Expected |
|---|---|---|---|
| N4-1 | default is one class, and no pop-up flashes | first wrap `HTMLDialogElement.prototype.showModal` to count calls on `#busy`; start on the Attendance report with the Class picker on All classes, then `App.showReport('progressSheets')` | `#oRoomSel` value is `Cubbies`; `#report .onepage` count is 14 (the active Cubbies children, computed in the page from `Reports.kids`); the `showModal` wrapper saw **zero** calls on `#busy`; no `#busy[open]`; `#pageSum` says `Pages to print: all 14` |
| N4-2 | another class | select `Sparks A` | 14 sheets; every sheet belongs to a Sparks A child (match the child names from `Reports.kids` for that room against the `<h2>` or sheet text); no Cubbies child's name on screen |
| N4-3 | the note says what is shown | after N4-1, then after picking `T&T Girls (Group B)` | `#bNote` contains `Showing Cubbies: 14 sheets` and `98 sheets`; then `Showing T&T Girls (Group B): 17 sheets` |
| N4-4 | All classes shows the pop-up | in one `page.evaluate`: set `#oRoomSel` to `''`, dispatch `change`, return `{ open: busy.open, modal: busy.matches(':modal'), text: busy.textContent }` | `open` true, `modal` true, text matches `/Drawing 98 progress sheets/` |
| N4-5 | the full list arrives and the pop-up goes | after N4-4, `waitForFunction` busy not open | `#report .onepage` count is 98; `#pageSum` is `Pages to print: all 98`; `drawingBig` is not left set (a later class pick draws at once) |
| N4-6 | no inline "Drawing" line any more | after N4-4 | `#drawing` does not exist anywhere in `#report`; the old report stays visible under the pop-up until done (the sheet count in `#report` right after the evaluate is still 14) |
| N4-7 | Esc does not close it | dispatch a `cancel` event on `#busy` while it is open | the event's `defaultPrevented` is true and the dialog is still open |
| N4-8 | print with it all drawn | All classes, wait, `page.pdf` in print emulation | PDF has 98 pages, all 612x792, none blank; and printing right after N4-1 gives 14 pages |
| N4-9 | phone | viewport 390x844, All classes | the pop-up rect lies inside the viewport with at least 8px each side; `#oRoomSel` height >= 44px; after it closes `#report` scrollWidth <= clientWidth; no page error |
| N4-10 | bundles | Class binder bundle with the Class picker on All classes; and the Print class binders pop-up with Class binder, no class ticked, Show binders | each shows the pop-up with `/Drawing \d+ progress sheets/` and ends with the sheets drawn (98 `onepage`); with one class (`Sparks C`, 5 sheets) no pop-up |
| N4-11 | Choose pages after the pop-up | All classes, wait, click `#btnChoosePages` | `#dlg` opens with 98 ticks; `Select none`, tick one, Done: `#pageSum` says `Pages to print: 1 of 98`; `#busy` stays closed; no page error |
| N4-12 | a throw does not wedge the report | stub `Reports.LIST.find(x => x.id === 'progressSheets').render` to throw, choose All classes, then restore and choose Cubbies | the pop-up closes (not open), the page error list holds exactly the one stub error, Cubbies then draws 14 sheets |
| N4-13 | reportOptions keeps its meaning | `App.reportOptions({ room: '' })` then `{ room: 'Sparks B' }` | everyone (98 after the pop-up), then 10 (`{}` with no `room` is not tested: it means everyone today, and no caller sends it for this report) |
| N4-14 | the choice survives a trip | choose All classes, `App.showReport('attendance')`, `App.showReport('progressSheets')` | still All classes (98); after `Sparks A` is chosen on Attendance, Progress sheets opens on Sparks A |
| N4-15 | debug row (step 7) | after N4-5, open the Debug tab | a row `Last big draw` reads `98 progress sheets in` plus a number of seconds; before any big draw it reads `none yet`. (No time limit is asserted.) |

## (f) Existing tests that will go red, and the change to make

All of these call `App.showReport('progressSheets')` and expect **everyone**. Add one line after it that picks All classes and waits for the pop-up to go: `await page.selectOption('#oRoomSel', ''); await page.waitForFunction(() => !document.getElementById('busy').open)`, or call `App.reportOptions({ room: '' })` then the same wait. Put this in one shared helper in each file.

- `field-reports-browser.test.js` #8 (line 50-53): it expects the inline `Drawing N progress sheets` text and at least 30 sheets. Rewrite: expect the pop-up text (via the N4-4 style one-shot check) and 98 sheets; keep the `content-visibility: auto` assertion.
- `progress-onepage-browser.test.js` (line 20-24): waits for `#report .onepage` then counts `n >= 3`; passes with Cubbies alone (14), but it measures page layout for several children, so choose All classes to keep the original coverage.
- `print-blank-dates-browser.test.js` (line 19): only needs a sheet; passes as is.
- `reports-cleanup-browser.test.js` RP2 (line 24-29): expects more than 12 sheets and `Pages to print: all n`; Cubbies alone is 14 so it passes, but the intent is "a long run"; pick All classes. Line 45-46 (`oRoomSel` options include no Puggles, the class list) is unaffected. Lines 48-56 (the binders pop-up, `bindSheets`) are unaffected.
- `progress-pdf-browser.test.js` (line 32-37) sets a class with `printed(r, 'progressSheets')` and `App.reportOptions({ room: rm })`: unaffected (a class is named). Line 58 prints `progressSheets` with no class in a loop of reports: check that loop's expectation (portrait paper only) still holds with one class.
- `progress-record-sheet-browser.test.js` (line 55-70): names a class every time: unaffected. Verify by running.
- `binders-dialog-browser.test.js`, `binders-paper-browser.test.js`, `bundles-browser.test.js`: bundles with progress sheets now show the pop-up for All classes; their waits (`waitForTimeout(500)`) may be too short for the full draw. If one flakes, replace the fixed wait with the same wait-for-closed helper.
- Run the full sweep (`sh dev/tools/run-tests.sh`); a failure outside this list is a missed caller of the Class picker.

## (g) Versions and docs

- `app.js` 1.71.0 to 1.72.0 (if N1 is built first, to 1.73.0; the two plans touch different parts of the file: N1 adds a report to `RSUBS` and `BINDER_PARTS`, N4 edits `renderReport`, `renderReportCore`, `reportOptions`). `app-tools.js` 1.6.1 to 1.7.0 (step 7 only). `index.html` `app-version`: **1.51.15f**, with `#busy`.
- `style.css`: the `#busy` rule (no version line in that file).
- How it works (`index.html` 583 area) and `info.js` `reports.print`: "**Progress sheets** open on one class so they appear at once. Pick **All classes** in Class to draw everyone; a message shows while it draws, then Choose pages and Print work as usual." Run `node dev/tools/sync-guide.js`.
- CHANGELOG, under 1.51.15f: "**Progress sheets open on one class.** Everyone used to be drawn first, which was slow on a phone. The Class picker now starts on the first class; All classes draws the whole club behind a *Drawing N progress sheets...* pop-up (the same pop-up shows for a class binder or Print class binders with many sheets). A line under the bar says what is shown and what Print will print. A Debug-tab row shows how long the last big draw took."
- README: the new test line; update the test line for `field-reports-browser` (#8).
- BACKLOG: tick N4 with the date, version and test; move to the Done log.

## (h) Risks

1. **A leader prints and gets only one class** because the default changed. The note under the bar and the unchanged Print label are the only warnings. Alternative: when Print is pressed on a single-class view, say "Prints Cubbies only (14 pages). Use All classes for everyone." in the existing print confirmation path (the print button handler at `app.js` 957-961 already asks about locking). Recommended default: the note only; ask the owner (question 2).
2. **Callers that need everyone** (`App.reportOptions`, tests) now get the first class if they do not say. Covered by the `psAll` rules and N4-13, N4-14.
3. **`#bNote` is shared** with bundle notes; setting it for the single report must happen after the line that clears it (864). The test N4-3 catches a clear.
4. **The modal stays open, uncloseable (Esc is blocked), if the draw throws:** the try/finally fixes it (N4-12).
5. **The first draw is still slow for All classes**, the pop-up only tells the leader something is happening. If the real file is still too slow on the phone, the Debug row gives the number, and the memory note's next step is batches, not the PDF builder.
6. **`content-visibility: auto` on `.onepage`** (style.css 762, screen only) keeps scrolling cheap; measure tests still need the `content-visibility: visible` override they already use.
7. **`#busy` and focus**: a modal dialog takes focus; closing returns it to the previous element. Check on a phone that the Class picker is not left focused with the keyboard list open.
8. **Two plans edit `app.js`**; merge by function and run the sweep after each.

## (i) Questions for the owner, with recommended defaults

1. **Which class does it open on?** Default: **the first class (Cubbies), or the last class chosen this visit.** Alternatives: remember the class across visits (saved in settings), or open on the class of the leader's own group (the app does not know it).
2. **Warn on Print when only one class is drawn?** Default: **no**, only the line under the bar. A one-line print confirmation is a small add if a class gets printed by mistake.
3. **Pop-up threshold:** Default: **more than 30 sheets** (as today). Lower it to show the pop-up for every draw over about 15 sheets if his phone is slow on one big class.
4. **Should the Class binder bundle and the binders pop-up show the pop-up too?** Default: **yes** (they are the other slow draws).
5. **A "Draw everyone" shortcut button** beside the class picker, instead of choosing All classes? Default: **no**, the picker option is enough.
6. **Debug-tab timing row?** Default: **yes**, it is small and answers the next question on his phone.
7. **Version:** Default: **1.51.15f**.
