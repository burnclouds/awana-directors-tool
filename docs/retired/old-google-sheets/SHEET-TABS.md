# "26-27 Attendance Sheets" — what every tab does

> **Historical (2026-10-29).** This describes the *old* Google Sheet workbook as it was exported, so the app's behavior could be checked against it. The app has replaced it; the *In the app* lines say what replaced each tab. Names in the app have changed since: the weekly slide is now **Printable reports…** (a report to print) on the Awards tab, while **Slide images…** makes the TV slides. For how the app works today read the in-app **How it works** tab and `README.md`.

Read from a full xlsx export of the Sheet on 2026-10-29. Nothing in the Sheet was changed. No names or contact details appear in this document; it describes structure and logic only.

31 tabs. Five are hidden: Games Q1, Q2, Q3, Q4 and T&T Attendance. 18 pivot tables are defined (eight on Color Team Counts, ten across the PT tabs). The exported file does not carry pivot results, so pivot tabs look empty in the export; their layouts below come from the pivot definitions.

## How the whole thing fits together

```
Planning Center export (CSV, pasted into a separate source Sheet)
        │  IMPORTRANGE
        ▼
 1 Data from FBK Download ──► builds Unique ID  (RegID_First_Last)
        │
        ├─► 3 Compare ◄── 2 All Clubbers Attendance   (is the master in step with PC?)
        │
        ├─► 6-13 printable lists (QUERY formulas): emergency, medical, no photos,
        │        birthdays, volunteers, vest/shirt
        │
        ▼
 2 All Clubbers Attendance   ← THE database. Identity looked up from tab 1 by Unique ID.
        │                      You type: current handbook, Q1–Q4 color team, then each
        │                      week: attendance, handbook, participation, extra.
        │                      Game points are pulled from tab 5.
        ├─► 20-23 attendance forms (QUERY by class; print one per room)
        ├─► 24-31 "PT" pivot lists (names by color / color by name, for game time)
        ├─► 4 Color Team Counts (pivots)
        └─► companion workbook "26-27 Weekly Awards" (weekly award slides)

 5 Games Points ──► 15-18 Games Q1-Q4 (scoreboards) and the game columns in tab 2
 14 Color Matrix ── the 24 possible color orders used to deal Q1–Q4 teams
```

Weekly rhythm implied by the Sheet: refresh the Planning Center data → check Compare → type last week's paper sheets into All Clubbers Attendance and Games Points → print the next forms and lists.

---

## 1. Data from FBK Download  (input, imported)

- **Purpose:** the only place Planning Center data enters. Everything else reads from here.
- **How it works:** `C1` holds the URL of a separate source Sheet and `C2` its file name (currently `20261022 -- sc-awana-club-2026-27`). Row 9 lists which source column to take (`$A:$A`, `$AA:$AA`, ...). Row 10 runs `IMPORTRANGE` once per column. Only about 19 of Planning Center's 52 columns are brought in: registration ID, first and last name, selection, class, birthdate, grade, medical notes, parent phone, emergency contact, shirt size, T&T shirt, Sparks vest, Cubbies vest, home email, and the allergy answer.
- **Calculated columns:** `A` First Last Name = `First & " " & Last`. `B` Unique ID = `RegID & "_" & First & "_" & Last`. `U` Medical / Misc Information = medical notes and the allergy answer joined with `"; "` (so a family that answered "none" and "N" shows `none; N`).
- **Safety checks (rows 3 and 7):** compare the source file's column order with the expected order, and the desired headers with the imported ones, and show a total number of differences. If Planning Center changes its export layout, this is where it shows.
- **Selection values it relies on:** `Clubber (Cubbies, Sparks & TnT only)`, `Puggles (Ages 2-3 years)`, `Awana Adult Volunteer`. Several other tabs filter on these exact strings.
- **Fragile:** formulas run to row 202. More than about 190 people would overflow. The `TnT` / `T&T` spelling comes straight from Planning Center and has differed between exports.
- **In the app:** replaced by *Import Planning Center CSV* with the same Unique ID format.

## 2. All Clubbers Attendance  (the master table)

