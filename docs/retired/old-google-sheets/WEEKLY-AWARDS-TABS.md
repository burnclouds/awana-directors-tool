# "26-27 Weekly Awards" — what every tab does

> **Historical (2026-10-29).** This describes the *old* "26-27 Weekly Awards" Google Sheet. The app has replaced it (awards are stored per child per night; Earned, Announced and Given are three steps, and Given can be marked *no date*). The sheet's weekly slide is now **Slide images…** on the Awards tab, which draws the TV slides from the awards earned and not yet announced (as of 1.50.28 the printable weekly awards report is gone; the room leaders' list is *Printable list by class…* on the Hand out page). For how the app works today read the in-app **How it works** tab and `README.md`.

Read from a full xlsx export on 2026-10-29. Nothing in the Sheet was changed. This document describes structure and logic only; no names or contact details appear in it.

9 tabs, no hidden tabs, 2 pivot tables. It is the awards companion to **26-27 Attendance Sheets** (see `SHEET-TABS.md`) and reads from that file's "All Clubbers Attendance" tab through `IMPORTRANGE`. The Master Student List tab still calls the source "26-27 New Attendance Sheets", the file's earlier name.

## What it is for

Instructors mark awards on paper. You key them in once, per child, per week. Each week you then produce a **slide-ready list of who earned what**, by group, with a few awards deliberately left off the slide. It also tracks Sparks **Blue Jewels** by attendance count, and counts Sparks by handbook.

## How the pieces fit

```
26-27 Attendance Sheets / All Clubbers Attendance
        │  IMPORTRANGE (by row position, not by key)
        ├──► Master Student List  (live copy of: Unique ID, Group, Class, Full name, Handbook)
        │            │
        │            ▼
        │      Differences Calculator ──► Differences Summary   (has the roster drifted?)
        │            ▲
        └──► Awards Earned each week   ← WHERE YOU TYPE AWARDS (one column per week)
                     │  also imports: year attendance total, last date attended
                     │  computes: Blue Jewel 1-4 flags
                     ▼
              Weekly Awards   (pick group + week → slide list)   ◄── List of Possible Awards
                     ▲                                               (award names, exclusions,
   older, pivot-based version of the same job:                         book codes, dropdowns)
   PT Weekly Awards Step 1 → PT Weekly Awards Step 2
   PT Sparks by book  (handbook counts)
```

Week codes are written `yymmdd` (for example `261014` = 2026-10-14) in tab headers and in handbook cells.

Weekly rhythm implied by the Sheet: open **Awards Earned each week**, pick the group and week → type that week's awards for each child (the cells that need one are highlighted) → open **Weekly Awards**, pick the same group and week → copy the "Results for Slide" list into the slide. Check **Differences Summary** whenever Planning Center changes the roster.

---

## 1. Master Student List  (input, imported)

- **Purpose:** a live copy of the five identity columns from the attendance Sheet, used to look up everything else.
- **How it works:** `B1` holds the URL of the attendance Sheet, `B2` its name. Row 3 lists the source columns (`B`, `H`, `I`, `K`, `J`); row 4 builds the range text (`All Clubbers Attendance!B8:B`, ...); row 7 runs `IMPORTRANGE` for **Unique ID, Group, Class, Full name, Handbook**. The handbook comes across as typed, a code plus date (for example `260916`).
- **Fragile:** it is a straight column copy by row position. Formulas and the autofilter run to row 202.
- **In the app:** the roster itself. The key is the same `RegID_First_Last` Unique ID.

## 2. Awards Earned each week  (the data-entry tab)

- **Purpose:** the awards database: one row per child, one column per club night, and you type what the child earned that night.
- **Controls (top left):**
  - `B5` week date, a dropdown of every week date in row 7.
  - `B6` group, a dropdown of TnT, Sparks, Cubbies, Puggles.
  - Together they drive the highlighting described below.
- **Plumbing (rows 1 to 3):** hidden-in-plain-sight machinery that builds the `IMPORTRANGE` references. Row 1 holds column numbers, row 2 turns them into column letters through a lookup in List of Possible Awards, and row 3 builds the range text.
- **Row 7 headers:**
  - `A` Master Student List Unique ID, **typed (static)**, one row per child.
  - `B` to `E` Group, Class, Full name, Handbook: `XLOOKUP` from the Master Student List by Unique ID.
  - `F` **Attendance** and `G` **Last Date Attended**: imported from the attendance Sheet's year-total columns (`IT`, `JA`). These are matched by row position.
  - `H` to `K` **Blue Jewel 1 to 4** (see below).
  - `L` to `AT` one column per club night (35 weeks, 9/9/26 to 5/26/27), headed by the week's date, pulled from the attendance Sheet's week blocks (every sixth column).
- **Blue Jewels (Sparks):**
  - Row 4 holds the weeks in each quarter (7, 7, 8, 13). Row 5 holds the attendance "criteria": **6, 12, 19, 31**. Each is the previous criterion plus that quarter's weeks, minus one (6, then 6 + 7 - 1, and so on), so a child can miss one night per quarter.
  - Each flag is `IF(attendance = criterion, 1, 0)`. A flag of 1 means the child just reached that jewel's attendance count.
  - Flags exist for the Sparks rows only. The row 6 note says the jewel dates are imported from the attendance Sheet.
