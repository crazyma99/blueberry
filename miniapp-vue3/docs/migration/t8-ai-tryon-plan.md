# T8 AI 试衣闭环迁移实施方案（2026-09-17 立）

> 目的：把旧端 2868 行的 AI 试衣三页拆成**可独立提交/验证的切片**，避免一次大改与跨会话重复摸结构。
> 状态：`aiTryOnHistory`（344 行）**已完成**（T8 首片，`d002d7c`）；本文覆盖剩余两页。

## 1. 范围与规模

| 页 | 旧端行数 | 状态 | 备注 |
|---|---|---|---|
| `aiTryOnHistory` | 344 | ✅ ported（`d002d7c`） | 记录列表；`#ifdef MP-WEIXIN` 注册 |
| `aiTryOn` | 1176 | ⏳ 待迁（S1–S4） | 模板选择/上传/提交/扣费/轮询 |
| `aiTryOnResult` | 1348 | ⏳ 待迁（S5） | 结果轮询/下载买断（`taskBought` 权益） |

## 2. 旧端结构图（`blueberry/src/pages/aiTryOn/index.uvue`，供逐段对照）

| 区段 | 行 | 内容 |
|---|---|---|
| template | 1–131 | 模板主图 swiper＋缩略图条（可折叠）＋身形/年龄选择＋上传/生成按钮＋登录弹窗 |
| script | 133–149 | imports |
| data | 150–195 | 列表/选中索引/照片路径/loading/credit 相关/协议·弹窗状态 |
| computed | 196–218 | `isPaidMode`（priceFenPerCredit>0）／`priceText`／`bodyIndex`／`bodyTypeText` |
| onLoad | 219–270 | **`options.brandId` 品牌覆盖**（:255 `setBrandId`）＋初始化 |
| onShow / onHide / onUnload | 271–299 | 刷新＋**截屏保护开关**（`enableCaptureProtection`/`disableCaptureProtection`，onUnload 必须恢复） |
| methods | 300– | 见下 |

关键方法（行号）：

| 方法 | 行 | 职责 | 新端去向 |
|---|---|---|---|
| `tplThumb`/`thThumb` | 302–309 | 缩略（模板/缩略条） | `application/image.cosThumb` |
| `enable/disableCaptureProtection` | 310–340 | `wx.setVisualEffectOnCapture(hidden)`＋canIUse/try-catch | **S1 新增 `platform/weixin/capture.ts`** |
| `resolveRandomAlbum` | 341–356 | 随机相册兜底 | S2 |
| `loadTemplates` | 357–398 | `getAiTemplates`＋`getAiStyles` | **ai 仓储（已就绪 `d3a2dd8`）** |
| `onSwiperChange`/`toggleThumbStrip`/`selectTemplate` | 399–412 | swiper 与时序 | S2 |
| `selectBodyType`/`onBodyChange`/`selectAge` | 413–429 | 身形/年龄选择 | S2 |
| `choosePhoto` | 430–455 | 选图 | S3 |
| `requestTaskNotify` | 456–481 | `wx.requestSubscribeMessage`（任务完成通知） | **S1 新增适配（fail-soft）** |
| `checkAndAcceptPhoto` | 482–505 | 图片合规校验 | S3 |
| `uploadSelectedPhoto` | 506–530 | **`uni.uploadFile`**（不走 http client，品牌头需手工注入，旧 api.uts:6/42/502） | **S1 新增 `ports/upload` ＋`platform/uni/upload.ts` 适配** |
| `handleGenerate` | 531–537 | 门闩入口 | S4 |
| `runSubmitFlow` | 538–628 | 提交（含 4001 → 充值拉起） | **S4 接 `payment-coordinator`（`recharge`＋`resume`）** |
| `loadCreditInfo` | 629–643 | `getCreditBalance`（含 `priceFenPerCredit`/`taskBought`） | **credits 仓储（已就绪 `31586ee`）** |
| `handleRecharge`/`pollRechargeStatus` | 644–729 | 旧端自建充值轮询（**每 2500ms 自拉 status**） | **S4 全部退役 → 用 coordinator 的 `recharge`/`resume`（含终态释放门闩）** |
| `resumeGenerateIfNeeded` | 730–737 | 回到页面继续未完成任务 | S4（改用 `resume(outTradeNo)`＋后端任务态） |
| `closeLoginPopup`/协议/`onGetPhoneNumber` | 738–830+ | 登录弹窗接线 | 复用 P2-18 的 `LoginPopup`＋`login-flow` |

