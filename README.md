# blueBerry 小程序模板发布手册

本仓库是 UniApp X 微信小程序模板。后续如果要发布多个小程序，不需要为每次改图文都从零搭项目；推荐把 `blueBerry` 当作模板源，用 `profiles/<项目>/project.env` 管理项目私有配置，再用 `scripts/` 下的脚本同步、配置、构建和校验目标小程序。

核心入口：

```bash
# 生成一个新项目配置
scripts/create-profile.sh <project-key>

# 把 profile 应用到当前或其他 repo
scripts/apply-profile.sh <project-key> --repo /path/to/target-repo

# 同步 blueBerry 模板代码、应用配置、构建并校验
scripts/build-miniapp.sh <project-key> --repo /path/to/target-repo --sync-template

# 新建一个小程序项目目录
scripts/new-miniapp-project.sh <project-key> /path/to/new-repo
```

## 目录职责

```text
blueBerry/
├── src/                         # 当前唯一源码入口
│   ├── manifest.json            # UniApp 应用信息与微信 AppID
│   ├── pages.json               # 页面、导航栏标题、tabBar 文案/图标
│   ├── App.uvue                 # 全局样式与应用入口
│   ├── pages/                   # 页面代码
│   ├── static/                  # 小程序静态资源
│   └── utils/
│       ├── config.uts           # API baseURL
│       ├── http.uts             # 请求头、可选 appCode/X-App-Code
│       └── legal.uts            # 用户协议/隐私政策名称与跳转
├── project.config.json          # 微信开发者工具项目配置/AppID
├── profiles/                    # 不同小程序的 profile 配置
├── scripts/                     # 一键同步/配置/构建/校验脚本
├── package.json                 # npm 包名与构建命令
└── dist/build/mp-weixin/        # 生产构建输出，微信开发者工具导入这个目录
```

旧的根目录 `pages/`、`static/`、`utils/`、`manifest.json`、`pages.json` 不再作为源码入口使用。以 `src/` 为准。

## Profile 配置文件

每个小程序一个 profile：

```text
profiles/
└── huahua/
    ├── project.env
    └── static/
        ├── contactQRCode.jpg
        └── service.png
```

生成配置：

```bash
scripts/create-profile.sh huahua
```

主要修改 `profiles/huahua/project.env`：

```bash
PROJECT_KEY="huahua"
PACKAGE_NAME="huahua"
MANIFEST_NAME="huahua"
DESCRIPTION="花花旅拍"
MP_WEIXIN_APPID="wxd3933d928ffed10d"

NAVIGATION_TITLE="花花旅拍"
COPYRIGHT_TEXT="Copyright 2025 花花旅拍 - 版权所有"
CONTACT_PHONE_TEXT="18127059682（微信同号）"
CONTACT_QR_SRC="/static/contactQRCode.jpg"
PRICE_FALLBACK_TITLE="花花旅拍价目表"

API_BASE_URL="https://crazyma99.xyz"
APP_CODE="huahua"

USER_AGREEMENT_NAME="《花花旅拍 SKILL 用户协议》"
PRIVACY_POLICY_NAME="《花花旅拍 SKILL 隐私政策》"
USER_AGREEMENT_URL=""
```

如果需要替换本地素材，把文件放到 `profiles/<project-key>/static/`。执行 apply/build 时会复制到目标 repo 的 `src/static/`。

## 构建已有目标仓库

以 `/Users/leolin/Desktop/huahua` 为例：

1. 确认目标仓库在自己的 refactor/feature 分支，避免直接影响生产分支。

   ```bash
   cd /Users/leolin/Desktop/huahua
   git branch --show-current
   git status --short
   ```

2. 在 `blueBerry` 中创建/确认目标 profile。

   ```bash
   cd /Users/leolin/Desktop/blueBerry
   scripts/create-profile.sh huahua
   # 然后编辑 profiles/huahua/project.env
   ```

3. 一键同步模板代码、应用 huahua 配置、构建并校验。

   ```bash
   scripts/build-miniapp.sh huahua --repo /Users/leolin/Desktop/huahua --sync-template
   ```

   如果目标 repo 已经同步过最新模板，只想重新套配置并构建：

   ```bash
   scripts/build-miniapp.sh huahua --repo /Users/leolin/Desktop/huahua
   ```

4. 用微信开发者工具导入目标仓库输出目录：

   ```text
   /Users/leolin/Desktop/huahua/dist/build/mp-weixin
   ```

   每个目标小程序只需要在微信开发者工具中导入一次固定输出目录。后续重新构建后，在开发者工具里重新预览/上传即可。

## 新建一个小程序项目

