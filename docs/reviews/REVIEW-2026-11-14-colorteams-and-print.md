# Color teams and printed layouts review (2026-11-14, by a Fable agent; read-only)

Scope: (A) the color team code, rules and screens, (B) every printed output, with a design for the printed progress sheets. App release 1.51.09b (build 2026-11-13). No app, test or doc file was edited. No real data file was opened: node runs used invented people built in the script, browser runs used `dev/test-data` only, and every PDF and screenshot went to the session scratchpad. Findings are the reviewer's and were **not re-checked by hand**. CONFIRMED says how (traced = read the code path end to end; node = ran the app's modules; browser = Playwright on TEST data, with a real Chromium PDF where it says PDF). SUSPECTED = code trace only, not reproduced.

## Overall assessment

**Color teams.** The planner itself is sound: the flow solver never repeats a color, locked quarters and pins are never touched, the attendance blend matches Mike's rule (history alone under 3 counted nights, linear to this season alone at 20, `teamplan.js:105-115`), merge and undo see `teamMoves` and `pastTurnout`, and all 11 color-team test files pass (158 assertions). The weak part is the layer around the planner. "A move counts as the child's color everywhere" is true for the grid's played quarters, the audit, the sorted list and the Roster, and **not** true for the printed color team lists, the coaches binder, To do, Assign blanks, and the grid's open quarters. "No team" is honored by the planner and ignored by Assign blanks. The warning for a hand pick exists only in the dated-move box; every other way of setting a color is silent, and the move box warns on every pick once the year is filled, so its warning carries no information.

**Printed layouts.** List reports (binders, volunteers, lessons, hand-out) print cleanly at 10.5 to 15px with repeating headers. Four outputs have real defects: the Puggles attendance sheet has no boxes, the Binders button can print the attendance sheet on portrait paper, the Statistics report is cut off at the right edge, and the No Photos list prints the whole medical-notes field. The **printed progress sheet is the on-screen entry form sent to the printer**: empty date boxes are hidden for print, so the page is rows of section numbers with nothing to write in, no initials anywhere, and the award names float at the right edge with no tie to their sections. It meets none of Mike's three requirements. The Achievement Record is closer (real boxes) but is date-only, has one "Given" box per award, and does not show what earns the Review Emblem or the book award. Section 5 gives one layout to replace both.

A note on the brief: `fitOnePage`, `PRINT_W` and `PRINT_H` no longer exist (only `docs/retired/BACKLOG-full-2026-11-14.md:246` mentions them). One page per child is done by CSS alone (`style.css:131-161`) against a letter page with 0.5in margins, 7.5in by 10in (720 by 960px; `test/progress-onepage-browser.test.js:35`). The design in section 5 is sized to the stricter 7.0in by 8.4in so it fits either.

## 1. Confirmed bugs, color teams

**A1. Printed color team lists show the quarter's roster color, not the color the child plays now. CONFIRMED (node, traced).**
`reports.js:32` (`teamAsOf`) returns the roster color whenever no night is passed. The Color teams report and the coaches-binder list are never given a night (`reports.js:208`, `:211`: no `date` option; `app.js:833` passes `''`). Run: a child with roster Red and a move to Blue on 11/11 printed under **Red** on both lists (with a `*`), while the grid, audit and sorted list said Blue; the coaches list counted 2 on every team where the real sizes were 1 and 3. The attendance sheet is right only when the Night box holds a night of the printed quarter; with a night from another quarter (`reports.js:49-52`) it printed `Red*`. Bundles and the Binders button print "as of the first night" (`reports.js:239`), so a binder reprinted mid-quarter shows the pre-move color. The first-night rule is deliberate in the code comment (`:230`), but it contradicts the decision that a move is the child's color on the attendance sheet.
Also: a one-night fill-in on the sheet's night prints as the quarter's team (run: roster Blue, fill-in Yellow on the first night, binder sheet printed Yellow). `teamOn` (`season.js:681-683`) is the wrong helper for a quarter-long sheet.

