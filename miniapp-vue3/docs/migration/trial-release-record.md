# 体验版发布记录（微信 ＋ 抖音）

> 记录每一次「新端产物 → 体验版」的上传：**命令、版本号、描述、结果、失败与修法**。发布动作用的是
> **移植版工具自带 CLI**（`wechat-devtools-cli`，见 §1），**不用私钥、不走 miniprogram-ci**。

## 1. 本机既有通路（实测，2026-09-17）
| 项 | 值 |
|---|---|
| CLI | `/opt/apps/io.github.msojocs.wechat-devtools-linux/files/bin/bin/wechat-devtools-cli`（移植版自带；支持 `login/islogin/preview/upload/quit/cache`） |
| 登录态 | `islogin` → **`{"login":true}`**（无需重新扫码） |
| 产物 | `miniapp-vue3/dist/build/mp-weixin`（`npx uni build -p mp-weixin` 产出） |
| 环境 | 生成物 `PROFILE.environment = trial` ⇒ apiBase = **`https://crazyma99.xyz/`（测试后端）** ✓ 符合体验版口径 |
| 版本号规范 | **纯数字**（旧端口径，例 `v1.0.24`）；描述以 `[g<commit短号>]` 开头 |

## 2. 上传命令（本次实际使用）
```bash
cd miniapp-vue3
rm -rf dist/build node_modules/.cache node_modules/.vite    # 清缓存
npx uni build -p mp-weixin                                   # 构建
python3 -c "…"                                              # 注入真实 appid（普通 uni build 写的是 touristappid 占位）
wechat-devtools-cli upload --project "$PWD/dist/build/mp-weixin" -v "v1.0.25" -d "[gc0ed7b4] 迁移试运行"
```
**判定纪律（照旧端 `release-trial.sh`）**：CLI **编译失败时退出码仍为 0**，必须**按输出特征判定**——
失败特征：`wxss 编译错误`／`app.json: 在项目根目录未找到`／`Error: 错误`；成功特征：`✔ upload`。

## 3. 记录
| # | 时间 | 版本 | 描述 | 结果 | 备注 |
|---|---|---|---|---|---|
| 1 | 2026-09-17 18:46 | v1.0.25 | `[gc0ed7b4] 迁移试运行` | ❌ **失败** | `wxss 编译错误 … error at token \`*\``（`pages/index`、`pages/priceHomePage`）⇒ 通配选择器不合法，见 deviations **#13** |
| 2 | 2026-09-17 18:5x | v1.0.25 | 同上 | ❌ **失败** | 修掉 `*` 后转为 `app.json: 在项目根目录未找到` ⇒ **IDE 持有失效项目句柄**（我删过 `dist/trial-nonpm`，工具仍记着它） |
| 3 | 2026-09-17 19:0x | **v1.0.25** | `[gc0ed7b4] 迁移试运行` | ✅ **成功** | **重启工具服务**后重试即通过：`✔ Using AppID: wxb19ad7426dfb8bd4`｜`TOTAL 1.5 MB (1,542,072 B)`｜`✔ upload`｜exit 0 |