- **Typing awards:** in the child's cell under that week's date, enter the award name. Several awards in one cell are separated by `", "` (for example `Start Zone 1, Start Zone 2`). A dropdown (validation `L8:AT705`) offers the award list; it is the **Sparks** list without "Flight 3:16", so other groups' awards (T&T emblems, Cubbies emblems) are not in the dropdown.
- **Highlighting:** one conditional-format rule colors a cell in the selected week when a Blue Jewel flag is 1 and the cell's week matches both the chosen week and the child's last date attended. In other words, it points at the cell where you should type the jewel.
- **Status:** weeks 1 to 7 (Q1) are filled in, mostly the Start Zone / Flight 3:16 / emblem awards; later weeks are empty.
- **Fragile:**
  - Attendance and last-date columns are matched by row position, but the Unique IDs in column `A` are typed. If the attendance Sheet gains or reorders a row, `F`, `G` and the week dates no longer line up with the right child. The Differences tabs exist to catch this.
  - The clubber counter at `D6` only counts rows to `D143`.
  - Row 6 of the week columns has a leftover count formula that returns 0.
  - The last column (`AU`) shows `#N/A`.

## 3. Differences Calculator  (check)

- **Purpose:** warns when the live student list has drifted from the typed list in tab 2: a new child, a class move, a name change, a changed handbook.
- **How it works:** for each row, five cells compare the Master Student List (row `n`) to the same row in Awards Earned each week. A match shows the value; a difference shows `! master-value | awards-value`. `F` counts the `!` marks, and `A5` reports the number of rows with differences. Rows with a difference are highlighted.
- **Note on the tab:** "View need to be refreshed each time."
- **Fragile:** it compares by row position. One inserted child shifts every row below and floods the sheet with differences.

## 4. Differences Summary  (check)

- **Purpose:** the short version of tab 3: only the rows that differ.
- **How it works:** `FILTER` over the Differences Calculator for rows where the count is not 0. When nothing differs the filter returns `#N/A`, which is what it shows now. Same highlighting and header note.

## 5. Weekly Awards  (the slide list)

- **Purpose:** pick a group and a week and get the children who earned something, with a slide-ready "Results" cell.
- **Controls:** `D2` group (dropdown), `D3` week (dropdown of the week dates).
- **How it works:**
  - `F5` finds which column of Awards Earned each week holds the chosen week (`XMATCH` on row 7). `B5` to `E5` hold the column numbers for Group, Class, Full name, Handbook.
  - `B7` is a `QUERY` on Awards Earned each week: **select Group, Class, Full name, Handbook and that week's column, where Group = the chosen group and that week's cell is not blank.** Only children with something that week appear.
  - `H` to `Q` split the week's award text on `", "` into up to ten cells.
  - `S` to `AB` copy those cells but **blank any award on the exclusion list for that group** (List of Possible Awards, columns `P` and `Q`).
  - `G` **Results for Slide** is the remaining awards joined with line breaks.
- **Slide columns:** Class, Full name, Handbook, Results (group and week as the slide title).
- **Fragile:** formulas run to row 203. It depends on the exact award spellings, since the exclusion list is matched by text.

## 6. PT Weekly Awards Step 1  and  7. PT Weekly Awards Step 2  (older, pivot-based)

- **Purpose:** the first version of tab 5, built on a pivot table instead of a query.
- **Step 1:** a pivot over Awards Earned each week (rows Group, Class, Full name, Handbook, and one week-date column; filters for group and class chosen in `C1` and `C2`). To its right, a three-stage split: split the cell on commas (`I` to `R`), blank excluded awards (`T` to `AC`), then join what is left with line breaks (`G`). Column `H` is a long nested `IF` that does the same join a different way.
- **Step 2:** a **pasted copy** of the finished slide for one week (10/14/2026). It has Group, Class, Full name, Handbook, the week's awards, and an empty **Notes** column, with the date title built from the `yymmdd` code. It is a worked example of what the slide looks like.
- **Status:** Weekly Awards (tab 5) does the same job without refreshing a pivot, so these look superseded. Not removed.

## 8. PT Sparks by book  (pivot)

- **Purpose:** how many Sparks are on each handbook.
- **How it works:** a pivot counts the Handbook cells by Group, Class and Handbook (filters in `C1` and `C2`). Column `E` turns the first two letters of the handbook code into the book name through a lookup in List of Possible Awards, or "No Book Yet" when there is no code. A side table in `G:H` totals children per book.
- **Status:** as exported it shows everyone under "No Book Yet", which suggests the pivot was not refreshed (handbooks in the master table are filled in for most Sparks).

## 9. List of Possible Awards  (reference data)

Everything the other tabs look up lives here.

