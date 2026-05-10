#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cat <<'NOTE'
release-miniapp.sh prepares a verified upload directory for Weixin DevTools.
It does not upload to WeChat automatically.

After success, open Weixin DevTools and import:
  <target-repo>/dist/build/mp-weixin
NOTE

"$SCRIPT_DIR/build-miniapp.sh" "$@"