| 4 | 2026-09-17 19:3x | **v1.0.26** | `[g4c89642] 修复主题变量+字体+接口地址` | ✅ **成功** | 主人体感「布局错乱/UI 错乱/字体失效/接口失败/主页 navbar 不可用」⇒ 定位并修 **两处致命遗漏**：①`App.vue` 全局样式块未移植（`app.wxss` 仅 191B，46 处 `var(--color-*)`＋字体族＋10 个 `--font-size-*` 全空，deviations 待补）②`transport` 拼出双斜杠 `…xyz//api/…`（接口 404）。`TOTAL 1.5 MB (1,546,403 B)` |
| 5 | 2026-09-17 19:5x | **v1.0.27** | `[g3ea8b95] 修 tabbar uni 未定义崩溃` | ✅ **成功** | 真机 vconsole 实测 `ReferenceError: uni is not defined at ci.attached` ⇒ **custom-tab-bar 是原生组件、上下文只有 `wx`**，我误写 `uni.loadFontFace/switchTab/vibrateShort` ⇒ 启动即崩（页面全废/数据兜底/navbar 不可用）。修法＝**逐字照抄旧端 `src/custom-tab-bar/*` 四文件**。`TOTAL 1.5 MB` |
| 6 | 2026-09-19 21:16 | **v1.0.28** | `[gd4c117a] 客片列表骨架屏+分页文字化+AI页loading对齐旧端` | ✅ **成功** | ①客片列表首屏 LoadingBlock 转圈 ⇒ 骨架屏（旧端 :22-41 结构还原）②底部分页转圈 ⇒ 文字「加载更多/加载中.../已经到底了」（旧 :89-94/:175-180）＋补齐搜索模式触底分页 ③AI 四页经 coordinator `onPhase` 还原「确认到账中...」，aiTryOn 补「提交中...」、移除多余「发起支付...」。**macOS 本机首传**（`/Applications/wechatwebdevtools.app/Contents/MacOS/cli`，非 Linux 通路）：`✔ Using AppID: wxb19ad7426dfb8bd4`｜`TOTAL 1.6 MB (1,640,523 B)`｜`✔ upload` |
| 6 | 2026-09-20 11:4x | **v1.0.30** | `[gf5d5677] 修复401误判/缩略图/字体/点赞态` | ✅ **成功** | ①AI试衣详情补 `authRequired`（后端口志实证连续 401 致「生成失败」）②首页卡片/轮播 `cosThumb 600/750` ③demoDetail 4 处 `font-noto-serif` ④搜索栏字体族 ⑤点赞读状态平台条件（微信带 token／抖音匿名）。TOTAL **1.6 MB (1,645,758 B)**。途中两坑：`需要重新登录`（主人扫码即解）→ `app.json is not found`（**IDE 旧句柄，按旧端手法重启工具服务后重试成功**） |
| 7 | 2026-09-20 20:5x | **v1.0.31** | `[gHEAD] 品牌改名蓝梅云` | ✅ **成功** | C 端展示文案「蓝梅旅拍」→「蓝梅云」（`c0e9bb0`）；`TOTAL 1.6 MB (1,645,274 B)`。⚠️ 前两次尝试**卡在 `Using AppID` → `- Upload` 无进展**：实测 **IDE 的 `nw` 已运行 9h+、CPU 0%（坏状态）** ⇒ 结束 CLI ＋ `pkill -x nw/exe` 重启服务（登录态 `{"login":true}` 仍在）后**一次通过** |
| 11 | 2026-09-21 | **回退说明（无版本）** | — | ⚠️ **v1.0.32／v1.0.33／v1.0.34 作废** | 主人指示：回滚「年龄 Tabs（picker→胶囊）」与「照片上传改 Wot `wd-upload` UI」全部改动（基准回到 `0074b6a`），**仅保留「微信自绘标题栏」修复**（`CustomNavBar` 标题宋体＋协议两页微信端 `navigationStyle: custom`，抖音仍原生）。picker/upload 维持**迁移初始实现**（原生 `<picker>` 下拉＋旧上传卡片）。 |
| 16 | 2026-09-21 | **v1.0.39** | `[gbc415fc] AI试衣记录网格/卡片对齐相册列表标准` | ✅ **成功** | 主人：「AI试衣列表的 Grid 与相册列表 Grid 样式不一致，要求保持统一（以相册列表 Grid 为标准）；卡片样式也要以相册列表的卡片为标准做样式对齐」⇒ AI 记录页整块换相册标准类名与逐值样式（`.album-grid/.album-card/.album-inner/.album-cover/.album-mask/.album-desc/.album-title`：gap 16rpx／calc 两列／金 30% 描边／14·13rpx 双圆角／460rpx／三段渐变蒙层／26rpx 金衬线单行省略），点击面＝蒙层，骨架同款（`sk-row sk-grid`＋6 格），AI 专属状态层保留并归品牌金；同族「我的收藏」补标题单行省略；新增漂移守卫 `t54`（9 例，钉死值＋唯一性＋交叉断言）。独立 CR **2🔴＋5🟡 全清**（R1 状态层吞点击＝真机点不动 ⇒ `pointer-events:none`；R2 `.content` 多 8rpx 横向内边距 ⇒ 归零）。`TOTAL 1.6 MB (1,678,462 B)`（较 v1.0.38 +198 B）。⚠️ 真机待验见 `device-acceptance-checklist.md` §7 六条（两页卡片一致／标题金衬线单行省略／长标题不溢出／状态卡可点进结果页／骨架同款／抖音端说明） |
| 15 | 2026-09-21 | **v1.0.38** | `[g9d29b67] 分享准备loading改wot popup+loading公共组件` | ✅ **成功** | 主人：「AI试衣落地页分享的准备loading也使用wotui的loading组件+token」→「用 popup＋loading 做替代、做成公共组件可复用」⇒ 新增门面层公共组件 `src/ui/BaseLoadingPopup.vue`（wot `wd-popup`：center／不可点遮罩关／root-portal／**显式 z-index 1001**／custom-style 置 `--wot-popup-bg` 透明 ＋ 门面 `BaseLoading`→`wd-loading`：token 金＋48rpx ＋ token 品牌卡片面；抖音端自绘分支预留复用）；`aiTryOnResult` 分享准备遮罩收敛为一行调用＋ **12s 总超时**兜底；`HANDOFF` 第 11 条固化「wot 相关先问 `npx wot …`」。独立 CR **1🔴＋9🟡 全清**（🔴＝wot popup 默认 `z-index:10` < 自绘标题栏 998 ⇒ 遮罩盖不住顶栏，真机必现；被删旧遮罩原为 999）。`TOTAL 1.6 MB (1,678,264 B)`（较 v1.0.37 仅 +1,120 B）。**⚠️ 一次失败**：`rm -rf dist/build` 重建后上传报 `app.json: app.json is not found in the project root directory`＝**记录在案的第 2 个必踩坑（IDE 项目句柄失效）** ⇒ 重启工具服务（`pkill -x nw/exe`＋清 `Singleton` 锁）后**重试一次成功**。⚠️ 真机新增两条见 `device-acceptance-checklist.md` §6.11／6.12（顶栏是否压暗；wot `root-portal` 业务路径**首次启用** ⇒ 看卡片 scoped 样式是否生效） |
| 14 | 2026-09-21 | **v1.0.37** | `[gcab4a18] 四页下拉刷新+分享卡片/VK人脸封面补迁` | ✅ **成功** | 四件事：①金胶囊内距加大（8/16→16/24rpx）②客片列表/客片详情/AI试衣记录/价目表四页补下拉刷新（共享内核＋共享指示器；客片列表同时补回旧端 `onReachBottomDistance:80`）③首页/客片列表/客片详情补分享卡片（三层解析＋`onShareAppMessage`/`onShareTimeline`＋首页 `onLoad` 消费 `?brandId=`/`scene`）④AI试衣结果接回 VK 人脸居中 5:4 封面。独立 CR **1🔴＋11🟡**（🔴＝检测段 `drawImage` 误写 9 参，真机必命中 ⇒ 已改回 5 参＋补断言）。`TOTAL 1.6 MB (1,677,144 B)`。**⚠️ 上传过程两个坑**：⑴首次尝试卡在 `- Upload`（`nw`×3 空转 35 分钟、CPU 0%）⇒ 按老流程强退工具＋清 `Singleton` 锁；⑵重传被平台拒 **`80051 source size 2113KB exceed max limit 2MB`**（补入的 3 张本地分享兜底图共 487 KB 顶破主包硬线）⇒ **主人订正「分享图来源 url 来自后台配置」**，遂把本地图整份移出包体、默认 `imageUrl` 留空（真源＝OPS `share_card`）⇒ 平台口径回落 1.6 MB（见 `deviations #28` 与 commit `9c42470`）。⚠️ 真机待验十条见 `device-acceptance-checklist.md` §6 |
| 13 | 2026-09-21 | **v1.0.36** | `[g76dcce8] 首页下拉刷新恢复（wot wd-loading 门面+token）` | ✅ **成功** | 主人「首页下拉刷新功能丢失了」⇒ 恢复旧端口径：`pages.json` 首页开 `enablePullDownRefresh`＋`backgroundTextStyle:"light"`、`onPullDownRefresh` ⇒ 重载轮播（**防缓存 `t`**）/店铺/品牌馆开关＋`fgTick+1` 重播前景层动效＋`finally` 收 `uni.stopPullDownRefresh()`；**指示器＝wot `wd-loading` 经门面 `ui/BaseLoading`＋design token**（金 `colorAction`／尺寸 `pullRefreshLoadingSizeRpx=48rpx`／玄墨胶囊）；独立 CR **2🔴 全清**（①门面纪律 ②抖音 var() 链口径更正＋能力矩阵）；vitest **430 passed**／`vue-tsc` 0／三平台 exit 0；fork `4177d3e..76dcce8`。`TOTAL 1.6 MB (1,648,901 B)`（`✔ Using AppID: wxb19ad7426dfb8bd4`／**一次通过**，无「需要重新登录」/IDE 句柄/`wxss 编译错误`）。⚠️ 真机待验 6 条见 `device-acceptance-checklist.md` §5（含自绘胶囊与原生三点**是否重叠**、抖音端 spinner 旋转/字号 unknown）
| 12 | 2026-09-21 | **v1.0.35** | `[g61b5b94] 回退后版本：保留自绘标题栏修复` | ✅ **成功** | 回退后的首次发布：picker/upload 维持迁移初始实现（原生 `<picker>` 下拉＋旧上传卡片），**仅保留**微信自绘标题栏修复（`CustomNavBar` 标题宋体＋协议两页微信端 `navigationStyle: custom`，抖音仍原生）。`TOTAL 1.6 MB (1,645,191 B)`（与回退前一致，无 wd-upload 组件）。 |

