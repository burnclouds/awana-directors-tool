# Import test file: 20261103 -- demo-club-2026-27 TEST.csv

The base export (140 people; in `dev/test-data` this is the anonymized export) plus 15 invented registrations, as of 2026-11-03. Nobody in the added rows is real: names, phone numbers (555-01xx), addresses and emails (example.com / example.org) are made up, and their registration IDs run 90000101 to 90000115. Test input only.

## How to use it

1. Open the app, then **Open files…** and pick the newest data file and this CSV together.
2. The **TEST** in the file name puts the session in test mode: a red banner shows, and every download is named with TEST and needs two presses. Reload the page to clear it. Do not download the data file from a test session if you can avoid it; if you do, the TEST in its name tells it apart, and it must never replace the real file.
3. The import review lists 15 new people. **Apply import**, and the **To do** tab opens with the file check and the actions.
4. Assign classes from the To do page, then colors on the Color teams tab (*Fill blank colors* or *Assign blanks*) and handbooks on the Progress or Person tab, and watch the list shrink.
5. Close or reload the tab when done. Nothing is saved unless you download.

## The 15 registrations

| # | Registration ID | Name as typed | What it tests | What should happen |
|---|---|---|---|---|
| 1 | 90000101 | Wren Calloway | Puggles toddler, age 2: the plain case for the youngest group. Emoji in the notes. | No action. Imports as a Puggle. |
| 2 | 90000102 |   Ivy   Fenwick | Puggle who is 3 years 11 months, Pre-K, with NO class assigned, and a first name padded with spaces. Sibling of case 3 (same registration ID). | Export check: name has extra spaces; no room. To do: assign a class (Puggles or Cubbies). |
| 3 | 90000102 | Linus Fenwick | Cubbies Pre-K, age 4, bought a Cubbies vest and still owes $35. Sibling of case 2. | To do: uniform to order (the balance owed is not tracked by the app). A new sibling in a family the file already has a registration ID for. |
| 4 | 90000104 | jasmine mcdonald | Kindergartener, age 5, name typed in all lower case, NO class assigned (this club puts Kindergarten in Sparks). | Export check: names all lower case, no room. To do: assign a class (suggested Sparks). |
| 5 | 90000105 | Theo Vandermeer | Sparks 1st grader with a severe allergy in a note that has commas, quotes, a line break and a line starting with =. | CSV quoting survives; medical text shows on the medical report; uniform to order (Sparks vest). |
| 6 | 90000106 | Zoë O'Brien-Nuñez | Sparks 2nd grader: accented, apostrophe and hyphen in the name, every kind of phone format, a "no photos" note. | Name and phones are kept exactly as typed. "No photos" is recognised from the note. |
| 7 | 90000107 | Mateo Alejandro Hartwell-Quinn | T&T 3rd grader with a two-part first name, a hyphenated last name, the room spelled TnT, a yyyy-mm-dd birthdate and a T&T shirt. | TnT is treated as T&T. The ISO birthdate is accepted. To do: uniform to order (T&T shirt). |
| 8 | 90000108 | Priya Raghunathan | Oldest child still in T&T (6th grade, age 11) with a 9-digit zip, state typed "ohio", an invalid email and two emails in one box. | Export check: "priya.family at example.com" is not a valid email. Two addresses in one box are both checked. |
| 9 | 90000109 | Caleb Whitaker | A 7th grader (age 12) registered as a clubber and put in a room that does not exist here (Trek/Journey). | Export check: unknown room; past T&T. To do: no class fits. |
| 10 | 90000110 | Ruby Castellano | A 4th grader (age 9) put in a Sparks room. | To do: class does not match grade (suggested T&T). |
| 11 | 90000111 | Dmitri Volkov | Age, birthdate and grade disagree: the Age column says 5, the birthdate makes them 9, the grade is 2nd. | Export check: the Age column says 5 but the birthdate makes them 9. |
| 12 | 90000112 | Sam Okafor | A registration with almost nothing filled in: no birthdate, grade, age, phone, email, address or emergency contact. | Export check: no birthdate, grade, contact or emergency contact. To do: details missing. |
| 13 | 90000113 | Melody Whitfield | A child registered twice (same registration ID and name). This is the first, Active copy. | Export check: the name appears twice. Both rows are added with their own ID. |
| 14 | 90000113 | Melody Whitfield | The second registration for case 13: Status Cancelled, a different phone, submitted later. | Export check: not Active, duplicate name. To do: cancelled registration to review. |
| 15 | 90000115 | Marguerite Delacroix-Boyd | An adult volunteer assigned to a class room, with only a work email and no grade. | Counts as an adult, not a clubber, even though the room is Sparks C. No grade or emergency contact needed. |

## What the To do page lists for the 15 new people (pinned by `test/import-test-file.test.js`)

- **Assign a class:** Ivy Fenwick (suggested Puggles), jasmine mcdonald (suggested Sparks), Caleb Whitaker (no class: past 6th grade).
- **Class does not match the grade:** Ruby Castellano (4th grade in Sparks D; T&T is usual).
- **Needs a Q2 color team:** the Sparks and T&T children: Dmitri Volkov, both Melody Whitfield registrations, Mateo Alejandro Hartwell-Quinn, Priya Raghunathan, Ruby Castellano, Theo Vandermeer, Zoë O'Brien-Nuñez. Not the Puggles, Cubbies or the adult.
- **Uniform to order:** Linus Fenwick, Mateo Alejandro Hartwell-Quinn, Theo Vandermeer, Zoë O'Brien-Nuñez. **Balance due:** Linus Fenwick.
- **Details missing:** Sam Okafor. **Registration not Active:** the Cancelled Melody Whitfield. **Possible duplicates:** both Melody Whitfields.
- **Medical or allergy notes to read:** Theo Vandermeer, Wren Calloway.
- **Nothing:** Marguerite Delacroix-Boyd (an adult in a class room needs no grade, emergency contact or color).

The file check (errors and warnings about the file itself) should find no errors and warn about: the unknown room "Trek/Journey", one person not Active, "Melody Whitfield" appearing twice, and per person the problems in the table above (padded and lower-case names, the invalid email, past T&T, class that does not fit the grade, Age against birthdate, a nearly empty registration). `TnT` in a room name is read as `T&T` and raises nothing.

## What it does not cover

Every added row is a brand-new person, so these import cases need a hand-edited copy of an existing row and are not in this file: a **renamed** child (same registration ID, new name), someone **missing** from the export (marked inactive), a child who **reappears**, a changed phone, medical note or class on a **matched** child, and a **pending change** you made here that Planning Center now matches. `test/test.js` and `test/roster.test.js` cover those with small fixtures.

Colors and handbooks are not part of a Planning Center export, so every new Sparks or T&T child needs them after the import.

Generated by `dev/tools/make-test-export.js`; run `node dev/tools/make-test-export.js` to regenerate the identical file.
