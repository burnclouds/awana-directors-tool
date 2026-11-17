# R7: a Drive merge-save that was edited over must merge again before the next upload. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When leader A's in-place Drive save had to merge in leader B's changes, and A edited something while that save was still running, A's next save must still contain B's changes (today it uploads A's copy without them). Same for automatic saves and across an app update.

**Architecture:** No data-format change. The fix is in `dev/app/app-drive.js` (`saveInPlace`, `App.driveSave.go`, `App.driveHandoff`), plus a small edit counter in `dev/app/app-season.js` (`App.editSeq`, shared with R11) and a one-line guard in `dev/app/app-update.js` (`apply`). The lineage record `c` (`st.cur`) gains `remerge: boolean`; after a merged save that was edited over, `c.base` becomes the text this copy sent, so the next save replays only the later edits onto what Drive holds.

**Tech Stack:** Vanilla JS (no bundler), Node 24, Playwright 1.64 (Chromium) for the browser tests. No new dependencies.

**Spec:** BACKLOG "Review 2026-11-12" R7; `dev/REVIEW-2026-11-12-whole-project.md` (bug 6, fix 7); roadmap `2026-11-12-review-fixes-roadmap.md` (R7 paragraph); the outline in `2026-11-13-wave2-data-safety.md` Task 9 (this file replaces it); `Season.merge3` contract in `dev/app/season.js:1184-1211`.

## Global Constraints
- Use the Edit and Write tools to change files; scripted rewrites (`sed -i`, `node -e` that writes) are blocked. Tests may run anything.
- Never open, list or print a real data file (`archive/`, `~/Downloads`, `~/Nextcloud`, `dev/*.json`, `dev/*.csv`, `reports/`, `research_notes/`). Tests use `dev/test-data` (the drive test already does: `DATA`, `EXPORT` at `drive-inplace-browser.test.js:7`) and the TEST children returned by its `kids(p)` helper. Invented ids only if a new fixture is needed (`7000001_Test_Kid`).
- Tests run from `dev/app`: `NODE_PATH=/tmp/claude-1000/shim/node_modules node test/drive-inplace-browser.test.js`. Full sweep from the repo root: `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh`.
- Each changed `.js` file bumps its own version on line 1 in the task that changes it: `app-drive.js` (now `1.17.0`), `app-season.js` (now `1.87.1`), `app-update.js` (now `1.5.1`). `app-version`/`app-build` in `dev/app/index.html` (now `1.51.06` / `2026-11-13`) are bumped once, in the release wrap-up of whichever release carries this item (Wave 2b). `make-deploy.sh` refuses changed files with an unchanged release.
- No data-file change: `docs/DATA-FORMAT.md`, `test/data-format-doc.test.js`, `Season.SECTIONS` and `dev/tools/make-test-data.js` are **not** touched. `remerge` lives only in memory and in the update handoff (sessionStorage), never in the data file.
- Project rule: do not deploy. End at a committed, swept dev tree; Mike says "deploy".
- Commit messages end with the two attribution lines given in the session.

