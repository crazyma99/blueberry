#!/usr/bin/env bash
# 蓝莓小程序 · 抖音端「构建 → 校验 → 预览 / 体验版上传」  v2（2026-09-15 独立评审后重写）
# 参考 scripts/release-trial.sh（微信端）的安全约定；工具链＝抖音官方 CLI tma（tt-ide-cli）。
#
# v2 关键变化（针对独立评审 R1/R2/R3 与 Y1–Y8）：
#   · 判定改为三重判据：①退出码 ②错误栈/关键字识别（大小写不敏感、白名单排除非致命告警）
#     ③正向成功证据（preview 必须真的生成非空二维码；upload 必须有成功特征）——缺正向证据即判 uncertain 并失败
#   · 产物身份门禁：拒绝微信产物（*.wxss / wx* appid / mp-weixin 路径），要求 tt 引擎特征（app.ttss 或 *.ttml）
#   · 新鲜度门禁：不带 --build 须显式 --allow-stale；summary 记 built= 与 artifact_sha256=，不冒认 commit
#   · appid 覆盖：仅执行态才写、写前备份到证据目录、只在红线校验之后；--project 默认限定在 dist/ 下
#   · 演练（不加 --execute）不建证据目录、不清缓存、不构建、不写盘
#   · 红线扩表：补 172.16-31/0.0.0.0/[::1]/host.docker.internal/*.local；扫描到 0 个文件即失败（不再 fail-open）
#   · 版本：默认不传 -v（交给 tma 自增）；显式版本须三段 semver；版本串消毒后再进证据路径
#   · 传输类失败自动重试 1 次；证据留痕含实际命令行/错误命中/产物指纹；证据目录 30 天自动清理
#
# 安全默认：不加 --execute 绝不动平台、不动产物；upload 属发布动作，须主人明确授权后才加 --execute --mode upload。
set -euo pipefail

usage() {
  cat <<'USAGE'
用法：scripts/release-trial-douyin.sh [版本号] [描述] [选项]

  --project <dir>          抖音产物目录（默认 dist/build/mp-toutiao；须在 dist/ 下）
  --build                  先执行 npm run build:mp-toutiao（清缓存）；不构建时须加 --allow-stale
  --allow-stale            允许使用既有（非本次构建的）产物——summary 会记 built=no
  --allow-outside-project  允许 --project 指向 dist/ 之外（仅测试用）
  --appid <tt...>          目标 appid（默认取 MP_TOUTIAO_APPID，再取产物内 appid）
  --mode preview|upload    默认 preview（出预览二维码）；upload 才是发布动作
  --channel <通道>         upload 时追加 tma --channel
  --execute                真正执行；不加则只演练（只打印将执行的命令，不写盘不触平台）

例：
  scripts/release-trial-douyin.sh 1.0.60 抖音端联调 --build --execute
  scripts/release-trial-douyin.sh --allow-stale --mode preview --appid ttxxxx --execute
USAGE
  exit "${1:-0}"
}

VERSION=""
VERSION_GIVEN=0
DESC="抖音体验版"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT=""
DO_BUILD=0
ALLOW_STALE=0
ALLOW_OUTSIDE=0
APPID=""
MODE="preview"
CHANNEL=""
EXECUTE=0
POSN=0

need2() { [ "$#" -ge 2 ] || { echo "✗ $1 缺参数值"; usage 1; }; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project) need2 "$@"; PROJECT="$2"; shift 2 ;;
    --build) DO_BUILD=1; shift ;;
    --allow-stale) ALLOW_STALE=1; shift ;;
    --allow-outside-project) ALLOW_OUTSIDE=1; shift ;;
    --appid) need2 "$@"; APPID="$2"; shift 2 ;;
    --mode) need2 "$@"; MODE="$2"; shift 2 ;;
    --channel) need2 "$@"; CHANNEL="$2"; shift 2 ;;
    --execute) EXECUTE=1; shift ;;
    -h|--help) usage 0 ;;
    -*) echo "未知参数：$1"; usage 1 ;;
    *) POSN=$((POSN+1));
       if [ "$POSN" = "1" ]; then VERSION="$1"; VERSION_GIVEN=1;
       elif [ "$POSN" = "2" ]; then DESC="$1";
       else echo "✗ 多余的位置参数：$1（最多「版本号 描述」两个）"; usage 1; fi; shift ;;
  esac
