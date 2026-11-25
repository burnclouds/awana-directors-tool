# Cancellation checkbox: plan v2 (reviewed against the code, not yet briefed to Sol)

**Status:** v2 of `2026-11-25-cancellation-checkbox-plan.md`, checked against the code on `playtest` (worktree `n-backlog-integration`, uncommitted work from earlier rounds included). Line numbers are from that tree as read on 2026-11-24. No code was changed.

## Goal

Add a "Cancelled" checkbox to each club-night row on Calendar > Dates. Ticking it cancels the night. Clearing it restores the night. At the moment of change, one summary shows every effect. After the change commits, every dependent view and check reads the new calendar, and no stale warning stays on screen. No record is removed or changed.

## Corrections to v1 (plan text compared with the code)

| # | v1 said | The code does | Where |
|---|---------|---------------|-------|
| C1 | "The checkbox writes the row's existing State value (`Cancelled`) and nothing else." | No State column exists. State is derived: `stateOf` returns `event`, `meets`, `cancelled` or `planned` from `Type`, `No Club` and `Cancelled`. `Cancelled` holds the reason text, `'Cancelled'` by default. `setState` writes `No Club='1'`, `No Club By Hand='1'` and `Cancelled=<reason>`, and deletes `Generated Break`. `structuralCalendarEdit` then calls `markRecordedClosure`, which writes `Recorded Night='0'` when the night has recorded activity. A tick changes up to five fields. | `calendar.js:38-46`, `calendar.js:33-37`, `app.js:1595` |
| C2 | "Unticking restores every dependent value exactly as before, because nothing was stored except the State value." | Clearing the box calls `setState(row,'meets')`. That leaves `No Club By Hand='1'`, keeps `Generated Break` deleted and removes `Recorded Night`. The derived values (totals, start, grace, locks) do come back. The row is still not byte-identical: Make calendar now treats it as handmade and keeps it (`calendar-safety.js:183`). Only **Undo** restores the exact row. | `calendar.js:41-44`, `calendar-safety.js:183` |
| C3 | Grace comes from `isRecordedClosure`, implied by State. | Grace, the held season start and the quarter anchor all depend on `Recorded Night='0'` (`isExcused`, `calendar.js:31`). Only `markRecordedClosure` writes it, and only through `structuralCalendarEdit`. So the checkbox must go through `structuralCalendarEdit` with `field='State'` and must never set fields directly. A checkbox that used `data-c="Cancelled"` would go to the plain-field branch (`app.js:1738`). That branch writes `'1'` as the reason text and changes no state. | `app.js:1717`, `app.js:1724-1738` |
| C4 | `nightList` is in `season.js`. | `nightList` is in `app-season.js:386-391`. It lists `countsNight` rows plus **any date with attendance entered**. A cancelled night with attendance stays in the night pickers with quarter `''`. | `app-season.js:386` |
| C5 | "A cancelled first night must not move season start." Test: "Ticking the first night: season start stays where it was." | This holds only when the night has recorded activity: `seasonStart` adds recorded closures through `isRecordedClosure` (`season.js:1485-1491`). An **empty** cancelled first night does move the start to the next counted night. `compare` then emits a season-start notice (`calendar-safety.js:103-119`). The owner rule covers only nights with recorded activity, so this is correct behaviour, but it must be announced and tested as a move. | `season.js:1481-1491` |
| C6 | "Recorded" means children with activity. | `recordedNightActivity` (exported as `CalendarSafety.noteImpact`) counts children (sign-offs, award receipts, book receipts, handbooks, jewel placements and drops, attendance, awards, team moves), plus **games** and **adult awards** with no child. Volunteer attendance and dated notes are excluded, which matches the owner rule (test `calendar-maker.test.js:520`). Adult awards, which are volunteer records, **do** make a night recorded. See owner decision D3. | `season.js:768-785` |
| C7 | `compare`/`noticeText` "re-run on save". | `compare` runs once, at change time, before the confirm (`app.js:1608`). It is re-checked inside `commitScope` for staleness (`app.js:1644-1647`, `1661-1664`). `noticeText` only formats season-start notices. They go into `#calEditNotices` after `finish` and clear themselves after 8 s (`app.js:1574-1583`, `1605`, `1619`). Nothing is cached: each tab recomputes from `App.calendar` when it renders. | `app.js:1573-1713` |
| C8 | Quarter locks: `teamplan.js firstNight`, `reports.js`. | Correct for `TeamPlan.firstNight` and `stateOf` (`teamplan.js:51-59`) and for `Reports.firstNightOf` and `nextQuarter` (`reports.js:415-420`), which all use `Season.isQuarterNight`. **`Calendar.currentQuarter` uses `isNight` only** (`calendar.js:59-60`). It drives `applyQuarter` (`app.js:46`) and `quarterNow` (`app-season.js:427`), so a cancelled first night of a quarter moves "the quarter we are in" back one quarter until the next night, even when that night has activity. See D4. | `calendar.js:59` |
| C9 | The change-time summary is new. | A summary already exists for the recorded case: `excusing()` (`app.js:1622-1637`), dialog "Mark night as a note", button "Keep records and mark". It shows the date, theme, child count, mark, grace sentence and lock sentence, with names in the list. When only games or adult awards are recorded it says "0 children have recorded activity" (`app.js:1626`). Un-cancelling a recorded night goes to the generic "Review this calendar edit" dialog (`app.js:1657`), which lists only block reasons and has no names list. | `app.js:1622-1668` |
| C10 | Empty night: "no warning". | An empty night is silent only when `compare` returns no blocks. A past empty night on or before the latest activity gets a `previous schedule` block, and any night in a locked quarter gets a `locked quarter` block (`calendar-safety.js:56-57`). Both open the generic danger dialog. | `calendar-safety.js:24-61` |
| C11 | (not mentioned) | **Live build constraint.** `make-deploy.sh:21` removes `// BEGIN PLAYTEST`…`// END PLAYTEST` blocks and ` /* PLAYTEST: … */` comments from the live build. A changed `.js` file must carry a new version (`make-deploy.sh:54`). For live output to stay byte-identical, every new line must sit inside PLAYTEST **block** markers, and no line-1 version may be bumped. Inline `/* PLAYTEST: */` code is a comment in `dev/`, so the dev tests never run it; do not use it for this feature. Playtest versions change through `playtest_suffix` (`make-deploy.sh:32`) and the file list on line 39. | `make-deploy.sh:21-41` |

