# Gonkulator JSON format specification

Status: written 2026-11-12 from the code at release 1.51.05 + review fix R1 (`season.js` 1.59.1). It describes what the code reads and writes today, not what it might. Where the code and an older comment disagree, this document follows the code and says so in "Known gaps" at the end. `dev/app/test/data-format-doc.test.js` fails if a section, top-level key or config key the code knows is missing from this file.

**Privacy.** A data file holds children's names, emergency contacts, medical notes and attendance. Everything in this document uses invented values (`7000001_Test_Kid`). Never paste a real file into an issue, a chat or a commit. `dev/tools/make-test-data.js` makes an anonymized copy.

Contents
1. The JSON documents in this project
2. The data file: conventions
3. Top-level object
4. Identity and versions
5. Sections (one heading per section)
6. `config` in detail
7. Encoded values (catalog)
8. Repetition: how repeated data is stored, and what is never stored
9. Signals and markers (marks, no-date marks, holds, flags, pending changes)
10. History, undo, restore and merge
11. Lifecycle: opening, saving, year rollover, demo files
12. Validation: what is and is not checked
13. The other JSON documents
14. A complete annotated example
15. Known gaps found while writing this

---

## 1. The JSON documents in this project

| Document | Written by | Read by | Section |
|---|---|---|---|
| **Data file** (`awana-<year>-yyyymmdd-hhmmss.json`), format `awana-season` | the app (Save, Download, Drive), `make-test-data.js`, `make-database.js` | the app, `validate.js`, the tools and tests | 2 to 12 |
| **Try-it manifest** (`app/try/manifest.json`) | `make-deploy.sh` | the splash screen's Try it out | 13.2 |
| **Web app manifest** (`manifest.json`) | by hand | the browser (install as an app) | 13.3 |
| **Update handoff** (browser session storage, key held in `app-update.js`) | `app-update.js` before a reload | the same file after the reload | 13.4 |
| **Anonymization extras** (`--extra private-names.json`) | by hand, kept outside the project | `make-test-data.js` | 13.5 |

Everything else the app reads is CSV (the Planning Center export, an old master, a colors file) and is out of scope here. The Planning Center export is the only CSV the app needs; its values are copied into the data file's `roster` section.

## 2. The data file: conventions

### 2.1 Encoding and serialization
- UTF-8 text, one JSON object. A leading byte-order mark is ignored when reading.
- Written by `Season.toJson` as **one line with no indentation**, keys **sorted alphabetically at every level** (`sortKeys`), ending with a single newline. Arrays keep their order. Two saves of the same data are byte-identical, which History, merge and the tests rely on.
- Opened by `Season.fromJson`: any key named `__proto__` anywhere is dropped (the paths used by undo and merge would otherwise walk into `Object.prototype`).
- Size: about 155 KB for the 144-person invented test club with a short history. History grows with every edit.

### 2.2 Value types
| Kind | Representation | Notes |
|---|---|---|
| Calendar date | text `YYYY-MM-DD` | A local calendar day, no time zone. `Season.isRealDate` is the one rule: the day must exist (2026-02-30 is not a date). Used as a value and as a key (`attendance`, `games`, `awards`, `adults`). |
| Timestamp | text ISO 8601 UTC with milliseconds, e.g. `2026-10-07T20:00:00.000Z` | Only History entries (`t`). |
| Short date | 6 digits `yymmdd` | Only inside a handbook string (7.1). |
| Quarter | `Q1` `Q2` `Q3` `Q4` | |
| Team color | `Red` `Blue` `Green` `Yellow` | Case-sensitive. Order on screens is `config.teamOrder`; the data does not depend on it. |
| Group | `Puggles` `Cubbies` `Sparks` `T&T` | `Volunteers` and `Unassigned` are rooms, not groups. |
| Flag value | the text `'1'` | Roster fields only (`x_NoPhotos`, `x_Active`, `No Club`). Empty text or absent = off. In other sections a mark is the number `1`. |
| Person ID | text, see 2.3 | Used as the key in many sections. |
| Book code | 2 or 3 letters, a key of `config.books` (`HG`, `AoG`) | Also `common` in `progress` for blocks shared by all books. |

### 2.3 Person IDs
`<Registration ID>_<First name>_<Last name>`, for example `7000001_Test_Kid`. A second person that would get the same ID gets a `#2` suffix (`7000001_Test_Kid#2`). The ID is **frozen when the person is first added** (stored as `x_ClubberID`, which is the key of `roster.people`): a later spelling change in Planning Center does not change it, because every other section refers to it. A person added by hand may have an empty registration part. IDs contain names, so any file with IDs is personal data.

### 2.4 Empty and absent
- A record that becomes empty is **deleted**, not stored empty: setters delete an emptied per-child object, an emptied night, an emptied list. A file therefore rarely holds `{}` below the top level.
- Some top-level sections are **left out of the file while empty** (`toJson`): `givenNoDate`, `held`, `flags`, `doneBooks`, `received`, `progressNoDate`, `extraSheets`, `announcedNoDate`, `blueWings`, `blueOverrides`, `blueDrops`, `pastTurnout`, `absences`, and `config.teamPlan`. The others (`handbooks`, `attendance`, `awards`, `given`, `adults`, `teamMoves`, `games`, `progress`) are always written, as `{}` when empty.
- On opening, a missing section is empty. History, undo and merge treat "section absent" and "section `{}`" as the same thing (R1 fix).
- In the roster, a Planning Center field with no value is absent (or `null` in the packed list, 7.2); an owned field with empty text is absent.

### 2.5 Unknown content
- **Unknown top-level keys are kept** (R17). `fromJson` puts every top-level key that is not `Season.KNOWN_TOP` (`format`, `version`, `year`, `fake`, `history` and every tracked section) in `s.unknownKeys`, and `toJson` writes each one back at the top level, as it was. A known key always wins; `__proto__` is still dropped. They are **not tracked by History** (they are not sections), the Validate tab lists them as one info line, and a new season does not carry them. A file from a *newer* format version is refused rather than read (4.2).
- **Unknown keys inside `roster` and inside a person's entry are kept** too (R17): `Model.fromRoster` holds them in `master.rosterExtra` and `master.personExtra[id]`, and `toRoster` writes them back. These are inside `roster`, so they are tracked by History like the rest of `roster`.
- Unknown keys inside `config` are kept (config is merged over the defaults), so a setting a later version adds survives a round trip through this one.
- The anonymizer fails closed on an unknown key of any type at the top level, in `roster`, in a person's entry and in the export record (it reads the raw file for that check; `dev/tools/anon-pc.js` holds the list).

## 3. Top-level object

Every key a file can hold. "Tracked" means the key is in `Season.SECTIONS`: History records changes to it, undo and restore reverse them, Discard and compare see it, and the Drive merge carries it.

| Key | JSON type | Always written? | Tracked | One line |
|---|---|---|---|---|
| `format` | text, always `awana-season` | yes | no | Marks the file as ours. |
| `version` | integer, currently `6` | yes | no | The format version (4.2). |
| `year` | text `YYYY-YY` | yes | no | The club year, e.g. `2026-27`; may be `''`. |
| `fake` | `true` | only when true | no | An invented demo club (11.4). |
| `config` | object | yes | yes | Settings, lists and templates (section 6). |
| `roster` | object | yes | yes | People: Planning Center record plus owned fields (5.2). |
| `handbooks` | object id to text | yes | yes | Each child's handbook entry (5.3). |
| `attendance` | object date to id to marks | yes | yes | Who came, and what they earned that night (5.4). |
| `awards` | object date to id to list | yes | yes | Awards announced on a night (5.5). |
| `given` | object id to award to date | yes | yes | Awards handed to the child (5.6). |
| `givenNoDate` | object id to list | when not empty | yes | Given, but nobody knows the day (5.7). |
| `held` | object id to award to `1` | when not empty | yes | Awards held off the slides (5.8). |
| `flags` | object flagId to flag | when not empty | yes | Notes and flags (5.9). |
| `doneBooks` | object id to list | when not empty | yes | Books finished before this club (5.10). |
| `received` | object id to book to date | when not empty | yes | The day a child got a handbook (5.11). |
| `adults` | object date to list | yes | yes | Adult awards for the slide (5.12). |
| `teamMoves` | object id to list | yes | yes | Mid-quarter color changes (5.13). |
| `games` | object date to group to color to result | yes | yes | Game places and spirit points (5.14). |
| `progress` | object id to book to key to date | yes | yes | Each signed-off section (5.15). |
| `progressNoDate` | object id to book to list | when not empty | yes | Sign-offs whose day is unknown (5.16). |
| `extraSheets` | object id to list | when not empty | yes | Sheets added by hand (5.17). |
| `announcedNoDate` | object id to list | when not empty | yes | Told to the group, no day (5.18). |
| `blueWings` | object id to list | when not empty | yes | Blue Jewel placements from earlier years (5.19). |
| `blueOverrides` | object id to list | when not empty | yes | Blue Jewels given by hand (5.20). |
| `blueDrops` | object id to list | when not empty | yes | Blue Jewels dropped (5.21). |
| `pastTurnout` | object id to list | when not empty | yes | Attendance counts from earlier club years, for color team balance (5.25). |
| `absences` | object personId to object absId to absence | when not empty | yes | Volunteer absences, one per club night (5.26). |
| `calendar` | list of rows | yes | yes | The club calendar (5.22). |
| `rotation` | list of lists | yes | yes | The nightly rotation grid (5.23). |
| `history` | list of entries | yes | **no** (it is the log) | The change log (section 10). |
| any other key | anything | as it was | **no** | Kept as it is and written back (2.5). Listed on the Validate tab. |

