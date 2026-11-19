# N37: print review of every printed page, findings (2026-11-19)

Status (2026-11-19, later the same day): **F1 to F7 and F9 to F13 are fixed** in dev (commits 4b84774, 9977831, 17c4888, 8eeecab), each held by a check in `test/print-clean-browser.test.js` that reads the printed text of a real PDF (17 checks). **Not fixed, by decision or because they need an answer:** F8 (keep "none reported"? Mike's call), F14 and F15 (data-dependent: an empty lesson column and an empty Rank column; wait for real data), F16 (check on paper), F17 (which reports go in a binder? Mike's call). Checked again after the fixes with the same PDF measurement: no page of any report ends on a heading; `booksYear` is grouped by class and no longer strands one row; the empty-state pages are not printed and Print is off for them. Not measured: a row split across a page (the CSS now forbids it on every table; the TEST data has no row near a page edge). The text below is the original findings pass and is kept as written.

## How this was done, and its limits

- Every report in `Reports.LIST` (23) was rendered from the invented TEST file (`dev/test-data/*TEST*.json`, 144 invented people) with default options and printed with Chromium's own print engine (`page.pdf`, `preferCSSPageSize`), the same path as `print-pdf-n1-browser.test.js`.
- **Measured** from each PDF with `pdftotext -bbox`: page size, page count, the leftmost and rightmost text on each page, the top and bottom of the text, near-empty pages, a page that ends on a heading, whether the header row repeats on a continuation page.
- **Judged by eye** from an 80 dpi image of page 1 of each report (22 of 23). A thumbnail shows layout and wording, not small print, so a finding below says "looks" when it comes from the image.
- **Not covered:** `handOut` prints nothing with default options (it needs a choice of what to hand out; its layout was settled in N27 and is tested by `handout-rule-browser.test.js`). Page 2 onward of multi-page reports were measured, not viewed. The TEST data has no real notes, so a finding that depends on data (an empty column, zeros) is marked "data".
- The "34 other findings" of the earlier review that N37 mentions are **not in the repository**: no review file was saved, so they could not be reconciled with this list. Treat this list as a fresh pass; if the earlier review comes back, compare.
- The scripts were scratch files (not tracked); the method is the one above and reruns in a minute.

## Measured results that held

- **Binder punch margin (c): met.** Every report with the `punch` class (binderClass, binderAll, binderTeams, noteSheets, progressSheets, achievement, volunteers) has its text 61 to 65 pt (0.85 to 0.90 in) from the left edge, on letter portrait. The landscape attendance sheet starts 61.6 pt (0.86 in) from the top (N11). Letter size only; A4 was not rendered.
- **Nothing runs off the page.** No page has text below its bottom margin, none past the right margin, and no page is blank.
- **Header rows repeat** on the continuation page of every multi-page table (binderAll, uniforms, lessons, volunteers, booksYear, attendDates, statistics).
- **Row splitting was not directly measurable.** Every page measured ends on a whole row in the TEST data. The CSS only protects `table.grid` rows (`style.css` 150), not the `roster` tables most reports use (see F1).

## Findings

Severity: **A** wrong or wasteful on paper, **B** noise worth removing, **C** minor or data-dependent. "Fix" is a suggestion, not a decision.