## Design (recommended)

- **One source of truth.** The checkbox is a second control for the existing derived state `cancelled`. It stores no field of its own. Ticked means `Calendar.stateOf(row) === 'cancelled'`. Ticking sends `field='State'`, value `cancelled`, through `structuralCalendarEdit`. Clearing sends value `meets`. The State select and the checkbox are drawn from the same row on every `renderCalendar`, so they cannot drift.
- **Where the box appears.** On club-night rows whose state is `meets` or `cancelled`. Event rows get no box, as they get no State select today (`app.js:1460`). On `planned` (No club) rows the box is shown disabled, with the title "No club is planned on this night; use the Meets list." Reason: clearing the box always sets `meets`, so clearing it on a planned break would reopen the break. See D2.
- **Reason text.** Ticking keeps any existing reason (`setState(r,'cancelled',r.Cancelled)`, as at `app.js:1725`). The existing reason input (`app.js:1462`) appears next to the box once the night is cancelled.
- **Effects are recomputed, not remembered.** No dependent result is cached. Every reader takes `App.calendar` or `season.calendar` at render time (verified for the readers below; none memoise).
- **Live-neutral placement.**
  - `app.js` (already in the playtest suffix list):
    - a top-level block holding `const cancelBoxRows = new WeakSet();` and a helper `cancelBox(r)` that returns the cell HTML;
    - a block at the end of `renderCalendar`, after `app.js:1466`, that inserts the box into each `tr[data-i]` Meets cell by DOM (this avoids editing the live template expression);
    - a block at the top of `commitCal`, before line 1717: when `t.dataset.cancelBox` is set, build `next = Calendar.setState(r, t.checked ? 'cancelled' : 'meets', r.Cancelled)`, add `next` to `cancelBoxRows`, call `structuralCalendarEdit(index,'State',next, apply)` with the same `apply` as `app.js:1727-1729`, and return;
    - a block inside `structuralCalendarEdit` after `app.js:1637` (once `excusing`, `recordedList`, `snapshot` and `comparison` exist) that handles `cancelBoxRows.has(row)` from start to finish (next section) and returns.
  - `calendar-safety.js`: a pure `cancellationSummary(...)` in a block, plus a block after line 335 that adds it to the exported `api` (`api.cancellationSummary = cancellationSummary`). Add `calendar-safety.js` to the suffix list at `make-deploy.sh:39`.
  - Bump `playtest_suffix` to `-playtest.3`.
  - `calendar.js`, `season.js`, `teamplan.js` and `reports.js` do not change.

