#!/bin/sh
# N9 point 7: writes the source commit into a published index.html as <meta name="app-source" content="...">, straight after the app-build tag.
# Usage: sh dev/tools/stamp-source.sh <index.html> [repo dir]
# The value is the short commit the build was made on, with +changes added when dev/app has uncommitted changes.
# It is "unknown" when the repo dir is not a git checkout (a copy made for a test, for example).
f="$1"; repo="${2:-.}"
src=$(git -C "$repo" rev-parse --short HEAD 2>/dev/null) || src=""
[ -n "$src" ] || src=unknown
if [ "$src" != unknown ]; then
  case "${3:-auto}" in
    dirty) src="$src+changes" ;;
    auto) if ! git -C "$repo" diff --quiet HEAD -- dev/app 2>/dev/null; then src="$src+changes"; fi ;;
  esac
fi
sed -i "s|<meta name=\"app-build\"\([^>]*\)>|<meta name=\"app-build\"\1>\n<meta name=\"app-source\" content=\"$src\">|" "$f"
