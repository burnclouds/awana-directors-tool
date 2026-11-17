# Color teams: year projection, locking, visitors, class rules

> **Status (2026-11-03): part 1 is built (app 1.50.3); parts 2 and 3 are not.** What was built is described in `COLOR-TEAMS.md`. Where the build differs from this design:
> - **Storage:** the projection is stored (`config.teamPlan.proj`), not recomputed from a seed, because minimum-change recalculation depends on the previous projection (call 6 allowed this).
> - **Priorities (14a):** only *keep teammates apart*, *even expected turnout* and *spread each grade* can be reordered or switched off. *Never repeat a color*, *friend placement* and *even team sizes* are built into the solver and always come first.
> - **Added:** a **Fill N blank colors** button (without it nothing could create a projection); a red **balance note** when a quarter cannot be evened; a collapsed list of children sorted by team color kept under the grid; History worded for locks and projections.
> - **Lock:** unlocking keeps the projection marks, so projected colors become projections again (they do not turn into pins). Printing the attendance sheets or color team list of an unlocked quarter asks first; other reports do not.
> - **Old buttons:** Re-draw refuses a started or locked quarter and what it draws counts as a projection; Start new year clears the plan.
> - **Known limit:** the last open quarter can come out one child uneven (no look-ahead); the grid says so. The demo shows no *ready to lock* quarter.
> - Not built: friend placement, class rules, the Visitor tab, size limits (parts 2 and 3).

Design for the Gonkulator (AWANA season database app, `database/dev/app`). Written 2026-11-03 after a conversation with Mike, the club's volunteer leader. Everything marked **Mike decided** came from him. Everything marked **My call** is a default I chose and he can reverse. App versions stay in the 1.50.x series (third number only) until Mike says otherwise.

## Why

Color teams (Red, Blue, Green, Yellow) are how Sparks and T&T children play games all year. Today Mike runs the year from a spreadsheet: every possible four-quarter color order (24 of them, for example R-B-Y-G) gets a random number, and each child is given one order, so nobody repeats a color in the year. It works until a new child arrives, a child leaves, teams are lopsided, or a team simply shows up thinner than the others week after week. Mid-quarter moves are then requested, either because one team's attendance is consistently low or to split a friend group.

The app already has a team engine (`teams.js`): it assigns one quarter at a time, keeps colors already filled in, never repeats a color a child has had, keeps former teammates apart, and balances by head count using a max-flow search. It also has dated mid-quarter moves (`Season.setTeamMove`), a one-night exception (`Season.setNightTeam`) and an audit. What it lacks is the year view, the lock-and-print workflow, recalculation that minimises disruption, attendance-aware balance, and a way to take in a child who is not in Planning Center.

## Goals

1. Show a whole year of teams at once, with every quarter clearly **locked**, **ready to lock**, or **projected**.
2. Let Mike decide and edit teams by class, by group (Sparks, T&T) or for the whole club, and for one child on the Person tab.
3. Recalculate quarters that have not started after a manual edit, offering the change that moves the fewest children and saying how many it moves.
4. Use past attendance, visibly, to help balance teams, and explain every suggestion.
5. Support mid-quarter moves and visitors.
6. A **Visitor** tab: a fast door check-in that returns a pick-up code, a class and tonight's team.
7. Class rules (which grades go in which class) that Mike can change per class and per season.

## Non-goals

- No automatic reshuffling of anything locked, pinned, or hand-moved.
- No new attendance capture, no signer tracking (see earlier decisions in this project).
- No Planning Center integration or writing back to Planning Center.
- Class size limits are built as an option but **off for this club this year** (Mike decided).
- No change to the file's identity: older files must still open, and nothing derivable is stored (see Constraints).

## Anti-goals (a failure even if it technically works)

- Moving a child who was hand-placed or hand-moved without being asked.
- A projection that changes every time the file is opened.
- Real children's names, contacts or medical details ever landing in test data, demo data, screenshots or the Git repository.
- A recalculation that silently moves many children.
- A Visitor entry that Mike cannot finish in under a minute at the door, on a phone.

## Constraints

- Vanilla JS single-page app; match existing code style, conventions and tests (`test/*.test.js`, Playwright browser tests). Phone layouts matter: Wednesday club night is run from a phone.
- The data file stays small. Mike's rule: never store a value you can derive; the file is written compactly (version 5). Older files must open and upgrade in memory; a newer file is refused by an older app. Any new stored field needs an upgrade path and a test, and the file format version must change only if needed.
- Real children's data (names, phones, allergies) must never reach GitHub. A private repo with a pre-commit hook and an allow-list `.gitignore` is planned separately; do not add anything that works against it. Demo data is invented and flagged `fake`.
- Accessibility already done in this app (focus rings, labeled controls, 44px touch targets on phones and touch tablets) must be kept for every new control.
- Existing screens are the style guide: Color teams tab, Person tab, Attendance tab, To do tab, Options tab.

