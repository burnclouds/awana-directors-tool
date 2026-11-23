# Backlog: the one list (unified 2026-11-14)

This is the only place open work is tracked. The two review files in `docs/reviews/` are records, not lists. Things built, fixed or closed are archived, newest first: `docs/retired/BACKLOG-done-2026-11-22.md` (N37, N46, N52, N55, N59–N62, N64–N67 and N69), `docs/retired/BACKLOG-done-2026-11-20.md` (everything closed up to 2026-11-19, including the old State notes, the volunteer-absences design and the full N37 text), `docs/retired/BACKLOG-done-2026-11-19.md` and `docs/retired/BACKLOG-full-2026-11-14.md`; the version before the 2026-11-14 rewrite is `docs/retired/BACKLOG-2026-11-14-before-unify.md`. What changed in each version is in `CHANGELOG.md`. To find a closed item by its ID (N9, N38, S11, ...), search the archive files.

## How to use it

- Every item has an ID and a checkbox. `[ ]` open, `[x]` done. When an item is done, tick it with the date, version and test. At release time, document completed work in the changelog, regenerate the version history, then move completed entries and their publication notes to `docs/retired/BACKLOG-done-<date>.md` before building the public backlog.
- **Check** says how the item was last verified. `V 2026-11-14` means verified against the code that day; the test name is the thing that turns red when it is fixed.
- Open items that can be checked without a browser have a check in `dev/app/test/backlog-open-items.test.js`. That file lists them in `OPEN`; the run stays green while they are open and goes RED ("now passes: close it in BACKLOG.md") the day one is fixed. When you fix an item: remove it from `OPEN`, tick it here.
- Priority: **P0** before the next club night; **P1** a leader can be hurt by it (privacy, wrong paper); **P2** wrong or missing content on a printout or screen; **P3** polish and cleanup; **W** waiting on a date or an answer.

## State on 2026-11-22

- **Live: 1.51.19b** (released 2026-11-20 on Mike's "Deploy 1.51.19b, skip full sweep", targeted/node tests only). Holds Cubbies attendance 4 sub-cells, N49 (notes and replies), N50 (attendance row numbers), N51 (no explanation lines on printables), N53 (coaches color teams list), N54 (standings has no Group picker), N56 (Sparks progress sheet labels, Wings/Red 1, captions, full dates), N57 (one Progress sheets report with a Books choice and blank sheets; Achievement records retired into it), N58 (light-mode shading). Before it, 1.51.19 held N47, N48 and the redesigned version history; 1.51.18 held the last full sweep (268 ok, 3 skipped, 0 failed). The site is the public repo `burnclouds/awana-directors-tool`, served by GitHub Pages; the Nextcloud copy is no longer updated (README "Changing and deploying").
- **Closed items of 2026-11-20 and 2026-11-22** are in the matching files under `docs/retired/`.
- **Release candidate 1.51.20** is built in `deploy/` and is ready for publication. It includes N37, N46, N52, N55, N59–N62, N64–N67 and N69. The public branch includes the updated changelog, version history, backlog archive, and generated deploy output.
- **Pushing from this machine:** `gh` is signed in; use `git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin public:main`. The guard `.git/hooks/pre-push` (only `public` may go to `main`) is enabled and tested. Every push is asked for first.
- **Skipped at the 1.51.18 and 1.51.19 releases:** the names check (`node dev/tools/check-docs-for-names.js <real-data.json>`, which needs the real data file, not on this machine) was not run before those pushes; the version history was not republished to the private artifact link (README deploy step 6; the page there is at 1.51.16).
- Every leader presses **Update now** to pick up a new version. Pace thresholds stay on hold until about 2026-11-25 (they need real sign-off history).
- Test status (2026-11-22): Node-only sweep, **115 passed, 168 skipped, 0 failed**; skips include browser tests and checks requiring real files. The full browser runner could not launch Chromium in this sandbox. Targeted Club-night pack, print, and N67 checks passed; a parallel Drive browser batch had four failures and needs a rerun in a normal browser environment. Run tests with `NODE_PATH=<dir with playwright> sh dev/tools/run-tests.sh [--node-only] [name-filter]`.

## Open work

Each item in this section has a publication note directly below it. Use `<!-- publish: Public title | Anticipated scope -->` for a scrubbed, public-facing summary. Use `<!-- publish: private -->` for security-related or sensitive work. Keep real names, identifiers, club details, file paths, and screenshots out of the public fields. The deployment builds `backlog.html` from those fields. When completed work ships, move it to the archive with its publication note.

- [ ] **N3. Make a club calendar in the app, with no Excel or CSV import.** PAUSED 2026-11-18 by Mike: work the printables first (N8 and anything else on paper), then come back to this. A quick way to create and print the calendar: pick the club day (day of week), the first and last club night, then edit any night by hand (theme, no club, event, end of quarter), with holiday detection. In progress: requirement questions first (Opus agent), then an implementation plan. Example: the club's Excel calendar sheet (Mike's screenshot of 2026-11-18).
  <!-- publish: Club calendar builder | Large, 2–4 days. Generate club nights, handle holidays and exceptions, and support editing and printing. Paused while print work is underway. -->

- [ ] **N68. Review pace thresholds.** Wait until about 2026-11-25 for enough sign-off history, then review Stats > Pace and record any threshold changes separately.
  <!-- publish: Review progress pace thresholds | Small, under half a day once enough sign-off history is available. Check whether the existing thresholds reflect typical progress. -->

The 2026-11-21 screenshot references are filenames in the local, Git-ignored `backlog screeshots/` folder.

## W: waiting on a date or an answer

- **Mike:** a path to the real data file so the names check can be run (or his word that it is not needed); whether the version history should keep being republished to the private artifact link; a phone look at the new Debug sections (Records that look wrong, Readable copy) and at the greyed-out Print button on a report with nothing to print.
- **A date:** about 2026-11-25 for N68 (pace thresholds).
- **Mike (open from the 2026-11-20 list):** N62 (where the coloring sheet PDFs are and how a night's sheet is picked). Answered 2026-11-20: N50, N55/N61, N56 (all three), N57 (merge confirmed, blanks wanted), N59, N60.

## Decided not to build / by design

- Taller attendance rows (Mike: not needed).
- **B5. No Photos list prints the Medical Notes field as "Parent note": by design (Mike, 2026-11-14).** Whoever holds the list is cleared for the full PII/PHI set. Pinned by `backlog-open-items` B5-by-design so it is not "fixed" later.

Photo-to-progress agent and the patch import; sibling / household emergency contacts; fill-down; GitHub setup; friend placement and the Visitor tab; the combined Person/Progress view; color-team per-class rules and a separate mid-quarter move; a browser draft for crash safety (R9, covered by the unsaved-edits words and Save bar); splitting `app-season.js` (R14 part B); rewriting git history while there is no remote (rule, updated 2026-11-16: every push comes with the documentation for that release brought up to date (CHANGELOG entry, the How it works text in `dev/app/index.html`, `docs/DATA-FORMAT.md` for any data change, the README test list and this backlog), and `dev/tools/check-docs-for-names.js <real-data.json>` is run first. The public repo holds one snapshot (branch `public`, pushed as `main`); the private history on local `main` is never pushed).

## Sweep

Latest full sweep **2026-11-19** (`sh dev/tools/run-tests.sh`, with Playwright, on the final 1.51.18 source): **268 ok, 3 skipped, 0 failed.** The 3 skips (`anonymized-data`, `browser`, `reports-season`) need real files. The older sweep notes are in the archive.