假设新项目叫 `new-shop`，目录为 `/Users/leolin/Desktop/new-shop`。

1. 一键创建项目目录和默认 profile。

   ```bash
   cd /Users/leolin/Desktop/blueBerry
   scripts/new-miniapp-project.sh new-shop /Users/leolin/Desktop/new-shop --install
   ```

2. 修改新项目 profile。

   ```bash
   cd /Users/leolin/Desktop/new-shop
   open profiles/new-shop/project.env
   ```

3. 构建新项目。

   ```bash
   scripts/build-miniapp.sh new-shop
   ```

4. 微信开发者工具导入：

   ```text
   /Users/leolin/Desktop/new-shop/dist/build/mp-weixin
   ```

## 脚本说明

| 脚本 | 用途 |
| --- | --- |
| `scripts/create-profile.sh` | 从默认模板生成 `profiles/<project-key>/project.env` |
| `scripts/apply-profile.sh` | 把 profile 写入目标 repo 的配置文件和页面文案 |
| `scripts/sync-template.sh` | 把 `blueBerry` 的通用源码同步到目标 repo |
| `scripts/build-miniapp.sh` | apply + `npm run build:mp-weixin` + verify |
| `scripts/release-miniapp.sh` | 发布准备脚本，当前等价于构建并输出微信开发者工具导入目录 |
| `scripts/verify-miniapp.sh` | 校验构建产物 AppID、标题、静态资源和残留字符串 |
| `scripts/new-miniapp-project.sh` | 从模板复制出一个新小程序目录并生成 profile |

常用命令：

```bash
# 只应用配置，不构建
scripts/apply-profile.sh huahua --repo /Users/leolin/Desktop/huahua

# 同步模板源码
scripts/sync-template.sh --repo /Users/leolin/Desktop/huahua

# 同步 + 配置 + 构建 + 校验
scripts/build-miniapp.sh huahua --repo /Users/leolin/Desktop/huahua --sync-template

# 已同步时，只配置 + 构建 + 校验
scripts/build-miniapp.sh huahua --repo /Users/leolin/Desktop/huahua
```

## 配置修改清单

脚本会根据 profile 写入这些位置：

| Profile 字段 | 写入位置 |
| --- | --- |
| `PACKAGE_NAME` | `package.json` 的 `name` |
| `MP_WEIXIN_APPID` | `project.config.json`、`src/manifest.json` |
| `MANIFEST_NAME`、`DESCRIPTION` | `src/manifest.json` |
| `NAVIGATION_TITLE` | `src/pages.json` 的 `globalStyle.navigationBarTitleText` |
| `API_BASE_URL` | `src/utils/config.uts` |
| `APP_CODE` | `src/utils/http.uts` 的 `X-App-Code`，为空时移除 |
| `USER_AGREEMENT_NAME`、`PRIVACY_POLICY_NAME`、`USER_AGREEMENT_URL` | `src/utils/legal.uts` |
| `CONTACT_QR_SRC`、`CONTACT_PHONE_TEXT`、`COPYRIGHT_TEXT` | 首页、价目表首页等页面 |
| `PRICE_FALLBACK_TITLE` | `src/pages/priceList/index.uvue` |
| `profiles/<project-key>/static/*` | 复制到目标 repo 的 `src/static/` |

仍需人工替换的素材：

```text
contactQRCode.jpg      # 联系二维码
service.png            # 服务说明图
demo1.png/demo2.png    # 无接口数据时的兜底图
price.png              # 本地价目表兜底图
honghe-price.png       # 本地价目表兜底图
homepage*.png          # tabBar 首页图标
pricelist*.png         # tabBar 价目表图标
mine*.png              # tabBar 我的图标
```

## 发布前检查

推荐直接执行：

```bash
scripts/release-miniapp.sh huahua --repo /Users/leolin/Desktop/huahua --sync-template
```

脚本会自动校验 AppID 和标题。如果 profile 中设置了 `RESIDUAL_SEARCH_REGEX`，还会扫描模板残留字符串。

## 和 huahua 的已验证模式

`huahua` 已按这个模式验证过：

```text
目标仓库：/Users/leolin/Desktop/huahua
构建命令：npm run build:mp-weixin
输出目录：/Users/leolin/Desktop/huahua/dist/build/mp-weixin
AppID：wxd3933d928ffed10d
项目标识：X-App-Code: huahua
```

现在可以用：

```bash
scripts/build-miniapp.sh huahua --repo /Users/leolin/Desktop/huahua --sync-template
```

构建时会保留 huahua 的项目私有配置，并把 `blueBerry` 的通用页面和登录授权逻辑同步到目标 repo。
