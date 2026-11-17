# Color teams: the year plan (Gonkulator 1.50.x)

Reference for the Color teams view: what it does, how it decides, what it stores, what it cannot do yet. The user-facing version is in the app (**How it works**, *Color team games*; the (i) notes beside **The year** and **Color team balancing**). The design and its reasons are in `docs/superpowers/specs/2026-11-03-color-teams-design.md`; the build plan is `docs/superpowers/plans/2026-11-03-color-teams-part1.md`. This file describes what was actually built (part 1 of 3).

## What it is for

Sparks and T&T children play games on four color teams (Red, Blue, Green, Yellow) all year, and nobody should repeat a color in the four quarters. The club used to draw a whole year in a spreadsheet; trouble came from new children, children who leave, lopsided teams, and mid-quarter moves. The app now keeps a **plan for the year**: every quarter is either played or locked, the next one is waiting to be locked and printed, and later ones are a projection that can be recalculated with as few changes as possible.

## For the user

**Where:** *Color team games* tab, *Color teams* view. With a data file open it starts with **The year** grid; the older tools (Assign blanks, Re-draw, Import, CSV, Start new year, the audit and its warnings, the list sorted by team color) are all still on the same view.

**The grid.** One row per child, one column per quarter. *By class*, *By group* or *Whole club*. Each quarter header says what it is:

| State | Meaning | Look |
|---|---|---|
| locked | its first club night has passed, or you locked it | dark header, color shown as a button |
| ready to lock | the next unlocked quarter, starting within 21 days | orange header and the start date |
| projected | a guess that can still change | dashed header edge, dashed color outline |

A quarter with no club nights on the calendar never counts as started, so it reads *projected*. Only the next unlocked quarter can be *ready*.

