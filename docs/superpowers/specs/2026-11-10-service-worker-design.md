# Service worker: offline shell and safe updates

Status: draft for Mike's review, 2026-11-10. Nothing built. Depends on the "everything saved lives in the file" work (plan item 1 in `BACKLOG.md`) only where noted under Dependencies.

## Why

The app is a set of separate JavaScript and CSS files served from a static site. Leaders use it at church, sometimes on poor Wi-Fi. Two problems follow:

1. **Partial loads.** If one script fails to load (a network hiccup), the app can start half-working. The 11-05 review flagged this.
2. **Offline use.** A leader who loses signal mid-night cannot reopen the app at all.

A service worker (SW) can fix both by caching the app's code. It also adds a risk the app does not have today: a cached copy of old code can outlive a deploy. A leader could keep running an old version with no prompt. The design below is built around that risk.

## What already exists (and must keep working)

These come from `dev/app/app-update.js` and `make-deploy.sh`:

- **Update check.** Every 10 minutes by default (a browser setting), and 15 seconds after load, the page fetches `index.html` with `cache: 'no-store'` and compares its `app-version` and `app-build` meta tags with the running copy. A newer one shows the update bar.
- **Cache-busting by version.** `make-deploy.sh` stamps every script and stylesheet in the published `index.html` as `file.js?v=<version>`, so a new release is fetched fresh.
- **Update now.** Saves the open file if it is dirty, stores the session in `sessionStorage` for the reload only, reloads with `?updated=<version>`, and restores the session on the new page.
- **Auto-save**, a separate timer, unchanged by this work.

The SW must not break any of these. In particular, the update check must always see the server's real `index.html`, not a cached one.

## Goals

- The app shell (HTML, CSS, scripts, fonts, icon, the try-it-out sample files) loads with no network, after one successful online visit.
- A partial or failed script load never leaves the app half-running. Either the whole release loads or the previous whole release does.
- A new release is never silently mixed with an old one.
- A bad release can be rolled back by the site owner without a leader doing anything.
- Data and sign-in never go through the cache.

## Non-goals

- Offline editing of Google Drive files. Drive sync still needs the network; the app says so.
- Background sync or push notifications.
- Caching anything from Google (the Drive and sign-in scripts are third-party and stay network-only).
- Changing the data file format.

## Design

### 1. Scope and caching strategy

| Request | Strategy |
|---|---|
| `app/index.html` (and `index.html` at the site root) | **Network only.** Never cached, so the update check and first load always see the latest. Offline fallback: the cached shell page. |
| `app/*.js`, `app/*.css`, fonts, icon, `app/try/*` | **Cache, one versioned cache per release.** Served from cache; the cache is filled from the network on first use. |
| Anything cross-origin (Google APIs, sign-in, Drive) | **Not intercepted.** The SW does not respond to them at all. |
| Data files (JSON or CSV the leader opens or saves) | Never cached. They are local files, not requests. |

Requests carrying `?v=` are matched without the query string for the fallback, but the cache key keeps it, so each release has its own entries.

### 2. Versioned caches, one release at a time

- `make-deploy.sh` writes a constant into `sw.js`: `const RELEASE = '<app-version>+<app-build>'`. The cache name is `awana-shell-<RELEASE>`.
- On install, the new SW downloads every shell file **into the new cache**. Only when all of them succeed does the install finish. If any file fails, the install fails and the old SW keeps serving the old, complete release. This is the fix for partial loads.
- Old caches are deleted only after the new SW activates.
- A page is served entirely from one cache. The SW never mixes files from two caches for one page.

### 3. Updating: the page decides, not the SW

Default SW behaviour is to take over as soon as it installs. That would switch code under an open session. So:

- The new SW installs and **waits**. It does not call `skipWaiting()` on its own.
- The page sees the waiting worker (it already knows a new version exists from the update check) and shows the existing update bar. "Update now" posts a `SKIP_WAITING` message to the waiting worker, then reloads through the existing handoff.
- "Later" leaves the new worker waiting. It takes over on the next visit to the app: a new tab or window, or a reopened browser. An open tab keeps the code it started with until it is reloaded, so an open session is never switched under the leader.
- Auto-save and the existing "Update now" save-first rule stay as they are.