- **Purpose:** one row per person; holds identity, current handbook, color teams, and a week-by-week record for the whole year.
- **Header rows:** row 4 calendar year and "current quarter"; row 5 the quarter for each week (Q1 to Q4); row 6 the AWANA week number; row 7 the dates (`46274` = 2026-09-09, then `+7` per week); row 8 column names.
- **Columns A to K (identity):**
  - `A` date added or modified (typed, `yymmdd`).
  - `B` Unique ID, pasted as text. Rows are not auto-created, so a new child has to be added by hand.
  - `C`, `D`, `E`, `F`, `I` first name, last name, selection and class, looked up from tab 1 with `XLOOKUP` on the Unique ID.
  - `G` first 7 letters of the selection (`Clubber` or `Puggles`).
  - `H` group: the first word of the class (`Sparks`, `TnT`, `Cubbies`, `Puggles`).
  - `J` current handbook, typed as a code plus date (examples: `AoG 260916`, `HG`, `WR 260916`).
  - `K` full name.
- **Columns L to O:** typed (not formulas): **Q1, Q2, Q3, Q4 Color Team** for Sparks and T&T kids.
- **Weekly blocks (35 weeks, from column P, six columns each):**

  | Column | Value | Entered by |
  |---|---|---|
  | Attendance | 1 | hand |
  | Handbook | 1 (a handbook section was done) | hand |
  | Participation | 1 | hand |
  | Extra | 1 | hand |
  | Game, Place, Points | 0 to 3 | formula from tab 5 |
  | Game, Spirit, Points | 0 to 3 | formula from tab 5 |

  The two game columns give each child the points their *team* earned that night (look up group + team color + date + type). They stay blank when the child wasn't marked present.
- **Weeks:** Q1 = 9/9 to 10/21 (7 weeks), Q2 = 10/28 to 12/16 (7), Q3 = 1/6 to 2/24 (8), Q4 = 3/3 to 5/26 (13). Skipped nights (Thanksgiving, Christmas) are handled by editing the date chain.
- **Totals:** after the weeks, a block per quarter (`HR` to `IS`) sums each measure for the quarter with `SUMIFS` over the week blocks; `IT` to `IZ` give the whole-year total. `JA` "Last Date Attended" is calculated for Sparks only.
- **Extras:** 36 conditional-format rules, one validation rule, an autofilter on `A8:O202`. Pivot tables elsewhere read `F8:O202` from here.
- **Status:** Q1 weeks 1 to 7 are entered; Q2 onward is blank. Data rows 9 to 112 are used; formulas run to 202.
- **In the app:** built. Identity, colors and Unique ID come from the roster; attendance, handbook, participation, extras, game points and totals are on the Attendance, Games, Awards and Progress tabs, and the **Person** tab shows one child's whole record in one place. Q1 history was migrated.
  - **Handbook:** the Sheet's one cell (`HG 260916`) is three boxes in the app (book code, date received, note), still stored as the same single string.
  - **Color teams:** typed per quarter, as in the Sheet. New: a mid-quarter *team move* (from a chosen night to the end of the quarter) and a one-night *Played with* exception, so a child keeps the game points earned on each team. The Sheet applied one color to the whole quarter. The app also keeps a year plan the Sheet never had: later quarters are projected (never repeating a color), recalculated with as few changes as possible after hand edits, and locked before the pages are printed (`COLOR-TEAMS.md`).

## 3. Compare FBK Download with All C  (reconciliation)

- **Purpose:** tells you when the Planning Center data and the master table have drifted apart: new kids, class moves, name changes.
- **How it works:** the left block (`A` to `E`) is a `QUERY` of tab 1 for all clubbers and Puggles, sorted by selection, class, name. The middle block (`G` to `K`) pulls the same fields from tab 2 for the same row position. The right block (`M` to `Q`) shows `! planning-center-value | master-value` in any cell that differs. `R` "Total # of Differences" counts the `!` marks.
- **Saved filter:** column `R` is filtered to the value `0`, so as saved it shows rows with no differences. Clear or invert it to see mismatches.
- **Fragile:** it compares by row position and sort order, not by key, so one new child shifts everything below and floods the sheet with differences.
- **In the app:** replaced by the **Import review** (new, missing, possible renames, field changes), which matches on a normalized registration ID + name rather than position. After the import the **To do** tab lists the file check and everything the new people still need (class, color, handbook, uniform, missing details).

