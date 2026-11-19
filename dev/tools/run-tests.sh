#!/bin/sh
# Run the dev/app/test/*.test.js files and summarize. Exit 0 only if no file failed.
# Usage: sh dev/tools/run-tests.sh [--node-only] [--changed] [name-filter]
#   --node-only   skip the browser (Playwright) tests
#   --changed     the node tests (no browser) plus the browser tests that name a file changed since the last commit
#   name-filter   only files whose name contains this text
#   JOBS=n        tests at once (default 4). Each test starts its own browser, so raise it only if the machine has the room.
#   PROGRESS=path where the start and end of each test are written (default: a file in the run's temporary folder, printed first).
#   While it runs: a line per test that starts and finishes, and a heartbeat every 30 s listing what is still running (a test over 120 s is marked slow).
# Browser tests need Playwright: set NODE_PATH to a node_modules that holds it. When it does not resolve they are
# reported "SKIP (no playwright)". Tests that need real files print "SKIP: needs real files" and count as a skip.
here=$(cd "$(dirname "$0")" && pwd)
app="$here/../app"
repo="$here/../.."
nodeonly=0; changed=0; filter=""
for a in "$@"; do
  case "$a" in --node-only) nodeonly=1 ;; --changed) changed=1 ;; *) filter="$a" ;; esac
done
JOBS=${JOBS:-4}
have_pw=0
(cd "$app" && node -e "require('playwright')" >/dev/null 2>&1) && have_pw=1
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
export PROGRESS="${PROGRESS:-$out/progress.log}"
: > "$PROGRESS"
echo "progress: $PROGRESS (tail -f it from another window to follow the run)"
t_start=$(date +%s)

files=$(cd "$app/test" && ls *.test.js | grep -F -- "$filter")
if [ "$changed" = 1 ]; then
  # Files changed since the last commit, under dev/app (edited, staged or new). A test is picked when its source names one of them.
  changed_files=$( (cd "$repo" && git diff --name-only HEAD -- dev/app; git ls-files --others --exclude-standard dev/app) | sed 's|.*/||' | grep -E '\.js$|\.html$|\.css$' | sort -u)
  if [ -z "$changed_files" ]; then echo "--changed: nothing changed under dev/app since the last commit"; echo "-- 0 ok, 0 skipped, 0 failed"; exit 0; fi
  picked=""
  for f in $files; do
    # Node tests (no browser) always run: they are quick and cover the data and logic.
    if ! grep -q "require('playwright')\|require(\"playwright\")\|lib/app-page" "$app/test/$f" 2>/dev/null; then picked="$picked $f"; continue; fi
    for c in $changed_files; do
      if grep -q -F -- "$c" "$app/test/$f" 2>/dev/null; then picked="$picked $f"; break; fi
    done
  done
  files=$(echo $picked | tr ' ' '\n' | sort -u)
  echo "--changed: $(echo $changed_files | wc -w) changed file(s), $(echo $files | wc -w) test(s) name them"
fi
total=$(echo $files | wc -w)
export app out have_pw nodeonly

# Worker pool: JOBS tests at a time, a new one starts as soon as one finishes (no waiting for a whole batch).
printf '%s\n' $files | xargs -P "$JOBS" -I{} sh "$here/run-one-test.sh" "$app" "$out" "$nodeonly" "$have_pw" {} &
pool=$!
while kill -0 "$pool" 2>/dev/null; do
  sleep 30
  kill -0 "$pool" 2>/dev/null || break
  done_n=$(ls "$out"/*.res 2>/dev/null | wc -l)
  now=$(date +%s); running=""
  for r in "$out"/*.run; do
    [ -f "$r" ] || continue
    name=$(basename "$r" .run); age=$(( now - $(cat "$r") ))
    if [ "$age" -gt 120 ]; then running="$running $name(slow ${age}s)"; else running="$running $name(${age}s)"; fi
  done
  echo "[$(date +%H:%M:%S)] heartbeat: $done_n/$total done, $(( (now - t_start) / 60 ))m$(( (now - t_start) % 60 ))s elapsed; running:${running:- none}"
done
wait "$pool" 2>/dev/null

ok=0; fail=0; skip=0
for f in $files; do
  r=$(cat "$out/$f.res" 2>/dev/null || echo "FAIL|no result")
  status=${r%%|*}; detail=${r#*|}
  printf '%-5s %s  %s\n' "$status" "$f" "$detail"
  case "$status" in ok) ok=$((ok + 1)) ;; SKIP) skip=$((skip + 1)) ;; *) fail=$((fail + 1)) ;; esac
done
echo "-- $ok ok, $skip skipped, $fail failed  ($(( ($(date +%s) - t_start) / 60 ))m$(( ($(date +%s) - t_start) % 60 ))s)"
[ "$fail" = 0 ]
