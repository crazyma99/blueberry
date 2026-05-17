---
specanchor:
  level: task
  task_name: "消除重复代码重构（dedup-refactor）"
  author: "@leolin"
  created: "2026-05-15"
  status: "in_progress"
  last_change: "Plan Approved，进入 Execute 阶段（Phase 1 工具函数提取）"
  related_modules:
    - ".specanchor/modules/src-pages-index.spec.md"
    - ".specanchor/modules/src-pages-album.spec.md"
    - ".specanchor/modules/src-pages-mine.spec.md"
    - ".specanchor/modules/src-pages-favorites.spec.md"
    - ".specanchor/modules/src-pages-price.spec.md"
    - ".specanchor/modules/src-utils.spec.md"
    - ".specanchor/modules/src-utils-api.spec.md"
    - ".specanchor/modules/src-scripts.spec.md"
    - ".specanchor/modules/src-pages-redesign.spec.md"
  related_global:
    - ".specanchor/global/architecture.spec.md"
    - ".specanchor/global/coding-standards.spec.md"
    - ".specanchor/global/profile-management.spec.md"
    - ".specanchor/global/wechat-auth-compliance.spec.md"
  writing_protocol: "refactor"
  refactor_phase: "EXECUTE"
  branch: "refactor/dedup-cross-module"
---

# Refactor: 消除重复代码重构（dedup-refactor）

> ⚠️ **核心约束：外部行为必须保持不变**
> 所有页面的登录三步骤、点赞、收藏、瀑布流加载、tabBar 切换、profile 注入产物字符串、合规弹窗触发链路在重构后必须与重构前完全一致。

## 0. Refactor Motivation

- **动机**：技术债清理 + 可维护性 + 与 `src-pages-redesign.spec.md` 改版方向（组件化）对齐 + 降低 profile 注入面积
- **触发原因**：
  1. 全项目扫描识别出约 **1360 行重复代码**，约占源码量的 25-30%
  2. 登录弹窗在 4 个页面同步维护，单点改动需修改 4 处，已造成行为漂移风险
  3. `scripts/lib/apply-profile.mjs` 为同一 `Copyright 2025 ...` 文案在 6 个页面分别维护正则匹配，pattern 任一失配即中断构建（`profile-management.spec.md` 关键约束）
  4. `UserInfo` 接口在 `auth.uts` / `api.uts` / `mine/index.uvue` 三处独立声明，类型一致性靠人工同步
  5. `formatCount`（数字千分位）和 `preloadImage`（图片预加载）作为基础工具函数没有归位 `src/utils/`
  6. 客片瀑布流卡片样式与逻辑在 `demoDetail` / `favorites` 重复，未抽组件
  7. 改版规划已明确朝组件化演进，本次重构是改版前置基础

## 1. Measure

### 1.1 当前代码指标

#### 重复代码总览

| # | 重复模式 | 出现位置 | 估算行数 | 严重度 |
|---|---------|---------|---------|-------|
| 1 | 登录弹窗（template + 11 methods + 7 data + style） | `pages/index` `pages/demoDetail` `pages/targetPhotoDetail` `pages/mine` | ~600 | 高 |
| 2 | 客片瀑布流卡片（`.photoItem` `.photo` `.mask` `.desc` `.photoName` `.collect` `.heart` + 点赞逻辑） | `pages/demoDetail` `pages/favorites` | ~280 | 高 |
| 3 | 联系我们二维码区域（template + style） | `pages/index` `pages/priceHomePage` | ~80 | 中 |
| 4 | 自定义导航栏（template + style + safe-area 处理） | `pages/demoDetail` `pages/favorites` | ~60 | 中 |
| 5 | `preloadImage` / `preloadImages` 工具方法 | `pages/demoDetail` L291-307；`pages/targetPhotoDetail` L139-154 | ~32 | 中 |
| 6 | `UserInfo` 接口定义 | `utils/auth.uts` L7-13；`utils/api.uts` L5-11；`pages/mine/index.uvue` L146-152 | ~21 | 中 |
| 7 | `formatCount`（数字格式化） | `pages/demoDetail` L569-574；`pages/targetPhotoDetail` L356-362；`pages/favorites` L239-244 | ~18 | 低 |
| 8 | Copyright 文案（含 profile 注入正则配对） | `pages/index` `pages/priceHomePage` `pages/priceList` `pages/demoDetail` `pages/targetPhotoDetail` `pages/mine` `pages/favorites` | ~14（每页 2 行） | 中 |

合计：约 **1105 行重复代码**（不含同构样式约 250 行折算）

#### 耦合度

- **登录流程改动半径**：4 个文件（mine/index/demoDetail/targetPhotoDetail）
- **Copyright 改动半径**：6 个 `.uvue` 文件 + 1 个 `apply-profile.mjs`（包含 6 套 pattern）
- **客片卡片样式改动半径**：2 个 `.uvue` 文件
- **类型签名漂移风险**：UserInfo 三份独立定义，新增字段需同步 3 处

#### 代码气味

- 复制粘贴（Duplicate Code）
- 散弹式修改（Shotgun Surgery）：profile 注入侧
- 类型定义重复（Duplicated Type Declaration）
- 工具函数定义在页面内（Misplaced Helper）

