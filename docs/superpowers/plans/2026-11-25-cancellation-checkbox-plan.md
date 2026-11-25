# Cancellation checkbox: plan (not yet briefed to Sol)

**Status:** plan for review. Branch `playtest` (worktree `n-backlog-integration`).

## Goal

A "Cancelled" checkbox on each club-night row. Ticking it marks the night cancelled. Everything that depends on cancellations is updated when the change is saved, or a summary of the effects is shown at the moment of change. No dependent check is left stale.

## Design (recommended)

- **One source of truth.** The checkbox writes the row's existing State value (`Cancelled`) and nothing else. It is not a second flag. Every reader already keys off State, so no reader needs a new field. If the checkbox and the State field both exist, they must stay in step: unticking sets State back to `Meets`.
- **Effects are recomputed, not remembered.** Totals, season start, attendance grace, quarter locks, and warnings read the calendar at the time they run. The plan requires that every dependent view re-reads the calendar after a change, and no cached result survives a save.

## Dependents to update (from the existing code, to be verified by reading)

1. **Totals and counted nights** (`season.js` `counted`, `nightList`, `heldNights`).
2. **Season start** (`season.js` `seasonStart`): a cancelled first night must not move it (owner decision, round 4).
3. **Attendance grace** (`blueJewelRequirements`, `isRecordedClosure`): applies only from the cancelled date forward, and only for nights with recorded activity.
4. **Quarter locks** (`teamplan.js` `firstNight`, `reports.js`): recalculate from the first counted or excused-with-activity night.
5. **Warnings and checks** (`calendar-safety.js` `compare`, `noticeText`, sign-off review, pace): re-run on save.
6. **Reports and the Progress and Attendance screens**: show the warning, hide nothing.

## Change-time summary

When the box is ticked or cleared, before the change is saved, show one summary listing:
- the night's date and theme;
- the number of children with recorded activity on that night (names only in the app, never in files or history);
- the change to totals, season start, and each affected jewel requirement, with the new value;
- the change to any quarter lock;
- the number of future club nights affected, if any.

Confirm with one OK. The change is one History entry and one Undo step. Undo restores the checkbox and every dependent value.

## Save-time refresh

After a save, the warnings and checks run again from the saved calendar. A warning that no longer applies is removed. A new one is shown in the same notice area.

## Rules

- No record is removed or changed by ticking the box. Attendance, awards, progress and locked quarters stay in place.
- Un-ticking restores every dependent value exactly as before, because nothing was stored except the State value.
- Names are shown in the app only, never written into a file, a History label, or a test fixture.
- Owner decisions from round 4 and round 7 are unchanged.

## Tests (plan)

- Ticking a night with activity: summary shows the child count and the total change; one confirm; one Undo restores everything.
- Ticking the first night: season start stays where it was.
- Un-ticking: every dependent value returns to its earlier value.
- A night with no activity: summary shows no child count, and no warning.
- Save-time refresh: a warning that depended on the night disappears after the box is cleared.
- The live build output is unchanged.

## Question for you

Should the checkbox be the **same** as the State value **Cancelled** (my recommendation), or a **separate** flag that can be ticked on a night that is also set to a different State?
