# N3 release fixes for 1.51.22 (brief for Codex)

**Owner decision (2026-11-24):** N3 (calendar maker) ships in 1.51.22. Before release, fix the three blocking issues from the independent review of `n-backlog-integration` at 13c1cfb. Everything else in this brief is out of scope unless listed here.

**Branch and location:** work in `~/projects/awana-worktrees/n-backlog-integration` (branch `n-backlog-integration`). Do not touch the `public` branch.

**Rules (from AGENTS.md):** do not commit or push. Run only the closest test file or `--node-only` during work. Do not run the full suite without owner confirmation. No real names or personal data in code, fixtures, or docs. Keep `dev/app/drive-config.js` empty. Do not hand-edit `deploy/`.

**Model:** GPT Astra, Medium effort (complex implementation).

## Fix 1: Drive save can upload before the calendar check runs

**Where:** `dev/app/app-drive.js`, around lines 130–170. The upload happens before `merge(...)` runs. `merge` can throw `kind:'calendar'` from `acceptMerge`, so a conflicting remote revision can end up hidden under our upload.

**Required behaviour:**
- Run the calendar conflict check, and every other merge check, before any upload (`D.update`). If a check fails, do not upload.
- After a conflict, re-read the remote head, re-merge against it, and only then upload. The result is that no save ever overwrites a newer remote revision that has not been merged.
- Keep the existing retry limits and the "stale response after file switch" handling.

**Tests:**
- A pure Node test that simulates a remote revision landing between read and write, with a calendar conflict in that revision. Assert that nothing is uploaded before the merge, and that the remote revision's changes are present in the next upload.
- If feasible, one browser test for the same path. If it is not feasible, say so in the report.

## Fix 2: A blocked calendar save has no way forward

**Where:** `dev/app/app-drive.js` around lines 130–137 (error text "Review the dates and save again"), and `dev/app/app-merge.js` around lines 100–102 (file merge drops the whole merge and alerts).

**Required behaviour:**
- When a calendar conflict blocks a save, show the affected dates in a review panel with a clear choice per conflict: keep the calendar from the other copy, keep ours, or leave the save blocked and export a local copy.
- Leader's earlier choices in the same merge must survive a conflict; do not silently discard the whole merge.
- Auto-save must not repeat the failure silently. It should show one clear status message with a button to open the review.
- Nothing is lost while the review is open. Local work stays in memory until the leader chooses.

**Tests:** Node tests for the choice outcomes, plus one browser test that opens the review, chooses, and saves successfully.

## Fix 3: Blocked calendar edits have no confirmed path

**Where:** `dev/app/app.js` around lines 1510–1527 (protected-date refusal) and around line 1582 (Add date). The calendar maker's season-classification block in `calendar-safety.js` (`propose` and `compare`, around lines 117–138).

**Required behaviour:**
- A correction to a protected date (for example, adding a forgotten past night that has activity) must go through a confirmed correction: show an impact preview (affected records, dates, quarter), require an explicit confirm, and record the change as one History entry and one Undo step. Keep the refusal for changes that would alter recorded attendance, awards, progress, or locked quarters without confirmation.
- A new-season calendar whose sign-offs would change season classification must offer an explicit choice in the preview: adjust the carried-through cutoff with a stated reason, or cancel. It must not silently allow the change. Apply stays disabled until a choice is made.
- Do not weaken any existing guard that protects recorded data.

**Tests:** Node tests for the preview content and the classification choice. One browser test for the protected-date correction confirm path.

## Out of scope (record as follow-ups, do not build)

- Changing the weekday or shortening the range from the maker (review finding 4).
- Retaining full archived rows in the rollover (review finding 7; check and report only).
- Event-only dates in N72 shown as "non-club" (review finding 9).
- Undo and redo coverage beyond the new tests (review finding 6). Add only the tests that cover Fixes 1–3.
- Any change to N71 that enables live Planning Center access, sign-in, or token storage. N71 stays as it is.

## Report back

For each fix: files changed, tests added, tests run (names and results), tests skipped with reason, and any decision you could not make. List the uncommitted changes with `git status --short`. Do not commit. If a fix cannot be completed safely, stop on that fix and say so; do not leave a partial change to a data path.
