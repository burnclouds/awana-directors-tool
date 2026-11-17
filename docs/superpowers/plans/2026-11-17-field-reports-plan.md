# Field reports of 2026-11-17: implementation plan

Ten reports filed with the Bug button against 1.51.14 / 1.51.15b. This plan is written against the 1.51.15c working tree: Choose pages pop-up, the binders quick pick, `RSUBS` regrouped. The owner's decisions on #6, #7 and #9 are folded in. Every number was measured with the invented test club (`dev/test-data/*TEST*.json`) in headless Chromium. All names here are generic.

## 1. Triage

| Id | Type | Pri | Effort | Summary | Files |
|---|---|---|---|---|---|
| T1-T3 | test | none | none | Owner's trial reports of the Bug tool itself ("Isn't this cool?", "sdf", "This is going to be marked fixed now"). No work. The owner may delete them on Debug. | none |
| #4 | done | none | S | "Pages to print" wall of ticks. Fixed in 1.51.15c (Choose pages pop-up). Verify, then mark fixed. | none (covered by `reports-cleanup-browser` RP2) |
| #5 | feature + bug | P2 | S | Move "+ Add sheet" next to the book tabs. Also stop it offering books that already have a tab. | app-season.js, app-person.js, style.css |
| #6 | feature | P1 | S-M | Drop the pin icon. A color set by hand becomes a solid chip, a suggested one stays dashed, and a legend line goes under the grid. | app-teamgrid.js, style.css, info.js, index.html |
| #7 | feature | P1 | S | New fifth report group "Color teams" (Color teams, Coaches' color teams, Game standings). | app.js, index.html |
| #8 | bug (perf) | P1 | S | Progress sheets are slow to show. Most of the time is page layout, not script. Fix with `content-visibility`, a cached catalog and a "Drawing..." line. | style.css, season.js, app.js |
| #9 | feature | P1 | M | Awards to hand out becomes cut-apart strips, one per child, for all classes in one run. Group = All works, which also fixes the Awards tab's "prints Sparks only". | season.js, reports-season.js, app.js, app-season.js, style.css |
| #10 | bug + feature | P1 | M | Uniforms table scrolls sideways at 1280px: let the header and text columns wrap. On a phone, one card per child. Parent sizes "n/a" and "NA" show blank. | app.js, reports.js, style.css |

## 2. Items to build

### #4 Pages to print (done)
`pagePick` / `pagePickPopup` in `app.js` already turn every report of two or more pages into "Pages to print: all N" plus **Choose pages...**. RP2 in `reports-cleanup-browser.test.js` asserts there are no inline ticks. Action: run that test and mark #4 fixed on Debug with the reply "Fixed in 1.51.15c: Choose pages pop-up." While there, the comment above `renderReport` (app.js:827) still says "get a row of boxes". Reword it.

### #5 "+ Add sheet" beside the book tabs
**Today.** `#peAddSheet` is drawn in the Person sub-tab nav (`app-person.js:181`), on the row Progress / Attendance / Awards / Registration. The book tabs are drawn later, inside `#progressWrap`, by `renderProgress` (`app-season.js:964`, `.booktabs`), about 80px lower. **Existing bug:** the menu's list (`spare`) is worked out from `Season.sheetsOf`, but the tabs show every book of the child's own group (`codes0`). So the menu offers books that already have a tab. Measured on the test club:
- a T&T child is offered DoG, GiA and EoG;
- a Sparks child is offered HG and SS;
- a Cubbies child is offered HC.

**Change.**
- In `renderProgress`, add the menu as the last item inside `.booktabs`: `<select id="peAddSheet" aria-label="Add a progress sheet for another book"><option value="">+ Add sheet</option>...`. Work out the books it offers as `['Cubbies','Sparks','T&T'].flatMap(g => Season.bookOrder(season, g)).filter(c => !codes.includes(c))`. That is, take them from the tabs actually shown, which fixes the bug. Keep the option text "Book name (Group)". Hide the menu when it would be empty.
- Move the `change` handler from `#peSub` to `#progressWrap`. Same body: `Season.addExtraSheet`, `App.touch()`, `App.sheets.setBook`, render.
- Remove the `spare` markup and `ui.peExtra` from `app-person.js`. `sheets` exists only to compute `spare`. Check `dead-code.test.js` afterwards.
- CSS: `.booktabs select { align-self:center; }`. On a phone it wraps with the tabs, because `.booktabs` already wraps.

