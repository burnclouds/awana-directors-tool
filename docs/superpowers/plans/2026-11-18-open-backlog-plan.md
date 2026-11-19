# Plan: every open backlog item except N3 (2026-11-18)

**Status (updated 2026-11-18 night): N2 to N18 (Part 1, below) are built in 1.51.16 (dev and `deploy/`, unpushed). N19 and N20 are in `2026-11-18-n19-hide-flags-plan.md` and are built. Part 2 (N21 to N31, at the end of this file) is the new work: plan only, nothing built. N3 and N9 stay parked.**

**Status: plan only, nothing built.** Covers N2, N6, N7, N8, N9 (split into proposals), N11 to N18. N3 (club calendar) is paused by Mike and left out, but N2 depends on it (section N2). The P1, P3, W and N-tests sections of `BACKLOG.md` have no open `[ ]` items; the Done log has none either. Several `[x]` items still wait on Mike's phone checks (S8 to S14, N4, N5); those are not open work and are listed once in section 5.

Every claim marked *(run)* was checked on 2026-11-18 on the invented TEST club (`dev/test-data/awana-2026-27-TEST-20261029-214815.json`) in Chromium (Playwright 1.65.1, print emulation, `page.pdf`). *(read)* means read in the code at the line given. No real data was used.

Source state: branch `public`, `dev/app/index.html` `app-version` **1.51.15h** (committed `cb0544f`, not deployed; live is 1.51.15g). `app-build` still reads `2026-11-17` on 1.51.15h *(read, index.html 7)*: set the real date at the next bump. File versions now: `reports.js` 1.19.0, `reports-season.js` 1.34.0, `app.js` 1.74.0, `app-person.js` 1.25.1, `app-update.js` 1.6.0, `app-tools.js` 1.7.0, `season.js` 1.68.1, `validate.js` 1.14.0, `datamerge.js` 1.1.5, `calendar.js` 1.2.0.

Test setup for every step: memory `awana-app-test-setup` (`NODE_PATH=/home/burnclouds/awana-test-tools/node_modules`, `NODE_OPTIONS="--require $PWD/test/lib/pw-dialog-compat.js"`, run from `dev/app`). Targeted tests while building; the full sweep only before a commit and only after asking Mike.

---

## 1. Recommended order (summary)

| Step | Items | Why together | Size | Touches |
|---|---|---|---|---|
| A | **N8 + N11** attendance sheet | same renderer (`reports.js` `attendance`) and same CSS; N11 overrides N8's 25-row rule | M | `reports.js`, `style.css` |
| B | **N16** coaches notes fit | reproduced: long themes push the quarter to 2 pages | S-M | `reports.js`, `style.css` |
| C | **N12** review rows at the bottom | printed Sparks record only | M | `reports-season.js`, `style.css` |
| D | **N15 + N13** emergency widths, contact-list order | small print fixes in `reports.js` | S + S | `reports.js`, `style.css` |
| E | **N14** answer Mike now; then a label fix | no code needed to answer; label is two lines in `app.js` | S | `app.js` |
| -- | release the printables (A to E) as one version | | | |
| F | **N6** volunteer opens on Registration | Person tab only | S | `app-person.js` |
| G | **N7** splash shows the last check (+ a service-worker offline signal) | update path | S-M | `app-update.js`, `app-tools.js`, `sw.js` |
| H | **N17 + N18** bug-report conversation and statuses | both rewrite the reply row and the bug data | M-L | `season.js`, `app-tools.js`, `validate.js`, `DATA-FORMAT.md` |
| I | **N2** lessons by week | already designed inside the paused N3 plan; build with N3 or as a slice of it (decision D1) | M (slice) | `calendar.js`, `reports.js`, `app.js`, `season.js` |
| J | **N9** proposals worth doing now: N9.1 (test gate in the Pages workflow), N9.4 (one manual-check list) | process, not app code | S each | `.github/workflows/pages.yml`, `docs/reference/` |

