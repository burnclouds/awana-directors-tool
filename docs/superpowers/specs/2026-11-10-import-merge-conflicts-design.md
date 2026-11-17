# Import merge: conflict screen (draft for review)

Status: DECIDED (2026-11-10), not yet built. The answers are in "Decisions" below; the rest of the draft still describes the plan.

## Decisions (Mike, 2026-11-10)

1. **"Keep mine" exists.** Planning Center does not always win. A pending change of yours that Planning Center contradicts is shown in the decision section with a choice: Use Planning Center, or Keep mine.
2. **Rename with mismatched birthdates defaults to unticked** (the child is added as a new person and the old record is marked inactive), as the draft proposed.
3. **Own screen**, not part of the current review dialog.
4. **One row per child**, but every conflicting field is highlighted in that row. The row shows many fields (name, room, grade, birthdate, medical, contact and others as the export has them), so a person can tell two children apart.

## What exists today

Importing a Planning Center export into a data file that already has people goes through `importPc` (app.js) and then `Model.planImport` (model.js). When the plan needs a person's decision, the **Review import** screen (`showReview`) opens. Nothing is applied until **Apply import**.

The review screen already shows, in order:

1. **Possible renames** (same person?): checkboxes, ticked when the birthdate matches or the names are close. Unticked means the new row is added and the old one is marked inactive.
2. **New people**: all ticked; untick to skip.
3. **In master but not in the new export**: all ticked, which marks them inactive.
4. **Pending changes out of date**: a count only. These are dropped automatically because Planning Center now has a different value. They are marked inside the field changes.
5. **Reappearing** people: set active automatically.
6. **Marked inactive by you, still in Planning Center**: unticked by default.
7. **Field changes from Planning Center**: a list, with important fields (name, room, medical, contact, grade) marked. The list shows a pending override of yours where one exists.

Conflicts are handled today by a rule, not by a screen: a pending override that Planning Center now contradicts is dropped and PC wins (`superseded`). That is the only automatic conflict resolution.

## The gap

The screen lists every item but does not say which items conflict, which need a decision, and which are safe. A person with a pending change of their own, a rename, and a field change for the same child sees three separate sections with no link between them. The screen also does not say what will be lost if they press Apply.

## Proposed: one conflict section at the top

Show a single section, **Needs your decision**, above the other sections. It appears only when there is something to decide. Each item is one row per child, not one per field. A row contains:

- The child (name, room, grade, birthdate, as the current review screen shows them).
- What the file holds now, and what the export says, side by side.
- A pending change of yours, if there is one, and what happens to it.
- Two choices, with a default:
  - **Use Planning Center** (default when the export is newer than the change)
  - **Keep mine** (only offered when a pending change exists; the change stays pending and the warning bar keeps showing it)

Conflict types that go in this section:

| Type | Example | Default |
|---|---|---|
| Possible rename, birthdate differs | "Lily Smith" in file, "Lily Smyth" in export, birthdates 2016-03-02 vs 2016-03-20 | Not ticked (as now) |
| Pending change contradicted by PC | You set room to Sparks B; PC now says Sparks A | Use PC (as now), but show it here, not only in the list |
| Inactive by you, back in PC | Marked inactive, export still lists them | Stays inactive (as now) |
| Important field changed in PC while a pending change of yours exists on another field | You changed phone; PC changed room | Both apply: PC's room, your phone |

The last row is new. Today it is not a conflict, because the superseded rule works per field. Keep it that way unless Mike decides otherwise; it is listed here so the screen can show that the two changes do not clash.

Everything else stays in its current section, collapsed by default when it has no decision in it.

## What does not change

- Nothing is applied until **Apply import**. Cancel leaves the file exactly as it was and marks the export as declined (`lastPc.declined`), so a later open does not apply it.
- Planning Center stays the source of truth. The screen never edits a PC field; it only chooses between PC's value and a pending change.
- The matching rules (`matchKey`) do not change.
- The import summary alert after Apply does not change, apart from counting conflict rows decided by the person.

## Acceptance checks (for the test that will be written)

1. An import with no pending changes and no renames shows no "Needs your decision" section.
2. A rename with a birthdate mismatch appears in the decision section, unticked. Apply adds the export's row as a new person and marks the old record inactive (the current behavior for an unticked rename).
3. A pending change contradicted by the export appears in the decision section with "Use Planning Center" selected, and after Apply the pending change is gone and the file holds PC's value.
4. Choosing "Keep mine" keeps the pending change, and the red warning bar still lists it after Apply.
5. Cancel leaves the data file byte-for-byte unchanged.
6. Two changes to different fields of one child (one yours, one PC's) produce no decision row and both apply.

## Open questions for Mike

1. Should "Keep mine" exist at all? If PC always wins, the pending change should just be shown in the decision section as dropped, with no choice.
2. For a rename with mismatched birthdates, is the default right (not ticked, so the child is added as new and the old one is inactive)? That means a duplicate record for the same child if the rename was real.
3. Should the decision section be a separate screen, or stay in the one review dialog? The current dialog is already long.
4. Is "one row per child" right, or should each conflicting field be its own row?
