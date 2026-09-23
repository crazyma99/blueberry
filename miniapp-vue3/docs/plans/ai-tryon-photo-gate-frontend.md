# AI 试衣「上传照片质量拦截（4002 + check_code）」前端处理与设计方案

> **版本** v0.1（**待主人评审**，本轮只做设计、未改任何实现代码）
> **需求来源**：《C端小程序 AI试衣交互链路优化 PRD》环节三 · 上传前质量拦截
> **后端契约**：`lanmei-backend-golang` → `docs/api-tryon-photo-gate.md` v1.0（2026-09-23）；后端分支 `dev-dtw-AI链路(拦截图片提示优化)` ＝ `staging`（提交 `d444e98`），对接人：天文
> **前端落点**：`blueberry-vue3-migration` / 分支 `feat/vue3-migration` / 应用根 `miniapp-vue3`
> **一句话**：把「`4002` + `check_code`」从 HTTP 信封**一路带到 `aiTryOn` 页面**，用**底部弹层**展示「具体原因 + 示例图 + 重拍引导 + 本次未消耗试衣次数」，拦截后**可立即重传**（重走创建任务，不再额外扣次）。

---

## 1. 契约速查（后端已就绪）

| code | 含义 | 前端处理 |
|---|---|---|
| `200` | 创建成功（`data.task_id`） | 进入等待页（**现有逻辑不动**） |
| `4001` | 次数不足 | 引导充值/兑换（**现有逻辑不动**） |
| **`4002`** | **照片质量拦截（本次新增）** | 读 `data.check_code` → 弹拦截提示（原因+示例图+重拍引导） |
| `401` | 未登录 | 跳登录（现有逻辑） |
| `500` | 通用业务错误 | toast `message`（现有逻辑） |

- 影响接口：**仅** `POST /api/aiface/tasks`（创建试衣任务）；**请求参数完全不变**；上传接口与 `recommend` 本期不动。
- HTTP **恒 200**，业务结果看 `code`（与 4001 同风格）；`4002` 发生在**扣次之前** ⇒ **不扣次数、不扣费**（前端**不得**出现「已退次」类文案）。
- `check_code` 枚举（**只有这 4 种**，后端单测锁死）：`no_face` ／ `multi_face` ／ `face_too_small` ／ `side_face`；**未知码必须兜底**「照片未通过检测，请重新上传」。
- 后端 **fail-open**：判定服务异常/开关关闭时**放行**（前端不可假设「没拦截＝照片合格」）。
- **端侧预检保留**（双保险）：现有 `photoCheck`（分辨率/模糊/VK 人脸）继续跑，云端判定兜底。
- 埋点（PRD 第六节）：`ai_tryon_quality_reject`，携带 `check_code`。

## 2. 现状盘点（改动点，均为实证）