## What the review and the earlier plan got right and wrong (checked 2026-11-13 against the current code)
| Claim | Verdict | Evidence |
|---|---|---|
| `app-drive.js:137` always advances `c.rev`; `:148-151` dirty branch leaves `c.base` and the open season without the merged content; next save skips the merge at `:125` | **Holds** (line numbers still exact, `app-drive.js` 1.17.0) | After the dirty branch: Drive head = our upload = B + X; `c.rev` = that head; `c.base` = the pre-save base; `App.season` = X + Y (no B). Next save: `head === c.rev`, no read, uploads X + Y. B survives only as an older revision. |
| The message "the next save merges again" (`:151`) | **False today**; this plan makes it true and rewords it | see Task 2 |
| Review's fix: "advance `c.rev` only when `c.base` and the open season hold the merged content" | **Works but is the weaker fix.** | Leaving `c.rev` old forces a read, but the merge then runs with the OLD base: every clash A already decided on the merge screen is asked again, and one decided "Keep Drive's" comes back as a clash (base old, Drive = B's value, ours = X's value). Using the sent text as the new base (`c.base = snapshot(fromJson(text))`) replays only edits made after that text, so decided clashes stay decided. |
| Earlier plan (Wave 2 Task 9): take `seq = App.editSeq()` at the start of `saveInPlace` | **Wrong.** | Saves are queued (`queue`, `app-drive.js:155`). The text is taken in `saveNow` (`app-season.js:237`) and may wait behind an earlier save; an edit made while it waits would count as "before" and be wiped by `App.openSeason(body)` (`:149`). The counter must be read when the text is taken: synchronously in `App.driveSave.go`, which `App.download` (`app.js:68`) calls in the same tick as `Season.toJson`. |
| Earlier plan: after an update reload "with `remerge` true the next save still reads Drive first", base = reloaded season | **Wrong.** | `driveHandoff.set` (`app-drive.js:186`) sets `base = Season.snapshot(App.season)`. If the reloaded season holds unsaved edits Y, `merge3(base=S+Y, ours=S+Y, theirs=Drive)` treats Y as unchanged and returns Drive's: Y is lost. Fixed by Task 3 (update refuses to carry unsaved edits; handoff carries `remerge`). |
| Earlier plan's test step "`d.beforePatch` makes A edit again" | **Needs a test-helper change.** | The fake calls `h(m[1])` without `await` (`drive-inplace-browser.test.js:57`); an edit through `p.evaluate` is async. Make the route `await h(m[1])`. |
| Dependency on R11 (`App.editSeq`) | **Real, and stronger than stated.** | Today `markSaved()` runs right after `App.download` is called (`app-season.js:237`), so `App.dirty()` at `:148` does mean "edited during the save". R11 moves `markSaved` after the Drive promise; from then on `App.dirty()` is always true at `:148`, so R7 must not depend on `App.dirty()`. |
| Draft (held) edits | **Not counted by `markEdit`.** | `touchSeason` on a held tab (`app-season.js:102-106`) sets `dirty` without `markEdit()`. The counter must also go up there, or a held edit made during the save is wiped by the refresh branch. |
| Pre-existing, found while tracing: automatic-save merge uses the live season | **Note, harmless after the fix.** | Non-interactive `merge3(c.base, ours, ...)` (`:114`) uses `ours = App.season` (live), so edits made before `D.read` returns ride along in `body` though not in `text`. With base = `text`, the next merge sees them on both sides ("agreed"), no conflict. Leave it; Task 2 has a test that pins it. |
| Pre-existing: an automatic save that hits the dirty branch calls `alert()` (`:152`) | **Holds;** a phone user mid-entry gets a blocking dialog. | Task 2 changes it to a flash when nothing clashed (open question 2). |

## Review Focus
Failure modes to check deliberately; each has a test.
1. **Edit during a merged save, pressed Save** (interactive merge screen): next save holds B, X, Y. Task 1 test A.
2. **Same, both saves automatic** (merge3 path, no screen, no alert): Task 1 test B.
3. **Edit made while the save waits in the queue** behind an earlier save: not wiped by the refresh. Task 2 test C.
4. **A held (draft) edit made during the save** counts as an edit: not wiped. Task 2 test D.
5. **No over-merge:** an un-merged save that was edited over, and a merged save not edited over, do not read Drive on the next save (one `GET ... alt=media` less, existing tests stay green). Task 2 tests E and F.
6. **A clash decided "Keep Drive's" in the first save is not asked again** in the remerge. Task 2 test G.
7. **The remerge itself is edited over** (third save): still converges. Task 2 test H.
8. **Cancelled remerge** keeps `remerge` true and downloads a copy (existing cancel behaviour). Task 2 test I.
9. **App update while a remerge is pending:** after the reload the next save still brings in B and keeps A's edits. Task 3 tests J and K.
10. **Undo of the late edit** before the next save: the result equals Drive's (no resurrected or lost values). Task 2 test L.