### 1.2 测试覆盖现状

- **已有自动化测试**：无单元测试 / 无 e2e
- **行为基准**：
  - `npm run profile:verify`（`scripts/verify-miniapp.sh`）—— 校验构建产物字符串与 profile 一致
  - 微信开发者工具人工预览 —— 全链路冒烟
  - `apply-profile.mjs` 的 `pattern not found` 严格校验 —— 任何源码漂移即抛错
- **可作为行为基准的检查点**：
  1. profile 双切换：`apply-profile.sh blueberry` ↔ `apply-profile.sh huahua`，两次都必须 `profile:verify` 通过
  2. 登录三步骤：用户协议勾选 → getPhoneNumber → wxLogin → wxBindPhone → 头像昵称授权弹窗
  3. 客片点赞 + 收藏切换：列表/详情/收藏页三处一致
  4. 瀑布流分页加载、下拉刷新、空状态
  5. tabBar 切换、自定义导航栏 safe-area
  6. 协议页跳转（`legal.uts` 注入的 MINI_APP_NAME 显示）

## 2. Identify

### 2.1 重构目标

| 目标代码 | 问题 | 预期改善 |
|---------|------|---------|
| 4 页登录弹窗 | 散弹式修改 | 单一 mixin + 组件，改动半径 1 |
| 客片瀑布流卡片 ×2 | 复制粘贴 | `<PhotoCard>` 组件复用 |
| 自定义导航栏 ×2 | 复制粘贴 | `<CustomNavBar>` 组件复用 |
| 联系我们二维码 ×2 | 复制粘贴 + profile 注入面积 | `<ContactQR>` 组件，二维码与文案集中接收 props |
| `formatCount` ×3 | 工具函数错位 | 归位 `src/utils/format.uts` |
| `preloadImage` ×2 | 工具函数错位 | 归位 `src/utils/imageLoader.uts` |
| `UserInfo` 接口 ×3 | 类型漂移 | 单一真相源 `auth.uts`，其余 import |
| Copyright ×6 + 6 套 profile pattern | 散弹式修改 + profile 脆弱 | `<AppFooter>` 组件单点 + `apply-profile.mjs` 单 pattern |

### 2.2 重构策略

#### 重构类型

- **提取函数**：`formatCount` / `preloadImage` / `preloadImages` → `src/utils/`
- **提取 Mixin**：登录弹窗的 data + methods + onShow 片段 → `src/mixins/loginPopup.uts`
- **提取组件**：`LoginPopup` / `PhotoCard` / `CustomNavBar` / `AppFooter` / `ContactQR` → `src/components/`
- **类型集中**：`UserInfo` → 仅在 `auth.uts` 声明并 export
- **SCSS 变量化**：`src/uni.scss` 增加品牌色 / 间距 / 字号变量；为后续主题提供基础

#### 重构范围

**新增**：

- `src/components/LoginPopup.uvue`
- `src/components/PhotoCard.uvue`
- `src/components/CustomNavBar.uvue`
- `src/components/AppFooter.uvue`
- `src/components/ContactQR.uvue`
- `src/mixins/loginPopup.uts`
- `src/utils/format.uts`
- `src/utils/imageLoader.uts`

**修改**：

- `src/pages/index/index.uvue`（登录弹窗、Copyright、ContactQR）
- `src/pages/priceHomePage/index.uvue`（Copyright、ContactQR）
- `src/pages/priceList/index.uvue`（Copyright）
- `src/pages/demoDetail/index.uvue`（登录弹窗、PhotoCard、CustomNavBar、formatCount、preloadImage、Copyright）
- `src/pages/targetPhotoDetail/index.uvue`（登录弹窗、formatCount、preloadImage、Copyright）
- `src/pages/mine/index.uvue`（登录弹窗、UserInfo import、Copyright）
- `src/pages/favorites/index.uvue`（PhotoCard、CustomNavBar、formatCount、Copyright）
- `src/utils/api.uts`（移除本地 UserInfo，import）
- `src/uni.scss`（新增 SCSS 变量）
- `scripts/lib/apply-profile.mjs`（Copyright 注入收敛为单 pattern；新增 ContactQR 组件 props 注入路径）

**不动**：

- `src/utils/http.uts` / `config.uts` / `legal.uts` 的导出 API 与注入合同
- `src/utils/auth.uts` 的所有方法签名（仅 export 现有的 `UserInfo` 类型）
- `src/pages.json` 路由结构（不新增不删除路由）
- `src/manifest.json` / `package.json` / `project.config.json` 的 profile 注入键
- 微信登录三步骤协议、合规弹窗触发条件、`mergeUserInfo` 合并语义
- 401 自动登出链路、X-App-Code 头注入

#### 风险控制

- 每个 Phase 独立 commit，可单独回滚
- 引入新组件时旧实现先保留一个 Phase，下一个 Phase 才删除（除 Phase 1 工具函数零风险）
- 每 Phase 后必须通过：`profile:apply blueberry` + `profile:apply huahua` + `profile:verify` + 微信开发者工具冒烟

## 3. Refactor Plan

### 3.1 Refactor Checklist

