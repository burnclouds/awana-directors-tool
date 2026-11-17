# R11: Drive auto-save after the sign-in runs out (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An automatic save to Google Drive never opens (or tries to open) a sign-in window, never shows an alert and never downloads a file; it says quietly that it is waiting, and the next Save the leader presses signs in and saves. The file is shown as "saved" only after Drive has confirmed the save, and only if nothing was edited while the save was in flight.

**Architecture:** No data-format change. Four files: `drive.js` (`connected(marginMs)`), `app-drive.js` (`App.driveSave.go` refuses an automatic save it cannot do without asking, records why, and shows it on `#driveStatus`; `saveInPlace` uses an edit counter instead of `App.dirty()`), `app.js` (`App.download` keeps an automatic Drive failure quiet and reports what happened), `app-season.js` (`App.editSeq()`; `saveNow` marks saved only after the Drive promise resolves). `app-update.js` needs no change (see Task 4). Part of release 2b in `2026-11-13-wave2-data-safety.md` (its Task 8, which this plan replaces); R7 (Task 9 there) consumes `App.editSeq()` from here.

**Tech Stack:** Vanilla JS, Node 24 unit tests, Playwright 1.64 (Chromium) browser tests, POSIX `sh`. No new dependencies.

**Spec:** BACKLOG "Review 2026-11-12" R11; `dev/REVIEW-2026-11-12-whole-project.md` finding 7 and "do soon" 11; roadmap `2026-11-12-review-fixes-roadmap.md` (R11 outline); wave 2 plan Task 8 (the outline refined here).

## Global Constraints
- Use the Edit and Write tools to change files; scripted rewrites (`sed -i`, inline `node -e` that writes files) are blocked. Tests may run anything.
- Never open, read, list or print a real data file (`archive/`, `~/Downloads`, `~/Nextcloud`, `dev/*.json`, `dev/*.csv`, `reports/`, `research_notes/`). Tests use `dev/test-data` (invented people, ids like `7000001_Test_Kid`).
- Tests run from `dev/app`: `node test/<name>.test.js`; browser tests need `NODE_PATH=/tmp/claude-1000/shim/node_modules`. Full sweep from the repo root: `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh` (filter: `sh dev/tools/run-tests.sh drive`).
- Each changed `.js` bumps its **own** version on line 1 in the task that changes it (today: `drive.js` 1.3.1, `app-drive.js` 1.17.0, `app.js` 1.59.2, `app-season.js` 1.87.1; bump the last number). `app-version`/`app-build` in `dev/app/index.html` (lines 6 and 7, today `1.51.06` / `2026-11-13`) are bumped **once per release**, in the release wrap-up (wave 2 plan Task 10b; expected `1.51.08`). `make-deploy.sh` refuses changed files with an unbumped release.
- No data-file change: `docs/DATA-FORMAT.md`, `Season.SECTIONS`, `test/data-format-doc.test.js` and `dev/tools/make-test-data.js` are untouched. If an implementer finds they need a new `config` key, stop and ask (it would pull in all four).
- Project rule: do not deploy. End at a committed, swept dev tree; Mike says "deploy".
- Commit messages end with the two attribution lines given in the session.