## What Mike decided

### A. The year view (Color teams tab)

- Layout "A": a table that looks like Attendance. One row per child, one column per quarter (Q1 to Q4). A switch chooses **by class**, **by group**, or **whole club**. (Mike picked this layout over a one-quarter-at-a-time tab view.)
- Three visible states per quarter column: **Locked** (solid colors), **Ready to lock** (orange header: the next quarter, waiting for Mike to lock it and print), **Projected** (dashed, a guess that can still change).
- A pin marks a color Mike set by hand. A recalculation never moves a pinned child.
- Under the grid: team head counts per quarter, and expected turnout per team per quarter.
- Buttons: **Lock** a quarter (before printing attendance sheets and team rosters, which happen shortly before the quarter starts), **Recalculate** the unlocked quarters, and the scope switch.
- Editing: on the Person tab for one child, and in this grid for a class, a group, or the whole club.

### B. Locking and recalculation

- Projections show for all four quarters.
- Only quarters that have **not started** can be recalculated. Started or locked quarters need manual edits.
- A recalculation is offered after a manual edit, and the button says how many children it would change ("changes 2 children"). It should pick the arrangement that changes the fewest children while keeping the rules (no repeated color, balance, former teammates apart where possible).
- Changing a locked quarter is a manual edit, recorded as a dated move.

### C. Attendance-aware balance, and explaining it

- Head count stays the default way to balance. The tool should also be able to use past attendance (Mike: "that would be great").
- Mike wants **visibility into how attendance affected the selection**. Decision: a "Why these teams" panel beside the grid. He may switch to per-child inline reasons later ("we can try the panel and switch later"), so keep the reasons data separate from where it is shown.

### D. Mid-quarter moves and visitors in the game teams

- Mid-quarter permanent moves are real and frequent (a team with low attendance, behavior, splitting a friend group). They need a one-step flow from the Person tab and the grid.
- A **tonight only** team is allowed ("you may add it, but I don't know that we will use it").
- A new child's first quarter is usually with a friend or someone they know. Later quarters follow the standard rules.

### E. Visitors and the Visitor tab

