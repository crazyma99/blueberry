# 蓝莓小程序（blueberry）CHANGELOG

> 记录小程序 C 端每次实质性改动，最新在上。多人合作提交前先补本文件（与代码同一提交）。

## 2026-10-13 · 修复：抖音手机号授权 `invalid session`（登录码必须「点按钮之前」预取并缓存）

- **现象／根因（官方硬要求）**：真机点「手机号一键登录」⇒ `getPhoneNumber:fail invalid session`（主人 2026-10-13 20:28 真机日志）。抖音《获取手机号》原文：「**使用（用户点击 button）前需先调用 `tt.login` 接口**。**如果在回调中调用 `tt.login` 会刷新登录态**，导致登录后换取的 session_key 与手机号码加密时使用的 session_key 不同，从而导致解密失败。」原实现恰是**在回调之后**（`runPhoneLogin` 内）才 `uni.login` ⇒ 点按钮时无有效登录态。
- **改法（先取码、后授权）**：`application/login-flow.ts` 新增 `prefetchLoginCode()`——进登录弹窗/关键动作时**先取码**，缓存 **TTL 4 分钟**（平台 code 5 分钟有效），有效期内**幂等复用**＋在飞去重（合抖音「冷启动生命周期内最多调一次」）；`runPhoneLogin(phoneCode)` **只消费缓存码**，与 phoneCode **一次**提交；**回调路径内绝不调用 `uni.login`**；缓存缺失/过期 ⇒ 「登录环境已刷新，请再点一次」＋**零请求**；提交后作废缓存（两个 code 一次性、不可复用）。
- **页面接线**：5 个登录入口页（`mine`／`demoDetail`／`targetPhotoDetail`／`aiTryOn`／`aiRecommend`）统一改为 `openLoginPopup()`＝显示弹窗 ＋ `void prefetchLoginCode()`（**11 个弹窗打开点全部收口**，避免某条路径漏预取）。
- **微信端同序**：微信 `getPhoneNumber` 同样要求「两个 code 一次性提交」；微信无「回调内 login 刷新登录态」之坑，但统一为同一顺序可让两端一致、并省掉回调内的一次网络往返（未分叉、未新增平台分支）。
- **验证**：新增 `t74`（6 例：调用顺序／**回调内零平台调用**／缓存缺失·有效·过期三态／幂等）；`t72` 随新顺序更新；**变异自证**：把预取挪回回调内 ⇒ `t74` **4 failed**（正是本次事故的复现），还原即绿；全量 `vitest` **719 passed / 3 skipped**；`type-check`（src＋tests 两段）exit 0；三端构建 exit 0；产物 `.work/deliver/lanmei-miniapp-20261013-5d9534b-dylogin4/`（mp-weixin／mp-toutiao ＋ zip）。

## 2026-10-13 · 事故修复：品牌头 X-Brand-Id 必须是「商家编码」（真机全站空白根因）

- **事故**：真机预览整站空白（只剩兜底首页），IDE 正常。定位＝真机带了 **`X-Brand-Id: <数字>`**（历史脏值／商户数字 id），而后端 `resolveRequestMerchant` 对**已存在**的品牌头**不回落**、解析不到启用商家即 500「品牌不存在或已停用」⇒ 所有接口只剩 64 字节。
- **新口径（单一事实源 `src/domain/brand-code.ts`）**：`X-Brand-Id` 必须是**商家编码**（MerchantCode，如 `lanmei`／`chayu`／`123323`）；校验＝**形态 ＋ 命中已知列表**（离线种子〔对照 `GET /api/brands` 实测 9 条〕∪ 品牌馆运行时列表 ∪ 持久化 `lm.brands.v1`）。**非法值一律不写入、不发送**（按「无品牌上下文」处理）。
- **三道闸**：①`versioned.loadBrandId()` 读到非法/未知值 ⇒ 视为无品牌**并清理存量脏值**（含旧端键 `brand_id`）；②`versioned.saveBrandId()` 拒写非法值（保留既有合法值）；③`http client` 注入头前再校验一次（不合法则**不发该头**＋一次性日志）。
- **刻意不按「拒纯数字」实现（重要）**：线上 `GET /api/brands` 实测存在 `123323`／`123456789` 两个**合法**数字形态编码 ⇒ 单看形态会误杀；故以「命中已知列表」为准（`foo` 这类「形态合法但未知」的值同样会被后端 500，必须一并拦下）。
- **配套**：品牌馆拉到列表后 `rememberBrandCodes()` 并入缓存（新商家无需改代码即可通过校验）；`pages/index/index.vue` 的 `scene`/`options` 落地路径回读**生效值**再写品牌基线。
- **验证**：新增 `t73`（7 例，含**生产链路**「脏值 ⇒ 请求头不得出现 X-Brand-Id」）；变异自证 3 项（撤 `loadBrandId` 闸／命中校验恒真／撤 `saveBrandId` 闸 ⇒ 各 exit 1，还原即绿）；全量 `vitest` **713 passed / 3 skipped**；`type-check`（src＋tests 两段）exit 0；三端构建 exit 0；抖音产物敏感词 0、AppID `ttd6aba01648cc1bf701`。
- **影响面（有取舍的收紧）**：分享链／小程序码带来的**非已知**商家编码（既不在种子、也不在本机缓存）将按「无品牌上下文」处理 ⇒ 退回平台范围数据。

