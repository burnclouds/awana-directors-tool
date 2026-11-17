# Mid-quarter team moves (draft rules, 2026-11-12)

Status: DRAFT for Mike's approval. Written from Mike's rule and from what the app already does (`season.js` teamMoves, teamOn, kidGamePoints; `teammoves.test.js`).

## Mike's rule (the principle)
A mid-quarter move changes the team a clubber plays on from a date onward. **Progress is untouched.** Game points are tracked **by date**, so a clubber gets the points they received for each date they attended, on whatever team they were on that date.

## Rules

1. **A move has a date.** It says: from this club night on, this clubber is on this color. The quarter's own color (the plan) is never edited; the move sits on top of it. Several moves in one quarter are allowed; the latest one on or before a night is the team for that night.
2. **A night belongs to the team the clubber was on that night.** The team for a night is, in order: a one-night exception for that night (a fill-in or visitor), else the latest move on or before the date, else the quarter's color.
3. **Points follow the night, not the clubber's current team.** A clubber's game points for a quarter and for the year are the sum, over the nights they attended, of that night's points for the team they were on that night (place points plus spirit points). Earlier nights never change when a move is made; the new team's points count only from the move date on.
4. **Only attended nights count.** A night the clubber was absent gives them no points, whichever team they were on. A move date on a night they missed still takes effect from that date (the first night they attend on the new team gives the new team's points).
5. **The move day itself counts for the new team.** The move takes effect on its own date: that night's games go to the new team.
6. **Team standings are not touched by a move.** A team's points for a night are that team's result for the night. Moving a child changes who receives the individual points, not what the team scored.
7. **Progress, awards, attendance, books, pace and the handbook are not affected by a move.** Nothing on the progress sheet depends on the color.
8. **A move can be dated in the past** (the clubber has really been playing on Blue since 10/21 and it was only entered today). Their points from that date are recalculated from the nights on file; the History entry says so. A date outside the quarter, or before the first club night, is refused with the reason.
9. **A move is one step.** From the Person tab: "Move to another team from <date>", color and date, then Add. From the Color teams grid: press the child's color in a played or locked quarter, give the date, then the color (already built). The move shows in the child's History and can be removed (the nights go back to the earlier team).
10. **Moves are never made by the plan.** A recalculation or Fill never creates, changes or removes a move; moves and pins made by hand are never overridden.
11. **What a move does to the next quarters.** (Decision 1 below.)
12. **Display.** The child's Person tab shows the team night by night in the attendance table (the color that night), and the points line says "Q2: 14 place + 6 spirit (Green until 10/28, Blue after)". Reports and Statistics use the same per-night rule, so every screen agrees.

## Already built (checked in the code)
- Dated moves, one-night exceptions and the per-night team (rules 1, 2, 5): `Season.setTeamMove`, `removeTeamMove`, `setNightTeam`, `teamOn`, `teamResolver`.
- Points by attended night on that night's team (rules 3, 4): `Season.kidGamePoints`, used by Statistics, the Awana store points, and the Person tab.
- Team standings per team, unaffected by moves (rule 6): `Season.standings`.
- The one-step flow from the Person tab and the Color teams grid (rule 9): `app-person.js` (peMoveAdd), `app-teamgrid.js`.
- Plan never moves a hand placement or a move (rule 10): `teamplan.js`.

## To check or add
- Rule 8, a backdated move: confirm the date check (inside the quarter, on or after the first night) and the History wording; add a test.
- Rule 12, the readable line "(Green until 10/28, Blue after)" on the Person tab: probably not shown today; small addition.
- A report line for a clubber with a move, so a leader printing the standings can see why the individual totals differ from the team's.
- Tests for the rules as a set (see below).

## Decided by Mike (2026-11-12) and built
1. **Both colors count as played** for the no-repeat rule. But a Quarter 1 move can leave no unused color for Quarter 4, so when all four colors are used up the child may have **the color they spent the fewest nights on** (equal time on all four: anything). Built in `teams.js` (`forbidFinal`) and `teamplan.js`, fed by `Season.colorHistory`.
2. **A move may be dated on any club night in the quarter, absent or not.**
3. **Team awards:** the club does not give them; the rule below is kept only as a note in case another club wants one.
Also built: the move date check (a night in that quarter), the readable "Green, then Blue from 11/4" line on the Person tab, the "Changed team this quarter" note on the Game standings report, tests (`mid-quarter-moves.test.js` 21, `mid-quarter-moves-browser.test.js` 5), manual text.

## Decisions for Mike (answered above; kept for the record)
1. **Does the old color count as "had" for the no-repeat rule in later quarters?** A clubber who played Green for 5 nights and then Blue for 4 nights in Q2 has played two colors this year. Recommended: **both count as played** (so they should not get Green or Blue again in Q3 or Q4), the same as the rest of the year's no-repeat rule. Alternative: only the color they ended the quarter on counts.
2. **Is the move date the night they first play on the new team, or can it be set on a night they were absent?** Recommended: any club night in the quarter, absent or not (rule 4).
3. **Team awards at the end of a quarter or year** (if the club gives one to the winning team's members): who gets it? Recommended: a clubber is a member of the winning team if they attended at least half of that team's nights as a member (or whatever the club already uses). Needs your rule; the app does not hand out a team award today.

## Test cases (to write once approved)
- A clubber on Green for nights 1 to 3 and Blue from night 4: points for nights 1 to 3 come from Green's results, nights 4 on from Blue's; the earlier nights do not change when the move is added.
- Absent on night 2 (Green): no points for night 2, and the quarter total is the other nights.
- A move dated on the night they were absent: the first attended night after it scores on the new team.
- A backdated move recalculates only the nights from its date; removing it restores the earlier totals.
- Two moves in one quarter (Green, Blue, Red): each night uses the latest move on or before it.
- A one-night exception beats a move for that night only.
- Team standings are the same before and after a move.
- Progress sheet, awards earned and pace are identical before and after a move.
- A recalculation of the plan leaves the move in place.
- Statistics, store points, Person tab and the standings report all show the same individual totals.
- A move date before the first night of the quarter, outside the quarter, or not a real date is refused with the reason.
