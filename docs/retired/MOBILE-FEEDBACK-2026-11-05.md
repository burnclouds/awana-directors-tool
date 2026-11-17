# Mobile / UX feedback, saved 2026-11-05 (for later consideration, nothing implemented)

Source: pasted external reviews (AI-generated, written from source reading, not verified), plus Claude's assessment and a Pixel-4-size (393x851) Playwright check against the anonymized test file (v1.50.35 dev). Related: `UX-REVIEW-2026-11-03.md` already did much of the phone work.

Workflow facts from Mike: he enters data on a phone, at the end of the night, kid by kid (per child, not per section). Pixel 4 and larger can be assumed.

---

## Part 1: First review (general app) , pasted verbatim

* **File Management & Auto-Save Defaults**: The application currently defaults to local downloads (`awana-<year>-<yyyymmdd-hhmmss>.json`), which requires users to manually track versions. While optional Google Drive integration exists, enabling auto-save by default (when configured) would significantly lower the risk of data loss for non-technical volunteers who might forget to download their session file.
* **Mobile Responsiveness & Table Usability**: On narrow viewports (screens under 760px), large grids like attendance and progress sheets collapse into horizontally scrolling tables. Implementing a card-based alternative view for mobile devices would make checking off attendance or entering progress markers much easier on smartphones.
* **Planning Center Sync Transparency**: Edits made locally to fields owned by Planning Center are tracked as "pending changes", which can occasionally cause confusion if a user expects them to sync automatically back to Planning Center. Adding an explicit, one-click export feature for these pending changes formatted specifically for Planning Center re-importing would close this workflow loop.
* **Keyboard Navigation & Focus Management**: Although the application features extensive keyboard shortcuts (such as pressing `P` on a checkbox to open a person's profile), focus trapping inside modal dialogs (like the Planning Center import review or warning popups) could be made more robust to fully support screen readers and keyboard-only power users.
* **Offline Asset Caching & Error Handling**: Because the app relies heavily on separate modular JavaScript files (`app-person.js`, `app-store.js`, `teams.js`, etc.), a temporary network hiccup or caching mismatch during an update check could cause partial script loads. Introducing a robust Service Worker layer with a pre-cached offline shell would ensure reliable field usage even in remote church buildings with poor Wi-Fi.

### Claude's response (first review)
1. Service worker / offline: most valid point (no serviceWorker found in the project). Needs versioned cache names and an "update ready" prompt, or a cache-first worker serves stale code. Read the existing update-check flow first.
2. Focus trapping: mostly a non-issue. Native `<dialog>.showModal()` traps focus; the 11-03 review confirmed modals inert the page and Esc works. Only audit non-dialog overlays.
3. Planning Center export: useful idea, shaky claim. Depends on PC's import templates; a plain "changes to make in PC" checklist is likely the safer, smaller win.
4. Auto-save by default: maybe. Silent writes can overwrite a good file with a bad session. Prefer an "unsaved changes" warning or a rolling backup file.
5. Mobile card view: low priority, a second renderer to maintain; cheaper fixes first.
Ranking given: service worker, then unsaved-changes safeguard, then PC checklist. Focus-trap a non-issue; mobile cards can wait.

---

## Part 2: Second review (mobile attendance and progress) , pasted verbatim

Optimizing mobile device use for attendance entry and progress updates in the AWANA Roster & Reports app involves addressing smaller screen real estate, touch target sizes, and efficient navigation.

### 1. Attendance Entry Improvements
* **Sticky Header & Column Locking:** When scrolling through a long roster on a mobile phone, keep the header row (Present, Handbook, Participation, Extra) and child names pinned so users never lose track of which column they are tapping.
* **Haptic Feedback / Visual Confirmation:** Provide an immediate visual pulse or subtle haptic vibration when a attendance checkbox is toggled, confirming the live-save action went through instantly without needing a page refresh.
* **Quick Room & Date Swiping:** Allow horizontal swipe gestures or quick-access chevron buttons next to the room and date selectors to jump between classes or previous nights without opening dropdown menus.

### 2. Progress Updates & Achievement Record Optimizations
* **Dedicated Mobile Sheet View:** On mobile screens, the detailed handbook grid can feel cramped. Introduce a streamlined, single-section card view for the active book that lets leaders tap off individual sections or use the "Today" button with fewer accidental taps.
* **Persistent Bottom Navigation:** Keep the "Previous child" and "Next child" buttons permanently anchored to the bottom thumb-zone of mobile viewports so leaders do not have to scroll back to the top or bottom of a long page between children.
* **Batch Date Entry:** Add a fast-entry mode for progress updates where a leader can pick a date once and tap multiple children or sections to apply it sequentially.

### Claude's response (second review) and Playwright findings
Cheap/low risk: sticky header and name column (needs a single scroll container with a max height), bottom Prev/Next (safe-area inset, keyboard overlap), 44px targets, chevrons.
Skip: swipe (fights table scroll and iOS back-swipe). Haptics: `navigator.vibrate` is Android-only, and there is no live-save, so a pulse implies safety that does not exist.

Already done in the app (11-03 review + my check): Night and Room chevrons; 44px attendance rows and Progress controls; Previous/Next at top and foot of each child's sheet; present count repeated under the table; Download data file first in the phone top bar; scroll shadows on wide tables; modals inert with Esc.
Previously rejected by the 11-03 review (agree): sticky bottom Prev/Next bar (covers the last row being typed into); collapsing dated sections (changes what the sheet shows).

Still open:
1. Progress page is about 7,700px tall for one child; first screen shows chrome and book tabs but no section rows.
2. Attendance header not pinned in a long room (minor; table is only 3-4 columns).
3. No save confirmation; nothing saves until Download. Unchecked whether an unsaved-changes indicator exists.

Suggestions for kid-by-kid end-of-night entry (Claude recommends starting with fill-down):
- Fill down: "Today for all unsigned sections up to here" on a row.
- Jump to next unsigned section after entering a date (auto-scroll/focus).
- "Unsaved changes" dot on the Download button.

---

## Part 3: Third review (attendance CSS for mobile) , pasted verbatim

Based on the provided files for the application, attendance tracking is built around tabular layouts (`#tab-attend` and the `.roster.att` table) where each row represents a person and columns correspond to meeting nights and specific check-in marks like **Present**, **Handbook**, **Participation**, and **Extra**.

To optimize attendance CSS specifically for mobile devices (where screen real estate is constrained and users rely on quick touch interactions), several key CSS strategies can be applied:

### 1. Enforcing Minimum Touch Targets on Table Cells
Standard table cells (`<td>`) or inputs on mobile can be cramped, leading to accidental mis-taps. You can ensure that checkboxes or clickable table cells meet the 48 x 48 px mobile guideline by utilizing padding or setting explicit minimum sizing:
* **Cell Padding & Block Expansion:** Instead of relying on a tiny 16 px native checkbox, expand the clickable area by applying generous padding to the table cell (`td.chk`) or wrapping the input in a block-level label.
* **CSS Example:**
```css
/* Ensure attendance check cells have a comfortable tap target size */
td.chk {
  min-width: 48px;
  min-height: 48px;
  text-align: center;
  padding: 0;
}

td.chk input[type="checkbox"] {
  width: 24px;
  height: 24px;
  cursor: pointer;
}
```

### 2. Sticky Headers and First Columns for Scannability
When a table contains many attendees and stretches horizontally across dates or vertically down names, users can lose track of who they are checking off.
* **Sticky Positioning:** Use CSS `position: sticky` on the table header (`<th>`) and the first column (the child/volunteer names) so they remain locked in view while scrolling through large rosters.
* **CSS Example:**
```css
/* Keep headers sticky vertically */
.roster.att th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f4f4f4;
}

/* Keep the name column sticky horizontally when scrolling sideways */
.roster.att td:first-child,
.roster.att th:first-child {
  position: sticky;
  left: 0;
  z-index: 1;
  background: #fff;
}
```

### 3. Handling Horizontal Table Overflow cleanly
As seen in the app's architecture for narrow viewports (< 760px), wide tables scroll sideways inside their own frame.
* **Smooth Scrolling Container:** Wrap the attendance table in a dedicated scroll container (`.pscroll` or `.scroll`) with momentum scrolling enabled for touch devices.
* **CSS Example:**
```css
.pscroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  width: 100%;
}
```

### 4. Visual Feedback States on Touch
In live-saving modes (where taps are immediately registered without waiting for an "Apply" button), visual feedback assures the user the action went through.
* **Active State Styling:** Style the row or cell to subtly change color immediately upon selection (`:active` or when checked) to give instantaneous confirmation on touch screens.
```css
td.chk input[type="checkbox"]:checked + .custom-indicator {
  background-color: #0066cc;
}
```

### Claude's assessment (third review, from the observed app; code not re-read)
- Touch targets: already met. Rows measured about 45px with a roughly 30px checkbox on phone, and a 44px tap area on coarse-pointer tablets. 48px vs 44px is a marginal difference. Class names (`td.chk`) are unverified.
- Sticky header and first column: the table has only 3-4 columns (#, Name, Present, Year) and fits at 393px, so there is no sideways scroll and a sticky first column buys nothing. Sticky `th` with `top: 0` breaks if the table sits inside an `overflow` container, and it must sit below the app's sticky block (`--stickyh`), not at 0. Worth trying only for long rooms.
- Momentum scrolling: `-webkit-overflow-scrolling: touch` is obsolete (modern iOS does it by default). `.pscroll` already exists, plus scroll shadows from the 11-03 review.
- Touch feedback: the snippet's `.custom-indicator` probably does not exist in this app. The "live-saving" premise is wrong: nothing saves until Download. A `:checked` row tint is fine and cheap; the real gap is the missing unsaved-changes indicator.
- Net: this review adds almost nothing new for phone attendance.

---

## Decisions so far (Mike, 2026-11-05)

- **Fill-down: dropped.** The existing per-section Today button is enough for end-of-night sign-offs.
- **Photo-to-progress agent: shelved.** Gemini reading photos worked poorly. The patch import built in 1.50.26 stays (inert unless used).
- **Service worker goes first.** Needs a short spec before code: read the update-check flow and deploy stamps, versioned caches, "update ready" prompt, rollback path.
- **Sibling emergency contact (wanted), design proposed, not yet confirmed:**
  - Auto-link only by shared Registration ID (never by last name). Different surnames under one registration still link.
  - Suggest (never auto-apply) links when Registration Contact phone, email or home address match; Mike confirms.
  - Manual Link / Unlink household on the Person tab, saved in the data file and logged in History.
  - Display only: never written into the child's Planning Center field, so no pending change.
  - Printed reports show the contact on every row, borrowed ones marked "(from sibling NAME)".
  - To do: a child with a family contact is not flagged; a family with no contact anywhere is flagged once.
- **Color teams: Mike is considering dropping friend placement, guests (Visitor tab, [visitor] bubble)** and handling them manually. Open: whether the one-step mid-quarter move and per-class rules stay. If the Visitor tab goes, guests need a paper sign-in slip for medical and pickup details.
- **Still unanswered:** confirm the household-link design; color-teams scope.

Open question for later: is "jump to next unsigned section" still wanted now that fill-down is gone? (Not discussed.)

## Update (Mike, 2026-11-05, later)

- **Sibling emergency contact / household linking: DROPPED.** Too complex to maintain for one field (e.g. a child like Bernard in a family with a different Registration ID would need manual links). Keep the existing per-child warning (`todo.js` details missing, `validate.js` no emergency contact). Supersedes the household-link design above and the "Family emergency contacts" backlog item: decided, no change.

## Update: "everything saved lives in the file" (Mike, 2026-11-06)

Principle: nothing "saved" is kept outside the current data file; defaults live in the file and in code (`Catalog.defaultConfig()`), new files get the defaults, old files missing a key get the default on open. Browser never overrides the file.

Trigger: another volunteer's Drive saves made timestamped files (`awana-2026-27-20261106-000010.json`) instead of `mike_working_file.json`, because the save style (`awana-drive-style`) is a per-browser setting defaulting to `dated` (`app-drive.js:17`).

Decisions:
- **View toggles** (todo view, attendance hold, recent-places fold): no persistence; each visit starts at the default.
- **Quarter:** derived from the calendar and today's date (`Calendar.currentQuarter`). Only the hand override (7 days, browser-stored) persists; make it session-only.
- **Meeting dates (`settings.dates`):** only a fallback for reports when no calendar is loaded (`reports.js:45`); the calendar is already saved in the data file, and the default string is hard-coded to 2026 dates. Remove.
- **Club title:** auto-derived from the season year ("AWANA Club 26-27"); typed override removable. Used on the pace-watch subtitle (`reports-season.js:166`); slides use their own `s.club`.
- **Motto:** nothing reads it except its input boxes. Remove.
- Net: `awana.settings` goes away entirely. Check Reports, Options fields, `info.js` help text, tests, manual.
- **Save style:** in the file config. Google Drive default = one file kept up to date. Local files: default is a single file where possible, but there must always be a "Save as…". The app does not use the File System Access API today, so local saves are fresh downloads; true overwrite works only in Chrome/Edge.
- Stay outside the file: Drive sign-in tokens, the update-reload sessionStorage handoff (removed as read), service-worker app cache (code, not data).
- Order: do this before the service worker (fixes a real cross-user problem).

## Update (Mike, 2026-11-06, later)

- **Local save approach: approved.** Download named after the opened file (no timestamp), always a "Save as…", and true overwrite in Chrome/Edge via the File System Access API with download fallback.
- General To do note: already built (1.50.34) and in the deploy folder (1.50.35).
- **Notes flag on "every data field": wanted.** Scope not yet confirmed. Proposed stages: (1) Person tab fields, (2) attendance, one flag per child per night, (3) awards and uniforms. Reuse the existing flag mechanism (stored in file, listed on To do with Where and Clear).

## Current plan order
1. Everything-in-the-file settings work (save style in config, remove `awana.settings`, view toggles not persisted, quarter override session-only, local save approach above).
2. Service worker (short spec first).
3. Unsaved-changes dot on Download.
4. Notes flags on data fields (staged).
5. Checked-row tint on Attendance.
6. Pace thresholds after about 11-25.
7. Color teams (scope pending).

## Release 1.50.36 (deployed 2026-11-06, commit 76f2433)

Shipped: To do notes wrap; Same date as paste (Given, Announced, Received, first box of a row) with Now / Same labels on phones; phone child bar on Progress; Tab after month and day; notes on Attendance, Color teams and Person fields (Where / Go / Clear); No team for a quarter. Fill-down, photo agent and household emergency-contact linking were dropped.

Still open from the plan: everything-in-the-file settings work (save style in config, remove `awana.settings`, view toggles not persisted, quarter override session-only, local Save as / overwrite in Chrome and Edge); service worker (spec first); unsaved-changes dot on Download; checked-row tint on Attendance; pace thresholds after about 11-25; color teams scope (friend placement and Visitor tab likely dropped). Not run because they need real data files as arguments: browser, import-test-file, migrate-db, roster, anonymized-data, reports-season.
