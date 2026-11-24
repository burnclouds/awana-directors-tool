# N3 round 7: Drive browser test fix and false calendar conflict (brief for Sol)

**Source:** Astra's read-only diagnosis of two failing tests in `dev/app/test/drive-inplace-browser.test.js`.

**Roles:** GPT Sol (Low). Do not commit or push. Do not run the full sweep. Run only the closest Node tests (`node dev/app/test/datamerge.test.js`, `node dev/app/test/drive.test.js`); report pass/fail counts only.

## 1. Busy-save test (test file only)

**Problem:** `drive-inplace-browser.test.js` around line 57: the fake server returns 503 on the first PUT. The app classifies 503 as an uncertain outcome and retries, so the test's expectation at line 128 fails.

**Required:** change the fake's first-PUT status from 503 to 429 (the app's "busy" status). Replace the fixed sleep near line 127 with a wait for the fallback download to finish. Do not change the assertions.

## 2. False calendar conflict (app code, `dev/app/datamerge.js`)

**Problem:** the interactive merge normalizes both inputs to the field order `Date, Quarter, Type`, but compares against the original base, which keeps `Date, Type, Quarter` (see `datamerge.js` about lines 77–84; `app-drive.js` about line 154). `Season.merge3` compares serialized values (`season.js` about lines 1523 and 1579–1583). Identical data with different field order is therefore reported as a change, which pauses saves for no real reason.

**Required:** make the base and both sides use the same normalized field order before comparison. Do not change what counts as a real change. Keep the existing merge behaviour otherwise.

**Tests:** in `dev/app/test/datamerge.test.js`, add a case: a base and a copy with identical values but different field order produce no conflict. Add a case that a real value change still produces one.

## 3. Report back

- Files changed and line ranges.
- The pass/fail counts for the closest Node tests.
- `git status --short`.
- If you cannot fix item 2 without changing merge behaviour, stop on item 2, report why, and still complete item 1.

Do not change any other app code. Do not commit.
