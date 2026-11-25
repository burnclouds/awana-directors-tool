# Playtest channel (brief for Sol)

**Roles:** GPT Sol (Low). Work on the `playtest` branch. Do not push, do not publish, do not commit unless told. Run only the closest Node tests. Do not run the browser suite. Report pass/fail counts and `git status --short`.

**Owner rules:** a playtest build must never write the real club file. Playtest saves go only to the `-playtest` copy beside the real file. The public build (`main`) must be unchanged.

## 1. Build channel from the branch

- `make-deploy.sh` reads the current branch (`git rev-parse --abbrev-ref HEAD`).
- On `playtest`: the build writes to `deploy/playtest/` and sets a build channel value `playtest`, stored in a new small file (for example `build-channel.js`) that the app reads at startup.
- On any other branch (including `public`): output goes to `deploy/` exactly as today, and the channel is `live`. Make no other change to the live build output.

## 2. Playtest file name

- Input name `X.json` becomes `X-playtest.json`.
- If the name already ends in `-playtest.json`, use it unchanged.
- Only the file name changes; the folder stays the same. For Drive, "same folder" means the same Drive parent folder.

## 3. Open and save in playtest

- Open: if the `-playtest` copy exists, open it. Otherwise open the original (read only, never written).
- Save: always write the `-playtest` copy. Create it if it does not exist. Never write the original, locally or in Drive.
- The file name shown in the app is the playtest name when in playtest mode.
- Drive: the same rule. Find or create the playtest file in the original's parent folder.

## 4. Live build unchanged

- Nothing in the `live` channel changes: same save path, same names, same output.

## Tests (Node, invented data only)

- The name function: `awana-2026-27.json` → `awana-2026-27-playtest.json`; `x-playtest.json` → unchanged; `x.json.bak` → `x.json.bak-playtest.json`.
- Playtest open with no playtest copy reads the original and never writes it.
- Playtest save writes only the playtest copy; the original's content is unchanged after save.
- Live channel: save path unchanged (the existing tests still pass).

## Report back

Files changed, tests added and pass/fail counts, `git status --short`, and whether the live output differs from `main` in any file (it must not, except the channel value file if you choose to add it to the live build too).