## 4. 两个必踩的坑（已固化）
1. **通配选择器 `*` 在微信 wxss 非法**（`uni build` 不报，上传时才炸）⇒ 一律改用「包裹 view + class」（deviations #13）
2. **IDE 项目句柄失效**（旧产物目录被删/重建后）⇒ 症状 `app.json: 在项目根目录未找到`；**重启工具服务后重试一次**即可
   （旧端脚本 `release-trial.sh` 早已内置该重试逻辑）

## 5. 上传后仍需人工一步（否则扫不了）
mp.weixin.qq.com → **版本管理** → 把该**开发版本设为体验版** → 生成**体验版二维码** → 手机扫；
扫码的微信号须为该小程序**开发者或体验成员**（「成员管理」）。

## 8. 抖音端发布记录（2026-09-22 起；工具链＝官方 `tma`／`tt-ide-cli` v0.1.33，账号 `lanmeilvpai_skill`）

> 抖音无官方 Linux 版 IDE ⇒ 一律走 `tma`（既定路径）；判定沿用旧端 `scripts/release-trial-douyin.sh` v2 的三重判据
> （退出码 ＋ 错误关键字 ＋ **正向成功证据**）。**上传属发布动作**：本轮由主人明确指示（「提交一版抖音体验版」）后执行。