**Pins.** A color you set by hand in an open quarter is a pin (&#128204;). Choosing the color the plan projected makes it a projection again. A pin is never moved by Fill or Recalculate. An older file has no projection marks at all, so every color already entered reads as a pin: opening such a file moves nothing.

**Changing a locked quarter** is a dated move (`Season.setTeamMove`): press the child's color, give a date inside that quarter, then the team. The quarter's own color is never edited and earlier nights keep their team. The Person tab does the same.

**Fill N blank colors** projects every open quarter at once (colors already there stay). **Recalculate** appears once nothing is blank: it says how many children it would change, lists each with the reason (Preview), and **Accept** applies exactly what was shown. The offer is computed with a fixed seed, so the same colors always give the same offer. If an open quarter would still be uneven after the plan (more than one child apart), a red note names the quarter and group; this happens mostly in the last open quarter, where every child has three colors used up.

**Lock / Unlock.** *Lock Q3* writes the day into `config.teamPlan.locked`. It asks first if some children have no color in that quarter. *Unlock* exists only for a quarter locked by hand and asks first; the colors the plan projected become projections again, colors set by hand stay pins. A quarter whose first night has passed cannot be unlocked. Printing the **attendance sheets** or the **color team list** of an unlocked quarter asks *Lock Q3 now?* (*Lock and print*, *Print without locking*, *Cancel*); it never locks silently. Other reports print without asking.

**Why these teams** (beside the grid, below it on a phone): the open recalculation preview, the goals in force, and the attendance behind the turnout (per child: nights counted and rate; children counted at the group average are named).

**Draft and Undo.** Grid edits, Fill, Accept, Lock and Unlock join the Color teams draft like every other edit on this tab: *Apply changes* writes one History step, and *Undo* takes it back. History describes them in words (&ldquo;Locked Q3&rdquo;, &ldquo;Team projection for ...&rdquo;).

**Options &rarr; Color team balancing.** The goals, most important first. Three are built in and always on, in this order: never repeat a color in the year; a friend placement for a new child (reserved for part 2); even team sizes. Below them you can reorder and switch off: keep earlier teammates apart; even expected turnout; spread each grade across the teams. Defaults: that order, all on. *Reset to the defaults* clears the setting.

## Rules as built (updated 2026-11-14)

**The color a child plays now.** The roster's `team:Qn` is the quarter's default; a dated move replaces it from its night on (or from the quarter's first night, in which case the roster color was never played). Everything that counts, sizes, repeats and prints uses that effective color: the grid, the Roster, the sorted list, Assign blanks, To do, the Lock prompt, and the printed Color teams list, coaches list and binders printed after the quarter started. A binder printed before the quarter starts is "as of its first night". A one-night exception (a visitor, a fill-in) is never a child's color.

**No team.** A child marked No team for a quarter is on no team: no color, no points, outside the team sizes. Assign blanks, Re-draw, Fill, Recalculate and the To do "best choice" all leave them alone, and the mark stays until a color is chosen.

**What counts as "already had".** A color played in a quarter that has started, a color set by hand (a pin) in a quarter that has not, and a dated move. The plan's own projection does not count: Recalculate repairs it by itself. Picking a color that was only projected for another quarter does not warn; picking one that was played does.

**Warnings.** Every hand pick (the grid, the Person tab, the Roster, To do) says in plain words if it repeats a color, never blocks it, and a repeating cell in the year grid carries "repeats Q1" itself. Team-size and lopsided warnings appear only once everyone in the group has a color (or is No team); while children are blank every pick would look uneven.

**Expected turnout and the blend.** A child's rate is nights present over nights counted from their first attended night. With fewer than 3 counted nights this season the rate comes from earlier years kept in `pastTurnout` alone (or the group average when there is none); from 3 to the blend nights (20 by default, Options) it moves linearly from history to this season; at 20 and above this season stands alone. The balance panel and the move box use it so that the regulars do not pile onto one team. The lopsided note says "has the regulars" only when the high team has some.

**The move box** (a played or locked quarter): turnout, the colors the child has had, a suggested color that is never one they have had, and warnings on a repeat, uneven sizes or a team loaded with regulars. It never blocks.

**Recalculate offers are repeatable.** The seeded shuffle calls the random source once per swap (Fisher-Yates), so the same seed gives the same offer in every browser.

**A new color year.** *Start new year* (Color teams) and *New season* (Options) both archive the four quarters under last year's label (`team:2026-27:Q1`), blank Q1 to Q4, and clear everything that belonged to last year's quarters: the plan's locks and projection, dated moves, accepted repeats and uneven quarters, and "No team" marks. New season also keeps last year's calendar until you replace it on the Calendar tab, so every quarter reads *locked* until then; it tells you so. The year label must be like 2027-28 (2027-2028 is shortened).

**Checks.** The file check warns about a team move dated outside the club nights of its quarter (a calendar edit can strand one); the move would not apply.

**Not built, by decision:** friend placement, the Visitor tab, per-class rules (which grades go on which team), class-size limits. Hand moves are never undone by a recalculation.

## What it stores

Colors stay where they always were: `team:Q1..team:Q4` on each person (roster). The plan adds one optional block, `config.teamPlan` in the data file, omitted while empty:

```
locked: { "Q3": "2026-12-20" }      quarters locked by hand, with the day
proj:   { "<id>": "-RB-" }          per child, four characters for Q1..Q4: R B G Y = the color the engine projected, - = none
prio:   { order: [...], off: [...] } only when the three orderable goals differ from the defaults
```

A color is a **pin** exactly when it is non-blank and differs from its `proj` mark. No write path had to change: the Person tab, the Roster column, CSV import and the grid all keep writing `team:Qn`. The projection is stored (not recomputed from a seed) because a minimum-change recalculation depends on the previous projection, which is history. Old files open unchanged and round-trip byte for byte; an older app keeps `teamPlan` untouched. A new season (`Season.newSeason`) and *Start new year* clear the whole block (the goals reset with it; see Known limits).

## How it decides (`teamplan.js`, `teams.js`)

Everything is per **group** (Sparks, T&T): each group plays together, so teams are balanced across the whole group, never per class.

1. **States** (`stateOf`): locked if `locked[q]` exists or the quarter's first club night is on or before today; ready if it is the next unlocked quarter and starts within `READY_DAYS` = 21; otherwise projected.
2. **Fill** (`project`) and **Recalculate** (`recalc`) walk the open quarters in order and, per group, solve the free children with the min-cost flow in `teams.js` (`Teams.attempt`, with an optional per-child, per-color cost). Fill solves only blanks; Recalculate solves every non-pinned cell of an open quarter. A color is forbidden for a child when they have it in an earlier quarter, in a locked quarter, in a pin, and (for Fill) anywhere else in the year. Sizes dominate the cost (an extra child on a team costs 10+), then a cost of 1 for moving a child off the color they already have (this is what keeps a recalculation to as few changes as possible; the largest current team keeps its extra child), then random tie-breaks.
3. A **swap pass** exchanges pairs of free children, sizes unchanged, when that lowers the weighted soft cost: keep earlier teammates apart (children who shared a team in earlier quarters), even expected turnout (variance of the teams' summed rates), spread each grade (variance of each grade's count per team). The first enabled goal in the user's order weighs 0.3, the second 0.2, the third 0.05 (`W_BY_RANK`). Because a move costs 1 and these weights are small, a recalculation almost never moves a child for a soft gain.
4. **Turnout** (`rate`, `turnout`, `ratesOf`): a child's rate is the share of counted club nights they attended, counted from their first attended night up to today; the nights that count follow the app's one rule (`Season.heldNights`: on the calendar, not an event, someone present). Fewer than `MIN_NIGHTS` = 3 counted nights (or never attended) uses the group average; where nobody has enough nights, everyone counts as 1.
5. **Reasons** for each change: no-repeat (the old color is used or pinned elsewhere), head count (a pin made the teams uneven), or the first enabled soft goal.
6. **Balance notes** (`balanceNotes`): after a plan, any open quarter and group still more than one child apart.

## Known limits

- Quarters are solved in order with no look-ahead, so the **last open quarter can end one child uneven** (it is nearly forced by the colors already used). The red note says so; fix it by hand or accept the warning.
- The three built-in goals cannot be reordered or switched off (the flow solver fixes them); only the other three can.
- The balancing goals reset with a new season; locks and the projection always should.
- Friend placement for a child new to Planning Center, class rules per class, and the Visitor tab are not built (parts 2 and 3).
- The demo club shows locked and projected quarters and a few pins, not the orange *ready* state (it depends on the day).
- Re-draw refuses a started or locked quarter; Assign blanks and Import colors are still allowed there (a new child needs a color; an import is a deliberate hand edit and its colors read as pins).

## Tuning

Constants at the top of `dev/app/teamplan.js`: `READY_DAYS` (21), `MIN_NIGHTS` (3), `W_BY_RANK` ([0.3, 0.2, 0.05]), `STAB` (1, the cost of moving a child in a recalculation). The seed for the recalculation offer is in `app-teamgrid.js` (`20261`). Any change needs the matching test in `test/teamplan.test.js`.

## Tests

`node test/teamplan.test.js` (states, locks, pins, file round trip, turnout, projection, minimum-change recalculation, priorities, History wording, review fixes) and, with `NODE_PATH` set to a Playwright install, `node test/teamgrid-browser.test.js` (the grid in Chromium: states, scope, editing, pins, dated moves, Fill, Recalculate and its preview, the Why panel, Lock/Unlock, the print prompt, balance note, new year, focus, 44px targets), `node test/options-browser.test.js` (the goals on Options) and `node test/a11y-browser.test.js`. The demo data file carries a small plan, added by `dev/tools/demo-plan.js` (also run by `make-test-data.js`).

## Files

`dev/app/teamplan.js` (logic), `dev/app/teams.js` (the flow solver and the older per-quarter assign), `dev/app/app-teamgrid.js` (the grid, panel, lock buttons), `dev/app/app.js` (mount, print prompt, Re-draw / Assign / new year hooks), `dev/app/app-options.js` (the goals), `dev/app/season.js` (History wording, new-season reset), `dev/app/info.js` (the (i) notes), `dev/app/index.html` (manual, the print-prompt dialog), `dev/app/style.css`, `dev/tools/demo-plan.js`.
