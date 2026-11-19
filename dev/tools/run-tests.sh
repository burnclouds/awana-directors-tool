#!/bin/sh
# Run every dev/app/test/*.test.js, 4 at a time, and summarize. Exit 0 only if no file failed.
# Usage: sh dev/tools/run-tests.sh [--node-only] [name-filter]
#   --node-only   skip the browser (Playwright) tests
#   name-filter   only files whose name contains this text
# Browser tests need Playwright: set NODE_PATH to a node_modules that holds it. When it does not resolve they are
# reported "SKIP (no playwright)". Tests that need real files print "SKIP: needs real files" and count as a skip.
here=$(cd "$(dirname "$0")" && pwd)
app="$here/../app"
nodeonly=0; filter=""
for a in "$@"; do
  case "$a" in --node-only) nodeonly=1 ;; *) filter="$a" ;; esac
done
have_pw=0
(cd "$app" && node -e "require('playwright')" >/dev/null 2>&1) && have_pw=1
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT

run_one() {  # $1 = test file name; writes $out/<name>.res with "status|detail"
  f="$1"
  if grep -q "require('playwright')" "$app/test/$f" 2>/dev/null || grep -q 'require("playwright")' "$app/test/$f" 2>/dev/null || grep -q 'lib/app-page' "$app/test/$f" 2>/dev/null; then      # test/lib/app-page.js is the shared browser setup: a test that uses it needs Playwright too
    if [ "$have_pw" = 0 ] || [ "$nodeonly" = 1 ]; then
      echo "SKIP|no playwright (or --node-only)" > "$out/$f.res"; return
    fi
  fi
  (cd "$app" && NODE_OPTIONS="--require $app/test/lib/pw-dialog-compat.js" timeout 600 node "test/$f" > "$out/$f.log" 2>&1)      # older tests answer the app's own dialogs through their page.on('dialog') handlers (test/lib/pw-dialog-compat.js)
  code=$?
  last=$(grep -E '[0-9]+ passed, [0-9]+ failed' "$out/$f.log" | tail -1)
  if grep -q 'SKIP: needs real files' "$out/$f.log"; then
    echo "SKIP|needs real files" > "$out/$f.res"
  elif [ "$code" = 0 ]; then
    echo "ok|$last" > "$out/$f.res"
  else
    echo "FAIL|exit $code $last" > "$out/$f.res"
  fi
}

files=$(cd "$app/test" && ls *.test.js | grep -F -- "$filter")
export app out have_pw nodeonly
# 4 at a time, portable: start jobs and wait whenever 4 are running.
n=0
for f in $files; do
  run_one "$f" &
  n=$((n + 1))
  if [ $((n % 4)) = 0 ]; then wait; fi
done
wait

ok=0; fail=0; skip=0
for f in $files; do
  r=$(cat "$out/$f.res" 2>/dev/null || echo "FAIL|no result")
  status=${r%%|*}; detail=${r#*|}
  printf '%-5s %s  %s\n' "$status" "$f" "$detail"
  case "$status" in ok) ok=$((ok + 1)) ;; SKIP) skip=$((skip + 1)) ;; *) fail=$((fail + 1)) ;; esac
done
echo "-- $ok ok, $skip skipped, $fail failed"
[ "$fail" = 0 ]
