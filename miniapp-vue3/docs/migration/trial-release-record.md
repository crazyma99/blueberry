# 体验版发布记录（微信）

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

## 4. 两个必踩的坑（已固化）
1. **通配选择器 `*` 在微信 wxss 非法**（`uni build` 不报，上传时才炸）⇒ 一律改用「包裹 view + class」（deviations #13）
2. **IDE 项目句柄失效**（旧产物目录被删/重建后）⇒ 症状 `app.json: 在项目根目录未找到`；**重启工具服务后重试一次**即可
   （旧端脚本 `release-trial.sh` 早已内置该重试逻辑）

## 5. 上传后仍需人工一步（否则扫不了）
mp.weixin.qq.com → **版本管理** → 把该**开发版本设为体验版** → 生成**体验版二维码** → 手机扫；
扫码的微信号须为该小程序**开发者或体验成员**（「成员管理」）。