## 3. 切片计划（每片：开发 → 单测 → 独立 CR → 三平台构建 → 提交）

| 片 | 内容 | 验收要点 |
|---|---|---|
| **S1** 平台/传输适配 | `platform/weixin/capture.ts`（截屏保护：canIUse 守卫＋onUnload 必恢复）＋`ports/upload`＋`platform/uni/upload.ts`（`uni.uploadFile`＋品牌头注入）＋`requestSubscribeMessage` fail-soft 包装 | 单测：容器无 API 时 fail-soft；onUnload 恢复幂等；上传头含 `X-App-Code`/`X-Brand-Id` |
| **S2** 模板与选择 UI | `loadTemplates/getStyles` 接入＋swiper/缩略条/身形/年龄（模板 1–131 忠实移植） | 单测：空列表兜底、选中态、缩略条折叠、随机相册兜底 |
| **S3** 选图与上传 | `choosePhoto`→`checkAndAcceptPhoto`→`uploadSelectedPhoto` | 单测：合规失败提示、上传失败可重试、上传成功写入 `userPhotoFilename` |
| **S4** 提交与扣费 | `runSubmitFlow` 接 **coordinator**（禁自建轮询）：`balance>0` 直接提交；4001 → `recharge`（`operationId`＝task 维度）→ 成功后重试提交；超时 → `resume(outTradeNo)` | 单测：4001→充值→重试成功；取消不提交；超时不重复扣费；**页面零自建轮询**（grep 断言） |
| **S5** 结果页 | `aiTryOnResult`：轮询任务态＋进度；**下载买断用 `taskBought` 权益**（禁用「仅 paid 即解锁」） | 单测：paid≠权益、买断后放行原图、失败可重试 |

## 3.1 实施进度（2026-09-17 实时）

| 片 | 状态 | 产物／提交 |
|---|---|---|
| 基建 | ✅ | AI 仓储＋契约（`d3a2dd8`） |
| S1 适配层 | ✅ | 上传端口／截屏保护／订阅消息（`0d3806d`＋拍板 `17fd491`） |
| S2 组件 | ✅ | AppSegment／AppSelector／AppPhotoPicker／BottomActionBar（`be1c100`）＋AiTemplatePicker（`39f6d32`） |
| S3 选图·检测·上传 | ✅ | 选图适配＋上传用例（`89676de`）／判定域层（`43114c0`）／微信管线（`960ebd0`） |
| S4 提交 | ✅ | `ai-tryon-submit` 用例（`27e3ad8`） |
| S2尾 页装配 | ✅ | `pages/aiTryOn/index.vue`＋注册（`698fd09`；产物实证微信 14 页含／抖音 12 页不含） |
| **S5-1 结果内核** | ✅ | `ai-result-flow`（轮询＋买断权益）（`2821c10`） |
| S5-2 结果页装配 | ✅ | `pages/aiTryOnResult/index.vue`（1409 行）＋`GenerationProgress`＋注册（本笔；产物实证微信 15 页含三 AI 页／抖音 12 页不含） |
| T9b 推荐三页 | ⏳ | 待 S5 完成后 |

## 3.2 已踩坑留痕（后续务必遵守）

1. **CSS 注释勿以 `*` 收尾**：style 内写 `.gen-btn-*/` 会让 `*/` 提前闭合注释，postcss 报「Expected a pseudo-class or pseudo-element」构建失败（`698fd09` 修复）。
2. **守卫顺序不可调换**：登录先于照片（未登录时点生成拉登录弹窗，而非提示上传）——t37 逐条锁定。
3. **失败提示勿只写 catch**：新端 client/仓储只返回 Result、从不抛（同 brandHub CR 🔴2 教训）⇒ 提示必须落在 `!res.ok` 分支。
4. **`uni.chooseImage`/`uploadFile` 等类型更严**：按 Record 收窄后自行解析 res（`@dcloudio/types` 与实际容器不一致）。
5. **`AlbumBrief.tryonDisabled`**：P2-09 取样未见该键，但旧端随机相册按此过滤 ⇒ 保留为可选字段。

