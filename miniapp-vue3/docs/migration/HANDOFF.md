# 迁移接续指引（HANDOFF）— 2026-09-17 立

> 用途：任何新会话/新 agent 接手本迁移时**先读这一页**，30 秒进入状态。细节再按需展开到对应文档。
> 仓库：`/home/majunhi/blueberry-vue3-migration`（分支 `feat/vue3-migration`，fork `crazyma99/blueberry`）｜新端应用根：`miniapp-vue3/`

## 1. 当前 HEAD 与同步状态

- 最新提交：以 `git log --oneline -1` 为准；**每笔完成后 `git push fork feat/vue3-migration`**（本次交接时 `9e7466c`，fork 完全同步、工作树干净）
- 验证基线命令（每笔必跑）：`cd miniapp-vue3 && npx vitest run` ＋ `npx vue-tsc --noEmit` ＋ 三平台 `npx uni build -p mp-weixin / -p mp-toutiao / npx uni build`
- 产物页数实证：`dist/build/mp-weixin/app.json` vs `dist/build/mp-toutiao/app.json`（**AI 六页仅微信**）

## 2. 文档地图（谁写谁读）

| 文档 | 作用 |
|---|---|
| `docs/uniapp-vue3-migration-phases.md`（仓库根 docs） | **验收条目唯一来源**（P0/P1/P2/P3/P4/P5-x）；勾选必须附证据 |
| `g3-acceptance.md` | **G3（Phase 3 出口）对账**：四条验收命令＋「17 路由/三池/买断/分享」＋未达成项 |
| `device-acceptance-checklist.md` | **微信真机自验清单**（当前唯一卡口的可执行表） |
| `phase4-prep.md`＋`platform-capability-matrix.md` | Phase 4 准备件（范围/缺口/能力矩阵草表） |
| `trial-release-record.md` | **体验版发布记录**（CLI 通路／两个必踩坑／每次上传留痕） |
| `profile-build-records.md` | Profile 整包构建留档（P1-35 的 manifest/hash 表，自动汇总） |
| `scripts/e2e-build.mjs` | 合成 Profile 端到端管线（`node scripts/e2e-build.mjs mp-toutiao both`），已入 CI 新端车道 |
| `miniapp-vue3/docs/migration/parity.md` | 17 页 × 15 组件去向台账（ported／not_started） |
| `miniapp-vue3/docs/migration/contracts.md` | 端点合同冻结表（含 Phase3 credits／AI 端点） |
| `miniapp-vue3/docs/migration/deviations.md` | 有意偏差登记（已 8 条） |
| `miniapp-vue3/docs/migration/t8-ai-tryon-plan.md` | T8 五片切分＋**§3.1 进度表**＋**§3.2 踩坑留痕**＋**§7 验收对账** |
| `miniapp-vue3/docs/migration/inventory.md` | 旧端清单（页/组件/wrapper） |

## 3. 已完成（可放心依赖的底座）

- **T5／T6／T7 全绿**：HTTP client（`X-App-Code` 恒带、`X-Brand-Id` 仅品牌作用域、`replayPolicy` 默认 `never`）、versioned storage（旧键兼容迁移）、14 个仓储、11 条公开路由页、native tabBar 适配
- **P2-01～P2-09 全勾**（含 P2-03 静默换票：`platform/uni/login.ts`＋`application/silent-login.ts`，11 页零 stub）
- **T9a 共享支付**（P3-01～06 勾选）：`payment-coordinator`（`recharge`／`resume`，‘超时≠作废’）＋`credits` 四端点＋`platform/weixin/payments`（fail-closed）
- **T8 AI 试衣主体**：`aiTryOn`／`aiTryOnResult`／`aiTryOnHistory` 三页（1409/196/344 级）＋`ai-recommend-flow` 之外的全套适配（上传端口、照片质量管线、VK 人脸、截屏保护、订阅消息、分享 JPG 缩略、图片预热）＋`GenerationProgress` 等组件（**组件台账 14/15**）
- 测试：50 文件、**351 passed／3 skipped**（skipped 为 gated provider 只读核对）

## 4. 在途与下一步（2026-09-17 第二轮刷新）

### 当前卡口：**只剩微信真机证据**
| 待验 | 清单 | 谁做 |
|---|---|---|
| `P3-11` 保存/买断、`P3-15` 纵切、`P3-13` 分享三分支、T9b 同步扣费、`P0-11` 基准 | **`device-acceptance-checklist.md`**（逐条「操作步骤／预期结果／记录项」，照做即可） | **主人或测试同学** |
| 抖音真机（`P4-14`） | ~~需先解决 **AppID 占位**~~ **AppID 已注入并出包验证（2026-09-18）**；剩 `tma preview` 出码＋主人手机扫码逐项验 | 主人手机＋装有 `tma` 的机器 |

### 台账（`phases.md` 为唯一来源；**计数入口：`python3` 按 Phase 段统计 `- [x]`**）

> ⚠️ 计数留痕：2026-09-17 一笔提交信息曾把合计写成 79→81，**权威计数为 78→80**（我多算 1，已在此更正；以本表与 `phases.md` 为准）。