> 共 4 个 Phase，每 Phase 内的步骤需顺序执行；Phase 之间必须先完成行为验证再推进。

#### Phase 1 — 工具函数提取（低风险，预计 0.5 天）

- [ ] 1.1 新建 `src/utils/format.uts`，导出 `formatCount(count: number): string`
- [ ] 1.2 新建 `src/utils/imageLoader.uts`，导出 `preloadImage(url: string): Promise<void>` 和 `preloadImages(urls: string[]): Promise<void>`
- [ ] 1.3 `src/pages/demoDetail/index.uvue` 改为 `import { formatCount } from '@/utils/format'`、`import { preloadImage, preloadImages } from '@/utils/imageLoader'`，删除 L291-307 与 L569-574 本地实现
- [ ] 1.4 `src/pages/targetPhotoDetail/index.uvue` 同步替换，删除 L139-154 与 L356-362 本地实现
- [ ] 1.5 `src/pages/favorites/index.uvue` 替换 formatCount，删除 L239-244 本地实现
- [ ] 1.6 行为验证：列表/详情/收藏页点赞数显示与图片加载正常
- [ ] 1.7 commit: `refactor(utils): extract formatCount and preloadImage helpers`

#### Phase 2 — 类型统一（低风险，预计 0.25 天）

- [ ] 2.1 `src/utils/auth.uts` 将本地 `interface UserInfo` 改为 `export type UserInfo = { ... }`（保持现有字段不变）
- [ ] 2.2 `src/utils/api.uts` 删除 L5-11 本地 `UserInfo`，改 `import type { UserInfo } from './auth'`
- [ ] 2.3 `src/pages/mine/index.uvue` 删除 L146-152 本地 `UserInfo`，改 `import type { UserInfo } from '@/utils/auth'`
- [ ] 2.4 行为验证：`tsc --noEmit` 通过；mine 页用户信息渲染正常
- [ ] 2.5 commit: `refactor(types): centralize UserInfo type in auth.uts`

#### Phase 3 — 登录弹窗 Mixin 化（中风险，预计 1.5 天）

- [ ] 3.1 新建 `src/mixins/loginPopup.uts`，提取 4 页共有的：
  - data: `showLoginPopup` `loginAgreementChecked` `showProfilePopup` `profileAvatarUrl` `profileNickname` `phoneCodeCache` `wxCodeCache`
  - methods: `openLoginPopup` `closeLoginPopup` `openProfilePopup` `closeProfilePopup` `onLoginAgreementToggle` `showLoginAgreementToast` `onChooseAvatar` `onGetPhoneNumber` `submitProfile` `goUserAgreement` `goPrivacyPolicy`
  - lifecycle: `onShow` 中关于登录态刷新的片段（与原页面 onShow 其它逻辑解耦）
- [ ] 3.2 新建 `src/components/LoginPopup.uvue`：
  - template：登录弹窗 + 头像昵称授权弹窗
  - props：`visible: boolean`、`agreementChecked: boolean`
  - emits：`update:visible` / `getphonenumber` / `chooseavatar` / `agreement-toggle`
  - style：来自现有 `App.uvue` 已部分公共化的样式 + 4 页内的弹窗样式合并
- [ ] 3.3 `src/pages/mine/index.uvue` 引入 mixin + `<LoginPopup>` 组件，移除本地实现，**保留** mine 页特有的 `confirmLogout` 等逻辑
- [ ] 3.4 行为验证（mine 页全链路）：未登录态展示 → 勾选协议 → getPhoneNumber → wxLogin → wxBindPhone → 头像昵称授权弹窗 → 退出登录
- [ ] 3.5 `src/pages/index/index.uvue` 引入 mixin + 组件，移除本地实现
- [ ] 3.6 `src/pages/demoDetail/index.uvue` 引入 mixin + 组件，移除本地实现
- [ ] 3.7 `src/pages/targetPhotoDetail/index.uvue` 引入 mixin + 组件，移除本地实现
- [ ] 3.8 行为验证（4 页交叉）：分别在 4 个页面触发未登录交互（如点赞），登录弹窗弹出 / 关闭 / 完成登录链路一致
- [ ] 3.9 行为验证（profile 注入）：`profile:apply blueberry` 与 `profile:apply huahua` 双方向均通过，登录弹窗内的 MINI_APP_NAME / 协议跳转链接正确
- [ ] 3.10 commit: `refactor(auth): extract login popup into mixin and shared component`

#### Phase 4 — 组件化 + SCSS 变量化（高风险/高收益，预计 2 天）

- [ ] 4.1 新建 `src/components/PhotoCard.uvue`：
  - props：`photo: AlbumItem`（参考 album 模块现有类型）、`showCollect: boolean`、`showHeart: boolean`
  - emits：`tap` / `like` / `collect`
  - 内含 `.photo` `.mask` `.desc` `.photoName` `.collect` `.heart` 完整结构
- [ ] 4.2 新建 `src/components/CustomNavBar.uvue`：
  - props：`title: string`、`showBack: boolean`、`bgColor?: string`
  - slot：`#search`（用于 favorites/demoDetail 的搜索栏）
  - safe-area 处理统一