| # | 时间 | 版本 | 描述 | 结果 | 备注 |
|---|---|---|---|---|---|
| 1 | 2026-09-22 | **0.0.1**（未传 `-v`，平台自动分配） | `[gc5b7be2] 抖音客片展示版：网格/卡片对齐相册标准＋分享卡片与下拉刷新＋全局标题品牌化（AI 六页不注册）` | ✅ **成功** | `tma upload dist/build/mp-toutiao` ⇒ `- 正在准备上传...`／`The default version is 0.0.1`／**主包 1.33MB**／**`🎉 Upload success`**／exit 0。前置＝兼容性体检全绿（见 §8.1）＋`tma preview` 出码成功（二维码 PNG 973 B；短链 `https://t.zijieimg.com/iXxNvAkY/`）。**待主人两步**：抖音开放平台「版本管理」把 `0.0.1` **设为体验版** ＋ 添加**体验成员**（测试设备绑定已于 2026-09-15 完成） |

### 8.1 抖音兼容性体检（2026-09-22，工具侧全量实测）

| 项 | 命令／证据 | 结果 |
|---|---|---|
| 敏感平台 API 落点（P4-12） | `node scripts/scan-platform-usage.mjs` | **exit 0、0 违规** |
| 产物级校验（P4-13） | `verifyTarget`（复用 `build-target` 的 manifest 形状，`artifactDir=dist/build/mp-toutiao`） | **`ok=true`**，11 项 checked＝app.json／app.js／routes:12／appid／navTitle／engine:vue3／subPackages:0／forbiddenRoutes:4／platform:mp-toutiao(tt-files)／appid-non-placeholder；1 warning＝`forbiddenResidues` 未提供（跨品牌残留扫描未执行） |
| 页数与 AI 页 | `app.json` 实测 | **12 页**；`pages/ai*` **零注册** ✓（客片展示版口径） |
| 导航与 tabBar | 12 页 json 实测 | **无 `navigationStyle`**（系统栏）／`tabBar.custom` 缺省（原生 tab）✓ 与 `deviations #17` 一致 |
| 身份与引擎特征 | `project.config.json`／产物 | appid＝`ttd6aba01648cc1bf701`；`app.ttss`＋`app.js`＋**44** 个 `.ttml`；**微信产物特征文件（`.wxss`/`.wxml`/`.wxs`）＝0** |
| 包体积 | `tma project-size --json` | 主包 **1,174,673 B**（上传时平台口径 **1.33MB**）≤ 2MB 上限 ✓、无分包 |
| WeChat API 泄漏 | 全量 `.js` grep `wx.` | **0 命中** ✓ |
| CSS 变量／通配选择器 | 全量 `.ttss` grep | **本项目文件 0**；**12 个 wot 自带组件含 `var(--`、3 个含通配 `*`** ⇒ 抖音端这些组件样式可能局部降级（既有登记 `deviations #15/#27`，**真机目视项**） |
| 平台调用面 | 产物 grep | `loadFontFace`／`vibrateShort`／`getPhoneNumber` 各 1 处（均走 uni 转发或能力守卫）；`requestSubscribeMessage`／`setVisualEffectOnCapture`／`chooseImage` **0**（AI 页不注册 ⇒ 无该场景） |
| 预览出码 | `tma preview --qrcode-output` | **exit 0** ＋二维码文件 ＋短链 ✓ |
| 真机（待主人） | `tma preview` 扫码 / 体验版扫码 | 见 §8.3 目视清单 |