**A2. Assign blanks and Re-draw give a color to a child marked "No team", and leave the mark on. CONFIRMED (node).**
`teams.js:110` treats every child without a color as free; `members()` (`:30`) does not check `M.noTeam`. Run: 9 children, one marked No team for Q2; Assign blanks assigned 9, the child got Green with `x_noteam:Q2` still `1`. After that the audit leaves the child out (total 8, sizes 2/2/1/3 reported as uneven) while `teamOn` gives them Green's points. Re-draw (`teams.js:109`) does the same to every No team child. The To do "best choice" dry run (`todo.js:40`) counts them in the sizes too.

**A3. Assign blanks sizes the teams by roster color, ignoring moves. CONFIRMED (node).**
`teams.js:110`, `:127` use `colorOf` (roster). Run: effective sizes Red 1, Blue 2, Green 2, Yellow 3 after one move; a new child over 40 seeds landed on Yellow (the largest) 10 times and Red (the smallest) 10 times. This is the usual way a new child gets a color mid-quarter (`app.js:1000` comment), so it is the case that matters.

**A4. A child given a color through the dated-move box still "needs a color". CONFIRMED (node).**
In a played quarter the grid's only control is the move box (`app-teamgrid.js:63-66`), so a new child's first color there is a move over a blank roster color. `todo.js:38` and the Lock count (`app-teamgrid.js:23`) read the roster: the child stays on To do, and Assign blanks then writes a second, different roster color (run: plays Green by move, Assign blanks wrote Blue).

**A5. A move into a quarter that has not started splits the screens. CONFIRMED (node, traced).**
The Person tab's Move lists every club night of the year (`app-person.js:57-60`), so a move can be dated in a projected quarter. The grid shows open quarters by roster color (`app-teamgrid.js:10`, `:62`, `:78`), `balanceNotes` too (`teamplan.js:317`). Run: grid cell Green and footer 2/2/2/2; audit and sorted list Yellow and 2/2/1/3. The move also has no marker in the grid, so it cannot be seen or removed from there.

**A6. Start new year keeps last year's "No team" marks and team moves. CONFIRMED (node).**
`teams.js:247-261` archives `team:Qn` only. Run: after Start new year the child still had `x_noteam:Q1 = 1` and Fill gave them Q2 to Q4 but never Q1, silently; a move made last year in Q1 still applied (effective Q1 color Blue over a blank roster color), which then counts as a played color for the no-repeat rule. `config.teamsOk` (accepted repeats, per child) is not cleared either (`app.js:1029-1030` clears only `teamPlan`). `Season.newSeason` does drop moves and `teamsOk` (`season.js:505`) but carries the roster whole (`:506`), so the `x_noteam` marks and last year's four colors come along.

**A7. After New season the Color teams tab shows last year's colors as this year's, all locked. CONFIRMED (node for the states, traced for the colors).**
`newSeason` carries the old calendar (`season.js:506`) and the roster's `team:Q1..Q4`. Run: all four quarters read `locked` (their first nights are in the past), so Fill and Recalculate are not offered. Nothing tells the leader to press Start new year and replace the calendar; the New season prompt even lists "colors" among what carries over (`app-season.js:417`).

**A8. Hand picks outside the move box give no warning; the one test for it is vacuous. CONFIRMED (browser, TEST data).**
The grid's open-quarter select (`app-teamgrid.js:127-131`), the Person tab selects and Move (`app-person.js:48`, `:279`), the Roster select and the To do pick never call `TeamPlan.checkChoice`. The only repeat warning is the old audit, which checks one quarter, the one in the Quarter picker (`app.js:923`). Run: picker on Q2, a child's Q3 set to their Q1 color; no visible text named it until the picker was switched to Q3. A pin is never moved by a recalculation, so that repeat stands. `test/teamgrid-browser.test.js:77-81` asserts `/Repeated colors/` on the whole tab's text, which was already true before the pick (the TEST file holds a Q2 repeat), so it passes whatever the app does.