- [ ] 4.3 新建 `src/components/AppFooter.uvue`：
  - props：`copyrightText: string`（默认值 `'Copyright 2025 blueBerry'`，由 profile 注入）
  - 单一 Copyright 显示位
- [ ] 4.4 新建 `src/components/ContactQR.uvue`：
  - props：`phoneText: string`、`qrSrc: string`（profile 注入入口）
- [ ] 4.5 `src/pages/demoDetail/index.uvue` 替换瀑布流为 `<PhotoCard>` + 自定义导航栏为 `<CustomNavBar>`
- [ ] 4.6 `src/pages/favorites/index.uvue` 替换瀑布流为 `<PhotoCard>` + 自定义导航栏为 `<CustomNavBar>`
- [ ] 4.7 `src/pages/index/index.uvue` 与 `src/pages/priceHomePage/index.uvue` 替换为 `<ContactQR>`
- [ ] 4.8 7 个页面（index / priceHomePage / priceList / demoDetail / targetPhotoDetail / mine / favorites）替换底部 Copyright 为 `<AppFooter>`
- [ ] 4.9 `src/uni.scss` 新增 SCSS 变量（不破坏现有 uni-app 默认变量）：

  ```scss
  $brand-primary: #F3D9AC;
  $brand-bg-dark: #000;
  $spacing-xs: 8rpx;  $spacing-sm: 16rpx;  $spacing-md: 24rpx;  $spacing-lg: 32rpx;  $spacing-xl: 48rpx;
  $font-xs: 22rpx;  $font-sm: 26rpx;  $font-md: 30rpx;  $font-lg: 36rpx;  $font-xl: 44rpx;
  ```

- [ ] 4.10 修改 `scripts/lib/apply-profile.mjs`：
  - **Copyright 注入收敛**：从原本对 `index/priceHomePage/priceList/demoDetail/targetPhotoDetail/mine/favorites` 的 6+ 套 pattern 收敛为对 `src/components/AppFooter.uvue` 单文件单 pattern（默认值替换）
  - **ContactQR 注入收敛**：从原本对 `index` + `priceHomePage` 的两套 pattern 收敛为对 `src/components/ContactQR.uvue` 单文件单 pattern
  - 同步更新 `profile-management.spec.md` 的「注入合同」表格（Phase 5 文档同步）
- [ ] 4.11 行为验证（双 profile）：
  - `apply-profile.sh blueberry && build:mp-weixin && profile:verify` 通过
  - `apply-profile.sh huahua && build:mp-weixin && profile:verify` 通过
  - 微信开发者工具预览：客片瀑布流（demoDetail / favorites）一致；导航栏 safe-area；Copyright / ContactQR 文案与品牌一致
- [ ] 4.12 commit: `refactor(components): extract PhotoCard / CustomNavBar / AppFooter / ContactQR + scss variables`

#### Phase 5 — 文档同步（低风险，预计 0.25 天）

- [ ] 5.1 更新 `.specanchor/global/profile-management.spec.md` 的「注入合同（apply-profile.mjs）」段落，反映新的单点注入模式
- [ ] 5.2 更新 `.specanchor/modules/src-pages-album.spec.md` / `src-pages-favorites.spec.md` / `src-pages-mine.spec.md` 等，记录已采用的共享组件
- [ ] 5.3 新建 `.specanchor/modules/src-components.spec.md`（首次产生 components 模块）
- [ ] 5.4 新建 `.specanchor/modules/src-mixins.spec.md`（首次产生 mixins 模块）
- [ ] 5.5 运行 `specanchor_index` 刷新 `module-index.md`
- [ ] 5.6 commit: `docs(specanchor): update specs for component extraction`

### 3.2 File Changes

| 文件 | 类型 | 变更说明 |
|------|------|---------|
| `src/utils/format.uts` | 新增 | 导出 `formatCount` |
| `src/utils/imageLoader.uts` | 新增 | 导出 `preloadImage` / `preloadImages` |
| `src/utils/auth.uts` | 修改 | `interface UserInfo` 改为 `export type UserInfo` |
| `src/utils/api.uts` | 修改 | 删除本地 UserInfo，import from auth |
| `src/mixins/loginPopup.uts` | 新增 | 4 页共有登录弹窗逻辑 |
| `src/components/LoginPopup.uvue` | 新增 | 登录弹窗 + 头像昵称授权弹窗 |
| `src/components/PhotoCard.uvue` | 新增 | 客片瀑布流卡片 |
| `src/components/CustomNavBar.uvue` | 新增 | 自定义导航栏（含 safe-area） |
| `src/components/AppFooter.uvue` | 新增 | Copyright 单点 |
| `src/components/ContactQR.uvue` | 新增 | 联系我们二维码 |
| `src/pages/index/index.uvue` | 修改 | 引入 LoginPopup mixin/组件、AppFooter、ContactQR |
| `src/pages/priceHomePage/index.uvue` | 修改 | 引入 ContactQR、AppFooter |
| `src/pages/priceList/index.uvue` | 修改 | 引入 AppFooter |
| `src/pages/demoDetail/index.uvue` | 修改 | 引入 LoginPopup、PhotoCard、CustomNavBar、AppFooter；用 utils 替代本地 formatCount/preloadImage |
| `src/pages/targetPhotoDetail/index.uvue` | 修改 | 引入 LoginPopup、AppFooter；用 utils 替代本地 formatCount/preloadImage |
| `src/pages/mine/index.uvue` | 修改 | 引入 LoginPopup mixin/组件、AppFooter；删除本地 UserInfo |
| `src/pages/favorites/index.uvue` | 修改 | 引入 PhotoCard、CustomNavBar、AppFooter；用 utils 替代本地 formatCount |
| `src/uni.scss` | 修改 | 增加 brand / spacing / font 变量 |
| `scripts/lib/apply-profile.mjs` | 修改 | Copyright 注入由多 pattern 收敛为 AppFooter 单 pattern；ContactQR 同理 |
| `.specanchor/global/profile-management.spec.md` | 修改 | 更新注入合同段落 |
| `.specanchor/modules/src-pages-*.spec.md` | 修改 | 标注采用的共享组件 |
| `.specanchor/modules/src-components.spec.md` | 新增 | 组件层模块规范 |
| `.specanchor/modules/src-mixins.spec.md` | 新增 | Mixins 层模块规范 |

