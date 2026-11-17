# Retired: the one-time migration (archived 2026-11-12)

These tools and tests moved the club from the old Google Sheets and separate files (master CSV, calendar CSV, rotation CSV, season JSON) to the single data file. That move is finished, so they are out of `dev/app/test/` and the test sweep. They are kept here as a record and still run (the paths were fixed), but they only pass with the October 29 inputs they were written against (see "Why they fail now").

| File | What it did |
|---|---|
| `extract-sheets.py` | Read the two Google Sheets (downloaded as xlsx) and printed their records as JSON. |
| `build-season.js` | Turned those records into a season file (first step of the move). |
| `make-master.js` | Built a starting master CSV from a Planning Center export. |
| `migrate.test.js` | Tests for `build-season.js`. |
| `migrate-db.test.js` | The acceptance gate for the one-file move: the new data file, opened with the Planning Center export, holds everything the four old files held. |

**Not moved:** `dev/tools/make-database.js` (the one-time converter itself). `dev/app/test/browser.test.js` still builds its data file with it, so it stays in `dev/tools/` until that test is rewritten to start from a current data file.

**Why they fail now:** `migrate-db.test.js` needs an export dated the same week as the October 29 master. The only matching export is October 14 and it lacks 13 people the master has, so four checks fail (people, colors, Planning Center fields, full export). The code is fine; the inputs are old.

Run from `dev/retired/migration/`, for example `node migrate.test.js` (its real-data check runs only when given `records.json roster.csv calendar.csv`).