| # | Report id | Finding | How seen | Sev | Suggested fix |
|---|---|---|---|---|---|
| F1 | statistics (and any report with headings) | Page 2 ends on the heading "Extra" with its table on page 3. Cause: `break-after: avoid` is set on no heading, and `break-inside: avoid` only on `table.grid tr` | measured; CSS read | A | In the print CSS: `#report h1,h2,h3,h4,caption { break-after: avoid }` and `#report table tr { break-inside: avoid }` |
| F2 | booksYear | One lone row (the last child in the list) spills onto page 2 (page 2 is 9% full). The Class column repeats the same word on every row although the rows are already sorted by class | measured; looks | A | Group by class with a sub-heading and drop the Class column (this is N37's own example; it also saves the spilled row). Or tighten the row padding in print |
| F3 | binderAll | "T&T Girls (Group B)" wraps to two lines in the Class column on almost every T&T row, and the "Q2 Color Team" heading wraps to three lines. N31 widened the columns but the long class names still wrap | looks; measured (5 pages) | A | Print a short class name ("T&T Girls B") or give the Class column more width; header "Team" is enough |
| F4 | volunteers | Same wrapping of "T&T Boys (Group A)" in the Assignment column | looks | B | Same short class name as F3 |
| F5 | noteSheets | The theme text in the narrow Night column breaks mid-word ("Backward / s Night", "Lottie Moon Collection / Team Color" one word per line) | looks | A | Widen the theme cell or lower its font; allow a break only between words |
| F6 | teams, binderAll | The subtitle "Q2 teams. * = changes team during the quarter." prints even when no name carries a "*" | looks | B | Print the note only when at least one "*" is printed |
| F7 | binderClass | Phone numbers print in three styles in one list (`5675550185`, `513-555-0174`, `(440) 555-0145`) | looks | B | Show every number in one style (display only; the stored value is unchanged) |
| F8 | binderClass | "none reported" in grey italics fills the medical column for most children; two grey lines (Planning Center date, Printed date) sit under the title | looks | C | Decision for Mike: the explicit "none reported" may be wanted (it says someone checked). Otherwise leave the cell blank |
| F9 | photos | A screen instruction prints: "Flag is set automatically from parent notes on first import and can be edited on the Roster tab." First and Last name are two columns while the other lists use one Name column | looks | B | Hide the sentence in print; one Name column |
| F10 | booksYear | A two-line grey subtitle explains where the books come from ("... from Progress (every section dated) or the 'finished before' tick"); screen help on paper | looks | B | Hide in print |
| F11 | statistics | Three grey explanation paragraphs on paper (adults not counted; population vs sample standard deviation; "Share = ..."). "Statistics for:" prints with nothing after it (the screen picker is not printed). The subtitle shows the year twice ("AWANA Club 26-27 · 2026-27") | looks | A | Hide the explanations and the empty "Statistics for:" label in print; show the year once |
| F12 | awardsByChild | The year is printed under the title and again after every child ("Sparks A · 2026-27") | looks | B | Drop it from the child lines |
| F13 | pcChanges, ceremony, paceWatch | A report with nothing to show still prints a whole page ("Nothing pending.", "No end-of-year award is waiting.", "No sign-off dates are entered ..."). paceWatch's grey line reads "data through nothing entered" | looks | B | Say so on screen and disable Print when there is nothing; fix the paceWatch wording |
| F14 | lessons | The Puggles column is empty for every row (data: the TEST calendar has no Puggles lesson text) | looks; data | C | Hide a lesson column that has no text in the printed range |
| F15 | standings | The Rank column is empty and every figure is 0 (data: no games entered) | looks; data | C | Show Rank only once points exist |
| F16 | attendDates, uniforms | Small type: the dates list is about 7 pt; on Uniform tracking the Size, Ordered, Received, Given and Notes columns are narrow for handwriting | looks | C | Check on paper; widen Notes by narrowing Item |
| F17 | all non-binder reports | Reports without the `punch` class print at 0.5 in left (0.4 in landscape): teams, photos, uniforms, lessons, pcChanges, booksYear, announceList, ceremony, awardsByChild, standings, attendDates, handbooks, paceWatch, statistics | measured | ? | **Question for Mike:** which of these go in a binder? Any that do need the 0.85 in margin like the others |

## One line per report id (N37 "done when")

| Report id | Pages (TEST data) | Margin / breaks measured | Findings | Keep / change |
|---|---|---|---|---|
| attendance | 10 (landscape, 1 per class) | top 61.6 pt, no overflow | none | keep |
| teams | 2 | left 36 pt | F6, F17 | change |
| binderClass | 10 (1 per class) | left 61 pt | F7, F8 | change (F7); F8 is Mike's call |
| binderAll | 5 | left 61 pt; header repeats | F3, F6 | change |
| binderTeams | 2 | left 61 pt | none (class column far right, wide gap: keep) | keep |
| noteSheets | 1 | left 65 pt | F5 | change |
| progressSheets | 14 (1 per child) | left 61 pt | none (legend line is useful on paper) | keep |
| photos | 1 | left 36 pt | F9, F17 | change |
| uniforms | 2 (landscape); header repeats | left 28 pt | F16, F17 | check on paper |
| lessons | 2; header repeats | left 36 pt | F14, F17 | change |
| volunteers | 2; header repeats | left 61 pt | F4 | change |
| pcChanges | 1 (landscape) | left 28 pt | F13, F17 | change |
| booksYear | 2; header repeats | left 36 pt; one lone row on page 2 | F2, F10, F17 | change |
| handOut | not rendered with default options | not measured | n/a | keep (settled by N27, tested) |
| announceList | 1 | left 36 pt | none | keep |
| ceremony | 1 | left 36 pt | F13 | change |
| awardsByChild | 8 (1 sheet per 5 children) | left 36 pt | F12, F17 | change |
| achievement | 37 (1 per child) | left 61 pt | none | keep |
| standings | 1 | left 36 pt | F15 | keep (data) |
| attendDates | 2 (landscape); header repeats | left 28 pt | F16, F17 | check on paper |
| handbooks | 1 | left 36 pt | none | keep |
| paceWatch | 4 (1 per class) | left 36 pt | F13 | change |
| statistics | 6; header repeats | left 36 pt; page 2 ends on a heading | F1, F11 | change |

## Suggested order of fixes (smallest first)

1. **F1** (two CSS rules; covers every report). Then F6, F9, F10, F11 (hide screen-only text in print, or print a note only when it applies): small, one print-CSS or one render change each.
2. **F12, F13, F7** (small render changes). **F3, F4, F5** (column widths and a short class name; check the T&T class names appear elsewhere).
3. **F2** (group by class in booksYear): the largest of the set, because the sort and grouping change.
4. **F14, F15** only if the same thing shows on real data. **F8, F16, F17** need Mike's answer or a paper check first.

A browser test per fix, in the pattern of `print-pdf-n1-browser.test.js`, would hold each in place (no heading alone at a page foot; no lone row; no wrapped class name; the screen-only sentences absent from the print).