### 3.3 Behavior Preservation Strategy

#### 验证方式

**自动化（每 Phase 后必跑）：**

1. `npm run profile:apply blueberry`
2. `npm run build:mp-weixin`
3. `npm run profile:verify`
4. `npm run profile:apply huahua`
5. `npm run build:mp-weixin`
6. `npm run profile:verify`

**手动冒烟（每 Phase 后必跑）：**

| 检查项 | 路径 | 预期 |
|-------|------|------|
| 未登录访问 mine | mine | 灰底头像 + "点击立即登陆" |
| 协议勾选前点击登录 | mine / login popup | toast「请先同意协议」 |
| 登录三步骤完整链路 | mine | getPhoneNumber → wxLogin → wxBindPhone → 头像昵称弹窗 |
| 已登录头像 / 昵称展示 | mine | 头像 image + 昵称文字 |
| 退出登录 | mine | uni.showModal 二次确认 → toast「已退出登录」 |
| 未登录点赞 / 收藏 | demoDetail / targetPhotoDetail | 弹登录弹窗 |
| 客片瀑布流分页 | demoDetail / favorites | scroll 加载、空状态 |
| 客片详情图片预加载 | targetPhotoDetail | 切换平滑无白屏 |
| 自定义导航栏 safe-area | demoDetail / favorites | 状态栏高度正确，搜索栏显示 |
| 联系我们二维码 | index / priceHomePage | 电话与二维码图片一致（双 profile 切换后） |
| Copyright 文案 | 7 个页面 + 双 profile | 文案与 profile.env 一致 |
| 协议页跳转 | login popup / mine | 跳转到 user / privacy，标题来自 MINI_APP_NAME |

#### 回滚策略

- 每 Phase 单独 commit；任一 Phase 验证失败 → `git revert <phase-commit>` 回到上一个稳态
- Phase 3（登录 mixin）与 Phase 4（组件化）前先打 tag：`refactor-dedup-phase-baseline`
- 引入新组件时**旧实现保留至下一个 Phase 才删除**（Phase 4 中已用此策略）—— 例外：Phase 1 工具函数因为是纯逻辑替换，零风险，当个 Phase 内即删
- profile 注入若失败：`apply-profile.mjs` 修改 commit 单独可回滚，新增组件文件可保留不影响

#### 行为不变红线

- 登录三步骤完全遵循 `wechat-auth-compliance.spec.md` §1（不改步骤顺序、不改 mergeUserInfo 语义、不改协议勾选前置条件）
- profile 注入键的语义不变（仅替换路径目标，键名不变）
- `apply-profile.mjs` 的 `pattern not found` 抛错机制不弱化
- `coding-standards.spec.md` 「响应式拆平」约束不破坏：`userAvatarUrl / userNickname` 仍保持 data 顶层基础类型

## 4. Execute Log

### Phase 1 — 工具函数提取（2026-05-15）

- [x] 1.1 新建 `src/utils/format.uts`，导出 `formatCount(count: number): string`
- [x] 1.2 新建 `src/utils/imageLoader.uts`，导出 `preloadImage` / `preloadImages`
- [x] 1.3 `src/pages/demoDetail/index.uvue` 加 alias import；L292-307 / L569-574 三处本地实现改为 thin wrapper
- [x] 1.4 `src/pages/targetPhotoDetail/index.uvue` 加 alias import；L139-154 / L356-362 改为 thin wrapper
- [x] 1.5 `src/pages/favorites/index.uvue` 加 alias import；L239-244 改为 thin wrapper
- [ ] 1.6 行为验证：**待用户在微信开发者工具预览 demoDetail / targetPhotoDetail / favorites 点赞数显示 + 图片预加载切换平滑**
- [ ] 1.7 commit（由用户验证后手动提交）

**实施决策记录**：

