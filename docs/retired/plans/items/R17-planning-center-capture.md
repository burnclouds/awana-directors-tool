# R17: keep everything Planning Center gives us (and unknown keys) Implementation Plan

> **DECISIONS (Mike, 2026-11-13) override the questions below.** (1) The only Planning Center file ever imported is the registrations export CSV, so Task 8 (other Planning Center files) is **cancelled**; the "other file refused" rule stays. (2) **Every data item from every export is captured in the data file: nothing is only counted.** A registration the leader chooses not to add (cancelled, left, duplicate) is kept whole, like every other row (the "Question 2 recommended" answer); the Validate line may count them but the full rows are always stored. (3) General rule behind this item: **the app never silently drops or empties data it does not understand**: unknown columns, unknown top-level keys and damaged sections are kept (see R16 D5) and reported.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** complete plan, not started (2026-11-13). Two questions for Mike at "Questions Mike must answer"; Tasks 1 to 7 assume the recommended answers. Supersedes Release 2c (Tasks 11 to 19, "What is kept and what is lost today", "Design", "Open questions") of `2026-11-13-wave2-data-safety.md`. Those sections stay as history; this file is the plan for R17.

**Goal:** Every column and value of a Planning Center export (columns the app has never heard of, columns Planning Center adds later, columns that disappear or are renamed, blank and odd rows, rows nobody was added for) is kept in the data file, survives open, edit, save, merge, History, undo, restore, a second import and a Drive round trip, and is shown or counted (Validate tab, To do import summary, the Planning Center columns dialog). Unknown top-level keys of the data file (the old R17), and unknown keys inside `roster` and inside a person's entry, are kept too.

**Requirement (Mike, 2026-11-13):** "record any information coming from the Planning Center outputs, even if we don't use it."

**Architecture:** Each person's values stay where they are (`roster.people[id].pc`, by column name). One new object, `roster.pcExport`, records what the per-person values cannot: the header as exported, the storage name of each column, row counts, which people hold a row of this export, the rows that belong to nobody, and a content hash. Format version goes to 6 so an un-updated copy refuses the file instead of silently deleting the record. The anonymizer is taught first and fails closed on anything it does not know. No new top-level section (`Season.SECTIONS` is unchanged: `roster` is already tracked, so History, undo, restore and merge see `pcExport` with no new plumbing).

**Tech Stack:** Vanilla JS (no bundler), Node 24 for unit tests, Playwright 1.64 (Chromium) for browser tests, POSIX `sh`. No new dependencies.

**Spec:** `docs/DATA-FORMAT.md` (2.5, 4.2, 5.2, 7.2, 10, 11, 12, 14, 15), `dev/test-data/ANONYMIZATION.md`, the roadmap `2026-11-12-review-fixes-roadmap.md`, Wave 2 plan `2026-11-13-wave2-data-safety.md`.

## Global Constraints
- Use the Edit and Write tools to change files; scripted rewrites (`sed -i`, inline `node -e` that writes files) are blocked. Tests may run anything.
- Never open, read, list or print a real data file (`archive/`, `~/Downloads`, `~/Nextcloud`, `dev/*.json`, `dev/*.csv`, `reports/`, `research_notes/`). Tests use `dev/test-data` and invented ids (`7000001_Test_Kid`, `7999001`). Anything Mike runs on a real file prints counts and kinds only.
- Tests run from `dev/app`: `node test/<name>.test.js`; browser tests: `NODE_PATH=/tmp/claude-1000/shim/node_modules node test/<name>-browser.test.js`. Full sweep from the repo root: `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh`.
- Each changed `.js` file bumps its **own** line-1 version (`AwanaVersions['x.js']`) in the task that changes it (`make-deploy.sh` refuses otherwise). `app-version` and `app-build` in `dev/app/index.html` are bumped **once**, in the wrap-up task. `style.css` has no version line.
- Data-format rule: `docs/DATA-FORMAT.md` and `dev/app/test/data-format-doc.test.js` change in the same task as the format; CHANGELOG gets a format line; older files must still open; `dev/tools/make-test-data.js` must handle every new field and stop (exit 1, nothing written) on one it does not know.
- Project rule: do not deploy, do not run `make-deploy.sh` against production; Mike says "deploy". Commit only when the executing session is told to; commit messages end with the session's attribution lines.

## Where this sits (dependencies on Wave 2)
- **Do after Wave 2 releases 2a and 2b if they have landed.** R17 does not need them, but three of their tasks touch the same lines. Each task below says what to do in either case:
  - Wave 2 Task 1 to 3 (R16, per-section check table in `validate.js`): if landed, R17's checks go in as `SECTION_CHECKS.roster` sub-checks with `check: 'roster.pcExport'`; if not, they go at the end of the existing roster block in `validateData`.
  - Wave 2 Task 5 (R20, "every import that changed anything is logged"): **R17 needs this** (the record changes on every import). Task 5 below contains the minimal version; skip its step 3 if Wave 2 Task 5 is already in.
  - Wave 2 Task 10 (R10, older export asks first; `opts.quiet`): independent; Task 5 below keeps `opts` intact.
- Nothing in R17 depends on R7, R11 (Drive save path) beyond the merge function they also call; Task 6 changes only the merge inputs.

---

## What is kept and what is lost today (verified against the code, 2026-11-13)

**Kept already:** every export column becomes a name in `roster.pcCols` (`applyPlan`, `model.js:273`), and every non-blank value is stored with its person (`refresh`, `model.js:279`; `toRoster`, `model.js:355`); packing is lossless (`packRoster`/`unpackRoster`, `season.js:74-95`). Columns the app does not use show on the Roster's All fields. Money columns are kept and hidden (`HIDDEN_COLS`, `model.js:39`). Unknown keys inside `config` survive (`season.js:133`). Unknown keys inside `roster` survive `fromJson` (`season.js:149` copies the whole object) **until the first `syncData`**.