## 2026-10-13 · 抖音登录对接：单次登录（loginCode＋phoneCode）＋ 旧三步链路废弃（主人指示）

- **契约变更**（唯一事实源＝后端仓 `.project-wiki/docs/modules/login-frontend-integration.md`）：登录由旧「三步链路」（取 code → `/api/wx/login` 换票 → `/api/wx/phone` 绑手机号）改为**一次提交** `POST /api/{wx,tt}/login { loginCode, phoneCode, nickname?, avatarUrl? }` ⇒ `{token, userInfo}`；`code===200` 才算成功；两个 code 一次性、5 分钟有效、不可复用；限流每 IP 每分钟 5 次。
- **旧链路废弃依据（2026-10-13 服务端实测）**：`/api/wx/login` 已**强制 phoneCode**（只带 `code` ⇒ 500「phoneCode 不能为空…」）⇒ 旧链路对微信端同样失效；`POST /api/tt/phone` **404 不存在**，`/api/wx/phone` 属遗留。
- **端侧改造**：`application/login-flow.ts` 合并为「`phoneCode` ＋ 平台 `loginCode` ⇒ **一次** `login`」并**移除 bindPhone 步骤**；`infrastructure/repositories/wx-auth.ts` 端点表定案（`/api/wx/login`／`/api/tt/login`，删除「占位契约」注释）＋新增 `WxLoginParams`；`platform/uni/login.ts` 抖音端 `uni.login` 传 **`force:true`**（避免游客身份）；`components/LoginPopup` 按钮文案改「**手机号一键登录**」（原「一键登录」；标题/跳过位「登陆」错别字一并订正）＋订正「抖音端 open-type 不可用」过期注释（抖音基础库 ≥3.51.0 同样支持 `getPhoneNumber`，回调 `e.detail.code`）。
- **静默换票关闭（有意行为变化）**：`application/silent-login.ts` 在现行契约下**不可能换到会话**（phoneCode 只能来自用户交互）⇒ 改为**零请求** fail-closed，避免白白消耗「每 IP 5 次/分」的登录限流（极端情况会挤掉用户真实登录）；实现保留待后端提供静默契约。
- **错误兜底**：契约 §5 关键字表收敛到单一事实源 `mapLoginFailureMessage`（`phoneCode 不能为空`／`手机号授权失败`／`no phone number`／`not login|invalid session`／`抖音登录未开通`／抖音 code 码 `28005187`·`28005185`·`28005186`·`28005191`／其它 ⇒ 逐条用户可读提示，**任何失败都不把用户卡死**）；后端原始 message 只进 `errorRaw`（日志），不上屏。
- **审核红线保持**：登录仍由关键动作触发（点赞/收藏/我的等），不改成启动即弹；抖音按钮文案不含「抖音账号登录」。
- **验证**：全量 `vitest run` **706 passed / 3 skipped（85 文件）**（新增 `t72` 12 例；`t43`／`repositories.spec` 随契约更新）；`vue-tsc --noEmit` **exit 0**；`build:mp-weixin`／`build:mp-toutiao`／`build:mp-xhs` **各 exit 0**；抖音产物敏感词 0 且含「手机号一键登录」；产物 `.work/deliver/lanmei-miniapp-20261013-5d9534b-dylogin-wip/`（**mp-weixin／mp-toutiao 双端**，**未提交**，待主人真机回执）。
- **未做（后端下一批）**：换绑手机号/账号注销入口、手机号脱敏下发。

## 2026-09-11 · 我的页 banner 位废弃（主人指示）