- 采用 alias import + thin wrapper 策略（`import { formatCount as _formatCount }`）不是完全删除页面 method。
- **原因**：页面模板（如 `{{ formatCount(item.likeCount) }}`）及其它 method 内部（如 `this.preloadImage(u)`）均通过 `this` 访问；Options API 中模板上下文只能访问 instance 上的 method，要让模板能用必须保留同名 method。
- **价值**：本地 method 仅剩 1 行转发，逻辑单一真相源在 utils；未来修改只改 utils。重复行数从 ~50 行 → ~9 行，同时保持 `<script lang="uts">` 与以前的本地 method 调用礼仪一致。

**变更验证（静态）**： PASS

- `grep formatCount` 三页都已转发至 `_formatCount`；原始实现已移除
- `grep preloadImage` 两页都已转发至 `_preloadImage` / `_preloadImages`；`uni.getImageInfo` 在页面中不再出现
- `wc -l`：demoDetail 919 行（-11）、targetPhotoDetail 430 行（-14）、favorites 减少 ~3 行

> 下一步：依赖用户人工验证与 commit；Phase 2 可同步并进（纯类型重构，零运行时风险）。

**事后修复（2026-05-15）**：用户运行构建报 `Identifier '_formatCount' has already been declared. (favorites/index.uvue:81:24)`。原因：search_replace 工具多次误报 `save file failed` 但实际已下盘，retry 时造成 favorites 的 `import { formatCount as _formatCount }` 被插入两次。修复：删除重复的 L80；全项都检查三页 import 计数均为 1，未发现其它重复。后续 Phase 必须仅以 `awk`/`grep` 的实际输出作为验证根据，忽略工具报告的 partial success / save failed 提示。

### Phase 2 — UserInfo 类型统一（2026-05-15）

- [x] 2.1 `src/utils/auth.uts` L7 原本已是 `export interface UserInfo`，无需修改（原计划中的 `interface → type` 转换不必要，interface 同样可 import）
- [x] 2.2 `src/utils/api.uts`：删除本地 L5-11 `UserInfo` 声明，加 `import { UserInfo } from './auth.uts'`。L147 / L160 / L172 / L196 四处作为返回类型的引用不变
- [x] 2.3 `src/pages/mine/index.uvue`：在 L137 现有的 `from '../../utils/auth.uts'` import 中追加 `UserInfo`；删除 L146-152 本地 `interface UserInfo` 声明。L405 `const optimistic: UserInfo` 使用不变

**实施决策记录**：

- 保持 `interface UserInfo`（未改为 `type UserInfo`）——三处原本均是 interface，转换为 type 会额外引入 diff 面，与本 Phase "纯类型统一" 目标不加分。
- mine 页采用普通 `import { UserInfo }` 而非 `import type`——跟随项目现有 import 风格（demoDetail / targetPhotoDetail 也是普通值导入），避免混使两种语法

**变更验证（静态）**： PASS

- `grep -rn '^export interface UserInfo\|^interface UserInfo' src/` 结果仅 1 行：`src/utils/auth.uts:7`，完成单一真相源
- `api.uts` 顶部现为 `import { request } / import { UserInfo }`，两个导入计数均为 1
- `mine/index.uvue` L137 import 追加 UserInfo 后，本地 `interface UserInfo` 已移除；`UserInfo` 在页面中仅 L137（import）+ L405（实例化）两处出现
- 4 个 `UserInfo` 用点（api.uts L147/L160/L172/L196 作为 `data: UserInfo` 返回类型）均能通过 import 解析

- [ ] 2.4 行为验证：**待用户重新 `npm run dev:mp-weixin` 验证编译通过；人工验证 mine 页登录后头像/昵称显示、wxUpdateUserInfo 提交后后台返回不丢字段**
- [ ] 2.5 commit（由用户验证后手动提交）

> 下一步：依赖用户验证。Phase 3（登录弹窗 mixin 化）为中风险，建议 Phase 2 验证通过后单独启动。

### Phase 3' — 登录流程纯逻辑下沉 utils（2026-05-17，补做）

**状态**：IMPLEMENTED（待用户验证）

**背景**：原 Phase 3 mixin 化 SKIPPED（三大风险：uts mixin 在 uni-app x 下无先例、跨组件 button `getPhoneNumber` 未验证、收益不足）。本次采取「纯逻辑下沉 utils」最低风险路径补做。

**决策记录**：

1. **仅抽逻辑、不抽视图**：不抽 mixin、不抽组件、不动 template / data / 样式——视觉零变化、跨组件 button 风险零。
2. **4 页实际差异比原评估更大**：重新梳理后发现 mine 的 `updateLoginState`、demoDetail 的 `pendingLikeItem` 回放、targetPhotoDetail 的 `submitProfile` 走老 `wxLogin` 路径 + `finishProfile` 内 `doToggleLike` 都是页面特化逻辑，不能粗暴抽 mixin。
3. **targetPhotoDetail.submitProfile 保持现状**（用户决策）：其走 `uni.login + wxLogin` 老路径与其它三页不一致，但仅做去重、不做不一致修复，避免行为漂移。

**实施清单**：