### 8.2 ⚠️ 本轮发现的阻断项（不影响本次发版，但需修）

1. **规范发布通路 `build-target.mjs` 对新端不可用（真 bug，已取证）**：`copyTemplate` 的 `TEMPLATE_WHITELIST` 只带 `package.json／pnpm-lock.yaml／pnpm-workspace.yaml／tsconfig.json／vite.config.ts／index.html／shims-uni.d.ts／src／tokens` ⇒ 隔离副本里**既无 `scripts/` 也无 `profiles/`**，而 `package.json` 的 `build:<platform>` 第一步是 `node scripts/gen-profile-local.mjs <platform>` ⇒ 实测 `Cannot find module '…/run-tt-trial-0922/scripts/gen-profile-local.mjs'`、`[ELIFECYCLE] Command failed with exit code 1`。**建议修法（二选一）**：①白名单补 `scripts`＋`profiles`；②`applyProfile` 把隔离副本的 `build:<platform>` 改写为 `uni build -p <platform>`（profile 已由 `applyProfile`＋`generateProfile` 注入，无需再跑 `gen-profile-local`）。**本轮发版改走普通通路**（`gen-profile-local.mjs` ＋ `uni build -p mp-toutiao`，与历轮抖音产物同路）。
2. **全局导航标题泄漏 `uni-app`** ⇒ **已修**：`src/pages.json` 的 `globalStyle.navigationBarTitleText` 由 `uni-app` 改为品牌名 **`蓝梅云`**（12 页各自都有标题 ⇒ 页内不显示全局值，但平台「关于/启动/分享兜底」等面会用；P4-13 的 `navTitle` 检查即此项）。**两通路口径差异**：流水线通路按 profile 覆盖为 `蓝梅旗袍·汉服·民...`，普通通路用源码值 ⇒ 已登记。
3. **探针页随包发布**：`pages/_probe/wot-sample` 出现在**微信与抖音两端**产物（源码无条件注册），而 `pages/index/index.vue` 注释自称「P1-08 不入生产包」与实况不符 ⇒ 建议正式发布前按 profile 剔除（**既有问题，非本轮引入**）。

### 8.3 抖音真机目视清单（§7 之外的抖音专属项）
| # | 操作 | 预期 |
|---|---|---|
| 8.3.1 | 抖音扫码进首页 | 系统导航栏标题＝**蓝梅云**（不得出现 `uni-app`）；底部为**原生** tab（首页/价目表/我的） |
| 8.3.2 | 首页/价目表/我的 之间切换 | 页面正常渲染；卡片网格与微信端一致（金 30% 描边／460rpx／金衬线标题） |
| 8.3.3 | 首页下拉 | 自绘金胶囊出现且收口（`deviations #27` 记录的 wot `wd-loading` var() 降级面：**spinner 是否旋转/环是否成形/文案字号**） |
| 8.3.4 | 我的收藏/客片列表/客片详情 | 卡片样式与微信端一致；长标题省略号 |
| 8.3.5 | 走一遍 客片浏览 → 详情 → 收藏 | 无白屏/布局错乱；wot 组件（按钮/输入/弹层/选择器）样式是否局部降级 |
| 8.3.6 | 关注 | 抖音端**不注册** AI 六页与支付 ⇒ 不应出现任何 AI 入口（`deviations #17` 口径） |
