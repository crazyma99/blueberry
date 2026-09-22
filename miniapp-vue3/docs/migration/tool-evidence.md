# 平台工具证据留档（P1-06／P1-25／P1-28 的工具侧）

> 原则：**只记实际跑过的命令与原始输出**；未跑的一律写「未做」。工具证据**不替代**真机验收（见 `device-acceptance-checklist.md`）。

## 1. 抖音（`tma` = tt-ide-cli）

| 项 | 命令 | 结果（原始输出摘要） | 时间 |
|---|---|---|---|
| 版本 | `tma --version` | `0.1.33` | 2026-09-17 |
| **包体测量**（P1-06 指定工具） | `tma project-size dist/build/mp-toutiao --json` | `{"main":{"path":"…/dist/build/mp-toutiao/","size":1066172},"sub":[],"total":1066172}` **exit 0（无需登录）** | 2026-09-17 |

**解读**：抖音产物主包 **1,066,172 B ≈ 1.02 MB**、**无分包**（`sub: []`）；产物含 `app.json`＋`app.js`＋`app.ttss`＋`project.config.json`（见 `phase4-prep.md` §2 实测）。
⚠️ **未做**：`tma preview --qrcode-output`（出码需**登录＋平台 AppID**）⇒ P1-06 的「工具打开/出码」部分仍待主人提供 AppID 后执行。

## 2. 微信

| 项 | 状态 |
|---|---|
| 微信开发者工具 CLI | **未验证**（本轮未跑；需本机装「微信开发者工具」并开启 CLI/服务端口） |
| 产物 | `dist/build/mp-weixin`（18 页，AI 六页含）已由 `uni build` 产出；**工具打开结果未记录** |

⇒ P1-06／P1-25／P1-28 的**微信工具侧**仍未满足（需真机/工具环境）。

## 3. 未做清单（诚实）
- `tma preview`／`upload`／`audit`（需登录＋AppID＋类目资质）
- 微信工具打开、样页（`_probe/wot-sample`）在两端工具中的**实际打开结果**
- 任何**真机**运行记录（属 `device-acceptance-checklist.md`）

### 2026-09-22 抖音端新增证据（首轮体检→预览→上传）

| 项 | 命令 | 结果 | 日期 |
|---|---|---|---|
| **预览出码**（P1-06／P4-14 前置） | `tma preview --qrcode-output /tmp/tt-preview.png dist/build/mp-toutiao` | **exit 0**；二维码 PNG 973 B；短链 `https://t.zijieimg.com/iXxNvAkY/` | 2026-09-22 |
| **体验版上传**（抖音首次） | `tma upload -c "[gc5b7be2] …" dist/build/mp-toutiao` | **`🎉 Upload success`**；版本 `0.0.1`（平台自动分配）；主包 **1.33MB** | 2026-09-22 |
| 包体积（复测） | `tma project-size dist/build/mp-toutiao --json` | `{"main":{"size":1174673},"sub":[],"total":1174673}` | 2026-09-22 |