| # | Lost or blurred | Where (file:line) | Fixed in |
|---|---|---|---|
| L1 | The header's exact spelling (trimmed) | `csv.js:43` | Task 3 |
| L2 | Blank rows, and how many | `csv.js:48` | Task 3 |
| L3 | Cells beyond the header's width (silently dropped) | `csv.js:50` reads only `cols.length` cells | Task 3 |
| L4 | A renamed column's original spelling (reported once, not stored) | `normalizePc`, `model.js:82-85` | Task 3 |
| L5 | An export column named like a club column (`x_Notes`, `team:Q1`, `ov:Grade`) **overwrites the club's value** and lands in both `pc` and `v` | `applyPlan` copies every `plan.pcCols` (`model.js:279`, which is `pc.cols`, all columns); added rows copy every cell (`model.js:308`); `toRoster` writes it to `pc` (`:355`) and `v` (`:356-358`) | Task 3 |
| L6 | A value that is only spaces | `toRoster` keeps `trim(p[c]) !== ''` (`model.js:355`) | Task 3 |
| L7 | A row the leader chose not to add, a rename that was neither accepted nor added, any row attached to nobody | `applyPlan` (`model.js:306-312`): nothing keeps it | Task 4 |
| L8 | Which columns are in the latest export (a dropped column keeps old values with no sign they are old) | `pcCols` only grows (`model.js:273`, `fromRoster:375`) | Task 4 |
| L9 | File facts other than name and date: row count, blank rows, when imported, which export it was | `stampExport`, `app.js:189` | Task 4 |
| L10 | Unknown top-level keys | `fromJson` starts from `blank()` and copies only known keys (`season.js:130-150`); `toJson` writes `s` | Task 2 |
| L11 | Unknown keys of `roster` (including a future `pcExport`) and of a person's entry | `syncData` rebuilds `roster` with `Model.toRoster(App.master)` (`app-season.js:21`), which writes only `cols`, `pcCols`, `people{pc,v}`, `pcAsOf`, `pcSource` (`model.js:363-366`). `syncData` runs in `rebase()` at every open (`app-season.js:25-26`), so the loss is not even logged | Task 2 |
| L12 | An import that changes only money columns or columns new to the file is not logged (`edited` looks only at `changes`, which skip `HIDDEN_COLS` and columns not yet in `pcCols`, `model.js:222`); `App.rebase()` absorbs it (`app.js:184-186`). Same for the re-apply of an earlier export when a data file is opened: `App.loadData` imports (`app.js:1116`) and `setSeason` then calls `rebase()` (`app-season.js:26`) | `app.js:175-188`, `:1116` | Task 5 |
| L13 | On a file merge, `pcAsOf`, `pcSource`, `pcCols` follow the generic three-way rules while each shared person's `pc` stays this file's (`prepare`, `datamerge.js:44`): the "as of" can name the other file's export while the values are this file's | `datamerge.js:42-51` | Task 6 |
| L14 | The anonymizer copies any new key of `roster` verbatim (`out = clone(data)`, only `people` and `pcSource` rewritten, `make-test-data.js:242-247`); scrubs an unknown column word by word (`anonText`, `:207`) instead of dropping it; sends History values at `roster.<anything but people>` through `deep()` (word scrub, `:273`), so an old `pcSource` (it holds the club's file name) is not renamed; and its top-level check ignores a non-object unknown key (`:260` tests `typeof === 'object'`), which matters once Task 2 keeps such keys | `dev/tools/make-test-data.js` | Task 1 |
| L15 | Any Planning Center output other than the registrations export is refused, or (if it has First Name and Last Name) taken for the roster; an export that happens to contain an `x_ClubberID` column is taken for an old master CSV | `app.js:1122-1131` (`kindOf`), `validate.js:18-28` (`detect`) | Question 1; known limit |

**Also found:** `touchSeason` diffs against `snap`, which is the **previous** file's snapshot (or `null`) while `setSeason` is running `App.loadData` (`app-season.js:26` sets `season` first and rebases after). An export re-applied from inside `loadData` that changes a visible field therefore calls `App.changed()` with a stale or null `snap` (`Season.diff(null, …)` would throw reading `before[k]`; not reproduced here, because it needs a browser run). Task 5 moves the re-apply after the rebase and its test `an export opened before the data file…` shows whether today's code fails first; record the result in the commit message.

## What changes from the Wave 2 draft (critique)
1. **`ids` becomes an object `{ "<id>": 1 }`, not a sorted list.** History diffs arrays whole (`season.js:1150-1155`): a sorted list would be logged in full (about 3.5 KB, old and new) every time anyone joins or leaves. An object is diffed per key: one join is one tiny change, and two leaders' joins merge without a conflict.
2. **The anonymizer tests cannot check clean output on TEST data.** `anonymizer-atomic.test.js` says every run on invented data ends in `PROBLEMS` (the invented names come from the same pool). The draft's "the output holds TEST and no Zebracakes" cannot pass. The rules move into a small pure module (`dev/tools/anon-pc.js`) that is tested directly; the end-to-end tests check only the fail-closed exits.
3. **No `shiftDates` exception.** The draft left `pcExport.loose` alone when the demo file's dates move. People's `pc` values are moved by `moveDeep` (`season.js:160-165`) today, so `loose` must move the same way or `exportBack` stops agreeing with the people. Nothing to change; a test pins it.
4. **The re-apply on open is a real bug, not only an unlogged change** (stale `snap`, above).
5. **A guest linked by hand later** (`linkToPc`, `app.js:700`) takes a row out of `loose` and joins `ids`. The draft missed it.
6. **Version 6 always** (not "only when the file holds a record"): simpler to reason about, and the first import after updating writes a record anyway.
7. **The same-export check is the hash alone** (plus length), not hash and file name: the same bytes under another name are the same export.
8. **Stored-name rules are written once** (`Model.readExport`), and `normalizePc` must be idempotent because `planImport` calls it again on already-normalized input (`model.js:201`).
9. **Unknown top-level keys of any type** stop the anonymizer, not only non-empty objects.
10. **Open questions cut from seven to two**; the rest have a recommendation and are decided below unless Mike objects.

---

## Design

### Storage
```
roster.pcExport = {
  at:        "2026-11-03T19:02:11.000Z",   // when this export was imported (its own date stays in roster.pcAsOf, its file name in roster.pcSource)
  hash:      "9f3a1c07-66889",             // FNV-1a 32-bit hex of the text (BOM removed) + "-" + text length: "the same export again"
  header:    ["Registration ID", " First Name", "Notes", "Notes", "", "x_Notes"],   // every header cell exactly as exported, in order
  names:     ["Registration ID", "First Name", "Notes", "Notes (2)", "(no header 5)", "pc:x_Notes", "(no header 7)"],
                                           // the key each column's values are stored under in people[id].pc; longer than header when a row had cells past it
  rows:      158,                          // data rows in the file (blank rows included)
  blankRows: 1,
  ids:       { "7000001_Test_Kid": 1, ... },   // the people whose pc holds a row of THIS export
  loose:     [ ["7999001", "", "", ...] ]  // rows of this export that belong to nobody on the roster, cell for cell in names order, file order
}
```
- **Stored-name rules** (`Model.readExport`, in this order): trim (as today); `HEADER_ALIAS` and the role renames (as today, so existing files' keys do not move); a name for which `Model.isUserCol` is true gets `pc:` in front; a blank header cell, and every cell position past the header, is `(no header N)` (N counted from 1); a repeat gets ` (2)`, ` (3)` (as today). `header[i]` keeps what the export said.
- **What "nothing lost" means, exactly:** `Model.exportBack(roster) -> { header, rows }` rebuilds the grid: one row per id in `ids` (`names.map(n => pc[n] === undefined ? '' : pc[n])`), then `loose`, then `blankRows` empty rows. For any export, `header` is identical and the rows equal the parsed original's rows **as a multiset, cell for cell**, each padded to `names.length`. Not kept: byte-level text (quoting, line endings, BOM), a short row's missing trailing cells versus empty ones, and row order. Mike keeps the CSV files themselves; the data file keeps what they say.
- Columns that left the export stay in `pcCols` and in people's `pc` with their last values. They are the `pcCols` not in `names`; Validate counts them as "from an earlier export".
- Only the latest export's record is kept whole; earlier ones are in History.

### Format version 6, and the downgrade note
An older copy (format 5) would **silently delete** `pcExport`: `fromJson` keeps it, but the first `syncData` (run by `rebase()` at every open, `app-season.js:25-26`) rebuilds `roster` from `Model.toRoster`, which does not know it, and the loss is neither logged nor marked unsaved; the next save writes the file without it. Staying on 5 cannot meet the requirement. Moving the record into `config` (which old copies keep, `season.js:133`) was considered and rejected: it is not a setting, it would be labelled "Award lists & settings" in History, and an older anonymizer would copy it verbatim.

So `Season.VERSION` becomes **6**:
- A version 6 file opened by a version 5 copy is refused with "This season file is from a newer version of the app (version 6)" (`season.js:129`) and the Validate tab says the same (`validate.js:36`).
- A version 5 copy that has a file open and saves in place to Drive after someone saved a version 6 file: its merge reads the remote through `Season.fromJson` (`app-drive.js:114-115`, `:133`), which throws, so the save fails and nothing is written to Drive (today's failure path downloads a local copy; R11 may change that path, not this outcome). Task 4 pins this with a test.
- A version 5 file opens as before and is written as 6 at the next save; until the next import it has no `pcExport`, and Validate says "No Planning Center export has been captured in this file yet".
- **Downgrade:** a version 6 file is a version 5 file plus `roster.pcExport`, kept unknown keys, `pc:` and `(no header N)` column names and whitespace-only values. To open it in an older copy, change `"version":6` to `"version":5` in a text editor; the older copy then drops `pcExport` and unknown keys at its next save (everything else is intact, `pc:` columns show as ordinary columns). The spec (4.2) says so. No tool: this is an emergency path, not a feature.

### Unknown keys (the old R17)
- `fromJson` puts every top-level key that is not in `Season.KNOWN_TOP` (`format`, `version`, `year`, `fake`, `history` and `Season.SECTIONS`) in `s.unknownKeys = { key: value }` (absent when none); `toJson` writes them back at the top level; a known key always wins; `__proto__` is still dropped (`season.js:127`). Not tracked by History (they are not sections). `newSeason` does not carry them.
- `Model.fromRoster` keeps keys of `roster` other than `cols`, `pcCols`, `pcKeys`, `pcAsOf`, `pcSource`, `pcExport`, `people` in `master.rosterExtra`, and keys of a person's entry other than `pc`, `v` in `master.personExtra[id]`; `toRoster` writes both back. These are inside `roster`, so they **are** tracked (History logs them if a newer tool changes them; the app never does).

### Import behaviour
| Case | What happens |
|---|---|
| New column | Stored with each person, listed as new (`columnReport`, as today), in `names`. |
| Column gone from the export | Last values kept with each person; not in `names`; counted on Validate as "from an earlier export". |
| Renamed column the app recognises (a role) | Values under the app's name (as today); `header` keeps the export's spelling. |
| Renamed column it does not recognise | One column gone plus one new. Nothing is guessed. |
| Column named like a club column (`x_`, `ov:`, `team:`, `att:`, `prog:`, `award:`) | Stored as `pc:<name>`; the club's own field is never touched; `columnReport` says so as a note. |
| Blank header, duplicate header, cells past the header | `(no header N)`, ` (2)`; every cell kept. |
| Blank row | Counted in `blankRows`. |
| Row with no name, or a new row the leader unticks, or a rename neither accepted nor added | Kept whole in `loose` (Question 2). |
| The same export again (same `hash`) | Nothing changes, nothing is logged, the file is not marked unsaved; flash "This export is already in the file (imported <date>)." |
| A different export | Applied as today; `pcExport` replaced; **one** History entry `Planning Center import: <file name>` holding every change, including money columns and the record; one undo step; the file is unsaved. |
| Re-applied when a data file is opened after the export | Same as a different export, but logged after the open (its own History entry) and skipped when the hash matches the file's record. |

Users will notice one change: every import of a new export now marks the file unsaved (today an import that changed only money or unused columns did not). That is correct: the file's content changed.

### History, undo, restore
`roster` is a tracked section (`season.js:1146`), so `pcExport` is diffed, logged, undone, restored and compared with no new code, once `Model.fromRoster`/`toRoster` carry it (undo goes through `App.loadData` then `syncData`, `app-season.js:135-136`). The first capture is one change holding the whole object (`diff` stops where one side has nothing). After that, a weekly import logs `at`, `hash`, `rows`/`blankRows` if they moved, one change per person who joined or left `ids`, `loose` (whole, only when it changed) and `header`/`names` (whole, only when Planning Center changed its form). `Season.describe` words them ("Planning Center export kept: 158 rows, 1 belongs to nobody"; "… now includes <name>"; never `undefined` or `[object`).

### Merge and Drive
The Planning Center block (`roster.pcCols`, `pcAsOf`, `pcSource`, `pcExport`, and `pc` of every person both sides have) moves as **one unit** and is never mixed:
- **File > Merge a data file** (Mike's rule of 2026-11-12: the import owns these fields): this file's block stays whole. When the other file's export is newer, one Review row says so and names its date.
- **Drive save** (interactive and automatic): only one side imported since the base: that side's block is carried whole. Both imported different exports: the newer (`pcAsOf`, then `pcExport.at`; a tie keeps what Drive holds) wins whole, with one Review row, and no per-field conflicts under `roster › people › <id> › pc`.
- Club-owned fields an import also writes (`x_LastSeen`, `x_FirstSeen`, `x_Active`/`x_InactiveBy` from import deactivations, cleared `ov:`, the "Was … until" note) keep merging like any edit (risk 4).

### Shown or counted
- **Validate tab (data file):** `Planning Center export kept: 158 rows (1 belongs to nobody, 1 blank), 59 columns (6 not used by this app: “Favourite Snack TEST”, …), as of 2026-11-03.`; `3 columns hold values from an earlier export (“Old Question”, …).`; `2 parts of this file are not known to this app and are kept as they are (futureThing, roster › futureRosterKey).`; `No Planning Center export has been captured in this file yet.` (version 6 file with people and no record).
- **Validate tab (export):** `158 rows (1 blank), 59 columns, 2 cells past the last header column, 1 column with no header.`
- **To do import summary:** `Kept from the export: 59 columns (6 not used by the app), 1 row that belongs to nobody, 1 blank row.`
- **Planning Center columns dialog** (`columnsDialog`, `app.js:166`): a "Every column kept" list: column as exported, stored as, used by the app / kept, not used / from an earlier export.
- Values themselves: Roster, All fields (as today; `pc:` and `(no header N)` columns appear there).

### Privacy
Keeping more means the file holds more about children and families:
- `loose` rows are whole registrations of people the leader decided **not** to add (a cancelled registration, a family that left, a duplicate). Question 2.
- History now holds the old values of money, unused and new columns at every import (only changed values).
- A future column can be sensitive free text (custody, who may **not** pick up). Every column not explicitly known is treated as free text.
- **Free-text columns of today's export** (the spec lists them in 5.2; the anonymizer's rule table names them): `Medical Notes`; `Does your child have any allergies or medical conditions that we should be made aware of?`; `Please list the names of ALL adults with permission to pick up your child.`; `Please provide the primary phone number for a parent.` (people type names into it); `Emergency Contact`; `Registration Contact Address`; `If you are purchasing a Awana shirt, please provide size.`; `Discount Name`; `Uniform`; **any column not in `Model.PC_KNOWN` and not a role**.
- Column kinds for the spec table: identity (`Registration ID`, `First Name`, `Last Name`, `Birthdate`, `Age`, `Gender`, `Grade`), contact (phones, emails, `Home Address *`, `Registration Contact *`), program (`Selection`, `Assignment Area: Classes`, `Status`, `Submitted`, `Attendance Status`, `Times Attended`, uniform columns), money (`Registration Cost`, `Attendee Balance Due`, `Registration Amount Paid`, `Balance Due`, `Paid by *`, `Discount Type`, `Discount Amount`), free text (list above).
- **Anonymizer (Task 1, before anything writes the record):** stops (exit 1, nothing written) on any top-level key it does not know (any type), any `roster` key outside `cols`, `pcCols`, `pcKeys`, `pcAsOf`, `pcSource`, `pcExport`, `people`, any person key outside `pc`, `v`, any `pcExport` key outside `Model.CAPTURE_KEYS`, and any History path under `roster` other than `people`, `cols`, `pcCols`, `pcKeys`, `pcAsOf`, `pcSource`, `pcExport`. Every `PC_KNOWN` column and role gets an explicit rule; **any other column's value is emptied** (`''` stays `''`, anything else becomes `TEST`); the column name is kept with the church initials replaced (`FBK` to `AWANA`, as for the calendar). `pcExport`: `ids` keys renamed through `idMap`, `loose` rows through the same per-column rules as people, `hash` emptied, `at`/`rows`/`blankRows` kept, `header`/`names` with the initials replaced. History values under `roster › pcSource` become the TEST file name form.

### Size on a phone
For the 144-person TEST club (155 KB file): `header` and `names` about 1.6 KB each, `ids` about 3.5 KB, `loose` about 0.45 KB a row: about 7 KB, under 5 percent. History per weekly import: about 150 bytes for the record plus the changed values (which the file already logs for visible changes); `header`/`names` only when the form changes. JSON parsing 200 KB on a phone is a few milliseconds; the update handoff (13.4) carries the same text. Tests pin: first capture adds under 15 KB; a second, different export with the same people adds under 2 KB beyond the changed values.

## Decisions taken here (recommended; Mike may overrule, nothing else needs his answer)
| # | Decision | Why |
|---|---|---|
| D1 | Format version 6 (above), downgrade by hand-editing the number | An older copy would otherwise silently delete the record. |
| D2 | Cell-for-cell fidelity, not byte-for-byte; row order not kept | Byte-for-byte means storing the CSV text (about 60 KB, and the old text in History every week: about 1.8 MB a season). Row order would log the whole id list on every join. The CSV files themselves are Mike's byte-level copy. |
| D3 | A column Planning Center drops keeps its last values and is counted as "from an earlier export" | "Record everything" rules out clearing; the count keeps it honest. |
| D4 | Latest export kept whole, earlier ones through History | Keeping every export whole is about 60 KB each. |
| D5 | Money columns stay kept and hidden; their changes now go into History | They are Planning Center output; hiding is unchanged. |
| D6 | Unknown keys are kept and written back, listed on Validate | The roadmap's recommendation for the old R17. |
| D7 | Every import of a different export marks the file unsaved and is one undo step | The content changed; anything else breaks the History replay check. |

## Questions Mike must answer
1. **"Anything else Planning Center produces."** Which other files do you get from Planning Center (a People list, check-ins, payments, a PDF)? Today only the registrations export is read; this plan covers it. If there are others, Task 8 keeps each one whole as a named table (it needs their columns, and a rule to tell each one apart; a file with First Name and Last Name but no Registration ID would otherwise be taken for the roster).
2. **Rows that belong to nobody.** Keep the whole row of a registration you chose not to add (recommended: it is what "record everything" says; Tasks 4 and 5 assume it), or keep only a count? Keeping them means the file holds the details of families who are not in the club, including medical answers. If "count only", `loose` becomes `looseCount` and nothing else in the plan changes.

---

## Review Focus
Failure modes no single task's test covers; each line names the owner.
1. **A copy that has not updated meets a version 6 file**, by opening it or by a Drive save that merges it. It must refuse and never overwrite. Owner: Task 4 (unit test with a version-5 limit; Drive test with the fake Drive).
2. **The anonymizer copies something new verbatim.** Owner: Task 1, which lands before anything writes `pcExport` or keeps unknown keys.
3. **Importing the same export twice makes the file unsaved or grows History.** Owner: Task 5.
4. **Two leaders import different exports, then merge or save to Drive.** Planning Center data ends as one export's. Owner: Task 6.
5. **An export column named like a club column** overwrites the club's value. Owner: Task 3.
6. **A real file that is fine today gets a new error on Validate.** The new checks are `info`/`warn` except shape errors in `pcExport` itself, which no current file has. Owner: Task 4; Mike runs Validate on a copy of his file before release (wrap-up step 5).
7. **Opening a data file after an export** logs the re-applied import after the open, never with a stale `snap`. Owner: Task 5.

## File Structure
| File | Change | Responsibility |
|---|---|---|
| `dev/tools/anon-pc.js` | create | Pure anonymizer rules for Planning Center data: `COLUMN_RULES`, `ruleOf(col)`, `anonCapture`, key allow-lists. Required by `make-test-data.js`. |
| `dev/tools/make-test-data.js` | modify | Fail closed on unknown top-level, roster, person, record keys and History paths; use `anon-pc.js`; empty unknown columns. |
| `dev/test-data/ANONYMIZATION.md` | modify | The column rule table; "an unknown column is emptied". |
| `dev/app/csv.js` | modify | `toTable(rows)`: the grid with nothing dropped. `toRecords` unchanged. |
| `dev/app/model.js` | modify | `readExport`, idempotent `normalizePc`, `pc:` names, whitespace values kept, `applyPlan` reports `ids`/`loose`, `hashText`, `captureExport`, `exportBack`, `CAPTURE_KEYS`, `linkToPc` updates the record, `fromRoster`/`toRoster` carry `pcExport`, `rosterExtra`, `personExtra`. |
| `dev/app/season.js` | modify | `VERSION` 6, `KNOWN_TOP`, `unknownKeys` kept, `describe` for `roster › pcExport`. |
| `dev/app/validate.js` | modify | `pcExport` checks and info lines; unknown-key line; export-file counts. |
| `dev/app/app.js` | modify | `importPc` (readExport, hash skip, capture, diff-based logging), `stampExport`, `applyDecided`, `loadData` (re-apply deferred), link-to-PC, columns dialog list. |
| `dev/app/app-season.js` | modify | `setSeason` runs a deferred re-apply after `rebase()`. |
| `dev/app/app-todo.js` | modify | The "Kept from the export" line. |
| `dev/app/datamerge.js` | modify | `alignPc`; `plan()` uses it; one Review row. |
| `dev/app/app-drive.js` | modify | The automatic-save merge aligns the block too. |
| `dev/app/info.js`, `dev/app/index.html` | modify | Manual text (then `node dev/tools/sync-guide.js`). |
| `docs/DATA-FORMAT.md`, `dev/app/test/data-format-doc.test.js` | modify | In step with every format change. |
| `dev/app/test/pc-fixture.js` | create | `PcFixture.build(text)`: the invented odd export (helper, not a test file). |
| `dev/app/test/pc-capture.test.js`, `pc-capture-browser.test.js`, `anon-pc.test.js` | create | Named in each task. |
| `CHANGELOG.md`, `README.md`, `BACKLOG.md` | modify | Wrap-up. |

---

### Task 1: The anonymizer fails closed on everything new (lands first)

**Files:**
- Create: `dev/tools/anon-pc.js`, `dev/app/test/anon-pc.test.js`
- Modify: `dev/tools/make-test-data.js`, `dev/app/test/anonymizer-atomic.test.js`, `dev/test-data/ANONYMIZATION.md`

**Interfaces:**
- Produces (`anon-pc.js`, CommonJS, no file access): `TOP_HANDLED`, `ROSTER_HANDLED = ['cols','pcCols','pcKeys','pcAsOf','pcSource','pcExport','people']`, `PERSON_HANDLED = ['pc','v']`, `CAPTURE_KEYS` (same list as `Model.CAPTURE_KEYS`; the test asserts they are equal once Task 4 exists, and until then that every key is one of the eight named in the Design), `HISTORY_ROSTER_OK` (the roster list without `people` handled separately).
- Produces: `COLUMN_RULES: { [column]: rule }` with `rule` one of `keep`, `name`, `namelist`, `regid`, `address`, `contactAddress`, `birthdate`, `medical`, `phone`, `email`, `freetext`. Every name in `Model.PC_KNOWN` and every `PC_ROLES[].col` has a rule; `ruleOf(col)` strips a ` (n)` suffix and a `pc:` prefix first, returns `'unknown'` otherwise.
- Produces: `unknownKeys(raw) -> string[]` (paths like `top › futureThing`, `roster › futureKey`, `person › extraBit`, `pcExport › extra`), counts only, never values.
- Produces: `anonCapture(cap, { anonRecord, idOf }) -> cap'`: `ids` keys through `idOf`, each `loose` row turned into a record by `names`, through `anonRecord`, back to a row; `hash: ''`; `header`, `names` with `FBK` replaced; other keys copied.
- `make-test-data.js`: `anonRecord` uses `ruleOf`; `'unknown'` gives `''` for an empty value and `'TEST'` otherwise. The behaviour for every known column is unchanged (phones and emails still go through `anonPhones`/`anonEmails`, which today they reach through `anonText`).

- [ ] **Step 1: Failing unit tests** (`anon-pc.test.js`, node, invented data only):
  - `every column the app knows has a rule`: for each of `Model.PC_KNOWN` and `Model.PC_ROLES`, `ruleOf(c) !== 'unknown'`.
  - `an unknown column, a pc: column and a numbered duplicate are recognised or unknown as expected`: `ruleOf('Favourite Snack TEST') === 'unknown'`, `ruleOf('Medical Notes (2)') === 'medical'`, `ruleOf('pc:x_Notes') === 'unknown'`.
  - `unknownKeys lists every key the tool does not know, at every level`: a raw object with `futureThing: 'a string'` (not an object), `roster.futureKey`, one person with `extraBit`, `roster.pcExport.extra`; the result has four paths and contains no value.
  - `anonCapture renames ids, scrubs loose rows by column and empties the hash`: a capture with `ids { '7000001_Test_Kid': 1 }`, one loose row whose `First Name` is `Zyxwv` and whose `Favourite Snack TEST` is `Zebracakes 4455`, with a stub `anonRecord` that applies the rules (`name` gives `N`, unknown gives `TEST`); the result's `ids` has only the renamed id, the row holds neither `Zyxwv` nor `Zebracakes`, `hash === ''`.
  Run: `node test/anon-pc.test.js`. Expected: FAIL (`Cannot find module '../../tools/anon-pc.js'`).
- [ ] **Step 2: Implement `anon-pc.js`.** Build `COLUMN_RULES` from today's `anonRecord` branches (`make-test-data.js:187-210`), `KEEP` (`:183-185`) and `NAME_COLS` (`:186`), plus explicit `phone` and `email` entries for the phone and email columns of `PC_KNOWN`.
- [ ] **Step 3: Failing end-to-end tests** (`anonymizer-atomic.test.js`, TEST-data variant: copies of the TEST data file and the 20261028 TEST export in a temp dir):
  - `an unknown key in roster stops the run and writes nothing`: add `roster.somethingNew = { a: '7000001_Test_Kid' }` to the JSON text; exit 1, stdout or stderr contains `make-test-data does not know the roster key "somethingNew"`, out dir empty.
  - `an unknown key in a person's entry stops the run` (message `the person key "extraBit"`).
  - `an unknown top-level key that is not an object stops the run` (`"futureNote": "Zyxwv"`; message names `futureNote`).
  - `an unknown key inside pcExport stops the run`.
  - `a History change under roster that the tool does not know stops the run` (an entry with `p: ['roster', 'mystery']`).
  Run: `node test/anonymizer-atomic.test.js`. Expected: the five new tests FAIL (the key is copied today, or the run ends in the ordinary `PROBLEMS` without the message).
- [ ] **Step 4: Implement in `make-test-data.js`.** Read `rawData` before anything else (it is read at `:259` today; move it up) and stop on `unknownKeys(rawData)` with one line per path. Replace the `HANDLED` check (`:257-260`) with it. Use `ruleOf` in `anonRecord`. Apply `anonCapture` to `out.roster.pcExport` when present. In the History mapper (`:269-273`): a path `['roster', k, ...]` with `k` not `people` and not in `HISTORY_ROSTER_OK` throws (fail closed); `pcSource` values become `csvName0()`-shaped with their own date; `pcExport` values go through `anonCapture` (whole object) or the matching per-key rule (`ids › <id>` key renamed; `loose` through the rows rule; `header`/`names` initials replaced; `hash` emptied).
- [ ] **Step 5: Run** `node test/anon-pc.test.js && node test/anonymizer-atomic.test.js && node test/fake-data.test.js && node test/no-args.test.js`. Expected: PASS.
- [ ] **Step 6: `ANONYMIZATION.md`:** the rule table (column, rule, what it becomes) and the sentence "A column this table does not name is emptied (its name is kept): a new Planning Center question could hold anything." **Commit** (no app file changed, so no app version bump; the tool has no version line).
- [ ] **Step 7 (Mike, by hand, after the release):** regenerate the TEST data from a real file with `anonymized-data.test.js`'s real-file arguments; confirm the leak check passes and the run prints only counts.

### Task 2: Unknown keys are kept (top level, roster, person)

**Files:**
- Modify: `dev/app/season.js` (`fromJson`, `toJson`, `newSeason`), `dev/app/model.js` (`fromRoster`, `toRoster`), `dev/app/validate.js`
- Modify: `dev/app/test/season.test.js`, `dev/app/test/roster.test.js`, `dev/app/test/validate.test.js`, `dev/app/test/season-sections.test.js`, `docs/DATA-FORMAT.md` 2.5, 3

**Interfaces:**
- Produces: `Season.KNOWN_TOP: string[]`; `s.unknownKeys` (absent when none); `toJson` writes each at the top level and never writes a key named `unknownKeys`.
- Produces: `master.rosterExtra`, `master.personExtra` (plain objects; absent when empty); `Model.ROSTER_KEYS = ['cols','pcCols','pcKeys','pcAsOf','pcSource','pcExport','people']`.

- [ ] **Step 1: Failing tests.**
  - `season.test.js`: `a top-level key this app does not know survives open and save` (TEST file JSON plus `futureThing: { a: 1 }` and `futureNote: 'x'`; `JSON.parse(Season.toJson(Season.fromJson(text)))` holds both, deep-equal; `Season.diff` of the two snapshots is `[]`; a `__proto__` key is still dropped; a key named `unknownKeys` in the file is kept under `unknownKeys.unknownKeys`, never spread); `a new season does not carry unknown keys`.
  - `roster.test.js`: `keys of the roster and of a person that the model does not own survive fromRoster and toRoster` (`roster.futureKey = [1]`, `people[id].extraBit = 'x'`).
  - `validate.test.js`: `unknown keys are listed, not errors`: `info` `/2 parts of this file are not known to this app and are kept as they are \(futureThing, roster › futureKey\)/`; no `error` or `warn` from them.
  - `season-sections.test.js`: in the first test, keys in `s.unknownKeys` are allowed in the written file (add one to the season and assert it is written and not reported as untracked).
  Run the four files. Expected: the new tests FAIL.
- [ ] **Step 2: Implement.** `fromJson`: after the known copies, `Object.keys(o).filter(k => !KNOWN_TOP.includes(k))`. `toJson`: `Object.assign({}, s.unknownKeys, s, { roster: packRoster(s.roster) })` then `delete o.unknownKeys` (a known key wins because `s` comes after). `fromRoster`/`toRoster`: as in Interfaces. `syncData` needs no change (it calls `toRoster`). `App.loadData` passes everything through `setMaster(Model.fromRoster(s.roster))` already (`app.js:1115`); confirm by the browser test in Task 5.
- [ ] **Step 3: Run** the four files plus `node test/datamerge.test.js && node test/compact-file.test.js`. Expected: PASS. Then `node test/anonymizer-atomic.test.js` (Task 1's top-level test still fails closed: it reads the raw file).
- [ ] **Step 4: Spec.** 2.5 rewritten (kept, written back, not tracked at top level, tracked inside `roster`, not carried to a new season); section 3 gains a row "any other key: kept as it is (2.5)". `node test/data-format-doc.test.js`. **Commit.** Bump `season.js`, `model.js`, `validate.js`.

### Task 3: Read the export without dropping anything

**Files:**
- Modify: `dev/app/csv.js`, `dev/app/model.js` (`readExport`, `normalizePc`, `columnReport`, `loadMaster`, `toRoster`), `dev/app/validate.js` (`validatePc`), `dev/app/app.js` (`importPc` reads through `readExport`)
- Create: `dev/app/test/pc-fixture.js`, `dev/app/test/pc-capture.test.js`

**Interfaces:**
- Produces: `Csv.toTable(rows) -> { header: string[], body: string[][], blankRows: number }`: `header` is `rows[0]` untouched (`[]` for no rows), `body` the non-blank data rows as parsed (any length), `blankRows` the count of data rows whose every cell is `''`.
- Produces: `Model.readExport(text) -> { header, names, cols, records, cells, blankRows, rows, renamed }`: `names` per the stored-name rules (Design); `cols === names`; `records[i]` keyed by `names` (missing cell `''`); `cells[i]` the same row as a list in `names` order; `rows = records.length + blankRows`; `renamed` as `normalizePc` gives it plus `{ from, to }` for each `pc:` rename. The `{ cols, records }` part is what `planImport`, `unlinkedRecords` and `linkToPc` already take.
- Produces: `normalizePc` is idempotent: `normalizePc(normalizePc(x))` deep-equals `normalizePc(x)` for the TEST export and the fixture.
- Produces: `Model.toRoster` keeps any value that is not `undefined`/`null`/`''` (a value of spaces is kept).
- Produces (`pc-fixture.js`): `PcFixture.build(text) -> text`: the 20261103 TEST export plus a column `Favourite Snack TEST` (values on three rows), a second header `Selection` (duplicate), a column with a blank header holding `x` on one row, the header ` Grade` with a leading space, a column `x_Notes` holding `from the export` on the row of the TEST child used in the test, one fully blank row in the middle, one row with two cells past the header (`extra1`, `extra2`), one row with no First and Last Name (Registration ID `7999001`), one existing row's `Home Phone Number` set to three spaces. `PcFixture.grid(text)` returns `{ header, rows }` padded to the widest row, for the multiset comparisons in later tasks.

- [ ] **Step 1: Failing tests** (`pc-capture.test.js`):
  - `toTable keeps the header as written, counts blank rows and keeps every cell past the header`.
  - `readExport names every column: trimmed, numbered repeats, (no header N), pc: for a club-like name`: `names.includes('Grade')`, `header.includes(' Grade')`, `names.includes('Selection (2)')`, `names.includes('pc:x_Notes')`, one `(no header N)` for the blank header and two more for the extra cells, `blankRows === 1`, the long row's record has `extra1` and `extra2`.
  - `normalizePc is idempotent` (TEST export and fixture).
  - `an export column named like a club column is stored under pc: and never touches the club's value`: a master from the TEST data where the chosen child's `x_Notes` is `leader note`; plan and apply the fixture; `p.x_Notes === 'leader note'`, `p['pc:x_Notes'] === 'from the export'`, `Model.isUserCol('pc:x_Notes') === false`, and `toRoster` puts it in `pc`, not `v`.
  - `a value of only spaces is kept` (after `toRoster`).
  - `the standard export still reads exactly as before`: for the unmodified 20261103 TEST export, `readExport(text).cols` and `.records` deep-equal `normalizePc(Csv.toRecords(Csv.parse(text)))`'s.
  - `columnReport says when a column was renamed to pc:` (`info`, text `/has a column named “x_Notes”, which is a name this app uses for its own data; it is kept as “pc:x_Notes”/`).
  Run: `node test/pc-capture.test.js`. Expected: FAIL (`Csv.toTable is not a function`).
- [ ] **Step 2: Implement.** `loadMaster`, `validatePc` and `importPc` read through `Model.readExport`; `validatePc` adds the counts line (Design, "Validate tab (export)"). `Csv.toRecords` stays for the calendar, colors and old master readers.
- [ ] **Step 3: Run** `node test/pc-capture.test.js && node test/pc-columns.test.js && node test/roster.test.js && node test/import-test-file.test.js && node test/validate.test.js && node test/intake.test.js && node test/import-fixes.test.js`. Expected: PASS.
- [ ] **Step 4: Commit.** Bump `csv.js` (1.1.0), `model.js`, `validate.js`, `app.js`.

### Task 4: `roster.pcExport`, format version 6, and the rebuild that proves nothing is lost

**Files:**
- Modify: `dev/app/model.js` (`applyPlan`, `captureExport`, `exportBack`, `hashText`, `fromRoster`, `toRoster`, `linkToPc`), `dev/app/season.js` (`VERSION`, `describe`), `dev/app/validate.js`
- Modify: `dev/app/test/pc-capture.test.js`, `season.test.js`, `validate.test.js`, `compact-file.test.js`, `drive-inplace-browser.test.js`
- Modify: `docs/DATA-FORMAT.md` (3, 4.2, 5.2, 7.2, 10.2, 12, 14, 15), `dev/app/test/data-format-doc.test.js`, `CHANGELOG.md`

**Interfaces:**
- Consumes: Task 3's `readExport` result.
- Produces: `Model.applyPlan(...)` result gains `ids: string[]` (every person refreshed, renamed onto, linked or added from this export) and `loose: object[]` (every record attached to nobody).
- Produces: `Model.hashText(text) -> string` (`<8 hex>-<length>`, BOM removed first).
- Produces: `Model.captureExport(master, table, result, { text, at }) -> void` sets `master.pcExport` (Design). For a first load (`loadMaster`), `result` is `{ ids: every person's id, loose: [] }`.
- Produces: `Model.exportBack(roster) -> { header, rows } | null` (null without a record; ids no longer in `people` are skipped and counted by Validate).
- Produces: `Model.CAPTURE_KEYS = ['at','hash','header','names','rows','blankRows','ids','loose']`.
- Produces: `Model.linkToPc(master, p, pc, rec, today)` also moves the linked row from `loose` to `ids` when `master.pcExport` exists and the row is found in `loose` (exact cell match).
- Produces: `Season.VERSION === 6`; `fromJson` reads 1 to 6; `describe` words `roster › pcExport` changes.

- [ ] **Step 1: Failing tests.**
  - `pc-capture.test.js`, `nothing is lost: the export can be rebuilt from the data file`: import the fixture over the TEST data (every new row added except the no-name row); `s.roster = Model.toRoster(master)`; `back = Model.exportBack(Season.fromJson(Season.toJson(s)).roster)`; `back.header` deep-equals the fixture's row 0; sorted `back.rows.map(JSON.stringify)` deep-equals sorted `PcFixture.grid(fixture).rows` the same way. Also `Object.keys(pcExport.loose).length === 1`, `blankRows === 1`, `rows === Object.keys(ids).length + loose.length + blankRows`.
  - `...and it survives edit, History, undo and restore`: record the import with `Season.record`, set an attendance mark, record; `Season.at(s, n)` for the import's entry and `Season.restoreTo` both rebuild the same grid; `Season.at(s, <before the import>)` has no record.
  - `...a second, different export replaces it; a column the new export lacks keeps its values and is not in names; History logs one change per person who joined or left, not the whole id list`.
  - `...linking a guest to a loose row moves it into ids`.
  - `...the demo file's date shift moves loose rows and people's values alike` (`Season.shiftDates` on a season whose fixture row has an ISO date in a loose row and in a person's `pc`; `exportBack` still matches).
  - `season.test.js`: `the format is version 6; a version 5 file opens and is written as 6; a version 7 file is refused with "from a newer version of the app"`. (An older copy's refusal is the same check at `season.js:129` with its own limit 5; the old code is not loaded in a test, so the `VERSION + 1` refusal stands for it.)
  - `validate.test.js`, `pcExport is checked`, each from a clean capture:

  | Corrupt | Finding |
  |---|---|
  | `names.length < header.length` | `error` `/export record: fewer stored names than header cells/` |
  | a repeated name | `error` `/export record: the name .* appears twice/` |
  | an id in `ids` not in `people` | `warn` `/export record: 1 person .* is not on the roster/` |
  | a `loose` row that is not a list of text, or not `names.length` long | `error` `/export record: a kept row is not/` |
  | `rows` not the sum | `warn` `/export record: the row counts do not add up/` |
  | a key outside `CAPTURE_KEYS` | `info` (listed with the unknown keys of Task 2) |
  | clean | the two `info` lines of the Design ("Planning Center export kept: …", "… from an earlier export") |
  | version 6, people, no record | `info` `/No Planning Center export has been captured in this file yet/` |
  - `compact-file.test.js`: `the first capture adds under 15 KB to the test club's file`; `a second, different export adds under 2 KB beyond the changed values` (measure `toJson` length; subtract the History changes under `roster › people`).
  - `drive-inplace-browser.test.js`: `a copy cannot save over a Drive file from a newer format`: open F1, edit, write a newer revision whose text says `"version": Season.VERSION + 1` into the fake Drive (the same code path an older copy takes when it meets version 6), save; assert no `PATCH`, Drive's head text is unchanged, and the open file is still unsaved.
  Run the files. Expected: FAIL.
- [ ] **Step 2: Implement.** `fromRoster` reads `pcExport` into `master.pcExport` (a deep copy); `toRoster` writes it when present. `applyPlan` collects `ids` and `loose` as it goes (an unticked `plan.added` record, the `rec` of a rename that was neither accepted nor added). `VERSION = 6`. `describe`: `p[1] === 'pcExport'`: whole object "Planning Center export kept: N rows (…)"; `ids › <id>`: "<name> is in this export" / "is no longer in the export"; other keys: "Planning Center export record: <key> changed".
- [ ] **Step 3: Validate** (`validate.js`): the checks above (into the R16 table if Wave 2 Task 1 has landed, else after the roster block at `validate.js:62-68`).
- [ ] **Step 4: Run** `node test/pc-capture.test.js && node test/season.test.js && node test/validate.test.js && node test/compact-file.test.js && node test/season-sections.test.js && node test/datamerge.test.js && node test/versions.test.js && node test/merge.test.js`, then `NODE_PATH=... node test/drive-inplace-browser.test.js`. Expected: PASS.
- [ ] **Step 5: Spec.** 3: `version` currently `6`. 4.2: `VERSION` is `6`; the version 6 row ("`roster.pcExport` and kept unknown keys; a version 5 reader would drop them without a trace, so it must refuse the file"); replace "has stayed at 5 while sections were added" with the rule: **`VERSION` moves when an older reader would lose data; an added top-level section that is left out while empty does not need it**; the downgrade note (Design). 5.2: `pcExport` with every key of `Model.CAPTURE_KEYS`; the stored-name rules; the column-kind table and the free-text list; "any column not listed is treated as free text"; `rosterExtra`/`personExtra` behaviour. 7.2: one line pointing at `pcExport.names` (the packed names are still `pcCols`/`pcKeys`). 10.2: the import entry. 12: the new checks. 14: the example becomes version 6 with a small `pcExport` (one person, one loose row with invented values). 15 item 2: fixed. `data-format-doc.test.js`: `every key of the export record is documented` (each of `Model.CAPTURE_KEYS` appears as `` `key` `` under the 5.2 heading); the version test still reads `Season.VERSION`. Run `node test/data-format-doc.test.js && node test/doc-examples.test.js`. Expected: PASS.
- [ ] **Step 6: CHANGELOG** format line: version 6, what it adds, that every leader's copy must be updated before opening a file saved by the new one, and the downgrade note. **Commit.** Bump `model.js`, `season.js`, `validate.js`.

### Task 5: The import writes the record, logs every change, once per different export

**Files:**
- Modify: `dev/app/app.js` (`importPc`, `stampExport`, `applyDecided`, `recordImport`, `App.loadData`, link-to-PC handler near `:700`, `columnsDialog`), `dev/app/app-season.js` (`setSeason`), `dev/app/app-todo.js` (summary line)
- Create: `dev/app/test/pc-capture-browser.test.js`

**Interfaces:**
- Consumes: Tasks 3 and 4; Wave 2 Task 10's `opts` if present (`importPc(text, name, opts)`).
- Produces: `stampExport(name, table, result, text)` sets `pcAsOf`, `pcSource` and calls `Model.captureExport` with `at = new Date().toISOString()`.
- Produces: `importPc` returns early, changing nothing, when `master.pcExport && master.pcExport.hash === Model.hashText(text)`; `App.flash('This export is already in the file (imported ' + date + ').', 'info')`.
- Produces: after any import that applied, `App.changed()` is called when `Season.diff(snapshot before, season after syncData)` is non-empty, with the History label `Planning Center import: <name>`; `App.rebase()` only when the diff is empty. (Skip this item if Wave 2 Task 5 step 3 has landed; keep its label rule.)
- Produces: `App.loadData` no longer imports; it sets `App.pendingReapply = { text, name }` when it would have. `setSeason` runs `importPc(text, name, { quiet: true })` **after** `rebase()`, so the import is its own logged entry against the opened file's snapshot.
- Produces: `App.lastImport.counts` gains `cols`, `unusedCols`, `loose`, `blankRows`; the To do summary shows "Kept from the export: …".

- [ ] **Step 1: Failing browser tests** (`pc-capture-browser.test.js`; write `PcFixture.build`'s text to `os.tmpdir()` as `20261110 -- demo-club-2026-27 TEST extra.csv`; open the TEST data file first the way `import-browser.test.js` does):
  - `importing an export with extra columns and odd rows keeps all of it through save and reopen`: import the fixture, untick the no-name row in the review, Apply; take `App.snapshotJson()`; open that text in a fresh page; `Model.exportBack(App.season.roster)` equals the fixture grid (multiset); the Validate tab shows `Planning Center export kept`.
  - `the import is one History entry and Undo takes all of it back; Redo brings it back`: one new entry labelled `/^Planning Center import: 20261110/`; after Undo, `App.season.roster.pcExport` is what it was before (absent for the TEST file) and `exportBack` is `null`; after Redo it equals the grid.
  - `the same export a second time changes nothing`: import it again; `App.dirty()` unchanged, `App.season.history.length` unchanged, the flash text.
  - `a different export (one cell changed) is a new entry and a new hash`.
  - `an export that changes only a money column is logged` (the 20261103 TEST export with one `Balance Due` changed, imported over a file that already holds the 20261103 record): `App.dirty() === true`, one new entry, and `Validate.validate(App.snapshotJson(), …)` has no `/differs from what the history says/`.
  - `an export opened before the data file is applied after the open, as its own entry`: open the fixture with no data file open, then open the TEST data file; History's last entry is the import, the entry before it is the file's own last entry, no error in the console, no replay warning.
  - `the same export opened before a data file that already holds it changes nothing`.
  - `the To do page says what was kept` and `the Planning Center columns dialog lists every column with its status`.
  - `linking a guest to the loose row moves it into the record` (add a guest by hand, then use Link to Planning Center on their Person page and pick the `7999001` row, which `Model.unlinkedRecords` offers because it is an unadded record; afterwards `pcExport.loose.length === 0` and the guest's id is in `ids`).
  Run: `NODE_PATH=/tmp/claude-1000/shim/node_modules node test/pc-capture-browser.test.js`. Expected: FAIL.
- [ ] **Step 2: Implement** as in Interfaces. `loadMaster` (no master yet) and both apply paths (silent in `importPc`, `applyDecided`) call `stampExport` with the plan's result.
- [ ] **Step 3: Run** the new file, then `import-browser`, `import-button-browser`, `import-conflicts-browser`, `fresh-start-browser`, `todo-book-medical-browser`, `info-browser`, and `node test/import-fixes.test.js`. Expected: PASS. A test that asserted "an unchanged refresh is not unsaved" stays true only for the same export; one that asserted it for a different export with only hidden changes is changed on purpose (D7): say which in the commit message.
- [ ] **Step 4: Commit.** Bump `app.js`, `app-season.js`, `app-todo.js`.

### Task 6: Merge and Drive carry the Planning Center block whole

**Files:**
- Modify: `dev/app/datamerge.js` (`alignPc`, `plan`, `rowsOf`), `dev/app/app-drive.js` (the automatic branch of `merge`, `:114`)
- Modify: `dev/app/test/datamerge.test.js`, `dev/app/test/drive-inplace-browser.test.js`, `docs/DATA-FORMAT.md` 10.5

**Interfaces:**
- Produces: `DataMerge.alignPc(base, ours, theirs, opts) -> { ours, theirs, took: 'ours' | 'theirs' | '', newer: { asOf, at } | null }` on copies (inputs untouched). `block(x)` = `roster.pcCols`, `pcAsOf`, `pcSource`, `pcExport`, and `roster.people[id].pc` for ids on both sides. `changed(x)` = `block(x)` differs from `block(base)`.
  - `opts.keepTheirs` (a file merge, where "theirs" in `merge3` is the open file): ours' block is set to theirs'; `took: 'theirs'`; `newer` set when ours' `pcAsOf`/`at` is later.
  - otherwise: only one side changed: the other side's block is set to base's, so `merge3` carries the change whole; both changed: the later (`pcAsOf`, then `pcExport.at`; a tie keeps theirs, what Drive holds) wins and the loser's block is set to base's.
- Produces: `plan()` aligns before `merge3` (file merge: `keepTheirs` unless `opts.pc`), and the summary gains one row in "Roster and Planning Center fields": where `Planning Center data`, from `kept: this file's (as of X); the other file's is as of Y` or `took the newer export (as of Y)`. `P.conflicts` holds nothing under `roster › pcCols|pcAsOf|pcSource|pcExport` or `roster › people › <id> › pc`.

- [ ] **Step 1: Failing tests** (`datamerge.test.js`; two forks of the test season, each importing a different in-memory export through `Model.planImport`/`applyPlan`/`captureExport`):
  - `a file merge keeps this file's Planning Center block whole, and says when the other file's is newer`: after `finish`, the block deep-equals mine; `Model.exportBack(merged.roster)` equals my export's grid; exactly one Review row matching `/Planning Center data/`; no conflict under `roster`.
  - `Drive: only this copy imported since the base: its block is carried whole` (`opts.base`, `opts.pc`).
  - `Drive: both imported different exports: the newer wins whole, one Review row, no conflicts`.
  - `a child only the other file has still comes in whole, and is not in this file's export record`.
  - `club fields an import also writes still merge like edits` (`x_Notes` changed on one side merges).
  Run. Expected: FAIL.
- [ ] **Step 2: Implement.** `app-drive.js:114`: `const al = DataMerge.alignPc(c.base, ours, Season.fromJson(remote)); merged = Season.merge3(c.base, al.ours, al.theirs, …)`. The interactive branch goes through `DataMerge.plan` with `opts.pc` (already passed at `:115`).
- [ ] **Step 3: Browser test** in `drive-inplace-browser.test.js`: `a Drive save after an import here, while someone else saved attendance: Drive holds their marks and this copy's whole export record`.
- [ ] **Step 4: Run** `node test/datamerge.test.js && node test/merge.test.js && node test/season-sections.test.js`, then `drive-inplace-browser`, `merge-files-browser`. Expected: PASS, including `Planning Center fields are never merged, club fields are`.
- [ ] **Step 5: Spec 10.5** gains the block rule. **Commit.** Bump `datamerge.js`, `app-drive.js`.

### Task 7: Year rollover, the manual, README

**Files:**
- Modify: `dev/app/test/season.test.js`, `dev/app/info.js`, `dev/app/index.html` (via `node dev/tools/sync-guide.js`), `README.md`

- [ ] **Step 1: Test** (expected to pass already, it pins behaviour): `a new season carries the export record with the roster` (`Season.newSeason(s, '2027-28').roster.pcExport` deep-equals the old one; `exportBack` works on it; `unknownKeys` is not carried).
- [ ] **Step 2: Words.** Manual and the Import (i) note: what is kept (every column and row, blank rows counted), where it shows (Roster All fields, Validate, the columns dialog, To do), that importing the same file twice does nothing, and that a phone on an older copy must update before it can open a file saved by this one. README data-file table: `pcExport`, version 6. Run `node dev/tools/sync-guide.js && node test/info.test.js`. Expected: PASS.
- [ ] **Step 3: Commit.** Bump `info.js`.

### Task 8 (only if Mike's answer to Question 1 names other files): keep other Planning Center files whole
Outline, written as steps once the files are named: a new tracked section `pcFiles` (`{ "<kind>": { at, hash, name, header: [...], rows: [[...]] } }`), added to `Season.SECTIONS`, `AREA`, `describe`, `categoryOf`, the R16 check table, `KNOWN_TOP`, the spec and the anonymizer's `TOP_HANDLED` (the anonymizer **drops** it); `kindOf`/`detect` recognise each file only by a rule Mike confirms (never by guessing); a file with First Name and Last Name but no `Registration ID` asks before it is taken for the roster.

### Task 9: Release wrap-up
- [ ] **Step 1:** `app-version` to the next free release after whatever Wave 2 left (expected `1.51.09` if 2a and 2b shipped first), `app-build` to the day. Check each changed `.js` has its own bump: `csv.js`, `model.js`, `season.js`, `validate.js`, `app.js`, `app-season.js`, `app-todo.js`, `datamerge.js`, `app-drive.js`, `info.js`.
- [ ] **Step 2:** `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh` from the repo root. Expected: no failures.
- [ ] **Step 3:** `sh make-deploy.sh` on the dev tree only (no rsync to production) runs clean. The try-it data file in `dev/test-data` stays version 5 on purpose (it must keep opening and upgrading); note this in `dev/test-data/TEST-CASES.md`.
- [ ] **Step 4:** CHANGELOG ("Next release": the capture, version 6, update every copy), README, BACKLOG (R17 with its new meaning, "done in dev"; Question answers recorded).
- [ ] **Step 5: Report**, and list what Mike runs by hand: (a) import this week's real export into a **copy** of the real file and read the Validate lines (columns, unused columns, rows that belong to nobody; counts only); (b) save, reopen, check the lines are the same; (c) open the saved file on a phone that has **not** updated and confirm it refuses with the newer-version message; (d) regenerate the TEST data (Task 1 step 7); (e) Validate on his current file before release shows no new error.

## Risks
1. **Every leader must update.** After the first save by the new app, older copies cannot open the file (by design). The update bar does it, but a phone that is offline on club night cannot. Mitigation: CHANGELOG and the manual say so; release on a non-club day; the downgrade note exists.
2. **More children's data in the file and in History** (loose rows, money and unused column changes). Mitigation: Question 2; the anonymizer fails closed; nothing new leaves the browser except where the file already goes (download, Drive).
3. **`normalizePc` run twice** (`readExport` then `planImport`): a non-idempotent rename would move values to a second key. Mitigation: the idempotence test (Task 3).
4. **Club fields written by the import** (`x_LastSeen`, deactivations, cleared `ov:`) merge field by field while the Planning Center block moves whole, so after a Drive merge of two different imports a person's `x_LastSeen` can come from the losing export. Harmless (it is a stamp History ignores, `season.js:1152`), noted in 10.5.
5. **A blank-header column in an existing file** was stored under `''`; after the next import its values are under `(no header N)` and the old `''` column counts as "from an earlier export". Only matters if a real export ever had a blank header; Validate shows it.
6. **An export with an `x_ClubberID` column** is still taken for an old master CSV (`kindOf`, `detect`) before any of this runs. Known limit; listed in the spec, not changed here.
7. **The stale-`snap` re-apply** (Task 5) touches `setSeason`, which every open goes through. Mitigation: the browser tests in Task 5 plus `fresh-start-browser`, `drive-inplace-browser`, `merge-files-browser`.
8. **Wave 2 lands in a different order.** Each task says what to do either way; the version numbers in Task 9 are the "next free" ones, not fixed.

## Self-review
- **Requirement coverage:** every column (Tasks 3, 4), new/removed/renamed columns (Task 3 table, D3), odd and blank rows (Task 3), rows attached to nobody (Task 4, Question 2), open/edit/save (Tasks 2, 4), History/undo/restore (Task 4, Task 5 browser), merge and Drive (Task 6), re-import and size growth (Tasks 4, 5), shown or counted (Tasks 3 to 5), unknown keys (Task 2), privacy (Task 1, Design), phone size (Task 4), release rules (Task 9). L1 to L14 each have a task; L15 is Question 1 plus a known limit.
- **Order:** the anonymizer (Task 1) before anything keeps or writes new data (Tasks 2 to 5); the reader (3) before the record (4) before the import (5) before the merge (6).
- **Names:** `anon-pc.js` exports (1); `KNOWN_TOP`, `unknownKeys`, `rosterExtra`, `personExtra`, `ROSTER_KEYS` (2); `toTable`, `readExport`, `PcFixture.build`/`grid` (3); `captureExport`, `exportBack`, `hashText`, `CAPTURE_KEYS` (4); `pendingReapply`, `stampExport(name, table, result, text)` (5); `alignPc` (6).
- **`Season.SECTIONS`:** unchanged on purpose (no new top-level section); `season-sections.test.js` still passes and gains the unknown-keys allowance.
