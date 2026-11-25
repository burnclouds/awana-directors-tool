# Club-night start and end times, by exception (brief for Sol)

**Branch:** `playtest` (worktree `n-backlog-integration`). Work from the current uncommitted state; do not discard it.

**Roles:** GPT Sol (Low) writes the code. Do not commit, push or publish. Run only the closest Node tests; do not run the browser suite. Report pass/fail counts and `git status --short`.

**Owner decisions (2026-11-25):**
1. The season holds one default start time and one default end time. A club-night row stores a time only when it differs from the default. A row equal to the default shows no time (hidden), so only differences stand out.
2. "Apply to all club nights" changes future club nights only (dated after today and not recorded). Show the number of nights it will change before the user confirms.
3. Event nights always require explicit start and end times, shown on the row. They are never hidden just because they match the default.
4. When No club is selected, only the date and the notes fields are shown. Time, theme, type and every other field are hidden: not set, not cleared, and their stored values are kept.

**Rules:** no record is removed or changed by this feature. Changing a time is not a change to attendance, awards, progress or locked quarters. The live build output must be unchanged. The existing calendar safety checks stay in place. Keep names out of code and tests.

## Required

1. Read the current calendar row fields and the calendar editor (`dev/app/app.js`, `dev/app/calendar.js`, `dev/app/app-calendar-maker.js`, and the season model in `dev/app/season.js`). Find where the calendar row is stored and how it is saved, shared and merged. Do not read whole large files; read the functions involved.
2. Add season-level default start and end times, stored with the season. Add per-row start and end times that are stored only when they differ from the default. Old files with no times must still open with no change.
3. In the calendar editor, show the default times once, at the top. For each row, hide the time when it equals the default; show it when it differs or when the row is an event.
4. Add an "Apply to all club nights" action for a start or end time change. It applies only to future, unrecorded club nights. Show a confirmation that gives the count first. Use one History entry and one Undo step.
5. When a row is No club, hide every field except date and notes. Keep the stored values unchanged.
6. Keep the year-end rules and every existing guard unchanged.

## Tests (Node, invented data only)

- A row equal to the default stores no time; a different time is stored.
- Apply to all changes only future, unrecorded club nights; recorded and past nights are unchanged; the count is correct.
- An event row always carries explicit times.
- A No-club row keeps its theme and type values after save and reload.
- An old file without times opens unchanged, and the live build output is unchanged.

## Report back

Files and line ranges changed, test names and pass/fail counts, the fields and storage format chosen, and `git status --short`. Do not commit.
