---
specanchor:
  level: global
  type: profile-management
  version: "1.0.0"
  last_updated: "2026-05-11"
---

# Profile Management Spec

> 管理 blueBerry 模板在多个小程序项目（blueberry / huahua / ...）间的差异化配置。核心思想：**源码保持单一模板**，所有项目差异通过 `profiles/<key>/project.env` 注入，构建期才体现。

## Profile 目录结构

```
profiles/
├── <profile-key>/
│   ├── project.env        # 必需：profile 主配置
│   └── static/            # 可选：覆盖 src/static/ 的差异化资源
│       ├── contactQRCode.jpg
│       └── ...
```

现有 profile：

| key        | 说明               |
| ---------- | ------------------ |
| `blueberry`| blueBerry 主项目   |
| `huahua`   | 花花小程序（分项目）|

## project.env 必填键

以下键由 `scripts/lib/apply-profile.mjs` 的 `required` 数组强制校验，缺一不可：

| 键                    | 类型   | 注入位置                                     | 说明                                |
| --------------------- | ------ | -------------------------------------------- | ----------------------------------- |
| `PROJECT_KEY`         | string | -                                            | profile 唯一标识                    |
| `PACKAGE_NAME`        | string | `package.json#name`                          | npm 包名                            |
| `MANIFEST_NAME`       | string | `src/manifest.json#name`                     | 小程序显示名                        |
| `DESCRIPTION`         | string | `src/manifest.json#description`              | 小程序描述                          |
| `MP_WEIXIN_APPID`     | string | `project.config.json#appid`、manifest appid  | 微信 AppID                          |
| `NAVIGATION_TITLE`    | string | `src/pages.json#globalStyle.navigationBarTitleText` | 默认导航栏标题               |
| `COPYRIGHT_TEXT`      | string | 多页面 `Copyright 2025 ...` 文案替换          | 版权文案                            |
| `CONTACT_PHONE_TEXT`  | string | `index`/`priceHomePage` 联系电话             | 联系电话                            |
| `CONTACT_QR_SRC`      | string | `index`/`priceHomePage` 二维码 `src`         | 二维码资源路径（通常 `/static/...`) |
| `PRICE_FALLBACK_TITLE`| string | `priceList` 兜底标题                         | 无 shopName 时的价目表标题          |
| `API_BASE_URL`        | string | `src/utils/config.uts#baseURL`               | 接口域名                            |
| `MINI_APP_NAME`       | string | `src/utils/legal.uts#MINI_APP_NAME`          | 小程序品牌名（协议页使用）          |

## 可选键

| 键                      | 类型   | 注入位置                          | 说明                                      |
| ----------------------- | ------ | --------------------------------- | ----------------------------------------- |
| `APP_CODE`              | string | `src/utils/http.uts` 请求头       | `X-App-Code` 头值，用于后端区分项目       |
| `RESIDUAL_SEARCH_REGEX` | regex  | `scripts/verify-miniapp.sh`       | 构建后残留模板字符串检测正则              |

## 脚本职责矩阵

| 脚本                          | npm script         | 职责                                                          |
| ----------------------------- | ------------------ | ------------------------------------------------------------- |
| `scripts/create-profile.sh`   | `profile:create`   | 基于 `scripts/templates/profile.env.example` 创建新 profile   |
| `scripts/apply-profile.sh`    | `profile:apply`    | 加载 `project.env` 并调用 `lib/apply-profile.mjs` 注入源码    |
| `scripts/build-miniapp.sh`    | `profile:build`    | apply + `npm install`(按需) + `build:mp-weixin` + verify 一条龙 |
| `scripts/release-miniapp.sh`  | `profile:release`  | 发布流程封装                                                  |
| `scripts/verify-miniapp.sh`   | `profile:verify`   | 校验 `dist/build/mp-weixin` 产物是否与 profile 一致           |
| `scripts/sync-template.sh`    | -                  | 把主模板源码同步到另一个目标仓库                              |
| `scripts/new-miniapp-project.sh` | `profile:new`   | 初始化全新的小程序项目目录                                    |
| `scripts/lib/apply-profile.mjs`  | -                 | Node 实现的注入核心；所有具体替换逻辑都在此                   |

## 注入合同（apply-profile.mjs）

`scripts/lib/apply-profile.mjs` 的替换规则：

1. **`package.json`**：替换 `"name"`
2. **`project.config.json`**：替换 `"appid"`
3. **`src/manifest.json`**：替换 `"name"`、`"description"`、`"mp-weixin"."appid"`
4. **`src/pages.json`**：
   - 替换 `globalStyle.navigationBarTitleText`
   - **确保** `pages/policies/user` 与 `pages/policies/privacy` 路由存在（缺失则插入）
5. **`src/utils/config.uts`**：替换 `baseURL` 字符串
6. **`src/utils/http.uts`**：重写 `finalHeader` 块，按 `APP_CODE` 决定是否插入 `X-App-Code` 头
7. **`src/utils/legal.uts`**：替换 `MINI_APP_NAME` 字符串
8. **页面文案**：`index/index.uvue` / `priceHomePage/index.uvue` 的二维码 `src`、联系电话、版权
9. **`priceList/index.uvue`**：版权 + 兜底标题
10. **`demoDetail` / `targetPhotoDetail` / `favorites` / `index.uvue`**：版权文案统一替换

> **关键约束**：所有替换基于正则 `pattern` 精确匹配，`pattern not found` 立即抛错。源码结构变更若破坏匹配正则，必须同步更新 `apply-profile.mjs`。

## 多项目隔离边界

1. **源码单一模板**：`src/` 只有一份；差异化逻辑**禁止**用 `if (PROJECT_KEY === 'huahua')` 这类分支
2. **profile 的唯一真相源**：每个 profile 的全部差异体现在 `profiles/<key>/project.env` + `profiles/<key>/static/`
3. **静态资源覆盖**：`apply-profile.sh` 在 node 脚本后执行 `cp -R profiles/<key>/static/. src/static/`，不删除原有资源
4. **构建产物隔离**：`dist/build/mp-weixin` 单目录输出；多项目切换需重新 `profile:apply` 再 build，或在不同 `TARGET_REPO` 下并行

## 校验合同（verify-miniapp.sh）

构建产物校验项：

1. `dist/build/mp-weixin/project.config.json` 的 `appid` 与 `MP_WEIXIN_APPID` 一致
2. `dist/build/mp-weixin/app.json` 的 `window.navigationBarTitleText` 与 `NAVIGATION_TITLE` 一致
3. `CONTACT_QR_SRC` 指向 `/static/` 时，产物 `static/` 下对应文件存在
4. `APP_CODE` 非空时，源码与产物中都能找到 `X-App-Code: <APP_CODE>`
5. `MINI_APP_NAME` 非空时，`legal.uts` 源码与产物中都能找到该字符串；`policies/user.js`、`policies/privacy.js` 产物文件存在
6. `RESIDUAL_SEARCH_REGEX` 设置时，`src/`、配置文件、产物目录中不得再出现该正则匹配

## 新增差异化字段流程

1. 在 `profiles/<key>/project.env` 中增加键
2. 在 `scripts/templates/profile.env.example` 增加示例
3. 在 `scripts/lib/apply-profile.mjs`：
   - 若必填 → 加入 `required` 数组
   - 实现 `updateXxx()` 函数并在底部调用
4. 必要时在 `scripts/verify-miniapp.sh` 增加校验
5. 更新本 Spec 的「project.env 必填键」表
