# Documentation map

The living files stay at the top of the project: `../README.md` (what the app is and how to build and test it), `../CHANGELOG.md` (what changed in each version) and `../BACKLOG.md` (only what is still open). Everything else is here.

| Folder | What is in it | Current? |
|---|---|---|
| `DATA-FORMAT.md` (here, not in a folder) | The complete specification of the data file. It stays at this path because `season.js`'s header and `test/data-format-doc.test.js` point at it | Yes: a test fails if it falls behind the code |
| `reference/` | `COLOR-TEAMS.md` (how color teams decide, and the rules as built), `GOOGLE-DRIVE.md` (the optional Drive add-on), `playtest-checklist.md` (what to check by hand on a real device) | Yes: update these when the app changes |
| `superpowers/specs/` | The design for each larger feature, with the reasons (color teams, awards, flags, import merge, service worker, settings in the file, mid-quarter moves) | Yes, as design rationale. New designs go here |
| `reviews/` | The whole-project review (2026-11-12) and the color teams and printing review (2026-11-14), with file and line | Yes, until their findings are fixed |
| `research/` | What Awana itself says, and how reliable each source is: the Blue Jewel rules by club, and the check of an internet awards guide against awana.org | Yes, as evidence |
| `retired/` | Finished, superseded or historical notes, each summarized in `retired/README.md` | No: history only |

Not in the repository, by design: any data file, roster, export or scan of a child's record (`.gitignore` blocks them). No test reads real children's data any more: the four tests that did run on the invented TEST data in `../dev/test-data/`, and the folder of real copies was moved out of the project (and out of the Nextcloud-synced tree) on 2026-11-14. `.gitignore` still blocks a folder of that name as a guard. Three tests (`reports-season`, `browser`, `anonymized-data`) take real files as command-line arguments and skip without them.

Where new notes go: a feature design in `superpowers/specs/`, a review in `reviews/`, what Awana says in `research/`, a plan in `superpowers/plans/` (move it to `retired/plans/` once it is carried out), and anything that is simply done in `retired/`.