**A9. With the year filled, the move box never suggests a color and warns on every pick. CONFIRMED (node).**
`colorUse` (`teamplan.js:147-151`) counts every other quarter, including projected ones. A child with four different colors therefore has no "unused" color. Run: `suggestMove` returned "Every other color is one this child has had this year"; each of the three picks warned "has already been Green in Q3", a quarter not yet played that Recalculate then repaired by itself. A warning that always fires is not a warning. `test/team-balance-browser.test.js:39` wraps the suggestion check in `if (sug)`, so it passes with no suggestion.

**A10. Stale or wrong text on the tab. CONFIRMED (traced).**
- `app.js:954`: "The counts above are the quarter colors". They are the effective colors (`teams.js:175`).
- `app.js:938`: "Re-draw may fix it" is shown for a played quarter, where Re-draw is refused (`app.js:1000`). Uneven sizes in the current quarter after a child leaves are reported only here; `balanceNotes` skips locked quarters (`teamplan.js:316`).
- `app-teamgrid.js:170`: a date that is not a calendar row gets the Reports quarter from `quarterOf` (`app-season.js:303`), so a mid-week date in a past quarter is refused as "is in Q2, not Q1".
- `teamplan.js:76` comment says a locked quarter's marks are cleared; `lock()` keeps them (`:62-66`).
- `COLOR-TEAMS.md` still describes turnout without earlier years, and has nothing on the balance panel, the move box, "No team" or blend nights.

**A11. A new season from a year label that is not `YYYY-YY` writes a file its own checker rejects. CONFIRMED (node).**
`season.js:504` stores `s.year` as typed; `validate.js:273` requires `^\d{4}-\d{2}$`. Run: year `2026-2027` gave one warning in the old file and an error per child in the new one. The checker is advisory (Tools, To do), so nothing is lost.

## 2. Suspected, color teams (code trace only)

- **The Recalculate offer can differ between browsers.** `teamplan.js:251` shuffles with `sort(() => rng() - 0.5)`. The number of comparator calls depends on the engine's sort, so the seeded stream diverges between Chrome and Safari. Same seed in one engine is stable (node: equal twice). Two leaders on different phones could see different offers for the same file. Fix: use the Fisher-Yates `shuffle` already in `teams.js:26`. Fill (`app-teamgrid.js:185`) and Assign blanks use `Math.random` with no preview, so they are not repeatable by design.
- **To do, the sorted list and the Binders button follow a leftover quarter choice.** `App.quarterOf(today)` falls back to `settings.quarter` on any day that is not a club night (`app-season.js:303`), and a quarter chosen on Reports or Color teams holds for 7 days (`app.js:34-45`). Looking at Q3 on Monday makes To do ask for Q3 colors, and stop asking for Q2, until the next club night. `Calendar.currentQuarter` is the right source (`app-todo.js:20`, `app.js:960`, `:1275`).
- **Changing a night's quarter on the calendar orphans moves.** A move stores its quarter (`season.js:658`) and `teamOn` matches on it (`:685`). Nothing re-checks after a calendar edit; the validator accepts a move dated outside its quarter (node: no finding, `validate.js:205`).
- **Two leaders, one child.** `teamMoves[id]` and `teamPlan.proj[id]` are single values to the merge (`season.js:1111-1112`), so two edits to the same child conflict as a whole (shown, not lost). Team sizes are not re-checked after a merge: two leaders each placing a new child on the smallest team put both on it.
- **`balance()` lopsided note** (`teamplan.js:143`) always advises "moving one child who nearly always comes", even when the high team has none.
- **A color typed in other capitals** counts in the old audit (`teams.js:29`) and not in the planner or grid (`teamplan.js:226`, `app-teamgrid.js:70`). `check.js:50` blocks it on entry, so this needs an old file.

