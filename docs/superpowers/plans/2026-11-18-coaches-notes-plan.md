# Plan: N1, coaches binder note sheets, printable by quarter (2026-11-18)

**Status update, 2026-11-18: built (1.51.15f), and the design changed from this plan after Mike's review.** This file is the original plan and is kept for the reasoning (the wiring, the quarter-from-settings rule, the tests). It is NOT the final layout: the plan's three separate blocks per page became ONE table for the whole quarter on one letter or A4 page (column titles once, a group of write-in rows per night, three framed column groups with 3px gaps, Item and Size merged into "Item / Size", M/D date, 0.25in margins, no title in print, Notes about 39% wide). Sections (b), (e) and (i) below describe the old layout; the CHANGELOG entry for 1.51.15f and `dev/app/test/coaches-notes*.test.js` describe and pin the final one.

Original status: plan only, nothing built. Every claim marked *(run)* was checked against the invented TEST club (`dev/test-data/awana-2026-27-TEST-20261029-214815.json`) in node on 2026-11-18. Every claim marked *(read)* was read in the code. No real names, phones or screenshots are used or needed: the Excel "Notes" sheet is described in BACKLOG N1 only, and this plan builds from that description.

## (a) What it is, and what it is not

BACKLOG N1: one block per club night, like the club's Excel "Notes" sheet, printed for a chosen quarter as part of the coaches binder and reachable from the Print class binders pop-up. A block holds:

1. the **date and theme** (heading),
2. **Workers Not Available**: a few blank lines to write on,
3. **Supply Orders**: a small blank table with the columns **Item, Group, Name, Size, Paid**,
4. **Notes**: a few blank lines.

It is a **paper form to write on at the club night**. It stores nothing: no data-file change, no new section, no format version, nothing in `DATA-FORMAT.md` (the data file is untouched; see (c) for the one optional prefill that would read, not write, data).

What is already there *(read)*:
- `Reports.LIST` (`reports.js` 219-229) is the one list of reports; `Calendar.nights(rows, quarter)` (`calendar.js` 22) returns the club nights of a quarter (not an Event, not No Club). Each calendar row has `Date`, `Theme`, `Quarter`, `Type`, `No Club`.
- The coaches binder is a standard bundle in `DEFAULT_BUNDLES` (`reports.js` 236): `binderClass, binderAll, volunteers, binderTeams`. A bundle is printed by `runBundle` (`reports.js` 250-258), which sets `settings.quarter` to the bundle quarter and passes `ctx.today` (so `printedOn` works, 1.15.0).
- The Print class binders pop-up (`app.js` 1366-1407) builds from `BINDER_PARTS` (page list), `BINDER_PER_CLASS` (pages made once per ticked class) and "everything else once".
- Page style helpers already exist: `sheet(title, body, orient, sub)`, `printedOn(ctx)` (`reports.js` 21-22, 117), and the print rule `#report .sheet { break-after:page }` (`style.css` 140-143) with `break-inside:avoid` on blocks.

TEST club numbers *(run)*: Q1 has 7 club nights, Q2 7, Q3 8, Q4 11. The calendar's two No Club nights in Q2/Q3 are already excluded by `Calendar.nights`; the six Events (the Grand Prix, a Maker Day, a service project) are not nights. Three nights (the No Club ones) have no theme, and 36 of 39 rows carry one. So a block with no theme must print cleanly.

## (b) Design

**One new report, `noteSheets`**, title "Coaches binder notes, a block for each club night", `opts: ['quarter']`, in the **Binders** report group.

**Blocks per page: 3 (exported constant `BLOCKS_PER_PAGE = 3`; supply rows `SUPPLY_ROWS = 3`).** Letter portrait, 0.5in margins, 10in printable height. The sheet's own `h2` title and the "Printed" sub line take about 0.6in, leaving **about 9.4in for blocks, so 3.1in per block including the gap**. Planned block height 3.0in:

| Part | Height |
|---|---|
| Heading line: weekday, date, theme (bold) | 0.28in |
| "Workers not available" label 0.18in + 2 ruled lines at 0.24in | 0.66in |
| "Supply orders" label 0.18in + header row 0.24in (Item, Group, Name, Size, Paid) + 3 blank rows at 0.24in | 1.14in |
| "Notes" label 0.18in + 3 ruled lines at 0.22in | 0.84in |
| Gap below | 0.10in |
| **Total** | **3.02in** (three blocks = 9.06in, under 9.4in) |