**Edge cases.** Puggles and volunteers draw no `.booktabs` (`progressAllowed`), so they get no menu. After an add, the new tab is selected and that book drops out of the menu.

### #6 Hand-set colors are solid. The pin goes.
**Today.** In an open quarter every colored cell carries `tgproj`, a dashed outline (`app-teamgrid.js:72`; style.css 597 and 663), whether the color was projected or set by hand. The only difference is the `.tgpin` glyph (line 73). `TeamPlan.isPinned` (teamplan.js:77) decides which is which: a value that differs from the stored projection letter counts as hand-set.

**Change (app-teamgrid.js).**
- Class: `pinned ? 'tgset' : 'tgproj'` instead of always `tgproj`. Delete the `.tgpin` span.
- Accessible name and tooltip, so the meaning never rests on style alone:
  - set by hand: `aria-label="Q3 color, <name>, set by hand"`, `title="Set by hand. Fill and Recalculate leave it alone. To let the planner choose again, pick 'to assign' and press Fill."`
  - suggested: `aria-label="Q3 color, <name>, suggested"`, `title="Suggested. Fill and Recalculate can change it."`
- Replace the 📌 sentence in the intro paragraph (line 54) with a legend line, `<p class="status tglegend">`, under the grid before `.tgnote`, with two sample chips:
  > **Solid color** = set by hand; Fill and Recalculate leave it alone. **Dashed outline** = suggested; Fill and Recalculate can change it. **Locked** quarters (dark heading) are final; change one with a dated move.
- Update the header comment at line 3.

**CSS.** Add `table.tg select.tgsel.tgset.team-Red { background-color:#ea9999; border:2px solid #c62828; color:#1b1f24; -webkit-text-fill-color:#1b1f24; }`, and the same for Blue, Green and Yellow using the `.team-*` fills and the dark borders already used by `.tgproj`. It must beat `table.roster select` (style.css:46-48 and the `hover:none` rule that paints every roster select `var(--panel)`). The 663 rule's selector already names `.tgproj`, so it stays put. Reword its comment ("the pin marks that"). Dark text on the pastel fills is fixed, so dark mode is safe. Checked by calculation: Blue #6d9eeb with #1b1f24 is about 6:1, the others higher. The test below must confirm it.

**Docs.** info.js `games.year` ("A color you set by hand is a pin (&#128204;)...") and `games.balance` ("Pins, projection and locks: ... a pin (&#128204;)") become "A color you set by hand is drawn **solid**; a suggested one has a **dashed** outline. Fill and Recalculate never change a solid color, a locked quarter or a dated move." Make the same edit in index.html section 7 (the year grid item, line 596). Then run `node dev/tools/sync-guide.js`. The word "pin" can stay in code and comments, but drop it from user text.

### #7 Fifth report group "Color teams"
**Change (app.js:780).**
```js
const RSUBS = { attend: ['attendance','attendDates','weeklySlips'], teams: ['teams','binderTeams','standings'],
  binders: ['binderClass','binderAll','volunteers','photos'], progress: [...unchanged, incl. 'paceWatch'] };
```
- **Pace watch list stays in Progress & awards.** It measures section pace and has nothing to do with teams.
- **binderTeams belongs to one group only: Color teams.** Its title already says "(coaches binder)". The Coaches binder quick pick and bundles still include it, because they list report ids and don't depend on groups. A report sitting in two groups would break `subOf` (one answer per id) and the "group follows the report" rule. It isn't worth it.
- Nav (index.html:228), in this order: `Attendance | Color teams | Binders | Progress & awards | Other`. Use `data-rsub="teams"`.
- How it works (index.html:584): change "Four groups" to "**Five groups** (*Attendance*, *Color teams*, *Binders*, *Progress & awards*, *Other*)".
- Section 7's report list (index.html 665-672): move Game standings and the two team lists under a "Color teams" item.
- Fix the `subOf` comment ("awards hand-out, slips, ceremony" are no longer in Other).
- The `reports.print` (i) note does not name groups, so it needs no change.

