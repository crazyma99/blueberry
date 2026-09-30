# 流量成本优化 · COS 直连点扫描与移交清单（M1 交付物）

> 2026-09-28 全仓扫描（对应 PRD《消灭 COS 外网直连》M1 里程碑）。
> 背景数据：2026-09 账单 COS 外网直连 37.8GB × ¥0.50/GB ≈ ¥18.9，占当月 COS 费用 97%；
> 单价是 CDN（¥0.21/GB）的 2.4 倍。本文件给出：已修复项（本仓库前端）、待服务端/商务侧项。

## 一、已修复（miniapp-vue3 前端，本批落地）

| # | 位置 | 问题 | 处置 |
|---|---|---|---|
| 1 | `src/App.vue`（loadFontFace ×2 ＋ 抖音 @font-face ×2）、`src/custom-tab-bar/index.js` | 字体直写 COS 源站域，每次启动/进 tab 页都打源站 | 改写为 `https://www.lanmei66.cloud/font/...`（curl 实证同 ETag，CDN 域可访问同内容） |
| 2 | `src/application/image.ts` | `isCosHost` 只认 `lanmei66.cloud`；服务端若下发 `*.myqcloud.com` URL，前端原样透传、原图直出 | 新增 `normalizeImageUrl`：`*.cos.*.myqcloud.com` → CDN 域；`cosThumb`/`cosThumbJpg`/`progressivePhotoSrc` 全链接入 |
| 3 | `src/pages/aiTryOnResult/index.vue` | ①分享卡片 VK 裁剪每次拉全尺寸原图；②缩略失败回退原图 | ①改喂 1080 JPG 缩略；②回退链改「WebP 缩略→JPG 缩略→判失败」，显示路径零原图请求（R5/R20） |
| 4 | `application/image.ts` `progressivePhotoSrc` | 客片详情首图原图直出 | 首图改 1080 WebP 预览（R2/R14） |
| 5 | `priceList`（价目大图/套餐图）、首页轮播前景图、`brandHub` logo、`aiRecommendResult` 预览图 | 裸绑原图/缺懒加载 | 接 `cosThumb` + `lazy-load`（R2/R3） |
| 6 | `aiTryOn` 分享封面、`application/share-card.ts` OPS 卡片图 | 原图/源站直出 | 统一 `cosThumbJpg(500)`（含源站改写） |
| 7 | `aiTryOn`/`aiRecommend` 上传链路 | 3–10MB 原图直传，唯一"压缩"是 `chooseImage sizeType:compressed`（不可控） | 新增 `domain/photo-compress.ts`＋`platform/weixin/photo-compress.ts`：长边≤1080、≤500KB、VK 人脸框外扩 2.5× 裁剪（R16/R17/R19）；fail-open 回退原图 |
| 8 | 上传端口 | 无进度回调 | `UploadRequest.onProgress` 透传 `onProgressUpdate`，页面展示百分比（R18） |
| 9 | `aiTryOn`/`aiRecommend` | 无人脸信息单独同意 | 新增 `application/face-consent.ts`：首次选图前弹授权（PRD 原文文案，**待法务终审**），按 profile 持久化 + analytics 留痕（R27 前端） |

## 二、前端无法独自修复（移交服务端仓库）

| 项 | 说明 | 对应 PRD |
|---|---|---|
| 保存原图签名 URL | `GET /api/aiface/tasks/{id}/download` 返回 5 分钟 COS 源站签名 URL，**签名绑 host，前端改写会失效** ⇒ 需服务端签 CDN 域 URL 或走回源代理 | R11/R20 |
| 接口全量扫描 | 所有出口（API/OPS/分享/二维码）禁止返回 COS 源站直链 | R11 |
| 上传即多规格 | 缩略/预览/原图三规格，列表只回缩略图 | R12 |
| CDN 缓存策略 | 长缓存 + 内容版本号文件名，命中率 ≥90% | R13 |
| 人脸图服务端兜底 | 接收校验 + 二次压缩（防前端被绕过）；7 天自动清理；AI 链路只用压缩版 | R22/R23/R25 |
| 流量打点 | 按域名+资源类型+商户统计，支撑看板与告警 | R15/R26 |
| 同意落库 | 人脸信息同意事件+时间戳服务端备查 | R27 后半句 |

## 三、B 端后台（独立仓库/系统）

R6 图片规格配置、R7 流量成本看板（按天/商户，含外网直连占比）、R8 外网直连告警（>0 或占比>1%，5 分钟内飞书/企微）、R9 CDN 单价配置、R10 商户级配额告警、R21 人脸图压缩参数配置。

## 四、商务/运维（与研发并行）

CDN 流量包/商务价谈判：现价 ¥0.21/GB → 目标 ≤¥0.15（争取 ¥0.11–0.13）。不阻塞研发，但直接决定 PRD 指标 3。

## 五、验收口径（前端侧自查）

- 抓包：小程序内图片/字体请求 100% 为 `*.lanmei66.cloud`，无 `*.myqcloud.com`（保存原图的签名 URL 除外，待服务端治理后归零）；
- 上传体积：P50 ≤300KB、P95 ≤500KB（R16，需服务端 R26 打点复核）；
- 人脸检测通过率不低于改造前（对比后端 4002 拦截率，依赖 R26）；
- 结果页/详情页：点击「保存到相册」前抓包不出现原图请求（R20）；
- 断 CDN 演练：缩略失败只切 JPG 缩略再判失败，外网直连流量为 0（R5）。
