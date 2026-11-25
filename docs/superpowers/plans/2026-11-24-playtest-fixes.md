# Playtest channel fixes (brief for Sol)

**Source:** Sonnet review of the playtest channel (branch `playtest`, uncommitted changes on top of 4edcca2).

**Roles:** GPT Sol (Low). Work on the `playtest` branch. Do not push, publish, or commit. Do not run the browser suite. Run only the closest Node tests. Report pass/fail counts and `git status --short`.

**Owner rules:** a playtest build must never write the real club file. Playtest saves go only to the `-playtest` copy. The live build must be unchanged.

## 1. READABLE export must not overwrite the playtest copy (blocking)

**Problem:** the Debug "READABLE copy" button (`dev/app/app-tools.js` about line 210) calls `App.download(..., 'application/json', {local:true})`. In playtest mode, `App.download` (`dev/app/app.js` about line 71) routes every application/json save to `savePlaytest`, so the readable copy replaces the playtest file's data.

**Required:** the readable export must not write to the playtest copy. In playtest mode, it downloads the readable file as a plain download, or is disabled with a short message. Choose the plain download only if it cannot touch the playtest file in any way. Real season saves keep going to the playtest copy.

**Test:** in playtest mode, the readable export does not change the playtest copy's contents, and the real season save still writes the playtest copy.

## 2. Playtest and live must not share browser storage keys (blocking)

**Problem:** `/playtest/` shares an origin with the live app, so localStorage is shared. These keys are not namespaced in playtest: `awana-drive-pending` (and its `-corrupt` key), `awana.settings`, `awana-autosave`, `awana-updates`, `awana-drive-keepname`, and the handoff key. `awana-drive-last` and the handoff key were partly suffixed; check them too.

**Required:** in playtest mode, every key listed above is read and written under a playtest prefix (for example `playtest:` in front of the name). Live mode keeps the existing key names exactly. A playtest session must not read or change any live key, and a live session must not read playtest keys.

**Tests:** in playtest mode, writing a setting or pending entry does not change the live key; in live mode the keys are unchanged.

## 3. Save-path test (add)

Add one test in `dev/app/test/playtest-channel.test.js` for the `App.download` intercept: a real season save in playtest mode goes only to the playtest copy, and the original file's writes list stays empty. Use the existing fakes with invented data.

## 4. Report back

- Files changed, line ranges, and the new test names.
- Node pass/fail counts for `dev/app/test/playtest-channel.test.js` and the closest drive and datamerge tests.
- Whether the live build output differs from before. Compare `deploy/` for the live channel against the output of the previous commit's build where you can. If you cannot, say so.
- `git status --short`.
