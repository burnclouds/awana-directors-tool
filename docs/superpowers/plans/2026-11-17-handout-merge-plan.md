# Plan: merge "Weekly award slips" into "Awards to hand out" (2026-11-17)

Status: plan only, nothing built. Every claim marked *(run)* was checked on the invented TEST club (`dev/test-data/*TEST*.json`) with Playwright at 1366, 800 and 390 px wide.

## (a) What weekly slips does, and what to do with it

`weeklySlips` (`reports-season.js` 177-192) copies the old Google Sheet's *Weekly Awards* tab (`docs/retired/old-google-sheets/WEEKLY-AWARDS-TABS.md` §5). On that Sheet a leader picked a week and copied the **Results for Slide** cell into the opening slide. The report picks a night (the Night picker; default is the latest club night up to today) and lists a Cubbies, Sparks or T&T child **only if one of their awards has an earned date in the 7 days ending that night**. The child's row then lists every award earned and not given, leaving out ignored and end-of-year awards. It prints one sheet per class headed *Week earned yymmdd*, with no sign-off boxes and no Puggles.

**Removing it loses nothing the club uses.**
- *The slide job* is now **Slide images...** on the Awards tab (`slides.js`, `Season.slidePending`). It draws the slides from the award data itself (earned, not announced, not held). Nothing is typed into a slide any more.
- *The paper job* (what to give each child) is done better by the strips. Weekly slips has a blind spot *(run)*: a child whose only waiting award was recorded by hand, or was earned more than a week ago (for example, they were away), gets **no slip**, but the strips and the Awards tab list them.
- Nothing else links to it: not the To do tab, not the Awards tab, not section 7 of How it works (which never listed it), not the standard bundles.

**Recommendation:** retire `weeklySlips` and add **no** week filter to the strips. The strips exist so nothing waiting gets forgotten, and a week filter would bring back the blind spot. A saved bundle that names `weeklySlips` prints the strips instead (see (c), `reports.js`).

## (b) The rule: "earned and not given"

`Season.toHandOut` (`season.js` 856) is already the one rule behind the strips, the Awards tab *To hand out* list and its Hand out badge. It takes `awardLedger` rows (841-852) and drops any that are:
1. **given** (a date, or the *no date* tick, `givenNoDate`);
2. on the group's **ignored list** (`config.exclude`, "left off the slide": Sparks Flight 3:16; T&T Start Zone 1 and 2);
3. **end-of-year** (`config.endOfYear`; those wait on the End-of-year list).

The ledger contains everything earned from Progress or attendance: suggested/pending (not yet announced), held, *told, no date* (`annNoDate`), and anything announced by hand. The one exception is an award whose dates all fall **before this season's first night** (or before `config.carriedThrough` + 1 day); it is kept only if it was announced or given in that earlier year (the ledger's `filter`, line 851).

**Recommended rule (exactly the current one, written down):** *An award is to hand out when the child has earned it this season (from Progress, attendance, or recorded by hand), or earned it in an earlier year and it was announced, and it is not marked Given (with a date or no date). Ignored awards and end-of-year awards are never on it. Holds and announcing do not matter.*

**Seeded cases** *(run)*: one Sparks child per case, today = 11/18/26, earned dates 10/21/26 unless stated. Weekly slips used night 10/21.

| Case | Strips today | Awards tab *To hand out* today | Weekly slips | Recommended |
|---|---|---|---|---|
| A earned, dated | yes, "earned 10/21/26" | yes, 10/21 | yes | yes |
| B earned, *no date* sign-off | yes, "earned ✓ (no date)" | yes, but **Earned shows 10/21**, the made-up tick-day date (bug) | yes | yes; tab says "no date" |
| C announced only (by hand) | yes, "by hand" | yes, "by hand" | **no** | yes |
| D ignored, earned (Flight 3:16) | no | no | no | no |
| L ignored, announced by hand | no | no | no | no |
| E end-of-year, announced | no (on End-of-year list) | no (End-of-year section) | no | no; strips note gives the count |
| F given with a date | no | no | no | no |
| G given, *no date* tick | no | no | no | no |
| H earned last year, never announced or given | no | no | no | no (owner question 3) |
| I earned last year, announced, not given | yes, "earned 05/06/26" | yes | no | yes |
| J earned and held | yes | yes | yes | yes |
| K earned and announced | yes | yes | yes | yes |
| M earned 10/01 (outside the week) | yes | yes | **no** | yes |
| N earned, *Told, no date* | yes | yes, but **Announced reads "not yet"** (bug) | yes | yes; tab says "told, no date" |

