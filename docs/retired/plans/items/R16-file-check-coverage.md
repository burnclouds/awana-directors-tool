# R16: the file check covers every section and every config area (item plan)

> **DECISION (Mike, 2026-11-13) on D5 (a section that is not an object):** the app must never silently empty or drop data. **If a file's section is damaged (for example a list where a map belongs), opening it must warn, and saving must not erase the damaged value:** the raw value is kept untouched in the unknown-data bag that R17 builds (written back as it was), the working section starts empty, and a visible notice on open plus a Validate error name the section and say the saved file still holds the original. Until R17 lands, the minimum is the warning on open (a notice naming the section and saying the next save would erase it) and the Validate error; do the keep-and-write-back with R17. What this means in plain words: today a file with, say, a Blue Jewel section stored as a list instead of a map opens fine, the section silently becomes empty, and the next Save writes the empty one over it. Nothing in your normal use does this; it can only come from a damaged or hand-edited file or a bug in a future version.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

STATUS: COMPLETE (planning only; nothing built). Refines Tasks 1 to 3 of `docs/superpowers/plans/2026-11-13-wave2-data-safety.md` (release 2a). Where this file and that plan differ, this file is the newer decision; the differences are listed under "Changes from the wave 2 plan".

**Goal:** A damaged section or setting in a data file is reported on the Validate tab with a named check, without new alarms on any file the app wrote itself, and a new `Season.SECTIONS` entry or config key cannot be added without a check.

**Architecture:** All checks stay in `dev/app/validate.js` (`validateData`), which stays a pure function (text in, findings out). The inline blocks become two tables, `SECTION_CHECKS` and `CONFIG_CHECKS`, run in a fixed order; every finding gains a `check` name. Coverage is enforced by `test/season-sections.test.js`. A count-only tool `dev/tools/check-file.js` lets Mike run the new checks on his real file without anything personal being printed. No data-format change (format version stays 5).

**Tech Stack:** Vanilla JS (no bundler), Node 24 (node tests), POSIX `sh`. No new dependencies. No browser test is needed (the Validate tab renders `msg` and `level` only; `check` is ignored by `app-tools.js:79` `renderResult`).

