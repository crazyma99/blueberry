# 能力矩阵（P4-10）草表 — 2026-09-17

> 性质：**草表（draft）**。取值＝`supported` / `unsupported` / `unknown`；「依据」列写代码落点或平台版本；**凡未真机验证的一律记 `unknown` 或注明「真机待定」**。
> 用途：Phase 4（`P4-10`）逐项定稿的起点；**本表不代表 Phase 4 开工**（门禁＝G3 通过）。
> 范围对齐主人 2026-09-17 拍板：**抖音端＝客片展示版**（11 页/3 tab、**AI 六页不注册**、零支付改造）。

## 1. 逐能力 × 逐端

| 能力 | 微信（MP-WEIXIN） | 依据（代码落点） | 抖音（MP-TOUTIAO） | 依据 |
|---|---|---|---|---|
| **媒体**（选图/拍照） | **supported** | `platform/uni/chooser.ts`（`uni.chooseImage`，`count:1`／`compressed`／album+camera；取消/无 API→null 不抛；t34 三态） | **unknown** | 抖音不注册 AI 页 ⇒ 当前**无选图入口**；能力本身待 `tma` 真机确认 |
| **媒体**（上传） | **supported** | `platform/uni/upload.ts`＋`application/ai-photo-upload.ts`（字段名 `photo`、品牌头透传、401→`authExpired`；t34） | **unknown** | 同上（抖音无上传场景） |
| **媒体**（下载/保存到相册） | **supported** | `platform/uni/album-save.ts`（`authorize('scope.writePhotosAlbum')`→`showModal/去设置`→`openSetting` 复检→`downloadFile`→`saveImageToPhotosAlbum`；t48 五例） | **unknown** | 抖音无「保存原图」场景（AI 页不注册）；若后续要支持需单独验证 |
| **导航**（`navigateTo`/`switchTab`/返回兜底） | **supported** | 各页 `uni.navigateTo`＋`webview` 返回幂等（t29）；分享落地兜底回首页 tab | **supported**（产物级） | `dist/build/mp-toutiao/app.json` 三 tab＝index／priceHomePage／mine；页面导航同 `uni` API |
| **导航**（native tabBar） | **supported** | 微信 `custom-tab-bar` 四文件＋`app.json tabBar.custom:true`（产物实证）；每页 onShow `syncTabBarSelected`（`t20`） | **supported** | 抖音走**原生 tabBar list**（产物实证，非微信四文件复制） |
| **客服** | **supported（站内）** | 客服/合作联系为**站内组件** `ServiceContact`（二维码/电话，P2-21）＋`webview` 白名单页；**不依赖平台客服会话 API** | **supported（站内）** | 同微信（`ServiceContact` 已迁、协议页已迁） |
| **分享**（好友/会话） | **supported** | `aiTryOnResult` 的 `onShareAppMessage`；`ai-share-routing.buildSharePath`（`share_from=tryon_result`＋templateId/shopId/albumId/brandId）；`t40` 九例 | **unknown** | 抖音 `onShareAppMessage` 形态不同（`tt.onShareAppMessage`），**未适配**；客片展示版是否需分享待产品定 |
| **分享**（朋友圈单页模式） | **supported** | `onShareTimeline`＋`buildShareQuery`（**必须带 taskId＋shareToken**，旧 bug #8）；`scene===1154` **不跳页**改引导（T8 CR 复验） | **unsupported（无对应物）** | 抖音无「朋友圈单页模式」概念 |
| **订阅消息** | **supported（fail-soft）** | `platform/weixin/capabilities.ts → requestTaskNotify`（`requestSubscribeMessage`；拒绝/不支持**不阻断**提交；`t31`） | **unknown** | ⚠️（CR 🔴1 更正）：抖音**有官方 API** `tt.requestSubscribeMessage`（[官方文档](https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/api/open-interface/subscribe-message/tt-request-subscribe-message)）⇒ 属「**有 API、本轮未适配/未验证**」，不得写 `unsupported` |
| **防截屏** | **supported（capability 守卫）** | `createCaptureGuard`（`canIUse('setVisualEffectOnCapture')`＋**幂等** enable/disable；三钩子 onShow/onHide/**onUnload**；`t31`＋T8 CR 复验） | **unknown**＋**无调用点** | ⚠️（CR 🔴1 更正）：原来写「unsupported（无 API）」**缺官方依据** ⇒ 按本表自定方法降为 `unknown`；事实层面：AI 六页不注册 ⇒ 抖音**无调用点**（需求侧不涉及） |
| **字体** | **supported（注意偏差）** | 旧全局类 `font-noto-serif`／`harmony` 新端未定义 ⇒ **已登记 `deviations.md` 第 11 条**（CR 🔴2 补登：此前表内引用了不存在的登记）；字号按旧值**字面量**还原（旧 `--font-size-body=24rpx` ≠ `tokens.semantic.fontSizeBody=32rpx`） | **同微信口径** | 同上（不涉及平台 API） |
| **震动/触感** | **supported（能力降级）** | `application/haptics.ts` 守卫版（无 API 静默降级；P2-18 引入） | **unknown** | 抖音 `uni.vibrateShort` 支持情况待真机确认 |
| **扫码/客服会话（平台原生）** | **unknown（未使用）** | 现无调用点 | **unknown** | — |
| **支付（平台）** | **supported** | `platform/weixin/payments.ts`（JSAPI；非微信/无 API→`unsupported`，**fail-closed 不假装成功**；`t31`） | **unsupported（有意）** | 主人拍板「抖音**零支付改造**」；`payment-coordinator` 四张 AI 页均不注册于抖音 |

## 2. 需真机/工具定稿的条目（`P4-14` 时逐项勾）

| # | 待验项 | 平台 | 验证方式 |
|---|---|---|---|
| 1 | 选图/上传/下载保存 在抖音是否可用（即使当前无场景） | 抖音 | `tma preview` 真机（如需支持） |
| 2 | 抖音分享形态与参数（若产品要求客片分享） | 抖音 | 真机 + 官方文档版本登记 |
| 3 | 抖音触感/字体渲染一致性 | 抖音 | 真机截图比对 |
| 4 | 微信各能力在**低版本基础库**下的降级表现（`canIUse` 守卫已实现，需实测） | 微信 | 真机（指定基础库版本） |
| 5 | 小红书（MP-XHS）整列 | 小红书 | **本轮不做**（主人未纳入本轮；`P4-17` 需登记批准与范围） |

## 3. 说明

- 本表取值**只据代码落点与既有产物证据**：带用例号的视为已验证；`unknown` 一律是**未验证**，不得据本表宣称支持。
- 与 `deviations.md` 的关系：字体/主题类差异已在 **`deviations.md` 第 11 条**登记（CR 🔴2 补登；原「第 1–10 条」引用不实，已更正），本表不重复。
- ⚠️ 本表**暂无小红书列**（P4-10 要求「逐端」）：小红书整列本轮不做（主人未纳入），按 `P4-17` 需登记批准与范围后再补。
- 定稿时机：`P4-14` 真机矩阵跑完后，把 `unknown` 收敛为 `supported`/`unsupported` 并补「依据版本」。
