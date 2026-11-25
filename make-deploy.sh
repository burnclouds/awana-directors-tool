#!/bin/sh
# Build the live or playtest app locally, with only code, app assets and invented demo files.
set -e
cd "$(dirname "$0")"
branch=$(git rev-parse --abbrev-ref HEAD)
channel=live
target=deploy
if [ "$branch" = playtest ]; then
  channel=playtest
  target=deploy/playtest
fi
# A changed .js or .html file must carry a new version number, so the Debug tab can tell what is running.
ver() { case "$1" in *.js) head -1 "$1" | sed -n "s/.*= '\([^']*\)';.*/\1/p";; *.html) sed -n 's/.*name="app-version" content="\([^"]*\)".*/\1/p' "$1" | head -1;; esac; }
# The published index.html names every script and style with ?v=<app version>, so a new version is fetched fresh instead of coming from the browser's cache (this is what lets the app's "Update now" load the new code).
stamp() { v=$(ver "$1"); sed -E "s/(src|href)=\"([A-Za-z0-9_.-]+\.(js|css))\"/\1=\"\2?v=$v\"/g" "$1"; }
# The scripts are minified (dev/tools/minify.js, terser from node_modules: run "npm install" here once). Line 1 of each script, the version registration, is kept as written.
[ -d node_modules/terser ] || { echo 'STOP: terser is not installed. Run "npm install" in this folder first.'; exit 1; }
build=$(mktemp -d); trap 'rm -rf "$build"' EXIT
mkdir -p "$build/app" "$build/source"
# Strip playtest hooks before the live build so existing release files stay byte-for-byte the same.
live_source() { sed -E '/^[[:space:]]*\/\/ BEGIN PLAYTEST$/,/^[[:space:]]*\/\/ END PLAYTEST$/d; s@ /\* PLAYTEST: ([^*]|\*[^/])* \*/@@g' "$1"; }
rsync -a --exclude test/ --exclude playtest/ --exclude '*.js' dev/app/ "$build/app/"
for f in dev/app/*.js dev/app/*.html; do
  src="$build/source/$(basename "$f")"
  if [ "$channel" = playtest ]; then
    sed -E 's@/\* PLAYTEST: (([^*]|\*[^/])*) \*/@\1@g' "$f" > "$src"
  else
    live_source "$f" > "$src"
  fi
done
if [ "$channel" = playtest ]; then
  playtest_suffix=-playtest.3
  cp dev/app/playtest/playtest.js "$build/source/"
  printf '%s\n' "(this.AwanaVersions = this.AwanaVersions || {})['build-channel.js'] = '1.0.0';" "this.AwanaBuildChannel = 'playtest';" > "$build/source/build-channel.js"
  sed -i -e "s/\(name=\"app-version\" content=\"[^\"]*\)\"/\1$playtest_suffix\"/" \
    -e '/<script src="app.js"><\/script>/i <script src="build-channel.js"></script>\n<script src="playtest.js"></script>' \
    -e '/id="saveSplit"/a\    <span id="playtestFile" aria-live="polite"></span>' \
    "$build/source/index.html"
  for f in app.js app-drive.js app-season.js app-tools.js app-update.js calendar.js calendar-safety.js drive.js reports.js reports-season.js season.js; do
    sed -i "1s/';$/$playtest_suffix';/" "$build/source/$f"
  done