That is tight, so **step 6 measures and tunes it; the fallback is `BLOCKS_PER_PAGE = 2` with `SUPPLY_ROWS = 5`** (more writing room, about 1.5 times the paper; decision in (i) question 3). Every test derives the expected page counts from the exported constants (`Math.ceil(nights / BLOCKS_PER_PAGE)`), so the fallback does not invalidate them. The page is one `.sheet` titled "Coaches notes, Q2, page 1 of 3" with the "Printed MM/DD/YY" sub (from `printedOn`), so **Choose pages** (`pagePick` counts `.sheet` elements) lists real pages and unticking one leaves it out of the PDF. Blocks never split (`break-inside:avoid`), as in B9.3.
- With 3 per page on the TEST club: Q1 (7 nights) = 3 pages, Q2 (7) = 3, Q3 (8) = 3, Q4 (11) = 4.

**Heading line format:** `Wed 11/18 · Theme` using `Calendar.dayName(Calendar.weekday(date))` and `Model.md(date)` (the same short date every other report uses). No year (the sheet subtitle carries the quarter and the print date). A night with no theme prints only `Wed 11/25`. The weekday comes from the date, so it is right for a club that does not meet on Wednesday.

**Blank rows, not inputs.** Plain markup with bordered cells and ruled lines (CSS border-bottom on `<div class="nl">`), no `<input>`, so print needs no blank-date hook and there is nothing to save. Same approach as the record sheet (T6).

**Where it appears:**
1. `reports.js` LIST: `{ id: 'noteSheets', title: 'Coaches binder notes (a block for each club night)', render: noteSheets, opts: ['quarter'] }` placed after `binderTeams`.
2. `app.js` `RSUBS.binders` (780): add `'noteSheets'` after `'photos'`.
3. `app.js` `BINDER_PARTS` (1366): add `['noteSheets', 'Coaches notes sheets: a block for each club night (once, for the quarter)']`. It is not in `BINDER_PER_CLASS`, so it is made once, like the team lists.
4. `reports.js` `DEFAULT_BUNDLES`, Coaches binder (236): append `{ report: 'noteSheets' }`. A club that saved its own bundles (`config.bundles`) is untouched *(read: `bundlesOf` returns them as saved)*; the CHANGELOG line says to add the page on Options > Report bundles. The TEST file has no saved bundles *(run: `config.bundles` is null)*, so tests see the new default.

The report uses the **Quarter pills** for one report (`opts: ['quarter']` shows them) and the **bundle quarter** in a bundle (RP5, already built). Inside `runBundle` the quarter arrives as `ctx.settings.quarter` (overridden at `reports.js` 255), so `noteSheets` must read `ctx.settings.quarter`, never `sheetQuarter(ctx)` (which looks at `opts.date`).

## (c) The optional prefill (a question, not part of the build)

"Workers Not Available" could print the volunteers who are **Planned out** that night (`Season.absenceList`, volunteer absences S11, `season.js` 956). It would make the sheet useful the moment it is printed. The risks: a coaches binder is handed to many leaders, and a printed absence list goes stale as soon as another volunteer reports one. **Recommended default: blank lines, no prefill** (the Excel sheet is blank and written by hand, and the binder already carries the volunteer list). If wanted later it is one `absencesOn(date)` read and a line "Planned out: ..." above the blank lines. Owner question 2.

## (d) Ordered build steps, each red then green

Run from `dev/app` (`node test/<name>.test.js`; browser tests need `NODE_PATH` set to the Playwright shim in memory `awana-app-test-setup`).

**Step 1. Red: write `dev/app/test/coaches-notes.test.js` (node, TEST data).** It fails first because `noteSheets` does not exist (the `Reports.LIST.find` returns undefined). Test cases are listed in (e), group A.