## 4. 待拍板项与结论（2026-09-17 主人已拍板）

| # | 事项 | 结论 |
|---|---|---|
| 1 | 上传通道设计 | ✅ **按已实现方案**：抽出 `ports/upload` ＋ `platform/uni/upload.ts`（保留品牌头注入/失败可重试/容器安全的单一事实源；T8/T9b 上传统一走它） |
| 2 | 截屏保护范围 | ✅ **仅微信端实现**。主人原话：「抖音根本就没有AI相关功能（因为支付都没有）」⇒ 不为其他端设计等效替代；AI 六页 `#ifdef MP-WEIXIN` 注册已与之自洽 |
| 3 | `requestTaskNotify`（订阅消息） | 默认**保留**（fail-soft：拒绝/不支持均不阻断提交）；如需去掉请指示 |
| 4 | `resumeGenerateIfNeeded` 后端依据 | 默认**以后端任务态为准**（`getAiTasks` 列表内 `pending/processing` 兜底）；若后端另有「进行中任务」端点请提供 |


## 5. 已完成的可复用底座（勿重复实现）

- `infrastructure/repositories/ai.ts`（templates/styles/tasks/recommend）＋契约测试（`d3a2dd8`）
- `infrastructure/repositories/credits.ts`＋`application/payment-coordinator.ts`＋`platform/weixin/payments.ts`（`31586ee`/`d21316e`）
- **S1 适配层**：`ports/upload`＋`platform/uni/upload.ts`（品牌头透传）＋`platform/weixin/capabilities.ts`（截屏保护·订阅消息）（`0d3806d`）
- **S2 基础组件**：`AppSegment`／`AppSelector`／`AppPhotoPicker`／`BottomActionBar`（t32 五例；parity 已记 ported）
- `application/login-flow.ts`／`user-info-store.ts`／`components/LoginPopup`（P2-18）
- `application/page-config-content.ts`＋`AppFooter`（P2-21）
- 注册口径：AI 页 `pages.json` 以 `#ifdef MP-WEIXIN` 包裹（产物实证：微信含／抖音不含，`d002d7c`）

## 6. 装配注意（S2/S4 落地时逐条遵守）

1. **BottomActionBar 必须显式传页脚**：`:footer-main-line="footer.mainLine" :footer-support-line="footer.supportLine"`（`footer` 来自 `createPageConfigContent().loadFooter()`）——新端 `AppFooter` 已 props 化，不传则为空白。
2. **组件显式 import**（无自动注册）；`aiTryOn` 需引入 `AppSegment/AppSelector/AppPhotoPicker/BottomActionBar/LoginPopup/ProfilePopup/AppFooter`。
3. **素材已入库**：`/static/aitry-text.png`、`btn-left-icon.png`、`btn-right-icon.png`、`iconpark/down.svg`（S2 提交一并纳入）。
4. **`AppSelector` 用原生 `<picker>`**（保真优先）；是否统一到 wot 口径属**对齐批次**决策，本批不改。
5. **token 雷区**：旧 `--font-size-body=24rpx` ≠ `tokens.semantic.fontSizeBody(32rpx)`；金色→`colorAction`、金色面上的墨色→`colorActionText`；派生透明度按 rgba 字面值。
6. ⚠️ **页面底色决策（S2 装配时定）**：`BottomActionBar` 渐变底沿用旧 `#160F04`（未映射 light `colorPage`，与 `BottomActionBarSecondary` 同口径）⇒ 若沿用，`aiTryOn` 页需保持**深色页底**才自洽；若新端统一亮色，则须同批把该组件与页面一起改并登记偏差。

## 7. T8 验收对账（phases §3.2 P3-08～P3-15；2026-09-17 实时，**未勾选即真缺口**）

