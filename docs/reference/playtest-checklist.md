# Playtest checklist (settings in the file, local save, service worker)

Covers the work on branch `settings-in-file`: commits `f845f7f` (settings in the file), `c5d049e` (local Save as), `d03d762` (Options save-style choice), `93114d4` and `a70ccf3` (service worker and update bar). Not deployed to production.

## 1. Deploy to playtest

1. In `database/`: `sh make-deploy.sh`. It refuses if a changed script kept its version number. Read its output: it lists the files in `deploy/`.
2. Copy `deploy/` to the playtest path on the site, the same way production is copied, but under `playtest/` instead of the site root. Do not copy to the site root yet.
3. Open `https://<site>/playtest/app/` on a desktop browser and check that the app loads with no error on the page.

## 2. Desktop Chrome (about 15 minutes)

**Settings follow the file**
- [ ] Open the test data file (`dev/test-data/*.json`, or a real file copy). Options: change the club title, the Drive save style and the local save style.
- [ ] Save the file. Open it again in a private window. The title and the choices are the same (they came from the file, not the browser).
- [ ] Storage check (DevTools > Application > Local storage): no `awana.settings`, no `awana-drive-style`, no `awana-updates`, no `awana-autosave`.

**Local save (Chrome and Edge only)**
- [ ] With the local style set to **One file**, press Save. A Save as box appears. Save as `awana-test.json`. The file is written.
- [ ] Change something and save again. No box appears; the same file is written (check its modified time on disk).
- [ ] Press Save, then **Cancel** in the Save as box. The app should still say unsaved changes, and nothing is lost.
- [ ] Open a file from disk, make a change, save. The Save as box suggests the opened file's name (no timestamp).
- [ ] Set the local style to **A new dated file**. Save twice. Two timestamped files are downloaded.
- [ ] In Firefox or Safari (if available): Save downloads a file, with no Save as box. Nothing breaks.

**Drive folders**
- [ ] With Drive set up and a file open: choose the club folder and the slides folder. Close the file and reopen it: the folders are the same (from the file).
- [ ] Open from Drive with no file open: the picker starts at Drive, not at a remembered folder.

**Service worker and update bar**
- [ ] Load the playtest app once while online. In DevTools > Application > Service workers: one worker is active.
- [ ] Turn the network off (DevTools > Network > Offline), reload. The app opens. Turn it back on.
- [ ] Deploy a second release (any version bump in `dev/app`, then `make-deploy.sh` and copy). Reload the playtest page while a data file is open. The update bar appears.
- [ ] Press **Later**. Keep working: nothing changes under you. Reopen the app in a new tab: the new release is used.
- [ ] Press **Update now** with unsaved changes. The file is saved first (Save as box if local single), then the page reloads on the new release.
- [ ] Make an edit, leave it unsaved, press Update now, then Cancel the Save as box. The update must not happen.

## 3. Phone (a Pixel 4 or similar, Chrome for Android)

- [ ] Open the playtest app, open a data file, enter a sign-off for one child, go to Options. The Save-style choice is readable and tappable (at least 44 px).
- [ ] Press Save. No Save as box appears (phones download). The file downloads under the opened file's name, or `awana-<year>.json` for a new file.
- [ ] Turn on airplane mode, close the browser tab, reopen the playtest address. The app opens (offline start after one online visit).
- [ ] Update bar: same as desktop. Update now saves first, then reloads.

### Phone: R12 (touch sizes and the Save bar; no script can do this, use your own phone with the TEST club from Try it out)
- [ ] Attendance for one class: tick ten children with a thumb. Any mis-tap on a name, a tick or Move?
- [ ] To do: type a handbook code, pick a color, tick "read". Does an iPhone zoom when a box is tapped?
- [ ] Uniforms: tap a date box, Today and "no date". Are the date boxes the size the phone draws them (iOS and Android draw date inputs their own way)?
- [ ] Make one edit: does the top bar say "1 unsaved edit" next to Download, readably? Make 20: does the Save bar appear, does it hide anything you need, does Save now save, does Later behave?
- [ ] Turn the phone sideways on Attendance and on a Progress sheet with the bar showing.
- [ ] On club night: was the bar a help or a nuisance during check-in?

## 4. Things to watch for

- The update bar text says "ready" when the version check has not seen a number. That is expected.
- Chrome and Edge only: the Save as box and overwrite. Other browsers download every save.
- An old copy of the app (before this change) that opens a newer file drops the new settings keys when it saves. Expected; it is noted in the changelog.

## 5. When playtest passes

Tell me. Production deploy is only on your say-so, using the same copy step, to the site root.