## Dependents to update (verified by reading)

All of these are recomputed on render. "Refresh" means the view re-renders after the commit, or on its next show.

1. **Counted nights** (`season.js:699` `counted` → `Calendar.countsNight`). An excused or cancelled row is not counted. Every caller below reads it.
2. **Held nights** (`season.js:720` `heldNights`). The night drops out. Readers: Stats (`stats.js:47,116`), Store points (`store.js:46`), Pace (`pace.js:84,99`), the progress and attendance reports (`reports-season.js:229`), `turnoutCounts` (`season.js:627`) and `volunteerNights` held flags (`season.js:1239,1248`).
3. **Totals** (`season.js:724` `totals`). Each child's marks on the night leave quarter and year totals. Readers: Attendance (`app-season.js:485`), Person (`app-person.js:115`), Stats (`stats.js:84`), Store (`store.js:56`).
4. **Game points** (`season.js:962,981,990` use `counted`). Games recorded on the night leave team and kid game points. **Missed in v1.**
5. **Night pickers** (`app-season.js:386` `nightList`). The night stays listed when attendance is entered, with quarter `''`. Readers: Attendance navigation (`app-season.js:467-567`), Person (`app-person.js:94,113,127,134`), `nextNight`. **Missed in v1.**
6. **Season start** (`season.js:1485` `seasonStart`). Held by a recorded closure; moves for an empty first night. Readers: Options season-start text (`app-options.js:146`), `sectionsThisSeason` and `pastYearAwards` (`season.js:1493-1502`), award ledger and earlier-year rules (`season.js:1029,1069,1472`), the sign-off review window (`signoff-review.js:28`), merge classification (`app-merge.js:127-128`) and finished-books filtering (`reports-season.js:240`). **Most missed in v1.**
7. **Attendance grace** (`season.js:789-816` `graceDates`, `blueJewelRequirements`, `earnedBlueJewels`). Grace counts only dates after `config.carriedThrough`, and lowers the requirement only for attendance on later dates (`dates[grace] < date`). Jewels already earned keep their threshold and date (`season.js:805-806`). Readers: Progress (`app-season.js:982`), progress report Blue Jewels row (`reports-season.js:128`), `blueWingPlan` → `sparkJewels` and `heldGems` (`season.js:828-893`, the year-end expiry of held gems is unchanged), and the award events timeline (`season.js:850`).
8. **Awards due and the to-do badge.** Lower requirements can make a jewel newly earned. `touchSeason` and `importChanged` call `App.updateTodoBadge` (`app-season.js:131-134,268`). To-do recomputes on refresh (`app-todo.js:275`). **Missed in v1.**
9. **Quarter locks** (`teamplan.js:51-59`). The anchor is the first `isQuarterNight` row in the quarter. An empty cancelled first night can turn a date-locked quarter back to `ready` or `projected` when the next night is in the future. Hand locks (`config.teamPlan.locked`) never change. Readers: Team grid (`app-teamgrid.js:20,41,60,167`), To-do pin guard (`app-todo.js:236`), team draw and re-draw guards (`app.js:1193,1235,1296`), Team Plan recalc and apply (`teamplan.js:158,238,333`), and the `locked quarter` reason in `CalendarSafety.inspect` (`calendar-safety.js:54`).
10. **Current quarter** (`calendar.js:59` `currentQuarter`, which uses `isNight`). Settings quarter (`app.js:46`), `quarterNow` (`app-season.js:427`) and the team-move default quarter (`app-teamgrid.js:184`). This does **not** follow the recorded-closure rule (D4). **Missed in v1.**
11. **Bundles "as of" date and next quarter** (`reports.js:415-420`, `app.js:904`).
12. **Weekly lessons** (`calendar.js:118-129` `lessonSeries`; `Calendar.lessonChanges` at `app.js:1598`). The cancelled night shows its lesson as missed or struck out, and later lessons may shift. The "N weekly lessons are affected" flash already exists (`app.js:1606`). **Missed in v1.**
13. **Calendar print and Lessons reports** (`reports.js:233-240,328-347`). These show `CANCELLED` plus the reason, with the lessons struck out.
14. **Volunteer absences** (`app-season.js:1462` `absenceClubDates`, which uses `isNight`). The night leaves the absence pickers. Existing absence records on the date stay, and `inspect` and `linksAt` still report them. **Missed in v1.**
15. **Sign-off review** (`signoff-review.js:15-35`). A cancelled row counts as a closure, not a meeting. The window start follows `seasonStart`. It refreshes through `App.onRefresh` (`app-signoff-review.js:125`).
16. **Validation** (`validate.js:381`). `Cancelled` text requires a closed night. `setState` meets this; any separate flag would break it.
17. **Merge** (`app-merge.js:94` `describe` uses `stateOf`; `CalendarSafety.mergeConflicts` and `seasonStart`). The `Recorded Night` field travels with the row.
18. **Make calendar** (`calendar-safety.js:183` handmade check; `propose` keeps rows with evidence). A box-cancelled row is handmade and is kept on regeneration.
19. **Calendar status line** (`app.js:1440-1443`, the off-day warning). Unaffected by state; it re-runs in `renderCalStatus`.

