# SDD ledger — plan: docs/superpowers/plans/2026-11-05-awards-simplify.md
Pre-flight: T1 produces held/setHold -> T2 consumes; T2 produces pendingAwards/announce/setAnnounced/slidePending -> T3,T4,T5 consume. No conflicts.
Ruling: app is at 1.50.27 (README stale at 1.50.8), so version bump is 1.50.28 — plan said 1.50.9 — cost if wrong: one number.
Ruling: no commits made (Mike has not asked); work is on local branch awards-simplify, uncommitted — cost if wrong: none.
Ruling: 1.50.27 already removed the Award lists editor button; the spec's "Award lists…" button is not rebuilt — cost if wrong: none.
Ruling: browser tests run with NODE_PATH=/home/burnclouds/.npm/_npx/e41f203b7505f1fb/node_modules (cached chromium) — cost if wrong: none
Ruling: browser tests run with NODE_PATH=<scratchpad>/shim/node_modules (re-exports barrowlight playwright-core 1.64.1, matches cached chromium 1248)