This keeps the rule the app already has: nothing changes until the leader chooses, and the leader's data is saved first.

### 4. Rollback

- Each release keeps its previous cache until the next release activates (so one prior release is always on hand).
- Rolling back = redeploy the previous release's `sw.js` with a higher version number (a SW must always be "newer" to replace the old one). The version-number rule in `make-deploy.sh` already requires a bump for any change; the rollback is a new release containing old code.
- The rollback step is written into the deploy notes, with the command, so it can be done from a phone or by someone else.

**Decided 2026-11-10:** rollback is from the terminal only. It is not offered in the app.

### 5. Data and settings

- **No data is cached.** The SW never stores anything the leader typed.
- The SW's own state (its cache) is code, not data, so it sits outside "everything saved lives in the file." This matches the 11-06 decision.
- The update and auto-save settings (currently `awana-updates`, `awana-autosave` in `localStorage`) move into the data file's config, like the other settings (plan item 1). The file is shared, so these follow it to every leader's browser. This is intended.

### 6. Failure handling

| Situation | What the leader sees |
|---|---|
| Offline, shell cached | App opens; the update check says it could not check (the existing message), nothing else changes. |
| Offline, never visited online | Browser's offline page. The app cannot start without one online visit. Stated in the README and the (i) note. |
| Install fails (a file missing or 404) | Old release keeps running. Debug tab shows the install error. Nothing is shown to the leader. |
| Cache storage full or blocked (private browsing) | The app runs without the SW, as today. No error. |
| Update waiting, leader declines | Old release keeps running until the next full visit. The update bar keeps showing. |

### 7. Where the code goes

- `dev/app/sw.js`: the worker source (not minified, small).
- `dev/app/app-sw.js`: page-side registration, update-bar hook, `SKIP_WAITING` message. Loaded like the other `app-*.js` files, with a version line.
- `make-deploy.sh`: writes `RELEASE` into `sw.js`; adds `sw.js` to the stale-version check; refuses to deploy if `sw.js`'s file list is missing a shell file.
- The file list the SW caches is generated from `deploy/app/` at deploy time, not written by hand, so a new file cannot be forgotten.

### 8. Tests

Automated (Playwright, in `dev/app/test/`, following the existing `*-browser.test.js` pattern):

1. First online visit installs the SW and caches every shell file. Count matches `deploy/app/`.
2. Reload with the network off: the app starts and the data-file open flow works.
3. A release with a missing script: install fails, old release still runs.
4. A new release while a page is open: the page keeps the old code until "Update now"; then the new code runs and the session is restored (existing `update-autosave-browser` test extended).
5. "Later" then a full visit: new code runs.
6. `index.html` is never served from cache: the update check still detects a new version while the SW is active.
7. Google requests are not intercepted (request log shows them going straight to the network).
8. Private-browsing / cache-blocked case: the app still starts.

Manual, on a real phone, before deploy:
- Install the app, turn on airplane mode, reopen, open a test file, make an edit, save.
- Deploy to `playtest/` first. Same deploy process as production, under a different path on the site (`playtest/` rather than the site root). Test on the phone there, then deploy to production.

## Dependencies

- **Plan item 1 (settings in the file):** should land first, per the 11-06 decision, so the SW does not need to know about browser settings that are about to move.
- **`make-deploy.sh`:** the version-bump and minify checks apply to `sw.js` too.

## Open questions for Mike

1. ~~Update timing~~ **Decided 2026-11-10:** a new version takes over when "Update now" is pressed or at any new visit to the app.
2. ~~First visit requirement~~ **Accepted 2026-11-10:** the app must be opened online once before it works offline.
3. ~~Update settings~~ **Decided 2026-11-10:** move into the data file's config, like the other settings.
4. ~~Rollback in the app~~ **Decided 2026-11-10:** terminal only, not in the app.
5. ~~Test hosting~~ **Decided 2026-11-10:** test releases go to `playtest/` on the site, using the same deploy process as production.

## Plan of record

1. Plan item 1 (settings in the file) lands first.
2. Implement behind the existing update bar, with the tests in section 8.
3. Deploy to `playtest/` and test on a phone.
4. Deploy to production only when Mike says, per the usual rule.