| # | 位置 | 现状 | 方案 |
|---|---|---|---|
| 1 | `src/domain/payment-state.ts:81-89` `mapBusinessCode()` | 仅 `4001 → INSUFFICIENT_CREDITS`，其余数字码 → `BUSINESS` | **新增 `4002 → QUALITY_REJECTED`**（错误种类单一事实源，`AppErrorKind` 由 `BusinessError["kind"]` 自动扩展） |
| 2 | `src/infrastructure/http/errors.ts:12-19` `AppError` | 字段仅 `kind/businessCode/message/requestId/retryable` —— **没有 `data`** ⇒ `check_code` **到不了页面** | **新增可选 `businessData?: unknown`**（后端文档 3.3 已预警「若封装丢弃 data 需小改」） |
| 3 | `src/infrastructure/http/errors.ts:37-47` `mapBusinessFailure()` | 未接收业务 `data` | 增形参 `data`，贯穿到 `AppError.businessData` |
| 4 | `src/infrastructure/http/client.ts:127-132` 信封解码 | 失败分支只传 `businessCode/message/requestId` | 同步传 **`http.data`**（成功路径零改动） |
| 5 | `src/application/ai-tryon-submit.ts:38-44` `SubmitOutcome` | `ignored/need-login/toast/need-recharge/submitted` —— **无拦截态** | **新增 `{ kind: "quality-rejected"; checkCode: PhotoGateCheckCode }`** |
| 6 | `src/application/ai-tryon-submit.ts:122-127` | 已有 4001 归一化（插入点参照） | 在 4001 分支前/后加 `QUALITY_REJECTED` 归一化 + `check_code` 解析（未知码兜底） |
| 7 | `src/pages/aiTryOn/index.vue:432` `switch (out.kind)` | 无拦截分支 | **新增 `case "quality-rejected"`**：隐藏 loading → 弹拦截弹层 → 支持立即重传 |
| 8 | 素材 | ⚠️ `src/static/demo1.png`／`demo2.png` 实为**门店/景区宣传图**（红河水乡、太平湖），**不是**上传引导示例图；**测试用例图已定位**＝`~/文档/face-quality-api/cases/`（百度人脸 V3 兼容服务的 10 例测试集） | **弹层示例图需求已定稿**（正反例对比／AI 真实感／复用现有 IconPark／**JPG 或 PNG**）⇒ 素材**待产出**，见 **§5.3.2**；联调造数清单见 §5.3.1 |
| 9 | 埋点 | 全仓 **无埋点端口**（`track/report/beacon` 零命中） | 新增最小端口（见 §4.5），或本期仅登记待办 |
| 10 | 端侧预检 `src/domain/photo-check.ts` + `src/platform/weixin/vk-face.ts` | 已存在 | **保留不动**（文案风格可与云端统一，非必须） |

## 3. 设计目标与原则

1. **契约唯一事实源**：识别码类型与文案映射集中在应用层，UI 组件**不自带文案**。
2. **最小侵入**：只在信封解码处补 `data` 透传；不新造错误通道、不影响成功路径与 4001/401/500 既有行为。
3. **fail-open 对齐**：前端不把「未拦截」当作「合格」的保证；不新增任何基于拦截的本地扣次/退款逻辑。
4. **可测**：每个新增分支都有单测 + 变异；页面级断言「无第二次 POST」「不走充值」「可立即重传」。
5. **门面纪律**：弹层复用 `src/ui/*` 门面（`BasePopup`/`BaseDialog`），业务组件零 `wd-*` 直用；样式走 token。

## 4. 方案

### 4.1 数据流

```
用户点「生成」 → submitTryOnTask → POST /api/aiface/tasks
   → client 解信 → code===200 ? 成功 : mapBusinessFailure(code, message, requestId, **data**)
       → mapBusinessCode: 4002 → kind=QUALITY_REJECTED
   → repo 原样返回 Result<_, AppError>
   → ai-tryon-submit 归一：QUALITY_REJECTED → { kind:"quality-rejected", checkCode }
   → pages/aiTryOn switch(out.kind) → 弹 QualityRejectSheet（原因/示例图/引导/未扣次安抚）
   → 用户「重新选择照片」→ 既有选图 + photoCheck + 上传链路 → 再走 submitTryOnTask
```

### 4.2 类型与单一事实源（新增 `src/application/photo-gate.ts`）

```ts
export type PhotoGateCheckCode = "no_face" | "multi_face" | "face_too_small" | "side_face";

/** 与后端 enum 对齐；`unknown` 兜底（契约：后端只会 4 种，但必须向前兼容） */
export interface PhotoGateCopy { title: string; text: string; asset: string }
export const PHOTO_GATE_COPY: Record<PhotoGateCheckCode | "unknown", PhotoGateCopy> = { … };

/** 解析任意服务端返回值 ⇒ 已知码或 "unknown"（永不抛） */
export function resolvePhotoGateCode(raw: unknown): PhotoGateCheckCode | "unknown";
export function resolvePhotoGateCopy(raw: unknown): PhotoGateCopy;
```

