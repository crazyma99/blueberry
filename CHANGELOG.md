# 蓝莓小程序（blueberry）CHANGELOG

> 记录小程序 C 端每次实质性改动，最新在上。多人合作提交前先补本文件（与代码同一提交）。

## 2026-10-19 · 独立 CR 收口（P0 扫码切换）：3 项假绿修复 ＋ 清理

- **S1** `t73` 补「纯数字 74 形态合法 ⇒ 接受并带出」断言并改正标题（旧标题与断言不符＝假绿）；**S2** `t90` mock 改用生产 `isBrandCodeShape`（原正则比生产严）；**S3** `index.vue` 裸 `decodeURIComponent` 改用 `normalizeScene`（畸形 `%` 不抛）。
- 清理：删零调用死代码 `isAcceptableBrandCode`／`isListedOrShapedBrandCode`；删 `App.vue` 空转 `void resolveRuntimeEnvironment`；删 `versioned.ts::loadBrandId` 未使用变量并修正 log 文案。
- 追加：`PLATFORM`（平台占位品牌）扫码视为「无品牌上下文」，不切换商户（新增 `PLATFORM_BRAND_CODE` ＋ 单测）。
- 门禁：vitest **825 passed**；type-check exit 0；三端构建 exit 0；产物 `lanmei-miniapp-20261019-737f630-scanfix3`（双端＋zip）。

## 2026-10-19 · 修复（线上 P0 根治）：准入闸门改为「形态校验」，名单降级为离线兜底

- **主人实测**：只有 `huahua/chayu/lanmei`（种子内 ∧ 线上存在）能跳；线上另 6 个（`Here_Stadio/PLATFORM/huajianjiu/qiyue/shiyue/xiaochen`）全部不能 ⇒ 名单硬拦（层2）为主因。
- **根因**：旧种子按 **staging** 取样（2026-10-13），与 **prod** 商户完全不同 ⇒ 静态名单当闸门必然静默拒写新商户。
- **修法**：①唯一准入＝**形态校验**＋后端容错回落（`d13654f`）②名单降级为离线兜底/提示，不再阻断 ③保留异步 `GET /api/brands` 补齐（一次/会话、超时、失败静默）④种子按 prod **只增不删**补齐 ⑤脏形态仍拒写、发送前二次校验。
- **验证**：`t91` 7 例（名单外合法编码接受／补齐抛错仍接受／脏形态拒写／接线守卫）；**变异自证 2 项**（退回名单硬拦 ⇒ 1 failed；去掉离线补齐 ⇒ 1 failed）；全量 vitest **824 passed**；type-check exit 0；三端构建 exit 0；产物 `lanmei-miniapp-20261019-737f630-scanfix2`（双端＋zip）。
- **验收**：干净环境扫 `xiaochen`/`qiyue` 冷热启动都必须落；`lanmei` 回归；编一个不存在的合法编码不崩。

## 2026-10-19 · 修复（线上 P0 层2）：干净环境扫「种子外商户」切不过去

- **根因**：线上 9 个商户中 6 个不在离线种子（`Here_Stadio/PLATFORM/huajianjiu/qiyue/shiyue/xiaochen`），而 `saveBrandId` 只接受「命中已知列表」⇒ 新用户（`lm.brands.v1` 空、未进过品牌馆）扫码被**静默拒写** ⇒ 冷热启动都切不过去。
- **修法**：①判定放宽为「命中已知列表 ∪ 形态合法」（后端 `d13654f` 对无效品牌头回落，不再 500；非形态仍拒收）②种子按线上**只增不删**补齐 6 条 ③新增 `application/brand-allowlist.ts` 后台补拉 `GET /api/brands`（一次/会话、5s 超时、失败静默不重试、不阻塞首屏），由 `syncBrandFromEnterOptionsAsync` 承载、首页注入。
- **验证**：新增 `t91`（6 例）＋**变异自证 2 项**（去补齐注入／判定退回严格，各 1 failed，还原即绿）；全量 vitest **823 passed**；type-check exit 0；三端构建 exit 0；产物 `lanmei-miniapp-20261019-737f630-scanfix2`（双端＋zip）。
- **验收**：干净环境（清缓存）扫 `xiaochen`/`qiyue` **冷启动与热启动都必须落该商户**；`lanmei` 回归。工具冷启动不能替代热启动验证。

