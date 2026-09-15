#!/usr/bin/env bash
# 蓝莓小程序 · 抖音端「构建 → 红线校验 → 预览 / 体验版上传」
# 参考 scripts/release-trial.sh（微信端）的红线与留痕约定；工具链换成抖音官方 CLI tma（tt-ide-cli）。
#
# 与微信端的差异（2026-09-15 本机实测）：
#   1) 抖音无官方 Linux 版 IDE；tma 可独立完成「体积校验 / 预览出码 / 上传」，不需要图形化 IDE；
#   2) 抖音工程必须同时含 app.json 与 app.js（或 app.ts）＋ project.config.json（appid 以 tt 开头）；
#   3) tma 走登录态（tma login，必要时 TMA_CLI_HOME），不需要 AppSecret —— 本脚本绝不读写任何密钥；
#   4) uni-app 编译产物的 project.config.json 里 appid 是占位值 testAppId，必须显式覆盖为 tt 开头 appid。
#
# 安全默认：不加 --execute 绝不动平台；upload 属发布动作，须主人明确授权后才加 --execute --mode upload。
set -euo pipefail

usage() {
  cat <<'USAGE'
用法：scripts/release-trial-douyin.sh [版本号] [描述] [选项]

  --project <dir>        抖音产物目录（默认 dist/build/mp-toutiao）
  --build                先执行 npm run build:mp-toutiao（含清缓存）
  --appid <tt...>        目标 appid（默认取 MP_TOUTIAO_APPID，再取产物内 appid）
  --mode preview|upload  默认 preview（出预览二维码）；upload 才是发布动作
  --channel <通道>       upload 时追加 tma --channel
  --execute              真正执行；不加则只演练（打印将执行的命令）

例：
  scripts/release-trial-douyin.sh 60 抖音端联调 --build --execute
  scripts/release-trial-douyin.sh --appid ttdemo000000000000000 --mode preview --execute
USAGE
  exit "${1:-0}"
}

VERSION=""
DESC="抖音体验版"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT=""
DO_BUILD=0
APPID=""
MODE="preview"
CHANNEL=""
EXECUTE=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --build) DO_BUILD=1; shift ;;
    --appid) APPID="$2"; shift 2 ;;
    --mode) MODE="$2"; shift 2 ;;
    --channel) CHANNEL="$2"; shift 2 ;;
    --execute) EXECUTE=1; shift ;;
    -h|--help) usage 0 ;;
    -*) echo "未知参数：$1"; usage 1 ;;
    *) if [ -z "$VERSION" ]; then VERSION="$1"; else DESC="$1"; fi; shift ;;
  esac
done