## What the review and the earlier outline got right and wrong (checked against the code on 2026-11-13)
| Claim | Verdict | Evidence |
|---|---|---|
| `drive.js:47` asks for a token with no user gesture | **Holds.** | `connect()` (`drive.js:37-49`) calls `requestAccessToken({ prompt: '' })` whenever the token is missing or within 60 s of expiry; an automatic save reaches it through `App.driveSave.go` -> `saveInPlace` -> `D.head` -> `api` -> `connect`. Whether the browser blocks it, opens a window, or never calls back cannot be shown in a test (Task 6, Mike). |
| `App.download`'s catch alerts and downloads on every auto-save | **Holds.** | `app.js:68`: any rejection of `App.driveSave.go` -> `alert(...)` + `local()`, with no look at `opts.auto`. |
| `saveNow` calls `markSaved()` before the Drive promise settles | **Holds.** | `app-season.js:237`: `App.download(...)` then `markSaved()` on the same line, then `Promise.resolve(sent).then(() => resolve(true), () => resolve(true))`: resolves **true even on failure**. |
| "a cancelled merge leaves the file showing saved" | **Holds, but the download is deliberate.** | The cancel throws `e.cancelled` (`app-drive.js:119`), `App.download` downloads a copy (pinned by `drive-inplace-browser.test.js:145`, "cancelling the merge writes nothing to Drive (a copy of this file is downloaded instead...)"). Keep the copy; fix only the "saved". |
| The problem is only an *expired* token | **Too narrow.** | The same unprompted sign-in happens with **no token at all** while saving to Drive is on: (a) after **Update now** (`app-drive.js:183-187`: "The sign-in itself cannot be carried; the next save asks"), which with auto-update on by default (`app-update.js:15`, every 10 min) is the most likely real path; (b) after choosing "Google Drive: ..." in the Save menu without ever opening from Drive (`app-drive.js:230`); (c) after a 401 (`drive.js:55` drops the token). |
| The fix is only about sign-in | **Too narrow.** | An automatic save can also open Google's **folder picker** (`app-drive.js:163` `chooseDir` when no folder; `:166-168` on a 403/404) and alerts+downloads on **any** failure (offline phone at church, 5xx, "the file keeps changing"). All of these are "a file downloaded by surprise" on every interval. |
| Moving `markSaved` later is a local change in `saveNow` | **Wrong: it breaks the in-place refresh.** | `saveInPlace` decides whether to refresh the screen with the merged file by `if (!App.dirty())` (`app-drive.js:148`) and whether to alert by `App.dirty()` (`:152`). Today that works only because `saveNow` already cleared `dirty` before the upload. Once `markSaved` waits for Drive, `App.dirty()` is always true there, and every merged save would skip the refresh and alert "You changed something while it was saving". Both lines must switch to the edit counter in this item (R7 then builds on it). |
| Wave 2 Task 8: test `#autoStatus` for the waiting line | **Invisible.** | `#autoStatus` and `#driveStatus` sit inside `#fileInfoSrc`, which is `hidden` (`index.html:26`); they are only read into the (i) tooltip (`app.js:411`). A message there alone is too quiet. See Decision D2. |
| Wave 2 Task 8: make `connected()` use the 60 s margin | **Changed here.** | `connected()` (`drive.js:126`) feeds the Options card and the "Sign out" menu item; changing its meaning is unnecessary. Add an optional margin argument instead (Task 1). The automatic save needs a bigger margin than 60 s anyway: an in-place save makes 4 to 8 calls (head, read, update, revisions, maybe readRevision/update again, pin), and the token must not run out in the middle (a later call would then ask for a token). |
| Wave 2 Task 8: `runAuto` must change | **Not needed.** | `runAuto` (`app-update.js:83-88`) already only writes "Auto-saved" when `saveNow` resolves true, and `scheduleAuto` re-arms the timer either way. Once `saveNow` resolves false on failure, it is already right. |

## Decisions taken in this plan (Mike can overrule; see Open questions)
- **D1. Every automatic Drive failure is quiet,** not only sign-in: no alert, no download, no picker. The file stays unsaved (the existing dot, unsaved-edits count and bold nudge after 20 edits or 15 minutes, `app-season.js:144-165`, keep saying so), and the next interval tries again. One exception kept on purpose: an automatic in-place save that merged and **dropped** this copy's clashing changes still alerts (`app-drive.js:152`); losing an edit must be told.
- **D2. Where "waiting" is shown:** `#driveStatus` (which the Save area and the (i) tooltip already use for "Google Drive: saved 14:05") reads `Google Drive: auto-save is waiting, press Save to sign in again` (or `... could not reach Google Drive at 14:05; it will try again`), and **one** `App.flash(..., 'info')` per waiting spell (not per interval) says the same. The flash is a non-blocking banner that hides itself after 8 s (`app.js:519-522`); it is not an alert.
- **D3. A Drive save you pressed that fails** still alerts and downloads a copy (unchanged, `drive-browser.test.js:75` and the cancelled-merge test pin it), **but the file stays unsaved**: Drive does not have it, the next auto-save or Save should still send it, and `beforeunload` should still warn. `saveNow` resolves `false`, so Update now does not reload over it (`app-update.js:54` already says "The update was not applied: your changes were not saved.").
- **D4. Edits during a save:** `saveNow` records `App.editSeq()` when it takes the text. After Drive confirms, it calls `markSaved()` only if the counter has not moved; otherwise it only sets the "saved at" time (the file stays unsaved, the next save sends the newer edits).
- **D5. Auto-save sign-in margin:** an automatic save starts only if the token has at least 5 minutes left (`AUTO_MARGIN_MS = 300000` in `app-drive.js`). Pressed saves keep today's 60 s rule in `connect()`.

