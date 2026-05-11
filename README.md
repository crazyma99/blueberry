# blueBerry 小程序模板

[![repo](https://img.shields.io/badge/GitHub-linziyanleo%2Fblueberry-black?logo=github)](https://github.com/linziyanleo/blueberry)
[![uni-app x](https://img.shields.io/badge/uni--app%20x-Vue3-42b883)](https://uniapp.dcloud.net.cn/)
[![platform](https://img.shields.io/badge/platform-mp--weixin-07C160)](https://developers.weixin.qq.com/miniprogram/dev/devtools/devtools.html)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

> 基于 **uni-app x (Vue 3 + TypeScript/UTS)** 的微信小程序模板仓库，内置 **多项目 Profile 机制** 与 **一键构建/校验/发布脚本**，支持「一套模板，多端复用」。
>
> 适用于同一产品矩阵下需要快速孵化多个相似小程序（如旅拍、写真、门店展示等）的场景。

---

## 目录

- [特性](#特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [目录结构](#目录结构)
- [页面清单](#页面清单)
- [工具模块](#工具模块)
- [Profile 多项目配置](#profile-多项目配置)
- [构建与发布脚本](#构建与发布脚本)
- [常见工作流](#常见工作流)
- [发布流程](#发布流程)
- [FAQ](#faq)
- [License](#license)

---

## 特性

- 📦 **一套源码，多个小程序**：通过 `profiles/<project-key>/project.env` 管理项目私有配置（AppID、品牌、API 域名、联系方式、协议名称等），不污染模板源码。
- ⚡ **一键构建流水线**：`scripts/build-miniapp.sh` 一条命令完成「同步模板 → 应用 Profile → 安装依赖 → 编译 → 产物校验」。
- 🧪 **构建产物校验**：`scripts/verify-miniapp.sh` 自动比对产物中的 AppID、导航栏标题、本地协议页面、`X-App-Code` 请求头，并支持残留字符串扫描，防止串号。
- 🏗️ **新项目一键孵化**：`scripts/new-miniapp-project.sh` 从模板快速拉起一个完整的新仓库，自带初始 Profile 与 `git init`。
- 🔐 **内置微信登录与授权**：统一封装 token / 用户信息 / 授权登录 / 手机号绑定流程。
- 📄 **内置合规页面**：自动注入 `pages/policies/user`（用户协议）与 `pages/policies/privacy`（隐私政策），满足微信审核要求。
- 🎨 **骨架屏 & TabBar 三栏导航**：开箱即用的首页 / 价目表 / 我的 三大核心页面。

---

## 技术栈

| 分类 | 技术 |
| --- | --- |
| 框架 | uni-app x（Vue 3） |
| 编程语言 | UTS / TypeScript / `.uvue` |
| 构建工具 | Vite 5 + `@dcloudio/vite-plugin-uni` |
| 目标平台 | 微信小程序（mp-weixin） |
| 包管理 | npm |
| 自动化 | Bash + Node.js（ESM） |

**环境要求**：Node.js ≥ 18，`npm` ≥ 9，已安装微信开发者工具（libVersion ≥ 3.10.1）。

---

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/linziyanleo/blueberry.git
cd blueberry

# 2. 安装依赖
npm install

# 3. 开发模式编译（输出到 dist/dev/mp-weixin）
npm run dev:mp-weixin

# 4. 用微信开发者工具导入：dist/dev/mp-weixin
```

生产构建：

```bash
npm run build:mp-weixin
# 用微信开发者工具导入：dist/build/mp-weixin 上传发布
```

> 要基于本模板孵化一个新的小程序项目，请查看 [常见工作流](#常见工作流) 中的「孵化新项目」章节。

---

## 目录结构

```text
blueBerry/
├── src/                               # 唯一源码入口（根目录同名文件/目录被 .gitignore 忽略）
│   ├── App.uvue                       # 应用入口 + 全局样式（骨架屏 / 登录弹窗）
│   ├── main.uts                       # Vue 应用初始化
│   ├── manifest.json                  # uni-app 应用清单 + 微信 AppID
│   ├── pages.json                     # 页面路由 / 全局导航 / tabBar
│   ├── env.d.ts                       # 类型声明
│   ├── index.html                     # H5 入口占位
│   ├── uni.scss                       # 全局 SCSS 变量
│   ├── pages/                         # 业务页面（见「页面清单」）
│   ├── components/                    # 可复用组件
│   ├── static/                        # 静态资源（图标、二维码、兜底图）
│   └── utils/                         # 工具模块
│       ├── api.uts                    # 后端接口封装
│       ├── auth.uts                   # 登录态 / Token / 用户信息
│       ├── config.uts                 # API baseURL / 超时
│       ├── http.uts                   # 请求封装 / 请求头 / 401 处理
│       └── legal.uts                  # 协议名称与跳转
│
├── profiles/                          # 多项目私有配置
│   ├── blueberry/project.env          # 默认示例 profile（蓝梅）
│   └── huahua/project.env             # 参考 profile（花花旅拍）
│
├── scripts/                           # 自动化脚本
│   ├── apply-profile.sh               # 应用 profile 到目标仓库
│   ├── build-miniapp.sh               # 完整构建流水线（推荐入口）
│   ├── create-profile.sh              # 生成新 profile
│   ├── new-miniapp-project.sh         # 孵化全新小程序项目
│   ├── release-miniapp.sh             # 发布前构建（build 的包装）
│   ├── sync-template.sh               # 将模板源码同步到目标仓库
│   ├── verify-miniapp.sh              # 校验构建产物
│   ├── lib/apply-profile.mjs          # profile 文本替换核心实现
│   └── templates/profile.env.example  # profile 模板
│
├── project.config.json                # 微信开发者工具公开配置（AppID 由 profile 覆盖）
├── project.private.config.json        # 微信开发者工具私有配置（已 .gitignore）
├── vite.config.ts
├── tsconfig.json                      # 路径别名 @/* → src/*
├── package.json
├── .gitignore                         # 强制源码只在 src/，忽略 dist/unpackage/node_modules
├── 微信开发者工具预览指南.md
└── README.md
```

> `.gitignore` 已禁止在根目录维护 `pages/`、`static/`、`utils/`、`App.uvue`、`main.uts`、`manifest.json`、`pages.json`、`uni.scss` 等源码副本，避免与 `src/` 产生漂移。

---

## 页面清单

| 路径 | 功能 | TabBar |
| --- | --- | :---: |
| `pages/index/index` | 首页：轮播广告、品牌故事、服务介绍、联系方式 | ✅ 首页 |
| `pages/priceHomePage/index` | 价目表首页：店铺价格信息总览 | ✅ 价目表 |
| `pages/mine/index` | 个人中心：登录、头像昵称、收藏、退出 | ✅ 我的 |
| `pages/priceList/index` | 价目列表（具体店铺价目） | — |
| `pages/demoDetail/index` | 客片详情页 | — |
| `pages/targetPhotoDetail/index` | 客片欣赏 | — |
| `pages/favorites/index` | 我的收藏 | — |
| `pages/webview/index` | WebView 外链容器 | — |
| `pages/policies/user` | 本地用户协议（合规必备） | — |
| `pages/policies/privacy` | 本地隐私政策（合规必备） | — |

> `pages/policies/*` 路由会在 `apply-profile` 阶段自动补充到 `src/pages.json`，无需手动维护。

---

## 工具模块

全部位于 `src/utils/`，为 UTS 编写：

| 文件 | 职责 |
| --- | --- |
| `config.uts` | 集中管理 `baseURL` 和超时时间；`API_BASE_URL` 由 profile 注入 |
| `http.uts` | 统一 `request / get / post`；自动附加 `Authorization`、`X-App-Code`；401 自动登出 |
| `auth.uts` | `getToken / setToken / getUserInfo / mergeUserInfo / isLoggedIn / loginSuccess / logout` |
| `legal.uts` | 导出 `MINI_APP_NAME`、`USER_AGREEMENT_NAME`、`PRIVACY_POLICY_NAME` 及跳转函数 |
| `api.uts` | 所有后端接口封装：轮播、分类、相册列表 / 详情、登录、手机号绑定、点赞、收藏、搜索、店铺、中台配置 |

---

## Profile 多项目配置

每个小程序项目对应一个 profile 目录：

```text
profiles/
└── <project-key>/
    ├── project.env          # 必填：项目私有变量
    └── static/              # 可选：会被复制到 src/static/
```

### 必填字段

| 字段 | 作用 |
| --- | --- |
| `PROJECT_KEY` | 项目唯一标识 |
| `PACKAGE_NAME` | 写入 `package.json` 的 `name` |
| `MANIFEST_NAME` / `DESCRIPTION` | 写入 `src/manifest.json` |
| `MP_WEIXIN_APPID` | 微信小程序 AppID，写入 `project.config.json` 与 `src/manifest.json` |
| `NAVIGATION_TITLE` | 全局导航栏标题，写入 `src/pages.json` |
| `BRAND_NAME` / `COPYRIGHT_TEXT` | 页面品牌文案与版权 |
| `CONTACT_PHONE_TEXT` / `CONTACT_QR_SRC` | 首页 / 价目表的联系方式与二维码 |
| `PRICE_FALLBACK_TITLE` | 无接口数据时价目表兜底标题 |
| `API_BASE_URL` | `src/utils/config.uts` 中的接口域名 |
| `APP_CODE` | 写入 `X-App-Code` 请求头（为空时自动移除） |
| `MINI_APP_NAME` | 协议页面与登录弹窗中的小程序名称 |

### 可选字段

| 字段 | 作用 |
| --- | --- |
| `RESIDUAL_SEARCH_REGEX` | 构建后扫描残留字符串的正则，用于防止模板/其他项目字符串泄露到产物 |

### 示例（花花旅拍）

```bash
PROJECT_KEY="huahua"
PACKAGE_NAME="huahua"
MANIFEST_NAME="huahua"
DESCRIPTION="花花旅拍"
MP_WEIXIN_APPID="wxd3933d928ffed10d"

NAVIGATION_TITLE="花花旅拍"
BRAND_NAME="花花旅拍"
COPYRIGHT_TEXT="Copyright 2025 花花旅拍 - 版权所有"
CONTACT_PHONE_TEXT="18127059682（微信同号）"
CONTACT_QR_SRC="/static/contactQRCode.jpg"
PRICE_FALLBACK_TITLE="花花旅拍价目表"

API_BASE_URL="https://your.api.com"
APP_CODE="huahua"
MINI_APP_NAME="花花旅拍"

RESIDUAL_SEARCH_REGEX="wxb19ad7426dfb8bd4|lanmei66|18068842642"
```

### Profile 应用映射

| Profile 字段 | 写入位置 |
| --- | --- |
| `PACKAGE_NAME` | `package.json` → `name` |
| `MP_WEIXIN_APPID` | `project.config.json`、`src/manifest.json` |
| `MANIFEST_NAME` / `DESCRIPTION` | `src/manifest.json` |
| `NAVIGATION_TITLE` | `src/pages.json` → `globalStyle.navigationBarTitleText` |
| `API_BASE_URL` | `src/utils/config.uts` |
| `APP_CODE` | `src/utils/http.uts` → `X-App-Code`（空则移除） |
| `MINI_APP_NAME` | `src/utils/legal.uts` |
| `CONTACT_QR_SRC` / `CONTACT_PHONE_TEXT` / `COPYRIGHT_TEXT` | `pages/index/`、`pages/priceHomePage/` 等页面 |
| `PRICE_FALLBACK_TITLE` | `src/pages/priceList/index.uvue` |
| `profiles/<key>/static/*` | 复制到目标仓库 `src/static/` |

---

## 构建与发布脚本

### npm scripts

| 命令 | 说明 |
| --- | --- |
| `npm run dev:mp-weixin` | 开发模式编译 → `dist/dev/mp-weixin` |
| `npm run build:mp-weixin` | 生产模式编译 → `dist/build/mp-weixin` |
| `npm run profile:create` | 调用 `create-profile.sh` |
| `npm run profile:apply` | 调用 `apply-profile.sh` |
| `npm run profile:build` | 调用 `build-miniapp.sh` |
| `npm run profile:release` | 调用 `release-miniapp.sh` |
| `npm run profile:new` | 调用 `new-miniapp-project.sh` |
| `npm run profile:verify` | 调用 `verify-miniapp.sh` |

### Shell 脚本

| 脚本 | 用途 | 关键参数 |
| --- | --- | --- |
| `scripts/create-profile.sh` | 基于模板生成一个新 profile | `<project-key>` / `--force` |
| `scripts/apply-profile.sh` | 把 profile 应用到目标仓库 | `<profile-key>` / `--repo` / `--profile-file` |
| `scripts/sync-template.sh` | 把模板源码同步到目标仓库（覆盖 `pages/` 等公共代码） | `--repo` |
| `scripts/build-miniapp.sh` | 一键同步 + 应用 + 编译 + 校验 | `<profile-key>` / `--repo` / `--sync-template` / `--install` / `--skip-apply` / `--skip-verify` |
| `scripts/verify-miniapp.sh` | 校验构建产物 | `<profile-key>` / `--repo` / `--output-dir` |
| `scripts/release-miniapp.sh` | 发布前构建（build 的包装，输出导入路径提示） | 同 `build-miniapp.sh` |
| `scripts/new-miniapp-project.sh` | 孵化一个全新小程序项目目录 | `<project-key> <target-dir>` / `--force` / `--install` |

所有脚本都支持 `--help`。

### 同步范围（`sync-template.sh`）

| 会被覆盖 | 会被保留 |
| --- | --- |
| `src/App.uvue`、`src/main.uts`、`src/index.html`、`src/env.d.ts`、`src/pages/`、`src/utils/` | `package.json`、`project.config.json`、`src/manifest.json`、`src/pages.json`、`src/static/`、`profiles/` |

### 产物校验项（`verify-miniapp.sh`）

- ✅ 产物 `project.config.json.appid` 与 `MP_WEIXIN_APPID` 一致
- ✅ 产物 `app.json.window.navigationBarTitleText` 与 `NAVIGATION_TITLE` 一致
- ✅ 本地 `CONTACT_QR_SRC`（若以 `/static/` 开头）存在于产物中
- ✅ `X-App-Code` 已正确写入 `src/utils/http.uts` 与产物 `utils/http.js`
- ✅ `MINI_APP_NAME` 正确写入 `legal.uts`，`pages/policies/user|privacy` 产物存在
- ✅ 可选：扫描 `RESIDUAL_SEARCH_REGEX` 匹配的残留字符串

---

## 常见工作流

### 场景 1 — 本地开发模板

```bash
cd /path/to/blueberry
npm install
npm run dev:mp-weixin
# 微信开发者工具导入 dist/dev/mp-weixin
```

### 场景 2 — 孵化一个全新小程序项目

```bash
cd /path/to/blueberry

# 一键创建 new-shop 项目 + 初始化 profile + git + 安装依赖
scripts/new-miniapp-project.sh new-shop /path/to/new-shop --install

# 编辑 profile
vim /path/to/new-shop/profiles/new-shop/project.env

# 在新项目中执行构建
cd /path/to/new-shop
scripts/build-miniapp.sh new-shop
```

### 场景 3 — 为已有目标仓库应用最新模板

```bash
cd /path/to/blueberry

# 同步模板代码 + 应用配置 + 编译 + 校验
scripts/build-miniapp.sh huahua --repo /path/to/huahua --sync-template
```

> 未加 `--sync-template` 时仅应用配置字段，不会升级页面/工具层代码。

### 场景 4 — 只改 profile 配置，不升级模板

```bash
cd /path/to/blueberry
scripts/apply-profile.sh huahua --repo /path/to/huahua
# 或：scripts/build-miniapp.sh huahua --repo /path/to/huahua
```

### 场景 5 — 为新项目从零创建 profile

```bash
scripts/create-profile.sh my-new-shop
# 编辑 profiles/my-new-shop/project.env
# 若有替换素材，放入 profiles/my-new-shop/static/
```

---

## 发布流程

以花花旅拍为例：

```bash
# 1. 在模板仓库执行（会提示「不自动上传」）
cd /path/to/blueberry
scripts/release-miniapp.sh huahua \
  --repo /path/to/huahua \
  --sync-template

# 2. 校验通过后，打开微信开发者工具，导入：
#    /path/to/huahua/dist/build/mp-weixin

# 3. 在开发者工具里点击「上传」→ 进入微信公众平台提审
```

需要人工维护的素材（放在目标仓库的 `src/static/` 或 profile 的 `static/`）：

```text
contactQRCode.jpg         # 联系二维码
service.png               # 服务说明图
demo1.png / demo2.png     # 兜底图
price.png / honghe-price.png  # 本地价目表兜底
homepage*.png / pricelist*.png / mine*.png  # tabBar 图标
```

### 模板仓库自身发布流程（GitHub）

```bash
# 首次关联远程仓库
git remote add origin https://github.com/linziyanleo/blueberry.git

# 推送当前分支
git push -u origin <your-branch>

# 日常迭代
git add .
git commit -m "feat: xxx"
git push
```

---

## FAQ

**Q：为什么 `project.config.json` 中的 AppID 和 Profile 中不一致时会失效？**
A：微信开发者工具的 AppID 继承机制有前提条件（`miniprogramRoot`、`setting.urlCheck` 等）。本模板通过 `apply-profile` 直接写入产物里的 `project.config.json` 和 `src/manifest.json` 双处 AppID，构建后再由 `verify-miniapp.sh` 校验一致性，避免继承失效。

**Q：目标仓库老代码缺少协议页面，`verify-miniapp.sh` 校验失败怎么办？**
A：加 `--sync-template` 执行一次 `build-miniapp.sh`，会把模板的 `pages/policies/*` 同步进去。

**Q：能否只保留 Profile 文件而不维护完整目标仓库？**
A：可以。只要目标仓库具备基本的 `src/` 和 `package.json`，模板通过 `sync-template` + `apply-profile` 就能覆盖为最新版本。

**Q：如何在 blueBerry 本仓库内预览 blueberry profile 的效果？**
A：直接 `npm run dev:mp-weixin`，默认源码即对应 blueberry profile。

---

## License

MIT © linziyanleo
