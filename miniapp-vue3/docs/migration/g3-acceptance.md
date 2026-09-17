# G3 验收对账（Phase 3 出口）— 2026-09-17

> 口径来源：`docs/uniapp-vue3-migration-phases.md`「**G3验收命令**」与「**验收 G3**」两段。
> 本表**只记可复算证据**；未达成项一律标 ❌／🟡，不做「口头通过」。

## 1. G3 验收命令（原样执行，2026-09-17）

| # | 命令（phases 原文） | 实际执行 | 结果 |
|---|---|---|---|
| 1 | `pnpm --dir miniapp-vue3 run typecheck` | `vue-tsc --noEmit` | ✅ **exit 0**（0 错） |
| 2 | `vitest run tests/unit tests/contracts tests/components tests/pipeline` | 同 | ✅ **361 passed / 0 skipped**（52 文件；skipped 3 例属 `tests/provider` gated，不在该命令集合内） |
| 3 | `run build:mp-weixin` | `uni build -p mp-weixin` | ✅ **exit 0** |
| 4 | `run build:mp-toutiao` | `uni build -p mp-toutiao` | ✅ **exit 0** |

附：`npx uni build`（h5）亦 exit 0；产物页数 `mp-weixin` **18 页**／`mp-toutiao` **12 页**。

## 2. 验收 G3 三条

### 2.1 「17 条微信公开路由与原业务都已覆盖」 ✅

- `src/pages.json` 共 **18 条**＝**11 条公开业务路由**（index／demoDetail／targetPhotoDetail／priceHomePage／priceList／mine／favorites／brandHub／webview／policies/user／policies/privacy）
  ＋**6 张 AI 页**（aiTryOn／aiTryOnResult／aiTryOnHistory／aiRecommend／aiRecommendLoading／aiRecommendResult）＋**1 条 debug probe**（`pages/_probe/wot-sample`，按 G2 口径**不计业务页**）
- ⇒ **17 条业务路由全部 ported 且注册**（对照 `miniapp-vue3/docs/migration/parity.md`：17 页逐条带批次与提交证据，AI 六页 2026-09-17 全部 ported）
- **平台边界**：AI 六页仅在 `#ifdef MP-WEIXIN` 块内 ⇒ `mp-toutiao` 产物 12 页不含任何 AI 页（2026-09-17 主人拍板「抖音无 AI 功能」）

### 2.2 「3 个池／下载买断、分享匿名/付费边界通过」 🟡（代码级通过；真机待验）

| 项 | 证据 |
|---|---|
| **三池归属**（tryon 默认／recommend 显式／download＋taskId） | `tests/contracts/credits.spec.ts`（5 例：三池 body 逐字、边界不传）；`tests/unit/t44` 入参逐字 |
| **权益口径**（paid≠权益到账） | `application/ai-result-flow.ts`：tryon/recommend 需 `balance>0`、download 需服务端 `taskBought=true`；`t39` 12 例（含「paid 先到而权益未到不判成功」可控延迟） |
| **下载买断** | 结果页水印**仅覆盖预览**（保存走原图 URL）＋买断认服务端 `taskBought`；`canSaveOriginal` 三条件合取（非付费∨余额>0∨已买断） |
| **分享匿名边界** | `application/ai-share-routing.ts`：`loadSharedTaskOnce` **只拉一次**（不轮询/不重试/不要求登录）、空 token **零请求**、非法/过期 → failed；`shareReadOnly` 时结果页**只渲染「我也要试」**＋`saveToAlbum()` 首行 `if (shareReadOnly) return` 兜底；`t40` 9 例 |
| **付费边界** | 四张 AI 页**只**消费共享 `payment-coordinator`（`P3-07`：`grep createPaymentCoordinator src/pages/` 恰命中四页，页内无直接 `tryBegin`）；`t45` 静态守卫禁「等待页持查单能力」与「重复 POST 当轮询」 |
| ⚠️ **真机** | **未执行**：`P3-11`（结果页保存/买断真机联调）与 `P3-15`（微信真机）仍需真机环境 —— 主人 2026-09-17 明确「稍后自己验微信真机」 |

### 2.3 「缺身份/支付 provider 的非微信端此时仍不得标 G4 通过」 ✅（未越界）

- 抖音端产物 **12 页、零 AI 页**；支付适配 `platform/weixin/payments.ts` 对非微信/无 API 一律 `unsupported`（**fail-closed，不假装成功**），`t31`／`t36` 断言；
- 本仓**未**对抖音端声明任何支付/登录/下载能力 ⇒ 未触碰 G4 口径。

## 3. 未达成项（**G3 结论以本表为准：本地套件通过；真机与两项独立 CR 未完成**）

| # | 项 | 状态 | 说明 |
|---|---|---|---|
| 1 | `P3-11` 结果页保存/买断**真机**联调 | ❌ | 需微信真机（主人自验） |
| 2 | `P3-15` **微信真机**证据 ＋ **T8 独立 CR** | ❌ | 真机由主人；T8 独立 CR 未派（此前 CR 子代理多次超时） |
| 3 | `P3-20` 页级场景测试 ＋ **T9b 独立 CR** | 🟡 | 内核/静态层已覆盖（`t44` 连点·复用·失败不重发·分类；`t45` 禁自建轮询·分数口径·`#ifdef` 单块；`t46` 渲染与脏数据）；**页级场景补测（连点/401/4001/超时/弱网/旧响应覆盖）与 T9b 独立 CR 在途** |
| 4 | G2 复核 🟡 两条 | 🟡 | ①`aiTryOnResult` 的 `downloadFile`／`saveImageToPhotosAlbum`／`authorize` 下沉 `platform/uni/*` 端口；②`share` 端点契约并入 `tests/contracts/` |

## 4. 结论

**G3「本地套件」部分通过**（四条命令全绿、17 条业务路由覆盖、三池/买断/分享边界在**代码＋单测**层成立）；
**不得标 G3 完全通过**——`P3-11`／`P3-15` 的**微信真机**证据与 T8/T9b 两项**独立 CR**、`P3-20` 页级补测仍未完成。
非微信端（抖音）**未**声明支付/身份能力，符合「不标 G4」要求。