## 4. Color Team Counts  (pivots)

- **Purpose:** check that teams are balanced by class.
- **How it works:** eight pivot tables, two per quarter (left at `A`, right at `J`). Rows are Class, columns are that quarter's Color Team, value is a count, with a Group filter (presumably one for Sparks, one for T&T). Source: tab 2 `F8:O202`.
- **In the app:** the Color teams tab shows counts per group and color, plus unassigned, repeats and spread; under it the **year grid** (Q1 to Q4 for every child, locked / ready to lock / projected) shows team sizes and expected turnout for the whole group. See `COLOR-TEAMS.md`.

## 5. Games Points  (input for game results)

- **Purpose:** the scoreboard data entry. One row per group, team, date and type.
- **Layout:** columns `A` group (`Sparks` or `TnT`), `B` team color, `C` date, `D` quarter (looked up from tab 2 by date), `E` type (`Place` or `Spirit`), `F` the value you type (place 1 to 4, or spirit 1 to 3), `G` points.
- **Points rule (lookup table in `A1:C6`):** place 1 = Gold = 3 points, 2 = Silver = 2, 3 = Bronze = 1, 4 = Paper = 0. For spirit the typed number is the points.
- **Pre-seeded:** 560 rows = 2 groups x 4 teams x 35 weeks x 2 types. You fill in `F`.
- **Used by:** tab 2 game columns and tabs 15 to 18.
- **In the app:** built as the **Games** tab (place 1 to 4 and spirit 0 to 3 per team, per night, per group). The place-to-points table lives in the data file (`config.placePoints`, default 3/2/1/0). A child's points follow the team they were on that night.

## 6. Emergency Contact by Class  and  7. In Case of Emergency

- **Purpose:** printable emergency contact lists. Same data, two sort orders.
- **How it works:** `QUERY` on tab 1: first-last name, first, last, selection, class, emergency contact, for clubbers and Puggles. Tab 6 sorts by class then name; tab 7 sorts by name only. Autofilter on both.
- **In the app:** built (*Emergency contacts by class* and *by name*).

## 8. Medical Notes  and  9. No Photos Please

- **Purpose:** the medical list for the first-aid binder, and the photo-restriction list for whoever takes pictures.
- **How it works:** both run the same `QUERY` on tab 1 (first, last, class, Medical / Misc Information), sorted by last name (tab 8) or first name (tab 9). The *only* difference is a saved filter on the medical column in which someone ticked the exact text values to show: a long list for Medical Notes, 4 to 7 values for No Photos.
- **Fragile:** the filter lists exact strings. A new child, or a parent who rewords a note, is invisible until someone re-ticks the filter. Trivial answers like `none; N` have to be excluded by hand every time.
- **Includes volunteers?** The query selects clubbers and Puggles only.
- **In the app:** built, with rules instead of hand-ticked lists: trivial answers dropped, photo-only notes separated, and a per-person *No photos* checkbox that you can edit.

## 10. Cubbies Birthday  and  11. T&T Boys Birthday

- **Purpose:** a birthdate list for the Cubbies class and for the two T&T Boys groups (selection, class, name, birthdate; sorted by name).
- **Status:** you said the birthday field isn't used, so these are leftovers. The app does not produce a birthday report.

## 12. Volunteers

- **Purpose:** volunteer contact list.
- **How it works:** `QUERY` on tab 1 where Selection = `Awana Adult Volunteer`: first, last, selection, class, parent phone, home email; sorted by last name.
- **In the app:** built.

## 13. Vest T-Shirt  (uniform orders)

- **Purpose:** who ordered a vest or shirt, for the order.
- **How it works:** `QUERY` on tab 1 for clubbers: name, Unique ID, registration ID, first, last, selection, requested shirt size, then the three Planning Center item flags (T&T shirt, Sparks vest, Cubbies vest). `K` "Uniform paid?" is `H + I + J`, i.e. the count of items ordered. Columns beyond that are for typed notes. Autofilter `A1:L200` and one conditional-format rule.
- **In the app:** built as the **Uniforms** tab with tracking columns for size verified, ordered, size ordered, received, given out and notes.