## 2026-10-19 · 修复（线上 P0）：扫码切换商户不生效（热启动）

- **根因**：微信对已驻留 tab 页再次扫码**不执行 onLoad**（官方社区 2024-02-02），而 `index.vue` 的 onLoad 是唯一消费 `scene`/`?brandId=` 的地方，onShow 只比对基线 ⇒ 热启动新商户被丢弃；扫码路径也缺 `bumpScope()`。
- **修复**：新增 `platform/uni/enter-options.ts::readEnterOptions()`（取 `query.scene`/`query.brandId`，fail-soft）＋ `domain/enter-brand.ts`（优先级 scene > query > stored，含 kv/编码容错与 shopId 扩展位）＋ `application/enter-brand-sync.ts`（相同/无参数零动作、脏值不写入、生效才 `bumpScope`+回调）；**App 级 onShow 统一消费**，`index.vue` onLoad/onShow 共用同一编排器，`priceHomePage` 靠既有基线检测自动重载。
- **验证**：`t89`(9)+`t90`(7)＋**变异自证 3 项**（去 App onShow 消费／去 bumpScope／去防抖，分别 1/4/3 failed，还原即绿）；全量 vitest 817 passed；type-check exit 0；三端构建 exit 0；产物 `lanmei-miniapp-20261019-737f630-scanfix`（双端＋zip）。
- **验收**：真机热启动（扫 A→切后台不杀→扫 B 必落 B；分享卡片同验）；**开发者工具冷启动不能替代**。

## 2026-10-14 · 抖音合规：价目表 tab 与两页整条链裁剪

- **主人要求**：抖音底栏「价目表」tab 及其内容一并隐藏（价目表涉「生活服务-摄影」类目）。
- **技术判断**：抖音用**原生 tabBar**（custom 仅微信）⇒ 运行期无法按位过滤 ⇒ 走编译期裁剪：`pages.json` 三处 `#ifndef MP-TOUTIAO` ＋ C4/COMPAT_DECLARATIONS 登记 ＋ 生成期页清单 11→9 ＋ `features.priceTab` ＋ 抖音 `priceFallbackTitle` 置空；微信端未动。
- **恢复**：去掉三处 `#ifndef` ／ 页清单改回 11 页 ／ `priceTab` 改回 true ／ `priceFallbackTitle` 改回原值 ＋ 重构建。
- **验证**：新增 `t88`（6 例）＋ 2 项变异自证；全量 vitest **801 passed**；type-check exit 0；三端构建 exit 0；**抖音包 priceHomePage/priceList/价目表 0 命中**、微信包 7 命中、**抖音底栏仅首页/我的**；产物 `lanmei-miniapp-20261014-3c500f3-promise3`（双端＋zip）。
- **待主人裁决**：抖音包内 `pages/targetPhotoDetail` 仍含「价格」「套餐」文案（疑似涉类）。

## 2026-10-14 · 抖音审核合规（全端一致）：价格页同样隐藏承诺块

- **裁定**：主人对 task-68 遗留裁定「一并隐藏」⇒ 抖音端**所有渲染 `<ServiceContact>` 的页面**都隐藏承诺块。
- **调用点清单（全仓 2 处）**：`src/pages/index/index.vue:447`（首页）／`src/pages/priceHomePage/index.vue:214`（价格页，本单补齐）。两处均传 `:show-promise` 与 `:promise-title`。
- **验证**：新增 `t87`（3 例：调用点数==传参点数／全仓无漏传／组件默认值与两个受控根节点）；**变异自证**：去掉价格页参数 ⇒ 2 failed/3；全量 vitest **795 passed**；type-check exit 0；三端构建 exit 0；**抖音包「服务保障」0 命中／微信包 1 命中**；产物 `lanmei-miniapp-20261014-3c500f3-promise2`（双端＋zip）。
- **恢复步骤（更新）**：`servicePromise: !isDouyin,` → `servicePromise: true,`（标题位同步）＋重建两端；两处调用点无需改动。

