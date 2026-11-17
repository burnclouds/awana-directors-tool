# R19: the `season.js` header points at the spec — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The header comment of `dev/app/season.js` stops keeping its own (stale) list of data sections, points at `docs/DATA-FORMAT.md` instead, and a test keeps a section list from creeping back.

**Architecture:** Comment-only change to `season.js` lines 2 to 23, plus one test case in the existing `dev/app/test/data-format-doc.test.js`. No behavior change, no data-format change, nothing shipped changes (see "Version and release" below).

**Tech Stack:** Vanilla JS, Node 24 (node test only; no browser test needed).

**Spec:** BACKLOG R19; roadmap `2026-11-12-review-fixes-roadmap.md` (R19 row, Wave 4); refines Task 2 of `2026-11-13-wave4-docs-and-structure.md` (this file replaces that outline; the Wave 4 plan should link here).

## Global Constraints
- Use the Edit and Write tools to change files. Tests may run anything.
- No real data, no real names; the new text uses none.
- Tests run from `dev/app`: `node test/data-format-doc.test.js`.
- Do not deploy; Mike says "deploy". Commit messages end with the two attribution lines given in the session.

## The claim, checked (2026-11-13, `season.js` 1.59.1)
| Claim (BACKLOG R19) | Verdict |
|---|---|
| The header lists sections "up to `progress`" | **Loosely worded.** It lists `attendance`, `games`, `awards`, `given`, `received`, `doneBooks`, `adults`, `teamMoves`, `handbooks`, `progress`, and after that also `roster`, `calendar`, `rotation` and `history` (lines 5 to 22). |
| It omits nine sections: `givenNoDate`, `held`, `flags` and the six newer | **Holds.** Of the 23 in `Season.SECTIONS` (line 1146) it omits `givenNoDate`, `held`, `flags`, `progressNoDate`, `extraSheets`, `announcedNoDate`, `blueWings`, `blueOverrides`, `blueDrops` (nine), and also `config` (a tenth, not counted by the review). |
| Replace with a pointer and "keep only the short shape list" (BACKLOG) | **Changed by this plan:** keep **no** shape list. Any list in this comment is a second copy of `SECTIONS` and of DATA-FORMAT sections 3 and 5, and it is the copy that drifted. The shapes are in DATA-FORMAT section 5, which `data-format-doc.test.js` already pins to `Season.SECTIONS`. |
| The facts the header holds besides the list are in the spec | **Holds:** team on a night (`teamOn`), handbook string (`handbookParts` / `setHandbook`), packed `pc` (`packRoster` / `unpackRoster`, version 5), person ID format (DATA-FORMAT 2.3), "never stored" (section 8), award life cycle (9.2). Nothing is lost by dropping them from the header. |
| Wave 4 constraint "bump the version line, including a comment-only change (`make-deploy.sh` compares the files)" | **Wrong for scripts.** `make-deploy.sh` compares the **minified** build with `deploy/app` (`cmp -s "$b" "$d"`), and `dev/tools/minify.js` runs terser with `comments: false` and keeps only line 1. A comment-only edit gives a byte-identical build, so make-deploy sees no change and asks for no bump. (The rule does hold for `.html`, which is compared as written.) |

## Version and release
- **Do not bump `season.js`.** The shipped file is unchanged; bumping would change line 1, make the build differ, and force a release bump for nothing. If a later task in the same release changes `season.js` code, it bumps then (Wave 2 does).
- The Wave 4 plan's global constraint should be corrected to: "every changed `.js` file whose **minified** output changes bumps its version line (a comment-only change does not); every changed `.html` file bumps." (One-line edit to that plan, by whoever executes this; not done here.)
- **CHANGELOG:** one line under the next release's notes, e.g. "`season.js` header comment no longer keeps its own list of sections; it points at `docs/DATA-FORMAT.md` (R19). Comment only, nothing shipped changes. `data-format-doc` test (8) keeps a list from coming back."
- **BACKLOG:** mark R19 done with the date and "no shape list kept (any list drifts)".

