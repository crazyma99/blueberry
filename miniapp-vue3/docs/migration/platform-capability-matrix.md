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
| **下拉刷新**（`enablePullDownRefresh`＋`onPullDownRefresh`） | **supported（产物级）** | `pages.json` 首页 `enablePullDownRefresh:true`＋`backgroundTextStyle:"light"`（`deviation #27`）；`pages/index/index.vue` 的 `refreshHome()`（重载轮播/店铺/开关＋`fgTick` 重播＋`finally` 收指示器）；`t49` 9 例 | **unknown** | 配置与生命周期同口径可出包（双端 page json 实证），但**指示器** `BaseLoading`→`wd-loading` 自身样式为 `var()` 链 ⇒ 按 `deviations #15` 抖音 TTSS 可能丢 `animation/mask/字号` ⇒ 待 `tma` 真机（矩阵 §2 第 6 条） |
| **分享**（卡片三层解析 `share_card`） | **supported（产物级）** | `application/share-card.ts`（旧端 `share.uts` 忠实移植：品牌槽位 > 全局同键 > 代码默认＋`{brand}`＋60s 品牌名缓存）；首页/客片列表/客片详情三页接线，`t51` 7 例 | **unknown** | 抖音 `onShareAppMessage` 由 uni 透传（tt 形态不同，见上一行）；分享**卡片文案/封面**无平台分支 → 待 `tma` 真机确认落卡表现 |
| **分享**（VK 人脸居中 5:4 封面） | **supported（真机待验）** | `platform/weixin/face-share-card.ts`（旧端 `faceShareCard.uts` 1:1：降采样 1024／5:4 750×600／噪声阈值 2%／VK 超时 10s）；回退 `cosThumbJpg(400)`；`t52` 9 例 | **unsupported（无对应物）** | 抖音无 VisionKit／离屏 canvas 同能力 ⇒ 返回 null、调用方回退网络 JPG（fail-open） |
| **分享**（首页/客片列表/客片详情 `onShareAppMessage`） | **supported（产物级）** | 三页 handler 与旧端逐字（`?brandId=`／`idx` 两分支／`?idx=&type=`）；产物 `pages/*/index.js` 实测含 handler | **unknown** | handler 由 uni 透传；抖音卡片形态与 path 规则待真机确认（客片展示版是否需要分享由产品定） |
| **支付（平台）** | **supported** | `platform/weixin/payments.ts`（JSAPI；非微信/无 API→`unsupported`，**fail-closed 不假装成功**；`t31`） | **unsupported（有意）** | 主人拍板「抖音**零支付改造**」；`payment-coordinator` 四张 AI 页均不注册于抖音 |

## 2. 需真机/工具定稿的条目（`P4-14` 时逐项勾）

| # | 待验项 | 平台 | 验证方式 |
|---|---|---|---|
| 1 | 选图/上传/下载保存 在抖音是否可用（即使当前无场景） | 抖音 | `tma preview` 真机（如需支持） |
| 2 | 抖音分享形态与参数（若产品要求客片分享） | 抖音 | 真机 + 官方文档版本登记 |
| 3 | 抖音触感/字体渲染一致性 | 抖音 | 真机截图比对 |
| 4 | 微信各能力在**低版本基础库**下的降级表现（`canIUse` 守卫已实现，需实测） | 微信 | 真机（指定基础库版本） |
| 5 | 小红书（MP-XHS）整列 | 小红书 | **本轮不做**（主人未纳入本轮；`P4-17` 需登记批准与范围） |
| 6 | 首页下拉刷新**指示器**（`BaseLoading`→`wd-loading`）在抖音是否正常（旋转/环成形/文案字号） | 抖音 | `tma preview` 真机目视（`deviations #27` 已登记降级风险；颜色有内联 style 保障） |
| 7 | 5 页下拉刷新指示器与**原生三点**是否重叠（含自绘标题栏 4 页） | 微信 | 真机目视（口径见 `deviations #27/#28`；位置常数在 `composables/use-pull-refresh.ts`） |
| 8 | VK 人脸居中 5:4 分享封面真机效果（开发者工具模拟器不支持 VisionKit） | 微信 | 真机：点右上角「···」→ 转发，看卡片封面是否以人脸为中心（`deviations #28` ④） |
| 9 | 分享卡片文案/封面是否按 OPS `share_card` 槽位呈现（含 `{brand}` 替换） | 微信 | 真机切换品牌后分享，比对 OPS 配置（`t51` 已锁解析口径） |

## 3. 说明

- 本表取值**只据代码落点与既有产物证据**：带用例号的视为已验证；`unknown` 一律是**未验证**，不得据本表宣称支持。
- 与 `deviations.md` 的关系：字体/主题类差异已在 **`deviations.md` 第 11 条**登记（CR 🔴2 补登；原「第 1–10 条」引用不实，已更正），本表不重复。
- ⚠️ 本表**暂无小红书列**（P4-10 要求「逐端」）：小红书整列本轮不做（主人未纳入），按 `P4-17` 需登记批准与范围后再补。
- 定稿时机：`P4-14` 真机矩阵跑完后，把 `unknown` 收敛为 `supported`/`unsupported` 并补「依据版本」。

## 4. 抖音端产物级体检结论（2026-09-22 实测，**工具侧**；真机项仍以 §2 为准）

> 本轮为抖音首次「体检 → 出码 → 体验版上传」（记录见 `trial-release-record.md` §8）。**以下均为产物级证据，不等于平台支持性结论**；
> 未真机验证的项一律仍记 `unknown`。

| 能力/项 | 结论（产物级） | 依据 |
|---|---|---|
| 产物合规（app.json/app.js/tt 指纹） | **supported（产物级）** | P4-13 `ok=true` 11 项（含 `app.ttss`／`platform:mp-toutiao(tt-files)`）；`.wxss/.wxml/.wxs` 0 个 |
| 包体积 | **supported（产物级）** | 主包 1,174,673 B（平台口径 1.33MB）≤ 2MB；`subPackages:0` |
| 路由与 AI 页排除 | **supported（产物级）** | 12 页；`forbiddenRoutes` 4 前缀零命中 |
| 导航（系统栏） | **supported（产物级）** | 12 页均无 `navigationStyle`（自绘栏仅微信，`deviations #17`） |
| WeChat API 泄漏 | **supported（产物级）** | 全量 `.js` grep `wx.`＝0 |
| 本项目样式合规（零 CSS 变量／零通配） | **supported（产物级）** | 项目文件 0；**wot 自带组件 12 份含 `var(--`、3 份含 `*`** ⇒ 抖音端样式局部降级风险（`deviations #15/#27`）＝**真机目视项** |
| 字体／触感／手机号 | **unknown（依赖真机）** | 产物各 1 处调用；`tt.loadFontFace`／`tt.vibrateShort`／手机号能力的真机表现待验 |
| 预览出码 | **supported（工具侧）** | `tma preview` exit 0＋二维码＋短链 |
| 体验版上传 | **supported（工具侧）** | `tma upload` 成功（版本 `0.0.1`，主包 1.33MB） |