**Step 2. Green: the render function** in `reports.js` (export `BLOCKS_PER_PAGE` and `SUPPLY_ROWS` on the `api` object so tests read them):
- `noteBlock(date, theme)` returns the block HTML; `noteSheets(ctx)` gets `nights = Cal.nights(ctx.calendar || [], ctx.settings.quarter)`, chunks them 3 per page, and returns one `sheet('Coaches notes, ' + q + ', page i of N', blocks, 'portrait', esc(printedOn(ctx)))` per page. No nights returns `<p class="empty">No club nights in Q2 on the calendar. Add them on the Calendar tab.</p>`; no calendar returns the same sentence with "Load a calendar on the Calendar tab first." (matching `lessons`, `reports.js` 189). Version `reports.js` 1.18.0 to **1.19.0**.
- Theme is escaped with `esc`. A theme with `<b>` or `&` prints as text (test).

**Step 3. Red: `coaches-notes-browser.test.js` group B** (list below): the report is in the Binders group, the pop-up offers it, the coaches binder includes it, the PDF page count, the phone view. Fails until the wiring exists.

**Step 4. Green: wiring** in `app.js` (1.71.0 to **1.72.0**): `RSUBS.binders`, `BINDER_PARTS`; `reports.js` `DEFAULT_BUNDLES`; the pop-up text in `index.html` and `info.js`.

**Step 5. Green: CSS** in `style.css`, one block of rules near the other sheet rules: `.sheet.notes .nblock { break-inside:avoid; margin:0 0 .2in; }`, `.nblock h3`, `.nl { border-bottom:1px solid #000; height:.26in; }`, `table.nsup { width:100%; border-collapse:collapse; } table.nsup td { border:1px solid #000; height:.28in; }`, column widths Item 34%, Group 14%, Name 28%, Size 12%, Paid 12%. Ink is black on white (the `#report .sheet` scope already forces light). Screen: the block is a normal card; at 390px the supply table keeps its five columns by wrapping the header text (no horizontal scroll, see group B).

**Step 6. Tune the page fit** by measuring (the test in group B measures it): three blocks must end above the page bottom. Adjust row heights, never remove the break rule.

**Step 7. Update the existing tests that count pages or the coaches binder** (list in (f)).

**Step 8. Versions and docs** (g). Full sweep `sh dev/tools/run-tests.sh`, then `node dev/tools/check-docs-for-names.js` and `node test/check-docs-for-names.test.js`.

## (e) Named test cases

### Group A: `coaches-notes.test.js` (node, invented TEST data, `settings.quarter` set per case)