- 文案基线（取自后端文档，逐字可改）：`no_face`「未检测到清晰人脸」／「未检测到人脸，请上传单人正面照，可参考示例图」；`multi_face`「检测到多张人脸」／「请上传单人照片，避免合照」；`face_too_small`「人脸太小」／「请靠近一些或裁剪后上传」；`side_face`「请正对镜头」／「侧脸会影响生成效果，请正对镜头再拍一张」；`unknown`「照片未通过检测」／「请重新上传」。

### 4.3 错误模型扩展（最小侵入、向后兼容）

- `AppError.businessData?: unknown`（可选 ⇒ 既有所有读取方零影响）；`mapBusinessFailure(code, message, requestId, data?)`。
- 约定：**只有业务失败**才可能带 `businessData`；成功路径（`res.ok`）不涉及。
- 备选（若评审倾向不动 `AppError`）：在 `client.ts` 对 `4002` 单独短路，直接返回带 `check_code` 的领域错误。**不推荐**——会破坏「错误模型单一入口」的家法。

### 4.4 交互与 UI（对齐 PRD 验收）

- **形态**：**底部弹层**（复用 `BasePopup :position="bottom"`，与本次弹层改造同口径；样式走 token：色/圆角/间距/字体族）。
- **内容**：① 标题＝具体原因；② 正文＝重拍引导；③ **示例图**（复用上传引导示例图；若为「✓正例/✗反例」对比图则并排展示）；④ 安抚文案「**本次未消耗试衣次数**」；⑤ 主按钮「重新选择照片」（→ 既有选图链路，**保留已选照片可即时重传**）、次按钮「知道了」（关闭，停留在上传页）。
- **无感**：合格照片**不额外提示**，直接进入生成流程。
- **时序**：拦截响应约 0.3~1s ⇒ 沿用现有「照片检测中…」loading，避免黑盒等待。
- **老版本兼容**：未升级版本会按业务错误展示 `message`（后端保证可读）⇒ 无需强制升级提示。

### 4.5 埋点（待主人拍板是否本期做）

- 新增最小端口 `src/platform/uni/analytics.ts`：`reportEvent(name: string, params: Record<string, string | number>)`，**fail-soft**（无 SDK/上报地址时仅 `console.debug`，绝不抛错、不阻塞主流程）。
- 事件：`ai_tryon_quality_reject { check_code }`（用于拦截率/成本节省）。
- 若主人认为本期不宜引入埋点通道 ⇒ 先在偏差台账登记为待办，UI 与契约实现不受影响。

### 4.6 不做（明确范围外）

1. **AI 推荐入口本期不接**（后端 `recommend` 无此拦截；契约同款，后续迭代）；
2. 上传接口 `/api/aiface/upload` 不动；3. 不新增扣费/退款/退次逻辑（拦截本不扣次）；
4. 不改端侧预检阈值与判定；5. 不做后端开关的端侧镜像；6. 不改后端。

## 5. 测试与验收

### 5.1 单测清单（TDD，先红后绿）

| # | 用例 | 断言要点 |
|---|---|---|
| 1 | `mapBusinessCode(4002)` | `kind === "QUALITY_REJECTED"`、`businessCode === 4002`；`4001` 行为不变 |
| 2 | 信封解码（`client`） | `4002` 响应 ⇒ `AppError.businessData.check_code` 可达；成功路径与 401/500 行为不变 |
| 3 | `submitTryOnTask` 归一 | `QUALITY_REJECTED` ⇒ `{kind:"quality-rejected", checkCode}`；未知码 ⇒ `"unknown"`；**不触发充值**、**不重发 POST** |
| 4 | `photo-gate` 映射 | 4 码穷尽 + `unknown` 兜底；`resolvePhotoGateCode(null/123/"x")` ⇒ `"unknown"` |
| 5 | 页面级（mount `aiTryOn` + mock 4002） | 弹层出现、标题/正文＝该码映射、**POST 恰好 1 次**、**未走 `need-recharge`**、关闭后可选新照片并成功重传 |

### 5.2 变异验证（每条须变红）

