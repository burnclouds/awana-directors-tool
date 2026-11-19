# Plan: N19 (hide a note or flag on To do) and N20 (a flag ties to the exact spot, child and view) (2026-11-18)

One file, two items. Part A (sections 1-13) is N19. Part B (sections 14-23) is N20. Section 24 is the build order for both and how they interact; section 25 lists wording to correct in BACKLOG.md.

**Status: plan only, nothing built.** N20 was added later the same day. App version in `dev/app/index.html` is 1.51.16 (built in dev and `deploy/`, not released). N19 goes into the next release: either folded into 1.51.16 before it is pushed (preferred, see section 10) or 1.51.17.

Privacy: no real names, phones or emails below. Tests use invented data only (the TEST club has no flags, so each test makes its own).

## 1. What is true today (each line read in the code)

- **Card heading count.** `app-todo.js` 136: `flagRows = Season.noteList(App.season)` (only when `App.flagWhere` exists). Line 138: the heading is `'Notes and flags (' + flagRows.length + ') to review'`. So N is every note and flag in the file except bug reports. No filter, no Ignore.
- **`Season.noteList`** (`season.js` 1003) is `flagList(s)` minus `level === 'bug'`. `flagList` (1002) is every `s.flags` entry sorted by `at` then id.
- **The To do tab badge does NOT count notes and flags at all.** `setBadge` (97) writes `openActions(groups)` (67): the items of Todo groups whose level is `action`. `Todo.compute` (`todo.js`) has no reference to flags (case-insensitive grep: none). The existing `todo-badge-browser.test.js` 28 excludes `.flagcard` from the sum on purpose. The menu badge on a phone (`app.js` 420) adds the To do and Awards badges, so it does not count notes either.
  **The BACKLOG text for N19 is wrong on this point** ("and the To do badge"). Hiding a note will change the card heading and nothing else; the badge cannot go down because notes are not in it. See decision D1.
- **Ignore for other To do items** (`app-todo.js` 4 and 10-19): keys are the text `group|personId|itemText` kept in `config.todoIgnored`, an **array**; `ignored.add/delete` call `App.touch()` (so Undo and History cover it); "show the N ignored" is the visit-only checkbox `ui.showIgnored` (8, 127), turned off by itself when none are left (115); rows show greyed (`tr.off`, `style.css` 44) with "Bring back".
- **Row actions in the card** (141): general note gets Edit + Clear; every other level gets Go + Clear. Handlers at 195-204: `App.goFlag`, `App.clearFlag`, edit in place then `App.setFlagNote`.
- **Where else a note shows** (all unchanged by this item): the child's sheet list (`app-season.js` 880-881, from `Season.flagsOf`), the yellow flag on a box/block/sheet (798-801), the yellow flag at a place (`App.flagPlaceBtn`, 929-932), element flags drawn by `app-flagmarks.js` (21), the click popup (`app-flagpop.js` 10-15), the Debug tab bug list (bugs only).
- **Data.** `addFlag` (`season.js` 893-912) writes `{ kid, level, book, block, key, note, at }` plus optional extras; `setFlagNote` (913) changes `note` only; `clearFlag` (914) deletes the entry. Wrappers `App.addFlag / clearFlag / setFlagNote / addNote` are in `app-season.js` 1295-1296 and all call `touchSeason()` (which records History).
- **History wording** (`season.js` 1371-1383): `flags` path of length 2 gives "<name or Note> · flagged / added / flag cleared / cleared: <note>"; any other path of a non-bug flag falls to "Notes and flags changed". A new `flags.<id>.hidden` path would therefore read "Notes and flags changed" until `describe` learns it.
- **Merge.** `Season.merge3` (1282) merges **by path**; `diffInto` (1240) goes inside objects and treats an array as one value. So `flags.<id>.hidden` merges as its own leaf (a hide on one copy and a note edit on the other both survive); `config.todoIgnored` is one value (two leaders who each ignore a different item clash).
- **Validate** (`validate.js` 256-289) checks listed flag fields only; it does not reject unknown keys on a flag (bug reports already add `status`, `replies`, `tab`, ...).
- **New season** (`season.js` 531, 541): flags are not carried except open bug reports; `todoIgnored` is emptied (538). A hidden note therefore never reaches next year (same as an ordinary note today).
- **Anonymizer:** `make-test-data.js` 279 deletes `out.flags`; 305 drops every History change whose path starts with `flags`. `anon-pc.js` 6 lists `flags` as a handled top-level key. A `hidden` field or its History line cannot reach the public TEST data.
- **Format doc:** `DATA-FORMAT.md` 5.9 (section), 9.4 (fields; bug/element extras are listed there), 2.4 (a record that becomes empty is deleted, not stored empty), 7.7 (only a few real booleans exist; marks are the number `1`).

## 2. Design choice

| | A. `hidden` field on the flag | B. reuse `config.todoIgnored` |
|---|---|---|
| Merge | per flag, per field; two hides never clash | an array is one value: two leaders hiding different notes in one evening clash |
| Undo / History | one path `flags.<id>.hidden`; own wording possible | one path `config.todoIgnored` (whole array shown); wording "Settings changed" |
| Cleared flag | the field goes with the flag | a stale id stays in the list forever (needs a clean-up) |
| New season | notes are not carried, so nothing to clear | list is emptied; a stale id is harmless but dead |
| Older app copy (1.51.16 and earlier) | keeps the field on open, merge and save; shows the note in the list and count as if not hidden; Edit/Clear still work and keep `hidden` | an older copy keeps the array too, but its own Ignore code only reads keys of the form `group|id|text`, so the id is ignored the same way |
| Fit with data format | a flag field, like `status` for bugs | the key-text convention is `group|personId|text`; a flag id would be a new kind of key in that list |

**Recommendation: A, `hidden` on the flag** (what the backlog suggests). Details:

- Value: write the number `1` (the house rule for marks, DATA-FORMAT 7.7); **read any truthy value** so a `true` from a hand edit also works. Unhide **deletes the key** (2.4: no `hidden: 0`). Decision D4 if Mike prefers `true`.
- New `Season.setFlagHidden(s, id, on)`: throws "No such flag." for a missing id, throws for a bug report (out of scope), sets or deletes `hidden`. `setFlagNote` is not changed, so editing a hidden note keeps it hidden.
- New read helper `Season.isFlagHidden(f)` so no caller tests `f.hidden` directly.
- `noteList` is **not** changed (the child's sheet, yellow flags and popups must keep seeing hidden notes). One new helper `Season.todoNotes(s)` returns `{ open: [...], hidden: [...] }` from `noteList`; the To do card uses it.
- Older copy consequence in one line: an older copy ignores `hidden`, so the note comes back in its heading and list; it never loses the field. Every leader presses Update now (already required for 1.51.16, BACKLOG state line).

## 3. Behaviour (what Mike sees)

1. **Card heading** `Notes and flags (N) to review`: N = notes and flags **not hidden**.
2. **Each row** gets a **Hide** button after Go/Edit and before Clear (title: "Hide this note from the To do list. It stays on the child's sheet and in History."). Clear stays as it is (it deletes).
3. **Card line** when at least one is hidden: a checkbox `Show hidden (n)` (label like the Ignore one, `id="tdShowHidNotes"`), visit-only `ui.showHiddenNotes`; forced off when n reaches 0 (same rule as line 115). With it on, hidden rows are listed after the open ones, greyed with `class="off"`, a "(hidden)" tag after the note text, and an **Unhide** button in place of Hide. Go/Edit/Clear still work on a hidden row.
4. **Empty states:** no notes at all: "No notes yet." (unchanged, three existing tests assert it). Notes exist but all hidden and the toggle is off: "Nothing to review. n hidden." (the card and the Add note box stay).
5. **Not changed:** the badge (not counted today), the To do number line, the Tonight strip, the Person tab, yellow flags, popups, the child's sheet list. On the child's sheet a hidden note's line gets a small `(hidden on To do)` status text so a leader is not puzzled; it still has Clear.
6. **Level coverage:** every non-bug level: `general`, `child`, `sheet`, `block`, `box`, `attend`, `team`, `field`, `element`. A hidden `general` note has no place to be seen except the toggle (no child, no spot): it is still in the file and History. Bug reports: no Hide; `setFlagHidden` refuses them.
7. **Undo/Redo and History:** hide and unhide each go through `touchSeason()` so Undo reverses them and History records one entry each. New `describe` text for a path `['flags', id, 'hidden']` (the flag itself is not in the change, so the wording is generic): `Notes and flags · hidden from To do` (when `n` is set) and `Notes and flags · shown on To do again` (when `n` is gone). `labelOf` already names the area "Notes and flags". Merge summary: `datamerge.js` `words()` gives `<id> › hidden` today; add a case so a flag path reads "Note · hidden on To do"; category stays "Flags and notes".

## 4. Files and version bumps (each changed `.js` gets its own bump; `make-deploy.sh` refuses otherwise)

| File | Change | Version |
|---|---|---|
| `dev/app/season.js` | `setFlagHidden`, `isFlagHidden`, `todoNotes`, export them; `describe` wording for the hidden path; header comment on flags (886) gets the field | 1.70.0 to 1.71.0 |
| `dev/app/app-season.js` | wrappers `App.hideFlag(id, on)` (calls `Season.setFlagHidden`, `touchSeason()`), and the child's sheet line `(hidden on To do)` (881) | 1.96.0 to 1.97.0 |
| `dev/app/app-todo.js` | card: heading uses open count, Hide/Unhide button, `Show hidden (n)` checkbox, empty states, handlers (change `tdShowHidNotes`; click `data-hideflag`, `data-unhideflag`); header comment | 1.21.0 to 1.22.0 |
| `dev/app/validate.js` | flags: `hidden` must be `1`, `true` or absent; anything else is a **warning** ("read as not hidden"), a bug report with `hidden` a warning ("belongs to a note") | 1.16.0 to 1.17.0 |
| `dev/app/datamerge.js` | `words()` case for the hidden path (summary text only) | 1.1.5 to 1.1.6 |
| `dev/app/style.css` | only if the 4-button cell needs the existing `.flagcard` rule (294) widened; `tr.off` already exists | no JS version |
| `dev/app/index.html` | How it works, Notes and flags item (line 516): add Hide, Show hidden, Unhide; keep `app-version` rule (section 10) | |
| `docs/DATA-FORMAT.md` | 5.9 and 9.4: the `hidden` field (below) | |
| `CHANGELOG.md` | bullet under 1.51.16 | |
| `README.md` | one line per new test file (`docs-in-step.test.js` fails otherwise) | |
| `docs/reference/playtest-checklist.md` | section 6: the phone check in section 8 | |

Not touched: `todo.js`, `anon-pc.js`, `make-test-data.js`, `datamerge` merge logic, `Season.VERSION` (stays 6; `bug-reports.test.js` already pins it).

## 5. Data format (no version bump)

- New optional field on any non-bug flag: `hidden` = `1`. Written only while hidden, deleted on Unhide. Shown in `DATA-FORMAT.md` 9.4 as a common optional field (after "Optional text fields...") and one sentence in 5.9: "Hiding a note on To do sets `hidden`; Unhide deletes it; the note stays on the child's sheet, in History and everywhere else it shows today; only the To do card leaves it out."
- 5.9 gets the old-copy sentence, same pattern as the bug-report paragraph: no new section, the format version does not change, an older copy opens, keeps and saves the field but does not use it (the note shows in its count).
- `data-format-doc.test.js` (checks every flag level and key is documented) must stay green: add `hidden` to what it looks for if it enumerates fields (check at build time).
- File check: warnings only, as in section 4. Nothing rejects the file, so an older Validate is unaffected (it does not look at the key).

## 6. Anonymizer

No code change. Pin it with a test: a file with a hidden note and a hide in History goes through `make-test-data.js` and the output has no `flags` section and no History change whose path starts with `flags` (add a case to `anonymizer-atomic.test.js`). `anon-pc.js` fails closed on unknown top-level keys only; `hidden` is not top-level.

## 7. Tests (write them first)

**Node: new `dev/app/test/flag-hide.test.js`** (invented data via `Season.blank` + `addFlag`):
1. `setFlagHidden` sets `hidden: 1`; off deletes the key; the flag's note, kid, level, at unchanged.
2. Works for every non-bug level (general, child, sheet, block, box, attend, team, field, element).
3. A bug report: `setFlagHidden` throws; a missing id throws "No such flag."
4. `todoNotes`: open and hidden lists, ordering by `at` kept; `noteList` and `flagsOf` still return the hidden note (the sheet and popups depend on it).
5. `setFlagNote` on a hidden note keeps it hidden.
6. `clearFlag` on a hidden note deletes it (hidden goes with it).
7. `toJson`/`fromJson` round trip keeps `hidden`; a file with `hidden: true` reads as hidden (`isFlagHidden`).
8. History: hide then `Season.record` gives one change at `['flags', id, 'hidden']`; `describe` reads "Notes and flags · hidden from To do"; Undo (`applyChanges` reverse) removes the key; Unhide reads "shown on To do again".
9. Merge: copy A hides note X, copy B edits X's text: both kept, no conflict. A hides X, B hides Y: both hidden. A and B hide the same note: agreed. A hides X, B clears X: the existing clear-vs-edit conflict, and no crash.
10. Validate: `hidden: 1` and `true` clean; `hidden: 'yes'` a warning, not an error; bug report with `hidden` a warning; a file from before this change (no `hidden`) unchanged result.
11. Older copy: take `Season.toJson` output with a hidden flag, run it through the **1.51.16 `season.js` from `deploy/`** (it is the shipped, pre-N19 copy once N19 is built; before that the dev copy) and assert the key survives `fromJson` then `toJson`, and the note is in its `noteList`.
12. New season: hidden notes are not carried (flags are not, except open bugs).
13. DataMerge words: a hidden path reads "Note · hidden on To do", category "Flags and notes".

**Existing tests to extend:** `validate.test.js` (case 10), `datamerge.test.js` (13), `data-format-doc.test.js` (the doc names `hidden`), `anonymizer-atomic.test.js` (section 6), `season-sections.test.js` (no new section: stays green).

**Playwright: new `dev/app/test/flag-hide-browser.test.js`, using `test/lib/app-page.js` (`open()`, `t.test`, `t.done()`).** Create notes with `App.addNote(...)` and `App.addFlag({ level: 'child', kid: <id from App.master>, note })` inside `page.evaluate`; count rows with `#todoWrap .flagcard tbody tr`.
1. Heading says `Notes and flags (3)`; click Hide on one row: heading `(2)`, row gone, the To do badge text unchanged (it never counted notes; assert the badge equals its value before, including empty).
2. The `Show hidden (1)` checkbox appears only when n > 0; ticking it lists the hidden row greyed with Unhide and "(hidden)"; heading still `(2)`.
3. Unhide: heading `(3)`, checkbox gone, the row is open again.
4. Hide survives save and reopen: hide, `Season.toJson(App.season)` into a new page load (or `App.touch()` then reload through the same helper the other browser tests use), heading `(2)`.
5. Hidden note is still on the child's sheet: open that child's Progress sheet; the note line is present with `(hidden on To do)`, and its yellow flag is lit.
6. Go and Clear on a hidden row (toggle on): Go opens the sheet; Clear deletes it and `Show hidden` count drops.
7. Undo after Hide brings the row back and the heading up; Redo hides again; History tab entry reads "hidden from To do".
8. Hiding the last open note with others hidden: "Nothing to review. 1 hidden."; hiding the only note with toggle off then Unhide: normal list; no notes at all still says "No notes yet." (existing `flags-browser.test.js` 59, 66 must stay green).
9. General note: Hide works on a typed note (no Go button), and a hidden general note is found only through the toggle.
10. Element flag (`level: 'element'` via `App.addFlag` with a real trail): Hide leaves its yellow overlay flag on the tab (hidden only affects To do).
11. 390 px wide (`open({ viewport: { width: 390, height: 800 } })`): with Go, Hide, Clear all in a row there is no page-level sideways scroll (`scrollWidth <= innerWidth`) and each button is at least 24 px square (match whatever `touch-targets-browser.test.js` already requires; read that file when writing).
12. Edit a hidden general note: stays hidden after Save.

Run targeted tests only (house rule: full sweep only before a commit, and ask first): `flag-hide.test.js`, `flag-hide-browser.test.js`, `flags-browser.test.js`, `todo-badge-browser.test.js`, `flagpop-browser.test.js`, `person-flags-browser.test.js`, `flag-anything-browser.test.js`, `validate.test.js`, `datamerge.test.js`, `data-format-doc.test.js`, `anonymizer-atomic.test.js`, `docs-in-step.test.js`, `check-docs-for-names.test.js`. Baseline failures and the Playwright `NODE_PATH` setup are in the memory note `awana-app-test-setup`.

## 8. Steps in order

1. Write `flag-hide.test.js` cases 1-13 and `flag-hide-browser.test.js` cases 1-12; run: red.
2. `season.js`: `isFlagHidden`, `setFlagHidden`, `todoNotes`, `describe` wording; exports; bump. Node tests green except validate, merge-words, docs.
3. `validate.js` and `datamerge.js` `words()`; bump. Node tests green.
4. `app-season.js`: `App.hideFlag`, sheet line `(hidden on To do)`; bump.
5. `app-todo.js`: heading, Hide/Unhide, toggle, empty states, handlers; check `style.css` for the 4-button cell; bump. Browser tests green.
6. Docs: `DATA-FORMAT.md` 5.9 and 9.4, `index.html` How it works (516), `CHANGELOG.md`, `README.md` test lines, `playtest-checklist.md` section 6.
7. Targeted runs listed in section 7; `node dev/tools/check-docs-for-names.js` on the docs touched.
8. Version and deploy per section 10. Do not commit, copy or push without Mike.
9. Mike ticks N19 in `BACKLOG.md` (and corrects its badge wording); this plan did not touch that file.

## 9. Risks

- **The badge expectation.** If Mike believes notes are in the To do badge he will see no change there. Mitigation: D1, and the help text says plainly that notes are not in the To do number.
- **Older copies.** A copy not updated shows every hidden note again and its count includes it. No data loss. Covered by the "Update now" step already required for 1.51.16.
- **Two copies, one hides and one clears the same note:** the existing delete-vs-edit conflict path (test 9); expected, not new.
- **Forgotten notes.** A hidden note can be forgotten, and it never reaches next season (flags are not carried). Mitigation: the `Show hidden (n)` count is always on the card; the sheet line says it is hidden.
- **Row width on a phone.** Four buttons plus a long note; the card CSS (294) already wraps `td.wrap`; verify at 390 px (test 11 and section 11).
- **Re-render losing the typed note.** Hide re-renders the tab; the Add note box is rebuilt empty (it is already rebuilt after Add note). Only matters if a leader types, then hides; acceptable and the same as Clear.
- **Test ids in the TEST club.** TEST data has no flags, so any test that counts rows must create all of its own.

## 10. Effort and version notes

Effort: **small to medium (about half a day to one day)**: one small field, one card, node and browser tests, docs. No new data section, no format version.

Version: do not touch the `app-version` meta (1.51.16) while it is unreleased and unpushed; it is the release that will carry N19. `deploy/` holds a built 1.51.16 that does not contain N19, so **rebuild it with `sh make-deploy.sh` after the changes** (the script refuses when files changed but `app-version` and `app-build` did not; if it refuses, bump `app-build`, not `app-version`, since 1.51.16 has not been released; if Mike has pushed 1.51.16 by then, bump to 1.51.17 and use that CHANGELOG heading). Add the CHANGELOG bullet under 1.51.16: "Notes and flags card: Hide a note or flag (kept on the child's sheet and in History, out of the card's count), Show hidden, Unhide. Older copies show hidden notes in their list until updated."

## 11. Phone check Mike must do by hand (add to `playtest-checklist.md` section 6)

On the phone, with a data file that has at least three notes and flags (one general note, one child flag, one Flag-anything flag):
1. To do tab: the card heading says `(3)`. Press Hide on the child flag: the row goes, the heading says `(2)`. Check that the number on the To do tab (and on the menu button) did not change (it never counted notes).
2. Tick `Show hidden (1)`: the row comes back greyed with Unhide. Press Unhide: it is a normal row again, the tick box is gone.
3. Hide the child flag again, open that child, Progress tab: the note is still listed at the top with "(hidden on To do)" and its yellow flag is lit.
4. Rows are readable with Go, Hide and Clear: no sideways scroll, buttons large enough to press without hitting the wrong one.
5. Download, close, open the file again: the note is still hidden.
6. Undo right after a Hide: the note is back.
7. With an older copy still open on another device: press Update now there before relying on this (an old copy shows the note again).

## 12. Decisions for Mike (each with my recommendation)

| # | Question | Recommendation |
|---|---|---|
| D1 | The To do badge does not count notes and flags today (it counts actions only). Keep it that way, so hiding changes only the card heading? Or start counting open notes in the badge (a bigger behaviour change, and every existing leader's number would jump)? | **Keep the badge as is.** Hiding changes the card heading only; the BACKLOG wording is corrected. |
| D2 | Where is the hidden state kept: on the note (`hidden` field) or in the shared Ignore list? | **On the note** (section 2): merges per note, clears with the note. |
| D3 | When a hidden note's text is edited, should it come back? (Ignore on other items does come back when the item text changes.) | **No.** Hidden stays until Unhide; stable and simpler. |
| D4 | Stored value: the number `1` (like other marks) or `true` (as the backlog wrote)? | **`1`**, reading `true` as hidden too. |
| D5 | Should the yellow-flag popup and the child's sheet also get Hide/Unhide? | **MIKE: YES (2026-11-18).** Hide and Unhide are also on the yellow-flag popup and the child's sheet (the plan's default was No: the build must add them to both places, the sheet still shows "(hidden on To do)" and keeps Clear). |
| D6 | Show-hidden toggle: remembered between visits or per visit? | **MIKE: REMEMBERED (2026-11-18).** Keep the toggle between visits (the plan's default was per visit: store it as a browser convenience setting or in the file; recommend the browser, since it is a per-viewer view choice). |
| D7 | Hidden general notes (no child, no spot) can only be seen through the toggle. Fine, or should they also be listed somewhere else? | **Fine.** The toggle count is always on the card. |
| D8 | Release: fold N19 into 1.51.16 (rebuild `deploy/`) or ship 1.51.16 as built and put N19 in 1.51.17? | **Fold into 1.51.16** if not yet pushed; everyone already has to press Update now once for it. |

## 13. What could not be verified here

- Nothing was run: no node test and no browser. All behaviour claims above come from reading the code and tests at the line numbers given.
- The exact touch-target rule for buttons in a table row (test 11) is in `touch-targets-browser.test.js`, which I did not open; read it when writing the test.
- Whether `data-format-doc.test.js` enumerates optional flag fields (so `hidden` must be added to its list) was not checked.
- Phone behaviour (row width, tap size) can only be judged by hand (section 11).

---

# Part B: N20, a flag ties to the exact spot, child and view it was made on

## 14. Root cause (read in the code, line by line)

1. The Flag button always makes a level `element` flag (`app-flagmode.js` 50-51: `lvl = bug ? 'bug' : 'element'`; save at 59 calls `App.addFlag({ level, kid: info.kid || undefined, tab, trail, label, rowIndex, ... })`). The older levels (`box`, `block`, `sheet`, `child`, `attend`, `team`, `field`) are made by other code and are already exact: the sheet draws a flag only where `flagsAtPlace(level, book, block, key)` over `Season.flagsOf(season, id)` matches (`app-season.js` 798-801). So **only the Flag and Bug buttons are loose**.
2. The spot capture is `infoOf(el)` (`app-flagmode.js` 33-38). `kid` is set **only** when the element sits in a `<tr>` that has `data-id` (Uniforms, Roster). The trail is `FT.build({ tab, heading, row: kid ? '' : rowOf(el), label })`; `rowIndex` is counted among `<tr>`s of the element's own table by first-cell text (`FT.rowIndexOf`, `flagtrail.js` 24); an element with no `<tr>` gets `rowIndex` 0.
3. The Person tab's Progress sheet is not a table. The date received is `<p class="recvrow"><label><b>Book</b> Date received <input data-recv=...>` (`app-season.js` 860) and the sign-off boxes are `<span class="pcell">` (803). No `<tr>`, so `kid` is `''`, `row` is `''`, `rowIndex` is 0. The stored trail is `[Person tab, heading, "<Book name> Date received"]` and names no child, sub-tab, quarter or night.
4. The matcher never looks at anything but the trail. `FT.find` (`flagtrail.js` 19-22) keeps candidates whose `same(c.trail, stored.trail)` and picks the one with the same `rowIndex`, else the first. `App.flagLocateAll` (`app-flagmode.js` 86) and `app-flagmarks.js` 21-25 call it with every element flag whose `f.tab === App.tab`. `flagsOf`/`kid` is not consulted. So on the Person tab, **whichever child is open** has an element with the same trail and rowIndex, and the marker is drawn on it. (This is the reported bug: every child's "Book received" box.)
5. The same loose match applies to: the dialog's list of existing notes at that spot (`app-flagmode.js` 50: tab + trail + rowIndex only), Go (`goElement`, 93-103: `App.showTab(f.tab)` then `locate`, no child, sub-tab, night or quarter is set, so Go lands on whatever child or night was last open and the spot is "not found" or the wrong one), and the popup (it opens by flag id, so it is fine).
6. Even where `kid` is stored (a Uniforms or Roster row), the matcher ignores it: the row is found by `rowIndex` among rows with the same first-cell text, so after a re-sort a flag moves to a different child's row.
7. Other repeating spots with no identity in the trail: Attendance cells (the same room's column header and the child's row name repeat on every night and class; the night and room are only in `ui.attDate/attRoom`, `app-season.js` 414), the Color teams grid (the same child and color cell repeats per quarter and group; `app-teamgrid.js` 8 `ui`), the Awards tab (night, group in `ui.awDate/awGroup`, `app-season.js` 418), and the Person tab's four sub-tabs and book tabs (`ui.sub`, `ui.prBook`). `App.places[tab].get()` already reports child + sub (`app-person.js` 317), night + room (attend), night (games), night + group + room (awards); there is no provider for the book tab or the teams view.

**Proof to write down first (section 15, case 1):** flag the Book received box of child A on the TEST club, open child B: a yellow flag appears on B's box. This is the failing test.

## 15. Reproduction plan (new `dev/app/test/flag-spot-browser.test.js`, with `test/lib/app-page.js`)

Setup per case: `open()`; pick two children from `App.master` in the same class and one in another class (read their ids in `page.evaluate`); open the tab (`App.showPerson(id, { sub: 'progress' })`, `App.showTab(...)`); turn on flag mode through the real path: `page.evaluate(() => App.flagTrail.infoOf(el))` to read the captured spot, and a real click with `#btnFlagMode` then the element then `#flNote` / `#flSave` for the end-to-end case. Marker check: `#flagLayer button[data-fids]` count after `App.flagMarks.refresh()` and `page.waitForTimeout(250)`.

Each case is **red before the fix**, green after. Same element, one flag, then change exactly one thing:
1. **Another child.** Flag child A's "Book received" date box (Person, Progress). Open child B (same book tab): no marker. Open A again: one marker.
2. **Another book tab.** Flag A's received box on book 1; switch to book 2 on A: no marker on book 2's received box, marker back on book 1. Also a progress date box in a *common* block (shared across books): flagged on one book tab, not drawn on another.
3. **Another sub-tab.** Flag a field on A's Registration sub-tab; switch to Attendance sub-tab and back: marker only on Registration (a Person-tab field that also appears on another sub-tab must not show).
4. **Another class.** Flag a cell in class X's attendance table; show class Y the same night: no marker.
5. **Another night.** Flag the same attendance cell for child A on night N1; open night N2 (same class): no marker.
6. **Another quarter.** Flag a Color teams cell (child A, Q1); switch to Q2 (and another group): no marker.
7. **Same name in one table.** Two rows with the same first-cell text in one table (use a TEST pair with the same display name if one exists, else rename one in `page.evaluate` before drawing): flag the second; the marker is on the second only; Go lands on the second.
8. **Uniforms rows.** Flag one child's cell in the Uniforms table (stored with `kid`); reverse the sort or filter so the row order changes: the marker follows the child, not the position.
9. **Awards ledger rows.** Flag one child's row on the Awards tab; another night / group: no marker.
10. **Progress boxes.** Flag a date box on child A (box, not the received box); child B: no marker.
11. **Bug button.** The same capture for `level: 'bug'`: a bug report made on child A's box carries the same scope fields and shows its spot on the Debug tab.
12. **Go.** Make a flag on child A, Person, Registration sub-tab; open child B on Progress; press Go in To do: the open child is A and the sub-tab is Registration and the element flashes. Same for an attendance flag (opens that night and class) and a team flag (that quarter).
13. **Dialog.** Click the same box again on child A: the dialog lists the existing note; on child B it does not.
14. **To do / Debug "Where" and Child column** show the child's name and the spot (the child's name only in the Child column, not in the trail, to keep the existing rule).
15. **Legacy flag (no scope fields):** a hand-made element flag without `kid`/`sub` still matches on every child (unchanged behaviour), and Go still opens the tab.
16. **Legacy flag with `kid`** (an old Uniforms flag): now shown only on that child's row (tightens by itself).

## 16. Design

**What identity a stored spot carries.** One identity per flag, filled from where the flag was made; every part optional so old flags keep reading:

| Field | Meaning | Already stored? |
|---|---|---|
| `kid` | the child the page is about (open child on Person, the row's child on a roster-like table) | **yes** (set only from a `tr[data-id]` today); now also set from the open child on Person |
| `book` | the book tab open on a child's Progress sheet | **yes** (common text field, always written, `''` for element flags today) |
| `date` | the night (Attendance, Games, Awards) | **yes** (`FLAG_EXTRA`, written when non-empty) |
| `room` | the class (Attendance, Awards) | **yes** (`FLAG_EXTRA`) |
| `quarter`, `group` | Color teams quarter and group | **yes** (`FLAG_EXTRA`) |
| `sub` | the Person-tab sub-tab (`progress`, `attendance`, `awards`, `registration`) | **no: the one new optional text field** |

So the stored change is one new optional text field, `sub`, plus filling existing ones for element and bug flags. `addFlag` (`season.js` 893) already stores `kid`, `book` and the `FLAG_EXTRA` list for every level, so `addFlag` only gets `'sub'` added to `FLAG_EXTRA`. `Season.VERSION` stays 6.

**Capture.** New `App.flagScope()` (in `app-flagmode.js`, 1.2.0 to 1.3.0): reads the current view from `App.places[App.tab].get()` (child and sub, night and room, night, night and group and room) and adds what that does not hold: the open book tab (`ui.prBook`, exposed as `App.sheets.book()` or read from the `.booktabs button.on`) and the teams quarter and group (the teamgrid `ui` and quarter picker; add a small `App.places.teams` provider, which also fixes Recent places for that tab). It returns `{ kid, sub, book, date, room, quarter, group }` with only non-empty parts. `infoOf` merges it into its result; a row `data-id` still wins for `kid` (a roster row is the child it names).

**Matcher.** A pure function in `flagtrail.js` (1.0.1 to 1.1.0): `scopeOk(stored, scope)`: for each of `kid, sub, book, date, room, quarter, group` that the **stored** flag has (non-empty), the current scope must have the same value; a part the stored flag lacks is not compared. It is used at all four places that decide "is this flag here":
- `app-flagmarks.js` 21: filter the flags before `App.flagLocateAll`.
- `App.flagLocateAll` and `locate` (`app-flagmode.js` 85-86): `FT.find` gets the scope-filtered flag list; candidates also carry the row's `kid`, and a stored `kid` must equal the candidate's `kid` when the candidate has one (row follows the child, case 8).
- the flag dialog's `here` list (50).
- `flagsAtPlace`-style callers are not changed (older levels are already exact).

A stored flag whose scope is not the current view is simply not drawn and not listed in the dialog; it stays in To do and Debug.

**Go.** `App.goElement` (93) first restores the view from the stored fields, then locates: person: `App.showPerson(kid, { sub })` and `App.sheets.setBook(book)`; attend: set night and room (`App.places.attend.set`); awards: `places.awards.set`; teams: the new `places.teams.set`; then `showTab(f.tab)` as now. A flag with none of these fields goes straight to the tab as today. This is the same `places` registry Recent places and the Update-now return use (S13), so no new navigation code. The older levels' `goFlag` already opens the exact child and book (`app-season.js` 911-923).

**Where text.** The trail keeps tab, heading, row, label (unchanged rule: no child name inside the trail when `kid` is known, the name goes in the Child column). On To do the Child column now shows the child for a Person-tab flag. The trail stays the same, so old flags still compare.

**Side effect to decide (E3):** an element flag that now carries `kid` is listed by `Season.flagsOf` and so appears in that child's sheet note list (`app-season.js` 880-881) like a box flag. That is what Uniforms flags already do. It gives the child's sheet a line for the note (good: "show where it was made") and a Clear button. It does not light a box on the sheet (those use `flagsAtPlace` by level `box`).

**Data format, merge, validate, History, older copies.**
- Format: no version bump, no new section; one new optional text field `sub` on a flag; existing fields reused. `DATA-FORMAT.md` 9.4: the element row says an element flag may also carry `kid`, `book`, `date`, `room`, `quarter`, `group`, `sub` as "the view it was made in"; 5.9 gets one sentence; mention that a flag without them matches as before.
- Merge: per-field leaves inside the flag; a new flag is added whole (already works). No change in `datamerge.js`.
- Validate (`validate.js` 256+): `sub` text and one of the four words, else a warning; `book/block/key` text check stays; `kid` is already checked as known. Warnings only.
- History: no change (a new flag is one add of a whole object).
- Older copy (1.51.15h and earlier, and 1.51.16 as built): keeps and saves every field, ignores the scope, so the flag is **still drawn on every child there** (the bug stays until that copy updates). No data loss. Every leader presses Update now (already required).
- Anonymizer: flags are dropped whole, so no change; add one case to `anonymizer-atomic.test.js` with a scoped element flag (output has no `flags`).
- New season: flags are not carried except open bugs; a carried bug report keeps its scope fields (child ids stay valid; `known()` is a Validate warning/error already handled for bugs with `kid`).

## 17. Flags already stored with the loose spot

- A flag with `kid` (Uniforms, Roster rows, made since S14): applies only to that child's row from now on. No migration.
- A flag with no `kid`, `sub` or other scope field (Mike's Book received flag, others on Person, Attendance, Teams made before this): keeps matching as before (drawn wherever the trail matches), and Go opens the tab only. No automatic guess of the child: the data does not say which child it was (the To do Child column is empty for it), and guessing would hide a flag from the place it was meant for.
- Recommendation: do **not** migrate. After the build Mike clears the few loose flags on Person and re-makes them (the dialog now ties them). If he wants to keep one: a small **Tie to this view** button in the popup, shown only for a flag with no scope while the leader is looking at it, which stores the current scope. Offered as decision E2; not built unless he says yes.
- Check the real file first: `node dev/tools/inspect-child.js`-style read (no names printed) or a Node one-liner that counts element flags with and without `kid`, by tab, so Mike knows how many are loose. Not run here; the real file is private.

## 18. Files and version notes (one bump per file for N19 and N20 together)

| File | N20 change | N19 change | Version |
|---|---|---|---|
| `flagtrail.js` | `scopeOk`, candidate `kid` rule in `find` | none | 1.0.1 to 1.1.0 |
| `app-flagmode.js` | `App.flagScope`, `infoOf` scope, dialog filter, `locate`, `goElement` restores the view; `places.teams` or a scope reader for teams | none | 1.2.0 to 1.3.0 |
| `app-flagmarks.js` | filter by `scopeOk` | none | 1.0.0 to 1.0.1 |
| `app-season.js` | `places`/book getter; child's sheet list (880) | `App.hideFlag`, sheet `(hidden on To do)` | 1.96.0 to 1.97.0 |
| `app-teamgrid.js` | register the teams view place (quarter, group) | none | next minor |
| `season.js` | `'sub'` in `FLAG_EXTRA`; header comment | `setFlagHidden`, `isFlagHidden`, `todoNotes`, `describe` | 1.70.0 to 1.71.0 |
| `validate.js` | `sub` check | `hidden` check | 1.16.0 to 1.17.0 |
| `app-todo.js` | none (Child column already reads `kid`) | Hide, Show hidden | 1.21.0 to 1.22.0 |
| `app-tools.js` | Debug "Where" shows the child (only if the bug carries `kid`) | none | 1.9.0 to next minor (read its current version first) |
| `datamerge.js` | none | `words()` | 1.1.5 to 1.1.6 |
| Docs | `DATA-FORMAT.md` 5.9 and 9.4; `index.html` How it works (Flag anything item 515: "tied to the child, book, night, class or quarter you were on"); `CHANGELOG.md`; `README.md` test lines; `playtest-checklist.md` section 6 |

`app-version` stays 1.51.16 (unreleased), both items join it; rebuild `deploy/` with `sh make-deploy.sh` after both are in (see section 10 for the `app-build` rule).

## 19. Tests

**Node `dev/app/test/flag-spot.test.js`:**
1. `FlagTrail.scopeOk`: stored with `kid` matches only the same `kid`; stored with none always matches; each of the seven fields alone; stored `kid` + current scope without `kid` does not match.
2. `FlagTrail.find` with candidates carrying `kid`: the one with the stored `kid` wins even at a different `rowIndex`; a stored flag with no `kid` behaves exactly as before (copy the existing `flagtrail.test.js` cases and run them unchanged).
3. `Season.addFlag`: an element flag stores `kid`, `book`, `date`, `room`, `quarter`, `group`, `sub` when given and writes nothing extra when not; a bug flag the same.
4. Round trip `toJson`/`fromJson` keeps all of them; older-copy round trip through the deploy `season.js` keeps them.
5. `Validate`: bad `sub` warns, not errors; file with no scope fields unchanged.
6. `Season.flagsOf` returns an element flag with `kid` (the child's sheet list), `noteList` order unchanged.
Existing tests to keep green: `flagtrail.test.js`, `flags.test.js`, `flag-anything-browser.test.js`, `flag-marks-browser.test.js`, `flagpop-browser.test.js`, `person-flags-browser.test.js`, `uniforms-cards-browser.test.js`, `bug-button-browser.test.js`.

**Playwright:** `flag-spot-browser.test.js` cases 1-16 (section 15); plus a 390 px run of case 1 and 12.

## 20. Steps in order (N20 alone)

1. Write `flag-spot.test.js` and `flag-spot-browser.test.js`; run: cases 1-10, 12, 13, 16 red, 11, 14, 15 mostly green.
2. `flagtrail.js` `scopeOk`, `find` kid rule; node tests green.
3. `season.js` `FLAG_EXTRA` + `validate.js`; node tests green.
4. `app-season.js`/`app-teamgrid.js` view readers (book, quarter and group); `app-flagmode.js` `flagScope`, `infoOf`, dialog, `locate`, Go restore; `app-flagmarks.js` filter. Browser tests green.
5. Docs and help text; targeted runs of the existing flag tests listed in section 19.
6. Phone check (section 22). No commit, copy or push without Mike.

## 21. Risks (N20)

- **Over-tightening:** if a view reader returns the wrong value (for example the book tab changes under a flag on a common block), a flag disappears from the place it was made. Mitigation: store only what the view reader reports at capture time, compare by exact equality, and test every tab in section 15; a flag never disappears from To do/Debug.
- **Per-tab readers are new** for the book tab and teams. A tab with no reader behaves as today (loose), which is the safe failure.
- **Same-named children** (the trail holds the child's name where `kid` is empty, e.g. Attendance rows): two children with one name still share a trail on tables with no `data-id`. Fix would be `data-id` on those rows; listed as E4 (small, adds an attribute only).
- **Sub-tab names** (`progress`, `attendance`, `awards`, `registration`) can be renamed later; an unknown stored `sub` then never matches. Validate warns on an unknown word.
- **Older copies still show the loose flag** (section 16).
- **Element flags with `kid` now list on the child's sheet:** a visible change; mention in the CHANGELOG.
- **Go restoring the view changes what the leader is looking at** (child, night): that is the point of Go; it uses the same `places` code as Recent places.

## 22. Phone check Mike must do by hand (add to `playtest-checklist.md` section 6)

1. Open child A, Progress, flag the Book received date box with a note. Yellow flag shows on A's box. Open child B: no yellow flag on B's box. Back to A: it shows again.
2. Switch A to another book tab: no flag; back: flag.
3. To do: the row names child A and the spot; press Go from B's page: A opens, on that sub-tab, and the box flashes.
4. Flag an attendance cell for one night; open another night and another class: no flag.
5. Flag a team cell; change quarter: no flag.
6. Make a Bug report the same way; the Debug tab shows its spot.
7. With the old loose flag still in the file (made before this): it still shows on every child (unchanged) and Go still opens the tab. Clear it and re-make it on the child.
8. Rows stay readable at phone width; yellow flags are not cut off at the right edge.

## 23. Effort (N20)

**Medium (about 1 to 1.5 days):** matcher and capture are small; the work is the per-tab view readers, Go restore, and 16 browser cases.

---

# Part C: building both

## 24. Interaction and build order

Interactions:
- **Both edit the flag record and the same places:** `season.js` header comment and `FLAG_EXTRA`, `validate.js` flags block, `DATA-FORMAT.md` 9.4, `index.html` How it works (515-516), `CHANGELOG.md`, README test lines, `flagpop` (not changed by either), `app-todo.js` card rows. Doing both in one pass bumps each file once.
- **Hide does not change matching.** `hidden` only affects the To do card; N20's matcher never reads it; hidden flags keep their yellow marks (N19 test 10) and keep their scope.
- **N20 creates new element flags with `kid`; N19 shows them in the card with a Child name** and (N20) on the child's sheet list where N19 adds `(hidden on To do)`: the line must be built from the same `Season.isFlagHidden`.
- **A loose legacy flag is the obvious thing to Hide** (Mike's flag drawn on every child). N19 gives him a way to silence it before he re-makes it; N20 alone does not.
- **Shared tests:** N19 browser tests that create element flags must create them through `App.addFlag` with the current scope (or none, to test the legacy path), so write one small helper `makeFlag(page, spec)` in the new test files, not in `lib/app-page.js` (do not widen the shared lib for two tests).
- **Undo/History:** unaffected by N20; N19's History wording is separate.

**Recommended order: N20 first, then N19.**
1. N20 (the bug; it fixes what flags mean and decides the final field set; the data-format and validate edits happen once).
2. N19 on top (a small UI addition that reads `Season.todoNotes`; its tests then use scoped flags and prove hide leaves marks alone).
3. One docs pass (DATA-FORMAT, How it works, CHANGELOG, README, playtest-checklist), then targeted test runs, one rebuild of `deploy/`.
If N20 slips, N19 can ship alone (nothing in N19 depends on N20), but then Mike's loose flag can only be hidden, not fixed.

Total effort for both: **about 1.5 to 2.5 days**.

## 25. Wording to correct in BACKLOG.md (not edited here)

- **N19, "the 'Notes and flags (N) to review' number (and the To do badge) goes down by one"** and "Done when: hiding one drops the heading count and the badge by one": the To do badge (and the phone menu badge) never counts notes and flags: it counts action-level To do items only (`app-todo.js` 97, 67; `todo.js` has no flag code). Correct to: "hiding one drops the card heading count by one; the badge does not count notes and does not change."
- **N20 "(Where to look first)":** `app-flagmode.js` 33 to 37 is `infoOf`; the saving of the flag is at 59 and the dialog filter at 50; the matcher is `flagtrail.js` 19-22 plus `app-flagmarks.js` 21-25. Also "(the same fields the older flag levels already keep: `book`, `block`, `key`, `date`, `room`, `quarter`, `group`)": the older levels are not loose; `block` and `key` stay unused for element flags (a box's label is its trail). One new field, `sub`, is needed.
- **N20 point (4):** "Go still opens the spot" is true only as "opens the tab" today (`goElement` does not set the child or night): Go restoring the view is part of the N20 build (section 16).

## 26. Decisions for Mike for N20 (with recommendations)

| # | Question | Recommendation |
|---|---|---|
| E1 | Tie a flag to the view with existing fields plus one new optional `sub`? | **Yes.** No version bump. |
| E2 | The few loose flags already in the real file: leave them loose (clear and re-make), or add a "Tie to this view" button? | **Leave loose, re-make them.** Add the button only if there are many (count them first). |
| E3 | A scoped element flag also appears in that child's sheet note list (like Uniforms flags). OK? | **Yes.** It shows where the note was made and gives Clear. |
| E4 | Give rows that name a child on Attendance, Teams and Awards a `data-id`, so two same-named children are told apart? | **Yes**, a small separate change; otherwise those tables stay name-based. |
| E5 | Go changes the child, night or quarter you are looking at to the flag's. OK? | **Yes.** |
| E6 | Build order: N20 then N19, one release (1.51.16, rebuild `deploy/`)? | **Yes.** |

## 27. What could not be verified (N20)

- Nothing was run. `App.places.person.set` and the exact book-tab and teams-quarter state names were read only in part (the `places` registry at `app-person.js` 317, `app-season.js` 414-420; teamgrid `ui` at `app-teamgrid.js` 8); confirm names when building.
- Whether TEST data has two same-named children (case 7) was not checked; the test renames one if not.
- How many loose flags Mike's real file holds is unknown (private file, not opened).