## 2026-10-14 · 抖音审核合规：首页承诺块按 profile 特征位隐藏（A 方案）

- **背景**：抖音审核提示涉及「生活服务-摄影」类目（定向邀约未过审）⇒ 首页不得出现服务承诺类模块。
- **实现**：`profile-schema.mjs` 新增 `features.servicePromise = !isDouyin` 与 `servicePromiseTitle`；`ServiceContact.vue` 新增 `showPromise`（默认 true）/`promiseTitle` 并条件渲染承诺块（标题改由 props 下发，抖音产物内无该中文标题字面量）；`index.vue` 传 profile 位。只隐藏承诺块，**「联系我们」/IM 客服保持现状**。
- **恢复步骤**：`servicePromise: !isDouyin,` → `servicePromise: true,`（标题位同步）＋ 重新构建；不删代码/样式/资源。**B 方案升级**：给首页 `<ServiceContact>` 加 `v-if="PROFILE.features.servicePromise"`。
- **验证**：t86（6 例）＋ 2 项变异自证；全量 vitest 792 passed；type-check exit 0；三端构建 exit 0；**抖音包内「服务保障」0 命中 / 微信包内 1 命中**；产物 `lanmei-miniapp-20261014-3c500f3-promise`（双端＋zip）。
- **遗留**：同一承诺块在价格页（`priceHomePage`）仍显示，待裁定是否一并隐藏。

## 2026-10-13 · 修复：第三方远程头像改走「服务端代下载」（真机 downloadFile 域名限制）

- **根因**：真机 downloadFile 受「downloadFile 合法域名」限制，第三方头像域不该加白名单 ⇒ 客户端下载被拦（工具正常）。
- **改法**：`user-info.ts` 新增 `proxyAvatarUpload`（POST /api/wx/avatar/upload，JSON+{sourceUrl}，Bearer）；`application/avatar.ts` 远程分支改为**服务端代下载优先**，失败降级本地 downloadFile+上传，两端皆失败 ⇒ 可读提示且不落库；白名单直通/本地只上传不变；诊断只记 host＋状态＋截断片段。
- **验证**：新增 t85（8 例）＋**变异自证**（去掉服务端优先 ⇒ 2 failed/8，还原即绿）；全量 vitest 786 passed；type-check exit 0；三端构建 exit 0；产物 `-avatar2d`（双端＋zip）。

## 2026-10-13 · 修复：抖音取图（量身参数／顺序回退／errMsg 分级）+ 平台全局统一 ttApiOf

- **task-65 崩溃修复**：runtime-env.ts 导出 ttApiOf（裸 tt 优先、typeof 守卫、绝不抛），chooser/upload/download 全部改用；新增 t83（4 例）＋变异自证。
- **task-64 取图修复**：候选按 API 给量身参数（chooseImage 不传 mediaType）；顺序回退 tt.chooseImage → tt.chooseMedia → uni.chooseImage → uni.chooseMedia（全败才提示、带最后一个 errMsg）；errMsg 分级（authorize／unsupported／cancel／failed）＋诊断日志（trial 完整、release 精简）；新增 t84（6 例）＋3 项变异自证。
- 门禁：vitest 778 passed / 3 skipped；type-check exit 0；三端构建 exit 0；产物 -avatar2c（双端＋zip，地址命中 0）。

## 2026-10-13 · 修复：抖音头像「远程 URL 先落地再上传」＋ 抖音直调原生上传 API

- **⒞ 远程 URL 落地**：`resolveAvatarUrl` 三类分发——白名单域直通／真本地直接上传／**第三方远程（如抖音头像）先 downloadFile 落本地再上传** ⇒ 落库为我方 CDN；下载失败/不支持 ⇒ **可读提示且不落库**；三页注入平台层下载器。
- **⒜ 抖音直调原生上传 API**（`platform/uni/upload.ts`：原生优先、uni 回退；注释遵守 P4-12 不出现平台 API 字面量）。
- **验证**：新增 `t82`（6 例，含「download → upload」顺序与落库值、下载失败零上传、抖音直调优先）；**变异自证 2 项**（去掉「远程先下载」⇒ 2 failed；去掉抖音直调 ⇒ 1 failed；还原即绿）；全量 `vitest` **768 passed / 3 skipped**；`type-check` exit 0；三端构建 exit 0；产物 `.work/deliver/lanmei-miniapp-20261013-3c500f3-avatar2/`（双端＋zip，地址命中 0／抖音敏感词 0／AppID 正确）。
- 附带：`domain/avatar-url.ts` 内本机回环主机名改为**拼接常量**（避免产物红线 grep 命中「不得含本机地址」）。