## 14. Color Matrix  (how teams are dealt)

- **Purpose:** the list of every possible color order across the four quarters: all 24 ways to order Red, Blue, Green, Yellow as Q1, Q2, Q3, Q4. Column `E` is `=RAND()` so a sort shuffles the rows. Four conditional-format rules paint the cells in team colors.
- **How it is used (inferred):** each child is given one row, so their four quarters are four different colors and no color repeats. The assignments in tab 2 (`L` to `O`) are typed values, so the dealing step itself isn't visible in the file. The data fits: 79 of 82 kids have four different colors and all 24 rows are in use. The 3 exceptions are T&T kids with a repeat.
- **In the app:** replaced by the assignment engine, which also evens out team sizes, splits up old teammates and handles kids who join late.

## 15 to 18. Games Q1, Q2, Q3, Q4  (hidden scoreboards)

- **Purpose:** the quarter standings for the color teams.
- **Layout:** `A1` is `TODAY()`. Rows 6 to 9 are the four Sparks teams, rows 10 to 13 the four T&T teams. Each week has a **Place** column and a **Spirit** column, with the date above them (`+7` per week). Notes in the header: *Place is classic first through fourth; Spirit is a 1 to 3 scale, 1 below expectations for cheering on teammates, 2 meets, 3 above and beyond.*
- **How cells fill:** `SUMIFS` on tab 5 by group, team, date and type, shown blank when the date is still in the future (`TODAY() < date`) or no result is recorded.
- **Season columns:**
  - Cumulative Spirit Points = sum of the weekly spirit values.
  - Cumulative Place = average of the weekly places, rounded to 2 decimals (lower is better).
  - Rank = rank of that average among the four teams in the group (1 = best).
- **Length:** Q1 has 7 weeks, Q2 7, Q3 8. Q4 has 11 date columns while the attendance table has 13 Q4 weeks, so the last two weeks have no scoreboard column.
- **Lookup table** for Gold, Silver, Bronze, Paper is repeated at the bottom of each tab.
- **In the app:** built as the standings table on the Games tab and the *Game standings* report (rank by average place, all quarters, no 11-column limit).

## 19. Example

- **Purpose:** a leftover template from last season's attendance form (dated 2025-09-03, queries a column range that no longer lines up), currently showing `#N/A`. Not used.

## 20. Puggles Attendance Form  ·  21. Cubbies Attendance Form  ·  22. Sparks & T&T Attendance Form  ·  23. T&T Attendance (hidden)

- **Purpose:** the paper sign-in sheets. Each tab is a template: you print it, instructors mark it, and you key it back into tab 2.
- **How they work:** a class name in `A1` (or `A2` for Cubbies) drives a `QUERY` on tab 2 that returns the names (and the team color, for Sparks and T&T) sorted by name. Dates are a `+7` chain from the first night.

  | Tab | Key cell | Query filter | Per-night columns |
  |---|---|---|---|
  | Puggles | `A1` = group | group = Puggles | name + one mark column |
  | Cubbies | `A2` = group | clubbers in group | Attendance, Extra |
  | Sparks & T&T | `A1` = class (e.g. a T&T Boys group) | clubbers in that class | Attendance, Handbook, Participation, Extra, plus a team color column |
  | T&T Attendance | `A1` = `TnT` | whole T&T group | same four columns, whole group on one sheet |

- **To get one form per room:** change the class in the key cell and print or export each time. The Q2 PDFs in your folder are exactly these.
- **Quarter is hard-coded:** the Sparks and T&T queries pull column `M` (the Q2 color team) and the header cell is typed "Q2 Color Team". Changing quarters means editing both by hand.
- **Fragile:** the Puggles query range stops at row 34, so children added below that row never show. Dates start at 9/9 and are plain `+7`, so skipped nights must be edited.
- **Extras:** conditional formatting paints the team color; one validation rule (the class picker).
- **In the app:** per-room attendance forms are built (landscape, one page per room, dates from the calendar, quarter-aware team column). The whole-T&T single list isn't produced because the rooms already cover it.

## 24 to 31. PT Games lists  (pivot tables for game time)

