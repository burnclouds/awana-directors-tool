# Flag anything (design spec, 2026-11-10)

Status: BUILT in dev 2026-11-12 (see BACKLOG item K). Not deployed. Updated 2026-11-12 (1.51.04): flags and notes are started only by the Flag button and the To do "Add note" box; a flagged place shows a yellow flag whose popup edits or clears the note (plan: docs/superpowers/plans/2026-11-12-flag-markers.md).

## Goal
Any element on any tab can be flagged as a reference for a note. The Debug, Statistics and Uniforms tabs get the same flags as everywhere else. The per-tab "Note" buttons added on 11-10 are replaced by this and removed with it.

## Decisions (from Mike, 11-10)
- The flag button sits in the **top bar**, on every tab.
- Click it to enter **flag mode**. Click any element to flag it. Press Esc or the flag button again to leave flag mode.
- Anything can be a reference. The label is the identifier (not screen position).
- After the click, a note box opens. The flag is saved to the file and listed on To do, like the other flags.

## How the clicked object is identified
A flag does not point at a DOM node. Screens are redrawn constantly, so a stored node would vanish. The flag stores a **trail**, a breadcrumb of labels:

1. **The element's own label:** its visible text, or, for an empty control (an empty box, an icon button), the nearest label beside it (`aria-label`, the `label` text, or the cell's column header).
2. **The trail upward:** walk up from the element and collect, in order, the nearest section heading (`h2`, `h3`, `.plabel`, `summary`), then the row name (first cell of the row), then the tab name.
3. **Row index tie-breaker:** when two rows share a name, store the row's position among rows with that name, so the flag can find the right one.
4. **Stored form:** `{ level: 'element', tab, trail: [..], label, rowIndex }` in the file's flags, with the trail also kept as readable text (for example `Statistics › Club nights › 10/14 › Count`).

## Showing and jumping
- To do shows the readable trail in the "Where" line.
- **Go** opens the tab, then looks for the element by matching the trail from the top down. It scrolls to the match and highlights it.
- If the trail no longer matches (the label changed or the row is gone), the flag still shows, marked "spot not found", and Go opens the tab only.

## Limits
- Identical labels in one section match the row index, not the content. A table reordered after the flag was made can point at the wrong row. The flag then shows the stored label, so the leader can see it.
- Flags on charts and drawn images use the nearest heading only.
- No element stores data of its own: the flag records where and what, and the note is the only content.

## Not in this design
- Merging flags from another file. Flags are carried in the file like other general notes.
- Flags on print-only output.

## Build order (when unparked)
1. Flag button and flag mode in the top bar, with Esc to leave.
2. Trail builder and a unit test on the label-and-trail rules (no browser needed).
3. Save and list on To do, with the readable trail.
4. Go: find by trail, scroll, highlight, and the "spot not found" fallback.
5. Remove the Debug, Statistics and Uniforms Note buttons. Browser test for each tab.