| Columns | What it holds |
|---|---|
| `A` to `D` | Helper table of 264 column numbers, their letters, and the row-7 cell reference. Used to build the `IMPORTRANGE` strings. `C` is the transposed list of week dates that feeds the week dropdown. |
| `E`, `F` | The master list: **68 (group, award) pairs**. Puggles 1, Cubbies 5, Sparks 29, T&T 33. |
| `G` | The four groups (`UNIQUE` of `E`). Feeds the group dropdowns. |
| `H` | The Sparks award list without "Flight 3:16". This is the dropdown on the data-entry tab. |
| `J`, `K`, `L` | Group and class names for the class dropdowns (Puggles, Cubbies, Sparks A to D, T&T Girls and Boys, Groups A and B). |
| `M`, `N` | Handbook names and codes: Hangglider = HG, Wingrunner = WR, SkyStormer = SS, HoneyComb = HC. |
| `P`, `Q` | **Items to Exclude** from the slide: Sparks → Flight 3:16; T&T → Start Zone 1; T&T → Start Zone 2. |
| `T` to `W` | One column per group listing that group's awards (`FILTER` of `E:F`). Named ranges `Puggles`, `Cubbies`, `Sparks`, `TnT` point here. |

**Awards, by group:**

- **Puggles:** Participation Certificate.
- **Cubbies:** Appleseed Trail Emblem (and its Date), Honeycomb Trail Emblem (and its Date), Cubbies Recognition Certificate.
- **Sparks (29):** Flight 3:16; Blue Jewel 1 to 4; HG Green Emblem, WR Blue Emblem, SS Red Emblem; HG, WR and SS Pilot Wing; Red Jewel 1 to 4 and Green Jewel 1 to 4 (interleaved by number); HG Review Emblem (Green), WR Review Emblem (Blue), SS Review Emblem (Yellow); 1st and 2nd Book Award Medallion (each with a Date entry); SS 3rd Book Date; Sparky Award Sculpture; Recognition Certificate.
- **T&T (33):** Start Zone 1 and 2; Blue, Red, Green and Yellow Emblem 1 and 2; Discovery Award emblems in the four colors; Silver 1 to 4 plus Extra Credit Silver Emblem; Gold 1 to 4 plus Extra Credit Gold Emblem; Alpha Award, Excellence Award and Challenge Book Award Medallions (each with a Date entry); Timothy Trophy Award (and Date); Certificate of Award.

"... Date" entries record the day a milestone was reached; the matching plain entry is the physical award.

**Named ranges:** `GroupList`, `GroupList2`, `ClassList`, `PTClassList`, `PTClassList2`, `AwardsList`, `Puggles`, `Cubbies`, `Sparks`, `TnT`.

---

## Behaviors worth knowing

- Everything keyed on **row position**: the imports from the attendance Sheet are aligned by row, while the Unique IDs in Awards Earned each week are typed. That is why two tabs exist only to detect drift.
- **Sparks and Cubbies/T&T are handled differently:** Blue Jewel flags and the data-entry dropdown are Sparks-only.
- **Excluded awards are routine ones** (Flight 3:16 for Sparks, the Start Zone books for T&T), so they never reach the slide.
- **Awards are free text** in one cell per week, comma-separated, so a typo or an extra space silently breaks the exclusion match.
- The slide itself is not in this workbook; the sheet produces the text list and you paste it into a slide.

## What the app covers today

| Awards workbook tab | App | Status |
|---|---|---|
| Master Student List | Roster (same Unique ID) | Built |
| Differences Calculator / Summary | Import review, matched on registration ID + name | Built |
| Awards Earned each week | Awards tab (night + group; award picker; Blue Jewel and finished-section suggestions) | Built; Q1 awards migrated |
| Weekly Awards | Weekly awards slide report, with the exclusion list | Built |
| PT Weekly Awards Step 1 / Step 2 | Superseded by the weekly slide report | Not needed |
| PT Sparks by book | Handbooks by book report | Built |
| List of Possible Awards | Award lists, exclusions, book codes and jewel weeks, editable in the Awards tab and stored in the season file | Built |
| (not in the workbook) the TV slide pictures | Awards tab, *Slide images…*: Cubbies, Sparks (one column per handbook), T&T and Adult Memorization as 1920×1080 PNGs, one at a time or as a ZIP. Replaces the standalone Awards Slide Generator page | Built |

Built that way: awards are stored as a list per child per night keyed on the Unique ID; the Blue Jewel is computed from attendance using thresholds kept in the season file (default 6/12/19/27 from the paper record; the Sheet used 31, see the later-fixes list); and the exclusion list is editable.

The slide pictures are drawn from those recorded awards, so nothing is typed twice. Sparks children are placed in the Hang Glider, Wing Runner or Sky Stormer column by their handbook code (a child with no code falls back to Hang Glider, with a warning). Award names are reworded for the slide: a Pilot Wing recorded with Red Jewel 1 reads "Green Wings & Red Jewel 1" (the colour comes from the book list), and a book Emblem reads "Green Rank". Anything else shows as recorded, and a season can override any name in `config.slideNames` (`{ "recorded name": "slide wording" }`). Adult Memorization is not in the roster, so those names and passages are typed on the Slide images screen and saved in the data file (`adults`). Puggles have no slide.