Totals with A to M seeded: Hand out badge 8 = tab rows 8 = strip award lines 8. **The strips already follow the director's rule and agree with the tab in every case.** What is wrong is around the edges:
- **Tab display bugs (B, N):** `handOutSection` (`app-season.js` 595-600) prints `MD(r.earned)` even when `r.earnedNoDate`. That breaks the no-date rule: a tick-day date must never be shown. The same bug is in `ceremonySection` (602-606) and in the Earned column of `announceSection` (583-592). It also prints "not yet" for `annNoDate`.
- **The top Awards badge does not use the rule.** `toGive` (`app-season.js` 610-617, exposed as `App.awardsToGive`, which feeds `#awardsBadge`) copies rules 1-3 by hand instead of calling `Season.toHandOut`. It agrees today, but it will drift the first time the rule changes.
- **Bundles:** `runBundle` (`reports.js` 256-257) passes the hidden Group picker value to a `handOut` item, so a bundle prints only whatever group was last picked.

**Each special case:**
- **End-of-year award:** never on the strips. It is on *End-of-year awards (list)* and the Awards tab's End-of-year section until Given.
- **Ignored award:** confirmed hidden from the strips, the tab list, both badges and the **To have ready** tally (`handOut` counts only `toHandOut` rows). So the tally never asks anyone to stock Flight 3:16 or Start Zone. Those are handed to everyone, and the club already marks them given in bulk (the TEST file has 70 given "by hand"). The award still counts as *earned* (Person > Progress, statistics, store points). Keep it that way.
- **No-date award:** an earned no-date award is listed and reads "✓ (no date)". A *given* no-date award counts as given and is never listed.

## (c) Change list

**`dev/app/reports-season.js`** (1.33.2 → 1.34.0)
- Delete `weeklySlips` (177-192) and its `R.LIST` entry (306). In the line-3 comment, drop `date` from the opts list.
- `handOut` (194-221): add one sentence to the first-page note when the group or class has end-of-year awards waiting (count `awardLedger` rows that are `isEndOfYear && !given`, the same rule as `ceremony`): *"End-of-year awards are not on these strips: N waiting (see End-of-year awards (list))."*

**`dev/app/reports.js`** (1.17.3 → 1.17.4)
- Line 240: add `weeklySlips: 'handOut'` to `REPORT_ALIAS`. Update the comment above it: "1.51.15e: the weekly award slips became the hand-out strips."
- `runBundle` 256-257: for a report whose `opts` include `groupAll`, use `group: it.group || ''`, so a bundled hand-out prints every group, as the old slips did.
- Keep `opts.date` and `sheetQuarter`/`teamAsOf` (31-37). `runBundle` still sets `date` for the "as of the first night" binder pages.

**`dev/app/app.js`** (1.70.1 → 1.71.0)
- 780 `RSUBS.attend`: drop `'weeklySlips'`.
- Remove the Night picker, which only weekly slips used: 802 (`'oDate'` in the hide list), 872 (`$('oDate').hidden`), 881-883 (filling `oDateSel`), 887 (`date:` becomes `''`, so the unused key can go), 933-935 (`ds` and `o.date` in `App.reportOptions`; the comment becomes "class or child"), 941 (`$('oDateSel')`).

**`dev/app/index.html`**
- 234: delete `<label id="oDate">Night <select id="oDateSel"></select></label>`.
- 584: "(<i>Group</i>, <i>Class</i>, <i>Child</i>, only the ones that report uses)".
- 663: "you can set the <i>Group</i>, <i>Class</i>, <i>Child</i>, list order, quarter, and a club title" (also replaces "Room").
- 499, after "...a box for the leader's initials...": add "*The strips hold exactly the awards on this list.*"
- 502 already says "Reports keeps two awards reports" and becomes true. 672 needs no change.

**`dev/app/info.js`** (1.24.0 → 1.24.1)
- 78: "Pick a report, then the group, class or child it needs, and **Print / Save as PDF**." Then run `node dev/tools/sync-guide.js`.

