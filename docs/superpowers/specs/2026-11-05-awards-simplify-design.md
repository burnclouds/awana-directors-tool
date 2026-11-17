# Awards tab simplification: design

Date: 2026-11-05. App at 1.50.8. Stay in the 1.50.x series and bump the third number (see README, *Changing and deploying*). Do not change the data-file format version.

## Why

Mike runs this every club night:

1. Before club, he generates slides of what children earned on the previous club night. They are shown at the opening ceremony.
2. In handbook time, each room leader gets the by-class hand-out report for their room and gives out awards.
3. Leaders mark each award **Given** on the child's **Progress** sheet. Given is not ticked on the Awards tab.
4. A child who is absent stays unGiven, so their award carries over on the hand-out report the next week. It must not reappear on the announcement slide.

The Awards tab today does more than that: it has Given ticks in three places, a *Told to the group* history, and a *Move or undo a night…* tool. Mike wants the tab to be only the announcement-slide workflow plus the hand-out report.

## Goals

- **Announce page = "earned and not announced".** The slides show every earned award that is not announced and not held. Mike can change Progress and regenerate slides as often as he likes; the same awards stay on them until he clicks **Mark all announced**.
- **Mark all announced** stamps those awards as announced on the club night chosen in the bar (default: the next club night on or after today, as now). After that they never appear on slides again. It skips held awards.
- **Hold.** A Hold checkbox on each row of the Announce list (Mike's choice "A"). A held award stays on the list (dimmed), is left off the slides and the read-off list, and is skipped by *Mark all announced*. It stays held until Mike unchecks it. Hold is the same stored flag as on Progress (see below), so the checkbox on either screen changes both. Holding is optional: with no hold, nothing changes for him.
- **Hand out page is kept** (by-class list, *Printable list by class…*, the *To have ready* tally). It lists everything earned and not Given, whether or not announced or held, minus awards on the left-off-the-slide list and the end-of-year awards, as now. The by-class print report (`handOut` in `reports-season.js`) is unchanged in what it lists.
- **Given is set on Progress only.** Remove every Given control from the Awards tab: the Announce list's Given column (the *announce and hand out together* case), the *Told to the group* rows, the Hand out table, and the End-of-year table. The Hand out and End-of-year tables become read-only lists with an *Announced* column (date or "not yet").
- **Progress sheet.** Each earned award shows its Earned date, an **Announced** date (editable: a date, or blank to un-announce; the way to fix a wrong click), a **Hold** checkbox, and its existing Given date plus *no date* tick. Existing Given behavior on Progress is unchanged.
- Remove: the *Told to the group* section, **Move or undo a night…**, the `awFix` state and panel, and the per-row × pull-back.

## Non-goals and anti-goals

- No change to how awards are earned (Progress, attendance, Blue Jewels, books), to Given semantics (`given`, `givenNoDate`, `givenShown`), or to the end-of-year concept.
- Do not make any Given tick reachable from the Awards tab again.
- Do not announce anything implicitly. Only the button (or editing Announced on Progress) announces.
- No history, undo-by-night, or move-night feature. Undo/Redo and the History tab already log every edit; that is the safety net.
- Do not put children's names in tests, docs or the changelog.

## Data model

Keep `awards[date][id] = [award, ...]` as the announced record (unchanged). Add one optional section, `held`, handled everywhere `givenNoDate` is handled (empty ones left out of the file; `toJson`/`fromJson`, `SECTIONS`, `AREA` for History, merge (`Season.merge3`), award renaming, new season clears them, Validate, the `fromJson` known-key list). `givenNoDate` is the pattern to copy; search `season.js` for it.

- `held[id] = [award, ...]`: awards held off the slides. Cleared automatically when the award is announced.
- **Manual awards are dropped** (Mike, 2026-11-05: "we don't use them"). Remove *Add an award by hand…* and its code (the `awHand*` controls; `addAward` as a hand entry). There is no `handEarned` section. An award already recorded by hand in an existing file stays in `awards[date]` as an announced award, untouched. The Announce list only lists awards the app works out (Progress, attendance, Blue Jewels). The Adult Memorization entries (`adults`) are a separate feature and stay.

An older app (before this version) drops the new `held` section when it saves; say so in the README and manual as was done for `givenNoDate`. Holds would be lost by an old copy, so Mike should update all browsers.

## Behavior details

- **Pending list** (new `Season` function, pure, tested): per child, `awardLedger` earned awards (Progress, attendance, Blue Jewels) that are announced on no night, are not on the group's left-off-the-slide list, are not from before the first club night (existing rule), and are not held. `announceDue` in `app-season.js` already computes most of this; reuse or replace it. The Announce page shows the held ones too (dimmed, box checked) so they are not forgotten; the slide model gets only the unheld ones.
- **Slides use the pending list**, not `awards[date]`. `Season.slideAwards(s, date, group, ids)` currently reads `s.awards[date]`; change `slides.js` (the 1920×1080 pictures, one per group, Sparks by handbook column) to use the pending list. The *Read-off list…* button is removed. The bar's night picker now only decides which night *Mark all announced* stamps and what the slide title says.
- **Reports: the only awards report is the hand-out report** (Mike, 2026-11-05): who has earned an award but not received it (not Given), by class, across all dates this club year. That is the existing `handOut` report and the Hand out page's *Printable list by class…*. So the *Weekly awards (printable)* report (`weeklyAwards`) and the Awards tab's *Read-off list…* button are removed; the announcement is the slides. Reports > *Awards status (earned, announced, given)* (`awardStatus`) is also removed: Mike sees it as the same thing as the by-class report, which it largely duplicates (it adds announced and given columns and night/status filters, none of which are wanted now). The end-of-year printable list (`ceremony`) is kept. Remove `awardStatus` from `reports-season.js`, its entry in the report list and bundles, its manual text, and `awards-fix-browser.test.js`'s status checks; the Person tab still shows a child's Earned/Announced/Given table.
- **End-of-year awards** (`config.endOfYear`): pending and announced exactly like others, held-able, but on the Hand out page they stay in the separate End-of-year list (no Given tick; Given on Progress).
- **Counts**: the Announce badge = pending count (including held? Builder's call: exclude held so the badge reads zero when only held remain). The Hand out badge = earned and not Given, as now. The To do card *Awards earned, not yet given* (with *Open Awards*) stays.
- **Mark all announced** announces only what the current bar filters show (group, class, type), as *Announce all* does today. Label shows the count, e.g. "Mark all announced (5)".
- Un-announcing by clearing Announced on Progress: remove the award from `awards[date]`; its Given date, if any, stays (the earlier rule that clears Given on un-announce is dropped, since Given is independent: the code comment on `Given does not wait for Announced` already says so). Remove the `removeAward` side effect that clears Given.
- Removed functions: `moveAnnouncements`, `unannounce` (and exports, tests). `waitingToGive` is used by the removed hand-out logic in `toGive`; check whether anything still calls it after the change and delete if not.

## Parts to touch (from a read of the code)

- `season.js`: new sections, pending list, `setHold`, `setAnnounced(s, id, award, date|'')`, `addAward` split into earned-by-hand vs announce, `removeAward` without the Given side effect, remove move/unannounce, `slideAwards` replacement, history `AREA`, merge, fromJson/toJson.
- `app-season.js` (lines ~389-554 in 1.50.8): `announceSection`, `announcedSection` (delete), `handOutSection`, `ceremonySection`, `fixPanel` and handlers (delete), `givenCell` (remove from the Awards tab), `renderAwards`, `btnAnnounce`.
- Progress record screen (where Given dates are entered today): add Announced and Hold. Find it by searching for `setGiven(` and `data-given`.
- `app-person.js` line ~99: the Person tab's awards table has *Told to the group* and *Given* columns. Show Hold too, or leave unchanged (builder's call).
- `slides.js`, `reports-season.js` (`weeklyAwards` at ~26, `handOut` ~115, `ceremony` ~104; end-of-year report ~126 uses the ledger and is unchanged).
- `index.html`: the manual's Awards section (line ~496) and the Progress bullets; `info.js` notes `awards.states` and `awards.slides` (the (i) buttons; `test/info.test.js` fails if text and manual differ, so run `node dev/tools/sync-guide.js`).
- README (*Tabs*, *The data file* rows for `awards`, `given`, `givenNoDate`, new `held`), `CHANGELOG.md`, the version line of every changed `.js` file, `app-version`/`app-build` in `index.html`.
- `make-deploy.sh` refuses unbumped changes; deploy only when Mike asks.

## Tests

Update or delete: `awards-ledger.test.js` (move/undo), `awards-lifecycle.test.js`, `given-nodate-browser.test.js` (no-date on Awards), `awards-fix-browser.test.js`, `awards-manager-browser.test.js`, `awards-badge-browser.test.js`, `awards-recalc-browser.test.js`, `slides.test.js`, `past-years-*`, `assumed-given-browser.test.js`, `uniform-given*` only if touched. Add: pending list (earned, announced, held, hand-earned, before-first-night, left-off list), hold round-trip through the file and History and Undo, merge3 with holds, mark-all skips held, slide model uses pending, Announced edit on Progress un-announces without clearing Given, Hand out page shows held and announced awards but no Given ticks, a browser test of the Hold box on both screens.

## Left to the builder

Exact wording and layout on the Awards tab and Progress (follow the mockup: Announce/Hand out pages, bar, buttons *Slide images…*, *Award lists…*, *Mark all announced (n)*, Hold column); the badge rule for held awards; naming of the Awards-tab report; handling of the Person tab.

## Decisions Mike made (in conversation)

Given only on Progress. Announce page is for slides only. Hand out page kept as is. Announced is a per-award stamp tied to a club night, and a wrong click is fixed by editing Announced on Progress (no history or move tool). Hold is selective, set before generating slides, kept until released, stored once and shown on both the Awards tab and Progress.

## Calls made by Claude (to check)

Hold stays until released. Manual awards are dropped entirely. Weekly awards report in Reports keeps showing the history of a night. Un-announcing leaves Given dates alone. End-of-year awards lose their Given tick on the Awards tab too. Badge excludes held (builder's call).