| # | Name | Input | Expected |
|---|---|---|---|
| A1 | one block per club night | TEST calendar, quarter Q2 | exactly 7 `class="nblock"` (the 11/25 No Club night is not one) |
| A2 | events and No Club excluded | Q3 | 8 blocks; no block contains "Grand Prix", "Maker Day" or the 12/23 and 12/30 No Club dates |
| A3 | blocks per page, page titles | Q4 (11 nights), `B = Reports.BLOCKS_PER_PAGE` | `Math.ceil(11 / B)` `.sheet` sections; every sheet but the last holds `B` blocks and the last holds the remainder; titles "Coaches notes, Q4, page 1 of N" to "page N of N" (N from the formula; 4 when B is 3) |
| A4 | heading has weekday, short date and theme | first Q1 night (2026-09-09, "Opening Night (Parents welcome)") | block text contains "Wed 9/9" and "Opening Night (Parents welcome)" |
| A5 | no theme prints cleanly | invent a calendar row with `Theme: ''` | heading is exactly the weekday and date, no "undefined", no "·" left dangling |
| A6 | theme is escaped | row with `Theme: '<b>Hats & Caps</b>'` | the HTML has `&lt;b&gt;Hats &amp; Caps&lt;/b&gt;`, no live `<b>` from the theme |
| A7 | each block has the four parts | any block | contains "Workers not available", "Supply orders", "Notes"; the supply table header cells in order are Item, Group, Name, Size, Paid; `Reports.SUPPLY_ROWS` blank body rows; no `<input` anywhere |
| A8 | quarter with no nights | quarter Q1 with the calendar's Q1 rows removed | `class="empty"` message naming "Q1"; no `.sheet` |
| A9 | no calendar | `calendar: []` | "Load a calendar" message |
| A10 | sub line | `ctx.today = '2026-11-18'` | sheet sub reads "Printed 11/18/26"; without `ctx.today` there is no Printed text and no error |
| A11 | club that meets another day | calendar of three Sunday nights | headings say "Sun", not "Wed" |
| A12 | the quarter comes from settings, not opts.date | `opts.date = '2026-12-02'` (a Q2 night) with `settings.quarter = 'Q1'` | the 7 Q1 blocks, none dated in December (guards the `sheetQuarter` mistake in (b)); and `settings.quarter = 'Q3'` with the same `opts.date` gives the 8 Q3 blocks |
| A13 | standard bundles | `bundlesOf(null)` | the Coaches binder ends with `noteSheets`; Quarterly Printables and Class binder do not have it; every item still names a real report (the existing `bundles.test` rule) |
| A14 | a saved bundle is untouched | `bundlesOf({config:{bundles:[{name:'Coaches binder', items:[{report:'binderAll'}]}]}})` | still one item, `binderAll` |
| A15 | runBundle | Coaches binder, quarter Q2 | output holds the 7 blocks and the volunteers sheet; with `ctx.today = '2026-10-20'` (before Q2's first night, 2026-10-28) the blocks are the same, because the blocks do not depend on teams |

### Group B: `coaches-notes-browser.test.js` (Playwright, TEST club, `App.today = () => '2026-11-18'`)

| # | Name | Steps | Expected |
|---|---|---|---|
| B1 | in the Binders group | `App.showReport('noteSheets')` | `#rSubs button.on` is Binders; the Quarter pills are visible; `#report .nblock` count equals the club nights of the chosen quarter |
| B2 | the quarter pills change the blocks | click Q4 | 11 blocks, `ceil(11 / BLOCKS_PER_PAGE)` sheets; the app-wide quarter pill follows (it is a plain report, not a bundle) |
| B3 | pop-up offers it | open Print class binders, quick pick Coaches binder | `#dlg input[data-part="noteSheets"]` is ticked; the part count is 8 (was 7); the Class binder quick pick leaves it unticked |
| B4 | shown as part of the coaches binder | quick pick Coaches binder, Select none, Show binders | the report shows the volunteers sheet, the team lists and the note blocks; Quarter pills read "Quarter to print"; picking Q3 gives 8 blocks |
| B5 | Choose pages | on B4, open Choose pages | one entry per sheet including "Coaches notes, Q3, page 1 of 3"; Select none then tick one page: `#pageSum` says "1 of N" |
| B6 | PDF paper | `page.pdf` in print emulation for Q4 alone | `ceil(11 / BLOCKS_PER_PAGE)` pages, all 612x792, none blank; with `pdftotext -bbox` (skipped without it) no page's lowest text is below 740pt of the 756pt limit |
| B7 | coaches binder PDF stays portrait | the whole Coaches binder, Q3 | every MediaBox is 612x792 (the N1 paper test already pins this; the page count rises by 3) |
| B8 | block never splits | print emulation, measure each `.nblock` | every block's top and bottom fall on the same printed page (bounding boxes against the page height 10in) |
| B9 | phone 390x844 | Q2 on screen | `#report` has no horizontal scroll (`scrollWidth <= clientWidth`); each `.nblock` is at least 300px wide; the supply table shows five header cells, none clipped (`scrollWidth <= clientWidth` on the table); no page errors |
| B10 | the lock question does not appear | print `noteSheets` alone | no "Lock Q now?" dialog (it is not a team page); the Coaches binder (which has `binderTeams`) still asks |
| B11 | no errors | run B1 to B10 | `pageerror` list empty |

## (f) Existing tests that will go red, and the change to make

- `binders-dialog-browser.test.js` line 21: `input[data-part]` count 7 becomes 8; line 28: the Coaches binder's ticked parts become `['binderClass','volunteers','binderAll','binderTeams','noteSheets']` (the order follows `BINDER_PARTS`, so confirm the real order when running).
- `print-pdf-n1-browser.test.js` line 83 (Coaches binder portrait test): the page-count assertion, if any, rises by the note pages; the "all portrait" check stays.
- `binders-paper-browser.test.js` line 31: check for a page count or first-sheet check on the Coaches binder (read it before editing).
- `bundles.test.js` line 13-14: still passes (names and real reports); add A13 here or in the new file.
- `reports-cleanup-browser.test.js` line 73 (the Coaches binder uses no List order and no Title): still true.
- **Sweep for tests that pin the Binders group or a report's option list** (do this before editing, then list every hit here): `grep -n "binderAll\|rSubs\|#rSel option\|rsub" dev/app/test/*.js`. Known candidates: `field-reports-browser` #7 (where each report lives; add `['noteSheets', 'binders']`), `reports-subtabs-browser` and `reports-new-browser` (option lists), `bundles-browser` (bundle option names, unchanged).
- `hidden-attr-browser.test.js` line 45 picks a report with a quarter option: check it does not now pick `noteSheets` in a way that fails.
- `README.md` test list: add the two new test lines.

## (g) Versions and docs

- `reports.js` 1.18.0 to 1.19.0; `app.js` 1.71.0 to 1.72.0; `info.js` 1.24.1 to 1.24.2; `index.html` `app-version`: **1.51.15f** (if the calendar maker, planned as 1.52.0, lands first, N1 becomes a minor on top of that version; either order works, the files do not overlap except `reports.js`, see (h) risk 1).
- `index.html` How it works, Reports section (line 583 area): one sentence, "**Coaches binder notes** print a block for each club night of the quarter (date and theme, workers not available, supply orders, notes) to write on during club." In the Binders paragraph, mention the new page in the pop-up. `info.js` `reports.print`: add the same sentence; run `node dev/tools/sync-guide.js`.
- CHANGELOG, under 1.51.15f: "**Coaches binder notes sheets.** A new Binders report with a block for each club night of the quarter: date and theme, Workers not available, Supply orders (Item, Group, Name, Size, Paid) and Notes, three blocks to a page. It is the last page of the standard Coaches binder and a tick in the Print class binders pop-up. A club that saved its own Coaches binder on Options adds the page there."
- README: the two new test lines. BACKLOG: tick N1 (date, version, tests), move to the Done log. No DATA-FORMAT change (nothing stored).
- Print and phone check by hand (Mike): print one Q on real paper and write on it (the rows must be tall enough for handwriting); look at Q on the phone.

## (h) Risks

1. **`reports.js` is also edited by the calendar maker** (`lessons`, line 189-194, and possibly bundle code). Different functions; merge by function. If the calendar maker adds a `Cancelled` row flag, `Calendar.nights` is still the one filter this report uses, so it follows automatically. Use `Calendar.nights`, never `r.Type !== 'Event'` by hand (`lessons` does the latter and prints No Club nights; this report must not).
2. **Page fit is a guess until measured** (3 blocks in 10in). B6 and B8 measure it; the fallback is 2 per page.
3. **Handwriting space**: 0.24in lines are tight for most hands; the owner may want 0.3in, which means 2 per page.
4. **A saved Coaches binder on Options will not gain the page.** Said in the CHANGELOG; the pop-up quick pick and a single report both work without it.
5. **Quarter with only a few nights** prints a short last page; that is fine.
6. **Dark mode**: `#report .sheet` forces light colors, so ruled lines print and show black on white.

## (i) Questions for the owner, with recommended defaults

1. **Is the block exactly the Excel layout (date and theme, Workers Not Available, Supply Orders with Item, Group, Name, Size, Paid, Notes)?** Default: **yes**, as in BACKLOG. Send a photo (invented names only) if the Excel sheet differs, for example more columns or a header per quarter.
2. **Prefill Workers Not Available with the planned-out volunteers?** Default: **no**, blank lines (see (c)).
3. **How many blocks per page: 3 (smaller writing room) or 2 (more room, about twice the paper)?** Default: **3**, with 3 supply rows; step 6 decides by measuring (the fallback is 2 per page with 5 supply rows).
4. **Add the page to the standard Coaches binder?** Default: **yes**, last page. (Also in the pop-up as its own tick either way.)
5. **Quarter or whole year?** Default: **a quarter** (as asked), with the pills or the bundle quarter. A whole-year option is not planned.
6. **Include Events (Grand Prix, Maker Day) as blocks?** Default: **no**, club nights only; a leader can write an event under Notes of the nearest night.
7. **Version:** Default: add to **1.51.15f**.