- **我的页移除轮播 banner**：`pages/mine/index.uvue` 删除「AI试衣」下方 banner 位（swiper 区块、骨架屏 sk-banner、`banners` 数据、`handleBannerClick`、banner 系列 CSS 与 `cosThumb` 导入）；金刚区 icon_grid 配置照常保留。
- **联动后端**：`/api/page-config` 不再下发 `banner` 组件；OPS「我的页配置」不再提供 banner 类型（admin-web 同批移除 BannerPanel）；后端禁止再创建 banner 组件。
- **修复我的页崩溃（主人真机发现）**：品牌未配置金刚区 icon_grid 时 `filter(...)[0].items` 取 undefined 崩溃——前端防御式兜底（缺失用默认菜单），后端品牌缺金刚区时回退全局（与 share_card 同策略）。
- **金刚区 icon_grid 全面废除（主人指示 2026-09-11）**：我的页不再拉取中台页配置，菜单仅保留代码默认入口（我的喜欢 / AI试衣）；后端 /api/page-config 停止下发 icon_grid 并禁止再创建；OPS「我的页配置」页面与菜单项整页移除（admin-web）。
- **价目表二级页渲染套餐条目（主人指示 2026-09-11，仅展示）**：`pages/priceList` 在价目图下新增「套餐」区——1:1 头图（无图占位）/ 名称 / 内容 / 售价，数据复用公开接口 `GET /wechat/packages`（仅启用、按 sortOrder 升序，后端零改动）；后台套餐页继续配置这些字段。
- **首页店铺卡片两处优化（主人指示 2026-09-11）**：①单门店卡片固定 16:9（宽度撑满父容器、`height:422rpx`、aspectFill 居中裁切），品牌页进出/刷新表现一致；②店铺数为奇数（≥3）时补「敬请期待」占位卡补全网格（同尺寸虚线金边、不可点击，首页 + 价目表首页 PhotoGrid 同规则）。
- **占位卡真机修复 + 发布脚本增强（主人指示 2026-09-11）**：①占位条件改 JS 预计算 `showPlaceholder`（规避真机差异）并补诊断日志；②`scripts/release-trial.sh` 增强——构建前清空 `dist/build` 与 node_modules 缓存、上传按输出特征自检失败（微信 CLI 编译错误退出码为 0 的坑）、命中「IDE 旧句柄」特征自动重启工具重试一次、trap 兜底恢复 `.env.local`。
- **价目表页店铺级 banner 下线（主人指示 2026-09-11）**：`pages/priceList` 移除顶部轮播（模板/数据/请求/CSS），页面只剩 价目图 + 套餐区 + 页脚；后端 `/wechat/carousels` 店铺维度停发（旧客户端拿到空列表不渲染）。
- **banner 跳转上下文补齐（主人指示 2026-09-11）**：新增 `utils/navigate.uts` 统一跳转——按店页面（相册列表/AI试衣/AI推荐/价目表）缺门店参数时自动补「品牌默认门店」，相册详情缺相册 ID 改跳相册列表，外链走 webview，tab 页走 switchTab；`index.onBannerClick` 改走统一跳转；`demoDetail` 无 idx 时兜底解析品牌默认门店（不再白页）；`aiTryOn` 支持 `albumId=random`——banner 配置「随机相册」时进页随机解析该门店可试衣相册（tryonDisabled 排除）；`aiTryOn` 相册级模板匹配兜底——配置的相册试衣过滤后无可用照片时提示并回退本店全部模板（只有部分相册部分照片支持 AI 试衣）。

## 2026-09-10 · 分享链路迭代 + 上传质量拦截 + 顶栏统一 + 订阅消息（约 40 提交）

- **AI试衣结果分享闭环**：端侧 VKSession 人脸检测生成 5:4 人脸居中封面（`5df9f1b`）；改为点击分享才生成封面 + LoadingBlock 准备遮罩（`0d8aec9`/`dee4ce3`）；分享落地带 brandId/shopId/albumId 完整上下文、直达业务页（`b43dabb`/`a06444f`/`b98f159`/`a391bb7`）；分享文案带门店名（`eaf8ac7`）；朋友圈分享——按钮 + 官方 showShareImageMenu / 单页模式卡片（`d7e7200`/`69998e6`/`3d8482e`）；按钮样式收敛 CR（`fe341c6`/`ab80b43`/`82f4e37`/`c161536`/`ab1f8f4`）；share-debug 日志清理（`e1b87bd`）。
- **上传照片前端质量拦截**：分辨率（短边 480）/模糊（拉普拉斯方差）/VK 人脸/人脸占比 + 多人脸拦截，未通过弹窗告知重传，fail-open 策略（`db15e41`/`7972a20`）。
- **全站顶栏统一**：CustomNavBar v2（默认 slot + manualBack + onBackTap），全站 15 页一套顶栏（`e1c2df5`）；返回按钮 48rpx / 标题 34rpx / 返回图标全站统一（`1da6d60`/`4e35f01`）。
- **品牌切换双 bug 修复**（`54034b5`）；**全站错误兜底人性化**（冷文案改友好提示 + console.error 页面前缀，`fedff2a`）；**骨架屏三处修复 + uvue 嵌套 CSS 红线**（`5e534e8`/`82a1511`/`166d345`/`74cbd0f`）。
- **订阅消息**：试衣生成成功一次性订阅（前端 requestSubscribeMessage，拒绝不影响，`c2e77ae`）；订阅授权与支付弹窗串行 + loading 文案改后台生成（`83b1c88`）；platformConfig.json 移出仓库（`97ec098`）。

