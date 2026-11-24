# N3 round 7: checks before bundling into 1.51.22

Status: round 7 and round 7b are implemented, uncommitted. Node tests pass (drive 39/39, plus the round-7 files). The checks below have not been run.

## A. Targeted browser tests (run on your machine; the sandbox cannot start Chromium)

From the worktree `dev/app` folder, with the setup from memory `awana-app-test-setup`:

```
node test/calendar-correction-browser.test.js
node test/calendar-maker-browser.test.js
node test/drive-inplace-browser.test.js
node test/drive-autosave-browser.test.js
```

Report each file's pass/fail counts. Do not run the full sweep without asking.

## B. Manual browser checks (TEST club only)

1. Cancel a recorded night (Sparks, with attendance and a dropped jewel). The dialog shows the child count. Confirm: totals drop by that night, the attendance requirement drops by one from that date forward, and no record moves. Undo restores everything in one step.
2. Cancel an empty night: no dialog.
3. Excuse a recorded night in a locked quarter: one warning, one confirm, lock recalculates.
4. Change a recorded Club night to Event: one warning, one confirm.
5. Move the date of a recorded night: one combined dialog, and typing a wrong phrase leaves the calendar unchanged. `MOVE NIGHT` applies the move.
6. Blocked browser storage (simulated): saves still work, with one message.

## C. Live Drive checks (TEST-named copy of your file only)

1. Save, reload, reopen: no warning, data unchanged.
2. Two browser profiles, saving in turn: no "keeps changing" error.
3. Forced race: pause profile A between its head check and its upload; change the file from profile B; confirm A does not overwrite B. Note whether Drive returns 412.
4. Lost reply: after a save, reload and reopen. The displaced revision is pinned and named.
5. Corrupt saved check: set the `awana-drive-pending` value in localStorage to `{bad`; reload. Confirm the unreadable message. Save a second file. Reload again; the warning still appears.
6. Version history after tests 3 and 4: the displaced revision is kept.

## D. Before any push

- Names check against your real data file (`node dev/tools/check-docs-for-names.js <real-data.json>`), run by you.
- The committed backlog plan change on `public` is already done.