**Spec:** `docs/DATA-FORMAT.md` sections 5 (each section's shape), 6 (config), 7 (encoded values), 9.4 (flags), 12 (what is checked), 15 item 1; BACKLOG R16; roadmap `2026-11-12-review-fixes-roadmap.md` (R16 row and "R16 file check" paragraph).

## Claims checked against the code (2026-11-13; `validate.js` 1.8.0, `season.js` 1.59.1, `catalog.js` 1.16.0)

| Claim (where) | Verdict | Evidence |
|---|---|---|
| The eleven sections `held`, `flags`, `doneBooks`, `received`, `givenNoDate`, `progressNoDate`, `extraSheets`, `announcedNoDate`, `blueWings`, `blueOverrides`, `blueDrops` are not checked (BACKLOG, spec 12) | Holds | No reference to any of them in `validate.js`. |
| The config shapes `books`, `progress`, `awardLists`, `exclude`, `completion`, `endOfYear`, `store`, `teamPlan`, `teamsOk`, `todoIgnored`, `driveDirs`, `bundles` are not checked | Holds | `validate.js:47-57` checks only `clubDay`, `blueJewelWeeks`, `teamOrder`, `saveStyleDrive`, `saveStyleLocal`, `autoUpdate`, `autoSave`, `drivePinDays`, `sparksBooks`, `yearBook` (book reference only, a warning), `placePoints`. |
| "nor that each packed `pc` list is as long as `pcCols`/`pcKeys`" (BACKLOG R16, spec 12) | **Wrong** | `validate.js:65` does compare the length; only its message is wrong (`has no Planning Center record (missing "pc")`). Already noted by the wave 2 plan. |
| "A damaged `blueDrops` passes the Validate tab" (BACKLOG) | Holds, and worse than stated | If a section is not an object (for example `blueDrops: []`), `Season.fromJson` (`season.js:140`) silently keeps the blank `{}` instead, so the section's data is **lost at the next save**, and nothing reports it. Same for `calendar`/`rotation`/`history` when not lists (`season.js:150`). `calendar`, `rotation`, `history` already have a "must be a list" error; the 19 object sections do not. |
| Wave 2 Task 1: "the TEST file must stay clean" proves the new checks raise no false alarms | **Insufficient** | The TEST file (`dev/test-data/awana-2026-27-TEST-20261029-214815.json`, version 5) contains **none** of the eleven sections, so it says nothing about them. A rich valid fixture built through the real setters is needed (Task 1). |
| Wave 2 Task 3: coverage test uses `Object.keys(Catalog.defaultConfig())` | **Incomplete** | `defaultConfig()` has 21 keys; it lacks `teamPlan`, `bookOrder`, `slideNames`, `medRead`, `medPrinted`, `clubTitle`, `driveKeepName`, `cubbiesDetail`, `bundles` (all written by the app) and `tntBook` (legacy). Use the same source scan `test/data-format-doc.test.js:25` already uses. |
| Wave 2 Task 2: `driveDirs` checks `club` | Needs care | The TEST file's `driveDirs` is the **legacy** `{ data, open, slides }` (all `null`) and the default in `catalog.js` still is. Until R18 lands, `open` and `data` must be accepted silently. |
| `Season.FLAG_LEVELS` is exported | No | `season.js:795` defines it; `api` (`season.js:1340-1343`) does not export it. Nor `RECEIVED_NO_DATE`. |
| `x_noteam:Qn` is in the spec | No | Written by `Model.setTeamChoice` (`model.js:465`), absent from spec 5.2 (wave 2 Task 3 step 3 is right). |

## Global Constraints
- Use the Edit and Write tools to change files; scripted rewrites (`sed -i`, inline `node -e` that writes files) are blocked. Tests may run anything.
- Never open, read, list or print a real data file (`archive/`, `~/Downloads`, `~/Nextcloud`, `dev/*.json`, `dev/*.csv`, `reports/`, `research_notes/`). Tests use `dev/test-data` and invented ids (`7000001_Test_Kid`, `7000002_Test_Kid`). Never copy a TEST person's id or name into a test or a doc either: tests pick ids at run time (`Object.keys(o.roster.people)[0]`).
- Tests run from `dev/app`: `node test/<name>.test.js`. Full sweep from the repo root: `sh dev/tools/run-tests.sh` (browser tests in the sweep need `NODE_PATH=/tmp/claude-1000/shim/node_modules`).
- Each changed `.js` gets its own line-1 version bumped in the task that changes it (`make-deploy.sh` refuses otherwise): `validate.js` 1.8.0 to 1.9.0 (once, first task that touches it; later tasks in the same release do not bump again unless the controller says each commit is a release), `season.js` 1.59.1 to 1.59.2 if `FLAG_LEVELS` is exported. Tools in `dev/tools` and tests have no version line.
- `app-version` / `app-build` in `dev/app/index.html` are bumped once, in the release 2a wrap-up (wave 2 Task 7b), not here. Note: `index.html` today says `1.51.06` and CHANGELOG has "Next release (in dev, not deployed): 1.51.06"; whether 2a reuses 1.51.06 or takes 1.51.07 is the wrap-up's call (open question 5).
- `docs/DATA-FORMAT.md` section 12 (and 5.2, 15) and `dev/app/test/data-format-doc.test.js` change in the same task as the check they describe.
- Do not deploy. Commit messages end with the two attribution lines given in the session.

## Decisions

### D1. Levels (refines the wave 2 rule)
| Level | When | Examples |
|---|---|---|
| `error` | The app would lose, drop or misread the value: a section that is not an object (lost on open), a list where a map is expected, a date that is not a real date where a date is read, a number out of range, a missing required field. | `blueDrops: []`; `received[id].HG = '2026-02-30'`; a blue wing with `slot: 5`. |
| `warn` | The app reads it, but it points at nothing or half a pair is missing: an id not on the roster (existing ghost count), a book code not in `config.books`, a `givenNoDate` award with no `given` date, a `progressNoDate` key with no `progress` date; a value the app reads correctly but that the setters never write (`held` mark `true` instead of `1`, an unsorted or duplicated list). | `doneBooks[id] = ['ZZ']`. |
| `info` | Kept, not used: an unknown config key, an unknown owned field in `v`, a legacy key the app still reads (`driveDirs.open`/`data`, `tntBook`). | `config.futureThing = 1`. |

Not checked at all (decided, to avoid false alarms): award names against `config.awardLists` (older files hold names without the book code, `renameAward` exists, and custom awards are allowed), progress keys against the template (`rev` keys and renamed blocks survive in older files), and the order of `calendar` rows. Each stays listed under "Not checked" in spec 12 with that reason.

### D2. Message style (matches the existing checks)
- One sentence, plain words, ends with a full stop. The section is named in words first, as the existing ones do (`Attendance 2026-10-28 · <id>: ...`, `Team move for "<id>" needs ...`, `Awards given for "<id>" is not ...`).
- The wrong value is quoted with `JSON.stringify` (as `validate.js:48-55` do) and the expected form follows in parentheses: `... is ${JSON.stringify(v)} (a real date, "no date" or empty).`
- Words used for the sections (the Validate tab is read by leaders): held = "Held awards", flags = "Flag", doneBooks = "Books finished before", received = "Date received", givenNoDate = "Given, no date", progressNoDate = "No-date sign-offs", extraSheets = "Added sheets", announcedNoDate = "Told, no date", blueWings = "Blue Jewel placement", blueOverrides = "Blue Jewel given by hand", blueDrops = "Dropped Blue Jewel".
- **A `warn` that can legitimately occur on a real file is aggregated**, in the form of the ghost message (`validate.js:125`): a count, then at most three examples **inside parentheses**. Reason: `make-test-data.js:307` and `test/anonymized-data.test.js:84` match a real file's findings to the anonymized copy's by `msg` with digits replaced and everything from the first `(` cut. A per-person warning that starts with an id would differ between the real and the anonymized file (the ids differ), so the anonymizer would stop with "file check warn" on a warning it did not cause. `error` lines may name the id first (a real file with an error must be repaired anyway).

### D3. Where the checks read from
From the raw parsed object `o`, as the existing checks do (not from `s = Season.fromJson(text)`, which fills defaults and drops non-object sections). A config key absent from `o.config` is not checked (its default applies). People: `o.roster.people` keys (unchanged `people`/`known` logic). Books: `o.config.books` when it is an object, else `Catalog.defaultConfig().books` (that is what `fromJson` gives). Book codes are compared exactly, plus `common` where a progress book level is allowed.

### D4. The `check` field and the coverage lists
- Every finding becomes `{ level, msg, check }`. `check` is a section name (`'held'`), `'config.<key>'`, or one of `'file'` (JSON, format, version, file name, year, the summary line), `'ghosts'`, `'nights'` (records on dates that are not club nights), `'history'`, `'replay'`.
- `Validate.CHECKED_SECTIONS`: `Object.keys(SECTION_CHECKS)`, so the list cannot drift from what runs. Must equal `Season.SECTIONS` as a set (including `config` and `roster`).
- `Validate.CHECKED_CONFIG`: `Object.keys(CONFIG_CHECKS)`.
- `CONFIG_CHECKS` holds a check for every key in spec 6, including the ones that are free text (`clubTitle`, `driveKeepName`: "text") and `tntBook` (info: "an older T&T book setting, folded into the book for this year when the file is opened").

### D5. A section that is not an object
One new rule ahead of the section table: for each of the 19 object sections in `season.js:140` (`handbooks` ... `blueDrops`), if `o[k] !== undefined && !isObj(o[k])`: `error` `The <words> section is <type> (it must be an object); opening the file empties it, so its records are lost at the next save.` with `check: k`. (Today this is silent data loss.) The section's own checks then skip it.

## Review Focus
1. **A real file that is fine today gets an `error`.** Owner: Task 4 step 4 (Mike runs the count-only checker first; loosen to `warn` or repair, Mike decides).
2. **The anonymizer stops on a warning it did not cause** (D2). Owner: Task 1 test `aggregated warnings keep ids inside the parentheses`, and Task 4 step 4 (Mike re-runs `make-test-data.js` on his file before release).
3. **A file written by this build fails its own check.** Owner: Task 1 test `a rich valid file, made only through the setters, has no errors or warnings`, which writes every one of the eleven sections and the rarer config keys.
4. **An older-format file gets errors it cannot help** (version 1 to 4, legacy `driveDirs`, `tntBook`, names without book codes, `x_ClubberID`). Owner: Task 2 test `older files: only info lines for what the app still reads`, and the existing `an older format opens with an info line` test in `validate.test.js` (line ~92).
5. **The checks are slow on a full file** (the existing replay is the slow part; new checks are linear). No test; the implementer times `node -e` validate on the TEST file before and after and reports it.

## File Structure
| File | Change | Responsibility |
|---|---|---|
| `dev/app/validate.js` | modify | `SECTION_CHECKS`, `CONFIG_CHECKS`, `check` on every finding, the non-object rule (D5), the roster checks, `CHECKED_SECTIONS`, `CHECKED_CONFIG`. |
| `dev/app/season.js` | modify (one line) | Export `FLAG_LEVELS` and `FLAG_NO_KID` (no other change). |
| `dev/app/test/validate.test.js` | modify | `testFile()`, `richValid()`, one test per check (below). |
| `dev/app/test/season-sections.test.js` | modify | Coverage rule for sections and config keys. |
| `dev/tools/check-file.js` | create | Count-only checker Mike runs on a real file. |
| `dev/app/test/check-file.test.js` | create | The tool prints no id, name or message text; exit codes. |
| `dev/tools/make-test-data.js` | modify (one regex) | `x_noteam:` passes through `anonV` (`make-test-data.js:220`). |
| `docs/DATA-FORMAT.md` | modify | 5.2 (`x_noteam:Qn` row), 12 (checked / not checked, with reasons), 15 item 1 marked fixed. |
| `dev/app/test/data-format-doc.test.js` | modify | `x_noteam:Q1` row present; section 12 lists every `Validate.CHECKED_SECTIONS` entry under "Checked". |

## Test fixtures (in `validate.test.js`)
- `testFile()`: `JSON.parse` of the TEST data file (path as `fake-data.test.js:7` finds it), returned as a fresh object; `kid = Object.keys(o.roster.people)[0]`; `GHOST = '7000001_Test_Kid'` (assert it is not a TEST roster key). `runO(o)` = `V.validate(JSON.stringify(o), OK_NAME)`.
- `richValid()`: `S.fromJson` of the TEST text, then, for one Sparks child (picked by the HG/WR/SS handbook code at run time) and one T&T child, through the real setters only: `S.setHold(s, id, 'HG Red Jewel 1', true)`; `S.addFlag(s, { kid: id, level: 'box', book: 'HG', block: 'RJ1', key: 'RJ1.1', note: 'test note' }, new Date(2026, 9, 28))` plus one `general` and one `element` flag; `S.setBookDone(s, id2, 'AoG', true)`; `S.setReceived(s, id, 'HG', '2026-09-16')` and one with `{ noDate: true }`; `S.setGiven(s, id, 'HG Red Jewel 1', '2026-10-28', { noDate: true })`; `S.markSignsNoDate(s, id, 'HG', ['RJ1.1'], '2026-10-28')`; `S.addExtraSheet(s, id, 'WR')`; `S.setAnnNoDate(s, id, 'HG Red Jewel 2', true)`; a `blueWings` entry in the exact shape `newSeason` writes (`season.js:461`: `{ book, slot, n, threshold, earned, date, year, override, note }`); `S.grantBlue(s, id, 'HG', 2, '2026-10-07', '')`; `S.dropBlue(s, id, { kind: 'earned', book: 'HG', slot: 1, gem: 1, date: '2026-10-07', n: 1 })`. Config: `teamPlan` as `teamplan.js` writes it, `bookOrder`, `slideNames`, `medRead`, `medPrinted`, `clubTitle`, `driveKeepName`, `cubbiesDetail: 'unit'`, `bundles` from the standard bundles, `driveDirs` in both the legacy and the current shape. Use the setters' real signatures (checked: `setReceived(s, id, book, date, opts)`, `setGiven(s, id, award, date, opts)`, `markSignsNoDate(s, id, book, keys, date)`, `addFlag(s, f, now)`, `grantBlue(s, id, book, slot, date, note)`).
- A mutation test starts from `testFile()` (or `richValid()` serialized and parsed when the rule is a pair rule) and changes one value. Every row below names the mutation and the expected finding; each also asserts `f.check`.

## The checks

Levels per D1; messages per D2 (the regex is what the test matches; final wording is the implementer's, in that style).

### Sections (in `SECTION_CHECKS`)
| Check | Rule | Level | Failing test (mutation of `testFile()`) | Expected |
|---|---|---|---|---|
| any of the 19 object sections | not an object (D5) | error | `o.blueDrops = []` | `/Dropped Blue Jewel section is a list.*lost at the next save/` |
| `held` | `held[id]` is an object; each value is `1` | error if `held[id]` is not an object; warn (aggregated) if a value is truthy but not `1`; error if falsy | `held[kid] = ['HG Red Jewel 1']`; `held[kid] = { 'HG Red Jewel 1': true }`; `{ x: 0 }` | error `/Held awards for/`; warn `/held mark that is not 1/`; error |
| `flags` | each flag an object; `level` in `FLAG_LEVELS`; `note` non-empty text; `at` a real date; `kid` text, non-empty unless level in `FLAG_NO_KID`, and known (ghost count); `book`, `block`, `key` text; `level` needs per spec 9.4 (`attend`: `date`, `room`; `team`: `quarter`, `group`; `field`: `field`; `element`: `tab` text, `trail` non-empty list of text, `rowIndex` integer >= 0) | error | `flags.f1 = { kid: kid, level: 'nope', note: 'x', at: '2026-10-28' }`; `note: ''`; `at: '2026-02-30'`; `{ level: 'element', tab: 'x', trail: [] , ...}` | error `/Flag f1/` each |
| `doneBooks` | list of text, no duplicates; codes in `config.books` | error if not a list of text; warn (aggregated) for unknown code | `doneBooks[kid] = 'AoG'`; `['ZZ']` | error `/Books finished before/`; warn `/not in the list of books \(/` |
| `received` | object of book to (real date \| `"no date"` \| `""`); book in `config.books` | error for a value; warn (aggregated) for unknown book | `received[kid] = { HG: '2026-02-30' }`; `{ HG: 'no date' }`; `{ HG: '' }`; `{ ZZ: '2026-09-16' }` | error `/Date received/`; nothing; nothing; warn |
| `givenNoDate` | list of text; each award has `given[id][award]` | error if not a list of text; warn (aggregated) for the missing half | `givenNoDate[kid] = { a: 1 }`; `['X']` with no `given[kid].X` | error `/Given, no date/`; warn `/no date given .* \(/` |
| `progressNoDate` | object of book (code or `common`) to list of text; each key has `progress[id][book][key]` | error for shape; warn (aggregated) for the missing half and unknown book | `progressNoDate[kid] = ['RJ1.1']`; `{ HG: ['RJ1.9'] }` with no such progress key | error `/No-date sign-offs/`; warn `/has no sign-off/` |
| `extraSheets` | list of text; codes in `config.books` | error for shape; warn (aggregated) for unknown code | `extraSheets[kid] = { WR: 1 }` | error `/Added sheets/` |
| `announcedNoDate` | list of text | error | `announcedNoDate[kid] = 'X'` | error `/Told, no date/` |
| `blueWings` | list of objects: `book` a Sparks book, `slot` and `n` integers 1-4, `threshold` integer > 0, `earned` and `date` real dates, `year` `YYYY-YY` form, `override` absent or boolean, `note` absent or text | error | `blueWings[kid] = [{ book: 'HG', slot: 5, n: 1, threshold: 6, earned: '2025-10-01', date: '2025-11-05', year: '2025-26' }]` | error `/Blue Jewel placement/` |
| `blueOverrides` | list of `{ book: Sparks book, n: integer 1-4, date: real date, note: text (may be empty) }` | error | `[{ book: 'HG', n: 2, date: 'soon', note: '' }]`; `note` absent | error `/Blue Jewel given by hand/` both |
| `blueDrops` | sorted list of `"<gem 1-4>|<real date>"` | error for form; warn (aggregated) if unsorted or duplicated | `['1-2026-10-07']`; `['2|2026-10-07', '1|2026-10-07']` | error `/Dropped Blue Jewel/`; warn |
| ghosts | every one of the eleven keyed by `GHOST` with a valid value | warn (existing message) | as said | `/11 records refer to people who are not on the roster/` |
| existing sections | `handbooks`, `attendance`, `awards`, `given`, `adults`, `teamMoves`, `games`, `progress`, `calendar`, `rotation`, `history` move into the table **with their messages unchanged** | as today | existing tests | existing tests pass unchanged; add one asserting `check` for `attendance` |

### Roster (`SECTION_CHECKS.roster`)
| Rule | Level | Failing test | Expected |
|---|---|---|---|
| `roster` not an object, or `people` not an object | error | `o.roster.people = []` | `/The roster's people/` |
| `cols`, `pcCols`, `pcKeys` (when present) lists of text without duplicates | error | `pcCols = ['A', 'A']` | `/column names.*twice/` |
| `pcAsOf` absent or a real date; `pcSource` absent or text | warn | `pcAsOf = '2026-13-01'` | `/as of/` |
| packed `pc` length (today's check), **message fixed** | error | drop one value from one person's `pc` | `/has 52 Planning Center values but the file names 53 columns/` (count from the TEST file at run time, not typed) |
| `v` values are text | error | `v.x_Notes = 5` | `/owned field/` |
| `x_Active` and flag fields (`x_NoPhotos`, `x_Uni_GivenFlag`, `x_noteam:Qn`) are `'1'` or `'0'`/absent | error | `v.x_Active = 'yes'` | error |
| date fields (`x_FirstSeen`, `x_LastSeen`, `x_Uni_*Date`) real dates | error | `v.x_Uni_GivenDate = 'soon'` | error |
| `team:Qn` and `team:<year>:Qn` (today's check, kept) | error | existing test | unchanged |
| an owned field not in spec 5.2 and not one of the reserved prefixes (`ov:`, `att:`, `prog:`, `award:`) | info (aggregated, names only the field, not the person) | `v.x_Mystery = 'a'` | `/1 owned field this app does not know is kept as it is \(x_Mystery\)/` |
| `x_ClubberID` in `v` | info (aggregated) | add it to one person | `/older ID field/` (removed by R18 later) |

### Config (`CONFIG_CHECKS`; only keys present in `o.config`)
The eleven existing checks move in unchanged (messages and levels). New:

| Key | Rule | Level | Failing test | Expected |
|---|---|---|---|---|
| `books` | object; code 2-3 letters (`/^[A-Za-z]{2,3}$/`); value `{ name: text, emblem: text, group: Cubbies/Sparks/T&T }` | error | `books.HG = 'Hang Glider'`; `books.TOOLONG = {...}`; `books.HG.group = 'Teens'` | `/Book HG/`, `/Book TOOLONG/`, `/Book HG.*group/` |
| `progress` | object with `Cubbies`, `Sparks`, `T&T` templates; each `common`/`perBook` a list of blocks; block `key` text, `label` text, `items` non-empty list of text, `review` absent or list of text, `awards` list of text, `single` absent or boolean; Sparks `bookReview` absent or `{ label, awards }`. Block keys unique within a template | error | `progress.Sparks.perBook = 'x'`; a block with no `key`; `items: [1]` | `/progress template for Sparks/` |
| `awardLists`, `exclude`, `completion`, `endOfYear` | object of group to list of text | error | `awardLists.Sparks = 'x'` (one test each key) | `/award list .*awardLists/` etc. |
| `store` | `method` in `direct`/`top`/`range`; `min`, `max` numbers with `min <= max`; `programs` list of `Sparks`/`T&T`; `weights` object of finite numbers >= 0 | error | `method: 'guess'`; `min: 'a'`; `weights.awards = -1` | `/store points/` |
| `teamPlan` | `proj` object of id to `/^[RBGY-]{4}$/`; `locked` object of `Q1..Q4` to real date; `prio` absent or object | error for shape; warn (aggregated) for a `proj` id not on the roster | `proj = { [kid]: 'RBX-' }`; `locked = { Q9: '2026-10-01' }`; `proj = { [GHOST]: 'RB--' }` | `/team plan/`; warn |
| `teamsOk` | `{ repeats: list of text, uneven: list of Q1..Q4 }` | error | `repeats: 'x'`; `uneven: ['Q7']` | `/accepted team warnings/` |
| `todoIgnored` | list of text, each with at least two `|` | error | `['no bars here']` | `/ignored To do item/` |
| `driveDirs` | object; keys among `club`, `slides`, `open`, `data`; each `null` or `{ id: text, name: text, parent? }` | error for shape; info (once) when `open` or `data` holds a folder | `club = 'folder'`; `club = { id: 5 }`; TEST file as is | `/Drive folder/`; nothing for the TEST file's all-`null` legacy keys |
| `bundles` | list of `{ name: text, items: list of objects with text `report` }` | error | `[{ name: 'x' }]` | `/report bundle/` |
| `bookOrder` | object of group to list of book codes | error; warn for unknown code | `bookOrder = ['AoG']` | `/book order/` |
| `slideNames`, `medRead`, `medPrinted` | object of text to text (`medRead`/`medPrinted` keys are ids: ghost count) | error | `slideNames = { a: 1 }` | names the key |
| `clubTitle`, `driveKeepName` | text | error | `clubTitle = 5` | names the key |
| `cubbiesDetail` | `unit` or `section` | error | `'x'` | names the key |
| `tntBook` | text; info "folded into the book for this year when opened" | info | `tntBook = 'AoG'` | info |
| unknown key | not in `CONFIG_CHECKS` | info (one line, aggregated) | `config.futureThing = 1` | `/1 setting this app does not know is kept as it is \(futureThing\)/`, no error |

## Tasks

### Task 1: Section checks, the non-object rule and the fixtures
**Files:** modify `dev/app/validate.js`, `dev/app/season.js` (export only), `dev/app/test/validate.test.js`, `docs/DATA-FORMAT.md` (12).
**Interfaces:** produces `SECTION_CHECKS`, findings with `check`, `Validate.CHECKED_SECTIONS`; consumes `Season.FLAG_LEVELS`, `Season.FLAG_NO_KID`.
- [ ] **Step 1: Failing tests.** Add `testFile()`, `richValid()` and one test per row of the Sections table, plus: `a rich valid file, made only through the setters, has no errors or warnings`; `the TEST file has no errors or warnings` (it has none today: run `node -e` validate once to confirm before relying on it); `every finding says which check made it` (`r.findings.every(f => typeof f.check === 'string')` on the TEST file and on a file with one error per section); `aggregated warnings keep ids inside the parentheses` (for each aggregated warn, `f.msg.indexOf(GHOST) > f.msg.indexOf('(')`).
  Run `node test/validate.test.js`. Expected: new tests FAIL; existing ones PASS.
- [ ] **Step 2: Implement.** Table of section checks keyed by section name, each `(value, ctx)` with `ctx = { err, warn, info, known, books, people, o }` bound to that section's `check`; run in `Season.SECTIONS` order, then `history`/replay/summary as today. Existing inline blocks move in with byte-identical messages. Export `FLAG_LEVELS`, `FLAG_NO_KID` from `season.js`; bump `season.js` 1.59.2, `validate.js` 1.9.0.
- [ ] **Step 3: Run** `node test/validate.test.js && node test/season-sections.test.js && node test/fake-data.test.js && node test/doc-examples.test.js && node test/anonymized-data.test.js && node test/season.test.js`. Expected: PASS (the last two must not regress; `anonymized-data.test.js` may print SKIP if it needs a real file).
- [ ] **Step 4: Spec 12.** Move the eleven sections to "Checked"; add the non-object rule. `node test/data-format-doc.test.js`: PASS.
- [ ] **Step 5: Commit** `validate.js`, `season.js`, `validate.test.js`, `DATA-FORMAT.md`.

### Task 2: Config checks
**Files:** modify `dev/app/validate.js`, `dev/app/test/validate.test.js`, `docs/DATA-FORMAT.md` (12).
**Interfaces:** produces `CONFIG_CHECKS`, `Validate.CHECKED_CONFIG`; `check` is `'config.<key>'`.
- [ ] **Step 1: Failing tests:** one per row of the Config table; `existing config checks keep their messages` (the eleven current messages, one mutation each, matched exactly); `older files: only info lines for what the app still reads` (TEST file with `version: 4`, `driveDirs` legacy with a folder in `data`, `tntBook: 'AoG'`, one award name without a book code: no `error` and no `warn`).
  Run `node test/validate.test.js`. Expected: new FAIL.
- [ ] **Step 2: Implement.** Move `validate.js:47-57` into `CONFIG_CHECKS` unchanged; add the new keys; one aggregated info for unknown keys. `clubDay` stays computed first (calendar check uses it).
- [ ] **Step 3: Run** `node test/validate.test.js && node test/options.test.js && node test/data-format-doc.test.js`. Expected: PASS.
- [ ] **Step 4: Spec 12** updated (config keys to "Checked"; "Not checked" keeps award names, progress keys, calendar order, with reasons). **Commit.**

### Task 3: Roster checks and the coverage rule
**Files:** modify `dev/app/validate.js`, `dev/app/test/validate.test.js`, `dev/app/test/season-sections.test.js`, `dev/app/test/data-format-doc.test.js`, `docs/DATA-FORMAT.md` (5.2, 12), `dev/tools/make-test-data.js`.
- [ ] **Step 1: Failing tests.**
  - `validate.test.js`: one test per row of the Roster table.
  - `season-sections.test.js`, `every tracked section has a file check`: `Season.SECTIONS.filter(k => !Validate.CHECKED_SECTIONS.includes(k))` is `[]`, and `Validate.CHECKED_SECTIONS.filter(k => !Season.SECTIONS.includes(k))` is `[]` (no stale check).
  - `season-sections.test.js`, `every config key the code uses has a file check`: the key set is `Object.keys(Catalog.defaultConfig())` plus every `config.<key>` in `dev/app/*.js` (the same scan as `data-format-doc.test.js:25`, minus `js`); `keys.filter(k => !Validate.CHECKED_CONFIG.includes(k))` is `[]`. Prove the rule bites: the test also runs the comparison against `Season.SECTIONS.concat(['futureSection'])` and asserts it names `futureSection`.
  - `data-format-doc.test.js`: `` doc.includes('`x_noteam:Q1') ``.
  Run the three. Expected: FAIL.
- [ ] **Step 2: Implement** the roster rules, fix the packed-length message, add the `x_noteam:Qn` row to spec 5.2, add `x_noteam:` to the pass-through regex in `anonV` (`make-test-data.js:220`; read the function first).
- [ ] **Step 3: Run** `node test/validate.test.js && node test/season-sections.test.js && node test/data-format-doc.test.js && node test/anonymizer-atomic.test.js`. Expected: PASS.
- [ ] **Step 4: Commit.**

### Task 4: The count-only checker, and Mike's check of his real file
**Files:** create `dev/tools/check-file.js`, `dev/app/test/check-file.test.js`; README tools list.
**Interfaces:** `node dev/tools/check-file.js <data.json>` prints one line per `(level, check)` pair, `<level> <check> <count>`, sorted, then `total: <e> errors, <w> warnings, <i> info`. Nothing else: no file name, no message text, no id. Exit 1 when any error, 2 on a usage error or unreadable file (message without the path), else 0. Read-only.
- [ ] **Step 1: Failing test** (`check-file.test.js`): write `testFile()` with `held[kid] = []` and `doneBooks[GHOST] = ['ZZ']` to a temp dir under `os.tmpdir()`; run the tool with `child_process.spawnSync`; assert exit 1; stdout has `error held 1` and `warn ghosts 1`; stdout contains neither `kid`, `GHOST`, any roster key of the TEST file, any `First Name` value of the TEST roster, nor the temp file's name. Second case: the unmodified TEST file gives exit 0 and only `info` lines. Third: no argument gives exit 2.
- [ ] **Step 2: Implement.** Run `node test/check-file.test.js`: PASS.
- [ ] **Step 3: Commit.**
- [ ] **Step 4 (Mike, by hand, before release 2a):** `node dev/tools/check-file.js <his current data file>`; he pastes the output (counts only). Any `error` line: we decide together whether the check loosens to `warn` or the file is repaired in the app. Then he runs `node dev/tools/make-test-data.js` as usual and confirms it ends without "file check" problems (Review Focus 2).

### Task 5: Docs and wrap-up for this item
- [ ] **Step 1:** `docs/DATA-FORMAT.md` 15 item 1 marked fixed (one line: "fixed in validate.js 1.9.0; R16"). `node test/data-format-doc.test.js`: PASS.
- [ ] **Step 2:** CHANGELOG "Next release": one line ("The Validate tab now checks every part of the data file and every setting; a section that would be emptied on open is an error"). README: `check-file.js` and the two new tests. BACKLOG R16: "done in dev" with the date.
- [ ] **Step 3:** Full sweep: `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh` from the repo root. Expected: no failures beyond the known baseline (compare with the baseline list before starting; do not "fix" a baseline failure here).
- [ ] **Step 4: Commit.** The release bump (`app-version`, `app-build`) and `make-deploy.sh` belong to wave 2 Task 7b, not here.

## Changes from the wave 2 plan (Tasks 1 to 3)
1. Level rule refined (D1): non-canonical but readable values are `warn`, not `error` (`held` `true`).
2. New: the non-object rule (D5); today it is silent data loss.
3. New: warnings that can occur on a real file are aggregated with ids inside parentheses (D2), so the anonymizer's carried-over matching keeps working.
4. New: `richValid()` fixture; the TEST file alone has none of the eleven sections.
5. Config coverage uses the source scan, not `defaultConfig()` (nine keys missing); and the rule is shown to bite with a fake section.
6. `driveDirs` accepts the legacy keys until R18; legacy is `info`, never an error.
7. `check` names fixed (`'ghosts'`, `'nights'`, `'replay'`, `'file'` added) so the count-only tool groups sensibly.
8. `FLAG_LEVELS` / `FLAG_NO_KID` exported (confirmed not exported today).

## Open questions for Mike
1. **`held` marks of `true`** (or other non-`1` truthy values): warn, or say nothing? The app reads them correctly. Proposed: warn.
2. **Award names not in the award lists:** keep unchecked (proposed), or an `info` count? A real file likely has many older names without the book code.
3. **A section that is not an object:** error (proposed) even though the app opens the file? It loses that section at the next save.
4. **Unknown owned fields in `v`:** one `info` line (proposed), or nothing?
5. **Release id:** 2a ships as 1.51.06 (still not deployed) or 1.51.07? (Wave 2 Task 7b expected 1.51.07.)
6. **Errors on your real file** (Task 4 step 4): repair in the app, or loosen the check? Decide per check once you see the counts.

## Risks
- **False alarms on a real file:** the checks come from the spec, which was written from the code, not from real files. Mitigation: Task 4 step 4 before release; levels for anything readable are `warn` at most.
- **Anonymizer gate breaks:** a new warning with an id before the parenthesis would stop `make-test-data.js` on a real file. Mitigation: D2 and its test.
- **Moving existing checks changes a message** and silently breaks `make-test-data.js`'s carried-over matching or an existing test. Mitigation: Task 2 step 1 pins the eleven config messages; existing section tests pin the rest.
- **Order dependence:** `clubDay` feeds the calendar off-day warning; the replay runs only when no `error` exists, so a new error (for example D5) now also suppresses the replay warning on that file. That is intended (replaying a broken file is meaningless) but changes what Mike sees; say so in CHANGELOG.
- **Coverage test too strict:** the source scan could pick up `config.<word>` from a comment. `data-format-doc.test.js` already lives with this (removes `js`); add any such word to a short, commented ignore list rather than a fake check.
- **R17/R18 overlap:** R18 will migrate `driveDirs` and `x_ClubberID`; then the two info lines become dead. R17 (unknown top-level keys) may add an info line for them; it should reuse the same `check` and aggregation pattern.