**`dev/app/app-season.js`** (1.95.0 → 1.95.1)
- `handOutSection`, `ceremonySection`: Earned cell becomes `r.hand ? 'by hand' : r.noDate ? 'no date' : MD(r.date)`, carrying `noDate: r.earnedNoDate` into the row. Announced cell becomes `r.ann ? MD(r.ann) : r.annNoDate ? 'told, no date' : 'not yet'`.
- `announceSection`: Earned cell shows "no date" when `r.earnedNoDate` (`pendingAwards` must pass `earnedNoDate` through, `season.js` 831).
- `toGive`: build the hand-out part from `Season.toHandOut`, plus `announceDue` rows not already seen. Same result, one rule.
- 595 comment and 559 comment ("announced weekly awards") become "earned and not given (Season.toHandOut)".
- Button text stays **Print award strips...**. The tooltip becomes "Prints the awards on this list as a strip per child, to cut apart."

**`dev/app/season.js`** (1.68.0 → 1.68.1): `pendingAwards` 831 adds `earnedNoDate: !!r.earnedNoDate` to its rows. The comment at 854 gets the rule text from (b).

**`dev/app/style.css`** (screen only; print untouched). After line 769:
```css
@media screen and (max-width: 1000px) {      /* two 4.5in strips need about 1000px; narrower screens show one strip per row, the screen's width up to 4.5in */
  .sheet.strips .striprow { flex-direction:column; align-items:center; width:auto; gap:8px; margin-bottom:8px; }
  .sheet.strips .strip { width:100%; max-width:4.5in; flex:none; }
}
@media screen { .sheet.strips .stripname { flex-wrap:wrap; } .sheet.strips .stripname span { margin-left:auto; white-space:nowrap; } }
```
Why *(run)*: at 390 px a pair of strips shrinks to 171 px each. The Date and Initials boxes are fixed width (`flex:none`), which leaves about one character for the award name, so names stack one letter per line, and the sheet scrolls sideways. A lone strip fills the row (352 px) and lines up with nothing. At 800 px both strips shrink to 337 px. On a computer (≥1000 px) the preview still shows two across, like the paper. A lone strip on the left matches the cutting layout. Screenshot: `scratchpad/opus-handout-plan/phone-strips.png` (not tracked).

**`docs/DATA-FORMAT.md`**: 313 `exclude` becomes "...off the slides, out of announce lists, and off the hand-out list and strips." 322 `bundles` gets "(a bundle naming `weeklySlips` prints `handOut`)".

## (d) Tests

**New `dev/app/test/handout-rule-browser.test.js`** (Playwright, TEST club, pattern of `award-strips-browser`):
1. *Every seeded case agrees*: seed cases A to N as in (b), each on its own Sparks child that starts with nothing open. For each child, assert that the strip award labels, the `#awSecHand` rows for that `data-id`, and `Season.toHandOut` all list the same award set, matching the Recommended column. Also assert badge = tab rows = strip lines, and that `App.awardsToGive()` holds every `toHandOut` row.
2. B: tab Earned cell is "no date" and the text "10/21" appears in neither the tab row nor the strip. N: Announced cell is "told, no date".
3. E: the strips' first-page note says "End-of-year awards are not on these strips: 1 waiting".
4. D, L: the tally text has no "Flight 3:16".
5. *Phone, 390×844*: every `.strip` is between 300 and 4.5in wide and lines up with the others (same `left`); no `.striprow` holds two strips side by side; `#report .sheet` scrollWidth ≤ clientWidth; a long name (seed a 30-character test name through the roster override) keeps the class on its own line (`.stripname span` top > `b` top) with the name on one line.
6. *Print unchanged*: at 390 width with `emulateMedia('print')`, strips are 432 px and rows hold two. The PDF page count = sheet count.
7. `#oDateSel` does not exist; `Reports.LIST` has no `weeklySlips`; `App.showReport('weeklySlips')` throws no page error.
8. No page errors.

