#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_REPO="$TOOL_ROOT"
PROFILE_FILE=""
PROFILE_KEY=""

usage() {
  cat <<'USAGE'
Usage:
  scripts/apply-profile.sh <profile-key> [--repo <target-repo>] [--profile-file <file>]

Applies profile values to target repo files:
  package.json
  project.config.json
  src/manifest.json
  src/pages.json
  src/utils/config.uts
  src/utils/http.uts
  src/utils/legal.uts
  src/pages/**/*.uvue brand/contact/copyright fields

If profiles/<profile-key>/static/ exists, its files are copied into src/static/.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo)
      TARGET_REPO="$(cd "$2" && pwd)"
      shift 2
      ;;
    --profile-file)
      PROFILE_FILE="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [ -z "$PROFILE_KEY" ]; then
        PROFILE_KEY="$1"
        shift
      else
        echo "Unexpected argument: $1" >&2
        usage
        exit 1
      fi
      ;;
  esac
done

if [ -z "$PROFILE_KEY" ] && [ -z "$PROFILE_FILE" ]; then
  usage
  exit 1
fi

if [ -z "$PROFILE_FILE" ]; then
  if [ -f "$TOOL_ROOT/profiles/$PROFILE_KEY/project.env" ]; then
    PROFILE_FILE="$TOOL_ROOT/profiles/$PROFILE_KEY/project.env"
  elif [ -f "$TARGET_REPO/profiles/$PROFILE_KEY/project.env" ]; then
    PROFILE_FILE="$TARGET_REPO/profiles/$PROFILE_KEY/project.env"
  else
    echo "Profile not found: $PROFILE_KEY" >&2
    echo "Expected one of:" >&2
    echo "  $TOOL_ROOT/profiles/$PROFILE_KEY/project.env" >&2
    echo "  $TARGET_REPO/profiles/$PROFILE_KEY/project.env" >&2
    exit 1
  fi
fi

PROFILE_DIR="$(cd "$(dirname "$PROFILE_FILE")" && pwd)"
STATIC_SOURCE_DIR="${STATIC_SOURCE_DIR:-$PROFILE_DIR/static}"

set -a
# shellcheck disable=SC1090
. "$PROFILE_FILE"
set +a

export TARGET_REPO

echo "Applying profile:"
echo "  profile: $PROFILE_FILE"
echo "  repo:    $TARGET_REPO"

node "$SCRIPT_DIR/lib/apply-profile.mjs"

if [ -d "$STATIC_SOURCE_DIR" ] && find "$STATIC_SOURCE_DIR" -type f | grep -q .; then
  mkdir -p "$TARGET_REPO/src/static"
  cp -R "$STATIC_SOURCE_DIR"/. "$TARGET_REPO/src/static"/
  echo "copied static assets from $STATIC_SOURCE_DIR"
fi

echo "Profile applied."