## Change-time summary (exact specification)

`cancellationSummary(season, before, after, index, today, nameOf)` is pure, in `calendar-safety.js` (playtest block). `before` is `App.calendar`. `after` is the candidate with `markRecordedClosure` already applied (`app.js:1595-1597`). It returns `{ needsDialog, danger, title, ok, lines: string[], list: string[], label }`. Every number comes from the same functions the app uses. To get "after" values, pass `Object.assign({}, season, { calendar: after })`, the pattern used at `calendar-safety.js:103-104`.

**Title and button.**
- Tick: title "Cancel club night", OK "Cancel this night".
- Clear: title "Restore club night", OK "Restore this night".
- The cancel button on both reads "Keep as is".
- `danger: true` when there is recorded activity or any block.

**Lines, in this order.** A line is left out only where noted. All lines carry counts, dates and fixed words only, never names.

1. **Night:** `<YYYY-MM-DD> · <Theme> · <Quarter>`. Theme is omitted when blank.
2. **Recorded activity:** `Recorded activity: <n> child|children` + `; games (<g>)` + `; adult awards (<m>)`. Each part appears only when non-zero. If nothing is recorded: `No recorded activity on this night.` (This also removes the "0 children have" wording, C9.)
3. **Totals:** `Club nights held: <A> → <B>.` from `heldNights(...).length` before and after. Then, if the night was held, `Attendance totals: <k> child|children lose|regain this night.` (children with any mark on the date, filtered by `Model.childTestOf`). Then, if `g>0`, `Game points: games on this night leave|return to the totals.`
4. **Season start:** `Season start: unchanged (<D>).` or `Season start moves from <A> to <B>.` For a recorded first night add ` This night stays the season boundary.` If `compare(...).notices` carries records, add `<r> record(s) dated before <B> will belong to an earlier year.` If a block says `effective season start would be lost`, the line reads `Season start would be lost (no counted night left).`
5. **Blue Jewel requirements** (only when `graceDates` length changes):
   - `Blue Jewel requirements for attendance after <date>: 1st <w1> → <w1'>, 2nd …`, from `blueJewelRequirements(s, cal)` without `id`;
   - then `Jewels already earned keep their requirement and date.`;
   - then, if any child's `blueJewels` list grows, `Newly reached: <j> child|children.`
   - When grace does not change (an empty night): `Blue Jewel requirements: unchanged.`
