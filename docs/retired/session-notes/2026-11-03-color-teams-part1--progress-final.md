# Ledger continuation: final review, fixes, documentation (plan: docs/superpowers/plans/2026-11-03-color-teams-part1.md)
(The earlier ledger, with every Task rulings line, is in the main checkout: database/.superpowers/sdd/2026-11-03-color-teams-part1/progress.md)

Final review: one fresh reviewer (fable model, subagent), 0 Critical, 5 Important, 12 Minor.
Final: fixed Fill blanks can repeat a color: 'filling blanks in an earlier quarter never repeats a color...' RED→GREEN, suite teamplan 32/32
Final: fixed Lock then Unlock turned the whole quarter into pins and the confirm text was wrong: 'lock then unlock leaves the projected colors projected' RED→GREEN (lock no longer clears marks; confirm reworded)
Final: fixed old Re-draw ignored locks and left a half-pins/half-projected quarter: browser tests 'Re-draw refuses a quarter that has started or is locked' and 'Re-draw of an open quarter marks every new color as projected' RED→GREEN
Final: fixed recalculation silent when it cannot even the teams: 'balanceNotes ...' (unit) and 'when the last quarter cannot be evened the grid says so' (browser) RED→GREEN
Final: fixed touch targets on the grid scope buttons, class/group selects, buttons and Why summaries: 'every control ... at least 44px on a phone and on a touch tablet' RED→GREEN
Final: fixed Start new year left stale locks/marks: 'newYear clears...' (unit) and 'Start new year clears the locks and the projection' (browser) RED→GREEN
Final: fixed focus lost after Fill/Accept: 'after Fill or Accept keyboard focus lands in the panel' RED→GREEN
Final: fixed flaky 'Undo takes back a hand-set color' (unseeded projection and no saved baseline): projections seeded, baseline applied first; teamgrid-browser 25/25
Final: Ruling: the projection can leave the LAST open quarter one child uneven (no look-ahead; verified T&T Q4 11/13/12/11 in the demo). Made visible with a red balance note instead of building a new solver. Cost if wrong: Mike sees uneven teams and fixes by hand until a look-ahead solver is built.
Final: Ruling: Assign blanks and Import colors stay allowed on a started or locked quarter (a new child needs a color mid-quarter; an import is a deliberate hand edit); only Re-draw is refused. Cost if wrong: an import can overwrite a locked quarter's colors.
Final: minor (deferred): #6 new season (newSeason) drops the balancing priorities (prio) along with locks and projection
Final: minor (deferred): #8 History prints one cryptic line per child for projection changes ('Team projection for X: -YBG → --BG')
Final: minor (deferred): #10 stateOf: an earlier quarter with no calendar nights and not locked reads 'projected' while a later quarter has started
Final: minor (deferred): #11 Calendar.nights(undefined) throws in firstNight (callers always pass an array)
Final: minor (deferred): #12 class scope with no Sparks/T&T children shows a 'Team sizes, all of Unassigned' row
Final: minor (deferred): #13 sel() escapes only double quotes; an id ending in a backslash would break restoreFocus
Final: minor (deferred): #14 recalculation reasons for soft moves name the first enabled goal rather than a computed cause (falls back to 'turnout' even if all three are off)
Final: minor (deferred): #15 stale proj entries for removed or inactive children are never cleaned (about 32 bytes each)
Final: minor (deferred): #17 doubled rendering after setColor/lock/fill/accept (refresh() then renderTeams())
Documentation pass (Mike, 2026-11-03): manual rewritten for the final behavior; (i) notes games.year and options.priorities added (manual Options guide regenerated); README (modules, data format, load order, versioning, open items); COLOR-TEAMS.md (new reference); SHEET-TABS.md; test-data notes; spec and plan status notes. App version 1.50.3 (index.html changed after the 1.50.2 deploy build, so the deploy script required a bump). Committed 03e1ec5. NOT deployed.