## Review Focus
Failure modes no single happy-path test catches; each names its test.
1. **No token at all after Update now** (the likeliest real path): auto-save must be quiet. Test 3.4.
2. **Token runs out mid-save:** the 5-minute margin means an automatic save never starts with less. Unit test 1.2 (margin) plus 3.2 (`__ttl` just under 5 min refuses).
3. **The merged in-place save still refreshes the screen** once `markSaved` moves (the `app-drive.js:148` trap). Existing test "someone else saved since this copy opened ... this screen shows both" (`drive-inplace-browser.test.js:111`) must stay green, plus 3.6.
4. **An edit made while the save is in flight** stays unsaved. Test 3.6.
5. **Another file opened while a save is in flight** is not marked saved by the old save. Test 3.7 (`setSeason` bumps the counter).
6. **No folder chosen / folder refused during an automatic save** opens no picker. Test 3.5.
7. **Offline / Google error during an automatic save:** quiet, retried. Test 3.3.
8. **Cancelled merge (pressed save):** copy still downloaded, file stays unsaved. Existing test at `:145` extended (3.8).
9. **The waiting flash does not repeat every interval** and clears after a good save. Test 3.2 counts flashes.
10. **The queue never jams:** a refused automatic save rejects at once (no `requestAccessToken` call that might never call back), so a pressed Save queued behind it runs. Test 3.2 (Save right after a refused auto-save completes).
11. **Local saves are unchanged:** "Download data file" and save-over (`single`) behave as today. Existing `save-dot-browser`, `save-style-browser`, `update-autosave-browser` stay green.