## 3. Confirmed bugs, printed layouts

**B1. The printed progress sheet has nothing to write in. CONFIRMED (browser, PDF, looked at Sparks, T&T, Cubbies).**
`reports.js:142` prints the entry form (`app-season.js:693-796`). `style.css:264` makes every empty date box transparent, border included. Seen: "Red Jewel 1  1  2  3  4" as bare numbers; an award line "Green Emblem  Given  [ ] no date" with no box; the award names again in grey at the far right; "no date", "hold" and "Finished before" tick boxes that mean nothing on paper. 86% of the text on a Sparks class's sheets is under 10.5px, nearly all of it 10px (2,250 of 2,610 text elements), in grey `#667` on `#d5d9de` hairlines. No initials. The Review Emblem is a sentence ("0 of 64 section and review dates entered"); the book award row appears only after the book is finished (`app-season.js:792-793`), so a blank sheet never shows it. Fit is fine: 848 to 869px of 960.

**B2. The Puggles attendance sheet has no boxes. CONFIRMED (PDF).**
`reports.js:38` gives Puggles no marks, so `:73` writes no cells under the dates. Seen: a name column, a row of dates, blank paper.

**B3. The Binders button can print the attendance sheet on portrait paper. CONFIRMED (browser, PDF).**
`app.js:1277` fills the report and never calls `setPageStyle()` or `pagePick()`. The paper stays as the last report shown. Run: Coaches list (portrait) first, then a class binder; all 18 pages were 612 by 792pt and the landscape attendance grid was squeezed to mark columns about 13px wide with the rotated labels touching. The same path skips "Lock Q now?" (`app.js:900-901` look at the report list, which still says the old report) and the page ticks. The ten class names are fixed in the code (`app.js:1259`).

**B4. The Statistics report is cut off on the right. CONFIRMED (PDF).** The "Pattern" column of the marks table ends mid-word at the page edge ("Rarely (or not re"); measured at paper width the table runs to 1,034px on a 720px page (`app-stats.js:117`).

**B5. The No Photos list prints medical notes. CONFIRMED (browser, TEST data).** `reports.js:152` prints the whole Medical Notes field as "Parent note". A TEST row read "Cannot have cinnamon No photos please." This list goes to whoever holds a camera.

**B6. A "no date" day prints as the Earned date. CONFIRMED (node).** `awardLedger` sets `earnedNoDate` (`season.js:817`) and three reports ignore it: Awards to hand out (`reports-season.js:132`), End-of-year awards (`:103`), Awards earned per child (`:32`). Run: a block finished with a no-date sign-off ticked on 11/11 printed "11/11/26" and "Nov 11, 2026". The Achievement Record and Books report handle it.

## 4. Other printed-layout findings (looked at, not bugs)

| Output | Verdict | Notes |
|---|---|---|
| Attendance sheets (Cubbies, Sparks, T&T) | Usable | 12 to 13px, landscape, 25 rows. Mark boxes about 0.26in wide: enough for a tick. Team prints as a word on a tint, so it survives black and white. Names are centered and cut with "…" when long (`style.css:85`): left-align and let them shrink. The subtitle prints an ISO date ("Teams as of 2026-11-11"); every other date is M/D. No heavier rule every fifth row, which helps across 28 columns. |
| Class binder, coaches list | Usable | 10.5px (8pt) is small for the page a leader reads in an emergency; the class page uses a third of the paper, so 12px costs nothing. Medical notes print by design. |
| Color teams, coaches color list | Layout fine | Content wrong after a move (A1). |
| Achievement Record | Partly | Real boxes, 0.54 by 0.33in, date only. One "Given" box per award. Earned-not-given looks the same as not earned. Flight 3:16 gets a "Given" box (`reports-season.js:53`) though the sheet says it has no award. No Given boxes for Blue Jewels, no book award row, nothing printed for a held award. T&T measured 984 to 987px against 960 in print emulation yet the PDF was one page per child; not reconciled, so treat the T&T page as having no spare room. |
| Awards earned per child | Wasteful | One page per child for about three lines (145px). Let several share a page. |
| Awards to hand out, End-of-year | Usable | One empty "Given" box, no date or initials line (see section 5, same cell). |
| Dates attended | Usable | Counts every date with a present mark, events included (`reports-season.js:139`), not `heldNights`. Suspected. |
| Uniforms, volunteers, lessons, handbooks, books, standings, Planning Center changes | Fine | |
| Pace watch | Fine | Prints names under "Steadily slow" and "Needs encouragement": a leader-only page; say so in the subtitle. |
| Slides (PNG, not paper) | Suspected | Text starts at 24px on a 1080-line slide and shrinks to 13px; past about 32 lines a column it runs off the bottom with no warning (`slides.js:125-130`, `:198-199`). |

