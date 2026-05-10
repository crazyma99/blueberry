#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FORCE=0
INSTALL=0
PROJECT_KEY=""
TARGET_DIR=""

usage() {
  cat <<'USAGE'
Usage:
  scripts/new-miniapp-project.sh <project-key> <target-dir> [--force] [--install]

Creates a new miniapp repo from the current template and generates:
  profiles/<project-key>/project.env

After creation, edit the profile and run:
  scripts/build-miniapp.sh <project-key>
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --force)
      FORCE=1
      shift
      ;;
    --install)
      INSTALL=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [ -z "$PROJECT_KEY" ]; then
        PROJECT_KEY="$1"
      elif [ -z "$TARGET_DIR" ]; then
        TARGET_DIR="$1"
      else
        echo "Unexpected argument: $1" >&2
        usage
        exit 1
      fi
      shift
      ;;
  esac
done

if [ -z "$PROJECT_KEY" ] || [ -z "$TARGET_DIR" ]; then
  usage
  exit 1
fi

TARGET_PARENT="$(cd "$(dirname "$TARGET_DIR")" && pwd)"
TARGET_BASENAME="$(basename "$TARGET_DIR")"
TARGET_ABS="$TARGET_PARENT/$TARGET_BASENAME"

if [ -e "$TARGET_ABS" ] && [ "$FORCE" -ne 1 ]; then
  echo "Target already exists: $TARGET_ABS" >&2
  echo "Use --force to overwrite." >&2
  exit 1
fi

if [ -e "$TARGET_ABS" ]; then
  rm -rf "$TARGET_ABS"
fi

mkdir -p "$TARGET_ABS"

rsync -a \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude 'unpackage/' \
  --exclude 'project.private.config.json' \
  "$TEMPLATE_ROOT"/ "$TARGET_ABS"/

(cd "$TARGET_ABS" && git init >/dev/null)
"$TARGET_ABS/scripts/create-profile.sh" "$PROJECT_KEY" --profiles-dir "$TARGET_ABS/profiles" --force

if [ "$INSTALL" -eq 1 ]; then
  (cd "$TARGET_ABS" && npm install)
fi

cat <<EOF
Created project:
  $TARGET_ABS

Next:
  1. Edit $TARGET_ABS/profiles/$PROJECT_KEY/project.env
  2. Replace images in $TARGET_ABS/profiles/$PROJECT_KEY/static/ if needed
  3. Run:
     cd "$TARGET_ABS"
     scripts/build-miniapp.sh "$PROJECT_KEY"
EOF
