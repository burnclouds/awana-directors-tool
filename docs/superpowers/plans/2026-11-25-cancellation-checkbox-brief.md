# Cancellation checkbox: brief for Sol

**Full plan:** `docs/superpowers/plans/2026-11-25-cancellation-checkbox-plan-v2.md` (read it first). Where this brief and the plan differ, this brief wins.

**Roles:** GPT Sol (Low) writes the code. Work on the `playtest` branch. Do not commit, push or publish. Do not run the browser suite. Run only the closest Node tests. Report pass/fail counts and `git status --short`.

**Playtest-only code:** every new line must sit inside `// BEGIN PLAYTEST` / `// END PLAYTEST` blocks. The live build output must stay unchanged. Bump the playtest suffix as the plan says.

## Owner decisions (2026-11-25)

1. **Empty night with no other effect:** show a notice only. No confirmation.
2. **Planned No-club rows:** the checkbox is disabled.
3. **Adult awards alone:** do not count as recorded activity for grace.
4. **Current-quarter calculation:** unchanged. Do not change it.
5. **Reports:** nothing is hidden. A cancelled night is marked in the attendance and progress reports.
6. **Restore dialog:** when a night is unticked, one sentence says that only Undo restores the row exactly.
7. **First club night cancelled:** the first club night moves to the next counted night, and the season start follows it. This applies **whether or not** the night has recorded activity. This reverses the earlier round-4 rule, which kept the season start on a cancelled first night with activity. Update the plan's tests to match.
8. **Checkbox equals the Cancelled state.** Unticking sets the night back to Meets.
9. **Cancelling a night with recorded activity** keeps every record in place and gives the one-step attendance reduction from that date forward. Names appear in the app only.

## Required

- Implement the checkbox as the Cancelled state, written through the existing structural calendar edit path so the `Recorded Night` marker is set in the same change.
- Show the change-time summary described in the plan, with the first-night effect shown whenever it applies.
- Re-run the dependent checks after save; clear stale notices on Undo.
- Add the first-night rule with tests for both an empty first night and a first night with activity.

## Tests (invented data only)

- Ticking the box on an empty first night: the first club night moves, the season start follows, one notice, one Undo restores everything.
- Ticking the box on a first night with activity: the same result, plus the summary with the child count.
- Ticking a night with activity: records unchanged; one confirmation; one Undo.
- Unticking: the Restore dialog names Undo as the only exact restore.
- A planned No-club row: checkbox disabled.
- The live build output is unchanged.

## Report back

Files and line ranges changed, tests added with pass/fail counts, `git status --short`, and any decision in the plan that could not be implemented as written.