Privacy of what prints: Person notes are in no report. Flags and flag notes are hidden in print (`style.css:128`). No-date sign-offs print no day on the sheet or the Achievement Record. Exceptions are B5 and B6. No sheet carries a printed-on date; binders show "Planning Center data as of", the rest rely on the browser's own header.

## 5. Printed progress sheet: proposed layout

One renderer, `recordSheet(ctx, person, book)` in `reports-season.js`, replacing both the form print (`reports.js:134-144`) and the Achievement Record body. Plain table markup, no inputs, so nothing depends on hiding form controls. One page per child per book; the Progress Sheets report prints the current book, the Achievement Record every book started.

**Page.** Safe area 7.0in wide by 8.4in tall. All rules black, 0.75pt; text black. No tints carry meaning.

**Header (0.75in).** Line 1: child name (14pt bold), class, club year. Line 2: book name, "Received" with the date or `✓ no date`, and at the right "Printed 11/14/26". Line 3 (7.5pt): the legend, "Each box: initials | date. Shaded box = review. Thick award box = earned, hand it out."

**Columns, left to right (7.0in).**

| Column | Width | Prints |
|---|---|---|
| Summary bands | 0.24in (two of 0.12in) | Vertical text, see "What earns what" |
| Block name | 0.80in | "Red Jewel 1", 9pt bold; on its second row "review" in 7.5pt |
| Sign-off boxes | 4 per row, 0.95in each = 3.80in | See below |
| Bracket | 0.10in | A `]` drawn on the rows that earn the award |
| Award rail | 2.06in | Award name 0.96in, Given date 0.65in, Given initials 0.45in |

**A sign-off box** is 0.95in by the row height, split by a dotted line into initials (0.38in, left) and date (0.57in, right), with the section number in the top-left corner at 6.5pt. Empty: both parts blank for a pen. Dated in the app: the date as `11/4` in 9pt in the date part; initials stay blank (the app keeps none). No-date sign-off: `✓` in the date part, never a day. A row never holds more than four boxes: Rank 1 to 8 and T&T Silver or Gold with 5 or 7 sections wrap to a second row.

**Rows.**

| Group | Row height | Rows | Height with header |
|---|---|---|---|
| Sparks | 0.30in | Flight 3:16 2 (first book only), Rank 2, eight jewels at 2 each (sections row, then shaded reviews row), Blue Jewels 2, Review Emblem 1, Book award 1 = 24 | 7.95in |
| T&T | 0.28in | Start Zone 1 (first book only), eight emblems 1 each, Silver 8, Gold 8, Book award 1 = 26 | 8.03in |
| Cubbies | 0.40in | Apple Acres 1, Trail 1, six units 1 each, Book award 1 = 9 | 4.35in |

**The award cell (requirement 2).** Every award has its own line in the rail: name, then two boxes headed "date" and "init" in 6.5pt. Red Jewel 1 has two lines, Pilot Wing on the block's first row and Red Jewel 1 on its second. States:

| State | Award name box | Given boxes |
|---|---|---|
| Not earned | thin rule, regular weight | empty |
| Earned, not given | 2pt rule, bold, and a reversed tag `EARNED 11/4` (or `EARNED ✓` when a no-date sign-off finished it) | empty, 2pt rule: this is the one to hand out |
| Given | thin rule, bold | date printed; initials blank for the leader |
| Given, no date | thin rule, bold | `✓ no date` across both |
| Held | as earned, tag reads `HOLD` | empty, thin rule |

**What earns what (requirement 3).**
- Block awards: the bracket spans exactly the rows that earn the award. For a jewel that is the sections row only; the shaded review row sits outside it. For Rank, an emblem, Silver, Gold, Trail or a unit it spans all the block's rows.
- Review Emblem (Sparks): the inner left band runs from Red Jewel 1 to Green Jewel 4 with the vertical text "REVIEW EMBLEM: every box in this band". Its row at the foot prints "Review Emblem — 41 of 64" and the same award cell.
- Book award: the outer left band runs over the blocks that count (Sparks: Rank to Green Jewel 4, "BOOK AWARD: every unshaded box"; T&T: the eight emblems, stopping above Silver; Cubbies: Trail to Unit 6). Its row at the foot names the award the child would earn next (1st Book medallion, Alpha, ...), which needs a small helper beside `Season.completionAwards` since that lists only earned ones.
- Blue Jewels (Sparks): four cells in two rows, no rail. Row 1: "1 · 6 nights" with the earned date printed by the app. Row 2: Given date and initials under each.

**Decisions for Mike.**
1. Initials: paper only (proposed), or also a field in the app?
2. Should a held award print `HOLD`, or print as plain earned?
3. Announced dates are left off this sheet. Keep them anywhere on paper?
4. T&T Discovery and Extra Credit emblems are in the award list (`catalog.js:20-21`) and in no template, so no sheet can show what earns them. Add them or leave them off?
5. Cubbies: this layout uses the standard one box per unit; with the per-Bear-Hug setting each unit row holds four boxes and still fits.

**Build notes.** About 120 lines of renderer and 25 of CSS (`table.rec`, sizes in inches). Remove `style.css:137-161` once nothing prints the form. `test/progress-pdf-browser.test.js` and `progress-onepage-browser.test.js` keep their one-page checks; add: every section has a box at least 0.9in by 0.28in, every award has two Given boxes, a no-date sign-off prints no digits, an earned-not-given award has the tag.

## 6. Recommendations, ranked

### Do soon
1. **One helper for "the child's color in a quarter" (A1, A3, A4, A5).** `Teams.endIn` with the history, used by the two printed lists, the attendance sheet, To do, the Lock count, Assign blanks' sizes and the grid's open quarters. Keep `teamOn` for per-night points only. Change `test/teams-report-order.test.js:26` and `teammoves.test.js:23`, which pin today's behavior (the second passes a night the app never sends). Effort medium. Risk if left: a coach's printed list puts a child on last month's team.
2. **Honor "No team" in `Teams.assign` (A2).** Filter in `members()` or at `teams.js:110`; add the test (none of the 28 in `teams.test.js` covers it). Effort small. Risk: a child kept off teams on purpose is put on one.
3. **New printed progress sheet (B1, section 5).** Effort medium. Risk: leaders keep a second paper system because this one cannot be written on.
4. **Binders button (B3).** Call `setPageStyle()` and `pagePick()` after `app.js:1277`, and take the lock prompt from the sheets on screen. Effort small. Risk: an unreadable attendance sheet in every class binder.
5. **Puggles attendance boxes (B2).** One "Attendance" column for Puggles. Effort small.
6. **No Photos list (B5).** Drop the column or print only the photo sentence. Effort small. Risk: a child's medical note on a list handed around.
7. **Warn on every hand pick, and make the warning mean something (A8, A9).** `colorUse` should count played quarters and pins only; call `checkChoice` from the grid select, the Person tab and To do; mark a repeating cell in the grid itself. Fix the two vacuous assertions. Effort medium.
8. **Year rollover (A6, A7).** Have New season do what Start new year does (archive colors, clear `x_noteam:Qn`), and have Start new year clear moves, `teamsOk` and the marks. Fix the prompt wording. Effort small to medium. Risk: next August starts with last year's teams shown as locked.