done

if [ -z "$PROJECT" ]; then PROJECT="$ROOT/dist/build/mp-toutiao"; fi
case "$PROJECT" in /*) ;; *) PROJECT="$ROOT/$PROJECT" ;; esac
case "$MODE" in preview|upload) ;; *) echo "✗ --mode 只支持 preview 或 upload"; exit 1 ;; esac
cd "$ROOT"

if [ "$VERSION_GIVEN" = "1" ]; then
  printf "%s" "$VERSION" | grep -qE "^[0-9]+\.[0-9]+\.[0-9]+$" || {
    echo "✗ 版本号须为三段语义化版本（例 1.0.60）——抖音 CLI 与微信端 vN 口径不同；或留空由 tma 自增"; exit 1; }
fi
VER_SAFE="$(printf "%s" "$VERSION" | tr -c "0-9A-Za-z._-" "_")"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"
TS="$(date +%Y%m%d-%H%M%S)-$$"   # 加 PID：同秒并发两次也不会互相覆盖证据目录

JS_APPID='const fs=require("fs");try{const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(j.appid||"")}catch(e){process.stdout.write("")}'
JS_PAGES='const fs=require("fs");try{const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String((j.pages||[]).length))}catch(e){process.stdout.write("0")}'
JS_SETAPPID='const fs=require("fs");const f=process.argv[1];const j=JSON.parse(fs.readFileSync(f,"utf8"));j.appid=process.argv[2];fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n")'
JS_HASBUILD='const s=require("./package.json").scripts||{};process.exit(s["build:mp-toutiao"]?0:1)'

echo "==> 抖音流程：模式=$MODE 版本=${VERSION:-（tma 自增）} 产物=$PROJECT"

command -v node >/dev/null 2>&1 || { echo "✗ 未找到 node"; exit 1; }
command -v tma >/dev/null 2>&1 || { echo "✗ 未找到抖音 CLI tma。安装：npm i -g tt-ide-cli"; exit 1; }
TMA_VER="$(tma --version 2>/dev/null | tail -1)"
if ! tma check-session 2>&1 | grep -q "已登录"; then
  echo "✗ 抖音 CLI 未登录。请先在自己终端执行：tma login（或 tma login-e <邮箱>）"
  exit 1
fi
echo "✓ 抖音 CLI tma $TMA_VER（已登录）"

# ---------------- 1) 产物身份门禁（先于一切写入） ----------------
[ -d "$PROJECT" ] || { echo "✗ 产物目录不存在：$PROJECT"; exit 1; }
case "$PROJECT" in
  "$ROOT/dist/"*) ;;
  *) if [ "$ALLOW_OUTSIDE" != "1" ]; then
       echo "✗ --project 须指向 $ROOT/dist/ 下的产物（如 dist/build/mp-toutiao）；确认是测试可加 --allow-outside-project"; exit 1;
     fi ;;
esac
case "$PROJECT" in *"dist/build/mp-weixin"*) echo "✗ 拒绝：--project 指向微信产物目录"; exit 1 ;; esac
[ -f "$PROJECT/app.json" ] || { echo "✗ 缺 app.json，非抖音小程序产物：$PROJECT"; exit 1; }
if [ ! -f "$PROJECT/app.js" ] && [ ! -f "$PROJECT/app.ts" ]; then
  echo "✗ 缺 app.js（或 app.ts）：抖音 CLI 判定项目类型要求 app.json 与 app.js 同时存在，否则报 [ProjectConfig]Bad Project Type"
  exit 1
fi
[ -f "$PROJECT/project.config.json" ] || { echo "✗ 缺 project.config.json，tma 无法识别项目"; exit 1; }
if ls "$PROJECT"/*.wxss >/dev/null 2>&1; then echo "✗ 拒绝：产物根目录含 *.wxss（微信产物特征），不是抖音产物"; exit 1; fi
if ! ls "$PROJECT"/*.ttml >/dev/null 2>&1 && [ ! -f "$PROJECT/app.ttss" ]; then
  echo "✗ 拒绝：产物既无 *.ttml 也无 app.ttss（缺抖音引擎特征），疑似其他平台产物"; exit 1
fi
CUR_APPID="$(node -e "$JS_APPID" "$PROJECT/project.config.json")"
case "$CUR_APPID" in wx*) echo "✗ 拒绝：产物 appid 为微信前缀（$CUR_APPID）"; exit 1 ;; esac

# ---------------- 2) 新鲜度门禁 ----------------
BUILT=no
if [ "$DO_BUILD" = "1" ]; then BUILT=yes; else
  if [ "$ALLOW_STALE" != "1" ]; then
    echo "✗ 未指定 --build：拒绝用既有产物发布。请加 --build 重新构建，或确认后加 --allow-stale"; exit 1
  fi
  echo "⚠ 使用既有产物（--allow-stale）：summary 记 built=no，commit 字段不代表该产物来源"
fi

# ---------------- 3) appid 兜底 ----------------
APPID_SRC="cli"
if [ -z "$APPID" ]; then APPID="${MP_TOUTIAO_APPID:-}"; APPID_SRC="env"; fi
if [ -z "$APPID" ] && printf "%s" "$CUR_APPID" | grep -qE "^tt[0-9a-zA-Z]+$"; then APPID="$CUR_APPID"; APPID_SRC="artifact"; fi
if [ -z "$APPID" ]; then
  echo "✗ 未能确定抖音 appid（产物内为：${CUR_APPID:-空}）——请用 --appid ttxxxx 或 export MP_TOUTIAO_APPID=ttxxxx"
  exit 1
fi
printf "%s" "$APPID" | grep -qE "^tt[0-9a-zA-Z]{8,}$" || { echo "✗ appid 格式不合法（须 tt 开头且足够长）：$APPID"; exit 1; }
echo "✓ target appid = $APPID（来源：$APPID_SRC；产物现值：${CUR_APPID:-空}）"

# ---------------- 4) 演练路径（不建证据目录、不清缓存、不构建、不写盘） ----------------
if [ "$MODE" = "preview" ]; then PLAN=(tma preview --qrcode-output "<EVID>/qrcode.png" "$PROJECT");
else PLAN=(tma upload -c "[g$SHA] $DESC" "$PROJECT"); [ -n "$VERSION" ] && PLAN+=(-v "$VERSION"); [ -n "$CHANNEL" ] && PLAN+=(--channel "$CHANNEL"); fi
if [ "$EXECUTE" != "1" ]; then
  echo
  echo "==> 演练模式（未加 --execute）：不构建、不清缓存、不写盘、不触平台。将执行："
  printf "    %q " "${PLAN[@]}"; echo
  [ "$DO_BUILD" = "1" ] && echo "    （演练不含 --build 的清缓存与构建动作）"
  exit 0
fi

# ---------------- 5) 建证据目录（门禁之后） ----------------
EVID="$ROOT/dist/evidence/douyin-${MODE}-${VER_SAFE:-auto}-$TS"
LOG="$EVID/release.log"
mkdir -p "$EVID"
find "$ROOT/dist/evidence" -maxdepth 1 -type d -name "douyin-*" -mtime +30 -exec rm -rf {} + 2>/dev/null || true

# ---------------- 6) 构建（可选，先中和 .env.local 并 trap 恢复） ----------------
ENV_BAK=""
cleanup() { if [ -n "$ENV_BAK" ] && [ -f "$ENV_BAK" ]; then mv -f "$ENV_BAK" "$ROOT/.env.local"; fi; }
trap cleanup EXIT
if [ "$DO_BUILD" = "1" ]; then
  if ! node -e "$JS_HASBUILD" 2>/dev/null; then
    echo "✗ package.json 缺少 build:mp-toutiao 脚本，拒绝继续"; exit 1
  fi
  if [ -f "$ROOT/.env.local" ]; then
    cp "$ROOT/.env.local" "$ROOT/.env.local.bak.$$"; ENV_BAK="$ROOT/.env.local.bak.$$"
    printf "%s\n" "# 由 release-trial-douyin.sh 临时中和（trap 恢复）：避免把本地联调地址编进发布产物" > "$ROOT/.env.local"
    echo "✓ 已临时中和 .env.local（退出时自动恢复）"
  fi
  echo "==> 清缓存 + 构建抖音产物..."
  rm -rf dist/build/mp-toutiao node_modules/.cache node_modules/.vite
  npm run build:mp-toutiao >"$EVID/build.log" 2>&1 || { echo "✗ 构建失败，日志：$EVID/build.log"; tail -15 "$EVID/build.log"; exit 1; }
  echo "✓ 构建完成（日志：$EVID/build.log）"
fi

# ---------------- 7) 红线：硬编码/内网地址（扩表 + 非 fail-open） ----------------
SCANNED="$(find "$PROJECT" -type f | wc -l)"
[ "$SCANNED" -gt 0 ] || { echo "✗ 产物扫描到 0 个文件，拒绝继续（fail-closed）"; exit 1; }
REDLINE="10\.[0-9]+\.[0-9]+\.[0-9]+|127\.0\.0\.1|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|0\.0\.0\.0|\[::1\]|host\.docker\.internal|\.local[:/]"
HITS="$(grep -rlE "$REDLINE" "$PROJECT" 2>/dev/null | head -5 || true)"
if [ -n "$HITS" ]; then echo "✗ 产物检测到硬编码/内网地址，禁止上传："; printf "%s\n" "$HITS" | sed "s/^/    /"; exit 1; fi
echo "✓ 红线通过：扫描 $SCANNED 个文件，无硬编码/内网地址"
grep -rhoE "https?://[A-Za-z0-9._:-]+" "$PROJECT" 2>/dev/null | sort -u > "$EVID/hosts.txt" || true

# ---------------- 8) 包体 / 页数 / 指纹 ----------------
tma project-size "$PROJECT" 2>&1 | tee "$EVID/project-size.log" | sed "s/^/    /"
PAGES="$(node -e "$JS_PAGES" "$PROJECT/app.json")"
ART_SHA="$(find "$PROJECT" -type f -print0 | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | cut -c1-64)"
ART_MTIME="$(date -r "$PROJECT/app.json" +%Y-%m-%dT%H:%M:%S%z 2>/dev/null || echo unknown)"
echo "✓ 路由页数：$PAGES ｜ 产物指纹：${ART_SHA:0:12} ｜ app.json mtime：$ART_MTIME"

# ---------------- 9) 覆盖产物 appid（仅执行态，先备份） ----------------
APPID_AFTER="$CUR_APPID"
if [ "$APPID" != "$CUR_APPID" ]; then
  cp "$PROJECT/project.config.json" "$EVID/project.config.json.orig"
  node -e "$JS_SETAPPID" "$PROJECT/project.config.json" "$APPID"
  APPID_AFTER="$APPID"
  echo "✓ 已覆盖产物 appid：${CUR_APPID:-空} → $APPID（原文件已备份到证据目录；不动 src/）"
else
  echo "✓ 产物 appid 已就绪：$APPID"
fi

# ---------------- 10) 执行 + 三重判据 ----------------
QR=""
if [ "$MODE" = "preview" ]; then
  QR="$EVID/qrcode.png"
  CMD=(tma preview --qrcode-output "$QR" "$PROJECT")
else
  CMD=(tma upload -c "[g$SHA] $DESC" "$PROJECT")
  if [ -n "$VERSION" ]; then CMD+=(-v "$VERSION"); fi
  if [ -n "$CHANNEL" ]; then CMD+=(--channel "$CHANNEL"); fi
fi
CMD_STR="$(printf "%q " "${CMD[@]}")"
echo "==> 执行：$MODE ..."

ERR_EXCL='失败缓存超过100个|获取包体积失败'
TRANSPORT='ETIMEDOUT|ECONNRESET|socket hang up|timeout|超时|网络|network'

analyze() {
  ERRHITS="$(grep -aE '(^|[^A-Za-z])(Compile Error|Error|TypeError|SyntaxError|ReferenceError):|^[[:space:]]+at ' "$LOG" 2>/dev/null | grep -avE "$ERR_EXCL" | head -3 || true)"
  KEYHITS="$(grep -aiE 'failed|denied|forbidden|not valid|invalid|unable|拒绝|未授权|暂未获得|不合法|无法' "$LOG" 2>/dev/null | grep -avE "$ERR_EXCL" | head -3 || true)"
  TRANSPORT_HIT="$(grep -aiE "$TRANSPORT" "$LOG" 2>/dev/null | head -1 || true)"
  VERDICT=failed; REASON=""
  if [ "$RC" != "0" ]; then REASON="CLI 退出码 $RC"
  elif [ ! -s "$LOG" ]; then REASON="退出码 0 但日志为空（无法证明成功）"
  elif [ -n "$ERRHITS" ] || [ -n "$KEYHITS" ]; then REASON="输出含错误特征"
  elif [ "$MODE" = "preview" ] && [ ! -s "$QR" ]; then REASON="退出码 0 但未生成非空二维码（缺正向证据）"
  elif [ "$MODE" = "upload" ] && ! grep -aqiE '上传成功|success|已上传|http' "$LOG"; then REASON="退出码 0 但未见上传成功特征（缺正向证据）"
  else VERDICT=ok; fi
}

run_once() { set +e; "${CMD[@]}" >"$LOG" 2>&1; RC=$?; set -e; analyze; }
ATTEMPT=0
run_once; ATTEMPT=1
if [ "$VERDICT" != "ok" ] && [ -n "${TRANSPORT_HIT:-}" ]; then
  echo "⚠ 首次判定失败且含传输类特征，5 秒后重试 1 次..."
  sleep 5; ATTEMPT=2; run_once
fi

{ tr -d "\r" < "$LOG" | grep -av "\[4[07]m" | sed "s/^/    /" | tail -20; } || true
URL="$(grep -aoE "https://t\.zijieimg\.com/[A-Za-z0-9]+/" "$LOG" 2>/dev/null | head -1 || true)"
QR_EXISTS=no; [ -n "$QR" ] && [ -s "$QR" ] && QR_EXISTS=yes

{ echo "mode=$MODE"; echo "verdict=$VERDICT"; echo "reason=$REASON"; echo "exit=$RC"; echo "attempt=$ATTEMPT";
  echo "appid=$APPID"; echo "appid_source=$APPID_SRC"; echo "appid_before=${CUR_APPID:-}"; echo "appid_after=$APPID_AFTER";
  echo "built=$BUILT"; echo "artifact_sha256=$ART_SHA"; echo "artifact_files=$SCANNED"; echo "app_json_mtime=$ART_MTIME";
  echo "pages=$PAGES"; echo "project=$PROJECT"; echo "version=${VERSION:-auto}"; echo "version_given=$VERSION_GIVEN";
  echo "desc=$DESC"; echo "channel=${CHANNEL:-}"; echo "commit_head=$SHA"; echo "tma=$TMA_VER";
  echo "qrcode=$QR_EXISTS"; echo "qrcode_path=${QR:-}"; echo "preview_url=${URL:-}";
  echo "command=$CMD_STR"; echo "errhits=$(printf "%s" "$ERRHITS" | tr "\n" "|")";
  echo "keyhits=$(printf "%s" "$KEYHITS" | tr "\n" "|")"; echo "transport_hit=${TRANSPORT_HIT:-}"; echo "log=$LOG"; } > "$EVID/summary.txt"

if [ "$VERDICT" != "ok" ]; then
  echo "✗ 抖音 $MODE 判定：$VERDICT —— $REASON（attempt=$ATTEMPT）"
  echo "  完整日志与证据：$EVID"
  exit 1
fi

if [ "$MODE" = "preview" ]; then
  echo "✓ preview 成功（三重判据通过）：二维码 $QR"
  [ -n "$URL" ] && echo "  预览短链：$URL"
  echo "  扫码设备须已在抖音开放平台绑定（测试设备白名单）"
else
  echo "✓ upload 成功（三重判据通过）：version=${VERSION:-auto} desc=[g$SHA] $DESC"
  echo "  上传属发布动作：请在抖音开放平台确认测试通道/体验白名单后再对外放号"
fi
echo "  证据目录：$EVID（summary.txt / release.log / hosts.txt / project-size.log）"