Printables first (memory `awana-project-status`: Mike's priority). A before B because A is the sheet leaders use every week and has two field reports. F and G are small and independent; they can go into the printables release if they are done first. H changes the data file (new fields, a status upgrade), so it ships on its own and every leader updates before relying on it.

---

## 2. Items

### N8 + N11. Attendance sheet: centered (or no) mark heading, hole-punch room, 20 rows (step A)

**What is true today**
- Renderer: `reports.js` `attendance` (57-84). `MIN_ROWS = 25` (11); rows per class `Math.max(MIN_ROWS, people.length + 3)` (63), so a class with more than 22 children already makes a taller table that spills. One `<section class="sheet landscape">` per class, no page split. `MARKS.Puggles = ['Attendance']` (41): one mark column per night. The mark row is built at 69: `<th class="mark"><span class="rot">`.
- **Cause of the off-center heading, found** *(run)*: the global rule `table.att td:nth-child(2), table.att th:nth-child(2) { text-align:left; padding-right:24px; }` (`style.css` 216) is meant for the on-screen Attendance tab but also hits the printed sheet. In the mark-heading row it makes the **second** mark cell left-aligned with a 24px right pad. Measured under print emulation: Puggles mark headings at offset 38px in a 91px cell (centered) except the second night, at 1px (left); the same in every class (Cubbies, Sparks, T&T: second mark cell `text-align:left`, `padding-right:24px`). The same line also sets `table.att { width:auto; min-width:520px }`, which beats `width:100%` at line 97, so the Puggles table is 801px and the Cubbies table 698px wide in a 1366px sheet *(run)*; Sparks and T&T fill the width only because they have more columns. The on-screen tables are `table.roster.att` (`app-season.js` 405, `app-person.js` 117).
- Heights *(run, print emulation, TEST club, Q2 with 7 nights)*: every class prints 25 rows of 20.1px; the heading block is 87px (Puggles, Cubbies) or 92px (Sparks, T&T); sheet 615 to 641px. `@page land` margin 0.4in (`style.css` 130); the printable height is 7.7in (739px). Attendance PDF: 10 pages for 10 classes.
- Class sizes on the TEST club *(run)*: largest T&T Girls (Group B) 17, so 17 + 3 = 20 rows fits exactly; Puggles 8, Cubbies 14, Sparks A 14.
- N11's first note was cut off ("above report header (Date/time,"). "Date/time" is most likely the browser's own header line (Chrome's *Headers and footers* prints date and time at the top left, inside the page margin). The app prints no date on this sheet today (only binder pages carry `printedOn`).

**Conflict:** N8 says keep the 25-row minimum; N11 asks for 20. N11 is the later request and wins. Build them as one change so the tests are rewritten once.

**Design**
1. Heading fix, minimal: add `#report table.att th.mark { text-align:center; padding:0; }` (higher specificity than line 216; nothing on screen changes). Also scope the width override: change line 216 to `table.roster.att { width:auto; min-width:520px; } table.roster.att td:nth-child(2), table.roster.att th:nth-child(2) { ... }`. That makes the printed Puggles and Cubbies tables full width (wider date columns). This is a visible paper change: decision D3.
2. Puggles (one box a night): leave the mark row out when `marks.length === 1`. The `Name` and `Color Team` cells get `rowspan="1"` instead of 2, and the date heading heads the column alone. Saves about 54px of heading on Puggles. Every other class keeps the rotated words, centered. (BACKLOG N8 suggestion; decision D2.)
3. 20 rows a page: `ROWS_PER_PAGE = 20` replaces `MIN_ROWS`. A class whose children plus 3 blank rows fit in 20 prints one page of 20 rows. A bigger class splits into pages of 20 rows, every page with the full heading, titled `<class> — Q2 Attendance, page 1 of 2`; blank rows are only at the end of the last page (at least 3 kept, so the last page may be short of 20 names). Each page is its own `<section class="sheet landscape att">` so the existing `break-after: page`, Choose pages and the binder page counts work unchanged.
4. Hole-punch room: the sheet gets a class `att`; print CSS `#report .sheet.att { padding-top: 0.45in; }` (0.4in margin + 0.45in = 0.85in clear from the top edge; a 3-hole punch on the long edge of a landscape page needs about 0.75in). Screen unchanged. Only the attendance sheet, as N11 says; other binder pages only if Mike asks (decision D4).
5. Optional: add `Printed MM/DD/YY` to the sheet's subtitle (`printedOn(ctx)`, as on the binder pages), so the leader can turn off the browser's own date/time header. Decision D4.

Page budget after the change *(estimated from the measurements above)*: Sparks 92 + 20 x 20.1 + title about 40 + 43 (padding) = 577px of 739px. Puggles about 523px. Room to spare; the heading row does not get taller (the rotated span is unchanged; Puggles loses its row).

**Files and tests**
- `reports.js` (1.19.0 to 1.20.0): `ROWS_PER_PAGE`, page split, Puggles mark row, `att` class, optional `printedOn`.
- `style.css`: the `th.mark` rule, the line 216 scope, the `.sheet.att` print padding.
- New `test/attendance-n8-n11-browser.test.js` (TEST club, print emulation), cases:
  - N8-1 every `th.mark` in `#report` has computed `text-align: center` and `padding-right: 0px`, and its `.rot` span is centered within 1px (`|left gap - right gap| <= 1`), for Cubbies, Sparks A and T&T Girls (Group B).
  - N8-2 Puggles sheet has no `th.mark` and no `.rot`; each date `th` has `rowspan` 1 or none; the heading block is shorter than Cubbies'.
  - N8-3 the on-screen Attendance tab (`table.roster.att`) still has `text-align:left` on its second column (nothing changed on screen).
  - N11-1 every class with 17 or fewer children prints exactly 20 body rows.
  - N11-2 a class pushed to 25 children (add 8 invented children in the page with `App.master.people.push(...)` copies, or a fixture) prints 2 sheets titled `page 1 of 2` and `page 2 of 2`, 20 rows each, every child once, at least 3 blank rows at the end.
  - N11-3 PDF: one page per sheet (10 pages for the TEST club), all 792 x 612; on every page the first text (the title) starts at or below 0.85in from the top (pdftotext bbox, as `print-pdf-n1-browser` does), and the lowest text is above the bottom margin.
- Existing tests to run: `attendance-landscape-browser`, `attendance-fill-print`, `attendance-quarter-night`, `print-b7`, `print-blank-dates-browser`, `binders-paper-browser`, `binders-dialog-browser`, `print-pdf-n1-browser` (it expects "17 sheets on 18 pages" for a class binder: recount after the change), `review-leftovers` (print column widths), `mobile-audit.js`, `hidden-attr-browser`.

**Steps**
1. Red: write the new test. N8-1, N8-2, N11-1 to N11-3 fail.
2. CSS heading fix (N8-1, N8-3 green). Decide D3 before scoping line 216.
3. Puggles mark row (N8-2).
4. Page split and 20 rows (N11-1, N11-2).
5. Punch padding (N11-3).
6. Run the existing list; fix the counts in `print-pdf-n1-browser` on purpose.

**Risks**
- Paper: the printed Puggles and Cubbies tables get wider if line 216 is scoped (D3). The page count rises for any class over 17 children; `binders-paper` and `print-pdf-n1` count pages.
- A real class larger than the TEST classes: the split covers it; check the real file's class sizes by count only (no names) before release.
- `attendance-fill-print` fills ticks by row index: a split must keep each child's ticks on their own row.
- Service worker: style and script change, so `make-deploy` builds a new release; nothing special.

**Mike's checks (by hand):** print Puggles, Cubbies and one Sparks class on real paper; punch them; the holes clear the title. Turn off the browser's Headers and footers once and see whether the date line was what he meant. Confirm the heading looks centered.

---

### N16. Coaches notes sheet does not fit the printed page (step B)

**What is true today**
- Renderer: `reports.js` `noteSheets` 220-227, `noteTable` 213-218, `noteNight` 208-211. `NIGHTS_PER_PAGE = 14`, `ROWS_BUDGET_IN = 9.2` (203); rows per night `rowsFor(n)` 2 to 5 (204), each row a fixed height `rowHeightIn(n)` (205). The date and theme sit in one `th.nhead` with `rowspan` = rows, in a 5.1% column (`style.css` 794-795; theme at 7.5px, `overflow-wrap:anywhere`).
- On the TEST club every quarter prints on one letter and one A4 page *(run; `coaches-notes-browser` passes)*.
- **Reproduced** *(run)*: the same test on a copy of the TEST file with about 35 characters added to every theme fails: Q1 (7 nights) prints on **2 letter pages**, and B6/B8 reports "page count 2 vs 1". The theme wraps almost one word per line in the narrow column, so the `th.nhead` grows taller than its rows and every block gets taller. The row heights are fixed, the theme is not. Real themes longer than the TEST ones, or edited since the TEST file was made (Oct 29), would do exactly this.
- Not reproduced: a difference from the print dialog (Chrome on Windows with its own margins, scale or Headers and footers, or a phone). Also seen *(read)*: the phone rule `@media (max-width: 760px)` at 796 applies in print on A4 (8.27in - 0.5in = 7.77in = 746 CSS px), changing the date column to 16% and fonts to 8px. It does not make the sheet taller, but the A4 layout differs from letter.

**Design**
1. The theme must never set the block's height. Wrap date and theme in `<div class="nh" style="max-height:<rows*h - 0.02>in">` with `overflow:hidden`, and size the theme by length: 7.5px up to 30 characters, 6.5px to 60, 6px beyond (a class on the `<i>`, chosen in `noteNight`). A theme that still does not fit is cut at the bottom of its block (the full theme is on the calendar); decision D5 offers the alternative of a theme line across the top of each block.
2. Leave slack: `ROWS_BUDGET_IN` 9.2 to 9.0, so the print dialog's rounding and the 3px gaps have room.
3. Scope the phone rule at 796 to `@media screen and (max-width: 760px)` so A4 prints like letter.
4. If after this one quarter still cannot fit (more than 14 nights), the existing split and "page n of N" titles stay.

**Files and tests**
- `reports.js` 1.20.0 (with step A, or 1.21.0), `style.css`.
- `coaches-notes-browser.test.js`: add a case that loads the TEST file and sets long themes in the page before drawing (60-character invented themes such as "Crazy Hair Night and Bring a Friend, Wear Your Team Colors"), then asserts one letter page and one A4 page for every quarter, nothing below the bottom margin (`lowest(buf) <= 760` letter, `<= 820` A4), and every `th.nhead` no taller than the sum of its rows (DOM, print emulation). The existing cases stay.
- `coaches-notes.test.js` (node): the theme size class by length.

**Steps:** red (the long-theme case fails today, as above) -> clamp and size classes -> budget -> phone-rule scope -> run `coaches-notes`, `coaches-notes-browser`, `binders-dialog-browser`.

**Risks:** a cut-off theme (D5). The A4 change alters the phone-print layout on A4 only.

**Mike's checks:** print Q2 from the same browser and printer that spilled; if it still spills, send the print dialog settings (paper, margins, scale, Headers and footers) and the PDF. Write on one sheet to check row height (still open from N1).

---

### N12. Child record sheet: review rows at the bottom (step C)

**What is true today** *(read)*
- The Progress Sheets report and the Achievement Record both draw `recordBody` (`reports-season.js` 87-139) through `recordSheet` (141).
- Only Sparks has reviews: `catalog.js` 36-37 give every Red and Green Jewel `items 1-4` and `review 5-8`. T&T and Cubbies have no `review` key, so their sheets do not change.
- `addBlock` (97-109) pushes each jewel's item row and then its review row (`<td class="nm rvn">review</td>`, 103), so reviews sit under each jewel.
- The bands (129-132) are found by row index: Book award `R` to the last `GJ4` row ("every unshaded box"), Review Emblem `RJ1` to the last `GJ4` row. With reviews moved, `lastIndexOf('GJ4')` would land on the GJ4 review row at the bottom and stretch the Book award band over the reviews, so the bands must be recomputed.
- The on-screen Progress sheet already shows "jewels, then the reviews numbered 1 to 4, then the Review Emblem" (`progress-reviews-browser`). The printed sheet is the odd one out.

**Design**
- `addBlock` returns the review rows instead of pushing them; the Sparks branch collects them and pushes them after the last `perBook` block, in jewel order, each with its own name cell `<td class="nm rvn">RJ1 review</td>` (short code, since the name column is 0.80in; decision D6 on the label).
- Order on the page: Flight 3:16 (first book only), Rank, jewel item rows, **review rows**, Review Emblem row, Blue Jewels, Book award row. (Today Blue Jewels come before Review Emblem.) This keeps the inner band contiguous.
- Bands: Book award band from `R` to the last **item** row of `GJ4` (track by a flag on the row, `rv: true`, not by `bk`); Review Emblem band from the first review row to the Review Emblem row's row before, with text "REVIEW EMBLEM: every jewel box and every review". Decision D6: whether the Review Emblem band should instead be dropped, since it can no longer cover the jewel rows and the reviews together.
- Row count and row height unchanged, so the page fits as before (lowest text 590pt of 756pt for Sparks, T6).

**Files and tests**
- `reports-season.js` 1.34.0 to 1.35.0; `style.css` only if the label needs a smaller font.
- `progress-record-sheet-browser.test.js`: new case N12-1: on a Sparks sheet, every `td.rvn` row comes after the last jewel item row and before the Review Emblem row; each review row's label names its jewel; the Book award band's `rowspan` covers no `rvn` row; the award rail and two Given boxes per jewel still sit on the jewel's item row. N12-2: a T&T and a Cubbies sheet render byte-identical to before (snapshot the HTML string before the change in the test file). The existing one-page and box-size checks stay.
- Also run `progress-pdf-browser`, `progress-onepage-browser`, `print-layout-browser`, `print-b9-items`, `cubbies-record`, `given-nodate-browser`, `nodate-reads`, `print-blank-dates-browser`.

**Risks:** the band layout (vertical text in 0.12in columns) is the fragile part; look at a rendered page (Ghostscript, as T6 did). Reviews far from their jewel make it harder to see which review belongs to which jewel: the label carries that.

**Mike's checks:** print one Sparks sheet with a few reviews signed; the leaders can find the review boxes; the bands read right.

---

### N15. Emergency, Medical and Photos: the same column widths on every class (step D)

**What is true today** *(read)*: `binderClass` (`reports.js` 132-136) and `binderAll` (160-163) use `table(..., 'wrap emerg')`: `table.grid` with `width:100%` and the browser's automatic layout (`style.css` 86-89), so the columns size to their content and change class to class. Print rules for `.emerg` set only padding and font (280). Names and phones are in `<span class="nw">` (no wrap), which pushes the automatic widths around.

**Design:** `table.grid.emerg { table-layout: fixed; }` plus a `<colgroup>`: class page Name 24%, Emergency contact 28%, Medical / allergy notes 48%; everyone-by-name page Name 22%, Class 13%, Emergency contact 25%, Medical 40% (`table()` gets an optional `cols` argument). Inside `.emerg`, let `.nw` wrap at spaces when the cell is too narrow (`white-space:normal` only for the name span; a phone stays whole). Same on screen and in print. Decision D7: apply to the everyone-by-name page too (recommended yes).

**Files and tests:** `reports.js`, `style.css`. New case in `print-pdf-n1-browser` (it already checks 12px emergency pages): for Puggles, Cubbies, Sparks A and T&T Boys (Group A), each column's left edge is the same on every class page (within 1px), screen and print; a 60-character invented medical note wraps inside its column (cell `scrollWidth <= clientWidth`); still one PDF page per class. Run `emergency-phone`, `print-b7`, `mobile-audit.js` (no sideways scroll at 390px).

**Risks:** a long phone list or name in a fixed column could overflow: the wrap rule covers names; check the no-phone warning cell (`warnCell`, nowrap, about 20 characters) fits 28%.

**Mike's checks:** print two classes and lay them on top of each other.

---

### N13. Volunteer Contact List: by assignment, then name (step D)

**What is true today** *(read)*: `reports.js` `volunteers` 229-237 sorts with `byLast` (233); columns Name (`Last, First`), Assignment (class) = `M.room(p)`, Phone, Email. TEST club *(run)*: volunteers are spread over 11 assignments, 10 of them in plain "Volunteers".

**Design:** sort by `M.roomRank(room)`, then room name, then `byLast` (same rank as every other list: Puggles, Cubbies, Sparks A to D, T&T, then anything not in `ROOM_ORDER`, `model.js` 39, 515). "Volunteers" (no class) last. One list, no second view (BACKLOG suggestion). Optional: a thin heading row per assignment; decision D8 (recommended no, the column already says it).

**Files and tests:** `reports.js`. `contact-lists.test.js`: new case: rows ordered by class rank then last name; a volunteer with no class is after every class. Run `coaches-binder` (the coaches binder carries this list).

**Risks:** none on paper (same columns, same page count).

**Mike's check:** none needed beyond a glance.

---

### N14. "Your binders: <class>" (step E: answer first)

**What is true today** *(read, `app.js`)*: `binderSel` (783) is set only by the **Print class binders** pop-up's Show binders button (1436). Its name is `<quick-pick name>: <classes ticked>`, or `Custom binders: ...` (1434), or a club bundle's saved name when that bundle names classes. `fillReportSel` (793) then lists it as `Your binders: <name>` in the "Print several at once" group. It is not a separate report: it is the last thing the pop-up made, kept for the visit, and the pop-up remembers its own ticks (`binderPrefs`, 1428). Only one class shows because only one class was ticked the last time the pop-up was used.

**Not verified:** with the standard quick pick the option reads `Your binders: Class binder: Sparks A`, not `Your binders: Sparks A`. Either the quick pick was Custom with a different name, or the select cut the text on a narrow screen. Ask Mike which quick pick he used if it matters.

**Answer to send Mike (plain):** "Your binders" is not a different binder. It is whatever you made last in Print class binders this visit; it shows Sparks A because Sparks A was the only class ticked then. The Class binder in the list prints the class chosen in the Class picker; Print class binders makes one set for several ticked classes at once.

**Fix (after his answer; decision D9):** recommended: rename the option to `Last made in Print class binders: Class binder, 1 class (Sparks A)` and add a **Change...** button beside the bar note that reopens the pop-up. Alternative: drop it from the Report picker and show it only as the result of the pop-up. Files: `app.js` 793, 818, 1434. Tests: `binders-paper-browser`, `reports-cleanup-browser` (they select `bundle:picked`), plus one case for the new label.

---

### N6. Person tab: a volunteer (or Puggle) opens on Registration (step F)

**What is true today** *(read)*
- `app-person.js` 7: `ui.sub` defaults to `'progress'`; 174 only corrects an unknown value. `App.showPerson` (333) sets `ui.sub = opts.sub || (opts.attention ? 'registration' : 'progress')`. Search passes `{ sub: 'progress' }` explicitly for the People tab (`app-search.js` 67), so "explicit progress" cannot mean "picked on purpose".
- The empty page comes from `app-season.js` 947 (`progressAllowed`, 764: clubber in Cubbies, Sparks or T&T).
- **Hazard:** `App.personSub()` (335) feeds `viewOf` (`app.js` 379): Registration is a held-changes (draft) view, the other sub-tabs are live. A fallback that shows Registration while `ui.sub` still says `progress` would make Registration edits live instead of held. `App.progressShowing` (334) and `redrawSheet` (`app-season.js` 1027) read the same value.

**Design:** keep `ui.sub` as the user's choice and add `shownSub(p)`: `ui.sub === 'progress' && !hasSheet(p) && ui.subPickedFor !== id ? 'registration' : ui.sub`. `ui.subPickedFor` is set to the person's id when the user clicks a sub-tab button (201), so a deliberate click on Progress for a volunteer still shows the "no progress sheet" message; any other way of arriving (list, search, Previous/Next, `showPerson`, Recent places) uses the fallback. `render`, `App.personSub` and `App.progressShowing` use `shownSub`. Stepping from a volunteer to a child brings Progress back (Registration was only a fallback), as the backlog suggests. `hasSheet` = the same rule as `progressAllowed` (export it from `app-season.js` as `App.sheets.allowed`).

**Files and tests:** `app-person.js` (1.25.1 to 1.26.0), `app-season.js` (export only, patch bump). New `test/person-default-sub-browser.test.js`: N6-1 search for a volunteer opens Registration; N6-2 a Puggle opens Registration; N6-3 a Sparks child opens Progress; N6-4 Previous/Next from a volunteer to a child shows Progress, and back shows Registration; N6-5 Attendance picked on a child stays Attendance on a volunteer; N6-6 a click on Progress for a volunteer shows the message; N6-7 on the volunteer's fallback Registration an edit is held (the Apply bar shows), proving `viewOf` sees Registration. Run `person-bar-browser`, `attend-person-browser`, `update-autosave-browser` (S13 place restore), `trail-browser`, `topbar-phone-browser`.

**Risks:** the draft/live hazard above (N6-7 pins it). S13's live update restores `sub`: the place stores `ui.sub`, so a restored volunteer still falls back.

**Mike's check (phone):** search a volunteer; Registration shows. Step to a child; Progress shows.

---

### N7. Splash: when updates were last checked (step G)

**What is true today** *(read)*
- `app-tools.js` 12-23: the splash line `#splashVer` reads `Version 1.51.15h (2026-11-17) · check for updates`; only a click writes `#splashUpdMsg` ("Checking...", "You are on the latest version", "Could not check: ..."). `splash-update-check-browser` covers the click.
- `app-update.js`: the N5 launch check runs 1500ms after load (`LAUNCH_CHECK_MS`, 15; 113) and calls `check()`, which sets `U.last` and `U.error` and calls `redraw()`, which knows nothing of the splash. So the launch result never reaches the splash.
- **Bug found** *(read)*: `check()` returns at once when a check is already running (`if (!web || U.checking) return`, 30). A splash click during the launch check then reads the old state and can say "You are on the latest version" before anything was fetched.
- **Offline is invisible on an installed PWA** *(read, `sw.js` 41-42)*: the service worker answers the update check's `index.html` from the network and, when that fails, from the cached copy. The cached copy has the running version, so `check()` sees "same version" and reports no error. "Could not check (offline)" can only appear without a service worker.

**Design**
1. `check()` keeps one promise (`U.pending`) and returns it to a second caller, so the splash click waits for the launch check.
2. `redraw()` calls `App.splashUpdate && App.splashUpdate()`; `app-tools.js` defines it and writes the line from `App.updates.state()`: `Checking...` while `checking`; `Checked for updates at 10:42` (adds the date, `on 11/17`, only when it was another day); `Could not check (offline)` for an offline error; `Could not check: <reason>` otherwise; a found version keeps today's "Version X is available" with Update now. The launch check sets `checking` before the splash is drawn, so the line starts at "Checking...".
3. `sw.js`: when the network fails and the cached page is used for a request with the `_=` query, return it with a header `x-awana-offline: 1` (`new Response(hit.body, { headers })`); `check()` treats that header as the offline error. Normal page loads are untouched.
4. Readable on a phone: the line wraps under the version, 14px, nothing over the splash buttons.

**Files and tests:** `app-update.js` 1.6.0 to 1.7.0, `app-tools.js` 1.7.0 to 1.8.0, `sw.js` (template; its release comes from `make-deploy`), `style.css` if the line needs a rule. Extend `splash-update-check-browser`: N7-1 on open (no click) the line shows "Checking..." then "Checked for updates at HH:MM"; N7-2 server down: "Could not check"; N7-3 a click during the launch check makes one request (the existing request counter) and shows the real result. Extend `service-worker-browser`: N7-4 with the worker in control and the server stopped, the launch check shows "Could not check (offline)". Run `update-launch-browser`, `update-autosave-browser`, `splash-covered-browser`.

**Risks:** the service-worker change ships in every release's `sw.js`; a mistake there breaks offline start (N7-4 and the existing offline test catch it). Old workers keep the old behavior until the new release activates.

**Mike's checks:** open the installed app on the phone: the splash says when it checked. Airplane mode, open it again: it says it could not check.

---

### N17 + N18. Bug reports: a conversation; statuses Open, Fixed, Dropped (step H)

**What is true today** *(read)*
- `season.js`: `BUG_STATUS = ['open', 'answered', 'fixed']` (887); `addFlag` writes `status: 'open'` (902); `setBugReply` (911-920) holds one `reply` and `replyAt`, a new reply overwrites the old; `bugList` sorts by `{ open: 0, answered: 1, fixed: 2 }` (985); new season carries bug flags whose status is not `fixed` (536); History wording 1354-1359.
- `app-tools.js`: `STATUS_WORD` (50), the filter buttons All/Open/Answered/Fixed (67), the edit row with a status select and one reply textarea (61-64), the save handler (95-104) calls `App.setBugReply` (`app-season.js` 1295).
- `validate.js` 260-271: unknown status is an **error**; reply and replyAt must go together.
- `datamerge.js` 29: bug flags are their own merge category. `Season.merge3` merges by path; `diffInto` (`season.js` 1221-1226) treats an array as one value. The test `bug-reports` "two different replies are one conflict" pins today's behavior.
- Anonymizer: `make-test-data.js` 278-279 drops the whole `flags` section and 305 drops its History lines, so replies never reach the public TEST data. Nothing new is needed there; a test pins it.
- `DATA-FORMAT.md` 437 documents `status`, `reply`, `replyAt`.

**Design**
- **Shape: an object keyed by reply id, not an array** (changes the backlog's proposed `thread: [...]`). Two leaders who each add a reply to one report each add a different key; `merge3` keeps both. An array would be one value and the two additions would clash, which is what N17 wants to stop.
  `replies: { r<time36><2 random>: { at: 'YYYY-MM-DD', by: 'leader' | 'developer', text } }`, shown sorted by `at` then id.
- **Old files, no rewrite:** an existing `reply`/`replyAt` pair stays where it is and is shown as the first reply (`by` developer, since only the developer has answered so far). An older app copy still shows it. No File upgrade entry for replies, no format version change (DATA-FORMAT §4.2: unknown keys inside a flag are kept by older copies; check with a round trip through 1.51.15h's `toJson` in a test).
- **Who wrote it:** the app has no sign-in identity, so the Add reply box has a two-choice `By: Leader | Developer` (remembered for the visit). No names stored (decision D10).
- **Statuses:** `BUG_STATUS = ['open', 'fixed', 'dropped']`, words Open, Fixed, Dropped (decision D11 on the word). Sort open, fixed, dropped. A reply never changes the status.
- **Old `answered`:** an upgrade in `fromJson` rewrites `answered` to `open`, logged in the one File upgrade entry (precedent: `upgradeTeamColors`, T2). Mike's own file has two such reports (BACKLOG N18). An unknown status still opens and reads as open; Validate turns the unknown-status **error into a warning** so an older or newer copy's word does not mark the file invalid (decision D12).
- **New season:** carry bug reports that are `open` only (`fixed` and `dropped` stay with the closed year): `season.js` 536.
- **History:** a reply add/remove is a path `flags.<id>.replies.<rid>`; `describe` gets "Bug report · reply added: <text>" and "reply removed". Undo works per reply.
- **UI (Debug row):** the Reply column lists the replies in order, each "text — by Leader, 11/18"; under them an **Add reply** box with By and Add; a status select with Open, Fixed, Dropped saved on change; each reply has a small Remove (with the app's Undo message). The filter row: All, Open, Fixed, Dropped. Phone: the row stacks (existing `.bugedit`).

**Files:** `season.js` (1.68.1 to 1.69.0: `BUG_STATUS`, `addBugReply`, `removeBugReply`, `setBugStatus`, `bugThread(f)` read helper, upgrade, carry rule, describe), `app-tools.js` (1.8.0 to 1.9.0), `app-season.js` (wrappers), `validate.js` (1.14.0 to 1.15.0: `replies` shape: object of `{ at: date, by: one of two, text: non-empty text }`; unknown status a warning), `datamerge.js` only if the summary should say "reply added" (patch), `DATA-FORMAT.md` 437 and the flags example, `index.html` help paragraph (625) and `sync-guide` if a note changes, `CHANGELOG`.

**Tests**
- `bug-reports.test.js` (node): add, remove, order by date; an old `reply` shows as the first reply; status set keeps replies; `answered` in a file opens as `open` with one File upgrade entry, and a current file gets none; unknown status `"later"` opens, reads as open, Validate warns (not errors); merge: a reply added on each of two copies keeps both, no conflict (replace the "two different replies are one conflict" case on purpose); History and Undo per reply; new season carries `open` only; `toJson` round trip unchanged for a file with no replies.
- `bug-button-browser.test.js`: filters Open/Fixed/Dropped; Add reply twice shows two dated replies in order; By choice shows; Remove with Undo; 390px no sideways scroll.
- `validate.test.js`, `data-format-doc.test.js`, `season-sections.test.js`, `anonymizer-atomic.test.js` (a TEST file with a bug report with replies: the output has no `flags` and no History line about it).

**Risks**
- Data format: new keys inside a flag; an older copy (1.51.15h) keeps them but does not show them, and its Validate would call `dropped` an error until it is updated. Every leader updates before anyone uses Dropped.
- Merge: two copies setting different statuses still clash (one value), which is right.
- `answered` to `open` reopens two of Mike's reports on purpose (D11/D12 confirm).

**Mike's checks:** on the phone, add a reply to a report on the Debug tab; mark one Dropped; open his real file and see the two old answered reports now Open.

---

### N2. Lessons by week (step I)

**What is true today**
- `calendar.js` 6: columns `Cubbies Lesson`, `Puggles #`, `Puggles Title`, `Sparks Lesson`, `T&T Lesson`. `reports.js` `lessons` (189-196) prints Date, Cubbies, Puggles (# + title), Sparks, T&T. The Calendar tab already edits every lesson cell by hand (`app.js` `CAL_TEXT` 1229, inputs per row in `renderCalendar` 1230-1245); there is no grid by night with only the lesson columns.
- The code maps columns correctly; **the data is two columns off** *(run on the TEST calendar, which kept the club's calendar text)*: `Puggles #` and `Puggles Title` are empty on all 39 rows, `Sparks Lesson` holds 1.1 to 4.8 (32 rows), `T&T Lesson` holds Puggles-style titles ("God Made the Light" ...), `Cubbies Lesson` is right (Booklet, Bear Hug 1 ...). The Excel headings carried the shift into the imported CSV.
- **N2 is already designed inside the paused N3 plan** (`docs/superpowers/plans/2026-11-18-calendar-maker-plan.md` b1, b5, b6, c5, d2), with Mike's answers: one `Puggles Lesson` column replacing `Puggles #` and `Puggles Title`; no detection or move button for the shifted data; re-enter the year in a Lessons by week view; a group can be switched off and drops out of the grid and the report.

**Conflict:** building N2 on today's columns now and then N3's new layout later means doing the grid and the report twice and migrating data twice.

**Options (decision D1)**
- (a) Wait and build N2 with N3. Nothing now.
- (b) **Recommended:** build the N2 slice of the N3 plan now, as it is written there, without the calendar maker: `Calendar.COLS` with `Puggles Lesson` (b1, only that new key), `upgradeCalendar` joining `Puggles #`/`Puggles Title` (b5), `config.lessons` with the per-group `on` only (b2, no series), the Lessons by week sub-view with hand-typed cells and the group switches (c5, without Fill the series and Link), and the corrected report (d2, R7 to R9). Series numbering, cancellations and the maker stay in N3.
- (c) A quick report-only patch: hide the Sparks and T&T columns when empty. Does not fix the shifted data and is thrown away by N3. Not recommended.

**Files and tests (option b):** `calendar.js` (1.2.0 to 1.3.0), `season.js` (upgrade), `reports.js` (`lessons`), `app.js` (Calendar sub-buttons `.calsubs`, not `.subtabs`, N3 plan c5 explains why), `index.html`, `style.css`, `validate.js` (calendar keys, `config.lessons`), `DATA-FORMAT.md` 5.22 and the example, `calendar-example.csv` in the manual (`doc-examples.test.js`). Tests from the N3 plan: f5 (upgrade, current file unchanged), f6 R7 to R9, f7 cases 1 and 8; plus `validate`, `data-format-doc`, `doc-examples`, `replay-report`, `test.js` (it renders `lessons`).

**Risks:** the calendar CSV header changes (import of an old CSV must still work: the N3 plan's C-tests); an older 1.51 copy shows the Puggles column empty (display only, N3 plan b5); a whole-array calendar change in History on upgrade (one File upgrade entry).

**Mike's checks:** turn on Puggles only, type or paste the 32 Puggles lessons, switch Sparks and T&T off, print Lessons by week.

---

### N9. GitHub issue #1, the roadmap: proposed items

Items 2, 3 and 11 are N6, N2 and N3. The other twelve, as proposed backlog items, with a verdict. Facts *(read)*: the only workflow is `.github/workflows/pages.yml`, which publishes the committed `deploy/` with no tests; `make-deploy.sh` already refuses an unbumped change and checks the deploy contents; `release-consistency.test.js` checks that `deploy/` matches the top CHANGELOG entry; `check-docs-for-names.js` needs the real data file, so it can never run in CI.

| Proposed | Roadmap point | Verdict | Size |
|---|---|---|---|
| **N9.1** Test gate before Pages publishes | 1 (CI gates) | **Do now, small version:** a `test` job in `pages.yml` that runs `run-tests.sh --node-only` and `release-consistency`, and `deploy` `needs: test`. Pull-request gates add little: the public repo gets one snapshot commit per release, no PRs. Playwright in CI later if wanted. | S |
| **N9.4** One manual-check list | 4 (real devices) | **Do now:** collect every pending phone and paper check (section 5 below, S8 to S14, N4, N5, N1 paper) into `docs/reference/playtest-checklist.md` with a date column, so they stop living in backlog prose. | S |
| N9.5 Privacy scan in CI | 5 | **Wait / fold into N9.1:** the name check needs real data, so CI can only pattern-scan (phones, emails, non-TEST files in `deploy/`), which `make-deploy.sh` and `anon-phones` already do locally. Add one line to N9.1's job running those tests. | S |
| N9.7 Release traceability | 7 | **Wait:** version, build and CHANGELOG already trace a release; a commit stamp would need a new meta tag. Low value now. | S |
| N9.8 Offline status | 8 | **Partly in N7** (the offline signal from the service worker). A persistent offline chip and protecting unsaved work (R9 was decided not to build) wait. | -- |
| N9.9 Drive recovery and conflicts | 9 | **Wait:** merge3, the revision check and the in-place tests exist; act on a real failure report. | -- |
| N9.10 Test maintainability | 10 | **Do as you go:** every browser test copies the same server and file-open boilerplate. Write `test/lib/app-page.js` (serve, open TEST file, print-to-PDF with the emulateMedia reset) with the first new test in this plan and use it in the new tests only. No migration of old tests. | S |
| N9.6 Architecture drift | 6 | **Wait:** the section lists are already tied by tests (`season-sections`, `validate`, `anon-pc`); splitting `app-season.js` was decided against (R14 part B). | -- |
| N9.12 Projector views | 12 | **Wait, ask Mike:** a new feature; the slide PNGs cover awards today. | L |
| N9.13 Clearer print bundles | 13 | **Fold N14 in** (the confusing "Your binders" entry); the rest waits. | -- |
| N9.14 Test section on Debug | 14 | **Drop or wait:** the deployed app cannot run the suites; a few on-demand checks already exist (Validate, Check files). | -- |
| N9.15 Test feedback in the data file | 15 | **Drop:** bug reports (N17/N18) already hold feedback in the file, with privacy handled. | -- |

---

## 3. Dependencies and conflicts

- **N8 vs N11:** N8's "keep the 25-row minimum" is replaced by N11's 20 rows. One change, one test file.
- **N2 vs N3:** N2 is part of the N3 plan's data model; build it as that plan's slice or with N3 (D1). Do not build N2 on today's columns.
- **N17 + N18:** both change `setBugReply`, the Debug row and `BUG_STATUS`; one release. N18's "a reply no longer closes a report" needs N17's thread.
- **N7 and N9.8:** the service-worker offline header is shared; build it in N7.
- **N14 and N9.13:** same confusion; N14 is the concrete fix.
- **N6 and S13:** the live-update place restore stores `ui.sub`; the fallback must not change what is stored.
- **`reports.js`** is touched by N8/N11, N16, N15, N13: do them in that order on one branch, one version bump at the end of the batch (1.19.0 to 1.20.0), or one bump per item if they are committed separately.
- **`style.css`** is touched by N8/N11, N16, N15, maybe N12: no version line, but `make-deploy` needs `app-version`/`app-build` bumped.

## 4. Versions and deploy

- Mike's rule: stay in 1.51.x, bump the last part for every deployable change; the app has used letter suffixes since 1.51.15a. Next page versions: printables batch (A to E, maybe F and G) **1.51.15i** or **1.51.16** (decision D13); bug conversation (H) the next one; N2 its own.
- Each changed `.js` gets its own version bump (minor for a feature, patch for a fix); `make-deploy.sh` refuses otherwise. `sw.js` is a template: its release is stamped by `make-deploy.sh`.
- Before a release: CHANGELOG entry, How it works text in `index.html` (attendance pages split, Dropped status, Lessons by week if built), `node dev/tools/sync-guide.js` if an (i) note changes, `DATA-FORMAT.md` for H (and N2), README test list (`docs-in-step.test.js` fails on a new test file missing from it), BACKLOG ticks, `check-docs-for-names.js` on the real file, `sh make-deploy.sh`, then the full sweep (ask first), then commit `deploy/` with the code. Push only when Mike says.
- H changes what is in the file: tell leaders to Update now before anyone marks a report Dropped.
- The three untracked plans and this one: do not commit unless Mike says.

## 5. Phone and paper checks still waiting (not open items, collected for N9.4)

S8 (flag Go after reload), S9 (Save bar in landscape; the dark strip), S10 (flag mode Esc), S11 (absences), S13 (live update returns to the place), S14 (uniform flags), UX-03 (phone steppers), the Bug button, N4 (time Progress sheets on the phone, Debug "Last big draw"), N5 (launch update check as an installed PWA), N1 (write on a printed notes sheet).

## 6. Decisions for Mike (with my recommendation)

| # | Question | Recommendation |
|---|---|---|
| D1 | N2: build now as the N2 slice of the N3 plan, or wait for N3? | **Slice now** after the printables (it is mostly print), using the N3 plan's layout so nothing is redone. |
| D2 | N8: Puggles sheet without the "Attendance" word (date alone heads the column)? | **Yes**; centered words on every other class. |
| D3 | N8: let the printed Puggles and Cubbies attendance tables run the full page width (they are narrower today because a screen rule leaks into print)? | **Yes**: wider boxes to tick, same page count. |
| D4 | N11: which header must clear the holes: the browser's date/time line or the sheet title? Add a "Printed MM/DD/YY" line and turn off the browser's Headers and footers? Same top room on other binder pages? | Clear **0.85in** above the title on attendance sheets only; add "Printed"; tell leaders to turn off Headers and footers. Other pages only if asked. |
| D5 | N16: a long theme in the notes sheet: shrink and cut it to fit the block, or print the theme on its own line across the top of each night? | **Shrink and cut** (the full theme is on the calendar); the line across costs a row per night. |
| D6 | N12: label for a review row ("RJ1 review" or "Red Jewel 1 review"), and keep the Review Emblem band beside the review rows only, or drop that band? | **"RJ1 review"** (fits 0.80in); keep the band beside the reviews and the Review Emblem row. |
| D7 | N15: same fixed widths on "Everyone by name" too? | **Yes**. |
| D8 | N13: a heading row per assignment? | **No**, the column already says it. |
| D9 | N14: rename the entry ("Last made in Print class binders: ...") with a Change... button, or remove it from the Report picker? | **Rename + Change...** |
| D10 | N17: who wrote a reply: Leader / Developer choice (no names), or a typed name? | **Leader / Developer**, no names. |
| D11 | N18: the closing word: Dropped, Rejected, or Won't do? | **Dropped**. |
| D12 | N18: old "answered" becomes Open (two of his reports reopen)? And an unknown status: warning instead of error? | **Open**, and **warning**. |
| D13 | Next version name: 1.51.15i or 1.51.16? One release for all printables? | **1.51.16**, one release for A to E (plus F and G if ready). |
| D14 | N9: do N9.1 (test job before Pages publishes) and N9.4 (one manual-check list) now; wait or drop the rest as in the table? | **Yes** as in the table. |

## 7. What could not be verified here

- N16's spill on Mike's real file and printer: reproduced only with longer themes on the TEST file; his print dialog settings are unknown.
- N14's exact text "Your binders: Sparks A" (the code would also show the quick-pick name).
- N11's cut-off sentence: which header line must clear the holes.
- Real class sizes over 17 children (would split under N11): count on the real file, counts only.
- Anything on a phone or on real paper (section 5 and each item's checks).

---
---

# Part 2: N21 to N31 (written 2026-11-18 night)

**Plan only. Nothing built, no app code, test, BACKLOG.md or `deploy/` change.** N3 (calendar) and N9 stay parked. No real child or volunteer name, phone or email is in this part; tests use the invented TEST club and invented data.

**Decided by Mike, 2026-11-18 (also in BACKLOG; treated as settled below):** N27 the "To have ready" tally is on screen only, the printed strips page has no heading and no tally. N28 strips only: the Awards tab list and number keep listing a Blue Jewel, the strips leave it off until the Pilot Wing is earned, a footnote on the strips (printed and on screen) says why and how many are held back on that page. N30 both pages (everyone by name and per class, Sparks and T&T classes only), team printed as the colored cell plus the color word. **The full test sweep is not to be run yet:** every test named below is a targeted run.

Source state *(read, run)*: `deploy/` and `dev/app` hold the same versions (1.51.16, build 2026-11-18). File versions now: `reports.js` 1.22.0, `reports-season.js` 1.35.0, `season.js` 1.71.0, `app-season.js` 1.97.0, `app.js` 1.75.0, `app-todo.js` 1.22.0, `app-person.js` 1.26.0, `catalog.js` 1.16.1, `validate.js` 1.17.0, `check.js` 1.3.3. "Each changed .js gets its own bump above what deploy/ holds" means the numbers in section P2-5.

*(run)* = checked on 2026-11-18 in Chromium (Playwright, TEST club, through `test/lib/app-page.js`). *(read)* = read in the code at the file and line given. Test setup: memory `awana-app-test-setup` (`NODE_PATH=/home/burnclouds/awana-test-tools/node_modules`, `NODE_OPTIONS="--require $PWD/test/lib/pw-dialog-compat.js"`, run from `dev/app`).

## P2-1. Where the BACKLOG text is wrong (read this first)

| Item | BACKLOG says | What the code and a run show |
|---|---|---|
| N22 | The tab number is "awards waiting to be announced"; keep the title-bar sum on the announce number "as now". | The tab number is **announce plus hand out, once each**: `setBadge` writes `App.awardsToGive().length` (`app-todo.js` 97), and `toGive` (`app-season.js` 610-616) is `Season.toHandOut` plus any unannounced award not already in it. The button's title text ("waiting to be announced") is wrong. The title-bar and menu sum (`app.js` 420) and the Tonight strip (`toAnnounce`, `app-season.js` 337) both read that **combined** number out of the badge's text. `App.awardsToAnnounce()` (1299) already exists and is not used by the badge. And the Awards tab **already has two numbers**: the Announce and Hand out sub-tab badges (`renderAwards`, 632-633: `nAnn`, `nHand`). Only the top tab button has one. |
| N23 | Flight 3:16 "is kept out only by the default `exclude`". | True for the Awards tab list, the number, the strips, slides and store/stats (they all skip `config.exclude`). It is **not** kept out of `Season.awardLedger` consumers that do not apply `exclude`: the Person tab's Awards list (`app-person.js` 134-137, shows it with a dash), Awards earned per child (`reports-season.js` 29), the record sheet's ledger (91). *(read)* The "61 Start Zone records" were removed from the live file by hand: the app's own upgrade `upgradeStartZone` (`season.js` 343-353) says awards already recorded under the old names **stay in the file**. So a legacy "Start Zone 1/2" record is still a ledger row (`awardsOf` / `given`), and it reaches the Awards tab and strips as a "by hand" row. Stored block templates in the file (`config.progress`) carry `FLT awards: ['Flight 3:16']` too, so changing `catalog.js` alone does not change an old file. |
| N24 | The unsigned sections are "not no-date sign-offs (nothing was signed)"; Clear "has nothing to clear"; keep "no date" on a section "ticked no date by a leader". | The sections **are** stored as no-date sign-offs. The only code that creates one is `sectionGate` (`app-season.js` 1081-1087, from the award's Given or Given-no-date tick): it writes a hidden day and lists the key in `progressNoDate` (`Season.markSignsNoDate`) so the block counts as finished. Clear (`data-clearnd`, 1152-1157) removes that mark and the hidden day, which makes the section unfinished again, so it is not empty. There is **no per-section "no date" a leader ticks**, so the "keep it" case does not exist today. The printed sheet does **not** print empty boxes: `soCell` (`reports-season.js` 85) prints a check mark for a no-date section. |
| N26 | A child with no progress "opens on Hangglider and marks it as the current book (the 'current' mark and the pace line)". | *(run)* In the default In-order method a Sparks child with no progress and no handbook: `Season.childBook` is `''`, no tab has `cur` or `st-cur`; Hangglider is only the **open** tab (`on`, outlined) because `currentBook` falls back to `codes[0]` (`app-season.js` 773). The pace line is not book-specific. Hangglider is "current" only when (a) a handbook is recorded (`sparksCurrent`, `season.js` 415; most TEST Sparks children have one, with no sign-offs), or (b) the All Together method has a Sparks year book (`yearBook`), or (c) the Blue Jewels row on the sheet uses `childBook(...) \|\| bookOrder[0]` (`app-season.js` 868) so it shows on the first book. Mike has to say which he sees (decision D6). |
| N27 | The paragraph prints "on every page" and the estimate leaves "about 2 inches". | The tally paragraph prints **on page 1 only** (`i === 0 ? note : ''`, `reports-season.js` 210); the heading prints on every page (the `sheet()` title). The caps are `STRIP_FIRST_IN = 6.5`, `STRIP_NEXT_IN = 7.0` (182) against a printable 7.7in (`@page land` 0.4in margin). |
| N28 | Wings "earned and given?" unclear. | `Season.toHandOut` is also used by the Awards tab list (`handOutSection` 596), its Hand out sub-tab badge, the tab badge (through `toGive`), the tally (`tally`) and the strips (`handOut` 189). Mike decided strips only, so none of those change. |
| N30 and N31 | Widths `EMERG_W_ALL = [22, 13, 25, 40]`, `EMERG_W_CLASS = [24, 28, 48]`. | Confirmed (`reports.js` 120). Per-class pages today have **three** columns (Name, Contact, Medical): there is no Class column on them, so N31's Class width applies only to the everyone-by-name page. |
| N21 | The Sparks branch prints two rows of four cells. | Confirmed (`reports-season.js` 118-124). Row 1 is `bj` cells (number, nights, earned date from `sparkJewels`); row 2 is Given boxes from `recState`. Held and dropped gems are not printed (only placed ones, `jewels`). |

## P2-2. Items

### N21. Blue Jewels on the printed record sheet: a question first

**Verified today.** `recordBody` Sparks branch (`reports-season.js` 118-124): two rows, 4 cells each. Row 1 `.bj`: "1 · 6 nights" and the earned day (from `Season.sparkJewels`, so it moves when a night is edited). Row 2 `.so.bg`: a Given box (initials, date; thick `e` when earned and not given; the date when given; a check when given with no date), from `recState` like every other award. Other awards print an earned state in the rail and Given boxes beside the sections. No award other than the Blue Jewels is earned by attendance (the Cubbies and T&T catalogs have none; store points are not on the sheet). The Awards tab and strips treat a Blue Jewel as earned and given (strips will hold it back until the Wings, N28).

**Mock-ups (Sparks sheet, Hangglider, 4 jewels).**

A. Today (two rows, 0.30in each):
```
Blue Jewels | 1 · 6 nights | 2 · 12 nights | 3 · 18 nights | 4 · 24 nights |   <- earned day, printed
   given    | [ini | date ] | [ini | date ] | [ini | date ] | [ini | date ] |   <- thick when earned, not given
```
B. One row of Given boxes; the earned day is printed small inside the box (recommended):
```
Blue Jewels | 1 · 6 nights   | 2 · 12 nights  | 3 · 18 nights  | 4 · 24 nights |
            | earned 10/21   | earned 11/04   |                |               |
            | [ini | date ]  | [ini | date ]  | [ini | date ]  | [ini | date ] |
```
(box thick while earned and not given; the number-of-nights caption and the earned text are printed, never typed; same box row height as other awards.)
C. Given boxes only (no nights, no earned day): smallest, but a leader loses the printed night counts.

**Recommendation: B (simplify, keep the earned day, one box per jewel).** Reasons: the earned day is worked out, not typed, so a separate row of boxes for it invites nothing to write; the Given box is what a leader fills in; one row matches how the rail shows earned state for other awards; it frees about one row of height on a page that is already tight. Do not extend to held or dropped gems (a held gem is not on the child yet; the Blue Jewels row on screen shows them). Keep the sheet's printed data from the same source as the Awards tab and strips (`sparkJewels` placed gems). N28 means the strips may hold a jewel the sheet shows as earned: the sheet should say nothing about wings.

**Build after Mike answers (D1).** Files: `reports-season.js` (the Sparks BJ rows only; `bands` do not use BJ rows), `style.css` (`td.bj`, only if the box needs a smaller font). Tests to update on purpose: `progress-record-sheet-browser` (row count, lowest text above 756pt, the BJ cells), `given-nodate-browser` (the Blue Jewel given-no-date check mark). New case there: jewel earned and given with a date, earned not given (thick box), given with no date (check), not earned (empty). Node: `reports-season.test` (Blue Jewel cell text). **Steps:** red test for B; change the two rows to one; run the two browser tests and `print-b7`, `print-pdf-n1-browser` (page counts) and `cubbies-record.test`/`extra-sheets.test` (other groups unchanged). **Risks:** print layout only: one row less, so the page gets shorter, never taller; the pdf check "lowest text above 756pt" must still hold for a T&T and Cubbies sheet (unchanged). No data format change. **Mike's check:** print one Sparks sheet with an earned, a given and an unearned jewel; fill a Given box with a pen. **Effort: S** (M if he picks something new).

### N22. Awards tab: two numbers on the tab button

**Design.** One function `App.awardCounts()` returns `{ announce, hand, union }` using exactly the sub-tab rules: `announce` = `Season.pendingAwards` minus held (`announceDue`), `hand` = `Season.toHandOut` (the strips' list before N28's strip-only filter, the Hand out sub-tab number), `union` = today's `awardsToGive().length`. `renderAwards` (632-633) and `setBadge` (`app-todo.js` 97) both read it, so the tab button and the sub-tab badges cannot differ. The tab button shows "3 / 5" (announce first), a zero is not shown, and the slash only shows when both numbers show: "3 / 5", or "3" alone (announce class, title "3 to announce"), or "5" alone (hand-out class, title "5 to hand out"), so a lone number is never ambiguous (the two spans have different colors or a small word on a wide window). Concretely: two spans `<span class="badge bAnn" id="awardsBadgeAnn">` and `<span class="badge bHand" id="awardsBadgeHand">` with a visible separator only when both are non-zero, each with its own aria-label ("3 to announce", "5 to hand out"), and the button title "3 awards to announce, 5 to hand out".
**The three readers of the old text must change, or "3 / 5" makes them read 0 or NaN:** `app.js` 420 (title-bar and menu sum) reads `+$('awardsBadge').textContent`; `app-season.js` 337 (`toAnnounce` on the Tonight strip) reads the same text; `date-year-default-browser` 60 and several tests read `#awardsBadge`. Keep `#awardsBadge` as the wrapper element holding `data-announce`, `data-hand`, `data-union`, and make the two readers use `data-union` (To do sum, unchanged value, so the title does not jump) and `App.awardsToAnnounce()` (Tonight strip: it says "to announce", so the announce number is the honest one; this changes it from the union; mention in the CHANGELOG).
**Second number's meaning (D3).** BACKLOG says "announced but not given" and also "the strips' list": these differ (the hand list also holds earned-and-not-yet-announced awards). Recommended: the second number is the Hand out list (`toHandOut`), identical to the Hand out sub-tab and the strips, so a child's award can be in both numbers. The alternative (announced and not given only) needs a third count that matches no list on screen.
**N28 interaction:** the Awards tab keeps jewels (Mike's decision), so `hand` is not reduced by the wings filter; the strips page will show a smaller count than the tab on purpose (footnote explains).
**Files:** `index.html` 38 (the button markup, title), `app-todo.js` 1.22.0 to 1.23.0 (`setBadge`), `app-season.js` (`awardCounts`, `renderAwards`, `toAnnounce` reader, comments at 552 and 1299 corrected), `app.js` (420 reader and the phone menu badge: the menu badge keeps showing one summed number, `To do + union`, with its title; the phone's overflow row names both counts in its title: D3b), `style.css` (the separator, spacing at 390px).
**Tests.** New `awards-two-numbers-browser.test.js`: announce-only, given-only, both, neither (each built by adding or marking awards on a TEST child), the tab numbers equal the two sub-tab badges and `awardCounts()`, a zero is not drawn, 390px width: the tab button and the menu show it without overflow, aria-labels read the words. Update on purpose: `awards-badge-browser` (it asserts `#awardsBadge` text equals `awardsToGive().length`: now `data-union`), `awards-count-browser` (34, 56: the "before - 1" case now reads announce and hand separately), `todo-badge-browser` (42), `date-year-default-browser` (60), `awards-recalc-browser` (36), `todo-tonight-browser` (the Tonight number). **Steps:** red test; `awardCounts`; sub-tab badges use it; tab markup; readers; run the six. **Risks:** the combined number the title and menu use must not change value (test pins it); `toAnnounce` changes meaning on the Tonight strip (announce only); the shared hand-out rule is only read. No data change. **Mike's check:** phone: tab button and menu show "3 / 5" and the words in the long-press/screen-reader title; the page title number is unchanged. **Effort: M.**

### N23. Stop announcing Flight 3:16, Start Zone and Apple Acres

**Design (non-destructive by default; see D2).**
1. One choke point, `Season.notAnAward(name)` in `season.js`: exactly `Flight 3:16`, `Start Zone`, `Start Zone 1`, `Start Zone 2`, `Apple Acres`. `awardLedger` drops those rows at the end (its consumers: `pendingAwards`, `toHandOut`, the strips, slides via `pendingAwards`, `ceremony`, Awards earned per child, the Person tab Awards list, store and stats `earnedAwards`, the record sheet's ledger map). One place, so nothing can come back through a different list, and a legacy record is ignored rather than deleted.
2. `catalog.js` (1.16.1 to 1.17.0): remove `'Flight 3:16'` from the Sparks award list (line 10), set the `FLT` block's `awards: []` (40, the booklet's six sign-off boxes stay), remove the `exclude: { Sparks: ['Flight 3:16'] }` default (90). New files only. Then the stored templates of an older file: one small step in `fromJson` (like `upgradeStartZone`) sets `config.progress.Sparks.common[FLT].awards = []` and removes the name from `config.awardLists.Sparks` and `config.exclude.Sparks`; it touches configuration only, no child record, and is logged in one File upgrade entry. With the choke point the template step is tidy-up, not required (it also fixes the Progress sheet's special case at `app-season.js` 833-834, which tests `names.every(a => a === 'Flight 3:16')`: with `awards: []` the block takes the ordinary no-award path at 838, which shows "completed <date>"; check it reads well).
3. `validate.js` 1.17.0 to 1.18.0 (and `check.js` only if the file check does not already show Validate's warnings: verify at build): a **warning** with a count when any of the three names (or Start Zone 1/2) is still in `awards`, `given`, `givenNoDate`, `announcedNoDate`, `awardLists`, `endOfYear`, `completion` or `config.exclude`. Mike's real file is not read here (D2 asks whether he wants an explicit "remove them" step; the default does not delete).
4. Leave the sign-off boxes: `completedBlocks`, the sheets, `pace.js` and the printed sheet (`NO_AWARD` at `reports-season.js` 149 becomes redundant but harmless; leave it).
5. Cleanup: `app-person.js` 136-137 special case for Flight 3:16 becomes dead; remove it; update the comment at `app-season.js` 552.
**Store points and stats:** they skip `config.exclude`. A file whose `exclude.Sparks` was edited to lack the name would have counted Flight 3:16 as one award per Sparks child; the choke point removes that count. This is the one visible number change: *can not be checked here (real file)*; the test pins the TEST club's store points before and after (equal, since its exclude holds it).
**Tests.** `grep -rn "Flight 3:16" dev/app/test` finds 17 files; read each and change on purpose only those that treat it as an award: `awards-lifecycle` (6), `awards-badge-browser` (6; the case "Flight 3:16 does not raise the count" stays true and passes), `print-b9-items` (6), `season.test` (7), `past-years-given` (5), `reports-season.test` (4), `past-years-browser` (4), `slides.test`, `given-nodate(-browser)`, `pending`, `announce-progress-browser`, `date-year-default-browser`, `handout-rule-browser`, `stats`, `pace` (sign-off boxes only: should not change), `books-complete`. New `not-awards.test.js` (node): name list; a ledger with all three and "Start Zone 2" given/announced/by-hand returns none; `toHandOut`, `pendingAwards`, `slidePending` empty for them; sign-off completion still true; store points unchanged; old template file opens with the one File upgrade entry, a current file gets none; Validate warns with the right count. New `not-awards-browser.test.js`: on the TEST club and on a copy carrying all three legacy records, none appears on the Awards tab (announce, hand out, end-of-year), the strips, the slide image list, Awards earned per child, the Person Awards list; the Progress sheet and printed sheet still show the Flight 3:16, Start Zone and Apple Acres boxes. `progress-record-sheet-browser` (boxes still present).
**Steps:** read the 17 test uses; red tests; choke point; catalog; template step; Validate warning; dead-code removal; run the list. **Risks:** shared hand-out rule: `toHandOut` loses rows (intended); data format: no new field, only a config rewrite, version stays 6, older copies still show the name (display only); merge: the template rewrite is a config change both copies make the same way; Validate: a new warning only; service worker: none. **Mike's check:** open the real file: the Awards tab and strips have none of the three; the Debug/Validate warning shows the leftover count; a Sparks child's Flight 3:16 boxes are still on Progress. **Effort: M.**

### N24. A forced-complete block shows no "no date" or Clear on unsigned sections

**Design.** Display rule in `cell` (`app-season.js` 802-806), computed once per block: a no-date section is **plain** (empty date box, **no "no date" text, no Clear**) when the block is complete (every item dated or no-date) and has at least one section that has a real date or its award is given; otherwise (a no-date section in a block that is not complete, which can only be left over from an award given on the Awards tab, which does not release marks) it keeps "no date" and Clear. Today and a typed date stay available on a plain section (`setProgress` with a date clears the mark, so a leader can still type a real day). The block header keeps its check and "earned (no date)". How to undo a forced block: untick the award's Given (`releaseSigns`, 1089-1092, already clears the marks it made), or type a day. D4: if Mike wants an explicit per-section undo kept, keep Clear but drop the "no date" text.
**Printed sheet (D5).** It prints a check mark in each such box today (`soCell`). Recommended default: keep the check on paper (the sheet then agrees with the block's earned award); alternative: print them empty so the printed block shows only what was signed. This is a paper decision; the screen change does not need it.
**Cubbies and T&T:** same `cell`, so the same rule (blocks have the same sign-off cells); the Sparks review rows use `cell` too.
**Files:** `app-season.js` (cell and a small `blockForced(b)` helper using `Season.noDateSigns`, `Season.completedBlocks`/dates, `season.given`), `style.css` only if the plain box needs spacing. No `season.js` change. **Tests.** New `forced-complete-browser.test.js`: (1) forced-complete block (Given-no-date ticked with 3 of 8 sections signed): the 5 unsigned boxes have no ".status" text and no `button[data-clearnd]`, the 3 signed keep their dates; (2) partly signed block, award not given: unsigned boxes show Today, no no-date text (never marked); (3) fully signed block unchanged; (4) a no-date section in an incomplete block keeps text and Clear; (5) typing a date into a plain section replaces the mark; untick Given restores empty and unfinished; (6) Cubbies and T&T block. Update on purpose: `clear-nodate-browser`, `given-nodate-browser` (they click Clear on forced blocks), `date-overtype-browser` if it touches no-date cells. **Steps:** red; helper; cell; run the three. **Risks:** a leader can no longer see which boxes are forced (the block line says "earned (no date)"; D4); no data or merge change; no print change (default). **Mike's check:** phone, dark theme: open a forced block: five clean boxes; untick Given: they stay empty and the block is unfinished. **Effort: S to M.**

### N25. Uniforms: date boxes cover the sticky headers (bug)

**Reproduced** *(run, TEST club, 1600x700 desktop window, Uniforms tab, page scrolled 400px)*: `document.elementFromPoint` at the centre of the Ordered, Received and Given out header cells returns `BUTTON.todaybtn`; the other five headers return the `th`. The Today button computes `position: static, z-index: auto`, the th `position: sticky, z-index: auto` (`style.css` 41). The cause is therefore not an input's `z-index`; the likely cause is that the date cell content is painted in its own layer (the date input's internal parts) and wins over an auto-z-index sticky cell. **Fix verified** *(run)*: adding `table.roster th { z-index: 2 }` makes all eight header cells hit themselves.
**Design.** `table.roster th { position:sticky; top:0; z-index:2; }` and an opaque `background` (already `var(--head)`). Check every sticky header with controls below: Attendance (`table.roster.att`), Roster, the Calendar grid, Lessons by week, Awards lists, Store, Color teams (`table.tg thead th` already has `z-index:3`; its sticky left columns are 2: leave), and print (no change: `position` is not applied in print; confirm the th rule has no print effect). Phone card layout (`table.uni` at 760px hides `thead`) unchanged. Light and dark themes both.
**Files:** `style.css` only (+ `app-version`/`app-build`; no `.js`). **Tests.** New `sticky-headers-browser.test.js`: for each of Uniforms, Attendance, Roster, Calendar, Lessons by week, Awards hand out and Store: scroll the scroller (`main` on desktop, the window on phone) by 400px, then assert `elementFromPoint` at each header cell's centre is the cell or a child of it; run once with the dark theme; 390px: `table.uni thead` hidden. No names in the test. Existing: `uniforms-cards-browser`, `mobile-audit`, `color-teams-widths-browser`, `a11y-browser` (z-order). **Steps:** red test (fails today on Uniforms); one CSS rule; run. **Risks:** `z-index: 2` on every `table.roster th` could paint above the sticky `#stickyTop` (z-index 45) or the draft bar (5): lower, fine; check the Person tab's `#personBar` (z 6) and the Options index (5): a header at 2 sits below them. **Mike's check:** wide desktop window, light and dark: scroll the Uniforms list, every header readable. **Effort: S.**

### N26. A Sparks child with no progress: no current book

**Design (pending D6).** Do **not** change `Season.childBook`: it feeds jewel names (`jewelName`, `season.js` 460), `awardLabel`, the To do "Needs a handbook" and "date received" rows (`todo.js` 48-53) and `reports-season.js` 259, so changing it would rename Blue Jewels and change the To do number. Change only the Progress sheet: when `Season.childBook` is `''` the sheet still opens the first book (so there is a box to fill), but with no current mark, no "(current book)" dot, the Blue Jewels row hidden on a book that is not current and has no placed gem (`app-season.js` 868-872: `cur` fallback `bookOrder[0]` removed), and a line "No book started yet: enter the date received, or sign a section." Rule for "has a current book" stays `childBook` (a recorded handbook counts: `sparksCurrent` 415, so a child whose handbook field says Hangglider is correctly current even with nothing signed), All Together's year book counts. Printed sheet: `recordSheet` prints the book it is given (the Progress sheets report passes the current one); verify at build what it passes for a child with none (`reports-season.js` 345 region) and make it print the first book with a blank "Received".
**Files:** `app-season.js` (968-972, 868, a "no book yet" line). **Tests.** New `no-current-book-browser.test.js`: (1) Sparks, no progress, no handbook: no `.cur`, no `.curdot`, no `st-cur`, the note shows; (2) a recorded handbook, no sign-offs: that book has the current mark; (3) sign-offs in two books: the latest is current (existing rule); (4) All Together with a year book: current; T&T and Cubbies child with no progress (note shows only for them if they have no handbook and no year book). Update `book-tabs-browser`, `book-todo-browser`, `handbooks-nobook.test`, `book-codes.test` only if they assert the old fallback. **Risks:** if Mike's real case is a recorded handbook (probably, since TEST children with a handbook and no progress are current by rule), then the right answer is "working as designed" and the only code change is the Blue Jewels row fallback and wording: that is why D6 comes first. No data or print change. **Mike's check:** phone: open a Sparks child with nothing signed and no handbook; then one with a handbook recorded. **Effort: S.**

### N27. Hand-out strips: no heading or tally on paper; fill the page

**Design (tally on screen only, decided).**
1. `handOut` (`reports-season.js` 185-212): stop passing the page title and the `note` to `sheet()`; the printed page is strips only. The "To have ready" tally and the end-of-year count move to a screen-only block above the first sheet (`class="noprint"`, drawn from the strips' own list, so it follows N28), plus the cutting and Given instructions. Keep a small "page 1 of 3: Sparks A to Sparks B" line **on screen only**, and print it, small, in the bottom margin only if Mike asks (D7: default screen only). Check what `sheet()` needs from a title (Choose pages and the binder page list name the sheets; keep a hidden `aria-label` or `data-title` so those lists still name "Awards to hand out, page n of N").
2. Fill: replace `STRIP_FIRST_IN = 6.5` / `STRIP_NEXT_IN = 7.0` with one cap `STRIP_PAGE_IN` = printable height minus the footnote line (N28) minus a safety margin. Real height: landscape Letter 8.5in minus 0.8in margins = 7.7in; with the footnote 0.25in and 0.15in safety, about 7.3in (A4 landscape is 8.27in: 7.47in, so 7.1in; pick the smaller, or compute from `ctx.paper`). Estimation stays (`stripIn`, `awardIn`) but is **calibrated**: a test measures every strip's real height in print emulation and requires estimate >= measured, and measures how full each page is. Alternative considered: draw into a hidden print-styled box and measure real heights (accurate, costs a draw pass and font-size drift between screen and print): not recommended unless the calibration test cannot get within about 0.3in.
3. Rows still hold two strips; `break-inside: avoid` stays; the `STRIP_MAX_IN` cap splits a child with many awards as before ("continued"); one-child printing (class picker) and the A4 case get cases.
4. The help text and the (i) say the browser's date line and URL line are the print dialog's Headers and footers option (same note as N11). `info.js` text change.
**Files:** `reports-season.js` 1.35.0 to 1.36.0 (shared with N28, N29, and N21 if it ships in the same release), `style.css` (`.sheet.strips` top padding and the screen-only note), `app.js` (where the report's note and tally are drawn on screen, if `sheet()`'s note is also shown there: verify), `info.js` (own bump). **Tests.** New `strips-fill-browser.test.js` (real PDF, `pdftotext -bbox` as `print-pdf-n1-browser` does): no heading or tally text on any page; lowest strip bottom on each page above the bottom margin (letter and A4); no strip split (every strip's name line and its last award line on the same page); page count drops against the pre-change count on the TEST club (record the old count in the test as a ceiling); estimate >= measured for every strip; one-child print; a child with 25 awards. Update on purpose: `award-strips-browser`, `handout-rule-browser` (tally location: now screen), `print-pdf-n1-browser` (hand-out page counts), `binders-paper-browser`. **Steps:** red PDF test; remove heading/tally; screen note; cap; calibrate with the estimate test; run. **Risks:** an under-estimate splits a strip across pages (the new test catches it on TEST data only: Mike's printer and browser header/footer settings differ: the cap keeps 0.15in slack); the shared hand-out rule is only read; no data change; the Choose pages list changes labels. **Mike's check (paper):** print the strips for two classes on letter, cut them, none split, nothing at the bottom clipped; turn off Headers and footers once. **Effort: M.**

### N28. Strips only: hold a Blue Jewel back until the Pilot Wing is earned

**Design (decided: strips only; `Season.toHandOut` is not changed).**
- New `Season.stripRows(s, id, group, calRows)` in `season.js` returning `{ rows, heldBack }`: `rows` is `toHandOut` minus, for Sparks only, each `"<book> Blue Jewel n"` award whose `"<book> Pilot Wing"` has no ledger row with an earned day, a no-date earn, a hand-recorded or announced state, or a given state (that is "earned": a Wing already given counts; one recorded by hand counts). `heldBack` lists the removed jewels. Book is the prefix of the award name, so a second book's jewels need that book's Wing (several books). Any other award that depends on another: none found in the Sparks catalog (jewels are the only attendance-based, wing-dependent award); the function is written as a table (`DEPENDS = { 'Blue Jewel': 'Pilot Wing' }`) so it is easy to extend.
- `handOut` (`reports-season.js` 189) uses `stripRows` instead of `toHandOut` directly; the **tally follows the strips** (screen tally from `rows`); each page gets a small footnote at the bottom: "N Blue Jewels are not listed for children who have not earned the Wings yet. They are on the Awards tab." (count per page, absent when 0), and the same footnote on screen. The footnote height is part of N27's page cap, counted on every page that has a held-back jewel.
- Held gems (`blueWings`, held at year end) are unaffected: a held gem is not a ledger row until placed.
**Test that pins the deliberate disagreement.** Node `strips-wings.test.js`: for a Sparks child with the 1st jewel earned by attendance and no Pilot Wing: `toHandOut` **contains** the jewel (the Awards tab rule is unchanged: a regression guard), `stripRows(...).rows` does not, `heldBack` has it; Wing earned: both contain it; Wing earned and given: both contain the jewel; Wing recorded by hand: shown; no-date Wing: shown; two books (book 1 with a Wing, book 2's jewel without): only book 2's held back; non-Sparks and non-jewel awards identical in both. Then a **set equation test**: for every child of the TEST club, `toHandOut = stripRows.rows + stripRows.heldBack` (nothing else may differ), so the two rules can only disagree through the one named filter. Browser `handout-rule-browser` (rewritten on purpose): Awards tab Hand out count (`awardCounts().hand`) and its list **include** the jewel; the strips do not; the footnote count per page equals the held-back number on that page and shows on screen; the tab badge unchanged. **Files:** `season.js` (new function and export), `reports-season.js`, `style.css` (`.stripfoot`), `info.js` help. **Steps:** red node tests; `stripRows`; wire `handOut`; footnote and tally; N27 cap includes the footnote; browser test. **Risks:** the Awards tab says 5 to hand out and the strips show 4 strips lines: by decision (the footnote and the Awards tab word it); `earned` vs `given` for the Wing not confirmed by Mike (default: earned; D8); no data or merge change. **Mike's check:** a child with a jewel and no Wing: the Awards tab lists it, the strip does not and the footnote says why; mark the Wing earned: the strip lists both. **Effort: M.**

### N29. Awards to announce: a printed list and a shortcut button

**Design.** (1) Extract the Announce list builder out of `announceSection` (`app-season.js` 583-591) into `Season.announceItems(s, kids, calRows)` (the `pendingAwards` rows with the held flag) plus the existing sort (`sortRows`, group, class, type filters as `ui` holds them), so the screen and the report share one list; the report gets the filters through its options (`group`, `room`, `type`, `sort`), set by the same hand-over `App.awardsFor` uses (`app-season.js` 1302). (2) New report `awardsAnnounce` ("Awards to announce") in `reports-season.js`, listed in the Progress & awards group (`RSUBS`, `app.js` 780, next to `handOut`): one portrait page per group (or per class when a group has more than about 20 rows: long groups split by a row cap so no page overflows), columns: tick box (announced), Name, Class, Award, Earned (date, "no date" or "by hand"), a "held" tag for a held award (shown marked, as on screen: D9), and a count line at the top; "No awards waiting to be announced" when empty; names kept on one line; the night chosen on the Awards tab is printed in the title. Already announced awards are not listed (default: only waiting); end-of-year awards not listed (they have their list). (3) **Print announcement list** button (`id="btnAwPrintAnn"`) beside `btnAwImages` in the Announce controls (`index.html` 181; shown with it at `app-season.js` 634: `['awDateWrap','btnAwImages','btnAwPrintAnn']`), handler: set the Reports pickers from `ui.awGroup`, `ui.awRoom`, `ui.awType`, `ui.awSort`, `ui.awDate` and open Reports with `awardsAnnounce` (the `App.awardsFor` / handOut-print route). Phone: it wraps with the other controls at 390px, the sub-tab does not scroll sideways. (4) Paper: letter and A4, `@page` portrait, no heading overflow, row cap per page.
**Interaction with N22, N23, N28:** the list is `pendingAwards`, so N23's choke point applies; N28 does not (the Announce list keeps jewels: Mike decided strips only); N22's `announce` count must equal the report's total (a test pins it).
**Files:** `season.js` (`announceItems`), `reports-season.js` (report; same bump as N27/N28), `app.js` (`RSUBS`, report list, option plumbing), `app-season.js` (button, handler, use `announceItems`), `index.html`, `style.css` (report table, tick box, phone wrap), `info.js` (help for the button). **Tests.** Node `announce-list.test.js`: `announceItems` equals the previous inline list for TEST children (guards the extraction), held and no-date rows, sort and filters. New `announce-list-browser.test.js`: button present only on the Announce sub-tab; click opens the report with the same group/class/sort; the report rows equal the on-screen table (names, awards, dates) for each group and a chosen class; held shown marked; no-date row text; empty night; count line equals `awardCounts().announce` for All groups; real PDF: one page per group at 20 or fewer rows, nothing cut off, A4 too, a long name on one line; 390px: no horizontal scroll. Update `bundles.test`/`bundles-browser` and any report-id list tests (`grep -rn "handOut" dev/app/test` at build). **Steps:** red node test; extract; report; register; button; PDF test. **Risks:** shared lists and filters (the extraction must not change the screen: node guard); `app.js` RSUBS/bundle lists (a saved bundle without the new report is unaffected); no data change. **Mike's check:** announce night: print the list for one class, tick as you announce; phone: the button wraps. **Effort: M to L.**

### N30 + N31. Everyone-by-name and per-class pages: Color Team column, widths

**Design (decided: both pages, Sparks and T&T classes only, colored cell plus the word).**
- **Everyone by name** (`binderAll`, `reports.js` 168-170): columns Name, Class, **Color Team**, Emergency contact, Medical. Cell `teamCell(teamAsOf(ctx, p))` (`reports.js` 27, 35) plus the color word and `*` for `movesThisQuarter` (36): the cell already prints the word (`team team-<color>` shows its text), confirm it prints on a black-and-white print; empty for Cubbies and Puggles (`M.hasColorTeams`, `model.js` 514). `opts: ['quarter']` like `binderTeams`; the binder bundle's quarter already reaches it; `teamNote(ctx)` under the table.
- **Per-class** (`binderClass`, 140-143): for a Sparks or T&T class add Color Team after Name; Cubbies and Puggles class pages keep three columns. Widths (one final set, tuned by measurement at 12px with the longest real class "T&T Girls (Group A)", 19 characters, and the longest TEST name): everyone by name `EMERG_W_ALL` Name 24, Class 17, Color Team 8, Contact 19, Medical 32 (sum 100; BACKLOG N31 figures); class pages with teams `EMERG_W_CLASS_TEAM` Name 22, Color Team 10, Contact 26, Medical 42; class pages without teams stay `[24, 28, 48]`. Positions are the same on every page of a kind (the N15 rule), so `emergency-widths-browser` pins two sets for classes (D10: with-team and without-team widths differ by design; the alternative is an empty Color Team column on Cubbies pages: wastes 10 percent and is not what Mike asked).
- Keep the fixed layout and the page count; the "NO PHONE ON FILE" warning (about 1.4in) and a name with a phone on the next line must still fit in the 19 percent contact column: measure; if it does not, take from Medical, not Class.
**Files:** `reports.js` 1.22.0 to 1.23.0, `style.css` (the `.emerg` col widths and the team cell on paper). **Tests.** `emergency-widths-browser` rewritten on purpose (column x-positions: two sets; add a case with the longest class name on one line and a long name that does not break mid-word; contact with phone intact); new cases (browser or node): a moved child (`*`), a child with no team (blank cell), a Cubbies child (blank cell), the quarter pill changes the team, color word in the cell text under `emulateMedia({ colorScheme })` with the fill removed (b/w: text present); page counts unchanged on letter and A4 (`print-pdf-n1-browser`, `print-b7`, `binders-paper-browser`, `binders-dialog-browser`); `emergency-phone.test`, `todo-emergency-note*` unchanged. **Steps:** red widths test; widths constants; Color Team column on both pages; quarter option; run the six. **Risks:** print layout (page count; a long contact or medical note wrapping in a narrower column: pinned by a long-text case); the quarter on a binder bundle (bundle passes it); no data change. **Mike's check (paper):** print everyone by name and one Sparks class and one Cubbies class on letter and A4 (binder with a black-and-white printer if possible): class names on one line, names whole, colors and words readable. **Effort: M.**

## P2-3. Conflicts and shared code

- **Awards lists and the shared rule (N22, N23, N27, N28, N29).** `Season.toHandOut` (`season.js` 862) feeds the Hand out list, the sub-tab and tab badges, the tally and the strips; **N23 changes it indirectly** (via the ledger choke point: intended); **N28 must not change it** (strip-only filter `stripRows` on top; the set-equation test pins that nothing else differs); N22 only reads it; N27 only changes layout; N29 reads `pendingAwards` (the announce side). `handout-rule-browser` pins the rule and is rewritten twice (N28, N27): do the N23 edits first, then N28, then N27, in one pass so it is rewritten once. After N28 the strips list is deliberately shorter than the Awards tab's Hand out list; every other pair (tab badge and sub-tab badges, Announce count and the announce report) must still agree.
- **`reports-season.js` (N21, N27, N28, N29)** and **`season.js` (N23, N28, N29)** and **`app-season.js` (N22, N24, N26, N29)** and **`app.js` (N22, N29)**: one version bump per file per release; do the items in the order below so each file is edited in one sitting.
- **Badge text readers (N22):** `app.js` 420 and `app-season.js` 337 parse the badge text: both change in N22; no other place may parse it.
- **N24 and N26 (Progress sheet, `app-season.js`):** different functions (`cell` 802, `currentBook` and tabs 765-972, Blue Jewels row 868), but both change the sheet redraw tests; build together. N24's printed-sheet question and N21 both touch `recordBody` (`soCell`, the BJ rows): decide both before editing the print.
- **N30 and N31 (`reports.js`, the same table widths):** one change, one final set of widths, one rewrite of `emergency-widths-browser`; N31's per-class remark is overruled by Mike's N30 decision (the class page gets the column, so its widths change).
- **N25 (CSS on sticky headers):** touches only `table.roster th`; check with `color-teams-widths-browser` and the Person bar; independent of everything else, ships first.
- **N23 and N21/N24 (printed sheet):** `NO_AWARD` and the rail for Flight 3:16 stay; N23 only removes award rows.
- **Service worker:** no item adds a file or changes `sw.js`; `make-deploy.sh` stamps a new release because `app-version`/`app-build` change. A cached old copy keeps the old behavior until Update now; no data format change in any item, so older copies open the file and show the old badge and lists. (N23 template rewrite is a config change in the file: older copies read it, `FLT awards []` shows as a block with no award: harmless.)
- **Data format / merge / validate:** none of N21 to N31 adds a stored field. N23 adds a Validate warning and one config upgrade; N24 and N26 are display only. `DATA-FORMAT.md` needs no new field (only a note on N23's upgrade and warning); `data-format-doc.test` must still pass.

## P2-4. One recommended build order and release groups

1. **N25** (S, bug, no decision, CSS only).
2. **N31 + N30** (M, `reports.js`; the printables Mike has asked for; decided).
3. **N23** (M; needs D2 yes first: it is ignore-and-warn by default, so it can be built now and a delete step added later if he says so).
4. **N28 + N27** (M + M, one pass in `handOut`; N28 first, decided). N27 depends on N28's footnote height and tally.
5. **N29** (M to L; after N27/N28 so the report registry and the `reports-season.js` bump are done once).
6. **N22** (M; after N23 and N28 so the numbers it shows are final; `app-season.js`/`app.js`).
7. **N24 + N26** (S + S, one pass on the Progress sheet; D4, D5, D6 first).
8. **N21** (S, after D1).

**Release groups:** **A** printables: N25, N31+N30, N23, N28+N27, N29 (one `reports.js`, `reports-season.js`, `season.js` bump each). **B** screen: N22, N24+N26 (`app-season.js`, `app.js`, `app-todo.js`). **C** N21 alone, when answered. If Mike prefers one release: A and B together; do not wait for N21.
**Needs a decision from Mike before building:** N21 (question: D1), N23 (D2: deletes records only if he picks the delete option; default does not), N28 (D8 earned vs given; the rest is decided), N24 (D4, D5), N26 (D6, a screenshot or which state), N22 (D3), N27 (D7). **Can start now:** N25, N30+N31 (D10 is a small width question with a default), N29 (D9 default fine).

## P2-5. Version and release note

- **Recommendation: ship 1.51.16 as built, then Part 2 as 1.51.17** (two releases), not folded in. Reasons: 1.51.16 is built, swept and unpushed, and carries data-file additions (N17 and N18 bug replies and `Dropped`, N20 flag `sub`) that every leader must update for first; folding in N23 and N28 reopens it (they change what the Awards tab and strips show), makes `deploy/` rebuild and needs the full sweep again, which Mike has not allowed yet; Part 2 has no data-format change, so it can follow quickly. If Mike would rather push once, fold **only group A's printables** that are finished and decided (N25, N30+N31) into 1.51.16 and leave the awards items for 1.51.17: this needs the sweep before the commit (ask first). Group C (N21) is 1.51.18 or joins 1.51.17 if answered in time.
- **Bumps (each changed `.js` above what `deploy/` holds today):** `reports.js` 1.22.0 to 1.23.0 (N30/N31), `reports-season.js` 1.35.0 to 1.36.0 (N27, N28, N29; N21 in the same bump if it ships with them, else 1.37.0), `season.js` 1.71.0 to 1.72.0 (N23, N28, N29), `catalog.js` 1.16.1 to 1.17.0 (N23), `validate.js` 1.17.0 to 1.18.0 (N23), `app-season.js` 1.97.0 to 1.98.0 (N22, N24, N26, N29), `app.js` 1.75.0 to 1.76.0 (N22, N29), `app-todo.js` 1.22.0 to 1.23.0 (N22), `app-person.js` 1.26.0 to 1.26.1 (N23 dead-code removal), `info.js` (own bump, N27/N28/N29 help text; read its current number), `check.js` only if the file check needs it (N23). `style.css` has no version line; `index.html` `app-version` to 1.51.17 and `app-build` to the build date; `sw.js` is stamped by `make-deploy.sh`. `make-deploy.sh` refuses unbumped changes.
- Before the release: CHANGELOG 1.51.17 entry (N22 also says the Tonight strip now counts announce only), How it works text in `index.html` (Awards two numbers, announce list, strips footnote), `node dev/tools/sync-guide.js` if an (i) note changes, `DATA-FORMAT.md` note for N23, the README test list for every new test file (`docs-in-step.test.js`), BACKLOG ticks (N21 to N31, moved to the Done log), `check-docs-for-names.js` on the real file (no real name in any new test), `sh make-deploy.sh`, the full sweep (ask first), commit with the code, push only when Mike says. Every leader presses Update now before relying on the new numbers.

## P2-6. Decisions for Mike (first option is my recommended default)

| # | Question | Options (first = recommended) |
|---|---|---|
| D1 | N21: what do the printed Blue Jewels carry? | (a) B: one row of Given boxes with the earned day printed inside; (b) keep two rows as today; (c) Given boxes only, no nights or earned day. |
| D2 | N23: legacy Flight 3:16 / Start Zone / Apple Acres records in an old file (deletes records only if he picks the second option). | (a) ignore them everywhere and warn with a count; delete nothing; (b) also delete them when a file opens, logged in one File upgrade entry (as the hand cleanup did); (c) ignore, and a Debug button "Remove leftovers" he presses himself. |
| D3 | N22: what is the second number, and how is it drawn? | (a) the Hand out list count (same as the sub-tab and strips, may include awards not yet announced), "3 / 5", a zero not shown; (b) only announced and not given; (c) keep one number and rely on the sub-tab badges. D3b: the phone menu badge keeps one summed number with a title naming both (default). |
| D4 | N24: a forced block's unsigned sections: what stays? | (a) no "no date" text and no Clear, Today still works (undo by unticking Given); (b) drop the text, keep Clear; (c) as the BACKLOG says but also disable the boxes. |
| D5 | N24: the printed sheet for those sections. | (a) keep the check mark in each (agrees with the earned award); (b) print empty boxes. |
| D6 | N26: which state shows Hangglider as current? (He should say, ideally with a screenshot.) | (a) a child with a recorded handbook and nothing signed (then it is by rule; only wording and the Blue Jewels row change); (b) a child with no handbook (then only the open-tab outline and the Blue Jewels row show it: remove the Blue Jewels fallback and add "No book started yet"); (c) All Together year book (by design). |
| D7 | N27: where does "page n of N: class to class" go now? | (a) screen only; (b) small line in the printed bottom margin. |
| D8 | N28: Pilot Wing "earned" or "earned and given"? | (a) earned (recorded by hand also counts); (b) earned and given. |
| D9 | N29: held awards on the printed list? | (a) shown marked "held", like the screen; (b) left out. (Already announced and end-of-year awards stay off the list.) |
| D10 | N30: Cubbies and Puggles class pages, and the class-page widths. | (a) no Color Team column on them, their widths unchanged, Sparks and T&T class pages get their own width set; (b) an empty Color Team column on every class page, one width set. |

## P2-7. Phone and paper checks to add to `docs/reference/playtest-checklist.md` section 6

| Check | Where it came from | Done on |
|---|---|---|
| Print one Sparks sheet: the Blue Jewels row matches the decision; the page still fits; fill a Given box with a pen | N21 | |
| Awards tab button shows both numbers ("3 / 5") on a phone and in the menu; page title number unchanged | N22 | |
| Open the real file: no Flight 3:16, Start Zone or Apple Acres on the Awards tab or strips; Validate warns about leftovers; the sign-off boxes are still on Progress | N23 | |
| Phone, dark theme: a forced-complete block shows plain boxes; untick Given and they are unfinished | N24 | |
| Wide desktop window, light and dark: scroll the Uniforms list, every header readable | N25 | |
| Phone: a Sparks child with nothing signed and no handbook, then one with a handbook | N26 | |
| Paper: print hand-out strips for two classes on letter (and A4): no heading, no tally, none split, nothing clipped; turn off Headers and footers | N27 | |
| Paper: a child with a Blue Jewel and no Wings is on the Awards tab but not on the strip; the footnote says so; earn the Wing and it appears | N28 | |
| Announce night: print the announcement list for a class, tick as announced; phone: the button wraps, no sideways scroll | N29 | |
| Paper: everyone by name and one Sparks and one Cubbies class page on letter and A4 (black and white if you can): class names on one line, team color and word readable, page count same | N30, N31 | |

## P2-8. What could not be verified here

- Anything on a phone or on real paper (every check in P2-7), including whether the estimate caps in N27 leave a strip unsplit on Mike's printer, and his print dialog's Headers and footers.
- Mike's real data file (not read): whether it carries legacy Start Zone, Flight 3:16 or Apple Acres records, whether its `config.exclude.Sparks` still holds Flight 3:16 (store points), real class sizes and the longest real name, and which Sparks child state he saw for N26.
- N25's root cause: reproduced and a `z-index: 2` fix confirmed in headless Chromium on Linux only; why a static button beats an auto-z-index sticky cell was not traced (Chrome's date-input internals are the suspect); Mike's browser (Windows 11) may differ, so the test must run his viewport size too.
- N22: where else the old badge text is parsed (searched `awardsBadge` in `dev/app`; the tests listed are the ones found).
- N23: whether Awards earned per child and the Person tab Awards list show Flight 3:16 today was read, not run; whether `check.js` surfaces Validate warnings.
- N27: the real printable height with the print dialog's own margins and scale; the estimate is calibrated only on the TEST club.
- N29: how `ui.awType` and the sort reach `awKids()`/`sortRows` was not read to the end; read at build.
- N30/N31: the 19 percent contact column with the longest real contact and the "NO PHONE ON FILE" warning at 12px: measured only at build.
- The full test sweep: not run (Mike said not yet); no test was run except two read-only probes of the TEST club (N25, N26) from the scratchpad.
