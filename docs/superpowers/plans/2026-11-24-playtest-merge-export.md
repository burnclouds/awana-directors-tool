# Playtest: merge "Export local copy" must not write the playtest copy (brief for Sol)

**Source:** Sonnet review of the playtest fixes (branch `playtest`, uncommitted).

**Roles:** GPT Sol (Low). Work on the `playtest` branch. Do not push, publish, or commit. Do not run the browser suite. Run only `node dev/app/test/playtest-channel.test.js` and the closest merge test. Report pass/fail counts and `git status --short`.

**Owner rule:** a playtest build must never write the real club file, and playtest saves go only to the `-playtest` copy. A merge export is a download and must not change the playtest copy. The live build must be unchanged.

## Required

- `dev/app/app-merge.js` around line 111 calls `App.download(..., 'application/json', {local:true})` for "Export local copy." In playtest mode, the `App.download` intercept (`dev/app/app.js` around line 71) sends it to `savePlaytest`, which overwrites the playtest copy.
- In playtest mode, "Export local copy" must not write the playtest copy. Choose one:
  - (a) disable the button in playtest with a short message, as the READABLE export now does; or
  - (b) let the intercept skip `opts.local` exports, so they download normally and never touch the playtest copy.
  Choose (b) only if the plain download cannot write any file in the playtest folder. Otherwise choose (a).
- Live mode is unchanged.

## Test

Add one test to `dev/app/test/playtest-channel.test.js`: in playtest mode, the merge "Export local copy" path leaves the playtest copy's contents and the writes list unchanged (or the button is disabled, according to the choice made).

## Report back

Which option was chosen and why, the file and line changed, the test name, pass/fail counts, `git status --short`, and whether the live build output still matches the previous build.