- Mike mostly uses Planning Center (PC) registration. The Visitor tab is for a child who is not yet in PC.
- **Mike enters:** emergency contact (name and phone), allergies and medical information, and grade (or for Pre-K, the age and whether the child is potty trained: potty trained goes to Cubbies, not yet goes to Puggles).
- **The tool returns:** a random 4-character **pick-up code**, the **class**, and the **color team** for the night.
- The pick-up code **matches a paper slip** (the parent keeps one half, the child's tag the other).
- **"Mark as regular" does not exist.** If a child is in the PC data, they are a regular. If a child comes more than once, their data must be in PC.
- The contact and medical details are **replaced by PC updates**, or **deleted at the start of the next year** if the child did not return.
- Everywhere a person appears (Roster, attendance sheets, Person tab, and so on) a **[visitor]** bubble shows when the person is not in PC. On the To do tab a visitor stays highlighted with **no Ignore option** until they are in PC.

### F. Class rules

- Configurable **per class**, and stored per **season**: which grades each class takes, and whether it is **hand-chosen only** (the tool never fills it automatically).
- This year: Sparks A is Kindergarten; Sparks B 1st grade; Sparks C Kindergarten overflow and hand-chosen only (small, well-behaved class for the subdued teachers); Sparks D 2nd grade. Last year C was 2nd grade and D was a mix, so the table must be editable. T&T is split by Boys and Girls; the A groups are typically 3rd grade and the B groups 5th, with 4th graders placed to balance the A and B sizes. Many T&T children are hand moved for behavior or friendship, and those moves are never undone.
- **Class size limits:** build as an option per class, **disabled for this club this year**.

## My calls (defaults I chose; Mike can reverse any of them)

1. **Mike decided:** a quarter locks **by itself when its first club night passes, or on a manual action**, such as locking a few days before club when he prints the binder pages (attendance sheets and team rosters). **My call on the manual action:** a Lock button on the grid, and printing a quarter's sheets or rosters while it is unlocked **asks** "Lock Q2 now?" instead of locking silently (a silent lock would surprise him if he only printed a draft).
2. Expected turnout is an **extra row** and the attendance assist is **on by default** (Mike decided; he can turn it off on the Options tab). Past attendance means this season's club nights, plus last season where a child has it, ignoring nights before the child was enrolled. A child with too few nights is given the group average, and the panel says so. The minimum number of nights is a setting.
3. The "why" panel shows, per child, the attendance rate and nights it rests on; per team, head count next to expected turnout; and, for each child a recalculation would move, the reason in a sentence.
4. A friend placement **outranks balance** for that one quarter. If it makes a team a head or two larger the panel says so, but it does not refuse. A friend pair then counts as former teammates, so later quarters keep them apart where possible.
5. A child who appears in PC data after the start of the year gets the **remaining** quarters projected (Q2 to Q4 if they join in Q2), under the standard rules, from the moment they are in PC data. A visitor who is not in PC has only tonight's team.
6. Projections are **deterministic**: store a seed, the pins and the locks, and compute the rest. Nothing derivable is stored. If the compact file cannot carry a seed cleanly, the builder may store the unlocked projection, but must say why.
7. A drop-in visitor (not yet in PC) is left out of team sizes and projections, and is shown on tonight's attendance sheet for the room with their allergies and medical notes visible to the room leaders.
8. A visitor who attends a second time gets a To do item ("visited twice, needs Planning Center registration").
9. The Visitor form asks **boy or girl** only for 3rd grade and up (T&T splits by it).
10. Kindergarten visitors go to Sparks A automatically. They go to Sparks C only if Mike hand-picks it. A 4th grader goes to whichever T&T group (A or B) is smaller. A child in a hand-chosen class is never auto-placed.
11. Class rules are copied from the previous season when a season starts, then edited.
12. The pick-up code alphabet leaves out look-alike characters (0 and O, 1 and I, and similar); codes are unique within a night. The slip shows the code, class and team, with a tear-off half.
13. **Locking is per quarter for the whole club** (sheets and rosters are printed for everyone at once). Unlocking is possible with a confirmation and is recorded in History, because Mike will sometimes lock too early.
14a. **Mike decided:** because several things compete in balancing, the **Options tab lets him configure the priorities**. **Defaults are mine.** Hard rules that are never configurable: locked quarters, pins and hand moves, and hand-chosen classes. The soft priorities, in default order from most to least important, each with an on/off switch and a way to reorder: (1) never repeat a color within the year; (2) a friend placement for a new child's first quarter; (3) even head count per team; (4) keep former teammates apart; (5) even expected turnout from past attendance (default **on**, Mike decided); (6) spread each grade across teams (default **on**, Mike decided). The "why" panel names the priority that decided each close call, so Mike can see which setting to change. Higher priorities win when two collide, and the engine must say when one lost.
14. **Mike decided:** the engine, the grid totals and the expected-turnout row work **per group** (Sparks, T&T), as `teams.js` does today, because each group plays its games together. The by-class view is a slice of the group's teams. Classes are **not** balanced within themselves (Sparks A does not need its own even four teams).
    **Grade balance is an optional, lowest-priority consideration, on by default** (Mike: "would be a nice feature" and he asked for it to default on, while saying he is not convinced the club's population supports it). It ranks below head count, never repeat a color, pins and friend placement, and below the attendance assist; it only tries to spread each grade across the four teams, and the "why" panel says when it could not or when the group is too small for it to matter. It stays switchable on the Options tab. Keep it simple: a soft tiebreak, not a search of its own.
15. Past nights keep the team a child had on that night. A move or recalculation changes only nights from its date onward, so earlier game points never change.
16. Build order: (1) the year grid, projection, locking, recalculation and the "why" panel; (2) mid-quarter moves and friend placement; (3) class rules and the Visitor tab with the [visitor] bubble and To do behavior. Each part ships as its own 1.50.x release.

## Left to the builder

- The recalculation algorithm. The existing engine uses a max-flow search; a minimum-change recalculation is a cost on top of that. Any approach is fine if it respects the constraints and can state how many children it changed.
- The shape of stored data (seed, pins, locks, class rules, visitor records) and the upgrade path.
- Exact wording, layout details, slip design, and whether pins reuse `teamMoves` or a new structure.
- Tests: new unit tests for the engine and class rules; Playwright tests for the grid, the Visitor tab, and the [visitor] bubble; demo data to show all three quarter states and a visitor (invented names only).

## Success

Mike can, in one sitting before a quarter starts: see next quarter's projected teams, adjust a few by hand, press Recalculate and see "changes N children", read why, lock the quarter, and print sheets. At the door he can check in a visitor on a phone and hand over a slip. At the end of the season nothing he hand-placed has been changed by the tool.