## File Structure
| File | Change | Responsibility |
|---|---|---|
| `dev/app/test/data-format-doc.test.js` | modify | One new test: the header names the spec and holds no section list. |
| `dev/app/season.js` | modify (lines 2 to 23, comment only) | Header says what the file is and where the format lives. |
| `CHANGELOG.md`, `BACKLOG.md` | modify | Notes above. |

---

### Task 1: The header points at the spec, and stays that way

**Files:**
- Modify: `dev/app/test/data-format-doc.test.js` (one `test(...)` before the final `console.log`)
- Modify: `dev/app/season.js:2-23`
- Modify: `CHANGELOG.md`, `BACKLOG.md`

**Interfaces:**
- Produces: test `the season.js header points at docs/DATA-FORMAT.md and keeps no list of sections` (uses the file's existing `src` variable).

- [ ] **Step 1: Failing test.** In `data-format-doc.test.js` add:
  - `header` = `src` from the start up to the first `(function (root)` (assert it is found).
  - assert `header.includes('docs/DATA-FORMAT.md')`, message `the header does not point at docs/DATA-FORMAT.md`.
  - assert no header line matches `/^\/\/\s+[A-Za-z]+(\[|\s*=\s)/m` (a shape line such as `//   given[id][award] = ...` or `//   roster     = {`), message listing the first offending line.
  - assert no name in `Season.SECTIONS` other than `config` appears in the header as a whole word followed by `[` (`new RegExp('\\b' + k + '\\[')`), a second guard against a list written in another layout.
  Update the file's top comment to mention that the header is checked too. Run: `node test/data-format-doc.test.js`. Expected: FAIL on the new test only (no pointer; `attendance[` shape line), 7 passed, 1 failed.
- [ ] **Step 2: Replace lines 2 to 23** (from "// Season store: ..." through the blank `//` line before the privacy line) with exactly this text; keep line 1 (the version line), the blank line and the privacy line as they are, and change no code:

  ```
  // Season store: everything recorded during one club year, kept in one JSON file keyed by person ID
  // (attendance, games, awards, handbooks, section-by-section progress, the roster) plus the lists and templates they use.
  //
  // The file format is specified in docs/DATA-FORMAT.md: every top-level key, every section and its shape, every encoded value
  // (handbook string, packed Planning Center record, progress keys, no-date pairs), and what is never stored.
  // test/data-format-doc.test.js fails when this file has a section, key or flag level the document lacks.
  // This comment keeps no list of sections on purpose (the old one went stale): the one list is SECTIONS, further down, with its own note.
  //
  ```
  (The words in parentheses on line 2 are a description, not a list: they contain no `name[` and no `name =`, so the test passes; do not turn them into section names with brackets.)
- [ ] **Step 3: Run** `node test/data-format-doc.test.js && node test/season.test.js && node test/season-sections.test.js && node test/versions.test.js`. Expected: PASS (data-format-doc 8 passed).
- [ ] **Step 4: Confirm nothing shipped changed** (optional, needs `npm install` done): `node dev/tools/minify.js dev/app/season.js <scratch>/a.js` before and after the edit (or against `deploy/app/season.js` when deploy/ holds the same 1.59.1) and `cmp` them. Expected: identical. Do not run `make-deploy.sh`.
- [ ] **Step 5: Notes.** CHANGELOG line and BACKLOG R19 done mark as in "Version and release". In the Wave 4 plan, Task 2 becomes "see `items/R19-season-header-comment.md`" and the version constraint is corrected as above.
- [ ] **Step 6: Commit** (no version bump; message says "comment only, minified output unchanged").

## Review focus
1. The edit touches only comment lines 2 to 23; `git diff --stat` shows `season.js` with only `//` lines changed.
2. The new test fails on today's header and passes on the new one, and would fail if someone pasted back a shape list in either layout.
