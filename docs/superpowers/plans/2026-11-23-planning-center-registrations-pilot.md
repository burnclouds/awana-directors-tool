# N71 Planning Center Registrations pilot

The first checkpoint implements a read-only snapshot and a proposed roster diff. It can be exercised with mocked responses and does not register a callback, edit the roster, or enable a new import route. The pilot must verify the public OAuth flow and compare one authorized TEST signup and CSV before making the workflow available to leaders. [Unified backlog plan](2026-11-23-unified-open-backlog-plan.md)

## Field coverage to verify

Compare a single signup's API snapshot with its CSV from the same time window. Work with invented test data and report aggregate mismatch counts. The table distinguishes what the public reference specifies from what still needs verification. [Registrations API](https://api.planningcenteronline.com/docs/apps/registrations) · [Attendee CSV fields](https://help.planningcenter.com/en/139346-create-reports-on-attendees.html) · [Roster column roles](../../../dev/app/model.js)

| App data | Candidate source | Pilot decision |
|---|---|---|
| First and last name | Attendee → Person → `first_name`, `last_name` | Preview changes. Review missing or blank names before using them for a new record or an update. |
| Attendee, registration and person identity | Attendee ID plus related Registration and Person IDs, scoped by organization and signup | Use the confirmed link to a frozen local ID. Check whether CSV Registration ID equals the API Registration ID and whether the related Person ID is identical across products. Compare siblings under one registration and two organizations with the same numeric ID. |
| Roster status | Attendee `active`, `canceled`, `waitlisted` | Show observed status separately. Confirm API list coverage and CSV Status meaning. A failed or incomplete read cannot support deactivation. |
| Selection | Attendee → SelectionType → `name` | Verify values against the signup CSV, including volunteer and child selections. A selection is not an assigned class. |
| Emergency contact | Attendee → EmergencyContact → `name`, `phone_number` | Test the rendered contact and missing or explicitly blank fields. Keep inaccessible fields out of the proposed changes. |
| Registration contact | Registration → `registrant_contact` → name | Show independently of emergency contact and of the custom parent-phone answer. Registrations Person does not document contact phone or address data. |
| Grade, birthdate, profile medical notes and other profile information | Potential People API scope and verified person link | Outside the first Registrations pilot. Verify scope, identity and actual availability before making a People field eligible. A profile medical note does not substitute for a signup answer. |
| Class assignment, authorized pickup, allergy or photo instructions, custom parent phone, uniforms and sizes | No corresponding documented Registrations answers, assignments or add-ons resources | Keep CSV supplementation. Retain the last known value and identify the source if API data is unavailable. |
| Payment totals, timestamps and other export columns | Some registration-level totals exist. Per-attendee amounts, discounts, exports' submission dates, attendance statuses and arbitrary columns need separate verification. | Leave the original CSV values intact. Money fields remain outside the initial roster preview. |

## Running the pilot safely

1. Use a public OAuth client with the actual app's registered HTTPS redirect and S256 PKCE. Check state and the callback's exact site and path. Test sign-in, refusal, cancellation and expiry on the deployed origin. Never put client secrets, authorization codes, bearer tokens or raw API responses into season data, test fixtures, deployment files, history or logs. [Authentication](https://api.planningcenteronline.com/docs/overview/authentication)
2. Verify the organization from the authorized Registrations endpoint before reading a selected signup. Complete pagination for every required collection. Keep a failed or rate-limited read distinct from a completed empty collection. Test role permissions and filter coverage with an authorized signup manager, and document which status groups the read returned. [Registrations organization](https://api.planningcenteronline.com/docs/apps/registrations/versions/2025-05-01/vertices/organization) · [Rate limiting](https://api.planningcenteronline.com/docs/overview/rate-limiting)
3. Review uniquely confirmed links, new attendees, canceled attendees and unresolved identities. Review a rename, sibling pair and guest conversion. A person link may only serve Check-Ins matching after its cross-product identity is verified. The result of an API read alone changes no local record.
4. Before implementing Apply, define separate provenance and persistence for API field updates. The existing CSV reconstruction reads stored roster values, so overwriting those values would change reconstruction unless the original CSV values are kept separately. Test API → CSV → API refresh, save/reopen, merge and Undo. Recheck review scope against committed data just before applying. [CSV reconstruction contract](../../DATA-FORMAT.md)
5. Keep Planning Center CSV as a working option regardless of direct-update coverage. Decide with the club what operations can use only the API after checking class placement, safety information and order data.

## Mocked checks in the branch

Run `node dev/app/test/planning-center.test.js` and `node dev/app/test/pc-registrations.test.js`. These cover the public OAuth request and callback, paginated reads, invalid pagination, wrong organization, second-page failures, duplicate links, and a pure preview that leaves captured CSV and roster values intact.