### #8 Progress sheets take a long time to load
**Measured** with `App.showReport('progressSheets')`, all classes. The test club gives 98 sheets, 51,510 nodes and a 1.24 MB HTML string. The real club (about 120 children) should be about 20% more. Timings are click to first paint after the report, at 1366px.

| Case | Script render | innerHTML | Layout + style | First paint |
|---|---|---|---|---|
| All classes, no throttle | 50 ms | 135 ms | 240-270 ms | **550-590 ms** |
| One class (Sparks A, 14 sheets) | 11 ms | 50 ms | small | 113 ms |
| All classes, CPU x4 (a church laptop) | ~200 ms | ~550 ms | **880 + 280 ms** | **2.3-2.4 s** |
| x4 + `content-visibility:auto` | same | same | 20 + 15 ms | **0.83 s** |
| x4 + content-visibility + cached catalog | -120 ms | same | same | **0.70 s** |

CPU profile, inclusive time:
- 37 ms of the 50 ms render is `Catalog.defaultConfig()`, rebuilt on every `Season.bookGroup` call (season.js:25, through `finishedBooks`, `bookOrder` and `completionAwards`).
- `pagePick`'s querySelectorAll: 14 ms.
- The App.info MutationObserver `decorate`: 11 ms.
- The other observers on `main` (nameCells, flagMarks, fitScrolls, cardLabels) are debounced or phone-only and add under 5 ms. **The observers are not the problem.**

Fixes, biggest payoff first:
1. **`@media screen { #report > .onepage, #report > .sheet { content-visibility:auto; contain-intrinsic-size:auto 440px; } }`** in style.css. A sheet measures 440px on screen. This cuts first paint to about a third and helps every long report. It is screen-only, so print and the PDF still lay out every page. Find-in-page and `textContent` keep working.
2. **Cache the default catalog in season.js.** Build a book-to-group map once: `const DEF_GROUP = (() => { const b = Catalog.defaultConfig().books; return k => (b[k]||{}).group || ''; })()`, created lazily on first use. Do not hand out a shared mutable object.
3. **Show a "Drawing N progress sheets..." line** for any report expected to make more than 30 pages. Set `#report` to that status text, wait one `requestAnimationFrame` plus `setTimeout(0)`, then render. A slow machine then shows that something is happening. `App.showReport` stays synchronous for every other report. For this one the tests must wait for `#pageSum`, not a fixed timeout.
4. Do **not** default to one class. The binder flows and "Pages to print" depend on all classes, and after steps 1 and 2 all classes is fast enough. Rendering in chunks is the next lever if the real club is still slow, but it complicates pagePick and the print path, so not now.

### #9 Awards to hand out: one cut-apart strip per child
**What "earned and not given" means.** The Awards tab's To hand out list (`handOutSection`, app-season.js:595), its badge (`nHand`, line 633) and the report (`handOut`, reports-season.js:195) each repeat the same filter over `Season.awardLedger(s, id, group, cal)`:
- `!r.given`. Given with a date, or the "no date" tick, both count as given.
- not on the group's `config.exclude` list;
- not `Season.isEndOfYear` (those wait for the ceremony list).

That includes awards announced but never earned (the tab shows "by hand"). **Move this filter into one helper, `Season.toHandOut(s, id, group, cal)`**, used by all three places. Agreement between the tab and the strips then comes from shared code, not from luck. Children are taken the way the tab takes them (`awKidsAll`): active clubbers in Puggles, Cubbies, Sparks and T&T, grouped by `Model.groupOf(Model.room(p))`. A child is in one class, so one group. Awards earned under an earlier group follow the current group's ledger, exactly as on the tab.

**Recommendation: replace the one-page-per-class layout. Don't add a second one.**
- The owner asked for one layout.
- Strips sorted by class, then name, carry the same information the class page did.
- Keeping the id `handOut` means the Awards tab button, bundles, `App.showReport('handOut')` and the existing tests keep working.
- New title: **"Awards to hand out (a strip per child)"**.

**Paper and layout.**
- Letter **landscape**, 0.4in margins: 10.2in x 7.7in usable.
- **Two columns of 4.5in strips** with a 0.5in gutter, centred (9.5in wide). Portrait holds only one 4.5in column and wastes 3in on every page.
- Strips go in rows of two. A row is as tall as its taller strip, with no gap between rows. So:
  - each row needs one straight horizontal cut across the sheet;
  - the gutter needs two vertical cuts.