- [x] 新建 `src/utils/loginFlow.uts`：导出 `runPhoneLogin(phoneCode)` + `PhoneLoginResult` / `PhoneLoginErrorKind` 类型。内部三步骤：`uni.login` → `wxLogin` → `wxBindPhone`；phone 接口失败不视为整体失败（与原 4 页等价）。
- [x] 新建 `src/utils/profileSubmit.uts`：导出 `submitUserProfile({ nickname, avatarUrl })` + `ProfileSubmitResult`。仅负责 `wxUpdateUserInfo` + `mergeUserInfo`，乐观写入仍留页面侧。
- [x] `src/pages/mine/index.uvue`：`onGetPhoneNumber` 三步骤 → `runPhoneLogin`；`submitProfile` 调 `submitUserProfile`。保留 `updateLoginState()` 刷新、乐观 merge。
- [x] `src/pages/index/index.uvue`：同 mine；无 `updateLoginState` 。
- [x] `src/pages/demoDetail/index.uvue`：同上；保留 `pendingLikeItem` 回放 + `closeLoginPopup` 失败分支。
- [x] `src/pages/targetPhotoDetail/index.uvue`：仅 `onGetPhoneNumber` 调 `runPhoneLogin`；`submitProfile` 走老 `wxLogin + nickname/avatarUrl` 路径不动；本页无 `phoneHasFullProfile` 短路，始终弹 profile。

**变更验证（静态）**：PASS

- 4 页 import + call 计数：mine/index/demoDetail 各 4（2 import + 2 call），targetPhotoDetail 2（1 import + 1 call）——符合预期
- 页面行数变化：mine 629→603（-26）、index 440→418（-22）、demoDetail 920→896（-24）、targetPhotoDetail 433→418（-15），合计 -87 行
- 残留的 `uni.login` / `wxLogin` 调用点：
  - `targetPhotoDetail.submitProfile` L300/306（预期保留、老路径）
  - `demoDetail.doLogin` L543-557（独立遗留方法，不在本次范围）

- [ ] 行为验证：**待用户跨 4 页 + 双 profile 跑完整登录三步骤与头像昵称提交链路**
  - mine：未登录 → 勾选协议 → 三步骤 → profile 提交 → mine 页头像/昵称立即刷新；已登录点头像 → openProfilePopup；退出登录二次确认
  - index：三步骤 → 接口带全头像昵称 → 短路不弹 profile
  - demoDetail：未登点赞 → pendingLikeItem 设置 → 三步骤 → 短路后自动回放点赞；以及非短路路径下弹 profile
  - targetPhotoDetail：未登点赞 → 三步骤 → 始终弹 profile → finishProfile 内自动 doToggleLike
  - 双 profile：`apply-profile.sh blueberry/huahua` → `npm run profile:verify` 都要过
- [ ] commit（用户验证后手动提交）：`refactor(auth): extract runPhoneLogin and submitUserProfile helpers (Phase 3 dedup)`

**遗留 follow-up**：

- targetPhotoDetail.submitProfile 与其它三页对齐到 `wxUpdateUserInfo`——独立任务跟进
- LoginPopup 视图层组件抽取（需 spike 跨组件 `getPhoneNumber`）——后续可选

### Phase 3 — SKIPPED（2026-05-15，用户决策）

**状态**：SKIPPED

**跳过原因**（预调研发现的三个风险点）：

1. **项目从未使用 mixins**（`grep -rn 'mixins' src/` 返回空）— 无先例，uni-app x 对 `.uts` 导出 Vue Options Mixin 的编译支持需 spike。
2. **微信小程序 button `open-type="getPhoneNumber"` 跨组件限制**— `open-type` 必须挂原生 button 上，子组件 emit `getphonenumber` payload（iv/encryptedData）传递完整性未验证，一旦失效，4 页登录同时坏。
3. **收益不高**— 调研 mine/index/demoDetail/targetPhotoDetail 发现核心三方法（`onGetPhoneNumber` / `submitProfile` / `finishProfile`）均含页面特化分支（demo/target 登录后重做 `doToggleLike`；mine 调 `updateLoginState`），实际可抽仅 9 个零副作用方法 + 5 个 data 字段，预估减【代码】 ≈ 200 行，远低于 Phase 4 预估 1500+ 行。

**补偿措施**：Phase 4 抽 PhotoCard / CustomNavBar / AppFooter / ContactQR 时，如果验证出小程序允许跨组件 emit `getphonenumber`，重新启动 LoginPopup 组件抽取（作为 Phase 4.X 补量项）。

> 状态转移：Phase 3 SKIPPED → 直接进入 Phase 4 组件化 + SCSS 变量化

### Phase 4a — AppFooter 组件 + apply-profile.mjs Copyright 收敛（2026-05-15）

**事实修正**（原 Plan vs 实际）：原计划表述 "7 页 Copyright" 实为 6 页（mine 页不含 Copyright）。

