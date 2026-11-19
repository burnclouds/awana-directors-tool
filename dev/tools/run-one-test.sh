#!/bin/sh
# Runs one test file for dev/tools/run-tests.sh. Writes $out/<name>.res ("status|detail"), writes start and end lines to $PROGRESS,
# and marks the test as running with $out/<name>.run (its start time in seconds).
# Usage (called by run-tests.sh): sh run-one-test.sh <app dir> <out dir> <node-only 0|1> <have playwright 0|1> <test file name>
app="$1"; out="$2"; nodeonly="$3"; have_pw="$4"; f="$5"
progress="${PROGRESS:-$out/progress.log}"
t0=$(date +%s)
echo "[$(date +%H:%M:%S)] start $f" >> "$progress"
echo "$t0" > "$out/$f.run"
if grep -q "require('playwright')" "$app/test/$f" 2>/dev/null || grep -q 'require("playwright")' "$app/test/$f" 2>/dev/null || grep -q 'lib/app-page' "$app/test/$f" 2>/dev/null; then      # test/lib/app-page.js is the shared browser setup: a test that uses it needs Playwright too
  if [ "$have_pw" = 0 ] || [ "$nodeonly" = 1 ]; then
    echo "SKIP|no playwright (or --node-only)" > "$out/$f.res"
    rm -f "$out/$f.run"; echo "[$(date +%H:%M:%S)] skip  $f (no playwright or --node-only)" >> "$progress"; exit 0
  fi
fi
(cd "$app" && NODE_OPTIONS="--require $app/test/lib/pw-dialog-compat.js" timeout 600 node "test/$f" > "$out/$f.log" 2>&1)      # older tests answer the app's own dialogs through their page.on('dialog') handlers (test/lib/pw-dialog-compat.js)
code=$?
last=$(grep -E '[0-9]+ passed, [0-9]+ failed' "$out/$f.log" | tail -1)
if grep -q 'SKIP: needs real files' "$out/$f.log"; then
  status=SKIP; detail="needs real files"
elif [ "$code" = 0 ]; then
  status=ok; detail="$last"
else
  status=FAIL; detail="exit $code $last"
fi
echo "$status|$detail" > "$out/$f.res"
rm -f "$out/$f.run"
secs=$(( $(date +%s) - t0 ))
echo "[$(date +%H:%M:%S)] $(echo $status | tr 'A-Z' 'a-z' | sed 's/^ok$/done /') $f $status ${secs}s" >> "$progress"
exit 0
