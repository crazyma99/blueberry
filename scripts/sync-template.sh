#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_REPO=""

usage() {
  cat <<'USAGE'
Usage:
  scripts/sync-template.sh --repo <target-repo>

Copies blueBerry common template code into an existing target repo.

Overwritten:
  src/App.uvue
  src/env.d.ts
  src/index.html
  src/main.uts
  src/pages/
  src/utils/
  src/components/

Not overwritten:
  package.json
  project.config.json
  src/manifest.json
  src/pages.json
  src/static/ (except shared *.svg / *.png UI icons)
  profiles/
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo)
      TARGET_REPO="$(cd "$2" && pwd)"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unexpected argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [ -z "$TARGET_REPO" ]; then
  usage
  exit 1
fi

if [ "$TARGET_REPO" = "$TEMPLATE_ROOT" ]; then
  echo "Target repo is the template repo; nothing to sync."
  exit 0
fi

mkdir -p "$TARGET_REPO/src"

cp "$TEMPLATE_ROOT/src/App.uvue" "$TARGET_REPO/src/App.uvue"
cp "$TEMPLATE_ROOT/src/index.html" "$TARGET_REPO/src/index.html"
cp "$TEMPLATE_ROOT/src/main.uts" "$TARGET_REPO/src/main.uts"

if [ -f "$TEMPLATE_ROOT/src/env.d.ts" ]; then
  cp "$TEMPLATE_ROOT/src/env.d.ts" "$TARGET_REPO/src/env.d.ts"
fi

rsync -a --delete "$TEMPLATE_ROOT/src/pages"/ "$TARGET_REPO/src/pages"/
rsync -a --delete "$TEMPLATE_ROOT/src/utils"/ "$TARGET_REPO/src/utils"/

# src/components/ 是 easycom 自动引入的共享组件目录（AppFooter 等）。
# 必须同步到外部项目，否则 apply-profile.mjs 会因找不到组件文件报 ENOENT。
mkdir -p "$TARGET_REPO/src/components"
rsync -a --delete "$TEMPLATE_ROOT/src/components"/ "$TARGET_REPO/src/components"/

# src/static/ 整体不同步（各 profile 有自己的二维码等资源），
# 但 SVG / PNG 等共享 UI 图标需要同步，否则新图标在子项目中缺失。
mkdir -p "$TARGET_REPO/src/static"
rsync -a --include='*.svg' --include='*.png' --exclude='*' \
  "$TEMPLATE_ROOT/src/static"/ "$TARGET_REPO/src/static"/

echo "Synced template code to $TARGET_REPO"
