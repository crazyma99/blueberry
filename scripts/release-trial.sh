#!/usr/bin/env bash
# 蓝莓小程序「忽略 env → 清缓存 → 构建 → 红线校验 → 上传体验版 → 恢复 env」
# 红线：构建/发布绝不允许携带任何硬编码接口地址（env 一律留空自动分流）。
# 用法：./scripts/release-trial.sh <版本号> [描述]  例：./scripts/release-trial.sh 1.0.25 "更新说明"
# 版本号规范（主人 2026-09-10 定，最终修订）：体验版版本号=纯数字 v<版本号>（微信后台可见）；
#   git commit 短号自动写入上传描述开头 [g<sha>] 便于对号。
# 2026-09-11 增强（主人指示）：
#   a) 构建前清空 dist/build 与 node_modules/.cache/.vite，杜绝旧缓存带入（wxss 白屏/旧页面教训）；
#   b) 上传自检：微信 CLI 内部编译错误时退出码仍为 0，按输出特征判失败；
#      命中「IDE 持有旧目录句柄」特征（app.json not found / compile_start）时自动重启 IDE 服务重试一次；
#   c) trap 兜底恢复 .env.local：任何失败路径都恢复 env、不残留 bak 文件。
set -euo pipefail

VERSION="${1:?用法: ./scripts/release-trial.sh <版本号> [描述]}"
DESC="${2:-体验版}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ENV_FILE=".env.local"
CLI="/opt/apps/io.github.msojocs.wechat-devtools-linux/files/bin/bin/wechat-devtools-cli"

# 0) 备份 env 并挂 trap（任何退出路径都恢复 env）
BAK=""
if [ -f "$ENV_FILE" ]; then cp "$ENV_FILE" "$ENV_FILE.bak.$$"; BAK="$ENV_FILE.bak.$$"; fi
cleanup() { if [ -n "$BAK" ] && [ -f "$BAK" ]; then mv -f "$BAK" "$ENV_FILE"; fi; }
trap cleanup EXIT

# 1) 忽略 env：清空为注释（自动分流，不带任何地址）
cat > "$ENV_FILE" <<'EOF'
# 本地联调才显式指定；留空则运行时按小程序版本自动分流：
#   正式版(release) → https://lanmei66.cloud（线上）
#   体验版/开发版(trial/develop) → https://crazyma99.xyz（测试）
# VITE_API_BASE=
EOF

# 2) 清缓存 + 构建（dist/build）
echo "==> 清缓存（dist/build + node_modules/.cache/.vite）..."
rm -rf dist/build node_modules/.cache node_modules/.vite
echo "==> 构建（env 已忽略）..."
npm run build:mp-weixin >/dev/null 2>&1 || { echo "✗ 构建失败"; exit 1; }

# 3) 产物红线校验：检测到硬编码地址（本机/局域网 IP）即拒绝上传
if grep -qE "10\.[0-9]+\.[0-9]+\.[0-9]+|127\.0\.0\.1|192\.168\." "dist/build/mp-weixin/utils/config.js"; then
  echo "✗ 检测到硬编码地址，禁止上传！"; exit 1;
fi
echo "✓ 产物无硬编码地址（自动分流字面量：lanmei66.cloud / crazyma99.xyz）"

# 4) 上传体验版（版本号=纯数字 v<版本号>；commit 短号写描述开头 [g<sha>]）
SHA="$(git rev-parse --short HEAD)"
FINAL_VERSION="v${VERSION}"
FINAL_DESC="[g${SHA}] ${DESC}"

upload_once() {
  local log="$1"
  if ! "$CLI" upload --project "$ROOT/dist/build/mp-weixin" -v "$FINAL_VERSION" -d "$FINAL_DESC" >"$log" 2>&1; then
    return 1
  fi
  # 微信 CLI 内部编译错误时退出码仍为 0，必须按输出特征判定失败
  if grep -qE "compile_start|app\.json is not found|Error: 错误" "$log"; then
    return 1
  fi
  return 0
}

LOG="$(mktemp /tmp/release-trial.XXXXXX.log)"
if ! upload_once "$LOG"; then
  echo "✗ 首次上传失败，输出尾部："; tail -5 "$LOG"
  # 「IDE 持有旧目录句柄」特征：重启微信开发者工具服务后重试一次
  if grep -qE "app\.json is not found|compile_start" "$LOG"; then
    echo "==> 检测到 IDE 旧句柄特征，重启微信开发者工具服务后重试一次..."
    pkill -f 'wechat-devtools-linux' 2>/dev/null || true
    sleep 5
    if ! upload_once "$LOG"; then
      echo "✗ 重试仍失败，输出尾部："; tail -15 "$LOG"; exit 1
    fi
  else
    exit 1
  fi
fi
rm -f "$LOG"

echo "✓ 体验版 ${FINAL_VERSION}（[g${SHA}]）上传完成"