- **Purpose:** the lists used at game time: kids grouped by color, or by name with their color beside it, one per group. All are pivots on tab 2's `F8:O202`.

  | Tab | Rows (in order) | Notes |
  |---|---|---|
  | PT Games, Puggles, Color, Name | Group, Q1 Color, Full name | legacy; Puggles have no teams |
  | PT Games, Cubbies, Color, Name | Group, Q1 Color, Full name | legacy; Cubbies have no teams |
  | PT Games, Cubbies, Name, Color | Group, Full name, Q1 Color | legacy |
  | PT Games, Sparks, Color, Name | Group, Q2 Color, Full name | filter on Q1 Color; a second copy sits at `F3` |
  | PTGames, Sparks, Name, Color | Class, Full name, Q2 Color | filter on Group |
  | PT Games, T&T, Color, Name | Group, Q2 Color, Full name | second copy at `F3` |
  | PT Games, T&T Girls, Name, Colo | Class, Full name, Q2 Color | filter on Class (girls) |
  | PT Games, T&T Boys, Name, Color | Class, Full name, Q2 Color | filter on Class (boys) |

- **Quarter is baked in:** the pivots use the Q2 field, so each new quarter means editing every pivot.
- **In the app:** built as *Color teams*, ordered by color then name, or by name then color, one list for Sparks and one for T&T. Add the T&T Boys / Girls splits if you want them separately.

---

## Companion workbook: "26-27 Weekly Awards"

Read separately (it is a different file). It pulls from this Sheet.

| Tab | What it does |
|---|---|
| Master Student List | Imports the identity, class and handbook columns from All Clubbers Attendance |
| Differences Summary / Differences Calculator | Finds new students, students who moved class or group, and name changes. Note on the tab: "View needs to be refreshed each time" |
| Awards Earned each week | Pulls the week dates (every 6th column of the attendance table) plus the identity and handbook columns. A note says rows 1 to 5 are used to pull dates from the attendance Sheet |
| Weekly Awards | The weekly slide: *Group*, *Week* (e.g. `261021`), then Class / Full name / Handbook / Results |
| PT: Weekly Awards Step 1 | Pivot split of the earned awards (step 1), then an "if on the exclude list, blank it" pass (step 2) |
| PT: Weekly Awards Step 2 | The cleaned slide list with date, handbook (code + date) and the awards, plus a Notes column |
| PT: Sparks by book | Counts of Sparks by handbook ("No Book Yet", etc.) |
| List of Possible Awards | Award names per group (Puggles, Cubbies, Sparks, T&T), handbook codes (HG, WR, ...), and the **Items to Exclude** list per group |

---

## What the app covers today

| Sheet tab(s) | App | Status |
|---|---|---|
| 1 Data from FBK Download | Import Planning Center CSV | Built |
| 2 All Clubbers: identity, color teams | Roster + Color teams tab; mid-quarter changes on the Person tab | Built |
| (new) one place for everything about one person | Person tab | Built |
| 2 All Clubbers: weekly attendance, handbook, participation, extras, totals | Attendance tab, season file, Attendance summary report | Built; Q1 history migrated |
| 3 Compare | Import review | Built |
| 4 Color Team Counts | Color teams tab summary | Built |
| 5 Games Points, 15 to 18 Games Q1 to Q4, game columns in 2 | Games tab, Game standings report, per-child game points | Built; Q1 history migrated |
| 6, 7 Emergency | Reports | Built |
| 8 Medical, 9 No Photos | Reports + per-person checkbox | Built |
| 10, 11 Birthdays | — | Dropped (unused) |
| 12 Volunteers | Reports | Built |
| 13 Vest T-Shirt | Uniforms tab | Built |
| 14 Color Matrix | Assignment engine | Built |
| 20 to 23 Attendance forms | Reports (one landscape page per room) | Built |
| 24 to 31 PT Games lists | Color teams report | Built |
| 19 Example | — | Not needed |
| Weekly Awards workbook | Awards and Progress tabs, weekly slide, achievement records | Built (see `WEEKLY-AWARDS-TABS.md`) |
| Master schedule, rotation, lessons | Calendar, Rotation, Reports | Built (not part of the Sheet) |
