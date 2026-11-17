# Notes flags on Person tab fields (plan item 4, stage a)

Status: draft for Mike's review, 2026-11-10. Nothing built.

## What exists

- A flag is kept in the data file (`flags`), listed on the To do tab (Notes and flags card) with **Where**, **Go** and **Clear**. History and Undo cover them. Added in 1.50.32 and extended in 1.50.36 (`level` `attend`, `team`, `field`).
- The Person tab already has a flag beside each Planning Center field (1.50.36, `level: 'field'`).

## Scope of stage (a)

Every Person tab section that holds club data we keep, not only the Planning Center fields:

| Section | Fields that get a flag | Flag `level` / keys |
|---|---|---|
| Club record | Active, No photos, each quarter's colour team, the handbook box (code, date received, note) | `field`, with `field` naming the box |
| Uniform | Each uniform box (size, ordered, received, given out, the no-date tick) | `field` |
| Awards | Each award chip (removing it is already a History entry) | `award` (new level, or `field` with the award name) |
| Awards earned | Each earned row (announced, given, hold) | `field` |
| Planning Center record | Already done (1.50.36) | `field` |
| Guest: not in Planning Center | Each guest field | `field` |
| Attendance and games | Read-only summary: no flag (flags live on the Attendance tab, stage b) | none |

Not in scope: the Attendance tab (stage b), and the awards and uniforms tabs beyond what the Person tab shows (stage c).

## Behaviour (same as the existing flags)

- A flag button sits beside each field. Pressing it adds a note; the flagged field is outlined, and the child's page lists its notes at the top.
- The To do Notes and flags card lists every flag with Where, Go (opens that child on the Person tab at that field) and Clear.
- Flags are stored in the data file only. Nothing is written to Planning Center.
- Clearing a flag removes it; History keeps the entry.

## Format

- No new top-level key. Existing `flags` entries with `level: 'field'` and a `field` naming the box. Older files open unchanged; an app older than this change drops nothing it does not know, but an older app opening a file with these new field names shows an odd *Where* line (same as 1.50.36).
- The CHANGELOG notes the new field names for the Where line.

## Tests

1. Each listed field has one flag button, and pressing it adds a flag listed on To do with the right Where text.
2. Go opens the child on the Person tab at that field; Clear removes the flag and adds a History line.
3. A flag on a field of a child who is later removed from the roster is cleared with that child, as other flags are.
4. Planning Center flags (1.50.36) still work.
5. Files with no flags open unchanged; the flags section is still left out while empty.

## Decisions (Mike, 2026-11-10)

1. **Awards:** a flag on each award chip.
2. **Uniform:** a flag per box (size, ordered, received, given out).
3. **Guests:** in scope now (recommended, and the default in this spec): a guest's record is kept by hand and has no other place for notes. Overrule if you want it held back.