6. **Quarter locks:** for every quarter whose `TeamPlan.stateOf` or `firstNight` differs: `<Q>: <state> → <state'> (first night <F> → <F'>).` Otherwise `Quarter locks: unchanged.` If a hand lock exists on that quarter, add `Hand locks stay as set.`
7. **Current quarter** (only when `Calendar.currentQuarter(cal, today)` differs): `Current quarter: <Q> → <Q'>.`
8. **Later nights:** `<n> later club night(s) this season use the new requirement.` (counted nights in `after` with date greater than the row date; only when line 5 changed). Then `<L> weekly lesson(s) affected.` when `lessonChanges` is non-empty.
9. **Footer (always):** `Every record stays on its original date. Undo reverses this change.`

**List (names; on screen only).** In order:
- each child with recorded activity, as `App.calendarChildName(id)` (`app.js:1568`);
- `games (<g>)` and `adult awards (<m>)`, as `recordedList` does today (`app.js:1621`);
- each newly-reached child, as `Blue Jewel: <name>`;
- each season-start record, formatted as `noticeText` formats records (`kind · name · item`).

`nameOf` is passed in, so the pure function never resolves names, and node tests use ids.

**When the dialog appears.** `needsDialog` is true when any of these holds: recorded activity; any `compare` block; season start changes; any quarter state changes; current quarter changes. Otherwise there is no dialog, and lines 1–2 and 9 go to `#calEditNotices` as notice lines (D1).

**History label (no names).**
- Tick on a recorded night: `Calendar note · <date>`, the same label as today (`app.js:1648`).
- Any other tick: `Cancel club night · <date>`.
- Clear: `Restore club night · <date>`.

**One step.** The block runs `App.ask.confirm(lines.join('\n'), { title, ok, danger, list })`, then `App.commitScope` with the same staleness checks as `app.js:1644-1647` (snapshot, `noteImpact`, and `compare(...).blocks`). Then it calls `finish(label)`. Always use the commit form of `finish`, so `App.importChanged` makes **one** History entry and one undo step and `refresh()` runs. The no-commit `apply()` path does not call `refresh()`.

## Save-time refresh (after the change commits)

1. `finish(label)` (`app.js:1599-1607`) sets `calendar`, calls `App.importChanged(label)`, which runs `syncData`, `Season.record`, the undo push, `updateUndo` and `updateTodoBadge`, then calls `refresh()` (`app.js:194-202`). Visible tabs re-render, and every `App.onRefresh` subscriber runs: Attendance, Games, Awards, History, Person, Store, Stats, Options, To-do badge, Sign-off review and Calendar maker. Hidden tabs recompute when shown.
2. `renderCalendar` re-runs `applyQuarter` (`app.js:1448`), so the current-quarter setting follows the new calendar.
3. **Stale warnings.** `structuralCalendarEdit` already empties `#calEditNotices` at the start of each edit (`app.js:1576`). Add, in a playtest block, `App.onRefresh.push(() => $('calEditNotices').replaceChildren())` so that Undo, Redo, opening a file or a merge also clears the notices. `finish` calls `refresh()` **before** `showSeasonStartNotices()`, so the current change's notices are written after the clear and survive.
4. Then `showSeasonStartNotices()` writes `noticeText` lines for this change (names on screen only), plus the no-dialog notice from the summary (D1). Notices still clear after 8 s.
5. No other warning store exists. The day-of-week warning re-runs in `renderCalStatus`. Team Plan, Progress and reports compute on render.

