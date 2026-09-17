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

## 4. 两个必踩的坑（已固化）
1. **通配选择器 `*` 在微信 wxss 非法**（`uni build` 不报，上传时才炸）⇒ 一律改用「包裹 view + class」（deviations #13）
2. **IDE 项目句柄失效**（旧产物目录被删/重建后）⇒ 症状 `app.json: 在项目根目录未找到`；**重启工具服务后重试一次**即可
   （旧端脚本 `release-trial.sh` 早已内置该重试逻辑）

## 5. 上传后仍需人工一步（否则扫不了）
mp.weixin.qq.com → **版本管理** → 把该**开发版本设为体验版** → 生成**体验版二维码** → 手机扫；
扫码的微信号须为该小程序**开发者或体验成员**（「成员管理」）。
