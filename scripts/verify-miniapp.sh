#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_REPO="$TOOL_ROOT"
PROFILE_FILE=""
PROFILE_KEY=""
OUTPUT_DIR="dist/build/mp-weixin"

usage() {
  cat <<'USAGE'
Usage:
  scripts/verify-miniapp.sh <profile-key> [--repo <target-repo>] [--profile-file <file>] [--output-dir <relative-output-dir>]

Verifies generated WeChat mini program output:
  - project.config.json appid
  - app.json navigationBarTitleText
  - optional local contact QR file
  - optional RESIDUAL_SEARCH_REGEX
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
    --output-dir)
      OUTPUT_DIR="$2"
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
    exit 1
  fi
fi

set -a
# shellcheck disable=SC1090
. "$PROFILE_FILE"
set +a

OUTPUT_ABS="$TARGET_REPO/$OUTPUT_DIR"

if [ ! -f "$OUTPUT_ABS/project.config.json" ]; then
  echo "Missing build output: $OUTPUT_ABS/project.config.json" >&2
  exit 1
fi

if [ ! -f "$OUTPUT_ABS/app.json" ]; then
  echo "Missing build output: $OUTPUT_ABS/app.json" >&2
  exit 1
fi

ACTUAL_APPID="$(node -e "console.log(require(process.argv[1]).appid || '')" "$OUTPUT_ABS/project.config.json")"
ACTUAL_TITLE="$(node -e "console.log(require(process.argv[1]).window?.navigationBarTitleText || '')" "$OUTPUT_ABS/app.json")"

if [ "$ACTUAL_APPID" != "$MP_WEIXIN_APPID" ]; then
  echo "AppID mismatch: expected $MP_WEIXIN_APPID, got $ACTUAL_APPID" >&2
  exit 1
fi

if [ "$ACTUAL_TITLE" != "$NAVIGATION_TITLE" ]; then
  echo "Navigation title mismatch: expected $NAVIGATION_TITLE, got $ACTUAL_TITLE" >&2
  exit 1
fi

if [[ "${CONTACT_QR_SRC:-}" == /static/* ]]; then
  QR_REL="${CONTACT_QR_SRC#/}"
  if [ ! -f "$OUTPUT_ABS/$QR_REL" ]; then
    echo "Missing contact QR asset in output: $OUTPUT_ABS/$QR_REL" >&2
    exit 1
  fi
fi

if [ -n "${APP_CODE:-}" ]; then
  if ! rg -q "X-App-Code[\"']?:[\"']?$APP_CODE|X-App-Code[\"']?\\s*[:,]\\s*[\"']$APP_CODE" "$TARGET_REPO/src/utils/http.uts" "$OUTPUT_ABS/utils/http.js" 2>/dev/null; then
    echo "X-App-Code not found for APP_CODE=$APP_CODE" >&2
    exit 1
  fi
fi

if [ -n "${MINI_APP_NAME:-}" ]; then
  if ! rg -F -q "$MINI_APP_NAME" "$TARGET_REPO/src/utils/legal.uts" "$OUTPUT_ABS/utils/legal.js" 2>/dev/null; then
    echo "MINI_APP_NAME not found in legal source or build output." >&2
    echo "If this target repo has old template code, rebuild with --sync-template first." >&2
    exit 1
  fi
  for policy_page in pages/policies/user pages/policies/privacy; do
    if [ ! -f "$OUTPUT_ABS/$policy_page.js" ]; then
      echo "Missing local policy page in build output: $OUTPUT_ABS/$policy_page.js" >&2
      echo "If this target repo has old template code, rebuild with --sync-template first." >&2
      exit 1
    fi
  done
fi

if [ -n "${RESIDUAL_SEARCH_REGEX:-}" ]; then
  if rg -n "$RESIDUAL_SEARCH_REGEX" "$TARGET_REPO/src" "$TARGET_REPO/project.config.json" "$TARGET_REPO/package.json" "$OUTPUT_ABS"; then
    echo "Residual template strings found. See matches above." >&2
    exit 1
  fi
fi

echo "Verified build output:"
echo "  output: $OUTPUT_ABS"
echo "  appid:  $ACTUAL_APPID"
echo "  title:  $ACTUAL_TITLE"