## Undo and Redo

- One Undo step reverses the whole change: `undoStep` applies the reverse diff to `season`, which includes the full calendar row (`No Club`, `No Club By Hand`, `Generated Break`, `Cancelled`, `Recorded Night`). It reloads with `App.loadData` and calls `App.refresh()` (`app-season.js:148-157`). This restores the row exactly, unlike clearing the box (C2).
- Undo is disabled while a held-changes draft is open (`app-season.js:142,149`).
- **Verify after Undo:**
  - `App.calendar` deep-equals the pre-tick calendar, including `Recorded Night` and `No Club By Hand`;
  - `season.attendance`, `awards`, `progress`, `given`, `games`, `adults` and `teamMoves` deep-equal the pre-tick values;
  - History length is pre-tick + 2 (change + Undo);
  - `seasonStart`, `heldNights`, `blueJewelRequirements(s,cal)`, every child's `blueJewels`, `TeamPlan.stateOf` for Q1–Q4 and `Calendar.currentQuarter` equal their pre-tick values;
  - the checkbox and the State select show the pre-tick state;
  - `#calEditNotices` is empty;
  - the to-do badge count equals the pre-tick count.
- **Verify after Redo:** the same values as after the tick.

## Rules

- Ticking or clearing removes or changes no record. Attendance, awards, progress, given marks, games, adult awards, team moves, absences, notes and locked quarters stay in place. Only the calendar row changes.
- Warn and offer the corrective action (Undo, or clear the box); never refuse. The only refusals are the existing stale-data reloads (`app.js:1646`, 1663), which ask for a fresh review and are not a refusal of the change.
- Recorded night: no records removed; drops out of totals and held nights; grace from that date forward only; no credit; season start held; quarter anchor held; reports hide nothing (D5).
- The year-end expiry of held gems is not touched (`blueWingPlan`, `heldGems`).
- Names only in the dialog list and on-screen notices. Never in summary lines, History labels, files, test fixtures or test names.
- Live build output byte-identical (C11).
- Owner decisions from round 4 and round 7 are unchanged.

## Failure modes and tests (invented data only)

The fixture pattern, as in `calendar-correction-browser.test.js:114-120`:
- `Season.blank('2040-41')` with `fake = true`;
- rows built with `Calendar.blank()` and `Quarter: 'Q1'`, theme `Test meeting`;
- ids `kid-a`, `kid-b` and `adult-v`; no real names. Where a name must show, inject `App.calendarChildName = () => 'Test Child'` in the page only.
- Dates `2040-09-05`, `2040-09-12`, `2040-09-19`, `2040-09-26`; today `2040-09-20`.