| 条目 | 状态 | 证据／缺口 |
|---|---|---|
| P3-08 选图/拍照/质量校验/模板匹配；拒绝授权、取消、文件异常、JSON 异常分别测；**前端检查不替代后端人脸/安全校验** | 🟡 主要达成 | 选图（t34 三态）／质量校验（t35 判定＋t36 管线：分辨率·模糊·人脸 0/多/占比·异常 fail-open）／模板匹配（t38 双入口＋回退）；**声明**：前端质量检查仅为体验拦截，后端人脸/安全校验仍是唯一裁决（前端 fail-open 不阻断上传） |
| P3-09 上传/提交：创建任务与扣次是**有副作用**动作，**不因网络 timeout 自动创建另一任务** | ✅ | `submitTryOnTask`/`recharge`/`redeem` 均 `replayPolicy:"never"`（t37 断言提交形状与守卫）；支付超时语义＝`timeout≠作废`＋`resume(outTradeNo)` 不新建订单（t39/t37） |
| P3-10 真实任务状态与伪进度分离；按旧策略轮询；**离页/切品牌/新请求代次停止旧计时器与写回**；重进按任务状态恢复 | ✅ 已落实（页面级测试待补） | 内核 t39；页面：onHide/onUnload 均 `stopPolling()`＋**每代次新建 poller 实例**（`pollGeneration` 守卫丢弃旧代次 in-flight 回调）＋onShow 按任务态恢复轮询；`start()` 首发 pending 已按旧端归一为 processing |
| P3-11 水印预览／付费原图 URL／任务永久买断；**共享支付确认后只保存一次**；**匿名分享不得获得付费下载能力** | 🟡 代码落实；**原 AUTH_EXPIRED 硬阻塞已于 `be0f6da` 解除**（P2-03 静默换票 provider 落地，`authRequired` 端点不再无票可带），真机实测待主人自验 | 页面：水印仅覆盖预览（保存走原图 URL）＋买断以服务端 `taskBought` 为准＋`resumeSaveAfterCredit` 先清后调＋`isSaving` 防重入＋`saveToAlbum()` 首行 `if (shareReadOnly) return` 兜底＋只读模板仅「我也要试」；⚠️ 历史阻塞（保留留痕）：`downloadResult`／权益查询为 `authRequired`，曾因 `exchangeIdentity` 是 stub 而必然 AUTH_EXPIRED；已由 P2-03 收口（`platform/uni/login`＋`application/silent-login`，11 页清零）解除。**注**：静默换票提供的是 wx-login 会话；后端是否接受该会话完成「下载扣费/买断」属真机与后端联调口径，仍待主人自验 |
| P3-12 记录页一次取全量历史（**不顺带分页**）、删除/返回/进度恢复按旧合同 | 🟡 达成但需对照 | 记录页已迁（`d002d7c`＋t30，**一次全量、无分页**）；旧端该页**无删除功能**（旧 344 行实测）⇒「删除」按旧合同＝不存在，需在收口说明中明确 |
| P3-13 分享分支：好友直达试衣／朋友圈 taskId+shareToken 匿名**只查一次不轮询**／scene1154 不跳页／分享封面网络 JPG 及失败兜底 | ✅ 达成（除端侧人脸卡片） | 内核 `ai-share-routing`（t40：入口/路径/单页 query/只拉一次）＋页面接线；封面 `cosThumbJpg`（朋友圈 500／好友 400）＋空 URL 兜底；**有意偏差②**：端侧人脸居中卡片（`faceShareCard.uts`）未迁，直接走网络 JPG 兜底（旧端 catch 分支同口径） |
| P3-14 防截屏/字体/媒体按平台 capability；onHide/onUnload 恢复作用域；**未实现不能返回假成功** | ✅ | `createCaptureGuard`（canIUse 守卫＋enable/disable 幂等，t31）＋主流程页 onShow/onHide/onUnload 接线（`698fd09`）；语义沿用旧端 **fail-open**（无 API 即跳过），非「假成功」——已在 S1 文档声明 |
| P3-15 单测/合同/**微信真机**/独立 CR 通过后提交 B3 三页 | ❌ 未达成 | 单测 322 passed/3 skipped、TC 0、三平台构建 0、双端产物页数实证；**微信真机验证与 T8 独立 CR 未做**（真机需真机环境；CR 子代理此前多次超时）⇒ 收口前必补 |

**结论（诚实口径）**：T8 三页中 `aiTryOnHistory`／`aiTryOn` 已迁并就绪，`aiTryOnResult` 装配在途；**P3-13（分享分支）与 P3-15（真机＋独立 CR）为明确未完成项**，故 **T8 尚未收口**。