**Update:**
- `weekly-slips.test.js`: delete the four slip tests. Move the "end-of-year list covers every group" test into `reports-season.test.js`, then delete the file.
- `reports-season.test.js` 36-38: add `'weeklySlips'` to the "should be removed" list.
- `bundles.test.js` 21-22: add `{ report: 'weeklySlips' }` to the old bundle; expect `handOut`, merged with a `handOut` item already in the bundle. New test: `runBundle` with a `handOut` item and `ctx.opts.group = 'Sparks'` prints strips for a Cubbies and a T&T child.
- `reports-cleanup-browser.test.js`: 66-68 drop the `weeklySlips` assertion and the "Weekly slips stay with Attendance" wording; 87-89 test becomes "no report has a Night picker"; 99 drop `'oDate'` from `order`.
- `field-reports-browser.test.js` 28, 33: drop `['weeklySlips', 'attend']` and "slips stay with Attendance".
- `ux-small-fixes-browser.test.js` 54-57 (UX-16): drop the Reports half (no report has nights now); keep the Attendance and Awards checks.
- `award-strips-browser.test.js`: no change. Its tab-agreement test still holds.

Run each changed file, then `sh dev/tools/run-tests.sh`, then `node test/check-docs-for-names.test.js`.

## (e) Versions and docs

- Line-1 bumps as listed in (c). `index.html` `app-version`: see owner question 5.
- CHANGELOG entry (plain): **"Weekly award slips are gone; Awards to hand out does their job.** The slips listed only children who earned something that week, so an award recorded by hand, or one a child missed while away, never showed. The strips list every award earned and not given (not ignored, not end-of-year), the same as the Awards tab. A saved bundle with the slips now prints the strips for every group. The Reports Night picker is gone (only the slips used it). On a phone the strips show one per row. The Awards tab shows *no date* and *told, no date* instead of a made-up day." Add the file versions and the new test.
- README: 312 (delete the `weekly-slips` line); add `handout-rule-browser` next to 132; `reports-season` line notes the moved end-of-year test.
- BACKLOG: add the item as done; add the open phone check (director views strips at 390 on his own phone).

## (f) Build order

1. Write `handout-rule-browser` and the bundle tests. Confirm they fail where expected: B/N display, alias, phone, Night picker.
2. `season.js` + `app-season.js` (display fixes, `toGive`). Tests 1-4 pass.
3. `reports.js` alias and `runBundle` groupAll.
4. Remove `weeklySlips` (`reports-season.js`, `RSUBS`) and the Night picker (`app.js`, `index.html` 234); update the four existing browser tests.
5. CSS; check at 390/800/1366 and with print emulation.
6. Text: `index.html`, `info.js`, `sync-guide.js`, DATA-FORMAT.
7. Versions, CHANGELOG, README, BACKLOG; full sweep; names check.

## (g) Risks

- **Removing `opts.date` by mistake** would break binder bundles printed before a quarter starts (`asOfFirst`). Only the picker goes.
- **Tests that count report-bar elements** (RP5 order, UX-16) fail until updated in step 4. They are listed above.
- **The CSS breakpoint is a guess** (1000 px). Between 1000 px and about 1010 px the two strips may shrink slightly. Test 5 checks 390 and 800. If needed, a container query on `.sheet.strips` is the cleaner fix.
- **The stripname wrap is screen-only.** If someone later copies it into print rules, the page-break estimate (`stripIn`) assumes a one-line name.
- **A leader used to the weekly sheet** may look for it; the CHANGELOG line covers it.

## (h) Decisions for the owner

1. **Retire weekly slips with no "earned this week" filter on the strips?** Default: **yes, no filter.** Slide images is the weekly "what's new", and the strips must show everything waiting. If wanted later, an "Earned since" choice can be added without the Night picker.
2. **End-of-year awards on the strips?** Default: **no.** Keep them on their own list, and add the one-line count on the strips so nobody thinks they went missing.
3. **Awards earned in an earlier year and never announced or given (case H)?** Default: **leave them off.** Children have them already, and the *Earlier years* button marks them given with no date. Putting them on would print every returning child's past emblems as soon as old progress sheets are entered.
4. **Ignored awards (Flight 3:16, Start Zone) stay off the strips and out of To have ready, even when earned and not given?** Default: **yes** (the director's rule, and today's behavior).
5. **Which version?** Default: **add to 1.51.15e** (still unreleased) and keep `app-version` 1.51.15e. Otherwise open 1.51.15f.
6. **A saved bundle that names weekly slips:** print the strips (default, `REPORT_ALIAS`), or skip it (`REPORT_GONE`)? Default: **print the strips, every group.**
7. **Remove the Night picker entirely, or keep it hidden for a future report?** Default: **remove it.** It is three lines to bring back.