| # | Failure mode | Test |
|---|--------------|------|
| F1 | The box is wired as `data-c="Cancelled"` and writes `'1'` as the reason with no state change (C3). | Node or browser: tick on `2040-09-12`. Expect `stateOf === 'cancelled'` and `Cancelled === 'Cancelled'`, never `'1'`. |
| F2 | The box bypasses `markRecordedClosure`, so a recorded night gets no grace and no held start. | `kid-a` attended `2040-09-12`. Tick. Expect `Recorded Night === '0'`, `isRecordedClosure` true, `graceDates` = `['2040-09-12']`. |
| F3 | Two dialogs or two History entries for one tick. | Recorded tick: exactly one `#ask[open]`; History +1; one undo step. |
| F4 | The summary says "0 children" when only games or adult awards are recorded. | `s.games['2040-09-12'] = { Red: … }` only. Line 2 reads `Recorded activity: games (1)`. No "0 child". |
| F5 | A cancelled recorded first night moves the season start. | `kid-a` signed off on `2040-09-05`, attended. Tick `2040-09-05`. `seasonStart` stays `2040-09-05`. Line 4 says unchanged and "stays the season boundary". |
| F6 | An empty cancelled first night moves the start silently. | Sign-off dated `2040-09-05`, no attendance on the 5th. Tick the 5th. Dialog shown; line 4 is `Season start moves from 2040-09-05 to 2040-09-12.` plus the earlier-year record count. The list holds `sign-offs · Test Child · …`. |
| F7 | Grace applies before the cancelled date. | `blueJewelWeeks = [2, …]`. `kid-a` attended 09-05 and 09-12. 09-19 is cancelled with `kid-b` activity. Jewel 1 for `kid-a` keeps threshold 2, date 09-12. A jewel after 09-19 uses the reduced threshold. |
| F8 | An earned jewel loses its date when its night is cancelled. | Reuse `calendar-maker.test.js:568` with the tick path: earned date and threshold unchanged. |
| F9 | The quarter lock anchors to the next night after a recorded cancelled first night. | Tick Q1 first night with activity. `TeamPlan.firstNight` unchanged; `stateOf('Q1')` unchanged. |
| F10 | An empty cancelled first night leaves the quarter locked though its next night is in the future. | Q2 first night is today and empty, next Q2 night is next week. Tick. `stateOf('Q2')` goes `locked` → `ready`; line 6 lists it. A hand lock in `config.teamPlan.locked.Q2` keeps it `locked`. |
| F11 | Clearing the box on a planned No club row reopens a break (C2/D2). | `planned` row: the box is disabled; clicking changes nothing. |
| F12 | Clearing does not restore derived values. | Tick then clear a recorded night. `heldNights`, `seasonStart`, requirements and quarter states equal the originals. `No Club By Hand === '1'` remains (documented). |
| F13 | Undo leaves a stale notice or value. | Tick (empty first night, start moves), then Undo. All "Verify after Undo" items hold, `#calEditNotices` is empty within one frame. |
| F14 | The data changed while the dialog was open. | Open the dialog, then add a mark for `kid-b` on the date through `page.evaluate`, then OK. The existing flash "…changed. Review the correction again." appears; the row is unchanged. |
| F15 | A name reaches a History label or a file. | After tick, clear and undo: History labels match `/^(Calendar note|Cancel club night|Restore club night) · \d{4}-\d{2}-\d{2}$/`. A grep of the saved JSON for `Test Child` finds nothing. Fixtures contain ids only. |
| F16 | An empty future night with no blocks shows a dialog, or nothing at all (D1). | Tick `2040-09-26` with no activity in an unlocked quarter. No dialog; `#calEditNotices` holds lines 1, 2 and 9; History +1. |
| F17 | A past empty night inside the activity window is treated as silent. | Tick `2040-09-05` (empty) when 09-12 has activity: the `previous schedule` block gives a danger dialog (C10). |
| F18 | Reports drop the night without saying so (D5). | After a recorded tick: the calendar print shows `CANCELLED`; the attendance report has no 09-12 column. Assert the agreed behaviour once D5 is decided. |
| F19 | The checkbox and the State select disagree. | Set the select to `cancelled`: the box is ticked. Clear the box: the select shows `meets`. |
| F20 | Event rows get a box. | Event row: no `[data-cancel-box]`. |
| F21 | Live output changes. | For each changed `dev/app/*.js`, compare `live_source` of the file with `live_source` of `git show HEAD:<file>`, the same check as `make-deploy.sh:85-97`. They must be byte-identical. Run the playtest build only when authorised; do not run the live build. |
| F22 | Cancelling while an Attendance held-changes draft is open. | Not verified (U3). Expected: the change is held with the draft, and Undo stays disabled until Apply. |

**Test running.** Add node tests for `cancellationSummary` (F2, F4–F10, F12, F15) in a new `dev/app/test/cancellation-summary.test.js` and run that file plus `calendar-maker.test.js`. Browser cases (F1, F3, F11, F13, F14, F16, F19, F20) go in `calendar-correction-browser.test.js`. Run them only targeted and only with Mike's approval. The full sweep runs only before a commit, after asking.