fi
cp "$build/source/"*.html "$build/app/"
[ -f version-history.html ] && cp version-history.html "$build/app/version-history.html"      # the version history page lives in the project root (one copy); it is published with the app
node dev/tools/backlog-html.js "$build/app/backlog.html"
for f in "$build/source/"*.js; do [ "$(basename "$f")" = sw.js ] && continue; node dev/tools/minify.js "$f" "$build/app/$(basename "$f")"; done      # sw.js is a template, written below
stale=""; changed=n
for f in "$build/source/"*.js "$build/source/"*.html; do
  [ "$(basename "$f")" = sw.js ] && continue      # the service worker's version is its release (below), not a line in the file
  b="$build/app/$(basename "$f")"; d="$target/app/$(basename "$f")"
  if [ -f "$d" ]; then
    case "$f" in *.html) same=$([ "$(stamp "$f")" = "$(grep -v 'name="app-source"' "$d")" ] && echo y || echo n);; *) same=$({ cmp -s "$b" "$d" || cmp -s "$f" "$d"; } && echo y || echo n);; esac      # a copy from before minifying is the dev file itself: unchanged too. The app-source line (N9 point 7) is added at deploy time, so it is ignored in the html check.
    if [ "$same" = n ] && [ "$(basename "$f")" != drive-config.js ]; then changed=y; fi      # drive-config.js is replaced by the real one below; it is compared separately
    if [ "$same" = n ] && [ "$(ver "$f")" = "$(ver "$d")" ]; then stale="$stale $(basename "$f") (still $(ver "$f"))"; fi
  else changed=y      # a new script or page
  fi
