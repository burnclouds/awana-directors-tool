# N3 round 7: fix the calendar-correction browser test (brief for Sol)

**Source:** Astra's read-only diagnosis of `dev/app/test/calendar-correction-browser.test.js`. All five timeouts are test problems, not app regressions. No app code changes in this run.

**Roles:** GPT Sol (Low) writes the change. Do not commit or push. Change only `dev/app/test/calendar-correction-browser.test.js`. Do not change any file under `dev/app/` other than tests. Do not run the full sweep. Report pass/fail counts only.

## Required changes (test file only)

1. **Reset the test date per case.** Line 52 sets `App.today()` to 2040-09-12 and lines 94–102 leave it there. Each case must set its own date that is consistent with the case's Q1 meeting (September 5). Do not leave an earlier date in place for the next case.
2. **Fresh page per case.** Open a new app page for each case (or clear all open dialogs and pending requests) so one leftover `#ask` dialog cannot queue behind the next case's request.
3. **Scope button matches to the current dialog.** Every `getByRole('button', ...)` inside `#ask[open]` must be scoped to the dialog for that case. Do not let a later case accept an earlier case's button. This affects lines 146–148, 174–178 and 174–176.
4. **Keep the assertions.** Do not weaken what each case asserts. Only the setup, the dialog scoping and the date reset may change.

## Expected result

All five cases that timed out should pass. The case "cancelling a recorded night confirms once and is undoable" should still pass.

## Report back

Lines changed, the pass/fail count for `calendar-correction-browser.test.js` (run it from `dev/app` with the test-tools path, as before), and `git status --short`. If a case still fails, stop and report the failing case name and its error text. Do not change app code to make a test pass.
