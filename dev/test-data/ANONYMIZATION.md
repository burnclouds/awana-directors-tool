# The anonymized test set

A complete copy of the real data with the identifying details replaced, for trying things out (imports, undo, reports, slides, the To do page) without real children on screen. Every file has TEST in its name, so the app shows the red banner and makes downloads need two presses.

| File | What it is |
|---|---|
| `awana-2026-27-TEST-20261029-214815.json` | The data file: the same 140 people, classes, grades, color teams, handbooks, attendance, games, awards, calendar, rotation and history as `awana-2026-27-20261029-214815.json`. |
| `20261028 -- demo-club-2026-27 TEST.csv` | The Planning Center export for the same people. It matches the data file exactly: opening both together changes nothing. |
| `20261103 -- demo-club-2026-27 TEST.csv` | The anonymized export plus 15 invented registrations that cover the corner cases of an import. See `TEST-CASES.md`. |

These three files are also what **Try it out** on the app's opening screen loads, so they are public once deployed (`make-deploy.sh` copies them into `app/try/`, and refuses any file without TEST in its name). Regenerate and re-check before every deploy that changes them.

Open the data file and the export together (Open files…) for a normal week; add the third file to try an import with new people.

**These files are not in git.** The repository ignores every `*.csv` and `*.json`, so a fresh checkout has no test set. `dev/tools/make-test-data.js` regenerates it (from a local real data file that is also kept out of git); `make-deploy.sh` copies the result into `deploy/app/try/`, which is tracked. Never put a real data file or export in a place git can see.

## What was replaced

- **Names.** Every real first name and last name became one invented name, the same everywhere it appears. Brothers and sisters still share a last name, a parent named in the contact or emergency fields still matches the family, and the same real name always gives the same invented one. Girls got girls' names and boys got boys' names. This covers the name fields, the registration contact, the emergency contact, the list of who may pick up (including relatives who are in no name field), names typed into the "primary phone" box, nicknames in brackets, notes, pending changes and the history log. A name mentioned inside a medical comment ("Addison is allergic to nuts") is replaced too.
- **Phone numbers.** Every number is an invented 555-01xx number, the same fake for the same real number, in the same punctuation, wherever it appears. A number of any length from 7 digits (for example 555-1234, or one typed into the emergency phone box) is replaced, not only full 10-digit numbers, and the tool stops if a phone number from the real input is still in the output (it prints a count, never the number).
- **Emails.** Every address is `parentNNN@example.com` (or `.org`), the same fake for the same real address.
- **Addresses.** Street, city and zip are invented (real Dayton-area towns, invented streets). A family keeps one address across the fields that repeat it.
- **Registration IDs.** Random `7xxxxxxx` numbers, the same for a family. IDs in the data file (`RegID_First_Last`) are rebuilt from the invented values, so every section agrees.
- **Birthdates.** Every birthdate moved two to eight weeks, earlier or later. The same date always moves the same way (twins stay twins), and the age on the export date is unchanged, so grades still fit ages. The Age column is untouched.
- **Medical Notes and allergy answers.** Each real note was replaced by a generic invented one ("Allergic to shrimp", "Mild asthma; inhaler in backpack", "Wears glasses"). A real note always becomes the same invented note. Values that are not medical stay: "None", "N/A", "no", blank, and a plain "No photos please". A note that mixed a condition with a photo request becomes a generic note plus "No photos please.", so the no-photos flag behaves as before.

## The rule for every Planning Center column (`dev/tools/anon-pc.js`)

| Rule | Columns | What it becomes |
|---|---|---|
| name | First Name, Last Name, Registration Contact First / Last Name | an invented name |
| regid | Registration ID | an invented `7xxxxxxx` number |
| address | Home Address Street, City, Zip | an invented street, city, zip |
| contactAddress | Registration Contact Address | an invented address |
| birthdate | Birthdate | moved two to eight weeks |
| medical | Medical Notes, the allergy question | a generic invented note |
| phone | Mobile, Home, Work, Other, Registration Contact Phone Number | an invented 555-01xx number |
| email | every email column | `parentNNN@example.com` |
| namelist | Emergency Contact, who may pick up, the "primary phone" box | words that are not ordinary English become invented names |
| freetext | the shirt-size question, Uniform | word-scrubbed |
| keep | Grade, Age, Gender, Selection, Status, Submitted, money, Discount, Attendance, vest and shirt columns, Assignment Area: Classes, Home Address State | unchanged |

**A column this table does not name is emptied (its name is kept): a new Planning Center question could hold anything.** An empty value stays empty and anything else becomes `TEST`. The tool also stops, writing nothing, on any key of the data file it does not know: at the top level, in `roster`, in a person's entry, in the kept export record (`roster.pcExport`), or in a History path under `roster`.

## What was not changed

- **Ages, grades and classes.** The tests need real ages against grades.
- **Costs, balances, submission dates, vest and shirt flags, uniform tracking, color teams, handbook codes, awards.** They carry no identity.
- **The color team plan** (`config.teamPlan`: which Q3 and Q4 colors read as projected, a few hand-set Q3 colors) is invented by `dev/tools/demo-plan.js` from the colors already in the file; it refuses any file that is not flagged `"fake": true`.

## The check on medical comments

The real medical text is gone, so the medical comments hold no names and no real conditions. The tool checks that no replaced real note appears anywhere in either file and that none of a list of specific terms (rare conditions, procedures, drug names) does. It also lists every word in the free-text fields that is not ordinary English and not an invented name, for a person to read; what remains is EpiPen, "nka", and the invented street and city names. An automatic test searches both files, and the committed folder, for any real name word, phone number, email, registration ID or street (zero found).

## How it is made

`node dev/tools/make-test-data.js <data.json> <export.csv> <out-dir>` reads the real files and writes the first two files above. The invented names come from lists in `dev/tools/name-pools.js` (names that match a real name are skipped) and a fixed random seed, so the output is the same each time. The mapping from real to invented names is held in memory while the tool runs and is never written to disk, so the test files cannot be reversed. Then `node dev/tools/make-test-export.js "<anonymized export>" dev/test-data` builds the third file on top of it.

`test/anonymized-data.test.js <real-data.json> <real-export.csv>` re-runs the tool and checks, independently of it, that no real name, phone, email, registration ID or street is in the output or in this folder, that every phone and email is invented, that every birthdate moved two to eight weeks and kept its age, that real medical text is gone while the "none" and "no photos" cases remain, that counts, families, teams, handbooks, attendance, awards and games carry over, that the two files agree, and that the output is identical on a second run.

Regenerate whenever the real data file changes enough that the test set should follow it. Keep the real files out of this folder.

## Fake flag and dates

The data file carries `"fake": true`. Try it out (the app's own button) moves all of its dates forward by whole weeks, so the demo club always looks current; opening the file any other way, including every test, keeps the dates it holds. `tools/make-test-data.js` writes the flag.