## File Structure
| File | Change | Responsibility |
|---|---|---|
| `dev/app/app-season.js` | modify | `App.editSeq()`: counter bumped by `markEdit` and by the held-edit branch of `touchSeason`; never reset. (Skip if R11 already added it with this contract.) |
| `dev/app/app-drive.js` | modify | `go` reads `App.editSeq()` when the text is handed over and passes it to `saveInPlace`; `saveInPlace` uses it instead of `App.dirty()`, sets `c.base`/`c.remerge` in the edited-over branch, merges when `c.remerge` too, clears it on refresh; new message; flash not alert when nothing clashed; `driveHandoff` carries `remerge`. |
| `dev/app/app-update.js` | modify | `apply`: after the save, refuse the update if the file is still unsaved (edited during that save). |
| `dev/app/test/drive-inplace-browser.test.js` | modify | `await` the `beforePatch` hook; new tests A to L. |
| `dev/app/test/update-autosave-browser.test.js` or the drive test | modify | Test J/K (update path) lives in the drive test, which already has the update-with-Drive scenario (`:277`). |
| `CHANGELOG.md`, `README.md`, `BACKLOG.md`, `GOOGLE-DRIVE.md` (if it describes the merge message) | modify | Wrap-up. |

---

### Task 1: Reproduce (failing tests first)

**Files:**
- Modify: `dev/app/test/drive-inplace-browser.test.js`

**Interfaces:**
- Produces: the fake Drive's `beforePatch` may be `async` and is awaited: change line 57 to `if (d.beforePatch) { const h = d.beforePatch; d.beforePatch = null; await h(m[1]); }`. The existing gap test (`:125`) passes a sync function and is unaffected.
- Produces helper `drivePatchGets(d, from)`: the slice of `d.calls` from index `from`, used to assert "a `GET .../files/F1?...alt=media` came before the `PATCH .../upload/...F1`".