### Later
9. Earned date on the three award lists honors `earnedNoDate` (B6). Small.
10. Statistics print: let the wide tables wrap or print landscape (B4). Small.
11. Deterministic shuffle (`teamplan.js:251`). Small.
12. `quarterOf(today)` from the calendar, not the Reports choice. Small.
13. Phone grid: at 390px the year grid is 1,386px wide in a 338px box, because the footer's "Red 9 · Yellow 8 · ..." lines do not wrap and set each quarter column to about 290px; one quarter shows at a time. Wrap the footer or move the sizes above the grid. The balance table is 632px wide at the same width (not checked whether it scrolls). A move from the first night is marked only by a tooltip (`app-teamgrid.js:65`), and the sorted list's `*` has no legend (`app.js:965`). Small to medium.
14. Stale text (A10) and `COLOR-TEAMS.md`. Small.
15. Validator: a move's date lies in its quarter; `pastTurnout` year matches what New season writes (A11). Small.
16. Emergency pages at 12px; attendance names left-aligned; a "Printed" date on binder pages. Small.

### Test gaps
- No test for: No team with Assign blanks; a move in an open quarter; Start new year with moves or No team marks; New season then the Color teams tab; a printed list after a move with no night; the blend at exactly 20 nights and above, or with a changed blend setting (`team-history.test.js:64-71` stops at 6 nights); Recalculate after a child leaves; merge of two moves for one child.
- Weak: `teamgrid-browser.test.js:77` (true before the action), `team-balance-browser.test.js:39` (`if (sug)`), `teammoves.test.js:23` (input the app cannot produce).

## 7. Looked at and found fine
- Blend rule and the knob (`teamplan.js:96-115`, `:177-181`); a returning child with under 3 nights uses history, not the average.
- Fill and Recalculate never write a move, a locked quarter or a pin (`teamplan.js:228-232`); `mid-quarter-moves.test.js` covers it.
- The Quarter 4 fallback when all four colors are used (`teams.js:96-101`).
- `teamMoves` and `pastTurnout` are in `SECTIONS` (`season.js:1106`), so undo, History, Discard and merge see them; History words them (`:1249-1257`, `:1288-1296`).
- Lock, Unlock, the print prompt for single reports and bundles, focus handling, 44px targets on the grid's controls (browser tests pass; cell measured 64 by 44px at 390px).
- Roster tab: the effective color shows beside the picker and drives sort and filter (`app.js:484-495`).
- Per-night points, standings and the "Changed team this quarter" table.
- Mixed portrait and landscape in a bundle chosen from the report list; no blank first page; unticked pages leave no blank page.

## 8. Not read or not run
- Not read: `app-options.js` beyond the balancing calls, `stats.js` and `app-stats.js` beyond the team lines, `pace.js`, `store.js`, `info.js`, the manual in `index.html`, `2026-11-03-color-teams-design.md` (only `COLOR-TEAMS.md` and the mid-quarter spec), the plans.
- Not run: the full sweep (one was running), the other print tests (`print-layout`, `progress-pdf`, `progress-onepage`, `attendance-fill-print`, `reports-*`), Drive merge with team data, Safari or Firefox, a real printer, a real phone. Filled-in sheets were not looked at as images (TEST children on page 1 were blank); held and no-date printing on the current sheet is from the code.
- Run: 7 node and 4 browser color-team tests (all pass); six scratch node scripts; three scratch Playwright scripts: all 22 reports printed to 28 PDFs and measured, the Binders button, and the grid at 390px.
