# Review fixes: roadmap for R1 to R21 (2026-11-12)

> This is the **order of work** for every item from the whole-project review (`dev/REVIEW-2026-11-12-whole-project.md`, BACKLOG "Review 2026-11-12") and the format-spec gaps (`docs/DATA-FORMAT.md` section 15). It is not a task list. Each wave gets its own task-level plan, written when the wave starts so it reflects the code as it is then. Wave 1 is written now: `2026-11-12-wave1-release-and-gates.md`.

**Spec for the data-file items:** `docs/DATA-FORMAT.md`. **Release rule:** every wave ends with the full sweep clean, file versions bumped, CHANGELOG/README/BACKLOG updated, and a deploy only when Mike says "deploy" (project rule).

## Status
| Item | What | Wave | State |
|---|---|---|---|
| R1 | Six sections missing from undo/History/merge | 0 | **done** (`d535fc3`) |
| R2 | Cold start after a deploy mixes releases | 1 | planned |
| R3 | `make-deploy.sh` accepts an identical release id | 1 | planned |
| R4 | Phone sign-off boxes lost 44px targets | 1 | planned |
| R5 | Children's names in a tracked doc | 1 (names out now) + decision (history) | planned |
| R6 | Privacy gates: anonymizer writes before it checks; deploy syncs before it checks | 1 | planned |
| R8 | One command to run every test on TEST data | 1 | planned |
| R15 | `.gitignore` hides manifest, icons and TEST fixtures | 1 | planned |
| R7 | Drive merge-save then edit can overwrite the other leader | 2 | outline |
| R11 | Drive auto-save after the token expires | 2 | outline |
| R16 | File check ignores eleven sections and most of config | 2 | outline |
| R17 | **Redefined 2026-11-13:** keep everything Planning Center outputs, used or not (plus unknown top-level keys) | 2 | plan written (`items/R17-planning-center-capture.md`), format version 6, **2 questions for Mike** |
| R18 | Legacy spellings nothing migrates (`driveDirs`, `x_ClubberID`) | 2 | outline |
| R20 | History replay warning on a real file | 2 | outline (investigate first) |
| R21 | Direct reads of no-date pairs | 2 | outline |
| R10 | Warn when an imported export is older than the data | 2 | outline |
| R12 | Other small phone targets; unsaved state as colour only | 3 | outline, **needs a phone** |
| R13 | Documentation accuracy | 4 | outline |
| R19 | Out-of-date header comment in `season.js` | 4 | outline |
| R14 | Maintainability: split `app-season.js`, dead code | 4 | outline |
| R9 | Crash safety on a phone | 4 | outline, **needs decision** |

## Wave order and why
1. **Wave 1: release path and gates** (R8, R3, R2, R4, R6, R15, R5 names). Small, no data-format change, fixes the only things that can stop a fix reaching a phone (R2, R3), and gives every later wave a one-command check (R8). One release (1.51.06).
2. **Wave 2: data safety** (R7, R11, R16, R18, R20 investigation, R21, R10, R17 after the decision). These touch the save path and the file check; each is its own task with a failing test first. R16 comes first because its per-section checks protect the rest. Two releases if it grows: 2a (R16, R18, R21), 2b (R7, R11, R10).
3. **Wave 3: phone usability** (R12). Needs Mike on a real phone for the last check; the measured sizes are in the review.
4. **Wave 4: docs and structure** (R13, R19, R14, R9). R14 is large and risky; do it last, with the test runner and file check as the safety net, and only after Mike agrees. R9 only after his decision.

Dependencies: R8 before everything (the safety net). R16 before R17 and R18 (they extend the checks). R20 before anyone trusts the replay warning. R14 after R16 and R8.

## Decisions needed from Mike (nothing blocks Wave 1)
1. **R5, history.** The names are also in git history (24 commits; no remote). Remove them from the file now (Wave 1). Rewriting history is destructive and unnecessary while there is no remote. Recommendation: do not rewrite; write a rule that **the repo is never pushed without first rewriting history**, and add a check (Wave 1 task) that fails when any tracked doc contains a real name. Alternative: rewrite now.
2. **R17, unknown keys.** Keep them and write them back (safest for round trips; a newer tool's data survives) or drop with a warning (today's behaviour, made visible). Recommendation: keep and write back, and show them as an info line on the Validate tab.
3. **R9, crash safety.** An unsaved-work draft kept in the browser's session storage until the tab closes. Cost: children's data sits in browser storage while the tab is open. Recommendation: not worth it while auto-save and the Save button exist; instead make the unsaved state loud (R12) and keep auto-save's default off but visible. Decide after Wave 3.
4. **R14, splitting `app-season.js`.** Large change with no new behaviour. Recommendation: split only save/undo/History out first (the part R1 and R7 touch), and only after Wave 2.

## Risks that apply to every wave
- Auto-mode blocks scripted file rewrites (`sed -i`, inline scripts that write files): use the Edit and Write tools. Tests may run anything.
- Never read or print a real data file; use `dev/test-data` and invented ids. Diagnostics print counts and kinds, never names.
- Real-data tests (`browser`, `anonymized-data`, `reports-season`, `roster`, `import-test-file`) need the real files and are run by hand; Wave 1 task 1 makes the TEST-data ones run without arguments.

## Sizes
Wave 1: about 7 tasks, one session. Wave 2: about 8 tasks, two sessions. Wave 3: 2 tasks plus a phone check. Wave 4: R13 and R19 small; R14 and R9 each their own plan.

## Outlines for waves 2 to 4 (to be expanded into plans when each starts)