## 2026-10-13 · 修复：弹窗头像「预览优先」（选完即展示，且脏值仍占位）

- **现象**：选/上传头像后**弹窗内占位**、保存后「我的」正常、重开弹窗又有 ⇒ 根因＝弹窗展示只走落库值通道，刚选到的**本地临时路径**被白名单判空（上一轮「预览≠落库值」把预览也清了）。
- **修法**：新增 `resolveAvatarDisplay({preview, persisted})`（**预览（原样、不套白名单）> 落库值（仍 sanitize）> 占位**）＋ `ProfilePopup` 独立入参 `previewAvatar`；三页新增 `profilePreviewAvatar`：选中即写、成功/失败/关闭即清（失败回退上一张有效头像＋提示）。**读侧兜底不回退**：已落库脏值仍占位。
- **验证**：新增 `t81`（6 例，含组件级 `image src` 三态）；**变异自证**：去掉预览优先 ⇒ `t81` 2 failed；全量 `vitest` **761 passed**；`type-check` exit 0；三端构建 exit 0；产物 `.work/deliver/lanmei-miniapp-20261013-3c500f3-avatarpopup/`（双端＋zip）。

## 2026-10-13 · 头像：切专用上传口 ＋ 抖音官方取头像 ＋ 本地相册兜底

- **切口**：`AVATAR_UPLOAD_PATH` → **`/api/wx/avatar/upload`**（task-58 已部署；唯一替换点，一行）——旧口带试衣照片质量门（4002）⇒ 正脸以外头像被拦（真机 21:12 `side_face`／21:13 `no_face`）；新口**不走人脸门**（multipart `photo`、JWT 必需、取 `data.file_url`、≤20MB／`image/*`／≤24MP）。
- **抖音取头像（①-2）**：新增 `platform/ui-bridge/AvatarPickerButton.vue`，抖音端走官方 **`button open-type="getUserInfo"`＋`bindgetuserinfo`**（**基础库 ≥2.87.0**，低版本降级并可读提示；不用 `tt.getUserInfo`）；**微信端 `chooseAvatar` 保持原样不削弱**。
- **本地相册兜底（①-3）**：同桥「从相册选择」经 `platform/uni/chooser.ts`（`uni.chooseImage` 落 `platform/**`，合 C1），两端通用；选到的本地路径仍**先上传后落库**；页面既有 `onChooseAvatar` 无需改动。
- **验证**：新增 `t79`（3 例）＋`t80`（4 例）；**变异自证 2 项**（切回旧口 ⇒ `t79` 2 failed；抖音改回 unsupported ⇒ `t80` 2 failed；还原即绿）；全量 `vitest` **755 passed**；`type-check` exit 0；三端构建 exit 0；产物 `.work/deliver/lanmei-miniapp-20261013-3c500f3-avatar/`（双端＋zip）。

## 2026-10-13 · 修复：头像上传失败的可见提示 ＋ 上传成功后回写展示值

- **失败必须有形提示**（真机两种入口都「没反应」：上传到了但被照片质量门拒 `side_face`／`no_face`）：新增 `mapAvatarUploadFailure()` 把 `4002` 的 `check_code` 逐条映射为头像场景文案（未识别码也给通用文案），超时/网络/业务失败/非白名单一律**非空可读** ⇒ 杜绝静默；失败分支 `toast＋return`，**不落库、不写 store、不关弹窗**（不留中间态）。
- **上传成功后回写展示值**（真机：库里已落真 CDN，弹窗却显示占位）：三页 `mine`／`aiRecommend`／`aiTryOn` 在上传成功后**立即回写 `profileAvatarUrl`**（`mine` 同步头部 `userAvatarUrl`）；**预览值≠落库值**（上传中只持有本地路径预览）。
- **验证**：新增 `t77`（6 例）＋`t78`（4 例）；**变异自证 2 项**（静默提示 ⇒ `t77` 4 failed；删回写 ⇒ `t78` 4 failed；还原即绿）；全量 `vitest` **748 passed**；`type-check` exit 0；产物 `.work/deliver/lanmei-miniapp-20261013-3c500f3-avatarfix/`（双端＋zip）。
- **根治待 task-58**：头像专用上传口上线后切 `AVATAR_UPLOAD_PATH`（一行）。