if [ -z "$PROJECT" ]; then PROJECT="$ROOT/dist/build/mp-toutiao"; fi
case "$PROJECT" in /*) ;; *) PROJECT="$ROOT/$PROJECT" ;; esac
case "$MODE" in preview|upload) ;; *) echo "✗ --mode 只支持 preview 或 upload"; exit 1 ;; esac
cd "$ROOT"

# 版本号规范：纯数字 N 自动补成 1.0.N（抖音 CLI 用语义化版本）；留空交给 tma 自增前序版本末位
if [ -n "$VERSION" ] && printf "%s" "$VERSION" | grep -qE "^[0-9]+$"; then VERSION="1.0.$VERSION"; fi
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"
TS="$(date +%Y%m%d-%H%M%S)"
EVID="$ROOT/dist/evidence/douyin-trial-${VERSION:-auto}-$TS"
LOG="$EVID/release.log"
mkdir -p "$EVID"

JS_APPID='const fs=require("fs");try{const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(j.appid||"")}catch(e){process.stdout.write("")}'
JS_PAGES='const fs=require("fs");try{const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String((j.pages||[]).length))}catch(e){process.stdout.write("0")}'
JS_SETAPPID='const fs=require("fs");const f=process.argv[1];const j=JSON.parse(fs.readFileSync(f,"utf8"));j.appid=process.argv[2];fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n")'
JS_HASBUILD='const s=require("./package.json").scripts||{};process.exit(s["build:mp-toutiao"]?0:1)'

echo "==> 抖音体验版流程：模式=$MODE 版本=${VERSION:-（tma 自增）} 产物=$PROJECT"

# ---------------- 0) 工具与登录态 ----------------
command -v tma >/dev/null 2>&1 || { echo "✗ 未找到抖音 CLI tma。安装：npm i -g tt-ide-cli"; exit 1; }
TMA_VER="$(tma --version 2>/dev/null | tail -1)"
if ! tma check-session 2>&1 | grep -q "已登录"; then
  echo "✗ 抖音 CLI 未登录。请先在自己终端执行：tma login（或 tma login-e <邮箱>）"
  exit 1
fi
echo "✓ 抖音 CLI tma $TMA_VER（已登录）"

# ---------------- 1) 构建（可选） ----------------
if [ "$DO_BUILD" = "1" ]; then
  if ! node -e "$JS_HASBUILD" 2>/dev/null; then
    echo "✗ package.json 缺少 build:mp-toutiao 脚本，拒绝继续（请先补该脚本，或 --project 指定已有产物）"
    exit 1
  fi
  echo "==> 清缓存 + 构建抖音产物（npm run build:mp-toutiao）..."
  rm -rf dist/build/mp-toutiao node_modules/.cache node_modules/.vite
  npm run build:mp-toutiao >"$EVID/build.log" 2>&1 || { echo "✗ 构建失败，日志：$EVID/build.log"; tail -15 "$EVID/build.log"; exit 1; }
  echo "✓ 构建完成（日志：$EVID/build.log）"
fi

# ---------------- 2) 产物存在性与结构红线 ----------------
[ -d "$PROJECT" ] || { echo "✗ 产物目录不存在：$PROJECT（旧端加 --build；新工程用 --project 指定）"; exit 1; }
[ -f "$PROJECT/app.json" ] || { echo "✗ 缺 app.json，非抖音小程序产物：$PROJECT"; exit 1; }
if [ ! -f "$PROJECT/app.js" ] && [ ! -f "$PROJECT/app.ts" ]; then
  echo "✗ 缺 app.js（或 app.ts）：抖音 CLI 判定项目类型要求 app.json 与 app.js 同时存在，否则报 [ProjectConfig]Bad Project Type"
  exit 1
fi
[ -f "$PROJECT/project.config.json" ] || { echo "✗ 缺 project.config.json，tma 无法识别项目"; exit 1; }

# ---------------- 3) appid 兜底与覆盖（占位值 testAppId 必须被换掉） ----------------
CUR_APPID="$(node -e "$JS_APPID" "$PROJECT/project.config.json")"
if [ -z "$APPID" ]; then APPID="${MP_TOUTIAO_APPID:-}"; fi
if [ -z "$APPID" ] && printf "%s" "$CUR_APPID" | grep -qE "^tt[0-9a-zA-Z]+$"; then APPID="$CUR_APPID"; fi
if [ -z "$APPID" ]; then
  echo "✗ 未能确定抖音 appid（产物内为：${CUR_APPID:-空}）——请用 --appid ttxxxx 或 export MP_TOUTIAO_APPID=ttxxxx"
  exit 1
fi
printf "%s" "$APPID" | grep -qE "^tt[0-9a-zA-Z]{8,}$" || { echo "✗ appid 格式不合法（须 tt 开头且足够长）：$APPID"; exit 1; }
if [ "$APPID" != "$CUR_APPID" ]; then
  if [ "$EXECUTE" = "1" ]; then
    node -e "$JS_SETAPPID" "$PROJECT/project.config.json" "$APPID"
    echo "✓ 已覆盖产物 appid：${CUR_APPID:-空} → $APPID（只改产物，不动 src/）"
  else
    echo "i 演练：将把产物 appid ${CUR_APPID:-空} 覆盖为 $APPID（加 --execute 才写入）"
  fi
else
  echo "✓ 产物 appid 已就绪：$APPID"
fi

# ---------------- 4) 硬编码地址红线（与微信端同口径） ----------------
REDLINE="10\.[0-9]+\.[0-9]+\.[0-9]+|127\.0\.0\.1|192\.168\.|localhost:"
HITS="$(grep -rlE "$REDLINE" "$PROJECT" 2>/dev/null | head -5 || true)"
if [ -n "$HITS" ]; then
  echo "✗ 产物检测到硬编码地址，禁止上传："
  printf "%s\n" "$HITS" | sed "s/^/    /"
  exit 1
fi
echo "✓ 产物无硬编码地址（自动分流口径与微信端一致）"

# ---------------- 5) 包体与页面数留痕 ----------------
tma project-size "$PROJECT" 2>&1 | tee "$EVID/project-size.log" | sed "s/^/    /"
PAGES="$(node -e "$JS_PAGES" "$PROJECT/app.json")"
echo "✓ 路由页数：$PAGES"

# ---------------- 6) 执行（默认演练） ----------------
if [ "$MODE" = "preview" ]; then
  QR="$EVID/qrcode.png"
  CMD=(tma preview --qrcode-output "$QR" "$PROJECT")
else
  CMD=(tma upload -c "[g$SHA] $DESC" "$PROJECT")
  if [ -n "$VERSION" ]; then CMD+=(-v "$VERSION"); fi
  if [ -n "$CHANNEL" ]; then CMD+=(--channel "$CHANNEL"); fi
fi

if [ "$EXECUTE" != "1" ]; then
  echo
  echo "==> 演练模式（未加 --execute，未调用平台）。将执行："
  printf "    %q " "${CMD[@]}"; echo
  { echo "mode=$MODE"; echo "dry_run=1"; echo "appid=$APPID"; echo "version=${VERSION:-auto}"; echo "desc=$DESC"; echo "commit=$SHA"; echo "project=$PROJECT"; echo "tma=$TMA_VER"; echo "pages=$PAGES"; } > "$EVID/summary.txt"
  echo "    证据目录：$EVID"
  exit 0
fi

echo "==> 执行：$MODE ..."
set +e
"${CMD[@]}" >"$LOG" 2>&1
RC=$?
set -e
tr -d "\r" < "$LOG" | grep -av "\[4[07]m" | sed "s/^/    /" | tail -20

URL="$(grep -aoE "https://t\.zijieimg\.com/[A-Za-z0-9]+/" "$LOG" | head -1 || true)"
if [ "$RC" != "0" ]; then
  echo "✗ 抖音 $MODE 失败（exit $RC），完整日志：$LOG"
  { echo "mode=$MODE"; echo "dry_run=0"; echo "exit=$RC"; echo "failed=1"; echo "appid=$APPID"; echo "commit=$SHA"; } > "$EVID/summary.txt"
  exit "$RC"
fi
if grep -qE "Error|错误|失败|Bad Project Type|not valid|暂无操作权限" "$LOG"; then
  echo "✗ 抖音 $MODE 输出含失败特征（CLI 退出码可能仍为 0），完整日志：$LOG"
  { echo "mode=$MODE"; echo "dry_run=0"; echo "exit=0"; echo "failed=1"; echo "appid=$APPID"; echo "commit=$SHA"; } > "$EVID/summary.txt"
  exit 1
fi

{ echo "mode=$MODE"; echo "dry_run=0"; echo "exit=0"; echo "failed=0"; echo "appid=$APPID"; echo "version=${VERSION:-auto}"; echo "desc=$DESC"; echo "commit=$SHA"; echo "project=$PROJECT"; echo "tma=$TMA_VER"; echo "pages=$PAGES"; echo "preview_url=${URL:-}"; } > "$EVID/summary.txt"

if [ "$MODE" = "preview" ]; then
  echo "✓ 抖音预览二维码已生成：$EVID/qrcode.png"
  [ -n "$URL" ] && echo "  预览短链：$URL"
  echo "  扫码设备须已在抖音开放平台绑定（测试设备白名单）"
else
  echo "✓ 抖音体验版已上传：version=${VERSION:-auto} desc=[g$SHA] $DESC"
  echo "  上传属发布动作：请在抖音开放平台确认测试通道/体验白名单后再对外放号"
fi
echo "  证据目录：$EVID"
