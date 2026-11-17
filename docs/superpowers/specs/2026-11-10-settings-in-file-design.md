# Settings live in the data file

Status: draft for Mike's review, 2026-11-10. Nothing built. This is plan item 1 in `BACKLOG.md`, and it lands before the service worker (`2026-11-10-service-worker-design.md`).

## Why

The data file is shared. Several volunteers open the same file, and today some of its settings live only in one person's browser. The result, seen 2026-11-06: another volunteer's Drive saves came out as timestamped files instead of `mike_working_file.json`, because the save style was a per-browser setting.

Principle (Mike, 2026-11-06): **nothing "saved" is kept outside the current data file.** Defaults live in the file and in code (`Catalog.defaultConfig()`). A new file gets the defaults. An old file missing a key gets the default on open. **The browser never overrides the file.** Settings follow the file to every browser that opens it, and that is intended.

## What is stored today

From the code (`dev/app/app.js`, `app-drive.js`, `app-update.js`, `app-trail.js`, `app-todo.js`, `app-season.js`):

| Setting | Where it lives now | Key |
|---|---|---|
| Quarter | `awana.settings` (browser) | `quarter` |
| Quarter override (a hand choice, lapses after 7 days) | `awana.settings` (browser) | `quarterOverride` |
| Meeting dates string | `awana.settings` (browser) | `dates` |
| Club title (typed) | `awana.settings` (browser) | `club`, `clubCustom` |
| Motto | `awana.settings` (browser) | `motto` |
| Save style (Drive) | browser | `awana-drive-style` (`dated` or `inplace`) |
| Keep Drive file name | browser | `awana-drive-keepname` |
| Drive folders | browser **and** file | `awana-drive-dirs` and `config.driveDirs` |
| Drive pin days | file | `config.drivePinDays` (already in file) |
| Update check on/off and minutes | browser | `awana-updates` |
| Auto-save on/off and minutes | browser | `awana-autosave` |
| To do view (person or task) | browser | `awana-todo-view` |
| Attendance "hold" box | browser | `awana-att-hold` |
| Recent places folded | browser | `awana-trail-fold` |

Stays outside the file, as decided: Drive sign-in tokens, the update-reload `sessionStorage` handoff (removed as read), the service-worker cache (code, not data).

## Target

### Settings that move into the file config

Each lives in `config` with a default in `Catalog.defaultConfig()`:

| Config key | Default | Notes |
|---|---|---|
| `config.saveStyleDrive` | `inplace` | `inplace` = keep one Drive file up to date; `dated` = a new dated Drive file per save. Mike's 11-06 decision: one file is the Drive default. |
| `config.saveStyleLocal` | `single` | `single` = one file, saved over where the browser allows; `dated` = a new file each time. Always offers "Save as…". |
| `config.driveKeepName` | *(unset: keep the Drive file's name)* | Moved from the browser (decision 3). Written only when set. |
| `config.clubTitle` | *(unset: derived)* | Only written when someone types a title. Otherwise derived from the season year ("AWANA Club 26-27"). |
| `config.autoUpdate` | `{ on: true, minutes: 10 }` | Update check. Shape is the existing one. |
| `config.autoSave` | `{ on: false, minutes: 5 }` | Auto-save. Shape is the existing one. |

The timer and save-style keys are always written, so the file says which settings it uses (decided 2026-11-10, matching the code). `driveKeepName` and `clubTitle` are removed when cleared, since they only exist when set.

### Settings removed

- `quarter`: derived from the calendar (`Calendar.currentQuarter`) every time. With no calendar, it falls back to Q1 for the session.
- `dates`: only a fallback for reports when no calendar is loaded. The calendar is already in the file. Remove the fallback (`reports.js:45`) and the Options field.
- `motto`: nothing reads it except its input boxes. Remove it and the Options field.
- `awana.settings` (the whole key): goes away.

### Settings that become session-only (not stored anywhere)

- **Quarter override:** a hand choice from Reports or Color teams. Kept in memory only; it is not written to the file or the browser. The 7-day lapse stays (changed during implementation): a tab can stay open for days, and the lapse stops a stale choice from holding the app in an old quarter.
- **To do view, Attendance hold, Recent places folded:** each visit starts at the default. No persistence.

### Stays in the browser

- Drive sign-in and the update-reload handoff, as above.
- The Recent places list itself is already not stored (it lives only in memory and in the reload handoff).

## Rules

1. **The file wins.** When a file is open, every setting comes from its config. The browser is never consulted for them.
2. **Before a file is open,** the code defaults apply. The update check runs 15 seconds after page load, which can be before anyone opens a file, so it uses the code defaults until a file opens. When a file opens, the update and auto-save timers are reset to the file's values (the existing `schedule()` and `scheduleAuto()` already run on change).
3. **Setting a value to its default** keeps the key (see Target); clearing the club title or the Drive file name removes that key.
4. **Changes are recorded in History**, one line each, so a shared file shows who changed the save style or the club title (e.g. "Setting · save style changed to dated"). Quarter and session-only settings are not recorded.
5. **Undo covers settings changes**, as it does for other edits.

## Compatibility and upgrade path

- **Format:** adding config keys is additive. The data-file format version does not change.
- **Older files** open unchanged; missing keys take the defaults.
- **Older app copies** that open a newer file ignore the new keys and drop them on save. This is the same behaviour as the other additions (`held`, `flags`), and CHANGELOG says so for each. The 1.50.x release notes will state it.
- **Browser values are not carried over automatically.** A leader's typed club title, or a Drive save style set only in their browser, does not move into the file on first open. Reason: the browser must never override the file, and a one-time import could overwrite a shared file's choice. The club title is auto-derived in most cases; the save style defaults to the Drive default. See open question 2.

## Local save (from the 11-06 decision)

- The download is named after the opened file, with no timestamp.
- Every local save offers "Save as…".
- In Chrome and Edge, a local save overwrites the opened file in place through the File System Access API. Other browsers fall back to a fresh download.
- The save style for local files is `config.saveStyleLocal` (above).

## Affected code

- `dev/app/app.js`: remove `awana.settings`, `DEFAULTS` `quarter`/`dates`/`motto`, `saveSettings`, the 7-day override; move club title and quarter logic.
- `dev/app/app-drive.js`: `awana-drive-style` and `awana-drive-keepname` read from `config`; `awana-drive-dirs` read from `config.driveDirs` only.
- `dev/app/app-update.js`: `awana-updates` and `awana-autosave` replaced by reading the open file's config; reset timers on file open.
- `dev/app/app-todo.js`, `app-season.js`, `app-trail.js`: session-only (no `localStorage`).
- `dev/app/app-options.js`: the Club title and Motto fields, and the save-style and update/auto-save controls, read and write the file config. Motto field removed.
- `dev/app/catalog.js`: `defaultConfig()` gains the new keys.
- `dev/app/reports.js`: remove the `dates` fallback.
- `dev/app/info.js`: (i) notes and the manual, for every changed control. Run `node dev/tools/sync-guide.js`.
- `dev/app/app-tools.js`: the Debug tab's list of `awana` keys in storage should show the remaining browser keys only.

## Tests

Existing tests that will need updating: `drive-inplace-browser`, `update-autosave-browser`, `deploy-stamp` (unaffected), and any test that reads `awana.settings` or sets `quarter`/`dates`/`motto`. New:

1. A new file has the defaults in `config` and nothing else.
2. An old file with none of the keys opens and gets the defaults; the file is not rewritten until something changes.
3. Two browsers: a save style set in one, saved, is the style the other browser uses on open.
4. Clearing the club title or the Drive file name removes its key; the timer and save-style keys are always present.
5. Each settings change adds one History line; undo restores the previous value.
6. Quarter follows the calendar; a hand override holds for the page session and is gone after reload.
7. No `awana.settings` key is written, and the Debug tab's storage list shows only the remaining browser keys.
8. Club title: typed value kept; cleared value falls back to the derived title.
9. Update and auto-save timers use the file's values after a file opens, and the code defaults before.
10. Local save: Save as works; overwrite works in Chromium (a browser test with the File System Access API stubbed), download fallback otherwise.

Manual, on a phone, against `playtest/` before production: open a file on one device, change the save style, open it on a second device, confirm the second device uses it.

## Decisions (Mike, 2026-11-10)

1. **Drive folders:** the file's `config.driveDirs` is the source. The browser's `awana-drive-dirs` copy is removed. Only if a folder cannot be reached does the app ask the user to choose it again; otherwise there is no prompt.
2. **Carry-over:** nothing is copied from a browser into a file. Browser-only values are simply dropped.
3. **Keep Drive file name:** moves into the file, like the save style.
4. **Save-style values:** keep `inplace`, `dated` and `single` as the stored values. Leaders see plainer labels (for example "one file" and "a new dated file").

## Plan of record

1. Mike answers the open questions (or accepts the proposals).
2. Implement, with the tests above, in the usual version and commit steps.
3. Deploy to `playtest/` and check on two phones, then production when Mike says.
4. Then the service worker spec.