删 `unknown` 兜底／把 `check_code` 从 `businessData` 去掉／`4002` 映射改回 `BUSINESS`／submit 归一化改成 `toast`／页面 `case` 删除 ⇒ 分别应触发对应用例红。

### 5.3 端到端联调（staging）

环境 `https://crazyma99.xyz`；确认开关 `aiface.tryon_filter.enabled` 已开；样例造数：`no_face`＝风景图／`multi_face`＝双人合照／`face_too_small`＝远景人像／`side_face`＝大侧脸／合格＝正面单人照。
逐条核：① 1–2s 内被拦且提示含原因+示例图+引导；② 拦截后可**立即重传**、流程不卡死；③ 拦截**不扣次数**（前后各查一次次数记录）；④ 合格照片**无感**进入生成；⑤ 未知码兜底（抓包改响应模拟）；⑥ 埋点带 `check_code`。

### 5.3.1 联调造数清单（素材已定位：`~/文档/face-quality-api/cases/`）

> 该目录是「人脸质量检测服务」（**百度人脸 V3 接口兼容**，drop-in 换 baseurl）的 10 例测试集，每例含测试图 + `result.json`（完整接口返回），汇总见 `cases/TEST-RESULT.md`。**仅用于本地联调/验收造数，不做进小程序包**（含真人/AI 合成人像，需隐私与版权确认）。

| 目标 `check_code` | 用图 | 备注（来自 `TEST-RESULT.md`） |
|---|---|---|
| `no_face` | `cases/06_non_face/test_6_non-face.png` | 低置信度误检框不计入有效人脸 ⇒ 命中「未检测到人脸」 |
| `multi_face` | `cases/02_multi_face/test_2_multi_face.png` | 3 张有效人脸（**15 MB 大图**，联调上传注意体积/压缩）|
| `face_too_small` | `cases/03_small_face/test_3_small_face.png` | 脸框最小边占比 **8.4%**（阈值 <10%）|
| `side_face` | ⚠️ **无严格侧脸用例**；近似用 `cases/04_half_face/test_4_half_face.png`（半边脸被裁切 ⇒ 命中「人脸不完整+歪脸」，首条文案即「请正对镜头再拍一张」）| 严格侧脸（侧转 >30°）需另行造数 |
| 合格（无感进入生成） | `cases/01_normal/test_1_normal.png` | 11 项检查全通过 |
| （本轮契约外，备用） | `07_low_resolution`（模糊）／`08_anime_face`（非真人）／`09_close_eyes`（闭眼）／`10_facemask_real`（遮挡）| 后端本期只下发 4 种码；这些对应端侧预检或后续迭代 |

> 另有坑：`cases/05_facemask/` 的图**内容与文件名不符**（实为树影斑驳人像、无口罩），`TEST-RESULT.md` 已如实记录 ⇒ 不要用它做「遮挡」用例。

### 5.3.2 弹层美术素材需求（2026-09-23 主人定稿；**待产出**）

> 主人决定：**形式＝正反例对比**（✓ 正例 / ✗ 反例）｜**风格＝AI 真实感**｜**图标＝复用现有 IconPark（不新增图标）**｜**格式＝JPG 或 PNG**。

| # | 素材 | 数量 | 说明与规格 |
|---|---|---|---|
| 1 | ✗ 反例图 | **4 张** | 对应 `no_face`／`multi_face`／`face_too_small`／`side_face`；**AI 真实感人像**（合成，无真人肖像授权问题）；1:1，**750×750 px**（@2x，显示约 240rpx 见方）；**JPG（q≈80，≤40KB/张）优先**，PNG 仅当需透明背景时用（≤80KB） |
| 2 | ✓ 正例图 | **1 张** | 标准正面免冠、光线充足单人照示意；与反例**同风格同构图**（便于并排对比）；规格同上 |
| 3 | 对比版式 | 0 | **不出图**：✓/✗ 角标、描边、圆角、底色全部由代码 + token 实现（避免图内嵌装饰，便于主题化） |
| 4 | 图标 | 0 | **复用** `src/static/iconpark/`：`face-scan`（无人脸/检测）、`eyes`（侧脸）、`check-white`（正例角标）、`camera` 若需另画则改用现有 `picture`／`plan` 语义替代（主人已定「复用现有」） |

