#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_REPO="$TOOL_ROOT"
PROFILE_KEY=""
PROFILE_FILE=""
INSTALL=0
SKIP_APPLY=0
SKIP_VERIFY=0
SYNC_TEMPLATE=0

usage() {
  cat <<'USAGE'
Usage:
  scripts/build-miniapp.sh <profile-key> [--repo <target-repo>] [--profile-file <file>] [--sync-template] [--install] [--skip-apply] [--skip-verify]

One command flow:
  1. Optionally sync blueBerry common code to target repo
  2. Apply profile to target repo
  3. Run npm run build:mp-weixin in target repo
  4. Verify dist/build/mp-weixin
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
    --install)
      INSTALL=1
      shift
      ;;
    --sync-template)
      SYNC_TEMPLATE=1
      shift
      ;;
    --skip-apply)
      SKIP_APPLY=1
      shift
      ;;
    --skip-verify)
      SKIP_VERIFY=1
      shift
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

PROFILE_ARGS=()
if [ -n "$PROFILE_KEY" ]; then
  PROFILE_ARGS+=("$PROFILE_KEY")
fi
if [ -n "$PROFILE_FILE" ]; then
  PROFILE_ARGS+=(--profile-file "$PROFILE_FILE")
fi
PROFILE_ARGS+=(--repo "$TARGET_REPO")

if [ "$SYNC_TEMPLATE" -eq 1 ]; then
  "$SCRIPT_DIR/sync-template.sh" --repo "$TARGET_REPO"
fi

if [ "$SKIP_APPLY" -ne 1 ]; then
  "$SCRIPT_DIR/apply-profile.sh" "${PROFILE_ARGS[@]}"
fi

if [ "$INSTALL" -eq 1 ] || [ ! -d "$TARGET_REPO/node_modules" ]; then
  echo "Installing dependencies in $TARGET_REPO"
  (cd "$TARGET_REPO" && npm install)
fi

echo "Building miniapp in $TARGET_REPO"
(cd "$TARGET_REPO" && npm run build:mp-weixin)

if [ "$SKIP_VERIFY" -ne 1 ]; then
  "$SCRIPT_DIR/verify-miniapp.sh" "${PROFILE_ARGS[@]}"
fi

echo "Done. Import this directory in Weixin DevTools:"
echo "  $TARGET_REPO/dist/build/mp-weixin"