## File Structure
| File | Change | Responsibility |
|---|---|---|
| `dev/app/drive.js` | modify | `connected(marginMs = 0)`; a test clock in `env.now`. |
| `dev/app/app-drive.js` | modify | Automatic-save guard in `App.driveSave.go`; `App.driveSave.waiting()`; waiting text in `label()`; `saveInPlace` uses `opts.seq`/`App.editSeq()`. |
| `dev/app/app.js` | modify | `App.download` Drive branch: resolves `'drive'` or `'copy'`, rejects quietly for `opts.auto`. |
| `dev/app/app-season.js` | modify | `editSeq` counter and `App.editSeq()`; `saveNow` waits for the result. |
| `dev/app/test/drive.test.js` | modify | Unit tests for `connected(margin)`. |
| `dev/app/test/drive-autosave-browser.test.js` | create | The R11 browser cases (kept out of the already long `drive-inplace-browser.test.js`; it copies that file's fake Drive helpers `newDrive`, `session`, `openF`, `save`, `settle`, `mark`, `kids`). |
| `dev/app/test/drive-inplace-browser.test.js` | modify | Cancelled-merge test also asserts the file stays unsaved. |
| `CHANGELOG.md`, `README.md`, `BACKLOG.md` | modify | Release notes, new test listed, R11 "done in dev". |

---

### Task 1: `connected` with a margin (drive.js)

**Files:** Modify `dev/app/drive.js` (line 29 env, line 39, line 44, line 126); Modify `dev/app/test/drive.test.js`.

**Interfaces:**
- Produces: `d.connected(marginMs?: number): boolean` = `!!token && now() < expires - (marginMs || 0)`. With no argument it is exactly today's behaviour.
- Produces: `env.now` (tests only): `const now = env.now || Date.now;` used in `connect` (line 39 and 44) and `connected`. Nothing else changes.

- [ ] **Step 1: Failing tests** in `drive.test.js` (its `fake()` helper, line 10; give `env.now` a variable clock and the fake token `expires_in: 3600`):
  - `connected with a margin is false once less than the margin is left`: sign in by a `d.save(...)` at clock `t0`; assert `d.connected()` and `d.connected(300000)`; set clock to `t0 + 3600000 - 299000`; assert `d.connected() === true` and `d.connected(300000) === false`; set clock past expiry; assert `d.connected() === false`.
  - `connect uses the test clock`: at `t0 + 3600000 - 59000` a `d.head('F')` asks for a new token (count `requestAccessToken` calls in the fake: 2).
  Run: `cd dev/app && node test/drive.test.js`. Expected: FAIL (no margin argument; `env.now` ignored).
- [ ] **Step 2: Implement** as in Interfaces.
- [ ] **Step 3: Run** `node test/drive.test.js`. Expected: all pass, including the existing 401 test (`:68`).
- [ ] **Step 4: Commit** (`drive.js` 1.3.1 -> 1.3.2).

### Task 2: The edit counter, and "saved" only after Drive confirms (app-season.js, app.js)

**Files:** Modify `dev/app/app-season.js` (lines 26, 106, 163, 167, 225-242), `dev/app/app.js` (line 68).

**Interfaces:**
- Produces: `App.editSeq(): number`. A module counter `seq` in `app-season.js`, incremented in `markEdit` (line 163), in `touchSeason`'s draft branch where it sets `dirty = true` (line 106; the only other place `dirty` becomes true), and in `setSeason` (line 26: replacing the open file counts, so a save started on the old file cannot mark the new one saved). Never reset.
- Produces: `App.download(name, text, type, opts)` Drive branch (line 68) returns a promise that
  - resolves `'drive'` when `App.driveSave.go` resolves;
  - when `opts.auto` and it rejects: no alert, no `local()`; rejects with the same error (`err.auto = true`). Only `saveNow` passes `auto`, so no other caller sees a rejection;
  - otherwise (a save you pressed, slides, CSV, the before-restore backup at `app-season.js:1181`): today's alert and `local()`, then resolves `'copy'`.
  Non-Drive branches are unchanged (`saveOver` for `single`, else `local()` returning `undefined`).
- Produces: `saveNow` (Drive or dated-local branch, line 237) becomes: take `text = Season.toJson(season)` and `s = seq`; `await App.download(name, text, 'application/json', driveOn ? { auto, seq: s } : { local: true })` in a try/catch; then
  - result `'drive'` or `undefined` (a local download started): `if (seq === s) markSaved(); else savedAt = new Date();` then `status(); App.updateStatus(); resolve(true)`;
  - result `'copy'` or a rejection: leave `dirty` as it is, `status(); App.updateStatus(); resolve(false)`.
  The `single` branch (lines 238-240) is unchanged.
- Consumes: nothing new.

- [ ] **Step 1: Failing test** (this task's own, in the new `drive-autosave-browser.test.js`, which Task 3 extends; create the file now with the helpers copied from `drive-inplace-browser.test.js:10-79` and its `fresh`/`prep`/`inplace` from `:82-84`):
  - `the file is not shown as saved until Drive has confirmed the save`: add `d.delayPatchMs` to the copied fake (in the route's PATCH branch, `if (d.delayPatchMs) await new Promise(r => setTimeout(r, d.delayPatchMs));` before fulfilling; the existing `beforePatch` hook is synchronous and cannot hold the request). Open F1, mark one TEST child present, set `d.delayPatchMs = 1500`, press Save (`save(p)`); at 300 ms assert `App.dirty() === true`; after `settle(p)` assert `App.dirty() === false`.
  Run: `cd dev/app && NODE_PATH=/tmp/claude-1000/shim/node_modules node test/drive-autosave-browser.test.js`. Expected: FAIL (dirty is false at 300 ms today).
- [ ] **Step 2: Implement** `seq`/`App.editSeq`, the `App.download` results and `saveNow` as in Interfaces.
- [ ] **Step 3: Implement the knock-on in `app-drive.js` `saveInPlace`** (this is required, not optional; see the table): at the top, `const seq0 = opts && opts.seq !== undefined ? opts.seq : App.editSeq();` and `const editedSince = () => App.editSeq() !== seq0;`. Line 148 `if (!App.dirty())` -> `if (!editedSince())`; line 152 `App.dirty()` -> `editedSince()`. In the refresh branch `App.openSeason(body)` calls `setSeason`, which bumps the counter and leaves the file clean; `saveNow` then sees `seq !== s` and only sets the time: that is correct (the screen is the saved file and not dirty). Optional polish: after the refresh call `App.rebase()` is not needed (setSeason rebases).
- [ ] **Step 4: Run** the new file, then `drive-inplace-browser`, `drive-browser`, `save-dot-browser`, `save-style-browser`, `update-autosave-browser`, `merge-files-browser`:
  `for t in drive-autosave-browser drive-inplace-browser drive-browser save-dot-browser save-style-browser update-autosave-browser merge-files-browser; do NODE_PATH=/tmp/claude-1000/shim/node_modules node test/$t.test.js || break; done`. Expected: PASS. Watch especially `drive-inplace-browser` `:111` (merge then refresh shows both) and `:277` (Update now with Drive saving: `App.dirty() === false` after the reload).
- [ ] **Step 5: Commit** (`app-season.js` 1.87.1 -> 1.87.2, `app.js` 1.59.2 -> 1.59.3, `app-drive.js` 1.17.0 -> 1.17.1).

### Task 3: An automatic save that cannot proceed without asking stays quiet (app-drive.js)

**Files:** Modify `dev/app/app-drive.js` (lines 20, 28-35 `label`, 158-178 `App.driveSave`), `dev/app/test/drive-autosave-browser.test.js`, `dev/app/test/drive-inplace-browser.test.js` (line 145).

**Interfaces:**
- Produces: in `App.driveSave.go`, inside the queued function and before anything else, when `opts && opts.auto`:
  - `if (!D.connected(AUTO_MARGIN_MS))` -> `wait('signin')` and throw `Object.assign(new Error('sign-in needed'), { auto: true, signin: true })`. **No** `D.*` call is made, so `requestAccessToken` is never reached.
  - before `chooseDir` (line 163) and in the 403/404 branch (line 166-168): with `auto`, `wait('folder')` and throw instead of opening the picker.
  - any other rejection of an automatic save (network, 5xx, 401, "keeps changing"): caught at the end of `go`, `wait('error', err.message)`, rethrown.
  - on any successful Drive save (`st.last = 'saved ' + hhmm()`, lines 143 and 171): `st.wait = null`.
- Produces: `st.wait: null | { kind: 'signin'|'folder'|'error', at: 'hh:mm', told: boolean }` and `App.driveSave.waiting(): null | { kind, at }` (read-only, for tests and Options).
- Produces: `label()` (line 32): when `st.save && st.wait`, `#driveStatus` text is
  - signin: `Google Drive: auto-save is waiting. Press Save to sign in to Google again.`
  - folder: `Google Drive: auto-save is waiting for a folder. Press Save to choose one.`
  - error: `Google Drive: auto-save could not save at <at> (<message>). It will try again.`
- Produces: `wait(kind, msg)` sets `st.wait`, calls `label()`, and calls `App.flash(<the same sentence without "Google Drive: ">, 'info')` only when there was no `st.wait` of the same kind before (once per waiting spell).
- Unchanged on purpose: a save you pressed (no `auto`) signs in, opens the picker, alerts and downloads exactly as today.

- [ ] **Step 1: Teach the fake sign-in about the clock and blocked windows** (in the new test file's `GSI` string, from `drive-inplace-browser.test.js:20`): count calls in `window.__tokenAsks`; give `expires_in: window.__ttl || 3600`; when `window.__strictPopup` is true and `!navigator.userActivation.isActive`, call `o.error_callback({ type: 'popup_failed_to_open' })` instead (what a real browser does to a window opened without a click; Chromium supports `navigator.userActivation`). Use Playwright's `p.click('#btnSeasonSave')` (a trusted click) where a test means "the leader pressed Save"; `p.evaluate(() => btn.click())` is not a user gesture.
- [ ] **Step 2: Failing tests** in `drive-autosave-browser.test.js`. Common setup: `prep(fresh())`, `inplace(p)`, `window.__strictPopup = true`, auto-save on (`App.autosave.set(true, 0.02)`, about 1.2 s), and `seen` from `session` (dialogs, downloads). Each asserts `seen.errors` is empty.
  - 3.1 `an automatic save with a good sign-in saves to Drive and marks the file saved`: mark, wait for one PATCH; `App.dirty() === false`; `#autoStatus` matches `/Auto-saved \d\d:\d\d/`; `App.driveSave.waiting() === null`.
  - 3.2 `an automatic save after the sign-in ran out asks nothing, downloads nothing, and waits; the next Save you press signs in and saves`: open with `window.__ttl = 299` (under the 5-minute margin from the start), mark, wait 3 s (two intervals). Assert: `seen.dialogs.length === 0`; `seen.downloads === 0`; `window.__tokenAsks` unchanged since the open; no new `PATCH`/`GET` in `d.calls` after the open; `App.dirty() === true`; `App.driveSave.waiting().kind === 'signin'`; `#driveStatus` matches `/auto-save is waiting\. Press Save to sign in/`; the flash was shown **once** (count `#flash` text changes with a `MutationObserver` installed before the mark: exactly 1 matching `/auto-save is waiting/`). Then `window.__ttl = 3600; await p.click('#btnSeasonSave')`: one `PATCH`, `window.__tokenAsks` +1, `App.dirty() === false`, `App.driveSave.waiting() === null`, `#driveStatus` matches `/saved \d\d:\d\d/`.
  - 3.3 `an automatic save that cannot reach Drive is quiet and tries again`: route Drive calls to `r.abort()` for one interval (a flag in the fake), mark, wait 1.5 s: no dialog, no download, `waiting().kind === 'error'`, still dirty; clear the flag, wait 1.5 s: one `PATCH`, clean, `waiting() === null`.
  - 3.4 `after Update now (no sign-in carried), an automatic save asks nothing`: open the TEST data file from the computer (`#splashFiles`, `dev/test-data` json), then `App.driveHandoff.set({ save: true, cur: { id: 'F1', name: DATA, rev: 'R1' } })` (what `restore()` in `app-update.js` does), `App.driveStyle.set('inplace')`, auto-save on, mark, wait 3 s: `__tokenAsks === 0`, no dialog, no download, no Drive call, `waiting().kind === 'signin'`. Then `p.click('#btnSeasonSave')`: Drive F1 holds the mark, clean.
  - 3.5 `an automatic dated save with no folder opens no picker`: open the TEST file from the computer, choose "Google Drive: a new dated file each time" by `App.driveDo.setSave(true); App.driveStyle.set('dated')`, give a token by one pressed Save that is cancelled at the picker (`window.__folder = null`; that pressed save alerts and downloads a copy as today, so take the dialog and download counts **after** it), then auto-save on, mark, wait 3 s: the picker was not built again (count `window.__dlgOpenAtPick.length` unchanged), no dialog, no download, `waiting().kind === 'folder'`.
  - 3.6 `an edit made while a Drive save is in flight is still unsaved afterwards, and the next save sends it`: `d.delayPatchMs = 1500`, mark kid 0, press Save, at 300 ms mark kid 1, `settle(p)`: `App.dirty() === true`; Drive's head text has kid 0's mark and **not** kid 1's; press Save again: Drive has both, clean.
  - 3.7 `opening another file while a save is in flight does not mark the new file saved`: `d.delayPatchMs = 1500`, mark, press Save, at 300 ms open the TEST data file from the computer and mark something in it; after the PATCH lands `App.dirty() === true`.
  Run the file. Expected today: 3.2 to 3.7 FAIL (alerts, downloads, token asks, wrong `dirty`); 3.1 passes.
- [ ] **Step 3: Extend the cancelled-merge test** (`drive-inplace-browser.test.js:145`): add `assert.strictEqual(await p.evaluate(() => App.dirty()), true, 'Drive does not have it, so the file is still unsaved')` and `seen.downloads === 1` (the copy). Expected: FAIL on `dirty` before Task 2, PASS after.
- [ ] **Step 4: Implement** as in Interfaces (`const AUTO_MARGIN_MS = 300000;` next to `st`).
- [ ] **Step 5: Run** the Task 2 Step 4 loop again plus `node test/drive.test.js`. Expected: PASS.
- [ ] **Step 6: Commit.** `app-drive.js` was already bumped in Task 2 within the same release; one bump per file per release is enough (`make-deploy.sh` compares with `deploy/`, not with the last commit), so bump it again only if Task 2 has been released since.

### Task 4: Check `runAuto` and Options need nothing (no code expected)

- [ ] **Step 1:** Read `app-update.js:83-92` and confirm: `runAuto` writes "Auto-saved" only when `saveNow` resolves true and `scheduleAuto` re-arms regardless. Confirm with test 3.2 (no "Auto-saved" text change during waiting; it still says the last real time).
- [ ] **Step 2:** Options' Drive card (`App.driveInfo().connected`, `app-drive.js:180`) still uses `D.connected()` with no margin: no change. If Mike wants the card to show the waiting state too (Open question 3), add `waiting: App.driveSave.waiting()` to `driveInfo` and a line on the card, with its own test; otherwise nothing.

### Task 5: Release wrap-up (inside wave 2 release 2b, Task 10b there)
- [ ] **Step 1:** File versions bumped (Tasks 1 to 3); `app-version`/`app-build` in `dev/app/index.html` once for release 2b.
- [ ] **Step 2:** `NODE_PATH=/tmp/claude-1000/shim/node_modules sh dev/tools/run-tests.sh`. Expected: no failures.
- [ ] **Step 3:** `sh make-deploy.sh` runs clean (no STOP). Do not rsync to production.
- [ ] **Step 4:** CHANGELOG "Next release": "**Fix: an automatic save to Google Drive no longer pops up, alerts or downloads a file when it cannot save** (R11). After the Google sign-in runs out (about an hour), after an app update, offline, or with no folder chosen, auto-save now waits quietly (Google Drive: auto-save is waiting...) and tries again; the next Save you press signs in. The file is shown as saved only after Drive confirms it, and an edit made during a save stays unsaved. A Drive save you press that fails still downloads a copy, but the file now stays unsaved because Drive does not have it." README: list `drive-autosave-browser.test.js`. BACKLOG R11: "FIXED in dev <date>, not deployed; needs Mike's real-browser check (Task 6)".
- [ ] **Step 5: Commit.**

### Task 6 (Mike, by hand, real Google account; cannot be automated)
1. **Laptop, Chrome:** open the club file from Drive, Options: auto-save on, 5 minutes. Leave it 70 minutes, make an edit, wait one interval. Expected: no window, no alert, no download; the banner and the (i) say auto-save is waiting. Press Save: Google's window (or a silent sign-in) appears straight from the click; the file saves; the dot clears.
2. **Phone (iPhone Safari and/or Android Chrome, whichever leaders use):** the same, and especially that **pressing Save** after the wait does get a sign-in window (Safari is stricter about windows opened after awaited work: in a pressed save the token request comes after `guardedSave`, the queue and `D.head`'s script load). If Safari blocks it, that is a new item (sign in first on the click, then save), not a reason to undo R11.
3. **After Update now** with Drive saving on and auto-save on: no window and no download at the next interval; Save signs in.

## Open questions for Mike
1. **D3:** after a Drive save you pressed fails and a copy is downloaded, should the file stay "unsaved" (recommended: Drive does not have it, auto-save will keep trying, closing the tab warns) or show "saved" as today?
2. **D2:** is one banner per waiting spell right, or should it repeat (say every 15 minutes) while edits pile up? The bold "unsaved" nudge after 20 edits or 15 minutes already exists.
3. Should the Options Drive card also say "Auto-save is waiting for you to sign in" (Task 4 Step 2)?
4. Should auto-save simply stop trying after the first sign-in failure until a pressed save (fewer wasted timers), or keep its schedule (recommended: it costs nothing, since a refused try makes no network call)?

## Risks
- **Real-browser behaviour is untestable here:** the tests model a blocked window with `navigator.userActivation`; real Google sign-in may behave differently (Task 6).
- **Behaviour change for pressed saves (D3):** leaders who press Save, see the "downloaded instead" alert and then close the tab now get the browser's "leave site?" question. Intended, but mention it in the release note.
- **The `app-drive.js:148` trap:** if Task 2 Step 3 is skipped, every merged save alerts and the screen never refreshes. Review Focus 3 covers it.
- **R7 depends on this:** wave 2 Task 9 replaces the same line 148 branch; do R11 first and let R7 consume `App.editSeq()` and `opts.seq` (its own snapshot should use the text the save sent).
- **A silent failure can last a long time** (D1): the only signs are the unsaved dot/count, the nudge and one banner. Mitigated by the nudge; Mike may want more (Open question 2).
