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

## 4. 需主人/负责人拍板的点（先登记，不擅自定）

1. **截屏保护范围**：旧端在试衣页/结果页 `wx.setVisualEffectOnCapture(hidden)`；抖音端无该 API 且 AI 页不注册 → 本批仅微信实现，是否需要在其他端做等效替代？
2. **上传通道设计**：新端 http client 不覆盖 `uni.uploadFile`（无统一拦截器）。S1 拟新增 `ports/upload` 端口＋uni 适配（保留品牌头注入与失败重试语义），是否认可？
3. **`requestTaskNotify`（订阅消息）**：旧端在提交前请求订阅；新端保留（fail-soft，拒绝不阻断提交），是否保留？
4. **`resumeGenerateIfNeeded` 的后端依据**：新端按「后端任务态」而非本地标记恢复，需确认后端是否已有可查询的「进行中任务」端点（若无，则以 `getAiTasks` 列表内 `pending/processing` 兜底）。

## 5. 已完成的可复用底座（勿重复实现）

- `infrastructure/repositories/ai.ts`（templates/styles/tasks/recommend）＋契约测试（`d3a2dd8`）
- `infrastructure/repositories/credits.ts`＋`application/payment-coordinator.ts`＋`platform/weixin/payments.ts`（`31586ee`/`d21316e`）
- `application/login-flow.ts`／`user-info-store.ts`／`components/LoginPopup`（P2-18）
- `application/page-config-content.ts`＋`AppFooter`（P2-21）
- 注册口径：AI 页 `pages.json` 以 `#ifdef MP-WEIXIN` 包裹（产物实证：微信含／抖音不含，`d002d7c`）
