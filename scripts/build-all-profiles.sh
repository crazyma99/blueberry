#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROFILES_DIR="$TOOL_ROOT/profiles"

# 主项目 key（位于当前仓库内，使用 npm run build:mp-weixin 构建）
MAIN_PROFILE_KEY="blueberry"

# 扩展项目根目录（其他 profile 的 target repo 父目录）
# huahua -> /Users/leolin/Desktop/huahua
# <other> -> /Users/leolin/Desktop/<other>
EXTERNAL_REPO_BASE="$(cd "$TOOL_ROOT/.." && pwd)"

usage() {
  cat <<'USAGE'
Usage:
  scripts/build-all-profiles.sh [--only <key1,key2>] [--skip <key1,key2>] [--external-base <dir>] [--no-sync-template]

Description:
  扫描 profiles/ 目录下所有 profile，依次执行构建：
    - 主项目 (blueberry)        -> npm run build:mp-weixin (在当前仓库)
    - 其他 profile (如 huahua)  -> scripts/build-miniapp.sh <key> --repo <external-base>/<key> --sync-template

Options:
  --only <list>          仅构建指定 profile（逗号分隔）
  --skip <list>          跳过指定 profile（逗号分隔）
  --external-base <dir>  扩展项目根目录（默认: 当前仓库的父目录）
  --no-sync-template     扩展项目构建时不携带 --sync-template
  -h, --help             显示帮助
USAGE
}

ONLY_LIST=""
SKIP_LIST=""
SYNC_TEMPLATE=1

while [ "$#" -gt 0 ]; do
  case "$1" in
    --only)
      ONLY_LIST="$2"
      shift 2
      ;;
    --skip)
      SKIP_LIST="$2"
      shift 2
      ;;
    --external-base)
      EXTERNAL_REPO_BASE="$(cd "$2" && pwd)"
      shift 2
      ;;
    --no-sync-template)
      SYNC_TEMPLATE=0
      shift
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

if [ ! -d "$PROFILES_DIR" ]; then
  echo "[ERROR] profiles 目录不存在: $PROFILES_DIR" >&2
  exit 1
fi

contains_csv() {
  # $1: csv list, $2: key
  local list="$1"
  local key="$2"
  [ -z "$list" ] && return 1
  local IFS=','
  for item in $list; do
    if [ "$item" = "$key" ]; then
      return 0
    fi
  done
  return 1
}

# 收集所有 profile keys
PROFILE_KEYS=()
for dir in "$PROFILES_DIR"/*/; do
  [ -d "$dir" ] || continue
  key="$(basename "$dir")"
  [ -f "$PROFILES_DIR/$key/project.env" ] || continue
  PROFILE_KEYS+=("$key")
done

if [ "${#PROFILE_KEYS[@]}" -eq 0 ]; then
  echo "[ERROR] 未找到任何 profile（profiles/<key>/project.env）" >&2
  exit 1
fi

echo "===================================================="
echo "Profiles 批量构建"
echo "  仓库根目录    : $TOOL_ROOT"
echo "  扩展项目目录  : $EXTERNAL_REPO_BASE"
echo "  发现 profile  : ${PROFILE_KEYS[*]}"
[ -n "$ONLY_LIST" ] && echo "  --only        : $ONLY_LIST"
[ -n "$SKIP_LIST" ] && echo "  --skip        : $SKIP_LIST"
echo "===================================================="

SUCCESS_LIST=()
FAILED_LIST=()
SKIPPED_LIST=()

for key in "${PROFILE_KEYS[@]}"; do
  if [ -n "$ONLY_LIST" ] && ! contains_csv "$ONLY_LIST" "$key"; then
    SKIPPED_LIST+=("$key(not in --only)")
    continue
  fi
  if [ -n "$SKIP_LIST" ] && contains_csv "$SKIP_LIST" "$key"; then
    SKIPPED_LIST+=("$key(--skip)")
    continue
  fi

  echo ""
  echo "----------------------------------------------------"
  echo ">>> 开始构建 profile: $key"
  echo "----------------------------------------------------"

  if [ "$key" = "$MAIN_PROFILE_KEY" ]; then
    # 主项目：在当前仓库执行 npm run build:mp-weixin
    echo "[INFO] 主项目，执行: npm run build:mp-weixin (cwd=$TOOL_ROOT)"
    if (cd "$TOOL_ROOT" && npm run build:mp-weixin); then
      SUCCESS_LIST+=("$key")
      echo "[OK] profile=$key 构建成功"
    else
      FAILED_LIST+=("$key")
      echo "[FAIL] profile=$key 构建失败" >&2
    fi
  else
    # 扩展项目：scripts/build-miniapp.sh <key> --repo <external-base>/<key> [--sync-template]
    target_repo="$EXTERNAL_REPO_BASE/$key"
    if [ ! -d "$target_repo" ]; then
      FAILED_LIST+=("$key(target repo 不存在: $target_repo)")
      echo "[FAIL] target repo 不存在: $target_repo，跳过 $key" >&2
      continue
    fi

    cmd_args=("$key" --repo "$target_repo")
    if [ "$SYNC_TEMPLATE" -eq 1 ]; then
      cmd_args+=(--sync-template)
    fi

    echo "[INFO] 扩展项目，执行: scripts/build-miniapp.sh ${cmd_args[*]}"
    if "$SCRIPT_DIR/build-miniapp.sh" "${cmd_args[@]}"; then
      SUCCESS_LIST+=("$key")
      echo "[OK] profile=$key 构建成功"
    else
      FAILED_LIST+=("$key")
      echo "[FAIL] profile=$key 构建失败" >&2
    fi
  fi
done

echo ""
echo "===================================================="
echo "构建结果汇总"
echo "----------------------------------------------------"
echo "成功 (${#SUCCESS_LIST[@]}): ${SUCCESS_LIST[*]:-无}"
echo "失败 (${#FAILED_LIST[@]}): ${FAILED_LIST[*]:-无}"
echo "跳过 (${#SKIPPED_LIST[@]}): ${SKIPPED_LIST[*]:-无}"
echo "===================================================="

if [ "${#FAILED_LIST[@]}" -gt 0 ]; then
  exit 1
fi
exit 0
