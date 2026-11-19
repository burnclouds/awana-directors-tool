# N40: a data file a person can read (plan, 2026-11-19)

Status: PLAN ONLY. Nothing here changes the file format. Nothing is built until Mike says yes (BACKLOG N40).

Method and limits: read `docs/DATA-FORMAT.md` (all of sections 5 to 9 and 14) and the invented fixture `dev/test-data/awana-2026-27-TEST-20261029-214815.json` (159 KB, 144 invented people). I did NOT open a real save (it lives on Drive and was not available to this session); sizes below are from the fixture. No real name appears in this file.

## What makes the file hard to read by hand

Size by section in the fixture (compact JSON): roster 102 KB (64%), attendance 19 KB, calendar 9 KB, pastTurnout 9 KB, config 8 KB, everything else under 4 KB each. History is small in the fixture but is the largest part of a long season's real file (DATA-FORMAT 8).

| # | Hard to read | Where | What a person sees today | Why it is that way |
|---|---|---|---|---|
| 1 | Positional Planning Center values | `roster.people[id].pc` | `["7000001","Test","Kid","2","2018-04-02","Sparks A",null,...]`: 53 values, meaning only by position against `pcCols` | Names written once instead of per person (the v5 compaction, 380 KB to 189 KB) |
| 2 | One-letter attendance marks | `attendance[date][id]` | `{"a":1,"h":1,"p":1}` and `g`, `t` | One record per child per night: the most repeated shape in the file |
| 3 | History keys | `history[].t / p / o / n` | `{"p":["handbooks","id"],"o":"...","n":"..."}` | History stores old and new for every change, so the keys repeat the most |
| 4 | Packed text values | handbook string `AoG 260916`; `blueDrops` `1|2026-10-28`; `todoIgnored` `group|id|text`; `teamPlan.proj` `--BY` | A grammar you must know (DATA-FORMAT 7.1, 7.6) | Small, typed by hand (handbook) or one value per quarter |
| 5 | Book and award codes | `HG`, `WR`, `SS`, `AoG`, `HC`, `AS`; progress keys `RJ1.2`, `BE1.1.1`, `FLT.6`; award names `SS Red Emblem` | Short codes; the meaning is in `config.books` and `config.progress` | They are the club's own handbook codes, and award names are the identity of an award everywhere |
| 6 | Ids built from text | person key `7000001_Test_Kid`; flag ids `f...` and absence ids `a...` (letter + base-36 time + 2 characters) | The person key is readable; flag and absence ids are opaque | The person key is the join key everywhere; flag ids avoid dates so a demo shift does not move them |
| 7 | Prefixed fields in `v` | `x_Active`, `x_FirstSeen`, `ov:<column>`, `team:Q1` | Readable once the prefix rule is known (DATA-FORMAT 9.5, 9.6) | Separates the club's own fields from Planning Center's |
| 8 | Pairs that must agree | `given` + `givenNoDate`, `progress` + `progressNoDate`, `received[...] = "no date"` | Two places hold one fact (DATA-FORMAT 7.5) | The record needs a day but the day is unknown |

## The constraint that decides the approach

Mike's standing rule (2026-11-02): keep the file as small as possible, store only input records, and keep older files opening. Spelling the keys out (`"present": true` for `"a": 1`, a named object for each `pc` list) would roughly double the roster and attendance sections and would change every History path, because History records the key path of each change (`["progress","id","HG","RJ1.2"]`). Renaming a key therefore also breaks the replay of every old History entry unless a translator is kept forever. That is a lot of risk for a file people open rarely.

## Recommendation: change what a person reads, not what is stored

**Option A (recommended): no format change, no version bump, nothing to migrate.**

1. **A decoder table at the top of DATA-FORMAT.md** ("Reading the file by hand"): one page that lists every code in the table above with its plain meaning (the marks `a h p x g t`, the history keys, the handbook grammar, the pipe keys, `--BY`, the id prefixes, the `x_` and `ov:` prefixes, the no-date pairs). Most of this exists but is spread over sections 5, 7 and 9; the page gathers it. Test: `data-format-doc.test.js` already guards the section count; add a check that every mark and every top-level key appears on the decoder page.
2. **A "Readable copy" button on the Debug tab.** It writes a second, read-only JSON next to the data file with the codes spelled out: the `pc` list expanded to its field names, attendance marks as `{"present":true,"handbook":true}`, History keys as `time/path/old/new`, the handbook string split into `{code,date,note}`, `blueDrops` as `{gem,date}`, `teamPlan.proj` as `{Q1:"Red",...}`, award codes followed by their book name, and every person id followed by the person's display name. It is marked `"readable": true` and `"readOnly": true`, is never opened by the app (Open refuses it with a plain sentence), and is built by one function, so the stored file does not change at all. Privacy: it holds real names exactly as the data file does, so it is made only on request, never saved to Drive by itself, and the name carries `-READABLE`. Tests with invented data: every code in the decoder table round-trips (expanded value maps back to the stored value), the stored file is byte-identical before and after, and Open refuses the copy.

Cost: small (decoder page: a document edit and one test; Readable copy: one function in `app-tools.js`, one button, two tests). Risk: none to old files, merge or History.

**Option B (only if Mike wants the stored file itself changed): version 7.**
Candidates, in the order I would take them, with what they would cost:

| Order | Change | Gain | Cost / risk |
|---|---|---|---|
| 1 | `blueDrops` `"1\|2026-10-28"` to `{"gem":1,"on":"2026-10-28"}` | removes a packed value | slightly larger; tiny section; loader accepts both |
| 2 | `teamPlan.proj` `"--BY"` to an object of quarters | removes a packed value | larger; one section; loader accepts both |
| 3 | `todoIgnored` pipe keys to objects | removes a packed value | larger; keys are compared as text today, so the match code changes |
| 4 | attendance marks `a h p x` to words | readable | roughly doubles the second largest section; every History path and value for attendance changes |
| 5 | History keys `t p o n` to words | readable | History is the largest part of a real file; breaks replay of old entries without a translator |
| 6 | `pc` to named objects | readable | undoes the 380 KB to 189 KB compaction, the single largest cost; not recommended |

Items 4 to 6 work against the small-file rule and are not recommended. Items 1 to 3 are cheap but only fix packed values in tiny sections.

Leave as they are, with a decoder line each: the handbook string (a person types it; already the most readable form), person keys (already readable), flag and absence ids (opaque on purpose), book and award codes (the club's own words), and the no-date pairs (documented in 7.5).

## What I need from Mike

A yes or no on Option A. If yes: build the decoder page and the Readable copy button, with tests, as a new backlog item. Option B only on a separate yes, one change per release, each with a version step, a loader that reads the older form, and the upgrade tested on invented data.