- [x] 4a.1 创建 `src/components/AppFooter/AppFooter.uvue`（easycom 路径规范，25 行）。仅渲染行内 `<text>{{ copyrightText }}</text>`，props `copyrightText` default 为 blueberry 默认文本。不含任何样式 → 页面外层 wrapper（`.copyright` / `.bottomdesc` / `.beian`）保留 → **视觉零变化**。
- [x] 4a.2 替换 6 页的 `<view class="xxx">Copyright 2025...</view>` 为 `<view class="xxx"><AppFooter /></view>`：favorites / demoDetail / priceList / index / priceHomePage / targetPhotoDetail。验证每页 `<AppFooter` 计数为 1。
- [x] 4a.3 `scripts/lib/apply-profile.mjs` 改造：
  - 删除 `updateCopyrightOnly` 函数及 3 次调用
  - `updateContactPage` 内删除 Copyright pattern（仅保留 contact + image src 两个）
  - `updatePriceList` 内删除 Copyright pattern（仅保留 PRICE_FALLBACK_TITLE）
  - 新增 `updateAppFooter()`：单文件单 pattern `[/default: 'Copyright 2025 [^']+'/, ...]`
  - **注入点从 6 个收敛为 1 个**（-83%）
- [x] 4a.4 双 profile 静态验证：`apply-profile.sh huahua` 后 AppFooter 字符串变为「Copyright 2025 花花旅拍 - 版权所有」；`apply-profile.sh blueberry` 后恢复为「Copyright 2025 蓝梅旗袍·汉服·民族服体验馆 - 版权所有」。全项仅 AppFooter.uvue L20 一处含 Copyright 字符串。

- [ ] 4a.5 行为验证（运行期）：**待用户跑**：
  - `npm run dev:mp-weixin` 验证 6 页页脚 Copyright 文本正确显示，原 `.copyright`/`.bottomdesc`/`.beian` 三套样式依然生效（margin / text-align / divide 不变）
  - `apply-profile.sh huahua && npm run build:mp-weixin && npm run profile:verify`（如现有这个 script）验证双 profile。
- [ ] 4a.6 commit：`refactor(footer): extract AppFooter component and consolidate copyright injection (6 sites → 1 component)`

**代码减袉估算**：

- 6 页每页减 1 行（原 Copyright 文本词）= -6 行
- apply-profile.mjs 减 9 行（-3 pattern + -3 函数调用 + -3 函数体 + 7 行新 helper）= net -2 行
- AppFooter.uvue 新增 25 行。**总体 ≈ +17 行**，但是：详细收益为「字符串含义集中（6→1）+ 注入合同简化」，ROI 主要体现在未来双 profile 调试与多项目试装上。

> 下一步：依赖用户运行验证。4a 验证通过后可进入 4b（ContactQR）。

**事后修复（2026-05-15）— sync-template 遗漏 components 目录**

用户运行 `npm run build:all` 批量构建报错：`ENOENT: no such file or directory, open '/Users/leolin/Desktop/huahua/src/components/AppFooter/AppFooter.uvue'`

**根因**：`scripts/sync-template.sh` 仅 rsync `src/pages/` 与 `src/utils/`，**未同步 `src/components/`**（本次重构新建的目录）。外部项目同步完 .uvue 页面后、页面中的 `<AppFooter />` 引用无法解析；apply-profile.mjs 调 `updateAppFooter()` 试图读不存在的组件文件 → 中断。

**修复**：`scripts/sync-template.sh` rsync pages/utils 之后补上同步 components；同步更新脚本头部 "Overwritten" 文档加入 `src/components/`。

**用户需重跑**：`npm run build:all`。修复后 sync 会重新下发 `src/components/AppFooter/`，apply-profile 能正常找到文件。

**教训**：未来添加任何「需要同步到外部项目」的顶层目录（mixins/ / store/ / composables/ 等）时，**必须同步修订 `scripts/sync-template.sh`** 的 rsync 白名单，否则会造成模板项目 ↔ 外部项目 不一致。

## 5. Verify

> 待全部 Phase 执行完毕后填充。

### 5.1 行为不变确认

- [ ] 登录三步骤双 profile 全链路通过
- [ ] 客片瀑布流（demoDetail / favorites）视觉与交互一致
- [ ] Copyright / ContactQR 双 profile 文案与资源一致
- [ ] `npm run profile:verify` 双 profile 通过
- [ ] 自定义导航栏 safe-area 在 iOS / Android 微信预览正常
- [ ] 协议页跳转 + MINI_APP_NAME 显示正确

### 5.2 指标改善对比

| 指标 | 重构前 | 重构后（目标） | 改善 |
|------|--------|---------------|------|
| 登录弹窗实现处 | 4 | 1 mixin + 1 组件 | -75% |
| Copyright 维护点 | 6 页面 + 6 套 profile pattern | 1 组件 + 1 pattern | -83% |
| UserInfo 接口定义 | 3 处 | 1 处 export | -67% |
| 重复行数 | ~1105 | ~0 | -100% |
| profile 注入正则脆弱面 | 6+ | 2（AppFooter / ContactQR） | -67% |

### 5.3 Module Spec 更新

- 是否需更新：**Yes**（Phase 5 已计划）
  - 新增 `src-components.spec.md` / `src-mixins.spec.md`
  - 更新 `src-pages-*.spec.md` 标注采用的共享组件
  - 更新 `global/profile-management.spec.md` 注入合同
- **Follow-ups**：
  - 改版规划（`src-pages-redesign.spec.md`）可在本次组件化基础上推进
  - 后续可考虑：网络请求 loading 状态封装为 mixin、收藏/点赞操作合并为 `useCollection` 组合式 API（uni-app x 支持后）