- Each strip has a **1px dashed border** as its cut guide.
- Page 1's heading takes 0.35in. The rest of each page is strips.
- Height estimate: name line 0.32in, plus 0.30in for each award, plus 0.10in padding. Most children have 1 to 3 awards (0.7-1.3in), so a page holds **5 to 10 rows: 10 to 20 strips**.
- Pages are built in code, as `awardsByChild` already does with `PAGE_ROWS`: fill rows until 7.35in, then start a new `<section class="sheet landscape strips">`. Doing it in code, rather than with CSS grid fragmentation, means one sheet is exactly one printed page. That makes the PDF page count testable and gives Choose pages one name per page.

**Strip content.**
- Line 1: **Name** in bold, then the class, right-aligned.
- Then one line for each award, in the tab's order (award label A-Z): a 0.18in tick box, the award label (`Season.awardLabel`, for example "Red Jewel 3"), small grey earned text, and a boxed "init" cell 0.45in wide, styled like the progress sheet's `gv gi` box.
- Earned text: `earnedText()` gives "10/8/26", or "✓ (no date)" for a no-date sign-off. "by hand" when the award was only announced.
- Children with nothing to give get no strip.
- Order is class, then name (`Model.byRoomThenName`), across every class in one run, with no page break per class.
- Page 1's sub line keeps the existing tally: "To have ready: 3 × Red Jewel, 2 × ... Mark each award Given on the child's Progress sheet when it is handed over."

**Edge cases.**
- **Long list.** A child with more awards than a page holds (more than about 22) is split into continued strips, "Name (continued)". Each strip has `break-inside:avoid` as a backstop.
- **Puggles** earn nothing, so they make no strips. Leave them in the All set anyway, so the sets match the tab.
- **Nothing to give:** "Nothing earned is waiting to be given (in Sparks A)."
- **Fills a page exactly:** no blank last page, because the `.sheet:last-child` rule already handles it.

**Pickers.**
- `opts: ['groupAll','room']`. The Group picker gets a first option, **All groups** (value `""`), only while a report with `groupAll` is selected. renderReportCore adds or removes it. A different report that finds `""` falls back to Sparks.
- The Class picker lists every class when the group is All.
- Choose pages names each page from its `h2`: "Awards to hand out, page 2 of 5: Sparks B to T&T A". Classes only, no child names.
- `setPageStyle` sees a landscape first sheet and sets `@page landscape`. Inside a portrait bundle the named page rule already handles the mix.

**Print CSS.** `#report .sheet.strips .strip { break-inside:avoid; border:1px dashed #000; width:4.5in; box-sizing:border-box; }`, plus `.striprow { display:flex; gap:0.5in; justify-content:center; }`. Tick boxes and init cells get a 1px solid #000 border. No colour, so it prints on any printer.

**Awards tab button.** `btnAwHandPrint` passes `group: ui.awGroup === 'All' ? '' : ui.awGroup` and `room: ui.awRoom`, and drops the "Sparks is showing" flash. `App.reportOptions` sets the group only when `o.group` is truthy, and `""` is not an option yet when it runs. So call `App.showReport('handOut')` first, then `reportOptions`, and change `if (o.group)` to `if ('group' in o)`. The tab's **Type** filter is not carried to print. Add to the button's title: "Prints every award type for the group and class shown."

### #10 Uniforms: no sideways scroll on a computer, cards on a phone, blank "n/a" sizes
**Cause (measured).** The global `table.roster th, td { white-space:nowrap }` (style.css:41-42), plus class names as long as "T&T Girls (Group A)" and 140px date boxes. At 1280px the table is 1361px wide inside a 1246px box, so the Notes column is cut off and the box scrolls.

**Computer (above 760px).**
- `renderUniforms` (app.js:1136) gives the Name, Class, Item and Parent size `th`/`td` the class `wr`.
- CSS: `table.uni th { white-space:normal; vertical-align:bottom; } table.uni td.wr { white-space:normal; overflow-wrap:break-word; }`.
- Verified by injecting this CSS: at 1280px the table is 1246px and fits; it also fits at 1366px.