- [ ] **Step 1: Make the hook awaitable** (the one-line change above). Run the file once: expected unchanged results (all existing tests pass).
- [ ] **Step 2: Test A, pressed Save.** Name: `leader B saved, leader A's save merged, A edited during that save: A's next save still holds B's changes`. Steps: `d = fresh()`, `prep(d)`, `inplace(p)`, `k = await kids(p)`. B's change straight into Drive: `theirs = JSON.parse(ORIG)`, `theirs.attendance['2026-10-28'][k[2]] = { a: 1 }`, `d.rev('F1', JSON.stringify(theirs))`. A: `mark(p, '2026-10-28', k[0], 'h')` (X). `d.beforePatch = async () => mark(p, '2026-10-28', k[1], 'h')` (Y, made while the upload is in flight). `save(p)`, `applyMerge(p)`, `settle(p)`, wait for the dialog/flash (`p.waitForTimeout(500)`). Assert after save 1: `App.dirty() === true`; Drive head has B and X, not Y. Then `const from = d.calls.length; await save(p);` press through a merge screen only if one opens (see Task 2 decision; for the failing run the screen does not open); `settle`, wait 600 ms. Assert: head text has `attendance['2026-10-28'][k[2]]` deep-equal `{ a: 1 }` (B), `[k[0]].h === 1` (X), `[k[1]].h === 1` (Y); `d.calls.slice(from)` has a `GET .../F1?...alt=media` before the `PATCH .../upload/.../F1`; `App.season.attendance['2026-10-28'][k[2]]` deep-equals `{ a: 1 }` (A's screen shows B); `App.dirty() === false`; `seen.errors` empty. Expected today: FAIL on "B in head" (B is only in `d.files.F1.revs[1]`).
- [ ] **Step 3: Test B, automatic.** Name: `...and the same when both saves are automatic`. Same data; trigger saves with `p.evaluate(() => App.saveNow({ auto: true }))` (the call `runAuto` makes, `app-update.js:87`) instead of the button, no `applyMerge`. Assert the same four facts, plus `seen.dialogs.length === 0` (no alert from an automatic save once Task 2's flash change lands; while reproducing, assert only the data facts). Expected today: FAIL on "B in head".
- [ ] **Step 4: Run** `NODE_PATH=/tmp/claude-1000/shim/node_modules node test/drive-inplace-browser.test.js`. Expected: A and B FAIL, every other test passes. If A or B pass, stop: the bug does not reproduce, report to Mike before changing code.
- [ ] **Step 5: Commit** the failing tests on the work branch only if the branch policy allows red commits; otherwise keep them uncommitted until Task 2 (do not mark anything done).

### Task 2: The fix in `saveInPlace`

**Files:**
- Modify: `dev/app/app-season.js` (near `markEdit`, line 163; `touchSeason` held branch, line 106; exports near line 167)
- Modify: `dev/app/app-drive.js` (`saveInPlace` 106-154, `App.driveSave.go` 160-162)
- Modify: `dev/app/test/drive-inplace-browser.test.js` (tests C to I, L)

**Interfaces:**
- Produces (if R11 has not already): `App.editSeq(): number` in `app-season.js`. A module-level `let seq = 0;` bumped (`seq++`) inside `markEdit` and in the held-edit branch of `touchSeason` (line 106, next to `dirty = true`). Never reset by `markSaved`, `setSeason` or `openSeason`. If R11 landed first with the same name, check its bump sites include the held branch; add it if not.
- Changes: `App.driveSave.go(name, text, type, opts)` reads `const seq = App.editSeq ? App.editSeq() : null` **before** `queue(...)` and passes it: `saveInPlace(c, name, text, Object.assign({}, opts, { seq }))`.
- Changes: `saveInPlace(c, dated, text, opts)`:
  - `const edited = () => opts && opts.seq != null ? App.editSeq() !== opts.seq : App.dirty();` (fallback keeps today's behaviour if `editSeq` is missing).
  - Line 125 becomes: `const remerge = !!c.remerge; if (remerge || now.headRevisionId !== c.rev) { ... }` (body unchanged).
  - Line 144 (`!merged`): unchanged; also `c.remerge = false` there (cannot be true when `merged` is null, but keeps the invariant obvious).
  - Line 148: `if (!edited()) { ...refresh as today...; c.remerge = false; }` (set false inside the `seasonSource.text === body` branch, together with `c.base`).
  - `else` branch: `c.base = Season.snapshot(Season.fromJson(text)); c.remerge = true;` and the message becomes: "You changed something while it was saving, so this screen was not refreshed. Your changes are safe; the next save brings in the others' changes first."
  - Line 152: `if (merged.conflicts.length) alert(said); else App.flash(said, 'info');` (an automatic save never blocks a phone with an alert when nothing was lost). `App.flash(text, level)` (`app.js:519`) has two looks: `'error'` (red, prefixed "Not saved: ") and anything else (yellow "warn" style); do not use `'error'` here, the save worked.
- Decision (open question 1, default shown): a save whose only reason to merge is `remerge` (`remerge && now.headRevisionId === c.rev`) and whose plan has no conflicts skips the merge screen: in `merge`, when `interactive && onlyRemerge && !P.conflicts.length`, set `approved = true` without calling `App.mergeScreen`. With conflicts, the screen opens as usual. Test A then needs no `applyMerge` for save 2.

- [ ] **Step 1: Add the tests for the edge cases** (all in `drive-inplace-browser.test.js`, each with `assert.deepStrictEqual(seen.errors, [])`):
  - C `an edit made while the save waits behind another save is kept`: two quick saves (`save(p)` twice with an edit between, first one held with `d.beforePatch = async () => { await mark(... k[1] ...); }` and B's revision put in before the first save so it merges); assert after both settle that k[1]'s mark is in `App.season` and in the head text, and B too.
  - D `a held edit made during the save is not wiped`: switch to a held tab (`App.showTab('roster')`, a roster field edit through `App.changed()` inside `beforePatch`); assert after save 1 that `App.dirty() === true` and the held change is still in `App.season`; after Apply and save 2 it is in Drive with B.
  - E `a save that did not merge, edited over, does not read Drive next time`: no B; X, Y in `beforePatch`; save 2: no `alt=media` GET in `d.calls.slice(from)`; head has X, Y.
  - F `a merged save that was not edited over refreshes the screen and the next save does not read Drive`: B, X, no Y; save 2 (after mark Z) has no `alt=media` GET; head has B, X, Z.
  - G `a clash decided Keep Drive's is not asked again in the remerge`: reuse `clash('mine')`'s setup inline (progress `R.1` both sides) plus Y in `beforePatch`; save 2: `#mergeDlg` never opens (`p.locator('#mergeDlg[open]').count() === 0` after settle) and head `progress[k[0]].HG['R.1'] === '2026-10-03'` (Drive's kept) and Y present.
  - H `the remerge itself edited over still converges`: Test A plus Z in a second `beforePatch` during save 2; save 3 holds B, X, Y, Z.
  - I `cancelling the remerge writes nothing and keeps it pending`: make the remerge have a clash (Y changes `R.1` that B also changed), cancel the screen; assert Drive head unchanged, a download happened (`seen.downloads === 1`), and the following save (accepting) still has B.
  - L `undoing the late edit before the next save leaves Drive's content`: Test A, then `p.click('#btnUndo')` (undo Y), save 2; head equals save-1 head on attendance (B, X, no Y), `App.dirty() === false`.
  Run. Expected: A, B, C?, D, G, H, I, L FAIL (C and D may pass by timing today: record which); E and F PASS (guards against over-merging).
- [ ] **Step 2: Implement** as in Interfaces (both files). Bump `app-season.js` to `1.87.2` (or next free) and `app-drive.js` to `1.17.1`.
- [ ] **Step 3: Run** from `dev/app`: `NODE_PATH=/tmp/claude-1000/shim/node_modules node test/drive-inplace-browser.test.js`, then `merge-files-browser`, `drive-browser`, `update-autosave-browser`, `save-dot-browser`, `save-style-browser`, and `node test/merge.test.js`, `node test/datamerge.test.js`, `node test/versions.test.js`. Expected: all PASS, including the existing `someone saves in the gap...` and `cancelling the merge writes nothing...`.
- [ ] **Step 4: Commit** `app-season.js`, `app-drive.js`, the test.

### Task 3: An app update never carries an unsaved or half-merged session wrongly

**Files:**
- Modify: `dev/app/app-drive.js` (`App.driveHandoff`, lines 184-187), `dev/app/app-update.js` (`apply`, line 54)
- Modify: `dev/app/test/drive-inplace-browser.test.js`

**Interfaces:**
- `driveHandoff.get()` returns `cur: { id, name, rev, remerge: !!c.remerge }`. `set(h)` copies `remerge: !!h.cur.remerge` into `st.cur`. The base stays `Season.snapshot(App.season)`: correct only when the carried season has no unsaved edits, which the next point guarantees.
- `apply()`: after `const ok = await App.saveNow()`, add `if (App.dirty()) { App.flash('The update was not applied: you changed something while it was saving. Press Update now again.', 'info'); return false; }` (`'info'`, not `'error'`: the save itself worked, and `'error'` would prefix "Not saved: "). Apply this check whenever a season is open (not only `App.master`), because the dirty-at-handoff case is exactly "edited during the update's own save". With R11 landed, `App.dirty()` after `saveNow` resolves is the right test (saveNow marks saved only on success with an unchanged counter).

- [ ] **Step 1: Failing tests.**
  - J `an update while a remerge is pending: after the reload the next save still brings in B`: the remerge must still be pending at the reload while the file is clean, otherwise `apply` saves first and that save does the remerge (Test A covers it). To get there, make Y a **held** edit (Roster tab, inside `beforePatch`); after save 1 `remerge` is true; then press Discard on the draft bar (`#btnDraftDiscard`, session opened with `acceptConfirm: true`): `discardDraft` puts `dirty` back to its value at the draft's start (false, `app-season.js:60`) while `remerge` stays true. Then offer an update the way the existing test does (`:279-281`), `#updateNow`, wait for the reload; mark Z; save. Assert head has B, X, Z and a `GET alt=media` came before the last PATCH. Expected today: FAIL (B missing).
  - K `an edit made during the update's own save stops the update`: unsaved X; offer an update; `d.beforePatch = async () => mark(... Y ...)`; `#updateNow`. Assert no navigation within 3 s (`p.url()` has no `?updated=`), the flash text matches `/changed something while it was saving/`, `App.dirty() === true`. Expected today: FAIL (it reloads; Y rides along in the handoff and the base wrongly contains it).
- [ ] **Step 2: Implement.** Bump `app-update.js` to `1.5.2`; `app-drive.js` again only if Task 2's bump is already committed in an earlier release (otherwise one bump covers both tasks).
- [ ] **Step 3: Run** the drive test and `update-autosave-browser.test.js` (its `if the carried session cannot be put back...` and the update tests must stay green) and `service-worker-browser.test.js` (update path). Expected: PASS.
- [ ] **Step 4: Commit.**

### Task 4: Wrap-up (inside the Wave 2b release)

**Files:** `dev/app/index.html` (once per release), `CHANGELOG.md`, `README.md`, `BACKLOG.md`, `GOOGLE-DRIVE.md` (only if it quotes the old merge message or describes `c.rev`).

- [ ] **Step 1:** If this item ships alone, bump `app-version` (next after the latest in CHANGELOG "Next release"; Wave 2 planned `1.51.08` for 2b) and `app-build` (the day). If it ships with R11/R10, the 2b wrap-up does it once.
- [ ] **Step 2:** `grep -n "merges again\|next save merges" -r dev/app docs GOOGLE-DRIVE.md README.md` and update any text that quotes the old message.
- [ ] **Step 3:** `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh` from the repo root. Expected: no failures beyond the known baseline.
- [ ] **Step 4:** `sh make-deploy.sh` runs clean (no STOP). Do not rsync to production.
- [ ] **Step 5:** CHANGELOG "Next release": one line ("A Drive save that merged in another leader's changes while you kept editing no longer drops their changes on your next save; an automatic save no longer pops up an alert when nothing clashed; Update now waits if you edited during its save"). README Drive paragraph (line 17): add "a save edited over keeps the sent text as the merge base (`remerge`)". BACKLOG R7: "FIXED in dev <date> (`drive-inplace-browser.test.js`), not deployed".
- [ ] **Step 6: Commit** and report.

## By hand (Mike, two real accounts or two browsers)
1. Two phones (or a phone and a laptop) on the same Drive file, in place. Phone B marks a child present and saves. Laptop A marks a different child, presses Save, and while "Saving" is still showing (slow network helps: Chrome DevTools "Slow 3G") ticks a third child. Expected: a short note (no alert unless something clashed); the third child stays on screen. A presses Save again: B's mark appears on A's screen and in Drive's newest version. Check Drive's version history: the newest version holds all three.
2. Same with auto-save on (1 minute) and no button presses. Expected: no pop-up on either device.
The timing cannot be forced on a real phone; if it does not happen in a few tries, the automated tests are the evidence.

## Open questions for Mike
1. When the only reason to merge is your own earlier edits (nobody else saved since), and nothing clashes, should the save skip the merge screen? Default in this plan: **yes, skip it** (you already approved those changes once). With a clash it still asks.
2. An automatic save that merged and was edited over currently shows a blocking alert. Default: **a flash note instead**, alert only when something clashed and was not kept. OK?
3. Update now when you edited during its save: refuse with a note (this plan), or save a second time automatically? Refusing is simpler and never loops.

## Risks
- **R11 ordering.** If R11 lands after R7 and implements `editSeq` differently (for example reset on save), `edited()` breaks silently. Mitigation: R7 defines the contract (never reset; bumped on logged and held edits) and the R11 plan consumes it; test D pins the held case.
- **Merge-screen wording.** On a remerge with a clash the screen title says "Someone else saved this file on Google Drive", which is true (B did) but they may have seen it already. Acceptable; revisit if Mike finds it confusing.
- **Refresh failing after a merged save** (pre-existing, not fixed here): if the merged body has dates `badDates` flags, `App.openSeason` opens the date-fix dialog asynchronously, `seasonSource` is not set yet, `c.season` is not updated, `lineage()` returns null and the next save makes a **new dated file**. Rare (a merge of two valid files); note in BACKLOG as a follow-up, not part of R7.
- **History length.** Each remerge adds one "Merged" History entry (`merge3`/`DataMerge.finish`), and A's own entries for Y are not copied (merge3's documented rule). Same as any merge today.
- **Test timing.** `beforePatch` edits run while the route is held, which is deterministic; avoid `waitForTimeout` as the only sync point where `settle(p)` or a `waitForFunction` on `App.dirty()` can be used.

## Self-review
- **Spec coverage:** the bug (Tasks 1-2), the review's message claim (Task 2), the handoff path the earlier plan got wrong (Task 3), release rules (Task 4), by-hand check, open questions.
- **Names:** `App.editSeq`, `opts.seq`, `c.remerge`, `edited()` are defined once (Task 2 Interfaces) and used in Tasks 2-3.
- **No format change:** confirmed; nothing new is written to the data file.
