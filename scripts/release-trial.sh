#!/usr/bin/env bash
# 蓝莓小程序「忽略 env → 构建 → 上传体验版 → 恢复 env」
# 红线：构建/发布绝不允许携带任何硬编码接口地址（env 一律留空自动分流）。
# 用法：./scripts/release-trial.sh <版本号> [描述]  例：./scripts/release-trial.sh 1.0.25 "更新说明"
# 版本号规范（主人 2026-09-10 定，最终修订）：体验版版本号=纯数字 v<版本号>（微信后台可见）；
#   git commit 短号自动写入上传描述开头 [g<sha>] 便于对号。
set -euo pipefail

VERSION="${1:?用法: ./scripts/release-trial.sh <版本号> [描述]}"
DESC="${2:-体验版}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ENV_FILE=".env.local"

# 1) 备份当前 env（若有）
BAK=""
if [ -f "$ENV_FILE" ]; then cp "$ENV_FILE" "$ENV_FILE.bak.$$"; BAK="$ENV_FILE.bak.$$"; fi

# 2) 忽略 env：清空为注释（自动分流，不带任何地址）
cat > "$ENV_FILE" <<'EOF'
# 本地联调才显式指定；留空则运行时按小程序版本自动分流：
#   正式版(release) → https://lanmei66.cloud（线上）
#   体验版/开发版(trial/develop) → https://crazyma99.xyz（测试）
# VITE_API_BASE=
EOF

# 3) 构建（dist/build）
echo "==> 构建（env 已忽略）..."
npm run build:mp-weixin >/dev/null 2>&1 || { echo "✗ 构建失败"; exit 1; }

# 4) 产物红线校验：检测到硬编码地址（本机/局域网 IP）即拒绝上传
if grep -qE "10\.[0-9]+\.[0-9]+\.[0-9]+|127\.0\.0\.1|192\.168\." "dist/build/mp-weixin/utils/config.js"; then
  echo "✗ 检测到硬编码地址，禁止上传！"; exit 1;
fi
echo "✓ 产物无硬编码地址（自动分流字面量：lanmei66.cloud / crazyma99.xyz）"

# 5) 上传体验版（版本号=纯数字 v<版本号>；commit 短号写描述开头 [g<sha>]）
SHA="$(git rev-parse --short HEAD)"
FINAL_VERSION="v${VERSION}"
FINAL_DESC="[g${SHA}] ${DESC}"
CLI="/opt/apps/io.github.msojocs.wechat-devtools-linux/files/bin/bin/wechat-devtools-cli"
"$CLI" upload --project "$ROOT/dist/build/mp-weixin" -v "$FINAL_VERSION" -d "$FINAL_DESC" || { echo "✗ 上传失败"; exit 1; }

# 6) 恢复 env
if [ -n "$BAK" ]; then mv "$BAK" "$ENV_FILE"; fi

echo "✓ 体验版 ${FINAL_VERSION}（[g${SHA}]）上传完成"