- 命名与路径：`src/static/quality-gate/{reject_no_face,reject_multi_face,reject_face_too_small,reject_side_face,accept_normal}.jpg`（PNG 则同后缀改 `.png`）。
- 通用规范：**图内不嵌中文字/不画圆角/不留白底**（文案与圆角走代码与 token）；暗底（`#160F04`）观感优先；四张反例建议**同一位虚拟模特/同一构图**，仅变换「场景缺陷」；总增包体目标 **≤150KB**。
- 交付方式（二选一）：⒜ 主人/设计直接给图；⒝ **我按图库口径先产出 5 张图的生图提示词**（按公司硬约定先加载 `gpt-image-prompt-library` skill，**只出提示词、不生图**）交您定稿后再产出。
- 关联待办：知识库 04 分册**待办项 6**（JPG/PNG 美术素材需求）＋ 03 分册 §十 10.20。

### 5.4 PRD 验收 → 实现映射

| PRD 验收项 | 落点 |
|---|---|
| 被拦 1–2s 内有具体原因+示例图+重拍引导 | `QualityRejectSheet` + `photo-gate` 映射 |
| 拦截后可立即重传 | 页面 `case "quality-rejected"` 保留选图状态 + 既有选图链路 |
| 拦截不扣免费次数 | 后端保证（拦截在扣次前）；前端**不写**退次逻辑 + 联调核验次数记录 |
| 合格照片无感 | 成功路径零改动（不新增提示） |
| 未知 check_code 兜底 | `resolvePhotoGateCopy` 的 `unknown` 分支（有单测 + 变异） |
| 埋点携带 `check_code` | `platform/uni/analytics.ts`（**待拍板**） |

## 6. 风险与**待主人拍板**项

| # | 事项 | 我的建议 |
|---|---|---|
| 1 | ~~弹层示例图素材~~ → **已定稿（2026-09-23 主人）**：正反例对比／AI 真实感／复用现有 IconPark／JPG 或 PNG | **待产出**（需求见 §5.3.2；KB 04 待办项 6）：由主人/设计给图，或我先出**生图提示词**（先加载 `gpt-image-prompt-library` skill，只出提示词不生图）供定稿 |
| 2 | **埋点是否本期做** | 建议本期只做「端口 + fail-soft 调用」，不接第三方 SDK |
| 3 | **弹层形态** | 建议底部弹层（与本次改造同口径）；若您偏好居中弹窗/全屏引导页，我改 |
| 4 | **未知码文案优先级** | 建议以本地映射为准，`unknown` 时若后端 `message` 非空则优先展示 `message`（更具体） |
| 5 | **上线时序** | 后端该功能仅在 `staging`／`dev-dtw-…`，**尚未进 `main`**；建议前端实现先合入迁移分支、体验版跟随后端 staging 联调，正式版按后端上 main 后再放量 |
| 6 | **老版本兼容** | 维持「展示 message 兜底」，不加强制升级提示 |

## 7. 实施步骤（评审通过后执行；含 CR/构建/体验版）

1. `payment-state` ＋ `errors` ＋ `client`（+单测 1/2）→ 2. `ai-tryon-submit` 归一化（+单测 3）→ 3. `photo-gate` 映射模块（+单测 4）→ 4. `QualityRejectSheet` + 页面接线（+页面级单测 5）→ 5. **变异验证** → 6. **独立 CR**（子代理只读）并逐条处置 → 7. 微信＋抖音构建与产物核验 → 8. 体验版 `v1.0.5x` ＋ 发版台账 ＋ 真机验收清单 → 9. KB 落库（若主人同意）。
量级：核心 4 步约 1 个工作日（不含素材等待与联调往返）。