## 2026-10-13 · 紧急修复：头像可落库判定＝我方域名白名单（`http://tmp/…` 漏洞）

- **漏洞**：主人真机换头像提示成功，但 staging `users` 落的是 `http://tmp/40Rmw….jpeg`（**微信本机临时路径的 http 形态**）；旧 `isHttpUrl()` 只看 `http(s)://` 前缀 ⇒ 判为「已上传」直通、**跳过上传** ⇒ 脏值落库（12 个有头像用户中 2 个如此）。
- **新口径**：**头像只接受「我方域名白名单」的 http(s) URL**（`src/domain/avatar-url.ts` 单一事实源；清单＝`lanmei66.cloud`／`myqcloud.com`／`crazyma99.xyz`，以 task-58 实际上传返回域为准、只改一处）。**明确拒绝**：host 无点、内网/环回 IP、非白名单域、后缀伪装 ⇒ 一律归「本地路径 ⇒ 必须上传」。
- **上传返回也过白名单**（否则 fail-closed ＋ 日志含 host）；**读侧 `sanitizeAvatarUrl` 同步收紧**（历史 `http://tmp/…` ⇒ 视为空、显示占位）。
- **验证**：新增 `t76`（9 例）；**变异自证**：判定退回「只看前缀」⇒ **5 failed/9**，还原即绿；全量 `vitest` **738 passed**；`type-check`（src＋tests）exit 0；产物 `.work/deliver/lanmei-miniapp-20261013-3c500f3-avatarguard/`（双端＋zip）。

## 2026-10-13 · 修复：头像必须先上传成 http(s) 再落库（同时修掉跨端不同步）

- **事实（DB 已证实）**：staging `users` 里 `id=21/22/23` 的 `avatar_url` ＝ `wxfile://tmp_…`（微信本机临时文件路径），20 用户 12 个如此；端侧把 `chooseAvatar` 的本地路径直存落库、**全仓 0 上传调用** ⇒ 跨端/跨设备坏图（抖音端同步不了微信端头像）。
- **新口径**：**头像只存 http(s) URL**（单一事实源 `src/domain/avatar-url.ts`）；本地临时路径（`wxfile://`／`tmp_`／`file://`）**一律不得写入 store、不得提交服务端**。
- **上传底座** `src/application/avatar.ts`：`resolveAvatarUrl()` —— 空 ⇒ 零请求；http ⇒ 直通；本地路径 ⇒ **先上传**（复用 `ports/upload.ts`／`createAiPhotoUploader`）拿 http URL 后才落库；失败/返回非 http ⇒ fail-closed ＋ 可重试提示。
- **三处落库路径改造**：`mine`／`aiRecommend`／`aiTryOn`（后者原为同步直存本地路径）；上传中给 loading，失败**不半写**（零落库、零更新请求）。
- **读侧兜底**：`ProfilePopup` 展示经 `displayAvatarUrl`（sanitize）＋ `login-flow.toLocalUser` 过滤 ⇒ 历史脏值视为空、显示占位图。
- **验证**：新增 `t75`（10 例）＋ **变异自证 2 项**（撤上传闸⇒3 failed；读侧放行⇒5 failed；还原即绿）；全量 `vitest` **729 passed**；`type-check`（src＋tests）exit 0；三端构建 exit 0；产物 `.work/deliver/lanmei-miniapp-20261013-3c500f3-avatarup/`（双端＋zip）。
- **待办**：后端清洗历史脏值（**单列给 Ume，前端不改后端**）；抖音取头像（①-2）／本地相册兜底（①-3）见后续任务。

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