| 阶段 | 勾选 | 未勾的都是什么 |
|---|---|---|
| Phase 0 | 12/15 | `P0-10` 留档、`P0-11` 真机基准、`P0-12` 待主人书面确认 |
| Phase 1 | **32/37** | 余 5 条需工具/真机或待主人拍板（`P1-06/25/28` 工具·样页、`P1-33` 旧仓护栏、`P1-35` 工具打开） |
| Phase 2 | 21/23 | `P2-15/16` 真机 |
| Phase 3 | 19/20 | **`P3-15` 微信真机** |
| Phase 4/5 | 0/40 | **未开工**（门禁＝G3 通过） |
| 合计 | **84/135** | — |

### Phase 4 准备件（已备、**未开工**，勿误解为 P4 已勾）
- `phase4-prep.md`：范围（抖音＝客片展示版 11 页/3 tab、AI 六页不注册、零支付）＋产物实证＋P4-01～17 缺口对照＋**三项外部前置**
- `platform-capability-matrix.md`：**P4-10 草表**（**14 行**能力×2 端，凡未真机验证记 `unknown`；小红书列暂缺）
- `scan-platform-usage.mjs`＋spec：**P4-12 规则**（敏感平台 API 仅允许 `src/{platform,ui,generated}/**` 或**显式登记例外**；不对 bundle 盲 grep）
- `verify-target.mjs` 扩展＋spec：**P4-13**（产物级 `forbiddenRoutes`／抖音 `app.ttss` 指纹／appid 占位 `warnings`）

### 外部前置（需主人/后端/运营）
1. `P0-12`／`P4-01` 书面口径（跨平台账号·手机号·余额·买断能否共用；不确定则保持 provider 隔离）
2. 各平台 **AppID**/权限/类目/支付资格证据（~~抖音现为 `testAppId` 占位~~ **抖音真实 AppID `ttd6aba01648cc1bf701` 已于 2026-09-18 由主人提供并写入 `profiles/blueberry/project.env`，build-target 实测出包 verify 全绿**；仍缺类目/支付资格证据）
3. 各平台后台**合法域名**（request/upload/download、H5 CORS、COS 权限）（`P4-06`）

## 5. 踩坑留痕（**务必先读，能省数小时**）

1. **CSS 注释勿以 `*` 收尾**：`.gen-btn-*/` 会提前闭合注释 → postcss「Expected a pseudo-class」构建失败。
2. **失败提示勿只写 `catch`**：新端 client／仓储只返回 `Result`、**从不抛**（同 brandHub CR 🔴2）⇒ 提示必须落在 `!res.ok` 分支。
3. **模板内禁 TS `as`**（vue-tsc 语法错）——需要取值就提出方法。
4. **`uni.chooseImage`／`uploadFile` 类型更严**：按 `Record` 收窄后自行解析 res。
5. **token 雷区**：旧 `--font-size-body=24rpx` ≠ `tokens.semantic.fontSizeBody(32rpx)`；金色→`colorAction`；金色面上墨色→`colorActionText`；派生透明度用 rgba 字面量＋注释。
6. **AI 页注册**：`pages.json` 里只加进**既有 `#ifdef MP-WEIXIN` 块**，勿新增第二个块（抖音不注册 AI 六页）。
7. **扣费类接口**（recharge／redeem／submitTryOn／recommend／download／wx.login）一律 `replayPolicy:"never"`；**等待页不得用重复 POST 当轮询**。
8. **子代理易空转**：宽任务（多页）常多轮无产出；**窄任务（单页、限时、先写后读）成功率更高**，且宽任务超时后应 `interrupt_agent` 再窄派。
9. **写文件的脚本必须「先构造字符串、再写」——且优先写临时文件再替换**（2026-09-17 真实事故）：`open(path,'w').write(list)` 会在
   `write()` 抛错前**先把文件截断**，紧接着的 `git add` 会把「空文件」提交成大规模误删（本项目曾因此提交出「phases.md −836 行」）。
   正确姿势：`text = '\n'.join(lines)` → 必要时 `write(tmp)` → `os.replace(tmp, path)`；**提交前先 `git diff --stat` 复核增删行数**。
   事故处置留痕见 commit `1b4ad0c`（从历史恢复＋差异校验为 1 insert/1 delete）。
10. **macOS 本机工具链（2026-09-18 实测）**：系统 `pnpm@9.6` 不认 `pnpm-workspace.yaml` 的 `allowBuilds`（报 `packages field missing or empty`），且 `pnpm@11.7` 在 Node v20.20 下起不来（`ERR_UNKNOWN_BUILTIN_MODULE`）⇒ 一律用 **Node v22.22（nvm）＋ pnpm 11.7 shim**（`/tmp/pnpm11-shim/pnpm`，或 `npx pnpm@11.7.0`）；`build-target` 内部调 `pnpm`，跑管线前把 shim 目录放 PATH 最前。

## 6. 纪律（不可让步）

开发 → **单测** → **独立 CR** → **三平台构建**，逐任务一笔提交、**路径精确暂存**、**绝不混单**、**绝不 `--no-verify`**；偏差必须写进文件头注释＋`deviations.md`；**未完成不得标记完成**（台账以证据为准）。
