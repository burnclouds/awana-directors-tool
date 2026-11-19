# Google Drive (optional)

The Gonkulator works with local files only and needs no network after the page has loaded. Google Drive is an **add-on for people whose files live in Drive but who do not have the Drive folder on their computer** (no Drive for desktop). It is off until the three values are filled in (see setup step 7: for the published copy they live in `deploy-config/drive-config.js`, which `make-deploy.sh` copies over `deploy/app/drive-config.js`; `dev/app/drive-config.js` stays empty so development and the tests never reach Google); while it is empty there is no Drive button, no Google script is ever loaded, and a copy on a closed network behaves exactly as before.

## What it does

- The blue **save button** gets a small **▾** menu beside it when Drive is set up (without the setup it is just *Download data file*): choose *This computer*, *Google Drive: a new dated file each time* or *Google Drive: update one file in place*, **Google Drive settings…** (goes to the Options tab, where the folders, saving on or off, the sign-in and the rest are set: there is no pop-up) or *Sign out*. The **Import…** button works the same way: it opens your computer's file picker, or Google's when saving to Drive is on (**Import from Drive…**), and its **▾** menu picks either for one import. **Open from Google Drive…** is also on the opening screen. Slide images, their ZIP and the CSV exports go to the second folder; **Print / Save as PDF** is the browser's own print window, so choose the same folder there. You pick files in Google's own picker; the app reads them straight into the page, the same as *Import…*. Nothing goes through any other server.
- **Save data files and slide images to Drive instead of downloading them.** After you open files from Drive this is on. **Download data file** then creates a **new** file (`awana-2026-27-<date>-<time>.json`) in the folder the data file came from. With the default **Dated files** save style nothing is overwritten or deleted, so older files stay as backups, the same as downloading. If that folder is refused, or none is known, the app asks you to choose a folder. If Drive fails for any reason the file is downloaded to the computer instead, so nothing is lost.
- **Two folders**, set in the Google Drive dialog (or on the Options tab): the **club files folder** (where the file picker opens *and* where data files (JSON) are saved: one place for both) and where slide images are saved. **They are stored in the data file** (`config.driveDirs`), so everyone using that file gets them (a shared drive); choosing a folder updates the file, so download it afterwards. This browser also remembers its own choice for before a file is open. Unset, data files go to the folder the opened file came from and slides go with the data files. A file from before this change that kept separate "open from" and "data files" folders uses its data folder as the club folder.
- **Each person confirms a shared folder once.** The app only has the narrow `drive.file` permission, so it can use a folder only after that person has picked it. The first time Google refuses a folder from the file, the app opens the picker next to it with it ticked: press Select. After that, saving goes there automatically.
- **Save style: one file, updated in place** (a setting of this browser; the default is dated files). The app keeps updating the Drive file this season was opened from (or the one it created for a new season) instead of making a new one each time, and **keeps the name the file has on Drive** (an optional box on Options > Google Drive, a setting of this browser, saves it under a name you type instead; empty = keep the name). Drive keeps the earlier content as **revisions**. Only that one file is ever updated, and only when the open season really came from it: a new season, a file opened from the computer, the Try-it-out club, or another file opened since always saves as a **new** file (with the dated name), which then becomes the one kept up to date. Nothing is ever deleted. The `drive.file` permission is enough: it covers files the app created or the person picked.
- **When someone else saved in between** (2 to 5 people sharing the file). Before each in-place save the app compares the file's current revision with the one this copy is based on. If they differ, the other person's changes are **merged** with yours, not overwritten: each of you changed different things, so both are kept; where both changed the same thing, the merge screen (the one used by File > Merge a data file) asks which to keep, and nothing is written until you accept it (cancel writes nothing and downloads a copy). The automatic save cannot ask, so it keeps the older rule: what was already saved stays and yours is listed in a message. A merge is one entry in History. After the write the app looks at the file's revisions: if someone saved in the small gap between the check and the write, their revision (which Drive still holds) is merged in and the file is written again.
- **Keeping versions.** Drive deletes unpinned revisions of an uploaded file after 30 days (or when more than 100 newer ones exist). On each in-place save the app pins (`keepForever`) the new revision if none has been pinned in the last N days (default 30, a club setting on the Options tab, 0 = never), so Drive covers the last month and pinned versions cover everything older. Pinned versions are listed under **Manage versions** in Drive (Drive allows up to 200 pinned per file).
- Test files (TEST in the name) still need two presses and are still saved with TEST in the name.
- The data file (JSON) and the slide images from the Awards tab (a PNG, or the ZIP of them) are saved to Drive, into the same folder. Reports are downloaded as before. Slide images show children's names and awards, so keep that folder private.
- **Sign out** forgets the sign-in and turns Drive saving off. Closing or reloading the page does the same.

