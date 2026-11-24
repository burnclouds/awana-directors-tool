# N3 round 3, parts B and C: implementation plan (for Sol)

Scope of this run: **B (lost-reply recovery) and C-core (cancelled night as a note).** Do not build the permanent indicators, the Debug view, parts A, D, E, F, or anything else. Read `docs/superpowers/plans/2026-11-24-n3-fix-round-3.md` for owner decisions. No commit, no push. Run targeted Node tests only; the browser tests may be written but do not run the browser suite.

Owner decisions that apply here: recover a lost reply by downloading up to three later revisions and comparing content (no checksum); a pending save survives a reload and clears only on a successful save, a refused write, or a deliberate reopen from Drive; a cancelled night stays listed in the maker; reports hide nothing.

## Part B: pending write recovery (`dev/app/drive.js`, `dev/app/app-drive.js`)

**Current state (verified by reading):**
- `pendingWrites` is set only after `update()` returns (about line 185). A lost reply records nothing.
- `previousRevision()` (about lines 132–141) fails with "Cannot match the Drive v2 revision IDs" for every mismatch, including a lagging revision list.
- The errors near lines 158 and 161 keep the pending entry, and nothing clears it, so every later save throws.
- `head()` (about line 145) sits outside the `try`, so an offline failure there skips the pending message.
- `explain()` in `app-drive.js` (about lines 250–259) says "Nothing was changed on Drive" for busy and offline errors, which is wrong once a write may have landed.
- `openPicks` (`app-drive.js` about lines 90–102) never clears pending state.

**Changes in `drive.js`:**
1. **Record before upload.** Just before the upload, keep `prior = pendingWrites.get(id)`, then set `{ base: latest.headRevisionId, written: null, body, repair, name, sourceText }`. When `update()` returns, set `written`. Remove the post-return set.
2. **Upload failures (catch block).** Attach `err.pendingWrite`.
   - Any 4xx (412, 401, 403, 404) means the write was refused: restore `prior`, or delete the entry if there was none.
   - Status 0 or 5xx means the reply was lost or unknown: keep the entry, count one change, and continue the loop.
   - Move `head(id)` inside the `try`. While an entry exists, turn any non-412 error into a `DriveError` with kind `pending` and `pendingWrite: true`, with the message: "A save of «name» to Google Drive may not have finished. A save needs checking: reopen the file from Drive before saving again. Your changes are still here."
3. **Resolve a lost reply in `previousRevision` when `written === null`.** Given `head`:
   - If `head === base`, the upload was not stored: restore `prior` and continue normally.
   - Otherwise find `base` in `revisions(id)`. If it is missing or nothing follows it, the list is lagging: re-list up to 2 times with `env.wait(ms)` (default about 1 second; tests pass an instant wait). If still lagging, throw kind `lagging` with: "Drive's version list for «name» has not caught up with the last save yet. Wait a moment and press Try again."
   - Otherwise take at most 3 revisions after `base`. Pin each, read each with `readRevision`, and compare its content exactly with `pending.body`. The first exact match sets `written`; `previous` is the revision before it.
   - No match: the upload was not stored; restore `prior`. More than 3 candidates, or a failed read: throw kind `pending`, fail closed.
   - Keep the "cannot match v2/v3" error only when the list holds neither `base` nor `written` while `written` is known.
4. **Recovered with nothing displaced.** If our write is now head and `previous.id === base`, return `{ id, name, headRevisionId: written, recovered: true }` without a second upload. Mark `recovered: true` on the other success returns too.
5. **No wedge (near lines 158 and 161).** Before throwing, ensure the displaced predecessor is pinned. Throw kind `pending`, naming the file and the displaced revision's `modifiedTime`, saying it is kept in the file's version history.
6. **New API.** `clearPending(id)` returns true if it removed an entry. `pendingFor(id)` returns a copy, for tests. Export both (about line 224).
7. **Persistence (owner decision).** The pending entry must survive a reload. Store the minimum needed (file id, base revision, written revision if known, a content fingerprint, name) in the app's existing saved-state location. Do not store the content itself or any personal data beyond what the save already holds. Find that location in the code; if none exists, stop and report.

**Changes in `app-drive.js`:**
- `explain()`: kinds `pending` and `lagging` return their message. For busy and offline errors with `err.pendingWrite`, drop "Nothing was changed".
- The `go()` catch block (about line 273): on kind `pending`, set `st.wait = { kind: 'check', msg }` for manual saves too.
- `waitText`: add `check`: "a save needs checking. Reopen the file from Drive."
- `openPicks`: for each JSON read, if `D.clearPending(f.id)` is true, set `st.last` to "reopened; the earlier save check was cleared", then clear the `check` wait.
- `saveInPlace` (about line 206): when `up.recovered`, set `st.last` to "saved HH:MM (checked the earlier save)".

**Invariants:**
- A pending entry exists from before each upload until the write is proven stored, proven refused, or cleared by a deliberate reopen.
- A displaced revision is merged into head, or pinned and named in a message. Never dropped silently.
- No upload is sent while a `pending` error is outstanding.
- A 4xx never leaves a stale entry.

