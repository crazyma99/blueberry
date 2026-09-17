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
| `docs/uniapp-vue3-migration-phases.md`（仓库根 docs） | **验收条目唯一来源**（Phase 2：P2-xx；Phase 3：P3-xx）；勾选必须附证据 |
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

## 4. 在途与下一步（2026-09-17 更新）

| 项 | 状态 | 下一步 |
|---|---|---|
| **T9b 推荐三页** | ✅ **已完成**（`aiRecommend` 737／`aiRecommendLoading` 584／`aiRecommendResult` 518；P3-16～19 勾选） | — |
| `P3-20` 页级场景测试 ＋ **T9b 独立 CR** | 🟡 CR 在途；内核/静态层已覆盖（`t44` 连点·复用·失败不重发·分类；`t45` 禁自建轮询·分数口径·`#ifdef` 单块；`t46` 渲染与脏数据） | CR 结论回来后按 🔴 修＋补页级场景（401/4001/超时/弱网/旧响应覆盖） |
| **T8 收口** | 🟡 主体完成；`P3-11` 真机、`P3-15`（真机＋**T8 独立 CR**）未达成 | 派 T8 独立 CR；真机由**主人自验** |
| **G3 验收** | 🟡 **本地套件通过**（四条命令全绿、17 条业务路由覆盖）；真机与两项 CR 未完成 ⇒ **未标完全通过**，见 `g3-acceptance.md` | 补 CR 与真机证据后复检 |
| G2 复核 🟡 | ②✅（share 契约已入 `tests/contracts/`）；①⏳ | ①`aiTryOnResult` 约 90 行 wx 管线（`downloadFile`/`saveImageToPhotosAlbum`/`authorize`）下沉 `platform/uni/*`——独立小批次 |
| 全仓 AI 页注册 | ✅ 六页仅微信（产物 18/12 页实证） | 抖音仍不注册（主人拍板「抖音无 AI 功能」） |

**纪律提醒**：`P3-*` 的勾选一律以 `phases.md` 为唯一来源，勾选必须附证据；`g3-acceptance.md` 是 Phase 3 出口对账，**未达成项不得口头通过**。

## 5. 踩坑留痕（**务必先读，能省数小时**）

1. **CSS 注释勿以 `*` 收尾**：`.gen-btn-*/` 会提前闭合注释 → postcss「Expected a pseudo-class」构建失败。
2. **失败提示勿只写 `catch`**：新端 client／仓储只返回 `Result`、**从不抛**（同 brandHub CR 🔴2）⇒ 提示必须落在 `!res.ok` 分支。
3. **模板内禁 TS `as`**（vue-tsc 语法错）——需要取值就提出方法。
4. **`uni.chooseImage`／`uploadFile` 类型更严**：按 `Record` 收窄后自行解析 res。
5. **token 雷区**：旧 `--font-size-body=24rpx` ≠ `tokens.semantic.fontSizeBody(32rpx)`；金色→`colorAction`；金色面上墨色→`colorActionText`；派生透明度用 rgba 字面量＋注释。
6. **AI 页注册**：`pages.json` 里只加进**既有 `#ifdef MP-WEIXIN` 块**，勿新增第二个块（抖音不注册 AI 六页）。
7. **扣费类接口**（recharge／redeem／submitTryOn／recommend／download／wx.login）一律 `replayPolicy:"never"`；**等待页不得用重复 POST 当轮询**。
8. **子代理易空转**：宽任务（多页）常多轮无产出；**窄任务（单页、限时、先写后读）成功率更高**，且宽任务超时后应 `interrupt_agent` 再窄派。

## 6. 纪律（不可让步）

开发 → **单测** → **独立 CR** → **三平台构建**，逐任务一笔提交、**路径精确暂存**、**绝不混单**、**绝不 `--no-verify`**；偏差必须写进文件头注释＋`deviations.md`；**未完成不得标记完成**（台账以证据为准）。