**R7 Drive merge then edit** (`app-drive.js` around lines 114 to 151). Failing test first in `drive-inplace-browser.test.js`: leader A saves, leader B saves a merge while A is editing; A's next save must still contain B's changes. Fix: advance `c.rev` only when `c.base` and the open season hold the merged content; when the leader edited during the save, re-merge before the next upload. Reproduce before fixing (the review only traced it).

**R11 Drive auto-save** (`drive.js:47`, `app.js` `download`, `app-season.js` `saveNow`). Tests: an auto-save whose token request is blocked shows a quiet status line, does not alert, does not download a file, and retries on the next click; `markSaved` runs only after the Drive promise resolves.

**R16 file check** (`validate.js`). One check per section and per config area from `docs/DATA-FORMAT.md` sections 5 and 6, each a failing test first (corrupt value, wrong type, unknown id as a warning). Add to `season-sections.test.js` a rule that every `SECTIONS` entry has a validator check, so a new section cannot be added without one.

**R17 unknown keys** (after the decision). Keep unknown top-level keys through `fromJson` / `toJson` (stored in a non-tracked bag), list them on the Validate tab, test the round trip. The anonymizer still fails closed (it reads the raw file).

**R18 legacy spellings.** On open, move `driveDirs.open|data` to `club` when `club` is empty and drop `x_ClubberID` from `v`; update the Drive readers and the anonymizer; tests for both; CHANGELOG mention (format change rule).

**R20 replay warning.** Investigate on the TEST file plus scripted operations (`renameAward`, restore, year rollover, book rename, import): find which change data without logging, then log them or teach the replay to skip. Deliverable first: a short note of causes with a failing test per cause.

**R21 no-date reads.** Grep the reports and sheets for direct reads of `given`, `progress`, `received` and uniform given dates; route each through `givenShown`, `receivedShown`, `isSignNoDate`; one test that a no-date award prints no date on every report that shows given dates.

**R10 older export.** In `importPc` compare the export's date (from its file name) with `roster.pcAsOf`; if older, ask before applying; test with an older TEST export.

**R12 phone targets.** Raise To do inline inputs, name links, Uniforms dates and the Attendance move button to 44px at 390px; show unsaved state as text or an icon on a phone; extend `mobile-audit.js` (Wave 1 adds the touch-size check) to cover them; Mike checks on a real phone.

**R13 docs.** README header version and the localStorage sentence, the 29 unlisted tests, BACKLOG header and the stale `versions.test.js` note, "Progress tab" wording in the manual and `todo.js:45,51`, the splash "Nothing is uploaded" line.

**R19 header comment.** Replace the section list in the `season.js` header with a pointer to `docs/DATA-FORMAT.md`.

**R14 maintainability.** Remove `dueFor` (unused), `ui.attHold`, `loadDirs` and `KEY` leftovers first (tiny); then, only if agreed, split save/undo/History out of `app-season.js`.

**R9 crash safety.** Only after the decision above.

## Update 2026-11-13: status and the detailed plans
- **Wave 1 is done in dev (release 1.51.06, not deployed):** R2, R3, R4, R5 (names out; history left as is, rule: never push without rewriting it first), R6, R8, R15. R1 was done earlier. **R9 is skipped** by decision (make the unsaved state louder under R12 instead). **R22** (phone splash header covered by the menu bar) is a new backlog item, not yet planned.
- **Detailed plans** (written 2026-11-13; each checked against the code, and each lists where the earlier outline was wrong; where a wave plan and an item plan differ, the item plan wins):
  - Waves: `2026-11-13-wave2-data-safety.md`, `2026-11-13-wave3-phone-usability.md`, `2026-11-13-wave4-docs-and-structure.md`.
  - Items in `items/`: R7 `R7-drive-merge-then-edit.md`, R10 `R10-older-export-warning.md`, R11 `R11-drive-autosave-token.md`, R12 `R12-phone-targets-and-unsaved-state.md`, R13 `R13-documentation-accuracy.md`, R14 `R14-maintainability-split.md`, R16 `R16-file-check-coverage.md`, R17 `R17-planning-center-capture.md`, R18 `R18-legacy-spellings.md`, R19 `R19-season-header-comment.md`, R20 `R20-history-replay-warning.md`, R21 `R21-no-date-reads.md`.
- **Order constraints found by the item plans:** R7 and R11 both change the Drive save path (the edit counter and `markSaved`): do them together or R7 first. R18 silently rewrites old spellings in `fromJson` (no History entry). R17 needs format version 6. R20's cause 1 (silent upgrades on open) means a real file will show the replay warning until a one-time Reconcile. Comment-only edits to a `.js` file need no version bump (the minified file is unchanged).
- **Decisions made (Mike, 2026-11-13):** R17: only the registrations export CSV is ever imported; every data item of every export is stored whole (nothing "only counted"). R21: D1 show "no date"; D2 moot (the photo/progress-patch import is dropped: removed in R14 Task 0); D3 remove `givenOf` (R14). R16 D5: a damaged section must warn and must never be silently emptied or erased on save (kept raw via the R17 bag). General rule: **the app never silently drops or empties data.**
- **R22 placement:** plan `items/R22-phone-splash-header.md`. It is a small phone-only CSS fix (probable cause: the splash `z-index` 20 is below the sticky tab bar's 31). Do it **first after 1.51.06, before Wave 2**, in the same release if 1.51.06 is not deployed yet; Wave 3 keeps a pointer to it.
- **(Superseded) Decisions for Mike:** R17: which other Planning Center files he gets, and whether a registration he chooses not to add is kept whole (recommended) or only counted. R21: D1 (earned/finished date when a no-date sign-off is involved), D2 (photo import over a no-date sign-off), D3 (`givenOf`). Others are listed in each item plan.