**Tests, `dev/app/test/drive.test.js`** (extend the existing fake server; invented content only, e.g. `{"mark":"ours"}`):
- B1: upload stored as r2, reply lost, no competitor. Resolves to r2 with `recovered`; one upload; `pendingFor` is undefined afterwards.
- B2: a competitor writes r2, If-Match ignored, ours stored as r3, reply lost. r2 is pinned and its text is merged. Final head holds both values.
- B3: reply lost, nothing stored (head stays r1). Second upload yields r2; two uploads sent, one stored.
- B4: offline through upload and head. Rejects with kind `pending`, message matching `/club\.json/` and `/needs checking/`; entry kept. Back online, next call behaves like B1.
- B5a: lists lag for 2 re-lists, then catch up: succeeds.
- B5b: lists always lag: rejects with kind `lagging`, message matching `/not caught up/` and not `/Cannot match/`. Succeeds once the list catches up.
- B6: pending with displaced r2; another writer moves head to r4. Calls 2 and 3 reject with kind `pending` and send no upload. `clearPending` returns true; call 4 merges normally from r4; r2 has `keepForever`.
- B7: four 412s in a row: `pendingFor` is undefined afterwards.
- B8: a pending entry survives a simulated reload (save state, rebuild the module, read it back).
- `dev/app/test/drive-calendar-review.test.js`: `explain` for kind `pending` returns the message; for busy with `pendingWrite`, the message does not match `/Nothing was changed/`.

**Regression risks:** `drive.test.js` near line 83 expects 12 calls, so the 412 path must not re-list. Near line 98 needs the narrowed "cannot match" rule. Near line 105 and all `racingSave` cases, especially "ignored condition", "two ignored conditions" and "during write". Browser tests (`drive-inplace-browser`, `drive-autosave-browser`) are not run in this session.

## Part C-core: cancelled night as a note (`dev/app/app.js`, `dev/app/calendar-safety.js`)

**Current state (verified by reading):**
- A State change goes through `Calendar.setState` (`app.js` about line 1578). A Type change to Event strips `Cancelled` and the break fields (about line 1579).
- `structuralCalendarEdit` (about lines 1511–1566) gates on `correctionImpact`. Records already stay in place. There is one confirm and no typed phrase for State and Type; the phrase applies only to Delete and Date.
- Missing: the warning gives reason counts, not a child count or names, and it wrongly fires on nights with no activity when a flag such as "previous schedule" or "locked quarter" applies.
- `CalendarSafety.activityAt` (about lines 255–265) exists but nothing in the app calls it.
- **Bug:** line 1526 reads `n.signoffs`, but notices now carry `records` (about line 141). Any notice throws a TypeError there. Replace it with `CalendarSafety.noticeText(n, nameFn)`.

**Changes:**
1. `calendar-safety.js`: add `noteImpact(season, date)` and export it. It returns `{ recorded, children, other }`.
   - `children`: the `activityAt` ids for the date, excluding adult awards.
   - `other`: counts from `linksAt` for games, adult awards, volunteer absences and dated notes.
   - `recorded` is true when `children` or `other` is non-empty.
2. `app.js` `structuralCalendarEdit`: after the existing checks, if `field` is `State` (new state is cancelled or planned) or `Type`, take a note branch.
   - `n = noteImpact(openFile, original.Date)`. If `!n.recorded`, call `finish()` (no dialog).
   - Otherwise show one `App.ask.confirm` (no typed phrase). Title: "Mark night as a note". Text: "«date» «theme»: N child(ren) have recorded activity on this night. Marking it «Cancelled / No club / type» is a note: every record stays on «date»." The list holds the children's names from `App.master.people` via `Model.fullName`, falling back to the id, plus the `other` lines. OK button: "Keep records and mark".
   - Then `commitScope` with the existing staleness check, using `noteImpact` in place of `impact()`. Set `calendar = Calendar.sort(candidate)` and call `App.importChanged('Calendar note · ' + date)`.
   - Changing to Meets applies with no warning.
3. Leave the Delete and Date phrase rules unchanged.

**Invariants:** season records are identical before and after (`Season.snapshot` minus the calendar). The date stays the same. One Undo restores the row. Names never appear in the history label or in any file.

**Tests, `dev/app/test/calendar-maker.test.js`** (invented ids such as `kid-a`):
- C1: attendance for `kid-a` and `kid-b` plus one game gives `recorded: true`, `children: ['kid-a','kid-b']`, `other.games: 1`.
- C2: empty night gives `recorded: false`, `children: []`.
- C3: sign-off only gives `children: ['kid-c']`.
- C4: adult award only gives `recorded: true`, `children: []`.
- C5: night with only the "previous schedule" flag gives `recorded: false`.
- Update the existing `signoffs` expectation near line 311 to match the current `records` shape, as part of fixing the bug.

**Browser test (write, do not run):** `dev/app/test/calendar-correction-browser.test.js`: cancelling a night with attendance shows one dialog containing "1 child", OK keeps attendance unchanged, history increases by one, the date is kept, and one Undo restores the row. Cancelling an empty night shows no dialog.

**Regression risks:** `calendar-maker.test.js` near lines 268–332 (`correctionImpact` must not change behaviour); the four flows in `calendar-correction-browser`; `calendar-maker-browser`.

## Report back
- Files changed, and the line ranges.
- Test names and pass/fail counts only.
- Anything that could not be done safely, and the reason.
- `git status --short`. Do not commit.