done
if [ -n "$stale" ]; then if [ -n "$playtest_suffix" ]; then echo "NOTE (playtest build only, live root unchanged): version not bumped:$stale"; else echo "STOP: changed but the version number was not bumped:$stale"; exit 1; fi; fi
# Every check below runs on the build and the source files BEFORE anything in deploy/ is written, so a refused build leaves deploy/ exactly as it was.
bad=$(find "$build/app" -type f ! \( -name '*.js' -o -name '*.html' -o -name '*.css' -o -name manifest.json -o -name 'icon*.png' -o -name icon.svg \))      # the web app manifest and its icons are allowed (PWA)
if [ -n "$bad" ]; then echo "STOP: non-code files in the build (deploy/ was not touched):"; echo "$bad"; exit 1; fi
for f in dev/test-data/*.json dev/test-data/*.csv; do
  [ -f "$f" ] || continue
  case "$(basename "$f")" in *TEST*) ;; *) echo "STOP: $f is not marked TEST, so it is not copied to deploy/app/try/"; exit 1;; esac
done
data=$(ls dev/test-data/*.json 2>/dev/null | sort | tail -n 1)
if [ -n "$data" ] && ! node -e 'process.exit(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).fake === true ? 0 : 1)' "$data" 2>/dev/null; then
  echo "STOP: $data is not marked \"fake\": true, so it is not copied to deploy/app/try/"; exit 1
fi
# The release id: app version + build. A build that differs from what is deployed must carry a new one, or phones keep the old release (the service worker caches per release).
rel="$(sed -n 's/.*name="app-version" content="\([^"]*\)".*/\1/p' "$build/source/index.html" | head -1)+$(sed -n 's/.*name="app-build" content="\([^"]*\)".*/\1/p' "$build/source/index.html" | head -1)"
other=$(cd "$build/app" && find . -type f ! -name '*.js' ! -name '*.html' | while IFS= read -r f; do cmp -s "$f" "$OLDPWD/$target/app/$f" || echo "$f"; done)      # styles, fonts, manifest, icons: new or different
gone=$(cd "$target/app" 2>/dev/null && find . -type f ! -path './try/*' ! -name sw.js ! -name drive-config.js | while IFS= read -r f; do [ -f "$build/app/$f" ] || echo "$f"; done || true)      # deployed files that dev no longer has (none on a first deploy)
[ -n "$other$gone" ] && changed=y
cmp -s "$build/app/backlog.html" "$target/app/backlog.html" || changed=y
[ -f deploy-config/drive-config.js ] && [ -f "$target/app/drive-config.js" ] && ! cmp -s deploy-config/drive-config.js "$target/app/drive-config.js" && changed=y
old=$(sed -n "s/.*const RELEASE = '\([^']*\)'.*/\1/p" "$target/app/sw.js" 2>/dev/null | head -1)
if [ "$changed" = y ] && [ -n "$old" ] && [ "$old" = "$rel" ]; then echo "STOP: files changed but app-version and app-build are unchanged (release $rel). Bump app-version in dev/app/index.html."; exit 1; fi
mkdir -p "$target/app"
rsync -a --delete "$build/app/" "$target/app/"
stamp "$build/source/index.html" > "$target/app/index.html"
if [ "$channel" = live ]; then
  git diff --name-only HEAD -- dev/app > "$build/changed"
  source_changes=clean
  while IFS= read -r f; do
    case "$f" in
      dev/app/playtest/*) continue ;;
      dev/app/*.js|dev/app/*.html)
        if [ -f "$f" ] && git show "HEAD:$f" > "$build/head-file" 2>/dev/null; then
          live_source "$f" > "$build/live-file"
          live_source "$build/head-file" > "$build/live-head"
          if cmp -s "$build/live-file" "$build/live-head"; then continue; fi
        fi ;;
    esac
    source_changes=dirty
    break
  done < "$build/changed"
  sh dev/tools/stamp-source.sh "$target/app/index.html" . "$source_changes"
else
  sh dev/tools/stamp-source.sh "$target/app/index.html" .
fi      # N9 point 7: the source commit (+changes if dev/app is not committed)
# The published copy has the real Google Drive settings (deploy-config/drive-config.js); dev/app/drive-config.js stays empty so development and the tests never reach Google.
[ -f deploy-config/drive-config.js ] && cp deploy-config/drive-config.js "$target/app/drive-config.js"
printf '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=app/index.html"><title>Gonkulator</title><a href="app/index.html">Open the app</a>\n' > "$target/index.html"
# The invented club for "Try it out": only the anonymized test set, and only files that say TEST in their names (the app then treats them as test data).
mkdir -p "$target/app/try"
data=$(ls dev/test-data/*.json 2>/dev/null | sort | tail -n 1)
csvs=$(ls dev/test-data/*.csv 2>/dev/null | sort)
{ [ -n "$data" ] && echo "$data"; [ -n "$csvs" ] && echo "$csvs"; } | while IFS= read -r f; do
  case "$(basename "$f")" in *TEST*) cp "$f" "$target/app/try/";; *) echo "STOP: $f is not marked TEST, so it is not copied to deploy/app/try/"; exit 1;; esac
done
if [ -n "$data" ]; then
  exp=$(echo "$csvs" | head -n 1 | xargs -d '\n' -r -n1 basename); imp=$(echo "$csvs" | tail -n 1 | xargs -d '\n' -r -n1 basename)
  [ "$exp" = "$imp" ] && imp=""
  printf '{"data":"%s","export":"%s","import":"%s"}\n' "$(basename "$data")" "$exp" "$imp" > "$target/app/try/manifest.json"
fi
# The service worker (plan item 2): its release is this app version and build, and it keeps every file of this deploy except try/ (the sample club, fetched as it is).
# index.html is in the list too, as the page the app opens to when offline.
list=$(cd "$target/app" && find . -type f ! -path './try/*' ! -name sw.js | sed 's#^\./##' | sort)
json=$(printf '%s\n' "$list" | node -e 'const l=require("fs").readFileSync(0,"utf8").split("\n").filter(Boolean);process.stdout.write(JSON.stringify(l))')
cache_prefix=awana-shell-
[ "$channel" = live ] || cache_prefix=awana-playtest-shell-
sed -e "s|awana-shell-|$cache_prefix|g" -e "s|__RELEASE__|$rel|" -e "s|__SHELL__|$json|" dev/app/sw.js > "$target/app/sw.js"
bad=$(find "$target" -path "$target/playtest" -prune -o -type f ! -path "$target/app/try/*" ! \( -name '*.js' -o -name '*.html' -o -name '*.css' -o -name manifest.json -o -name 'icon*.png' -o -name icon.svg \) -print)      # the web app manifest and its icons are allowed (PWA)
bad="$bad$(find "$target/app/try" -type f ! \( -name '*TEST*.json' -o -name '*TEST*.csv' -o -name manifest.json \))"
if [ -n "$bad" ]; then echo "STOP: non-code files in deploy/:"; echo "$bad"; exit 1; fi
echo "$target/ refreshed:"; find "$target" -path "$target/playtest" -prune -o -type f -print | sort
