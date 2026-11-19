# Calendar maker and lessons by week (BACKLOG N3 + N2): implementation plan and test plan

This is a plan only; nothing is built yet. Requirements are the owner's answers of 2026-11-18, including the later addition that lessons by week are in scope, so N2 is merged into this plan. A second round of answers the same day settled four more points: all four groups can have weekly lessons; planned and unplanned cancellations behave differently; there is no handling of the old column shift; holiday breaks are chosen by hand. Invented TEST club only (`dev/test-data/awana-2026-27-TEST-20261029-214815.json`, a `fake: true`, version 5 file). Figures marked "prototype" were checked with throwaway scripts against that TEST calendar; the second revision (same day) re-ran every prototype figure and checked every file, function and line reference against the code.

**Revision 2 (2026-11-18), what changed from the first draft:** every code reference was checked (section k lists what was wrong); the quarter-suggestion rule was made exact (as first written it gave 2/3 and 4/7, not 1/6 and 3/3); a build sequence of small red-then-green steps replaces the 8 batches (section h); the test plan names every case with inputs and expected outputs (section f); and risks and questions with recommended defaults were added (sections i and j). The owner's decisions are unchanged.

## a. Summary and scope

The club calendar and each group's weekly lessons get built inside the app, with no Excel sheet and no calendar CSV.

**Making the calendar**
1. The director picks the club weekday, the first night and the last night.
2. The app recommends the breaks (Thanksgiving week, Christmas break). He edits their dates, adds or removes breaks, and ticks or clears each night by hand. The app lists every club-day date, marks nights in a break No Club (planned) and flags Easter week.
3. It suggests where Q2, Q3 and Q4 start, and he clicks the real ones.
4. Optionally, it numbers the lessons for the groups that have weekly lessons.
5. He previews the result and applies it as one Undo step.

**Editing afterwards**
- Any night by hand: theme, notes, Type, quarter, date, and start and end times for events.
- Whether a night meets, in three states: **Meets**, **No club (planned)**, or **Cancelled** (unplanned, with a reason such as Snow).
- Lessons on a Lessons by week grid, for any of the four groups. Hand-typed lessons are never overwritten.
- What a cancelled night does to the lesson:
  - A planned No Club night moves its lesson to the next night.
  - An unplanned cancellation skips its lesson, which can be made up on a later night.
  - Both behaviors can be changed per group.

**Printing:** a Club calendar report that looks like his Excel sheet, and a corrected Lessons by week report.

**Backup:** the calendar CSV stays as a strict format under Options.

Everything downstream keeps reading `season.calendar` through `Calendar.isNight` and `Calendar.nights` (calendar.js, unchanged rule: a row is a club night unless it is an Event or has `No Club: '1'`; `club-night-rule.test.js` pins it).

**Out of scope**
- N1, the coaches binder notes sheets. `Calendar.nightBlocks` is built so N1 can reuse it.
- The rotation.
- Any stored logo.
- Showing lessons anywhere beyond the grid, the Lessons report and the optional calendar line (section c6).

## b. Data model

### b1. Row fields

`Calendar.COLS` (calendar.js line 6, today 11 keys) goes to 15, in this order. It is also the rigid CSV layout (section e):

`Date, Type, Quarter, Theme, Start Time, End Time, Notes, No Club, Cancelled, No Club By Hand, Holiday, Puggles Lesson, Cubbies Lesson, Sparks Lesson, T&T Lesson`

New keys: `Start Time`, `End Time`, `Cancelled`, `No Club By Hand`, `Holiday`, and `Puggles Lesson`. `Puggles #` and `Puggles Title` are dropped (b5). `Cubbies Lesson`, `Sparks Lesson` and `T&T Lesson` keep their names. There are no separate title columns: a lesson is one text, such as `1.1 God Made the Light`.

| Field | Value | Notes |
|---|---|---|
| `Start Time`, `End Time` | `HH:MM` (24 h) or `''` | For events. A club night may have them too; they print only when set. End needs Start (validator error). End before Start is a warning. |
| `No Club` | `'1'` or `''` | As today: `'1'` means not a club night. It is set for **both** kinds of cancellation, so `Calendar.isNight` and everything that reads it are unchanged. Attendance pickers, To do, totals, absences and the team plan already treat any No Club row as "not a club night". An older 1.51 copy does the same. |
| `Cancelled` | reason text or `''` | **Unplanned** cancellation, such as `Snow`, `Weather` or `Illness`. A cancel with no reason given stores `Cancelled` (the word itself), so the cell is never empty for a cancelled night. It must come with `No Club: '1'` (validator error otherwise). `No Club: '1'` with `Cancelled: ''` is a **planned** No Club night. |
| `No Club By Hand` | `'1'` or `''` | He set or cleared this night's No Club himself (in the panel or the grid). Regenerating and merging never change such a night (b7). Unplanned cancels are always by hand. |
| `Holiday` | name or `''` | Written by the generator from the break the night falls in (`Thanksgiving week`, `Christmas break`, his own break name) or `Easter week`. A tag only; `No Club` decides. Easter week rows have `No Club: ''`. |
| `<Group> Lesson` | text, `-`, or `''` | **A lesson typed by hand** for that group on that night. `''` means "from the series" (b3). `-` means "no lesson this night", which prints blank and does not use up a series item. |

- `Notes` stays free text.
- Special nights (Team Color, Awards Ceremony, Opening Night) stay plain theme text.
- Rows may still lack keys (old files, hand-made test rows such as those in `club-night-rule.test.js`): every reader treats a missing key as `''`.

### b2. Config keys

Each one goes into `validate.js CHECKED_CONFIG` (line 33) with a mutation test; the rule test at `validate.test.js` lines 266 to 273 ("every section and every config key the code uses has a file check") fails until it is there, because it collects every `config.<name>` in the source. Each also needs a row in the config table of `docs/DATA-FORMAT.md` (`data-format-doc.test.js` line 23).

**None of them goes into `Catalog.defaultConfig()`, and `fromJson` does not write them.** A missing key reads as its default through one normalizer, `Calendar.settings(config, rows)` (b7). Writing defaults at open would add a config change, and therefore a "File upgrade" History entry, to every existing file and to every test file made with `Season.blank` (revision 2; see i).

- **`clubTagline`** (text): the second title line on the printed calendar.
- **`breaks`**: `[{ name, from, to }]`. These are the planned breaks he chose: Thanksgiving week, Christmas break, a spring break, any other. The panel prefills them from `recommendBreaks` (b7) when the list has no break inside the year's range. After that the list is his: he edits the dates, adds breaks or removes them. Every club day inside a break is generated as planned No Club with `Holiday: name`.
- **`easterFlag`** (boolean, default true; missing reads as true): tag the club day in Easter week. It never cancels the night.
- **`lastYearCalendar`**: rows (`Date, Type, Theme, Start Time, End Time, Notes, No Club, Cancelled`), written by `Season.newSeason`. It is the source for "Copy last year's themes" and the theme suggestions.
- **`lessons`**: `{ on: bool, groups: { Puggles: G, Cubbies: G, Sparks: G, 'T&T': G } }`.
  - `on`: lessons by week are used at all.
  - Each G is `{ on: bool, from: 'YYYY-MM-DD' | '', items: [text], planned: 'move' | 'skip', unplanned: 'skip' | 'move' }`.
  - **Group `on`:** turning lessons on sets all four groups on, in the order Puggles, Cubbies, Sparks, T&T, and each can be switched off. No group is hard-coded off, and only groups that are on appear in the grid and the reports.
  - `items`: the series in order, for example `1.1 God Made the Light`. **Starts at** (c1, c5) is applied by slicing: filling a 4 × 8 series that starts at 2.1 stores items `2.1` to `4.8`. There is no separate start key.
  - `from`: the night the series starts; `''` means the first held night.
  - `planned` (default `move`): what a planned No Club night does to the lesson.
  - `unplanned` (default `skip`): what an unplanned cancellation does to the lesson (b3).
  - `newSeason` keeps `on`, each group's `on`, `planned` and `unplanned`, and clears `from` and `items` (a new year, a new book). It does nothing when the file has no `lessons` key.
  - **Missing `lessons`** reads as: `on` true when any calendar row has a non-empty lesson cell, else false; all four groups on; `from` and `items` empty; `planned` `move`; `unplanned` `skip`. The key is written the first time he changes a lessons setting (one ordinary History change).

### b3. Tying a lesson to a date

Lessons from the series are **worked out when they are read, never stored**:

```
Calendar.lessonsFor(rows, group, G) -> Map(date -> { text, kind, reason })
   kind: 'hand' | 'series' | 'missed' | 'off' | 'none'
```

1. Walk the non-Event rows in date order (a duplicate date: the first row wins, the validator already warns). Rows before `G.from` (or before the first held night when `from` is `''`) are `none`, unless typed.
2. A row with a typed cell gives that cell (`-` gives `''`), `kind: 'hand'`. It uses **no** item. A typed cell on a night that does not meet is kept and shown greyed in the grid, but never printed (j, question 3).
3. A held night gives `items[i++]` as `series`, or `none` with `''` once the series runs out.
4. A planned No Club row (`No Club: '1'`, no `Cancelled`):
   - With `planned: 'move'` (default) it gives `off` and uses no item, so the lesson moves to the next held night.
   - With `planned: 'skip'` it uses up `items[i++]`, shown as `missed` with `reason` = the Holiday name (or `No club`).
5. An unplanned cancel (`Cancelled` set):
   - With `unplanned: 'skip'` (default) it uses up `items[i++]`. The lesson **stays attached to the cancelled date** as `missed` with `reason` = the Cancelled text, and nothing after it shifts.
   - With `unplanned: 'move'` it behaves like step 4's move.

Why this model:
- **Nothing can overwrite a hand edit.** Typed cells are the only stored lessons.
- **A planned night off re-flows the rest automatically.** This matches his Excel sheet: prototype on the TEST calendar with a 32-item 4 × 8 series from 9/9 gives 2.3 on 11/18, 2.4 on 12/2 after the planned 11/25 No Club, 4.8 on 5/5 and blank on 5/12.
- **A snow day skips.** Prototype: an unplanned cancel on 11/11 gives 2.1 (11/4), 2.2 missed (11/11), 2.3 (11/18), 2.4 (12/2), and nothing later moves. The lesson is not rescheduled: the owner's club catches up a snow day by self-study toward the section sign-offs, so the app has no make-up feature.
- The existing lesson columns stay the storage.

`Calendar.seriesFromCells(rows, group, G)` returns `{ from, items, mismatches }` from a group's typed cells on held nights, in order (`-` cells are left typed and are not items). It backs the "Link these to the calendar" button (c5), which turns a year typed by hand (or imported) into a series and clears those cells. `mismatches` lists the nights where `lessonsFor` with the new series would not give the same text as the typed cells today (an empty cell inside the run, or a night that `skip` would use up); the button shows them and links only when the list is empty or he confirms.

`Calendar.lessonChanges(rowsBefore, rowsAfter, settings)` returns `[{ group, kind: 'moved' | 'skipped' | 'back', date, text }]` for every group that is on and has a series, comparing the series texts before and after a state change. The app words it ("Puggles lesson 2.2 is skipped on 11/11; later lessons stay where they are", "Puggles lessons after 11/25 moved one night later").

### b4. Where last year's themes come from

Checked in `season.js newSeason` (line 515). It builds `n = blank(year)`, so History starts empty, and copies `s.calendar` into the new file (line 523); nothing else keeps the old rows. The sources, in order:

1. `config.lastYearCalendar`, which New season now writes.
2. Rows dated on or before `config.carriedThrough`, from a file made by New season before this feature (`carriedThrough` is written at line 528: the closed year's last attendance night or counted club night). Make calendar copies them into `lastYearCalendar` before replacing them.
3. "Use themes from another data file…", which reads an old file's `calendar` with `Season.fromJson`, the same way as Options › Earlier years › Add an earlier year.

### b5. Upgrade path and format version

`Season.fromJson` (season.js line 115) copies the calendar whole at line 137 and then runs its upgrades between `beforeUpgrade` (line 140) and the File upgrade entry (lines 148 to 151). A new `upgradeCalendar(s)` joins that list at line 144 and runs every row through `Calendar.tidy(row)`:
- A row that already has exactly the 15 keys, all text, is returned **untouched** (same object, same key order). This matters because `Season.diff` compares with `JSON.stringify`, so a reordered row would count as a change and give a current file a File upgrade entry.
- Otherwise it builds the row in COLS order: missing keys become `''`, non-text values become text, unknown keys are kept after the 15.
- `Puggles #` and `Puggles Title` are joined (space between, empty parts dropped) into `Puggles Lesson` **when `Puggles Lesson` is empty**, and both keys are deleted. When `Puggles Lesson` already has text (possible only if an older 1.51 copy typed into its old columns), `Puggles Lesson` wins and the old pair is appended to `Notes` as `Puggles: <text>` so nothing is lost.
- The other old lesson values stay **as they are, in the same-named columns**, as typed lessons. There is no guessing about which group they belonged to (b6).
- Old rows get `Cancelled: ''` and `No Club By Hand: ''`, so every old No Club night reads as planned.
- The TEST file has `Puggles #` and `Puggles Title` empty on every row.

`config.lessons` and `config.breaks` are **not** written at open (b2). On a file with History the calendar change shows once in the "File upgrade" entry (R20; the calendar is one whole-array change because `diffInto` treats arrays as values); a current file changes nothing.

**`Season.VERSION` stays 6** (season.js line 16). An older 1.51 copy keeps the new row and config keys, because rows are copied whole by `App.loadData` (app.js line 1260) and the `fromJson` config `Object.assign` (line 124) keeps unknown config keys. Its Lessons report would show Puggles empty, which is a display-only loss and acceptable, the same as the `pastTurnout` precedent.

### b6. The Puggles and Sparks columns are swapped (N2): what it is and what happens to it

The code maps the columns correctly:
- `reports.js lessons` (function at line 189; the row mapping at line 194) reads `Cubbies Lesson`, `Puggles #` + `Puggles Title`, `Sparks Lesson`, `T&T Lesson`.
- `app.js CAL_TEXT` (line 1199) and the manual example (index.html line 405, the `<pre data-example="calendar">`) use the CSV order Cubbies, Puggles #, Puggles Title, Sparks, T&T.

**The data is two columns off.** In the TEST calendar (from his CSV):
- `Puggles #` and `Puggles Title` are empty on every row.
- `Sparks Lesson` holds 1.1 to 4.8, the Puggles lesson numbers.
- `T&T Lesson` holds the Puggles titles ("God Made the Light" … "We Give Thanks", and "Awards Night" on 5/12).
- `Cubbies Lesson` is correct ("Booklet", "Bear Hug 1" to "Bear Hug 26", "Special Day 1" to "Special Day 4", "Awards Night").

His Excel headings (screenshot 26: numbers under "Sparks", titles under "T…") carried the same shift into the CSV.

**The fix (owner, 2026-11-18): a new rigid layout, with no handling of the old one.**
- There is no detection and no "move" button.
- The fixed column order (b1, e) makes the shift impossible from now on: one lesson column per group, named after the group, in the order Puggles, Cubbies, Sparks, T&T.
- A current data file keeps its old values where they are, as typed lessons in the columns they were filed under. For the TEST file that means Sparks and T&T.

**Re-entering a year:** about two minutes in the Lessons by week view (c5):
1. Choose Puggles and set **Fill the series from 9/9** with 4 × 8. That fills 1.1 to 4.8 on every night at once.
2. Optionally paste the 32 titles into **Edit list…**.
3. Choose Sparks and use **Clear typed lessons from 9/9 on**. Do the same for T&T, or switch either group off.
4. Cubbies' typed Bear Hug cells are already right.

The TEST fixture is re-entered the same way by a script (step 23).

### b7. calendar.js 2.0.0: pure functions, node-testable

calendar.js is 1.2.0 today (53 lines). All of the following are pure and exported; `isNight`, `nights`, `currentQuarter`, `shiftWeeks`, `offDay(s)`, `weekday`, `dayName`, `DAYS`, `quartersIn` stay as they are.

- **`COLS`, `tidy(row)`, `blank()`** (b1, b5). `blank()` keeps `Type: 'Club night'`, `Quarter: 'Q1'`.
- **`settings(config, rows)`**: `{ breaks, easterFlag, tagline, lessons }` with every default filled in (b2). Never mutates `config`.
- **`easter(year)`**: the anonymous Gregorian Computus (Meeus/Jones/Butcher). Prototype: 2026-04-05, 2027-03-28, 2028-04-16, 2029-04-01.
- **`thanksgiving(year)`**: the first Thursday on or after Nov 1, plus 21 days. Prototype: 2026-11-26, 2027-11-25, 2028-11-23, 2029-11-22, 2030-11-28.
- **The rules are recommendations with editable values; hand choices win.**
- **`recommendBreaks(first, last)`** returns the suggested `breaks` for the year range. For each calendar year Y from first's to last's, it adds each of these that overlaps `[first, last]`:
  - `Thanksgiving week`: Sunday to Saturday of Thanksgiving's week, that is Thanksgiving −4 days to +2 days.
  - `Christmas break`: Dec 21 of Y to Jan 1 of Y+1. The month-days are the constants `XMAS_FROM = '12-21'` and `XMAS_TO = '01-01'`.
  - The panel shows these as editable From and To rows. **Reset to recommended** puts them back.
  - No federal holidays, so 2026-11-11 stays a club night.
- **`holidayOf(iso, breaks, easterFlag)`** gives `{ name, noClub }` or null:
  - A date inside one of `breaks` (inclusive) gives that break's name and noClub true. Overlapping breaks: the first in the list wins.
  - Otherwise, a date from Easter −6 days to Easter Sunday gives `Easter week` with noClub false, when `easterFlag` is on.
- **`generate({ day, first, last, breaks, easterFlag })`**: one Club night row (15 keys, from `blank()`) per club weekday, tagged with any holiday. Nights inside a break are planned No Club. A first night that is not on the club day rolls forward to the next club day (the panel never sends one; this is a guard).
  - Prototype with the recommended breaks, for 2026-27 Wednesdays 9/9 to 5/12: 36 rows, No Club exactly on 11/25, 12/23 and 12/30, and the Easter tag on 3/24. This is his sheet.
  - 2027-28 (9/8 to 5/10): 36 rows; 11/24, 12/22 and 12/29; Easter tag 4/12.
  - 2028-29 (9/6 to 5/9): 36 rows; 11/22 and 12/27; 12/20 and 1/3 meet unless he widens the break; Easter tag 3/28.
- **`suggestQuarters(rows)`** gives `{ Q2, Q3, Q4 }` (dates, or `''`). Exact rule (revision 2; the first draft's "k·N/4" picks 2/3 and 4/7 on TEST):
  - The held nights in date order, indexed 0 to N−1. A **natural start** is a held night that is the first held night of its month or directly follows a No Club row (an Event row between does not count).
  - For k = 1, 2, 3 the target index is t = k·(N−1)/4 and the window is w = min(3, floor((N−1)/8)).
  - Pick the natural start with |index − t| ≤ w nearest to t, not before the previous pick + 1; on a tie, prefer the one that follows a No Club row, then the earlier one. With none in the window, use index max(previous + 1, round(t)).
  - With N < 4, give starts for as many quarters as there are nights after the first, and `''` for the rest.
  - Prototype on TEST (N = 33): 11/4 (his sheet has 10/28), 1/6 and 3/3, both as in his sheet. Also 2027-28 generated: 11/3, 1/5, 3/1; 2028-29 generated (N = 34): 11/1, 1/3, 3/7; 36 Wednesdays with no breaks: 11/4, 1/6, 3/3; 8 Wednesdays from 9/9: 9/23, 10/7, 10/14; 4 Wednesdays from 9/9: 9/16, 9/23, 9/30.
- **`applyQuarters(rows, starts)`**: each row takes the quarter of the next held night on or after it. A closed week or event between quarters therefore belongs to the following quarter. Rows after the last held night take the last held night's quarter. Rows before the Q2 start are Q1.
- **`quarterStarts(rows)`**: reads the current starts back (the first held night of each quarter; `''` for a quarter with none).
- **`mergeInto(existing, generated, protect)`** returns `{ rows, kept, removed, quarterChanged, lastYear }`. `protect` is `{ dates: Set, lockedQuarters: [q], carriedThrough, first, starts }`.
  - Last year's rows (on or before `carriedThrough`, or all rows when every one is before `first`) go to `lastYear` and are dropped, unless their date is protected.
  - When a date is in both:
    - A row with `No Club By Hand` or `Cancelled` keeps its No Club, Cancelled and By-Hand values. **Hand choices are remembered across regenerating**, even when the breaks change.
    - The other fields are compared, leaving out Quarter, No Club, No Club By Hand, Cancelled and Holiday. The row is **edited** if any of them differs from the generated row, and that includes theme, notes, times and typed lessons. Edited fields are kept.
    - Everything else (No Club and Holiday on a row not set by hand, and the whole row when it was not edited) comes from the newly generated row.
    - So moving a break re-tags the nights he did not touch, and leaves the nights he did touch alone.
  - Existing rows that were not generated: Events are always kept; protected rows are kept with a reason (`attendance`, `absence`, `team move`, `locked quarter`); edited rows are kept and listed; the rest are removed.
  - A protected row's date is never changed or deleted.
  - After `applyQuarters(rows, starts)`, every protected or locked-quarter row whose quarter changes is listed in `quarterChanged` as `{ date, from, to, why }`.
  - Running it twice on its own output gives the same rows.
- **`copyThemes(rows, lastRows, how, withEvents)`** returns `{ rows, filled, flagged }`:
  - It fills only empty themes on held nights.
  - `how` is `'order'`: with this year's held nights h[0..n−1] and last year's L[0..m−1], h[i] gets L[i] for i < min(n, m) − 1, and h[n−1] always gets L[m−1] (the closing theme, such as Awards Ceremony).
  - Or `how` is `'month'`: the kth held night of a month gets the kth held night of that month last year, when there is one.
  - With `withEvents`, each of last year's events is added on the same weekday nearest the same month-day (within ±3 days) of this year, unless an event with the same theme is already within 7 days. Its date is listed in `flagged`. Nothing is stored about the flag; the panel summary and the done message list it ("check this date").
- **`themeList(rows, lastRows)`**: the distinct non-empty themes of both, most used first, ties in alphabetical order.
- **`timeText(start, end)`**: `10:00`–`17:00` → `10am-5pm`, `09:00`–`12:00` → `9am-12pm`, `18:30` → `6:30pm`, `12:00` → `12pm`, `00:00` → `12am`; a start alone gives just the start; an end alone gives `''`.
- **Lessons:** `lessonsFor`, `seriesFromCells`, `lessonChanges` (b3), and `numberItems(units, perUnit, startAt)`, which returns `['1.1' … '4.8']` for 4 × 8, sliced from `startAt` (an item text, default the first).
- **Night state:** `stateOf(row)` returns `'event'` (Type Event), `'cancelled'` (No Club 1 and Cancelled set), `'planned'` (No Club 1, no Cancelled) or `'meets'`. `setState(row, state, reason)` writes No Club, Cancelled and No Club By Hand together, so the three never disagree: `meets` → `'' / '' / '1'`; `planned` → `'1' / '' / '1'`; `cancelled` → `'1' / (reason trimmed or 'Cancelled') / '1'`. It refuses `'event'` and unknown states.
- **`nightBlocks(rows, { quarter, lessons })`**: one block per held or not-held club-night row, in date order: `{ date, theme, state, holiday, reason, quarter, events: [rows of Type Event up to the next night], lessons: [{ group, text, kind }] }`. The calendar print uses it, and N1 can later.
- **CSV:** `load` (strict, section e) and `toCsv`.

**season.js additions:**
- `Season.datesInUse(s)` returns a `Map(date -> [reasons])` of the dates that are keys of `attendance` (with at least one mark), `games`, `awards` or `adults` (reason `attendance`, `games`, `awards`, `adult awards`), plus every absence night (`s.absences[person][absId].nights` keys, reason `absence`; see `addAbsence`, season.js line 930) and every `teamMoves[id][i].from` (reason `team move`).
- `Season.lastEdit(s, 'calendar')` returns the time of the newest History entry with a change whose path starts `calendar`, or `config` › one of `lessons`, `breaks`, `easterFlag`, `clubTagline`, `clubTitle`; `''` when there is none. It gives the printed "Updated:" date with no new key.
- `newSeason` writes `lastYearCalendar` from the closed year's rows (the fields listed in b2), clears each group's `from` and `items` when `lessons` exists, and deletes `breaks`, so next year's panel recommends fresh dates; last year's breaks are visible in `lastYearCalendar`. It still copies `s.calendar` (line 523), so the stale-calendar banner and Cancel keep working.

## c. User interface

Plain words: "club night", "class" (never "room"), "No club", "lesson".

### c1. The Make calendar panel (Calendar tab)

**Make calendar…** (a new button in the Calendar tab bar, index.html line 215) opens a full-width section inside `#tab-calendar`, above `#calWrap`. It is not the shared `App.ask` dialog, because a list of 36 ticks has to scroll and work on a phone. Its working state (dates, break rows, ticks, quarter picks, lesson lines) lives in a local object until **Make it**; nothing touches the data before that, so opening and cancelling the panel never starts a Calendar draft. The steps:

1. **When club meets:** a weekday select (`config.clubDay`), plus **First club night** and **Last club night**.
   - If a date is on the wrong weekday, the box says "That is a Tuesday; club meets on Wednesdays", and **Make it** stays disabled.
   - A first night on or before `config.carriedThrough` gives "That date is in last year's club year", and **Make it** stays disabled.
   - Last before first is refused the same way.
   - The boxes prefill with the current first and last club nights. After New season (when every row is on or before `carriedThrough`), they prefill with last year's first and last club nights plus 52 weeks (364 days, same weekday).
2. **Breaks and nights off:**
   - **Breaks:** a list of the breaks (`config.breaks`), prefilled from `recommendBreaks` (Thanksgiving week, Christmas break Dec 21 to Jan 1) when the list has no break inside the range. Each break has editable **Name**, **From** and **To** and a **Remove** button. Below the list: **Add a break** and **Reset to recommended**.
   - **Nights:** every club night that falls in a break or Easter week, with a **No club** tick. Break nights start ticked; Easter starts unticked and reads "flag only".
   - Changing a tick by hand marks that night "by hand" in the panel state; on **Make it** the generated row gets `No Club By Hand: '1'` with the ticked state, so the choice is kept when he edits the breaks or makes the calendar again. A night already set by hand in the calendar shows its current state and "set by hand".
   - A line under the list says: "You can also mark any single night No club or Cancelled later on the Calendar tab."
   - An **Easter week flag** tick sets `easterFlag`.
3. **Quarters:** the held nights, grouped by month. The suggested starts are bold "Q2 starts here".
   - Tapping a night offers **Start Q2 / Q3 / Q4 here**. Starts are kept in order; a choice that would empty a quarter is refused with a message.
   - A count line shows the nights per quarter, for example "Q1 7 · Q2 7 · Q3 8 · Q4 11" (TEST with the starts 10/28, 1/6, 3/3).
4. **Themes (optional):** **Copy last year's themes**, as None, By order or By month, with a tick **Also copy last year's events (check their dates)**. With no source, the step offers **Use themes from another data file…**.
5. **Lessons (optional):**
   - A tick **Number the lessons by week** sets `lessons.on`.
   - Then one line per group, Puggles, Cubbies, Sparks and T&T, **all four ticked by default**; he unticks any group that has no weekly lesson.
   - Each line has the following settings:
   - **First night**: the first held night by default.
   - **Lessons**: either "Numbered, units × lessons", such as 4 × 8 (which gives 1.1 to 4.8), or "Keep this year's list" when `items` already exist.
   - A **Starts at** select, to begin partway through a series (it slices the items, b2).
   - A preview line, for example "1.1 on 9/9 … 4.8 on 5/5; 1 night with no lesson".
   - Titles are added later in the Lessons grid.
6. **Check before you make it:** a summary from `mergeInto`.
   - Rows **kept**: "has attendance", "has a volunteer absence", "has a team move", "in a locked quarter", "you edited it".
   - Rows **removed**.
   - **Quarter changes**, for example "Attendance on 10/21 moves from Q1 to Q2; the Q2 team lock on 10/28 is affected". These need the tick **I understand these nights change quarter** before **Make it** is enabled.
   - Events copied from last year, flagged "check this date".

**Make it** runs inside `App.commitScope(() => { …; App.changedAs('Make calendar'); })`, with the calendar, `clubDay`, `breaks`, `easterFlag`, `lessons` and `lastYearCalendar` all in one diff. `App.changedAs(label)` is new (step 13): it is `touchSeason` with `{ label, separate: true }` passed to `Season.record`, so the entry is never folded into a Calendar or Options entry made in the last 5 minutes (`MERGE_MINUTES`, season.js line 1216; plain `App.changed()` would merge it, because both touch `calendar|config`). The result is **one History entry named "Make calendar" and one Undo step**, followed by `App.done('Calendar made: …')` (the Undo button shows by default; the option is `{ undo: false }` to hide it). If a Calendar draft is open, `commitScope` asks Apply or Discard first (`resolveDraft`, app-season.js line 69).

### c2. The Calendar tab: Dates view (app.js `renderCalendar`, line 1200)

- `CAL_TEXT` (line 1199) becomes `['Theme', 'Notes']`. **New columns:** Start and End (`type="time"`), and a holiday chip (the Holiday text, small). The lesson columns leave this view (c5).
- **The No club tick becomes a select:** **Meets / No club (planned) / Cancelled**, written through `Calendar.setState` (in `commitCal`, line 1218, a new `data-c="State"` branch), which always sets `No Club By Hand`. Event rows show no select.
  - Choosing **Cancelled** shows a short **Reason** box, with Snow as a suggestion (a datalist of Snow, Weather, Illness).
  - If the night has entries in `Season.datesInUse`, the app asks first: "This night has attendance for N children (and M volunteer absences); if it is cancelled, they stop counting. Cancel it anyway?" (`App.ask.confirm`).
  - After a change, a message (`App.done`) says what happened to the lessons, from `lessonChanges`.
- **Theme box:** gets `list="calThemes"`, a datalist from `themeList(calendar, lastYearCalendar)`.
- **Bar:** **Make calendar…**, **Copy last year's themes…** (an `App.ask.form`; it fills empty themes only), **Add event** (Type Event, Start 10:00), **Add date** (existing `btnCalAdd`, line 1241), **Roll dates forward…** (existing `btnCalShift`, line 1246), and **Club title** (the existing `config.clubTitle`, today typed on the Reports bar `#sClub`) with **Second line** (`clubTagline`). The Dates / Lessons by week sub-buttons sit above the bar (c5).
- **Protected dates:** changing the date of a row in `datesInUse` or in a locked quarter is refused at commit (not at the keystroke, so typing in the box still works, `leftovers-browser.test.js` line 539), and so is deleting it (the `data-del` handler, line 1235). The message reads: "This night has attendance (or an absence). Add a new date instead, then mark this one No club." Today both are allowed silently.
- **Roll dates forward…** is refused while any row after `carriedThrough` is in `datesInUse`, with "This calendar has attendance. Use Make calendar… instead." (j, question 4). After New season the new file has no attendance, so it still works there.
- **Quarter cell:** changing it on a row in a started or locked quarter is allowed, with a warning that lists the attendance nights that change quarter.
- **Save calendar CSV** (`btnCalCsv`, index.html line 218; handler app.js line 1094) moves to Options (section e).
- The draft behavior is unchanged: the Calendar tab is in `DRAFT_TABS` (app-season.js line 37), so every edit here is staged and Apply makes one History entry.

### c3. The New season step

`app-season.js beginNewSeason` (line 501), after `setSeason` and the color archive, opens the Make calendar panel prefilled (c1 step 1). Its message (line 506, "The calendar is still last year's: replace it on the Calendar tab…") becomes: "Now make this year's calendar, or Cancel and do it later on the Calendar tab."

### c4. The checklist and the banner

- In `app-options.js newYearSteps` (line 173), the `calendar` step's `go` text (line 178) and the `App.staleCalendarHtml` button (app.js line 980, today "Open the Calendar") both read **Make this year's calendar** and open the panel (the step's click handler at app-options.js line 207 and the `data-stalecal` handler at app.js line 981).
- The banner clears itself: `App.staleCalendar()` (app.js line 979) is computed, and `App.refresh()` redraws To do, Color teams and the checklist.

### c5. The Calendar tab: Lessons by week view (N2)

The Calendar tab gets two sub-buttons, **Dates | Lessons by week**, as a `role="tablist"` nav with the class **`calsubs`** (styled like `.rsubs`, style.css line 36). **Not `.subtabs`:** `showTab` and the Games wiring select every `.subtabs button` in the page (app.js lines 387, 421, 467, 470) and send them to the Games tab; style.css line 36 already warns about this. The sub-view is held in a module variable; `viewOf` (app.js line 379) is unchanged, so both sub-views are the same `calendar` draft view: every lesson edit is staged, and **Apply** or **Discard** commits it as one History entry and one Undo step, like the other tabs.

**The grid**
- One row per non-Event row: date, theme (read only), and one column per group that is **on**, in the order **Puggles, Cubbies, Sparks, T&T**.
- **Planned No Club rows** show "NO CLUB" across the row, greyed. With `planned: 'skip'`, the missed lesson shows struck through.
- **Cancelled rows** show "CANCELLED (Snow)", with each group's skipped lesson struck through ("~~2.2~~ skipped").
- A cell shows the lesson from `lessonsFor`:
  - A lesson from the series is grey italic.
  - A typed lesson is normal text with a small **↺ series** button, which clears the typed cell.
  - Typing into a cell stores a typed lesson, and `-` means no lesson that night.
- On a phone (max-width 760 px, the app's phone rule) the grid shows one group at a time, with a group select. There is no sideways scroll.
- With `lessons.on` false the view shows only "Lessons by week are off" and a **Turn on lessons by week** button.

**Group settings line, above the grid** (for the group chosen)
- **Weekly lessons this year** (on or off, per group).
- **Fill the series from night** [select] and **Starts at** [item].
- Two selects:
  - **Planned No club night:** "move the lesson to the next night" (default) or "skip that lesson".
  - **Cancelled night (snow day):** "skip that lesson, make it up later" (default) or "move the lesson to the next night".
- **Edit list…**: an `App.ask.form` textarea (the form supports `type: textarea`, app-ask.js line 6) with one lesson per line. It is prefilled from the current items or `numberItems`, and he can paste titles.
- **Clear typed lessons from [night] on**: removes the group's typed cells from that night on, as one staged change.
- **Link these to the calendar**: shown when a group has typed cells and no series. It calls `seriesFromCells` and shows any mismatches first.

### c6. Who else could show tonight's lesson

Candidates:
- The attendance sheet date header (too narrow).
- A class binder cover.
- A child's Attendance page.
- The To do "Tonight" card ("Tonight: Puggles 2.4 · Cubbies Bear Hug 9").

**Recommendation: none in this plan.** The Tonight card is the first follow-up and gets a BACKLOG line.

### c7. Help notes and the manual

- **info.js** (1.24.1): edit `calendar.clubday` (line 64); add `calendar.make`, `calendar.breaks`, `calendar.cancel` (planned versus cancelled, and what each does to lessons and attendance), `calendar.lessons` and `options.calcsv`.
- **Manual (index.html):**
  - Rewrite the Calendar section (`#m-t-calendar`, lines 548 to 554), dropping the stale "master schedule" mention at line 553.
  - The fresh-start step at line 322 becomes "Calendar tab › Make calendar…".
  - Rewrite the calendar example (lines 402 to 409, section e). Keep it 4 rows so `info-browser.test.js` line 117 (`App.calendar.length === 4`) still holds.
  - The Apply/Discard paragraph at line 300 already names the Calendar tab; add "including Lessons by week".
  - Run `dev/tools/sync-guide.js`.

## d. Reports

### d1. New report: Club calendar

- **Id and title:** `clubCalendar` (revision 2: not `calendar`, which is already the tab name, the CSV kind in `kindOf` and `validate.detect`, and a Check area; a distinct id keeps code, tests and bundles unambiguous), "Club calendar (for families and binders)".
- **Group:** **Binders** (`RSUBS.binders`, app.js line 780). It is also added to the default **Coaches binder** bundle in `DEFAULT_BUNDLES` (reports.js line 236).
- **Option:** `lessons`, a tick for "Show lessons", off by default. It follows the `noBook` pattern: a hidden `<label id="oLessons"><input type="checkbox" id="oLessonsChk"> Show lessons</label>` in `#dateBar` (index.html line 235) and `lessons: o.includes('lessons') && $('oLessonsChk').checked` in the render call (app.js line 884). In a bundle it prints without lessons.
- **Layout:** one portrait Letter `sheet`.
  - The title is `settings.club` (from `config.clubTitle`, app.js line 19), then `clubTagline`, centred.
  - Top right: "Updated: m/d/yy" from `Season.lastEdit(ctx.season, 'calendar')`. While a draft is unapplied, or when there is no History yet, it shows today (`ctx.today`).
  - The body is two columns of **month blocks**: an underlined "September 2026", then `9/9/2026` and the theme for each night.
  - A planned No Club night prints "NO CLUB", with the holiday name small and grey.
  - An unplanned cancel prints "CANCELLED (Snow)". A calendar reprinted after a snow day says so.
  - A bold "End of First / Second / Third Quarter" line goes after the last **held** night of Q1 to Q3. So it comes after 12/16 and before the 12/23 NO CLUB, as on his sheet.
  - Each month's events sit in a bordered box under that month: underlined "Saturday, February 13", then the title and `timeText` ("Maker's Day · 10am-5pm"), then any notes, small.
  - With **Show lessons**, a small second line under each night reads "Puggles 1.1 · Cubbies Bear Hug 1". A cancelled night shows its skipped lessons struck through.
  - The date style is `9/9/2026`, as on his sheet (decided).
- **Pagination by line count**, not CSS columns, so a month never splits and Chromium and Firefox agree.
  - Line costs: month header 1, night row 1, quarter line 1, lesson line 1 per started 48 characters (four groups can wrap in a half-page column), event box 2 + 2 per event.
  - Fill column 1 to `CAL_LINES = 46` (measured in step 20 from a real Chromium PDF, as `PAGE_ROWS = 40` was in reports-season.js line 46), then column 2. Then a "(continued)" sheet. A month longer than a column starts a column on its own and may split only then.
  - The TEST year is 58 lines (9 month headers, 36 night rows, 3 quarter lines, 10 for the October and February event boxes), so one page; with lessons on four groups it is about 95, so two pages.
- **CSS** (the style.css print section): a `.calcols` grid of two columns, 10.5 pt; `.calq` bold; `.calbox` with a 1 px border and `break-inside: avoid`. No logo.

### d2. Lessons by week, corrected (`reports.js lessons`, line 189)

- Columns: Date, Theme, then the groups that are on, in the order Puggles, Cubbies, Sparks, T&T, with values from `lessonsFor`.
- Planned No Club rows print "NO CLUB" across the row (one cell with `colspan`), as on his Excel sheet. Cancelled rows print "CANCELLED (Snow)" with the skipped lessons struck through. Events are left out. Typed cells on not-meeting nights are not printed.
- A group that is off is left out. With lessons off, the report says "Lessons by week are not turned on (Calendar › Lessons by week)."
- It stays in the **Other** group (it is not in `RSUBS`, so `subOf` puts it there; `reports-cleanup-browser.test.js` line 68 pins that).
- The render needs the config: `ctx.season` is already passed (app.js line 884; `runBundle` at line 815).

## e. CSV, tools and leftovers

**The rigid CSV** (`Calendar.load`, `Calendar.toCsv`): exactly these 15 columns, **in this order**, with this header row:

`Date,Type,Quarter,Theme,Start Time,End Time,Notes,No Club,Cancelled,No Club By Hand,Holiday,Puggles Lesson,Cubbies Lesson,Sparks Lesson,T&T Lesson`

- A header that differs in any way (a missing, extra, renamed or reordered column) is refused with the expected header shown. A UTF-8 BOM is allowed (`toCsv` writes one). There is no legacy handling.
- Row checks:
  - `Date` is a real `YYYY-MM-DD` (today's "Bad date" message stays).
  - `Type` is `Club night` or `Event`; `Quarter` is `Q1` to `Q4`.
  - `No Club` and `No Club By Hand` are `''` or `1`.
  - `Cancelled` is text, and only with `No Club` `1`.
  - Times are `HH:MM` or empty; End needs Start.
  - `Holiday` and the lesson cells are text. In a lesson cell, `-` means no lesson.
- The lesson columns carry **typed lessons only**. The series and the breaks live in the data file (`config.lessons`, `config.breaks`), and the example text says so.
- Old layouts are refused: "This calendar CSV is not in the current layout. Save calendar CSV from Options gives the layout." No backward compatibility, as decided.
- `kindOf` (app.js line 1274) and `validate.detect` (validate.js line 23) still recognise the file by `Date` and `Quarter` in the first line, so an old CSV is recognised and then refused with that message, not called unknown.

**Options card `optCalendarCsv`:** "Calendar backup (CSV, advanced)", next to the New season card (`optNewSeason`, app-options.js line 188).
- **Save calendar CSV**.
- **Load calendar CSV…**: it confirms "Replace the whole calendar?", lists any `datesInUse` night the file leaves out (those records would stop counting), and runs in `commitScope`.
- Import… and the splash still accept a calendar CSV (app.js line 1302), but go through the same confirm and the same check (j, question 5); the help no longer advertises that route.
- The card is added to the Options index.

**Other leftovers**
- **make-database.js** (`dev/tools`, line 22): `--calendar` is now strict, and its usage text (line 5) says so.
- **Real-file tests** (`browser.test.js`, `reports-season.test.js`, `test/test.js`) read the owner's old 11-column calendar CSV. They get a **test-only** helper, `test/lib/legacy-calendar.js`, that reads an old layout through `Csv.toRecords` and `Calendar.tidy`. The app itself keeps no legacy reader.
- **validate.js** (1.14.0):
  - New row checks (data file, section at line 318): times; End without Start; `Holiday` text; `Cancelled` without `No Club` is an error; `No Club By Hand` is `''` or `1`; lesson cells text. A row missing any of the new keys is fine (old files).
  - New config checks (next to line 82): `breaks` (a list; each a text name, real dates, from ≤ to), `easterFlag` (boolean), `clubTagline` (text), `lastYearCalendar` (a list of rows with real dates), and `lessons`:
    - Boolean `on`; only the four known groups, each with a boolean `on`.
    - A real-date or empty `from`; `planned` and `unplanned` each `move` or `skip`; `items` a list of at most 300 texts.
    - A warning when a group that is on has neither a series nor any typed lesson.
  - **The hardcoded Wednesday at line 439 goes.** A CSV has no club day, so the check finds the weekday most club nights fall on (ties: the first club night's weekday), says it in the info line, and warns on club nights on another day.
- **Try it out (`Season.freshenFake`, season.js line 176):** `shiftDates` moves every ISO date in the file by whole weeks, including `config.breaks`, `lessons.from` and `lastYearCalendar`. Whole weeks keep weekdays but not month-days, so after the shift: replace `config.breaks` with `recommendBreaks` for the shifted first and last nights, then recompute `No Club` and `Holiday` with `holidayOf` for rows that are not `No Club By Hand`, not cancelled, and not in `datesInUse`. Rows with attendance, and hand-set rows, keep what they had. `lessons.from` needs nothing (it is a night, and nights keep their weekday).
- **TEST fixture**, re-entered as in b6 by a new script `dev/tools/demo-calendar.js` (`add(text)`, refuses a file that is not `fake: true`, like `demo-plan.js`; `make-test-data.js` line 317 chains it after `demo-plan.js` so a rebuild gives the same file):
  - Lessons on, with all four groups on.
  - A Puggles series of 32 items (4 × 8, with the 32 titles now in `T&T Lesson`) from the first night, with the Sparks and T&T typed cells cleared. Sparks and T&T stay on, with no series, which exercises the "on but empty" warning.
  - Cubbies stays as typed cells: Bear Hug + Special Days.
  - `breaks` = the recommended two.
  - One invented unplanned cancel (`Snow`) on 2027-01-13, a night with no attendance (TEST attendance is 9/9 to 10/21 only).
  - Event times moved from Notes into `Start Time` and `End Time` (10/3 10:00–12:00, 2/13 10:00–17:00, 2/20 09:00–12:00) and the time text removed from Notes.
  - Then run `check-docs-for-names.js`.

## f. Tests

All node tests run from `dev/app` as `node test/<name>.test.js` and use the local `test(name, fn)` pattern (as in `club-night-rule.test.js`). Browser tests need the Playwright shim described in the memory note `awana-app-test-setup.md` (`NODE_PATH` to a `node_modules` whose `playwright` re-exports a playwright-core matching cached Chromium 1248). `TEST` below means the TEST data file opened through `Season.fromJson`. Dates without a year are 2026 for Sep to Dec and 2027 for Jan to May.

### f1. Node: `calendar-dates.test.js` (calendar.js only)

| # | Case | Input | Expected |
|---|---|---|---|
| D1 | `COLS` is the 15-key layout | `Calendar.COLS` | exactly the b1 list, in order |
| D2 | `blank` has 15 keys | `blank()` | every key `''` except `Type: 'Club night'`, `Quarter: 'Q1'` |
| D3 | `tidy` fills an old row | 11-key row `{Date:'2026-09-09', …, 'Puggles #':'', 'Puggles Title':''}` | 15 keys in COLS order; no `Puggles #`/`Puggles Title`; new keys `''` |
| D4 | `tidy` joins Puggles | `'Puggles #':'1.1', 'Puggles Title':'God Made the Light'`, `Puggles Lesson` absent | `Puggles Lesson: '1.1 God Made the Light'` |
| D5 | `tidy` keeps a set Puggles Lesson | `Puggles Lesson:'2.1'`, `'Puggles #':'9'` | `Puggles Lesson:'2.1'`; Notes ends `Puggles: 9` |
| D6 | `tidy` leaves other lessons where they are | TEST 9/9 row | `Sparks Lesson:'1.1'`, `T&T Lesson:'God Made the Light'`, `Cubbies Lesson:'Booklet'` |
| D7 | `tidy` is idempotent and returns a current row untouched | a tidied row | same object (`===`), `JSON.stringify` equal |
| D8 | `tidy` stringifies values and keeps unknown keys | `{Date:'2026-09-09', 'No Club':1, Extra:'x'}` | `'No Club':'1'`; `Extra:'x'` after the 15 |
| D9 | `stateOf` | event row; `{No Club:'1', Cancelled:'Snow'}`; `{No Club:'1'}`; `{}` | `event`, `cancelled`, `planned`, `meets` |
| D10 | `setState` writes the three fields | each of meets / planned / cancelled with reason `' Snow '` | `''/''/'1'`, `'1'/''/'1'`, `'1'/'Snow'/'1'` (No Club / Cancelled / By Hand) |
| D11 | `setState` cancelled with no reason | `setState(r, 'cancelled', '')` | `Cancelled: 'Cancelled'` |
| D12 | `setState` refuses | `'event'`, `'gone'` | throws |
| D13 | both kinds are not club nights | rows from D10 | `isNight`: meets true, planned false, cancelled false |
| D14 | `easter` 2024 to 2035 | years | 03-31, 04-20, 04-05, 03-28, 04-16, 04-01, 04-21, 04-13, 03-28, 04-17, 04-09, 03-25 |
| D15 | `thanksgiving` 2026 to 2030 | years | 11-26, 11-25, 11-23, 11-22, 11-28 |
| D16 | `recommendBreaks` 2026-27 | `'2026-09-09','2027-05-12'` | `[{Thanksgiving week, 2026-11-22, 2026-11-28}, {Christmas break, 2026-12-21, 2027-01-01}]`; Thanksgiving week from is a Sunday and to a Saturday |
| D17 | `recommendBreaks` 2027-28 and 2028-29 | `'2027-09-08','2028-05-10'`; `'2028-09-06','2029-05-09'` | 11-21..11-27 + 12-21..2028-01-01; 11-19..11-25 + 12-21..2029-01-01 |
| D18 | `recommendBreaks` outside the range | `'2027-01-06','2027-05-12'` | `[]` |
| D19 | `holidayOf` Thanksgiving for three club days | 11-22 (Sun), 11-25 (Wed), 11-26 (Thu) with D16 breaks | each `{ name: 'Thanksgiving week', noClub: true }` |
| D20 | `holidayOf` Christmas edges | 12-20, 12-21, 2027-01-01, 2027-01-02 | null, in, in, null |
| D21 | `holidayOf` edited and removed breaks | Christmas edited to 12-18..2027-01-03: 12-18 and 01-03; breaks `[]`: 11-25 | in, in; null |
| D22 | `holidayOf` Easter | 2027-03-22, 03-24, 03-28 with flag on; 03-24 with flag off; 03-21 | `{Easter week, noClub:false}` ×3; null; null |
| D23 | `holidayOf` no federal holiday | 11-11 | null |
| D24 | `generate` 2026-27 | day 3, 9/9 to 5/12, D16 breaks, flag on | 36 rows; No Club on 11/25, 12/23, 12/30 only; Holiday `Thanksgiving week`, `Christmas break` ×2, `Easter week` on 3/24 with No Club `''`; By Hand `''` everywhere |
| D25 | `generate` 2027-28 | day 3, 9/8 to 5/10 | 36 rows; No Club 11/24, 12/22, 12/29; Easter tag 4/12 |
| D26 | `generate` 2028-29 | day 3, 9/6 to 5/9 | 36 rows; No Club 11/22, 12/27; 12/20 and 1/3 meet; Easter tag 3/28 |
| D27 | `generate` with a spring break | D24 plus `{Spring break, 2027-03-29, 2027-04-02}` | also No Club 3/31, Holiday `Spring break` |
| D28 | `generate` rolls forward | day 3, first 9/8 (Tue) | first row 9/9 |
| D29 | `generate` other weekdays | day 0, 9/6 to 5/9; day 4, 9/10 to 5/13 | No Club 11/22, 12/27; No Club 11/26, 12/24, 12/31 |
| D30 | `suggestQuarters` on TEST | TEST rows | `{ Q2: '2026-11-04', Q3: '2027-01-06', Q4: '2027-03-03' }` |
| D31 | `suggestQuarters` on generated years | D25 rows; D26 rows | 11/3, 1/5, 3/1; 11/1, 1/3, 3/7 |
| D32 | `suggestQuarters` with no breaks | 36 Wednesdays from 9/9, none No Club | 11/4, 1/6, 3/3 |
| D33 | `suggestQuarters` short years | 8 Wednesdays from 9/9; 4 from 9/9; 3 from 9/9 | 9/23, 10/7, 10/14; 9/16, 9/23, 9/30; 9/16, 9/23, `''` |
| D34 | `suggestQuarters` ignores events | TEST rows plus an Event on 11/3 | same as D30 |
| D35 | `applyQuarters` | TEST rows, starts 10/28, 1/6, 3/3 | 12/23 and 12/30 Q3; the 10/3 event Q1; 2/13 and 2/20 events Q3; 5/12 Q4; the rows equal TEST's own Quarter column |
| D36 | `applyQuarters` trailing rows | rows ending with a No Club row after the last held night | that row takes the last held night's quarter |
| D37 | `quarterStarts` | TEST rows | `{ Q1: '2026-09-09', Q2: '2026-10-28', Q3: '2027-01-06', Q4: '2027-03-03' }` |
| D38 | `timeText` | (10:00,17:00), (09:00,12:00), (18:30,''), (12:00,''), (00:00,''), ('',17:00) | `10am-5pm`, `9am-12pm`, `6:30pm`, `12pm`, `12am`, `''` |
| D39 | `themeList` | rows with themes Team Color ×3, PJ's Night ×1, Hearts Night ×1, `''`; last year with Hearts Night ×1 | `['Team Color', 'Hearts Night', "PJ's Night"]` |
| D40 | `settings` defaults | `settings({}, [])`; `settings({}, TEST rows)` | breaks `[]`, easterFlag true, lessons.on false; lessons.on true, four groups on, planned move, unplanned skip |
| D41 | `settings` does not mutate | a config object | unchanged after the call |
| D42 | `nightBlocks` | TEST rows | 36 blocks; an event attaches to the block of the night before it, so 9/30 carries 10/3, 2/10 carries 2/13 and 2/17 carries 2/20; each block's state matches `stateOf` |
| D43 | `nightBlocks` by quarter | TEST, `{ quarter: 'Q2' }` | 8 blocks, 10/28 to 12/16 (11/25 included as planned) |

### f2. Node: `calendar-csv.test.js`

| # | Case | Input | Expected |
|---|---|---|---|
| C1 | round trip | `toCsv(TEST rows)` → `load` → `toCsv` | identical text; header line is the e header (after the BOM) |
| C2 | empty template | `toCsv([])` | header only; `load` of it gives `[]` |
| C3 | reordered header | e header with Theme and Quarter swapped | throws, message contains the expected header |
| C4 | missing, extra, renamed column | 14 columns; 16 columns; `Puggles #` for `Puggles Lesson` | each throws "not in the current layout" |
| C5 | old 11-column layout | today's example header | throws "not in the current layout" |
| C6 | bad date | `9/9/2026` | throws /Bad date/ |
| C7 | bad Type, Quarter, No Club, By Hand | `Party`, `Q9`, `2`, `x` | each throws, naming the row's date |
| C8 | Cancelled without No Club | `Cancelled: Snow`, `No Club: ''` | throws |
| C9 | times | `25:00`; End without Start | throws |
| C10 | `-` lesson | `Puggles Lesson: -` | loads as `-` |
| C11 | rows sorted | rows out of order | sorted by date |

### f3. Node: `calendar-lessons.test.js`

Fixture: TEST rows (after `fromJson`), Sparks and T&T cells cleared; G = `{ on: true, from: '2026-09-09', items: numberItems(4, 8), planned: 'move', unplanned: 'skip' }` for Puggles.

| # | Case | Input | Expected |
|---|---|---|---|
| L1 | `numberItems` | (4, 8); (4, 8, '2.1'); (2, 3) | `1.1 … 4.8` (32); `2.1 … 4.8` (24); `1.1,1.2,1.3,2.1,2.2,2.3` |
| L2 | the TEST year | G | 11/4 2.1, 11/11 2.2, 11/18 2.3, 11/25 `off`, 12/2 2.4, 5/5 4.8, 5/12 `none` `''` |
| L3 | events never use an item | G, plus an Event on 11/12 | same as L2; no entry for 11/12 |
| L4 | a typed cell uses no item | Puggles cell `Special Day` on 12/9 | 12/9 `hand` `Special Day`; 12/16 2.5; 5/12 4.8 |
| L5 | `-` uses no item | Puggles cell `-` on 12/9 | 12/9 `hand` `''`; 12/16 2.5 |
| L6 | default planned move | 11/11 set `planned` | 11/11 `off`; 11/18 2.2; 12/2 2.3; 5/5 4.7; 5/12 4.8 |
| L7 | default unplanned skip | 11/11 set `cancelled`, `Snow` | 11/11 `missed` 2.2 reason `Snow`; 11/18 2.3; 12/2 2.4; 5/5 4.8 |
| L8 | planned skip | G with `planned: 'skip'`, TEST rows | 11/25 `missed` 2.4 with reason `No club` (TEST rows have Holiday `''`; a generated row would give `Thanksgiving week`); 12/2 2.5; 5/5 and 5/12 `none` |
| L9 | unplanned move | G with `unplanned: 'move'`, 11/11 cancelled | 11/11 `off`; 11/18 2.2; 12/2 2.3 |
| L10 | both swapped | `planned: 'skip'`, `unplanned: 'move'`, 11/11 cancelled | 11/11 `off`; 11/18 2.2; 11/25 `missed` 2.3; 12/2 2.4 |
| L11 | typed cells always win | L4 plus 11/11 cancelled | 12/9 still `hand` `Special Day`; no typed cell changed in the rows |
| L12 | a typed cell on a cancelled night | Puggles `2.2 review` on 11/11, cancelled, skip | 11/11 `hand` `2.2 review`, flagged off-night; 11/18 2.2 (no item used on 11/11) |
| L13 | before `from` | G `from: '2026-10-07'` | 9/9 to 9/30 `none`; 10/7 1.1 |
| L14 | `from` empty | G `from: ''` | same as L2 |
| L15 | a short series | G items `numberItems(1, 8)` | 10/28 1.8; 11/4 onward `none` |
| L16 | all four groups at once | each group with its own G | each group's map independent; Cubbies typed cells unchanged |
| L17 | `seriesFromCells` round trip | Puggles cells typed 1.1 … 4.8 on held nights from 9/9 (TEST Sparks column) | `{ from: '2026-09-09', items: 32 items, mismatches: [] }`; `lessonsFor` with that series and the cells cleared gives the same text on every held night |
| L18 | `seriesFromCells` reports mismatches | L17 with the 11/11 cell empty; L17 with 11/11 cancelled (skip) | `mismatches` includes 11/11 in both |
| L19 | `seriesFromCells` keeps `-` cells | a `-` on 12/9 | not an item; reported as staying typed |
| L20 | `lessonChanges` planned | before TEST, after 11/11 planned | `[{ group: 'Puggles', kind: 'moved', date: '2026-11-11' }]` |
| L21 | `lessonChanges` cancelled | after 11/11 cancelled | `[{ group: 'Puggles', kind: 'skipped', date: '2026-11-11', text: '2.2' }]` |
| L22 | `lessonChanges` back to meets | from L7 back to meets | `kind: 'back'` |
| L23 | group off | Puggles G `on: false` | `lessonChanges` returns nothing for Puggles; the grid and report leave it out (f6, f7) |

### f4. Node: `calendar-merge.test.js`

Fixture: TEST rows; `protect = { dates: Season.datesInUse(TEST), lockedQuarters: [], carriedThrough: '', first: '2026-09-09', starts: {Q2:'2026-10-28', Q3:'2027-01-06', Q4:'2027-03-03'} }`; `gen` = D24.

| # | Case | Input | Expected |
|---|---|---|---|
| M1 | an unedited row takes the new holiday | TEST 11/25 (No Club, no theme) vs gen | Holiday `Thanksgiving week`; not listed as kept |
| M2 | an edited theme is kept | TEST 9/16 theme `Crazy/Mismatched Socks` | theme kept; not listed (only rows that are not generated are listed as `you edited it`) |
| M3 | a typed lesson is kept | TEST 9/9 `Sparks Lesson: 1.1` | kept |
| M4 | moved break, untouched nights follow | Christmas moved to 12/14..2027-01-01 | 12/16 becomes No Club `Christmas break`; 12/23, 12/30 stay |
| M5 | moved break, hand nights stay | 11/25 set by hand to meets, then M4's breaks plus Thanksgiving removed | 11/25 still meets with By Hand `1` |
| M6 | moved break, a cancelled night stays | 1/13 cancelled `Snow`, then breaks changed | 1/13 still cancelled `Snow` |
| M7 | protected dates are never removed | last night moved to 4/28 | 5/5 and 5/12 removed (no attendance); 9/9 to 10/21 present |
| M8 | a protected date not generated is kept | TEST with `datesInUse` 9/9, gen starting 9/16 | 9/9 kept, reason `attendance` |
| M9 | absences and team moves protect | a fake absence on 5/12 and a team move from 5/5, last night 4/28 | 5/5 kept `team move`, 5/12 kept `absence` |
| M10 | locked quarter | `lockedQuarters: ['Q2']`, starts Q2 moved to 11/4 | 10/28 kept; `quarterChanged` lists 10/28 Q2 → Q1 `locked quarter` |
| M11 | quarter change on attendance | starts Q2 moved to 10/21 | `quarterChanged` lists 10/21 Q1 → Q2 `attendance` |
| M12 | events are kept | gen with no events | 10/3, 2/13, 2/20 kept |
| M13 | last year's rows | rows ≤ `carriedThrough` (TEST shifted back 52 weeks, `carriedThrough` = its last night) | all in `lastYear`; none in `rows` |
| M14 | all rows before `first` with no `carriedThrough` | TEST and first 2027-09-08 | all in `lastYear` |
| M15 | idempotent | `mergeInto(result.rows, gen, protect)` | same rows; nothing removed |
| M16 | an edited row not generated | TEST row moved to Thursday 9/10 with a theme | kept, listed `you edited it` |
| M17 | `copyThemes` by order | gen (36 nights, 33 held) and TEST (33 held) as last year | 9/9 gets `Opening Night (Parents welcome)`; 5/12 gets `Awards Ceremony`; existing themes untouched |
| M18 | `copyThemes` with fewer last-year nights | 33 held this year, 10 last year | first 9 filled in order, the last night gets last year's last, the rest empty |
| M19 | `copyThemes` by month | gen and TEST | the 2nd held night of November gets TEST's 2nd November theme (`SOUPer Clubber Night (Food Pantry)`) |
| M20 | `copyThemes` never overwrites | a row with a theme | unchanged; `filled` does not count it |
| M21 | `copyThemes` with events | TEST events as last year, this year 2027-28 | events on Sat 2027-10-02, 2028-02-12, 2028-02-19; all three in `flagged` |

### f5. Node: `calendar-season.test.js` (season.js and validate.js)

| # | Case | Input | Expected |
|---|---|---|---|
| S1 | upgrade: rows get 15 keys | TEST JSON text → `fromJson` | every row has the 15 keys in COLS order; no `Puggles #` |
| S2 | upgrade: old No Club nights are planned | S1 | 11/25, 12/23, 12/30: `stateOf` `planned`, By Hand `''` |
| S3 | upgrade: one File upgrade entry | TEST (it has History) | last history entry `File upgrade`; it holds one change at path `['calendar']`; `replayDiff` is `[]` |
| S4 | upgrade: a second open changes nothing | `fromJson(toJson(S1))` | no new history entry; calendar `JSON.stringify` equal |
| S5 | upgrade: no config writes | S1 | `config.lessons`, `config.breaks`, `config.easterFlag` undefined; `Calendar.settings` gives lessons on (TEST has lesson cells) |
| S6 | upgrade: a blank-made file gets no File upgrade | `S.blank` + one recorded edit, round trip | history length unchanged |
| S7 | `datesInUse` | TEST; plus an absence on 11/4 and a team move from 11/11 | 9/9 … 10/21 `attendance`; 11/4 `absence`; 11/11 `team move`; 11/18 absent |
| S8 | `lastEdit` | history entries at t1 (attendance), t2 (calendar), t3 (config.lessons), t4 (config.books) | `t3` |
| S9 | `lastEdit` with none | `S.blank` | `''` |
| S10 | `newSeason` writes `lastYearCalendar` | TEST, `newSeason(s, '2027-28')` | 39 rows with the b2 fields only; `calendar` still copied (39 rows) |
| S11 | `newSeason` resets lessons | TEST with `config.lessons` Puggles `{ on, from, items, planned:'skip' }` | `from: ''`, `items: []`, `on` and `planned:'skip'` kept |
| S12 | `newSeason` without lessons | TEST | `config.lessons` still undefined |
| S13 | `newSeason` clears breaks | TEST with `config.breaks` | `breaks` undefined |
| S14 | validate: new row checks | goodSeason with a row `Cancelled: Snow`, `No Club: ''`; `Start Time: 25:00`; End without Start; End before Start; `No Club By Hand: 2` | error, error, error, warn, error |
| S15 | validate: an 11-key row is still fine | the current goodSeason row (validate.test.js line 21) | no error, no warning |
| S16 | validate: config mutations | each bad value: `breaks: 'x'`; a break with `from > to`; `easterFlag: 'yes'`; `clubTagline: 3`; `lastYearCalendar: [{Date:'x'}]`; `lessons.groups.Kids`; `lessons.groups.Puggles.planned: 'later'`; 301 items | an error for each |
| S17 | validate: on but empty | lessons on, Sparks on, no items, no Sparks cells | warning naming Sparks |
| S18 | validate: CSV weekday | CSV with two Wednesdays and one Thursday club night | info names Wednesday; warn `1 club night is not on a Wednesday` |
| S19 | validate: CSV on Thursdays | CSV with one Thursday club night | no weekday warning (validate.test.js line 123 changes) |
| S20 | the config-key rule | `validate.test.js` lines 266 to 273, unchanged | passes once the five keys are in `CHECKED_CONFIG` |
| S21 | `freshenFake` recomputes breaks | TEST with `config.breaks` = D16, `freshenFake(text, '2027-11-17')` | breaks = `recommendBreaks` of the shifted range (Christmas from 12-21); No Club on the shifted Thanksgiving Wednesday and both Christmas Wednesdays; rows with attendance unchanged |
| S22 | `freshenFake` keeps hand rows | S21 with 11/25 set by hand to meets | still meets after the shift |

### f6. Node: `calendar-report.test.js` (reports.js render, no browser)

| # | Case | Input | Expected |
|---|---|---|---|
| R1 | Club calendar contents | TEST, `config.clubTitle: 'TEST Club'`, `clubTagline: 'Wednesday nights'` | one `sheet`; both titles; `September 2026` … `May 2027`; `9/9/2026 Opening Night (Parents welcome)`; three `NO CLUB`; `End of Second Quarter` after `12/16/2026` and before `12/23/2026` |
| R2 | events box | TEST after step 23 | February box: `Saturday, February 13`, `AGP Maker Day · 10am-5pm`; `Saturday, February 20`, `Grand Prix · 9am-12pm` |
| R3 | cancelled | 1/13 cancelled `Snow` | `CANCELLED (Snow)` |
| R4 | Updated date | history last calendar change 2026-11-12; no draft | `Updated: 11/12/26`; with no history: `ctx.today` |
| R5 | Show lessons | R1 with Puggles series, `opts.lessons` | under 9/9: `Puggles 1.1 · Cubbies Booklet`; a cancelled night's lesson in `<s>` |
| R6 | pagination | TEST without lessons; with lessons; a synthetic year of 2 × CAL_LINES + 1 lines | 1 sheet; 2 sheets; 2 sheets, the second titled `(continued)`, no month split across columns |
| R7 | Lessons by week columns | TEST after step 23 (all four on) | headers `Date, Theme, Puggles, Cubbies, Sparks, T&T`; 11/25 row one `NO CLUB` cell spanning the lesson columns |
| R8 | Lessons by week, a group off | Sparks off | no Sparks column |
| R9 | Lessons by week, lessons off | `lessons.on: false` | `Lessons by week are not turned on` |
| R10 | Lessons by week, cancelled | 11/11 cancelled `Snow` | `CANCELLED (Snow)`; `<s>2.2</s>` |
| R11 | Lessons by week leaves out events and off-night typed cells | L12 fixture | no 10/3 row; 11/11 shows no `2.2 review` |
| R12 | the Coaches binder bundle | `DEFAULT_BUNDLES()` | Coaches binder items end with `clubCalendar` |

### f7. Playwright

All use the TEST club and the HTTP-server pattern from `reports-cleanup-browser.test.js` (line 9). Each test also collects `pageerror` and asserts none.

**`calendar-maker-browser.test.js`**
1. **Blank file, 2026-27.** Make calendar with Wednesday, 9/9, 5/12: the breaks list shows Thanksgiving week 11/22–11/28 and Christmas break 12/21–1/1; the Nights list has 11/25, 12/23, 12/30 ticked and 3/24 unticked "flag only"; the summary shows 36 dates. Widening Christmas to start 12/16 adds 12/16 ticked. **Make it** gives exactly one new History entry labelled `Make calendar`; Undo empties the calendar and `config.breaks`; Redo brings both back.
2. **Wrong weekday.** First night 9/8: the message "That is a Tuesday; club meets on Wednesdays" shows and Make it is disabled.
3. **Remake on TEST.** Last night moved to 4/28: the summary keeps 9/9 to 10/21 ("has attendance"), removes 5/5 and 5/12, and Make it applies. Moving the Q2 start to 10/21 lists "Attendance on 10/21 moves from Q1 to Q2" and Make it stays disabled until the tick.
4. **Hand choice survives.** Untick Thanksgiving, Make it: 11/25 is in the Attendance night list. Make calendar again with Christmas widened: 11/25 still meets.
5. **Separate History entry.** Apply a theme edit on the Dates view, then Make calendar within a minute: two entries (`Calendar: …`, `Make calendar`), and one Undo removes only the Make calendar change.
6. **Open draft.** Type a theme (not applied), then Make it: the Unapplied changes dialog appears; Apply and continue gives both entries.
7. **Easter.** 3/24 shows the Easter week chip and stays in the Attendance night list.
8. **Themes.** After New season (see 10), Copy last year's themes By order fills only empty themes; 5/12 gets `Awards Ceremony`.
9. **Events and times.** Add event on 2/13 with 10:00–17:00; the printed calendar shows `10am-5pm`.
10. **New season.** New season `2027-28` opens the panel with 9/8/2027 and 5/10/2027. Make it: the To do banner is gone and the checklist's calendar step is ticked. In a second run, Cancel leaves the banner and the button reads `Make this year's calendar`.
11. **At 390 × 844:** the panel, the Nights list and the Quarters list have no sideways page scroll (`document.documentElement.scrollWidth <= 390`); every button and tick is at least 44 px tall or wide (the existing touch-target helper in `a11y-browser.test.js`).

**`calendar-dates-browser.test.js`**
1. **Cancel a night.** On the Dates view set 1/13 to Cancelled, reason Snow, Apply: 1/13 leaves the Attendance and To do night lists; the printed Club calendar shows `CANCELLED (Snow)`.
2. **Cancel a night with attendance.** Set 10/21 to Cancelled: the confirm names the attendance count; Cancel leaves it Meets.
3. **Protected dates.** Changing 9/16's date is refused with the message and the box goes back; Delete on 9/16 is refused; Delete on 5/12 works (staged, Discard brings it back).
4. **Roll dates forward** on TEST is refused with "Use Make calendar… instead".
5. **Theme suggestions.** The theme box has `list="calThemes"` and the datalist holds `Team Color` first.
6. **Lesson message.** With a Puggles series, setting 11/11 to No club (planned) shows "Puggles lessons after 11/11 moved one night later".
7. **Options CSV.** Save calendar CSV on the Options card, then Load calendar CSV… with that file: the confirm appears, the calendar is the same (`JSON.stringify` equal). Loading the old 11-column example is refused with "not in the current layout". Import… with the same old file is refused the same way.
8. **Sub-buttons do not touch Games.** Clicking Lessons by week does not switch to the Games tab and the Games sub-buttons keep their state.

**`lessons-week-browser.test.js`**
1. **Turn on.** Turning lessons on shows four columns in order: Puggles, Cubbies, Sparks, T&T. Switching Sparks off removes its column from the grid and from the Lessons by week report.
2. **Planned versus cancelled.** Fill a Puggles 4 × 8 series from 9/9. Marking 11/11 No club (planned) puts 2.2 on 11/18. Marking it Cancelled instead shows 2.2 struck through on 11/11 and 2.3 on 11/18. One Apply makes one Undo step.
3. **Typed lesson.** Type `Special Day` for Puggles on 12/9: it survives a series refill and uses no item (12/16 shows 2.5).
4. **Re-entering a year (b6).** On TEST: fill Puggles from 9/9, then Clear typed lessons from 9/9 on for Sparks and T&T: the grid shows 1.1 … 4.8 in Puggles and nothing typed in Sparks or T&T.
5. **↺ series and Discard.** ↺ series clears a typed cell; Discard drops a staged edit.
6. **Link.** Sparks with the TEST typed 1.1 … 4.8: Link these to the calendar makes a Sparks series with no mismatches and clears the cells.
7. **Make calendar step 5** numbers the lessons with all four groups ticked by default.
8. **At 390 px:** one group at a time with a group select; no sideways page scroll.

**`calendar-print-browser.test.js`** (the `print-pdf-n1-browser.test.js` pattern: `beforeprint`, print media, `page.pdf({ preferCSSPageSize: true })`, line 39)
1. TEST Club calendar: 1 page, 612 × 792; the PDF text has the title and tagline, `End of Second Quarter` between `12/16/2026` and `12/23/2026`, three `NO CLUB`, and the February events box.
2. With Show lessons: 2 pages, no month split (each month header's page holds all its nights); text ends above 756 pt (`PAGE_BOTTOM`, line 40).
3. A synthetic year longer than one sheet prints a second page titled `(continued)`.
4. The Coaches binder bundle includes the calendar page and stays portrait.
5. Lessons by week PDF: the columns of f6 R7, `NO CLUB` and `CANCELLED (Snow)` rows with struck-through lessons.
6. Firefox is not available in this setup; the line-count pagination makes it independent of the browser's column breaking. One paper print by the owner is the last check (step 26).

### f8. Existing tests that must change

| Test | Where | Why and what |
|---|---|---|
| `validate.test.js` | line 21 (goodSeason row); lines 120 to 123; new cases | goodSeason uses the 15 keys (keep an 11-key row case, S15); the CSV lines use the e header; line 121's 3-column CSVs fail the strict header; line 123's "not on a Wednesday" becomes S18/S19; add S14, S16, S17 |
| `doc-examples.test.js` | lines 29 to 32 | the new example rows; `Cal.load('Date,Theme…')` now throws "not in the current layout" (not `/Quarter/`) |
| `info-browser.test.js` | lines 105 to 117 | the downloaded example still starts `Date,Type,Quarter` and imports as 4 rows if the example keeps 4 rows; otherwise update the count |
| `review-leftovers.test.js` | lines 118 to 120 | round trip and empty template: expected to pass unchanged (TEST is tidied by `fromJson`); verify |
| `fresh-start-browser.test.js` | lines 46 to 48 | the 4-column CSV import is refused: rewrite as Make calendar on a blank file, plus a strict CSV loaded from Options |
| `ux20-roster-teams-calendar-browser.test.js` | lines 36 to 40; 42 to 47 | Delete targets an unprotected row (5/12), not row 0 (9/9 has attendance); Move every date forward is refused on TEST: open a file without attendance, or assert the refusal |
| `leftovers-browser.test.js` | line 428; lines 539 to 543 | `#btnCalCsv` moves to the Options card (the file name test stays); the date-typing test keeps passing because refusal is at commit (verify) |
| `season.test.js` | lines 509 to 516 and the New season tests | the round-trip fixture `cal` with 15 keys; New season expectations S10 to S13 |
| `replay-report.test.js` | line 14 | its 11-key row plus a History entry would now get a File upgrade entry ("History entries: 1" becomes 2): give the row the 15 keys |
| `replay-causes.test.js`, `legacy-spellings.test.js`, `teams-gaps.test.js`, `import-browser.test.js` | their File upgrade assertions | check each fixture: an 11-key calendar row with History adds a calendar change to (or creates) the File upgrade entry; give the rows 15 keys where the test is about something else |
| `bundles.test.js` | line 12 | the Coaches binder now ends with `clubCalendar` |
| `reports-cleanup-browser.test.js` | line 68 | add `where('clubCalendar') === 'binders'`; `lessons` stays `other` |
| `reports-new-browser.test.js`, `reports-subtabs-browser.test.js` | report counts per group | Binders gains one report |
| `options-index-browser.test.js` | the card list | the new `optCalendarCsv` card |
| `wording.test.js` | label lists | the new labels use No club, Cancelled, class |
| `data-format-doc.test.js` | lines 23, 40 | config table rows for `clubTagline`, `breaks`, `easterFlag`, `lastYearCalendar`, `lessons` |
| `release-consistency.test.js` | line 12 | CHANGELOG top entry equals the new `app-version` |
| `a11y-browser.test.js` | page sweep | the panel and the lessons grid have labels (app.js line 361 labels table-cell inputs automatically) |
| Real files: `browser.test.js` (lines 2, 227 to 235), `reports-season.test.js` (line 10), `test/test.js` (lines 97 to 118, run by hand, not by `run-tests.sh`) | old CSV argument | read it with `test/lib/legacy-calendar.js`; `test.js` line 118 renders the new Lessons report |
| Guards, no change expected | `nights.test.js`, `club-night-rule.test.js`, `held-nights-agree.test.js`, `attendance-quarter-night.test.js`, `todo-tonight-browser.test.js`, `print-pdf-n1-browser.test.js` | must stay green: rows without the new keys and the `isNight` rule are unchanged |

### f9. Phone, print and manual checks (step 26)

- 390 × 844 and 1366 × 768: the Calendar tab (both sub-views), the panel, Options card, the Reports bar with Show lessons. No sideways page scroll at 390 (the Dates table may scroll inside `#calWrap.scroll`, as today).
- One printed Club calendar on paper by the owner, compared with his Excel sheet.
- `check-docs-for-names.js` over every changed file (memory: run before every push).

## g. Versions and docs

- **Versions:** calendar.js 1.2.0 → 2.0.0; minor bumps to season.js, validate.js (1.14.0), reports.js (1.18.0), app.js (1.71.0), app-season.js (1.95.1), app-options.js (1.23.0), info.js (1.24.1), app-ask.js only if touched. The app version follows the CHANGELOG rule ("stay in the 1.51.x series and bump only the third number"): the next free 1.51.x after 1.51.15e (1.51.16 if nothing ships first). The first draft's 1.52.0 breaks that rule (j, question 1).
- **CHANGELOG** (a data-format change gets its own mention and its upgrade path) and the **README** test list.
- **DATA-FORMAT.md:**
  - 5.22 (line 266): the 15 keys (the CSV order), times, planned versus cancelled, No Club By Hand, Holiday, typed lessons versus series.
  - The config table gets the new keys: `clubTagline`, `breaks`, `easterFlag`, `lastYearCalendar`, `lessons`, with their read-as defaults.
  - 4.2 (line 119): still version 6, with the reason.
  - Line 393 ("nothing is generated, so a repeating lesson is repeated text") changes to describe the series.
  - The New season text (line 501) and the validator lists (lines 511 and 517).
- The manual, the info notes and `sync-guide.js`.
- **BACKLOG:**
  - Tick N3 and N2 (lines 76 and 77).
  - A note under N1 (line 75) about `nightBlocks`.
  - A new line for the Tonight lesson card (c6).

## h. Build sequence

Each step is small enough to finish and test on its own. "Red" is the test written first and seen failing; "green" is the code that makes it pass. Run only the named tests in each step; the full sweep is step 26. Steps 1 to 12 are node-only and touch no screen.

0. **Baseline.** `sh dev/tools/run-tests.sh --node-only` and the browser run with the shim; record the known failures (memory: the three `reports-season` achievement-record cases) so they are not blamed on this work.
1. **COLS, tidy, blank** (calendar.js). Red: D1 to D8. Green: new `COLS`, `tidy`, `blank`. `club-night-rule.test.js` and `nights.test.js` stay green.
2. **Night state** (calendar.js). Red: D9 to D13. Green: `stateOf`, `setState`.
3. **Holiday math** (calendar.js). Red: D14 to D23. Green: `easter`, `thanksgiving`, `recommendBreaks`, `holidayOf`, `XMAS_FROM`, `XMAS_TO`.
4. **Generate** (calendar.js). Red: D24 to D29. Green: `generate`.
5. **Quarters** (calendar.js). Red: D30 to D37. Green: `suggestQuarters`, `applyQuarters`, `quarterStarts`.
6. **Small helpers** (calendar.js). Red: D38 to D43. Green: `timeText`, `themeList`, `settings`, `nightBlocks`.
7. **Strict CSV** (calendar.js `load`, `toCsv`). Red: C1 to C11. Green: the strict loader. Then fix, in the same step, the node tests it breaks: `doc-examples.test.js` lines 29 to 32 (with the new example text in index.html lines 402 to 409), `validate.test.js` lines 120 to 123, `review-leftovers.test.js` lines 118 to 120. Add `test/lib/legacy-calendar.js` and switch `reports-season.test.js` line 10 and `test/test.js` line 97 to it.
8. **Lessons core** (calendar.js). Red: L1 to L23 (L17 to L19 need step 1 only). Green: `numberItems`, `lessonsFor`, `seriesFromCells`, `lessonChanges`.
9. **Merge** (calendar.js). Red: M1 to M16 (with a local stand-in for `datesInUse` until step 11). Green: `mergeInto`.
10. **Copy themes** (calendar.js). Red: M17 to M21. Green: `copyThemes`.
11. **Season** (season.js). Red: S1 to S13. Green: `upgradeCalendar` in `fromJson` (line 144), `datesInUse`, `lastEdit`, the `newSeason` changes. Then fix `season.test.js` (lines 509 to 516, New season), `replay-report.test.js` line 14, and any of `replay-causes`, `legacy-spellings`, `teams-gaps` that the File upgrade change touches. Switch M8 and M9 to the real `datesInUse`.
12. **Validate** (validate.js). Red: S14 to S20. Green: row checks, config checks, `CHECKED_CONFIG`, the weekday rule at line 439. Fix `validate.test.js` line 21 and add the cases.
13. **Named commit** (app-season.js). Red: a small browser case (f7 maker 5) using a temporary button-free hook: `App.changedAs('X')` after a Calendar Apply gives a separate entry. Green: `App.changedAs(label)` (touchSeason with `{ label, separate: true }`).
14. **Dates view** (app.js `renderCalendar`, `commitCal`, the delete and shift handlers; index.html bar). Red: `calendar-dates-browser` 1 to 6. Green: `CAL_TEXT`, time inputs, holiday chip, state select with reason and confirm, protected-date refusals, Roll guard, datalist, lesson message. Fix `ux20-roster-teams-calendar-browser` lines 36 to 47 and check `leftovers-browser` lines 539 to 543.
15. **Lessons by week view** (app.js, index.html, style.css `.calsubs`). Red: `lessons-week-browser` 1 to 6 and 8, `calendar-dates-browser` 8. Green: the sub-buttons, the grid, the group settings line, Edit list…, Clear typed, Link.
16. **Make calendar panel** (app.js or a new `app-calmaker.js` loaded after app.js; index.html; style.css). Red: `calendar-maker-browser` 1 to 7, 9, 11, `lessons-week-browser` 7. Green: the six steps and Make it.
17. **New season, checklist, banner** (app-season.js `beginNewSeason`, app-options.js `newYearSteps`, app.js `staleCalendarHtml`). Red: `calendar-maker-browser` 8 and 10. Green: open the panel after New season; the new button text. Fix `fresh-start-browser` lines 46 to 48.
18. **Options CSV card and the Import route** (app-options.js, app.js lines 1094 and 1302). Red: `calendar-dates-browser` 7. Green: `optCalendarCsv`, the shared load-with-confirm, the Options index entry. Fix `leftovers-browser` line 428, `options-index-browser`, `info-browser` lines 105 to 117.
19. **Lessons by week report** (reports.js `lessons`). Red: R7 to R11. Green: the corrected report.
20. **Club calendar report** (reports.js, app.js `RSUBS` line 780 and the Show lessons tick, style.css). Red: R1 to R6, R12, then `calendar-print-browser` 1 to 5. Green: `clubCalendar`, the bundle, the CSS. Measure `CAL_LINES` from a PDF of a synthetic long year, then pin R6. Fix `bundles.test.js` line 12, `reports-cleanup-browser` line 68, `reports-new-browser`, `reports-subtabs-browser`.
21. **Help** (info.js, index.html manual, `sync-guide.js`). Red: `wording.test.js`, `info-browser`, `a11y-browser`. Green: the notes and the manual text.
22. **Try it out** (season.js `freshenFake`). Red: S21, S22. Green: recompute breaks and holidays after the shift.
23. **TEST fixture** (`dev/tools/demo-calendar.js`, `make-test-data.js` line 317). Red: R2 and R7 against the fixture. Green: run the script on the TEST file; `check-docs-for-names.js`.
24. **make-database** (`dev/tools/make-database.js` lines 5 and 22). Strict `--calendar`; `browser.test.js` uses the legacy helper.
25. **Docs and versions.** DATA-FORMAT.md, CHANGELOG, README, BACKLOG, the version strings. Red: `data-format-doc`, `release-consistency`. Green: the text.
26. **Sweep.** `sh dev/tools/run-tests.sh` with `NODE_PATH` set (only the step-0 failures may remain), `check-docs-for-names.js`, a look at 390 and 1366 px (f9), and one printed calendar on paper (the owner).

## i. Risks

- **Quarters are typed per row.** Attendance quarters, standings, team history, the `TeamPlan.stateOf` auto-lock and the binder "as of first night" (`firstNightOf`, reports.js line 247) all follow the Quarter cell. A moved start re-labels past attendance. The warning lists the affected nights, and M10, M11 and maker test 3 prove the list is right.
- **Attendance on a moved or deleted date** silently leaves every total. The guards are the grid refusals, the Roll guard, the CSV-load check and `mergeInto` never touching protected dates.
- **Absences and team moves are tied to exact dates** (`addAbsence`, season.js line 930; `teamMoves[id][i].from`). Both are in `datesInUse`. The validator already warns when an absence night stops being a club night (validate.js line 244), so cancelling such a night shows up in the file check too.
- **carriedThrough and seasonStart.** A first night on or before `carriedThrough` would hide this year's early work (`seasonStart`, season.js line 1188). The panel refuses it, and last year's rows are kept in `lastYearCalendar`.
- **One Undo step and one History entry.** Without `App.changedAs`, Make it would be folded into a Calendar or Options entry from the last 5 minutes (`Season.record` merges same-area edits, season.js line 1248). Maker tests 1, 5 and 6 check one entry and one Undo restoring both the calendar and the config.
- **A spurious File upgrade on every open.** `Season.diff` compares with `JSON.stringify`, which is key-order sensitive, and any default written at open is a change. Hence `tidy` returns current rows untouched and the new config keys are read through `Calendar.settings`, never written at open (S4, S6).
- **Lessons that move on their own.** A planned No Club night (with the default `move`) shifts every later lesson. That is intended, but it could surprise a leader holding a printed list. The message after the change says "Puggles lessons after 11/25 moved one night later". A snow day (`skip`) shifts nothing.
- **Planned versus cancelled must not drift apart.** Only `Calendar.setState` writes No Club, Cancelled and No Club By Hand, and the validator errors on `Cancelled` without `No Club`. Because a cancel always sets No Club, attendance, To do, the pickers, totals and an older 1.51 copy all treat it as "not a club night" with no code change.
- **Cancelling a night that already has attendance** removes it from totals. The app asks first, and the attendance itself is kept, as for any No Club night today.
- **The sub-buttons.** Using `.subtabs` for Dates / Lessons by week would wire them to the Games tab (app.js line 387). They use `.calsubs` (dates test 8).
- **Old lesson values stay in their old columns.** He re-enters them through the series fill (b6). Nothing is guessed.
- **The File upgrade entry** appears once per older file with History. In app-merge and `Season.record`, the calendar is a `WHOLE` area (season.js line 1240), so a merge conflict on it is a single choice for the whole calendar.
- **An older 1.51 copy** keeps the new keys, but its Lessons report shows Puggles empty, typing in its old Puggles columns lands in Notes on the next open in the new app (b5), and its CSV is refused by the new app.
- **The demo club's breaks drift** if `freshenFake` only shifts by weeks (e). S21 covers it.
- **Real-file tests** stop loading the owner's old CSV unless they use the test-only helper (step 7, step 24).
- **The TEST fixture is generated.** Editing the JSON by hand would be lost on the next `make-test-data.js` run; the re-entry lives in `demo-calendar.js` (step 23).

## j. Questions

**Decided on 2026-11-18 (unchanged):**
- Breaks are recommended, then chosen by hand (b7, c1).
- The printed date style is `9/9/2026`.
- The calendar goes into the standard Coaches binder bundle. A file with saved bundles adds it once under Options › Report bundles.
- All four groups can have weekly lessons, each switchable.
- A planned night off moves the lesson, and an unplanned cancel skips it, both settable per group.
- There is no handling of the old lesson columns.
- There is no lesson make-up feature: a snow day's lesson is skipped and caught up by self-study toward the section sign-offs.

**Still open for the owner (each with the default the plan uses if he does not answer):**
1. **Version number.** The CHANGELOG says to stay in 1.51.x until leaders are told about releases; the first draft said 1.52.0. *Default: the next 1.51.x (1.51.16).*
2. **Saved bundles.** "Adds it once under Options › Report bundles": does he add the calendar to his saved Coaches binder by hand, or should the app add it once automatically? *Default: by hand; the app never edits a saved bundle; the CHANGELOG and the Options bundle note say how.*
3. **A typed lesson on a night that does not meet** (typed earlier, then the night was cancelled). *Default: kept in the data, shown greyed in the grid with a note, uses no item, not printed.*
4. **Roll dates forward… once there is attendance.** Today it moves every date silently, which orphans attendance. *Default: refused while any row has attendance, absences or team moves, pointing to Make calendar….*
5. **Import… of a calendar CSV** (the old route, still accepted) replaces the calendar without asking. *Default: the same confirm and protected-date list as Options › Load calendar CSV….*

**Settled inside this plan (no owner input needed, listed so he can object):**
- The report id is `clubCalendar`.
- Starts at slices the stored items; there is no start key.
- Events copied from last year are listed as "check this date" in the panel and the done message; nothing about the flag is stored.
- The quarter-suggestion rule is the exact rule in b7 (it reproduces his 1/6 and 3/3).
- A cancel with no reason stores the text `Cancelled`.

## k. What revision 2 corrected in the first draft

- **Quarter rule:** "target index k·N/4" gives 11/4, 2/3 and 4/7 on TEST, not the stated 11/4, 1/6, 3/3. Replaced by k·(N−1)/4 with a window of min(3, floor((N−1)/8)) and the after-a-break tie rule, which gives 11/4, 1/6, 3/3 (and sensible picks in short years).
- **Sub-buttons:** "the `.subtabs` pattern from Games (app.js:387)" would break Games: every `.subtabs button` in the page is wired to the Games tab (app.js lines 387, 421, 467, 470; style.css line 36 says so). Now `.calsubs`.
- **One History entry:** `App.commitScope(() => { …; App.changed(); })` can merge into a recent Calendar or Options entry (`Season.record` merges same-area edits within 5 minutes unless `separate`). Added `App.changedAs(label)`.
- **`App.done(…, { undo })`:** the option is `{ undo: false }` to hide the button; the default already shows Undo.
- **Building `config.lessons` at open** would give every existing file, and every test file made with `Season.blank`, a File upgrade entry. Defaults are now read through `Calendar.settings` and written only on first change. `tidy` must also leave current rows untouched (key-order-sensitive diff).
- **`freshenFake`** shifts every ISO date in the file, including `config.breaks`; the plan now replaces the breaks after the shift.
- **TEST fixture:** it is generated by `make-test-data.js` (and is version 5, not 6); the re-entry is a chained script, not a hand edit.
- **Version:** 1.52.0 conflicts with the CHANGELOG's versioning rule.
- **Existing tests:** the first list missed `replay-report.test.js` (11-key row with History), `reports-season.test.js` and `test/test.js` (real old CSVs), `leftovers-browser.test.js` line 428 (CSV button moves), `bundles.test.js` line 12, `reports-cleanup-browser.test.js` line 68, and the Move-dates case in `ux20-roster-teams-calendar-browser.test.js`; `nights.test.js` needs no change.
- **Roll dates forward and Import…** were left able to orphan attendance; now guarded (questions 4 and 5).
- **Report id** `calendar` collided with the tab name, the CSV kind and a Check area; now `clubCalendar`.
- **Pagination test** "a synthetic 45-row year goes to page 2" could not happen at 2 × 46 lines a page; now "longer than 2 × CAL_LINES".
- **Line references checked and correct:** calendar.js COLS line 6; app.js 379, 387, 780, 979 to 981, 1094, 1199, 1200; reports.js 189 to 195, 236; validate.js 33, 439; validate.test.js 120 to 123 and 266 to 273 (the draft's 269 is inside it); season.js 515, 523, 528; index.html 322, 405, 548 to 554; DATA-FORMAT.md 4.2, 5.22, 393, 501, 511, 517; doc-examples 29 to 32; info-browser 109 to 117; review-leftovers 118 to 119; fresh-start-browser 47. The draft's "season.js:933" is `addAbsence` at line 930.