## Open question resolved: same as State `cancelled` (recommended)

Recommend the checkbox **be** the derived `cancelled` state, not a separate flag. Reasons from the code:
1. `isNight` (`calendar.js:29`) keys off `No Club`. `counted`, `heldNights`, `totals`, `nightList`, `currentQuarter`, `absenceClubDates`, the `compare` state tuple `[Type, isNight, Quarter]` (`calendar-safety.js:81`) and the sign-off review all follow it with no change.
2. Grace and the held season start need `Recorded Night='0'` on a **closed** row (`isExcused`, `calendar.js:31`). That only works if the cancelled night is closed.
3. `validate.js:381` already rejects `Cancelled` text on an open night. A "Meets + cancelled" row would be invalid data.
4. The reports print `CANCELLED` from `Cancelled` on a closed row (`reports.js:240,340-341`). The lesson series marks it missed (`calendar.js:129`). Make calendar keeps it as handmade (`calendar-safety.js:183`). All of this comes free.
5. No change to `calendar.js` or `season.js`, so live output is easier to keep identical.

**If it were a separate flag**, all of these would change:
- a new CSV column added to `extraCols` (`calendar.js:11`);
- `isNight` and `countsNight` taught to read it;
- `stateOf` given a precedence rule;
- `validate.js:381` relaxed and a new rule added;
- the `compare` state tuple extended;
- `propose`'s handmade test extended;
- reports, lesson series, merge `describe`, `Season.fromJson` tidy and the calendar archive fields (`calendar.js:245`) updated.

Each of those edits is in a file outside the playtest suffix list and would change the live build. Existing files would also need a migration rule for rows where the flag and `No Club` disagree.

## Could not verify

- U1. `App.ask.confirm` with a multi-line message: whether `\n` renders as line breaks. `app.js:1691` joins with `\n\n`, which suggests it does. Check `app-ask.js`.
- U2. Whether `refresh()` reaches the Team grid and Progress when they are not visible. They appear to render on show; not traced through `App.showTab`.
- U3. `staging()` (`app-season.js:45`) on the Calendar tab while an Attendance draft is held (F22).
- U4. Whether `App.importChanged` with a recorded tick produces the same diff label path in History as today's "Mark night as a note" (expected yes; same call).
- U5. The cost of computing every child's `blueJewels` twice for "Newly reached" on a large roster; not measured.
- U6. Drive calendar review (`drive-calendar-review.test.js`) and merge of a box-cancelled row; not read in depth.

## Owner decisions still needed

1. **D1. Empty night with no other effect.** No dialog, and a notice line in the Calendar notice area with Undo available (recommended)? Or a confirm every time? Today's State select applies these silently (`calendar-correction-browser.test.js:113`).
2. **D2. Planned No club rows.** Disable the box (recommended), or let ticking cancel and clearing restore `planned`? The second needs a stored prior state, which is a new field.
3. **D3. Adult awards.** They currently make a night "recorded" for grace and for the held season start (`season.js:782-784`). Volunteer attendance does not. Should adult awards alone count, given the rule that volunteer-only nights are not recorded?
4. **D4. Current quarter.** `Calendar.currentQuarter` ignores recorded closures (C8), so a cancelled first night of Q2 makes the app treat today as Q1 until Q2's next night. Is that acceptable for now? The alternative is a change to `calendar.js` that alters the live build.
5. **D5. "Reports hide nothing."** Once cancelled, the night's column leaves the attendance and progress reports (`heldNights`), though its records remain and the calendar print shows `CANCELLED`. Is that the intended reading? Or should held-night reports show the cancelled night as a struck column with its marks?
6. **D6. Clearing on a recorded night.** Clearing restores the night with one "Restore club night" dialog. Should it also say that `No Club By Hand` stays set, so Make calendar keeps the row as handmade, and that only Undo restores the row exactly?
