# Repository Guidelines

## Project Context

This workspace supports AWANA club leadership. The main Git repository is `database/`, a browser app for managing club rosters, attendance, games, awards, progress, and print reports. It has no application server; club data stays in the file the user opens or saves. Keep changes practical for volunteer leaders and protect the privacy of children and families. The workspace-level `CLAUDE.md` (one level up, outside this repository) describes the broader AWANA ministry context and audience; use it as project context when relevant.

## Project Structure

The Git repository is `database/`. Edit app source in `dev/app/`; tests are in `dev/app/test/`; build and maintenance scripts are in `dev/tools/`. Anonymized fixtures and fixture guidance are in `dev/test-data/`, and reference material is under `docs/`. `deploy/` is generated output: make changes in `dev/` and regenerate it when needed. `OG Awards/` is a separate workspace directory outside this repository; do not modify it.

## Build, Test, and Development

Run commands from `database/`:

- `npm install` installs the pinned Terser build dependency.
- `sh dev/tools/run-tests.sh --node-only` runs tests that do not need a browser.
- `sh dev/tools/run-tests.sh` runs the full suite; browser tests use Playwright when available and otherwise report skips.
- `sh dev/tools/run-tests.sh pace` runs tests with `pace` in the filename.
- `sh make-deploy.sh` rebuilds `deploy/`, minifies scripts, and checks release/version and data-safety rules. Review generated changes before committing.

**Test cadence:** During work, run only the closest test file or `--node-only`. Run the full suite only before a commit, and only after the owner confirms.

## Coding & Testing Conventions

Follow the existing vanilla JavaScript style: two-space indentation, semicolons, single-quoted strings, and small focused modules. Keep reusable logic separate from DOM rendering where established. Name tests for the behavior or feature using `*.test.js`; browser tests commonly use `*-browser.test.js`. Add or update the closest relevant test, preferring Node tests for pure logic and browser tests for UI behavior. Keep fixtures anonymized; never add live roster or family information.

## Claude Code and Codex Workflow

- **Claude Code leads design and independent review.** Explore unfamiliar code, resolve architecture questions, and document scope, acceptance criteria, and edge cases. Review the spec and diff before reading the implementer’s conclusions. Focus on correctness, data safety, and missing tests.
- **Codex leads implementation.** Check the plan against the current branch, then own code, tests, integration, and frequent local checkpoints. Fix routine issues and confirmed review findings, and rerun the relevant tests. Bring decisions that change scope or intended behavior back to the design lead and owner. Use separate worktrees for approved parallel work. Prepare release output and publish only when the owner authorizes publication.
- **Start a fresh Codex session for each backlog item.** Resume from the handoff note and the files it names, not from prior chat.
- **Task inbox:** `BACKLOG-add.md` (repo root, git-ignored) is the owner's offline inbox for tasks to hand to Claude and Codex. At session start, read it. For each entry, write a spec under `docs/superpowers/plans/` before any code changes, and record the entry in the handoff note. Leave the inbox entry in place until the work is reviewed and accepted, then remove it. Never copy inbox contents into tracked files without the names check.
- **Maintain one handoff note for active work:** `docs/handoff.md`. Update it at every checkpoint. Record the backlog item or plan, branch and checkpoint commit, changes made, tests run and skipped, open decisions, and the next concrete step. Include the files and decisions a fresh session needs to resume. Keep durable rules here and task details in the backlog and plans.
- **Record Codex usage separately from context.** At each checkpoint, the owner pastes the latest `/status` output, and the handoff note records the five-hour window (only if the plan shows one) and weekly usage with a timestamp and reset times. Mark unavailable or stale readings explicitly. Claude cannot read Codex’s live counters or conversation, so plan from the handoff note. Pause and checkpoint as the five-hour window approaches its limit. At **90% weekly usage (10% remaining)**, stop work: update the handoff note, commit a local checkpoint if the owner has asked for commits, and stop.
- **Commits and pushes:** Commit only when the owner asks. Never push.

## Model Selection

- **Codex, default:** GPT Sol at Low effort for routine implementation, test fixes, and mechanical edits.
- **Codex, complex work:** GPT Astra at Medium effort for complex code implementation and detailed code review.
- **Claude Sonnet:** most management tasks, including planning coordination, handoff updates, and task specs.
- **Claude Haiku:** documentation tasks.
- **Claude Opus:** large-scale review (cross-branch, data safety, security, and release review) and UX/UI recommendations.

Use the cheapest model that fits the task. Escalate to a stronger model when a task fails twice or touches data safety, security, or privacy. Record any model change in the handoff note.

## Changes & Data Safety

Recent commits use concise, feature-led subjects, often with a work-item tag or release number (for example, `N57: ...`). PRs should describe user-visible changes, list tests and build commands run, link related backlog items when applicable, and include screenshots for meaningful UI changes. Mention generated `deploy/` updates.

Before every push, run `node dev/tools/check-docs-for-names.js <real-data.json>` from `database/`, using the owner's real data file kept outside the repository. Resolve every hit before pushing. The script prints file and line numbers only, never the names. Real names must never appear in tracked files.

Keep `dev/app/drive-config.js` empty. Deployment configuration belongs in the separately managed deployment configuration. Only clearly marked `TEST` fixtures may be copied into the demo deployment. Never commit personal data, credentials, or real club exports.