**Parent size "n/a".**
- Export `trivialSize` from reports.js (`/^(n\/?a|none|no|na|nka|-+)$/i`, applied to the trimmed value). The tab then uses the same rule as the printed report, so the two can never disagree.
- That rule also blanks "none", "no", "nka" and dashes. They mean the same thing, so I recommend keeping one rule.
- The cell shows blank. The stored value and Planning Center are untouched, and the cell's `title` keeps "Planning Center says: n/a" for anyone who wonders.

**Phone (at most 760px, the app's breakpoint): one card per child. Recommendation: CSS only, not new markup.**

Why CSS only:
- The `change`, `focusout` and `click` handlers on `#uniWrap`, the bulk buttons (which read `#uniWrap tbody tr[data-id]`), `nameCells` (which names each box from the column heading and the row) and the date-typing rules all keep working with no second code path.
- New markup would duplicate every handler and every test.
- Labels come from a `data-label` attribute written into each `td` by `renderUniforms`. Don't rely on the `App.cardLabels` observer: it only acts on `.pcard table.roster`, and static attributes cost nothing.

**Order (DOM order = what you see = Tab order = screen-reader order).**
- Reorder the tab's `UNI_FIELDS` (app.js:1134) to: Size, Size ordered, Size given, Ordered, Received, Given out, Notes. Sizes are then together after Parent size, and the dates follow, on every width.
- Size ordered and Size given appear only for older files, so most clubs see no change on a computer.
- Do not use CSS `order` to rearrange: it would make the reading order differ from what is on screen.
- The printed report's `UNI_HEAD` (reports.js) is left as it is.

**Card CSS** (inside `@media (max-width:760px)`):
```css
#uniWrap.scroll { overflow:visible; }
table.uni, table.uni tbody { display:block; width:100%; }
table.uni thead { display:none; }   /* labels come from data-label; nameCells still reads the header text from the DOM */
table.uni tr { display:grid; grid-template-columns:1fr 1fr; gap:8px 12px; padding:10px 12px; margin:0 0 10px;
  border:1px solid var(--line); border-radius:8px; background:var(--panel); }
table.uni td { display:block; padding:0; border:0; white-space:normal; min-width:0; }
table.uni td[data-label]::before { content:attr(data-label); display:block; font-size:12px; color:var(--mute); line-height:1.3; }
table.uni td.uname { font-weight:700; font-size:17px; }          /* title line: name (left) ... */
table.uni td.uclass { text-align:right; color:var(--mute); }       /* ... class (right); neither has data-label */
table.uni td.uitem, table.uni td.udate, table.uni td.unotes { grid-column:1 / -1; }
table.uni input[type=text], table.uni input[type=date] { width:100%; box-sizing:border-box; }
```

**Card layout:**
- the title line is the name, with the class on the right;
- Item takes a full row;
- the sizes sit two to a row (Parent size, Size, then Size ordered and Size given when present), each with its label above;
- Ordered, Received and Given out take a full row each, as date box plus **Today**. Given out also has the **no date** tick;
- Notes takes a full row.

**Touch targets.** The existing 44px rules (`#uniWrap input/select/.todaybtn`, `#uniWrap label.uov`, style.css:488-491) already apply. Text is 16px, so iOS does not zoom.

**Unchanged.** `#uBulkOrdered`, `#uBulkReceived`, `#uFilter` and the count stay in the bar above, which already wraps. The filter and count keep working because they act on rows.

**Checks.** At 390px and 430px: no sideways page scroll, every label is visible, nothing is clipped.

**Edge cases.**
- No Parent size column (an export without it): that cell is simply missing and the grid closes up.
- A legacy value that is not a date is still shown as a text box with the warning border.
- A very long name or note wraps (`min-width:0`).
- Printing uses the separate printed report, so the cards never print.

## 3. Tests

**New files** (add each to README's test list):
- `field-reports-browser.test.js` covers #5, #7 and #10.
  - #5: `#peAddSheet` is inside `.booktabs`, and no option's value equals a `.booktabs button[data-book]`, checked for a Sparks, a T&T and a Cubbies child. Adding HC to a Sparks child gives a HoneyComb tab and drops HC from the menu.
  - #7: five `#rSubs` buttons with the exact labels. `standings`, `teams` and `binderTeams` open on `teams`; `paceWatch` on `progress`; `attendance`, `attendDates` and `weeklySlips` on `attend`.
  - #10 computer: at 1280px and 1366px, `#uniWrap` has no `.wide` and the table's `scrollWidth <= clientWidth`. A child whose Parent size is stored as "n/a", " NA " or "na" shows a blank cell, and the stored value is unchanged.
- `uniforms-cards-browser.test.js` covers the #10 phone cards, at 390x844 and 430x932:
  - `document.documentElement.scrollWidth <= innerWidth` and `#uniWrap` is not `.wide`;
  - `thead` is hidden and each `tbody tr` computes `display:grid`;
  - every labelled cell's `::before` content equals its `data-label`, and is visible (`getComputedStyle(td,'::before').content`);
  - the name and class title has no label;
  - no box, button or tick is clipped: each one's rect is inside its card;
  - every box, Today button and no-date label is at least 44px tall;
  - typing a Size and leaving the box saves it; **Today** on Ordered saves today's date; the **no date** tick counts as given out; `#uBulkOrdered` marks the rows shown; Undo restores each;
  - Tab order inside one card follows the DOM: Size, then the Ordered date, Today, and so on (a focus walk);
  - each box has an aria-label naming the field and the child;
  - at 1280px it is still a table (`thead` visible).
- `award-strips-browser.test.js` covers #9. Seed awards with `Season.addAward` for children in Cubbies, Sparks and T&T; the test club starts with only 1 waiting. Then:
  - one `.strip` per child with something to give, and none for the others;
  - order is class, then name;
  - with Group = All and Class = All, the set of children and the count of award lines per child equal the Awards tab's To hand out rows (`#awSecHand tr[data-id]`, Group All) and its badge;
  - a no-date award shows "✓ (no date)";
  - a child with 30 awards gives "(continued)" strips;
  - every sheet is `.landscape`;
  - `page.pdf` page count equals the `.sheet` count (the pattern of `reports-cleanup-browser.test.js:94`);
  - Choose pages lists one "page N of M" name per sheet;
  - the Awards tab button with Group All opens `handOut` with `#oGroupSel` = "" and shows no flash.

**Update:**
- `reports-subtabs-browser.test.js` 19-28: four groups become five, and add `teams` to the loops.
- `reports-cleanup-browser.test.js` 66-68: add `standings` → `teams` and `teams` → `teams`.
- `teamgrid-browser.test.js` 69, 72, 75, 222-223: `.tgpin` becomes `select.tgset`, plus an aria-label check for "set by hand". Line 69 keeps `tgproj` for projected cells.
- `touch-targets-browser.test.js` 108-114: a hand-set color is now **solid** (`tgset`, solid border, not dashed), keeps 4.5:1 contrast in light and dark, and its aria-label says "set by hand". Add the same check to `new-ui-contrast-browser.test.js`.
- Uniforms, for #10:
  - `uniform-bulk-browser.test.js`: waits on `table.uni tbody tr`, which still exists. Add a phone-width run of the bulk button.
  - `touch-targets-browser.test.js`: its Uniforms 44px checks now run against cards. Re-check the expected element counts and add a check that no tap areas overlap inside a card.
  - `uniform-order-browser.test.js`: line 64 reads header text (still present). Line 41 reads `cells[1]` and `cells[2]` (Class and Item), which do not move. Add an assertion for the new column order when the old size columns are present.
  - `uniform-given-browser.test.js`, `flag-anything-browser.test.js`, `leftovers-browser.test.js`: grep for `#uniWrap` and cell indexes after the reorder.
- `person-sheets-browser.test.js` 22-45: same id, so the `selectOption` calls keep working. Add the "inside `.booktabs`" check there or in the new file.
- `hand-out-given-browser.test.js`, `awards-*-browser.test.js`, `bundles*.test.js` and `reports-season.test.js`: grep for `Awards to hand out`, `abox` and `handOut` and update any that read the old class-page markup.
- `info.test.js` / `docs-in-step.test.js`: rerun after sync-guide.
- `#8`: add to `reports-cleanup` RP2 a check that progress sheets have computed `content-visibility: auto` on screen and that the PDF page count is unchanged for one class. Tests that `waitForTimeout` after `showReport('progressSheets')` should wait for `#pageSum` instead.

Run `sh dev/tools/run-tests.sh` before calling any batch done.

## 4. Versions and docs

- **Line-1 version bumps:**
  - `app.js` 1.68.0 → 1.69.0 (#7, #8 step 3, #9 pickers, #10 markup, data-label and field order);
  - `reports.js` 1.17.1 → 1.17.2 (export `trivialSize`);
  - `season.js` 1.67.1 → 1.68.0 (toHandOut, catalog cache);
  - `reports-season.js` 1.32.0 → 1.33.0;
  - `app-season.js` 1.94.1 → 1.95.0;
  - `app-person.js` 1.25.0 → 1.25.1;
  - `app-teamgrid.js` 1.13.0 → 1.14.0;
  - `info.js` 1.23.2 → 1.24.0.
- **CHANGELOG** 1.51.15c: one bullet per item, in plain words, with the versions. Mention the add-sheet duplicate fix, and that Awards to hand out with All groups now prints every group.
- **README:** add the two new test lines and change the `reports-subtabs` line ("the five report groups").
- **index.html How it works:**
  - Reports: "Five groups";
  - section 7's report list;
  - the year grid text;
  - Awards "To hand out" (line 499: "Print award list... prints a strip per child to cut apart");
  - the Uniforms text: "on a phone each child is a card"; "n/a" sizes show blank.
- **info.js:** `games.year`, `games.balance` and the Slide images note that names "Print award list..." (line 50). Then run `node dev/tools/sync-guide.js`.
- **BACKLOG:** close the items if any are listed. Add as open "#8 chunked rendering if the real club is still slow".
- Run `check-docs-for-names` before any push.

## 5. Build order

1. **Batch A (quick, independent; one sitting):** #7 groups, #4 verification, and #10 part 1 (desktop wrap plus blank "n/a" sizes). P1, low risk.
1b. **Batch A2:** #10 part 2, the phone cards: field reorder, data-label, card CSS, then `uniforms-cards-browser` and the touch-target updates. Do it right after A, while the Uniforms code is fresh.
2. **Batch B:** #8 steps 1 and 2, then step 3. Re-measure with the script method in this plan (CPU x4, first paint).
3. **Batch C:** #6 grid style, legend, notes and tests.
4. **Batch D:** #9 strips. The largest change; it needs `Season.toHandOut` first, then the report, then the button.
5. **Batch E:** #5 Add sheet.

**Decisions made (owner, 2026-11-17):**
- #6: drop the pin. Hand-set colors are solid, suggested ones dashed, with a legend.
- #7: a fifth group, "Color teams".
- #9: strips 4.5in wide, two columns on landscape Letter. They **replace** the old one-page-per-class layout under the same id, `handOut`.
- #10: build the phone cards now. Show "n/a" and "NA" Parent sizes blank on the tab; the stored value is unchanged.

No open questions remain. One small point to confirm while building: the shared `trivialSize` rule also blanks "none", "no", "nka" and dashes.

## 6. Risks and what is not verified

- **#10:** the desktop wrap fix is verified (CSS injected in the browser). The phone card CSS is a design only and hasn't been run.
  - Cells set to `display:block` lose table semantics for screen readers. That is acceptable because every box keeps its own aria-label (field and child), but check with a screen reader once.
  - Reordering the size columns changes the desktop order, but only for files that still have the old size columns.
- **`content-visibility` and tests:** Playwright `isVisible` / bounding boxes on content in sheets off screen may now read as hidden. Any test that checks visibility deep inside a long report needs `scrollIntoViewIfNeeded` first. Chrome prints skipped content (checked through `page.pdf` in Batch B). Safari 18+ supports it; older Safari ignores it and is simply slower.
- **#8 numbers** come from this machine. The x4 throttle stands in for an old laptop and hasn't been checked on the owner's device. The test club has 98 sheets; the real club will be about 20% slower.
- **#9 grid fragmentation** is avoided by building pages in code, but the height estimate is approximate. A long award label that wraps could overflow a page. Mitigations: cap labels with `overflow-wrap`, keep `break-inside:avoid`, and the PDF page-count test is the tripwire.
- **#6:** strips of colour now carry meaning. The aria-label and title cover screen readers and hover, and the legend covers sight. Colour-blind users still get solid vs dashed.
- **Not run:** the full test sweep, any test against a real data file, and printing on paper (cut lines, strip sizes).