## 2026-09-09 · 图片性能 + 骨架屏组件化 + 模板横滑条 + 字体修复

- **全站图片缩略优化**（`fc5e628`）：cosThumb 600/400 + lazy-load + 客片详情渐进加载；skyline 下 webp/lazy-load 坑逐项修复（`1715590`/`630d13b`/`f60cb75`/`f2f7154`/`436c9b6`）。
- **骨架屏组件化 + 真实布局 1:1 镜像**（`31c4843`/`f66505d`/`7c4f8d9`/`f0da738`/`a628dc0`）。
- **AI试衣模板缩略图横滑条**（`9880491`/`798af63`/`0ee887f`）；防截屏解限补全（`f9add6c`）；试衣结果下载永久买断联动（`679c7a3`）。
- **字体跨域修复**：COS 默认域名 CORS（`d05e18c`/`0155bd3`）；platformConfig 移出（`3b74bf6`）；发布脚本红线（`d6557b3`）。

## 2026-09-08 · Hero 双层视差 + 下拉刷新 + 防截屏（`4167e19`）

## 2026-09-07 · AI试衣崩溃修复 + Design Token v2（`c628c7e`/`9387560`）

## 2026-09-05 · 分享卡片品牌差异化 PR#3 + AI 推荐/试衣上下文修复

- 分享卡片三页接入 OPS 品牌配置、三层兜底 + {brand} 占位符（`5dc08da`，PR#3 `bdd04fb`）；5:4 定稿配图与标题（`762807f`/`b17d88f`/`f60a685`）。
- 接口域名分流（`cc96975`）；AI推荐按后端免费次数决策 + 入口 shopId 兜底（`d84bbe9`/`2183efc`）；试衣模板按相册过滤（`e703852`）。

## 2026-09-04 · 品牌馆中台 + banner 跳转 + 版权第二行（6 项，PR #2）

- **品牌馆中台页面**：新增 `pages/brandHub/index`，首页左上角圆形「馆」按钮进入；品牌列表复用后端 `GET /api/brands`（后端零改动）；点品牌卡 → 写入品牌上下文并切回首页（首页按品牌维度加载）；记住上次品牌（`utils/brand.uts` storage 持久化）。
- **首页修复**：`reloadHomeData` 移入 `methods`（原顶层定义导致 `not a function`，骨架屏卡死）；`getPageConfig` 缓存加品牌维度键（中台切换品牌后服务保障/联系我们/版权字段立即刷新）。
- **版权第二行**：`AppFooter` 全站新增「小程序及AI技术能力由 蓝梅网络 提供支持」（默认固定文案，OPS 版权配置 `supportText` 可覆盖；仅超管可配）。
- **banner 点击跳转**：首页轮播 `hero-image` 点击 → `onBannerClick`（300ms 防重复 + 触感 + 前端白名单兜底；`/pages/` → navigateTo/switchTab，http(s) → webview 页）。数据源 `linkUrl` 由后端 `/wechat/carousels` 下发（配合后端 keep-admin-changes 分支）。
- **hero-mask 调整**：50% 高 + `bottom: 0` + 两 stop 渐变（透明 20% → 背景色 96%）。
- **退出登录间距**：`BottomActionBarSecondary` 的 `bottomOffset` 改固定 `116rpx`（`env(safe-area-inset-bottom)` 真机失效）。

## 2026-09-03 · UI 品牌化大改造（PR #1，squash af81a01）

- Design Token 体系（design-token.md + 全局 CSS 变量：颜色/字号/圆角/间距/渐变/图标）。
- 组件化：LoginPopup/ProfilePopup 弹窗、AppInput/AppSelector/AppSegment/AppPhotoPicker 表单、BottomActionBar/BottomActionBarSecondary 底部栏。
- 我的页视觉换新（Noto Serif 标题体系、金色氛围、用户卡片质感、列表合成一块）。
- 全站交互：按压态（press-dim/press-row）、触感振动（utils/haptics.uts）、150/250ms 过渡、图片渐显。
- 弹窗统一居中方案（底部弹层在 skyline 不稳定）；字重统一默认 400。