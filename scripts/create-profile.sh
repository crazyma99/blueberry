#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$SCRIPT_DIR/templates/profile.env.example"
PROFILES_DIR="$REPO_ROOT/profiles"
FORCE=0

usage() {
  cat <<'USAGE'
Usage:
  scripts/create-profile.sh <project-key> [--profiles-dir <dir>] [--force]

Creates:
  profiles/<project-key>/project.env
  profiles/<project-key>/static/
USAGE
}

PROJECT_KEY=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --profiles-dir)
      PROFILES_DIR="$2"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [ -z "$PROJECT_KEY" ]; then
        PROJECT_KEY="$1"
        shift
      else
        echo "Unexpected argument: $1" >&2
        usage
        exit 1
      fi
      ;;
  esac
done

if [ -z "$PROJECT_KEY" ]; then
  usage
  exit 1
fi

PROFILE_DIR="$PROFILES_DIR/$PROJECT_KEY"
PROFILE_FILE="$PROFILE_DIR/project.env"

if [ -e "$PROFILE_FILE" ] && [ "$FORCE" -ne 1 ]; then
  echo "Profile already exists: $PROFILE_FILE" >&2
  echo "Use --force to overwrite." >&2
  exit 1
fi

mkdir -p "$PROFILE_DIR/static"
cp "$TEMPLATE" "$PROFILE_FILE"

perl -0pi -e "s/PROJECT_KEY=\"[^\"]*\"/PROJECT_KEY=\"$PROJECT_KEY\"/; s/PACKAGE_NAME=\"[^\"]*\"/PACKAGE_NAME=\"$PROJECT_KEY\"/; s/MANIFEST_NAME=\"[^\"]*\"/MANIFEST_NAME=\"$PROJECT_KEY\"/; s/APP_CODE=\"[^\"]*\"/APP_CODE=\"$PROJECT_KEY\"/" "$PROFILE_FILE"

cat <<EOF
Created profile:
  $PROFILE_FILE

Next:
  1. Edit $PROFILE_FILE
  2. Put replaceable images in $PROFILE_DIR/static/ if needed
  3. Run scripts/build-miniapp.sh $PROJECT_KEY --repo <target-repo>
EOF
