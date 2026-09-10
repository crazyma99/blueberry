# AGENTS.md · 蓝莓小程序（blueberry）协作红线

> 本文件面向所有在本仓库工作的 AI Agent / 协作者。**红线必须遵守**，违规会污染线上数据或浪费团队时间。

## 一、硬性红线（违反 = 严重事故）

### 1. env 严禁写接口地址（最重要）
- `.env.local` **一律留空/注释**，接口域名走**运行时自动分流**：
  - 正式版(release) → `https://lanmei66.cloud`
  - 体验版/开发版(trial/develop) → `https://crazyma99.xyz`
- **禁止**把 `VITE_API_BASE=http://10.192.39.225:8155` 之类**本机/局域网地址**写进 `.env.local` 或任何提交/构建；
- 包内 config 只允许出现上述两个自动分流字面量。

### 2. 分支纪律（2026-09-10 主人指示更新）
- 开发/体验/正式基座 = **`feat/v0.0.1`**（fork: crazyma99/blueberry）；
- `main` = 最新代码同步分支：每次发版后与 `feat/v0.0.1` 保持一致（已随 v1.0.28 同步至 83b1c88）；
- 本仓库无 staging 分支；任何合并/发布前先确认。

### 3. 发布/体验版上传必须走脚本
- 一律使用 **`./scripts/release-trial.sh <版本号> [描述]`**（如 `1.0.24`）：脚本会**先忽略 env → 构建 → 产物地址红线校验 → 上传 → 恢复 env**；
- 禁止手工跑 build/upload，避免漏掉 env 或把地址带进包。

### 4. 涉及 skyline / 平台兼容的新写法：先调研再动手
- skyline 下 `lazy-load`、webp、部分字体/CORS 均有坑，**先 websearch 调研 → 列证据 → 再改**，不要凭经验想当然（曾有教训）。
- uvue 禁止嵌套 CSS（.parent{ .child{...} }）——依赖编译器展开，缓存损坏会原样输出，微信 wcsc 报 unexpected {（2026-09-10 白屏教训）；一律写平铺后代选择器 .parent .child { ... }。
- **新增 .uts/.uvue 文件后必须重启 dev watcher 或全量构建**：增量编译不刷新新文件的模块注册表，真机/工具报 module is not defined 页面无法渲染（2026-09-10 photoCheck 教训）。

### 5. 数据库 / 服务端操作红线（见服务端仓库）
- 本仓库只做纯前端；如需改服务端契约，走服务端仓库 SOP。

## 二、快速操作流程
```bash
# 开发 → 合并到基座
git checkout feat/v0.0.1
# ... 提交到 fork/feat/v0.0.1（git add -> commit -> push fork feat/v0.0.1）

# 上传体验版（忽略 env + 校验 + 上传 + 恢复）
./scripts/release-trial.sh 1.0.24 "本次更新说明"

# 提交审核：微信公众平台 → 版本管理 → 选对应体验版 → 提交审核
```

## 三、红线自查清单（提交/发布前）
- [ ] `.env.local` 无硬编码地址（留空自动分流）
- [ ] 构建产物 `dist/build/mp-weixin/utils/config.js` 无本机/局域网 IP
- [ ] 体验版上传走 `scripts/release-trial.sh`
- [ ] 没有直推 main / 生产改动未经确认

## 四、关联脚本
- `scripts/release-trial.sh`：**忽略 env → 构建 → 红线校验 → 上传体验版 → 恢复 env**（发布唯一入口）