`Season.SECTIONS` (25 entries, in this order): `config`, `handbooks`, `attendance`, `awards`, `given`, `givenNoDate`, `held`, `flags`, `doneBooks`, `received`, `adults`, `teamMoves`, `games`, `progress`, `progressNoDate`, `extraSheets`, `announcedNoDate`, `blueWings`, `blueOverrides`, `blueDrops`, `pastTurnout`, `absences`, `roster`, `calendar`, `rotation`. `datamerge.js` uses the same list. Metadata keys (`format`, `version`, `year`, `fake`) and `history` are not sections.

## 4. Identity and versions

### 4.1 `format`
Must equal `awana-season` or the file is "not a season file" (`fromJson` throws).

### 4.2 `version`
`Season.VERSION` is `6`. A file with a larger version is refused ("from a newer version of the app"). A file with a smaller (or missing) version is read and **upgraded in memory**; the next save writes the current format. What the versions mean, as far as the code shows:

| Version | What changed |
|---|---|
| up to 3 | Earlier layouts. Upgrades are applied by `fromJson` whatever the version says: standard books added (`AS`, `DoG`, `GiA`, `EoG`), T&T progress moved from one set under `common` to per-book (`upgradeTnt`), Cubbies sheet template added (`upgradeCubbies`), Start Zone as one block (`upgradeStartZone`), save/update settings defaulted (`upgradeSettings`), `tntBook` folded into `yearBook`, two-letter book keys renamed to the code as written (`renameBooks`, which also renames inside History). |
| 4 | A Sparks jewel is earned by sections 1 to 4; 5 to 8 are reviews (they count toward the book's Review Emblem). An old template with a single `rev` box per jewel is replaced; `SS Review Emblem - Yellow` becomes `... - Red`. |
| 5 | The roster's Planning Center record is written as a list of values (7.2) and the file is not indented. A file from before 5 holds objects and is read as is. |

| 6 | `roster.pcExport` (the kept Planning Center export, 5.2), kept unknown keys (2.5), `pc:` and `(no header N)` column names and values of only spaces. A version 5 reader would drop the new parts **without a trace** (it rebuilds `roster` from what it knows at every open), so it must refuse the file: a version 6 file opened by a version 5 copy gives "from a newer version of the app (version 6)", and a version 5 copy saving in place to Drive over a version 6 file fails before anything is written. A version 5 file opens as before and is written as 6 at the next save; until the next import it has no `pcExport` (Validate says so). |

**The rule:** `VERSION` moves when an older reader would lose data. An added top-level section that is left out of the file while it is empty (2.4) does not need it. The project rule (README, CHANGELOG) is that any change to the data-file format gets its own CHANGELOG mention and an upgrade path, and that older files always open.

**Downgrade (an emergency path, not a feature):** a version 6 file is a version 5 file plus `roster.pcExport`, kept unknown keys, `pc:` and `(no header N)` column names and whitespace-only values. To open it in an older copy, change `"version":6` to `"version":5` in a text editor; the older copy then drops `pcExport` and the unknown keys at its next save (everything else is intact, `pc:` columns show as ordinary columns).

### 4.3 `year`
`YYYY-YY` (`2026-27`). The validator warns on anything else. `Season.defaultYear(today)` gives the year a file made today belongs to: from August it is this year to next. A progress patch must name the same year as the open file (13.1).

## 5. Sections

Each heading is the key. "Edited by" names the setter in `season.js`; the screens call these.

### 5.1 `config`
See section 6. Tracked; History records config changes as one entry per area, with the path under `config`.

### 5.2 `roster`
```
roster = {
  cols:   [ "team:Q1", ... ],          // owned columns beyond the base set (6 below), in order
  pcCols: [ "Registration ID", ... ],  // Planning Center column names, the export's order
  pcKeys: [ ... ],                     // only when pcCols does not cover every field in use (sorted)
  pcAsOf: "2026-10-28",                // date of the export these values come from (yyyymmdd in its file name)
  pcSource: "20261028 -- club.csv",    // the export's file name
  pcExport: { ... },                   // the kept export (below); version 6 on
  people: { "<id>": { "pc": <values>, "v": { <owned fields> } } }
}
```
**`pcExport`: everything the last export said (R17, version 6).** Every column and value of the export is kept: columns the app has never heard of, columns Planning Center adds later, blank and odd rows, rows nobody was added for. Keys (`Model.CAPTURE_KEYS`; the data-format test checks each is documented here):
- `at`: when the export was imported (ISO UTC; its own date stays in `pcAsOf`, its name in `pcSource`).
- `hash`: "the same export again": FNV-1a 32-bit hex of the text (byte order mark removed), a dash, and its length. The anonymizer empties it.
- `header`: every header cell exactly as exported, in order (a leading space or a repeat is kept).
- `names`: the key each column's values are stored under in `people[id].pc`; longer than `header` when a row had cells past it.
- `rows`: data rows in the file, blank rows included. `blankRows`: how many of them had every cell empty.
- `ids`: `{ "<id>": 1 }` for the people whose `pc` holds a row of this export (an object, not a list, so History logs one change per person who joins or leaves).
- `loose`: rows that belong to nobody on the roster (a registration the leader chose not to add, or one with no name), cell for cell in `names` order, kept whole.

`Model.exportBack(roster)` rebuilds `{ header, rows }` from it: one row per id in `ids`, then `loose`, then `blankRows` empty rows. The rows equal the export's rows as a multiset, cell for cell (each padded to `names.length`). Not kept: byte-level text (quoting, line endings, BOM) and row order; the CSV files themselves are the byte-level copy. Only the **latest** export is kept whole; earlier ones are in History.

**Stored names** (`Model.readExport`, in this order): trim; a blank header cell, and every cell position past the header, is `(no header N)` (N = the column's position from 1); a repeat gets ` (2)`, ` (3)`; the app's own renames (`HEADER_ALIAS` and the roles); a name this app uses for its own data (`x_`, `ov:`, `team:`, `att:`, `prog:`, `award:`) is stored as `pc:<name>`, so an export column named like a club column can never overwrite the club's value. A column Planning Center drops keeps its last values in `pc` and is not in `names` (Validate counts it as "from an earlier export"). A value of only spaces is kept.

**Column kinds** (for privacy; the anonymizer's rule table, `dev/test-data/ANONYMIZATION.md`, names each column): identity (`Registration ID`, `First Name`, `Last Name`, `Birthdate`, `Age`, `Gender`, `Grade`), contact (phones, emails, `Home Address *`, `Registration Contact *`), program (`Selection`, `Assignment Area: Classes`, `Status`, `Submitted`, `Attendance Status`, `Times Attended`, uniform columns), money (`Registration Cost`, `Attendee Balance Due`, `Registration Amount Paid`, `Balance Due`, `Paid by *`, `Discount Type`, `Discount Amount`), and free text: `Medical Notes`; the allergy question; the pick-up question ("Please list the names of ALL adults..."); the "primary phone" question (people type names into it); `Emergency Contact`; `Registration Contact Address`; the shirt-size question; `Discount Name`; `Uniform`. **Any column not listed is treated as free text** (a future column can be sensitive).

**Other keys.** Keys of `roster` that the model does not own are kept in `master.rosterExtra` and written back; so are keys of a person's entry other than `pc` and `v` (`master.personExtra[id]`) (2.5).
- `people` is keyed by person ID (2.3). Every other section's ids must be keys here (the validator warns about "ghosts").
- `pc` is the person's **Planning Center record as of `pcAsOf`**: in the file a list of values in the order of `pcKeys` (when present) else `pcCols`; in memory always an object `{ column: value }`. Packing rule (7.2). Planning Center fields are **never edited here**; a newer export refreshes them.
- `v` holds the fields the club owns. Keys in `v` (empty text is not stored):

| Key | Meaning | Values |
|---|---|---|
| `x_Active` | on the roster | `'1'` active, `'0'` inactive |
| `x_InactiveBy` | who made them inactive | `'import'` when an export dropped them (they come back by themselves if a later export has them); absent when set by hand |
| `x_NoPhotos` | no-photo request | `'1'`, set when the medical or allergy text asks for it |
| `x_Notes` | free-text note about the person | text |
| `x_EmergencyPhone` | the phone the club chose for the emergency sheet (any number on the record, or one typed in); used only when Planning Center has neither a parent's primary phone nor an emergency-contact number; never sent to Planning Center | text, `''` when none is chosen |
| `x_FirstSeen`, `x_LastSeen` | first / last export the person was in | `YYYY-MM-DD`. `x_LastSeen` is rewritten by every export refresh, so History does not log it. |
| `x_Uni_SizeVerified`, `x_Uni_SizeOrdered`, `x_Uni_SizeGiven` | uniform sizes | text |
| `x_Uni_OrderedDate`, `x_Uni_ReceivedDate`, `x_Uni_GivenDate` | uniform dates | `YYYY-MM-DD` |
| `x_Uni_GivenFlag` | uniform given, day unknown | `'1'` |
| `x_Uni_Notes` | uniform note | text |
| `x_noteam:Q1` ... `x_noteam:Q4` | kept off the color teams for that quarter (written by `Model.setTeamChoice`) | `'1'` or absent |
| `team:Q1` ... `team:Q4` | color for each quarter | a team color, or absent |
| `team:<year>:Qn` | a past year's colors (kept, no longer counted) | team color. A new year renames `team:Q1..Q4` to `team:<year>:Q1..Q4`. |
| `ov:<Planning Center column>` | a **pending change** to a Planning Center field | the value the club wants; shown in reports until a later export matches it, then it clears itself (9.5) |
| `att:*`, `prog:*`, `award:*` | reserved owned-column prefixes | not written by the current app |
| `x_ClubberID` | the ID | **not stored** in `v` (it is the key). An older file's copy is removed on open when it equals the key (logged by the `File upgrade` entry, 10.4); a copy that differs from the key is clubber data and is kept (the file check reports it). |

  `Model.isUserCol` defines "owned" as a column starting with `x_`, `ov:`, `team:`, `att:`, `prog:` or `award:`; everything else is Planning Center's. Money columns (`Balance Due`, `Attendee Balance Due`, `Registration Amount Paid`) are kept but never shown or reported.
- `cols` lists owned columns beyond the base set (`x_Active`, `x_NoPhotos`, `x_Notes`, `x_FirstSeen`, `x_LastSeen`, the `x_Uni_*` columns), e.g. `["team:Q1","team:Q2","team:Q3","team:Q4"]`.
- Planning Center renames: the app maps a changed column name to its role when exactly one column fits (`Model.PC_ROLES`), so `pcCols` can hold the spelling the export used.
- Edited by: `Model.planImport` / `applyPlan` (export refresh), `Model.setField`, `setActive`, the Roster and Person tabs. Merge rule: pc fields are never merged (the import owns them); owned fields merge like everything else.

### 5.3 `handbooks`
`handbooks[id] = "<book code> <yymmdd> <note>"`: one text per child (7.1). An entry with no code and no date is deleted. Edited by `setHandbook`, `tidyHandbookCodes`; the validator requires the value to be text.

### 5.4 `attendance`
```
attendance[date][id] = { a: 1, h: 1, p: 1, x: 1, g: "Sparks", t: "Green" }
```
- `a` present, `h` brought handbook, `p` participation, `x` extra. Absent key = not marked (never `0`).
- `g` the child's group, stamped when `a` is set and the room is a real group; removed with `a`.
- `t` an optional **one-night team exception** (a visitor, a fill-in). Requires `a: 1` and goes away with it.
- A child with no marks left is deleted; a night with nobody left is deleted ("a night with nobody is not a night"). The quarter of a night comes from the calendar, not from this record.
- Edited by `setMark`, `setNightTeam`. Validator checks `g` and `t` values and every id.

### 5.5 `awards`
`awards[date][id] = [ "AoG Blue Emblem 1", ... ]`: awards **announced** to the group that night (what the slides show). Names are the recorded award names (7.4). A list is kept sorted, without duplicates. Edited by `addAward`, `removeAward`, `announce`, `setAnnounced`. A real announce date removes an `announcedNoDate` mark for the same award.

### 5.6 `given`
`given[id][award] = "YYYY-MM-DD"`: the day the child received the award. Independent of `awards` (an award can be given before it is announced). If the award is also in `givenNoDate[id]`, the date here is only **the day the box was ticked**, not the day the child received it: always read a given date through `Season.givenShown`. Edited by `setGiven`, `clearGiven`.

### 5.7 `givenNoDate`
`givenNoDate[id] = [ award, ... ]` (sorted): awards handed over with no known date. Pairs with `given[id][award]` (7.5).

### 5.8 `held`
`held[id] = { "<award>": 1 }`: an earned award kept off the slides and out of Mark all announced until released. An object, not a list, so two leaders' holds on one child merge instead of clashing. Edited by `setHold`.

### 5.9 `flags`
`flags[flagId] = { kid, level, book, block, key, note, at, ... }`: a note pinned to a place. `flagId` is `f` + base-36 time + two base-36 random characters. Levels and their fields are in section 9.4. Clearing a flag deletes it (History keeps it). **Hiding (1.51.16):** any note or flag except a bug report may carry `hidden: 1` (the number 1; `true` also reads as hidden), set by Hide on To do, on the child's sheet or in the yellow-flag popup and deleted by Unhide (a key is never stored empty, section 2.4). Only the To do card leaves a hidden note out of its list and its number; the child's sheet, the yellow flag, the popups and History still show it. A new season does not carry notes, so it does not carry hidden ones. An older copy keeps the field but lists the note as it always did. Notes are free text about children: **the anonymizer drops `flags` entirely**. Edited by `addFlag`, `setFlagNote`, `clearFlag`.

**Bug reports and feature requests** are flags too: level `bug`, a flagId that starts with `b` (`b` + base-36 time + two characters), no child needed. They are listed on the Debug tab and never on To do or a child's sheet (`Season.noteList` leaves them out, `Season.bugList` lists them). Extra fields are in section 9.4. The data file format version does not change: no new top-level section, and an older copy of the app opens, keeps and saves them.

### 5.10 `doneBooks`
`doneBooks[id] = [ "AoG", ... ]`: books finished somewhere else (no section records). They count toward the child's finished books and their awards are presumed received. Edited by `setBookDone`.

### 5.11 `received`
`received[id][book] = "YYYY-MM-DD" | "no date" | ""`: the day the child received the handbook. `"no date"` means received, day unknown (tested with `Season.isReceivedNoDate`). `""` clears the date that the handbook string would otherwise supply for its own book. Edited by `setReceived`.

### 5.12 `adults`
`adults[date] = [ { n: "<name>", a: "<award>" }, ... ]`: the Adult Memorization slide only. Adults are not in the roster. Validator requires `n` and `a` to be text.

### 5.13 `teamMoves`
`teamMoves[id] = [ { q: "Q2", from: "YYYY-MM-DD", team: "Blue" }, ... ]` sorted by `from`. The roster's `team:Qn` is the quarter default; the **team on a night** is that night's exception (`attendance[..].t`), else the latest move in the quarter on or before the date, else the default (`Season.teamOn`; derived, never stored). Edited by `setTeamMove`, `removeTeamMove`.

### 5.14 `games`
`games[date][group][color] = { place: 1..4, spirit: 0..3 }` (either field may be absent). Groups are `Sparks` and `T&T` only. Points come from `config.placePoints` and are derived. Edited by `setGame`.

### 5.15 `progress`
`progress[id][book][key] = "YYYY-MM-DD"`: the day a section was signed off. `book` is a book code or `common`. `key` is `<block>.<item>` (7.3). A missing key = not signed. Clearing deletes the key. Edited by `setProgress`. If the section is also in `progressNoDate`, the date is the day it was marked, not a real sign-off day (5.16).

### 5.16 `progressNoDate`
`progressNoDate[id][book] = [ "<block>.<item>", ... ]` (sorted): sign-offs made "no date" (an award given before its section was finished). The date in `progress` for the same key is the day it was marked and must **not** be shown or printed. A real date typed later, or a cleared box, removes the mark. Edited by `markSignsNoDate`, `setSignNoDate` (internal). Unlike most sections, this one has a nested `book` level.

### 5.17 `extraSheets`
`extraSheets[id] = [ "WR", ... ]` (sorted): a book the child has no dates in yet but should show a sheet for ("+ Add sheet"). Edited by `addExtraSheet`.

### 5.18 `announcedNoDate`
`announcedNoDate[id] = [ award, ... ]` (sorted): the award counts as told to the group, with no night. Never shown as an announce date. A real announce night replaces the mark. Edited by `setAnnNoDate`.

### 5.19 `blueWings`
`blueWings[id] = [ { book, slot, n, threshold, earned, date, year, override, note? }, ... ]`: Sparks Blue Jewel placements carried from **earlier years**, written when a new season is started (`newSeason`); they fill a book's four wing slots first. `slot` 1 to 4, `n` the gem number, `threshold` the night count, `earned` and `date` dates, `year` the club year, `override` true when it was hand-granted. Not edited on screen.

### 5.20 `blueOverrides`
`blueOverrides[id] = [ { book, n, date, note }, ... ]`: a Blue Jewel granted by hand (Sparks books only). `n` is the slot 1 to 4, `date` the day earned, `note` free text (empty text is allowed). Takes that slot and is never dropped at year end. Edited by `grantBlue`, `dropBlue`. **Free-text note about a child: the anonymizer keeps the grant and empties the note.**

### 5.21 `blueDrops`
`blueDrops[id] = [ "<gem>|<date>", ... ]` (sorted): earned Blue Jewel gems the leader dropped, as `gem number|day earned`. A dropped gem takes no slot and is not held. Edited by `dropBlue`.

### 5.22 `calendar`
A list of rows, sorted by `Date` by the app (not enforced):
```
{ "Date": "2026-09-09", "Type": "Club night", "Quarter": "Q1", "Theme": "...", "Notes": "", "No Club": "",
  "Puggles Lesson": "1.1 God Made the Light", "Cubbies Lesson": "", "Sparks Lesson": "", "T&T Lesson": "" }
```
All ten keys are text (`Calendar.COLS`). The four lesson columns, one per group named after it (`Puggles Lesson`, `Cubbies Lesson`, `Sparks Lesson`, `T&T Lesson`), hold the lesson typed for that group on that night (`1.1 God Made the Light`); a group with no lesson by week leaves its column empty. Files from 1.51.15 and earlier have `Puggles #` and `Puggles Title` instead of `Puggles Lesson`: opening the file joins them (a space between, an empty part dropped) into `Puggles Lesson` and removes the two keys (not logged in History: a rename of two columns would write the whole calendar twice); if `Puggles Lesson` already has text it wins and the old pair is added to `Notes`. A row with neither old key is left exactly as it is. Whether lessons by week are used, and for which groups, is `config.lessons`. `Type` is `Club night` or `Event`. `Quarter` is `Q1` to `Q4`. `No Club` is `'1'` for a cancelled night. A **club night** is a row whose Type is not Event and whose No Club is not `'1'`. Attendance on a date that is not a club night is kept but dropped from every total (the validator warns). One row per date is expected (duplicates warn). Edited on the Calendar tab.

### 5.23 `rotation`
A grid: a list of rows, each a list of text cells. Row 0 is `["Time", "<group>", ...]`; column 0 of each later row is a time slot. **A blank cell means "same as the cell above"** (a group that stays in one place all night). Cells may contain newlines. When read from a CSV, all rows are padded to the same width; the validator only requires a list of lists.

### 5.24 `history`
Section 10.

### 5.25 `pastTurnout`
`pastTurnout[id] = [ { year: "2025-26", nights: 28, came: 21 }, ... ]`, oldest year first, one entry per year, left out of the file while empty. A child's attendance in each earlier club year, counted the way the color team planner counts this one: `nights` = club nights held from the child's first attended night to the end of that year, `came` = nights they were present (`0 <= came <= nights`, `nights > 0`; a child who never came has no entry). It is the only attendance that crosses a year, because a new season starts with empty `attendance`. Written by `newSeason` (once for the closed year; earlier years stay) and by Options › Add an earlier year (`Season.addEarlierYear`, which reads an older data file, adds its year for the children on this file's roster, and never changes or repeats a year already there). `teamplan.js` blends this history into each child's expected turnout (see the HOW HISTORY BLENDS IN comment there and the team grid's (i) note). Same format version 6: a version 6 app without this feature keeps the section as an unknown top-level key and writes it back.

### 5.26 `absences`
`absences[personId][absId] = { reason, at, nights: { "YYYY-MM-DD": 1 } }`, left out of the file while empty. A volunteer's planned absence, stored with the person and kept per club night: each key of `nights` is one club night the volunteer is out. Only club nights from the club calendar are stored (`Calendar.nights`); any other date is refused. `absId` is `a` + base-36 time + two base-36 random characters, with no date in it. The letter `a` marks an absence id, as `f` marks a flag id. Clearing one night deletes its key; clearing the last night deletes the absence; clearing a person's last absence deletes their key. `at` is the day the absence was entered. The reason is free text about a real person: it is dropped from the anonymized copy, like flags (`make-test-data.js`). Entering an absence is the acknowledgement; there is no tick. Absences do not carry into a new season. Same format version 6: an older app keeps the section as an unknown key and writes it back.

## 6. `config` in detail

`config` is the defaults (`Catalog.defaultConfig()`) with the file's values merged over them at the top level, so a missing key takes its default. Shallow merge: a key present in the file replaces the default for that key as a whole (except `yearBook`, which is merged one level deeper). Types below are for the written file.

| Key | Type / values | Default | Meaning |
|---|---|---|---|
| `clubDay` | integer 0 to 6 | `3` | Day of week of club nights (0 Sunday); other days are flagged. |
| `bugButton` | boolean | absent (off) | Shows the Bug button beside Flag (Options). `true` shows it; the key is removed when it is turned off. Hiding the button never deletes bug reports. Shared by everyone who opens the file. |
| `lessons` | `{ on: boolean, groups: { Puggles: { on }, Cubbies: { on }, Sparks: { on }, 'T&T': { on } } }` | absent (reads as: on when any calendar row has a lesson, else off; every group on) | Lessons by week (Calendar tab, Lessons by week). `on` turns the report and the grid on; each group's `on` can be switched off (Sparks work through their books in turn, so they usually have no lesson by week). Only groups that are on appear in the grid and in the Lessons by week report. Written the first time a setting is changed; an older copy keeps it (unknown config keys are kept) but shows the Puggles column empty. |
| `showHiddenNotes` | boolean | absent (off) | To do, Notes and flags card: `true` lists the hidden notes and flags (greyed, with Unhide). The key is removed when the box is unticked; it is only offered while something is hidden. Shared by everyone who opens the file, like `bugButton`. |
| `startTab` | `'roster'` \| `'tonight'` \| `'todo'` | absent (Roster) | Which tab opens after a data file is opened (Options, Start on). `tonight` opens Attendance on the club night, or the day after it, and To do on any other day. Applied once when a file opens, never after Update now. The key is removed when set back to Roster. Older copies keep it (unknown config keys are kept). |
| `carriedThrough` | date `YYYY-MM-DD` | absent | Written once by `newSeason`: the closed year's last night. Anything dated on or before it that was carried forward (11.3) is an earlier year's, whatever the calendar says; `Season.seasonStart` uses it until the calendar is replaced. |
| `blueJewelWeeks` | list of 1 to 4 rising whole numbers below 1000 | `[6, 12, 19, 27]` | Nights of attendance that earn Blue Jewels 1 to 4. A bad list falls back to the default on load. |
| `placePoints` | object `{ "1": 3, "2": 2, "3": 1, "4": 0 }` | as shown | Game points by place; whole numbers 0 or more. |
| `teamOrder` | the four colors once each | `Red, Yellow, Green, Blue` | Display order only. Anything else falls back to the default. |
| `saveStyleDrive` | `inplace` or `dated` | `inplace` | One Drive file kept up to date, or a new dated file per save. |
| `saveStyleLocal` | `single` or `dated` | `single` | One local file saved over, or a new file each time. |
| `autoUpdate` | `{ on: boolean, minutes: number > 0 }` | `{ on: true, minutes: 10 }` | The update-check timer. |
| `autoSave` | `{ on: boolean, minutes: number > 0 }` | `{ on: false, minutes: 5 }` | The auto-save timer. |
| `drivePinDays` | integer 0 or more | `30` | Keep a Drive version forever every this many days (0 never). |
| `driveKeepName` | text | absent | Overrides the Drive file name used for in-place saves. |
| `driveDirs` | object `{ club, slides }` of `{ id, name, parent }` or `null` | `{ club, slides }` both `null` | Google Drive folders shared by everyone using the file. Current code writes `club` and `slides` only. Opening an older file folds its `open` / `data` folders into `club` (`club`, else `data`, else `open`; `Season.normDriveDirs`), logged by the `File upgrade` entry. |
| `sparksBooks` | `sequence` or `together` | `sequence` | Sparks work through HG, WR, SS in turn, or all use one book. |
| `yearBook` | `{ Cubbies, Sparks, "T&T": book code or "" }` | all `""` | The one book a group uses together (Sparks only with `together`). Must name a book of that group. |
| `store` | object (below) | below | Awana store points. |
| `todoIgnored` | list of text `"<group>\|<id>\|<text>"` | `[]` | To do items accepted as they are (7.6). A new season clears it. |
| `teamsOk` | `{ repeats: [id...], uneven: [quarter...] }` | both empty | Color-team warnings accepted for good: children allowed a repeated color, quarters allowed uneven teams. A new season clears it. |
| `teamPlan` | object (below) | absent while empty | The color-team year plan. |
| `awardLists` | `{ <group>: [award name...] }` | built in | The awards the club knows, per group. |
| `exclude` | `{ <group>: [award name...] }` | `{ Sparks: ["Flight 3:16"] }` | Awards left off the slides (everybody gets them) and out of announce lists. It is also left off the hand-out list, its badge and the Awards to hand out strips. |
| `completion` | `{ <group>: [award name...] }` | built in | The awards for finishing books, in the order of how many books are finished. |
| `endOfYear` | `{ <group>: [award name...] }` | built in | Awards announced when earned but presented at the ceremony. |
| `books` | `{ <code>: { name, emblem, group } }` | the nine standard books | The books. `emblem` is a color or `""`; `group` is `Cubbies`, `Sparks` or `T&T`. Codes are 2 or 3 letters. |
| `bookOrder` | `{ <group>: [code...] }` | absent | Overrides the standard order of a group's books (T&T only for now). |
| `progress` | `{ Cubbies, Sparks, "T&T": template }` | built in | The progress templates (below). |
| `cubbiesDetail` | `unit` or `section` | absent (= `unit`) | Older switch for the Cubbies sheet; the template in `progress.Cubbies` is what counts now. |
| `clubTitle` | text | absent | A title typed by hand; absent = follow the year. |
| `slideNames` | `{ "<recorded name>": "<slide wording>" }` | absent | Overrides the wording of an award on the slides. |
| `bundles` | list of `{ name, items: [ { report, ... } ] }` | absent (= three standard bundles) | Report bundles (Options). Reports named that no longer exist are skipped. (a bundle that names the retired `weeklySlips` skips it). |
| `medRead` | `{ <id>: "<medical text as read>" }` | absent | A medical note marked read; it comes back only if the text changes. |
| `medPrinted` | `{ <id>: "<medical text as printed>" }` | absent | The text last printed on the class medical sheet. |
| `tntBook` | text | gone | Read from a 1.32 file and folded into `yearBook["T&T"]`, then deleted. Never written. |

`store`: `{ min: 15, max: 200, method: "direct" | "top" | "range", programs: ["Sparks", "T&T"], weights: { attendance, handbook, participation, extra, place, spirit, awards, sections } }`, weights are numbers (all `1` except `sections: 0`).

`teamPlan` (left out while empty; `teamplan.js`): `{ locked: { "Q2": "YYYY-MM-DD" }, proj: { "<id>": "RB--" }, prio: { order, off }, blendNights: 20 }`. `blendNights` (a whole number 4 to 60, present only when not the default 20) is how many counted nights this season it takes before a child's own attendance fully replaces their earlier-year history in the expected turnout (5.25). `locked` quarters locked by hand, with the day. `proj[id]` is four characters, one per quarter Q1 to Q4: `R` `B` `G` `Y` for Red, Blue, Green, Yellow, or `-` for none or locked. `prio` is only present when it differs from the defaults. The colors themselves stay in `team:Qn` on each person.

**Progress template** (`config.progress[group]`):
```
{ common:  [ block, ... ],            // blocks shared by all of a child's books (Flight 3:16, Start Zone, Apple Acres)
  perBook: [ block, ... ],            // blocks repeated for each book
  bookReview: { label, awards }       // Sparks only: earned when every section and review of the jewel blocks is dated }
block = { key: "RJ1", label: "Red Jewel 1", items: ["1","2","3","4"], review: ["5","6","7","8"]?,
          awards: ["{book} Pilot Wing", "{book} Red Jewel 1"], single: true? }
```
`key` is the block's code (the part before the first dot in a progress key). `items` are the section codes (`1`, `2.3`, `A`). `review` are extra sections that do not earn the block's award. In `awards`, `{book}` is replaced by the child's book code and `{emblem}` by the book's emblem color. `single: true` (Cubbies) means one box for the whole block. Block keys in the standard templates: Sparks `FLT` (common) and `R`, `RJ1..4`, `GJ1..4` (per book); T&T `SZ` (common) and `BE1 RE1 GE1 YE1 BE2 RE2 GE2 YE2`, `SV1..4`, `GD1..4` (per book); Cubbies `AA` (common) and `TR`, `U1..U6` (per book).

## 7. Encoded values (catalog)

### 7.1 Handbook string (`handbooks[id]`)
`"<code> <yymmdd> <note>"`, every part optional, single spaces. Grammar (`parseHandbook`): an optional code of 2 to 5 letters followed by a space, a digit or the end; then an optional six-digit date; then the rest is the note. The date is the day received, `20` + `yymmdd`. Examples: `AoG 260916`, `HG`, `260923 reissued`, `WR HG '25-26` (a note of `HG '25-26`). A note that itself starts with six digits and has no date in front of it is stored as `- 260916 ...` so it is not read back as a date. A six-digit date that is not a real day stays in the note. The app edits the three parts separately (`handbookParts`, `formatHandbook`); an entry with no code and no date is deleted. The code is a key of `config.books` written as the book spells it; `AO` and `AOG` both find `AoG` when only one book starts that way (`Catalog.bookKeyOf`). The handbook's date supplies the date received for its own book when `received` has none.

### 7.2 Packed Planning Center record (`roster.people[id].pc`)
The long Planning Center field names are written **once** and each person gets one list of values.
- Names: `roster.pcCols` (the export's column order) when it covers every field in use, else `roster.pcKeys` (the sorted names of all fields in use) is added and takes precedence.
- Values: `pc[i]` belongs to name `i`; `null` means the person has no such field.
- A person whose record holds anything but text stays an **object** (nothing is changed by packing); a reader must accept either form per person.
- The names of the packed values are `pcCols`/`pcKeys`; the names of the **last export's** columns, as stored, are `pcExport.names` (5.2), which can be a subset (a column the export lost keeps its old values in `pc`).
- Reading: `unpackRoster`; writing: `packRoster`. In memory `pc` is always an object. The 144-person test file writes 53 names and 144 lists of 53 values (23 of the first person's are `null`).

### 7.3 Progress key `<block>.<item>`
The block key, a dot, then the item code, which may itself contain a dot. Examples: `RJ1.2` (Sparks Red Jewel 1, section 2), `SZ.1` (Start Zone, shared), `BE1.1.1` (T&T Blue Emblem 1, section 1.1), `U3.5` (Cubbies unit 3), `FLT.6`. Valid keys are the template's `items` and `review` for that block (`patchKeyOk`). The same key text is used in `progress` (as the key) and in `progressNoDate` (in the list).

### 7.4 Award names
Recorded award names are plain text and are the identity of an award everywhere (`awards`, `given`, `held`, `givenNoDate`, `announcedNoDate`, `config.*` lists). They are built from the templates: `{book} Red Jewel 3` becomes `HG Red Jewel 3`; T&T names carry the book code (`AoG Blue Emblem 1`) so a second book earns them again. Older files may hold names without the book code; matching code (`baseAward`, `jewelName`, `dropBlue`) accepts both. `Season.renameAward` renames one name across all sections. Slide wording is separate (`config.slideNames`, `PLAIN` in `slides.js`).

### 7.5 "Given, no date" and the other no-date pairs
Two places hold the same fact because the day is unknown but the record needs a day:

| Fact | Section with the day | Section with the mark |
|---|---|---|
| Award given | `given[id][award]` = the day the box was ticked | `givenNoDate[id]` contains `award` |
| Sign-off made | `progress[id][book][key]` = the day it was marked | `progressNoDate[id][book]` contains `key` |
| Told to the group | (no day) | `announcedNoDate[id]` contains `award` |
| Book received | `received[id][book]` = `"no date"` | (the value is the mark) |
| Uniform given | `x_Uni_GivenDate` | `x_Uni_GivenFlag` = `'1'` |

Anything that shows or prints a date must go through the "shown" function (`givenShown`, `receivedShown`; sign-offs check `isSignNoDate`), which returns empty for a marked pair. A real date entered later removes the mark.

### 7.6 Compound text keys
| Where | Form | Parts |
|---|---|---|
| `config.todoIgnored[]` | `<group>\|<person id>\|<item text>` | The To do group, the person, the exact message. The item stays hidden until its text changes. |
| `blueDrops[id][]` | `<gem number>\|<YYYY-MM-DD>` | Which earned gem, and the day it was earned. |
| `teamPlan.proj[id]` | four characters `R B G Y -` | One per quarter Q1 to Q4. |

### 7.7 Booleans and counts
Roster flags are the text `'1'` (7.2 table). Marks in `attendance` and `held` are the number `1`. Real booleans appear only in `config.bugButton`, `config.autoUpdate.on`, `config.autoSave.on`, a blue wing's `override`, a block's `single`, and `fake`.

### 7.8 Paths (History)
A change's path `p` is the list of keys from the top of the file to the value that changed: `["progress", "7000001_Test_Kid", "AoG", "BE1.1.1"]`. Section 10.

## 8. Repetition: how repeated data is stored, and what is never stored

**Stored once, referenced many times**
- The Planning Center field names: once in `roster.pcCols` / `pcKeys` (7.2).
- Each child's identity: the ID is the join key repeated as a key in every section that has a record about them. IDs are not repeated as values, except `flags[].kid`, `config.todoIgnored`, `config.medRead`, `config.medPrinted`, `config.teamsOk.repeats`, `config.teamPlan.proj` and History paths and values.
- Templates: award and progress structure lives once in `config.progress` and is expanded per book by `{book}` and `{emblem}`; it is not written per child.
- Rotation: a blank cell repeats the cell above it (5.23).
- Calendar: one row per night; nothing is generated, so a repeating lesson is repeated text.

**Repeated on purpose**
- Award names are repeated as text wherever the award appears (announced, given, held, in lists). A rename must touch every section (`renameAward`).
- Team colors: four columns `team:Q1..Q4` per person, plus archived `team:<year>:Qn`.
- History stores **old and new values** for every change, so the file holds each edited value at least twice. This is why History makes up most of a long season's file.
- `given`/`givenNoDate`, `progress`/`progressNoDate` pair up as in 7.5.

**Never stored (derived each time, so it cannot go stale)**
- An award being **earned** (from `progress`, attendance and the templates; `awardLedger`, `suggestedAwards`).
- A child's team on a given night, the points of a game, store points, finished books, current Sparks book, the quarter of a night (from the calendar), Blue Jewel placement for the current year (from attendance; only earlier years' placements are stored, in `blueWings`), the ledger "Earned, not given", every count and badge.
- The person's age, room fit and group (from the Planning Center record).
- Anything about **who saw what** (read receipts are limited to `config.medRead` and `medPrinted`).

## 9. Signals and markers

### 9.1 Attendance marks
`a` present, `h` handbook, `p` participation, `x` extra, `g` group stamp, `t` one-night team (5.4). `Season.MARKS = ['a','h','p','x']`.

### 9.2 The award life cycle (what each stage writes)
1. **Earned**: derived; nothing is written (hold it off the slides with `held`).
2. **Announced**: `awards[date][id]` has the name; or `announcedNoDate[id]` has it (no night).
3. **Given**: `given[id][award]` has a day; if the day is unknown also `givenNoDate[id]`.
Announced and Given are independent: clearing one never touches the other. Awards in `config.exclude[group]` are never listed for announcing; awards in `config.endOfYear[group]` are announced when earned but handed out at the ceremony.

### 9.3 No-date marks
Section 7.5.

### 9.4 Flags (`flags[flagId]`)
Common fields (all text): `kid` (person ID, or `''` for notes not about a child), `level`, `book`, `block`, `key`, `note` (required), `at` (the day it was written). Optional text fields are written only when non-empty: `date`, `room`, `quarter`, `group`, `color`, `field`.

| `level` | About | Needs | Child |
|---|---|---|---|
| `general` | nothing in particular (a To do note) | note | no |
| `child` | the whole record | kid | yes |
| `sheet` | one book's sheet | kid, `book` | yes |
| `block` | one section block | kid, `book`, `block` | yes |
| `box` | one date box | kid, `book`, `block`, `key` (e.g. `GJ1.2`) | yes |
| `attend` | one night in one class | `date`, `room` | no |
| `team` | a quarter's color teams | `quarter`, `group`, optional `color` | no |
| `field` | one detail on a child's Person tab | kid, `field` | yes |
| `element` | any element on any tab (Flag anything) | `tab`, `trail` | no |
| `bug` | a bug report or feature request about the app (the Bug button); Debug tab, not To do | `note` | optional |

`bug` flags add: `status` (`open`, `fixed` or `dropped`; always written; a missing or unknown word reads as `open`. Files from 1.51.15 and earlier may hold `answered`: opening the file rewrites it to `open`, logged as a File upgrade), `ver` (the `app-version` when it was written, optional), `replies` (the conversation: an object keyed by reply id, `r` + base-36 time + 2 random base-36 characters, each `{ at: 'YYYY-MM-DD', by: 'leader' | 'developer', text }`; an object, not a list, so replies added on two copies both survive a merge; the key is left out when there are none; an older copy of the app keeps it but does not show it), `reply` and `replyAt` (a date; the single reply of 1.51.15 and earlier, written together, removed together, still read as the first reply by the developer), and, when it was made on a spot, `tab`, `trail`, `label`, `rowIndex` as for `element`. `book`, `block` and `key` stay empty text so an older copy of the app can read the record. Open reports come forward into a new season; fixed and dropped ones stay with the closed year.

`element` flags add: `tab` (tab id), `trail` (list of labels from the tab name down to the element, text), `label` (the element's own label), `rowIndex` (integer, which of several same-named rows; `0` when unused). A flag is found again by matching `trail` from the top; if nothing matches it is still listed as "spot not found". A flag on something later removed stays listed until cleared. The sheet shows a yellow flag only where a flag exists. **The view it was made in (1.51.16):** an element flag (and a bug report) also carries, when known, `kid` (the child the page was about), `sub` (the Person tab part: `progress`, `attendance`, `awards` or `registration`, the part that was SHOWN), `book` (the book tab), `date` (the night) and `room` (the class), the same optional text fields the other levels use (`sub` is the one new name). The flag is looked for only in that view: every part the flag has must equal the part of the view being looked at, and a part it lacks is not compared, so a flag made before 1.51.16 (it has none of them) matches wherever its trail does, as it always did. A flag with a `kid` is only ever that child's element, even in a table that shows many children. Go opens the child, the part of the Person tab, the book and the night first. An element flag with a `kid` also appears in that child's sheet note list. An older copy of the app keeps these fields but ignores them, so it still shows the flag on every child.

### 9.5 Pending Planning Center changes (`ov:<column>`)
Planning Center fields are read-only here. To say "this value should be X", the club stores `v["ov:<column>"] = X`. Reports show X (`Model.eff`); when a later export has X in that column the override is deleted. `Model.setField` removes an override that equals the Planning Center value.

### 9.6 Roster activity signals
`x_Active` and `x_InactiveBy` (5.2), `x_NoPhotos` (set from the medical and allergy text when the person is first added, then owned by the club), `x_FirstSeen` / `x_LastSeen`.

### 9.7 Test and demo signals
`fake: true` (11.4). The file name carries `-TEST-` for test data; the app and `make-deploy.sh` treat names containing `TEST` as invented data.

## 10. History, undo, restore and merge

### 10.1 Entry
```
history[i] = { t: "2026-10-07T20:00:00.000Z", label: "Attendance 10/7", tag?: "Before cleanup",
               changes: [ { p: [path...], o: <old>, n: <new> }, ... ] }
```
- Oldest first. `o` missing = the value did not exist before; `n` missing = it was removed. `o` and `n` are deep copies of the value at `p`; where a whole night or child appears or disappears the value is the whole object, because a diff stops at the first place one side has nothing.
- `tag` names a version; a tagged entry is never merged into.
- `label` is generated from the sections touched (`Season.labelOf`): an area name (Attendance, Awards, Awards given, Progress, Handbook, Team moves, Games, Adult awards, Notes and flags, Bug reports (a flag id starting with `b`), Volunteer absences, Roster, Calendar, Rotation, "Award lists & settings") plus a date for per-night areas. A prefix is added for Undo, Redo, a tab name, or `Merged (<from>)`.
- Edits to the same area within **5 minutes** (`MERGE_MINUTES`) share one entry; an Undo, Redo, applied draft or merge is always its own entry.
- `x_LastSeen` is never logged (an export refresh rewrites it).

### 10.2 What it makes possible
Any version can be rebuilt by undoing entries from the newest back (`Season.at`); two versions can be compared (`compare`); a version can be restored (`restoreTo`, which deletes every later entry and says how many); a three-way merge replays this copy's changes onto another copy (`merge3`).

`roster.pcExport` is diffed with the rest of `roster` and needs no new code: the first capture is one change holding the whole record; after that a weekly import logs `at`, `hash`, `rows`/`blankRows` when they moved, **one change per person who joined or left `ids`** (never the whole list: `ids` is an object for this reason), `loose` whole when it changed, and `header`/`names` whole when Planning Center changed its form. `Season.describe` words them ("Planning Center export kept: 158 rows (1 belongs to nobody, 1 blank)"; "<name> is in this Planning Center export"). One import of a different export is one History entry, one undo step.

### 10.3 Section list and what each is blind to
Only `Season.SECTIONS` is logged. Before R1 six sections were missing from the list; they are on it now (section 3). A section added in future must be added to `SECTIONS` and to `AREA` and `describe` (History wording) in `season.js`, to `categoryOf` in `datamerge.js`, and to the anonymizer's `HANDLED` list; `test/season-sections.test.js` fails if a section a file can write is left off.

### 10.4 Replay check
The validator replays History from the start state and compares the result with the current data; any difference is a warning ("... If the file was not edited outside the app, open it and use History › Reconcile History."). `Season.replayDiff(s)` is the one implementation.

Two kinds of entry keep the History explaining the data after an upgrade:
- **`File upgrade`** (`label` and `tag` both `File upgrade`): when opening a file with a non-empty History changes data in any section (an older layout upgraded: T&T sign-offs moved from `common` to the book, Start Zone keys renamed, awards renamed, defaults added), `fromJson` appends one entry holding those changes. Its `t` repeats the last entry's `t`, so two copies opening the same file write the same entry. A file with an empty History, or one already in the current layout, gets none.
- **`Reconciled: History did not match the data (N places)`** (`tag` `Reconciled`): written only on request (History tab › Reconcile History, `Season.reconcile`). It records every difference the replay found as one entry and changes nothing but `history`. It repairs a file an older release upgraded and saved without logging.

Cause found on a real working file (2026-11-13): 396 differences, all T&T children's `progress` sign-offs logged under `common` by an older release, later moved to the book key and renamed by the upgrades, with nothing logged.

### 10.5 Merge
Rules (`datamerge.js`, `Season.merge3`): the common base is the newest History entry both files share (same time, same changes), else an empty file. A value only one side changed is taken; the same value on both is agreed; a blank never beats a value (it is flagged for review); two different non-empty values at one place are a conflict the leader decides; Planning Center fields are never merged. The merged file is the other copy plus one new `Merged` entry; the other copy's own History is left as it is. Change categories shown to the leader: Attendance, Game scores, Progress, Awards, Roster and Planning Center fields, Color teams and class moves, Uniforms, Flags and notes, Other.

**The Planning Center block moves as one unit** (R17; `DataMerge.alignPc`). `roster.pcCols`, `pcAsOf`, `pcSource`, `pcExport` and the `pc` of every person both files have are carried whole from one side and never mixed, so the file never says "as of one export" over another export's values. In **File > Merge a data file** this file's block stays whole; when the other file's export is newer, one Review row says so and names its date. In a **Drive save** (pressed or automatic): if only one side imported since the base, that side's block is carried whole; if both imported different exports, the newer (`pcAsOf`, then `pcExport.at`; a tie keeps what Drive holds) wins whole, with one Review row and no per-field conflicts under `roster › people › <id> › pc`. A person only one side has comes in whole and is not in the other side's `pcExport.ids`. Club-owned fields an import also writes (`x_Notes`, `x_Active`/`x_InactiveBy`, cleared `ov:`) merge like any edit; `x_LastSeen` is never compared.

## 11. Lifecycle

### 11.1 Opening (`fromJson`, in order)
1. Parse JSON (drop `__proto__`); require `format`; refuse a newer `version`.
2. Start from `blank(year)`; copy `fake`.
3. `config` = defaults + file's config; repair `blueJewelWeeks`; merge `yearBook`; fold `tntBook`; rename books to their written spelling (`renameBooks`).
4. Copy the known sections (those listed in 3 that are objects).
5. Upgrades: old Sparks template, `SS Review Emblem - Yellow`, standard books, T&T per-book, Sparks jewels, Start Zone, Cubbies, settings defaults.
6. Unpack the roster; copy `calendar`, `rotation`, `history` (lists).
7. If books were renamed, rename them in History too.
A file's dates are kept as they are (a hand-edited file can still be opened and repaired); `badDates` lists every date that is not real and `fixDates` applies a decision for each.

### 11.2 Saving
Download or Save writes `toJson(season)`. File names end in a local timestamp: `awana-<year>[-<kind>]-yyyymmdd-hhmmss.json` (`Season.fileName`; kinds used: `TEST`, `before-restore`). Drive saves either update one file in place (`saveStyleDrive: inplace`) or create a dated file; locally the browser may save over one file (`saveStyleLocal: single`). Nothing is stored in the browser between visits; the update handoff (13.4) lives only for a reload.

### 11.3 Year rollover (`Season.newSeason`)
A new file is `blank(year)` plus: the old `config` (with `teamsOk` and `todoIgnored` emptied, `teamPlan` deleted, `yearBook` cleared), the roster (with `ov:*` pending changes and the year-bound uniform fields removed; sizes and uniform notes carry over), the calendar and rotation, and `blueWings` (the closed year's Blue Jewel placements, with held gems dropped and hand grants turned into placements). **Carried forward once, here (2026-11-13):** `progress` (every sign-off, finished or not), `handbooks`, `doneBooks`, `received`, `awards` (told to the group), `given`, `givenNoDate`, `held`, `progressNoDate`, `extraSheets` and `announcedNoDate`, copied whole; `pastTurnout` (5.25: the closed year's attendance counts are added for each child who came, and earlier years' counts stay); and `config.carriedThrough` (the closed year's last night, the later of its last attendance night and its last counted calendar night). **Stay with the closed year:** `attendance`, `games`, `adults`, `flags`, `teamMoves`, `blueOverrides` and `blueDrops` (Blue Jewel hand grants already become `blueWings` placements), and History, which starts empty.
**Nothing carried counts as this season's work.** Every earlier-years rule uses `Season.seasonStart` (the first club night, held back to the day after `config.carriedThrough` while the calendar is still last year's): an award earned before it is not offered for announcing, `awardLedger` marks a row `carried` when every date it has (earned, announced night, day given) is before it, `earnedAwards` (Awana store points, Statistics) and the season reports leave carried awards out, the store's `sections` count counts only sign-offs dated on or after it (`sectionsThisSeason`), and `assumedGiven` ignores Given dates before it. A carried award that was announced but not given still shows on the hand-out lists. An award earned last year but never announced or given stays out of this year's lists (the Earlier years button marks it given). Colors: `teams.js` renames `team:Q1..Q4` to `team:<year>:Q1..Q4`.

### 11.4 Demo files (`fake: true`)
`Season.freshenFake(text, today)` moves every date forward by whole weeks until the newest attendance night is the latest one on or before today, so Try it out always looks current. Dates move in keys and values, in History timestamps, and in handbook strings (`moveHandbook`). Nothing else opens a file this way.

## 12. Validation: what is and is not checked

`validate.js` (`validateData`) is what the Validate and Debug tabs run. Errors stop the file being called valid; warnings and info lines are advice.

**Checked**: JSON syntax; `format`; `version` (error if newer, info if older); the file-name tag (warning); `year` shape (warning); `config` fields `clubDay`, `blueJewelWeeks`, `teamOrder`, `saveStyleDrive`, `saveStyleLocal`, `autoUpdate`, `autoSave`, `drivePinDays`, `sparksBooks`, `yearBook`, `placePoints`; every roster entry (has `pc` and `v`; `team:Qn` values); `attendance` (dates, marks, `g`, `t`); `games`; `awards`; `given`; `adults`; `teamMoves`; `handbooks`; `progress`; people referenced but not on the roster ("ghosts", a warning); `calendar` (real dates, Type, Quarter, duplicates, off-day club nights); `rotation` shape; `history` entries and the replay check; dates in records that are not club nights (warning). Since validate.js 1.9.0 (R16, part 1) also: `held`, `flags`, `doneBooks`, `received`, `givenNoDate`, `progressNoDate`, `extraSheets`, `announcedNoDate`, `blueWings`, `blueOverrides`, `blueDrops` (a wrong shape is an error; a value that points at nothing, such as a book not in `config.books` or a half of a no-date pair, is one aggregated warning with examples in parentheses); and **a section that is not an object** (for example `blueDrops` stored as a list) is an error, because opening the file empties that section and its records would be lost at the next save. Every finding carries a `check` name (the section, `config`, `roster`, `ghosts`, `calendar`, `nights`, `history`, `replay` or `file`).

Also checked since validate.js 1.9.0 (R16, part 2), when present: the shapes of `config.books`, `progress` templates, `awardLists`, `exclude`, `completion`, `endOfYear`, `store`, `teamPlan` (a team code of four letters from R, B, G, Y or -, locked dates; people not on the roster are a warning), `teamsOk`, `todoIgnored`, `driveDirs` (the older `open`/`data` keys are an info line), `bundles`, `bookOrder`, `slideNames`, `medRead`, `medPrinted`, `clubTitle`, `driveKeepName`, `cubbiesDetail`, and `tntBook` (info). A setting the app does not know is **kept** and reported as one info line. `Validate.CHECKED_SECTIONS` and `Validate.CHECKED_CONFIG` list what is covered; a test fails when a section or a config key the code uses is missing from them.

Also checked (R17, `roster.pcExport`, check name `roster`): a record that is not an object, or whose `names`/`header` are not lists of text, `ids` not an object, `loose` not a list, `rows`/`blankRows` not whole numbers (error); fewer stored `names` than `header` cells, a repeated name, or a `loose` row that is not a list of text with one cell per name (error); an id in `ids` that is not on the roster, or `rows` that is not `ids` + `loose` + `blankRows` (warning); a key outside `Model.CAPTURE_KEYS` (info, listed with the unknown keys). A clean record gives two info lines ("Planning Center export kept: 158 rows (1 belongs to nobody, 1 blank), 59 columns (6 not used by this app: ...), as of ...", and a count of columns that hold values from an earlier export). A version 6 file with people and no record says "No Planning Center export has been captured in this file yet." Keys the app does not know (top level, `roster`, a person, the record) are one info line, never an error. An export file (CSV) check also counts its rows, blank rows, columns, cell positions past the last header column and columns with no header.

**Not checked** (the file can be structurally wrong and still pass): roster details beyond a missing `pc`/`v` and bad `team:` values (R16 part 3); that `pcCols`/`pcKeys` match the length of each packed `pc` is checked (an error when they do not); that award names exist in `config.awardLists` (older files hold names without the book code, and custom awards are allowed); progress keys against the template (renamed blocks survive in older files); the order of `calendar` rows. See BACKLOG R16.

## 13. The other JSON documents

### 13.1 Progress patch (`awana-progress-patch`): removed
The photo-to-progress import (a JSON patch of proposed sign-off dates) was shelved on 2026-11-05 and removed on 2026-11-13. A file with this format that is dropped on Import is named and left out with a message; it is never applied. The number 13.1 is kept so the links to 13.2 to 13.4 stay as they were.

### 13.2 Try-it manifest (`app/try/manifest.json`)
`{ "data": "<test data file name>", "export": "<test export csv>", "import": "<test import csv>" }`, written by `make-deploy.sh` from `dev/test-data/`. File names must contain `TEST`; the deploy refuses anything else in `app/try/`.

### 13.3 Web app manifest (`manifest.json`)
Standard PWA manifest: `name`, `short_name`, `description`, `start_url` (`./index.html`), `scope`, `display` (`standalone`), colors, `icons` (192 and 512 PNG). The service worker (`sw.js`, generated per release by `make-deploy.sh`) is JavaScript, not JSON.

### 13.4 Update handoff (browser session storage)
Written just before an update reload and removed as soon as it is read: `{ t: <ms>, tab, sub, test, drive, trail, season?: <data file text> | master?: <roster csv text> }`. It carries the open session through the reload. It exists in the tab only until the page loads; it is never a saved copy and never leaves the browser.

### 13.5 Anonymization extras
`--extra private-names.json` is a JSON list of further real name words found in free text; keep the file outside the project.

## 14. A complete annotated example

An invented one-child club (one night, one sign-off, one award). Real files are one line; this is indented for reading. Comments (`//`) are not allowed in real JSON.

```jsonc
{
  "format": "awana-season",
  "version": 6,
  "year": "2026-27",
  "config": { "clubDay": 3, "blueJewelWeeks": [6, 12, 19, 27] /* ...every other key from section 6... */ },
  "roster": {
    "cols": ["team:Q1", "team:Q2", "team:Q3", "team:Q4"],
    "pcCols": ["Registration ID", "First Name", "Last Name", "Grade", "Birthdate", "Assignment Area: Classes", "Medical Notes"],
    "pcAsOf": "2026-10-28",
    "pcSource": "20261028 -- club.csv",
    "pcExport": { "at": "2026-10-29T01:00:00.000Z", "hash": "9f3a1c07-66889", "rows": 2, "blankRows": 0,      // the kept export: one row belongs to the child below, one to nobody
                  "header": ["Registration ID", "First Name", "Last Name", "Grade", "Birthdate", "Assignment Area: Classes", "Medical Notes"],
                  "names":  ["Registration ID", "First Name", "Last Name", "Grade", "Birthdate", "Assignment Area: Classes", "Medical Notes"],
                  "ids": { "7000001_Test_Kid": 1 }, "loose": [["7000002", "Other", "Family", "1", "2019-01-05", "Sparks A", ""]] },
    "people": {
      "7000001_Test_Kid": {
        "pc": ["7000001", "Test", "Kid", "2", "2018-04-02", "Sparks A", null],   // packed: one value per pcCols name, null = none
        "v": { "team:Q1": "Green", "x_Active": "1", "x_FirstSeen": "2026-09-09", "x_LastSeen": "2026-10-28" }
      }
    }
  },
  "handbooks":  { "7000001_Test_Kid": "HG 260916" },               // code, date received (yymmdd), optional note
  "attendance": { "2026-09-09": { "7000001_Test_Kid": { "a": 1, "g": "Sparks", "h": 1 } } },
  "awards":     { "2026-10-07": { "7000001_Test_Kid": ["HG Red Jewel 1"] } },     // announced that night
  "given":      { "7000001_Test_Kid": { "HG Red Jewel 1": "2026-10-14" } },       // handed over that day
  "progress":   { "7000001_Test_Kid": { "HG": { "RJ1.1": "2026-09-23", "RJ1.2": "2026-09-30" },
                                         "common": { "FLT.1": "2026-09-09" } } },
  "adults": {}, "teamMoves": {}, "games": {},
  "progressNoDate": { "7000001_Test_Kid": { "HG": ["RJ1.2"] } },   // only present while a sign-off is "no date": then RJ1.2's date above is NOT a real sign-off day
  "calendar": [ { "Date": "2026-09-09", "Type": "Club night", "Quarter": "Q1", "Theme": "Opening Night",
                  "Notes": "", "No Club": "", "Puggles Lesson": "1.1 God Made the Light", "Cubbies Lesson": "", "Sparks Lesson": "", "T&T Lesson": "" } ],
  "rotation": [ ["Time", "Puggles", "Sparks A"], ["6:30 - 6:45", "K-3", "Opening"], ["6:45 - 7:15", "", "Games"] ],   // "" means same as the cell above
  "history": [ { "t": "2026-10-07T20:00:00.000Z", "label": "Awards 10/7",
                 "changes": [ { "p": ["awards", "2026-10-07", "7000001_Test_Kid"], "n": ["HG Red Jewel 1"] } ] } ]
}
```

## 15. Known gaps found while writing this

These are facts about the code at 1.51.05, listed so nobody has to rediscover them. Each is in BACKLOG as R16 to R21 or already tracked.

1. **The validator ignores eleven sections and most of `config`** (section 12). A corrupt `blueDrops` or `flags` passes the Validate tab. (R16)
2. ~~**Unknown top-level keys are dropped on open and lost at the next save** (2.5), silently.~~ Fixed (R17): unknown keys are kept and written back at every level, and every Planning Center column and row is kept in `roster.pcExport` (5.2, version 6).
3. ~~**`config.driveDirs` has two key sets**~~ Fixed (R18): opening a file folds `open`/`data` into `club`; the default and every writer use `club`/`slides`.
4. ~~**`x_ClubberID` in `v`**~~ Fixed (R18): opening a file removes a copy equal to the person's id; a differing copy is kept and reported.
5. **The header comment of `season.js`** lists the sections but omits nine (`givenNoDate`, `held`, `flags` and the six newer ones); they are documented in comments next to their functions. This file is now the single reference. (R19)
6. **The History replay check warns on a real working file** (a few hundred differences between the data and what the log says). Not investigated. A candidate cause is an operation that changes data without logging it (`renameAward`, a restore, a year rollover); that is a guess. (R20)
7. **`given` keeps the tick day for a no-date award** (7.5): any new screen or report that reads `given` directly instead of `givenShown` will print a day nobody entered. (R21)
