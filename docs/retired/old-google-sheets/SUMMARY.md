# The old Google Sheets workbooks: summary (read on 2026-10-29)

Before the app, the club ran on two Google Sheet workbooks. They were exported once on 2026-10-29 and read tab by tab so the app could be checked against them; nothing in them was changed. The app replaced both. The full tab-by-tab notes are kept beside this file (`SHEET-TABS.md`, `WEEKLY-AWARDS-TABS.md`); read them only to answer "what did the Sheet do here". No names or contact details are in them.

## "26-27 Attendance Sheets" (31 tabs)

Everything keyed on row position, with a Planning Center download pasted in and compared by hand. What each group of tabs became:

| Sheet | Now in the app |
|---|---|
| Data from FBK Download, Compare | Import and the Import review (matched on registration ID and name, not row position) |
| All Clubbers (identity, colors, attendance, handbook, totals) | Roster, Attendance, Awards, Progress and the Person tab |
| Color Team Counts, Color Matrix, PT Games lists | Color teams tab and its year grid, the assignment engine, the Color teams report |
| Games Points, Games Q1 to Q4 | Games tab, standings, per-child game points |
| Emergency, Medical, No Photos, Volunteers | Reports (class and coaches binders, volunteer list), a per-person No photos box |
| Vest T-Shirt | Uniforms tab |
| Attendance forms (Puggles, Cubbies, Sparks and T&T) | Reports: one landscape page per room |
| Birthdays, Example | Dropped (unused) |

## "26-27 Weekly Awards" (9 tabs)

Awards were free text, one comma-separated cell per week, typed against a Unique ID, with two tabs that existed only to detect drift. The Blue Jewel threshold in the Sheet was 31 weeks; the paper record says 27, and the app uses 6/12/19/27 (a setting in the data file).

| Sheet | Now in the app |
|---|---|
| Master Student List, Differences Calculator and Summary | The roster and the Import review |
| Awards Earned each week | Awards tab (a list per child per night, with suggestions for Blue Jewels and finished sections) |
| Weekly Awards, PT Weekly Awards Steps 1 and 2 | The weekly slide report and the slide pictures (1920 by 1080 PNGs) |
| PT Sparks by book | Handbooks by book report |
| List of Possible Awards | Award lists, exclusions and book codes, stored in the data file |

## Lessons that shaped the app

- Key everything on an ID, never a row; store awards as data, not text; keep every setting in the file; keep children's data out of the repository.