## What Google lets the app see

The app asks for one permission, `drive.file`: it can only see **files you pick in the picker and files it creates itself**. It cannot browse or search the rest of your Drive.

## One-time setup (about 15 minutes, by whoever hosts the app)

1. Go to <https://console.cloud.google.com/> and create a project (e.g. "Gonkulator").
2. **APIs & Services, Library:** enable **Google Drive API** and **Google Picker API**.
3. **OAuth consent screen** (now called *Google Auth Platform*): user type *External* (or *Internal* if everyone is in one Google Workspace), app name, your email. Add the scope `https://www.googleapis.com/auth/drive.file`. While the app is in *Testing*, add each person's Google account under *Test users*. I believe `drive.file` is a non-sensitive scope, so publishing to *Production* should not need Google's review; check the consent screen page, which says if it does.
4. **Credentials, Create credentials, OAuth client ID:** type *Web application*. Under *Authorized JavaScript origins* add the site, for example `https://static.burnclouds.net` (the origin only, no path). No redirect URI is needed.
5. **Credentials, Create credentials, API key:** restrict it to *Websites* (HTTP referrers) `https://static.burnclouds.net/awana/gonkulator/*` and to the *Google Picker API*. The key will be visible in the page source; the restriction is what protects it.
6. The **project number** (project settings, a long number) is the `appId`.
7. Put the three values in `deploy-config/drive-config.js` (the published copy's settings; `dev/app/drive-config.js` stays empty on purpose), bump that file's version line because it changed, run `./make-deploy.sh` (it copies the file into `deploy/app/`), and deploy as usual.

   These three values are public by design (they identify the app, not a person), but the API key is committed with the project and visible in the page source, so keep it restricted to the site address and the Picker API as in step 5. If the project is ever pushed to a shared place such as GitHub, check that restriction first.

If your web server sends a Content-Security-Policy, it has to allow `accounts.google.com`, `apis.google.com`, `www.googleapis.com`, `content.googleapis.com` and `docs.google.com` (the sign-in window, scripts, API calls and picker frame).

## Limits and things to know

- A Google Sheet or Doc cannot be read as a file. Download it as CSV and upload that to Drive. Real CSV and JSON files work.
- Sign-in lasts about an hour; after that the next Drive action asks Google again (usually one click).
- The first time, Google shows a consent screen. Browsers that block pop-ups must allow them for this site.
- A file shared with you by someone else can be opened if you can read it, but saving into that person's folder is refused unless you can edit it. The app then asks for another folder.

## When a save fails

A save you press (Save) that fails shows one sentence and two buttons. A copy of the file is downloaded to the computer at the same time, once.

- **Google asked you to sign in again.** Press **Try again** to sign in. Your changes are still in the app.
- **Google will not take the folder.** Choose the folder again, then press **Try again**.
- **Google Drive is busy** (it said 429 or 5xx). Nothing was changed on Drive. Wait a moment, then press **Try again**.
- **This computer could not reach Google Drive.** Check the connection, then press **Try again**. Nothing was changed on Drive.
- **Someone else is saving the same file.** Wait a minute and press **Try again**. Their changes are merged with yours, and a newer Drive revision is never overwritten.
- **Anything else** shows Google's own message in brief.

**Close** leaves the work unsaved on Drive; the copy on this computer is still there. An automatic save never shows this dialog: it shows `auto-save is waiting` or `could not save` on the status line and tries again at the next interval.

## Tests

`test/drive.test.js` (the Drive calls against a pretend Google, and that nothing Google-related is loaded by default), `test/drive-browser.test.js` (the buttons in a real browser with Google stubbed) and `test/drive-inplace-browser.test.js` (saving in place with a fake Drive that keeps revisions: merge, the gap between check and write, pinning). Both use pretend Google, so **what has not been tested is the real Google sign-in, picker and API**; expect to fix small things on the first real try.
