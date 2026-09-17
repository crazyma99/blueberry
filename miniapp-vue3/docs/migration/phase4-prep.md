# Phase 4（跨平台服务端合同与真机适配）准备盘点 — 2026-09-17

> 性质：**只读盘点**，不代表 Phase 4 已开工（Phase 4 入口＝**G3 通过**＋每端 AppID/权限/类目/支付资格有状态记录）。
> 目的：把 Phase 4 的**范围、现状证据、缺口、需外部动作项**一次摊平，避免开工后才发现前置没备齐。

## 1. 范围（2026-09-17 主人拍板，phases §Phase 4 原文）

**抖音端＝客片展示版**：
- **11 页 / 3 tab**；**AI 六页不注册**；「我的」页**只留「我的喜欢」**；**零支付改造**
- 产物校验须断言「**AI 六页未在 `pages.json` 注册**」
- AI 试衣/推荐的跨端适配**不在本轮抖音范围**（微信端照常验收）

## 2. 现状实证（本轮实测，可复算）

| 项 | 实测结果 | 判定 |
|---|---|---|
| 抖音产物页数 | `dist/build/mp-toutiao/app.json` = **12 页** | ✅ 与「11 业务页＋1 probe」一致（AI 六页未注册） |
| AI 页注册 | 产物内 `pages` 无任何 `aiRecommend*`／`aiTryOn*` | ✅ 满足拍板口径 |
| tabBar | `app.json.tabBar.list` = `index`／`priceHomePage`／`mine`（3 tab） | ✅ |
| 抖音专用产物 | 含 `app.json`＋`app.js`＋**`app.ttss`**（tt 前缀样式）＋`project.config.json` | ✅ 基本齐 |
| ⚠️ **AppID 注入** | **绕过管线**直接 `npx uni build -p mp-toutiao` 时产物 `project.config.json.appid` = `testAppId`（占位）；**但 `build-target` 管线已强制**——`validateProfile` 对抖音缺 `MP_TOUTIAO_APPID` 直接拒绝（既有用例「抖音构建缺 MP_TOUTIAO_APPID 拒绝（P1-14 不回落微信）」），且 `manifest.appid` 取自 profile | 🟡 **管线安全、直跑不安全**：真机出码必须走 `build-target`（勿直接 `uni build`） |
| 账号证据记录 | `docs/migration/baseline.json → accounts`（微信/抖音 AppID 与 status） | ✅ 记录在案 |
| 抖音支付/登录能力 | 本仓**未声明**任何抖音支付/身份能力；`platform/weixin/payments.ts` 对非微信一律 `unsupported`（fail-closed） | ✅ 未越界（符合「零支付改造」） |

## 3. 与 P4-01～P4-17 的缺口对照（按依赖排序）

| 条目 | 现状 | 缺什么（责任方） |
|---|---|---|
| P4-01 产品批准跨平台账号/手机号/余额/买断共享与绑定解绑 | 已有母方案「保现有合同」倾向，但**无主人书面确认**（＝`P0-12` 同一件事） | **主人一句话确认** |
| P4-02/03/04 后端 auth／pay 合同（平台+appid+subject→internalUserId、订单归属/验签/幂等/补偿；新端与后端共审失败码） | 微信侧既有合同已在（`contracts.md`／`credits` 四端点）；**跨平台部分无合同文件** | **后端**出合同＋共审 |
| P4-05 provider 替身测试→真实 provider；旧/新 consumer 合同同跑 | 未开始 | 后端＋测试 |
| P4-06 各平台管理台合法域名（request/upload/download）、H5 CORS、COS 权限 | 未登记 | **主人/运营**在平台后台配置并回报 |
| P4-07/08/09 平台实现与 native UI bridge（`MP-WEIXIN/MP-TOUTIAO/MP-XHS`）、tabBar 各端官方方式 | 微信已实现；`src/platform/` 现只有 `uni/` 与 `weixin/`（＋`ui-bridge/AuthNativeButton`）；**抖音/小红书无实现** | 我（待 G3 通过后开工） |
| P4-10 能力矩阵（媒体/导航/客服/保存/分享/订阅/防截屏/字体/震动 逐端 supported/unsupported/unknown） | **草表已编制**（本轮）：`platform-capability-matrix.md`——逐能力×逐端取值＋代码落点＋「凡未真机验证记 unknown」；列出 5 项待真机定稿 | ✅ 草表完成；**定稿待 `P4-14` 真机** |
| P4-11 context/env 识别、未知环境失败关闭；平台/AppID/provider 不跨端混用 | 部分（`detectUiPlatform`／`isPlatform` 闭集＋`ctxFactory`）；**但 appid 注入未落地（见 §2）** | 我＋主人提供 appid |
| P4-12 平台/桥/generated 例外清单与扫描规则 | **本轮完成**：`scripts/scan-platform-usage.mjs`（敏感集＝`wx.*`/`tt.*`/`uni.request·uploadFile·downloadFile·login·authorize·openSetting·getImageInfo·chooseImage·saveImageToPhotosAlbum·getEnterOptionsSync·requestSubscribeMessage·requestPayment`；允许目录 `src/{platform,ui,generated}/**`；**UI 类 API 与注释提及不算违规**；例外须**显式登记＋理由**）＋`tests/pipeline/scan-platform-usage.spec.ts` 五例（含**真实仓库 0 违规**与「防登记幽灵例外」）；**扫描只对源码、不对第三方 bundle 盲 grep** | ✅ 完成 |
| P4-13 三端构建并 verify 产物（抖音须自带 tt 前缀文件与 `app.json`+`app.js`） | 抖音产物已含 `app.ttss`/`app.json`/`app.js`；**verify 未覆盖 appid 与能力断言** | 我（扩 `verify-target.mjs` 断言） |
| P4-14 微信/抖音各 iOS/Android 跑 登录→上传→任务→结果→支付/权益→分享→重进（抖音用 `tma preview` 出码） | 未做 | **真机**（主人/测试同学） |
| P4-15 沙箱验证重复 callback/错误签名/错误 appid/paid 先于权益/超时重进 | 未做 | 后端＋测试 |
| P4-16 平台与后端独立 CR | 未做 | 我（派 CR） |
| P4-17 按平台标 G4；未通过端保持 blocked，不悄悄从 required 集合删除 | 未开始 | 我 |

## 4. 开工前需要主人/外部拍板或准备的三件事

1. **`P0-12`／`P4-01` 书面口径**：默认品牌/商户开关＋跨平台账号·手机号·余额·买断**能否共用**与绑定/解绑规则（不确定则按母方案**保持 provider 隔离**）。
2. **各平台 AppID/权限/类目/支付资格证据**（`baseline.json` 有记录，但需确认可用于构建注入）：尤其**抖音 AppID**——现在产物是 `testAppId` 占位，无法真机预览。
3. **各平台后台合法域名配置**（P4-06）：request/upload/download 域名与 H5 CORS／COS 权限。

## 5. G3 与 Phase 4 的关系（门禁不变）

- Phase 4 入口＝**G3 通过**；G3 现仅差**微信真机证据**（见 `device-acceptance-checklist.md`）。
- 本盘点**不改任何代码、不勾任何 P4 条目**；待 G3 收口后按 P4-07→P4-13 顺序开工。
